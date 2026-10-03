// Skill 实例验收（V0.10.0）—— 把「这次修改」变成一个人可以真的拿去跑一遍的真实测试任务。
//
// 这个模块**不调模型**（用户 2026-10-03 选的 A：纯确定性生成）。同一份输入必须得到同一份
// 输出，否则「生成出来的 Prompt 真的是针对这次修改的」就成了一句需要信任的话，而不是一条
// 可以断言的事实。因此这里没有 `import`（零依赖）、不读时间、不掷骰子。
//
// 两条硬边界，守卫会逐条钉住（`SKILL_INSTANCE_TEST_OK`）：
//
// 1. `prompt.text`（复制给 Agent 的那段）里**不许**出现本次 diff 的元信息：范围标签、
//    变更小节标题、`diff`、「本次修改」这类元话语、以及这个 Skill 自己声明的步骤名。
//    把「你刚才改了什么」写进 Prompt，等于在 Prompt 里把 Skill 该怎么做重新教一遍，
//    那样测到的就是这段说明，而不是 Skill。
// 2. 验收关注点（`observations`）**只给用户看**，物理上不出现在 `prompt.text` 里。
//    塞进 Prompt 会污染这次测试：被测的 Agent 会照着关注点表演。
//
// 还有一条贯穿全模块的纪律：**这里不判定成功**。没有分数、没有通过率、没有「有效」。
// 「没有观察到证据，不代表没有执行；观察到行为，也不应该直接推导因果上的成功。」
// 所以本模块只产出：一个任务、若干条可以核对的现象、若干条回归约束，以及它自己缺什么。

export const SKILL_INSTANCE_TEST_SCHEMA_VERSION = 1

/**
 * 内部支持的三种测试意图。界面第一版**只生成一个综合 Prompt**（核心 + 边界 + 回归），
 * 所以这是一份内部清单，不是三个按钮。
 */
export const INSTANCE_TEST_INTENTS = ['core', 'boundary', 'regression']

/**
 * 生成用到的六个来源（规格 §18.1 的逐项）。它们的**名字**进 `trace.sources`，让界面能回答
 * 「这个任务是怎么来的」；它们的**内容**里只有 description / definition / framework 会进 Prompt ——
 * 用户修改意图与 diff 元信息一个字都不进（写进去等于在 Prompt 里把 Skill 该怎么做重新教一遍）。
 */
export const INSTANCE_TEST_SOURCES = ['intent', 'scopeIds', 'comparison', 'description', 'framework', 'validation']

/**
 * 生成不出来的四种原因。**码不直接显示**：界面负责把它们翻成人话（和范围码同一个写法）。
 */
export const INSTANCE_TEST_UNAVAILABLE_REASONS = [
  'no-comparison',
  'comparison-unavailable',
  'no-changed-scope',
  'no-definition',
]

/**
 * 六个修改范围各自的观察重点。
 *
 * 键必须和 `src/core/skill-modification.mjs` 的 `MODIFICATION_SCOPE_IDS` **逐字一致**
 * （守卫对着它断言）。这里之所以再写一份而不是 import 过来：本模块要能作为客户端第 8 支
 * `require` 被内联进浏览器包，零依赖是它的入场券；而「两份清单会不会分家」由守卫回答，
 * 不靠运行时耦合。
 */
export const INSTANCE_TEST_SCOPE_FOCUS = {
  'skill-md-rules': { label: 'Rules', observation: '它声明的约束在产出里是否被遵守？' },
  'skill-md-workflow': { label: 'Workflow', observation: '产出的形成顺序与步骤要求是否体现？' },
  'skill-md-description': { label: 'Description', observation: '这次任务的描述是否落在它声明的适用场景里？' },
  references: { label: 'references', observation: '它自己的资料是否在任务中被实际用到？' },
  scripts: { label: 'scripts', observation: '它涉及的脚本能力是否被触发并体现在产出里？' },
  assets: { label: 'assets', observation: '它涉及的资源是否真的被用上，而不是只出现在产出旁边？' },
}

