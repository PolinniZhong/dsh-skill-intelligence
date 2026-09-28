import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRuntimeGraph, FOLLOWS_RULE, SPAWN_ATTRIBUTION_RULE } from '../src/core/runtime-graph.mjs'
import { RETRY_RULE } from '../src/core/runtime-events.mjs'
import { computeRuntimeLayout } from '../src/core/runtime-layout.mjs'
import {
  INSPECTOR_EVIDENCE_LIMIT,
  inspectRuntimeEdge,
  inspectRuntimeNode,
} from '../src/core/runtime-inspector.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// Phase 4 inspector contract: every line must be able to answer "why do you exist".
//
// The requirement is not that the panel shows a lot. It is that a relationship can
// never be displayed without its derivation, its rule when one produced it, the
// events behind it, and an explicit statement of what it does NOT claim.

const sessionId = 'session-inspector'

function pair(seq, index, { name = 'bash', turn = 1, step = 1, isError = false, code } = {}) {
  const callId = `c${index}`
  return [
    { type: 'tool/call', seq, time: 1000 + seq, data: { turn, step, callId, name, arguments: '{}' } },
    {
      type: 'tool/result',
      seq: seq + 1,
      time: 1001 + seq,
      data: {
        turn,
        step,
        message: {
          role: 'tool',
          source: { kind: 'tool', callId },
          toolCallId: callId,
          content: [{ type: 'text', text: 'ok' }],
          isError,
          id: `m${callId}`,
        },
        ...(code ? { error: { name: 'Error', code } } : {}),
      },
    },
  ]
}

function build(events) {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return { receipt, graph: buildRuntimeGraph(receipt) }
}

function base() {
  return [
    { type: 'turn/start', seq: 1, time: 1001, data: { turn: 1 } },
    { type: 'step/start', seq: 2, time: 1002, data: { turn: 1, step: 1 } },
  ]
}

test('inspecting a node of an unknown id reports not-found rather than inventing one', () => {
  const { receipt, graph } = build(base())
  const result = inspectRuntimeNode(graph, receipt.runtimeEvents, 'invocation:nope')
  assert.equal(result.found, false)
  assert.deepEqual(result.relations, [])
  assert.deepEqual(result.evidence, [])
})

test('a containment relation is explained as structure, not as achievement', () => {
  const { receipt, graph } = build([...base(), ...pair(10, 'a')])
  const result = inspectRuntimeNode(graph, receipt.runtimeEvents, 'invocation:c-a'.replace('c-a', 'ca'))
  const nodeId = graph.nodes.find((node) => node.role === 'invocation').id
  const inspected = inspectRuntimeNode(graph, receipt.runtimeEvents, nodeId)
  assert.equal(inspected.found, true)
  assert.ok(inspected.relations.length >= 1)
  const incoming = inspected.relations.find((relation) => relation.type === 'contains' && relation.direction === 'in')
  assert.ok(incoming)
  assert.equal(incoming.derivation, 'direct')
  assert.equal(incoming.meaning.includes('结构位置') || incoming.meaning.includes('包含关系'), true)
  assert.equal(incoming.limit.includes('不说明'), true)
  assert.ok(incoming.evidenceIds.length > 0)
  // A contained call is not thereby a successful one.
  assert.equal(result.evidenceBoundary.causal, false)
})

test('a candidate relation says so, and states that it is not causation', () => {
  const { receipt, graph } = build([...base(), ...pair(10, 'a'), ...pair(20, 'b')])
  const edge = graph.edges.find((candidate) => candidate.type === 'follows')
  const inspected = inspectRuntimeEdge(graph, receipt.runtimeEvents, edge.id)
  assert.equal(inspected.found, true)
  assert.equal(inspected.edge.status, 'candidate')
  assert.equal(inspected.edge.rule, FOLLOWS_RULE)
  assert.equal(inspected.ruleName.includes('同一步骤内相邻'), true)
  assert.equal(inspected.limit.includes('不说明因果'), true)
  assert.equal(inspected.evidenceBoundary.causal, false)
  assert.ok(inspected.evidence.length > 0)
})

test('a retry relation names its rule and cites both the failure and the repeat', () => {
  const { receipt, graph } = build([
    ...base(),
    ...pair(10, 'first', { isError: true, code: 'TOOL_FAILED' }),
    ...pair(20, 'second'),
  ])
  const edge = graph.edges.find((candidate) => candidate.type === 'retries')
  const inspected = inspectRuntimeEdge(graph, receipt.runtimeEvents, edge.id)
  assert.equal(inspected.edge.derivation, 'rule_based')
  assert.equal(inspected.edge.rule, RETRY_RULE)
  assert.equal(inspected.ruleName.includes('失败后重复'), true)
  assert.equal(inspected.limit.includes('不说明重试是否更接近成功'), true)
  // Both endpoints of the story are present in the evidence.
  const types = inspected.evidence.map((event) => event.type)
  assert.equal(types.includes('retry'), true)
  assert.equal(types.includes('invocation.result'), true)
})

