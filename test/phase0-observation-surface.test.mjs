import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildViewModels,
  carriesSkillEvidence,
  classifyCapability,
  emptyReceipt,
  migrateReceipt,
  rebuildReceipt,
  reduceSessionEvent,
} from '../src/core/trace-reducer.mjs'
import { aggregateInvocations } from '../src/core/runtime-events.mjs'

// Phase 0 observation-surface contract.
//
// Every event shape below was captured from a real DSH session log
// (`session-638ac639-23f0-461b-9a0b-60f4d4cb7f18`, session format V4) and keeps
// the exact key set the runtime writes. Only the *content* is synthesised: the
// captured skill body embedded a local absolute path and the captured catalog
// described the operator's installed skills, neither of which belongs in a
// fixture that ships publicly.
//
// Two runtime facts these fixtures pin, because they are easy to get wrong:
//   1. `user/message` carries no `turn`/`step`, so attribution must come from
//      the log-order cursor set by the preceding `step/start`.
//   2. A V4 `tool/result` content block is `{type:'text'}`, not the retired V3
//      `tool-result` wrapper.

const sessionId = 'session-phase0'

const INSTRUCTION_BODY = [
  'Candidate instruction body that must never be persisted.',
  '1. Inspect the workspace',
  '2. Run the local check',
  '3. Review the diff',
].join('\n')

const SKILL_CONTENT = [
  '<skill_content name="phase0-skill">',
  '<skill_resources>',
  'Resources for this skill are managed by provider "filesystem".',
  'Load referenced resources only as needed.',
  '</skill_resources>',
  '',
  '<skill_instructions>',
  INSTRUCTION_BODY,
  '</skill_instructions>',
  '</skill_content>',
].join('\n')

function turnStart({ seq, turn }) {
  return { type: 'turn/start', seq, time: 1000 + seq, data: { turn } }
}

function stepStart({ seq, turn, step }) {
  return { type: 'step/start', seq, time: 1000 + seq, data: { turn, step } }
}

function stepEnd({ seq, turn, step }) {
  return { type: 'step/end', seq, time: 1000 + seq, data: { turn, step } }
}

// Real shape: data keys are exactly ['content','source','role','id'] — no turn/step.
function skillInvocationMessage({ seq = 30, name = 'phase0-skill', text = SKILL_CONTENT } = {}) {
  return {
    type: 'user/message',
    seq,
    time: 1000 + seq,
    data: {
      content: [{ type: 'text', text }],
      source: { kind: 'skill-invocation', name, form: 'instructions' },
      role: 'user',
      id: `message-${seq}`,
    },
  }
}

// Real shape: source keys are exactly ['kind','form','entries'].
function skillCatalogMessage({ seq = 20, entries, update = false } = {}) {
  const published = entries ?? [
    { name: 'phase0-skill', description: 'A bounded description for the fixture skill.' },
    { name: 'other-skill', description: 'Another published skill.' },
  ]
  return {
    type: 'user/message',
    seq,
    time: 1000 + seq,
    data: {
      content: [{ type: 'text', text: '<system-reminder>\n<available_skills>…</available_skills>\n</system-reminder>' }],
      source: { kind: 'skill-catalog', form: 'catalog', ...(update ? { update: true } : {}), entries: published },
      role: 'user',
      id: `message-${seq}`,
    },
  }
}

function toolCall({ seq = 40, callId = 'call-1', name = 'bash', turn = 1, step = 1, args = { command: 'npm test' } } = {}) {
  return {
    type: 'tool/call',
    seq,
    time: 1000 + seq,
    data: { turn, step, callId, name, arguments: JSON.stringify(args) },
  }
}

// Real V4 first-class tool message; content blocks are `{type:'text'}` only.
function toolResultMessage({ seq = 41, callId = 'call-1', turn = 1, step = 1, isError = false, error } = {}) {
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
        content: [{ type: 'text', text: isError ? 'command failed' : 'ok' }],
        isError,
        id: `message-${callId}`,
      },
      ...(error ? { error } : {}),
    },
  }
}

