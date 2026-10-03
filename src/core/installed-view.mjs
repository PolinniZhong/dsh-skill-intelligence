/**
 * v0.6 §7「已安装 Skill」的数据层。
 *
 * 与 `catalog-view.mjs` 的分工是这一层**不读 receipt**：已安装列表回答「当前 DSH 环境里
 * 可发现哪些 Skill」，与本会话发生过什么无关。所以它没有学习状态、验证状态、历史理解与
 * review queue —— 那些正是 SDD §4 要删掉的工作台。任何把它们带回这里的改动都是回退。
 *
 * `catalogSnapshot` 已经由 `buildCatalogSnapshot` 挡掉了 `SkillSummary.path`（绝对路径），
 * 这里再按白名单投影一次：只放行已知字段，宿主将来新增的字段不会自动流到客户端。
 *
 * **v0.9.2 排序**：列表按「这个 Skill 什么时候出现在本机」倒序 —— 刚复刻出来的那个必须
 * 在第一行，否则用户要在几十张卡片里按名字翻。这个时间**不在**目录快照里（快照里每个
 * Skill 只有名字、描述、provider、来源指纹与调用方式），它是宿主对 Skill 目录做 `stat`
 * 拿到的 birthtime，以 `addedAtByName` 传进来。三条硬规矩：
 *   1. 读不到就是 `null`，排在最后 —— 拿 mtime 冒充「加入时间」是另一个事实（最后修改）；
 *   2. 时间相同、或都读不到时按名称，保证同一份输入永远给出同一个顺序；
 *   3. 「有时间的按时间倒序在前，没时间的按名称在后」是**一条**规则，客户端照 `ordering`
 *      写那句话，而不是从看到的第一行倒推顺序。
 *
 * 本模块**不许** require 任何依赖 node 内建的东西：客户端为了 `matchesInstalledQuery`
 * 直接 require 它（§6.6 的核心白名单），`node:crypto` 会跟着进浏览器包。
 */

const COVERAGE_UNKNOWN_LIMITATION = 'catalog-coverage-incomplete'
// 加入时间：一个都读不到 / 只读到一部分。两句都要说，因为「全都不知道」与「知道一部分」
// 对读者的意义不同 —— 前者是「这个环境说不出顺序」，后者是「有 N 个说不出来」。
const ADDED_AT_UNAVAILABLE_LIMITATION = 'added-at-unavailable'
const ADDED_AT_PARTIAL_LIMITATION = 'added-at-partial'
// 复刻血缘读不到（文件坏掉、目录不可读、宿主根本没给）。血缘是**额外**的事实：它没了不影响
// 排序，但也不能因此假装「这些 Skill 都不是复刻来的」。
const LINEAGE_UNAVAILABLE_LIMITATION = 'lineage-unavailable'

/** 排序规则的名字。客户端用它写「按什么排的」，守卫钉住它，文档抄它。 */
export const INSTALLED_ORDERING_RULE = 'added-desc-then-name'

function safeText(value) {
  return typeof value === 'string' ? value : ''
}

function safeAddedAt(value) {
  return Number.isFinite(value) && value > 0 ? value : null
}