/** 六个范围 id 的规范顺序（由 `INSTANCE_TEST_SCOPE_FOCUS` 的键序决定，测试会钉住）。 */
export const INSTANCE_TEST_SCOPE_IDS = Object.keys(INSTANCE_TEST_SCOPE_FOCUS)

/**
 * 挑「主范围」的优先级：越靠前越决定这个任务长什么样。
 *
 * 流程与规则排在最前，因为它们是「任务本身要不要变形」的两件事；资源三类排在后面 ——
 * 它们只改文件，任务形状通常不变，变的只是完成它需要用到什么。
 */
export const INSTANCE_TEST_PRIMARY_SCOPE_ORDER = [
  'skill-md-workflow',
  'skill-md-rules',
  'skill-md-description',
  'references',
  'assets',
  'scripts',
]

/**
 * 范围 → 框架角色（角色名取自 `src/core/skill-framework.mjs` 的 `FRAMEWORK_ROLES`）。
 *
 * 它回答的是「这次改动碰过哪些**能力**」：回归约束不许来自被碰过的能力（规格 §17.3 / §20.4），
 * 而框架里的能力是按角色归类的，所以按角色排除比按标题字符串对不上就放过要严得多。
 */
export const INSTANCE_TEST_SCOPE_ROLES = {
  'skill-md-rules': 'rules',
  'skill-md-workflow': 'workflow',
  'skill-md-description': 'trigger',
  references: 'resources',
  scripts: 'resources',
  assets: 'resources',
}

/**
 * 用户意图里出现这些词，说明这次改动的重点落在哪个范围。
 *
 * 只认**第一个**命中的范围，而且只在该范围确实被改动过时才影响主范围 —— 意图是用来把任务形状
 * 对齐到用户说的话上的，不是用来猜改了什么；意图原文一个字都不进 Prompt。
 */
const INTENT_SCOPE_HINTS = [
  { scope: 'skill-md-workflow', words: ['工作流', '流程', '步骤', '顺序'] },
  { scope: 'skill-md-rules', words: ['规则', '约束', '规范', '边界'] },
  { scope: 'skill-md-description', words: ['描述', '触发', '什么时候用', '适用场景'] },
  { scope: 'references', words: ['references', '参考资料', '资料', '参考文档'] },
  { scope: 'scripts', words: ['脚本', 'scripts'] },
  { scope: 'assets', words: ['资源', '素材', 'assets', '模板文件'] },
]

/** 复制给 Agent 的那段 Prompt 里**永远**是这四块，顺序固定（规格 §八 的逐字结构）。 */
export const INSTANCE_TEST_PROMPT_BLOCKS = ['任务', '工作目标', '输出要求', '注意']

/**
 * `prompt.text` 里不许出现的词。分三类，理由各不相同：
 *
 * - 元话语（「本次修改」「修改范围」…）：说了它，Prompt 就从「一个任务」变成「一次考试」；
 * - 工具词（`diff`、`scope`…）：那是插件内部的词，用户和 Agent 都不该看见；
 * - 判断词（成功 / 有效 / 分数…）：这个模块不判定成功，所以这些词在这里没有位置。
 */
export const INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS = [
  '本次修改', '这次修改', '你刚才修改', '刚才的修改', '修改范围', '修改内容', '修改前', '修改后',
  '验收关注点', '观察点', '观察项', '测试用例',
  'diff', 'Diff', 'DIFF', 'scope', 'Scope', 'SCOPE', 'snapshot',
  '成功', '失败', '有效', '无效', '质量', '评分', '得分', '通过率', '优秀', '合格', '不合格',
]

/** 界面与结果里都不许出现的相对时间说法（同一份载荷换个时刻会读出不同的话）。 */
const RELATIVE_TIME_WORDS = ['今天', '昨天', '明天', '刚刚', '几分钟前', '最近']

const MAX_CLAUSE = 48
const MAX_CAPABILITIES = 3
const MAX_OBSERVATIONS = 6

