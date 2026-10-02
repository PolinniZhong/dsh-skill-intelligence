import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../src/dsh/host/index.js'
import { createTranslationStore } from '../src/storage/translation-store.mjs'

/**
 * v0.7 §二十七–§二十九：三条新宿主路由。
 *
 * 这里驱动的是一台真的宿主：真的注册路由、真的读请求体、真的写盘。断言的都是
 * **界面即将照抄的那句话**对不对 —— 409 是"源变了"还是"名字被占了"，直接决定
 * 用户接下来该改名字还是该重新翻译；说反了比报错更糟。
 */

const SESSION_ID = 'session-clone-routes'
const SOURCE_TEXT = `---
name: ui-craft
description: Use for UI design work
---

# UI Craft

读一遍再写。
`

/**
 * `SkillDefinition.content` 是 frontmatter **之后**的正文（`parseSkillFile` 会对它 trim），
 * 不是整份文件 —— 指纹口径必须跟它一致，否则第一次校验就会把没变过的源报成"已经变化"。
 */
const SOURCE_BODY = '# UI Craft\n\n读一遍再写。'

function skillDefinition({ name, path, resourceBase }) {
  return {
    name,
    description: 'Use for UI design work',
    whenToUse: null,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'custom',
    provider: 'filesystem',
    path,
    resourceBase,
    content: SOURCE_BODY,
    metadata: null,
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

async function makeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), 'st-clone-routes-'))
  const project = join(root, 'project')
  const source = join(root, 'source', 'ui-craft')
  await mkdir(join(project, '.git'), { recursive: true })
  await mkdir(join(source, 'references'), { recursive: true })
  await writeFile(join(source, 'SKILL.md'), SOURCE_TEXT, 'utf8')
  await writeFile(join(source, 'references', 'tokens.md'), 'tokens\n', 'utf8')
  return { root, project, source }
}

function fakeRegistry(source) {
  return {
    async get(name) {
      if (name !== 'ui-craft') return undefined
      return skillDefinition({ name, path: join(source, 'SKILL.md'), resourceBase: { kind: 'directory', path: source } })
    },
  }
}

test('the reading version is written once and read back without a session', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-clone-routes-'))
  const workspace = await makeWorkspace()
  try {
    const routes = createHost({ dataRoot, cwd: workspace.project, registry: fakeRegistry(workspace.source) })
    const route = routes[0]
    const sha = JSON.parse(await readFile(join(dataRoot, 'receipts', 'x.json'), 'utf8').catch(() => '{}'))
    void sha

    // 直接以宿主自己的 store 落一份译文 —— POST /translate 需要模型，这里测的是
    // 读写那两条路由，不是翻译本身。
    const store = createTranslationStore(join(dataRoot, 'translations'))
    await store.write({
      skillName: 'ui-craft',
      sourceSha256: `sha256:${'a'.repeat(64)}`,
      targetLanguage: 'zh-CN',
      translation: '# UI Craft\n\n读一遍再写。\n',
      chunkCount: 1,
      fallbackChunks: 0,
      fallbackReasons: [],
      model: 'provider/model',
      truncated: false,
    })

    const key = `skillName=ui-craft&sourceSha256=${encodeURIComponent(`sha256:${'a'.repeat(64)}`)}&targetLanguage=zh-CN`
    const hit = await call(route, { method: 'GET', url: `/skill-trace/translation?${key}` })
    assert.equal(hit.status, 200)
    assert.equal(hit.payload.translation.translation, '# UI Craft\n\n读一遍再写。\n')

    // 指纹对不上就是"没有" —— 旧译文绝不冒充当前版本。
    const stale = await call(route, {
      method: 'GET',
      url: `/skill-trace/translation?skillName=ui-craft&sourceSha256=${encodeURIComponent(`sha256:${'b'.repeat(64)}`)}&targetLanguage=zh-CN`,
    })
    assert.equal(stale.status, 200)
    assert.equal(stale.payload.translation, null, 'a hash mismatch reads as absent, never as a stale translation')

    // 删除精确到三个字段：换一个语言不能把别的语言的译文删掉。
    const wrongLanguage = await call(route, {
      method: 'DELETE',
      url: `/skill-trace/translation?skillName=ui-craft&sourceSha256=${encodeURIComponent(`sha256:${'a'.repeat(64)}`)}&targetLanguage=ja`,
    })
    assert.equal(wrongLanguage.payload.deleted, false)
    assert.ok(await store.read({ skillName: 'ui-craft', sourceSha256: `sha256:${'a'.repeat(64)}`, targetLanguage: 'zh-CN' }))

    const deleted = await call(route, { method: 'DELETE', url: `/skill-trace/translation?${key}` })
    assert.equal(deleted.payload.deleted, true)
    assert.equal(await store.read({ skillName: 'ui-craft', sourceSha256: `sha256:${'a'.repeat(64)}`, targetLanguage: 'zh-CN' }), null)

    // 参数错了要在 400 这一档，不能掉进 500。
    const badSha = await call(route, { method: 'GET', url: '/skill-trace/translation?skillName=ui-craft&sourceSha256=nope' })
    assert.equal(badSha.status, 400)
  } finally {
    await rm(dataRoot, { recursive: true, force: true })
    await rm(workspace.root, { recursive: true, force: true })
  }
})

