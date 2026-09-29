import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAlignment, invocationSpecificity } from '../src/core/runtime-alignment.mjs'
import { buildSkillRuntimeScopes, scopedRuntimeEvents } from '../src/core/skill-runtime-scope.mjs'

// Evidence Promotion Audit — the regression suite for it.
//
// The defect: `alignStep` matched on step kind alone and never consulted the Scope's
// `relationStatus`. A tool invocation in the loading turn is `correlated` — the Runtime says it
// shares a turn, nothing more — yet it reached `observed` through this chain:
//
//   correlated member → scopedRuntimeEvents (no status filter) → aggregateInvocations
//     → classifyInvocationStep(name) → { kind, generic }
//       → kind match, !generic, resolution 'matched' → observed
//
// `relationStatus` appears nowhere in that chain. So a `bash` call that happened to share a
// turn with a Skill load made the declared step "Run the repository tests" read as observed.
//
// The fix separates two axes that were being conflated. Strength asks whether an event is
// inside a reliable Runtime Scope; specificity asks whether it names the object the step names.
// A registered tool name answers the first and never the second, because tool arguments are not
// stored and no declared step carries a correlation id. `observed` now requires `direct`
// specificity, which no current Runtime source can produce.
//
// These cases are lettered to match the audit request.

const SESSION = 'session-evidence'
let seq = 0
const nextSeq = () => (seq += 1)

function call({ turn, step, capabilityId = 'cli', name = 'bash' }) {
  const invocationId = `call_${turn}_${step}_${nextSeq()}`
  return [
    { eventId: `${SESSION}:req-${invocationId}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10, type: 'invocation.request', source: 'dsh', turn, step, status: 'requested', capabilityId, capabilityName: name, invocationId },
    { eventId: `${SESSION}:res-${invocationId}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10, type: 'invocation.result', source: 'dsh', turn, step, status: 'success', capabilityId, capabilityName: name, invocationId },
  ]
}

function load({ turn, step, skillName, id = `skill-invocation:${turn}:${skillName}` }) {
  return { eventId: `${SESSION}:re:${id}`, seq: nextSeq(), timestamp: 1790000000000 + nextSeq() * 10, type: 'skill.invocation', source: 'dsh', turn, step, status: 'success', capabilityId: 'skill', capabilityName: skillName, invocationId: id }
}

/** A trace entry carrying the declared steps — the only field `declaredStepsFor` reads. */
function trace({ turn, step, skillName, steps }) {
  return {
    eventId: `${SESSION}:invocation:${turn}:${step}`,
    sessionId: SESSION,
    turn,
    step,
    skillName,
    status: 'loaded',
    continuityCandidate: {
      extractionChannel: 'ordered-list',
      extractionNote: null,
      steps: steps.map((title) => ({ title, kind: undefined, evidenceType: 'ordered-list' })),
    },
  }
}

function alignmentFor({ events, traces, skillName }) {
  const receipt = { sessionId: SESSION, runtimeEvents: events, traceEvents: traces }
  return buildAlignment(receipt, skillName)
}

const itemFor = (alignment, title) => alignment.items.find((item) => item.title === title)

test('R1: a same-turn bash cannot make "Run tests" observed', () => {
  const events = [load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, name: 'bash' })]
  const alignment = alignmentFor({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })],
    skillName: 'skill-a',
  })
  assert.equal(alignment.scope.established, true, 'the turn is a valid scope — this is not about scope')
  const item = itemFor(alignment, 'Run the tests')
  assert.ok(item, 'the declaration must produce the step')
  // The capability ran in the right turn. That is a type-level correspondence, and `bash` is a
  // catch-all besides: it cannot say which command ran.
  assert.equal(item.status, 'partial')
  assert.notEqual(item.status, 'observed')
})

test('R2: generic=false does not by itself earn observed', () => {
  // `read_file` is a *named* capability, so it passes the `generic` check. It still cannot say
  // what was read, because arguments are never stored. Before this round the `generic` check
  // was the only defence, and a named tool walked straight past it into `observed`.
  const events = [load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, capabilityId: 'tool', name: 'read_file' })]
  const alignment = alignmentFor({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ["Inspect the repository's auth module"] })],
    skillName: 'skill-a',
  })
  const item = itemFor(alignment, "Inspect the repository's auth module")
  assert.ok(item)
  assert.equal(item.status, 'partial', 'a named capability proves the capability, not the object')
  // The match itself is still recorded — this round removes a status, not the evidence.
  assert.equal(item.matchCount > 0, true)
  assert.equal(item.observedNodeIds.length > 0, true)
})

test('R3: evidence from another turn does not participate at all', () => {
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 3, step: 1, name: 'bash' }),   // one turn later; adjacency would grab this
  ]
  const alignment = alignmentFor({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })],
    skillName: 'skill-a',
  })
  const item = itemFor(alignment, 'Run the tests')
  assert.equal(item.status, 'insufficient', 'a later turn is not weaker evidence, it is no evidence')
  assert.equal(item.matchCount, 0)
})

