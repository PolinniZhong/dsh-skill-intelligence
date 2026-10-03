import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { apply } from '../src/dsh/host/index.js'
import { splitFrontmatter } from '../src/core/skill-clone.mjs'
import { buildLineageRecord } from '../src/core/skill-lineage.mjs'
import { createSkillLineageStore } from '../src/storage/skill-lineage-store.mjs'
import { MODIFICATION_SOURCE_KIND } from '../src/core/skill-modification.mjs'

/**
 * v0.9.1：「交给 Agent」这条路由的两半 —— `begin`（记快照 + 派发）与 `compare`（对比 + 验收）。
 *
 * 为什么要起一台真宿主来测：协议正文、消息正文、行级对比都是纯函数，
 * `test/skill-modification.test.mjs` 与 `test/modification-snapshot-store.test.mjs` 已经把
 * 它们逐条钉住了。这里测的是**缝**：
 *
 * 1. 那条送给 Agent 的消息到底长什么样、`source.kind` 对不对 —— 它决定运行记录里能不能认出
 *    这条消息不是用户手打的。
 * 2. 「插件不写文件」是不是真的：整轮 begin → compare 跑完，磁盘上的 SKILL.md 必须一个字节都没变。
 * 3. 快照是不是真的只在内存里活着，而且**对比完就释放**。
 * 4. 失败路径不许派发（没有 Agent、意图为空、读不到文件）—— 「先发消息再检查」会留下一份
 *    没有对应修改的「改前」，界面就会以为改完了。
 */

const SESSION_ID = 'session-modification-route'

const SKILL_MD = `---
name: ui-craft
description: Use this when a page needs visual polish or a design decision.
---

# UI Craft

## Rules
- Be precise

## Workflow
1. Read
2. Write

See [the token table](references/tokens.md).
`

async function makeWorld() {
  const root = await mkdtemp(join(tmpdir(), 'st-modification-route-'))
  const skillDir = join(root, 'project', 'ui-craft')
  await mkdir(join(skillDir, 'references'), { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), SKILL_MD, 'utf8')
  await writeFile(join(skillDir, 'references', 'tokens.md'), '# Tokens\n', 'utf8')
  return { root, skillDir, skillFile: join(skillDir, 'SKILL.md') }
}

/** 正文（frontmatter 之后、已 trim）——与真实 registry 的口径一致（它只给 body）。 */
function registryBody(text) {
  const split = splitFrontmatter(text)
  assert.ok(split.ok, '这个测试的 fixture 自己得是一份合法的 SKILL.md')
  return split.body.trim()
}

function registryFor(world) {
  return {
    async get(name) {
      if (name !== 'ui-craft') return undefined
      const raw = await readFile(world.skillFile, 'utf8')
      return {
        name,
        description: 'Use for UI design work',
        whenToUse: null,
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'custom',
        provider: 'filesystem',
        path: world.skillFile,
        resourceBase: { kind: 'directory', path: dirname(world.skillFile) },
        content: registryBody(raw),
        metadata: null,
      }
    },
  }
}

function createHost({ dataRoot, cwd, registry, live }) {
  const routes = []
  const messages = []
  const webCtx = {
    on() { return () => {} },
    get(name) { return name === 'skills' ? registry : undefined },
    effect(setup) { setup(); return () => {} },
    webServer: { register(route) { routes.push(route); return () => {} } },
    sessions: { get: (sessionId) => (sessionId === SESSION_ID ? { id: sessionId, header: { cwd } } : null) },
    agents: {
      get: (sessionId) => (live && sessionId === SESSION_ID
        ? { id: sessionId, followup(message) { messages.push(message) } }
        : null),
    },
  }
  apply({ inject(_names, callback) { callback(webCtx) } }, { dataRoot })
  return { routes, messages }
}

