import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  EVIDENCE_BOUNDARY_IDS,
  EVIDENCE_CHAIN_STAGE_IDS,
  EVIDENCE_DRIFT_IDS,
  EVIDENCE_EXPORT_FORBIDDEN_KEYS,
  EVIDENCE_EXPORT_SCHEMA_VERSION,
  EVIDENCE_LIMITATION_CODES,
  EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_STATUS_IDS,
  EVIDENCE_SUBJECT_IDS,
  EVIDENCE_TABLE_COLUMNS,
  buildEvidenceExport,
  buildSkillEvidence,
  evidenceIdOf,
  evidenceRows,
  evidenceStatusCounts,
  normalizeEvidenceStatus,
  receiptReference,
} from '../src/core/skill-evidence.mjs'

const root = new URL('../', import.meta.url)
const source = readFileSync(fileURLToPath(new URL('src/core/skill-evidence.mjs', root)), 'utf8')

const fingerprintA = `sha256:${'a1'.repeat(32)}`
const fingerprintB = `sha256:${'b2'.repeat(32)}`

// 这一支的判据全部是「说法」，不是「函数返回了东西」。所以三份输入刻意只差**证据**：
// 没有运行记录 / 有加载记录 / 证据绑在另一份 fingerprint 上。
function inputWith(extra = {}) {
  const base = {
    skillName: 'code-review',
    summary: { provider: 'filesystem', source: 'user-agents' },
    definition: { content: { sha256: fingerprintA } },
    observation: { currentInstructionSha256: fingerprintA, observedInstructionSha256: [], match: 'unavailable' },
    runs: [],
    evidence: { scope: {}, invocations: [] },
    validation: { status: 'pass', summary: { errors: 0, warnings: 0, info: 1, skipped: 4 } },
    evaluation: { cases: [], runs: [], comparison: null, selectedCaseId: null },
  }
  return {
    ...base,
    ...extra,
    observation: { ...base.observation, ...(extra.observation ?? {}) },
    evidence: { ...base.evidence, ...(extra.evidence ?? {}) },
    evaluation: { ...base.evaluation, ...(extra.evaluation ?? {}) },
  }
}

const loadedInput = inputWith({
  runs: [{ status: 'loaded', turn: 7, step: 3, requestedAt: 1712000000000, observedInstructionSha256: fingerprintA }],
  observation: { match: 'match', observedInstructionSha256: [fingerprintA] },
  evidence: {
    scope: { established: true, relationStatus: 'correlated', derivation: 'same-turn-containment', eventCount: 30 },
    invocations: [{ kind: 'tool', name: 'bash' }, { kind: 'cli', name: 'git' }, { kind: 'tool', name: 'read' }],
  },
  evaluation: {
    cases: [{ caseId: 'case-1', skillFingerprint: { instructionSha256: fingerprintA } }],
    runs: [],
    selectedCaseId: 'case-1',
  },
})

const historicalInput = inputWith({
  observation: { match: 'mismatch', observedInstructionSha256: [fingerprintB] },
  evaluation: {
    cases: [{ caseId: 'case-1', skillFingerprint: { instructionSha256: fingerprintB } }],
    runs: [{ runId: 'r-1', observedInstructionSha256: fingerprintB, turn: 3, step: 1 }],
    selectedCaseId: 'case-1',
  },
})

test('the evidence model is a pure reader: no imports, no clock, no randomness, no I/O', () => {
  // 这一层是「同一份事实，永远得到同一个 id」的来源。任何一处 I/O 或时钟都会让界面上的
  // 证据 id 在下一次刷新时变掉，而「同一条证据」正是这一屏要表达的东西。
  //
  // 注释里**允许**出现 `Date.now()` / `Math.random()` —— 那正是文件开头用来解释「为什么不用它们」
  // 的写法；所以先剥掉注释再扫，否则守卫会因为文档提到了它而报错，然后被人加一个白名单绕过去。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
  for (const forbidden of ['\nimport ', "require('", 'readFile', 'process.', 'Date.now(', 'Math.random(']) {
    assert.ok(!code.includes(forbidden), `the evidence core must not carry ${forbidden}`)
  }
  assert.ok(source.includes('EVIDENCE_HASH_DOMAIN'), 'the hash input keeps a domain prefix, so a v2 shape cannot silently reuse v1 ids')
})

test('the three states are the vocabulary, and nothing else may be invented', () => {
  assert.deepEqual(EVIDENCE_STATUS_IDS, ['declared', 'observed', 'unavailable'])
  // 未知词一律落到 unavailable：宁可说「没拿到」，也不能把没见过的状态当成一种新状态显示出来。
  // 大写也不认 —— 词表是本模块自己产出的封闭清单，不做「猜你想说什么」的归一化。
  assert.equal(normalizeEvidenceStatus('declared'), 'declared')
  assert.equal(normalizeEvidenceStatus('observed'), 'observed')
  assert.equal(normalizeEvidenceStatus('Observed'), 'unavailable')
  assert.equal(normalizeEvidenceStatus('succeeded'), 'unavailable')
  assert.equal(normalizeEvidenceStatus(undefined), 'unavailable')
})

