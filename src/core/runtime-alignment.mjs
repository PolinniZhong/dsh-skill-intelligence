/**
 * Declaration ↔ Runtime Alignment.
 *
 * This is the step the product turns on: it puts what a Skill *said* to do next
 * to what the run actually left evidence for, without pretending the two can be
 * matched perfectly.
 *
 * Three commitments hold throughout.
 *
 * 1. **No score.** There is no compliance rate, no percentage, no ranking. Counts
 *    of evidence states are reported; judgments are not.
 * 2. **Absence of evidence is not evidence of absence.** A declared step with no
 *    matching runtime evidence is `insufficient`, never "not done". Much of what a
 *    Skill asks for — deciding, weighing, planning — leaves no external trace, so
 *    the honest answer is that the data cannot show it.
 * 3. **Direct evidence is not generic evidence.** A `bash` call proves a command
 *    ran; it does not prove the test step ran, because tool arguments are not
 *    stored. A step matched only by a catch-all capability is `partial`.
 *
 * @module runtime-alignment
 */

import { aggregateInvocations } from './runtime-events.mjs'
import { buildSkillRuntimeScopes, scopesForSkillName, scopedRuntimeEvents } from './skill-runtime-scope.mjs'
// The step vocabulary is shared with `runtime-evidence.mjs`, which classifies the model's own
// `description` into the same kinds. One copy of the rules lives in `step-kind.mjs` so the two
// sides cannot drift apart and start agreeing by accident.
import { STEP_KINDS, normalizeTitle, classifyStepKind } from './step-kind.mjs'
// The declaration scanner moved to the *definition* side, because the declared flow is a
// property of the Skill's own text and not of any run. It is imported back here so the stored
// `continuityCandidate` path keeps parsing with exactly one set of rules.
import { scanDeclaredSteps } from './skill-flow.mjs'

export { STEP_KINDS, classifyStepKind }

export const ALIGNMENT_MODEL_VERSION = 1

/**
 * Evidence states.
 *
 * `not-observed` is deliberately absent: it would assert that the Agent skipped a
 * step, which no amount of missing runtime data can establish.
 */
// `observed` is gone as a name. It read as "the runtime observed this step", which the runtime
// never said: a capability name proves a capability ran, and `runtime-supported` says exactly
// that and no more. `intent-supported` is new — the model's own account of what it meant to do,
// kept in a separate state because it is not a runtime fact.
export const ALIGNMENT_RELATIONSHIPS = ['runtime-supported', 'intent-supported', 'partial', 'insufficient', 'unknown']

/** Which channel produced a declared step, so the extraction stays auditable. */
export const STEP_EXTRACTION_CHANNELS = ['heading', 'ordered-list']

/** How many declared steps are carried forward. */
export const DECLARATION_STEP_LIMIT = 12

/**
 * How a Skill load is tied to the call that asked for it.
 *
 * A Skill's *name* is never derived from tool arguments — those are not stored, by
 * design. It comes from the load evidence instead: the trace event carries the name,
 * and both a model-invoked `skill` call and a user-explicit `/name` load produce their
 * own runtime event with a `turn` and a `step`, so either can be matched to a node.
 *
 * Measured over the real sessions on this machine, 11 of 13 loads resolve to exactly
 * one node. The other two match no single call, and are left unlinked.
 */
export const SKILL_LOAD_JOIN_RULE = 'load-and-call-share-turn-step'

/**
 * A citation is a pointer, not a dump. A generic step like "run the tests" can
 * match hundreds of calls, so the node and evidence lists are bounded samples
 * while `matchCount` still reports the true total.
 */
export const ALIGNMENT_NODE_LIMIT = 12
export const ALIGNMENT_EVIDENCE_LIMIT = 24

const STEP_LIMITATIONS = {
  'runtime-supported': 'Runtime 输入本身支持这个声明动作（例如一个可识别的测试命令）。这证明该动作发生过，不证明结果正确，也不证明它服务于这个 Skill 的意图。',
  'intent-supported': '只有模型自己写的 description 与声明有明显对应。description 是模型的意图陈述，不是 Runtime 事实。',
  partial: '只观察到能力层面的对应，Runtime 输入不足以支持这个具体声明步骤。',
  insufficient: '本次 Scope 内未观察到能对应到该步骤的 Runtime 证据。证据不足不等于 Agent 没有执行该步骤。',
  unknown: '本次会话没有可对齐的 Runtime 证据，无法判断。',
}