/** 把多行文本压成一行：任务描述里不需要换行，多行会让 Prompt 结构看起来像另一份文档。 */
function collapse(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 从 Skill 自己的文字里摘出来的句子，一旦撞上禁用词就整句丢掉，退回中性说法。
 *
 * 那份词表管的是**这段 Prompt 里不许出现的东西**，而 Skill 正文是别人写的：我们无法保证
 * 它不会用「成功 / 评分」这类词。与其把它们原样贴进 Prompt（守卫会红，而放宽守卫就等于
 * 放弃这条边界），不如在摘取这一步就退回一句中性的说法。
 */
function usableSourceText(text) {
  const value = collapse(text)
  if (!value) return ''
  return INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS.some((word) => value.includes(word)) ? '' : value
}

/**
 * 按**词边界**截断，超出就补省略号。
 *
 * Skill 正文大多是英文：直接 `slice(0, MAX_CLAUSE)` 会把句子切在半个单词上，界面上读起来
 * 像一行坏掉的字（实测出现过 `…to avo.`）。所以窗口里先找最后一个空格；连最后那个过短的
 * 尾词（`to` / `of` / `a`）一起丢掉。中文没有词间空格，找不到空格时才退回按字符截。
 */
function clip(text, max = MAX_CLAUSE) {
  const value = collapse(text)
  if (value.length <= max) return value
  const window = value.slice(0, max)
  const space = window.lastIndexOf(' ')
  let head = space > 0 ? window.slice(0, space) : window
  head = head.replace(/\s+[A-Za-z]{1,3}$/, '')
  return `${head.replace(/[\s,;:.。，；：、]+$/, '')}…`
}

/** 去掉代码围栏里的内容：围栏里是示例，示例里的 `#` 不是小节标题。 */function outsideFences(lines) {
  const kept = []
  let fenced = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }
    if (!fenced) kept.push(line)
  }
  return kept
}

