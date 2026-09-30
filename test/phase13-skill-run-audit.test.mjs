import test from 'node:test'
import assert from 'node:assert/strict'

import { extractRuntimeEvidence, parseArguments, classifyCommand } from '../src/core/runtime-evidence.mjs'
import { buildAlignment } from '../src/core/runtime-alignment.mjs'
import { rebuildReceipt } from '../src/core/trace-reducer.mjs'

// Skill Run Audit Spike — the evidence cases.
//
// The question this file answers is not "does the code run" but "is there a relationship here
// that Trajectory does not already give you". DSH's own Trajectory already shows tool input and
// output, so a plugin that merely displayed `command` would add nothing. What is being tested is
// whether the *declaration* can be lined up against extracted evidence, and — more importantly —
// where that lining-up has to stop.

const SESSION = 'session-audit'
let seq = 0
const nextSeq = () => (seq += 1)

/** A `tool/call` shaped like DSH's, with a real JSON-string `arguments`. */
function toolCall({ turn, step, name, capabilityId, args }) {
  const callId = `call_${turn}_${step}_${nextSeq()}`
  const call = {
    type: 'tool/call',
    seq: nextSeq(),
    time: 1790000000000 + nextSeq() * 10,
    data: { turn, step, callId, name, ...(args === undefined ? {} : { arguments: typeof args === 'string' ? args : JSON.stringify(args) }) },
  }
  const result = {
    type: 'tool/result',
    seq: nextSeq(),
    time: 1790000000000 + nextSeq() * 10,
    data: { message: { source: { callId }, isError: false } },
  }
  return [call, result]
}

/**
 * A Skill load as DSH actually records it: a `tool/call` whose tool name is `skill`.
 *
 * The declaration rides on `data.arguments` — the same field a normal tool call uses — which is
 * why this fixture writes it there rather than on a bespoke field.
 */
function skillInvocation({ turn, step, skillName }) {
  return {
    type: 'tool/call',
    seq: nextSeq(),
    time: 1790000000000 + nextSeq() * 10,
    data: {
      turn,
      step,
      callId: `skill-invocation:${turn}:${skillName}`,
      name: 'skill',
      arguments: JSON.stringify({ name: skillName, invocationType: 'model-invoked' }),
    },
  }
}

/** Build a receipt through the real reducer, so the events are DSH-shaped, not idealised. */
function receiptOf({ rawEvents, traces }) {
  const receipt = rebuildReceipt(SESSION, rawEvents, null)
  return { ...receipt, traceEvents: traces }
}

function declared({ turn, step, skillName, steps }) {
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

const relationshipOf = (alignment, title) => alignment.items.find((item) => item.title === title)?.relationship

// ---------------------------------------------------------------------------
// R-A1 / R-A2 — a recognised action command supports, a listing does not
// ---------------------------------------------------------------------------

test('R-A1: a recognised test command supports "run npm test"', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'npm test', description: 'Run the suite' } }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run npm test'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  assert.equal(relationshipOf(alignment, 'Run npm test'), 'runtime-supported')

  const item = alignment.items[0]
  assert.deepEqual(item.runtimeEvidence, [{ type: 'command', category: 'test' }])
  assert.equal(item.modelIntent.present, true)
  // Support is not success. The limitation has to say so, and it does.
  assert.ok(item.limitation.includes('不证明结果正确'))
})

test('R-A2: a directory listing does not support "run the tests"', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'pwd && ls', description: 'Confirm working directory' } }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  const relationship = relationshipOf(alignment, 'Run the tests')
  assert.notEqual(relationship, 'runtime-supported', 'a listing is not a test command however recent')
  // The command was recognised, so this is a capability-level correspondence — not intent.
  assert.equal(relationship, 'partial')
})

// ---------------------------------------------------------------------------
// R-A3 / R-A11 — the model's own description is a different kind of claim
// ---------------------------------------------------------------------------

test('R-A3: a description can only reach intent-supported', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'pwd && ls', description: 'Confirm working directory and root listing' } }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Inspect the project structure'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  // `inspect` is supported only by a query, never by a command — so the command cannot carry it.
  const relationship = relationshipOf(alignment, 'Inspect the project structure')
  assert.notEqual(relationship, 'runtime-supported')
  assert.equal(relationship, 'intent-supported')
  assert.equal(alignment.items[0].modelIntent.present, true)
  assert.ok(alignment.items[0].limitation.includes('不是 Runtime 事实'))
})

