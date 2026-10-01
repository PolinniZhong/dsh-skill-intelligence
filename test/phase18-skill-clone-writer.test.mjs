import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CLONE_PATH_KINDS, cloneTargetPaths, resolveCloneRoot, skillRootFor } from '../src/core/skill-clone-path.mjs'
import { selectCloneEntries } from '../src/core/skill-clone.mjs'
import {
  bodySha256, cloneTargetTaken, findProjectRoot, probeExistingRoots, probePopulatedRoots,
  readBackClone, readSkillSource, readSkillSourceSha256, removeClone, writeClone,
} from '../src/storage/skill-clone-writer.mjs'

/**
 * v0.7 §十一 / §十六 / §十七：复刻的目录策略与写入策略。
 *
 * 这一层是"复刻"唯一真的动磁盘的地方，所以断言的都是**不可逆的后果**：
 * 覆盖了谁的 Skill、留下了半个目录、把符号链接指到了外面、名字对不上的副本被当成成功。
 * 这四件事任何一件发生，用户都不会当场知道。
 */

const SOURCE = `---
name: ui-craft
description: Use for UI design work
---

# UI Craft

读一遍再写。
`

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), 'skill-clone-'))
  return {
    root,
    async makeBundle(name, files = {}) {
      const directory = join(root, name)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, 'SKILL.md'), SOURCE, 'utf8')
      for (const [path, content] of Object.entries(files)) {
        const target = join(directory, path)
        await mkdir(join(target, '..'), { recursive: true })
        await writeFile(target, content, 'utf8')
      }
      return directory
    },
  }
}

test('the clone root follows the DSH roots on disk, not a directory we invent', () => {
  const projectRoot = '/work/project'
  const dshHome = '/home/me/.dsh'
  const agentsHome = '/home/me/.agents'

  assert.equal(skillRootFor(CLONE_PATH_KINDS.PROJECT_DSH, { projectRoot }), join(projectRoot, '.dsh', 'skills'))
  assert.equal(skillRootFor(CLONE_PATH_KINDS.USER_DSH, { dshHome }), join(dshHome, 'skills'))
  assert.equal(skillRootFor(CLONE_PATH_KINDS.USER_AGENTS, { agentsHome }), join(agentsHome, 'skills'))
  assert.equal(skillRootFor('nonsense', { projectRoot, dshHome }), null)

  // 用户级：已经在用的那个根优先。用户已经把 Skill 放在 ~/.agents/skills，
  // 新复刻的就该写在那儿，而不是在旁边另起一个 ~/.dsh/skills。
  const agentsInUse = resolveCloneRoot({
    scope: 'user', dshHome, agentsHome, existing: [join(agentsHome, 'skills')],
  })
  assert.equal(agentsInUse.kind, CLONE_PATH_KINDS.USER_AGENTS)
  assert.equal(agentsInUse.reason, 'existing-agents-user-root')

  // 两个都在、但只有其中一个**真的装着 Skill** 时，写进有 Skill 的那个。
  // 这台机器上就是这样：~/.dsh/skills 空着，~/.agents/skills 装着用户全部 Skill。
  // 只看"目录在不在"会把复刻写进那个空目录 —— 能被 DSH 发现，却不在用户找得到的地方。
  const both = resolveCloneRoot({
    scope: 'user',
    dshHome,
    agentsHome,
    existing: [join(dshHome, 'skills'), join(agentsHome, 'skills')],
    populated: [join(agentsHome, 'skills')],
  })
  assert.equal(both.kind, CLONE_PATH_KINDS.USER_AGENTS)
  assert.equal(both.reason, 'populated-agents-user-root')

  // 两个都装着 Skill 时才是纯粹的 rank 之争：user-dsh(400) 在 user-agents(500) 之前。
  const bothPopulated = resolveCloneRoot({
    scope: 'user',
    dshHome,
    agentsHome,
    existing: [join(dshHome, 'skills'), join(agentsHome, 'skills')],
    populated: [join(dshHome, 'skills'), join(agentsHome, 'skills')],
  })
  assert.equal(bothPopulated.kind, CLONE_PATH_KINDS.USER_DSH)
  assert.equal(bothPopulated.reason, 'populated-dsh-user-root')

  // 两个都在、但都没装 Skill 时退回"存在的那个根"，仍然按 rank。
  const empty = resolveCloneRoot({
    scope: 'user', dshHome, agentsHome, existing: [join(dshHome, 'skills'), join(agentsHome, 'skills')],
  })
  assert.equal(empty.reason, 'existing-dsh-user-root')

  // 都没建过时用 DSH 原生根，不替用户发明 .agents。
  const neither = resolveCloneRoot({ scope: 'user', dshHome, agentsHome, existing: [] })
  assert.equal(neither.kind, CLONE_PATH_KINDS.USER_DSH)
  assert.equal(neither.reason, 'default-dsh-user-root')

  // 连家目录都推不出来时说"推不出来"，而不是硬编一个路径。
  assert.deepEqual(
    resolveCloneRoot({ scope: 'user', dshHome: null, agentsHome: null, existing: [] }),
    { kind: null, path: null, reason: 'no-user-skill-root' })

  // 项目级：根不存在也要给得出来 —— 它会被创建，这是正常的第一次。
  const fresh = resolveCloneRoot({ scope: 'project', projectRoot, existing: [] })
  assert.equal(fresh.kind, CLONE_PATH_KINDS.PROJECT_DSH)
  assert.equal(fresh.reason, 'project-root-to-create')
  assert.equal(resolveCloneRoot({ scope: 'project', projectRoot: null }).reason, 'no-project-root')

  // 两种落点都算占位：目录 bundle `<name>/` 与扁平 `<name>.md`。
  const paths = cloneTargetPaths('/skills', 'x-custom')
  assert.equal(paths.directory, '/skills/x-custom')
  assert.equal(paths.skillFile, '/skills/x-custom/SKILL.md')
  assert.equal(paths.flatFile, '/skills/x-custom.md')
})

