/**
 * V0.9.1 Skill Modify —— 纯数据层：**修改范围、修改协议、送给 Agent 的那条消息、以及修改前后对比**。
 *
 * 这个模块里没有 IO、没有模型调用、没有时钟、没有随机数。它只做四件事：
 *
 * 1. 把「用户勾了哪些范围」变成一个稳定的词表（`MODIFICATION_SCOPE_OPTIONS`），
 *    未勾=不改、勾了但不开放的=记进 `locked` 而**不授予**；
 * 2. 把 Modification Contract 的十二条写成可逐字断言的常量，并按本次范围拼出正文；
 * 3. 把「用户原话 + 结构化范围 + 协议」拼成**交给当前会话的那一条消息**的正文；
 * 4. 拿「修改前 / 修改后」两份**纯数据**算出 Modification Diff（行级、小节级、资源级、
 *    范围对账、来源指纹），并如实说明哪一部分判不了。
 *
 * 它**拒绝**做这些事：
 *
 * - 不判断改得好不好，不评分、不排名、不给建议（那属于 Agent Review，不属于这里）；
 * - 不解析 Agent 的方案，也不要求 Agent 回一份结构化 Proposal —— 只做**事后对账**；
 * - 不建立版本实体：这里只有前后两个 sha256，没有版本号、没有历史、没有时间线；
 * - 不写盘、不改文件：写入永远由 Agent 用 DSH 原生文件工具完成；
 * - 不把「读不到快照」说成「没有变化」：读不到就是 `unavailable`，并且要有一句实话。
 *
 * 文件路径示例一律写成 `<name>` 这类占位符 —— 注释里的字面量不许出现会提前闭合注释的写法。
 */

import { buildDefinitionOutline } from './definition-outline.mjs'

export const SKILL_MODIFICATION_SCHEMA_VERSION = 1

/**
 * 这条消息的 `source.kind`。DSH 的消息来源是可扩展的联合类型：每个生产者在自己模块里声明
 * 自己的 `kind`，消费者遇到不认识的 `kind` 会走兜底渲染。用这个值，运行记录里就能看出这条
 * 消息来自 Skill 洞察的「修改 Skill」，而不是用户手打的。
 */
export const MODIFICATION_SOURCE_KIND = 'skill-intelligence-modify'
export const MODIFICATION_MESSAGE_SOURCE = Object.freeze({ kind: MODIFICATION_SOURCE_KIND })

/** 意图文本的长度上限：太长会把这条消息淹没，太短则说不清要改什么。 */
export const MODIFICATION_INTENT_LIMIT = 2000

/**
 * 修改范围的最小单位。`target` 决定它落在哪个目录/文件上，`section` 只对 `SKILL.md` 有意义。
 * `locked: true` 的项在界面上可以显示，但**不许被授予** —— 本版不开放把脚本与静态资源
 * 列入修改范围（默认值；要放开只需改这一处并在守卫里同步，不要在代码里到处写死）。
 */
export const MODIFICATION_SCOPE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'skill-md-rules', target: 'skill-md', section: 'rules', locked: false, labelZh: 'SKILL.md / Rules', labelEn: 'SKILL.md / Rules' }),
  Object.freeze({ id: 'skill-md-workflow', target: 'skill-md', section: 'workflow', locked: false, labelZh: 'SKILL.md / Workflow', labelEn: 'SKILL.md / Workflow' }),
  Object.freeze({ id: 'skill-md-description', target: 'skill-md', section: 'description', locked: false, labelZh: 'SKILL.md / Description', labelEn: 'SKILL.md / Description' }),
  Object.freeze({ id: 'references', target: 'references', section: null, locked: false, labelZh: 'references', labelEn: 'references' }),
  Object.freeze({ id: 'scripts', target: 'scripts', section: null, locked: true, labelZh: 'scripts', labelEn: 'scripts' }),
  Object.freeze({ id: 'assets', target: 'assets', section: null, locked: true, labelZh: 'assets', labelEn: 'assets' }),
])

export const MODIFICATION_SCOPE_IDS = Object.freeze(MODIFICATION_SCOPE_OPTIONS.map((option) => option.id))
export const MODIFICATION_TARGET_IDS = Object.freeze(['skill-md', 'references', 'scripts', 'assets'])
export const MODIFICATION_LOCKED_SCOPE_IDS = Object.freeze(
  MODIFICATION_SCOPE_OPTIONS.filter((option) => option.locked).map((option) => option.id),
)

