/**
 * V1.2「Skill Evidence Model」的纯函数层（`FR-EVIDENCE-*`，`spec/PRD.md` §5.14）。
 *
 * 这一层只做三件事，全部是**确定性**的：把一次 Skill 详情的载荷与评测状态合成一条统一的证据链、
 * 判断手上的运行证据绑定的是哪一份 Skill fingerprint、把整条证据链导出成可复核的 JSON。它**不**给分、
 * 不排名、不聚合、不调用模型、不读网络，也不碰任何工具参数、工具结果或隐藏推理。
 *
 * 三条纪律写在最前面，改动这一层之前先读：
 *
 * 1. **三态只有三个。** `declared`（Skill 自己声明的）/ `observed`（系统确实观察到的）/
 *    `unavailable`（当前已验证的读取路径拿不到）。**没有** `inferred`：缺就是缺，
 *    更不许把「没观察到」写成「没发生」。
 * 2. **每一段都带自己的限制。** `Load ≠ Use`、`Use ≠ Outcome`、`Outcome ≠ Skill caused it`
 *    这三句是证据边界，不是文案；限制文案由本模块给出，界面不许临时拼装。
 * 3. **id 必须可重放。** 同一份事实在相同输入下得到逐字相同的 `evidenceId`：规范输入串 →
 *    记录已绑定的既有 sha256。**不**用 `Date.now()`、**不**用 `Math.random()`、**不**用 UUID。
 *
 * 本模块**零 import**（客户端要 require 它，`AGENTS.md` §6.6），因此也**不能** `import 'node:crypto'`
 * —— 本仓库算 sha256 的唯一位置是宿主（`src/dsh/host/index.js:61`、`:774-775`、`:804`）。
 * 要把它升级成真 sha256，只需宿主对 `evidenceHashInput()` 多算一步，本模块与界面都不用动。
 */

/** 证据模型的结构版本。字段增删才 +1。 */
export const EVIDENCE_SCHEMA_VERSION = 1

/** `evidenceHashInput()` 的域分隔前缀：哈希输入的第一行，避免与别处的 sha256 撞语义。 */
export const EVIDENCE_HASH_DOMAIN = 'dsh-skill-evidence'

/** 值取不到时**唯一**允许写的东西（与 `skill-evaluation.mjs` 的写法保持一致）。 */
export const EVIDENCE_UNAVAILABLE_TEXT = 'unavailable'

/** 证据状态只有三个（`FR-EVIDENCE-002`）。顺序就是界面上的顺序。 */
export const EVIDENCE_STATUS_IDS = ['declared', 'observed', 'unavailable']

export const EVIDENCE_STATUS_LABELS = {
  declared: { zh: 'Skill 声明', en: 'Declared' },
  observed: { zh: '已观察', en: 'Observed' },
  unavailable: { zh: '无法取得', en: 'Unavailable' },
}

/** 证据链四段（`FR-EVIDENCE-003`）。与 V1.0 评测的 `trigger load use outcome` **不是**同一套 id。 */
export const EVIDENCE_CHAIN_STAGE_IDS = ['definition', 'load', 'use', 'outcome']

export const EVIDENCE_CHAIN_STAGE_LABELS = {
  definition: { zh: 'Definition · 声明', en: 'Definition' },
  load: { zh: 'Load · 加载', en: 'Load' },
  use: { zh: 'Use · 使用迹象', en: 'Use' },
  outcome: { zh: 'Outcome · 结果', en: 'Outcome' },
}

export const EVIDENCE_CHAIN_STAGE_HINTS = {
  definition: { zh: 'SKILL.md 声明了什么', en: 'What SKILL.md declares' },
  load: { zh: 'Skill 是否进入了本次会话的载入记录', en: 'Whether the Skill reached the load record' },
  use: { zh: '本次会话能观察到的后续活动', en: 'Follow-on activity this session could observe' },
  outcome: { zh: '本次 Run 是否留下了人工或 Agent 的判断', en: 'Whether this Run carries a human or agent judgement' },
}

/** 三句证据边界（`FR-EVIDENCE-004`）。它们与 V1.0 的三句不等式同义，但归属本模型。 */
export const EVIDENCE_INEQUALITIES = ['加载 ≠ 使用', '使用 ≠ 结果', '结果 ≠ 这个 Skill 造成的']

/** 证据新鲜度（`FR-EVIDENCE-007`）。只有三态，**没有**过期这一档。 */
export const EVIDENCE_DRIFT_IDS = ['current', 'historical', 'no-matching-evidence']

export const EVIDENCE_DRIFT_LABELS = {
  current: { zh: '当前版本已有对应 Run 证据', en: 'Current fingerprint has matching evidence' },
  historical: { zh: '历史证据 ≠ 当前版本证据', en: 'Evidence belongs to another fingerprint' },
  'no-matching-evidence': { zh: '当前版本尚没有对应的 Run 证据', en: 'No matching Run evidence' },
}

/** 证据边界三块（`FR-EVIDENCE-005`）。`causal-claim` 永远不声明。 */
export const EVIDENCE_BOUNDARY_IDS = ['load-evidence', 'use-evidence', 'causal-claim']

export const EVIDENCE_BOUNDARY_LABELS = {
  'load-evidence': { zh: '加载证据', en: 'Load evidence' },
  'use-evidence': { zh: '使用证据', en: 'Use evidence' },
  'causal-claim': { zh: '因果结论', en: 'Causal claim' },
}

