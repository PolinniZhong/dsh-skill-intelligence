import test from 'node:test'
import assert from 'node:assert/strict'
import { skillEvidenceSignature } from '../src/dsh/host/index.js'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// Host write policy.
//
// Skill evidence must be durable the moment it is observed. The runtime event
// stream must not be: it is derived evidence that a turn boundary or any later
// rebuild reproduces from the durable session log, and a settled invocation costs
// two normalized events. Writing the whole receipt on every tool event would
// rewrite one growing file hundreds of times per session.
//
// These tests pin the boundary between the two.

const sessionId = 'session-write-policy'

function reduceAll(events) {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return receipt
}

const CATALOG = {
  type: 'user/message',
  seq: 5,
  time: 1005,
  data: {
    content: [{ type: 'text', text: '<system-reminder/>' }],
    source: { kind: 'skill-catalog', form: 'catalog', entries: [{ name: 'a-skill', description: 'A.' }] },
    role: 'user',
    id: 'm5',
  },
}

const SKILL_CALL = {
  type: 'tool/call',
  seq: 10,
  time: 1010,
  data: { turn: 1, step: 1, callId: 'call-skill', name: 'skill', arguments: '{"name":"a-skill"}' },
}

function skillResult({ seq = 11 } = {}) {
  return {
    type: 'tool/result',
    seq,
    time: 1000 + seq,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId: 'call-skill' },
        toolCallId: 'call-skill',
        content: [{ type: 'text', text: '<skill_content name="a-skill">\n<skill_instructions>\n1. One\n</skill_instructions>\n</skill_content>' }],
        isError: false,
        id: 'm11',
      },
    },
  }
}

const BASH_CALL = {
  type: 'tool/call',
  seq: 20,
  time: 1020,
  data: { turn: 1, step: 1, callId: 'call-bash', name: 'bash', arguments: '{"command":"ls"}' },
}

const BASH_RESULT = {
  type: 'tool/result',
  seq: 21,
  time: 1021,
  data: {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      source: { kind: 'tool', callId: 'call-bash' },
      toolCallId: 'call-bash',
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
      id: 'm21',
    },
  },
}

const SKILL_INVOCATION = {
  type: 'user/message',
  seq: 30,
  time: 1030,
  data: {
    content: [{ type: 'text', text: '<skill_content name="b-skill">\n<skill_instructions>\n1. Two\n</skill_instructions>\n</skill_content>' }],
    source: { kind: 'skill-invocation', name: 'b-skill', form: 'instructions' },
    role: 'user',
    id: 'm30',
  },
}

test('an empty receipt has a stable signature', () => {
  const receipt = emptyReceipt(sessionId, 1)
  assert.equal(skillEvidenceSignature(receipt), skillEvidenceSignature(emptyReceipt(sessionId, 2)))
})

test('opening a Skill load changes the signature', () => {
  const before = reduceAll([])
  const after = reduceSessionEvent(before, SKILL_CALL)
  assert.notEqual(skillEvidenceSignature(after), skillEvidenceSignature(before))
})

test('settling a Skill load changes the signature', () => {
  const opened = reduceSessionEvent(reduceAll([]), SKILL_CALL)
  const settled = reduceSessionEvent(opened, skillResult())
  assert.equal(opened.traceEvents[0].status, 'requested')
  assert.equal(settled.traceEvents[0].status, 'loaded')
  // Same number of traces, but the evidence is now real.
  assert.equal(settled.traceEvents.length, opened.traceEvents.length)
  assert.notEqual(skillEvidenceSignature(settled), skillEvidenceSignature(opened))
})

test('publishing or replacing the catalog changes the signature', () => {
  const before = reduceAll([])
  const published = reduceSessionEvent(before, CATALOG)
  assert.notEqual(skillEvidenceSignature(published), skillEvidenceSignature(before))
  const replaced = reduceSessionEvent(published, {
    ...CATALOG,
    seq: 6,
    data: { ...CATALOG.data, source: { ...CATALOG.data.source, update: true, entries: [{ name: 'b-skill', description: 'B.' }] } },
  })
  assert.notEqual(skillEvidenceSignature(replaced), skillEvidenceSignature(published))
})

test('a user-explicit load changes the signature', () => {
  const before = reduceAll([])
  const after = reduceSessionEvent(before, SKILL_INVOCATION)
  assert.notEqual(skillEvidenceSignature(after), skillEvidenceSignature(before))
})

test('a load that never resolves still changes the signature', () => {
  const opened = reduceSessionEvent(reduceAll([]), SKILL_CALL)
  const unresolved = reduceSessionEvent(opened, { type: 'turn/end', seq: 40, time: 1040, data: { turn: 1, reason: 'stop' } })
  assert.equal(unresolved.traceEvents[0].status, 'unresolved')
  assert.notEqual(skillEvidenceSignature(unresolved), skillEvidenceSignature(opened))
})

test('runtime-only evidence does NOT change the signature', () => {
  // This is the whole point: a CLI or Tool invocation is derived evidence and
  // must not force a receipt rewrite on every call.
  const before = reduceAll([])
  const called = reduceSessionEvent(before, BASH_CALL)
  assert.equal(called.runtimeEvents.length, 1)
  assert.equal(skillEvidenceSignature(called), skillEvidenceSignature(before))

  const settled = reduceSessionEvent(called, BASH_RESULT)
  assert.equal(settled.runtimeEvents.length, 2)
  assert.equal(skillEvidenceSignature(settled), skillEvidenceSignature(before))
})

test('a retry derivation does NOT change the signature', () => {
  const failed = {
    type: 'tool/result',
    seq: 21,
    time: 1021,
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId: 'call-bash' },
        toolCallId: 'call-bash',
        content: [{ type: 'text', text: 'failed' }],
        isError: true,
        id: 'm21',
      },
      error: { name: 'Error', code: 'TOOL_FAILED' },
    },
  }
  const first = reduceAll([BASH_CALL, failed])
  const retried = reduceSessionEvent(first, { ...BASH_CALL, seq: 22, time: 1022, data: { ...BASH_CALL.data, callId: 'call-bash-2' } })
  assert.equal(retried.runtimeEvents.some((event) => event.type === 'retry'), true)
  assert.equal(skillEvidenceSignature(retried), skillEvidenceSignature(first))
})

test('runtime evidence still reaches disk at a turn boundary', () => {
  // The signature gates per-event writes only; `turn/end` always syncs, so a
  // completed turn is never lost.
  const receipt = reduceAll([BASH_CALL, BASH_RESULT])
  assert.equal(receipt.runtimeEvents.length, 2)
  assert.equal(skillEvidenceSignature(receipt), skillEvidenceSignature(emptyReceipt(sessionId, 1)))
})
