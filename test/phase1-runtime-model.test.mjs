import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RETRY_RULE,
  RUNTIME_EVENT_LIMIT,
  aggregateInvocations,
  classifyCapability,
  deriveRetryEvent,
  normalizeRequest,
  normalizeResult,
  normalizeSkillInvocation,
  summarizeRuntime,
  upgradeRuntimeEvents,
} from '../src/core/runtime-events.mjs'
import { buildViewModels, emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// Phase 1 contract: the normalized RuntimeEvent model and the Invocation
// aggregator (SDD §4–5).
//
// The two properties worth defending here are:
//   1. `source` separates host fact from plugin derivation, and a derived event
//      is only ever appended — it never rewrites a `dsh` event.
//   2. Aggregation pairs strictly by `invocationId`. Adjacency and timestamps
//      are never used, so a half-observed call is reported as half-observed
//      instead of being completed with the nearest available event.

const sessionId = 'session-phase1'

function callEvent({ seq, callId, name = 'bash', turn = 1, step = 1, time }) {
  return {
    type: 'tool/call',
    seq,
    time: time ?? 1000 + seq,
    data: { turn, step, callId, name, arguments: '{"command":"ignored"}' },
  }
}

function resultEvent({ seq, callId, isError = false, code, turn = 1, step = 1, time }) {
  return {
    type: 'tool/result',
    seq,
    time: time ?? 1000 + seq,
    data: {
      turn,
      step,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId },
        toolCallId: callId,
        content: [{ type: 'text', text: 'ignored' }],
        isError,
        id: `message-${callId}`,
      },
      ...(code ? { error: { name: 'Error', code } } : {}),
    },
  }
}

function normalize(events) {
  const out = []
  for (const event of events) {
    const context = { sessionId, turn: event.data?.turn ?? 1, step: event.data?.step ?? 1 }
    if (event.type === 'tool/call') {
      const normalized = normalizeRequest(event, context)
      if (normalized) out.push(normalized)
      continue
    }
    if (event.type === 'tool/result') {
      const normalized = normalizeResult(event, {
        ...context,
        capabilityOf: (callId) => {
          const request = out.find((item) => item.type === 'invocation.request' && item.invocationId === callId)
          return request?.capabilityId
            ? { capability: request.capabilityId, capabilityName: request.capabilityName, detail: request.detail ?? null }
            : null
        },
      })
      if (normalized) out.push(normalized)
    }
  }
  return out
}

test('a request normalizes into a citeable dsh event', () => {
  const [event] = normalize([callEvent({ seq: 42, callId: 'call-1' })])
  assert.equal(event.eventId, `${sessionId}:re:42`)
  assert.equal(event.type, 'invocation.request')
  assert.equal(event.source, 'dsh')
  assert.equal(event.status, 'requested')
  assert.equal(event.capabilityId, 'cli')
  assert.equal(event.capabilityName, 'bash')
  assert.equal(event.invocationId, 'call-1')
  assert.equal(event.turn, 1)
  assert.equal(event.step, 1)
  assert.equal(event.timestamp, 1042)
})

test('a result takes its capability from the request that opened it', () => {
  const events = normalize([callEvent({ seq: 10, callId: 'call-a', name: 'mcp__github__get_pr' }), resultEvent({ seq: 11, callId: 'call-a' })])
  const result = events[1]
  assert.equal(result.type, 'invocation.result')
  assert.equal(result.status, 'success')
  // The result event itself carries no tool name; the capability is inherited.
  assert.equal(result.capabilityId, 'mcp')
  assert.equal(result.capabilityName, 'github')
  assert.equal(result.detail, 'get_pr')
})

test('a result with no observable request does not claim a capability', () => {
  const events = normalize([resultEvent({ seq: 11, callId: 'call-orphan' })])
  assert.equal(events.length, 1)
  assert.equal(events[0].capabilityId, undefined)
  const [invocation] = aggregateInvocations(events)
  assert.equal(invocation.resolution, 'orphan-result')
  assert.equal(invocation.kind, 'unknown')
  assert.equal(invocation.requestEventId, null)
  assert.equal(invocation.evidenceState, 'observed')
})

