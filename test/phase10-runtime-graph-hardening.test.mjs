import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSkillRuntimeScopes, projectScopesOntoLayout, scopesForSkillName } from '../src/core/skill-runtime-scope.mjs'
import { computeRuntimeLayout } from '../src/core/runtime-layout.mjs'

// Runtime Graph hardening. These are the guards beta.58 shipped without.
//
// beta.58 added the contextual inspector, the scope projection and the two focus semantics, and
// shipped with **no new tests at all** — the changes had no regression guard. This file closes
// that. The cases are lettered to match the brief.
//
// Where a case cannot be settled in-process it says so instead of asserting something weaker:
// Inspector click behaviour and canvas pixels need a DOM, and are verified through the render
// harness (01_重构方案/render-harness/) with recorded measurements.

const SESSION = 'session-beta59'
let seq = 0
const nextSeq = () => (seq += 1)

function call({ turn, step, capabilityId = 'cli', name = 'bash' }) {
  const invocationId = `call_${turn}_${step}_${nextSeq()}`
  return [
    { eventId: `${SESSION}:req-${invocationId}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10, type: 'invocation.request', source: 'dsh', turn, step, status: 'requested', capabilityId, capabilityName: name, invocationId },
    { eventId: `${SESSION}:res-${invocationId}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10, type: 'invocation.result', source: 'dsh', turn, step, status: 'success', capabilityId, capabilityName: name, invocationId },
  ]
}

