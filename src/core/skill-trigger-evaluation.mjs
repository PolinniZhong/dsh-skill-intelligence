/**
 * V1.4「Skill Trigger Evaluation（触发评测）」的纯函数层（`FR-TRIG-*`，`spec/PRD.md` §5.15）。
 *
 * 它回答的只有一个问题：**在真实会话里，这个 Skill 的加载记录出现过吗？** —— 出现的方式是
 * 模型自己调的（`model-invoked`），还是用户打了 `/name`（`user-explicit`）？这一次到底读到了多少？
 *
 * 这一层**不**给分、不排名、不算通过率、不画趋势、不调模型、不建会话、不读文件（`FR-TRIG-020`）。
 * 它只做四件确定性的事：算 Case 的哈希输入、把一次观察收敛成三态、把一次观察与用户的预期逐条对照、
 * 把两次 Run 按同一 Case 摆在一起说「可比 / 不可比」。
 *
 * ## 两条写在最前面的纪律
 *
 * 1. **缺就承认缺。** 任何取不到的字段写 `TRIGGER_UNAVAILABLE_TEXT`；`unavailable` 不许被写成
 *    `sha256:unavailable`（那是把「拿不到」伪装成一个指纹）。
 * 2. **「没有观察到加载」永远不是「没有触发」。** 没有加载记录只能说明**读到的这一段里没有**；
 *    要把它变成一句能与预期对照的话，必须同时满足「读取覆盖完整」与「用户声明这是新会话」——
 *    两条缺一条，对照结果一律降级 `inconclusive`（`FR-TRIG-012`）。
 *
 * ## 为什么是零 `import`
 *
 * 客户端要念这一层里的词表与说明句（`AGENTS.md` §6.6：客户端只能 `require` 无依赖或单行具名 import
 * 的 core 模块）。所以哈希不在这里算：`triggerCaseHashInput()` 只产出**逐行、顺序固定、无时间无随机数**
 * 的输入串，`sha256` 由宿主层算（与 V1.0 的 `caseHashInput()` 同一套约定，`FR-TRIG-004`）。
 */

/** Case 的结构版本。字段增删才 +1。 */
export const TRIGGER_CASE_SCHEMA_VERSION = 1

/** Run 的结构版本。 */
export const TRIGGER_RUN_SCHEMA_VERSION = 1

/** Case 身份生成规则的版本：它是 `caseId` 的输入之一，规则一改就换新 id，旧 Case 原样留着。 */
export const TRIGGER_CASE_GENERATOR_VERSION = '1.0.0'

/**
 * `caseId` 的域分隔前缀。**它与 V1.0 的 `dsh-skill-evaluation-case` 是两个域**：
 * 触发 Case 的身份里**不含** Skill 指纹（`FR-TRIG-005`），所以改 `description` 之后同一个
 * 测试用例仍然是同一个 `caseId` —— 这正是这一版能「复测同一组用例」的前提。
 */
export const TRIGGER_CASE_HASH_DOMAIN = 'dsh-skill-trigger-case'

/** 值取不到时**唯一**允许写的东西。 */
export const TRIGGER_UNAVAILABLE_TEXT = 'unavailable'

/** 宿主算完哈希之后 id 的写法。 */
export const TRIGGER_CASE_ID_PREFIX = 'sha256:'

/** 一次观察的三态（`FR-TRIG-010`）。顺序就是界面上的顺序。 */
export const TRIGGER_OBSERVATION_IDS = ['loaded', 'not-observed', 'unknown']
export const TRIGGER_OBSERVATION_LABELS = {
  loaded: '观察到加载',
  'not-observed': '未观察到加载',
  unknown: '无法判断',
}

/** 加载是怎么发生的（`FR-TRIG-011`）。`user-explicit` 一律不算自然触发。 */
export const TRIGGER_INVOCATION_IDS = ['model', 'user-explicit', 'unknown']
export const TRIGGER_INVOCATION_LABELS = {
  model: '模型调用',
  'user-explicit': '用户显式调用',
  unknown: '调用方式无法判断',
}

