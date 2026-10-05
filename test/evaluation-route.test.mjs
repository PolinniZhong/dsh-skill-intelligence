import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../src/dsh/host/index.js'
import { buildRuntimeEvidence, caseHashInput } from '../src/core/skill-evaluation.mjs'

/**
 * V1.0 §22.7：第 13 条路由 `POST /skill-trace/evaluation` 的那条缝。
 *
 * 纯函数层（`test/skill-evaluation.test.mjs`）与落盘层（`test/evaluation-store.test.mjs`）
 * 已经把判定、降级、上限、权限位逐条钉住了。这里测的是**缝**：
 *
 * 1. 身份是谁算的 —— `caseId` 必须由宿主对 `hashInput` 做 sha256 得到，客户端说了不算；
 *    对不上就拒绝，避免「页面上的内容变了，身份还是旧的」。
 * 2. `sessionId` 必须校验，但**绝不落盘**：它是会话的标识，不是这次实验的标识（`FR-EVAL-016`）。
 * 3. 运行时夹带的字段不许穿透：`normalizeEvaluationRun` 是白名单，`sessionId` / `args` / `score`
 *    这类名字连一个字节都不该出现在文件里（`docs/PRIVACY.md` 的承诺得能被执行验证）。
 * 4. 动作名不认识时给一句人话，不是 500。
 */

const SESSION_ID = 'session-evaluation-route'

function caseRecord(overrides = {}) {
  return {
    generatorVersion: '1.0.0',
    skillName: 'ui-craft',
    skillFingerprint: { instructionSha256: 'f'.repeat(64), match: 'match' },
    scopeIds: ['skill-md-rules', 'references'],
    changedScopeIds: ['skill-md-rules'],
    primaryScopeId: 'skill-md-rules',
    taskPrompt: { task: '真实任务', goal: '目标', output: '输出', note: '注意', text: '【任务】真实任务' },
    observations: [{ id: 'obs-1', text: '它是否实际使用了相关 Skill？' }],
    regressions: ['这次改动不应影响原有「Ui Craft」的要求。'],
    ...overrides,
  }
}

function createHost({ dataRoot }) {
  const routes = []
  const webCtx = {
    on() { return () => {} },
    get() { return undefined },
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

async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-evaluation-data-'))
  const { routes } = createHost({ dataRoot })
  const route = routes[routes.length - 1]
  assert.ok(route, '宿主必须注册了路由')
  const send = (body) => call(route, { url: '/skill-trace/evaluation', body })
  return { dataRoot, send }
}

/** 把落盘目录里所有文件读成一段文本：用来断言「某些名字一个字节都不许出现」。 */
async function readAll(root, prefix = '') {
  let output = ''
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) output += await readAll(root, relative)
    else output += await readFile(join(root, relative), 'utf8')
  }
  return output
}

test('case-save 的身份由宿主算出，case-read 读回同一份', async () => {
  const { dataRoot, send } = await setup()
  const record = caseRecord()
  const hashInput = caseHashInput(record)
  const saved = await send({ action: 'case-save', sessionId: SESSION_ID, hashInput, case: record })
  assert.equal(saved.status, 200)
  assert.match(saved.payload.caseId, /^sha256:[a-f0-9]{64}$/)

  const read = await send({ action: 'case-read', sessionId: SESSION_ID, caseId: saved.payload.caseId })
  assert.equal(read.status, 200)
  assert.equal(read.payload.case.skillName, 'ui-craft')
  assert.equal(read.payload.case.taskPrompt.text, '【任务】真实任务')
  assert.deepEqual(read.payload.runs, [])
  // 文件真的在 `<dataRoot>/evaluation/cases/` 下，而不是别处。
  const files = await readdir(join(dataRoot, 'evaluation', 'cases'))
  assert.equal(files.length, 1)
  assert.equal(files[0], `${saved.payload.caseId.slice('sha256:'.length)}.json`)
})

test('客户端送来的 caseId 与内容算出来的对不上就拒绝', async () => {
  const { send } = await setup()
  const record = caseRecord()
  const rejected = await send({
    action: 'case-save',
    sessionId: SESSION_ID,
    hashInput: caseHashInput(record),
    case: { ...record, caseId: `sha256:${'a'.repeat(64)}` },
  })
  assert.equal(rejected.status, 400)
  assert.equal(rejected.payload.ok, false)
  assert.match(rejected.payload.error, /身份和它的内容对不上/)
})

