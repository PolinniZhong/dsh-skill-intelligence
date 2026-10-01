/**
 * v0.6 §7「已安装 Skill」的数据层。
 *
 * 与 `catalog-view.mjs` 的分工是这一层**不读 receipt**：已安装列表回答「当前 DSH 环境里
 * 可发现哪些 Skill」，与本会话发生过什么无关。所以它没有学习状态、验证状态、历史理解与
 * review queue —— 那些正是 SDD §4 要删掉的工作台。任何把它们带回这里的改动都是回退。
 *
 * `catalogSnapshot` 已经由 `buildCatalogSnapshot` 挡掉了 `SkillSummary.path`（绝对路径），
 * 这里再按白名单投影一次：只放行已知字段，宿主将来新增的字段不会自动流到客户端。
 */

const COVERAGE_UNKNOWN_LIMITATION = 'catalog-coverage-incomplete'

function safeText(value) {
  return typeof value === 'string' ? value : ''
}

export function projectInstalledSkill(summary) {
  const name = safeText(summary?.name).trim()
  if (!name) return null
  const invocation = summary?.invocation && typeof summary.invocation === 'object' ? summary.invocation : {}
  return {
    name,
    description: safeText(summary?.description),
    provider: safeText(summary?.provider) || null,
    sourceFingerprint: safeText(summary?.sourceFingerprint) || null,
    invocation: {
      modelInvocable: invocation.modelInvocable === true,
      userInvocable: invocation.userInvocable === true,
    },
  }
}

export function matchesInstalledQuery(skill, query) {
  const needle = safeText(query).trim().toLowerCase()
  if (!needle) return true
  // §7 只承诺按 name 与 description 过滤。将 description 拼进同一个字符串是为了让
  // 多词命中跨字段也能成立，且顺序稳定。
  return `${skill.name}\n${skill.description}`.toLowerCase().includes(needle)
}

export function buildInstalledView({ catalogSnapshot, query = '' } = {}) {
  const hasSnapshot = Boolean(catalogSnapshot) && typeof catalogSnapshot === 'object'
  const snapshot = hasSnapshot ? catalogSnapshot : {}
  const seen = new Set()
  const skills = []
  for (const raw of Array.isArray(snapshot.skills) ? snapshot.skills : []) {
    const skill = projectInstalledSkill(raw)
    if (!skill) continue
    const key = skill.name.toLowerCase()
    // 名称唯一：同一个 Skill 从两层被发现时只出现一次。
    if (seen.has(key)) continue
    seen.add(key)
    skills.push(skill)
  }
  skills.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  const matched = skills.filter((skill) => matchesInstalledQuery(skill, query))
  const complete = snapshot.complete === true
  return {
    schemaVersion: 1,
    scope: 'installed-skills',
    query: safeText(query).trim(),
    coverage: complete ? 'complete' : hasSnapshot && snapshot.status !== 'coverage-unknown' ? 'incomplete' : 'unknown',
    observedAt: Number.isSafeInteger(snapshot.observedAt) ? snapshot.observedAt : null,
    totalCount: skills.length,
    skillCount: matched.length,
    skills: matched,
    // 只表达「这次发现不完整」，不猜缺了什么。空数组与「发现完整时的零个 Skill」必须可分。
    limitations: complete ? [] : [COVERAGE_UNKNOWN_LIMITATION],
  }
}
