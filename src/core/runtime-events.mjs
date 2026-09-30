import { extractRuntimeEvidence } from './runtime-evidence.mjs'
/**
 * Normalized runtime event model and invocation aggregation.
 *
 * This module is the Normalizer and Invocation Aggregator of the Runtime Flow
 * pipeline. It turns raw DSH session events into a stable, citeable event stream
 * and folds that stream into logical capability invocations. Phase 2 correlates
 * these; Phase 4 draws them. Nothing here renders or judges anything.
 *
 * Two disciplines hold throughout:
 *
 * 1. `source` separates what the host reported from what this plugin derived.
 *    A derived event is only ever *appended*; it never rewrites or replaces a
 *    `dsh` event. A derivation that cannot cite a rule is not emitted.
 * 2. Aggregation never invents a missing half. A request with no observed result
 *    stays `unresolved-request`, and a result with no observed request stays
 *    `orphan-result`, rather than being completed by adjacency or guesswork.
 *
 * @module runtime-events
 */

export const CAPABILITY_KINDS = ['skill', 'tool', 'cli', 'mcp', 'subagent']

/** Who produced a normalized event. See the module note on the derived rule. */
export const RUNTIME_EVENT_SOURCES = ['dsh', 'derived']

/**
 * The normalized event vocabulary.
 *
 * Deviation from a per-capability request/result vocabulary (`cli.request`,
 * `mcp.result`, …): a DSH `tool/result` carries no tool name, so a result event
 * cannot assert which capability it belongs to. Capability is a property of the
 * *invocation*, resolved from the request that opened it. Naming a result
 * `cli.result` would be a claim the raw event does not support.
 */
export const RUNTIME_EVENT_TYPES = [
  /** A capability invocation was requested. */
  'invocation.request',
  /** An observed result settled a previously requested invocation. */
  'invocation.result',
  /** A user-explicit `/name` load. DSH injects it; no tool call exists. */
  'skill.invocation',
  /**
   * DSH recorded a direct child session of this one. The event names the child
   * and its mode; it does not name the invocation that created it.
   */
  'subagent.spawn',
  /** Derived: an invocation repeated a failed one under the same rule. */
  'retry',
]

export const RUNTIME_EVENT_STATUSES = ['requested', 'success', 'failure', 'unknown']

/**
 * How completely one invocation was observed.
 *
 * `observed` here is SDD §5.1's state and means only "a request and a successful
 * result were both seen" — never that the Skill was followed, was effective, or
 * caused anything.
 */
export const INVOCATION_EVIDENCE_STATES = ['observed', 'partial', 'requested', 'unknown']

/** Resolution of an invocation against its request/result pair. */
export const INVOCATION_RESOLUTIONS = ['matched', 'unresolved-request', 'orphan-result']

/**
 * The one derivation rule Phase 1 emits. Named so every derived event can be
 * traced to a rule rather than to a model's impression.
 */
export const RETRY_RULE = 'same-turn-repeat-after-failure'

/** Modes DSH records for a direct child session. */
export const SUBAGENT_MODES = ['one-shot', 'continuable', 'unknown']

// Bounded projection of a run, counted in normalized events rather than in
// invocations because a settled invocation costs two events.
export const RUNTIME_EVENT_LIMIT = 2000
export const RUNTIME_EVENT_NAME_MAX = 128
export const RUNTIME_EVENT_CALL_ID_MAX = 240

export function cleanString(value, maxLength = 160) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

/**
 * A bounded identifier: a tool name, a session id, an MCP server name.
 *
 * The length is checked before any trimming, because truncating an over-long
 * identifier would turn it into a *different* valid name and recording that
 * would be inventing something that never happened.
 */
export function safeIdentifier(value, maxLength = RUNTIME_EVENT_NAME_MAX) {
  if (typeof value !== 'string') return ''
  const name = value.trim()
  if (!name || name.length > maxLength) return ''
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(name) ? name : ''
}

/** A registered tool name. MCP tools are the composed `mcp__<server>__<raw>` form. */
export function safeToolName(value) {
  return safeIdentifier(value)
}