/** 日志读到了多少（`FR-TRIG-013`）。`complete` 有严格前提，见 `triggerCoverageOf()`。 */
export const TRIGGER_COVERAGE_IDS = ['complete', 'partial', 'unknown']
export const TRIGGER_COVERAGE_LABELS = {
  complete: '覆盖完整',
  partial: '覆盖部分',
  unknown: '覆盖未知',
}

/**
 * 「这是新会话」是**用户声明**，不是运行时观测（`FR-TRIG-014`）。界面必须把两档写成
 * 「用户声明为新会话」/「未声明」，不许写成「已确认」。
 */
export const TRIGGER_FRESH_SESSION_IDS = ['user-confirmed', 'unconfirmed']
export const TRIGGER_FRESH_SESSION_LABELS = {
  'user-confirmed': '用户声明为新会话',
  unconfirmed: '未声明新会话',
}

/** 一次观察与用户预期逐条对照的四态（`FR-TRIG-012`）。 */
export const TRIGGER_OUTCOME_IDS = [
  'observed-expected',
  'observed-unexpected',
  'not-observed-with-coverage',
  'inconclusive',
]
export const TRIGGER_OUTCOME_LABELS = {
  'observed-expected': '符合预期：观察到加载',
  'observed-unexpected': '与预期相反：出现了非预期加载',
  'not-observed-with-coverage': '覆盖完整的新会话中未观察到加载',
  inconclusive: '证据不足，不做结论',
}

/** 截图与界面用的短标签（卡片右侧那一枚）。 */
export const TRIGGER_OUTCOME_SHORT_LABELS = {
  'observed-expected': '符合预期',
  'observed-unexpected': '非预期加载',
  'not-observed-with-coverage': '未观察到加载',
  inconclusive: '无法判断',
}

/**
 * 限制项是**封闭词表**（`FR-TRIG-015`）：写进 Run 的只能是这里列出的 id，
 * 界面按 id 取文案，**不许自己现写一句**。
 */
export const TRIGGER_LIMITATION_LABELS = {
  'load-is-protocol-fact': '「加载」是协议级事实：字节进入了模型可见的对话，不证明模型采纳了它。',
  'explicit-call-not-natural-trigger': '这是一次用户显式调用，不能算作自然触发。',
  'no-load-record-is-not-no-trigger': '没有加载记录只说明「读到的这一段里没有」，不是「没有触发」。',
  'coverage-partial': '会话日志的读取覆盖不完整，缺失的部分无法与「本来就没有」区分。',
  'coverage-unknown': '这次没有读到可用的会话日志，观察无从谈起。',
  'observation-scoped-to-now': '这次观察只覆盖到记录这一刻为止；测试会话之后仍可能继续。',
  'fresh-session-declared-by-user': '「新会话」是用户声明，不是插件观测到的。',
  'skill-fingerprint-unavailable': '这一次没有取到 Skill 正文指纹。',
  'description-fingerprint-unavailable': '这一次没有取到 description 指纹。',
  'identity-mismatch': '记录里的 Skill 身份与当前这一份对不上，不能当作同一个对象观察。',
  'invocation-ambiguous': '这条加载记录的调用方式无法判定，不能算自然触发。',
  'conditions-differ': '两次运行的实验条件不同，只能逐条摆事实，不做对照。',
}

/**
 * 界面上**必须逐字出现**的固定说明句（`FR-TRIG-016`）。它们跟着模块走，界面不许改写。
 * 只要「触发边界」这一屏存在，这几句就在。
 */
export const TRIGGER_FIXED_SENTENCES = [
  '没有观察到加载 ≠ 没有触发',
  '加载 ≠ 模型采纳了它',
  '显式调用不算自然触发',
  '不打分、不排名、不自动运行',
]

/** 不评分、不排名、不自动运行：这三个词不许出现在触发评测的任何文案里（`FR-TRIG-020`）。 */
export const TRIGGER_FORBIDDEN_WORDS = [
  '通过率',
  '成功率',
  '得分',
  '评分',
  '排名',
  '排行榜',
  '趋势图',
  '准确率',
  '召回率',
]

/**
 * 触发评测这一维**永远**不产出的东西。与 `EVALUATION_FORBIDDEN_OUTPUTS` 同源，
 * 但这里再写一遍：两道闸门各管一层，删掉一层不会让另一层静默放行。
 */