test('a clone never overwrites, and a half-written Skill is removed instead of left behind', async () => {
  const box = await sandbox()
  try {
    const root = join(box.root, 'skills')
    const sourceDirectory = await box.makeBundle('ui-craft', { 'references/tokens.md': 'tokens' })
    const source = await readSkillSource({
      skillFile: join(sourceDirectory, 'SKILL.md'), directory: sourceDirectory, mode: 'bundle', limits: {},
    })
    assert.equal(source.ok, true)
    assert.deepEqual(source.plan.files.map((file) => file.path), ['SKILL.md', 'references/tokens.md'])

    const rewritten = source.text.replace('name: ui-craft', 'name: ui-craft-custom')
    const first = await writeClone({
      root, targetName: 'ui-craft-custom', skillMd: rewritten,
      plan: source.plan, sourceDirectory, mode: 'bundle',
    })
    assert.equal(first.ok, true)
    assert.deepEqual(first.files, ['SKILL.md', 'references/tokens.md'])

    // 原 Skill 一个字节都没动 —— 这是可以当场验证的事实，不是文档里的保证。
    assert.equal(await readSkillSourceSha256({ skillFile: join(sourceDirectory, 'SKILL.md') }), source.sha256)

    // 回读：名字必须是目标名，正文必须读得回来。
    const readBack = await readBackClone({ root, targetName: 'ui-craft-custom' })
    assert.equal(readBack.ok, true)
    assert.equal(readBack.name, 'ui-craft-custom')

    // 再复刻一次同一个名字：必须失败，而且不能把已有的那份改掉。
    const before = await readFile(join(root, 'ui-craft-custom', 'references', 'tokens.md'), 'utf8')
    const second = await writeClone({
      root, targetName: 'ui-craft-custom', skillMd: rewritten.replace('读一遍再写。', '被改掉了。'),
      plan: source.plan, sourceDirectory, mode: 'bundle',
    })
    assert.equal(second.ok, false)
    assert.equal(second.reason, 'target-exists')
    assert.equal(await readFile(join(root, 'ui-craft-custom', 'references', 'tokens.md'), 'utf8'), before,
      'the existing clone is untouched — there is no delete-then-write step')

    // 中途失败：删掉刚建的目录，不留半个 Skill（DSH 会把半个目录当成一个真 Skill 列出来）。
    const broken = {
      files: [{ path: 'SKILL.md', size: 1 }, { path: 'references/missing.md', size: 1 }],
      skipped: [], truncated: false, bytes: 2,
    }
    const failed = await writeClone({
      root, targetName: 'half-custom', skillMd: rewritten, plan: broken, sourceDirectory, mode: 'bundle',
    })
    assert.equal(failed.ok, false)
    assert.equal(failed.reason, 'write-failed')
    await assert.rejects(stat(join(root, 'half-custom')), 'the partial directory is gone')

    // 名字对不上的副本 = 没写成。DSH 认的是 frontmatter 里的 name，不是目录名。
    const wrong = await writeClone({
      root, targetName: 'wrong-custom', skillMd: source.text,
      plan: source.plan, sourceDirectory, mode: 'bundle',
    })
    assert.equal(wrong.ok, true)
    const mismatch = await readBackClone({ root, targetName: 'wrong-custom' })
    assert.equal(mismatch.ok, false)
    assert.equal(mismatch.reason, 'read-back-name-mismatch')

    await removeClone({ root, targetName: 'wrong-custom' })
    await assert.rejects(stat(join(root, 'wrong-custom')), 'rollback removes the copy')
  } finally {
    await rm(box.root, { recursive: true, force: true })
  }
})