export function safeErrorCode(value) {
  const code = cleanString(value, 64)
  return /^[A-Z0-9_-]+$/.test(code) ? code : 'SKILL_LOAD_FAILED'
}

/**
 * Deterministic capability classification for one registered tool name.
 *
 * Classification only labels an observed invocation. It never rewrites the
 * recorded event and never invents an invocation that did not happen.
 * @param toolName - the `tool/call` `name` field.
 * @returns the capability kind plus bounded names, or null for an unusable name.
 */
export function classifyCapability(toolName) {
  const name = safeToolName(toolName)
  if (!name) return null
  const mcp = /^mcp__([A-Za-z0-9_-]{1,32})__(.{1,64})$/.exec(name)
  if (mcp) return { capability: 'mcp', capabilityName: mcp[1], detail: mcp[2] }
  if (name === 'skill') return { capability: 'skill', capabilityName: 'skill', detail: null }
  if (/^(bash|pwsh)([-_].*)?$/.test(name)) return { capability: 'cli', capabilityName: name, detail: null }
  if (/^subagent([-_].*)?$/.test(name)) return { capability: 'subagent', capabilityName: name, detail: null }
  return { capability: 'tool', capabilityName: name, detail: null }
}

function eventIdFor(sessionId, seq) {
  return `${sessionId}:re:${Number.isSafeInteger(seq) ? seq : 'unknown'}`
}

function baseEvent({ sessionId, seq, timestamp, type, source = 'dsh' }) {
  return {
    eventId: eventIdFor(sessionId, seq),
    seq: Number.isSafeInteger(seq) ? seq : null,
    timestamp: Number.isSafeInteger(timestamp) ? timestamp : null,
    type,
    source,
    turn: null,
    step: null,
    status: 'unknown',
  }
}

function withOptional(event, fields) {
  const next = { ...event }
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === '') continue
    next[key] = value
  }
  return next
}

/**
 * Normalize a `tool/call` into an invocation request event.
 * @param event - the DSH session event.
 * @param context - `sessionId`, attributed `turn`/`step`.
 * @returns a normalized request event, or null when the call is unusable.
 */
export function normalizeRequest(event, context) {
  const data = event?.data ?? {}
  const callId = cleanString(data.callId, RUNTIME_EVENT_CALL_ID_MAX)
  const kind = classifyCapability(data.name)
  if (!callId || !kind) return null
  const base = baseEvent({
    sessionId: context.sessionId,
    seq: event.seq,
    timestamp: event.time,
    type: 'invocation.request',
  })
  // Evidence is extracted here and the raw argument is dropped in the same call. What lands on
  // the event is a bounded category and two booleans — never the command, the path, the query or
  // the model's description. `extractRuntimeEvidence` never returns the raw value, so there is
  // no later step at which it could leak into a receipt, a backup or an export.
  const evidence = extractRuntimeEvidence({ name: data.name, capabilityId: kind.capability, arguments: data.arguments })
  return withOptional({ ...base, turn: context.turn ?? null, step: context.step ?? null, status: 'requested' }, {
    capabilityId: kind.capability,
    capabilityName: kind.capabilityName,
    detail: kind.detail,
    invocationId: callId,
    evidenceType: evidence.evidenceType,
    evidenceCategory: evidence.category,
    evidenceSpecific: evidence.specific,
    modelIntentPresent: evidence.modelIntent.present,
    // The kind the model's `description` maps onto. Not the text — see `step-kind.mjs`.
    modelIntentKind: evidence.modelIntent.kind,
  })
}

/**
 * Normalize a `tool/result` into a result event.
 *
 * The capability is taken from the request that opened the invocation when that
 * request is still observable; otherwise it is left unset rather than guessed.
 * @param event - the DSH session event.
 * @param context - `sessionId`, attributed `turn`/`step`, and `capabilityOf`.
 */