export const TRIGGER_FORBIDDEN_OUTPUTS = [
  'score',
  'passRate',
  'rate',
  'ranking',
  'trend',
  'variance',
  'stddev',
]

/** Case 的字段上限：提示词是用户资产，但它是**有界**资产（`FR-TRIG-006`）。 */
export const TRIGGER_PROMPT_MAX_CHARS = 2000
export const TRIGGER_CASE_NAME_MAX_CHARS = 120
export const TRIGGER_CASE_TITLE_MAX_CHARS = 80
export const TRIGGER_LIMITATION_MAX_ITEMS = 12

/** 对照的两条轴，与 V1.0 保持一致：同一个 Case 只许这两条。 */
export const TRIGGER_COMPARISON_AXES = ['before-after', 'baseline-with']

/** 决定两次 Run 可比性的**实验条件**（`FR-TRIG-017`）。日志游标不是实验条件。 */
export const TRIGGER_CONDITION_FIELDS = [
  { key: 'model', label: '模型' },
  { key: 'provider', label: 'Provider' },
  { key: 'reasoningEffort', label: '推理档位' },
  { key: 'contextWindow', label: '上下文窗口' },
  { key: 'pluginVersion', label: '插件版本' },
]

/** Run 字段的界面抬头。 */
export const TRIGGER_RUN_FIELD_LABELS = {
  observedAt: '观察时间',
  model: '模型',
  provider: 'Provider',
  reasoningEffort: '推理档位',
  contextWindow: '上下文窗口',
  pluginVersion: '插件版本',
  observation: '观察状态',
  invocationType: '调用方式',
  coverage: '事件覆盖',
  freshSession: '测试会话',
  skillFingerprint: 'Skill 指纹',
  descriptionFingerprint: 'description 指纹',
}

function collapse(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function unavailableOf(value) {
  const text = collapse(value)
  return text.length > 0 ? text : TRIGGER_UNAVAILABLE_TEXT
}

function boundedText(value, max) {
  const text = collapse(value)
  return text.length > max ? text.slice(0, max) : text
}

/**
 * 指纹的写法：**恰好一个** `sha256:` 前缀，`unavailable` 保持原样。
 * 三种输入（空 / 已带前缀 / 裸 hex）都收成一个写法。
 */
function fingerprintText(value) {
  const text = collapse(value)
  if (text.length === 0 || text === TRIGGER_UNAVAILABLE_TEXT) return TRIGGER_UNAVAILABLE_TEXT
  return text.startsWith(TRIGGER_CASE_ID_PREFIX) ? text : `${TRIGGER_CASE_ID_PREFIX}${text}`
}

/**
 * `caseId` 的哈希输入（`FR-TRIG-004` / `FR-TRIG-005`）：逐行、顺序固定、只有四样东西 ——
 * 域与结构版本、生成器版本、Skill 名、用例名与提示词与期望行为。
 *
 * **刻意不含**：Skill 指纹、description 指纹、时间、随机数、会话 id。前两个不含是这一版的
 * 设计核心 —— 改完 `description` 之后，同一组用例仍然是同一组 `caseId`，这样「复测」才有意义。
 */
export function triggerCaseHashInput(caseObject) {
  const safe = caseObject !== null && typeof caseObject === 'object' ? caseObject : {}
  return [
    `${TRIGGER_CASE_HASH_DOMAIN}@${TRIGGER_CASE_SCHEMA_VERSION}`,
    `generator:${collapse(safe.generatorVersion) || TRIGGER_CASE_GENERATOR_VERSION}`,
    `skill:${collapse(safe.skillName)}`,
    `title:${collapse(safe.title)}`,
    `expected:${safe.expectedTrigger === true ? 'trigger' : 'no-trigger'}`,
    `prompt:${collapse(safe.prompt)}`,
  ].join('\n')
}

/**
 * 生成一个 Trigger Case（`FR-TRIG-003`）。
 *
 * `caseId` 由宿主算好回填（`triggerCaseHashInput()` + `sha256`）——本模块不算哈希。
 * 提示词超长返回 `available: false` 而不是悄悄截断：截断会让「这条用例测的是什么」失真。
 */
export function buildTriggerCase(input) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const skillName = collapse(safe.skillName)
  const title = boundedText(safe.title, TRIGGER_CASE_TITLE_MAX_CHARS)
  const rawPrompt = typeof safe.prompt === 'string' ? safe.prompt.trim() : ''
  const prompt = collapse(rawPrompt)
  if (!skillName) return { available: false, reason: 'missing-skill-name', case: null, hashInput: null }
  if (!title) return { available: false, reason: 'missing-title', case: null, hashInput: null }
  if (!prompt) return { available: false, reason: 'missing-prompt', case: null, hashInput: null }
  if (rawPrompt.length > TRIGGER_PROMPT_MAX_CHARS) {
    return { available: false, reason: 'prompt-too-long', case: null, hashInput: null, limit: TRIGGER_PROMPT_MAX_CHARS }
  }

  const caseObject = {
    schemaVersion: TRIGGER_CASE_SCHEMA_VERSION,
    generatorVersion: TRIGGER_CASE_GENERATOR_VERSION,
    caseId: typeof safe.caseId === 'string' && safe.caseId.length > 0 ? safe.caseId : null,
    suiteId: collapse(safe.suiteId) || null,
    skillName,
    title,
    // 提示词原样保留（只去掉首尾空白），因为用户要**逐字**把它贴进新会话。
    prompt: rawPrompt,
    expectedTrigger: safe.expectedTrigger === true,
    note: boundedText(safe.note, TRIGGER_CASE_NAME_MAX_CHARS) || null,
    createdAt: Number.isSafeInteger(safe.createdAt) ? safe.createdAt : null,
    updatedAt: Number.isSafeInteger(safe.updatedAt) ? safe.updatedAt : null,
  }
  return { available: true, reason: null, case: caseObject, hashInput: triggerCaseHashInput(caseObject) }
}

