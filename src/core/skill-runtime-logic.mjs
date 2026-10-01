/**
 * Skill Runtime Logic — what this session could *observe* about one Skill's lifecycle.
 *
 * Not a runtime graph, and deliberately not a flow. The five stages are a fixed lifecycle a
 * Skill passes through in the harness (catalog → load → instructions → capability → evidence);
 * the module reports, per stage, the facts this session actually holds, and says so plainly when
 * it holds none. Nothing here is ordered by timestamps and nothing here links a stage to a tool
 * call, because "the Skill loaded, then 100ms later a tool ran" is a coincidence, not a cause.
 *
 * The state vocabulary is the *same five words* the step-evidence layer uses
 * (`core/flow-evidence.mjs`). One page, one set of words for how much we know: a second
 * vocabulary would let the interface say "loaded" here and "not enough evidence" there about
 * the same fact.
 *
 * Facts are categorical or numeric on purpose. Runtime evidence in this product never carries
 * argument text, so neither does its summary.
 */

import { FLOW_EVIDENCE_FORBIDDEN, flowEvidenceState } from './flow-evidence.mjs'

export const RUNTIME_LOGIC_SCHEMA_VERSION = 1

export const RUNTIME_LOGIC_SOURCE = 'session-observation'

export const RUNTIME_STAGE_IDS = ['catalog', 'load', 'instructions', 'capability', 'evidence']

export const RUNTIME_STAGE_LABELS = {
  catalog: { zh: '目录 · Catalog', en: 'Catalog' },
  load: { zh: '载入 · Load', en: 'Load' },
  instructions: { zh: '指令 · Instructions', en: 'Instructions' },
  capability: { zh: '运行能力 · Runtime Capability', en: 'Runtime capability' },
  evidence: { zh: '证据 · Evidence', en: 'Evidence' },
}

export const RUNTIME_STAGE_HINTS = {
  catalog: { zh: '当前会话发布了哪些可发现的 Skill', en: 'Which Skills this session published as discoverable' },
  load: { zh: '这个 Skill 是否被调用 / 载入', en: 'Whether this Skill was invoked or loaded' },
  instructions: { zh: 'SKILL.md 是否进入了 Skill 载入结果', en: 'Whether SKILL.md reached the Skill load result' },
  capability: { zh: '是否观察到与该 Skill 相关的运行时能力', en: 'Whether related runtime capability was observed' },
  evidence: { zh: '这些运行留下了哪些证据', en: 'What evidence those runs left behind' },
}

/**
 * The stage statements. Static strings, one per stage and state, so a test can assert the exact
 * wording and a translator can find every sentence in one place.
 */
export const RUNTIME_STAGE_STATEMENTS = {
  catalog: {
    'runtime-supported': { zh: '当前会话发布的 Skill 目录中包含这个 Skill。', en: 'The catalog this session published contains this Skill.' },
    insufficient: { zh: '当前会话发布过 Skill 目录，但其中没有这个 Skill。', en: 'This session published a catalog, and this Skill was not in it.' },
    unknown: { zh: '本次会话没有观察到 Skill 目录的发布。', en: 'This session recorded no catalog publication.' },
  },
  load: {
    'runtime-supported': { zh: '本次会话观察到这个 Skill 的载入记录。', en: 'This session recorded a load of this Skill.' },
    insufficient: { zh: '这个 Skill 在目录里可被发现，但本次会话没有记录到载入。', en: 'This Skill is discoverable in the catalog, but no load was recorded.' },
    unknown: { zh: '本次会话既没有目录也没有载入记录，无法判断。', en: 'Neither a catalog nor a load was recorded, so this cannot be judged.' },
  },
  instructions: {
    'runtime-supported': { zh: '载入记录里的指令指纹与当前 SKILL.md 一致。', en: 'The fingerprint on the load record matches the current SKILL.md.' },
    partial: { zh: '载入记录里的指令指纹与当前 SKILL.md 不一致。', en: 'The fingerprint on the load record does not match the current SKILL.md.' },
    insufficient: { zh: '本次会话没有记录这个 Skill 的指令指纹。', en: 'This session recorded no instruction fingerprint for this Skill.' },
  },
  capability: {
    'runtime-supported': { zh: '这个 Skill 的运行时范围已经建立，范围内的事件可以标注到它。', en: 'A runtime scope for this Skill was established, so events inside it can be labelled.' },
    partial: { zh: '运行时范围建立了，但范围内没有任何事件。', en: 'A runtime scope was established, but it holds no events.' },
    unknown: { zh: '运行时事件无法与这个 Skill 关联，能力观察保持为空。', en: 'Runtime events could not be linked to this Skill, so capability observations stay empty.' },
  },
  evidence: {
    'runtime-supported': { zh: '范围内留下了可以展示的运行证据，只包含类别与计数。', en: 'The scope holds runtime evidence worth showing, as categories and counts only.' },
    insufficient: { zh: '范围内没有可展示的运行证据。', en: 'The scope holds no runtime evidence to show.' },
    unknown: { zh: '没有可对齐的运行事件，因此没有证据可展示。', en: 'There are no linkable runtime events, so there is no evidence to show.' },
  },
}

