import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { apply } from '../src/dsh/host/index.js'
import { buildLineageRecord } from '../src/core/skill-lineage.mjs'
import { splitFrontmatter } from '../src/core/skill-clone.mjs'
import { createSkillLineageStore } from '../src/storage/skill-lineage-store.mjs'

/**
 * v0.8 §17.5：`GET /skill-trace/diff`。
 *
 * 这里驱动的是一台真的宿主：真的注册路由、真的回 registry、真的读磁盘上的两个 Skill 目录。
 * 最重要的是**来源变化不是错误**这条断言 —— 复刻遇到源变了要 `409` 拒绝，因为它会把一个
 * 混合体落进目录；差异什么都不写，源动过恰好是它要说出来的那件事，所以必须是 `200`。
 * 两条路对同一个事实给出相反的状态码，写反了用户就会以为"比较失败了"。
 */

const SESSION_ID = 'session-diff-routes'

const SOURCE_MD = `---
name: ui-craft
description: Use for UI design work
---

# UI Craft

读一遍再写。

## Rules
- Be precise
- Prefer contrast

## Workflow
1. Read
2. Write
`

/** 副本比来源多一条规则：内容层必须报「修改」，而不是整篇重写。 */
const TARGET_MD = `---
name: ui-craft-custom
description: Use for UI design work
---

# UI Craft

读一遍再写。

## Rules
- Be precise
- Prefer contrast
- Always check the token table

## Workflow
1. Read
2. Write
`

