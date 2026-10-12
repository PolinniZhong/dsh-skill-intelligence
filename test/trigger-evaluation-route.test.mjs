/**
 * V1.4 §「触发评测」—— 第 13 条路由 `POST /skill-trace/evaluation` 的 `trigger-*` 动作那条缝
 * （`FR-TRIG-007` / `FR-TRIG-019`）。
 *
 * 纯函数层（`test/skill-trigger-evaluation.test.mjs`）与落盘层已经把判定、降级、词表、
 * 上限逐条钉住了。这里测的是**缝**，而且这一版这条缝比 V1.0 更硬：
 *
 * 1. `caseId` 由宿主对 `hashInput` 做 sha256 得到，客户端说了不算；对不上就拒绝。
 * 2. **「这一次观察到什么」不由浏览器提交。** 请求体里写 `observation: "loaded"`、
 *    `invocationType: "model"` 不会改变落盘记录一个字节 —— 事实只从收据与会话日志里来。
 * 3. 显式 `/name` 调用是一条**加载**记录，但不是一个自然触发：对照结果必须降级。
 * 4. `sessionId` 只作为读取参数，**一个字节都不许落盘**。
 * 5. 没有加载记录时，只有「覆盖完整 + 用户声明新会话」才敢说「未观察到加载」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { apply } from '../src/dsh/host/index.js'
import { buildTriggerCase } from '../src/core/skill-trigger-evaluation.mjs'

const SESSION_ID = 'session-trigger-route'
const SKILL = 'ui-craft'

/** 正文（frontmatter 之后）——与 registry 的真实口径一致。 */
function registryBody() {
  return '# UI Craft\n\n做界面时用它。'
}

function registryFor() {
  return {
    async get(name) {
      if (name !== SKILL) return undefined
      return {
        name,
        description: 'Use for UI design work',
        whenToUse: null,
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'custom',
        provider: 'filesystem',
        path: join(tmpdir(), 'ui-craft', 'SKILL.md'),
        resourceBase: { kind: 'directory', path: join(tmpdir(), 'ui-craft') },
        content: registryBody(),
        metadata: null,
      }
    },
  }
}

function createHost({ dataRoot, registry }) {
  const routes = []
  const webCtx = {
    on() { return () => {} },
    get(name) { return name === 'skills' ? registry : undefined },
    effect(setup) { setup(); return () => {} },
    webServer: { register(route) { routes.push(route); return () => {} } },
    sessions: { get: (sessionId) => (sessionId === SESSION_ID ? { id: sessionId, header: { cwd: dataRoot } } : null) },
    agents: { get: () => null },
  }
  apply({ inject(_names, callback) { callback(webCtx) } }, { dataRoot })
  return { routes }
}

async function call(route, { method = 'POST', url, body }) {
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

function receiptFile(dataRoot, sessionId) {
  return join(dataRoot, 'receipts', `${createHash('sha256').update(sessionId).digest('hex')}.json`)
}

/** 预置一份收据：宿主的 Run 捕获只认它，不认请求体。 */
async function seedReceipt(dataRoot, traceEvents) {
  await mkdir(join(dataRoot, 'receipts'), { recursive: true, mode: 0o700 })
  await writeFile(
    receiptFile(dataRoot, SESSION_ID),
    JSON.stringify({ schemaVersion: 1, sessionId: SESSION_ID, traceEvents }),
    'utf8',
  )
}

function loadedTrace(overrides = {}) {
  return {
    eventId: `${SESSION_ID}:call-1`,
    sessionId: SESSION_ID,
    turn: 1,
    step: 1,
    skillName: SKILL,
    status: 'loaded',
    invocationType: 'model-invoked',
    callId: 'call-1',
    callSeq: 10,
    resultSeq: 12,
    consumer: 'skill-tool',
    coverage: 'observed-tool-contract',
    ...overrides,
  }
}

async function setup({ traces = [] } = {}) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-trigger-data-'))
  const { routes } = createHost({ dataRoot, registry: registryFor() })
  const route = routes[routes.length - 1]
  assert.ok(route, '宿主必须注册了路由')
  if (traces.length > 0) await seedReceipt(dataRoot, traces)
  const send = (body) => call(route, { url: '/skill-trace/evaluation', body })
  const saveCase = async (expectedTrigger) => {
    const built = buildTriggerCase({ skillName: SKILL, title: '抽表格', prompt: '请把这份 PDF 的表格抽出来。', expectedTrigger })
    const saved = await send({ action: 'trigger-case-save', sessionId: SESSION_ID, hashInput: built.hashInput, case: built.case })
    assert.equal(saved.status, 200)
    return saved.payload.caseId
  }
  return { dataRoot, send, saveCase }
}