test('only SKILL.md is copied when the bundle cannot be vouched for', async () => {
  const box = await sandbox()
  try {
    const sourceDirectory = await box.makeBundle('ui-craft', { 'references/tokens.md': 'tokens', 'scripts/build.sh': 'echo' })
    const source = await readSkillSource({
      skillFile: join(sourceDirectory, 'SKILL.md'), directory: sourceDirectory, mode: 'skill-md', limits: {},
    })
    assert.deepEqual(source.plan.files.map((file) => file.path), ['SKILL.md'],
      'the SKILL.md-only mode promises one file and copies one file')

    const root = join(box.root, 'skills')
    const written = await writeClone({
      root, targetName: 'ui-craft-custom',
      skillMd: source.text.replace('name: ui-craft', 'name: ui-craft-custom'),
      plan: source.plan, sourceDirectory, mode: 'skill-md',
    })
    assert.deepEqual(written.files, ['SKILL.md'])
    await assert.rejects(stat(join(root, 'ui-craft-custom', 'scripts')),
      'the scripts directory is not silently carried over')
  } finally {
    await rm(box.root, { recursive: true, force: true })
  }
})

test('a symlink inside a bundle is never followed into the copy', async () => {
  const box = await sandbox()
  try {
    const sourceDirectory = await box.makeBundle('ui-craft')
    // 一个指向 Skill 目录之外的链接：跟着拷贝就是把别处的文件搬进用户的 Skill。
    await symlink('/etc/hosts', join(sourceDirectory, 'escape.md'))
    const source = await readSkillSource({
      skillFile: join(sourceDirectory, 'SKILL.md'), directory: sourceDirectory, mode: 'bundle', limits: {},
    })
    assert.equal(source.ok, true)
    assert.ok(!source.plan.files.some((file) => file.path === 'escape.md'),
      'the symlink is not in the copy plan')
    assert.ok(source.plan.skipped.some((entry) => entry.path === 'escape.md' && entry.reason === 'symlink'),
      'and the exclusion is recorded with a reason rather than dropped silently')
  } finally {
    await rm(box.root, { recursive: true, force: true })
  }
})

