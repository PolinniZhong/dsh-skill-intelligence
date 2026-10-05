/**
 * V1.0「Skill Evaluation」的纯函数层（`FR-EVAL-*`，`spec/PRD.md` §5.13）。
 *
 * 这一层只做四件事，全部是**确定性**的：把 V0.10 那份一次性任务升级成一个可重复的 Case、按 Case + Run
 * 生成断言骨架、把两次 Run 按**同一个 Case** 对照、把一次 Run 的运行时事实摆成四段证据。它**不**
 * 给分、不排名、不做任何聚合（`FR-EVAL-012` / `FR-EVAL-014`），也**不**调用模型（`FR-EVAL-005`）。
 *
 * 两条纪律写在最前面，改动这一层之前先读：
 *
 * 1. **缺就承认缺。** 任何取不到的字段写成 `unavailable`（`EVALUATION_UNAVAILABLE_TEXT`），
 *    不许用默认值、推断值或上一版的值填补（`FR-EVAL-006`）。缺失的数据**永远**推不出「没发生」：
 *    因此「没有观察到」只映射成「无法判断」，不映射成「未通过」。
 * 2. **Case 的默认观察点是问句，不是结论。** 界面能给的只有「这条断言谁说的、结论是什么」，
 *    结果一律来自用户判定或 Agent 自报（`FR-EVAL-010`）。
 *
 * 本模块**只依赖** `./skill-instance-test.mjs`（单行具名 import，`AGENTS.md` §6.6 允许的第二种写法）：
 * 「Case 的任务 Prompt」与 V0.10 的实例验收**必须是同一份生成结果**，否则同一个 Case 在两处会长得不一样。
 */

import { buildSkillInstanceTest } from './skill-instance-test.mjs'

/** Case 的结构版本。字段增删才 +1；只改生成结果的内容不改它。 */
export const EVALUATION_CASE_SCHEMA_VERSION = 1

/** Run 的结构版本（`FR-EVAL-006` 那张字段表的版本）。 */
export const EVALUATION_RUN_SCHEMA_VERSION = 1

/**
 * **生成器版本**（`FR-EVAL-003` / `FR-EVAL-005`）。它是 `caseId` 的四个输入之一：
 * 生成规则一改，同一个 Skill 也会得到一个新的 `caseId`，旧 Case 原样留着（`FR-EVAL-004`）。
 */
export const EVALUATION_CASE_GENERATOR_VERSION = '1.0.0'

/** `caseId` 的域分隔前缀：哈希输入的第一行，避免与别处的 sha256 撞语义。 */
export const EVALUATION_CASE_HASH_DOMAIN = 'dsh-skill-evaluation-case'

/** 值取不到时**唯一**允许写的东西。 */
export const EVALUATION_UNAVAILABLE_TEXT = 'unavailable'

/** 结论只有三态（`FR-EVAL-012`）。顺序就是界面上的顺序。 */
export const EVALUATION_VERDICT_IDS = ['pass', 'fail', 'unknown']
export const EVALUATION_VERDICT_LABELS = {
  pass: '通过',
  fail: '未通过',
  unknown: '无法判断',
}

/** 每条断言的来源只有三种（`FR-EVAL-012`）。`protocol` = 协议事实。 */
export const EVALUATION_SOURCE_IDS = ['protocol', 'user', 'agent']
export const EVALUATION_SOURCE_LABELS = {
  protocol: '协议事实',
  user: '用户判定',
  agent: 'Agent 自报',
}

/** Runtime Evidence 的四段固定顺序（`FR-EVAL-010`）。 */
export const EVALUATION_EVIDENCE_STAGE_IDS = ['trigger', 'load', 'use', 'outcome']
export const EVALUATION_STAGE_LABELS = {
  trigger: '触发',
  load: '加载',
  use: '使用',
  outcome: '结果',
}

/** 四段各自的「这一段够不着什么」。它们是**固定说明句**，跟着本模块走，界面不许改写。 */
export const EVALUATION_STAGE_REACH = {
  trigger: '这一段够不着什么：它只说「提供过」。模型有没有看见、有没有采纳，这一段够不着。',
  load: '这一段够不着什么：这是协议级证据 —— 它只证明「这些字节进入了模型可见的对话」，不证明模型采用了它。',
  use: '这一段够不着什么：有工具活动 ≠ 用了这条指令；没有工具活动也 ≠ 没用。这一段只报数，不解释。',
  outcome: '这一段够不着什么：结果由人给。结果好，也不能从这里反推「是这个 Skill 造成的」。',
}