/**
 * Words this module's statements may never use. `FLOW_EVIDENCE_FORBIDDEN` is the shared list;
 * the extra entries are the ones only a runtime view could be tempted into claiming.
 */
export const RUNTIME_LOGIC_FORBIDDEN = [...FLOW_EVIDENCE_FORBIDDEN, '已加载', '已读取', '已注入', '已生效']

export const RUNTIME_LOGIC_LIMITATIONS = {
  sessionOnly: 'runtime-facts-come-only-from-what-this-session-observed',
  categorical: 'runtime-evidence-is-categorical-and-carries-no-argument-text',
  envelope: 'rendered-envelope-not-reproducible-outside-the-harness',
  unlinked: 'runtime-events-could-not-be-linked-to-this-skill',
}

export const RUNTIME_LOGIC_NOTE = {
  zh: '这里只列出当前会话能观察到的事实，以及观察不到的地方。阶段之间没有因果顺序，也不表示 Skill 内部的执行步骤。',
  en: 'This lists only what this session could observe, and says where it observed nothing. The stages are not a causal order and are not the Skill\u2019s internal steps.',
}

function fact(id, label, kind, value) {
  return { id, label, kind, value }
}

function position(turn, step) {
  if (!Number.isSafeInteger(turn) && !Number.isSafeInteger(step)) return null
  const parts = []
  if (Number.isSafeInteger(turn)) parts.push(`turn ${turn}`)
  if (Number.isSafeInteger(step)) parts.push(`step ${step}`)
  return parts.join(' · ')
}

function countBy(items, pick) {
  const map = new Map()
  for (const item of items) {
    const key = pick(item)
    if (key === null || key === undefined || key === '') continue
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }))
}

function catalogStage(receipt, observation) {
  const publication = observation?.catalogPublication ?? receipt?.catalogPublished ?? null
  const entryCount = Number.isSafeInteger(publication?.entryCount) ? publication.entryCount : null
  const listed = typeof observation?.inPublishedCatalog === 'boolean' ? observation.inPublishedCatalog : null
  const state = listed === true ? 'runtime-supported' : (publication ? 'insufficient' : 'unknown')
  const facts = []
  if (entryCount !== null) facts.push(fact('catalog-entry-count', { zh: '目录中的 Skill 数', en: 'Skills in the catalog' }, 'count', entryCount))
  const at = position(publication?.turn, publication?.step)
  if (at) facts.push(fact('catalog-published-at', { zh: '目录发布位置', en: 'Catalog published at' }, 'text', at))
  if (listed !== null) facts.push(fact('catalog-skill-listed', { zh: '目录中列出这个 Skill', en: 'This Skill is listed in the catalog' }, 'flag', listed))
  if (typeof publication?.entriesDigest === 'string') facts.push(fact('catalog-digest', { zh: '目录指纹', en: 'Catalog digest' }, 'code', publication.entriesDigest))
  return { state, facts, limitations: [] }
}

