import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyReceipt, reduceSessionEvent, buildViewModels } from '../src/core/trace-reducer.mjs'

// Contract regression for the DSH session-format V3 -> V4 tool-result migration.
//
// V3 wrapped a tool result in exactly one `tool-result` block inside a `user`
// message. V4 lifts it into a first-class `tool` message and retires the
// wrapper, so `content` holds the result's own blocks and `toolCallId` /
// `isError` move onto the message. See the runtime migration
// `dsh-session-format-v3-to-v4` ("Lift one released-V3 wrapper tool/result row
// into the first-class V4 message").
//
// The reducer previously recognized only the V3 wrapper. On V4 it therefore
// returned no result content at all while still reporting `loaded`, which
// silently emptied the instruction fingerprint, the candidate steps, and
// version-drift detection. The fixtures below are built from an actual V4 event
// captured from `session.v4.jsonl`, so this file fails if either the V3
// spelling or the V4 spelling stops being read.

const V4_CONTENT_TEXT = [
  '<skill_content name="v4-skill">',
  '<skill_resources>',
  'Resources for this skill are managed by provider "filesystem".',
  'Load referenced resources only as needed.',
  '</skill_resources>',
  '',
  '<skill_instructions>',
  'Secret paragraph must never persist.',
  '1. Check the input',
  '2. Run the local script',
  '3. Review the result with the model',
  '</skill_instructions>',
  '</skill_content>',
].join('\n')

// A first-class V4 tool message: exactly the keys the runtime writes
// (`role`, `source`, `toolCallId`, `content`, `isError`, `id`), with content
// blocks carrying only `type` and `text`, and no `tool-result` wrapper.
function v4SkillResult({ seq = 11, callId = 'call-v4', failed = false } = {}) {
  return {
    type: 'tool/result',
    seq,
    time: 1000 + seq,
    data: {
      turn: 1,
      step: 2,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId },
        toolCallId: callId,
        content: [{ type: 'text', text: failed ? 'private error result' : V4_CONTENT_TEXT }],
        isError: failed,
        id: `message-${callId}`,
      },
      ...(failed ? { error: { name: 'Error', code: 'SKILL_NOT_FOUND', reason: 'private error text' } } : {}),
    },
  }
}

// The retired V3 shape, kept to prove the migration fix is backward compatible.
function v3SkillResult({ seq = 11, callId = 'call-v3', failed = false } = {}) {
  return {
    type: 'tool/result',
    seq,
    time: 1000 + seq,
    data: {
      turn: 1,
      step: 2,
      message: {
        role: 'user',
        source: { kind: 'tool', callId },
        content: [{
          type: 'tool-result',
          toolCallId: callId,
          isError: failed,
          content: [{ type: 'text', text: failed ? 'private error result' : V4_CONTENT_TEXT }],
        }],
        id: `message-${callId}`,
      },
      ...(failed ? { error: { name: 'Error', code: 'SKILL_NOT_FOUND', reason: 'private error text' } } : {}),
    },
  }
}

function skillCall({ seq = 10, callId, name = 'v4-skill' } = {}) {
  return {
    type: 'tool/call',
    seq,
    time: 1000 + seq,
    data: { turn: 1, step: 2, callId, name: 'skill', arguments: JSON.stringify({ name, prompt: 'must never persist' }) },
  }
}