/** 三条不等式（`FR-EVAL-011`）：**界面上的固定说明句**，不能只写在文档里。 */
export const EVALUATION_INEQUALITIES = ['加载 ≠ 使用', '使用 ≠ 结果', '结果 ≠ 这个 Skill 造成的']
export const EVALUATION_INEQUALITY_NOTE = '这三句是界面上的固定说明句，不是文档里的一句话。只要这一段出现，它们就在。'

/**
 * 对照列只许出现**事实词**（`FR-EVAL-012` / `FR-EVAL-013`）：说两次各发生了什么，
 * 不折算成分数、不排序。键按「改前 → 改后」的结论对生成。
 */
export const EVALUATION_COMPARISON_WORDS = {
  bothPass: '两次都通过',
  bothFail: '两次都未通过',
  bothUnknown: '两次都无法判断',
  beforeFailAfterPass: '改前未通过 → 改后通过',
  beforeUnknownAfterPass: '改前无法判断 → 改后通过',
  beforePassAfterUnknown: '改后无法判断',
  beforeFailAfterUnknown: '改后无法判断',
  beforePassAfterFail: '回归信号（改前通过 → 改后未通过）',
  beforeUnknownAfterFail: '改后未通过',
  beforeFailAfterFail: '两次都未通过',
  notComparable: '条件不同，不做对照',
}

/** 对照的两条轴（`FR-EVAL-013`）。同一个 Case 只许这两条。 */
export const EVALUATION_COMPARISON_AXES = ['before-after', 'baseline-with']
export const EVALUATION_COMPARISON_AXIS_LABELS = {
  'before-after': '改前 · 改后（同一 Skill 的两个版本）',
  'baseline-with': 'Baseline · With Skill（同一条件，有 / 无这个 Skill）',
}

/**
 * 对照必须逐项相等的**实验条件**（`FR-EVAL-006` 里那些决定结果可比性的字段）。
 * 注意 `turn` / `step` **不在**这张表里：它们是日志顺序游标，不是实验条件（`FR-EVAL-009`）。
 */
export const EVALUATION_CONDITION_FIELDS = [
  { key: 'model', label: '模型' },
  { key: 'provider', label: 'Provider' },
  { key: 'reasoningEffort', label: '推理档位' },
  { key: 'contextWindow', label: '上下文窗口' },
]
// 注意 `observedInstructionSha256` **不在**这张表里。它是**被对照的东西**，不是要拉平的条件：
// 「改前 vs 改后」这条轴上两侧的指令指纹注定不同，把它当条件会让每一次改前改后都变成「不可对照」。

/** 模型侧与 Skill 来源侧不许共用一个词（`FR-EVAL-007`）：这两张表就是界面的两个抬头。 */
export const EVALUATION_RUN_FIELD_LABELS = {
  startedAt: '开始时间',
  turn: '日志游标',
  model: '模型',
  provider: 'Provider（模型侧）',
  reasoningEffort: '推理档位',
  dshVersion: 'DSH 版本',
  pluginVersion: '插件版本',
  observedInstructionSha256: '观察到的指令指纹',
  currentInstructionSha256: '当前指令指纹',
  match: '指纹比对结论',
  load: '加载证据',
  runtimeEvents: '运行时活动',
  outcome: '结果',
}

/** 这一版**刻意不出现**的东西。守卫拿它查界面，界面拿它画那张「划掉的清单」。 */
export const EVALUATION_FORBIDDEN_OUTPUTS = [
  'Skill Score',
  '断言通过率',
  '通过率',
  '稳定性',
  '方差',
  '标准差',
  '排名',
  '趋势图',
  '平均分',
]

/** 证据词表的禁用词这一层同样成立（`AGENTS.md` §6.7）：观测不到，就不许说任何「已…」。 */
export const EVALUATION_FORBIDDEN_WORDS = [
  '已执行',
  '未执行',
  '已完成',
  '未完成',
  '执行成功',
  '执行失败',
  '已运行',
  '未运行',
  '已加载',
  '已读取',
  '已注入',
  '已生效',
]

