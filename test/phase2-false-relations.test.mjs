import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EDGE_DERIVATIONS,
  EDGE_STATUSES,
  EDGE_TYPES,
  FOLLOWS_RULE,
  NODE_TYPES,
  SPAWN_ATTRIBUTION_RULE,
  buildRuntimeGraph,
} from '../src/core/runtime-graph.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// SDD §17.4 — False Relation Tests.
//
// This is the most important suite in the project. The graph may be incomplete;
// it may never be *wrong*. Every test here asserts that the correlation engine
// refuses to invent a relationship it cannot support:
//
//   · A is adjacent to B in time  →  no observed edge between them
//   · two concurrent subagents    →  no child is guessed by order
//   · a Skill load succeeded      →  no compliance or correctness claim
//   · no correlation at all       →  the event is reported `unlinked`, not attached
//
// Written before the correlation engine, so it defines the contract rather than
// describing whatever the implementation happened to do.

const sessionId = 'session-phase2'

function turnStart({ seq, turn }) {
  return { type: 'turn/start', seq, time: 1000 + seq, data: { turn } }
}

function stepStart({ seq, turn, step }) {
  return { type: 'step/start', seq, time: 1000 + seq, data: { turn, step } }
}

function toolCall({ seq, callId, name = 'bash', turn = 1, step = 1 }) {
  return {
    type: 'tool/call',
    seq,
    time: 1000 + seq,
    data: { turn, step, callId, name, arguments: JSON.stringify({ command: 'ignored' }) },
  }
}

function toolResult({ seq, callId, isError = false, code, turn = 1, step = 1 }) {
  return {
    type: 'tool/result',
    seq,
    time: 1000 + seq,
    data: {
      turn,
      step,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId },
        toolCallId: callId,
        content: [{ type: 'text', text: 'ignored' }],
        isError,
        id: `m-${callId}`,
      },
      ...(code ? { error: { name: 'Error', code } } : {}),
    },
  }
}

// Real shape captured from a live parent session.
function subagentCatalog({ seq, childId, mode = 'continuable', turn }) {
  return {
    type: 'subagent/catalog',
    seq,
    time: 1000 + seq,
    data: {
      version: 0,
      childId,
      childCreatedAt: 1000 + seq,
      mode,
      ...(turn === undefined ? {} : {}),
    },
  }
}

function reduceAll(events) {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return receipt
}

function graphOf(receipt) {
  return buildRuntimeGraph(receipt)
}

function edgesBetween(graph, from, to) {
  return graph.edges.filter((edge) => edge.from === from && edge.to === to)
}

function invocationNodes(graph, kind) {
  return graph.nodes.filter((node) => node.type === kind && node.invocationId)
}

// ---------------------------------------------------------------------------
// P3 heuristics must not become observed relationships
// ---------------------------------------------------------------------------

test('invocations adjacent in time produce no edge between them', () => {
  // Three CLI calls in one turn, each completing before the next starts. Their
  // ordering is real; a relationship between them is not.
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'c1' }), toolResult({ seq: 11, callId: 'c1' }),
    toolCall({ seq: 12, callId: 'c2' }), toolResult({ seq: 13, callId: 'c2' }),
    toolCall({ seq: 14, callId: 'c3' }), toolResult({ seq: 15, callId: 'c3' }),
  ])
  const graph = graphOf(receipt)
  const cli = invocationNodes(graph, 'cli')
  assert.equal(cli.length, 3)
  for (const a of cli) {
    for (const b of cli) {
      if (a.id === b.id) continue
      for (const edge of edgesBetween(graph, a.id, b.id)) {
        assert.notEqual(edge.status, 'observed', `${a.id} -> ${b.id} must not be observed`)
        assert.equal(edge.derivation, 'candidate')
        assert.equal(edge.rule, FOLLOWS_RULE)
      }
    }
  }
})

test('a candidate edge never claims to be observed', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'c1' }), toolResult({ seq: 11, callId: 'c1' }),
    toolCall({ seq: 12, callId: 'c2' }), toolResult({ seq: 13, callId: 'c2' }),
  ])
  for (const edge of graphOf(receipt).edges) {
    if (edge.derivation === 'candidate') assert.equal(edge.status, 'candidate')
    if (edge.status === 'observed') assert.notEqual(edge.derivation, 'candidate')
  }
})

test('one subagent spawn attributes the child, and only as a candidate', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'spawn-1', name: 'subagent' }),
    subagentCatalog({ seq: 11, childId: 'child-a' }),
    toolResult({ seq: 12, callId: 'spawn-1' }),
  ])
  const graph = graphOf(receipt)
  const child = graph.nodes.find((node) => node.id.includes('child-a'))
  assert.ok(child, 'the spawned child must appear as a node')
  const fromInvocation = graph.edges.filter((edge) => edge.to === child.id && edge.type === 'spawns' && edge.from.startsWith('invocation:'))
  for (const edge of fromInvocation) {
    // `subagent/catalog` names the child, not the invocation that created it.
    // Attributing it to an invocation is a bounded rule, so it is a candidate.
    assert.equal(edge.status, 'candidate')
    assert.equal(edge.derivation, 'rule_based')
    assert.equal(edge.rule, SPAWN_ATTRIBUTION_RULE)
  }
})