test('缺 hashInput / 缺会话标识 / 动作名不认识，都是一句人话加 400', async () => {
  const { send } = await setup()

  const noHash = await send({ action: 'case-save', sessionId: SESSION_ID, case: caseRecord() })
  assert.equal(noHash.status, 400)
  assert.match(noHash.payload.error, /没有带上 Case 的身份输入/)

  const noSession = await send({ action: 'case-list' })
  assert.equal(noSession.status, 400)
  assert.match(noSession.payload.error, /没有带上会话标识/)

  const noAction = await send({ action: 'evaluation-run-now', sessionId: SESSION_ID })
  assert.equal(noAction.status, 400)
  assert.match(noAction.payload.error, /动作名不在评测支持的范围内/)
  // 评测不跑、不建会话：没有任何动作能触发会话或消息。
})

test('读一份不存在的 Case 给 404 加人话，不是 500', async () => {
  const { send } = await setup()
  const missing = await send({ action: 'case-read', sessionId: SESSION_ID, caseId: `sha256:${'b'.repeat(64)}` })
  assert.equal(missing.status, 404)
  assert.match(missing.payload.error, /本机没有这一份评测 Case/)
})

test('run-save 自己生 runId，缺项降级成 unavailable，runs 最近在前', async () => {
  const { send } = await setup()
  const record = caseRecord()
  const hashInput = caseHashInput(record)
  const { payload: { caseId } } = await send({ action: 'case-save', sessionId: SESSION_ID, hashInput, case: record })

  const first = await send({ action: 'run-save', sessionId: SESSION_ID, caseId, run: { model: 'deepseek-chat' } })
  assert.equal(first.status, 200)
  assert.match(first.payload.runId, /^r-[a-z0-9]+-[0-9a-f]{8}$/)

  const second = await send({
    action: 'run-save',
    sessionId: SESSION_ID,
    caseId,
    run: { runId: 'r-after', model: 'deepseek-chat', match: 'match', outcome: { source: 'user', text: '产出可用。' } },
  })
  assert.equal(second.payload.runId, 'r-after')

  const read = await send({ action: 'case-read', sessionId: SESSION_ID, caseId })
  assert.deepEqual(read.payload.runs.map((entry) => entry.runId), ['r-after', first.payload.runId])
  const stored = read.payload.runs[1]
  // 缺项一律 `unavailable`，不是空串、不是 undefined。
  assert.equal(stored.load.status, 'unavailable')
  assert.equal(stored.observedInstructionSha256, 'unavailable')
  assert.equal(stored.outcome.text, 'unavailable')
})

test('会话标识与运行时夹带字段一个字节都不落盘', async () => {
  const { dataRoot, send } = await setup()
  const record = caseRecord()
  const { payload: { caseId } } = await send({
    action: 'case-save',
    sessionId: SESSION_ID,
    hashInput: caseHashInput(record),
    case: record,
  })
  await send({
    action: 'run-save',
    sessionId: SESSION_ID,
    caseId,
    run: {
      model: 'deepseek-chat',
      // 这些名字全是禁字段或白名单之外的：它们必须在 normalizeEvaluationRun 那一层就被丢掉。
      sessionId: SESSION_ID,
      args: { path: '/etc/passwd' },
      toolResult: 'secret',
      score: 87,
      passRate: 0.99,
      vendor: 'nonsense',
    },
  })
  const text = await readAll(join(dataRoot, 'evaluation'))
  assert.equal(text.includes(SESSION_ID), false, '会话标识不许出现在落盘内容里')
  for (const name of ['sessionId', 'toolResult', '"args"', 'score', 'passRate', 'vendor']) {
    assert.equal(text.includes(name), false, `禁字段 / 白名单外的字段不许落盘：${name}`)
  }
  // 正常字段要留着，否则上一条断言会因为文件是空的而通过。
  assert.equal(text.includes('deepseek-chat'), true)
})

test('case-delete 连运行一起删，删完再读就是 404', async () => {
  const { send } = await setup()
  const record = caseRecord()
  const { payload: { caseId } } = await send({
    action: 'case-save',
    sessionId: SESSION_ID,
    hashInput: caseHashInput(record),
    case: record,
  })
  await send({ action: 'run-save', sessionId: SESSION_ID, caseId, run: { runId: 'r-1', model: 'deepseek-chat' } })

  const removed = await send({ action: 'case-delete', sessionId: SESSION_ID, caseId })
  assert.deepEqual(removed.payload, { ok: true, caseId, deleted: true, runsRemoved: 1 })

  const after = await send({ action: 'case-read', sessionId: SESSION_ID, caseId })
  assert.equal(after.status, 404)
})