export function normalizeResult(event, context) {
  const callId = cleanString(
    event?.data?.message?.source?.callId || event?.data?.message?.toolCallId,
    RUNTIME_EVENT_CALL_ID_MAX,
  )
  if (!callId) return null
  const failed = event?.data?.message?.isError === true || Boolean(event?.data?.error)
  const kind = typeof context.capabilityOf === 'function' ? context.capabilityOf(callId) : null
  const base = baseEvent({
    sessionId: context.sessionId,
    seq: event.seq,
    timestamp: event.time,
    type: 'invocation.result',
  })
  return withOptional({
    ...base,
    turn: context.turn ?? null,
    step: context.step ?? null,
    status: failed ? 'failure' : 'success',
    invocationId: callId,
  }, {
    capabilityId: kind?.capability ?? null,
    capabilityName: kind?.capabilityName ?? null,
    detail: kind?.detail ?? null,
    errorCode: failed ? safeErrorCode(event?.data?.error?.code) : null,
  })
}

/**
 * Normalize a user-explicit `/name` load into a `skill.invocation` event. The
 * invocation is complete on arrival: DSH injected the rendering, so there is no
 * separate result to wait for.
 * @param event - the DSH `user/message` event.
 * @param context - `sessionId`, attributed `turn`/`step`, and the validated skill name.
 */
export function normalizeSkillInvocation(event, context) {
  const skillName = safeToolName(context.skillName)
  if (!skillName) return null
  const base = baseEvent({
    sessionId: context.sessionId,
    seq: event.seq,
    timestamp: event.time,
    type: 'skill.invocation',
  })
  return withOptional({
    ...base,
    turn: context.turn ?? null,
    step: context.step ?? null,
    status: 'success',
    capabilityId: 'skill',
    capabilityName: skillName,
    invocationId: `skill-invocation:${Number.isSafeInteger(event.seq) ? event.seq : 'unknown'}`,
  }, {})
}

/**
 * Normalize a `subagent/catalog` into a spawn event.
 *
 * DSH emits this parent-owned event when it creates a direct child session, so
 * the child relationship is a host fact rather than an inference. The event
 * carries a free-text `label`; it is deliberately not read, because it is caller
 * text and this plugin does not store prompts or task descriptions.
 * @param event - the DSH `subagent/catalog` session event.
 * @param context - `sessionId`, attributed `turn`/`step`.
 */
export function normalizeSubagentSpawn(event, context) {
  const data = event?.data ?? {}
  const childId = safeIdentifier(data.childId)
  if (!childId) return null
  const base = baseEvent({
    sessionId: context.sessionId,
    seq: event.seq,
    timestamp: event.time,
    type: 'subagent.spawn',
  })
  return withOptional({
    ...base,
    turn: context.turn ?? null,
    step: context.step ?? null,
    status: 'success',
    capabilityId: 'subagent',
    capabilityName: 'subagent',
    childId,
    mode: SUBAGENT_MODES.includes(data.mode) ? data.mode : 'unknown',
  }, {})
}

/**
 * Derive the retry event for a request that repeats a failed invocation.
 *
 * Rule `same-turn-repeat-after-failure`: look back for the most recent earlier
 * request with the same capability identity in the same turn. If its invocation
 * settled as a failure, this request is a retry. Log order decides, never
 * timestamps, and the derivation never touches the events it read.
 * @param runtimeEvents - the stream, with `requestEvent` already appended last.
 * @param requestEvent - the request just appended.
 * @returns a derived `retry` event, or null when the rule does not apply.
 */