test('two concurrent subagents are never attributed to a child by order', () => {
  // Two spawn invocations and one child catalog entry in the same turn: the
  // catalog says the session created a child, but not which invocation did.
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'spawn-1', name: 'subagent' }),
    toolCall({ seq: 11, callId: 'spawn-2', name: 'subagent' }),
    subagentCatalog({ seq: 12, childId: 'child-ambiguous' }),
    toolResult({ seq: 13, callId: 'spawn-1' }),
    toolResult({ seq: 14, callId: 'spawn-2' }),
  ])
  const graph = graphOf(receipt)
  const child = graph.nodes.find((node) => node.id.includes('child-ambiguous'))
  assert.ok(child)
  // The session owns the child — that is what the catalog event proves.
  const fromSession = edgesBetween(graph, graph.rootId, child.id)
  assert.equal(fromSession.length, 1)
  assert.equal(fromSession[0].type, 'spawns')
  assert.equal(fromSession[0].status, 'observed')
  // No invocation may be credited with it.
  const fromInvocation = graph.edges.filter((edge) => edge.to === child.id && edge.from.startsWith('invocation:'))
  assert.deepEqual(fromInvocation, [])
  assert.equal(child.status, 'partial')
})

test('a successful Skill load creates no compliance or correctness claim', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'sk', name: 'skill' }),
    toolResult({ seq: 11, callId: 'sk' }),
  ])
  const graph = graphOf(receipt)
  const serialized = JSON.stringify(graph).toLowerCase()
  for (const forbidden of ['compliance', 'correct', 'followed', 'caused', 'effective', 'score']) {
    assert.equal(serialized.includes(forbidden), false, `the graph must not claim ${forbidden}`)
  }
  // A settled load is at most `observed`, and the vocabulary has no causal edge.
  const skill = invocationNodes(graph, 'skill')[0]
  assert.equal(skill.status, 'observed')
  for (const type of EDGE_TYPES) {
    assert.equal(/caus|comply|compliance|correct|effective/.test(type), false)
  }
})

test('an invocation with no observable turn is unlinked, not attached', () => {
  const receipt = emptyReceipt(sessionId, 1)
  // A tool result whose request was never observed carries no turn/step.
  receipt.runtimeEvents = [
    { eventId: `${sessionId}:re:9`, seq: 9, timestamp: 1009, type: 'invocation.result', source: 'dsh', status: 'success', invocationId: 'orphan-call' },
  ]
  receipt.runtimeEventOverflow = 0
  const graph = graphOf(receipt)
  const orphan = graph.nodes.find((node) => node.invocationId === 'orphan-call')
  assert.ok(orphan)
  assert.equal(orphan.status, 'unlinked')
  assert.equal(graph.edges.filter((edge) => edge.to === orphan.id && edge.type === 'contains').length, 0)
  assert.equal(graph.unlinked.some((item) => item.nodeId === orphan.id), true)
})

// ---------------------------------------------------------------------------
// Provenance invariants
// ---------------------------------------------------------------------------

test('every emitted edge carries at least one evidence id', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'spawn-1', name: 'subagent' }),
    subagentCatalog({ seq: 11, childId: 'child-a' }),
    toolResult({ seq: 12, callId: 'spawn-1' }),
    toolCall({ seq: 20, callId: 'f1' }), toolResult({ seq: 21, callId: 'f1', isError: true, code: 'TOOL_FAILED' }),
    toolCall({ seq: 22, callId: 'f2' }),
  ])
  const graph = graphOf(receipt)
  assert.ok(graph.edges.length > 0)
  for (const edge of graph.edges) {
    assert.ok(Array.isArray(edge.evidenceIds) && edge.evidenceIds.length > 0, `${edge.type} edge has no evidence`)
  }
})

test('every evidence id resolves to an event the receipt actually holds', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'c1' }), toolResult({ seq: 11, callId: 'c1' }),
    toolCall({ seq: 12, callId: 'f1' }), toolResult({ seq: 13, callId: 'f1', isError: true, code: 'TOOL_FAILED' }),
    toolCall({ seq: 14, callId: 'f2' }),
  ])
  const known = new Set(receipt.runtimeEvents.map((event) => event.eventId))
  for (const edge of graphOf(receipt).edges) {
    for (const id of edge.evidenceIds) {
      assert.equal(known.has(id), true, `edge cites unknown event ${id}`)
    }
  }
})

test('the edge vocabulary stays closed and non-causal', () => {
  assert.equal(EDGE_TYPES.includes('spawns'), true)
  assert.equal(EDGE_TYPES.includes('retries'), true)
  assert.equal(EDGE_TYPES.includes('contains'), true)
  assert.equal(EDGE_TYPES.includes('follows'), true)
  assert.deepEqual([...EDGE_DERIVATIONS].sort(), ['candidate', 'correlated', 'direct', 'rule_based'])
  assert.deepEqual([...EDGE_STATUSES].sort(), ['candidate', 'observed', 'partial', 'unknown'])
  assert.equal(NODE_TYPES.includes('session'), true)
  assert.equal(NODE_TYPES.includes('turn'), true)
})

test('the graph carries no layout state', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'c1' }), toolResult({ seq: 11, callId: 'c1' }),
  ])
  const serialized = JSON.stringify(graphOf(receipt))
  for (const forbidden of ['"x"', '"y"', 'position', 'viewport', 'width', 'height']) {
    assert.equal(serialized.includes(forbidden), false, `layout state leaked: ${forbidden}`)
  }
})

test('building the graph twice yields the same facts', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'c1' }), toolResult({ seq: 11, callId: 'c1' }),
    subagentCatalog({ seq: 12, childId: 'child-a' }),
  ])
  assert.deepEqual(graphOf(receipt), graphOf(receipt))
})

test('the spawns edge requires catalog evidence, not a tool name', () => {
  // A `subagent` tool call with no catalog event proves an attempt, not a child.
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'spawn-1', name: 'subagent' }),
    toolResult({ seq: 11, callId: 'spawn-1' }),
  ])
  const graph = graphOf(receipt)
  assert.equal(graph.edges.some((edge) => edge.type === 'spawns'), false)
  assert.equal(graph.nodes.some((node) => node.type === 'subagent' && !node.invocationId), false)
})