async function call(route, { method = 'GET', url, body }) {
  let status = 0
  let payload = ''
  const res = { writeHead(code) { status = code }, end(value) { payload = value } }
  const request = { method, url, socket: { remoteAddress: '127.0.0.1' } }
  request[Symbol.asyncIterator] = async function* iterate() {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  await route.handler(request, res)
  return { status, payload: payload ? JSON.parse(payload) : null }
}

async function setup({ live = true, seedLineage = null } = {}) {
  const world = await makeWorld()
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-modification-data-'))
  // 宿主自己会在同一个目录上建一份 store；测试这份只是为了预置/改写血缘记录。
  const lineageStore = createSkillLineageStore(join(dataRoot, 'lineage'))
  if (seedLineage) await lineageStore.write(buildLineageRecord(seedLineage))
  const { routes, messages } = createHost({
    dataRoot,
    cwd: join(world.root, 'project'),
    registry: registryFor(world),
    live,
  })
  const route = routes[routes.length - 1]
  assert.ok(route, '宿主必须注册了路由')
  return { world, route, messages, dataRoot, lineageStore }
}

const SOURCE_SHA_A = `sha256:${'a'.repeat(64)}`
const SOURCE_SHA_B = `sha256:${'b'.repeat(64)}`

function post(route, body) {
  return call(route, { method: 'POST', url: '/skill-trace/modify', body })
}

test('begin 记下改前并派发一条带协议的消息，source.kind 标出来源', async () => {
  const { route, messages } = await setup()
  const { status, payload } = await post(route, {
    sessionId: SESSION_ID,
    skillName: 'ui-craft',
    action: 'begin',
    intent: '增加一条规则：所有渐变都必须在 tokens 里说明用途。',
    scopes: ['skill-md-rules', 'scripts', 'not-a-scope'],
    profiles: ['microsoft'],
  })

  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.dispatched, true)
  assert.equal(payload.sourceKind, MODIFICATION_SOURCE_KIND)
  assert.deepEqual(payload.scopeIds, ['skill-md-rules'])
  // 锁死的范围只回报、不授予 —— 第一版 scripts/ 与 assets/ 不可勾选。
  assert.deepEqual(payload.lockedScopeIds, ['scripts'])
  assert.deepEqual(payload.unknownScopeIds, ['not-a-scope'])
  assert.deepEqual(payload.profileIds, ['common', 'microsoft'])
  assert.match(payload.before.sha256, /^sha256:[0-9a-f]{64}$/)
  assert.ok(payload.before.lineCount > 0)

  assert.equal(messages.length, 1, '一次点击只发一条消息')
  const message = messages[0]
  assert.equal(message.role, 'user')
  assert.equal(message.source.kind, MODIFICATION_SOURCE_KIND)
  assert.match(message.id, /^[0-9a-f-]{36}$/)
  const text = message.content[0].text
  assert.equal(message.content[0].type, 'text')
  assert.ok(text.includes('增加一条规则：所有渐变都必须在 tokens 里说明用途。'), '用户原话必须逐字带上')
  assert.ok(text.includes('1. 修改前必须读取当前文件'))
  assert.ok(text.includes('12. 不得自动改会话标题'), '末条按事实写成改会话标题，不写不存在的 /name')
  assert.ok(!text.includes('/name'))
  assert.ok(text.includes('SKILL.md / Rules'), '范围要用界面上的说法，和对话框里勾的是同一个东西')
})

test('没有正在运行的 Agent 时不派发，也不留下快照', async () => {
  const { route, messages } = await setup({ live: false })
  const { status, payload } = await post(route, {
    sessionId: SESSION_ID,
    skillName: 'ui-craft',
    intent: '改一条规则',
  })

  assert.equal(status, 409)
  assert.equal(payload.code, 'session-not-live')
  assert.equal(messages.length, 0)
})

test('意图为空时不派发', async () => {
  const { route, messages } = await setup()
  const { status, payload } = await post(route, {
    sessionId: SESSION_ID,
    skillName: 'ui-craft',
    intent: '   ',
  })

  assert.equal(status, 400)
  assert.equal(payload.code, 'missing-intent')
  assert.equal(messages.length, 0)
})

test('读不到 SKILL.md 时不派发：没有「改前」就没有这次修改', async () => {
  const { route, messages } = await setup()
  const { status, payload } = await post(route, {
    sessionId: SESSION_ID,
    skillName: 'ghost-skill',
    intent: '改一条规则',
  })

  assert.ok(status === 422 || status === 404, `读不到就不该派发，实际 ${status}`)
  assert.equal(messages.length, 0)
})

