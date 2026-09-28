import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EDGE_DERIVATIONS,
  FOLLOWS_RULE,
  GRAPH_MODEL_VERSION,
  SPAWN_ATTRIBUTION_RULE,
  buildRuntimeGraph,
} from '../src/core/runtime-graph.mjs'
import {
  emptyReceipt,
  migrateReceipt,
  reduceSessionEvent,
  setRuntimeLineage,
} from '../src/core/trace-reducer.mjs'

// Phase 2 graph structure: what the correlation engine does emit, and with what
// provenance. The false-relation suite covers what it must refuse; this one
// covers what it must produce.

const sessionId = 'session-phase2-structure'

function turnStart({ seq, turn }) {
  return { type: 'turn/start', seq, time: 1000 + seq, data: { turn } }
}

function stepStart({ seq, turn, step }) {
  return { type: 'step/start', seq, time: 1000 + seq, data: { turn, step } }
}

function toolCall({ seq, callId, name = 'bash', turn = 1, step = 1 }) {
  return { type: 'tool/call', seq, time: 1000 + seq, data: { turn, step, callId, name, arguments: '{"command":"ignored"}' } }
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

function subagentCatalog({ seq, childId, mode = 'continuable', label }) {
  return {
    type: 'subagent/catalog',
    seq,
    time: 1000 + seq,
    data: { version: 0, childId, childCreatedAt: 1000 + seq, mode, ...(label ? { label } : {}) },
  }
}

function skillInvocationMessage({ seq, name = 'some-skill' }) {
  return {
    type: 'user/message',
    seq,
    time: 1000 + seq,
    data: {
      content: [{ type: 'text', text: `<skill_content name="${name}">\n<skill_instructions>\n1. One\n</skill_instructions>\n</skill_content>` }],
      source: { kind: 'skill-invocation', name, form: 'instructions' },
      role: 'user',
      id: `m${seq}`,
    },
  }
}

function reduceAll(events) {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return receipt
}

test('the graph roots at the session and nests turns beneath it', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'c1', turn: 1 }),
    toolResult({ seq: 11, callId: 'c1', turn: 1 }),
    turnStart({ seq: 20, turn: 2 }),
    stepStart({ seq: 21, turn: 2, step: 1 }),
    toolCall({ seq: 30, callId: 'c2', turn: 2 }),
    toolResult({ seq: 31, callId: 'c2', turn: 2 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  assert.equal(graph.modelVersion, GRAPH_MODEL_VERSION)
  assert.equal(graph.sessionId, sessionId)
  assert.equal(graph.rootId, `session:${sessionId}`)
  assert.equal(graph.nodes[0].type, 'session')
  const turns = graph.nodes.filter((node) => node.type === 'turn')
  assert.deepEqual(turns.map((node) => node.turn), [1, 2])
  for (const turn of turns) {
    const edge = graph.edges.find((candidate) => candidate.to === turn.id && candidate.type === 'contains')
    assert.ok(edge)
    assert.equal(edge.from, graph.rootId)
    assert.equal(edge.derivation, 'direct')
    assert.equal(edge.status, 'observed')
    assert.ok(edge.evidenceIds.length > 0)
  }
})

test('each invocation is contained by its turn, and carries its outcome separately from its status', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'ok', turn: 1 }),
    toolResult({ seq: 11, callId: 'ok', turn: 1 }),
    toolCall({ seq: 12, callId: 'bad', turn: 1 }),
    toolResult({ seq: 13, callId: 'bad', turn: 1, isError: true, code: 'TOOL_FAILED' }),
  ])
  const graph = buildRuntimeGraph(receipt)
  const turnNode = graph.nodes.find((node) => node.type === 'turn')
  for (const invocationId of ['ok', 'bad']) {
    const node = graph.nodes.find((candidate) => candidate.invocationId === invocationId)
    assert.ok(node, `${invocationId} node missing`)
    const edge = graph.edges.find((candidate) => candidate.to === node.id && candidate.type === 'contains')
    assert.equal(edge.from, turnNode.id)
    assert.equal(edge.derivation, 'direct')
    // Both calls were fully observed; only their outcome differs.
    assert.equal(node.status, 'observed')
  }
  assert.equal(graph.nodes.find((node) => node.invocationId === 'ok').outcome, 'success')
  assert.equal(graph.nodes.find((node) => node.invocationId === 'bad').outcome, 'failure')
})

test('an unobserved result leaves the invocation partially correlated', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'pending', turn: 1 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  const node = graph.nodes.find((candidate) => candidate.invocationId === 'pending')
  assert.equal(node.status, 'partial')
  assert.equal(node.outcome, 'requested')
})