function loadStage(runs) {
  const list = Array.isArray(runs) ? runs : []
  const state = list.length > 0 ? 'runtime-supported' : 'unknown'
  const facts = []
  if (list.length > 0) {
    facts.push(fact('load-count', { zh: '本次会话载入次数', en: 'Loads this session' }, 'count', list.length))
    const latest = list[0]
    const at = position(latest?.turn, latest?.step)
    if (at) facts.push(fact('load-position', { zh: '最近一次载入位置', en: 'Most recent load at' }, 'text', at))
    if (latest?.invocationType) facts.push(fact('load-invocation-type', { zh: '调用方式', en: 'Invocation type' }, 'code', latest.invocationType))
    if (latest?.consumer) facts.push(fact('load-consumer', { zh: '调用方', en: 'Consumer' }, 'code', latest.consumer))
    if (latest?.coverage) facts.push(fact('load-coverage', { zh: '覆盖程度', en: 'Coverage' }, 'code', latest.coverage))
  }
  return { state, facts, limitations: [] }
}

function instructionStage(runs, observation) {
  const list = Array.isArray(runs) ? runs : []
  const match = observation?.match ?? 'unavailable'
  if (list.length === 0 && !observation) return { state: 'unknown', facts: [], limitations: [RUNTIME_LOGIC_LIMITATIONS.envelope] }
  const state = match === 'match' ? 'runtime-supported' : (match === 'mismatch' ? 'partial' : 'insufficient')
  const facts = []
  if (Number.isSafeInteger(observation?.observedInstructionSha256?.length)) {
    facts.push(fact('instruction-hash-observed-count', { zh: '记录到的指令指纹数', en: 'Instruction fingerprints recorded' }, 'count', observation.observedInstructionSha256.length))
  }
  facts.push(fact('instruction-fingerprint-match', { zh: '指令指纹与当前定义一致', en: 'Fingerprint matches the current definition' }, 'flag', match === 'match' ? true : (match === 'mismatch' ? false : null)))
  if (typeof observation?.currentInstructionSha256 === 'string') {
    facts.push(fact('instruction-hash-current', { zh: '当前 SKILL.md 指纹', en: 'Current SKILL.md fingerprint' }, 'code', observation.currentInstructionSha256))
  }
  const limitations = list.length > 0 ? [] : [RUNTIME_LOGIC_LIMITATIONS.envelope]
  return { state, facts, limitations }
}

function capabilityStage(evidence) {
  const scope = evidence?.scope ?? null
  if (!scope?.established) {
    return { state: 'unknown', facts: [], limitations: [RUNTIME_LOGIC_LIMITATIONS.unlinked] }
  }
  const eventCount = Number.isSafeInteger(scope.eventCount) ? scope.eventCount : 0
  const correlated = scope.relationStatus === 'correlated'
  const state = correlated && eventCount > 0 ? 'runtime-supported' : 'partial'
  const facts = [
    fact('scope-relation', { zh: '范围关联判定', en: 'Scope relation' }, 'code', scope.relationStatus ?? 'unlinked'),
    fact('scope-event-count', { zh: '范围内事件数', en: 'Events in scope' }, 'count', eventCount),
  ]
  const classes = scope.observedByClass && typeof scope.observedByClass === 'object' ? Object.keys(scope.observedByClass) : []
  if (classes.length > 0) facts.push(fact('capability-classes', { zh: '观察到的能力类别', en: 'Observed capability classes' }, 'names', classes))
  const matched = new Set()
  for (const invocation of evidence?.invocations ?? []) if (invocation?.stepKind) matched.add(invocation.stepKind)
  if (matched.size > 0) facts.push(fact('matched-capabilities', { zh: '命中的步骤类型', en: 'Matched step kinds' }, 'step-kinds', [...matched]))
  const from = scope.turnRange?.from
  const to = scope.turnRange?.to
  if (Number.isSafeInteger(from) || Number.isSafeInteger(to)) {
    facts.push(fact('scope-turn-range', { zh: '范围涉及的 turn', en: 'Turns in scope' }, 'text', `${Number.isSafeInteger(from) ? from : '?'} — ${Number.isSafeInteger(to) ? to : '?'}`))
  }
  return { state, facts, limitations: [] }
}