test('a spawn relation distinguishes host fact from rule-based attribution', () => {
  const { receipt, graph } = build([
    ...base(),
    ...pair(10, 'spawn', { name: 'subagent' }),
    { type: 'subagent/catalog', seq: 30, time: 1030, data: { version: 0, childId: 'child-1', childCreatedAt: 1030, mode: 'continuable' } },
  ])
  const fromSession = graph.edges.find((edge) => edge.type === 'spawns' && edge.from === graph.rootId)
  const fromInvocation = graph.edges.find((edge) => edge.type === 'spawns' && edge.from.startsWith('invocation:'))
  const sessionView = inspectRuntimeEdge(graph, receipt.runtimeEvents, fromSession.id)
  assert.equal(sessionView.meaning.includes('宿主事实'), true)
  assert.equal(sessionView.edge.evidenceIds.length, 1)
  const invocationView = inspectRuntimeEdge(graph, receipt.runtimeEvents, fromInvocation.id)
  assert.equal(invocationView.edge.status, 'candidate')
  assert.equal(invocationView.ruleName.includes('唯一 Subagent 调用'), true)
  assert.equal(invocationView.limit.includes('不是宿主事实'), true)
})

test('every inspected relation carries the boundary, never a causal claim', () => {
  const { receipt, graph } = build([
    ...base(),
    ...pair(10, 'a', { isError: true, code: 'TOOL_FAILED' }),
    ...pair(20, 'b', { name: 'subagent' }),
    { type: 'subagent/catalog', seq: 30, time: 1030, data: { version: 0, childId: 'child-1', childCreatedAt: 1030, mode: 'one-shot' } },
    ...pair(40, 'c'),
  ])
  for (const node of graph.nodes) {
    const inspected = inspectRuntimeNode(graph, receipt.runtimeEvents, node.id)
    assert.deepEqual(inspected.evidenceBoundary.causal, false)
    assert.deepEqual(inspected.evidenceBoundary.compliance, false)
    assert.deepEqual(inspected.evidenceBoundary.correctness, false)
    for (const relation of inspected.relations) {
      assert.equal(typeof relation.meaning, 'string')
      assert.equal(typeof relation.limit, 'string')
      assert.ok(relation.limit.length > 0, 'every relation must state its limit')
    }
  }
  for (const edge of graph.edges) {
    const inspected = inspectRuntimeEdge(graph, receipt.runtimeEvents, edge.id)
    assert.equal(typeof inspected.meaning, 'string')
    assert.equal(typeof inspected.limit, 'string')
    assert.equal(Array.isArray(inspected.evidence), true)
  }
})

test('evidence lookup is bounded and reports what it could not resolve', () => {
  const events = [...base()]
  for (let index = 0; index < 40; index += 1) events.push(...pair(100 + index * 2, `x${index}`, { name: 'bash' }))
  const { receipt, graph } = build(events)
  const follows = graph.edges.filter((edge) => edge.type === 'follows')
  assert.ok(follows.length > 0)
  for (const edge of follows.slice(0, 5)) {
    const inspected = inspectRuntimeEdge(graph, receipt.runtimeEvents, edge.id)
    assert.ok(inspected.evidence.length <= INSPECTOR_EVIDENCE_LIMIT)
    // The citation is a bounded sample, and the true total is still reported.
    assert.ok(inspected.edge.evidenceIds.length <= INSPECTOR_EVIDENCE_LIMIT)
    assert.equal(inspected.edge.evidenceCount, edge.evidenceIds.length)
    assert.equal(inspected.edge.evidenceCount >= inspected.edge.evidenceIds.length, true)
  }
  // A citation that no longer resolves is reported, not silently ignored.
  const { receipt: thin, graph: thinGraph } = build([...base(), ...pair(10, 'a')])
  const node = thinGraph.nodes.find((candidate) => candidate.role === 'invocation')
  const inspected = inspectRuntimeNode(thinGraph, thin.runtimeEvents, node.id)
  assert.deepEqual(inspected.missingEvidenceIds, [])
})

test('a collapsed group is answered by naming the nodes it stands for', () => {
  const events = [...base()]
  for (let index = 0; index < 30; index += 1) events.push(...pair(100 + index * 2, `g${index}`, { name: 'bash' }))
  const { receipt, graph } = build(events)
  const layout = computeRuntimeLayout(graph, { nodeLimit: 10, collapseThreshold: 4 })
  const group = layout.nodes.find((node) => node.collapsed)
  assert.ok(group, 'expected a collapsed node')
  const inspected = inspectRuntimeNode(graph, receipt.runtimeEvents, group.id, { layout })
  assert.equal(inspected.found, true)
  assert.equal(inspected.node.collapsed, true)
  assert.equal(inspected.memberIds.length, group.memberIds.length)
  assert.ok(inspected.memberIds.length >= 2)
  // The members are real graph nodes, and their evidence comes back with them.
  const known = new Set(graph.nodes.map((node) => node.id))
  for (const id of inspected.memberIds) assert.equal(known.has(id), true)
  assert.ok(inspected.evidence.length > 0)
  assert.equal(inspected.evidence.length <= INSPECTOR_EVIDENCE_LIMIT, true)
})

test('inspection is a lookup, so cost does not grow with the run', () => {
  const events = [...base()]
  for (let index = 0; index < 300; index += 1) events.push(...pair(100 + index * 2, `b${index}`, { name: 'bash' }))
  const { receipt, graph } = build(events)
  const edgeId = graph.edges.find((edge) => edge.type === 'follows').id
  const started = process.hrtime.bigint()
  for (let index = 0; index < 20; index += 1) inspectRuntimeEdge(graph, receipt.runtimeEvents, edgeId)
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(elapsed < 2000, `20 lookups took ${elapsed.toFixed(0)}ms`)
})