/** 范围选项的 id → 选项。未知 id 返回 `null`，调用方不许静默当合法。 */
export function modificationScopeById(id) {
  return MODIFICATION_SCOPE_OPTIONS.find((option) => option.id === id) ?? null
}

/** 范围选项的标签。`language === 'en'` 取英文，其余一律中文。 */
export function modificationScopeLabel(id, language = 'zh') {
  const option = modificationScopeById(id)
  if (!option) return typeof id === 'string' ? id : ''
  return language === 'en' ? option.labelEn : option.labelZh
}

/**
 * 解析用户勾选的范围。语义与 `resolveSkillProfiles` 一致：
 *
 * - 不认识的值进 `unknown`，不静默当合法；
 * - 勾了但不开放的（`locked`）进 `locked`，**不授予**（想改脚本请先改这份词表，而不是让这里松口）；
 * - 返回顺序永远按 `MODIFICATION_SCOPE_OPTIONS` 走，不跟传参顺序走；
 * - 空集合与「没传」是同一件事：**没有范围 = 只讨论、不改文件**（`empty: true`）。
 */
export function resolveModificationScopes(selection) {
  const asked = Array.isArray(selection) ? selection : []
  const granted = new Set()
  const unknown = []
  const locked = []
  for (const raw of asked) {
    const id = typeof raw === 'string' ? raw.trim() : raw
    if (typeof id !== 'string' || id.length === 0) continue
    const option = modificationScopeById(id)
    if (!option) {
      if (!unknown.includes(id)) unknown.push(id)
      continue
    }
    if (option.locked) {
      if (!locked.includes(id)) locked.push(id)
      continue
    }
    granted.add(id)
  }
  const scopeIds = MODIFICATION_SCOPE_IDS.filter((id) => granted.has(id))
  return {
    scopeIds,
    options: scopeIds.map((id) => modificationScopeById(id)),
    unknown,
    locked,
    empty: scopeIds.length === 0,
  }
}

/** 把一组范围拼成一句中文（给消息正文与界面共用）。空集合有专门的说法。 */
export function modificationScopeText(scopeIds) {
  const { scopeIds: ids, empty } = resolveModificationScopes(scopeIds)
  if (empty) return '（没有指定范围：只讨论，不要改动任何文件）'
  return ids.map((id) => modificationScopeLabel(id, 'zh')).join('、')
}

/**
 * Modification Contract：十二条，逐字。
 *
 * 它约束的是**当前这个 DSH Agent 在这次任务里的行为**，不是对 Skill 质量的判断，
 * 也不是插件能强制执行的沙箱 —— 其中第 9~12 条是软约束，插件只能记录，不能阻止。
 */
export const MODIFICATION_CONTRACT_RULES = Object.freeze([
  '修改前必须读取当前文件。',
  '只能修改本次列出的修改范围。',
  '不得修改 source Skill。',
  '不得修改其它无关项目文件。',
  '必须保留 Skill 名称，除非用户明确要求修改名称。',
  '修改后必须 read-back。',
  '修改后必须运行 Skill 验收。',
  '验收失败不得声称修改完成。',
  '不得自动运行 scripts/，除非用户明确要求并且当前 DSH 权限允许。',
  '不得自动提交 Git。',
  '不得自动发布 Skill。',
  '不得自动改会话标题。',
])

/** 拼出注入消息里的协议正文（编号 + 本次范围那句）。 */
export function buildModificationContractText({ scopeIds, profileIds } = {}) {
  const { scopeIds: ids, empty } = resolveModificationScopes(scopeIds)
  const scopeLine = empty
    ? '本次没有指定修改范围：只讨论，不要改动任何文件。'
    : `本次修改范围：${ids.map((id) => modificationScopeLabel(id, 'zh')).join('、')}。`
  const profileLine = Array.isArray(profileIds) && profileIds.length > 0
    ? `验收目标：${profileIds.map((id) => String(id)).join('、')}。`
    : '验收目标：按 DSH + Common Core。'
  const numbered = MODIFICATION_CONTRACT_RULES.map((rule, index) => `${index + 1}. ${rule}`)
  return [scopeLine, profileLine, ...numbered].join('\n')
}

