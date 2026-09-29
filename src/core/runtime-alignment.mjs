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

export const ALIGNMENT_MODEL_VERSION = 1

/**
 * The step vocabulary both sides are mapped into.
 *
 * `plan` is a real member with a real, narrow runtime surface (`todo_write`).
 * When that surface is absent the step is `insufficient` — which is the whole
 * point: planning usually cannot be proven from outside.
 */
export const STEP_KINDS = ['inspect', 'edit', 'execute', 'delegate', 'consult', 'produce', 'plan', 'other']

/**
 * Evidence states.
 *
 * `not-observed` is deliberately absent: it would assert that the Agent skipped a
 * step, which no amount of missing runtime data can establish.
 */
export const ALIGNMENT_STATUSES = ['observed', 'partial', 'insufficient', 'unknown']

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
  observed: '本次运行观察到与该步骤直接对应的 Runtime 证据；这不证明该步骤被完整或正确执行。',
  partial: '只观察到泛化证据或未完成的调用，无法证明就是该步骤。',
  insufficient: '未观察到能对应到该步骤的 Runtime 证据。证据不足不等于 Agent 没有执行该步骤。',
  unknown: '本次会话没有可对齐的 Runtime 证据，无法判断。',
}

// Declaration-side keyword rules. Coarse and deterministic on purpose: a step
// title is prose, and this only decides which runtime surface could correspond.
// Order matters — the first match wins, so specific verbs are tested first.
const STEP_KIND_RULES = [
  { kind: 'execute', pattern: /run|execute|build|test|lint|verify|validate|命令|运行|执行|测试|构建|校验|跑/i },
  { kind: 'edit', pattern: /edit|write|implement|fix|modify|refactor|patch|修改|实现|编写|修复|重构|落地|写入/i },
  { kind: 'delegate', pattern: /delegate|subagent|sub-agent|spawn|委派|子代理|并行处理/i },
  { kind: 'consult', pattern: /\bmcp\b|fetch|download|external api|drill into docs|联网|外部|查文档|调用接口/i },
  { kind: 'produce', pattern: /report|summari[sz]e|output|publish|present|deliver|输出|总结|报告|交付|发布|生成结果/i },
  { kind: 'inspect', pattern: /inspect|read|review|search|explore|investigate|look\s|grep|diff|浏览|查看|阅读|搜索|调研|了解|核实|审查|复核|评审|检查/i },
  { kind: 'plan', pattern: /plan|design|decide|prioriti[sz]e|break\s?down|规划|计划|设计|方案|拆解|分析|决策|排期/i },
]

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