test('aggregation pairs strictly by invocationId, never by adjacency', () => {
  // Two invocations are opened, then their results arrive in the opposite order.
  const events = normalize([
    callEvent({ seq: 10, callId: 'call-a', name: 'bash' }),
    callEvent({ seq: 11, callId: 'call-b', name: 'read' }),
    resultEvent({ seq: 12, callId: 'call-b' }),
    resultEvent({ seq: 13, callId: 'call-a' }),
  ])
  const invocations = aggregateInvocations(events)
  assert.equal(invocations.length, 2)
  const [first, second] = invocations
  assert.equal(first.invocationId, 'call-a')
  assert.equal(first.name, 'bash')
  assert.equal(first.status, 'success')
  assert.equal(first.resolution, 'matched')
  assert.equal(second.invocationId, 'call-b')
  assert.equal(second.name, 'read')
  assert.equal(second.status, 'success')
  assert.equal(second.resolution, 'matched')
})

test('a request without a result stays unresolved', () => {
  const events = normalize([callEvent({ seq: 10, callId: 'call-a' })])
  const [invocation] = aggregateInvocations(events)
  assert.equal(invocation.status, 'requested')
  assert.equal(invocation.evidenceState, 'requested')
  assert.equal(invocation.resolution, 'unresolved-request')
  assert.equal(invocation.endedAt, null)
  assert.equal(invocation.durationMs, null)
  assert.deepEqual(invocation.evidenceEventIds, [`${sessionId}:re:10`])
})

test('evidenceState separates a settled call from a followed one', () => {
  const success = aggregateInvocations(normalize([callEvent({ seq: 10, callId: 'a' }), resultEvent({ seq: 11, callId: 'a' })]))[0]
  const failure = aggregateInvocations(normalize([callEvent({ seq: 10, callId: 'b' }), resultEvent({ seq: 11, callId: 'b', isError: true, code: 'TOOL_FAILED' })]))[0]
  assert.equal(success.status, 'success')
  assert.equal(success.evidenceState, 'observed')
  assert.equal(failure.status, 'failure')
  assert.equal(failure.evidenceState, 'partial')
  assert.equal(failure.errorCode, 'TOOL_FAILED')
})

test('every invocation carries the event ids that support it', () => {
  const events = normalize([callEvent({ seq: 10, callId: 'call-a' }), resultEvent({ seq: 11, callId: 'call-a' })])
  const [invocation] = aggregateInvocations(events)
  assert.deepEqual(invocation.evidenceEventIds, [`${sessionId}:re:10`, `${sessionId}:re:11`])
  assert.equal(invocation.requestEventId, `${sessionId}:re:10`)
  assert.equal(invocation.resultEventId, `${sessionId}:re:11`)
})

test('a user-explicit load is a complete invocation on arrival', () => {
  const event = normalizeSkillInvocation(
    { type: 'user/message', seq: 30, time: 1030, data: { source: { kind: 'skill-invocation', name: 'my-skill' } } },
    { sessionId, turn: 2, step: 3, skillName: 'my-skill' },
  )
  assert.equal(event.type, 'skill.invocation')
  assert.equal(event.source, 'dsh')
  assert.equal(event.capabilityId, 'skill')
  assert.equal(event.capabilityName, 'my-skill')
  const [invocation] = aggregateInvocations([event])
  assert.equal(invocation.kind, 'skill')
  assert.equal(invocation.invocationType, 'user-explicit')
  assert.equal(invocation.status, 'success')
  assert.equal(invocation.evidenceState, 'observed')
  assert.equal(invocation.resolution, 'matched')
})

test('a retry is derived only after a failed same-turn repeat', () => {
  const events = normalize([
    callEvent({ seq: 10, callId: 'call-1', name: 'bash' }),
    resultEvent({ seq: 11, callId: 'call-1', isError: true, code: 'TOOL_FAILED' }),
    callEvent({ seq: 12, callId: 'call-2', name: 'bash' }),
  ])
  const derived = deriveRetryEvent(events, events[2])
  assert.ok(derived, 'a failed invocation repeated in the same turn is a retry')
  assert.equal(derived.type, 'retry')
  assert.equal(derived.source, 'derived')
  assert.equal(derived.rule, RETRY_RULE)
  assert.equal(derived.invocationId, 'call-2')
  assert.equal(derived.retryOf, 'call-1')
  assert.equal(derived.eventId, `${sessionId}:re:12:retry`)
})