test('a spawned child is observed from the session and attributed only by rule', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'spawn-1', name: 'subagent', turn: 1 }),
    subagentCatalog({ seq: 11, childId: 'child-alpha', mode: 'one-shot' }),
    toolResult({ seq: 12, callId: 'spawn-1', turn: 1 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  const child = graph.nodes.find((node) => node.id === 'subagent:child-alpha')
  assert.ok(child)
  assert.equal(child.type, 'subagent')
  assert.equal(child.role, 'child-session')
  assert.equal(child.subtitle, 'one-shot')
  const fromSession = graph.edges.find((edge) => edge.to === child.id && edge.from === graph.rootId)
  assert.equal(fromSession.type, 'spawns')
  assert.equal(fromSession.derivation, 'direct')
  assert.equal(fromSession.status, 'observed')
  const fromInvocation = graph.edges.find((edge) => edge.to === child.id && edge.from.startsWith('invocation:'))
  assert.equal(fromInvocation.type, 'spawns')
  assert.equal(fromInvocation.derivation, 'rule_based')
  assert.equal(fromInvocation.status, 'candidate')
  assert.equal(fromInvocation.rule, SPAWN_ATTRIBUTION_RULE)
  assert.equal(child.status, 'observed')
})

test('the spawn edge cites the catalog event, and never the catalog label', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    subagentCatalog({ seq: 11, childId: 'child-beta', label: 'Investigate the billing secret rotation' }),
  ])
  const graph = buildRuntimeGraph(receipt)
  const edge = graph.edges.find((candidate) => candidate.type === 'spawns')
  assert.deepEqual(edge.evidenceIds, [`${sessionId}:re:11`])
  // The label is caller text: it is not read, stored, or correlated.
  assert.equal(JSON.stringify(receipt).includes('billing secret rotation'), false)
  assert.equal(JSON.stringify(graph).includes('billing secret rotation'), false)
})

test('a retry edge connects the failed invocation to the one that repeated it', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'first', turn: 1 }),
    toolResult({ seq: 11, callId: 'first', turn: 1, isError: true, code: 'TOOL_FAILED' }),
    toolCall({ seq: 12, callId: 'second', turn: 1 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  const edge = graph.edges.find((candidate) => candidate.type === 'retries')
  assert.ok(edge, 'a retry edge is expected')
  assert.equal(edge.from, 'invocation:first')
  assert.equal(edge.to, 'invocation:second')
  assert.equal(edge.status, 'observed')
  assert.equal(edge.derivation, 'rule_based')
  assert.equal(edge.evidenceIds.includes(`${sessionId}:re:12:retry`), true)
  assert.equal(edge.evidenceIds.includes(`${sessionId}:re:11`), true)
})

test('follows edges connect only consecutive invocations inside one step', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'a', turn: 1, step: 1 }),
    toolResult({ seq: 11, callId: 'a', turn: 1, step: 1 }),
    toolCall({ seq: 12, callId: 'b', turn: 1, step: 1 }),
    toolResult({ seq: 13, callId: 'b', turn: 1, step: 1 }),
    toolCall({ seq: 14, callId: 'c', turn: 1, step: 1 }),
    toolResult({ seq: 15, callId: 'c', turn: 1, step: 1 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  const follows = graph.edges.filter((edge) => edge.type === 'follows')
  assert.equal(follows.length, 2)
  assert.deepEqual(follows.map((edge) => [edge.from, edge.to]), [
    ['invocation:a', 'invocation:b'],
    ['invocation:b', 'invocation:c'],
  ])
  for (const edge of follows) {
    assert.equal(edge.status, 'candidate')
    assert.equal(edge.derivation, 'candidate')
    assert.equal(edge.rule, FOLLOWS_RULE)
  }
  // Non-consecutive pairs are not related at all — no edge, not a weak one.
  assert.equal(graph.edges.some((edge) => edge.from === 'invocation:a' && edge.to === 'invocation:c'), false)
})

test('a user-explicit load and a model-invoked load are both graph nodes', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    skillInvocationMessage({ seq: 10, name: 'user-skill' }),
    toolCall({ seq: 20, callId: 'sk', name: 'skill', turn: 1, step: 1 }),
    toolResult({ seq: 21, callId: 'sk', turn: 1, step: 1 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  const skills = graph.nodes.filter((node) => node.type === 'skill')
  assert.equal(skills.length, 2)
  assert.deepEqual(skills.map((node) => node.subtitle).sort(), ['model-invoked', 'user-explicit'])
  for (const skill of skills) {
    assert.equal(graph.edges.some((edge) => edge.to === skill.id && edge.type === 'contains'), true)
  }
})

test('the graph reports counts and never a score', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'a', turn: 1 }),
    toolResult({ seq: 11, callId: 'a', turn: 1 }),
    toolCall({ seq: 12, callId: 'b', turn: 1 }),
    toolResult({ seq: 13, callId: 'b', turn: 1 }),
  ])
  const { stats } = buildRuntimeGraph(receipt)
  // session + turn + two invocations
  assert.equal(stats.nodeCount, 4)
  // session→turn, turn→a, turn→b, and the candidate a→b adjacency
  assert.equal(stats.edgeCount, 4)
  assert.equal(stats.observedEdgeCount, 3)
  assert.equal(stats.candidateEdgeCount, 1)
  assert.equal(stats.unlinkedCount, 0)
  assert.equal(stats.droppedEdgeCount, 0)
  assert.deepEqual(Object.keys(stats.byType).sort(), ['contains', 'follows', 'retries', 'spawns'])
  // The projection counts observations. It has no score, rate, or ranking field.
  for (const key of Object.keys(stats)) {
    assert.equal(/score|rate|percent|rank|confidence/i.test(key), false, `stats must not rank: ${key}`)
  }
})