// Which evidence categories can support which declared step kind.
//
// A closed table, not a similarity score. `execute` is supported by a recognised build/test/lint
// command and not by a directory listing, however recently it ran. `inspect` is supported only by
// a query, never by a file target — the path is deliberately not kept, so "a source file was
// read" cannot become "the declared module was read". A kind absent here is never supported.
// Category → evidence type, so the breakdown can name where a category came from.
const EVIDENCE_TYPE_OF = {
  test: 'command', build: 'command', lint: 'command', typecheck: 'command', install: 'command',
  git: 'command', 'file-listing': 'command', other: 'command',
  'source-file': 'file-target', 'test-file': 'file-target', config: 'file-target',
  documentation: 'file-target', image: 'file-target',
  query: 'query', 'mcp-call': 'query', delegate: 'delegate', capability: 'generic',
}

const SUPPORTING_CATEGORIES = {
  execute: ['test', 'build', 'lint', 'typecheck', 'install'],
  consult: ['query', 'mcp-call'],
  inspect: ['query'],
  delegate: ['delegate'],
}

// Declaration-side keyword rules now live in `step-kind.mjs`, together with `classifyStepKind`
// and `normalizeTitle`, because `runtime-evidence.mjs` classifies the model's `description`
// with the very same rules. See that module for why one copy matters.

// Runtime-side rules keyed by registered tool name. `generic: true` marks a
// catch-all capability: it proves *something* ran, not what.
const RUNTIME_STEP_RULES = [
  { kind: 'inspect', generic: false, names: ['read', 'read_file', 'grep', 'glob', 'web_fetch', 'web_search', 'ls', 'list_dir', 'notebook_read'] },
  { kind: 'edit', generic: false, names: ['edit', 'write', 'str_replace_editor', 'apply_patch', 'multi_edit', 'notebook_edit'] },
  { kind: 'execute', generic: true, names: ['bash', 'pwsh', 'shell', 'sh', 'zsh', 'exec', 'run', 'run_command', 'terminal'] },
  { kind: 'delegate', generic: false, names: ['subagent', 'spawn_agent', 'task'] },
  { kind: 'produce', generic: false, names: ['present', 'publish', 'deliver', 'artifact'] },
  { kind: 'plan', generic: false, names: ['todo_write', 'todo_read', 'todo', 'create_goal', 'update_goal'] },
]

/**
 * How *specifically* an invocation speaks to a declared step.
 *
 * This is a different axis from evidence strength, and conflating the two is what let a
 * same-turn event be reported as `observed`. Strength answers "is this inside a reliable
 * Runtime Scope"; specificity answers "does it name the thing the step names".
 *
 * A registered tool name proves only the **capability that ran**. It says nothing about what
 * the capability was applied to, because tool arguments are never stored and no declaration
 * step carries a correlation id. `read_file` therefore supports "a file was read" — not
 * "the repository's auth module was inspected".
 *
 * The current Runtime model can produce nothing better than `capability`, so `observed` cannot
 * arise from a tool invocation at all. That is the honest reading, not a regression: the status
 * vocabulary keeps `observed` available for the day a Runtime source can name the step's object,
 * and `INVOCATION_SPECIFICITIES` is where such a source would declare itself. Until then the
 * seam stays empty on purpose.
 *
 * @param invocation - one aggregated invocation.
 * @returns `capability` today; `direct` only once a Runtime source can identify the step's object.
 */
export function invocationSpecificity(invocation) {
  // No Runtime source currently names the object a capability was applied to. A future
  // declaration-step correlation id, or a recorded tool argument, would be checked here.
  void invocation
  return 'capability'
}

/**
 * Map one runtime invocation onto the shared step vocabulary.
 *
 * The decision uses the registered tool name only. Tool arguments are not stored,
 * so a generic capability is reported as generic rather than assumed to be the
 * specific command a declared step described.
 * @param name - the invocation's registered tool name.
 * @param capabilityId - the invocation's capability kind, when known.
 * @returns `{ kind, generic }`.
 */