test('run-capture：读不到会话日志时，条件与工具活动都是 unavailable，不许写成 0', async () => {
  const { dataRoot, send } = await setup()
  const record = caseRecord()
  const { payload: { caseId } } = await send({
    action: 'case-save',
    sessionId: SESSION_ID,
    hashInput: caseHashInput(record),
    case: record,
  })

  // 这个假宿主没有 sdk 的会话日志：`readSessionEvents` 找不到文件。
  const captured = await send({ action: 'run-capture', sessionId: SESSION_ID, caseId })
  assert.equal(captured.status, 200)
  const run = captured.payload.run
  assert.equal(run.model, 'unavailable')
  assert.equal(run.provider, 'unavailable')
  assert.equal(run.contextWindow, 'unavailable')
  assert.equal(run.dshVersion, 'unavailable', 'FR-EVAL-008：DSH 版本没有已验证的读取方式')
  // 关键的一条：日志没找到 ⇒ 工具活动是「拿不到」，不是「0 次」。
  assert.equal(run.runtimeEvents.available, false)
  assert.equal(run.runtimeEvents.total, 0)
  assert.deepEqual(run.runtimeEvents.activities, [])
  const evidence = buildRuntimeEvidence({ case: record, run })
  const use = evidence.stages.find((stage) => stage.id === 'use')
  assert.equal(use.status, 'unavailable')
  assert.equal(use.facts.join(' ').includes('0 次工具活动'), false)
  assert.match(use.facts.join(' '), /读不到/)
  // 判定与结果只能由客户端送来；没送就是「还没有人给过」。
  assert.equal(run.outcome.source, 'unavailable')
  assert.deepEqual(run.judgements, {})
  // 运行记录落到了这个 Case 底下，而不是别处。
  const files = await readdir(join(dataRoot, 'evaluation', 'runs', caseId.slice('sha256:'.length)))
  assert.deepEqual(files, [`${run.runId}.json`])
})

test('run-capture：客户端给的判定与结果原样记下来，宿主的动作名不认识仍是 400', async () => {
  const { send } = await setup()
  const record = caseRecord()
  const { payload: { caseId } } = await send({
    action: 'case-save',
    sessionId: SESSION_ID,
    hashInput: caseHashInput(record),
    case: record,
  })
  const captured = await send({
    action: 'run-capture',
    sessionId: SESSION_ID,
    caseId,
    judgements: { 'obs-1': 'pass' },
    outcome: { source: 'user', text: '产出可用。' },
  })
  assert.equal(captured.status, 200)
  assert.equal(captured.payload.run.outcome.source, 'user')
  assert.equal(captured.payload.run.outcome.text, '产出可用。')
  assert.deepEqual(captured.payload.run.judgements, { 'obs-1': 'pass' })

  const unknown = await send({ action: 'run-everything', sessionId: SESSION_ID, caseId })
  assert.equal(unknown.status, 400)
  assert.match(unknown.payload.error, /动作名不在评测支持的范围内/)

  // 没有 Case 就没有运行可记 —— 404 加一句人话，不是 500。
  const missing = await send({ action: 'run-capture', sessionId: SESSION_ID, caseId: `sha256:${'a'.repeat(64)}` })
  assert.equal(missing.status, 404)
  assert.match(missing.payload.error, /本机没有这一份评测 Case/)
})

test('case-list 按 Skill 名过滤，并带上每个 Case 的运行数', async () => {
  const { send } = await setup()
  for (const skillName of ['ui-craft', 'copywriting']) {
    const record = caseRecord({ skillName })
    await send({ action: 'case-save', sessionId: SESSION_ID, hashInput: caseHashInput(record), case: record })
  }
  const all = await send({ action: 'case-list', sessionId: SESSION_ID })
  assert.equal(all.payload.cases.length, 2)
  const onlyUi = await send({ action: 'case-list', sessionId: SESSION_ID, skillName: 'ui-craft' })
  assert.deepEqual(onlyUi.payload.cases.map((entry) => entry.skillName), ['ui-craft'])
  assert.equal(onlyUi.payload.cases[0].runCount, 0)
})