test('a version-control directory is not part of the Skill, so it is not "skipped content"', async () => {
  const box = await sandbox()
  try {
    const sourceDirectory = await box.makeBundle('ui-craft', { 'references/tokens.md': 'tokens\n' })
    // 真机上的触发案例：~/.agents/skills/character-asset-kit 里有一整个 `.git`。
    // 早先它只是被记成 excluded-directory，于是一次复刻报出"跳过 431 个条目" ——
    // 用户看到的是自己九成的 Skill 没拷进去，其实那 387 条是版本库的内部文件。
    await mkdir(join(sourceDirectory, '.git', 'objects'), { recursive: true })
    await writeFile(join(sourceDirectory, '.git', 'config'), '[core]\n', 'utf8')
    await writeFile(join(sourceDirectory, '.git', 'objects', 'ab12'), 'blob\n', 'utf8')
    await mkdir(join(sourceDirectory, 'node_modules', 'left-pad'), { recursive: true })
    await writeFile(join(sourceDirectory, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n', 'utf8')

    const source = await readSkillSource({
      skillFile: join(sourceDirectory, 'SKILL.md'), directory: sourceDirectory, mode: 'bundle', limits: {},
    })
    assert.equal(source.ok, true)
    const paths = [...source.plan.files, ...source.plan.skipped].map((entry) => entry.path)
    assert.ok(!paths.some((path) => path.startsWith('.git/')), 'no .git entry is even listed')
    assert.ok(!paths.some((path) => path.startsWith('node_modules/')), 'no node_modules entry is even listed')
    assert.equal(source.plan.skipped.length, 0, 'nothing is reported as skipped')
    // 该拷的一个都没少：references/ 仍然在清单里。
    assert.ok(source.plan.files.some((file) => file.path === 'references/tokens.md'))

    // 纯函数那一层仍然认得这两种目录（有调用方直接递原始清单）。
    const direct = selectCloneEntries([
      { path: '.git/config', type: 'file', size: 1 },
      { path: 'node_modules/left-pad/index.js', type: 'file', size: 1 },
    ])
    assert.equal(direct.files.length, 0)
    assert.deepEqual(direct.skipped.map((entry) => entry.reason), ['excluded-directory', 'excluded-directory'])
  } finally {
    await rm(box.root, { recursive: true, force: true })
  }
})

test('a target is taken if the catalog or the disk already has that name', async () => {
  const box = await sandbox()
  try {
    const root = join(box.root, 'skills')
    await mkdir(root, { recursive: true })

    const free = await cloneTargetTaken({ registry: null, targetName: 'new-custom', cwd: null, scope: null, root })
    assert.deepEqual(free, { taken: false, where: null })

    await mkdir(join(root, 'dir-custom'))
    assert.deepEqual(await cloneTargetTaken({ registry: null, targetName: 'dir-custom', cwd: null, scope: null, root }),
      { taken: true, where: 'directory' })

    await writeFile(join(root, 'flat-custom.md'), 'x', 'utf8')
    assert.deepEqual(await cloneTargetTaken({ registry: null, targetName: 'flat-custom', cwd: null, scope: null, root }),
      { taken: true, where: 'flat-file' },
    'a flat <name>.md is the same name as far as DSH is concerned')

    // catalog 里已经有的名字也算占位，哪怕磁盘上还看不见（可能是别的 provider 提供的）。
    const registry = { get: async (name) => (name === 'catalog-custom' ? { name } : undefined) }
    assert.deepEqual(await cloneTargetTaken({ registry, targetName: 'catalog-custom', cwd: null, scope: null, root }),
      { taken: true, where: 'catalog' })

    // registry 抛错不能变成"名字可用"。
    const angry = { get: async () => { throw new Error('registry down') } }
    assert.deepEqual(await cloneTargetTaken({ registry: angry, targetName: 'quiet-custom', cwd: null, scope: null, root }),
      { taken: false, where: null })
  } finally {
    await rm(box.root, { recursive: true, force: true })
  }
})

test('the project root is the nearest ancestor with a .git, and probing reports only real roots', async () => {
  const box = await sandbox()
  try {
    const project = join(box.root, 'project')
    const nested = join(project, 'packages', 'app')
    await mkdir(join(project, '.git'), { recursive: true })
    await mkdir(nested, { recursive: true })
    assert.equal(await findProjectRoot(nested), project, 'the walk finds the .git ancestor')
    assert.equal(await findProjectRoot(project), project)

    const existing = await probeExistingRoots([join(project, '.dsh', 'skills'), project, null, join(box.root, 'nope')])
    assert.deepEqual(existing, [project], 'only directories that exist are reported')

    // 「存在」与「已经在用」是两件事：一个空目录不算用户在用 Skill 的地方。
    const inUse = join(box.root, 'agents-skills')
    const idle = join(box.root, 'dsh-skills')
    await mkdir(join(inUse, 'ui-craft'), { recursive: true })
    await mkdir(idle, { recursive: true })
    await writeFile(join(inUse, 'ui-craft', 'SKILL.md'), '---\nname: ui-craft\n---\n\nx\n', 'utf8')
    await writeFile(join(inUse, 'flat-skill.md'), '---\nname: flat-skill\n---\n\nx\n', 'utf8')
    assert.deepEqual(await probePopulatedRoots([idle, inUse, null, join(box.root, 'ghost')]), [inUse])

    // 只放一个 README 的目录不算 —— 探测的是 DSH 认得的落点，不是"里面有文件"。
    const notes = join(box.root, 'notes')
    await mkdir(notes, { recursive: true })
    await writeFile(join(notes, 'README.md'), '# notes\n', 'utf8')
    assert.deepEqual(await probePopulatedRoots([notes]), [])

    // 一个都不存在时返回起点自己，而不是 null —— 调用方宁可有路径也不要有空值。
    const orphan = join(box.root, 'orphan')
    await mkdir(orphan, { recursive: true })
    assert.equal(await findProjectRoot(orphan), orphan)
  } finally {
    await rm(box.root, { recursive: true, force: true })
  }
})

test('a source that cannot be read is a named failure, never an empty success', async () => {
  const box = await sandbox()
  try {
    const missing = await readSkillSource({
      skillFile: join(box.root, 'nope', 'SKILL.md'), directory: join(box.root, 'nope'), mode: 'skill-md', limits: {},
    })
    assert.equal(missing.ok, false)
    assert.equal(missing.reason, 'source-file-missing')
    assert.equal(await readSkillSourceSha256({ skillFile: join(box.root, 'nope', 'SKILL.md') }), null)

    // 没有 frontmatter 的文件不是 Skill，读它必须失败而不是"拷过去再说"。
    const plain = join(box.root, 'plain.md')
    await writeFile(plain, '# 只有正文\n', 'utf8')
    const noFrontmatter = await readSkillSource({ skillFile: plain, directory: box.root, mode: 'skill-md', limits: {} })
    assert.equal(noFrontmatter.ok, false)
    assert.equal(noFrontmatter.reason, 'missing-frontmatter')

    // 指纹口径与 skill-definition 一致：对**正文**取 sha256。
    assert.equal(bodySha256('abc'), `sha256:${'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}`)
  } finally {
    await rm(box.root, { recursive: true, force: true })
  }
})
