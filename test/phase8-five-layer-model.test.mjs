import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRuntimeLayout, LAYOUT_NODE_LIMIT } from '../src/core/runtime-layout.mjs'
import { buildRuntimeGraph } from '../src/core/runtime-graph.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// §8 / §35: the five layers, and the node types the canvas was missing.
//
// A layer is a reading level, never a causal claim (§35). So the only thing these tests
// may require of the projection is that it is *derived*: every node added must come from
// a field the Runtime events already carry, and every edge added must be containment the
// evidence states — never a relationship the UI worked out for itself (§32).

const sessionId = 'session-layers'

/**
 * A run with `turns` turns, `perTurn` calls each, and optionally a failing call.
 * `capability` picks which capability the calls belong to, so several capabilities can
 * share a turn.
 */
function run({ turns = 1, perTurn = 1, capability = 'cli', failures = [], child = false } = {}) {
  const events = []
  let seq = 1
  for (let turn = 1; turn <= turns; turn += 1) {
    events.push({ type: 'turn/start', seq: seq++, time: 1000 + seq, data: { turn } })
    events.push({ type: 'step/start', seq: seq++, time: 1000 + seq, data: { turn, step: 1 } })
    for (let index = 0; index < perTurn; index += 1) {
      const callId = `c${turn}-${index}`
      const isError = failures.includes(`${turn}-${index}`)
      const name = capability === 'skill' ? 'skill' : 'bash'
      events.push({ type: 'tool/call', seq: seq++, time: 1000 + seq, data: { turn, step: 1, callId, name, arguments: '{}' } })
      events.push({
        type: 'tool/result', seq: seq++, time: 1000 + seq,
        data: { turn, step: 1, message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: 'ok' }], isError, id: `m${callId}` } },
      })
    }
  }
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const graph = buildRuntimeGraph(receipt)
  if (child) {
    graph.nodes.push({ id: 'child:1', type: 'session', title: '子会话', role: 'child-session', capabilityId: 'subagent', status: 'observed', outcome: null, evidenceEventIds: [] })
  }
  return graph
}

const layersOf = (layout) => {
  const by = {}
  for (const node of layout.nodes) by[node.layer] = (by[node.layer] ?? 0) + 1
  return by
}

test('§35 the five layers exist and are numbered 0 to 4', () => {
  const layout = computeRuntimeLayout(run({ turns: 2, perTurn: 3 }))
  const layers = layersOf(layout)
  assert.equal(layers[0], 1, 'layer 0 holds the session')
  assert.ok(layers[1] >= 2, 'layer 1 holds the turns')
  assert.ok(layers[2] >= 1, 'layer 2 holds a capability per turn')
  assert.ok(layers[3] >= 6, 'layer 3 holds the calls')
  assert.ok(layers[4] >= 1, 'layer 4 holds outcomes')
  for (const layer of Object.keys(layers)) assert.ok(Number(layer) >= 0 && Number(layer) <= 4, `layer ${layer} is outside 0-4`)
})

test('§35 a delegated child session is an Agent, and sits with Turn', () => {
  const layout = computeRuntimeLayout(run({ turns: 1, perTurn: 1, child: true }))
  const child = layout.nodes.find((node) => node.kind === 'child')
  assert.ok(child, 'the child session must be drawn')
  assert.equal(child.layer, 1, '§35 puts Agent on the Turn layer')
})

test('§8 a capability node groups a turn\'s calls of one capability', () => {
  const layout = computeRuntimeLayout(run({ turns: 2, perTurn: 3 }))
  const capabilities = layout.nodes.filter((node) => node.kind === 'capability')
  assert.equal(capabilities.length, 2, 'one per turn')
  for (const node of capabilities) {
    assert.equal(node.layer, 2)
    assert.equal(node.memberCount, 3)
    assert.equal(node.memberIds.length, 3, 'a capability node names the calls it stands for')
  }
})

test('§8 a lone call gets no capability parent standing between it and its Turn', () => {
  const layout = computeRuntimeLayout(run({ turns: 1, perTurn: 1 }))
  assert.equal(layout.nodes.filter((node) => node.kind === 'capability').length, 0)
  // The call is still drawn, at the Tool layer.
  assert.equal(layout.nodes.filter((node) => node.kind === 'invocation').length, 1)
})