/**
 * 把宿主读到的**加载事实**收敛成一次观察（`FR-TRIG-010`）。
 *
 * 输入是宿主从收据里取出来的、已经归一过的一组事实（每条只带四个字段：
 * `invocationType` / `status` / `coverage` / `skillName`）。本模块不接触 Session API。
 *
 * 判定顺序（先强后弱，取第一条成立者）：
 *
 * 1. 有任何一条**身份匹配且 `status === 'loaded'`** 的记录 ⇒ `loaded`；
 * 2. 名字对不上（收据里出现过同一个 Skill 名但身份标记矛盾）⇒ `unknown`；
 * 3. 日志没读到 / 覆盖不完整 ⇒ `unknown`（**不是** `not-observed`：缺数据推不出「没发生」）；
 * 4. 其余（读到了、覆盖完整、没有匹配的加载记录）⇒ `not-observed`。
 *
 * @param facts - `{ traces, coverage, skillName, identityMismatch }`。
 */
export function triggerObservationOf(facts = {}) {
  const safe = facts !== null && typeof facts === 'object' ? facts : {}
  const skillName = collapse(safe.skillName)
  const traces = Array.isArray(safe.traces) ? safe.traces : []
  const coverage = TRIGGER_COVERAGE_IDS.includes(safe.coverage) ? safe.coverage : 'unknown'
  const loaded = traces.filter((trace) => collapse(trace?.skillName) === skillName && trace?.status === 'loaded')
  if (loaded.length > 0) {
    return {
      observation: 'loaded',
      invocationType: invocationOf(loaded),
      // 观察到加载时，覆盖状态照实报（它说明这次读取有多可信），不强行降级。
      coverage,
      loadedCount: loaded.length,
    }
  }
  if (safe.identityMismatch === true) {
    return { observation: 'unknown', invocationType: 'unknown', coverage, loadedCount: 0, reason: 'identity-mismatch' }
  }
  if (coverage !== 'complete') {
    return { observation: 'unknown', invocationType: 'unknown', coverage, loadedCount: 0, reason: coverage === 'unknown' ? 'coverage-unknown' : 'coverage-partial' }
  }
  return { observation: 'not-observed', invocationType: 'unknown', coverage, loadedCount: 0 }
}