async function readAll(root, prefix = '') {
  let output = ''
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) output += await readAll(root, relative)
    else output += await readFile(join(root, relative), 'utf8')
  }
  return output
}

test('trigger 用例的身份由宿主算出，文件落在 trigger-suites 下', async () => {
  const { dataRoot, send, saveCase } = await setup()
  const caseId = await saveCase(false)
  assert.match(caseId, /^sha256:[a-f0-9]{64}$/)

  const read = await send({ action: 'trigger-case-read', sessionId: SESSION_ID, caseId })
  assert.equal(read.status, 200)
  assert.equal(read.payload.case.skillName, SKILL)
  assert.equal(read.payload.case.expectedTrigger, false)
  assert.equal(read.payload.case.prompt, '请把这份 PDF 的表格抽出来。')
  assert.deepEqual(read.payload.runs, [])

  const files = await readdir(join(dataRoot, 'evaluation', 'trigger-suites'))
  assert.equal(files.length, 1)
  assert.equal(files[0], `${caseId.slice('sha256:'.length)}.json`)
})

test('客户端送来的 caseId 与内容对不上就拒绝', async () => {
  const { send } = await setup()
  const built = buildTriggerCase({ skillName: SKILL, title: '抽表格', prompt: '提示词', expectedTrigger: false })
  const rejected = await send({
    action: 'trigger-case-save',
    sessionId: SESSION_ID,
    hashInput: built.hashInput,
    case: { ...built.case, caseId: `sha256:${'a'.repeat(64)}` },
  })
  assert.equal(rejected.status, 400)
  assert.match(rejected.payload.error, /身份和它的内容对不上/)
})

test('模型自然加载 ⇒ 观察到加载，且负向用例给出「非预期加载」', async () => {
  const { send, saveCase } = await setup({ traces: [loadedTrace()] })
  const caseId = await saveCase(false)
  const captured = await send({ action: 'trigger-run-capture', sessionId: SESSION_ID, caseId, freshSession: 'user-confirmed' })
  assert.equal(captured.status, 200)
  const run = captured.payload.run
  assert.equal(run.observation, 'loaded')
  assert.equal(run.invocationType, 'model')
  assert.equal(run.outcome, 'observed-unexpected')
  assert.match(run.skillFingerprint, /^sha256:[a-f0-9]{64}$/)
  // `description` 指纹是**未截断**那份：它必须真的算出来了，而不是 unavailable。
  assert.match(run.descriptionFingerprint, /^sha256:[a-f0-9]{64}$/)
  assert.ok(run.evidenceRefs.length > 0)
  assert.ok(run.limitations.includes('load-is-protocol-fact'))
})

test('浏览器提交的「已加载」不算数：事实只从收据来', async () => {
  const { send, saveCase } = await setup()
  const caseId = await saveCase(true)
  const captured = await send({
    action: 'trigger-run-capture',
    sessionId: SESSION_ID,
    caseId,
    freshSession: 'user-confirmed',
    // 这一整段都是伪造的：宿主必须无视它。
    observation: 'loaded',
    invocationType: 'model',
    coverage: 'complete',
    outcome: 'observed-expected',
    skillFingerprint: `sha256:${'e'.repeat(64)}`,
  })
  assert.equal(captured.status, 200)
  const run = captured.payload.run
  // 收据里没有任何加载记录 ⇒ 宿主只能说「未观察到加载」，绝不能说「观察到加载」。
  assert.notEqual(run.observation, 'loaded')
  assert.equal(run.observation, 'not-observed')
  assert.equal(run.invocationType, 'unknown')
  assert.notEqual(run.outcome, 'observed-expected')
  assert.equal(run.outcome, 'not-observed-with-coverage')
  assert.notEqual(run.skillFingerprint, `sha256:${'e'.repeat(64)}`)
})