export function deriveRetryEvent(runtimeEvents, requestEvent) {
  if (requestEvent?.type !== 'invocation.request') return null
  const { invocationId, capabilityId, capabilityName, turn } = requestEvent
  if (!invocationId || !capabilityId || !capabilityName) return null

  let previous = null
  for (let index = runtimeEvents.length - 1; index >= 0; index -= 1) {
    const candidate = runtimeEvents[index]
    if (candidate.eventId === requestEvent.eventId) continue
    if (candidate.type !== 'invocation.request') continue
    if (candidate.turn !== turn) continue
    if (candidate.capabilityId !== capabilityId || candidate.capabilityName !== capabilityName) continue
    previous = candidate
    break
  }
  if (!previous) return null

  let settled = null
  for (let index = runtimeEvents.length - 1; index >= 0; index -= 1) {
    const candidate = runtimeEvents[index]
    if (candidate.type !== 'invocation.result') continue
    if (candidate.invocationId !== previous.invocationId) continue
    settled = candidate
    break
  }
  if (!settled || settled.status !== 'failure') return null

  return {
    eventId: `${requestEvent.eventId}:retry`,
    seq: requestEvent.seq,
    timestamp: requestEvent.timestamp,
    type: 'retry',
    source: 'derived',
    turn,
    step: requestEvent.step ?? null,
    status: 'unknown',
    capabilityId,
    capabilityName,
    detail: requestEvent.detail ?? null,
    invocationId,
    retryOf: previous.invocationId,
    rule: RETRY_RULE,
  }
}

/**
 * Fold the normalized stream into logical invocations.
 *
 * Requests and results are paired by `invocationId` only. Time adjacency is
 * never used, so a request that lost its result is reported as
 * `unresolved-request` instead of being completed by the nearest event.
 * @param runtimeEvents - normalized events in log order.
 * @returns invocations in first-request order.
 */
export function aggregateInvocations(runtimeEvents) {
  const byId = new Map()
  const order = []

  function create(invocationId, seed) {
    const invocation = {
      invocationId,
      kind: seed.capabilityId ?? 'unknown',
      name: seed.capabilityName ?? 'unknown',
      detail: seed.detail ?? null,
      turn: Number.isSafeInteger(seed.turn) ? seed.turn : null,
      step: Number.isSafeInteger(seed.step) ? seed.step : null,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      status: 'unknown',
      // Carded from the opening event, which extracted the evidence and discarded the raw
      // argument. Only a bounded category, a step kind and two booleans travel this far.
      evidenceType: seed.evidenceType ?? null,
      evidenceCategory: seed.evidenceCategory ?? null,
      evidenceSpecific: seed.evidenceSpecific === true,
      modelIntentPresent: seed.modelIntentPresent === true,
      modelIntentKind: seed.modelIntentKind ?? null,
      evidenceState: 'unknown',
      resolution: 'orphan-result',
      requestEventId: null,
      resultEventId: null,
      evidenceEventIds: [],
      retryOf: null,
      retryEventId: null,
      invocationType: null,
    }
    byId.set(invocationId, invocation)
    order.push(invocationId)
    return invocation
  }

  for (const event of runtimeEvents) {
    if (!event || !event.invocationId) continue

    if (event.type === 'invocation.request') {
      if (byId.has(event.invocationId)) continue
      const invocation = create(event.invocationId, event)
      invocation.kind = event.capabilityId ?? 'unknown'
      invocation.name = event.capabilityName ?? 'unknown'
      invocation.startedAt = Number.isSafeInteger(event.timestamp) ? event.timestamp : null
      invocation.status = 'requested'
      invocation.evidenceState = 'requested'
      invocation.resolution = 'unresolved-request'
      invocation.requestEventId = event.eventId
      invocation.evidenceEventIds = [event.eventId]
      if (invocation.kind === 'skill') invocation.invocationType = 'model-invoked'
      continue
    }

    if (event.type === 'invocation.result') {
      const invocation = byId.get(event.invocationId)
      if (!invocation) {
        const orphan = create(event.invocationId, event)
        orphan.status = RUNTIME_EVENT_STATUSES.includes(event.status) ? event.status : 'unknown'
        orphan.evidenceState = orphan.status === 'failure' ? 'partial' : orphan.status === 'success' ? 'observed' : 'unknown'
        orphan.endedAt = Number.isSafeInteger(event.timestamp) ? event.timestamp : null
        orphan.resultEventId = event.eventId
        orphan.evidenceEventIds = [event.eventId]
        orphan.errorCode = event.errorCode ?? null
        continue
      }
      if (invocation.resultEventId) continue
      invocation.resultEventId = event.eventId
      invocation.evidenceEventIds = [...invocation.evidenceEventIds, event.eventId]
      invocation.endedAt = Number.isSafeInteger(event.timestamp) ? event.timestamp : null
      invocation.durationMs = Number.isSafeInteger(invocation.startedAt) && Number.isSafeInteger(invocation.endedAt)
        ? invocation.endedAt - invocation.startedAt
        : null
      invocation.status = RUNTIME_EVENT_STATUSES.includes(event.status) ? event.status : 'unknown'
      invocation.evidenceState = invocation.status === 'success' ? 'observed' : invocation.status === 'failure' ? 'partial' : 'unknown'
      invocation.errorCode = event.errorCode ?? null
      invocation.resolution = 'matched'
      continue
    }

    if (event.type === 'skill.invocation') {
      if (byId.has(event.invocationId)) continue
      const invocation = create(event.invocationId, event)
      invocation.kind = 'skill'
      invocation.name = event.capabilityName ?? 'unknown'
      invocation.status = 'success'
      invocation.evidenceState = 'observed'
      invocation.resolution = 'matched'
      invocation.requestEventId = event.eventId
      invocation.resultEventId = event.eventId
      invocation.evidenceEventIds = [event.eventId]
      invocation.startedAt = Number.isSafeInteger(event.timestamp) ? event.timestamp : null
      invocation.endedAt = invocation.startedAt
      invocation.durationMs = 0
      invocation.invocationType = 'user-explicit'
      continue
    }

    if (event.type === 'retry') {
      const invocation = byId.get(event.invocationId)
      if (!invocation) continue
      invocation.retryOf = event.retryOf ?? null
      invocation.retryEventId = event.eventId
      if (!invocation.evidenceEventIds.includes(event.eventId)) {
        invocation.evidenceEventIds = [...invocation.evidenceEventIds, event.eventId]
      }
    }
  }

  return order.map((invocationId) => byId.get(invocationId))
}

