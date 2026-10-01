/**
 * The Skill-first view model: the server-side composer that makes a Skill a product object.
 *
 * The client must not reason about Skills. Everything the interface shows about one Skill —
 * what it is, what it declares, when it ran, what evidence those runs left, and where its
 * source lives — is assembled here, in one place, as one object. That is what stops the
 * product from drifting back into "the client stitches Skill facts out of runtime graphs".
 *
 * Two invariants hold across this module, and both are asserted by tests:
 *
 *   1. **The declared flow comes from the definition.** `buildSkillDetail` extracts the flow
 *      from `definition.content.text` and only then calls `alignStep` to fill each step's
 *      `evidence`. A receipt with no runtime events therefore still produces the full flow.
 *   2. **Evidence cannot rewrite the flow.** `attachEvidenceToFlow` copies `id`, `order`,
 *      `title`, `kind`, `line` and `evidenceType` from the definition-derived step and reads
 *      nothing else from the alignment item. The runtime may colour a step in; it may not
 *      rename it, reorder it or invent it.
 *
 * Nothing here is persisted. The definition body is read live by the host, passed in, and
 * returned once.
 */

import { extractDeclaredFlow, flowAnchors } from './skill-flow.mjs'
import { alignStep, annotatedInvocationsFor, scopeSummary } from './runtime-alignment.mjs'
import { compareDefinitionToRun } from './skill-definition.mjs'
import { buildSkillFramework } from './skill-framework.mjs'
import { buildSkillRuntimeLogic } from './skill-runtime-logic.mjs'

export const SKILL_VIEW_SCHEMA_VERSION = 1

export const SKILL_DEFINITION_STATUSES = ['available', 'unknown-skill', 'registry-unavailable', 'invalid-skill-name']

export const SKILL_LIST_LIMITATIONS = {
  registryUnavailable: 'registry-unavailable-so-descriptions-and-definition-status-are-missing',
}

export const SKILL_DETAIL_LIMITATIONS = {
  definitionUnavailable: 'definition-unavailable-so-no-declared-flow-could-be-extracted',
  noRunsRecorded: 'this-session-recorded-no-successful-load-of-this-skill',
}

function loadedTraces(receipt, skillName) {
  const traces = Array.isArray(receipt?.traceEvents) ? receipt.traceEvents : []
  return traces.filter((trace) => trace?.status === 'loaded' && (!skillName || trace?.skillName === skillName))
}

function timestampOf(trace) {
  const value = trace?.resolvedAt ?? trace?.requestedAt
  return Number.isSafeInteger(value) ? value : null
}

/**
 * Every Skill this session actually loaded, most recently used first.
 *
 * The list is built from load evidence only. A Skill that the registry can discover but that
 * this session never loaded is **not** part of "本次使用的 Skill" — it belongs to the separate
 * read-only catalog, and merging the two would answer a different question than the one the
 * user asked.
 *
 * @param receipt - the session receipt.
 * @param extras.lookup - optional `(name) => { description, source, provider, definitionStatus,
 *   repositoryStatus }`, supplied by the host because it needs the live registry.
 */
export function buildSessionSkillList(receipt, extras = {}) {
  const lookup = typeof extras.lookup === 'function' ? extras.lookup : null
  const byName = new Map()

  for (const trace of loadedTraces(receipt)) {
    const name = typeof trace?.skillName === 'string' ? trace.skillName : ''
    if (!name) continue
    const existing = byName.get(name) ?? { name, runCount: 0, lastLoadedAt: null, lastInvocationType: null, firstIndex: byName.size }
    existing.runCount += 1
    const at = timestampOf(trace)
    if (at !== null && (existing.lastLoadedAt === null || at > existing.lastLoadedAt)) existing.lastLoadedAt = at
    if (at !== null && at === existing.lastLoadedAt) existing.lastInvocationType = trace.invocationType ?? existing.lastInvocationType
    else if (existing.lastInvocationType === null) existing.lastInvocationType = trace.invocationType ?? null
    byName.set(name, existing)
  }

  const skills = [...byName.values()]
    .sort((a, b) => {
      const left = a.lastLoadedAt ?? -1
      const right = b.lastLoadedAt ?? -1
      if (left !== right) return right - left
      return a.name.localeCompare(b.name)
    })
    .map((entry) => {
      const extra = lookup ? (lookup(entry.name) ?? {}) : {}
      return {
        name: entry.name,
        description: extra.description ?? null,
        source: extra.source ?? null,
        provider: extra.provider ?? null,
        runCount: entry.runCount,
        lastLoadedAt: entry.lastLoadedAt,
        lastInvocationType: entry.lastInvocationType,
        definitionStatus: extra.definitionStatus ?? 'registry-unavailable',
        repositoryStatus: extra.repositoryStatus ?? null,
      }
    })

  const limitations = []
  if (!lookup) limitations.push(SKILL_LIST_LIMITATIONS.registryUnavailable)

  return {
    schemaVersion: SKILL_VIEW_SCHEMA_VERSION,
    sessionId: receipt?.sessionId ?? null,
    scope: 'session-loaded-skills-only',
    skills,
    skillCount: skills.length,
    limitations,
  }
}