/**
 * 加载是**怎么**发生的。
 *
 * 一条 `loaded` 记录里只认两件事：`invocationType === 'model-invoked'` ⇒ `model`；
 * `user-explicit` ⇒ `user-explicit`。**两条记录同时存在时以 `model-invoked` 为准** ——
 * 用户先打了 `/name`、模型随后又调了一次，那次模型调用仍然是自然触发的事实。
 * 认不出的一律 `unknown`，不许默认成 `model`。
 */
function invocationOf(loadedTraces) {
  const types = loadedTraces.map((trace) => collapse(trace?.invocationType))
  if (types.includes('model-invoked')) return 'model'
  if (types.includes('user-explicit')) return 'user-explicit'
  return 'unknown'
}

/**
 * 一次会话读取 ⇒ 覆盖三态（`FR-TRIG-013`）。
 *
 * 参数是 `readSessionEvents()` 的**整个返回值**（`{ found, read, error? }`），不是一个散字段包 ——
 * 这样调用方**漏传 `found`** 这种错误在类型上就不可能出现（初版吃过一次：漏传 ⇒ 全部误判 `unknown`）。
 *
 * 规则：
 *
 * - **活会话**（`read.live === true`）：事实来自内存事件流，没有帧、没有截断、没有解码失败，
 *   对「到此刻为止」是完整的 ⇒ `complete`。这一刻之后会话仍可能继续，那句限制由
 *   `observation-scoped-to-now` 说出来，不靠降级覆盖状态来表达。
 * - **durable 日志**：`complete` 要同时满足「文件在」「读得到」「没因超大被跳过」
 *   「没命中帧上限」「没有一个帧解码失败」「没有非法行」「没有撕裂尾行」。
 * - **一点都没读到**（`found:false` / `unreadable` / `oversized` / 空文件）⇒ `unknown`：
 *   它不是「读到了一点、只是不全」。写成 `partial` 会让人以为读到了一部分。
 * - 读到一部分 ⇒ `partial`。
 *
 * **没有第三种写法**：不许把 `unknown` 洗成 `complete`。
 */
export function triggerCoverageOf(sessionRead = {}) {
  const safe = sessionRead !== null && typeof sessionRead === 'object' ? sessionRead : {}
  if (safe.found !== true) return 'unknown'
  if (safe.error) return 'unknown'
  const read = safe.read !== null && typeof safe.read === 'object' ? safe.read : {}
  if (read.live === true) return 'complete'
  if (read.unreadable === true) return 'unknown'
  if (read.oversized === true) return 'unknown'
  if (Number.isFinite(read.bytes) && read.bytes === 0) return 'unknown'
  if (read.frameLimitHit === true) return 'partial'
  if (Number.isFinite(read.framesSkipped) && read.framesSkipped > 0) return 'partial'
  if (Number.isFinite(read.linesSkipped) && read.linesSkipped > 0) return 'partial'
  if (read.tornTail === true) return 'partial'
  return 'complete'
}

/**
 * 一次观察 + 用户预期 ⇒ 逐条对照的四态（`FR-TRIG-012`）。
 *
 * 三条硬规则，全部是**降级**方向，永远不会把证据不足说成结论：
 *
 * - `user-explicit`：显式 `/name` 调用**永远** `inconclusive`（它测的不是自动触发边界）；
 * - `not-observed`：只有「覆盖完整」**且**「用户声明为新会话」时才能升格成
 *   `not-observed-with-coverage`，否则 `inconclusive`；
 * - `unknown`：一律 `inconclusive`。
 */
export function triggerOutcomeOf(input = {}) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const expected = safe.expectedTrigger === true
  const observation = TRIGGER_OBSERVATION_IDS.includes(safe.observation) ? safe.observation : 'unknown'
  const invocationType = TRIGGER_INVOCATION_IDS.includes(safe.invocationType) ? safe.invocationType : 'unknown'
  const coverage = TRIGGER_COVERAGE_IDS.includes(safe.coverage) ? safe.coverage : 'unknown'
  const fresh = safe.freshSession === 'user-confirmed'

  if (observation === 'loaded') {
    if (invocationType === 'user-explicit') return 'inconclusive'
    if (invocationType !== 'model') return 'inconclusive'
    return expected ? 'observed-expected' : 'observed-unexpected'
  }
  if (observation === 'not-observed') {
    return coverage === 'complete' && fresh ? 'not-observed-with-coverage' : 'inconclusive'
  }
  return 'inconclusive'
}