export function classifyInvocationStep(name, capabilityId) {
  const tool = typeof name === 'string' ? name : ''
  if (tool.startsWith('mcp__')) return { kind: 'consult', generic: false }
  for (const rule of RUNTIME_STEP_RULES) {
    if (rule.names.includes(tool)) return { kind: rule.kind, generic: rule.generic }
  }
  if (capabilityId === 'mcp') return { kind: 'consult', generic: false }
  if (capabilityId === 'subagent') return { kind: 'delegate', generic: false }
  // An unrecognised tool is not forced into a step kind it may not belong to.
  return { kind: 'other', generic: false }
}

/**
 * Extract declared steps from a Skill body using two channels.
 *
 * The rules now live in `skill-flow.mjs`, on the definition side, because the declared
 * flow belongs to the Skill's own text rather than to any run. This wrapper keeps the
 * receipt path (`trace-reducer.mjs` reading a stored `continuityCandidate`) byte-identical
 * to what it produced before the move: same channels, same ordering, same cap.
 *
 * @param instructions - the `<skill_instructions>` body.
 * @returns `{ steps, channel, headingCount, orderedListCount, note }`.
 */
export function extractDeclarationSteps(instructions) {
  const scan = scanDeclaredSteps(instructions)
  return {
    steps: scan.candidates.map((candidate, index) => ({
      order: index + 1,
      title: candidate.title,
      kind: classifyStepKind(candidate.title),
      evidenceType: candidate.evidenceType,
    })),
    channel: scan.channel,
    headingCount: scan.headingCount,
    orderedListCount: scan.orderedListCount,
    note: scan.note,
  }
}

/**
 * Collect the declaration steps recorded for one Skill across this receipt.
 *
 * Extraction happened when the body was observed; the body itself was never
 * stored, so alignment works from the bounded steps that were kept.
 */
function declaredStepsFor(receipt, skillName) {
  const traces = (receipt?.traceEvents ?? []).filter((trace) => trace.skillName === skillName && trace.status === 'loaded')
  const steps = []
  const seen = new Set()
  let channel = null
  let note = null
  for (const trace of traces) {
    if (!channel && STEP_EXTRACTION_CHANNELS.includes(trace.continuityCandidate?.extractionChannel)) {
      channel = trace.continuityCandidate.extractionChannel
    }
    if (!note && typeof trace.continuityCandidate?.extractionNote === 'string') {
      note = trace.continuityCandidate.extractionNote
    }
    for (const step of trace.continuityCandidate?.steps ?? []) {
      const title = normalizeTitle(step?.title)
      if (!title) continue
      const key = title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      steps.push({
        order: steps.length + 1,
        title,
        kind: STEP_KINDS.includes(step?.kind) ? step.kind : classifyStepKind(title),
        evidenceType: STEP_EXTRACTION_CHANNELS.includes(step?.evidenceType) ? step.evidenceType : 'ordered-list',
      })
      if (steps.length >= DECLARATION_STEP_LIMIT) break
    }
    if (steps.length >= DECLARATION_STEP_LIMIT) break
  }
  return { steps, channel: channel ?? (steps.length ? steps[0].evidenceType : null), note }
}

