/**
 * V1.4「Skill Trigger Evaluation」——纯函数层（`src/core/skill-trigger-evaluation.mjs`）的
 * 行为与边界（`FR-TRIG-*`）。
 *
 * 这一层不 import 任何 DSH 包、不读文件、不调模型。这里锁的是四件事：
 * **身份怎么算**、**观察怎么收敛成三态**、**覆盖怎么才敢叫 complete**、
 * **什么时候必须降级成 inconclusive**。
 *
 * 用例矩阵对着 `01_重构方案/dsh-skill-intelligence-v1.4.0-development-plan.md` §Phase 1 的
 * 七种情形写：正向、负向、覆盖不足、显式调用、失败加载、旧指纹、历史 Run。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRIGGER_CASE_HASH_DOMAIN,
  TRIGGER_CASE_SCHEMA_VERSION,
  TRIGGER_CONDITION_FIELDS,
  TRIGGER_FIXED_SENTENCES,
  TRIGGER_FORBIDDEN_WORDS,
  TRIGGER_LIMITATION_LABELS,
  TRIGGER_OBSERVATION_LABELS,
  TRIGGER_OUTCOME_LABELS,
  TRIGGER_PROMPT_MAX_CHARS,
  TRIGGER_UNAVAILABLE_TEXT,
  buildTriggerCase,
  compareTriggerRuns,
  normalizeTriggerRun,
  triggerCaseHashInput,
  triggerCoverageOf,
  triggerEvidenceHashInput,
  triggerLimitationsOf,
  triggerObservationOf,
  triggerObservationSentence,
  triggerOutcomeOf,
} from '../src/core/skill-trigger-evaluation.mjs'
import { EVALUATION_CASE_HASH_DOMAIN } from '../src/core/skill-evaluation.mjs'

// ---------------------------------------------------------------------------------------------
// 构造器
// ---------------------------------------------------------------------------------------------

function loadedTrace(overrides = {}) {
  return {
    skillName: 'pdf-processing',
    status: 'loaded',
    invocationType: 'model-invoked',
    coverage: 'observed-tool-contract',
    callSeq: 12,
    resultSeq: 15,
    ...overrides,
  }
}

function runInput(overrides = {}) {
  return {
    caseId: 'sha256:' + 'a'.repeat(64),
    observedAt: 1_760_000_000_000,
    conditions: { model: 'deepseek-chat', provider: 'deepseek', reasoningEffort: 'high', contextWindow: 128_000, pluginVersion: '1.4.0' },
    observation: 'loaded',
    invocationType: 'model',
    coverage: 'complete',
    freshSession: 'user-confirmed',
    skillFingerprint: 'sha256:' + 'b'.repeat(64),
    descriptionFingerprint: 'sha256:' + 'c'.repeat(64),
    expectedTrigger: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------------------------
// Case 身份：稳定、无指纹、无时间、与 V1.0 分域
// ---------------------------------------------------------------------------------------------

test('triggerCaseHashInput：同一用例永远得到同一串哈希输入', () => {
  const a = buildTriggerCase({ skillName: 'pdf-processing', title: '抽表格', prompt: '请读取这份 PDF 并提取表格。', expectedTrigger: true })
  const b = buildTriggerCase({ skillName: 'pdf-processing', title: '抽表格', prompt: '请读取这份 PDF 并提取表格。', expectedTrigger: true })
  assert.equal(a.available, true)
  assert.equal(a.hashInput, b.hashInput)
})

test('triggerCaseHashInput：不含 Skill 指纹（改 description 后同一用例仍是同一身份）', () => {
  const input = { skillName: 'pdf-processing', title: '抽表格', prompt: '提取表格', expectedTrigger: true }
  const before = triggerCaseHashInput({ ...input, skillFingerprint: 'sha256:' + '1'.repeat(64) })
  const after = triggerCaseHashInput({ ...input, skillFingerprint: 'sha256:' + '2'.repeat(64) })
  assert.equal(before, after)
  assert.ok(!before.includes('sha256:' + '1'.repeat(64)))
  assert.ok(!/sha256:[a-f0-9]{64}/.test(before), '哈希输入里不许出现任何指纹')
})

test('triggerCaseHashInput：与 V1.0 的 Case 分域，且期望行为参与身份', () => {
  const input = { skillName: 'pdf-processing', title: '抽表格', prompt: '提取表格' }
  assert.ok(triggerCaseHashInput({ ...input, expectedTrigger: true }).startsWith(`${TRIGGER_CASE_HASH_DOMAIN}@${TRIGGER_CASE_SCHEMA_VERSION}`))
  assert.notEqual(triggerCaseHashInput({ ...input, expectedTrigger: true }), triggerCaseHashInput({ ...input, expectedTrigger: false }))
  assert.notEqual(TRIGGER_CASE_HASH_DOMAIN, EVALUATION_CASE_HASH_DOMAIN)
})

test('buildTriggerCase：缺字段与超长提示词都返回不可用，且不静默截断', () => {
  assert.equal(buildTriggerCase({ title: 'x', prompt: 'y' }).reason, 'missing-skill-name')
  assert.equal(buildTriggerCase({ skillName: 's', prompt: 'y' }).reason, 'missing-title')
  assert.equal(buildTriggerCase({ skillName: 's', title: 't' }).reason, 'missing-prompt')
  const tooLong = buildTriggerCase({ skillName: 's', title: 't', prompt: 'あ'.repeat(TRIGGER_PROMPT_MAX_CHARS + 1) })
  assert.equal(tooLong.available, false)
  assert.equal(tooLong.reason, 'prompt-too-long')
  assert.equal(tooLong.case, null)
})

test('buildTriggerCase：提示词逐字保留（只去首尾空白），因为用户要原样贴进新会话', () => {
  const built = buildTriggerCase({ skillName: 's', title: 't', prompt: '  第一行\n\n第二行  ', expectedTrigger: false })
  assert.equal(built.case.prompt, '第一行\n\n第二行')
  assert.equal(built.case.expectedTrigger, false)
})

// ---------------------------------------------------------------------------------------------
// 观察三态
// ---------------------------------------------------------------------------------------------

test('triggerObservationOf：有加载记录 ⇒ loaded，并报出调用方式', () => {
  const model = triggerObservationOf({ skillName: 'pdf-processing', coverage: 'complete', traces: [loadedTrace()] })
  assert.equal(model.observation, 'loaded')
  assert.equal(model.invocationType, 'model')
  const explicit = triggerObservationOf({ skillName: 'pdf-processing', coverage: 'complete', traces: [loadedTrace({ invocationType: 'user-explicit' })] })
  assert.equal(explicit.observation, 'loaded')
  assert.equal(explicit.invocationType, 'user-explicit')
})

test('triggerObservationOf：显式调用与模型调用同时存在时，以模型调用为准', () => {
  const both = triggerObservationOf({
    skillName: 'pdf-processing',
    coverage: 'complete',
    traces: [loadedTrace({ invocationType: 'user-explicit', callSeq: 3 }), loadedTrace({ callSeq: 9 })],
  })
  assert.equal(both.invocationType, 'model')
  assert.equal(both.loadedCount, 2)
})

test('triggerObservationOf：覆盖不足时是 unknown，不是 not-observed', () => {
  for (const coverage of ['partial', 'unknown']) {
    const seen = triggerObservationOf({ skillName: 'pdf-processing', coverage, traces: [] })
    assert.equal(seen.observation, 'unknown', `coverage=${coverage} 不许说成未观察到`)
    assert.equal(seen.reason, coverage === 'partial' ? 'coverage-partial' : 'coverage-unknown')
  }
})

test('triggerObservationOf：读全了、身份对得上、确实没有记录 ⇒ not-observed', () => {
  const seen = triggerObservationOf({ skillName: 'pdf-processing', coverage: 'complete', traces: [loadedTrace({ skillName: '另一个-skill' })] })
  assert.equal(seen.observation, 'not-observed')
  assert.equal(seen.invocationType, 'unknown')
})

test('triggerObservationOf：身份对不上 ⇒ unknown（不猜）', () => {
  const seen = triggerObservationOf({ skillName: 'pdf-processing', coverage: 'complete', traces: [], identityMismatch: true })
  assert.equal(seen.observation, 'unknown')
  assert.equal(seen.reason, 'identity-mismatch')
})

// ---------------------------------------------------------------------------------------------
// 覆盖三态：complete 是有前提的
// ---------------------------------------------------------------------------------------------

test('triggerCoverageOf：六个条件全满足才叫 complete，破一个就降级', () => {
  const clean = { found: true, read: { bytes: 4096, frameCount: 3, framesDecoded: 3, framesSkipped: 0, frameLimitHit: false, linesSkipped: 0, tornTail: false, oversized: false, unreadable: false } }
  assert.equal(triggerCoverageOf(clean), 'complete')
  assert.equal(triggerCoverageOf({ ...clean, read: { ...clean.read, framesSkipped: 1 } }), 'partial')
  assert.equal(triggerCoverageOf({ ...clean, read: { ...clean.read, frameLimitHit: true } }), 'partial')
  assert.equal(triggerCoverageOf({ ...clean, read: { ...clean.read, linesSkipped: 1 } }), 'partial')
  assert.equal(triggerCoverageOf({ ...clean, read: { ...clean.read, tornTail: true } }), 'partial')
})

test('triggerCoverageOf：一点都没读到 ⇒ unknown（不是 partial）', () => {
  assert.equal(triggerCoverageOf({ found: false }), 'unknown')
  assert.equal(triggerCoverageOf({ found: true, read: { unreadable: true, bytes: 10 } }), 'unknown')
  assert.equal(triggerCoverageOf({ found: true, read: { oversized: true, bytes: 600 * 1024 * 1024 } }), 'unknown')
  assert.equal(triggerCoverageOf({ found: true, read: { bytes: 0 } }), 'unknown')
  assert.equal(triggerCoverageOf({ found: true, error: 'no frame could be decoded' }), 'unknown')
})

test('triggerCoverageOf：活会话的内存事件流就是完整的', () => {
  assert.equal(triggerCoverageOf({ found: true, read: { live: true, bytes: 0, frameCount: 0 } }), 'complete')
})

test('triggerCoverageOf：参数漏传 found 时不许默认成 complete', () => {
  // 初版吃过一次：把 read 散着传进来、忘了 found，于是全部误判 unknown。
  // 现在它必须**安全地失败**，而不是安全地通过。
  assert.equal(triggerCoverageOf({ bytes: 100, frameCount: 1, framesDecoded: 1 }), 'unknown')
  assert.equal(triggerCoverageOf({}), 'unknown')
  assert.equal(triggerCoverageOf(), 'unknown')
})

// ---------------------------------------------------------------------------------------------
// 对照四态：只许降级，不许升格
// ---------------------------------------------------------------------------------------------

test('triggerOutcomeOf：正向与负向的两种「观察到」', () => {
  assert.equal(triggerOutcomeOf({ expectedTrigger: true, observation: 'loaded', invocationType: 'model', coverage: 'complete', freshSession: 'user-confirmed' }), 'observed-expected')
  assert.equal(triggerOutcomeOf({ expectedTrigger: false, observation: 'loaded', invocationType: 'model', coverage: 'complete', freshSession: 'user-confirmed' }), 'observed-unexpected')
})

test('triggerOutcomeOf：显式调用永远 inconclusive，不算自然触发成功', () => {
  for (const expectedTrigger of [true, false]) {
    assert.equal(triggerOutcomeOf({ expectedTrigger, observation: 'loaded', invocationType: 'user-explicit', coverage: 'complete', freshSession: 'user-confirmed' }), 'inconclusive')
  }
})

test('triggerOutcomeOf：未观察到加载要同时满足「覆盖完整」与「用户声明新会话」', () => {
  const base = { expectedTrigger: false, observation: 'not-observed', invocationType: 'unknown' }
  assert.equal(triggerOutcomeOf({ ...base, coverage: 'complete', freshSession: 'user-confirmed' }), 'not-observed-with-coverage')
  assert.equal(triggerOutcomeOf({ ...base, coverage: 'complete', freshSession: 'unconfirmed' }), 'inconclusive')
  assert.equal(triggerOutcomeOf({ ...base, coverage: 'partial', freshSession: 'user-confirmed' }), 'inconclusive')
  assert.equal(triggerOutcomeOf({ ...base, coverage: 'unknown', freshSession: 'user-confirmed' }), 'inconclusive')
})

test('triggerOutcomeOf：调用方式无法判断时不许当成模型触发', () => {
  assert.equal(triggerOutcomeOf({ expectedTrigger: true, observation: 'loaded', invocationType: 'unknown', coverage: 'complete', freshSession: 'user-confirmed' }), 'inconclusive')
})

test('triggerOutcomeOf：unknown 一律 inconclusive（含失败加载这类观察不到的形态）', () => {
  assert.equal(triggerOutcomeOf({ expectedTrigger: true, observation: 'unknown', invocationType: 'model', coverage: 'complete', freshSession: 'user-confirmed' }), 'inconclusive')
  assert.equal(triggerOutcomeOf({}), 'inconclusive')
})

// ---------------------------------------------------------------------------------------------
// Run 归一：字段表、限制词表、隐私
// ---------------------------------------------------------------------------------------------

test('normalizeTriggerRun：缺项写 unavailable，不写默认值', () => {
  const run = normalizeTriggerRun({ conditions: {} })
  assert.equal(run.conditions.model, TRIGGER_UNAVAILABLE_TEXT)
  assert.equal(run.conditions.contextWindow, TRIGGER_UNAVAILABLE_TEXT)
  assert.equal(run.skillFingerprint, TRIGGER_UNAVAILABLE_TEXT)
  assert.equal(run.descriptionFingerprint, TRIGGER_UNAVAILABLE_TEXT)
  assert.equal(run.observation, 'unknown')
  assert.equal(run.freshSession, 'unconfirmed')
  assert.equal(run.outcome, 'inconclusive')
})

test('normalizeTriggerRun：裸 hex 补一个 sha256: 前缀，unavailable 不许被写成指纹', () => {
  const run = normalizeTriggerRun(runInput({ skillFingerprint: 'd'.repeat(64), descriptionFingerprint: TRIGGER_UNAVAILABLE_TEXT }))
  assert.equal(run.skillFingerprint, `sha256:${'d'.repeat(64)}`)
  assert.equal(run.descriptionFingerprint, TRIGGER_UNAVAILABLE_TEXT)
  assert.ok(!run.descriptionFingerprint.startsWith('sha256:'))
})

test('normalizeTriggerRun：落盘记录里绝不出现会话标识', () => {
  const run = normalizeTriggerRun({ ...runInput({}), sessionId: 'session-should-not-survive', sessionID: 'x' })
  assert.ok(!Object.prototype.hasOwnProperty.call(run, 'sessionId'))
  assert.ok(!Object.prototype.hasOwnProperty.call(run, 'sessionID'))
  assert.ok(!JSON.stringify(run).includes('session-should-not-survive'))
})

test('normalizeTriggerRun：限制项只来自封闭词表，且证据引用有上限', () => {
  const run = normalizeTriggerRun(runInput({
    observation: 'not-observed',
    invocationType: 'unknown',
    coverage: 'partial',
    freshSession: 'user-confirmed',
    skillFingerprint: TRIGGER_UNAVAILABLE_TEXT,
    descriptionFingerprint: TRIGGER_UNAVAILABLE_TEXT,
    live: true,
    evidenceRefs: Array.from({ length: 20 }, (_, index) => `ref-${index}`),
  }))
  assert.ok(run.limitations.length > 0)
  for (const id of run.limitations) assert.ok(Object.prototype.hasOwnProperty.call(TRIGGER_LIMITATION_LABELS, id), `未知限制项 ${id}`)
  assert.ok(run.limitations.includes('coverage-partial'))
  assert.ok(run.limitations.includes('invocation-ambiguous'))
  assert.ok(run.limitations.includes('observation-scoped-to-now'))
  assert.ok(run.limitations.includes('no-load-record-is-not-no-trigger'))
  assert.ok(run.limitations.includes('skill-fingerprint-unavailable'))
  assert.equal(run.evidenceRefs.length, 8)
})

test('triggerLimitationsOf：活会话才带「只到此刻」那句，durable 日志不带', () => {
  const live = triggerLimitationsOf({ observation: 'loaded', coverage: 'complete', invocationType: 'model', live: true })
  const durable = triggerLimitationsOf({ observation: 'loaded', coverage: 'complete', invocationType: 'model', live: false })
  assert.ok(live.includes('observation-scoped-to-now'))
  assert.ok(!durable.includes('observation-scoped-to-now'))
})

// ---------------------------------------------------------------------------------------------
// 两次 Run 的对照
// ---------------------------------------------------------------------------------------------

test('compareTriggerRuns：条件一致才可比；description 指纹变了只说「变了」', () => {
  const before = normalizeTriggerRun(runInput({ expectedTrigger: false, observation: 'loaded', invocationType: 'model' }))
  const sameConditionsChangedDescription = normalizeTriggerRun(runInput({ expectedTrigger: false, observation: 'not-observed', invocationType: 'unknown', descriptionFingerprint: 'sha256:' + 'e'.repeat(64) }))
  const compared = compareTriggerRuns({ before, after: sameConditionsChangedDescription })
  assert.equal(compared.comparable, true)
  assert.equal(compared.descriptionChanged, true)
  assert.equal(compared.axis, 'before-after')
})

test('compareTriggerRuns：条件不同就不给对照，并逐项列出差异', () => {
  const before = normalizeTriggerRun(runInput({}))
  const after = normalizeTriggerRun(runInput({ conditions: { model: '另一个模型', provider: 'other', reasoningEffort: 'low', contextWindow: 32_000, pluginVersion: '1.4.0' } }))
  const compared = compareTriggerRuns({ before, after })
  assert.equal(compared.comparable, false)
  assert.equal(compared.reason, 'conditions-differ')
  assert.equal(compared.differences.length, 4)
  for (const diff of compared.differences) assert.ok(TRIGGER_CONDITION_FIELDS.some((field) => field.key === diff.key))
})

test('compareTriggerRuns：不同 Case 之间不许对照', () => {
  const compared = compareTriggerRuns({ before: normalizeTriggerRun(runInput({})), after: normalizeTriggerRun(runInput({ caseId: 'sha256:' + 'f'.repeat(64) })) })
  assert.equal(compared.comparable, false)
  assert.equal(compared.reason, 'different-case')
})

// ---------------------------------------------------------------------------------------------
// 证据引用与文案
// ---------------------------------------------------------------------------------------------

test('triggerEvidenceHashInput：只装事实，不装会话标识与路径', () => {
  const input = triggerEvidenceHashInput([loadedTrace(), loadedTrace({ skillName: 'other', status: 'failed', callSeq: null, resultSeq: null })])
  assert.ok(input.startsWith(`${TRIGGER_CASE_HASH_DOMAIN}:evidence@1`))
  assert.ok(input.includes('skill:pdf-processing'))
  assert.ok(input.includes('status:failed'))
  assert.ok(!/session[-_]?[0-9a-f]{8}/i.test(input))
  assert.ok(!input.includes('/'))
})

test('triggerObservationSentence：只说事实，不给结论', () => {
  assert.match(triggerObservationSentence({ observation: 'loaded', invocationType: 'model' }), /观察到加载/)
  assert.match(triggerObservationSentence({ observation: 'not-observed' }), /未观察到加载/)
  assert.match(triggerObservationSentence({ observation: 'unknown' }), /无法判断/)
  for (const word of TRIGGER_FORBIDDEN_WORDS) {
    for (const sentence of Object.values(TRIGGER_OBSERVATION_LABELS).concat(Object.values(TRIGGER_OUTCOME_LABELS))) assert.ok(!sentence.includes(word), `文案里不许出现「${word}」`)
  }
})

test('固定说明句是界面合同的一部分', () => {
  assert.ok(TRIGGER_FIXED_SENTENCES.includes('没有观察到加载 ≠ 没有触发'))
  assert.ok(TRIGGER_FIXED_SENTENCES.includes('加载 ≠ 模型采纳了它'))
  assert.ok(TRIGGER_FIXED_SENTENCES.includes('显式调用不算自然触发'))
  assert.ok(TRIGGER_FIXED_SENTENCES.includes('不打分、不排名、不自动运行'))
})