function collapse(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
}

function unavailableOf(value) {
  const text = collapse(value)
  return text.length > 0 ? text : EVALUATION_UNAVAILABLE_TEXT
}

/**
 * 指纹的写法：**恰好一个** `sha256:` 前缀。
 *
 * 为什么要它：真链路上的指纹已经带前缀 —— `src/core/trace-reducer.mjs:186` 与
 * `src/core/source-snapshot.mjs:4` 的 `sha256()` 返回的都是 `sha256:<hex>`，
 * `compareDefinitionToRun()` 只是把 `evidenceFingerprint.value` 原样透传。所以模板里
 * 再写一个字面 `sha256:` 会渲染成 `sha256:sha256:…`；而 `unavailable` 又绝不能变成
 * `sha256:unavailable`（那是把「拿不到」伪装成一个指纹）。这个函数把三种输入都收成一个写法。
 */
function fingerprintText(value) {
  const text = collapse(value)
  if (text.length === 0 || text === EVALUATION_UNAVAILABLE_TEXT) return EVALUATION_UNAVAILABLE_TEXT
  return text.startsWith(EVALUATION_CASE_ID_PREFIX) ? text : `${EVALUATION_CASE_ID_PREFIX}${text}`
}

/**
 * 指纹规范化：只留源码里那三个名字（`src/core/source-snapshot.mjs` 的
 * `observedInstructionSha256` / `currentInstructionSha256` / `match`），别处来的形状一律降级成
 * `unavailable` —— 宁可承认没有，也不要凭形状猜出一份指纹（`FR-EVAL-006`）。
 */
function normalizeFingerprint(input, fallbackSha) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const instructionSha256 = collapse(safe.instructionSha256) || collapse(fallbackSha)
  const match = ['match', 'mismatch', 'unavailable'].includes(safe.match) ? safe.match : null
  return {
    instructionSha256: instructionSha256.length > 0 ? instructionSha256 : EVALUATION_UNAVAILABLE_TEXT,
    match: match ?? EVALUATION_UNAVAILABLE_TEXT,
  }
}

/**
 * `caseId` 的哈希输入（`FR-EVAL-003`）：**逐行**、顺序固定、只有那四样东西 ——
 * 任务 Prompt、Skill 指纹、`scopeIds`、生成器版本 —— 外加一行域分隔。
 *
 * 哈希本身**不在这里算**：生成器保持零 `import`（`FR-INST-021`），宿主层拿到这一串再
 * `sha256()`（`FR-EVAL-003`）。因此这一串必须是**纯粹**的：不含时间、不含随机数、不含会话 id。
 */
export function caseHashInput(caseObject) {
  const safe = caseObject !== null && typeof caseObject === 'object' ? caseObject : {}
  const prompt = safe.taskPrompt !== null && typeof safe.taskPrompt === 'object' ? safe.taskPrompt : {}
  const fingerprint = normalizeFingerprint(safe.skillFingerprint, null)
  const scopeIds = Array.isArray(safe.scopeIds) ? safe.scopeIds.filter((id) => typeof id === 'string') : []
  return [
    `${EVALUATION_CASE_HASH_DOMAIN}@${EVALUATION_CASE_SCHEMA_VERSION}`,
    `generator:${collapse(safe.generatorVersion) || EVALUATION_CASE_GENERATOR_VERSION}`,
    `skill:${collapse(safe.skillName)}`,
    `fingerprint:${fingerprint.instructionSha256}`,
    `scopes:${scopeIds.join(',')}`,
    `prompt:${collapse(prompt.text)}`,
  ].join('\n')
}

/** 宿主算完哈希之后，界面与落盘都用这个形状写 id：`sha256:<hex>`。 */
export const EVALUATION_CASE_ID_PREFIX = 'sha256:'

/**
 * 生成一个 Evaluation Case。
 *
 * 输入与 `buildSkillInstanceTest()` **同一份**（`skillName` / `intent` / `comparison` / `definitionText` /
 * `description` / `framework` / `validation` / `scopeIds`），另加两项：
 *
 * - `skillFingerprint`：这一版的那份指令指纹（`{instructionSha256, match}`），取不到就 `unavailable`；
 * - `caseId`：由宿主算好回填（`caseHashInput()` + `sha256`）。生成器自己**不算**哈希。
 *
 * 设计上刻意让 Case **包住** V0.10 的那份任务：`taskPrompt` / `observations` / `regressions` 三个字段
 * 就是实例验收那一份的逐字内容（`FR-EVAL-001`：升级成可重复的，不是另写一份）。
 */
