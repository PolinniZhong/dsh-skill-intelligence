/**
 * Skill Runtime Scope — the evidence range a Skill run can be pinned to.
 *
 * The problem this module exists for. Alignment used to match a Skill's declared steps
 * against **every runtime event in the session**:
 *
 *     const invocations = aggregateInvocations(receipt?.runtimeEvents ?? [])
 *
 * So a session that ran `read`/`grep` in turn 1, loaded Skill A in turn 2, and ran
 * `bash`/`edit`/`test` in turn 3 would let Skill A's declared "Inspect → Implement → Test"
 * match events from turns 1 and 3 alike. The events were real; the attribution was invented.
 *
 * A Scope narrows the question from "what did this session do" to "what can be attributed to
 * this Skill run", and it answers with evidence rather than adjacency.
 *
 * ## What a Scope is not
 *
 * - **Not a workflow.** It does not order the events into steps the Agent took.
 * - **Not the Agent's reasoning.** Nothing here reads intent; there is no prompt and no plan.
 * - **Not a causal graph.** No event is said to have been caused by the Skill.
 * - **Not a compliance measure.** A Scope with events does not mean the Skill was followed.
 *
 * It states one thing: *under the runtime evidence available, these events can be reliably
 * attributed to this Skill run's range.*
 *
 * ## Why the turn, and not adjacency
 *
 * `turn` is present on 100% of runtime events in the sessions measured here
 * (1343/1343 in one real session), and `Session → Turn → Invocation` is containment the
 * runtime itself states. That makes the turn a **structural** boundary rather than an
 * inferred one.
 *
 * Temporal adjacency is deliberately not used. "The event right after the load", "the last
 * tool before the next turn", "everything following the Skill" all produce attributions the
 * evidence does not support, and each of them reads as a relationship the runtime never
 * claimed. Where the turn cannot disambiguate, the answer is `unlinked` — see Case G below.
 *
 * ## Privacy
 *
 * A Scope stores identifiers and classifications only. It holds no prompt text, no tool
 * arguments, and no project content. Every member event must resolve to a real runtime
 * event id, which is what makes the Scope auditable at all.
 *
 * | Case | Situation | Result |
 * |---|---|---|
 * | A | Skill loaded, several calls in that turn | scope = the turn, `correlated` |
 * | B | Two Skills, different turns | two scopes, disjoint |
 * | C | One turn, several invocations | all of them in the turn's scope |
 * | D | User-explicit `/name` load | identical handling — it also carries turn/step |
 * | E | Load with nothing else in the turn | scope holds the load alone |
 * | F | Load matches no single call | `unlinked`, no scope |
 * | G | Two Skills in one turn | both `unlinked` — the turn cannot separate them |
 *
 * @module skill-runtime-scope
 */

export const SKILL_SCOPE_MODEL_VERSION = 1

/**
 * How firmly an event sits inside a Scope.
 *
 * `observed`   — the event is the load itself, or shares the load's turn and step.
 * `correlated` — the event shares the load's turn. The runtime states the containment;
 *                it does not state that the Skill caused the call.
 * `candidate`  — a narrow, named rule places it here. Every candidate states its rule.
 * `unlinked`   — the runtime cannot place it. The event is kept and not attributed.
 */
// `candidate` is deliberately absent: no rule in this module produces it. The `candidate`
// values elsewhere in the codebase belong to `reviewState` and edge status, which are different
// vocabularies — carrying the word here implied a Scope state that cannot occur.
export const SCOPE_RELATION_STATUSES = ['observed', 'correlated', 'unlinked']

/** Which rule put this Scope together, so the reasoning stays auditable. */
export const SCOPE_DERIVATIONS = [
  /** P2: `Session → Turn → Invocation` containment the runtime states. */
  'same-turn-containment',
  /** P4: nothing in the runtime separates the candidates. */
  'ambiguous-turn',
  /** P4: the load names no turn, so no structural boundary exists. */
  'no-turn-boundary',
]

/**
 * The limitations a Scope must carry.
 *
 * These are not disclaimers bolted on at the end. Each one names something the runtime
 * provably cannot show, and they travel with the Scope so a reader cannot see the event
 * list without also seeing what it does not mean.
 */