test('R-A11: a description never upgrades runtime evidence', () => {
  // Same description, one with a test command and one without. If the description were being
  // treated as a runtime fact, the second would support the step too.
  const withCommand = receiptOf({
    rawEvents: [skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }), ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'npm test', description: 'Run the test suite' } })],
    traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })],
  })
  const withoutCommand = receiptOf({
    rawEvents: [skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }), ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'echo hi', description: 'Run the test suite' } })],
    traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })],
  })
  assert.equal(relationshipOf(buildAlignment(withCommand, 'skill-a'), 'Run the tests'), 'runtime-supported')
  assert.notEqual(relationshipOf(buildAlignment(withoutCommand, 'skill-a'), 'Run the tests'), 'runtime-supported',
    'the description said "Run the test suite" and that must not be enough on its own')
})

// ---------------------------------------------------------------------------
// R-A4 — a file target cannot name the declared object
// ---------------------------------------------------------------------------

test('R-A4: reading a file is partial — the path is deliberately not kept', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'read', capabilityId: 'tool', args: { file_path: 'src/auth/index.ts' } }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Inspect the auth module'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  // The evidence knows a source file was read. It does not know *which*, because keeping the
  // path would mean persisting project content — so "the declared module was read" is not
  // something this model can say.
  assert.equal(relationshipOf(alignment, 'Inspect the auth module'), 'partial')
  assert.deepEqual(alignment.items[0].runtimeEvidence, [{ type: 'file-target', category: 'source-file' }])
})

// ---------------------------------------------------------------------------
// R-A5 / R-A6 / R-A7 — attribution limits are unchanged by this round
// ---------------------------------------------------------------------------

test('R-A6: two Skills in one turn share no evidence', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    skillInvocation({ turn: 2, step: 2, skillName: 'skill-b' }),
    ...toolCall({ turn: 2, step: 3, name: 'bash', capabilityId: 'cli', args: { command: 'npm test' } }),
  ]
  const traces = [
    declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] }),
    declared({ turn: 2, step: 2, skillName: 'skill-b', steps: ['Run the tests'] }),
  ]
  const receipt = receiptOf({ rawEvents, traces })
  for (const name of ['skill-a', 'skill-b']) {
    const alignment = buildAlignment(receipt, name)
    assert.equal(alignment.scope.established, false, `${name} must not claim a shared turn`)
    assert.ok(['insufficient', 'unknown'].includes(relationshipOf(alignment, 'Run the tests')))
  }
})

test('R-A7: a later turn is not weaker evidence, it is no evidence', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 3, step: 1, name: 'bash', capabilityId: 'cli', args: { command: 'npm test' } }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  assert.equal(relationshipOf(alignment, 'Run the tests'), 'insufficient')
})

// ---------------------------------------------------------------------------
// R-A8 / R-A9 — the seam tolerates whatever the runtime actually sends
// ---------------------------------------------------------------------------

test('R-A8: missing arguments keep the previous behaviour', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli' }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  assert.equal(relationshipOf(alignment, 'Run the tests'), 'partial')
  assert.equal(alignment.items[0].modelIntent.present, false)
})

test('R-A9: malformed arguments do not throw and do not fabricate evidence', () => {
  for (const bad of ['{not json', '', 'null', '[1,2]', 42, null, undefined, { command: 5 }]) {
    const result = extractRuntimeEvidence({ name: 'bash', capabilityId: 'cli', arguments: bad })
    assert.equal(result.evidenceType, 'command', `input ${JSON.stringify(bad)} must still classify`)
    assert.equal(result.specific, false, `input ${JSON.stringify(bad)} must not claim specificity`)
    assert.equal(result.modelIntent.present, false)
  }
  assert.equal(parseArguments('{not json'), null)
  assert.equal(parseArguments(null), null)
  assert.equal(classifyCommand(undefined), 'other')

  // And through a real receipt: the call still produces a runtime event.
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: '{not json' }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  assert.equal(relationshipOf(alignment, 'Run the tests'), 'partial')
})

// ---------------------------------------------------------------------------
// R-A10 — privacy: the raw value must not survive extraction
// ---------------------------------------------------------------------------