function reduceAll(events) {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return receipt
}

function runtimeOf(receipt) {
  return buildViewModels(receipt).receipt.runtime
}

function invocationOf(receipt, index = 0) {
  return aggregateInvocations(receipt.runtimeEvents)[index]
}

test('user-explicit invocation is recorded as observed evidence', () => {
  const receipt = reduceAll([turnStart({ seq: 10, turn: 3 }), stepStart({ seq: 11, turn: 3, step: 2 }), skillInvocationMessage()])
  assert.equal(receipt.traceEvents.length, 1)
  const trace = receipt.traceEvents[0]
  assert.equal(trace.skillName, 'phase0-skill')
  assert.equal(trace.status, 'loaded')
  assert.equal(trace.invocationType, 'user-explicit')
  assert.equal(trace.consumer, 'skill-invocation')
  assert.equal(trace.coverage, 'observed-injection-source')
  // The user path has no tool call, so no callId may be invented for it.
  assert.equal(trace.callId, null)
  assert.equal(trace.evidenceFingerprint.scope, 'skill-instructions')
  assert.match(trace.evidenceFingerprint.value, /^sha256:[a-f0-9]{64}$/)
})

test('user-explicit turns are attributed by log order, not by timestamp', () => {
  const receipt = reduceAll([turnStart({ seq: 10, turn: 3 }), stepStart({ seq: 11, turn: 3, step: 2 }), skillInvocationMessage({ seq: 12 })])
  const trace = receipt.traceEvents[0]
  assert.equal(trace.turn, 3)
  assert.equal(trace.step, 2)
})

test('both load paths yield the same fingerprint for the same instruction body', () => {
  const modelPath = reduceAll([
    toolCall({ seq: 40, callId: 'call-skill', name: 'skill', args: { name: 'phase0-skill' } }),
    toolResultMessage({ seq: 41, callId: 'call-skill' }),
  ])
  // The model path reads INSTRUCTION_BODY from a real V4 skill tool result.
  const skillResult = toolResultMessage({ seq: 41, callId: 'call-skill' })
  skillResult.data.message.content = [{ type: 'text', text: SKILL_CONTENT }]
  const model = reduceAll([
    toolCall({ seq: 40, callId: 'call-skill', name: 'skill', args: { name: 'phase0-skill' } }),
    skillResult,
  ])
  const user = reduceAll([skillInvocationMessage({ seq: 50 })])

  assert.equal(model.traceEvents[0].status, 'loaded')
  assert.equal(user.traceEvents[0].status, 'loaded')
  assert.equal(model.traceEvents[0].evidenceFingerprint.value, user.traceEvents[0].evidenceFingerprint.value)
  assert.deepEqual(
    model.continuity.steps.map((item) => item.title),
    user.continuity.steps.map((item) => item.title),
  )
  assert.equal(modelPath.traceEvents.length, 1)
})

test('user-explicit candidate steps surface in the view models', () => {
  const receipt = reduceAll([skillInvocationMessage()])
  const views = buildViewModels(receipt)
  assert.deepEqual(views.receipt.learningCards[0].steps.map((item) => item.title), [
    'Inspect the workspace',
    'Run the local check',
    'Review the diff',
  ])
  assert.equal(views.receipt.runtime.invocationTypes['user-explicit'], 1)
  assert.equal(views.receipt.runtime.invocationTypes['model-invoked'], 0)
})

test('an unusable invocation name is ignored rather than guessed', () => {
  const bad = skillInvocationMessage()
  bad.data.source.name = '../escape'
  const receipt = reduceAll([bad])
  assert.deepEqual(receipt.traceEvents, [])
})