/** frontmatter 里的一个字段（原始字符串，不解析 YAML —— 这里只要一个短语）。 */
function frontmatterField(text, key) {
  const source = String(text ?? '')
  if (!source.startsWith('---')) return null
  const end = source.indexOf('\n---', 3)
  if (end === -1) return null
  const block = source.slice(3, end)
  const match = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm').exec(block)
  if (!match) return null
  return match[1].trim().replace(/^["']|["']$/g, '')
}

/** 正文里的二级/三级标题（跳过围栏）。 */
function headings(text) {
  const lines = outsideFences(String(text ?? '').split('\n'))
  const found = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(lines[index])
    if (match) found.push({ index, level: match[1].length, title: collapse(match[2]) })
  }
  return found
}

/** 某个标题到下一个同级（或更高级）标题之间的正文。 */
function sectionBody(text, heading) {
  const lines = outsideFences(String(text ?? '').split('\n'))
  const body = []
  for (let index = heading.index + 1; index < lines.length; index += 1) {
    const match = /^(#{1,3})\s+/.exec(lines[index])
    if (match && match[1].length <= heading.level) break
    body.push(lines[index])
  }
  return body.join('\n')
}

/**
 * 从描述里取出「这件事是什么」。
 *
 * Skill 的 `description` 大多写成「当用户……时使用。……」，触发条件是给**模型**看的路由信息，
 * 不是一件可以交付的工作。所以先剥掉触发前缀，再截到第一个句读 —— 任务里要的是那件事本身。
 */
function subjectOf(description, definitionText) {
  const raw = collapse(description) || collapse(frontmatterField(definitionText, 'description'))
  if (!raw) return ''
  let text = raw
    .replace(/^(当用户|当用户需要|适用于|用于|use when|use this|use it when)\s*[:：]?\s*/i, '')
    .replace(/^(需要|要)\s*/, '')
  const cut = text.search(/[。；;！!?？]/)
  if (cut > 0) text = text.slice(0, cut)
  const comma = text.indexOf('，')
  if (comma > 0 && comma <= MAX_CLAUSE) text = text.slice(0, comma)
  return usableSourceText(clip(text))
}

/**
 * 这个 Skill 打算交付出什么。取自它自己声明的输出小节，取不到就退回一个中性说法 ——
 * 但**不编**具体文件名：编出来的交付物会把任务指向一个 Skill 从没承诺过的东西。
 */
function deliverableOf(definitionText) {
  const headingsFound = headings(definitionText)
  const target = headingsFound.find((heading) => /输出|交付|产出|output|deliverable/i.test(heading.title))
  if (target) {
    const body = sectionBody(definitionText, target)
    const first = body.split('\n').map((line) => collapse(line.replace(/^\s*[-*\d.]+\s*/, '')))
      .find((line) => line.length >= 4 && line.length <= MAX_CLAUSE * 2)
    const usable = usableSourceText(first)
    if (usable) return usable
  }
  const lines = outsideFences(String(definitionText ?? '').split('\n'))
  const inline = lines
    .map((line) => collapse(line.replace(/^\s*[-*\d.]+\s*/, '')))
    .find((line) => /输出|交付物|输出格式/.test(line) && line.length >= 4 && line.length <= MAX_CLAUSE * 2)
  const usableInline = usableSourceText(inline)
  if (usableInline) return usableInline
  return '这个能力自己规定的那份交付物'
}

/**
 * 主范围决定任务的形状。六句话各不相同，而且都不说「你刚才改了什么」：
 * 它们以「这件事该怎么完成」的口吻出现，由 Skill 自己决定怎么执行。
 */
function coreLines(primaryScopeId, subject, deliverable) {
  const task = subject
    ? `请完成下面这件真实工作，要真的做出来，不要只讲怎么做：${subject}。`
    : '请完成一件这个能力真正要解决的问题，要真的做出来，不要只讲怎么做。'
  const output = `交付${deliverable}。`
  switch (primaryScopeId) {
    case 'skill-md-workflow':
      return { task, goal: '按这个能力自己规定的方式，把它要求的各个环节都走完，形成最终交付物。', output }
    case 'skill-md-rules':
      return { task, goal: '在满足这个能力自己声明的全部约束的前提下完成它。', output }
    case 'skill-md-description':
      return {
        task: subject
          ? `我需要${subject}。请真的做出来给我，不要只讲怎么做。`
          : '我需要一件这个能力适用的事情被做完，请真的做出来，不要只讲怎么做。',
        goal: '请判断当前环境里的哪个能力适合这件事，并用它完成。',
        output,
      }
    case 'references':
      return { task, goal: '这件事需要领域细节，请按这个能力自己的资料组织方式来完成，不要凭常识补齐。', output }
    case 'assets':
      return { task, goal: '产出需要包含这件事要求的资源文件。', output }
    case 'scripts':
      return { task, goal: '如果当前环境里有能替你干这件事的工具或脚本，就用它们完成。', output }
    default:
      return { task, goal: '按这个能力自己的方式完成它。', output }
  }
}

/** 规格 §八 的固定句式，逐字。它只讲「怎么交活」，不讲这个 Skill 该怎么做。 */
const PROMPT_NOTE = '请直接完成任务，不需要解释你为什么选择某个 Skill。请按照当前环境中的 Skill 能力完成任务。'

function promptTextOf(core) {
  return [
    '你需要完成下面这个真实任务。',
    '',
    '【任务】',
    core.task,
    '',
    '【工作目标】',
    core.goal,
    '',
    '【输出要求】',
    core.output,
    '',
    '【注意】',
    PROMPT_NOTE,
  ].join('\n')
}

/** 把一小段能力声明压成一句可以核对的话；撞上禁用词就退回空串。过长时按词边界截断。 */
function capabilityLine(text) {
  const value = usableSourceText(text)
  if (!value) return ''
  return clip(value)
}

/**
 * 回归约束**只能**来自没有被这次修改触及的声明能力（规格 §17.3 / §20.4）。
 *
 * 优先读框架结构（`framework.sections[]`，由宿主那支 `buildSkillFramework()` 解析好传进来）：
 * 它把「这个 Skill 声明了哪几块能力」写成了带角色的清单，于是可以按**角色**排除这次改动碰过的
 * 那几块，而不是只靠标题字符串对不上就放过。没有框架时退回正文的二级小节。
 *
 * 一条都找不出来时如实说找不到 —— 绝不退回「确保原有能力不受影响」这种听起来完整、
 * 实际上什么都没说的句子。
 */
function regressionOf({ definitionText, framework, changedTitles, changedScopeIds }) {
  const touched = new Set(changedTitles.map((title) => collapse(title)))
  const touchedRoles = new Set(
    (Array.isArray(changedScopeIds) ? changedScopeIds : [])
      .map((id) => INSTANCE_TEST_SCOPE_ROLES[id])
      .filter(Boolean),
  )
  const constraints = []
  const sections = Array.isArray(framework?.sections) ? framework.sections : []
  for (const section of sections) {
    if (constraints.length >= MAX_CAPABILITIES) break
    const title = collapse(section?.title)
    const role = typeof section?.role === 'string' ? section.role : null
    if (!title || !role || touched.has(title) || touchedRoles.has(role)) continue
    const capability = capabilityLine(section?.opening)
    constraints.push(capability
      ? `这次改动不应影响原有「${title}」的要求：${capability}`
      : `这次改动不应影响原有「${title}」的要求。`)
  }
  if (constraints.length === 0) {
    for (const heading of headings(definitionText)) {
      if (constraints.length >= MAX_CAPABILITIES) break
      if (heading.level !== 2) continue
      if (touched.has(heading.title)) continue
      const body = sectionBody(definitionText, heading)
      const line = body.split('\n')
        .map((entry) => collapse(entry.replace(/^\s*[-*\d.]+\s*/, '')))
        .find((entry) => /输出|格式|必须|不得|约束|产出|保留|要求/.test(entry) && entry.length >= 4 && entry.length <= MAX_CLAUSE * 2)
      if (!line) continue
      constraints.push(`这次改动不应影响原有「${heading.title}」的要求。`)
    }
  }
  if (constraints.length > 0) {
    return {
      available: true,
      constraints,
      unavailable: [],
      source: sections.some((section) => collapse(section?.title) && typeof section?.role === 'string') ? 'framework' : 'definition',
    }
  }
  return {
    available: false,
    constraints: [],
    unavailable: ['拿不到没有被这次改动触及的声明能力，因此这里不写回归约束。'],
    source: null,
  }
}

/** 静态验收里有几个「判不了」的结论。没有结论对象时返回 0（缺结论由调用处自己说）。 */
function validationUnknownCount(validation) {
  if (!validation) return 0
  const profiles = Array.isArray(validation.profiles) ? validation.profiles : []
  const unknownProfiles = profiles.filter((profile) => profile?.status === 'unknown').length
  return Math.max(unknownProfiles, validation.status === 'unknown' ? 1 : 0)
}

/**
 * 生成一次实例验收。
 *
 * 输入（六个来源，全部由调用方给；本模块不读盘、不请求、不调模型 —— 规格 §18.1 的逐项）：
 * - `intent`：用户这次说的修改意图（**只用来对齐任务形状与记录来源，一个字都不进 Prompt**）；
 * - `scopeIds`：这次点名要改的范围（`comparison.scopes` 已经带着它，这里是第二条来源）；
 * - `comparison`：`diffSkillModification()` 的结果（范围、增删小节、资源增删改）；
 * - `description`：当前 description（触发场景）；
 * - `framework`：宿主那支 `buildSkillFramework()` 的结果（声明能力清单，回归约束靠它排除碰过的块）；
 * - `definitionText` / `validation`：当前 SKILL.md 正文与静态验收结论（前者取「这件事」「交付物」，
 *   后者只用来如实报告有没有判不了的结论 —— 本模块不据此推断行为）。
 */
export function buildSkillInstanceTest(input) {
  const safe = input !== null && typeof input === 'object' ? input : {}
  const skillName = typeof safe.skillName === 'string' ? safe.skillName.trim() : ''
  const intent = typeof safe.intent === 'string' ? collapse(safe.intent) : ''
  const comparison = safe.comparison !== null && typeof safe.comparison === 'object' ? safe.comparison : null
  const definitionText = typeof safe.definitionText === 'string' ? safe.definitionText : ''
  const description = typeof safe.description === 'string' ? safe.description : ''
  const framework = safe.framework !== null && typeof safe.framework === 'object' ? safe.framework : null
  const validation = safe.validation !== null && typeof safe.validation === 'object' ? safe.validation : null
  const declaredScopeIds = Array.isArray(safe.scopeIds) ? safe.scopeIds.filter((id) => typeof id === 'string') : []

  const base = {
    schemaVersion: SKILL_INSTANCE_TEST_SCHEMA_VERSION,
    skillName,
    intent: 'core+boundary+regression',
    scopeIds: [],
    changedScopeIds: [],
    prompt: null,
    observations: [],
    regression: { available: false, constraints: [], unavailable: [] },
    unavailable: [],
    limitations: [],
    notes: [],
    trace: null,
  }

  if (!comparison) {
    return { ...base, available: false, reason: 'no-comparison', message: '还没有可用的本次修改对比，因此没有可生成的任务。' }
  }
  if (comparison.available === false) {
    return {
      ...base,
      available: false,
      reason: 'comparison-unavailable',
      message: comparison.message || '本次修改前状态不可用，因此没有可生成的任务。',
    }
  }

  const scopes = Array.isArray(comparison.scopes) ? comparison.scopes : []
  const scopeIds = scopes.length
    ? scopes.map((scope) => scope?.id).filter((id) => typeof id === 'string')
    : declaredScopeIds
  const changedScopeIds = scopes
    .filter((scope) => scope?.changed === true && INSTANCE_TEST_SCOPE_FOCUS[scope.id])
    .map((scope) => scope.id)
  const ordered = INSTANCE_TEST_PRIMARY_SCOPE_ORDER.filter((id) => changedScopeIds.includes(id))
  // 意图里点名了某个**确实被改动过**的范围时，它就当主范围：任务形状跟着用户说的话走，而不是
  // 跟着我们固定的一张优先级表走。意图本身不进 Prompt —— 它说的就是「改了什么」。
  const hint = INTENT_SCOPE_HINTS.find((entry) => (
    changedScopeIds.includes(entry.scope) && entry.words.some((word) => intent.includes(word))
  ))
  const trace = {
    sources: INSTANCE_TEST_SOURCES.filter((name) => {
      if (name === 'intent') return intent.length > 0
      if (name === 'scopeIds') return declaredScopeIds.length > 0 || scopeIds.length > 0
      if (name === 'comparison') return true
      if (name === 'description') return description.length > 0
      if (name === 'framework') return framework !== null
      return validation !== null
    }),
    frameworkAvailable: framework !== null,
    validationStatus: typeof validation?.status === 'string' ? validation.status : null,
    validationUnknownCount: validationUnknownCount(validation),
    hintedScopeId: hint ? hint.scope : null,
  }
  const withScopes = { ...base, scopeIds, changedScopeIds, trace }

  if (ordered.length === 0) {
    return {
      ...withScopes,
      available: false,
      reason: 'no-changed-scope',
      message: '这次改动没有落在可以生成实例验收的范围里，因此没有可生成的任务。',
    }
  }
  if (!definitionText && !description) {
    return {
      ...withScopes,
      available: false,
      reason: 'no-definition',
      message: '读不到这个 Skill 的正文与描述，因此没有可生成的任务。',
    }
  }

  const primaryScopeId = hint ? hint.scope : ordered[0]
  const subject = subjectOf(description, definitionText)
  const deliverable = deliverableOf(definitionText)
  const core = coreLines(primaryScopeId, subject, deliverable)
  const text = promptTextOf(core)

  // 观察项的顺序是固定的：先两条通用现象，再按范围顺序给各自的观察重点。
  const observations = [
    { id: 'used', text: '它是否实际使用了相关 Skill？' },
    { id: 'flow', text: 'Skill 中的关键流程是否被执行？' },
    ...ordered.map((id) => ({ id, text: INSTANCE_TEST_SCOPE_FOCUS[id].observation })),
    { id: 'modified-behaviour', text: '本次修改涉及的行为是否体现？' },
    { id: 'kept', text: '原有核心能力是否保持？' },
  ].slice(0, MAX_OBSERVATIONS)

  const changedTitles = [
    ...(Array.isArray(comparison.sections?.added) ? comparison.sections.added : []),
    ...(Array.isArray(comparison.sections?.removed) ? comparison.sections.removed : []),
    ...scopes.filter((scope) => scope?.changed === true).map((scope) => INSTANCE_TEST_SCOPE_FOCUS[scope.id]?.label ?? ''),
  ].filter((title) => typeof title === 'string' && title.length > 0)

  const limitations = [
    '这个任务按这次改动的范围与当前 SKILL.md 生成，生成过程不调用模型：同一份输入总是得到同一份任务。',
    '验收由你在一个新的 DSH 会话里完成：这个插件不运行它、不读结果、不判定是否达到预期。',
  ]
  if (changedScopeIds.some((id) => ['references', 'scripts', 'assets'].includes(id))) {
    limitations.push('资源类范围只看得到文件的增删改，看不到文件内容，因此任务按范围而不是按文件内容来写。')
  }
  if (comparison.summary?.scopesUnknown > 0 || comparison.summary?.addedLines === undefined) {
    limitations.push('这次对比里有读不出来的部分，任务的针对性因此只覆盖能确认的那些范围。')
  }
  if (framework === null) {
    limitations.push('这次没有拿到这个 Skill 的框架结构，回归约束只从正文小节里找，可能比框架里声明的少。')
  }
  if (validation === null) {
    limitations.push('这次生成没有静态验收结论可用，实例验收不据此推断实际行为。')
  } else if (trace.validationUnknownCount > 0) {
    limitations.push('静态验收里有判不了的结论，实例验收不据此推断实际行为。')
  }

  const notes = []
  if (Array.isArray(comparison.limitations) && comparison.limitations.length > 0) {
    notes.push('这次对比本身带上来的限制，同样适用于这次验收。')
  }
  if (!subject) notes.push('描述里没有可以直接当任务主语的句子，任务按中性说法生成。')

  return {
    ...withScopes,
    available: true,
    reason: null,
    message: null,
    primaryScopeId,
    prompt: { ...core, text },
    promptText: text,
    observations,
    regression: regressionOf({ definitionText, framework, changedTitles, changedScopeIds }),
    unavailable: [],
    limitations,
    notes,
  }
}

/**
 * 规格 §15 里建议的名字。导出成同一个函数：契约上的名字与实现里的名字都可用，
 * 免得调用方为了对齐一份「建议契约」被迫改名。
 */
export const buildInstanceTest = buildSkillInstanceTest

/** 界面上那句「这块是干什么的」。它说的是这件事，不是一句待办。 */
export const INSTANCE_TEST_HEADLINE = '针对你刚才修改的 Skill，这个任务可以直接验证修改是否生效。'

/** 观察项那一段的抬头与诚实边界。 */
export const INSTANCE_TEST_OBSERVATION_TITLE = '预期观察点'
export const INSTANCE_TEST_OBSERVATION_NOTE = '注意：观察不到痕迹不等于没有被执行；下面只列可以核对的现象。'

/** 卡面抬头（规格 §19 的推荐信息结构）：先说要验什么，再说这段 Prompt 是什么。 */
export const INSTANCE_TEST_GOAL_TITLE = '验证目标'
export const INSTANCE_TEST_GOAL_TEXT = '验证本次修改是否改变了这个 Skill 的实际行为。'
export const INSTANCE_TEST_PROMPT_TITLE = '测试 Prompt'

/** 生成不出来时，四种原因码各自的人话。 */
export const INSTANCE_TEST_UNAVAILABLE_MESSAGES = {
  'no-comparison': '还没有可用的本次修改对比，因此没有可生成的任务。',
  'comparison-unavailable': '本次修改前状态不可用，因此没有可生成的任务。',
  'no-changed-scope': '这次改动没有落在可以生成实例验收的范围里，因此没有可生成的任务。',
  'no-definition': '读不到这个 Skill 的正文与描述，因此没有可生成的任务。',
}

/** 说明这个 Prompt 是怎么来的：不确定性要摆在明面上，而不是藏在一次生成里。 */
export const INSTANCE_TEST_LIMITATION_NOTE = '这个任务是怎么来的'

/** 相对时间词表：守卫用它断言界面与结果里都没有「今天 / 刚刚」这类说法。 */
export const INSTANCE_TEST_RELATIVE_TIME_WORDS = RELATIVE_TIME_WORDS