test('R4: two Skills in one turn earn nothing from same-turn containment', () => {
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a', id: 'skill-invocation:a' }),
    load({ turn: 2, step: 2, skillName: 'skill-b', id: 'skill-invocation:b' }),
    ...call({ turn: 2, step: 3, name: 'bash' }),
  ]
  const traces = [
    trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] }),
    trace({ turn: 2, step: 2, skillName: 'skill-b', steps: ['Run the tests'] }),
  ]
  const built = buildSkillRuntimeScopes({ sessionId: SESSION, runtimeEvents: events, traceEvents: traces })
  assert.equal(built.scopes.length, 0, 'the turn cannot be split between two Skills')
  for (const name of ['skill-a', 'skill-b']) {
    const alignment = alignmentFor({ events, traces, skillName: name })
    assert.equal(alignment.scope.established, false)
    const item = itemFor(alignment, 'Run the tests')
    assert.ok(['insufficient', 'unknown'].includes(item.status), `${name} landed in ${item.status}`)
    assert.equal(scopedRuntimeEvents(built, name).length, 0)
  }
})

test('R5: relationStatus alone cannot reach observed, and is not read as a strength score', () => {
  // Every non-anchor member of a Scope is `correlated`. Under the old code that was invisible to
  // alignment; the status it needed was specificity, which no member has. This asserts the
  // boundary from both sides: the members really are `correlated`, and they still fall short.
  const events = [load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, capabilityId: 'tool', name: 'read' })]
  const built = buildSkillRuntimeScopes({
    sessionId: SESSION,
    runtimeEvents: events,
    traceEvents: [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Read the source files'] })],
  })
  const statuses = new Set(built.scopes[0].observedEvents.map((entry) => entry.relationStatus))
  assert.deepEqual([...statuses].sort(), ['correlated', 'observed'], 'the load is the only observed member')

  const alignment = alignmentFor({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Read the source files'] })],
    skillName: 'skill-a',
  })
  assert.equal(itemFor(alignment, 'Read the source files').status, 'partial')
})

test('R6: no current Runtime source can produce direct specificity, so observed is unreachable', () => {
  // This is the honest state of the model, asserted rather than worked around. Fabricating an
  // input that yields `direct` would be inventing Runtime evidence that does not exist.
  for (const invocation of [
    { name: 'read_file', kind: 'tool' },
    { name: 'bash', kind: 'cli' },
    { name: 'mcp__server__tool', kind: 'mcp' },
    { name: 'subagent', kind: 'subagent' },
    { name: undefined, kind: undefined },
  ]) {
    assert.equal(invocationSpecificity(invocation), 'capability', `${invocation.name} must not claim specificity`)
  }

  // And therefore: across a realistic mixture, no declared step reaches observed.
  const events = [
    load({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...call({ turn: 2, step: 2, capabilityId: 'tool', name: 'read_file' }),
    ...call({ turn: 2, step: 3, capabilityId: 'tool', name: 'edit' }),
    ...call({ turn: 2, step: 4, name: 'bash' }),
  ]
  const alignment = alignmentFor({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Inspect the repository', 'Implement the change', 'Run the tests'] })],
    skillName: 'skill-a',
  })
  assert.equal(alignment.items.length, 3)
  for (const item of alignment.items) {
    assert.notEqual(item.status, 'observed', `${item.title} claimed observed with no direct evidence`)
    assert.equal(item.status, 'partial', `${item.title} should retain its capability-level correspondence`)
  }
  assert.deepEqual(alignment.stats, { observed: 0, partial: 3, insufficient: 0, unknown: 0 })
})

test('partial and insufficient stay distinct — the fix is not a blanket downgrade', () => {
  // The risk of this kind of change is collapsing every outcome into "no evidence". A step with
  // a capability-level correspondence is `partial`; a step with none is `insufficient`; a run
  // with no runtime at all is `unknown`. All three must remain reachable and different.
  const events = [load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, name: 'bash' })]
  const traces = [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests', 'Publish the summary'] })]
  const alignment = alignmentFor({ events, traces, skillName: 'skill-a' })
  assert.equal(itemFor(alignment, 'Run the tests').status, 'partial', 'bash corresponds to execute')
  assert.equal(itemFor(alignment, 'Publish the summary').status, 'insufficient', 'no produce capability ran')
  assert.notEqual(itemFor(alignment, 'Run the tests').status, itemFor(alignment, 'Publish the summary').status)

  // unknown: no Runtime Scope to align against at all. A load on its own still establishes a
  // scope (it is the scope's anchor), so that case is `insufficient` — the step simply has no
  // matching capability. `unknown` needs the absence of a scope, not the absence of a match.
  const noScope = alignmentFor({ events: [], traces, skillName: 'skill-a' })
  assert.equal(noScope.scope.established, false)
  assert.equal(itemFor(noScope, 'Run the tests').status, 'unknown')

  const loadOnly = alignmentFor({ events: [load({ turn: 2, step: 1, skillName: 'skill-a' })], traces, skillName: 'skill-a' })
  assert.equal(loadOnly.scope.established, true, 'the load anchors a scope')
  assert.equal(itemFor(loadOnly, 'Run the tests').status, 'insufficient')
})

test('the limitation text still travels with the status', () => {
  // A status without its boundary is what let the over-interpretation go unnoticed. Whatever
  // status a step carries, it must still say what that status does not mean.
  const events = [load({ turn: 2, step: 1, skillName: 'skill-a' }), ...call({ turn: 2, step: 2, name: 'bash' })]
  const alignment = alignmentFor({
    events,
    traces: [trace({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })],
    skillName: 'skill-a',
  })
  const item = itemFor(alignment, 'Run the tests')
  assert.ok(typeof item.limitation === 'string' && item.limitation.length > 0)
  const serialized = JSON.stringify(alignment)
  for (const forbidden of ['complianceRate', 'followedRate', 'confidence']) {
    assert.ok(!serialized.includes(forbidden), `alignment exposes ${forbidden}`)
  }
  assert.equal(alignment.scored, false)
})