test('published catalog becomes the declaration baseline', () => {
  const receipt = reduceAll([stepStart({ seq: 11, turn: 1, step: 1 }), skillCatalogMessage({ seq: 12 })])
  const catalog = receipt.catalogPublished
  assert.equal(catalog.entryCount, 2)
  assert.equal(catalog.update, false)
  assert.equal(catalog.turn, 1)
  assert.equal(catalog.step, 1)
  assert.match(catalog.entriesDigest, /^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(catalog.entries.map((item) => item.name), ['phase0-skill', 'other-skill'])
  assert.equal(receipt.catalogPublicationCount, 1)
})

test('a replacement catalog supersedes and is counted', () => {
  let receipt = reduceAll([skillCatalogMessage({ seq: 12 })])
  const firstDigest = receipt.catalogPublished.entriesDigest
  receipt = reduceSessionEvent(receipt, skillCatalogMessage({
    seq: 13,
    update: true,
    entries: [{ name: 'replacement-skill', description: 'Replaces the earlier list.' }],
  }))
  assert.equal(receipt.catalogPublished.update, true)
  assert.equal(receipt.catalogPublicationCount, 2)
  assert.deepEqual(receipt.catalogPublished.entries.map((item) => item.name), ['replacement-skill'])
  assert.notEqual(receipt.catalogPublished.entriesDigest, firstDigest)
})

test('catalog entries are bounded and unusable names are dropped', () => {
  const long = 'x'.repeat(900)
  const receipt = reduceAll([skillCatalogMessage({
    entries: [
      { name: 'good-skill', description: long },
      { name: '../bad', description: 'not a skill name' },
      { name: '', description: 'empty' },
      null,
    ],
  })])
  assert.equal(receipt.catalogPublished.entryCount, 1)
  assert.equal(receipt.catalogPublished.entries[0].name, 'good-skill')
  assert.ok(receipt.catalogPublished.entries[0].description.length <= 300)
})

test('non-skill tool invocations are kept as bounded runtime evidence', () => {
  const receipt = reduceAll([toolCall({ seq: 40, name: 'bash' }), toolResultMessage({ seq: 41 })])
  // One normalized request plus one normalized result, paired into one invocation.
  assert.deepEqual(receipt.runtimeEvents.map((event) => event.type), ['invocation.request', 'invocation.result'])
  assert.equal(receipt.runtimeEvents.every((event) => event.source === 'dsh'), true)
  const invocation = invocationOf(receipt)
  assert.equal(invocation.invocationId, 'call-1')
  assert.equal(invocation.kind, 'cli')
  assert.equal(invocation.name, 'bash')
  assert.equal(invocation.status, 'success')
  assert.equal(invocation.evidenceState, 'observed')
  assert.equal(invocation.resolution, 'matched')
  assert.equal(invocation.durationMs, 1)
  assert.equal(invocation.turn, 1)
  assert.equal(invocation.step, 1)
})

test('capability classification is deterministic and bounded', () => {
  assert.deepEqual(classifyCapability('bash'), { capability: 'cli', capabilityName: 'bash', detail: null })
  assert.deepEqual(classifyCapability('pwsh-persistent'), { capability: 'cli', capabilityName: 'pwsh-persistent', detail: null })
  assert.deepEqual(classifyCapability('read'), { capability: 'tool', capabilityName: 'read', detail: null })
  assert.deepEqual(classifyCapability('skill'), { capability: 'skill', capabilityName: 'skill', detail: null })
  assert.deepEqual(classifyCapability('subagent'), { capability: 'subagent', capabilityName: 'subagent', detail: null })
  // MCP tools are the registered `mcp__<server>__<rawName>` form.
  assert.deepEqual(classifyCapability('mcp__github__get_pull_request'), {
    capability: 'mcp',
    capabilityName: 'github',
    detail: 'get_pull_request',
  })
  // Anything unusable is rejected rather than mislabelled.
  assert.equal(classifyCapability(''), null)
  assert.equal(classifyCapability('has space'), null)
  assert.equal(classifyCapability(undefined), null)
})

test('a failed tool result carries only a bounded error category', () => {
  const receipt = reduceAll([
    toolCall({ seq: 40, callId: 'call-x', name: 'edit' }),
    toolResultMessage({ seq: 41, callId: 'call-x', isError: true, error: { name: 'Error', code: 'TOOL_FAILED', reason: 'private failure text' } }),
  ])
  const invocation = invocationOf(receipt)
  assert.equal(invocation.status, 'failure')
  assert.equal(invocation.evidenceState, 'partial')
  assert.equal(invocation.errorCode, 'TOOL_FAILED')
  assert.equal(JSON.stringify(receipt).includes('private failure text'), false)
})

test('an unpaired call stays requested instead of being completed by guesswork', () => {
  const receipt = reduceAll([toolCall({ seq: 40, callId: 'call-orphan', name: 'bash' })])
  const invocation = invocationOf(receipt)
  assert.equal(invocation.status, 'requested')
  assert.equal(invocation.evidenceState, 'requested')
  assert.equal(invocation.resolution, 'unresolved-request')
  assert.equal(invocation.endedAt, null)
  assert.equal(invocation.durationMs, null)
})

test('a second result for the same call does not overwrite settled evidence', () => {
  let receipt = reduceAll([toolCall({ seq: 40, callId: 'call-1', name: 'bash' }), toolResultMessage({ seq: 41 })])
  receipt = reduceSessionEvent(receipt, toolResultMessage({ seq: 42, isError: true, error: { name: 'Error', code: 'TOOL_FAILED' } }))
  const invocation = invocationOf(receipt)
  assert.equal(invocation.status, 'success')
  assert.equal(invocation.resultEventId, `${sessionId}:re:41`)
})

test('runtime events never capture tool arguments or result content', () => {
  const receipt = reduceAll([
    toolCall({ seq: 40, callId: 'call-1', name: 'bash', args: { command: 'curl -H "Authorization: Bearer sk-secret-value" https://example.test' } }),
    toolResultMessage({ seq: 41 }),
  ])
  const serialized = JSON.stringify(receipt)
  assert.equal(serialized.includes('sk-secret-value'), false)
  assert.equal(serialized.includes('Authorization'), false)
  assert.equal(serialized.includes('curl'), false)
  assert.equal(serialized.includes('arguments'), false)
  // And the skill body is never persisted on either path.
  const withSkill = reduceAll([skillInvocationMessage()])
  assert.equal(JSON.stringify(withSkill).includes('Candidate instruction body'), false)
})

test('the runtime projection reports counts and truncation honestly', () => {
  const events = []
  for (let index = 0; index < 2005; index += 1) {
    events.push(toolCall({ seq: 100 + index, callId: `call-${index}`, name: 'bash' }))
  }
  const receipt = reduceAll(events)
  assert.equal(receipt.runtimeEvents.length, 2000)
  assert.equal(receipt.runtimeEventOverflow, 5)
  const runtime = runtimeOf(receipt)
  assert.equal(runtime.eventCount, 2000)
  assert.equal(runtime.overflow, 5)
  assert.equal(runtime.byCapability.cli, 2000)
  assert.equal(runtime.byResolution['unresolved-request'], 2000)
})

test('skill invocations still count once in both surfaces', () => {
  const receipt = reduceAll([
    toolCall({ seq: 40, callId: 'call-skill', name: 'skill', args: { name: 'phase0-skill' } }),
    toolResultMessage({ seq: 41, callId: 'call-skill' }),
  ])
  assert.equal(receipt.traceEvents.length, 1)
  assert.equal(receipt.runtimeEvents.length, 2)
  const invocation = invocationOf(receipt)
  assert.equal(invocation.kind, 'skill')
  assert.equal(invocation.invocationType, 'model-invoked')
  assert.equal(receipt.traceEvents[0].invocationType, 'model-invoked')
})

test('migration keeps the model path label and upgrades legacy runtime rows', () => {
  const legacy = {
    ...emptyReceipt(sessionId, 1),
    schemaVersion: 6,
    traceEvents: [{ eventId: 'legacy:1', sessionId, skillName: 'legacy-skill', status: 'loaded', callId: 'call-legacy' }],
    // Phase 0 stored one paired row per invocation; Phase 1 stores request + result.
    runtimeEvents: [{ callId: 'call-a', capability: 'cli', name: 'bash', status: 'success', turn: 2, step: 1, callSeq: 5, resultSeq: 6, startedAt: 100, endedAt: 140 }],
    runtimeEventOverflow: 3,
    catalogPublished: { entries: [{ name: 'legacy-skill', description: 'kept' }], entryCount: 1 },
    catalogPublicationCount: 2,
  }
  const receipt = migrateReceipt(legacy, sessionId)
  assert.equal(receipt.schemaVersion, 7)
  assert.equal(receipt.traceEvents[0].invocationType, 'model-invoked')
  assert.deepEqual(receipt.runtimeEvents.map((event) => event.type), ['invocation.request', 'invocation.result'])
  assert.equal(receipt.runtimeEventOverflow, 3)
  assert.equal(receipt.catalogPublished.entries[0].name, 'legacy-skill')
  assert.equal(receipt.catalogPublicationCount, 2)
  const invocation = invocationOf(receipt)
  assert.equal(invocation.kind, 'cli')
  assert.equal(invocation.durationMs, 40)
})

test('a rebuild reproduces the whole Phase 0 surface from the log', () => {
  const events = [
    turnStart({ seq: 10, turn: 1 }),
    stepStart({ seq: 11, turn: 1, step: 1 }),
    skillCatalogMessage({ seq: 12 }),
    toolCall({ seq: 13, callId: 'call-bash', name: 'bash' }),
    toolResultMessage({ seq: 14, callId: 'call-bash' }),
    skillInvocationMessage({ seq: 15 }),
    stepEnd({ seq: 16, turn: 1, step: 1 }),
  ]
  const receipt = rebuildReceipt(sessionId, events, null)
  assert.equal(receipt.runtimeEvents.length, 3)
  assert.equal(receipt.catalogPublished.entryCount, 2)
  assert.equal(receipt.traceEvents.length, 1)
  assert.equal(receipt.traceEvents[0].invocationType, 'user-explicit')
  assert.equal(receipt.traceEvents[0].turn, 1)
  const runtime = runtimeOf(receipt)
  assert.equal(runtime.invocationCount, 2)
  // The invocation list is not projected to the client; read it from the model.
  const invocations = aggregateInvocations(receipt.runtimeEvents)
  assert.deepEqual(invocations.map((item) => item.kind).sort(), ['cli', 'skill'])
  // Only a Skill load carries an invocationType; a CLI call has no such axis.
  assert.deepEqual(
    invocations.filter((item) => item.kind === 'skill').map((item) => item.invocationType),
    ['user-explicit'],
  )
  assert.deepEqual(
    invocations.filter((item) => item.kind !== 'skill').map((item) => item.invocationType),
    [null],
  )
  // A rebuild must be stable: the same log yields the same facts.
  const again = rebuildReceipt(sessionId, events, null)
  assert.deepEqual(again.runtimeEvents, receipt.runtimeEvents)
  assert.equal(again.catalogPublished.entriesDigest, receipt.catalogPublished.entriesDigest)
})

test('only the two Skill source kinds are treated as Skill evidence', () => {
  assert.equal(carriesSkillEvidence(skillInvocationMessage()), true)
  assert.equal(carriesSkillEvidence(skillCatalogMessage()), true)
  assert.equal(carriesSkillEvidence({ type: 'user/message', data: { source: { kind: 'user' } } }), false)
  assert.equal(carriesSkillEvidence({ type: 'user/message', data: { source: { kind: 'runtime-context' } } }), false)
  assert.equal(carriesSkillEvidence(toolCall()), false)
  assert.equal(carriesSkillEvidence(undefined), false)
})