/**
 * 交给当前会话的那一条消息的正文。
 *
 * 三个部分缺一不可：**用户的原话**（不许改写、不许总结）、**结构化的范围**（这是本次唯一
 * 结构化的东西）、**协议**（约束 Agent 这一次怎么做）。插件不在这里提任何方案 —— 方案是
 * Agent 在原生对话里说出来的东西。
 *
 * 前后各还有一句流程说明，它们回答的是「什么时候轮到我」：**动手之前**先把打算怎么改说清楚，
 * 有拿不准的地方就问用户 —— `FR-MOD-003` 的「提出方案 → 用户确认 → 动手」正是这一段，它
 * 必须留在原生对话里，所以插件只提这个要求，不代办、也不解析；**做完之后**回读一次，并且
 * 不要抢在验收结论之前说改好了。
 */
export function buildModificationMessageText({ skillName, intent, scopeIds, profileIds } = {}) {
  const name = typeof skillName === 'string' && skillName.length > 0 ? skillName : '（未指定）'
  const text = typeof intent === 'string' ? intent.trim() : ''
  const body = text.length > MODIFICATION_INTENT_LIMIT ? `${text.slice(0, MODIFICATION_INTENT_LIMIT)}…` : text
  const scope = modificationScopeText(scopeIds)
  const profiles = Array.isArray(profileIds) && profileIds.length > 0 ? profileIds.join('、') : 'DSH + Common Core'
  return [
    '【Skill 修改任务 · 由 DSH Skill 洞察发起】',
    '',
    `目标 Skill：${name}`,
    `修改范围：${scope}`,
    `验收目标：${profiles}`,
    '',
    '我的修改意图（原话）：',
    body.length > 0 ? body : '（这次没有写意图，请先问我一句想怎么改。）',
    '',
    '修改协议（Modification Contract）：',
    buildModificationContractText({ scopeIds, profileIds }),
    '',
    '动手之前：先说明你打算怎么改（哪些文件、哪些小节、为什么）。有拿不准的地方就用提问工具问用户，不要在猜的基础上改文件。',
    '',
    '做完之后：请把改动回读一次，说明改了哪些文件、哪些小节。验收由 Skill 洞察执行 ——',
    '在它给出验收结论之前，不要说改好了。',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Modification Diff
// ---------------------------------------------------------------------------

/** 对比结论只有三种，与 v0.8 的差异面板同一套词：不变 / 变了 / 没法比。 */
export const MODIFICATION_DIFF_STATUSES = Object.freeze(['unchanged', 'changed', 'unavailable'])
export const MODIFICATION_CHANGE_STATES = Object.freeze(['unchanged', 'changed', 'unknown'])
export const MODIFICATION_DIFF_WORDS = Object.freeze({
  added: '新增',
  removed: '删除',
  modified: '修改',
  changed: '发生变化',
  unchanged: '保持不变',
  unavailable: '无法比较',
})

export const MODIFICATION_SNAPSHOT_GONE_MESSAGE = '本次修改前状态不可用，暂时无法比较本次修改的内容。'
export const MODIFICATION_SOURCE_UNCHANGED_MESSAGE = '来源 Skill 的内容没有发生变化。'
export const MODIFICATION_SOURCE_CHANGED_MESSAGE = '来源 Skill 在本次修改期间发生变化。'
export const MODIFICATION_SOURCE_UNKNOWN_MESSAGE = '没有拿到来源 Skill 的指纹，来源是否变化无法判断。'
export const MODIFICATION_UNAVAILABLE_REASONS = Object.freeze(['snapshot-missing', 'skill-unreadable', 'invalid-input'])

export const MODIFICATION_DIFF_LIMITS = Object.freeze({
  /** 逐行比对的行数上限；超过就退化成「掐掉公共前后缀」的近似值，并如实标注 `exact: false`。 */
  lcsLines: 1200,
  resources: 200,
  sections: 60,
  outOfScope: 20,
})

export const MODIFICATION_DIFF_LIMITATIONS = Object.freeze([
  '这份对比只看两份文本与目录清单，不做语义判断，也不评价这次修改好不好。',
  '「修改前」来自宿主内存里的快照。DSH 重启或快照过期之后，这里只会说无法比较，不会编造。',
  '行级差异是逐行比对的计数，空白与换行的变化同样计入；超过上限时给出的是近似值，并标注不精确。',
  '资源层只列新增、删除、内容发生变化的文件，不显示文件内容。',
  '来源 Skill 只比对指纹，不比对内容 —— 指纹不同只能说明来源变化过，不能说明是谁改的。',
  '这里没有版本实体：只有前后两个 sha256，没有版本号、没有历史、没有时间线。',
])

/** 内存快照的键。会话 + Skill 名两段，缺一不可 —— 跨会话复用同一份快照是错的。 */
export function modificationSnapshotKey({ sessionId, skillName } = {}) {
  const session = typeof sessionId === 'string' ? sessionId : ''
  const name = typeof skillName === 'string' ? skillName : ''
  return `${session}\u0000${name}`
}

/** 逐行比对：返回新增/删除行数与是否精确。超过上限时退化成「掐掉公共前后缀」。 */
function countLineChanges(beforeLines, afterLines) {
  const n = beforeLines.length
  const m = afterLines.length
  const limit = MODIFICATION_DIFF_LIMITS.lcsLines
  if (n > limit || m > limit) {
    let head = 0
    while (head < n && head < m && beforeLines[head] === afterLines[head]) head += 1
    let tail = 0
    while (tail < n - head && tail < m - head && beforeLines[n - 1 - tail] === afterLines[m - 1 - tail]) tail += 1
    return { added: m - head - tail, removed: n - head - tail, exact: false }
  }
  const width = m + 1
  const dp = new Int32Array((n + 1) * width)
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i * width + j] = beforeLines[i - 1] === afterLines[j - 1]
        ? dp[(i - 1) * width + (j - 1)] + 1
        : Math.max(dp[(i - 1) * width + j], dp[i * width + (j - 1)])
    }
  }
  let i = n
  let j = m
  let added = 0
  let removed = 0
  while (i > 0 && j > 0) {
    if (beforeLines[i - 1] === afterLines[j - 1]) {
      i -= 1
      j -= 1
    } else if (dp[(i - 1) * width + j] >= dp[i * width + (j - 1)]) {
      removed += 1
      i -= 1
    } else {
      added += 1
      j -= 1
    }
  }
  added += j
  removed += i
  return { added, removed, exact: true }
}