export const SCOPE_LIMITATIONS = {
  notCausal: '同一 Turn 是 Runtime 明示的包含关系；不表示 Skill 导致这些调用，也不表示调用为 Skill 服务。',
  notCompliance: 'Scope 内的调用不表示 Skill 被遵循，也不表示结果正确。',
  notIntent: 'Scope 不读取提示词、工具参数或项目内容，因此不表示 Agent 的意图或计划。',
  turnBounded: 'Scope 以 Turn 为结构边界。跨 Turn 的后续工作不在其中——宁可少算，不算错。',
}

/** Events per Scope, bounded so one busy session cannot produce an unbounded payload. */
export const SCOPE_EVENT_LIMIT = 200

const EVENT_TYPE_OF_CAPABILITY = {
  skill: 'skill',
  tool: 'tool',
  cli: 'cli',
  mcp: 'mcp',
  subagent: 'subagent',
}

const capabilityClassOf = (capabilityId) => EVENT_TYPE_OF_CAPABILITY[capabilityId] ?? 'other'

const isInteger = (value) => Number.isSafeInteger(value)

/**
 * Index runtime events by turn, keeping only what a Scope needs to cite.
 *
 * @param runtimeEvents - normalized events in log order.
 * @returns Map of turn → events, plus the events that name no turn.
 */
function indexByTurn(runtimeEvents) {
  const byTurn = new Map()
  const turnOfInvocation = new Map()
  const deferred = []
  for (const event of runtimeEvents) {
    if (!event || !event.eventId) continue
    // An event without a turn is not collected *here*: it cannot be placed in any turn-bounded
    // scope, and a load in that position is reported as `no-turn-boundary` rather than guessed at.
    if (!isInteger(event.turn)) {
      if (event.invocationId) deferred.push(event)
      continue
    }
    if (!byTurn.has(event.turn)) byTurn.set(event.turn, [])
    byTurn.get(event.turn).push(event)
    if (event.invocationId) {
      const known = turnOfInvocation.get(event.invocationId)
      if (known === undefined) turnOfInvocation.set(event.invocationId, event.turn)
      // An id seen in two turns names no single turn, so it can place nothing.
      else if (known !== event.turn) turnOfInvocation.set(event.invocationId, null)
    }
  }
  // Second pass. A `tool/result` carries no `turn` of its own, so the result of every call was
  // dropped and a Scope could never see whether anything succeeded or failed. The result is
  // placed by the invocation it belongs to — and `invocationId` is the host's own join between
  // request and result, not a guess from timestamps or adjacency. An id that maps to no turn, or
  // to more than one, still places nothing.
  for (const event of deferred) {
    const turn = turnOfInvocation.get(event.invocationId)
    if (!isInteger(turn)) continue
    byTurn.get(turn).push(event)
  }
  // Deferred events are appended last, so log order is restored before anything reads a scope.
  for (const list of byTurn.values()) list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  return byTurn
}

/**
 * Build one Scope from a load and the turn it landed in.
 *
 * @param load - `{ skillName, turn, step, invocationId, eventId, invocationType }`.
 * @param turnEvents - the runtime events sharing that turn.
 * @param derivation - which rule established the boundary.
 * @returns the Scope record.
 */