/** 证据状态表覆盖的五类对象（`FR-EVIDENCE-006`）。顺序就是界面上的顺序。 */
export const EVIDENCE_SUBJECT_IDS = [
  'skill-name',
  'skill-load',
  'skill-use',
  'dsh-version',
  'skill-caused-outcome',
]

export const EVIDENCE_SUBJECT_LABELS = {
  'skill-name': { zh: 'Skill 名称', en: 'Skill name' },
  'skill-load': { zh: 'Skill 加载', en: 'Skill load' },
  'skill-use': { zh: 'Skill 使用迹象', en: 'Skill use' },
  'dsh-version': { zh: 'DSH 版本', en: 'DSH version' },
  'skill-caused-outcome': { zh: 'Skill 造成结果', en: 'Skill caused the outcome' },
}

/** 证据状态表的五列（`FR-EVIDENCE-006`）。 */
export const EVIDENCE_TABLE_COLUMNS = [
  { id: 'subject', zh: '对象', en: 'Subject' },
  { id: 'status', zh: '状态', en: 'Status' },
  { id: 'fact', zh: '当前事实', en: 'Current fact' },
  { id: 'source', zh: '证据来源', en: 'Evidence source' },
  { id: 'limitation', zh: '限制', en: 'Limitation' },
]

/** 限制的封闭词表（`FR-EVIDENCE-008`）。界面按 id 取文案，不许自己写。 */
export const EVIDENCE_LIMITATION_CODES = [
  'declared-value-is-not-runtime-behaviour',
  'load-does-not-prove-content-use',
  'use-evidence-reads-metadata-only',
  'use-evidence-is-circumstantial',
  'outcome-is-not-causal-attribution',
  'current-reading-path-does-not-provide-dsh-version',
  'historical-schema-does-not-contain-this-field',
  'fingerprint-does-not-match-the-current-definition',
  'no-run-evidence-for-this-fingerprint',
]

export const EVIDENCE_LIMITATION_LABELS = {
  'declared-value-is-not-runtime-behaviour': {
    zh: '这是 Skill 自己的声明值，不等同于运行时行为。',
    en: 'A declared value is not runtime behaviour.',
  },
  'load-does-not-prove-content-use': {
    zh: '能证明 Skill 被加载，不能单独证明 Skill 内容被实际使用。',
    en: 'Loading is proven; content use is not.',
  },
  'use-evidence-reads-metadata-only': {
    zh: '只读工具调用的名称与数量，不读取工具参数、工具结果或隐藏推理。',
    en: 'Tool names and counts only; parameters, results and hidden reasoning stay out.',
  },
  'use-evidence-is-circumstantial': {
    zh: '这是同一 Turn 内的相关活动，不是 Skill 内容被完整使用的证明。',
    en: 'Correlated activity in the same turn; not proof that the content was followed.',
  },
  'outcome-is-not-causal-attribution': {
    zh: '结果发生不等于结果由 Skill 单独造成。',
    en: 'An outcome is not proof that the Skill caused it.',
  },
  'current-reading-path-does-not-provide-dsh-version': {
    zh: '当前已验证的读取路径未提供 DSH 版本，不猜版本号。',
    en: 'The verified reading path does not expose the DSH version; it is not guessed.',
  },
  'historical-schema-does-not-contain-this-field': {
    zh: '历史记录的 schema 里没有这个字段，不补全。',
    en: 'The historical schema does not contain this field; it is not filled in.',
  },
  'fingerprint-does-not-match-the-current-definition': {
    zh: '载入记录里的指令指纹与当前 SKILL.md 不一致。',
    en: 'The fingerprint on the load record does not match the current SKILL.md.',
  },
  'no-run-evidence-for-this-fingerprint': {
    zh: '没有任何 Run 绑定到当前这份 fingerprint；这推不出「没有执行」。',
    en: 'No Run is bound to the current fingerprint; that does not imply nothing ran.',
  },
}

/** 导出 JSON 的结构版本（`FR-EVIDENCE-010`）。 */
export const EVIDENCE_EXPORT_SCHEMA_VERSION = 1

/**
 * 导出的 JSON 里**禁止**出现的键（`FR-EVIDENCE-010`）。
 * 前八个与 `docs/PRIVACY.md` 的拒写清单同表；`runKey`/`eventId` 的形如 `<sessionId>:<callId>`，
 * 所以本模块一律改写成不含 session 的 `receipt:turn{n}.step{m}`。
 */
export const EVIDENCE_EXPORT_FORBIDDEN_KEYS = [
  'sessionId',
  'sessionID',
  'runKey',
  'eventId',
  'messages',
  'conversation',
  'args',
  'result',
  'toolArguments',
  'toolResult',
  'path',
  'absolutePath',
  'secret',
  'apiKey',
  'token',
  'chainOfThought',
  'hiddenReasoning',
]

function obj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function arr(value) {
  return Array.isArray(value) ? value : []
}