/**
 * One Skill's runs in this session, as product objects rather than as trace events.
 *
 * DSH has no native run id, and this module will not invent one: `runKey` is the event id the
 * harness itself assigned, and `turn`/`step`/`requestedAt` are carried alongside it.
 */
export function buildSkillRuns(receipt, skillName, observation = null) {
  return loadedTraces(receipt, skillName).map((trace) => ({
    runKey: trace.eventId,
    eventId: trace.eventId,
    skillName: trace.skillName,
    status: trace.status,
    invocationType: trace.invocationType ?? null,
    turn: Number.isSafeInteger(trace.turn) ? trace.turn : null,
    step: Number.isSafeInteger(trace.step) ? trace.step : null,
    callSeq: trace.callSeq ?? null,
    resultSeq: trace.resultSeq ?? null,
    requestedAt: timestampOf(trace),
    consumer: trace.consumer ?? null,
    consumerIdentity: trace.consumerIdentity ?? null,
    coverage: trace.coverage ?? null,
    evidenceFingerprint: trace.evidenceFingerprint ?? null,
    definitionSnapshot: observation
      ? {
          observedInstructionSha256: trace.evidenceFingerprint?.value ?? null,
          currentInstructionSha256: observation.currentInstructionSha256 ?? null,
          match: definitionSnapshotMatch(trace, observation),
        }
      : null,
  }))
}

function definitionSnapshotMatch(trace, observation) {
  const observed = trace?.evidenceFingerprint?.value ?? null
  const current = observation?.currentInstructionSha256 ?? null
  // One side missing is `unavailable`, never `mismatch`: a hash that does not exist is not
  // evidence that the file changed, and reporting it as a change would be a fabricated finding.
  if (!observed || !current) return 'unavailable'
  return observed === current ? 'match' : 'mismatch'
}

/**
 * Copy only the fields a definition-derived step does not own.
 *
 * `id`, `order`, `title`, `kind`, `line` and `evidenceType` come from the flow and are never
 * overwritten — that is invariant 2 in the module header, and the reason a run cannot rewrite
 * what the Skill declared.
 */
export function attachEvidenceToFlow(flow, annotatedInvocations, hasRuntime) {
  const steps = (flow?.steps ?? []).map((step) => {
    const item = alignStep(step, annotatedInvocations, hasRuntime)
    return {
      id: step.id,
      order: step.order,
      title: step.title,
      kind: step.kind,
      line: step.line,
      evidenceType: step.evidenceType,
      evidence: {
        relationship: item.relationship,
        limitation: item.limitation ?? null,
        runtimeEvidence: item.runtimeEvidence ?? [],
        observedNodeIds: item.observedNodeIds ?? [],
        evidenceIds: item.evidenceIds ?? [],
        matchedCapabilities: item.matchedCapabilities ?? [],
        matchCount: item.matchCount ?? 0,
        modelIntent: item.modelIntent ?? { present: false },
      },
    }
  })
  return { ...flow, steps, stepCount: steps.length }
}

/**
 * The evidence behind one Skill, with no argument text anywhere.
 *
 * Invocations carry categories and booleans only — never the command, the path or the query
 * that produced them. That rule lives upstream in `runtime-evidence.mjs`; this projection keeps
 * it true at the boundary.
 */
export function projectSkillEvidence(receipt, skillName) {
  const { annotated, scopeIndex, hasRuntime } = annotatedInvocationsFor(receipt, skillName)
  // The load itself is the run's start, not evidence for a declared step — the interface shows it
  // as the start block, so it must not also appear as a numbered step's evidence. It is identified
  // by the callId the harness assigned to the load, never by matching on the tool's name.
  const loadCallIds = new Set(
    (receipt?.traceEvents ?? [])
      .filter((trace) => trace?.status === 'loaded' && typeof trace.callId === 'string')
      .map((trace) => trace.callId),
  )
  const evidenced = annotated.filter((entry) => !loadCallIds.has(entry.invocation.invocationId))
  return {
    hasRuntime,
    scope: scopeSummary(scopeIndex, skillName),
    invocations: evidenced.map((entry) => ({
      invocationId: entry.invocation.invocationId ?? null,
      name: entry.invocation.name ?? null,
      kind: entry.invocation.kind ?? null,
      resolution: entry.invocation.resolution ?? null,
      status: entry.invocation.status ?? null,
      evidenceCategory: entry.invocation.evidenceCategory ?? null,
      evidenceSpecific: entry.invocation.evidenceSpecific === true,
      modelIntentPresent: entry.invocation.modelIntentPresent === true,
      modelIntentKind: entry.invocation.modelIntentKind ?? null,
      turn: Number.isSafeInteger(entry.invocation.turn) ? entry.invocation.turn : null,
      step: Number.isSafeInteger(entry.invocation.step) ? entry.invocation.step : null,
      stepKind: entry.step?.kind ?? null,
      specificity: entry.specificity ?? null,
    })),
    invocationCount: evidenced.length,
  }
}

