import test from 'node:test'
import assert from 'node:assert/strict'

import { aggregateInvocations } from '../src/core/runtime-events.mjs'
import {
  SCOPE_DERIVATIONS,
  SCOPE_LIMITATIONS,
  SCOPE_RELATION_STATUSES,
  buildSkillRuntimeScopes,
  scopedRuntimeEvents,
  scopesForSkillName,
} from '../src/core/skill-runtime-scope.mjs'
import { buildAlignment, ALIGNMENT_STATUSES } from '../src/core/runtime-alignment.mjs'

// Skill Runtime Scope — Core Unit Test layer.
//
// The defect these tests exist for: alignment matched a Skill's declared steps against every
// runtime event in the session, so `read` in turn 1 could be credited to a Skill loaded in
// turn 2. Every existing test passed while that was true, because none of them built a
// session where the distinction mattered. A fixture is only useful here if it would have
// failed before the fix.
//
// Events are shaped like the real ones — `invocation.request` / `invocation.result` pairs
// carrying `turn`, `step`, `seq`, `timestamp`, `capabilityId`, `capabilityName` and
// `invocationId`, and a `skill.invocation` for the load. Measured on a real session, those
// fields are present on 100% of events.

const SESSION = 'session-scope-fixture'

let seq = 0
const nextSeq = () => (seq += 1)

/** A tool call, as the runtime records it: a request and its result. */
function call({ turn, step, capabilityId = 'cli', name = 'bash', status = 'success', id }) {
  const invocationId = id ?? `call_${turn}_${step}_${nextSeq()}`
  return [
    {
      eventId: `${SESSION}:re:req-${invocationId}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10,
      type: 'invocation.request', source: 'dsh', turn, step,
      status: 'requested', capabilityId, capabilityName: name, invocationId,
    },
    {
      eventId: `${SESSION}:re:res-${invocationId}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10,
      type: 'invocation.result', source: 'dsh', turn, step,
      status, capabilityId, capabilityName: name, invocationId,
    },
  ]
}