function bodyOf(text) {
  const split = splitFrontmatter(text)
  assert.ok(split.ok)
  return split.body
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function skillDefinition({ name, path, content }) {
  return {
    name,
    description: 'Use for UI design work',
    whenToUse: null,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'custom',
    provider: 'filesystem',
    path,
    resourceBase: { kind: 'directory', path: dirname(path) },
    content,
    metadata: null,
  }
}

/**
 * 一个真的工作区：来源 Skill、复刻出来的副本、两边各自的资源文件。
 *
 * 资源刻意造成四种状态都出现 —— `references/tokens.md` 两边都有但内容不同（修改）、
 * `notes.md` 只在副本里（新增）、`legacy.md` 只在来源里（删除）。
 */
async function makeWorld() {
  const root = await mkdtemp(join(tmpdir(), 'st-diff-routes-'))
  const source = join(root, 'source', 'ui-craft')
  const target = join(root, 'target', 'ui-craft-custom')
  const other = join(root, 'other', 'other-ui')
  await mkdir(join(source, 'references'), { recursive: true })
  await mkdir(join(target, 'references'), { recursive: true })
  await mkdir(other, { recursive: true })
  await writeFile(join(source, 'SKILL.md'), SOURCE_MD, 'utf8')
  await writeFile(join(source, 'references', 'tokens.md'), 'source tokens\n', 'utf8')
  await writeFile(join(source, 'legacy.md'), 'old notes\n', 'utf8')
  await writeFile(join(target, 'SKILL.md'), TARGET_MD, 'utf8')
  await writeFile(join(target, 'references', 'tokens.md'), 'custom tokens\n', 'utf8')
  await writeFile(join(target, 'notes.md'), 'mine\n', 'utf8')
  await writeFile(join(other, 'SKILL.md'), SOURCE_MD.replace('name: ui-craft', 'name: other-ui'), 'utf8')
  await writeFile(join(other, 'shared-legacy.md'), 'other notes\n', 'utf8')
  return { root, source, target, other }
}

/** 只认识给定名字的 registry；名字不在表里就当作"这个 Skill 现在读不到"。 */
function registryFor(world, names) {
  return {
    async get(name) {
      if (!names.includes(name)) return undefined
      const file = name === 'ui-craft'
        ? join(world.source, 'SKILL.md')
        : name === 'other-ui' ? join(world.other, 'SKILL.md') : join(world.target, 'SKILL.md')
      const text = await readFile(file, 'utf8')
      return skillDefinition({ name, path: file, content: bodyOf(text) })
    },
  }
}

function createHost({ dataRoot, cwd, registry }) {
  const routes = []
  const webCtx = {
    on() { return () => {} },
    get(name) { return name === 'skills' ? registry : undefined },
    effect(setup) { setup(); return () => {} },
    webServer: { register(route) { routes.push(route); return () => {} } },
    sessions: { get: (sessionId) => (sessionId === SESSION_ID ? { id: sessionId, header: { cwd } } : null) },
    agents: { get: () => null },
  }
  apply({ inject(_names, callback) { callback(webCtx) } }, { dataRoot })
  return routes
}

async function call(route, { method, url, body, address = '127.0.0.1' }) {
  let status = 0
  let payload = ''
  const res = { writeHead(code) { status = code }, end(value) { payload = value } }
  const request = { method, url, socket: { remoteAddress: address } }
  if (body !== undefined) {
    request[Symbol.asyncIterator] = async function* iterate() { yield Buffer.from(JSON.stringify(body), 'utf8') }
  } else {
    request[Symbol.asyncIterator] = async function* iterate() {}
  }
  await route.handler(request, res)
  return { status, payload: payload ? JSON.parse(payload) : null }
}

/**
 * 起一台宿主，并把血缘记录直接写进 store。
 *
 * 不在这里再驱动一次 `POST /clone`：`test/phase18-clone-routes.test.mjs` 已经证明复刻成功
 * 会写下这条记录、失败一条都不留。这里要测的是**读差异**，所以从"记录已经在盘上"开始。
 */
async function setup({ names = ['ui-craft', 'ui-craft-custom', 'other-ui'], sourceSha } = {}) {
  const world = await makeWorld()
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-diff-data-'))
  const store = createSkillLineageStore(join(dataRoot, 'lineage'))
  const original = sourceSha ?? sha256(bodyOf(SOURCE_MD))
  await store.write(buildLineageRecord({
    sourceSkillName: 'ui-craft',
    sourceSourceSha256: original,
    targetSkillName: 'ui-craft-custom',
    cloneMode: 'bundle',
    targetScope: 'project',
    catalogObservation: 'observed',
    now: 1_700_000_000_000,
  }))
  const routes = createHost({ dataRoot, cwd: join(world.root, 'project'), registry: registryFor(world, names) })
  return {
    world,
    dataRoot,
    original,
    route: routes[0],
    url: (extra = '') => `/skill-trace/diff?sessionId=${SESSION_ID}&skillName=ui-craft-custom${extra}`,
    async cleanup() {
      await rm(world.root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    },
  }
}

test('a Skill this plugin never cloned has no source to compare against', async (t) => {
  const ctx = await setup()
  t.after(() => ctx.cleanup())
  // 把记录删掉：这就是"用户自己复制的 Skill"在事实上的样子。
  await createSkillLineageStore(join(ctx.dataRoot, 'lineage')).delete('ui-craft-custom')
  const { status, payload } = await call(ctx.route, { method: 'GET', url: ctx.url() })
  assert.equal(status, 404)
  assert.equal(payload.code, 'no-lineage')
  assert.equal(payload.error, '这个 Skill 不是由本插件复刻出来的，没有可以比较的来源。')
})

test('a request without a session is refused with a sentence, not a field name', async (t) => {
  const ctx = await setup()
  t.after(() => ctx.cleanup())
  const { status, payload } = await call(ctx.route, { method: 'GET', url: '/skill-trace/diff?skillName=ui-craft-custom' })
  assert.equal(status, 400)
  assert.equal(payload.code, 'invalid-request')
  assert.match(payload.error, /会话标识/)
})

test('an unknown target is a 404, not an empty comparison', async (t) => {
  const ctx = await setup({ names: ['ui-craft'] })
  t.after(() => ctx.cleanup())
  const { status, payload } = await call(ctx.route, { method: 'GET', url: ctx.url() })
  assert.equal(status, 404)
  assert.equal(payload.code, 'unknown-skill')
  assert.match(payload.error, /找不到 Skill「ui-craft-custom」/)
})

test('the comparison answers in three layers and never leaks a path', async (t) => {
  const ctx = await setup()
  t.after(() => ctx.cleanup())
  const { status, payload } = await call(ctx.route, { method: 'GET', url: ctx.url() })

  assert.equal(status, 200)
  assert.equal(payload.against, 'ui-craft')
  assert.equal(payload.lineage.sourceSkillName, 'ui-craft')
  assert.equal(payload.lineage.cloneMode, 'bundle')
  assert.equal(payload.comparison.status, 'changed')
  assert.equal(payload.comparison.source.changed, false)

  // 结构层：加了内容但没加小节，`Rules` 是「修改」而不是「重写」。
  const rules = payload.structure.sections.find((section) => section.title === 'Rules')
  assert.equal(rules.status, 'modified')
  assert.ok(rules.changed.includes('items'))
  assert.equal(rules.anchorId, 'rules')

  // 内容层给的是行，且行号指得回正文里的绝对位置。
  const rulesContent = payload.content.sections.find((section) => section.title === 'Rules')
  assert.equal(rulesContent.status, 'modified')
  assert.ok(rulesContent.lines.some((line) => line.kind === 'added' && line.targetLine !== null))
  // 行号的口径是**正文**（frontmatter 之后），跟详情页渲染的那份正文对得上 ——
  // 拿整份文件去算，这里会整体偏移 frontmatter 那几行，界面跳锚就会跳到别的段落。
  assert.equal(rulesContent.targetLine, 5)
  assert.equal(rulesContent.lines.at(-1).targetLine, 8)
  // 唯一一处真的改动就是这条规则。复刻会把副本 frontmatter 里的 `name:` 改成目标名，
  // 如果拿整份文件去比，这里会凭空多出一处「前言被修改」—— 那不是用户改的。
  assert.deepEqual(
    payload.content.sections.filter((section) => section.status !== 'unchanged').map((section) => section.title),
    ['Rules'],
  )

  // 资源层四种状态都出现，`SKILL.md` 永远不在里面（正文归内容层）。
  assert.equal(payload.resources.mode, 'bundle')
  const byPath = new Map(payload.resources.entries.map((entry) => [entry.path, entry.status]))
  assert.equal(byPath.get('references/tokens.md'), 'modified')
  assert.equal(byPath.get('notes.md'), 'added')
  assert.equal(byPath.get('legacy.md'), 'removed')
  assert.ok(!payload.resources.entries.some((entry) => /^skill\.md$/i.test(entry.path)))
  // 「来源有、副本没有」在整包复刻下有两种来历，必须把不确定说出来。
  assert.ok(payload.comparison.limitations.includes('resource-differences-may-come-from-a-truncated-clone'))

  // 绝对路径一个都不许出网。
  const serialized = JSON.stringify(payload)
  assert.ok(!serialized.includes(ctx.world.root), 'the response must not contain an absolute path')
})

test('a source that moved after the clone is a fact, not a failed request', async (t) => {
  const ctx = await setup()
  t.after(() => ctx.cleanup())
  // 复刻之后用户又改了来源一次。
  await writeFile(join(ctx.world.source, 'SKILL.md'), SOURCE_MD.replace('- Be precise', '- Be precise and kind'), 'utf8')

  const { status, payload } = await call(ctx.route, { method: 'GET', url: ctx.url() })
  assert.equal(status, 200, 'source drift must not fail the request — nothing is written here')
  assert.equal(payload.comparison.source.changed, true)
  assert.equal(payload.comparison.source.originalSha256, ctx.original)
  assert.notEqual(payload.comparison.source.currentSha256, ctx.original)
  // 两层事实互不冒充：来源动过，但"两侧现在是否不同"仍由差异本身回答。
  assert.equal(payload.comparison.status, 'changed')
})

test('a source that cannot be read is unavailable — never "no changes"', async (t) => {
  const ctx = await setup({ names: ['ui-craft-custom'] })
  t.after(() => ctx.cleanup())
  const { status, payload } = await call(ctx.route, { method: 'GET', url: ctx.url() })

  assert.equal(status, 200)
  assert.equal(payload.comparison.status, 'unavailable')
  assert.equal(payload.comparison.source.available, false)
  assert.equal(payload.comparison.source.changed, null)
  for (const layer of [payload.structure, payload.content, payload.resources]) {
    assert.equal(layer.status, 'unavailable')
    assert.equal(layer.counts.unchanged, 0)
  }
  assert.ok(payload.comparison.limitations.includes('source-unavailable'))
})

test('a comparison that is not against the recorded source admits what it cannot know', async (t) => {
  const ctx = await setup()
  t.after(() => ctx.cleanup())

  // 与记录里的直接来源比：指纹与复刻模式都是已知的。
  const direct = await call(ctx.route, { method: 'GET', url: ctx.url('&against=ui-craft') })
  assert.equal(direct.status, 200)
  assert.equal(direct.payload.comparison.source.changed, false)
  assert.equal(direct.payload.comparison.limitations.includes('clone-mode-unknown-for-this-comparison'), false)

  // 与另一个 Skill 比：没有任何事实能说明当初是怎么复刻的。
  const other = await call(ctx.route, { method: 'GET', url: ctx.url('&against=other-ui') })
  assert.equal(other.status, 200)
  assert.equal(other.payload.against, 'other-ui')
  assert.equal(other.payload.comparison.source.changed, null, 'there is no original fingerprint for this pair — say unknown')
  const otherPaths = new Map(other.payload.resources.entries.map((entry) => [entry.path, entry.status]))
  assert.equal(otherPaths.get('shared-legacy.md'), 'removed')
  assert.ok(other.payload.comparison.limitations.includes('clone-mode-unknown-for-this-comparison'))

  // 把目标自己当比较对象：没有「来源」可言，但也不能说成「没有变化」。
  const self = await call(ctx.route, { method: 'GET', url: ctx.url('&against=ui-craft-custom') })
  assert.equal(self.status, 200)
  assert.equal(self.payload.comparison.status, 'unavailable')
  assert.equal(self.payload.structure.status, 'unavailable')
})