export function buildEvaluationCase(input) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const instance = buildSkillInstanceTest(safe)
  const skillName = collapse(safe.skillName) || collapse(instance.skillName)
  const fingerprint = normalizeFingerprint(safe.skillFingerprint, safe.instructionSha256)

  if (!instance.available) {
    // 生成不出来时，这个人话由 V0.10 那个模块给（同一个原因码，同一句话），不另写一份。
    return {
      available: false,
      reason: instance.reason,
      message: instance.message,
      case: null,
      hashInput: null,
    }
  }

  const caseObject = {
    schemaVersion: EVALUATION_CASE_SCHEMA_VERSION,
    generatorVersion: EVALUATION_CASE_GENERATOR_VERSION,
    caseId: typeof safe.caseId === 'string' && safe.caseId.length > 0 ? safe.caseId : null,
    skillName,
    skillFingerprint: fingerprint,
    scopeIds: instance.scopeIds,
    changedScopeIds: instance.changedScopeIds,
    primaryScopeId: instance.primaryScopeId,
    taskPrompt: {
      task: instance.prompt.task,
      goal: instance.prompt.goal,
      output: instance.prompt.output,
      note: instance.prompt.note,
      text: instance.prompt.text,
    },
    observations: instance.observations,
    regressions: instance.regression.constraints,
    regressionUnavailable: instance.regression.unavailable,
    limitations: instance.limitations,
    source: { kind: 'instance-test', generatorVersion: EVALUATION_CASE_GENERATOR_VERSION },
  }

  return {
    available: true,
    reason: null,
    message: null,
    case: caseObject,
    hashInput: caseHashInput(caseObject),
  }
}

/**
 * 一次 Run 的可信度全在「缺就承认缺」上，所以先把形状规范化：每个字段要么是它自己，
 * 要么是 `unavailable`。`FR-EVAL-006` 那张字段表里**没有**的东西一律不落。
 */
export function normalizeEvaluationRun(input) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const load = safe.load !== null && typeof safe.load === 'object' ? safe.load : {}
  const outcome = safe.outcome !== null && typeof safe.outcome === 'object' ? safe.outcome : {}
  const runtime = safe.runtimeEvents !== null && typeof safe.runtimeEvents === 'object' ? safe.runtimeEvents : {}
  const activities = Array.isArray(runtime.activities) ? runtime.activities : []
  const observed = collapse(load.observedInstructionSha256) || collapse(safe.observedInstructionSha256)
  const current = collapse(load.currentInstructionSha256) || collapse(safe.currentInstructionSha256)
  const match = ['match', 'mismatch', 'unavailable'].includes(load.match)
    ? load.match
    : (['match', 'mismatch', 'unavailable'].includes(safe.match) ? safe.match : EVALUATION_UNAVAILABLE_TEXT)
  const judgements = safe.judgements !== null && typeof safe.judgements === 'object' ? safe.judgements : {}
  return {
    schemaVersion: EVALUATION_RUN_SCHEMA_VERSION,
    runId: collapse(safe.runId) || null,
    caseId: collapse(safe.caseId) || null,
    startedAt: Number.isFinite(safe.startedAt) ? safe.startedAt : null,
    turn: Number.isFinite(safe.turn) ? safe.turn : null,
    step: Number.isFinite(safe.step) ? safe.step : null,
    model: unavailableOf(safe.model),
    provider: unavailableOf(safe.provider),
    reasoningEffort: unavailableOf(safe.reasoningEffort),
    contextWindow: Number.isFinite(safe.contextWindow) ? safe.contextWindow : EVALUATION_UNAVAILABLE_TEXT,
    dshVersion: unavailableOf(safe.dshVersion),
    pluginVersion: unavailableOf(safe.pluginVersion),
    observedInstructionSha256: observed.length > 0 ? observed : EVALUATION_UNAVAILABLE_TEXT,
    currentInstructionSha256: current.length > 0 ? current : EVALUATION_UNAVAILABLE_TEXT,
    match,
    load: {
      status: ['loaded', 'offered-only', 'unavailable'].includes(load.status) ? load.status : EVALUATION_UNAVAILABLE_TEXT,
      seq: Number.isFinite(load.seq) ? load.seq : null,
      callSeq: Number.isFinite(load.callSeq) ? load.callSeq : null,
      resultSeq: Number.isFinite(load.resultSeq) ? load.resultSeq : null,
    },
    trigger: {
      catalogPublished: safe.trigger?.catalogPublished === true,
      offerCount: Number.isFinite(safe.trigger?.offerCount) ? safe.trigger.offerCount : null,
    },
    runtimeEvents: {
      // 「读不到这一次运行的日志」与「这一次没有工具活动」是两件事，不能都写成 0
      // （`FR-EVAL-010`：缺就是缺）。只有显式收到 `available: false` 才降级。
      available: runtime.available === false ? false : true,
      activities: activities
        .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.name === 'string')
        .map((entry) => ({ name: entry.name, count: Number.isFinite(entry.count) ? entry.count : 0 })),
      total: Number.isFinite(runtime.total) ? runtime.total : activities.reduce((sum, entry) => sum + (Number.isFinite(entry?.count) ? entry.count : 0), 0),
    },
    outcome: {
      source: ['user', 'agent'].includes(outcome.source) ? outcome.source : EVALUATION_UNAVAILABLE_TEXT,
      text: collapse(outcome.text) || EVALUATION_UNAVAILABLE_TEXT,
    },
    judgements,
  }
}