test('R-A10: raw arguments never reach the evidence, the event or the receipt', () => {
  const secret = 'AKIA-SECRET-TOKEN-9f3'
  const args = { command: `npm test --token ${secret}`, description: `Run the suite with ${secret}`, file_path: `/Users/someone/private/${secret}.ts` }

  // 1. The extraction seam returns categories and booleans only.
  const evidence = extractRuntimeEvidence({ name: 'bash', capabilityId: 'cli', arguments: JSON.stringify(args) })
  const evidenceText = JSON.stringify(evidence)
  assert.ok(!evidenceText.includes(secret), 'the secret survived extraction')
  assert.ok(!evidenceText.includes('npm test'), 'the command survived extraction')
  assert.ok(!evidenceText.includes('Run the suite'), 'the description survived extraction')

  // 2. It does not reach the runtime event, and therefore not the receipt either.
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })] })
  const receiptText = JSON.stringify({ runtimeEvents: receipt.runtimeEvents, traceEvents: receipt.traceEvents })
  assert.ok(!receiptText.includes(secret), 'the secret reached the receipt')
  assert.ok(!receiptText.includes('npm test'), 'the command reached the receipt')
  assert.ok(!receiptText.includes('Run the suite'), 'the description reached the receipt')

  // 3. Nor the alignment payload.
  const alignmentText = JSON.stringify(buildAlignment(receipt, 'skill-a'))
  assert.ok(!alignmentText.includes(secret), 'the secret reached the alignment')
  assert.ok(!alignmentText.includes('Run the suite'), 'the description reached the alignment')
})

// ---------------------------------------------------------------------------
// R-A12 — support is not success
// ---------------------------------------------------------------------------

test('R-A12: runtime-supported does not become "the Skill executed correctly"', () => {
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'npm test', description: 'Run the suite' } }),
  ]
  const receipt = receiptOf({ rawEvents, traces: [declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] })] })
  const alignment = buildAlignment(receipt, 'skill-a')
  assert.equal(alignment.scored, false)
  const text = JSON.stringify(alignment)
  // Field names are checked as *names*, not as substrings of the whole payload. `scored: false`
  // is the flag that says no score exists, and a raw substring check flags the flag itself —
  // exactly the collision `test/phase9-skill-runtime-scope.test.mjs` already documents. A field
  // genuinely named `score` is still caught, because no key in the payload equals these.
  const declaredKeys = new Set()
  const collectKeys = (value) => {
    if (Array.isArray(value)) {
      for (const entry of value) collectKeys(entry)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      declaredKeys.add(key)
      collectKeys(nested)
    }
  }
  collectKeys(alignment)
  for (const forbidden of ['complianceRate', 'followedRate', 'successRate', 'passRate', 'percentage', 'ranking', 'score']) {
    assert.ok(!declaredKeys.has(forbidden), `alignment exposes ${forbidden}`)
  }
  // The vocabulary must not contain a word that asserts the run went well.
  for (const forbidden of ['执行成功', 'Skill 遵循', '已完成', '正确执行']) {
    assert.ok(!text.includes(forbidden), `alignment claims ${forbidden}`)
  }
  assert.ok(alignment.items[0].limitation.length > 0)
})

test('multiple loads are separate runs — scope union does not merge them', async () => {
  const { buildSkillRuntimeScopes, skillRunsFor } = await import('../src/core/skill-runtime-scope.mjs')
  const rawEvents = [
    skillInvocation({ turn: 2, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'npm test' } }),
    skillInvocation({ turn: 9, step: 1, skillName: 'skill-a' }),
    ...toolCall({ turn: 9, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'pwd && ls' } }),
  ]
  const traces = [
    declared({ turn: 2, step: 1, skillName: 'skill-a', steps: ['Run the tests'] }),
    { ...declared({ turn: 9, step: 1, skillName: 'skill-a', steps: ['Run the tests'] }), eventId: `${SESSION}:invocation:9:1` },
  ]
  const receipt = receiptOf({ rawEvents, traces })
  const built = buildSkillRuntimeScopes(receipt)
  const { runs } = skillRunsFor(built, 'skill-a')
  assert.equal(runs.length, 2, 'two loads are two runs, not one merged scope')
  assert.notEqual(runs[0].turn, runs[1].turn)
  assert.equal(runs[0].runId, 'skill-a#1')
  assert.equal(runs[1].runId, 'skill-a#2')
  // The runs must not share events — that is the whole point of separating them.
  const first = new Set(runs[0].eventIds)
  for (const id of runs[1].eventIds) assert.ok(!first.has(id), `${id} appears in both runs`)
})