/**
 * 从正文里取某个 frontmatter 字段的**原始文本块**（含续行）。
 *
 * 不复用 `definition-outline.mjs` 的 `parseFrontmatter`：那个函数是给显示用的，会把值截到
 * 300 字符、折叠空白、重复键互相覆盖 —— 用它来判断「description 改了没有」「name 有没有被
 * 改名」会得出错误结论。这里只认第一段 `---` 到 `---` 之间的原始行。
 */
function rawFrontmatterField(text, key) {
  const lines = String(text).split(/\r?\n/)
  if (!/^---\s*$/.test(lines[0] ?? '')) return null
  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---\s*$/.test(lines[index])) { end = index; break }
  }
  if (end === -1) return null
  const pattern = new RegExp(`^${key}\\s*:`)
  for (let index = 1; index < end; index += 1) {
    if (!pattern.test(lines[index])) continue
    const block = [lines[index]]
    for (let next = index + 1; next < end; next += 1) {
      if (!/^\s+\S/.test(lines[next])) break
      block.push(lines[next])
    }
    return block.join('\n')
  }
  return null
}

/** 小节的别名表：标题命中其中之一就算这一节。只做包含匹配，不做语义判断。 */
const SECTION_ALIASES = Object.freeze({
  rules: Object.freeze(['rule', 'rules', '规则', '约束']),
  workflow: Object.freeze(['workflow', '流程', '工作流', '步骤']),
})

/** 按标题从正德里切出某一节的文本（从该标题到下一个同级或更高级标题之前）。没有这一节返回 `null`。 */
function sectionText(text, section) {
  const aliases = SECTION_ALIASES[section]
  if (!aliases) return null
  const lines = String(text).split(/\r?\n/)
  const outline = buildDefinitionOutline(text)
  const lowerAliases = aliases.map((alias) => alias.toLowerCase())
  const index = outline.entries.findIndex((entry) => {
    const title = entry.title.toLowerCase()
    return lowerAliases.some((alias) => title.includes(alias))
  })
  if (index === -1) return null
  const entry = outline.entries[index]
  let end = lines.length
  for (let next = index + 1; next < outline.entries.length; next += 1) {
    if (outline.entries[next].level <= entry.level) { end = outline.entries[next].line - 1; break }
  }
  return lines.slice(entry.line - 1, end).join('\n')
}

