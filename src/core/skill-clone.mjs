/**
 * 复刻（clone）的纯函数层：名字规则、来源判定、拷贝计划、frontmatter 改名。
 *
 * 这一层不碰磁盘、不认识 DSH，只把"能不能复刻、要拷哪些、副本该叫什么"算出来。
 * 真正的读写留给宿主 —— 复刻是整个产品里唯一会写盘的动作，把决策与执行分开，
 * 才能在测试里把每一条拒绝路径都走一遍而不需要真的建目录。
 *
 * 三条不许违反的规矩（v0.7 §十三 / §十四 / §十六）：
 *
 * 1. **只拷不改源。** 这里产出的每一个路径都是"副本"路径；源 Skill 的目录、文件、
 *    指纹在复刻前后必须完全一致。改的只有副本里那一行 `name:`。
 * 2. **目标名不覆盖。** 名字冲突时返回冲突，让用户改名；这里不提供自动加序号、
 *    也不提供"覆盖确认"这种后门。
 * 3. **不执行 Skill 里的任何东西。** 计划里只有文件，没有入口脚本、没有命令。
 */

export const CLONE_SCOPES = Object.freeze(['project', 'user'])
export const CLONE_MODES = Object.freeze(['bundle', 'skill-md'])

export const CLONE_ERROR = Object.freeze({
  INVALID_REQUEST: 'invalid-request',
  SKILL_NOT_FOUND: 'skill-not-found',
  SOURCE_CHANGED: 'source-changed',
  TARGET_EXISTS: 'target-exists',
  DEFINITION_UNAVAILABLE: 'definition-unavailable',
  BUNDLE_UNREADABLE: 'bundle-unreadable',
  WRITE_FAILED: 'write-failed',
})

/** 默认后缀。`frontend-design` → `frontend-design-custom`。 */
export const CLONE_NAME_SUFFIX = '-custom'

/** 一次复刻最多拷多少个文件 / 多少字节，防止把 `node_modules` 整个搬走。 */
export const CLONE_MAX_FILES = 512
export const CLONE_MAX_BYTES = 16 * 1024 * 1024

/** 这两个目录即便出现在 Skill 目录里也不是 Skill 的组成部分。 */
export const CLONE_SKIPPED_DIRECTORIES = Object.freeze(['.git', 'node_modules'])

/**
 * DSH 的 Skill 名文法（`@deepseek-ai/dsh-skill` 的 `SKILL_NAME`）。
 *
 * 这里重新写一遍而不是 import：该包是宿主 composition 挂载的服务，不在本插件的
 * `dependencies` 里（`dependencies` 必须保持为空），拿不到它的导出。文法是它对外的
 * 契约，抄在这里并加一条守卫盯着；比"用宿主那条更宽松的 requiredSkillName"安全得多——
 * 后者允许大写、下划线与斜杠，写出去的文件 DSH 根本不认。
 */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SKILL_NAME_MAX = 128

export function isSkillName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= SKILL_NAME_MAX && SKILL_NAME.test(value)
}

/**
 * 复刻的默认目标名。只生成**建议**：冲突时不在这里退让，直接报冲突。
 * 源名过长时截断源部分，保证整体仍然是合法名字。
 */
export function cloneTargetName(sourceName, suffix = CLONE_NAME_SUFFIX) {
  const base = typeof sourceName === 'string' ? sourceName.trim() : ''
  const tail = typeof suffix === 'string' && suffix ? suffix : CLONE_NAME_SUFFIX
  const room = SKILL_NAME_MAX - tail.length
  const head = base.slice(0, Math.max(1, room)).replace(/-+$/, '')
  return `${head}${tail}`
}

/**
 * 把一个 SKILL.md 的原文切成 frontmatter 与正文。
 *
 * 规则与 `dsh-skill-filesystem` 的 `parseFrontmatter` 一致：第一行必须是单独的 `---`，
 * 之后必须再有单独一行 `---`。末尾的 `\r` 容忍，其它一律不认。
 */
export function splitFrontmatter(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, reason: 'empty-file' }
  const lines = raw.split('\n')
  const bare = (line) => line.replace(/\r$/, '')
  if (bare(lines[0]) !== '---') return { ok: false, reason: 'missing-frontmatter' }
  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (bare(lines[index]) === '---') {
      closing = index
      break
    }
  }
  if (closing === -1) return { ok: false, reason: 'unterminated-frontmatter' }
  return {
    ok: true,
    lines,
    frontmatter: lines.slice(1, closing).join('\n'),
    body: lines.slice(closing + 1).join('\n').trim(),
    closing,
  }
}

/**
 * 把副本里 frontmatter 的 `name:` 换成目标名。
 *
 * 这是复刻唯一"改内容"的地方，而且只改副本。DSH 认的是 frontmatter 里的名字而不是
 * 目录名（`parseSkillFile`），所以哪怕文件放在 `目标名/SKILL.md`，不改这一行，
 * 副本仍会以源名字注册 —— 两个同名 Skill 会在 registry 里打架。
 */
