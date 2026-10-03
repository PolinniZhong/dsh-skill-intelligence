import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  CLONE_SKIPPED_DIRECTORIES,
  isSkillName,
  selectCloneEntries,
  splitFrontmatter,
} from '../core/skill-clone.mjs'

/**
 * 复刻的磁盘半边（v0.7 §十六 / §十七）。
 *
 * 用 `node:fs/promises` 而不是 `ctx.fs`：`ctx.fs` 没有 `mkdir`（技能目录建不出来），
 * 而且只允许在 `workspaceRoot` 内写入，用户级 Skill 目录天然在它之外。
 * 这里与 `receipt-store.mjs` / `preference-store.mjs` 是同一套做法。
 *
 * 复刻允许的动作只有 **read / copy / write / verify**。这个文件里没有 `spawn`、
 * 没有 `exec`、没有 import 任何 Skill 里的东西 —— Skill 目录里的脚本从头到尾只是字节。
 */

/** 正文指纹的口径与 `skill-definition.mjs` 的 `sha256()` 一致（对 body 取 sha256）。 */
export function bodySha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

/** 从 `start` 向上找最近的、含 `.git` 的祖先；一个都没有就返回 `start` 自己。 */
export async function findProjectRoot(start) {
  let current = resolve(start)
  if (!current) return null
  for (;;) {
    try {
      await stat(join(current, '.git'))
      return current
    } catch {
      // 继续往上
    }
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
}

/** 哪些候选根真的存在 —— `resolveCloneRoot` 靠这份清单做选择。 */
export async function probeExistingRoots(candidates) {
  const existing = []
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const info = await stat(candidate)
      if (info.isDirectory()) existing.push(candidate)
    } catch {
      // 不存在就是不存在，不是错误
    }
  }
  return existing
}

/** DSH 认得的一个 Skill 落点：`<name>/SKILL.md` 或 `<name>.md`，名字是小写 kebab-case。 */
async function looksLikeSkillRoot(candidate) {
  let children
  try {
    children = await readdir(candidate, { withFileTypes: true })
  } catch {
    return false
  }
  for (const child of children) {
    if (child.isDirectory()) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.name)) continue
      try {
        const info = await stat(join(candidate, child.name, 'SKILL.md'))
        if (info.isFile()) return true
      } catch {
        // 继续看下一个
      }
      continue
    }
    if (child.isFile() && /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(child.name)) return true
  }
  return false
}

/**
 * `existing` 的子集：目录不但存在，里面**已经有 Skill**。
 *
 * 用户级有两个候选根，而且这台机器上两个都存在 —— 一个是 DSH 自己的
 * `~/.dsh/skills`（空的），一个是 `~/.agents/skills`（用户真正在用的 20 多个）。
 * 只按 rank 选就会把复刻写进那个空目录：能被 DSH 发现，却不在用户找得到的地方。
 * 「我的 Skill」应当就是"我的 Skill 已经在的那里"。
 */
export async function probePopulatedRoots(candidates) {
  const populated = []
  for (const candidate of candidates) {
    if (!candidate) continue
    if (await looksLikeSkillRoot(candidate)) populated.push(candidate)
  }
  return populated
}

async function pathExists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

// v0.9.2：已安装列表的排序要回答「这个 Skill 什么时候出现在本机」。这就是唯一能回答它的
// 磁盘事实 —— Skill **目录**的 birthtime。
//
// 只取目录、不取文件：`SKILL.md` 每被改写一次（编辑器写临时文件再改名）都是一个新文件，
// 它的 birthtime 会跳到改动那一刻。实测 `deliver-prd-custom-custom-custom/SKILL.md` 的
// birthtime 是本次修改之后的 23:29，而目录仍是复刻那一刻的 22:39 —— 而「它什么时候来到
// 这台机器」不应该因为改了正文而改变。目录本身不会被改写，所以这个值对内容修改免疫。
//
// 同样的名字在多个根里都存在时，按与复刻写入相同的 rank 顺序取**第一个**命中：顺序必须是
// 确定的，否则同一个目录刷新两次可能给出两种排法。读不到（文件系统不报 birthtime，或目录
// 不在任何候选根里）就是没有这一项，调用方据此把该 Skill 排在最后，而不是拿 mtime 顶替。
export async function skillAddedAtByName({ names, roots }) {
  const added = {}
  const seen = new Set()
  const candidates = Array.isArray(roots) ? roots.filter(Boolean) : []
  for (const raw of Array.isArray(names) ? names : []) {
    // `isSkillName` 同时挡住 `..`、`/` 这类会跑出根目录的名字。目录快照里的名字本来
    // 就来自 registry，这里是第二道。
    const name = typeof raw === 'string' ? raw.trim() : ''
    if (!isSkillName(name) || seen.has(name)) continue
    seen.add(name)
    for (const root of candidates) {
      try {
        const info = await stat(join(root, name))
        if (info.isDirectory() && Number.isFinite(info.birthtimeMs) && info.birthtimeMs > 0) {
          added[name] = info.birthtimeMs
          break
        }
      } catch {
        // 这个根里没有就继续下一个根
      }
    }
  }
  return added
}