test('compare 给出改动、释放快照，并且绝不碰磁盘上的文件', async () => {
  const { route, world } = await setup()
  const before = await readFile(world.skillFile, 'utf8')
  await post(route, {
    sessionId: SESSION_ID,
    skillName: 'ui-craft',
    intent: '在 Rules 下加一条',
    scopes: ['skill-md-rules'],
  })

  // 假装 Agent 用 DSH 原生工具改了文件 —— 测试里只能自己改，因为插件本来就不该改。
  const after = before.replace('- Be precise', '- Be precise\n- Prefer tokens')
  await writeFile(world.skillFile, after, 'utf8')

  const first = await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', action: 'compare' })
  assert.equal(first.status, 200)
  assert.equal(first.payload.released, true, '对比完就释放，快照不比这次修改活得更久')
  const comparison = first.payload.comparison
  assert.equal(comparison.available, true)
  assert.equal(comparison.status, 'changed')
  assert.ok(comparison.lines.added >= 1)
  assert.equal(comparison.scopes.find((scope) => scope.id === 'skill-md-rules').state, 'changed')
  assert.deepEqual(comparison.outOfScope, [], '只改了被授权的 Rules，不该报超范围')
  assert.ok(comparison.limitations.length >= 6)
  // 复用 v0.9.0 的验收，而且用的是同一次请求里读到的现状。
  assert.equal(first.payload.validation.skillName, 'ui-craft')
  assert.ok(typeof first.payload.validation.status === 'string')

  const second = await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', action: 'compare' })
  assert.equal(second.payload.released, false)
  assert.equal(second.payload.comparison.available, false)
  assert.equal(second.payload.comparison.reason, 'snapshot-missing')
  assert.ok(second.payload.comparison.message.includes('本次修改前状态不可用'))

  // 插件不碰文件：整轮下来磁盘上的内容仍然是我自己写进去的那一份。
  assert.equal(await readFile(world.skillFile, 'utf8'), after)
})

test('只授权 description 却改了 Rules，如实报出超出范围', async () => {
  const { route, world } = await setup()
  const before = await readFile(world.skillFile, 'utf8')
  await post(route, {
    sessionId: SESSION_ID,
    skillName: 'ui-craft',
    intent: '把 description 写清楚一点',
    scopes: ['skill-md-description'],
  })
  await writeFile(world.skillFile, before.replace('- Be precise', '- Be precise\n- No slop'), 'utf8')

  const { payload } = await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', action: 'compare' })
  const ids = payload.comparison.outOfScope.map((entry) => entry.id)
  assert.ok(ids.includes('skill-md-rules'), `超范围必须被报出来，实际 ${ids.join(',')}`)
})

test('从未 begin 过就 compare：说不知道，不编一个「没变化」', async () => {
  const { route } = await setup()
  const { status, payload } = await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', action: 'compare' })

  assert.equal(status, 200)
  assert.equal(payload.released, false)
  assert.equal(payload.comparison.available, false)
  assert.equal(payload.comparison.reason, 'snapshot-missing')
  assert.equal(payload.comparison.source.state, 'unknown')
})

test('来源指纹没动就说没动', async () => {
  const { route } = await setup({
    seedLineage: {
      sourceSkillName: 'ui-craft-source',
      sourceSourceSha256: SOURCE_SHA_A,
      targetSkillName: 'ui-craft',
      cloneMode: 'bundle',
      targetScope: 'user',
    },
  })
  await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', intent: '改一条规则', scopes: ['skill-md-rules'] })

  const { payload } = await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', action: 'compare' })
  assert.equal(payload.comparison.source.state, 'unchanged')
  assert.ok(payload.comparison.source.message.includes('没有发生变化'))
})

test('来源指纹在修改期间变了，只说来源变了，不说 Agent 改了来源', async () => {
  const seed = {
    sourceSkillName: 'ui-craft-source',
    sourceSourceSha256: SOURCE_SHA_A,
    targetSkillName: 'ui-craft',
    cloneMode: 'bundle',
    targetScope: 'user',
  }
  const { route, lineageStore } = await setup({ seedLineage: seed })
  await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', intent: '改一条规则', scopes: ['skill-md-rules'] })

  // 修改期间来源 Skill 自己变了（同一个目标名再写一条就是覆盖那条关系）。
  await lineageStore.write(buildLineageRecord({ ...seed, sourceSourceSha256: SOURCE_SHA_B }))

  const { payload } = await post(route, { sessionId: SESSION_ID, skillName: 'ui-craft', action: 'compare' })
  const { source } = payload.comparison
  assert.equal(source.state, 'changed')
  assert.equal(source.message, '来源 Skill 在本次修改期间发生变化。')
  const serialized = JSON.stringify(payload.comparison)
  assert.ok(!serialized.includes('Agent 修改了'))
  assert.ok(!serialized.includes('Agent 改了'))
  assert.ok(!serialized.includes('篡改'))
})