function safeLineageSourceName(value) {
  const name = safeText(value).trim()
  // 这一层只做形状检查：真正的白名单在宿主（它用与别处同一份 `safeSkillName` 过滤）。
  // 这里是最后一道，防止任何调用方把整段文本直接塞进卡片。
  return name && name.length <= 128 && !/[\s<>"']/.test(name) ? name : ''
}

export function projectInstalledSkill(summary, extras = {}) {
  const name = safeText(summary?.name).trim()
  if (!name) return null
  const invocation = summary?.invocation && typeof summary.invocation === 'object' ? summary.invocation : {}
  const lineage = extras?.lineage && typeof extras.lineage === 'object' ? extras.lineage : null
  const sourceSkillName = safeLineageSourceName(lineage?.sourceSkillName)
  return {
    name,
    description: safeText(summary?.description),
    provider: safeText(summary?.provider) || null,
    // 这里**没有** `sourceFingerprint`：卡片不显示它，搜索也不过滤它。一个没人读的
    // 哈希留在出站投影里，早晚会被下一个人当成有含义的状态来用（§7.4）。
    invocation: {
      modelInvocable: invocation.modelInvocable === true,
      userInvocable: invocation.userInvocable === true,
    },
    // 「这个 Skill 什么时候出现在本机」——文件系统意义上的目录创建时间，不是作者写它的
    // 时间，也不是它最后一次被改动的时间。读不到就是 null。
    addedAt: safeAddedAt(extras?.addedAt),
    // 复刻血缘回答的是「它从哪来」，与 `addedAt`（「它什么时候来的」）是两件事，不许合并
    // 成一句含糊的「创建时间」。只有被本插件复刻过的 Skill 才有这一项。
    lineage: sourceSkillName
      ? { sourceSkillName, createdAt: safeAddedAt(lineage?.createdAt) }
      : null,
  }
}

export function matchesInstalledQuery(skill, query) {
  const needle = safeText(query).trim().toLowerCase()
  if (!needle) return true
  // §7 只承诺按 name 与 description 过滤。将 description 拼进同一个字符串是为了让
  // 多词命中跨字段也能成立，且顺序稳定。
  return `${skill.name}\n${skill.description}`.toLowerCase().includes(needle)
}

/**
 * 有时间的按时间倒序在前，没时间的按名称在后；完全并列时按名称。
 *
 * 这条比较函数是**唯一**决定顺序的地方：宿主不做二次排序，客户端也不做（搜索只过滤、
 * 不重排）。「读不到时间的排在最后」不是随手定的 —— 它们之间没有可比性，而把它们按名称
 * 排在末尾，至少保证下一次刷新给出完全一样的列表。
 */
function compareInstalledSkills(left, right) {
  const leftAt = left.addedAt
  const rightAt = right.addedAt
  if (leftAt !== null && rightAt !== null && leftAt !== rightAt) return rightAt - leftAt
  if (leftAt !== null && rightAt === null) return -1
  if (leftAt === null && rightAt !== null) return 1
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

export function buildInstalledView({
  catalogSnapshot,
  query = '',
  addedAtByName = null,
  lineageByName = null,
} = {}) {
  const hasSnapshot = Boolean(catalogSnapshot) && typeof catalogSnapshot === 'object'
  const snapshot = hasSnapshot ? catalogSnapshot : {}
  const addedAtOf = (name) => safeAddedAt(addedAtByName?.[name])
  const lineageOf = (name) => (
    lineageByName && typeof lineageByName === 'object' ? lineageByName[name] ?? null : null
  )
  const seen = new Set()
  const skills = []
  for (const raw of Array.isArray(snapshot.skills) ? snapshot.skills : []) {
    const name = safeText(raw?.name).trim()
    if (!name) continue
    const key = name.toLowerCase()
    // 名称唯一：同一个 Skill 从两层被发现时只出现一次。
    if (seen.has(key)) continue
    const skill = projectInstalledSkill(raw, { addedAt: addedAtOf(name), lineage: lineageOf(name) })
    if (!skill) continue
    seen.add(key)
    skills.push(skill)
  }
  skills.sort(compareInstalledSkills)
  const matched = skills.filter((skill) => matchesInstalledQuery(skill, query))
  const complete = snapshot.complete === true
  const addedAtKnown = skills.filter((skill) => skill.addedAt !== null).length
  // 只表达「这次发现不完整」，不猜缺了什么。空数组与「发现完整时的零个 Skill」必须可分。
  const limitations = complete ? [] : [COVERAGE_UNKNOWN_LIMITATION]
  if (skills.length > 0 && addedAtKnown === 0) limitations.push(ADDED_AT_UNAVAILABLE_LIMITATION)
  else if (addedAtKnown < skills.length) limitations.push(ADDED_AT_PARTIAL_LIMITATION)
  if (!(lineageByName && typeof lineageByName === 'object')) limitations.push(LINEAGE_UNAVAILABLE_LIMITATION)
  return {
    schemaVersion: 1,
    scope: 'installed-skills',
    query: safeText(query).trim(),
    coverage: complete ? 'complete' : hasSnapshot && snapshot.status !== 'coverage-unknown' ? 'incomplete' : 'unknown',
    observedAt: Number.isSafeInteger(snapshot.observedAt) ? snapshot.observedAt : null,
    totalCount: skills.length,
    skillCount: matched.length,
    // 排序规则与两个计数：客户端据此写「按加入本机的时间倒序」，并如实说出有多少个排不出来。
    // 计数说的是**整个目录**，不是这次搜索结果 —— 换一个搜索词不该改变「这台机器上有几个
    // Skill 说得出来加入时间」这个事实。
    ordering: { rule: INSTALLED_ORDERING_RULE, addedAtKnown, addedAtUnknown: skills.length - addedAtKnown },
    skills: matched,
    limitations,
  }
}