export function alignStep(step, annotatedInvocations, hasRuntime) {
  const item = {
    declarationStepId: `declared:${step.order}`,
    order: step.order,
    title: step.title,
    kind: step.kind,
    evidenceType: step.evidenceType,
    relationship: 'insufficient',
    runtimeEvidence: [],
    modelIntent: { present: false },
    observedNodeIds: [],
    evidenceIds: [],
    matchedCapabilities: [],
    matchCount: 0,
    limitation: STEP_LIMITATIONS.insufficient,
  }
  if (!hasRuntime) {
    item.relationship = 'unknown'
    item.limitation = STEP_LIMITATIONS.unknown
    return item
  }
  if (step.kind === 'other') {
    // No rule maps this step onto any runtime surface, so nothing can corroborate it.
    return item
  }

  const matches = annotatedInvocations.filter((entry) => entry.step.kind === step.kind)
  if (matches.length === 0) {
    // Nothing the runtime ran maps onto this step's kind. Before settling for `insufficient`,
    // ask the narrower question: did the model's own `description` name this kind? A shell call
    // can carry "Confirm the working directory" — the model's account of inspecting state —
    // while the capability it actually ran is an execution. That correspondence is real, and it
    // is exactly one relationship weaker, so it is reported as `intent-supported` rather than
    // being allowed to support the step.
    //
    // The comparison is between two *kinds* produced by the same closed rule table in
    // `step-kind.mjs`, never between two pieces of text: neither the description nor the
    // declared title is ever matched, stored, or returned.
    const intentMatches = annotatedInvocations.filter((entry) => (
      entry.invocation.modelIntentPresent === true
      && entry.invocation.modelIntentKind === step.kind
    ))
    if (intentMatches.length > 0) {
      item.matchCount = intentMatches.length
      // A pointer to where the claim came from. Deliberately no `evidenceIds`: nothing here is
      // runtime evidence, and handing the UI an evidence id would draw an edge that is not there.
      item.observedNodeIds = intentMatches.slice(0, ALIGNMENT_NODE_LIMIT)
        .map((entry) => `invocation:${entry.invocation.invocationId}`)
      item.modelIntent = { present: true }
      item.relationship = 'intent-supported'
      item.limitation = STEP_LIMITATIONS['intent-supported']
    }
    return item
  }

  item.matchCount = matches.length
  item.observedNodeIds = matches.slice(0, ALIGNMENT_NODE_LIMIT).map((entry) => `invocation:${entry.invocation.invocationId}`)
  item.evidenceIds = [...new Set(matches.flatMap((entry) => entry.invocation.evidenceEventIds))]
    .slice(0, ALIGNMENT_EVIDENCE_LIMIT)
  item.matchedCapabilities = [...new Set(matches.map((entry) => entry.invocation.kind))]

  // Evidence specificity outranks the capability's generic flag.
  //
  // `bash` is a catch-all *tool* — `generic: true` — but `npm test` is not a catch-all command.
  // Gating on the tool first meant a recognised test command fell into `partial` before its own
  // category was ever consulted, which is the reverse of what the evidence supports. The flag
  // still bounds what an unclassified command can claim; it does not bound a classified one.
  const evidenceSupporting = SUPPORTING_CATEGORIES[step.kind] ?? []
  const byEvidence = matches.filter((entry) => entry.invocation.resolution === 'matched'
    && evidenceSupporting.includes(entry.invocation.evidenceCategory))
  if (byEvidence.length > 0) {
    item.runtimeEvidence = [...new Set(byEvidence.map((entry) => entry.invocation.evidenceCategory))]
      .map((category) => ({ type: EVIDENCE_TYPE_OF[category] ?? 'command', category }))
    item.modelIntent = { present: byEvidence.some((entry) => entry.invocation.modelIntentPresent === true) }
    item.relationship = 'runtime-supported'
    item.limitation = STEP_LIMITATIONS['runtime-supported']
    return item
  }

  const direct = matches.filter((entry) => !entry.step.generic)
  if (direct.length === 0) {
    // Only a catch-all capability matched: something ran, but not provably this.
    item.relationship = 'partial'
    item.limitation = STEP_LIMITATIONS.partial
    return item
  }
  const settled = direct.filter((entry) => entry.invocation.resolution === 'matched')
  if (settled.length === 0) {
    item.relationship = 'partial'
    item.limitation = STEP_LIMITATIONS.partial
    return item
  }

  // The breakdown. Duplicated categories are collapsed — this reports what kinds of evidence
  // exist, not how many times each occurred.
  item.runtimeEvidence = [...new Set(settled.map((entry) => entry.invocation.evidenceCategory).filter(Boolean))]
    .map((category) => ({ type: EVIDENCE_TYPE_OF[category] ?? 'command', category }))
  item.modelIntent = { present: settled.some((entry) => entry.invocation.modelIntentPresent === true) }

  // Supported only when the runtime input itself is the right kind of thing for this step.
  // A recognised test command supports "run the tests"; a directory listing does not, however
  // recent it is. The model's own description is consulted after that, and lands in a different
  // relationship because it is a different kind of claim.
  const supporting = SUPPORTING_CATEGORIES[step.kind] ?? []
  if (settled.some((entry) => supporting.includes(entry.invocation.evidenceCategory))) {
    item.relationship = 'runtime-supported'
    item.limitation = STEP_LIMITATIONS['runtime-supported']
    return item
  }
  if (item.modelIntent.present) {
    item.relationship = 'intent-supported'
    item.limitation = STEP_LIMITATIONS['intent-supported']
    return item
  }
  item.relationship = 'partial'
  item.limitation = STEP_LIMITATIONS.partial
  return item
}
/**
 * Build the alignment model for one Skill in one receipt.
 *
 * @param receipt - a migrated receipt.
 * @param skillName - the Skill whose declaration is being aligned.
 * @returns the alignment model. Counts of evidence states are reported; no score,
 * rate, or ranking is produced.
 */