/** 限制项：把这一条观察**够不着什么**收成封闭词表里的一段（`FR-TRIG-015`）。 */
export function triggerLimitationsOf(input = {}) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const ids = []
  const push = (id) => {
    if (TRIGGER_LIMITATION_LABELS[id] && !ids.includes(id) && ids.length < TRIGGER_LIMITATION_MAX_ITEMS) ids.push(id)
  }
  const observation = TRIGGER_OBSERVATION_IDS.includes(safe.observation) ? safe.observation : 'unknown'
  const coverage = TRIGGER_COVERAGE_IDS.includes(safe.coverage) ? safe.coverage : 'unknown'
  const invocationType = TRIGGER_INVOCATION_IDS.includes(safe.invocationType) ? safe.invocationType : 'unknown'

  push('load-is-protocol-fact')
  if (safe.live === true) push('observation-scoped-to-now')
  if (invocationType === 'user-explicit') push('explicit-call-not-natural-trigger')
  if (invocationType === 'unknown') push('invocation-ambiguous')
  if (observation === 'not-observed') push('no-load-record-is-not-no-trigger')
  if (coverage === 'partial') push('coverage-partial')
  if (coverage === 'unknown') push('coverage-unknown')
  if (safe.freshSession === 'user-confirmed') push('fresh-session-declared-by-user')
  if (collapse(safe.skillFingerprint) === '' || collapse(safe.skillFingerprint) === TRIGGER_UNAVAILABLE_TEXT) push('skill-fingerprint-unavailable')
  if (collapse(safe.descriptionFingerprint) === '' || collapse(safe.descriptionFingerprint) === TRIGGER_UNAVAILABLE_TEXT) push('description-fingerprint-unavailable')
  if (safe.identityMismatch === true) push('identity-mismatch')
  return ids
}

/**
 * 把宿主给的一堆事实归一成一条 Trigger Run（`FR-TRIG-007`）。
 *
 * **它不许出现在落盘记录里的东西**：`sessionId`、完整对话、工具参数与结果、绝对路径、分数。
 * 上面每一项都由 storage 层的禁字段深扫再挡一次 —— 这里不写，是为了让「不写」这件事
 * 在**两个地方**都成立。
 */
export function normalizeTriggerRun(input = {}) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const conditions = safe.conditions !== null && typeof safe.conditions === 'object' ? safe.conditions : {}
  const observation = TRIGGER_OBSERVATION_IDS.includes(safe.observation) ? safe.observation : 'unknown'
  const coverage = TRIGGER_COVERAGE_IDS.includes(safe.coverage) ? safe.coverage : 'unknown'
  const invocationType = TRIGGER_INVOCATION_IDS.includes(safe.invocationType) ? safe.invocationType : 'unknown'
  const freshSession = TRIGGER_FRESH_SESSION_IDS.includes(safe.freshSession) ? safe.freshSession : 'unconfirmed'

  const run = {
    schemaVersion: TRIGGER_RUN_SCHEMA_VERSION,
    runId: collapse(safe.runId) || null,
    caseId: collapse(safe.caseId) || null,
    observedAt: Number.isSafeInteger(safe.observedAt) ? safe.observedAt : null,
    conditions: {
      model: unavailableOf(conditions.model),
      provider: unavailableOf(conditions.provider),
      reasoningEffort: unavailableOf(conditions.reasoningEffort),
      contextWindow: Number.isSafeInteger(conditions.contextWindow) ? conditions.contextWindow : TRIGGER_UNAVAILABLE_TEXT,
      pluginVersion: unavailableOf(conditions.pluginVersion),
    },
    observation,
    invocationType,
    coverage,
    freshSession,
    skillFingerprint: fingerprintText(safe.skillFingerprint),
    descriptionFingerprint: fingerprintText(safe.descriptionFingerprint),
    // 证据引用是**本地可复核的稳定 id**，形状固定；它不含 sessionId、不含路径。
    evidenceRefs: Array.isArray(safe.evidenceRefs)
      ? safe.evidenceRefs.map((ref) => collapse(ref)).filter((ref) => ref.length > 0).slice(0, 8)
      : [],
    limitations: triggerLimitationsOf({ observation, coverage, invocationType, freshSession, live: safe.live === true, skillFingerprint: safe.skillFingerprint, descriptionFingerprint: safe.descriptionFingerprint, identityMismatch: safe.identityMismatch === true }),
  }
  run.outcome = triggerOutcomeOf({ expectedTrigger: safe.expectedTrigger === true, observation, invocationType, coverage, freshSession })
  return run
}