/**
 * Normalize one stored value, accepting both the current normalized shape and
 * the paired per-invocation shape written before Phase 1.
 * @param value - a stored runtime event or a legacy paired entry.
 * @returns normalized events, possibly empty for an unusable value.
 */
export function upgradeRuntimeEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  // Legacy paired entry: one row per invocation, carrying both endpoints.
  if (typeof value.type !== 'string') {
    const callId = cleanString(value.callId, RUNTIME_EVENT_CALL_ID_MAX)
    const capability = CAPABILITY_KINDS.includes(value.capability) ? value.capability : ''
    const name = safeToolName(value.name)
    if (!callId || !capability || !name) return []
    const status = ['requested', 'success', 'failure'].includes(value.status) ? value.status : 'requested'
    const events = [withOptional({
      eventId: `${value.callId}:legacy-request`,
      seq: Number.isSafeInteger(value.callSeq) ? value.callSeq : null,
      timestamp: Number.isSafeInteger(value.startedAt) ? value.startedAt : null,
      type: 'invocation.request',
      source: 'dsh',
      turn: Number.isSafeInteger(value.turn) ? value.turn : null,
      step: Number.isSafeInteger(value.step) ? value.step : null,
      status: 'requested',
      capabilityId: capability,
      capabilityName: name,
      invocationId: callId,
    }, { detail: value.detail ?? null })]
    if (status !== 'requested') {
      events.push(withOptional({
        eventId: `${value.callId}:legacy-result`,
        seq: Number.isSafeInteger(value.resultSeq) ? value.resultSeq : null,
        timestamp: Number.isSafeInteger(value.endedAt) ? value.endedAt : null,
        type: 'invocation.result',
        source: 'dsh',
        turn: Number.isSafeInteger(value.turn) ? value.turn : null,
        step: Number.isSafeInteger(value.step) ? value.step : null,
        status,
        invocationId: callId,
      }, {
        capabilityId: capability,
        capabilityName: name,
        detail: value.detail ?? null,
        errorCode: status === 'failure' ? safeErrorCode(value.errorCode) : null,
      }))
    }
    return events
  }

  const type = RUNTIME_EVENT_TYPES.includes(value.type) ? value.type : ''
  const source = RUNTIME_EVENT_SOURCES.includes(value.source) ? value.source : ''
  const eventId = cleanString(value.eventId, 400)
  if (!type || !source || !eventId) return []
  const status = RUNTIME_EVENT_STATUSES.includes(value.status) ? value.status : 'unknown'
  const invocationId = cleanString(value.invocationId, RUNTIME_EVENT_CALL_ID_MAX) || null
  const event = {
    eventId,
    seq: Number.isSafeInteger(value.seq) ? value.seq : null,
    timestamp: Number.isSafeInteger(value.timestamp) ? value.timestamp : null,
    type,
    source,
    turn: Number.isSafeInteger(value.turn) ? value.turn : null,
    step: Number.isSafeInteger(value.step) ? value.step : null,
    status,
  }
  if (invocationId) event.invocationId = invocationId
  if (CAPABILITY_KINDS.includes(value.capabilityId)) event.capabilityId = value.capabilityId
  const capabilityName = safeToolName(value.capabilityName)
  if (capabilityName) event.capabilityName = capabilityName
  const detail = safeToolName(value.detail)
  if (detail) event.detail = detail
  if (value.errorCode) event.errorCode = safeErrorCode(value.errorCode)
  if (value.rule === RETRY_RULE) event.rule = RETRY_RULE
  const retryOf = cleanString(value.retryOf, RUNTIME_EVENT_CALL_ID_MAX)
  if (retryOf) event.retryOf = retryOf
  const childId = safeIdentifier(value.childId)
  if (childId) event.childId = childId
  if (SUBAGENT_MODES.includes(value.mode)) event.mode = value.mode
  return [event]
}