/**
 * Declaration ↔ Runtime Alignment, now scoped.
 *
 * The change V0.5 makes: this used to align a declaration against **every runtime event in
 * the session**:
 *
 *     const invocations = aggregateInvocations(receipt?.runtimeEvents ?? [])
 *
 * A session that ran `read` in turn 1, loaded a Skill in turn 2 and ran `test` in turn 3
 * would let that Skill's declared "Inspect → Test" match both — real events, invented
 * attribution.
 *
 * Now the events come from the Skill's Runtime Scope. When no Scope can be established the
 * scoped list is empty on purpose, and every declared step lands in `insufficient`: the
 * honest reading is that the runtime cannot say, not that the work did not happen.
 *
 * The three commitments are unchanged — no score, absence of evidence is not evidence of
 * absence, direct evidence is not generic evidence.
 *
 * @param receipt - the receipt holding both the declaration and the runtime evidence.
 * @param skillName - the Skill to align.
 * @returns the alignment model, including the scope it read from.
 */
/**
 * What the alignment read from, so a reader can see the boundary rather than trust it.
 *
 * Reports the Scope's extent and a sample of what it holds; the full event list lives in the
 * Scope itself and in the inspector, not duplicated here.
 */
export function scopeSummary(scopeIndex, skillName) {
  const { scopes, unlinked } = scopesForSkillName(scopeIndex, skillName)
  if (scopes.length === 0) {
    const record = unlinked[0] ?? null
    return {
      established: false,
      relationStatus: 'unlinked',
      derivation: record?.derivation ?? 'no-load-evidence',
      reason: record?.reason ?? '收据里没有这次 Skill 加载的运行时证据，因此没有可用的 Scope。',
      scopeCount: 0,
      eventCount: 0,
      observedByClass: {},
      turnRange: null,
      timeRange: null,
      limitations: record?.limitation ?? [],
    }
  }
  const observedByClass = {}
  for (const scope of scopes) {
    for (const [key, value] of Object.entries(scope.observedByClass ?? {})) {
      if (!observedByClass[key]) observedByClass[key] = { total: 0, byName: {} }
      observedByClass[key].total += value.total
      for (const [name, count] of Object.entries(value.byName ?? {})) {
        observedByClass[key].byName[name] = (observedByClass[key].byName[name] ?? 0) + count
      }
    }
  }
  const turns = scopes.map((scope) => scope.turnRange).filter(Boolean)
  const times = scopes.map((scope) => scope.timeRange).filter(Boolean)
  return {
    established: true,
    relationStatus: 'correlated',
    derivation: 'same-turn-containment',
    reason: null,
    scopeCount: scopes.length,
    eventCount: scopes.reduce((sum, scope) => sum + scope.eventIds.length, 0),
    observedByClass,
    turnRange: turns.length ? { from: Math.min(...turns.map((t) => t.from)), to: Math.max(...turns.map((t) => t.to)) } : null,
    timeRange: times.length ? { from: Math.min(...times.map((t) => t.from)), to: Math.max(...times.map((t) => t.to)) } : null,
    limitations: scopes[0]?.limitation ?? [],
  }
}