/** 「改前 / 改后」这一列的说法：先看谁够得着条件，再按三态对给事实词。 */
export function comparisonWordOf(before, after, comparable = true) {
  if (!comparable) return EVALUATION_COMPARISON_WORDS.notComparable
  const a = EVALUATION_VERDICT_IDS.includes(before) ? before : 'unknown'
  const b = EVALUATION_VERDICT_IDS.includes(after) ? after : 'unknown'
  if (a === 'pass' && b === 'pass') return EVALUATION_COMPARISON_WORDS.bothPass
  if (a === 'fail' && b === 'fail') return EVALUATION_COMPARISON_WORDS.bothFail
  if (a === 'unknown' && b === 'unknown') return EVALUATION_COMPARISON_WORDS.bothUnknown
  if (a === 'fail' && b === 'pass') return EVALUATION_COMPARISON_WORDS.beforeFailAfterPass
  if (a === 'unknown' && b === 'pass') return EVALUATION_COMPARISON_WORDS.beforeUnknownAfterPass
  if (a === 'fail' && b === 'unknown') return EVALUATION_COMPARISON_WORDS.beforeFailAfterUnknown
  if (a === 'pass' && b === 'unknown') return EVALUATION_COMPARISON_WORDS.beforePassAfterUnknown
  if (a === 'pass' && b === 'fail') return EVALUATION_COMPARISON_WORDS.beforePassAfterFail
  return EVALUATION_COMPARISON_WORDS.beforeUnknownAfterFail
}

/**
 * 断言骨架（`FR-EVAL-012`）：**一条一条列**，每条三个字段 —— 陈述、结论、来源。
 *
 * 两类断言：
 *
 * - **协议事实**：只由这一次 Run 的协议级数据决定，与人的判断无关；
 * - **观察点**：Case 里那几条问句，逐条等用户的判定（`run.judgements[observationId]`）。
 *
 * **没有判定的观察点写「无法判断」，不是「未通过」**：缺失的数据证明不了失败（同 `FR-EVAL-006`）。
 * 返回值里**没有任何聚合字段** —— 通过率、通过条数、平均分都不许在这一层出现（`FR-EVAL-012`）。
 */