/** 与复刻写入时同一份候选根清单（rank 顺序一致），只用于**读**。 */
export async function skillRootCandidates({ cwd }) {
  const projectRoot = await findProjectRoot(cwd ?? process.cwd())
  const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
  const agentsHome = process.env.DSH_AGENTS_HOME && process.env.DSH_AGENTS_HOME.trim() ? process.env.DSH_AGENTS_HOME.trim() : join(homedir(), '.agents')
  return [
    join(projectRoot, '.dsh', 'skills'),
    join(projectRoot, '.agents', 'skills'),
    join(dshHome, 'skills'),
    join(agentsHome, 'skills'),
  ]
}

/** 目标是不是已经被占了：整个 catalog 里、以及目标根下的两种落点，任一处命中都算冲突。 */
export async function cloneTargetTaken({ registry, targetName, cwd, scope, root }) {
  if (registry) {
    try {
      const existing = await registry.get(targetName, { cwd, scope })
      if (existing) return { taken: true, where: 'catalog' }
    } catch {
      // registry 抛错不能变成"名字可用" —— 交给下面的磁盘检查兜底
    }
  }
  const directory = join(root, targetName)
  const flatFile = join(root, `${targetName}.md`)
  if (await pathExists(directory)) return { taken: true, where: 'directory' }
  if (await pathExists(flatFile)) return { taken: true, where: 'flat-file' }
  return { taken: false, where: null }
}

/**
 * 递归列出 bundle 目录里的文件。
 *
 * 只读；符号链接单独标记（`selectCloneEntries` 会把它们挡掉，因为一个链接可以指向
 * Skill 目录之外的任何地方）。路径统一用 `/`，跨平台与 `SKILL.md` 的相对路径一致。
 */