test('every edge derivation is one of the declared values', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'spawn-1', name: 'subagent', turn: 1 }),
    subagentCatalog({ seq: 11, childId: 'child-g' }),
    toolResult({ seq: 12, callId: 'spawn-1', turn: 1 }),
    toolCall({ seq: 20, callId: 'x', turn: 1 }),
    toolResult({ seq: 21, callId: 'x', turn: 1 }),
    toolCall({ seq: 22, callId: 'y', turn: 1 }),
    toolResult({ seq: 23, callId: 'y', turn: 1 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  for (const edge of graph.edges) {
    assert.equal(EDGE_DERIVATIONS.includes(edge.derivation), true, `bad derivation ${edge.derivation}`)
    assert.equal(typeof edge.id, 'string')
    assert.equal(graph.nodes.some((node) => node.id === edge.from), true)
    assert.equal(graph.nodes.some((node) => node.id === edge.to), true)
  }
})

test('lineage is carried from the session header, not inferred', () => {
  const receipt = setRuntimeLineage(emptyReceipt(sessionId, 1), {
    parentSessionId: 'session-parent-1',
    delegationDepth: 2,
  })
  assert.deepEqual(receipt.lineage, { parentSessionId: 'session-parent-1', delegationDepth: 2 })
  const graph = buildRuntimeGraph(receipt)
  assert.deepEqual(graph.lineage, { parentSessionId: 'session-parent-1', delegationDepth: 2 })
  // A missing parent stays null rather than being invented.
  const root = emptyReceipt('session-root', 1)
  assert.deepEqual(root.lineage, { parentSessionId: null, delegationDepth: null })
  assert.deepEqual(buildRuntimeGraph(root).lineage, { parentSessionId: null, delegationDepth: null })
})

test('lineage survives migration and is validated', () => {
  const migrated = migrateReceipt({
    ...emptyReceipt(sessionId, 1),
    lineage: { parentSessionId: 'session-parent-2', delegationDepth: 1 },
  }, sessionId)
  assert.deepEqual(migrated.lineage, { parentSessionId: 'session-parent-2', delegationDepth: 1 })
  const junk = migrateReceipt({
    ...emptyReceipt(sessionId, 1),
    lineage: { parentSessionId: '/etc/passwd', delegationDepth: -4 },
  }, sessionId)
  assert.deepEqual(junk.lineage, { parentSessionId: null, delegationDepth: null })
})

test('the SDD uses/produces edges are deliberately absent', () => {
  const receipt = reduceAll([
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    toolCall({ seq: 10, callId: 'sk', name: 'skill', turn: 1 }),
    toolResult({ seq: 11, callId: 'sk', turn: 1 }),
    toolCall({ seq: 12, callId: 'cli', name: 'bash', turn: 1 }),
    toolResult({ seq: 13, callId: 'cli', turn: 1 }),
  ])
  const graph = buildRuntimeGraph(receipt)
  // Attributing the CLI call to the Skill would require alignment evidence that
  // does not exist yet, so no `uses` edge may be emitted.
  assert.equal(graph.edges.some((edge) => edge.type === 'uses' || edge.type === 'produces'), false)
  // They are adjacent in the same step, so a candidate `follows` edge is allowed —
  // but it must stay a candidate and must never be dressed up as usage.
  for (const edge of graph.edges.filter((candidate) => candidate.from === 'invocation:sk' && candidate.to === 'invocation:cli')) {
    assert.equal(edge.type, 'follows')
    assert.equal(edge.status, 'candidate')
    assert.equal(edge.derivation, 'candidate')
  }
})

test('an empty receipt yields a rooted graph with no edges', () => {
  const graph = buildRuntimeGraph(emptyReceipt(sessionId, 1))
  assert.equal(graph.nodes.length, 1)
  assert.equal(graph.nodes[0].type, 'session')
  assert.deepEqual(graph.edges, [])
  assert.deepEqual(graph.unlinked, [])
  assert.equal(graph.stats.edgeCount, 0)
})