test('an empty input still answers — with "unavailable", not with a throw and not with a denial', () => {
  const model = buildSkillEvidence()
  assert.equal(model.schemaVersion, EVIDENCE_SCHEMA_VERSION)
  assert.equal(model.skillName, 'unavailable')
  const counts = evidenceStatusCounts(model)
  assert.deepEqual(counts, { declared: 2, observed: 0, unavailable: 10, total: 12 })
  // 「没看到」不能写成「没发生」：这两句话在界面上长得像，含义正好相反。
  const words = [model.chain, model.boundaries, model.table].flat().flatMap((entry) => [
    ...(entry.facts ?? []).map((item) => item.value?.zh ?? ''),
    entry.claim?.zh ?? '',
    entry.fact?.zh ?? '',
    entry.label?.zh ?? '',
  ]).join('\n')
  for (const forbidden of ['已执行', '未执行', '已完成', '已加载', '没有发生']) {
    assert.ok(!words.includes(forbidden), `the evidence model must never say ${forbidden}`)
  }
})

test('without run evidence the chain is declared → unavailable, and it says why', () => {
  const model = buildSkillEvidence(inputWith())
  assert.deepEqual(model.chain.map((stage) => stage.id), EVIDENCE_CHAIN_STAGE_IDS)
  assert.deepEqual(model.chain.map((stage) => stage.status), ['declared', 'unavailable', 'unavailable', 'unavailable'])
  assert.equal(model.drift.state, 'no-matching-evidence')
  assert.deepEqual(model.drift.evidenceFingerprints, [])
  assert.ok(model.chain[1].limitations.some((item) => item.code === 'load-does-not-prove-content-use'))
})

test('a loaded record is evidence of loading — never evidence that its content was used', () => {
  const model = buildSkillEvidence(loadedInput)
  const byStage = Object.fromEntries(model.chain.map((stage) => [stage.id, stage]))
  assert.equal(byStage.definition.status, 'declared')
  assert.equal(byStage.load.status, 'observed')
  assert.equal(byStage.use.status, 'observed')
  // 后面这一段是这一支最容易被「顺下来」的地方：有加载记录 + 同一 Turn 里有工具调用，
  // 看起来就是「Skill 起作用了」。这里钉的是它**同时**带着两条限制。
  const codes = byStage.load.limitations.map((item) => item.code)
  assert.ok(codes.includes('load-does-not-prove-content-use'))
  assert.equal(model.chain[1].reference, 'receipt:turn7.step3')
  assert.equal(model.chain[2].limitations.some((item) => item.code === 'use-evidence-is-circumstantial'), true)
  assert.equal(byStage.use.reference, 'scope:same-turn-containment/correlated')
})

test('the causal boundary is unavailable even when an outcome was observed', () => {
  // 这是 §26 那条不等式在代码里的落点：结果 ≠ 这个 Skill 造成的。
  const observedOutcome = inputWith({
    ...loadedInput,
    evaluation: {
      cases: [{ caseId: 'case-1', skillFingerprint: { instructionSha256: fingerprintA } }],
      runs: [{
        runId: 'r-9', observedInstructionSha256: fingerprintA, currentInstructionSha256: fingerprintA,
        match: 'match', turn: 3, step: 2, outcome: { source: 'user', text: '通过' },
      }],
      comparison: null,
      selectedCaseId: 'case-1',
    },
  })
  const model = buildSkillEvidence(observedOutcome)
  assert.equal(model.chain.find((stage) => stage.id === 'outcome').status, 'observed')
  const causal = model.boundaries.find((entry) => entry.id === 'causal-claim')
  assert.equal(causal.status, 'unavailable')
  assert.equal(causal.limitation.code, 'outcome-is-not-causal-attribution')
  assert.deepEqual(model.boundaries.map((entry) => entry.id), EVIDENCE_BOUNDARY_IDS)
})

test('drift reports which fingerprint the evidence is bound to — current, historical, or none', () => {
  assert.equal(buildSkillEvidence(loadedInput).drift.state, 'current')
  const historical = buildSkillEvidence(historicalInput)
  assert.equal(historical.drift.state, 'historical')
  assert.equal(historical.drift.reason, 'fingerprint-differs')
  assert.deepEqual(historical.drift.evidenceFingerprints, [fingerprintB])
  assert.equal(historical.drift.currentFingerprint, fingerprintA)
  // 措辞里不许出现「过期 / 新鲜 / 失效」：这个模块只说绑在哪一份指纹上，不替证据判新旧。
  const claims = EVIDENCE_DRIFT_IDS.map((id) => buildSkillEvidence(historicalInput).drift.claim.zh)
  for (const forbidden of ['过期', '失效', '新鲜']) {
    assert.ok(!claims.join('\n').includes(forbidden), `drift must not judge age with ${forbidden}`)
  }
})