function makeScope(load, turnEvents, derivation) {
  // The load's trace event id and the runtime event id are **different identifiers**:
  // receipts number trace events `…:invocation:517` while runtime events are `…:re:517`.
  // Comparing them directly never matches, which silently left every anchor unmarked.
  // The load is instead identified inside the turn by what the runtime does agree on:
  // a `skill` capability event at the load's own turn and step.
  const anchorMatches = turnEvents.filter((event) => (
    (load.eventId && event.eventId === load.eventId)
    || (event.capabilityId === 'skill' && isInteger(load.step) && event.step === load.step)
    || (event.capabilityId === 'skill' && load.invocationId && event.invocationId === load.invocationId)
  ))

  const members = []
  const seen = new Set()
  for (const event of turnEvents) {
    if (seen.has(event.eventId)) continue
    seen.add(event.eventId)
    // The anchor is `observed`; the rest of the turn is `correlated`, never stronger.
    const status = anchorMatches.some((anchor) => anchor.eventId === event.eventId) ? 'observed' : 'correlated'
    members.push({ event, status })
    if (members.length >= SCOPE_EVENT_LIMIT) break
  }

  const observedEvents = members.map(({ event, status }) => ({
    eventId: event.eventId,
    type: event.type,
    source: event.source ?? null,
    capabilityId: event.capabilityId ?? null,
    capabilityName: event.capabilityName ?? null,
    invocationId: event.invocationId ?? null,
    turn: isInteger(event.turn) ? event.turn : null,
    step: isInteger(event.step) ? event.step : null,
    status: event.status ?? null,
    // The evidence carded when the request was normalized has to travel with the member.
    // It was being dropped here while `scopedRuntimeEvents` read it on the way out, so every
    // scope handed downstream `evidenceCategory: null` whatever the call actually was — which
    // silently demoted a recognised `npm test` to a bare capability.
    evidenceType: event.evidenceType ?? null,
    evidenceCategory: event.evidenceCategory ?? null,
    evidenceSpecific: event.evidenceSpecific === true,
    modelIntentPresent: event.modelIntentPresent === true,
    modelIntentKind: event.modelIntentKind ?? null,
    relationStatus: status,
  }))

  const counts = {}
  for (const entry of observedEvents) {
    if (entry.eventId === load.eventId) continue
    const key = capabilityClassOf(entry.capabilityId)
    if (key === 'other') continue
    if (!counts[key]) counts[key] = { total: 0, byName: {} }
    counts[key].total += 1
    const name = entry.capabilityName ?? entry.capabilityId
    counts[key].byName[name] = (counts[key].byName[name] ?? 0) + 1
  }

  const steps = observedEvents.map((entry) => entry.step).filter(isInteger)
  const timestamps = turnEvents.map((event) => event.timestamp).filter(isInteger)

  return {
    modelVersion: SKILL_SCOPE_MODEL_VERSION,
    skillName: load.skillName,
    invocationId: load.invocationId ?? null,
    invocationType: load.invocationType ?? null,
    /** The load event that anchors the Scope. Every member below can be traced from it. */
    startEventId: load.eventId ?? null,
    endEventId: observedEvents.length ? observedEvents[observedEvents.length - 1].eventId : null,
    turnRange: isInteger(load.turn) ? { from: load.turn, to: load.turn } : null,
    stepRange: steps.length ? { from: Math.min(...steps), to: Math.max(...steps) } : null,
    timeRange: timestamps.length ? { from: Math.min(...timestamps), to: Math.max(...timestamps) } : null,
    eventIds: observedEvents.map((entry) => entry.eventId),
    observedEvents,
    /** What the Scope contains, by capability class. `skill` is the load itself and is excluded. */
    observedByClass: counts,
    // A Scope's members share the load's turn. That is containment the runtime states, not
    // service it states, so the Scope as a whole is `correlated`; the load's own event is the
    // only member marked `observed`. No derivation builds a Scope from the load alone.
    relationStatus: 'correlated',
    derivation,
    limitation: [
      SCOPE_LIMITATIONS.notCausal,
      SCOPE_LIMITATIONS.notCompliance,
      SCOPE_LIMITATIONS.notIntent,
      SCOPE_LIMITATIONS.turnBounded,
    ],
  }
}

/** A load the runtime cannot place: kept, reported, attributed to nothing. */
function makeUnlinked(load, derivation, reason) {
  return {
    modelVersion: SKILL_SCOPE_MODEL_VERSION,
    skillName: load.skillName,
    invocationId: load.invocationId ?? null,
    invocationType: load.invocationType ?? null,
    startEventId: load.eventId ?? null,
    endEventId: null,
    turnRange: isInteger(load.turn) ? { from: load.turn, to: load.turn } : null,
    stepRange: isInteger(load.step) ? { from: load.step, to: load.step } : null,
    timeRange: null,
    eventIds: [],
    observedEvents: [],
    observedByClass: {},
    relationStatus: 'unlinked',
    derivation,
    reason,
    limitation: [
      reason,
      SCOPE_LIMITATIONS.notCausal,
      SCOPE_LIMITATIONS.notCompliance,
    ],
  }
}

/**
 * Build every Skill Runtime Scope in a receipt.
 *
 * One Scope per Skill load. A load whose turn holds another load is left `unlinked` rather
 * than sharing the turn — Case G. Two Skills loaded in the same turn cannot be separated by
 * any field the runtime provides, and splitting the turn's events between them would be a
 * guess. Guessing is the one thing this pipeline must not do.
 *
 * @param receipt - the receipt holding Skill load evidence.
 * @returns `{ scopes, unlinked, stats }`.
 */