/** 一节的状态：两侧都没有 → unknown（判不了），只有一侧有 → changed，文本不同 → changed。 */
function sectionState(beforeText, afterText, section) {
  const before = beforeText === null ? null : sectionText(beforeText, section)
  const after = afterText === null ? null : sectionText(afterText, section)
  if (before === null && after === null) return { state: 'unknown', reason: 'section-not-found' }
  if (before !== after) return { state: 'changed', reason: null }
  return { state: 'unchanged', reason: null }
}

function normalizeResources(resources) {
  if (!Array.isArray(resources)) return null
  const map = new Map()
  for (const file of resources) {
    if (!file || typeof file.path !== 'string') continue
    map.set(file.path, typeof file.sha256 === 'string' ? file.sha256 : null)
  }
  return map
}

/** 资源层差异：新增 / 删除 / 内容变化，按目录分组。清单缺失（null）就整层判不了。 */
function resourceChanges(beforeResources, afterResources) {
  const before = normalizeResources(beforeResources)
  const after = normalizeResources(afterResources)
  if (!before || !after) return { available: false, added: [], removed: [], modified: [] }
  const added = []
  const removed = []
  const modified = []
  for (const [path, sha] of after) {
    if (!before.has(path)) { added.push(path); continue }
    const previous = before.get(path)
    if (sha !== null && previous !== null && sha !== previous) modified.push(path)
  }
  for (const path of before.keys()) if (!after.has(path)) removed.push(path)
  const cap = MODIFICATION_DIFF_LIMITS.resources
  const cut = (list) => list.slice(0, cap).sort()
  return { available: true, added: cut(added), removed: cut(removed), modified: cut(modified) }
}

function targetOfResourcePath(path) {
  for (const target of ['references', 'scripts', 'assets']) {
    if (path === target || path.startsWith(`${target}/`)) return target
  }
  return null
}

/**
 * UTF-8 字节数。自己数，不用 `Buffer` —— 这个模块是纯的：不假设自己跑在 Node 里，
 * 也不因为一个只用来显示的数字引入环境依赖。
 */