/**
 * 证据引用的哈希输入：把这次观察到的**匹配事实**摆成逐行文本，宿主算 sha256 得到
 * `trigger-evidence:sha256:<hex>`。它让「这条 Run 看的是哪几条事实」可以在一份本地收据上复核，
 * 而引用本身**不含会话标识**（`FR-TRIG-008`）。
 */
export function triggerEvidenceHashInput(facts = []) {
  const lines = Array.isArray(facts) ? facts : []
  return [
    `${TRIGGER_CASE_HASH_DOMAIN}:evidence@${TRIGGER_RUN_SCHEMA_VERSION}`,
    ...lines.map((fact) => [
      `skill:${collapse(fact?.skillName)}`,
      `type:${collapse(fact?.invocationType) || 'unknown'}`,
      `status:${collapse(fact?.status) || 'unknown'}`,
      `coverage:${collapse(fact?.coverage) || 'unknown'}`,
      `seq:${Number.isSafeInteger(fact?.resultSeq) ? fact.resultSeq : (Number.isSafeInteger(fact?.callSeq) ? fact.callSeq : 'na')}`,
    ].join('|')),
  ].join('\n')
}

/**
 * 两次 Run 能不能对照（`FR-TRIG-017`）。
 *
 * 与 V1.0 同一条纪律：**条件不同就不给对照**。`skillFingerprint` / `descriptionFingerprint`
 * **不在**条件表里 —— 它们是**被对照的东西**（改前 vs 改后注定不同）。
 */
export function compareTriggerRuns(input = {}) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const before = safe.before !== null && typeof safe.before === 'object' ? safe.before : null
  const after = safe.after !== null && typeof safe.after === 'object' ? safe.after : null
  if (!before || !after) return { comparable: false, reason: 'missing-run', differences: [] }
  if (before.caseId !== after.caseId) return { comparable: false, reason: 'different-case', differences: [] }

  const differences = []
  for (const field of TRIGGER_CONDITION_FIELDS) {
    const left = before.conditions?.[field.key]
    const right = after.conditions?.[field.key]
    if (left !== right) differences.push({ key: field.key, label: field.label, before: unavailableOf(left), after: unavailableOf(right) })
  }
  if (differences.length > 0) return { comparable: false, reason: 'conditions-differ', differences }

  const descriptionChanged = before.descriptionFingerprint !== after.descriptionFingerprint
  return {
    comparable: true,
    reason: null,
    differences: [],
    // 只报「指纹变了 / 没变」，不解释成「改好了」或「改坏了」。
    descriptionChanged,
    axis: descriptionChanged ? 'before-after' : 'baseline-with',
  }
}

/** 一次观察的界面短句。它只说事实，不做结论。 */
export function triggerObservationSentence(run = {}) {
  const safe = run !== null && typeof run === 'object' ? run : {}
  const label = TRIGGER_OBSERVATION_LABELS[safe.observation] ?? TRIGGER_OBSERVATION_LABELS.unknown
  const invocation = TRIGGER_INVOCATION_LABELS[safe.invocationType] ?? TRIGGER_INVOCATION_LABELS.unknown
  if (safe.observation === 'loaded') return `${label}（${invocation}）`
  if (safe.observation === 'not-observed') return `${label}：读到的这一段里没有它的加载记录`
  return `${label}：这一次读到的证据不足以判断它有没有被加载`
}