/** A Skill load. `skill.invocation` is what DSH writes for both load paths. */
function load({ turn, step, skillName, invocationType = 'model-invoked', id }) {
  const invocationId = id ?? `skill-invocation:${turn}:${step}`
  return {
    eventId: `${SESSION}:re:${invocationId}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10,
    type: 'skill.invocation', source: 'dsh', turn, step,
    status: 'success', capabilityId: 'skill', capabilityName: skillName, invocationId,
  }
}

/** The receipt's own trace entry for a load — a different id space, as in production. */
function trace({ turn, step, skillName, invocationType = 'model-invoked' }) {
  return {
    eventId: `${SESSION}:invocation:${turn}:${step}`, sessionId: SESSION,
    turn, step, skillName, status: 'loaded', invocationType,
  }
}

/**
 * Build a receipt.
 *
 * The declared steps must ride on `trace.continuityCandidate.steps` — that is the only field
 * `declaredStepsFor` reads. An earlier version of this fixture put them in `skillInstructions`,
 * which nothing consumes, so every alignment assertion below passed **vacuously**: no steps
 * meant no items, and `items.find(...)` returned `undefined` for every check. The tests were
 * green against a version of the code with the whole defect still in place.
 *
 * @param declaration - step titles, in order.
 */
function receiptOf({ events, traces, declaration = [] }) {
  const decorated = traces.map((entry, index) => (index === 0 && declaration.length
    ? {
      ...entry,
      status: 'loaded',
      continuityCandidate: {
        extractionChannel: 'ordered-list',
        extractionNote: null,
        steps: declaration.map((title) => ({ title, kind: undefined, evidenceType: 'ordered-list' })),
      },
    }
    : entry))
  return { sessionId: SESSION, runtimeEvents: events, traceEvents: decorated }
}

// ---------------------------------------------------------------------------
// Cases A–G from the design
// ---------------------------------------------------------------------------

test('Case A: one Skill, one turn — the turn becomes the scope', () => {
  const events = [
    ...call({ turn: 1, step: 1, name: 'read_file' }),      // before the load, different turn
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 2, step: 2, name: 'read_file' }),
    ...call({ turn: 2, step: 3, name: 'edit_file' }),
    ...call({ turn: 3, step: 1, name: 'bash' }),           // after the turn, must not be in scope
  ]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 2, step: 1, skillName: 'skill-a' })] }))
  assert.equal(built.scopes.length, 1)
  assert.equal(built.unlinked.length, 0)

  const scope = built.scopes[0]
  assert.deepEqual(scope.turnRange, { from: 2, to: 2 })
  // A call is a request/result *pair*, so the turn holds 1 load + 2×2 call events.
  const invocations = new Set(scope.observedEvents.map((e) => e.invocationId))
  assert.equal(invocations.size, 3, 'one load and two calls')
  assert.equal(scope.observedEvents.length, 5)
  assert.deepEqual(scope.observedEvents.map((e) => e.turn), [2, 2, 2, 2, 2])
  assert.equal(scopedRuntimeEvents(built, 'skill-a').length, 5)
})

test('Case B: two Skills in one session keep disjoint scopes', () => {
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 2, step: 2, name: 'edit_file' }),
    load({ turn: 5, step: 1, skillName: 'skill-b' }),
    ...call({ turn: 5, step: 2, name: 'bash' }),
  ]
  const built = buildSkillRuntimeScopes(receiptOf({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a' }), trace({ turn: 5, step: 1, skillName: 'skill-b' })],
  }))
  const a = scopesForSkillName(built, 'skill-a').scopes[0]
  const b = scopesForSkillName(built, 'skill-b').scopes[0]
  assert.ok(a && b)
  const aIds = new Set(a.eventIds)
  for (const id of b.eventIds) assert.ok(!aIds.has(id), `${id} appears in both scopes`)
  // The failure this guards: B's runtime events being credited to A.
  assert.equal(a.observedEvents.every((e) => e.turn === 2), true)
})

test('Case C: several invocations in the loading turn are all in scope', () => {
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    // `capabilityId` must be stated, not defaulted: read_file and edit_file reach the
    // runtime as `tool`, and a fixture that labels everything `cli` would hide that.
    ...call({ turn: 2, step: 2, capabilityId: 'tool', name: 'read_file' }),
    ...call({ turn: 2, step: 3, capabilityId: 'tool', name: 'edit_file' }),
    ...call({ turn: 2, step: 4, capabilityId: 'cli', name: 'bash' }),
  ]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 2, step: 1, skillName: 'skill-a' })] }))
  const scope = built.scopes[0]
  // 1 load + 2 cli calls (2 events each) + 1 tool call (2 events).
  assert.equal(scope.observedEvents.length, 7)
  assert.equal(scope.observedByClass.tool.total, 4)  // read_file + edit_file, two events each
  assert.equal(scope.observedByClass.cli.total, 2)   // bash, request + result
  assert.equal(new Set(scope.observedEvents.map((e) => e.invocationId)).size, 4)
})

test('Case D: a user-explicit load carries turn/step like any other', () => {
  const events = [
    load({ turn: 4, step: 1, skillName: 'character-asset-kit', invocationType: 'user-explicit' }),
    ...call({ turn: 4, step: 2, name: 'bash' }),
  ]
  const traces = [trace({ turn: 4, step: 1, skillName: 'character-asset-kit', invocationType: 'user-explicit' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces }))
  assert.equal(built.scopes.length, 1, 'a /name load must produce a scope, not be skipped')
  assert.equal(built.scopes[0].invocationType, 'user-explicit')
  // 1 load + 1 call pair = 3 events.
  assert.equal(built.scopes[0].observedEvents.length, 3)
})

test('Case E: a load with nothing else in its turn yields a scope holding only the load', () => {
  const events = [load({ turn: 7, step: 1, skillName: 'skill-a' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 7, step: 1, skillName: 'skill-a' })] }))
  assert.equal(built.scopes.length, 1)
  assert.equal(built.scopes[0].observedEvents.length, 1)
  assert.equal(built.scopes[0].observedEvents[0].relationStatus, 'observed')
})

test('Case F: a load naming no turn is unlinked, never guessed at', () => {
  const events = [...call({ turn: 1, step: 1, name: 'bash' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: undefined, step: 1, skillName: 'skill-a' })] }))
  assert.equal(built.scopes.length, 0)
  assert.equal(built.unlinked.length, 1)
  assert.equal(built.unlinked[0].derivation, 'no-turn-boundary')
  assert.deepEqual(built.unlinked[0].eventIds, [])
})

test('Case G: two Skills in one turn are both unlinked — the turn cannot separate them', () => {
  const events = [
    load({ turn: 3, step: 1, skillName: 'skill-a', id: 'skill-invocation:a' }),
    load({ turn: 3, step: 2, skillName: 'skill-b', id: 'skill-invocation:b' }),
    ...call({ turn: 3, step: 3, name: 'bash' }),
  ]
  const built = buildSkillRuntimeScopes(receiptOf({
    events,
    traces: [trace({ turn: 3, step: 1, skillName: 'skill-a' }), trace({ turn: 3, step: 2, skillName: 'skill-b' })],
  }))
  assert.equal(built.scopes.length, 0, 'neither Skill may claim a turn it shares')
  assert.equal(built.unlinked.length, 2)
  for (const record of built.unlinked) {
    assert.equal(record.derivation, 'ambiguous-turn')
    assert.deepEqual(record.eventIds, [])
  }
  assert.equal(scopedRuntimeEvents(built, 'skill-a').length, 0)
  assert.equal(scopedRuntimeEvents(built, 'skill-b').length, 0)
})

// ---------------------------------------------------------------------------
// The invariants that matter more than the cases
// ---------------------------------------------------------------------------

test('§32 every scope event cites a runtime event id that exists', () => {
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 2, step: 2, name: 'bash' }),
    ...call({ turn: 2, step: 3, name: 'read_file' }),
  ]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 2, step: 1, skillName: 'skill-a' })] }))
  const known = new Set(events.map((e) => e.eventId))
  for (const scope of built.scopes) {
    for (const id of scope.eventIds) {
      assert.ok(known.has(id), `scope cites ${id}, which is not a runtime event`)
    }
    for (const entry of scope.observedEvents) {
      assert.ok(known.has(entry.eventId), `observed event ${entry.eventId} does not exist`)
    }
  }
})

test('§32 no scope is established by temporal adjacency', () => {
  // Two turns with identical shapes, and a load in the first. If adjacency were used, the
  // second turn's calls would be pulled in. They must not be.
  const events = [
    load({ turn: 1, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 1, step: 2, name: 'bash' }),
    ...call({ turn: 2, step: 1, name: 'bash' }),   // immediately after, same shape
    ...call({ turn: 3, step: 1, name: 'bash' }),
  ]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 1, step: 1, skillName: 'skill-a' })] }))
  const scope = built.scopes[0]
  assert.equal(new Set(scope.observedEvents.map((e) => e.invocationId)).size, 2, 'only turn 1 belongs to a turn-1 load')
  assert.equal(scope.turnRange.from, scope.turnRange.to)
})

test('§32 the vocabulary cannot express a causal edge', () => {
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 1, step: 1, skillName: 'skill-a' })] }))
  const serialized = JSON.stringify(built)
  for (const forbidden of ['"uses"', '"causes"', '"produces"', "'uses'", "'causes'", "'produces'"]) {
    assert.ok(!serialized.includes(forbidden), `scope payload contains ${forbidden}`)
  }
  for (const status of SCOPE_RELATION_STATUSES) {
    assert.ok(!['caused', 'causes', 'uses', 'produces'].includes(status))
  }
  assert.deepEqual(SCOPE_DERIVATIONS.filter((d) => /caus|use|produce/i.test(d)), [])
})

test('§32 every scope carries the limitations that bound what it means', () => {
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 1, step: 1, skillName: 'skill-a' })] }))
  const scope = built.scopes[0]
  assert.ok(Array.isArray(scope.limitation) && scope.limitation.length >= 3)
  assert.ok(scope.limitation.includes(SCOPE_LIMITATIONS.notCausal))
  assert.ok(scope.limitation.includes(SCOPE_LIMITATIONS.notCompliance))
  // A limitation saying "does not mean the Skill caused the call" is a **negation** and is
  // exactly what should be there. What must never appear is an affirmative causal claim.
  // Substring matching cannot tell "does not mean the Skill caused it" from "the Skill caused
  // it", so this checks the field vocabulary and the presence of the negation instead.
  const keys = Object.keys(scope)
  for (const forbidden of ['cause', 'causes', 'caused', 'uses', 'produces', 'effects']) {
    assert.ok(!keys.includes(forbidden), `scope has a causal field: ${forbidden}`)
  }
  assert.ok(scope.limitation.some((line) => line.includes('不表示 Skill 导致')),
    'the negation is what makes the scope honest')
})

test('§32 a scope stores no prompt, tool arguments, or project content', () => {
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 1, step: 1, skillName: 'skill-a' })] }))
  const scope = built.scopes[0]
  const keys = new Set(Object.keys(scope))
  for (const forbidden of ['prompt', 'instructions', 'arguments', 'args', 'content', 'output', 'result', 'stdout']) {
    assert.ok(!keys.has(forbidden), `scope exposes ${forbidden}`)
  }
})

// ---------------------------------------------------------------------------
// Alignment must read the scope, and keep its own promises
// ---------------------------------------------------------------------------

test('§17 alignment reads only in-scope events', () => {
  const declaration = ['Inspect the repository', 'Implement the change', 'Run the tests']
  const events = [
    // Out of scope: read in an earlier turn.
    ...call({ turn: 1, step: 1, capabilityId: 'tool', name: 'read_file' }),
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    // In scope: the turn the Skill was loaded in. The name must come from the classifier's
    // own vocabulary — `edit_file` is not in it and would classify as `other`, which would
    // make this test pass for the wrong reason.
    ...call({ turn: 2, step: 2, capabilityId: 'tool', name: 'edit' }),
  ]
  const receipt = receiptOf({ events, traces: [trace({ turn: 2, step: 1, skillName: 'skill-a' })], declaration })
  const alignment = buildAlignment(receipt, 'skill-a')
  // Guard against the vacuous pass: with no extracted steps every assertion below is a no-op.
  assert.equal(alignment.items.length, 3, 'the declaration must produce three steps')
  assert.equal(alignment.scope.established, true)
  assert.equal(alignment.scope.eventCount, 3, 'the load and the edit pair are in scope')

  // The out-of-scope `read_file` in turn 1 must not satisfy the inspect step. Under scoping
  // only the turn-2 edit is visible, so inspect has no evidence inside the scope.
  const inspect = alignment.items.find((item) => item.kind === 'inspect')
  assert.ok(inspect, 'the declared inspect step must exist, or this test proves nothing')
  assert.notEqual(inspect.status, 'observed', 'an out-of-scope event satisfied a declared step')
  // And the in-scope edit must be seen, so the assertion above is not passing because
  // alignment lost its runtime entirely.
  const edit = alignment.items.find((item) => item.kind === 'edit')
  // In scope, but a capability name is all the Runtime model supports: `edit` proves an edit
  // capability ran, not that it touched what the step named.
  assert.equal(edit?.status, 'partial', 'the in-scope edit was not matched')
})

test('§17 an unlinked Skill yields insufficient, never "not done"', () => {
  const declaration = ['Inspect the repository', 'Run the tests']
  const events = [
    load({ turn: 1, step: 1, skillName: 'skill-a', id: 'skill-invocation:a' }),
    load({ turn: 1, step: 2, skillName: 'skill-b', id: 'skill-invocation:b' }),
    ...call({ turn: 1, step: 3, name: 'read_file' }),
  ]
  const receipt = receiptOf({
    events,
    traces: [trace({ turn: 1, step: 1, skillName: 'skill-a' }), trace({ turn: 1, step: 2, skillName: 'skill-b' })],
    declaration,
  })
  const alignment = buildAlignment(receipt, 'skill-a')
  assert.equal(alignment.items.length, 2, 'the declaration must produce two steps')
  assert.equal(alignment.scope.established, false)
  assert.equal(alignment.scope.relationStatus, 'unlinked')
  for (const item of alignment.items) {
    assert.ok(['insufficient', 'unknown'].includes(item.status),
      `step landed in ${item.status}; an unattributable run cannot report more`)
  }
})

test('§17 alignment still refuses to score, and its vocabulary is unchanged', () => {
  const events = [load({ turn: 1, step: 1, skillName: 'skill-a' }), ...call({ turn: 1, step: 2, name: 'bash' })]
  const receipt = receiptOf({ events, traces: [trace({ turn: 1, step: 1, skillName: 'skill-a' })], declaration: ['Run the tests'] })
  const alignment = buildAlignment(receipt, 'skill-a')
  assert.equal(alignment.items.length, 1, 'the declaration must produce one step')
  assert.equal(alignment.scored, false)
  // `scored: false` is the flag that says no score exists; a raw substring check would flag it.
  const keys = Object.keys(alignment)
  for (const forbidden of ['complianceRate', 'score', 'percentage', 'ranking', 'followedRate']) {
    assert.ok(!keys.includes(forbidden), `alignment exposes a score field: ${forbidden}`)
  }
  assert.equal(alignment.scored, false)
  assert.deepEqual(ALIGNMENT_STATUSES, ['observed', 'partial', 'insufficient', 'unknown'])
  for (const forbidden of ['not-observed', 'skipped', 'not-done']) {
    assert.ok(!ALIGNMENT_STATUSES.includes(forbidden), `status vocabulary contains ${forbidden}`)
  }
})

test('§36 a large session stays within the scope budget', () => {
  const events = []
  const traces = []
  for (let turn = 1; turn <= 60; turn += 1) {
    for (let step = 1; step <= 20; step += 1) events.push(...call({ turn, step, name: 'bash' }))
  }
  events.push(load({ turn: 30, step: 21, skillName: 'skill-a' }))
  traces.push(trace({ turn: 30, step: 21, skillName: 'skill-a' }))

  const started = process.hrtime.bigint()
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces }))
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6

  assert.equal(built.scopes.length, 1)
  // 42 events in the loading turn: 41 calls plus the load.
  // 20 calls per turn = 40 events, plus the load.
  assert.ok(built.scopes[0].observedEvents.length <= 41)
  assert.ok(elapsedMs < 500, `scope build took ${elapsedMs.toFixed(0)}ms for ${events.length} events`)
  // The scoped set must be a small fraction of the session, or the fix has not taken.
  assert.ok(scopedRuntimeEvents(built, 'skill-a').length < events.length / 10)
})

test('a Skill loaded twice keeps both runs', () => {
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a', id: 'skill-invocation:a1' }),
    ...call({ turn: 2, step: 2, name: 'bash' }),
    load({ turn: 9, step: 1, skillName: 'skill-a', id: 'skill-invocation:a2' }),
    ...call({ turn: 9, step: 2, name: 'bash' }),
  ]
  const built = buildSkillRuntimeScopes(receiptOf({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a' }), trace({ turn: 9, step: 1, skillName: 'skill-a' })],
  }))
  const { scopes } = scopesForSkillName(built, 'skill-a')
  assert.equal(scopes.length, 2, 'both runs of the same Skill must survive')
  // Two runs × (1 load + 1 call pair) = 6 events.
  assert.equal(scopedRuntimeEvents(built, 'skill-a').length, 6)
})

test('a load whose turn has aggregated invocations still resolves its anchor', () => {
  // The load's trace id and its runtime id live in different namespaces; only turn/step
  // and capabilityId agree. Matching on the ids alone silently marks no anchor at all.
  const events = [load({ turn: 5, step: 3, skillName: 'skill-a' }), ...call({ turn: 5, step: 4, name: 'bash' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 5, step: 3, skillName: 'skill-a' })] }))
  const anchors = built.scopes[0].observedEvents.filter((entry) => entry.relationStatus === 'observed')
  assert.equal(anchors.length, 1, 'the load itself must be marked observed')
  assert.equal(anchors[0].capabilityName, 'skill-a')
})

test('aggregateInvocations over a scoped list sees only that list', () => {
  // Guards the call site itself: alignment must hand the aggregator the scoped events.
  const events = [...call({ turn: 1, step: 1, name: 'bash' }), load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, name: 'bash' })]
  const built = buildSkillRuntimeScopes(receiptOf({ events, traces: [trace({ turn: 2, step: 1, skillName: 'skill-a' })] }))
  const scoped = scopedRuntimeEvents(built, 'skill-a')
  const invocations = aggregateInvocations(scoped)
  assert.equal(invocations.length, 2, 'one skill load and one bash call — not the turn-1 call')
  assert.ok(invocations.every((invocation) => invocation.turn === 2))
})