function utf8Bytes(text) {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.codePointAt(index)
    if (code > 0xffff) index += 1
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/**
 * 把一侧的输入整理成可比对的样子。`text` 不是字符串就返回 `null` —— 那一侧读不到，
 * 调用方据此给出「无法比较」，而不是拿空字符串去比出一个假的「没变化」。
 */
function readSide({ sha256, text, resources }) {
  if (typeof text !== 'string') return null
  const lines = text.split(/\r?\n/)
  return {
    sha256: typeof sha256 === 'string' ? sha256 : null,
    text,
    lines,
    lineCount: lines.length,
    bytes: utf8Bytes(text),
    resources: Array.isArray(resources) ? resources : null,
  }
}

/**
 * Modification Diff：**这次修改前 → 这次修改后**。
 *
 * 输入是纯数据（宿主读好再传进来）：`{ skillName, scopeIds, profileIds, before, after, source }`，
 * 其中 `before` / `after` 各是 `{ sha256, text, resources }`（`resources` 是
 * `<path, sha256>` 清单，拿不到就传 `null`），`source` 是 `{ beforeSha256, afterSha256 }`。
 *
 * 输出永远是一个对象，**任何输入都不抛错**：读不到快照就是 `available: false` +
 * `reason: 'snapshot-missing'`，并带上那句实话，而不是一份看起来像「没有变化」的空结果。
 */
export function diffSkillModification(input) {
  // 默认参数只对 `undefined` 生效；`null`、数字、字符串都要在这里收敛成空输入。
  const safe = input !== null && typeof input === 'object' ? input : {}
  const skillName = typeof safe.skillName === 'string' ? safe.skillName : ''
  const { scopeIds } = resolveModificationScopes(safe.scopeIds)
  const profileIds = Array.isArray(safe.profileIds) ? safe.profileIds.map((id) => String(id)) : []
  const base = {
    schemaVersion: SKILL_MODIFICATION_SCHEMA_VERSION,
    skillName,
    scopeIds,
    profileIds,
    limitations: [...MODIFICATION_DIFF_LIMITATIONS],
    notes: [],
  }

  const before = readSide(safe.before ?? {})
  const after = readSide(safe.after ?? {})
  if (!before || !after) {
    // 缺的是「改前」还是「现状」，说的不是同一件事。`before` 来自宿主内存里那份快照，
    // 它没了就是**快照没了**；把这种情况说成「读不到这个 Skill」，等于把责任推给磁盘上
    // 那份其实好好的文件。只有快照在、现状读不出来时，才是真的读不到这个 Skill。
    const reason = !before ? 'snapshot-missing' : 'skill-unreadable'
    return {
      ...base,
      available: false,
      reason,
      status: 'unavailable',
      message: MODIFICATION_SNAPSHOT_GONE_MESSAGE,
      before: null,
      after: null,
      lines: null,
      sections: { added: [], removed: [], truncated: false },
      resources: { available: false, added: [], removed: [], modified: [] },
      scopes: [],
      outOfScope: [],
      identity: { state: 'unknown', before: null, after: null },
      source: sourceStatus(safe.source),
      summary: { scopesChanged: 0, scopesUnchanged: 0, scopesUnknown: 0, outOfScopeCount: 0, addedLines: 0, removedLines: 0 },
      contentChanged: false,
    }
  }

  const contentChanged = before.text !== after.text
  const lines = countLineChanges(before.lines, after.lines)

  // 小节层：只报新增/删除的标题，以及被范围点名的那几节自身变没变。
  const beforeOutline = buildDefinitionOutline(before.text)
  const afterOutline = buildDefinitionOutline(after.text)
  const beforeTitles = new Set(beforeOutline.entries.map((entry) => entry.title))
  const afterTitles = new Set(afterOutline.entries.map((entry) => entry.title))
  const cap = MODIFICATION_DIFF_LIMITS.sections
  const sections = {
    added: afterOutline.entries.filter((entry) => !beforeTitles.has(entry.title)).map((entry) => entry.title).slice(0, cap),
    removed: beforeOutline.entries.filter((entry) => !afterTitles.has(entry.title)).map((entry) => entry.title).slice(0, cap),
    truncated: afterOutline.truncated || beforeOutline.truncated,
  }

  const resources = resourceChanges(before.resources, after.resources)
  const byTarget = new Map()
  for (const path of [...resources.added, ...resources.removed, ...resources.modified]) {
    const target = targetOfResourcePath(path)
    if (target) byTarget.set(target, true)
  }

  const scopes = []
  for (const id of MODIFICATION_SCOPE_IDS) {
    const option = modificationScopeById(id)
    if (option.target === 'skill-md') {
      if (option.section === 'description') {
        const b = rawFrontmatterField(before.text, 'description')
        const a = rawFrontmatterField(after.text, 'description')
        const state = b === null && a === null ? 'unknown' : (b === a ? 'unchanged' : 'changed')
        scopes.push({ id, label: option.labelZh, target: option.target, section: option.section, state, reason: state === 'unknown' ? 'field-not-found' : null, changed: state === 'changed' })
        continue
      }
      const result = sectionState(before.text, after.text, option.section)
      scopes.push({ id, label: option.labelZh, target: option.target, section: option.section, state: result.state, reason: result.reason, changed: result.state === 'changed' })
      continue
    }
    const state = resources.available ? (byTarget.get(option.target) ? 'changed' : 'unchanged') : 'unknown'
    scopes.push({ id, label: option.labelZh, target: option.target, section: null, state, reason: resources.available ? null : 'no-directory-listing', changed: state === 'changed' })
  }

  // 范围对账（§27）：变了但没被授权的部分要**如实报出来**，但不替用户判断该不该改。
  const declared = new Set(scopeIds)
  const outOfScope = []
  const push = (id, label, detail) => {
    if (outOfScope.length >= MODIFICATION_DIFF_LIMITS.outOfScope) return
    outOfScope.push({ id, label, detail })
  }
  // 资源目录那一类**把改到的文件写进这一条**，不要再补一条「…/ 下的文件发生了变化」：
  // 两条说的是同一件事，读者会以为发生了两次（真机上渲染 `references` 的范围外改动时就是这样）。
  const changedFilesUnder = (target) =>
    [...resources.added, ...resources.removed, ...resources.modified]
      .filter((path) => targetOfResourcePath(path) === target)
      .slice(0, 5)
  for (const scope of scopes) {
    if (!scope.changed || declared.has(scope.id)) continue
    const files = scope.target === 'skill-md' ? [] : changedFilesUnder(scope.target)
    const detail = files.length > 0
      ? `${scope.label} 发生了变化，但它不在本次指定的修改范围里（${files.join('、')}）。`
      : `${scope.label} 发生了变化，但它不在本次指定的修改范围里。`
    push(scope.id, scope.label, detail)
  }
  const declaredSkillMd = scopeIds.filter((id) => modificationScopeById(id)?.target === 'skill-md')
  const skillMdAccounted = scopes.some((scope) => scope.target === 'skill-md' && scope.changed && declared.has(scope.id))
  if (contentChanged && declaredSkillMd.length === 0) {
    push('skill-md', 'SKILL.md', 'SKILL.md 的正文发生了变化，但本次没有指定任何 SKILL.md 范围。')
  } else if (contentChanged && !skillMdAccounted) {
    push('skill-md', 'SKILL.md', 'SKILL.md 的正文发生了变化，但变化不在被点名的 Rules / Workflow / Description 里。')
  }

  const identity = (() => {
    const b = rawFrontmatterField(before.text, 'name')
    const a = rawFrontmatterField(after.text, 'name')
    if (b === null || a === null) return { state: 'unknown', before: b, after: a }
    return { state: b === a ? 'unchanged' : 'changed', before: b, after: a }
  })()
  if (identity.state === 'changed') {
    base.notes.push('SKILL.md 的 name 字段在这次修改里变了。协议要求保留名称，除非用户明确要求改名。')
  }
  if (scopeIds.length === 0) {
    base.notes.push('这次没有指定修改范围，所以任何变化都会被列为超出范围。')
  }
  if (!resources.available) {
    base.notes.push('没有拿到完整的目录清单，资源层的差异没有参与判定。')
  }
  if (!lines.exact) {
    base.notes.push('正文行数超过逐行比对的上限，新增与删除行数是近似值。')
  }
  if (safe.truncated === true) {
    base.notes.push('这次读到的是被截断的正文，行级差异只覆盖读到的部分。')
  }

  const changedScopeCount = scopes.filter((scope) => scope.changed).length
  const summary = {
    scopesChanged: changedScopeCount,
    scopesUnchanged: scopes.filter((scope) => scope.state === 'unchanged').length,
    scopesUnknown: scopes.filter((scope) => scope.state === 'unknown').length,
    outOfScopeCount: outOfScope.length,
    addedLines: lines.added,
    removedLines: lines.removed,
  }

  return {
    ...base,
    available: true,
    reason: null,
    status: contentChanged || outOfScope.length > 0 || summary.scopesChanged > 0 ? 'changed' : 'unchanged',
    message: null,
    before: { sha256: before.sha256, lineCount: before.lineCount, bytes: before.bytes },
    after: { sha256: after.sha256, lineCount: after.lineCount, bytes: after.bytes },
    lines,
    sections,
    resources,
    scopes,
    outOfScope,
    identity,
    source: sourceStatus(safe.source),
    summary,
    contentChanged,
  }
}

/**
 * 来源保护：只比指纹，不下判断。
 *
 * 指纹不同时**不许**说「Agent 修改了来源 Skill」—— 只能陈述事实：「来源 Skill 在本次修改期间
 * 发生变化」。两句话的差别是「有直接证据」与「只是观察到一个差异」的差别。
 */
export function sourceStatus(source) {
  const before = typeof source?.beforeSha256 === 'string' ? source.beforeSha256 : null
  const after = typeof source?.afterSha256 === 'string' ? source.afterSha256 : null
  if (before === null || after === null) {
    return { state: 'unknown', before, after, message: MODIFICATION_SOURCE_UNKNOWN_MESSAGE }
  }
  if (before === after) {
    return { state: 'unchanged', before, after, message: MODIFICATION_SOURCE_UNCHANGED_MESSAGE }
  }
  return { state: 'changed', before, after, message: MODIFICATION_SOURCE_CHANGED_MESSAGE }
}

/** 界面上那句「一句话结论」。只有三种状态，没有分数。 */
export function modificationDiffStatusText(status, language = 'zh') {
  const words = { unchanged: { zh: '没有变化', en: 'No change' }, changed: { zh: '有变化', en: 'Changed' }, unavailable: { zh: '无法比较', en: 'Not comparable' } }
  const entry = words[status]
  if (!entry) return typeof status === 'string' ? status : ''
  return language === 'en' ? entry.en : entry.zh
}
