import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EVALUATION_FORBIDDEN_FIELDS,
  EVALUATION_STORE_VERSION,
  createEvaluationStore,
  evaluationCaseFile,
  evaluationRunFile,
  inspectEvaluationCase,
  inspectEvaluationRun,
} from '../src/storage/evaluation-store.mjs'

const CASE_ID = `sha256:${'a'.repeat(64)}`
const OTHER_CASE_ID = `sha256:${'b'.repeat(64)}`

async function workspace(context, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-evaluation-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  return { root, store: createEvaluationStore(root, options) }
}

function caseRecord(overrides = {}) {
  return {
    caseId: CASE_ID,
    generatorVersion: '1.0.0',
    skillName: 'ui-craft',
    skillFingerprint: { instructionSha256: 'f'.repeat(64), match: 'match' },
    scopeIds: ['skill-md-rules'],
    changedScopeIds: ['skill-md-rules'],
    primaryScopeId: 'skill-md-rules',
    taskPrompt: { task: '真实任务', goal: '目标', output: '输出', note: '注意', text: '【任务】真实任务' },
    observations: [{ id: 'obs-1', text: '它是否实际使用了相关 Skill？' }],
    regressions: ['这次改动不应影响原有「Ui Craft」的要求。'],
    limitations: [],
    ...overrides,
  }
}

function runRecord(overrides = {}) {
  return {
    caseId: CASE_ID,
    runId: 'r-1',
    model: 'deepseek-chat',
    match: 'match',
    load: { status: 'loaded', seq: 6 },
    runtimeEvents: { activities: [{ name: 'Read', count: 1 }], total: 1 },
    outcome: { source: 'user', text: '产出可用。' },
    ...overrides,
  }
}

test('写入的 Case 按 caseId 命名，读回来一致，并带上 store 自己的 schemaVersion', async (context) => {
  const { root, store } = await workspace(context)
  const saved = await store.saveCase(caseRecord())
  assert.equal(saved.schemaVersion, EVALUATION_STORE_VERSION)
  assert.equal(saved.caseId, CASE_ID)
  assert.equal(existsSync(evaluationCaseFile(root, CASE_ID)), true)
  const read = await store.readCase(CASE_ID)
  assert.equal(read.skillName, 'ui-craft')
  assert.equal(read.taskPrompt.text, '【任务】真实任务')
  assert.deepEqual(read.scopeIds, ['skill-md-rules'])
})

test('目录 0700、文件 0600，且不留临时文件', async (context) => {
  const { root, store } = await workspace(context)
  await store.saveCase(caseRecord())
  const directoryMode = (await stat(join(root, 'cases'))).mode & 0o777
  const fileMode = (await stat(evaluationCaseFile(root, CASE_ID))).mode & 0o777
  assert.equal(directoryMode, 0o700)
  assert.equal(fileMode, 0o600)
  const files = await readdir(join(root, 'cases'))
  assert.deepEqual(files, [`${'a'.repeat(64)}.json`], '目录里只该有那一个文件，没有 .tmp 残留')
})

test('禁字段在任何层级出现都拒绝写入（含嵌套与数组）', async (context) => {
  const { store } = await workspace(context)
  for (const field of ['sessionId', 'messages', 'toolResult', 'score', 'passRate', 'variance']) {
    await assert.rejects(
      () => store.saveCase(caseRecord({ nested: { [field]: 'x' } })),
      new RegExp(`forbidden-field:${field}`),
    )
  }
  await assert.rejects(() => store.saveCase(caseRecord({ observations: [{ id: 'o', text: 't', score: 87 }] })), /forbidden-field:score/)
  await assert.rejects(() => store.saveRun(runRecord({ extra: [{ deep: { args: [] } }] })), /forbidden-field:args/)
  // 常量表本身要留着这些名字：守卫与界面靠它。
  assert.equal(EVALUATION_FORBIDDEN_FIELDS.includes('sessionId'), true)
})

test('非法 caseId / runId 一律拒绝：文件名不能由外部字符串决定', async (context) => {
  const { store } = await workspace(context)
  for (const bad of ['', 'sha256:zz', '../../etc/passwd', `${CASE_ID}/../x`]) {
    await assert.rejects(() => store.saveCase(caseRecord({ caseId: bad })), /invalid-case-id|评测 Case 不可保存/)
  }
  for (const bad of ['', '../x', 'r/1', 'x'.repeat(65)]) {
    await assert.rejects(() => store.saveRun(runRecord({ runId: bad })), /invalid-run-id|评测运行不可保存/)
  }
  assert.equal(await store.readCase('../../etc/passwd'), null)
  assert.equal(await store.readRun(CASE_ID, '../x'), null)
})