/**
 * The runtime evidence side of alignment, for one Skill.
 *
 * Split out of `buildAlignment` so the Skill-first composer can attach evidence to a
 * flow that came from the *definition* while using exactly the same annotation rules.
 * Steps and evidence are deliberately decoupled here: this function never sees a step
 * list, and `alignStep` never sees a receipt.
 *
 * @returns `{ annotated, hasRuntime, invocations, scopeIndex }`.
 */
export function annotatedInvocationsFor(receipt, skillName) {
  const scopeIndex = buildSkillRuntimeScopes(receipt)
  const scoped = scopedRuntimeEvents(scopeIndex, skillName)
  const invocations = aggregateInvocations(scoped)
  const annotated = invocations.map((invocation) => ({
    invocation,
    specificity: invocationSpecificity(invocation),
    step: classifyInvocationStep(invocation.name, invocation.kind),
  }))
  return { annotated, hasRuntime: invocations.length > 0, invocations, scopeIndex }
}

export function buildAlignment(receipt, skillName) {
  const declared = declaredStepsFor(receipt, skillName)
  const steps = declared.steps
  const { annotated, hasRuntime, scopeIndex } = annotatedInvocationsFor(receipt, skillName)
  const items = steps.map((step) => alignStep(step, annotated, hasRuntime))

  const entries = receipt?.catalogPublished?.entries
  const inPublishedCatalog = Array.isArray(entries) && entries.length
    ? entries.some((entry) => entry.name === skillName)
    : null

  const stats = Object.fromEntries(ALIGNMENT_RELATIONSHIPS.map((key) => [key, 0]))
  for (const item of items) stats[item.relationship] += 1

  return {
    modelVersion: ALIGNMENT_MODEL_VERSION,
    skillName,
    scored: false,
    declaration: {
      skillName,
      stepCount: steps.length,
      channel: declared.channel,
      // Why nothing was declared, when nothing was: a body that lists constraints
      // outside any process section declares no steps, and saying so is not the
      // same as saying the Skill has no process.
      note: declared.note,
      kinds: [...new Set(steps.map((step) => step.kind))],
      inPublishedCatalog,
      catalogEntryCount: Array.isArray(entries) ? entries.length : 0,
    },
    items,
    stats,
    scope: scopeSummary(scopeIndex, skillName),
    note: '对齐只报告证据状态，不给出遵循率或评分；未观察到证据不等于该步骤没有执行。',
  }
}


/**
 * Tie each loaded Skill to the runtime node that invoked it.
 *
 * Only an unambiguous match is reported. A Skill whose load cannot be pinned to
 * exactly one invocation is left out rather than attached to the nearest candidate:
 * showing the wrong Skill's declaration next to a call would be a fabricated
 * relationship, which is the one thing this pipeline must never do.
 *
 * @param receipt - the receipt holding the Skill load evidence.
 * @param graph - the runtime graph holding the invocation nodes.
 * @returns `[{ nodeId, skillName, turn, step, derivation }]`, unambiguous entries only.
 */
export function buildSkillLoadIndex(receipt, graph) {
  const loads = (receipt?.traceEvents ?? []).filter(
    (trace) => trace?.status === 'loaded' && typeof trace.skillName === 'string' && trace.skillName,
  )
  if (loads.length === 0) return []
  const invocations = (graph?.nodes ?? []).filter((node) => node.capabilityId === 'skill')
  if (invocations.length === 0) return []

  // Match every load first, then keep only the calls claimed by exactly one of them.
  // Both kinds of ambiguity are dropped: a load that matches no call or several, and
  // a call claimed by two loads. Each would otherwise put one Skill's declaration
  // beside another Skill's run.
  const byNode = new Map()
  for (const trace of loads) {
    const hits = invocations.filter((node) => node.turn === trace.turn && node.step === trace.step)
    if (hits.length !== 1) continue
    const id = hits[0].id
    if (!byNode.has(id)) byNode.set(id, [])
    byNode.get(id).push(trace)
  }

  const index = []
  for (const [nodeId, traces] of byNode) {
    if (traces.length !== 1) continue
    const trace = traces[0]
    index.push({
      nodeId,
      skillName: trace.skillName,
      turn: trace.turn ?? null,
      step: trace.step ?? null,
      derivation: SKILL_LOAD_JOIN_RULE,
    })
  }
  return index
}