export function buildEvaluationAssertions(input) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const caseObject = safe.case !== null && typeof safe.case === 'object' ? safe.case : {}
  const run = normalizeEvaluationRun(safe.run)
  const rows = []

  const loadObserved = run.load.status === 'loaded'
  rows.push({
    id: 'load-evidence',
    text: '本次运行的加载证据存在（在某个 seq 拿到了指令正文）',
    verdict: loadObserved ? 'pass' : 'unknown',
    source: 'protocol',
    why: loadObserved
      ? `在 seq ${run.load.seq ?? '?'} 拿到了指令正文（协议事实）。`
      : '这一次没有在任何一个 seq 上拿到指令正文。缺就是缺 —— 它不写成「没加载」，因为看不到不等于没发生。',
  })

  rows.push({
    id: 'fingerprint-match',
    text: '运行时的指令指纹与当前文件一致',
    verdict: run.match === 'match' ? 'pass' : (run.match === 'mismatch' ? 'fail' : 'unknown'),
    source: 'protocol',
    why: run.match === 'match'
      ? '两侧指纹相同。'
      : (run.match === 'mismatch'
        ? '两侧指纹不同：只说明版本变了，不说明好坏。'
        : '至少有一侧指纹缺失，比对结论是 unavailable —— 缺就是缺，不写成「不一致」。'),
  })

  const references = Array.isArray(caseObject.scopeIds) ? caseObject.scopeIds.includes('references') : false
  if (references) {
    rows.push({
      id: 'references-used',
      text: '本次运行用到了 references/ 下的资料',
      verdict: 'unknown',
      source: 'protocol',
      why: '工具活动只给元数据（次数与工具名），不含参数与结果 —— 分不出哪一次读的是 references/。要回答它就得读参数，而那正是这一版不许碰的。',
    })
  }

  const observations = Array.isArray(caseObject.observations) ? caseObject.observations : []
  for (const observation of observations) {
    if (observation === null || typeof observation !== 'object' || typeof observation.id !== 'string') continue
    const judged = EVALUATION_VERDICT_IDS.includes(run.judgements[observation.id]) ? run.judgements[observation.id] : null
    rows.push({
      id: observation.id,
      text: observation.text,
      verdict: judged ?? 'unknown',
      source: judged ? 'user' : 'user',
      why: judged ? '来自你的判定。' : '还没有人给它结论，因此是「无法判断」—— 这一条只能由人来给（插件不判定）。',
    })
  }

  return { rows, unavailable: EVALUATION_UNAVAILABLE_TEXT }
}

/**
 * 同一个 Case 的两条轴（`FR-EVAL-013`）：**Before Skill vs After Skill** 或
 * **Baseline vs With Skill**。任何一项实验条件不同，就**不做对照** —— 只并排摆放，
 * 说清哪一项不同，不给对照结论。这不是缺陷，是这一版的纪律。
 */
export function compareEvaluationRuns(input) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const before = normalizeEvaluationRun(safe.before)
  const after = normalizeEvaluationRun(safe.after)
  const conditions = EVALUATION_CONDITION_FIELDS.map((field) => {
    const lhs = field.key in before ? before[field.key] : null
    const rhs = field.key in after ? after[field.key] : null
    return { key: field.key, label: field.label, before: lhs, after: rhs, equal: lhs === rhs }
  })
  const blockers = conditions.filter((entry) => !entry.equal)

  const sameCase = before.caseId !== null && after.caseId !== null && before.caseId === after.caseId
  const instructionDiffers = before.observedInstructionSha256 !== after.observedInstructionSha256
  const instructionKnown = before.observedInstructionSha256 !== EVALUATION_UNAVAILABLE_TEXT
    && after.observedInstructionSha256 !== EVALUATION_UNAVAILABLE_TEXT
  let axis = null
  if (sameCase) {
    // 两版 Skill：指令指纹不同 ⇒ 改前 · 改后。
    if (instructionDiffers) axis = 'before-after'
    // 同一版 Skill：指纹相同（两侧都读得到），差别只在「提供过 / 没提供过」⇒ Baseline · With Skill。
    else if (instructionKnown && before.trigger.catalogPublished !== after.trigger.catalogPublished) axis = 'baseline-with'
  }

  const comparable = sameCase && blockers.length === 0 && axis !== null
  const reason = !sameCase
    ? '这两次运行不是同一个 Case，因此不做对照。'
    : (axis === null
      ? '这两次运行看不出属于哪条对照轴：指令指纹相同、Skill 的提供情况也相同，或者两侧的指纹都缺失。'
      : (blockers.length > 0
        ? `有 ${blockers.length} 项实验条件不同（${blockers.map((entry) => entry.label).join(' · ')}），因此不做对照 —— 差异无法归因。`
        : null))

  const beforeRows = buildEvaluationAssertions({ case: safe.case, run: before })
  const afterRows = buildEvaluationAssertions({ case: safe.case, run: after })
  const afterById = new Map(afterRows.rows.map((row) => [row.id, row]))
  const rows = beforeRows.rows.map((row) => {
    const other = afterById.get(row.id) ?? null
    return {
      id: row.id,
      text: row.text,
      source: row.source,
      before: row.verdict,
      after: other ? other.verdict : null,
      comparison: other === null
        ? EVALUATION_COMPARISON_WORDS.notComparable
        : comparisonWordOf(row.verdict, other.verdict, comparable),
    }
  })

  return {
    comparable,
    axis,
    axisLabel: axis ? EVALUATION_COMPARISON_AXIS_LABELS[axis] : null,
    reason,
    conditions,
    blockers,
    rows,
  }
}

