/**
 * V1.4 触发评测的落盘面（`src/storage/trigger-evaluation-store.mjs`，`FR-TRIG-018`）。
 *
 * 关心的是**三道闸真的合上**：
 *   1. 禁字段深扫（`sessionId` / `args` / `toolResult` / `score` / `passRate` / `ranking` / `trend`）；
 *   2. 三态与限制词表的**闭集校验** —— 认不出的值拒收，不许「先存下来再说」；
 *   3. 原子写 + `0700`/`0600` + 读取端 fail-soft（坏文件跳过并计数）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  TRIGGER_STORE_DEFAULTS,
  createTriggerEvaluationStore,
  inspectTriggerCase,
  inspectTriggerRun,
  triggerCaseFile,
  triggerRunFile,
} from '../src/storage/trigger-evaluation-store.mjs'

const CASE_ID = `sha256:${'a'.repeat(64)}`

function caseRecord(overrides = {}) {
  return {
    caseId: CASE_ID,
    skillName: 'ui-craft',
    title: '抽表格',
    prompt: '请把这份 PDF 的表格抽出来。',
    expectedTrigger: true,
    ...overrides,
  }
}

function runRecord(overrides = {}) {
  return {
    caseId: CASE_ID,
    runId: 't-1',
    observedAt: 1_760_000_000_000,
    conditions: { model: 'deepseek-chat', provider: 'deepseek', reasoningEffort: 'high', contextWindow: 128_000, pluginVersion: '1.4.0' },
    observation: 'loaded',
    invocationType: 'model',
    coverage: 'complete',
    freshSession: 'user-confirmed',
    skillFingerprint: `sha256:${'b'.repeat(64)}`,
    descriptionFingerprint: `sha256:${'c'.repeat(64)}`,
    evidenceRefs: ['trigger-evidence:abc'],
    limitations: ['load-is-protocol-fact'],
    outcome: 'observed-expected',
    ...overrides,
  }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'st-trigger-store-'))
  return { root, store: createTriggerEvaluationStore(root, { maxCases: 3, maxRunsPerCase: 2 }) }
}

test('存取一轮：文件落在 trigger-suites / trigger-runs 下，权限位是 0700/0600', async () => {
  const { root, store } = await setup()
  await store.saveCase(caseRecord())
  await store.saveRun(runRecord())

  const readBack = await store.readCase(CASE_ID)
  assert.equal(readBack.skillName, 'ui-craft')
  const runs = await store.listRuns(CASE_ID)
  assert.equal(runs.runs.length, 1)
  assert.equal(runs.runs[0].outcome, 'observed-expected')

  const casePath = triggerCaseFile(root, CASE_ID)
  const runPath = triggerRunFile(root, CASE_ID, 't-1')
  assert.equal((await stat(join(root, 'trigger-suites'))).mode & 0o777, 0o700)
  assert.equal((await stat(casePath)).mode & 0o777, 0o600)
  assert.equal((await stat(runPath)).mode & 0o777, 0o600)
  // 与 V1.0 的两套目录并存而不互相覆盖。
  assert.equal(triggerCaseFile(root, CASE_ID).includes('/trigger-suites/'), true)
  assert.equal(triggerRunFile(root, CASE_ID, 't-1').includes('/trigger-runs/'), true)
})

test('禁字段深扫：会话标识与分数在任何层级都拒收', () => {
  assert.equal(inspectTriggerCase(caseRecord({ sessionId: 's' })).reason, 'forbidden-field:sessionId')
  assert.equal(inspectTriggerCase(caseRecord({ nested: { sessionId: 's' } })).reason, 'forbidden-field:sessionId')
  assert.equal(inspectTriggerRun(runRecord({ args: {} })).reason, 'forbidden-field:args')
  assert.equal(inspectTriggerRun(runRecord({ score: 1 })).reason, 'forbidden-field:score')
  assert.equal(inspectTriggerRun(runRecord({ passRate: 0.5 })).reason, 'forbidden-field:passRate')
  assert.equal(inspectTriggerRun(runRecord({ ranking: [] })).reason, 'forbidden-field:ranking')
  assert.equal(inspectTriggerRun(runRecord({ trend: [] })).reason, 'forbidden-field:trend')
  assert.equal(inspectTriggerRun(runRecord({ conditions: { toolResult: 'x' } })).reason, 'forbidden-field:toolResult')
})

test('闭集校验：三态认不出的值拒收，限制项不许自己现写', () => {
  assert.equal(inspectTriggerRun(runRecord({ observation: 'not-triggered' })).reason, 'invalid-observation')
  assert.equal(inspectTriggerRun(runRecord({ invocationType: 'auto' })).reason, 'invalid-invocation-type')
  assert.equal(inspectTriggerRun(runRecord({ coverage: 'full' })).reason, 'invalid-coverage')
  assert.equal(inspectTriggerRun(runRecord({ freshSession: 'confirmed' })).reason, 'invalid-fresh-session')
  assert.equal(inspectTriggerRun(runRecord({ outcome: 'pass' })).reason, 'invalid-outcome')
  assert.equal(inspectTriggerRun(runRecord({ limitations: ['looks-good-to-me'] })).reason, 'unknown-limitation:looks-good-to-me')
})

test('saveCase / saveRun 对不合规记录直接抛错，不落盘', async () => {
  const { root, store } = await setup()
  await assert.rejects(() => store.saveCase(caseRecord({ sessionId: 's' })), /触发用例不可保存/)
  await assert.rejects(() => store.saveRun(runRecord({ coverage: 'full' })), /触发观察不可保存/)
  const suites = await readdir(join(root, 'trigger-suites')).catch(() => [])
  assert.deepEqual(suites, [])
})

test('读取端 fail-soft：坏文件跳过并计数，不把整块界面对不起来', async () => {
  const { root, store } = await setup()
  await store.saveCase(caseRecord())
  await mkdir(join(root, 'trigger-suites'), { recursive: true })
  await writeFile(join(root, 'trigger-suites', `${'d'.repeat(64)}.json`), '{ 这不是 JSON', 'utf8')
  const listed = await store.listCases()
  assert.equal(listed.cases.length, 1)
  assert.equal(listed.warningCount, 1)
})

test('上限生效：用例数与每个用例的观察数都被裁到上限', async () => {
  const { store } = await setup()
  for (let index = 0; index < TRIGGER_STORE_DEFAULTS.maxRunsPerCase + 2; index += 1) {
    await store.saveCase(caseRecord())
    await store.saveRun(runRecord({ runId: `t-${index}` }))
  }
  const runs = await store.listRuns(CASE_ID)
  assert.ok(runs.runs.length <= 2, `每个用例最多留 2 次观察，实际 ${runs.runs.length}`)
})

test('删用例带走它的观察目录', async () => {
  const { root, store } = await setup()
  await store.saveCase(caseRecord())
  await store.saveRun(runRecord())
  const removed = await store.deleteCase(CASE_ID)
  assert.equal(removed.deleted, true)
  assert.equal(removed.runsRemoved, 1)
  assert.equal(await readFile(triggerCaseFile(root, CASE_ID), 'utf8').catch(() => null), null)
})