test('a clone writes the Skill, proves the source did not move, and never returns a path', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-clone-routes-'))
  const workspace = await makeWorkspace()
  try {
    const routes = createHost({ dataRoot, cwd: workspace.project, registry: fakeRegistry(workspace.source) })
    const route = routes[0]
    const sourceSha = await import('../src/storage/skill-clone-writer.mjs')
      .then((module) => module.readSkillSourceSha256({ skillFile: join(workspace.source, 'SKILL.md') }))

    const body = {
      sessionId: SESSION_ID,
      sourceSkillName: 'ui-craft',
      sourceSha256: sourceSha,
      targetSkillName: 'ui-craft-custom',
      targetScope: 'project',
      cloneMode: 'bundle',
    }
    const clone = await call(route, { method: 'POST', url: '/skill-trace/clone', body })
    assert.equal(clone.status, 200, JSON.stringify(clone.payload))
    assert.equal(clone.payload.ok, true)
    assert.equal(clone.payload.skillName, 'ui-craft-custom')
    assert.equal(clone.payload.scope, 'project')
    assert.equal(clone.payload.pathKind, 'project-dsh')
    assert.equal(clone.payload.mode, 'bundle')
    assert.equal(clone.payload.verified, true)
    assert.equal(clone.payload.sourceUnchanged, true, 'the source is re-read and reported, not assumed')
    assert.equal(clone.payload.invocation, '/ui-craft-custom')

    // 界面照抄这句话，所以它必须是观察到的结果，而不是承诺。
    assert.equal(clone.payload.discovered, false,
      'the fake registry never learns the new name, so discovery must be reported as not observed')
    assert.ok(clone.payload.limitations.includes('catalog-refresh-not-observed'))
    assert.ok(!clone.payload.limitations.includes('lineage-not-recorded'),
      '血缘写成功了，界面就不该看到「没记上」')

    // 全文里不许出现任何绝对路径。
    assert.ok(!JSON.stringify(clone.payload).includes(workspace.root),
      'no absolute path leaves the host, in any field')

    // 盘上真的有一份，名字被改成了目标名，而源一个字节都没动。
    const written = await readFile(join(workspace.project, '.dsh', 'skills', 'ui-craft-custom', 'SKILL.md'), 'utf8')
    assert.ok(written.includes('name: ui-craft-custom'))
    assert.equal(await readFile(join(workspace.source, 'SKILL.md'), 'utf8'), SOURCE_TEXT)
    assert.equal(await readFile(join(workspace.project, '.dsh', 'skills', 'ui-craft-custom', 'references', 'tokens.md'), 'utf8'), 'tokens\n')

    // 再复刻一次同名 → 409，且说的是"名字被占了"。
    const again = await call(route, { method: 'POST', url: '/skill-trace/clone', body })
    assert.equal(again.status, 409)
    assert.equal(again.payload.code, 'target-exists')
    assert.ok(again.payload.error.includes('已存在'))

    // 指纹对不上 → 409 source-changed，且带上当前指纹，让界面能说清发生了什么。
    const changed = await call(route, {
      method: 'POST',
      url: '/skill-trace/clone',
      body: { ...body, targetSkillName: 'another-custom', sourceSha256: `sha256:${'c'.repeat(64)}` },
    })
    assert.equal(changed.status, 409)
    assert.equal(changed.payload.code, 'source-changed')
    assert.equal(changed.payload.currentSha256, sourceSha)

    // 名字不合法 → 400，而且用的是 DSH 的名字文法（不是宿主那条更宽松的）。
    const badName = await call(route, {
      method: 'POST', url: '/skill-trace/clone', body: { ...body, targetSkillName: 'UI_Craft' },
    })
    assert.equal(badName.status, 400)

    const sameName = await call(route, {
      method: 'POST', url: '/skill-trace/clone', body: { ...body, targetSkillName: 'ui-craft' },
    })
    assert.equal(sameName.status, 400, '复刻成自己不是复刻')

    // 源不存在 → 404 档的语义用 422 表达（定义读不出来），且文案不是裸错误码。
    const missing = await call(route, {
      method: 'POST', url: '/skill-trace/clone', body: { ...body, sourceSkillName: 'no-such-skill', targetSkillName: 'x-custom' },
    })
    assert.equal(missing.status, 422)
    assert.ok(missing.payload.error.length > 8, 'the error tells the user what happened')

    // --- v0.8 血缘：只有这一次**成功的**复刻留下记录，失败那几次一条都不加 ---------------
    const { createSkillLineageStore } = await import('../src/storage/skill-lineage-store.mjs')
    const lineageStore = createSkillLineageStore(join(dataRoot, 'lineage'))
    const list = await lineageStore.list()
    assert.equal(list.records.length, 1, '三场失败（同名、指纹不对、源不存在）都不该留下血缘')
    assert.deepEqual(list.records.map((entry) => entry.targetSkillName), ['ui-craft-custom'])

    const lineage = await lineageStore.read('ui-craft-custom')
    assert.equal(lineage.sourceSkillName, 'ui-craft')
    assert.equal(lineage.sourceSourceSha256, sourceSha, '记的是当初复制的那一版，不是来源现在的样子')
    assert.equal(lineage.cloneMode, 'bundle')
    assert.equal(lineage.targetScope, 'project')
    assert.equal(lineage.catalogObservation, 'pending',
      'registry 没观察到就得如实记 pending，不能假装 observed')
    assert.ok(!JSON.stringify(lineage).includes(workspace.root), '血缘里同样不许出现绝对路径')

    // 详情接口把血缘随 skill 一起回 —— 不另开路由。
    const detail = await call(route, {
      method: 'GET', url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=ui-craft-custom`,
    })
    assert.equal(detail.status, 200, JSON.stringify(detail.payload))
    assert.equal(detail.payload.skill.lineage.sourceSkillName, 'ui-craft')
    assert.equal(detail.payload.skill.lineage.targetSkillName, 'ui-craft-custom')
    assert.ok(!JSON.stringify(detail.payload).includes(dataRoot))

    // 来源自己没有血缘：它本来就不是复刻出来的。手动复制与自建在事实上是同一件事。
    const sourceDetail = await call(route, {
      method: 'GET', url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=ui-craft`,
    })
    assert.equal(sourceDetail.payload.skill.lineage, null)
  } finally {
    await rm(dataRoot, { recursive: true, force: true })
    await rm(workspace.root, { recursive: true, force: true })
  }
})