function normalizeTitle(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    // Underscores are deliberately kept: `SPIKE_METHOD_LOADED` is an identifier,
    // not emphasis, and stripping them would silently rewrite the declaration.
    .replace(/[`*>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

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
 * Map one declared step title onto the shared step vocabulary.
 * @param title - the declared step text.
 * @returns a step kind, or `other` when no rule applies.
 */
export function classifyStepKind(title) {
  const text = normalizeTitle(title)
  if (!text) return 'other'
  for (const rule of STEP_KIND_RULES) {
    if (rule.pattern.test(text)) return rule.kind
  }
  return 'other'
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

function isProcessSection(title) {
  return /流程|步骤|steps?|procedure|process|workflow|工作流|执行顺序|pipeline/i.test(title ?? '')
}

function splitOrdinal(text) {
  const match = /^(\d{1,2})\s*[.)、:：]\s*(.+)$/.exec(text)
  return match ? match[2].trim() : text
}

/**
 * Extract declared steps from a Skill body using two channels.
 *
 * Headings describe a declared process far more faithfully than stray numbered
 * lists, which in real Skills are usually conditional branches, constraint lists,
 * or routing rules rather than steps. So headings win whenever they yield a step.
 *
 * The ordered-list channel is narrower still: items qualify only inside a
 * process-ish section, or in a body with no sections at all (plain numbered
 * instructions). A Skill whose body lists constraints under `## 硬约束` and hides
 * its real process in a referenced file genuinely declares no steps *here*, and
 * saying so is more useful than relabelling its constraints as a process.
 *
 * @param instructions - the `<skill_instructions>` body.
 * @returns `{ steps, channel, headingCount, orderedListCount, note }`.
 */
export function extractDeclarationSteps(instructions) {
  const text = typeof instructions === 'string' ? instructions : ''
  if (!text) return { steps: [], channel: null, headingCount: 0, orderedListCount: 0, note: 'no-instructions' }

  const headingSteps = []
  const listSteps = []
  let inProcessSection = false
  let hasSections = false
  let position = 0

  for (const rawLine of text.split(/\r?\n/)) {
    position += 1
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(rawLine)
    if (heading) {
      const level = heading[1].length
      const raw = heading[2]
      const title = normalizeTitle(splitOrdinal(raw))
      const numbered = splitOrdinal(raw) !== raw
      if (level === 1) continue
      if (level === 2) {
        // A level-2 heading that opens a process section names the section, not a
        // step — so it is not carried, but its children are.
        hasSections = true
        inProcessSection = isProcessSection(title)
        if (numbered && title) headingSteps.push({ title, position, evidenceType: 'heading' })
        continue
      }
      // Deeper headings count as steps inside a declared process, or when they
      // carry their own ordinal. Precision is preferred over recall: inventing a
      // step that the Skill never declared corrupts every alignment below it.
      if (title && (inProcessSection || numbered)) {
        headingSteps.push({ title, position, evidenceType: 'heading' })
      }
      continue
    }
    const item = /^\s{0,3}\d{1,2}\s*[.)]\s+(.+)$/.exec(rawLine)
    if (item) {
      const title = normalizeTitle(item[1])
      if (title) listSteps.push({ title, position, evidenceType: 'ordered-list', inProcess: inProcessSection })
    }
  }

  const headingCount = headingSteps.length
  const orderedListCount = listSteps.length
  // In a sectioned body, only a process section's list describes a process.
  const usableList = hasSections ? listSteps.filter((step) => step.inProcess) : listSteps
  const channel = headingCount ? 'heading' : (usableList.length ? 'ordered-list' : null)
  const chosen = headingCount ? headingSteps : usableList

  const steps = []
  const seen = new Set()
  for (const step of chosen) {
    const key = step.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    steps.push({
      order: steps.length + 1,
      title: step.title,
      kind: classifyStepKind(step.title),
      evidenceType: step.evidenceType,
    })
    if (steps.length >= DECLARATION_STEP_LIMIT) break
  }

  // Say why nothing was declared, so an empty declaration is not mistaken for a
  // Skill that has no process.
  let note = null
  if (!steps.length) {
    if (hasSections && orderedListCount) note = 'numbered-items-outside-a-process-section'
    else if (!hasSections && !orderedListCount) note = 'no-declared-process'
  }
  return { steps, channel, headingCount, orderedListCount, note }
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

function alignStep(step, annotatedInvocations, hasRuntime) {
  const item = {
    declarationStepId: `declared:${step.order}`,
    order: step.order,
    title: step.title,
    kind: step.kind,
    evidenceType: step.evidenceType,
    status: 'insufficient',
    observedNodeIds: [],
    evidenceIds: [],
    matchedCapabilities: [],
    matchCount: 0,
    limitation: STEP_LIMITATIONS.insufficient,
  }
  if (!hasRuntime) {
    item.status = 'unknown'
    item.limitation = STEP_LIMITATIONS.unknown
    return item
  }
  if (step.kind === 'other') {
    // No rule maps this step onto any runtime surface, so nothing can corroborate it.
    return item
  }

  const matches = annotatedInvocations.filter((entry) => entry.step.kind === step.kind)
  if (matches.length === 0) return item

  item.matchCount = matches.length
  item.observedNodeIds = matches.slice(0, ALIGNMENT_NODE_LIMIT).map((entry) => `invocation:${entry.invocation.invocationId}`)
  item.evidenceIds = [...new Set(matches.flatMap((entry) => entry.invocation.evidenceEventIds))]
    .slice(0, ALIGNMENT_EVIDENCE_LIMIT)
  item.matchedCapabilities = [...new Set(matches.map((entry) => entry.invocation.kind))]

  const direct = matches.filter((entry) => !entry.step.generic)
  if (direct.length === 0) {
    // Only a catch-all capability matched: something ran, but not provably this.
    item.status = 'partial'
    item.limitation = STEP_LIMITATIONS.partial
    return item
  }
  const settled = direct.filter((entry) => entry.invocation.resolution === 'matched')
  if (settled.length === 0) {
    item.status = 'partial'
    item.limitation = STEP_LIMITATIONS.partial
    return item
  }
  // Strength is not specificity. A settled match inside the Scope proves a capability of the
  // right kind ran *here*; it does not prove it ran *for this step*. Only evidence that names
  // the step's object may reach `observed`, and no current Runtime source can.
  const specific = settled.filter((entry) => entry.specificity === 'direct')
  if (specific.length === 0) {
    item.status = 'partial'
    item.limitation = STEP_LIMITATIONS.partial
    return item
  }
  item.status = 'observed'
  item.limitation = STEP_LIMITATIONS.observed
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
function scopeSummary(scopeIndex, skillName) {
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

export function buildAlignment(receipt, skillName) {
  const declared = declaredStepsFor(receipt, skillName)
  const steps = declared.steps
  const scopeIndex = buildSkillRuntimeScopes(receipt)
  const scoped = scopedRuntimeEvents(scopeIndex, skillName)
  const invocations = aggregateInvocations(scoped)
  const annotated = invocations.map((invocation) => ({
    invocation,
    specificity: invocationSpecificity(invocation),
    step: classifyInvocationStep(invocation.name, invocation.kind),
  }))
  const hasRuntime = invocations.length > 0
  const items = steps.map((step) => alignStep(step, annotated, hasRuntime))

  const entries = receipt?.catalogPublished?.entries
  const inPublishedCatalog = Array.isArray(entries) && entries.length
    ? entries.some((entry) => entry.name === skillName)
    : null

  const stats = Object.fromEntries(ALIGNMENT_STATUSES.map((status) => [status, 0]))
  for (const item of items) stats[item.status] += 1

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