function evidenceStage(evidence) {
  if (!evidence?.hasRuntime) return { state: 'unknown', facts: [], limitations: [] }
  const invocations = Array.isArray(evidence.invocations) ? evidence.invocations : []
  const state = invocations.length > 0 ? 'runtime-supported' : 'insufficient'
  const facts = [fact('evidence-invocation-count', { zh: '可展示的调用数', en: 'Invocations to show' }, 'count', invocations.length)]
  const byCategory = countBy(invocations, (item) => item?.evidenceCategory)
  if (byCategory.length > 0) facts.push(fact('evidence-categories', { zh: '证据类别分布', en: 'Evidence by category' }, 'pairs', byCategory))
  const withIntent = invocations.filter((item) => item?.modelIntentPresent === true).length
  if (withIntent > 0) facts.push(fact('evidence-with-intent', { zh: '带模型意图的调用', en: 'Invocations with model intent' }, 'count', withIntent))
  return { state, facts, limitations: invocations.length > 0 ? [RUNTIME_LOGIC_LIMITATIONS.categorical] : [] }
}

/**
 * Build the runtime-logic view for one Skill.
 *
 * @param options.runs - `detail.runs`: this session's load records for the Skill.
 * @param options.evidence - `detail.evidence`: invocations and the runtime scope summary.
 * @param options.observation - `detail.observation`: fingerprint comparison and catalog facts.
 * @param options.receipt - the raw receipt, used only for `catalogPublished`.
 * @param options.stepStates - `{ [relationship]: count }` straight off `detail.flow.steps[].evidence`,
 *   so the evidence stage counts the *same* states the step list shows instead of recomputing them.
 */
export function buildSkillRuntimeLogic(options = {}) {
  const receipt = options.receipt ?? null
  const runs = Array.isArray(options.runs) ? options.runs : []
  const evidence = options.evidence ?? null
  const observation = options.observation ?? null
  const stepStates = options.stepStates && typeof options.stepStates === 'object' ? options.stepStates : null

  const builders = {
    catalog: () => catalogStage(receipt, observation),
    load: () => loadStage(runs),
    instructions: () => instructionStage(runs, observation),
    capability: () => capabilityStage(evidence),
    evidence: () => evidenceStage(evidence),
  }

  const stages = RUNTIME_STAGE_IDS.map((id, index) => {
    const built = builders[id]()
    const facts = [...built.facts]
    if (id === 'evidence' && stepStates) {
      const pairs = Object.entries(stepStates).filter(([, value]) => value > 0).map(([label, value]) => ({ label, value }))
      if (pairs.length > 0) facts.push(fact('step-evidence-states', { zh: '声明步骤的观察状态', en: 'Declared-step states' }, 'evidence-states', pairs))
    }
    return {
      id,
      order: index + 1,
      label: RUNTIME_STAGE_LABELS[id],
      hint: RUNTIME_STAGE_HINTS[id],
      state: built.state,
      tone: flowEvidenceState(built.state).tone,
      statement: RUNTIME_STAGE_STATEMENTS[id][built.state] ?? RUNTIME_STAGE_STATEMENTS[id].unknown ?? null,
      facts,
      limitations: built.limitations,
    }
  })

  const limitations = [RUNTIME_LOGIC_LIMITATIONS.sessionOnly]
  for (const stage of stages) for (const item of stage.limitations) limitations.push(item)

  return {
    schemaVersion: RUNTIME_LOGIC_SCHEMA_VERSION,
    source: RUNTIME_LOGIC_SOURCE,
    note: RUNTIME_LOGIC_NOTE,
    stages,
    stageCount: stages.length,
    observedCount: stages.filter((stage) => stage.state === 'runtime-supported').length,
    limitations: [...new Set(limitations)],
  }
}