test('a bundle that cannot be vouched for says so instead of quietly copying only SKILL.md', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-clone-routes-'))
  const workspace = await makeWorkspace()
  try {
    // 扁平文件形态：`resourceBase.path` 指向 skills 根目录本身，不是这个 Skill 的目录。
    const flat = join(workspace.root, 'flat', 'ui-craft.md')
    await mkdir(join(workspace.root, 'flat'), { recursive: true })
    await writeFile(flat, SOURCE_TEXT, 'utf8')
    const registry = {
      async get(name) {
        if (name !== 'ui-craft') return undefined
        return skillDefinition({ name, path: flat, resourceBase: { kind: 'directory', path: join(workspace.root, 'flat') } })
      },
    }
    const routes = createHost({ dataRoot, cwd: workspace.project, registry })
    const sourceSha = await import('../src/storage/skill-clone-writer.mjs')
      .then((module) => module.readSkillSourceSha256({ skillFile: flat }))

    const denied = await call(routes[0], {
      method: 'POST',
      url: '/skill-trace/clone',
      body: {
        sessionId: SESSION_ID, sourceSkillName: 'ui-craft', sourceSha256: sourceSha,
        targetSkillName: 'ui-craft-custom', targetScope: 'project', cloneMode: 'bundle',
      },
    })
    assert.equal(denied.status, 422)
    assert.equal(denied.payload.code, 'bundle-unreadable')
    assert.equal(denied.payload.availableMode, 'skill-md')
    assert.ok(denied.payload.error.includes('仅 SKILL.md'),
      'the error names the way out, not just the failure')

    // 改选「仅 SKILL.md」就能成，并且只写一个文件。
    const ok = await call(routes[0], {
      method: 'POST',
      url: '/skill-trace/clone',
      body: {
        sessionId: SESSION_ID, sourceSkillName: 'ui-craft', sourceSha256: sourceSha,
        targetSkillName: 'ui-craft-custom', targetScope: 'project', cloneMode: 'skill-md',
      },
    })
    assert.equal(ok.status, 200, JSON.stringify(ok.payload))
    assert.equal(ok.payload.mode, 'skill-md')
    assert.equal(ok.payload.fileCount, 1)
  } finally {
    await rm(dataRoot, { recursive: true, force: true })
    await rm(workspace.root, { recursive: true, force: true })
  }
})