export function rewriteSkillName(raw, targetName) {
  if (!isSkillName(targetName)) return { ok: false, reason: 'invalid-target-name' }
  const split = splitFrontmatter(raw)
  if (!split.ok) return { ok: false, reason: split.reason }
  const lines = [...split.lines]
  let replaced = false
  for (let index = 1; index < split.closing; index += 1) {
    if (!/^name:\s*/i.test(lines[index])) continue
    lines[index] = `name: ${targetName}`
    replaced = true
    break
  }
  if (!replaced) return { ok: false, reason: 'missing-name-field' }
  return { ok: true, text: lines.join('\n') }
}

/**
 * 判定这个 Skill 能不能当复刻来源，以及用哪种模式。
 *
 * `resourceBase.kind === 'directory'` 还不足以下结论：扁平 Skill（`<root>/<name>.md`）
 * 的 `resourceBase.path` 指向的是 **skills 根目录本身**，照着它递归就是把别人的 Skill
 * 全拷一份。所以额外要求目录名与 Skill 名一致，并且目录里真的有 `SKILL.md`。
 *
 * 拿不准就不装懂：判不出来时返回 `mode: 'skill-md'`，让界面说"仅复刻可读取的 SKILL.md"。
 */
export function planCloneSource({ sourceName, definitionName, definitionAvailable, resourceBasePath }) {
  if (!isSkillName(sourceName)) return { ok: false, code: CLONE_ERROR.INVALID_REQUEST, reason: 'invalid-source-name' }
  if (definitionAvailable === false) return { ok: false, code: CLONE_ERROR.DEFINITION_UNAVAILABLE, reason: 'definition-unavailable' }
  if (definitionName !== sourceName) return { ok: false, code: CLONE_ERROR.SKILL_NOT_FOUND, reason: 'definition-name-mismatch' }
  const path = typeof resourceBasePath === 'string' ? resourceBasePath.trim() : ''
  const directory = path.split(/[\\/]/).filter(Boolean).pop() ?? ''
  if (!path || directory !== sourceName) {
    return {
      ok: true,
      mode: 'skill-md',
      directory: null,
      reason: path ? 'resource-base-is-not-the-skill-directory' : 'resource-base-has-no-path',
    }
  }
  return { ok: true, mode: 'bundle', directory: path, reason: 'directory-bundle' }
}

/**
 * 拷贝计划：从目录里挑出该拷的文件，并说清楚**没拷**什么。
 *
 * 静默跳过是这一层最容易犯的错：用户以为拿到了完整 Skill，其实少了几个文件。
 * 所以每一个被排除的条目都留下理由，由界面决定要不要说。
 */
export function selectCloneEntries(entries, {
  maxFiles = CLONE_MAX_FILES,
  maxBytes = CLONE_MAX_BYTES,
} = {}) {
  const files = []
  const skipped = []
  let bytes = 0
  let truncated = false
  // 用码位比较而不是 `localeCompare`：后者的结果取决于运行环境的 ICU 与区域设置，
  // 同一份 Skill 在两台机器上会得到不同的拷贝顺序。码位比较是个常量，`SKILL.md`
  // 也自然排在最前（大写字母在小写之前）。
  const ordered = [...(Array.isArray(entries) ? entries : [])]
    .sort((left, right) => {
      const a = String(left?.path ?? '')
      const b = String(right?.path ?? '')
      return a < b ? -1 : a > b ? 1 : 0
    })
  for (const entry of ordered) {
    const path = typeof entry?.path === 'string' ? entry.path : ''
    if (!path || path.startsWith('/') || path.includes('..')) {
      skipped.push({ path, reason: 'unsafe-path' })
      continue
    }
    const segments = path.split('/').filter(Boolean)
    if (segments.some((segment) => CLONE_SKIPPED_DIRECTORIES.includes(segment))) {
      skipped.push({ path, reason: 'excluded-directory' })
      continue
    }
    if (entry?.type === 'symlink') {
      // 符号链接可以指到 Skill 目录之外。复刻不是"把这个链接指向的东西也拷一份"，
      // 所以一律跳过并记账。
      skipped.push({ path, reason: 'symlink' })
      continue
    }
    if (entry?.type !== 'file') {
      skipped.push({ path, reason: 'not-a-file' })
      continue
    }
    const size = Number.isFinite(entry?.size) ? entry.size : 0
    if (files.length >= maxFiles || bytes + size > maxBytes) {
      truncated = true
      skipped.push({ path, reason: 'over-limit' })
      continue
    }
    bytes += size
    files.push({ path, size })
  }
  return { files, skipped, truncated, bytes }
}

/**
 * 把复刻结果写成一句人话。
 *
 * 界面上的成功态必须能回答"写到哪里、拷了多少、有没有少东西"，
 * 而不是一句 `ok`。绝对路径不在这里出现 —— 那是 §八.5 的禁令。
 */
export function describeCloneResult({ skillName, scope, mode, fileCount, skippedCount, truncated }) {
  const scopeLabel = scope === 'user' ? '用户级 Skill 目录' : '当前项目 Skill 目录'
  const modeLabel = mode === 'bundle' ? '完整 Skill' : '仅 SKILL.md'
  const parts = [`已写入${scopeLabel}（${modeLabel}，${fileCount} 个文件）`]
  if (skippedCount > 0) parts.push(`跳过 ${skippedCount} 个条目`)
  if (truncated === true) parts.push('超出单次复刻上限，未拷完')
  return `${skillName}：${parts.join('；')}`
}