/**
 * Runtime Evidence 四段（`FR-EVAL-010`）：Trigger → Load → Use → Outcome。
 * 每段三件东西：这一段看到了什么（`facts`）、**这一段够不着什么**（`reach`，固定句）、
 * 以及它的 `source`（协议事实 / 用户判定 / Agent 自报）。四段顺序由常量钉住。
 */
export function buildRuntimeEvidence(input) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const run = normalizeEvaluationRun(safe.run)
  const stages = []

  stages.push({
    id: 'trigger',
    status: run.trigger.catalogPublished ? 'observed' : 'unavailable',
    source: 'protocol',
    facts: run.trigger.catalogPublished
      ? [
        '本次会话向模型提供过这个 Skill（catalogPublished = true）。',
        ...(run.trigger.offerCount !== null ? [`第 ${run.trigger.offerCount} 次提供。`] : []),
      ]
      : ['这一次会话里没有观察到「向模型提供过这个 Skill」这条事实。'],
  })

  stages.push({
    id: 'load',
    status: run.load.status === 'loaded' ? 'observed' : (run.load.status === 'offered-only' ? 'not-observed' : 'unavailable'),
    source: 'protocol',
    facts: run.load.status === 'loaded'
      ? [
        `在 seq ${run.load.seq ?? '?'} 拿到了指令正文。`,
        `观察到的指令指纹 ${fingerprintText(run.observedInstructionSha256)}`,
        `与当前文件指纹比对：${run.match}`,
      ]
      : [
        run.load.status === 'offered-only'
          ? '只在目录里提供过，没有任何一个 seq 上拿到指令正文。'
          : '没有可用的加载证据（本次运行没有记录到这一项）。',
        `指纹比对结论：${run.match}`,
      ],
  })

  stages.push({
    id: 'use',
    status: run.runtimeEvents.available === false ? 'unavailable' : (run.runtimeEvents.total > 0 ? 'observed' : 'not-observed'),
    source: 'protocol',
    facts: run.runtimeEvents.available === false
      ? ['读不到这一次运行的会话日志，因此工具活动拿不到 —— 缺就是缺，不写成「没有活动」。']
      : (run.runtimeEvents.total > 0
        ? [
          `${run.runtimeEvents.total} 次工具活动（仅元数据，不含参数与结果）：`,
          run.runtimeEvents.activities.map((entry) => `${entry.name} ×${entry.count}`).join(' / '),
        ]
        : ['0 次工具活动（仅元数据）。']),
  })

  stages.push({
    id: 'outcome',
    status: run.outcome.source === 'unavailable' ? 'unavailable' : 'observed',
    source: run.outcome.source === 'agent' ? 'agent' : (run.outcome.source === 'user' ? 'user' : 'protocol'),
    facts: run.outcome.source === 'unavailable'
      ? ['还没有人给这一次运行的结果下过判断。']
      : [`${run.outcome.source === 'agent' ? 'Agent 自报' : '用户判定'}：${run.outcome.text}`],
  })

  return {
    stages: stages.map((stage) => ({
      ...stage,
      label: EVALUATION_STAGE_LABELS[stage.id],
      reach: EVALUATION_STAGE_REACH[stage.id],
    })),
    inequalities: EVALUATION_INEQUALITIES,
    inequalitiesNote: EVALUATION_INEQUALITY_NOTE,
  }
}