/**
 * Normalize a stored collection, keeping the most recent bounded window.
 * @param values - stored runtime events, current or legacy.
 * @param limit - maximum retained events.
 * @returns `{ events, dropped }` where `dropped` counts what the window excluded.
 */
export function upgradeRuntimeEvents(values, limit = RUNTIME_EVENT_LIMIT) {
  const events = []
  for (const value of Array.isArray(values) ? values : []) {
    for (const event of upgradeRuntimeEvent(value)) events.push(event)
  }
  if (events.length <= limit) return { events, dropped: 0 }
  return { events: events.slice(events.length - limit), dropped: events.length - limit }
}

/**
 * Counts-only projection of the runtime surface. No argument and no result
 * content is carried here, and `overflow` states truncation rather than
 * presenting a bounded window as a complete run.
 * @param runtimeEvents - normalized events.
 * @param overflow - events excluded by the storage window.
 */
export function summarizeRuntime(runtimeEvents, overflow = 0) {
  const events = Array.isArray(runtimeEvents) ? runtimeEvents : []
  const invocations = aggregateInvocations(events)
  const byCapability = Object.fromEntries(CAPABILITY_KINDS.map((kind) => [kind, 0]))
  const byStatus = Object.fromEntries(RUNTIME_EVENT_STATUSES.map((status) => [status, 0]))
  const byResolution = Object.fromEntries(INVOCATION_RESOLUTIONS.map((resolution) => [resolution, 0]))
  for (const invocation of invocations) {
    if (byCapability[invocation.kind] !== undefined) byCapability[invocation.kind] += 1
    if (byStatus[invocation.status] !== undefined) byStatus[invocation.status] += 1
    if (byResolution[invocation.resolution] !== undefined) byResolution[invocation.resolution] += 1
  }
  return {
    eventCount: events.length,
    invocationCount: invocations.length,
    overflow: Math.max(0, Number(overflow) || 0),
    derivedCount: events.filter((event) => event.source === 'derived').length,
    retryCount: events.filter((event) => event.type === 'retry').length,
    spawnCount: events.filter((event) => event.type === 'subagent.spawn').length,
    byCapability,
    byStatus,
    byResolution,
  }
}