/**
 * Assemble the whole Skill.
 *
 * @param options.receipt - the session receipt (runtime evidence, runs, catalog facts).
 * @param options.view - the result of `buildSkillDefinitionView`, or `null` when the host could
 *   not read it. The definition body is read live by the host; this function never reads it.
 * @param options.skillName - the Skill being viewed.
 * @param options.listEntry - the matching entry from `buildSessionSkillList`, when available.
 */
export function buildSkillDetail(options = {}) {
  const receipt = options.receipt ?? null
  const view = options.view ?? null
  const skillName = typeof options.skillName === 'string' ? options.skillName : ''
  const listEntry = options.listEntry ?? null

  const observation = compareDefinitionToRun(receipt, skillName, view)
  const runs = buildSkillRuns(receipt, skillName, observation)
  const evidence = projectSkillEvidence(receipt, skillName)

  const limitations = []
  const definitionAvailable = view?.available === true && typeof view?.content?.text === 'string'

  let flow
  if (definitionAvailable) {
    flow = extractDeclaredFlow(view.content.text, { truncated: view.content.truncated === true })
    const { annotated, hasRuntime } = annotatedInvocationsFor(receipt, skillName)
    flow = attachEvidenceToFlow(flow, annotated, hasRuntime)
  } else {
    // No definition, no declared flow. An empty flow is honest; synthesising steps out of the
    // run's invocations would be exactly the runtime-first inversion this refactor removes.
    flow = {
      schemaVersion: 1,
      source: 'definition',
      steps: [],
      channel: null,
      note: null,
      headingCount: 0,
      orderedListCount: 0,
      stepCount: 0,
      truncated: false,
      withheldCount: 0,
      limitations: [],
    }
    limitations.push(SKILL_DETAIL_LIMITATIONS.definitionUnavailable)
  }
  for (const item of flow.limitations ?? []) limitations.push(item)
  if (runs.length === 0) limitations.push(SKILL_DETAIL_LIMITATIONS.noRunsRecorded)
  for (const item of view?.limitations ?? []) limitations.push(item)

  const anchors = {}
  if (definitionAvailable) {
    for (const [stepId, entryId] of flowAnchors(flow, { entries: view.outline ?? [] })) anchors[stepId] = entryId
  }

  // The framework is the Skill's *shape*; the flow above is one module inside it. Both are read
  // from the same definition body, deterministic and offline, and neither can be derived from the
  // run — which is why the framework is built before any runtime data is folded in.
  let framework = null
  if (definitionAvailable) {
    framework = buildSkillFramework({
      content: view.content.text,
      outline: view.outline ?? [],
      summary: view.summary ?? null,
      truncated: view.content.truncated === true,
      resourceBase: view.resourceBase ?? null,
    })
    for (const section of framework.sections) {
      if (section.anchorId && !anchors[section.id]) anchors[section.id] = section.anchorId
    }
    for (const item of framework.limitations) limitations.push(item)
  }

  // Step states are counted where the steps are built, so the runtime view reports the same
  // states the step list shows. Two independent tallies would eventually disagree.
  const stepStates = {}
  for (const step of flow.steps) {
    const relationship = step?.evidence?.relationship ?? 'unknown'
    stepStates[relationship] = (stepStates[relationship] ?? 0) + 1
  }
  const runtimeLogic = buildSkillRuntimeLogic({
    receipt,
    runs,
    evidence,
    observation,
    stepStates,
  })
  for (const item of runtimeLogic.limitations) limitations.push(item)

  return {
    schemaVersion: SKILL_VIEW_SCHEMA_VERSION,
    skillName,
    summary: {
      name: skillName,
      description: view?.summary?.description ?? listEntry?.description ?? null,
      whenToUse: view?.summary?.whenToUse ?? null,
      invocation: view?.summary?.invocation ?? null,
      source: view?.summary?.source ?? listEntry?.source ?? null,
      provider: view?.summary?.provider ?? listEntry?.provider ?? null,
      runCount: listEntry?.runCount ?? runs.length,
      lastLoadedAt: listEntry?.lastLoadedAt ?? runs[0]?.requestedAt ?? null,
      definitionStatus: view?.available === true ? 'available' : (view?.reason ?? 'registry-unavailable'),
      definitionReason: view?.available === true ? null : (view?.reason ?? null),
    },
    definition: view,
    framework,
    flow,
    anchors,
    runs,
    evidence,
    runtimeLogic,
    repository: view?.repository ?? null,
    observation,
    limitations,
  }
}
