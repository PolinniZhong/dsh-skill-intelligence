import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { apply } from '../src/dsh/host/index.js'
import { splitFrontmatter } from '../src/core/skill-clone.mjs'

/**
 * v0.9.0：验收结果走**真实路由**回来。
 *
 * 为什么要专门起一台宿主来测：验收器本身是纯函数，`test/skill-validation.test.mjs` 已经把
 * 它的判定逐条钉住了；这里测的是**缝**——宿主交给验收器的到底是不是那份东西，以及客户端读的
 * 到底是不是那条路由。两个单边测试都绿、缝里却是错的，这个项目刚在 v0.8 栽过一次
 * （「复刻 Skill」从 0.7.0 起一次都没成功过：宿主必需 `sessionId`，客户端没发）。
 *
 * 这个文件里有两条断言是**真机事故的回归**，别删：
 *
 * 1. registry 的 `content` 只有正文。`dsh-skill-filesystem` 的 `parseSkillFile()` 返回
 *    `content: parsed.body.trim()`（`lib/index.js:703`），真机上 `definition.content.text`
 *    的第一行就是 `# UI Craft`。所以这里喂给假 registry 的也必须是**去掉 frontmatter 的正文**
 *    —— 直接拿它去验收，每一份真实 Skill 都会被判「缺少 frontmatter」，那是假指控。
 *    `CORE-FM-002` 必须是 `clean` 就是这条缝的钉子。
 * 2. 验收结果必须长在**详情响应**的 `skill` 里。详情页读的是 `GET /skill-trace/skill` 的
 *    `body.skill`；只在 `/skill-trace/definition` 上挂同级字段，界面上永远只有一句
 *    「这次详情响应里没有验收结果」。
 */

const SESSION_ID = 'session-validation-route'

/** 一份干净的 Skill：name 与目录同名、description 带触发场景、引用一个真实存在的资源。 */
const GOOD_MD = `---
name: ui-craft
description: Use this when a page needs visual polish or a design decision.
---

# UI Craft

读一遍再写。

## Rules
- Be precise

## Workflow
1. Read
2. Write

See [the token table](references/tokens.md).
`

/** 目录名与 frontmatter 的 name 不一致。DSH 不在乎这件事，Microsoft 明文要求同名。 */
const MISMATCHED_MD = `---
name: legacy-skill
description: Builds UI screens from a token file.
---

# Legacy

只改 description 的那一类。
`

async function makeWorld() {
  const root = await mkdtemp(join(tmpdir(), 'st-validation-route-'))
  const good = join(root, 'project', 'ui-craft')
  const mismatch = join(root, 'project', 'legacy-name')
  await mkdir(join(good, 'references'), { recursive: true })
  await mkdir(mismatch, { recursive: true })
  await writeFile(join(good, 'SKILL.md'), GOOD_MD, 'utf8')
  await writeFile(join(good, 'references', 'tokens.md'), '# Tokens\n', 'utf8')
  await writeFile(join(mismatch, 'SKILL.md'), MISMATCHED_MD, 'utf8')
  return { root, good, mismatch }
}

/** 正文（frontmatter 之后、已 trim）——**刻意**与 registry 的真实口径一致，见文件头的第 1 条。 */
function registryBody(text) {
  const split = splitFrontmatter(text)
  assert.ok(split.ok, '这个测试的 fixture 自己得是一份合法的 SKILL.md')
  return split.body.trim()
}