test('an evidence id binds a subject to the fingerprint it was recorded against — it is not a fresh uuid', () => {
  // 评审文档 D4：id = `evidence:<subject>@<已有 sha256 / caseId / runId / 回执游标>`，不引入新的哈希实现。
  const record = {
    subjectId: 'skill-load', status: 'observed', skillName: 'code-review',
    skillFingerprint: fingerprintA, instructionFingerprint: fingerprintA,
    caseId: 'case-1', runId: 'r-1', sourceType: 'runtime-receipt', reference: 'receipt:turn7.step3',
  }
  const first = evidenceIdOf(record)
  assert.match(first, /^evidence:skill-load@sha256:[0-9a-f]{64}$/)
  assert.equal(evidenceIdOf({ ...record }), first, 'the same facts must produce the same id')
  // 绑定的指纹换了，就是另一条证据；这条断言防的是「id 只由 subject 拼成」，那会让两个版本共用一条。
  assert.notEqual(evidenceIdOf({ ...record, instructionFingerprint: fingerprintB, skillFingerprint: fingerprintB }), first)
  // 状态**不**在 id 里：同一个槽位从 unavailable 变成 observed 是同一条证据换了读数，
  // 不是凭空多了一条（`evidenceStatusCounts` 也按这个前提去重）。
  assert.equal(evidenceIdOf({ ...record, status: 'unavailable' }), first)
  // 没有任何可绑定指纹时退到 `skill#ordinal`，仍然稳定、仍然区分不同槽位。
  assert.equal(evidenceIdOf({ subjectId: 'outcome', skillName: 'code-review', ordinal: 3 }), 'evidence:outcome@code-review#3')
})

test('the receipt reference carries a turn/step cursor and nothing that identifies a session', () => {
  assert.equal(receiptReference({ turn: 7, step: 3 }), 'receipt:turn7.step3')
  assert.equal(receiptReference({ turn: 7 }), 'unavailable')
  assert.equal(receiptReference({}), 'unavailable')
})

test('the export is byte-stable and carries no session, no absolute path, no tool argument', () => {
  const model = buildSkillEvidence(loadedInput)
  const first = buildEvidenceExport(model)
  const second = buildEvidenceExport(buildSkillEvidence(loadedInput))
  assert.equal(JSON.stringify(first), JSON.stringify(second), 'the same input must produce a byte-identical export')
  assert.equal(first.schemaVersion, EVIDENCE_EXPORT_SCHEMA_VERSION)
  const text = JSON.stringify(first)
  for (const key of EVIDENCE_EXPORT_FORBIDDEN_KEYS) {
    assert.ok(!text.includes(`"${key}"`), `the export must not carry ${key}`)
  }
  assert.ok(!/\/Users\/|\/home\/|C:\\\\/.test(text), 'the export must not carry an absolute path')
  assert.ok(!/"(score|rank|percentage|grade)"/i.test(text), 'the export must not carry a score or a ranking')
  // 条件字段的缺席写成 unavailable，而不是把键删掉 —— 少一个键和「这一项拿不到」是两回事。
  assert.ok(Object.keys(first.conditions).length > 0)
  assert.ok(Object.values(first.conditions).every((value) => typeof value === 'string' && value.length > 0))
})

test('every limitation is a code from the closed vocabulary, and every code has wording', () => {
  const model = buildSkillEvidence(loadedInput)
  const codes = [model.chain, model.boundaries, model.table].flat().flatMap((entry) => [
    ...(entry.limitations ?? []).map((item) => item.code),
    entry.limitation?.code ?? null,
  ]).filter(Boolean)
  assert.ok(codes.length > 0, 'the model states its limitations, it does not merely have room for them')
  for (const code of codes) {
    assert.ok(EVIDENCE_LIMITATION_CODES.includes(code), `${code} must come from the closed vocabulary`)
  }
})

test('the status table answers exactly the five questions it declares, in order', () => {
  const model = buildSkillEvidence(loadedInput)
  assert.deepEqual(model.table.map((row) => row.subjectId), EVIDENCE_SUBJECT_IDS)
  const rows = evidenceRows(model)
  assert.equal(rows.length, EVIDENCE_SUBJECT_IDS.length)
  assert.equal(EVIDENCE_TABLE_COLUMNS.length, 5)
  for (const row of rows) {
    assert.ok(EVIDENCE_STATUS_IDS.includes(row.status))
    for (const field of ['subject', 'statusLabel', 'fact', 'source', 'limitation']) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, field), `a table row carries ${field}`)
    }
    assert.ok(row.limitation.code, 'a row without its limitation would read as a stronger claim than it is')
  }
  const dshRow = rows.find((row) => row.subjectId === 'dsh-version')
  assert.equal(dshRow.status, 'unavailable')
  assert.equal(dshRow.limitation.code, 'current-reading-path-does-not-provide-dsh-version')
})

test('the static validation verdict travels as one of its own words, not as a boolean', () => {
  const model = buildSkillEvidence(loadedInput)
  assert.equal(model.validation.status, 'pass')
  assert.deepEqual(model.validation.summary, { errors: 0, warnings: 0, info: 1, skipped: 4 })
  const missing = buildSkillEvidence(inputWith({ validation: undefined }))
  assert.equal(missing.validation.status, 'unavailable')
})