async function walkBundle(directory) {
  const entries = []
  async function walk(current) {
    let children
    try {
      children = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const child of children) {
      // `.git` / `node_modules` 不是 Skill 的一部分，连"被跳过"都算不上。
      // 早先这里只是让 `selectCloneEntries` 把它们记成 skipped，于是一个带 `.git` 的
      // Skill 会报出"跳过 431 个条目"——用户看到的是自己九成的 Skill 没拷进去，
      // 而其实那 387 条是一个版本库的内部文件。记账必须只记**本当属于 Skill 的东西**。
      if (CLONE_SKIPPED_DIRECTORIES.includes(child.name)) continue
      const absolute = join(current, child.name)
      const path = relative(directory, absolute).split(sep).join('/')
      if (child.isSymbolicLink()) {
        entries.push({ path, type: 'symlink', size: 0 })
        continue
      }
      if (child.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (!child.isFile()) {
        entries.push({ path, type: 'other', size: 0 })
        continue
      }
      let size = 0
      try {
        size = (await stat(absolute)).size
      } catch {
        size = 0
      }
      entries.push({ path, type: 'file', size })
    }
  }
  await walk(directory)
  return entries
}

/**
 * 复刻的"读源"阶段：拿到源 SKILL.md 的原文、正文指纹，以及要拷的清单。
 *
 * `mode: 'skill-md'` 时清单只有 SKILL.md —— 这就是 §十二 承诺的那一件事，
 * 不会假装拷了 references/。
 */
export async function readSkillSource({ skillFile, directory, mode, limits }) {
  let text
  try {
    text = await readFile(skillFile, 'utf8')
  } catch (error) {
    return { ok: false, reason: error?.code === 'ENOENT' ? 'source-file-missing' : 'source-read-failed' }
  }
  const split = splitFrontmatter(text)
  if (!split.ok) return { ok: false, reason: split.reason }
  const body = split.body
  if (mode !== 'bundle') {
    return {
      ok: true,
      text,
      body,
      sha256: bodySha256(body),
      plan: { files: [{ path: 'SKILL.md', size: text.length }], skipped: [], truncated: false, bytes: text.length },
    }
  }
  const raw = await walkBundle(directory)
  // SKILL.md 一定在清单里，而且是第一个被写下的。
  const withoutSkillMd = raw.filter((entry) => entry.path !== 'SKILL.md')
  const plan = selectCloneEntries(withoutSkillMd, limits)
  return {
    ok: true,
    text,
    body,
    sha256: bodySha256(body),
    plan: {
      ...plan,
      files: [{ path: 'SKILL.md', size: text.length }, ...plan.files],
      bytes: plan.bytes + text.length,
    },
  }
}

/**
 * 写入副本。
 *
 * **不覆盖**靠的是 `mkdir(target, {recursive:false})`：目录已经存在就 EEXIST，
 * 没有"先删后写"这一步，所以既不会覆盖别的 Skill，也不会覆盖自己同事的产物。
 * 中途失败（空间不够、权限不足、某个资源读不出来）时删掉刚建的目录再报错 ——
 * 留下半个 Skill 比复刻失败更糟，DSH 会把它当成一个真的 Skill 列出来。
 */
export async function writeClone({ root, targetName, skillMd, plan, sourceDirectory, mode }) {
  const directory = join(root, targetName)
  try {
    await mkdir(root, { recursive: true })
  } catch (error) {
    return { ok: false, reason: 'root-create-failed', error }
  }
  try {
    await mkdir(directory)
  } catch (error) {
    if (error?.code === 'EEXIST') return { ok: false, reason: 'target-exists', error }
    return { ok: false, reason: 'target-create-failed', error }
  }
  const written = []
  try {
    await writeFile(join(directory, 'SKILL.md'), skillMd, { encoding: 'utf8' })
    written.push('SKILL.md')
    if (mode === 'bundle') {
      for (const file of plan.files) {
        if (file.path === 'SKILL.md') continue
        const source = join(sourceDirectory, file.path)
        const target = resolve(join(directory, file.path))
        // 双保险：计划里已经挡掉了 `..`，但写入前再确认一次目标仍在副本目录内。
        if (!target.startsWith(`${resolve(directory)}${sep}`)) continue
        const bytes = await readFile(source)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, bytes)
        written.push(file.path)
      }
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    return { ok: false, reason: 'write-failed', error }
  }
  return { ok: true, directory, files: written }
}

/** 回读失败或不一致时的回滚：宁可什么都没有，也不要留半个 Skill 在目录里。 */
export async function removeClone({ root, targetName }) {
  await rm(join(root, targetName), { recursive: true, force: true }).catch(() => {})
}

/**
 * 重新读一次源文件并算出正文指纹。
 *
 * 复刻结束后用它证明「源一个字节都没动」—— 这是 §13 的承诺，也是可以当场验证的事实，
 * 而不是写在文档里的一句保证。读不到就返回 `null`，绝不假装没变。
 */
export async function readSkillSourceSha256({ skillFile }) {
  try {
    const text = await readFile(skillFile, 'utf8')
    const split = splitFrontmatter(text)
    if (!split.ok) return null
    return bodySha256(split.body)
  } catch {
    return null
  }
}

/**
 * 读一个 Skill 的 SKILL.md 正文（frontmatter 之后、已 trim）。差异比较要的是**现在**的字节，
 * 不是 registry 里的投影。
 *
 * **取的是正文而不是整份文件**，口径与 registry 的 `SkillDefinition.content` 完全一致：
 * 复刻会把副本 frontmatter 里的 `name:` 改成目标名，如果拿整份文件去比，每一次复刻都会
 * 凭空多出一处「前言被修改」；而且正文的行号也要和详情页既有锚点对得上。
 *
 * 与 `readSkillSourceSha256` 分开，是因为指纹与正文是两件事：指纹用来判断"变没变"，
 * 正文用来判断"哪儿变了"。前者算完就扔，后者要在内存里活到比较结束。
 */
export async function readSkillBody({ skillFile }) {
  let text
  try {
    text = await readFile(skillFile, 'utf8')
  } catch (error) {
    return { ok: false, reason: error?.code === 'ENOENT' ? 'source-file-missing' : 'source-read-failed' }
  }
  const split = splitFrontmatter(text)
  if (!split.ok) return { ok: false, reason: split.reason }
  return { ok: true, body: split.body }
}

/**
 * 读一个 Skill 的 SKILL.md **整份文件**（frontmatter + 正文），供 v0.9.0 的规范验收使用。
 *
 * 为什么不能复用 `readSkillBody`：那条口径（以及 registry 的 `SkillDefinition.content`）**刻意
 * 只给正文**，而验收要判的事实有一多半就在 frontmatter 里 —— `name` 的字符集与长度、
 * `description` 的长度、`compatibility` 的 500 字符上限、重复键、字段大小写。拿正文去判，
 * 每一份真实 Skill 都会得到一句「缺少 frontmatter」（实测：真机上 `content.text` 的第一行就是
 * `# UI Craft`），那是**假指控**，比漏报严重得多。
 *
 * 与 v0.8 的纪律不冲突：它只在内存里活到这次验收结束，不落盘、不进 receipt、不出进程。
 * 读不出来就说读不出来（`{ok:false}`），由调用方降级成「无法判断」，绝不假装。
 */
export async function readSkillFile({ skillFile }) {
  try {
    const text = await readFile(skillFile, 'utf8')
    return { ok: true, text, bytes: Buffer.byteLength(text, 'utf8') }
  } catch (error) {
    return { ok: false, reason: error?.code === 'ENOENT' ? 'source-file-missing' : 'source-read-failed' }
  }
}

/**
 * 列出 Skill 目录里的文件与各自的内容指纹（相对路径，POSIX 分隔）。
 *
 * 与复刻共用同一套遍历，但**不过 `CLONE_MAX_*` 的闸**：那是"能拷多少"的限额，而差异看的是
 * 目录**现在**的样子。一个因为限额没被拷过来的文件，在目标侧本来就不存在 —— 这件事由资源层
 * 的 `cloneMode` 解释（见 `src/core/skill-diff.mjs`），不在这里假装它被删了。
 * 读不出内容的文件（权限、悬空链接）仍然列出来，指纹记 `null`，不假装它不存在。
 */
export async function listSkillFiles(directory) {
  if (typeof directory !== 'string' || !directory) return []
  const entries = await walkBundle(directory)
  const files = []
  for (const entry of entries) {
    if (entry.type !== 'file') continue
    try {
      const bytes = await readFile(join(directory, entry.path))
      files.push({
        path: entry.path,
        sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        bytes: bytes.length,
      })
    } catch {
      files.push({ path: entry.path, sha256: null, bytes: entry.size ?? 0 })
    }
  }
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}

/**
 * 回读副本：SKILL.md 必须存在、frontmatter 里的名字必须是目标名。
 *
 * 这一步是 §十七 的核心 —— "点击成功"不等于成功，只有读回来对得上才算写完。
 */
export async function readBackClone({ root, targetName }) {
  const skillFile = join(root, targetName, 'SKILL.md')
  let text
  try {
    text = await readFile(skillFile, 'utf8')
  } catch {
    return { ok: false, reason: 'read-back-missing' }
  }
  const split = splitFrontmatter(text)
  if (!split.ok) return { ok: false, reason: `read-back-${split.reason}` }
  const nameLine = split.frontmatter.split('\n').find((line) => /^name:\s*/i.test(line)) ?? ''
  const name = nameLine.replace(/^name:\s*/i, '').trim()
  if (name !== targetName) return { ok: false, reason: 'read-back-name-mismatch', name }
  return { ok: true, name, body: split.body }
}