test('显式 /name 调用是一条加载记录，但不是自然触发', async () => {
  const { send, saveCase } = await setup({
    traces: [loadedTrace({ invocationType: 'user-explicit', callId: null, consumer: 'skill-invocation', coverage: 'observed-injection-source' })],
  })
  const caseId = await saveCase(true)
  const captured = await send({ action: 'trigger-run-capture', sessionId: SESSION_ID, caseId, freshSession: 'user-confirmed' })
  const run = captured.payload.run
  assert.equal(run.observation, 'loaded')
  assert.equal(run.invocationType, 'user-explicit')
  assert.equal(run.outcome, 'inconclusive')
  assert.ok(run.limitations.includes('explicit-call-not-natural-trigger'))
})

test('没有加载记录：只有「覆盖完整 + 用户声明新会话」才敢说「未观察到加载」', async () => {
  const { send, saveCase } = await setup()
  const caseId = await saveCase(false)

  const declared = await send({ action: 'trigger-run-capture', sessionId: SESSION_ID, caseId, freshSession: 'user-confirmed' })
  assert.equal(declared.payload.run.observation, 'not-observed')
  assert.equal(declared.payload.run.outcome, 'not-observed-with-coverage')
  assert.ok(declared.payload.run.limitations.includes('no-load-record-is-not-no-trigger'))

  const undeclared = await send({ action: 'trigger-run-capture', sessionId: SESSION_ID, caseId })
  assert.equal(undeclared.payload.run.freshSession, 'unconfirmed')
  assert.equal(undeclared.payload.run.outcome, 'inconclusive')
})

test('落盘的观察记录里一个会话标识都没有', async () => {
  const { dataRoot, send, saveCase } = await setup({ traces: [loadedTrace()] })
  const caseId = await saveCase(false)
  await send({ action: 'trigger-run-capture', sessionId: SESSION_ID, caseId, freshSession: 'user-confirmed' })
  const text = await readAll(join(dataRoot, 'evaluation'))
  assert.ok(text.includes('observed-unexpected'))
  assert.ok(!text.includes(SESSION_ID), 'sessionId 不许落盘')
  assert.ok(!text.includes('sessionId'))
  assert.ok(!text.includes('call-1'))
})

test('trigger-case-list 带上运行次数与最近一次观察', async () => {
  const { send, saveCase } = await setup({ traces: [loadedTrace()] })
  const caseId = await saveCase(false)
  await send({ action: 'trigger-run-capture', sessionId: SESSION_ID, caseId, freshSession: 'user-confirmed' })
  const listed = await send({ action: 'trigger-case-list', sessionId: SESSION_ID, skillName: SKILL })
  assert.equal(listed.status, 200)
  assert.equal(listed.payload.cases.length, 1)
  assert.equal(listed.payload.cases[0].runCount, 1)
  assert.equal(listed.payload.cases[0].latestRun.outcome, 'observed-unexpected')
})

test('trigger-case-delete 带走它的观察，不留孤儿', async () => {
  const { dataRoot, send, saveCase } = await setup({ traces: [loadedTrace()] })
  const caseId = await saveCase(false)
  await send({ action: 'trigger-run-capture', sessionId: SESSION_ID, caseId, freshSession: 'user-confirmed' })
  const removed = await send({ action: 'trigger-case-delete', sessionId: SESSION_ID, caseId })
  assert.equal(removed.status, 200)
  assert.equal(removed.payload.deleted, true)
  assert.equal(removed.payload.runsRemoved, 1)
  const suites = await readdir(join(dataRoot, 'evaluation', 'trigger-suites'))
  const runs = await readdir(join(dataRoot, 'evaluation', 'trigger-runs')).catch(() => [])
  assert.deepEqual(suites, [])
  assert.deepEqual(runs, [])
})

test('动作名不认识 / 用例不存在，都是一句人话', async () => {
  const { send } = await setup()
  const unknown = await send({ action: 'trigger-run-now', sessionId: SESSION_ID })
  assert.equal(unknown.status, 400)
  assert.match(unknown.payload.error, /动作名不在评测支持的范围内/)

  const missing = await send({ action: 'trigger-case-read', sessionId: SESSION_ID, caseId: `sha256:${'b'.repeat(64)}` })
  assert.equal(missing.status, 404)
  assert.match(missing.payload.error, /没有这一份触发用例/)
})