test('Run 落在 caseId 的目录下，一个 Case 的多次运行各自成文件', async (context) => {
  const { root, store } = await workspace(context)
  await store.saveCase(caseRecord())
  await store.saveRun(runRecord({ runId: 'r-before', updatedAt: 10 }))
  await store.saveRun(runRecord({ runId: 'r-after', updatedAt: 20 }))
  assert.equal(existsSync(evaluationRunFile(root, CASE_ID, 'r-before')), true)
  const { runs, warningCount } = await store.listRuns(CASE_ID)
  assert.equal(warningCount, 0)
  assert.deepEqual(runs.map((entry) => entry.runId), ['r-before', 'r-after'].sort((a, b) => (a === 'r-after' ? -1 : 1)))
  assert.equal(runs[0].runId, 'r-after', '最近一次运行排在前面')
  const read = await store.readRun(CASE_ID, 'r-before')
  assert.equal(read.load.status, 'loaded')
  assert.equal(read.runtimeEvents.total, 1)
})

test('坏文件与半截 JSON 被跳过并计数，不抛错给界面', async (context) => {
  const { root, store } = await workspace(context)
  await store.saveCase(caseRecord())
  await writeFile(join(root, 'cases', `${'c'.repeat(64)}.json`), '{ 这不是 JSON', 'utf8')
  await writeFile(join(root, 'cases', 'notes.txt'), 'hello', 'utf8')
  const { cases, warningCount } = await store.listCases()
  assert.equal(cases.length, 1)
  assert.equal(warningCount, 1)
  // 读一个坏 caseId 也只是一句 null。
  assert.equal(await store.readCase(`sha256:${'c'.repeat(64)}`), null)
})

test('删 Case 会连它的运行一起删掉，不留孤儿', async (context) => {
  const { root, store } = await workspace(context)
  await store.saveCase(caseRecord())
  await store.saveRun(runRecord())
  const result = await store.deleteCase(CASE_ID)
  assert.equal(result.deleted, true)
  assert.equal(result.runsRemoved, 1)
  assert.equal(existsSync(evaluationCaseFile(root, CASE_ID)), false)
  assert.equal(existsSync(join(root, 'runs', 'a'.repeat(64))), false)
})

test('上限：Case 与每个 Case 的运行数都按最近保留', async (context) => {
  // `updatedAt` 由 store 自己在写盘时盖章，所以这里给一个单调递增的时钟，
  // 否则三次写入的 `Date.now()` 可能落进同一毫秒，排序就没有确定性（这条测试曾经因此变成随机红）。
  let clock = 1000
  const { store } = await workspace(context, { maxCases: 2, maxRunsPerCase: 2, now: () => (clock += 10) })
  for (const hex of ['1', '2', '3']) {
    const caseId = `sha256:${hex.repeat(64)}`
    await store.saveCase(caseRecord({ caseId }))
  }
  const { cases } = await store.listCases()
  assert.equal(cases.length, 2)
  assert.deepEqual(cases.map((entry) => entry.caseId), [`sha256:${'3'.repeat(64)}`, `sha256:${'2'.repeat(64)}`])
  for (const runId of ['r-1', 'r-2', 'r-3']) {
    await store.saveRun(runRecord({ caseId: `sha256:${'3'.repeat(64)}`, runId }))
  }
  const { runs } = await store.listRuns(`sha256:${'3'.repeat(64)}`)
  assert.equal(runs.length, 2)
  assert.deepEqual(runs.map((entry) => entry.runId), ['r-3', 'r-2'])
})

test('检查器是纯函数：结构不对就说原因，不抛错', () => {
  assert.deepEqual(inspectEvaluationCase(null), { ok: false, reason: 'not-an-object' })
  assert.deepEqual(inspectEvaluationCase(caseRecord({ taskPrompt: null })), { ok: false, reason: 'missing-task-prompt' })
  assert.deepEqual(inspectEvaluationCase(caseRecord({ taskPrompt: { text: '' } })), { ok: false, reason: 'missing-task-prompt-text' })
  assert.deepEqual(inspectEvaluationRun(runRecord({ runId: '' })), { ok: false, reason: 'invalid-run-id' })
  assert.equal(inspectEvaluationCase(caseRecord()).ok, true)
  assert.equal(inspectEvaluationRun(runRecord()).ok, true)
  // 两个 Case 的 id 不同 ⇒ 文件名不同（对照的前提之一：身份不同就不是同一个 Case）。
  assert.notEqual(OTHER_CASE_ID, CASE_ID)
})