test('no retry is derived when the rule does not hold', () => {
  // Previous call succeeded.
  const succeeded = normalize([callEvent({ seq: 10, callId: 'c1', name: 'bash' }), resultEvent({ seq: 11, callId: 'c1' }), callEvent({ seq: 12, callId: 'c2', name: 'bash' })])
  assert.equal(deriveRetryEvent(succeeded, succeeded[2]), null)

  // Previous call failed but never settled as a failure event.
  const unresolved = normalize([callEvent({ seq: 10, callId: 'c1', name: 'bash' }), callEvent({ seq: 12, callId: 'c2', name: 'bash' })])
  assert.equal(deriveRetryEvent(unresolved, unresolved[1]), null)

  // Different capability identity.
  const different = normalize([callEvent({ seq: 10, callId: 'c1', name: 'bash' }), resultEvent({ seq: 11, callId: 'c1', isError: true, code: 'TOOL_FAILED' }), callEvent({ seq: 12, callId: 'c2', name: 'read' })])
  assert.equal(deriveRetryEvent(different, different[2]), null)

  // No earlier request at all.
  const first = normalize([callEvent({ seq: 10, callId: 'c1', name: 'bash' })])
  assert.equal(deriveRetryEvent(first, first[0]), null)
})

test('a retry is not derived across turns', () => {
  const first = normalize([callEvent({ seq: 10, callId: 'c1', name: 'bash', turn: 1 }), resultEvent({ seq: 11, callId: 'c1', isError: true, code: 'TOOL_FAILED', turn: 1 })])
  const second = normalize([callEvent({ seq: 20, callId: 'c2', name: 'bash', turn: 2 })])
  assert.equal(deriveRetryEvent([...first, ...second], second[0]), null)
})

test('derivation appends without rewriting the dsh events it read', () => {
  const events = normalize([
    callEvent({ seq: 10, callId: 'call-1', name: 'bash' }),
    resultEvent({ seq: 11, callId: 'call-1', isError: true, code: 'TOOL_FAILED' }),
    callEvent({ seq: 12, callId: 'call-2', name: 'bash' }),
  ])
  const before = JSON.parse(JSON.stringify(events))
  const derived = deriveRetryEvent(events, events[2])
  assert.ok(derived)
  // The derivation reads the stream and returns a new event; it must not mutate it.
  assert.deepEqual(events, before)
  assert.equal(events.some((event) => event.type === 'retry'), false)
  assert.equal(derived.source, 'derived')
})

test('a derived retry attaches to its invocation without settling it', () => {
  const events = normalize([
    callEvent({ seq: 10, callId: 'call-1', name: 'bash' }),
    resultEvent({ seq: 11, callId: 'call-1', isError: true, code: 'TOOL_FAILED' }),
    callEvent({ seq: 12, callId: 'call-2', name: 'bash' }),
  ])
  const derived = deriveRetryEvent(events, events[2])
  const invocations = aggregateInvocations([...events, derived])
  const retried = invocations.find((item) => item.invocationId === 'call-2')
  assert.equal(retried.retryOf, 'call-1')
  assert.equal(retried.retryEventId, derived.eventId)
  assert.equal(retried.status, 'requested')
  assert.equal(retried.resolution, 'unresolved-request')
  assert.equal(retried.evidenceEventIds.includes(derived.eventId), true)
  const summary = summarizeRuntime([...events, derived])
  assert.equal(summary.derivedCount, 1)
  assert.equal(summary.retryCount, 1)
})

test('the reducer derives a retry end to end', () => {
  let receipt = emptyReceipt(sessionId, 1)
  receipt = reduceSessionEvent(receipt, callEvent({ seq: 10, callId: 'call-1', name: 'bash' }))
  receipt = reduceSessionEvent(receipt, resultEvent({ seq: 11, callId: 'call-1', isError: true, code: 'TOOL_FAILED' }))
  receipt = reduceSessionEvent(receipt, callEvent({ seq: 12, callId: 'call-2', name: 'bash' }))
  const derived = receipt.runtimeEvents.filter((event) => event.source === 'derived')
  assert.equal(derived.length, 1)
  assert.equal(derived[0].type, 'retry')
  assert.equal(derived[0].rule, RETRY_RULE)
  assert.equal(derived[0].retryOf, 'call-1')
  const runtime = buildViewModels(receipt).receipt.runtime
  assert.equal(runtime.retryCount, 1)
  assert.equal(runtime.byResolution['unresolved-request'], 1)
  assert.equal(runtime.byResolution.matched, 1)
})