test('a user-scope clone lands in the user Skill root that is already in use', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-clone-routes-'))
  const workspace = await makeWorkspace()
  const home = await mkdtemp(join(tmpdir(), 'st-clone-home-'))
  const previous = { DSH_HOME: process.env.DSH_HOME, DSH_AGENTS_HOME: process.env.DSH_AGENTS_HOME }
  try {
    process.env.DSH_HOME = join(home, '.dsh')
    process.env.DSH_AGENTS_HOME = join(home, '.agents')
    // 用户已经在用 ~/.agents/skills —— 新的就该写在旁边，而不是另起 ~/.dsh/skills。
    await mkdir(join(home, '.agents', 'skills'), { recursive: true })
    const routes = createHost({ dataRoot, cwd: workspace.project, registry: fakeRegistry(workspace.source) })
    const sourceSha = await import('../src/storage/skill-clone-writer.mjs')
      .then((module) => module.readSkillSourceSha256({ skillFile: join(workspace.source, 'SKILL.md') }))

    const result = await call(routes[0], {
      method: 'POST',
      url: '/skill-trace/clone',
      body: {
        sessionId: SESSION_ID, sourceSkillName: 'ui-craft', sourceSha256: sourceSha,
        targetSkillName: 'ui-craft-custom', targetScope: 'user', cloneMode: 'skill-md',
      },
    })
    assert.equal(result.status, 200, JSON.stringify(result.payload))
    assert.equal(result.payload.pathKind, 'user-agents')
    assert.equal(result.payload.scope, 'user')
    const written = await readFile(join(home, '.agents', 'skills', 'ui-craft-custom', 'SKILL.md'), 'utf8')
    assert.ok(written.includes('name: ui-craft-custom'))
    await assert.rejects(readFile(join(home, '.dsh', 'skills', 'ui-craft-custom', 'SKILL.md'), 'utf8'),
      'nothing is written to the root the user is not using')
  } finally {
    if (previous.DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous.DSH_HOME
    if (previous.DSH_AGENTS_HOME === undefined) delete process.env.DSH_AGENTS_HOME
    else process.env.DSH_AGENTS_HOME = previous.DSH_AGENTS_HOME
    await rm(dataRoot, { recursive: true, force: true })
    await rm(workspace.root, { recursive: true, force: true })
    await rm(home, { recursive: true, force: true })
  }
})

test('a request from anywhere but this machine is refused before it reaches a Skill', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-clone-routes-'))
  const workspace = await makeWorkspace()
  try {
    const routes = createHost({ dataRoot, cwd: workspace.project, registry: fakeRegistry(workspace.source) })
    const denied = await call(routes[0], {
      method: 'POST', url: '/skill-trace/clone', address: '10.0.0.7',
      body: { sessionId: SESSION_ID, sourceSkillName: 'ui-craft', sourceSha256: `sha256:${'a'.repeat(64)}`, targetSkillName: 'x-custom' },
    })
    assert.equal(denied.status, 403)

    const deniedRead = await call(routes[0], {
      method: 'GET', url: '/skill-trace/translation?skillName=ui-craft&sourceSha256=sha256%3A' + 'a'.repeat(64), address: '10.0.0.7',
    })
    assert.equal(deniedRead.status, 403)
  } finally {
    await rm(dataRoot, { recursive: true, force: true })
    await rm(workspace.root, { recursive: true, force: true })
  }
})