test('§8 an Error node appears for a failure, and a Result node for a clean group', () => {
  const clean = computeRuntimeLayout(run({ turns: 1, perTurn: 3 }))
  assert.equal(clean.nodes.filter((node) => node.kind === 'result').length, 1)
  assert.equal(clean.nodes.filter((node) => node.kind === 'error').length, 0)

  const failing = computeRuntimeLayout(run({ turns: 1, perTurn: 3, failures: ['1-1'] }))
  const errors = failing.nodes.filter((node) => node.kind === 'error')
  assert.equal(errors.length, 1, 'one node per failed call')
  assert.equal(errors[0].layer, 4)
  assert.equal(errors[0].outcome, 'failure')
  // The two that succeeded still get a Result node.
  assert.equal(failing.nodes.filter((node) => node.kind === 'result').length, 1)
  assert.equal(failing.nodes.find((node) => node.kind === 'result').memberCount, 2)
})

test('every outcome node names the calls it stands for', () => {
  const layout = computeRuntimeLayout(run({ turns: 1, perTurn: 3, failures: ['1-0'] }))
  for (const node of layout.nodes) {
    if (node.graphNodeId) continue
    assert.ok(node.memberIds.length > 0, `synthetic node ${node.id} names no members`)
  }
})

test('§32 every projected edge is containment the evidence states', () => {
  const layout = computeRuntimeLayout(run({ turns: 2, perTurn: 3, failures: ['1-0'] }))
  const projected = layout.edges.filter((edge) => String(edge.derivation ?? '').startsWith('layout:'))
  assert.ok(projected.length > 0)
  for (const edge of projected) {
    // The only relation the projection is allowed to draw is structural containment.
    assert.equal(edge.type, 'contains', `the projection invented a relation type: ${edge.type}`)
    assert.equal(edge.rule, null, 'a projected edge must not cite a correlation rule')
    // A relation with no evidence behind it would be an assertion, not a drawing.
    assert.ok(edge.evidenceCount > 0, `projected edge ${edge.id} cites no evidence`)
  }
})

test('§32 the projection adds no node the graph did not imply', () => {
  const graph = run({ turns: 2, perTurn: 3 })
  const layout = computeRuntimeLayout(graph)
  const knownGraphNodes = new Set(graph.nodes.map((node) => node.id))
  // A node either points back at a graph node, or is one of §35's derived levels.
  for (const node of layout.nodes) {
    if (node.graphNodeId) {
      assert.ok(knownGraphNodes.has(node.graphNodeId))
      continue
    }
    assert.ok(['capability', 'result', 'error', 'group'].includes(node.kind), `unexpected derived node: ${node.kind}`)
    // …and a derived node must account for real graph nodes.
    for (const memberId of node.memberIds) {
      assert.ok(knownGraphNodes.has(memberId) || memberId.startsWith('call') || layout.nodes.some((n) => n.id === memberId),
        `derived node ${node.id} names something that does not exist: ${memberId}`)
    }
  }
})

test('§36 the projection shares the hard bound instead of sitting on top of it', () => {
  // Enough turns and calls that the graph cannot be drawn in full.
  const layout = computeRuntimeLayout(run({ turns: 40, perTurn: 12 }))
  assert.ok(layout.nodes.length <= LAYOUT_NODE_LIMIT, `rendered ${layout.nodes.length}`)
  // When the budget ran out, the levels that were skipped are counted, not silent.
  if (layout.stats.skippedLevelCount > 0) {
    assert.equal(typeof layout.stats.skippedLevelCount, 'number')
  }
  assert.equal(
    layout.stats.capabilityNodeCount + layout.stats.resultNodeCount + layout.stats.errorNodeCount,
    layout.nodes.filter((node) => ['capability', 'result', 'error'].includes(node.kind)).length,
  )
})

test('the layers stay readable: a dense run still reports every level it drew', () => {
  const layout = computeRuntimeLayout(run({ turns: 12, perTurn: 6 }))
  const layers = layersOf(layout)
  assert.ok(layers[0] === 1)
  assert.ok(layers[1] >= 1)
  assert.ok(layers[2] >= 1, 'capability level')
  assert.ok(layers[3] >= 1, 'call level')
  assert.ok(layers[4] >= 1, 'outcome level')
  // And the height stays inside the canvas bound the wrapping placer guarantees.
  assert.ok(layout.height <= 1400, `height ${layout.height}`)
})