function collapse(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function unavailableOf(value) {
  const text = collapse(value)
  return text && text !== EVIDENCE_UNAVAILABLE_TEXT ? text : EVIDENCE_UNAVAILABLE_TEXT
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function limitation(code) {
  const label = obj(EVIDENCE_LIMITATION_LABELS[code])
  return { code, zh: collapse(label.zh), en: collapse(label.en) }
}

function labelOf(table, id) {
  const label = obj(table[id])
  return { zh: collapse(label.zh), en: collapse(label.en) }
}

function fact(id, zhLabel, enLabel, kind, value) {
  return { id, label: { zh: zhLabel, en: enLabel }, kind, value }
}

/** 记录在内存里的运行引用：DSH 没有原生 run id，也**不**把 `runKey`（含 session）带出来。 */
export function receiptReference(run) {
  const safe = obj(run)
  const turn = count(safe.turn)
  const step = count(safe.step)
  if (turn === null || step === null) return EVIDENCE_UNAVAILABLE_TEXT
  return `receipt:turn${turn}.step${step}`
}

/**
 * 一条证据记录的规范输入串（`FR-EVIDENCE-009`）。第一行是域分隔前缀，其余行是「字段名 值」。
 * 宿主若要把它算成 sha256，直接 `createHash('sha256').update(evidenceHashInput(record))` 即可。
 */
export function evidenceHashInput(record) {
  const safe = obj(record)
  const lines = [
    EVIDENCE_HASH_DOMAIN,
    `subject ${collapse(safe.subjectId) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `status ${collapse(safe.status) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `skill ${collapse(safe.skillName) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `fingerprint ${collapse(safe.skillFingerprint) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `instruction ${collapse(safe.instructionFingerprint) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `case ${collapse(safe.caseId) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `run ${collapse(safe.runId) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `source ${collapse(safe.sourceType) || EVIDENCE_UNAVAILABLE_TEXT}`,
    `reference ${collapse(safe.reference) || EVIDENCE_UNAVAILABLE_TEXT}`,
  ]
  return lines.join('\n')
}

/**
 * 一条证据记录的稳定 id（`FR-EVIDENCE-009`）：`evidence:<对象>@<绑定>`。
 * 绑定值优先取记录已经绑定的既有 sha256（Skill 指纹 / 指令指纹 / caseId / runId），
 * 都没有时退回到「Skill 名 + 段内序号」——同样与时间、随机数无关。
 */
export function evidenceIdOf(record) {
  const safe = obj(record)
  const subject = collapse(safe.subjectId) || 'evidence'
  const ordinal = count(safe.ordinal)
  const binding =
    collapse(safe.instructionFingerprint) ||
    collapse(safe.skillFingerprint) ||
    collapse(safe.caseId) ||
    collapse(safe.runId) ||
    collapse(safe.reference) ||
    `${collapse(safe.skillName) || 'skill'}#${ordinal === null ? 0 : ordinal}`
  return `evidence:${subject}@${binding}`
}

/** 把任意输入归一成三态之一（`FR-EVIDENCE-002`）。 */
export function normalizeEvidenceStatus(value) {
  const text = collapse(value)
  return EVIDENCE_STATUS_IDS.includes(text) ? text : 'unavailable'
}

/**
 * 合成整条证据模型（`FR-EVIDENCE-001`）。
 *
 * 输入只允许来自系统已经取好的数据：`summary / definition / framework / flow / runs / evidence /
 * runtimeLogic / observation / validation` 取 `/skill` 载荷里的同名块；`evaluation` 取 V1.0 评测状态
 * （`cases / runs / comparison`）。所有取不到的字段一律 `unavailable`，不推断、不补全。
 */
export function buildSkillEvidence(input) {
  const safe = obj(input)
  const summary = obj(safe.summary)
  const definition = obj(safe.definition)
  const content = obj(definition.content)
  const observation = obj(safe.observation)
  const runtimeEvidence = obj(safe.evidence)
  const scope = obj(runtimeEvidence.scope)
  const validation = obj(safe.validation)
  const evaluation = obj(safe.evaluation)
  const skillName = collapse(safe.skillName) || collapse(summary.name) || EVIDENCE_UNAVAILABLE_TEXT

  const skillFingerprint = collapse(content.sha256)
  const currentInstructionFingerprint = collapse(observation.currentInstructionSha256)
  const observedInstructionFingerprints = arr(observation.observedInstructionSha256)
    .map((value) => collapse(value))
    .filter(Boolean)

  // ---- 身份（`FR-EVIDENCE-006`）------------------------------------------------------------
  const provider = collapse(summary.provider)
  const source = collapse(summary.source)
  const resourceBase = obj(definition.resourceBase)
  const identity = {
    skillName,
    skillFingerprint: skillFingerprint
      ? { status: 'observed', scope: 'skill-definition-content', value: skillFingerprint }
      : { status: 'unavailable', scope: 'skill-definition-content', value: EVIDENCE_UNAVAILABLE_TEXT },
    sourceIdentity: {
      status: provider || source ? 'declared' : 'unavailable',
      provider: provider || EVIDENCE_UNAVAILABLE_TEXT,
      kind: source || EVIDENCE_UNAVAILABLE_TEXT,
      resourceKind: unavailableOf(resourceBase.kind),
    },
    instructionFingerprint: {
      status: currentInstructionFingerprint
        ? 'observed'
        : (observedInstructionFingerprints.length > 0 ? 'observed' : 'unavailable'),
      scope: 'skill-instructions',
      current: currentInstructionFingerprint || EVIDENCE_UNAVAILABLE_TEXT,
      observed: observedInstructionFingerprints,
      match: ['match', 'mismatch', 'unavailable'].includes(collapse(observation.match))
        ? collapse(observation.match)
        : EVIDENCE_UNAVAILABLE_TEXT,
    },
    caseId: EVIDENCE_UNAVAILABLE_TEXT,
    runId: EVIDENCE_UNAVAILABLE_TEXT,
  }

  // ---- 运行证据：加载 ----------------------------------------------------------------------
  const loadRecords = arr(safe.runs)
    .map((run) => obj(run))
    .filter((run) => collapse(run.status) === 'loaded')
  const loadReference = loadRecords.length > 0 ? receiptReference(loadRecords[loadRecords.length - 1]) : ''
  const loadObservedAt = loadRecords.length > 0 && Number.isSafeInteger(loadRecords[loadRecords.length - 1].requestedAt)
    ? loadRecords[loadRecords.length - 1].requestedAt
    : null
  const loadStatus = loadRecords.length > 0 ? 'observed' : 'unavailable'

  // ---- 运行证据：使用迹象（只数名称与数量）--------------------------------------------------
  const invocations = arr(runtimeEvidence.invocations).map((item) => obj(item))
  const followOn = invocations.filter((item) => collapse(item.kind) && collapse(item.kind) !== 'skill')
  const followOnCounts = new Map()
  for (const item of followOn) {
    const name = collapse(item.name) || 'unrecognised'
    followOnCounts.set(name, (followOnCounts.get(name) ?? 0) + 1)
  }
  const followOnByName = [...followOnCounts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name, times]) => ({ name, times }))
  const scopeEstablished = scope.established === true
  const eventCount = count(scope.eventCount)
  const useStatus = scopeEstablished && (followOn.length > 0 || (eventCount !== null && eventCount > 0))
    ? 'observed'
    : 'unavailable'
  const useReference = useStatus === 'observed'
    ? `scope:${unavailableOf(scope.derivation)}/${unavailableOf(scope.relationStatus)}`
    : ''

  // ---- 评测证据：Case / Run / 条件 / 对照 ----------------------------------------------------
  const evaluationCases = arr(evaluation.cases).map((item) => obj(item))
  const evaluationRuns = arr(evaluation.runs).map((item) => obj(item))
  const selectedCaseId = collapse(evaluation.selectedCaseId) ||
    collapse(evaluationCases.length > 0 ? evaluationCases[evaluationCases.length - 1].caseId : '')
  const selectedCase = evaluationCases.find((item) => collapse(item.caseId) === selectedCaseId) ?? {}
  const latestRun = evaluationRuns.length > 0 ? evaluationRuns[evaluationRuns.length - 1] : null
  const comparison = obj(evaluation.comparison)

  identity.caseId = selectedCaseId || EVIDENCE_UNAVAILABLE_TEXT
  identity.runId = latestRun ? unavailableOf(latestRun.runId) : EVIDENCE_UNAVAILABLE_TEXT

  const conditionFields = [
    { id: 'model', zh: 'Model', en: 'Model' },
    { id: 'provider', zh: 'Provider', en: 'Provider' },
    { id: 'reasoningEffort', zh: 'Reasoning Effort', en: 'Reasoning Effort' },
    { id: 'contextWindow', zh: 'Context Window', en: 'Context Window' },
    { id: 'instructionFingerprint', zh: 'Instruction Fingerprint', en: 'Instruction Fingerprint' },
    { id: 'dshVersion', zh: 'DSH Version', en: 'DSH Version' },
    { id: 'pluginVersion', zh: 'Plugin Version', en: 'Plugin Version' },
    { id: 'turn', zh: 'Turn', en: 'Turn' },
    { id: 'step', zh: 'Step', en: 'Step' },
  ]
  const runConditions = latestRun
    ? conditionFields.map((field) => {
      let value
      if (field.id === 'instructionFingerprint') {
        value = unavailableOf(latestRun.observedInstructionSha256 ?? latestRun.currentInstructionSha256)
      } else if (field.id === 'turn' || field.id === 'step') {
        const numeric = count(latestRun[field.id])
        value = numeric === null ? EVIDENCE_UNAVAILABLE_TEXT : String(numeric)
      } else {
        value = unavailableOf(latestRun[field.id])
      }
      const missingSchemaField = !Object.prototype.hasOwnProperty.call(latestRun, field.id) &&
        field.id !== 'instructionFingerprint'
      return {
        id: field.id,
        label: { zh: field.zh, en: field.en },
        value,
        limitation: missingSchemaField ? limitation('historical-schema-does-not-contain-this-field') : null,
      }
    })
    : conditionFields.map((field) => ({
      id: field.id,
      label: { zh: field.zh, en: field.en },
      value: EVIDENCE_UNAVAILABLE_TEXT,
      limitation: limitation('historical-schema-does-not-contain-this-field'),
    }))

  const comparisonBlockers = arr(comparison.blockers).map((item) => {
    const blocker = obj(item)
    return {
      id: collapse(blocker.id) || collapse(blocker.key) || 'condition',
      label: { zh: collapse(obj(blocker.label).zh), en: collapse(obj(blocker.label).en) },
      before: unavailableOf(blocker.before),
      after: unavailableOf(blocker.after),
    }
  })
  const comparability = latestRun === null
    ? { status: 'unavailable', comparable: false, axis: EVIDENCE_UNAVAILABLE_TEXT, blockers: [], reason: 'no-run' }
    : {
      status: comparison.comparable === true ? 'observed' : 'unavailable',
      comparable: comparison.comparable === true,
      axis: unavailableOf(comparison.axis),
      blockers: comparisonBlockers,
      reason: comparison.comparable === true ? null : (comparisonBlockers.length > 0 ? 'condition-drift' : 'no-comparison'),
    }

  // ---- 结果证据 ----------------------------------------------------------------------------
  const outcomeRun = evaluationRuns.find((run) => collapse(obj(run.outcome).text) || arr(run.judgements).length > 0) ?? null
  const outcomeStatus = outcomeRun ? 'observed' : 'unavailable'
  const outcomeSource = outcomeRun ? unavailableOf(obj(outcomeRun.outcome).source) : EVIDENCE_UNAVAILABLE_TEXT
  const outcomeText = outcomeRun ? unavailableOf(obj(outcomeRun.outcome).text) : EVIDENCE_UNAVAILABLE_TEXT

  // ---- 四段证据链（`FR-EVIDENCE-003`）------------------------------------------------------
  const definitionFacts = [
    fact('skill-name', 'Skill 名称', 'Skill name', 'text', skillName),
    fact('declared-purpose', '声明的用途', 'Declared purpose', 'text', unavailableOf(summary.description)),
    fact('declared-steps', '声明的流程步骤', 'Declared steps', 'count', arr(obj(safe.flow).steps).length),
    fact('declared-sha256', 'SKILL.md 内容指纹', 'SKILL.md content fingerprint', 'value',
      skillFingerprint || EVIDENCE_UNAVAILABLE_TEXT),
  ]
  const loadFacts = [
    fact('load-records', '加载记录条数', 'Load records', 'count', loadRecords.length),
    fact('load-reference', '最近一条记录的位置', 'Latest record', 'text', loadReference || EVIDENCE_UNAVAILABLE_TEXT),
    fact('load-instruction-match', '指纹与当前定义一致', 'Fingerprint matches the current definition', 'text',
      identity.instructionFingerprint.match),
  ]
  const useFacts = [
    fact('follow-on-activity', '同一 Turn 内的后续活动', 'Follow-on activity in the same turn', 'count', followOn.length),
    fact('scope-events', '证据范围内的事件数', 'Events inside the evidence scope', 'count',
      eventCount === null ? EVIDENCE_UNAVAILABLE_TEXT : eventCount),
    fact('scope-relation', '范围关系', 'Scope relation', 'text', unavailableOf(scope.relationStatus)),
  ]
  const outcomeFacts = [
    fact('outcome-source', '判断来源', 'Judgement source', 'text', outcomeSource),
    fact('outcome-text', '判断内容', 'Judgement', 'text', outcomeText),
  ]

  const stages = [
    {
      id: 'definition',
      subjectId: 'skill-name',
      status: definition.available === false ? 'unavailable' : 'declared',
      facts: definitionFacts,
      source: { zh: 'SKILL.md 与 Skill 定义', en: 'SKILL.md and the Skill definition' },
      sourceType: 'skill-definition',
      reference: unavailableOf(summary.source),
      limitations: [limitation('declared-value-is-not-runtime-behaviour')],
    },
    {
      id: 'load',
      subjectId: 'skill-load',
      status: loadStatus,
      facts: loadFacts,
      source: { zh: 'DSH 运行时回执', en: 'DSH runtime receipt' },
      sourceType: 'runtime-receipt',
      reference: loadReference || EVIDENCE_UNAVAILABLE_TEXT,
      limitations: [
        limitation('load-does-not-prove-content-use'),
        ...(identity.instructionFingerprint.match === 'mismatch'
          ? [limitation('fingerprint-does-not-match-the-current-definition')]
          : []),
      ],
    },
    {
      id: 'use',
      subjectId: 'skill-use',
      status: useStatus,
      facts: useFacts,
      source: { zh: '本次会话观察', en: 'Observation in this session' },
      sourceType: 'runtime-observation',
      reference: useReference || EVIDENCE_UNAVAILABLE_TEXT,
      limitations: [
        limitation('use-evidence-is-circumstantial'),
        limitation('use-evidence-reads-metadata-only'),
      ],
    },
    {
      id: 'outcome',
      subjectId: 'skill-caused-outcome',
      status: outcomeStatus,
      facts: outcomeFacts,
      source: { zh: '评测 Run 的判断字段', en: 'The judgement fields of an evaluation Run' },
      sourceType: 'evaluation-run',
      reference: outcomeRun ? unavailableOf(outcomeRun.runId) : EVIDENCE_UNAVAILABLE_TEXT,
      limitations: [limitation('outcome-is-not-causal-attribution')],
    },
  ].map((stage, index) => ({
    ...stage,
    order: index + 1,
    label: labelOf(EVIDENCE_CHAIN_STAGE_LABELS, stage.id),
    hint: labelOf(EVIDENCE_CHAIN_STAGE_HINTS, stage.id),
    provenance: { source: stage.sourceType, sourceType: stage.sourceType, reference: stage.reference },
    evidenceId: evidenceIdOf({
      subjectId: stage.id,
      status: stage.status,
      skillName,
      skillFingerprint,
      instructionFingerprint: currentInstructionFingerprint,
      caseId: selectedCaseId,
      runId: identity.runId,
      sourceType: stage.sourceType,
      reference: stage.reference,
      ordinal: index,
    }),
  }))

  // ---- 证据边界（`FR-EVIDENCE-005`）与漂移（`FR-EVIDENCE-007`）------------------------------
  const evidenceFingerprints = []
  for (const item of evaluationCases) {
    const value = collapse(obj(item.skillFingerprint).instructionSha256)
    if (value && !evidenceFingerprints.includes(value)) evidenceFingerprints.push(value)
  }
  for (const run of evaluationRuns) {
    const value = collapse(run.observedInstructionSha256) || collapse(obj(run.load).observedInstructionSha256)
    if (value && !evidenceFingerprints.includes(value)) evidenceFingerprints.push(value)
  }
  let driftState = EVIDENCE_DRIFT_IDS[2]
  let driftReason = 'no-run-evidence'
  if (evidenceFingerprints.length > 0) {
    if (!currentInstructionFingerprint) {
      driftState = EVIDENCE_DRIFT_IDS[2]
      driftReason = 'current-fingerprint-unavailable'
    } else if (evidenceFingerprints.includes(currentInstructionFingerprint)) {
      driftState = EVIDENCE_DRIFT_IDS[0]
      driftReason = 'fingerprint-matches'
    } else {
      driftState = EVIDENCE_DRIFT_IDS[1]
      driftReason = 'fingerprint-differs'
    }
  }
  const driftClaims = {
    current: {
      zh: '当前这份 fingerprint 已有对应的 Run 证据。',
      en: 'Run evidence is bound to the current fingerprint.',
    },
    historical: {
      zh: '历史 Run 仍然有效，但它对应的是另一份 Skill fingerprint；当前版本尚没有对应的 Run 证据。',
      en: 'The historical Run is still valid, but it belongs to another Skill fingerprint; the current one has no Run evidence yet.',
    },
    'no-matching-evidence': {
      zh: '当前版本尚没有对应的 Run 证据。',
      en: 'There is no Run evidence for the current version yet.',
    },
  }
  const drift = {
    state: driftState,
    label: labelOf(EVIDENCE_DRIFT_LABELS, driftState),
    reason: driftReason,
    currentFingerprint: currentInstructionFingerprint || EVIDENCE_UNAVAILABLE_TEXT,
    skillFingerprint: skillFingerprint || EVIDENCE_UNAVAILABLE_TEXT,
    evidenceFingerprints,
    latestEvidenceFingerprint: evidenceFingerprints.length > 0
      ? evidenceFingerprints[evidenceFingerprints.length - 1]
      : EVIDENCE_UNAVAILABLE_TEXT,
    caseCount: evaluationCases.length,
    runCount: evaluationRuns.length,
    claim: { zh: collapse(driftClaims[driftState].zh), en: collapse(driftClaims[driftState].en) },
    note: {
      zh: '本模块只报告证据绑定了哪一份 fingerprint，不给证据判「新鲜」或「过期」。',
      en: 'This module only reports which fingerprint the evidence is bound to; it does not call evidence fresh or stale.',
    },
    limitations: driftState === 'historical'
      ? [limitation('no-run-evidence-for-this-fingerprint')]
      : (driftState === 'no-matching-evidence' ? [limitation('no-run-evidence-for-this-fingerprint')] : []),
  }

  const boundaries = [
    {
      id: 'load-evidence',
      status: loadStatus,
      source: { zh: 'DSH 运行时回执', en: 'DSH runtime receipt' },
      claim: {
        zh: loadStatus === 'observed'
          ? `存在 ${loadRecords.length} 条 Skill 加载记录。`
          : '当前读取路径里没有 Skill 加载记录。',
        en: loadStatus === 'observed'
          ? `${loadRecords.length} Skill load record(s) exist.`
          : 'The current reading path holds no Skill load record.',
      },
      limitation: limitation('load-does-not-prove-content-use'),
    },
    {
      id: 'use-evidence',
      status: useStatus,
      source: { zh: '本次会话观察', en: 'Observation in this session' },
      claim: {
        zh: useStatus === 'observed'
          ? `同一 Turn 内存在 ${followOn.length} 次后续工具活动。`
          : '当前没有足够证据说明 Skill 内容进入了后续活动。',
        en: useStatus === 'observed'
          ? `${followOn.length} follow-on tool activit(ies) sit in the same turn.`
          : 'Not enough evidence that the Skill content reached follow-on activity.',
      },
      limitation: limitation('use-evidence-reads-metadata-only'),
    },
    {
      id: 'causal-claim',
      status: 'unavailable',
      source: { zh: '证据边界', en: 'Evidence boundary' },
      claim: {
        zh: outcomeStatus === 'observed'
          ? '存在 Outcome 证据，但当前证据不足以建立 Skill 因果归因。'
          : '当前证据不足以建立 Skill 因果归因。',
        en: 'Outcome evidence exists, but it is not enough to attribute the outcome to the Skill.',
      },
      limitation: limitation('outcome-is-not-causal-attribution'),
    },
  ].map((entry) => ({
    ...entry,
    label: labelOf(EVIDENCE_BOUNDARY_LABELS, entry.id),
    evidenceId: evidenceIdOf({
      subjectId: entry.id,
      status: entry.status,
      skillName,
      skillFingerprint,
      instructionFingerprint: currentInstructionFingerprint,
      caseId: selectedCaseId,
      runId: identity.runId,
      sourceType: 'boundary',
      reference: collapse(entry.source.en),
    }),
  }))

  // ---- 证据状态表（`FR-EVIDENCE-006`）------------------------------------------------------
  const table = [
    {
      subjectId: 'skill-name',
      status: 'declared',
      fact: { zh: skillName, en: skillName },
      source: { zh: 'SKILL.md 与 Skill 定义', en: 'SKILL.md and the Skill definition' },
      limitation: limitation('declared-value-is-not-runtime-behaviour'),
    },
    {
      subjectId: 'skill-load',
      status: loadStatus,
      fact: {
        zh: loadStatus === 'observed'
          ? `${loadRecords.length} 条加载记录（${loadReference}）`
          : '当前读取路径里没有加载记录',
        en: loadStatus === 'observed'
          ? `${loadRecords.length} load record(s) (${loadReference})`
          : 'No load record on the current reading path',
      },
      source: { zh: 'DSH 运行时回执', en: 'DSH runtime receipt' },
      limitation: limitation('load-does-not-prove-content-use'),
    },
    {
      subjectId: 'skill-use',
      status: useStatus,
      fact: {
        zh: useStatus === 'observed'
          ? `同一 Turn 内 ${followOn.length} 次后续工具活动`
          : '当前没有足够证据',
        en: useStatus === 'observed'
          ? `${followOn.length} follow-on tool activit(ies) in the same turn`
          : 'Not enough evidence',
      },
      source: { zh: '本次会话观察', en: 'Observation in this session' },
      limitation: limitation('use-evidence-reads-metadata-only'),
    },
    {
      subjectId: 'dsh-version',
      status: 'unavailable',
      fact: { zh: '当前已验证读取路径未提供', en: 'The verified reading path does not provide it' },
      source: { zh: '—', en: '—' },
      limitation: limitation('current-reading-path-does-not-provide-dsh-version'),
    },
    {
      subjectId: 'skill-caused-outcome',
      status: 'unavailable',
      fact: { zh: '无法建立因果链', en: 'No causal chain can be established' },
      source: { zh: '证据边界', en: 'Evidence boundary' },
      limitation: limitation('outcome-is-not-causal-attribution'),
    },
  ].map((row) => ({
    ...row,
    label: labelOf(EVIDENCE_SUBJECT_LABELS, row.subjectId),
    evidenceId: evidenceIdOf({
      subjectId: row.subjectId,
      status: row.status,
      skillName,
      skillFingerprint,
      instructionFingerprint: currentInstructionFingerprint,
      caseId: selectedCaseId,
      runId: identity.runId,
      sourceType: 'status-table',
      reference: collapse(row.source.en),
    }),
  }))

  const validationSummary = obj(validation.summary)
  const evaluationBlock = {
    available: evaluationRuns.length > 0 || evaluationCases.length > 0,
    caseId: identity.caseId,
    runId: identity.runId,
    caseCount: evaluationCases.length,
    runCount: evaluationRuns.length,
    conditions: runConditions,
    comparability,
    outcome: {
      status: outcomeStatus,
      source: outcomeSource,
      text: outcomeText,
      limitation: limitation('outcome-is-not-causal-attribution'),
    },
  }

  const provenance = [
    { source: { zh: 'SKILL.md', en: 'SKILL.md' }, sourceType: 'skill-definition', reference: skillFingerprint || EVIDENCE_UNAVAILABLE_TEXT },
    { source: { zh: 'DSH 运行时回执', en: 'DSH runtime receipt' }, sourceType: 'runtime-receipt', reference: loadReference || EVIDENCE_UNAVAILABLE_TEXT },
    { source: { zh: '本次会话观察', en: 'Observation in this session' }, sourceType: 'runtime-observation', reference: useReference || EVIDENCE_UNAVAILABLE_TEXT },
    { source: { zh: '静态验收', en: 'Static validation' }, sourceType: 'validation-profile', reference: unavailableOf(collapse(validation.status)) },
    { source: { zh: '评测 Run', en: 'Evaluation Run' }, sourceType: 'evaluation-run', reference: identity.runId },
  ]

  const model = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    skillName,
    identity,
    chain: stages,
    boundaries,
    table,
    drift,
    evaluation: evaluationBlock,
    validation: {
      status: unavailableOf(collapse(validation.status)),
      summary: {
        errors: count(validationSummary.errors) ?? 0,
        warnings: count(validationSummary.warnings) ?? 0,
        info: count(validationSummary.info) ?? 0,
        skipped: count(validationSummary.skipped) ?? 0,
      },
    },
    provenance,
    inequalities: [...EVIDENCE_INEQUALITIES],
    limitationCodes: [...EVIDENCE_LIMITATION_CODES],
    notes: {
      scope: {
        zh: '这里只展示已经观察到的事实；没有证据就写无法取得，不写「没有发生」。',
        en: 'Only observed facts appear here; without evidence the answer is unavailable, not a denial.',
      },
      noScore: {
        zh: '本模块不评分、不排名、不自动归因。',
        en: 'This module does not score, rank or attribute automatically.',
      },
    },
  }
  model.statusCounts = evidenceStatusCounts(model)
  return model
}

/** 三态各有多少条记录（证据链 + 状态表 + 边界，按 `evidenceId` 去重）。 */
export function evidenceStatusCounts(model) {
  const safe = obj(model)
  const seen = new Set()
  const counts = { declared: 0, observed: 0, unavailable: 0 }
  const groups = [...arr(safe.chain), ...arr(safe.boundaries), ...arr(safe.table)]
  for (const entry of groups) {
    const record = obj(entry)
    const id = collapse(record.evidenceId) || `${collapse(record.subjectId)}#${collapse(record.id)}`
    if (seen.has(id)) continue
    seen.add(id)
    const status = normalizeEvidenceStatus(record.status)
    counts[status] += 1
  }
  return { declared: counts.declared, observed: counts.observed, unavailable: counts.unavailable, total: seen.size }
}

/** 折叠成「对象 / 状态 / 事实 / 来源 / 限制」的一行，导出与界面共用。 */
export function evidenceRows(model) {
  const safe = obj(model)
  return arr(safe.table).map((row) => {
    const record = obj(row)
    return {
      evidenceId: collapse(record.evidenceId),
      subjectId: collapse(record.subjectId),
      subject: obj(record.label),
      status: normalizeEvidenceStatus(record.status),
      statusLabel: labelOf(EVIDENCE_STATUS_LABELS, normalizeEvidenceStatus(record.status)),
      fact: obj(record.fact),
      source: obj(record.source),
      limitation: obj(record.limitation),
    }
  })
}

/**
 * 导出证据快照（`FR-EVIDENCE-010`）。输出只含身份、条件、观察、限制与来源；
 * 不含 session、绝对路径、工具参数 / 结果、秘密或隐藏推理。相同的输入得到逐字节相同的 JSON。
 */
export function buildEvidenceExport(model) {
  const safe = obj(model)
  const identity = obj(safe.identity)
  const drift = obj(safe.drift)
  const evaluation = obj(safe.evaluation)
  const observations = arr(safe.chain).map((stage) => {
    const record = obj(stage)
    return {
      evidenceId: collapse(record.evidenceId),
      subjectId: collapse(record.id),
      status: normalizeEvidenceStatus(record.status),
      claim: {
        zh: collapse(obj(record.label).zh),
        en: collapse(obj(record.label).en),
      },
      facts: arr(record.facts).map((item) => {
        const entry = obj(item)
        return {
          id: collapse(entry.id),
          label: { zh: collapse(obj(entry.label).zh), en: collapse(obj(entry.label).en) },
          kind: collapse(entry.kind),
          value: entry.value === null || entry.value === undefined ? EVIDENCE_UNAVAILABLE_TEXT : entry.value,
        }
      }),
      limitation: arr(record.limitations).map((item) => obj(item).code).filter(Boolean),
    }
  })
  const limitations = []
  const provenance = []
  for (const entry of [...arr(safe.chain), ...arr(safe.boundaries), ...arr(safe.table)]) {
    const record = obj(entry)
    for (const item of arr(record.limitations)) {
      const code = collapse(obj(item).code)
      if (code && !limitations.includes(code)) limitations.push(code)
    }
    const single = obj(record.limitation)
    const singleCode = collapse(single.code)
    if (singleCode && !limitations.includes(singleCode)) limitations.push(singleCode)
  }
  for (const item of arr(safe.provenance)) {
    const entry = obj(item)
    provenance.push({
      source: collapse(obj(entry.source).en),
      sourceType: collapse(entry.sourceType),
      reference: collapse(entry.reference),
    })
  }
  return {
    schemaVersion: EVIDENCE_EXPORT_SCHEMA_VERSION,
    modelVersion: EVIDENCE_SCHEMA_VERSION,
    skill: {
      name: collapse(safe.skillName),
      fingerprint: collapse(identity.skillFingerprint?.value),
      fingerprintScope: collapse(identity.skillFingerprint?.scope),
      instructionFingerprint: {
        current: collapse(obj(identity.instructionFingerprint).current),
        match: collapse(obj(identity.instructionFingerprint).match),
      },
      sourceIdentity: {
        provider: collapse(obj(identity.sourceIdentity).provider),
        kind: collapse(obj(identity.sourceIdentity).kind),
        resourceKind: collapse(obj(identity.sourceIdentity).resourceKind),
      },
    },
    case: { caseId: collapse(identity.caseId) },
    run: { runId: collapse(identity.runId) },
    conditions: arr(evaluation.conditions).reduce((accumulator, item) => {
      const entry = obj(item)
      const id = collapse(entry.id)
      if (id) accumulator[id] = entry.value === null || entry.value === undefined ? EVIDENCE_UNAVAILABLE_TEXT : entry.value
      return accumulator
    }, {}),
    comparability: {
      comparable: obj(evaluation.comparability).comparable === true,
      axis: collapse(obj(evaluation.comparability).axis),
      blockers: arr(obj(evaluation.comparability).blockers).map((item) => collapse(obj(item).id)),
    },
    drift: {
      state: collapse(drift.state),
      currentFingerprint: collapse(drift.currentFingerprint),
      evidenceFingerprints: arr(drift.evidenceFingerprints).map((value) => collapse(value)),
      caseCount: count(drift.caseCount) ?? 0,
      runCount: count(drift.runCount) ?? 0,
    },
    observations,
    statusRows: evidenceRows(safe).map((row) => ({
      evidenceId: row.evidenceId,
      subjectId: row.subjectId,
      status: row.status,
      fact: row.fact,
      source: row.source,
      limitation: row.limitation,
    })),
    limitations,
    provenance,
  }
}