function reduceAll(events) {
  let receipt = emptyReceipt('session-format-contract', 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return receipt
}

test('the V4 fixture carries no retired tool-result wrapper', () => {
  const result = v4SkillResult()
  const content = result.data.message.content
  assert.equal(Array.isArray(content), true)
  assert.equal(content.length, 1)
  assert.equal(content[0].type, 'text')
  assert.equal(content.some((block) => block.type === 'tool-result'), false)
  // V4 moves these off the retired wrapper and onto the message itself.
  assert.equal(result.data.message.role, 'tool')
  assert.equal(result.data.message.toolCallId, 'call-v4')
  assert.equal(result.data.message.isError, false)
})

test('reads evidence from the first-class V4 tool message', () => {
  const receipt = reduceAll([skillCall({ callId: 'call-v4' }), v4SkillResult()])
  assert.equal(receipt.traceEvents.length, 1)
  const trace = receipt.traceEvents[0]
  assert.equal(trace.skillName, 'v4-skill')
  assert.equal(trace.status, 'loaded')
  assert.equal(trace.resultSeq, 11)
  assert.ok(trace.evidenceFingerprint, 'V4 result must produce an instruction fingerprint')
  assert.equal(trace.evidenceFingerprint.scope, 'skill-instructions')
  assert.match(trace.evidenceFingerprint.value, /^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(
    receipt.continuity.steps.map((item) => item.title),
    ['Check the input', 'Run the local script', 'Review the result with the model'],
  )
})

test('projects V4-sourced candidate steps into the receipt and map views', () => {
  const receipt = reduceAll([skillCall({ callId: 'call-v4' }), v4SkillResult()])
  const views = buildViewModels(receipt)
  assert.equal(views.receipt.learningCards.length, 1)
  const card = views.receipt.learningCards[0]
  assert.equal(card.skillName, 'v4-skill')
  assert.deepEqual(
    card.steps.map((item) => item.title),
    ['Check the input', 'Run the local script', 'Review the result with the model'],
  )
  assert.equal(card.evidenceState, 'structured-candidate')
  assert.equal(views.map.nodes.methods.length, 1)
})

test('still reads the retired V3 wrapper shape', () => {
  const receipt = reduceAll([skillCall({ callId: 'call-v3' }), v3SkillResult()])
  const trace = receipt.traceEvents[0]
  assert.equal(trace.status, 'loaded')
  assert.equal(trace.evidenceFingerprint.scope, 'skill-instructions')
  assert.equal(receipt.continuity.steps.length, 3)
})

test('V4 failure identity comes from the message and its error payload', () => {
  const receipt = reduceAll([skillCall({ callId: 'call-v4' }), v4SkillResult({ failed: true })])
  const trace = receipt.traceEvents[0]
  assert.equal(trace.status, 'failed')
  assert.equal(trace.errorCode, 'SKILL_NOT_FOUND')
  assert.equal(trace.evidenceFingerprint, null)
  assert.deepEqual(receipt.continuity.steps, [])
})

test('V3 and V4 produce the same evidence for the same skill body', () => {
  const v4 = reduceAll([skillCall({ callId: 'call-v4' }), v4SkillResult()])
  const v3 = reduceAll([skillCall({ callId: 'call-v3' }), v3SkillResult()])
  assert.equal(v4.traceEvents[0].evidenceFingerprint.value, v3.traceEvents[0].evidenceFingerprint.value)
  assert.deepEqual(
    v4.continuity.steps.map((item) => item.title),
    v3.continuity.steps.map((item) => item.title),
  )
})

test('V4 stays empty rather than inventing evidence when content is absent', () => {
  const broken = v4SkillResult()
  broken.data.message.content = []
  const receipt = reduceAll([skillCall({ callId: 'call-v4' }), broken])
  // A load with no readable content is still reported as loaded, but it must
  // not fabricate a fingerprint or candidate steps.
  assert.equal(receipt.traceEvents[0].status, 'loaded')
  assert.equal(receipt.traceEvents[0].evidenceFingerprint, null)
  assert.deepEqual(receipt.continuity.steps, [])
})

test('never persists the V4 instruction body or the tool arguments', () => {
  const receipt = reduceAll([skillCall({ callId: 'call-v4' }), v4SkillResult()])
  const serialized = JSON.stringify(receipt)
  assert.equal(serialized.includes('Secret paragraph'), false)
  assert.equal(serialized.includes('must never persist'), false)
  assert.equal(serialized.includes('v4-skill'), true)
})