export function buildSkillRuntimeScopes(receipt) {
  const traces = Array.isArray(receipt?.traceEvents) ? receipt.traceEvents : []
  const runtimeEvents = Array.isArray(receipt?.runtimeEvents) ? receipt.runtimeEvents : []
  const byTurn = indexByTurn(runtimeEvents)

  const loads = traces
    .filter((trace) => trace && trace.skillName)
    .map((trace) => ({
      skillName: trace.skillName,
      turn: isInteger(trace.turn) ? trace.turn : null,
      step: isInteger(trace.step) ? trace.step : null,
      invocationId: trace.invocationId ?? null,
      eventId: trace.eventId ?? null,
      invocationType: trace.invocationType ?? null,
    }))

  // Case G: more than one load in a turn. The turn cannot separate them, so none of them
  // claim it. Detected before any Scope is built, because the boundary itself is the problem.
  const loadsPerTurn = new Map()
  for (const load of loads) {
    if (!isInteger(load.turn)) continue
    loadsPerTurn.set(load.turn, (loadsPerTurn.get(load.turn) ?? 0) + 1)
  }

  const scopes = []
  const unlinked = []
  for (const load of loads) {
    if (!isInteger(load.turn)) {
      unlinked.push(makeUnlinked(load, 'no-turn-boundary',
        '这次加载没有 turn 字段，Runtime 没有给出可用的结构边界，因此不归属任何事件。'))
      continue
    }
    if ((loadsPerTurn.get(load.turn) ?? 0) > 1) {
      unlinked.push(makeUnlinked(load, 'ambiguous-turn',
        `同一个 Turn（${load.turn}）内有多次 Skill 加载，Runtime 无法区分这些调用属于哪一次。`))
      continue
    }
    const turnEvents = byTurn.get(load.turn) ?? []
    if (turnEvents.length === 0) {
      unlinked.push(makeUnlinked(load, 'no-turn-boundary',
        '这个 Turn 没有可引用的 Runtime 事件，Scope 为空。'))
      continue
    }
    scopes.push(makeScope(load, turnEvents, 'same-turn-containment'))
  }

  const stats = {
    scopeCount: scopes.length,
    unlinkedCount: unlinked.length,
    loadCount: loads.length,
    observedEventCount: scopes.reduce((sum, scope) => sum + (scope.observedEvents?.length ?? 0), 0),
    runtimeEventCount: runtimeEvents.length,
    /** How much of the session's runtime evidence the Scopes account for. */
    coveredEventCount: new Set(scopes.flatMap((scope) => scope.eventIds)).size,
  }

  return { scopes, unlinked, stats }
}

/**
 * The Scope for one Skill, chosen by name.
 *
 * Returns `null` when the receipts hold no load for that name, and the `unlinked` record
 * when they hold one that could not be bounded — the caller must be able to tell "this Skill
 * has no runtime evidence" from "this Skill's evidence could not be attributed".
 *
 * @param built - the result of `buildSkillRuntimeScopes`.
 * @param skillName - the Skill to find.
 * @returns a Scope, an unlinked record, or null.
 */
/**
 * Every Scope belonging to one Skill.
 *
 * A Skill loaded twice in a session produces two Scopes, and both belong to it. Returning
 * only the first — as an earlier version did — silently dropped the second run's evidence,
 * which is the same class of loss this module exists to prevent.
 *
 * @returns `{ scopes, unlinked }`; both empty when the receipts hold no load for the name.
 */
export function scopesForSkillName(built, skillName) {
  const scopes = (built?.scopes ?? []).filter((scope) => scope.skillName === skillName)
  const unlinked = (built?.unlinked ?? []).filter((record) => record.skillName === skillName)
  return { scopes, unlinked }
}


/**
 * The runtime events a Scope permits Alignment to read.
 *
 * Alignment must call this rather than reaching for `receipt.runtimeEvents`. A Scope that
 * resolves to `unlinked` yields an empty list on purpose: matching a declaration against
 * events the runtime could not attribute is how the original defect worked.
 *
 * @param built - the result of `buildSkillRuntimeScopes`.
 * @param skillName - the Skill being aligned.
 * @returns normalized events inside the Scope, or `[]`.
 */