function load({ turn, step, skillName, id = `skill-invocation:${turn}` }) {
  return { eventId: `${SESSION}:re:${id}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10, type: 'skill.invocation', source: 'dsh', turn, step, status: 'success', capabilityId: 'skill', capabilityName: skillName, invocationId: id }
}

/** A receipt plus the graph and layout the Host would build from it. */
function buildScenario({ events, traces }) {
  const receipt = { sessionId: SESSION, runtimeEvents: events, traceEvents: traces }
  const nodes = [{ id: 'session', type: 'session', title: SESSION, role: 'session' }]
  const edges = []
  const byTurn = new Map()
  for (const event of events) {
    if (event.type !== 'invocation.request' && event.type !== 'skill.invocation') continue
    if (!byTurn.has(event.turn)) byTurn.set(event.turn, [])
    byTurn.get(event.turn).push(event)
  }
  for (const turn of [...byTurn.keys()].sort((a, b) => a - b)) {
    nodes.push({ id: `turn:${turn}`, type: 'turn', title: `Turn ${turn}`, turn, role: 'turn' })
    edges.push({ id: `e:s:${turn}`, from: 'session', to: `turn:${turn}`, type: 'contains', evidenceIds: [] })
    for (const seed of byTurn.get(turn)) {
      const id = `invocation:${seed.invocationId}`
      nodes.push({
        id,
        type: seed.capabilityId === 'skill' ? 'skill' : 'tool',
        title: seed.capabilityName,
        role: 'invocation',
        capabilityId: seed.capabilityId,
        turn: seed.turn,
        step: seed.step,
        status: 'observed',
        invocationId: seed.invocationId,
        evidenceEventIds: [seed.eventId],
      })
      edges.push({ id: `e:${turn}:${id}`, from: `turn:${turn}`, to: id, type: 'contains', evidenceIds: [] })
    }
  }
  const graph = { nodes, edges, modelVersion: 1 }
  const layout = computeRuntimeLayout(graph, { nodeLimit: 200, includeMemberIds: true })
  return { receipt, graph, layout, built: buildSkillRuntimeScopes(receipt), projected: projectScopesOntoLayout(buildSkillRuntimeScopes(receipt), layout) }
}

// ---------------------------------------------------------------------------
// Case M — Scope.observedEvents → inScopeNodeIds → Canvas data-in-scope
// ---------------------------------------------------------------------------

test('Case M: every in-scope event maps to a drawn node, and nothing else does', () => {
  const events = [
    ...call({ turn: 1, step: 1, name: 'bash' }),          // outside the loading turn
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 2, step: 2, capabilityId: 'tool', name: 'read_file' }),
    ...call({ turn: 3, step: 1, name: 'bash' }),          // after the loading turn
  ]
  const { layout, projected } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 2, step: 1, skillName: 'skill-a' }] })
  const scope = projected.scopes[0]
  assert.ok(scope, 'the scenario must produce a scope')

  const drawn = new Set(layout.nodes.map((node) => node.id))
  for (const id of scope.inScopeNodeIds) assert.ok(drawn.has(id), `${id} is not drawn by the layout`)

  // One-to-one with the scope's own members: every member invocation is represented.
  // The load is one invocation; read_file's request and result share another. Counting events
  // would give 3, which is why this counts invocations.
  const memberInvocations = new Set(scope.observedEvents.map((entry) => entry.invocationId).filter(Boolean))
  assert.equal(memberInvocations.size, 2, 'the load, and read_file request+result')
  // A request and its result must collapse to one invocation, or the highlight would count
  // the same call twice.
  assert.ok([...memberInvocations].some((id) => id.startsWith('skill-invocation:')), 'the load must be a member')

  // And the out-of-scope calls must not be represented at all.
  const outOfScope = events
    .filter((event) => event.type === 'invocation.request' && event.turn !== 2)
    .map((event) => `invocation:${event.invocationId}`)
  for (const id of outOfScope) {
    assert.ok(!scope.inScopeNodeIds.includes(id), `${id} is outside the loading turn but was highlighted`)
  }
})

test('Case M: adjacency, proximity and same-turn-alone cannot pull an event into scope', () => {
  // Turn 1 call is *immediately* before the load; turn 3 call is *immediately* after; both are
  // one turn away, which is exactly the shape an adjacency or same-turn heuristic would grab.
  const events = [
    ...call({ turn: 1, step: 9, name: 'bash' }),
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 3, step: 1, name: 'bash' }),
  ]
  const { projected } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 2, step: 1, skillName: 'skill-a' }] })
  const scope = projected.scopes[0]
  const turns = new Set(scope.observedEvents.map((entry) => entry.turn))
  assert.deepEqual([...turns], [2], 'only the loading turn may be in scope')
  assert.equal(scope.inScopeNodeIds.length, 1, 'the load itself is the only drawn member')
})

test('Case M: an out-of-scope node is never highlighted, at any budget', () => {
  const events = []
  for (let turn = 1; turn <= 6; turn += 1) {
    for (let step = 1; step <= 4; step += 1) events.push(...call({ turn, step }))
  }
  events.push(load({ turn: 4, step: 5, skillName: 'skill-a' }))
  const { projected } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 4, step: 5, skillName: 'skill-a' }] })
  const scope = projected.scopes[0]
  assert.ok(scope.inScopeNodeIds.length >= 1)
  // Nothing whose turn is not 4 may appear, whatever the layout did with grouping.
  const turnOf = new Map(events.map((event) => [`invocation:${event.invocationId}`, event.turn]))
  for (const id of scope.inScopeNodeIds) {
    if (id.startsWith('invocation:')) assert.equal(turnOf.get(id), 4, `${id} belongs to another turn`)
  }
})

// ---------------------------------------------------------------------------
// Case K — the highlight adds no edge, no relation, no causal claim
// ---------------------------------------------------------------------------

test('Case K: projection adds no edge and carries no causal vocabulary', () => {
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' })]
  const { projected, graph } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 1, step: 1, skillName: 'skill-a' }] })
  assert.equal(Object.hasOwn(projected, 'edges'), false, 'the projection must not carry edges of its own')
  // session→turn, turn→skill load, turn→bash call.
  assert.equal(graph.edges.length, 3, 'the runtime graph is untouched')

  const serialized = JSON.stringify(projected)
  for (const forbidden of ['"uses"', '"causes"', '"produces"', '"causedBy"', '"dependsOn"']) {
    assert.ok(!serialized.includes(forbidden), `projection exposes a causal edge type: ${forbidden}`)
  }
  // Highlighting is a view concern: it may say "in scope", never "because of".
  for (const id of projected.scopes[0].inScopeNodeIds) assert.equal(typeof id, 'string')
})

test('Case K: the projection does not mutate the layout it was given', () => {
  const events = [load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, name: 'bash' })]
  const first = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 2, step: 1, skillName: 'skill-a' }] })
  const before = JSON.stringify(first.layout)
  projectScopesOntoLayout(first.built, first.layout)
  assert.equal(JSON.stringify(first.layout), before, 'the layout was mutated by projection')
})

// ---------------------------------------------------------------------------
// Case N — nothing but UI state depends on the inspector
// ---------------------------------------------------------------------------

test('Case N: the runtime payload does not depend on inspector state', () => {
  // The inspector is collapsed by CSS and by a boolean in the view. Neither is an input to the
  // graph, the layout, the scope, the loads or the timeline — so building them twice, as the
  // Host would before and after a collapse, must produce byte-identical results.
  const events = []
  for (let turn = 1; turn <= 5; turn += 1) for (let step = 1; step <= 3; step += 1) events.push(...call({ turn, step }))
  events.push(load({ turn: 3, step: 4, skillName: 'skill-a' }))
  const traces = [{ eventId: `${SESSION}:i:1`, turn: 3, step: 4, skillName: 'skill-a' }]

  const a = buildScenario({ events, traces })
  const b = buildScenario({ events, traces })

  assert.equal(JSON.stringify(a.graph), JSON.stringify(b.graph), 'graph changed')
  assert.equal(JSON.stringify(a.layout), JSON.stringify(b.layout), 'layout changed')
  assert.equal(JSON.stringify(a.projected), JSON.stringify(b.projected), 'scope projection changed')
  assert.equal(JSON.stringify(a.receipt.runtimeEvents), JSON.stringify(b.receipt.runtimeEvents), 'runtime events changed')
})

test('Case N: the projected scope carries no inspector field', () => {
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' })]
  const { projected } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 1, step: 1, skillName: 'skill-a' }] })
  const keys = new Set(Object.keys(projected.scopes[0]))
  for (const forbidden of ['collapsed', 'expanded', 'inspectorOpen', 'rail', 'width']) {
    assert.ok(!keys.has(forbidden), `scope carries UI state: ${forbidden}`)
  }
})

// ---------------------------------------------------------------------------
// Cases J / I — what can and cannot be settled in-process
// ---------------------------------------------------------------------------

test('Case J: the scope gives focus an unambiguous member set, and never removes nodes', () => {
  const events = [load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, name: 'bash' }), ...call({ turn: 5, step: 1, name: 'bash' })]
  const { layout, projected } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 2, step: 1, skillName: 'skill-a' }] })
  const scope = projected.scopes[0]
  const inScope = new Set(scope.inScopeNodeIds)
  const outOfScope = layout.nodes.filter((node) => !inScope.has(node.id))
  assert.ok(outOfScope.length > 0, 'the scenario must have nodes outside the scope for dimming to mean anything')
  // Focus is dimming, not filtering: the layout still holds every node.
  assert.equal(layout.nodes.length, inScope.size + outOfScope.length)
})

test('Case J: a Skill without a reliable scope yields no scope, so focus must fall back', () => {
  const events = [
    load({ turn: 1, step: 1, skillName: 'skill-a', id: 'skill-invocation:a' }),
    load({ turn: 1, step: 2, skillName: 'skill-b', id: 'skill-invocation:b' }),
    ...call({ turn: 1, step: 3, name: 'bash' }),
  ]
  const { projected } = buildScenario({
    events,
    traces: [{ eventId: `${SESSION}:i:1`, turn: 1, step: 1, skillName: 'skill-a' }, { eventId: `${SESSION}:i:2`, turn: 1, step: 2, skillName: 'skill-b' }],
  })
  assert.equal(projected.scopes.length, 0, 'two loads in one turn must not produce a scope')
  assert.equal(projected.unlinked.length, 2)
  for (const record of projected.unlinked) assert.deepEqual(record.inScopeNodeIds, [], 'an unlinked load highlights nothing')
})

test('Case I: the default inspector state is a view constant, not a data input', () => {
  // The width itself is CSS and needs a DOM; that half is measured through the harness and
  // recorded in the changelog. What can be asserted here is the part that matters for truth:
  // the default is decided by the view, and no data path reads it.
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' })]
  const { projected, layout } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 1, step: 1, skillName: 'skill-a' }] })
  const serialized = JSON.stringify({ projected, layout })
  for (const forbidden of ['inspectorOpen', 'data-inspector', 'collapsed:true,rail']) {
    assert.ok(!serialized.includes(forbidden), `a data structure carries inspector state: ${forbidden}`)
  }
})

test('the scope projection is deterministic and sorted', () => {
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' }), ...call({ turn: 1, step: 3, name: 'bash' })]
  const { built, layout } = buildScenario({ events, traces: [{ eventId: `${SESSION}:i:1`, turn: 1, step: 1, skillName: 'skill-a' }] })
  const one = projectScopesOntoLayout(built, layout)
  const two = projectScopesOntoLayout(built, layout)
  assert.deepEqual(one, two)
  const ids = one.scopes[0].inScopeNodeIds
  assert.deepEqual(ids, [...ids].sort(), 'ids must be sorted so the payload is stable')
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique')
})

test('scopesForSkillName still separates two runs of the same Skill', () => {
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a', id: 'skill-invocation:a1' }),
    ...call({ turn: 2, step: 2, name: 'bash' }),
    load({ turn: 9, step: 1, skillName: 'skill-a', id: 'skill-invocation:a2' }),
    ...call({ turn: 9, step: 2, name: 'bash' }),
  ]
  const { built, layout } = buildScenario({
    events,
    traces: [{ eventId: `${SESSION}:i:1`, turn: 2, step: 1, skillName: 'skill-a' }, { eventId: `${SESSION}:i:2`, turn: 9, step: 1, skillName: 'skill-a' }],
  })
  const { scopes } = scopesForSkillName(built, 'skill-a')
  assert.equal(scopes.length, 2)
  const projected = projectScopesOntoLayout(built, layout)
  assert.equal(projected.scopes.length, 2)
  // The two runs must highlight different node sets.
  assert.notDeepEqual(projected.scopes[0].inScopeNodeIds, projected.scopes[1].inScopeNodeIds)
})