test('the bounded window counts what it dropped', () => {
  const events = []
  for (let index = 0; index < RUNTIME_EVENT_LIMIT + 7; index += 1) {
    events.push({ eventId: `${sessionId}:re:${index}`, seq: index, timestamp: index, type: 'invocation.request', source: 'dsh', status: 'requested', invocationId: `c-${index}`, capabilityId: 'cli', capabilityName: 'bash' })
  }
  const { events: kept, dropped } = upgradeRuntimeEvents(events)
  assert.equal(kept.length, RUNTIME_EVENT_LIMIT)
  assert.equal(dropped, 7)
  assert.equal(kept[0].invocationId, 'c-7')
})

test('truncation that splits a pair is reported, not repaired', () => {
  const events = [
    { eventId: `${sessionId}:re:1`, seq: 1, timestamp: 1, type: 'invocation.result', source: 'dsh', status: 'success', invocationId: 'cut' },
    { eventId: `${sessionId}:re:2`, seq: 2, timestamp: 2, type: 'invocation.request', source: 'dsh', status: 'requested', invocationId: 'kept', capabilityId: 'cli', capabilityName: 'bash' },
  ]
  const [orphan, request] = aggregateInvocations(events)
  assert.equal(orphan.resolution, 'orphan-result')
  assert.equal(orphan.requestEventId, null)
  assert.equal(request.resolution, 'unresolved-request')
  assert.equal(request.resultEventId, null)
})

test('legacy paired rows upgrade into request and result events', () => {
  const { events, dropped } = upgradeRuntimeEvents([
    { callId: 'call-a', capability: 'cli', name: 'bash', turn: 2, step: 1, callSeq: 5, resultSeq: 6, startedAt: 100, endedAt: 140, status: 'success' },
    { callId: 'call-b', capability: 'tool', name: 'read', turn: 2, step: 1, callSeq: 7, startedAt: 200, status: 'requested' },
  ])
  assert.equal(dropped, 0)
  assert.deepEqual(events.map((event) => event.type), ['invocation.request', 'invocation.result', 'invocation.request'])
  assert.equal(events.every((event) => event.source === 'dsh'), true)
  const invocations = aggregateInvocations(events)
  assert.equal(invocations[0].status, 'success')
  assert.equal(invocations[0].durationMs, 40)
  assert.equal(invocations[1].resolution, 'unresolved-request')
})

test('an unusable stored event is dropped rather than half-restored', () => {
  const { events } = upgradeRuntimeEvents([
    null,
    { eventId: 'x', type: 'not-a-type', source: 'dsh' },
    { eventId: 'y', type: 'retry', source: 'somewhere-else' },
    { eventId: '', type: 'retry', source: 'derived' },
    { eventId: 'z', type: 'retry', source: 'derived', status: 'unknown' },
  ])
  assert.equal(events.length, 1)
  assert.equal(events[0].eventId, 'z')
})

test('summarizeRuntime counts kinds, statuses and resolutions', () => {
  const events = normalize([
    callEvent({ seq: 10, callId: 'a', name: 'bash' }),
    resultEvent({ seq: 11, callId: 'a' }),
    callEvent({ seq: 12, callId: 'b', name: 'read' }),
    resultEvent({ seq: 13, callId: 'b', isError: true, code: 'TOOL_FAILED' }),
    callEvent({ seq: 14, callId: 'c', name: 'mcp__github__get_pr' }),
  ])
  const summary = summarizeRuntime(events, 4)
  assert.equal(summary.eventCount, 5)
  assert.equal(summary.invocationCount, 3)
  assert.equal(summary.overflow, 4)
  assert.deepEqual(summary.byCapability, { skill: 0, tool: 1, cli: 1, mcp: 1, subagent: 0 })
  assert.deepEqual(summary.byStatus, { requested: 1, success: 1, failure: 1, unknown: 0 })
  assert.deepEqual(summary.byResolution, { matched: 2, 'unresolved-request': 1, 'orphan-result': 0 })
  assert.equal(summary.derivedCount, 0)
})

test('classification still refuses names it cannot vouch for', () => {
  // A malformed MCP name is not promoted to MCP. It stays an unclassified Tool,
  // which is what was observed, rather than being guessed into a capability the
  // name never declared.
  assert.equal(classifyCapability('mcp__').capability, 'tool')
  assert.equal(classifyCapability('mcp__server__').capability, 'tool')
  // An identifier that is not a usable tool name at all is refused outright.
  assert.equal(classifyCapability('a'.repeat(200)), null)
  assert.equal(classifyCapability('has space'), null)
  assert.equal(classifyCapability(''), null)
})