export function scopedRuntimeEvents(built, skillName) {
  const { scopes } = scopesForSkillName(built, skillName)
  if (scopes.length === 0) return []
  // A Skill loaded more than once has one Scope per run; alignment reads their union.
  const seen = new Set()
  const members = []
  for (const scope of scopes) for (const entry of scope.observedEvents ?? []) {
    if (seen.has(entry.eventId)) continue
    seen.add(entry.eventId)
    members.push(entry)
  }
  return members.map((entry) => ({
    eventId: entry.eventId,
    type: entry.type,
    source: entry.source,
    capabilityId: entry.capabilityId,
    evidenceType: entry.evidenceType,
    evidenceCategory: entry.evidenceCategory,
    evidenceSpecific: entry.evidenceSpecific,
    modelIntentPresent: entry.modelIntentPresent,
    modelIntentKind: entry.modelIntentKind,
    capabilityName: entry.capabilityName,
    invocationId: entry.invocationId,
    turn: entry.turn,
    step: entry.step,
    status: entry.status,
  }))
}

/**
 * Project Skill Runtime Scopes onto the node ids a layout actually draws.
 *
 * This is the **View Model** step and nothing else:
 *
 *     Runtime Event → Runtime Scope → Runtime View Model → Canvas Highlight
 *
 * The Scopes are built by `buildSkillRuntimeScopes`; this does not re-derive them. It only
 * translates their `invocationId`s into layout node ids, following the same member-containment
 * the layout already applies when it folds nodes into groups. Whoever renders the canvas is
 * then told which drawn nodes carry scope — it never infers a scope of its own.
 *
 * It lives here rather than in the Host because it is pure, it belongs to the Scope model, and
 * keeping it out of the Host is what makes it testable without a running DSH.
 *
 * @param built - the result of `buildSkillRuntimeScopes`.
 * @param layout - a layout including member ids.
 * @returns `{ scopes, unlinked, stats }` with `inScopeNodeIds` per scope, ascending and unique.
 */
export function projectScopesOntoLayout(built, layout) {
  // graphNodeId → the layout node standing for it (itself, or the group that absorbed it)
  const ownerOf = new Map()
  for (const node of layout?.nodes ?? []) {
    ownerOf.set(node.id, node.id)
    for (const member of node.memberIds ?? []) ownerOf.set(member, node.id)
  }
  const project = (scope) => {
    const ids = new Set()
    for (const entry of scope.observedEvents ?? []) {
      if (!entry.invocationId) continue
      const drawn = ownerOf.get(`invocation:${entry.invocationId}`)
      if (drawn) ids.add(drawn)
    }
    return { ...scope, inScopeNodeIds: [...ids].sort() }
  }
  return {
    scopes: (built?.scopes ?? []).map(project),
    // An unlinked load has no scope, so it highlights nothing — reported, never guessed at.
    unlinked: (built?.unlinked ?? []).map((record) => ({ ...record, inScopeNodeIds: [] })),
    stats: built?.stats ?? null,
  }
}

/**
 * One record per Skill load — the run boundary that scope union erases.
 *
 * `scopedRuntimeEvents` merges every Scope a Skill has into one event set, which is fine for
 * answering "what evidence exists for this Skill" and wrong for "what did *this* run do". A
 * Skill loaded in turn 3 and again in turn 8 becomes two runs here, each with its own evidence.
 *
 * This is a projection, not a schema change: it reads the Scopes already built and adds no
 * persistence, so nothing downstream is forced to move yet.
 *
 * @param built - the result of `buildSkillRuntimeScopes`.
 * @param skillName - the Skill to project.
 * @returns `{ runs }`, one entry per load, in load order. Unlinked loads produce no run.
 */
export function skillRunsFor(built, skillName) {
  const { scopes, unlinked } = scopesForSkillName(built, skillName)
  const runs = scopes.map((scope, index) => {
    const events = scope.observedEvents ?? []
    return {
      runId: `${skillName}#${index + 1}`,
      runIndex: index + 1,
      skillName,
      invocationId: scope.invocationId ?? null,
      turn: scope.turnRange?.from ?? null,
      stepRange: scope.stepRange ?? null,
      startEventId: scope.startEventId ?? null,
      endEventId: scope.endEventId ?? null,
      eventIds: scope.eventIds ?? [],
      // Each run keeps its own members. Callers that need the union still have
      // `scopedRuntimeEvents`; callers asking "which run" must use this.
      observedEvents: events,
    }
  })
  return {
    runs,
    // A load the runtime cannot bound is reported, not folded into a neighbouring run.
    unlinked: unlinked.map((record) => ({ skillName, derivation: record.derivation, reason: record.reason })),
  }
}

/** The load-events a Scope's members can be traced back to, for auditing. */
export const SCOPE_EVIDENCE_RULE = 'every-scope-event-cites-a-runtime-event-id'