function registryFor(world, names) {
  const files = {
    'ui-craft': join(world.good, 'SKILL.md'),
    'legacy-skill': join(world.mismatch, 'SKILL.md'),
  }
  return {
    async get(name) {
      if (!names.includes(name)) return undefined
      const file = files[name]
      const raw = await readFile(file, 'utf8')
      return {
        name,
        description: 'Use for UI design work',
        whenToUse: null,
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'custom',
        provider: 'filesystem',
        path: file,
        resourceBase: { kind: 'directory', path: dirname(file) },
        content: registryBody(raw),
        metadata: null,
      }
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

async function call(route, { method = 'GET', url }) {
  let status = 0
  let payload = ''
  const res = { writeHead(code) { status = code }, end(value) { payload = value } }
  await route.handler({ method, url, socket: { remoteAddress: '127.0.0.1' } }, res)
  return { status, payload: payload ? JSON.parse(payload) : null }
}

async function setup({ names = ['ui-craft', 'legacy-skill'] } = {}) {
  const world = await makeWorld()
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-validation-data-'))
  const routes = createHost({ dataRoot, cwd: join(world.root, 'project'), registry: registryFor(world, names) })
  const route = routes[routes.length - 1]
  assert.ok(route, '宿主必须注册了路由')
  return { world, route, routes }
}

function stateOf(validation, id) {
  const rule = validation.rules.find((entry) => entry.id === id)
  assert.ok(rule, `验收结果里必须有 ${id}`)
  return rule.state
}

test('详情路由把验收结果放在 skill 里，客户端读的就是这一支', async () => {
  const { route } = await setup()
  const { status, payload } = await call(route, { url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=ui-craft` })

  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.ok(Object.prototype.hasOwnProperty.call(payload.skill, 'validation'), '详情响应必须带 validation')
  const validation = payload.skill.validation
  assert.equal(validation.available, true)
  assert.equal(validation.status, 'pass')
  assert.equal(validation.summary.errors, 0)
  assert.deepEqual(validation.profileIds, ['common', 'standard', 'dsh'])
  // 事故回归①：宿主若拿 registry 的正文（没有 frontmatter）去验收，这一条会变成 fired。
  assert.equal(stateOf(validation, 'CORE-FM-002'), 'clean')
  assert.equal(stateOf(validation, 'CORE-FM-004'), 'clean')
  assert.equal(stateOf(validation, 'CORE-REF-001'), 'clean')
})

test('definition 路由也带同一份验收结果，两条路不会各说各话', async () => {
  const { route } = await setup()
  const { status, payload } = await call(route, { url: `/skill-trace/definition?sessionId=${SESSION_ID}&skillName=ui-craft` })

  assert.equal(status, 200)
  assert.equal(payload.validation.status, 'pass')
  assert.equal(payload.validation.skillName, 'ui-craft')
  assert.deepEqual(payload.validation.profileIds, ['common', 'standard', 'dsh'])
})

test('换验收目标真的换了目标，不会静默回退成默认 Profile', async () => {
  const { route } = await setup()
  const { payload } = await call(route, {
    url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=ui-craft&profiles=openai`,
  })

  // `resolveSkillProfiles()` 返回的是 `{profileIds, unknown}` 而不是数组。宿主若把这个对象当
  // `profileIds` 传下去，验收器会把它当非法输入、静默回退到 common+dsh —— 这一条就是那道缝。
  assert.deepEqual(payload.skill.validation.profileIds, ['common', 'openai'])
  assert.ok(payload.skill.validation.rules.some((rule) => rule.id.startsWith('OA-')))
})

// v1.1：这条测试原来问的是「DSH 看目录名吗」—— 答案是「不看」，而能看见目录名不一致的只有
// Microsoft。V1.1 把 **Agent Skills 开放标准**正式化成一个独立的层，它同样要求 name 与父目录
// 同名（CORE-DIR-001）。于是同一个事实现在有两个来源，而且必须**分得开**：
//
//   * 默认目标（Common + Standard + DSH）→ 标准层报 CORE-DIR-001，Microsoft 的规则不出现；
//   * 只挑 Common + DSH            → 通过。DSH 装载一个 Skill 时不看目录名，这就是「平台宽容」；
//   * 只挑 Common + Microsoft      → Microsoft 报 MS-DIR-001，而标准层的规则不出现。
//
// 第二行是这一版最要紧的一条：**DSH 能加载，不代表标准上没问题**。反过来第一行说明标准层的
// 结论不会被摊到某个平台头上（§六：不要把平台约束直接说成 Open Standard 违反）。
test('同一个 Skill 在标准层与平台层得到不同结论：DSH 不看目录名，开放标准与 Microsoft 都要求同名', async () => {
  const { route } = await setup()

  const standard = await call(route, { url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=legacy-skill` })
  assert.equal(standard.payload.skill.validation.status, 'needs-fix')
  assert.equal(stateOf(standard.payload.skill.validation, 'CORE-DIR-001'), 'fired')
  const dirFinding = standard.payload.skill.validation.findings.find((finding) => finding.id === 'CORE-DIR-001')
  assert.equal(dirFinding.sourceKind, 'standard', '目录名这条结论来自开放标准，不是某一家平台')
  assert.equal(dirFinding.sourceLabel, 'Agent Skills Open Standard')
  assert.equal(
    standard.payload.skill.validation.rules.some((rule) => rule.id === 'MS-DIR-001'),
    false,
    '默认目标（Standard + DSH + Common）里不该出现 Microsoft 的规则',
  )
  // 标准层与平台层在结果里必须能一眼分开，否则界面上只能把两件事都说成「不符合」。
  const kinds = Object.fromEntries(standard.payload.skill.validation.profiles.map((profile) => [profile.id, profile.kind]))
  assert.deepEqual(kinds, { common: 'standard', standard: 'standard', dsh: 'platform' })

  const dshOnly = await call(route, {
    url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=legacy-skill&profiles=common,dsh`,
  })
  assert.equal(dshOnly.payload.skill.validation.status, 'pass')
  assert.equal(
    dshOnly.payload.skill.validation.rules.some((rule) => rule.id === 'CORE-DIR-001'),
    false,
    '不挑标准层时，标准层的规则不该出现在结果里 —— DSH 能装载这个 Skill',
  )

  const microsoft = await call(route, {
    url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=legacy-skill&profiles=common,microsoft`,
  })
  const validation = microsoft.payload.skill.validation
  assert.equal(validation.status, 'needs-fix')
  assert.equal(stateOf(validation, 'MS-DIR-001'), 'fired')
  assert.ok(validation.findings.some((finding) => finding.id === 'MS-DIR-001'))
  assert.equal(
    validation.rules.some((rule) => rule.id === 'CORE-DIR-001'),
    false,
    'Microsoft 的目录名结论要挂在 MS-DIR-001 上，不能顶替标准层那条',
  )
})

test('读不到 SKILL.md 时说「无法判断」，不拿缺 frontmatter 的正文凑一份结论', async () => {
  const { route, world } = await setup()
  const { payload } = await call(route, {
    // 名字在 registry 里，但文件已经不在磁盘上：宿主必须降级，而不是照常判定。
    url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=ui-craft`,
  })
  assert.equal(payload.skill.validation.available, true, '先确认这一份本来是读得到的')

  const { rm } = await import('node:fs/promises')
  await rm(join(world.good, 'SKILL.md'))
  const gone = await call(route, { url: `/skill-trace/skill?sessionId=${SESSION_ID}&skillName=ui-craft` })
  assert.equal(gone.status, 200)
  assert.equal(gone.payload.skill.validation.available, false)
  assert.equal(gone.payload.skill.validation.status, 'unknown')
  assert.equal(gone.payload.skill.validation.summary.errors, 0, '读不到文件不是「有错误」')
})

test('客户端读的确实是 /skill 的 body.skill 与 validation 字段', async () => {
  const client = await readFile(new URL('../src/dsh/client/client.js', import.meta.url), 'utf8')

  // 请求那一半
  assert.match(client, /api\(`\/skill\?sessionId=\$\{encodeURIComponent\(sessionId\)\}&skillName=/)
  // 解包那一半：详情页拿的是 `body.skill`，所以 validation 必须长在 `skill` 里面
  assert.match(client, /setFetched\(body\?\.skill \?\? null\)/)
  // 消费者那一半：字段缺失与「读不到」是两句不同的话（§6.11）
  assert.match(client, /hasOwnProperty\.call\(detail, 'validation'\)/)
  assert.match(client, /const validation = detail\?\.validation \?\? null/)
})
