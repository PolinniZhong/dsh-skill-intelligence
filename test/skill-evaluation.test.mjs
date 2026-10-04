import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  EVALUATION_CASE_GENERATOR_VERSION,
  EVALUATION_CASE_HASH_DOMAIN,
  EVALUATION_CASE_SCHEMA_VERSION,
  EVALUATION_COMPARISON_WORDS,
  EVALUATION_CONDITION_FIELDS,
  EVALUATION_EVIDENCE_STAGE_IDS,
  EVALUATION_FORBIDDEN_OUTPUTS,
  EVALUATION_FORBIDDEN_WORDS,
  EVALUATION_INEQUALITIES,
  EVALUATION_STAGE_REACH,
  EVALUATION_UNAVAILABLE_TEXT,
  EVALUATION_VERDICT_IDS,
  buildEvaluationAssertions,
  buildEvaluationCase,
  buildRuntimeEvidence,
  caseHashInput,
  compareEvaluationRuns,
  comparisonWordOf,
  normalizeEvaluationRun,
} from '../src/core/skill-evaluation.mjs'

const root = new URL('../', import.meta.url)
const source = readFileSync(fileURLToPath(new URL('src/core/skill-evaluation.mjs', root)), 'utf8')

const comparison = {
  available: true,
  scopes: [
    { id: 'skill-md-rules', changed: true },
    { id: 'references', changed: true },
  ],
  sections: { added: ['Rules'], removed: [] },
  summary: { scopesUnknown: 0, addedLines: 12 },
  limitations: [],
}

const definitionText = [
  '---',
  'name: ui-craft',
  'description: Use for UI design work.',
  '---',
  '',
  '## Purpose',
  '这件事是把界面做得不像机器生成的。',
  '交付物是一组带取舍理由的界面改动。',
  '',
  '## Rules',
  'Ask before assuming.',
].join('\n')

const caseInput = {
  skillName: 'ui-craft',
  intent: '把规则收紧一点',
  comparison,
  definitionText,
  description: 'Use for UI design work.',
  framework: null,
  validation: null,
  scopeIds: ['skill-md-rules', 'references'],
  skillFingerprint: { instructionSha256: 'f'.repeat(64), match: 'match' },
}

function buildWith(overrides = {}) {
  const built = buildEvaluationCase({ ...caseInput, ...overrides })
  assert.equal(built.available, true)
  return built
}

test('Case 是确定性的：同一份输入总是得到同一份哈希输入', () => {
  const a = buildWith()
  const b = buildWith()
  assert.equal(a.hashInput, b.hashInput)
  assert.deepEqual(a.case.taskPrompt, b.case.taskPrompt)
  // 输入里不含时间与随机数：源码里也不许出现（生成器要保持零依赖纯函数）。
  assert.equal(/Date\.now|Math\.random|new Date\(/.test(source), false)
  const lines = a.hashInput.split('\n')
  assert.equal(lines[0], `${EVALUATION_CASE_HASH_DOMAIN}@${EVALUATION_CASE_SCHEMA_VERSION}`)
  assert.equal(lines[1], `generator:${EVALUATION_CASE_GENERATOR_VERSION}`)
  assert.equal(lines[2], 'skill:ui-craft')
  assert.equal(lines[3], `fingerprint:${'f'.repeat(64)}`)
  assert.equal(lines[4], 'scopes:skill-md-rules,references')
  assert.ok(lines[5].startsWith('prompt:'))
  // 那四样东西各一行：任务 Prompt / 指纹 / scopeIds / 生成器版本（外加一行域分隔）。
  assert.equal(lines.length, 6)
})

test('指纹与生成器版本都进哈希输入：换一个就换一个 caseId 输入', () => {
  const base = buildWith().hashInput
  const otherFingerprint = buildWith({ skillFingerprint: { instructionSha256: 'a'.repeat(64), match: 'mismatch' } }).hashInput
  assert.notEqual(base, otherFingerprint)
  // 生成器版本那一行是被钉住的常量：改代码忘了升版号，测试会红。
  assert.match(base, new RegExp(`^generator:${EVALUATION_CASE_GENERATOR_VERSION.replace(/\./g, '\\.')}$`, 'm'))
  // 换个范围（真改了 comparison 里的 changed 范围）也要换哈希输入。
  const withOtherScope = buildWith({
    comparison: { ...comparison, scopes: [{ id: 'skill-md-workflow', changed: true }] },
  })
  assert.notEqual(base, withOtherScope.hashInput)
  assert.match(withOtherScope.hashInput, /^scopes:skill-md-workflow$/m)
})

test('Case 包住 V0.10 那份任务：Prompt / 观察点 / 回归约束逐字来自实例验收', () => {
  const built = buildWith()
  assert.ok(built.case.taskPrompt.text.includes('【任务】'))
  assert.ok(built.case.observations.length > 0 && built.case.observations.length <= 6)
  for (const observation of built.case.observations) {
    assert.equal(observation.text.endsWith('？'), true, `观察点必须是问句：${observation.text}`)
  }
  assert.equal(Array.isArray(built.case.regressions), true)
  for (const regression of built.case.regressions) {
    assert.equal(regression.startsWith('这次改动不应影响'), true)
  }
})

test('生成不出来时沿用 V0.10 的原因码与人话，不另写一份', () => {
  const noComparison = buildEvaluationCase({ ...caseInput, comparison: null })
  assert.equal(noComparison.available, false)
  assert.equal(noComparison.reason, 'no-comparison')
  assert.equal(noComparison.case, null)
  assert.equal(noComparison.hashInput, null)
  assert.match(noComparison.message, /没有可生成的任务/)
})

test('指纹与缺项：取不到一律写 unavailable，不猜', () => {
  const built = buildWith({ skillFingerprint: undefined, instructionSha256: '' })
  assert.equal(built.case.skillFingerprint.instructionSha256, EVALUATION_UNAVAILABLE_TEXT)
  assert.equal(built.case.skillFingerprint.match, EVALUATION_UNAVAILABLE_TEXT)
  const run = normalizeEvaluationRun({ caseId: 'sha256:abc', runId: 'r-1' })
  for (const key of ['model', 'provider', 'reasoningEffort', 'dshVersion', 'pluginVersion', 'observedInstructionSha256', 'currentInstructionSha256']) {
    assert.equal(run[key], EVALUATION_UNAVAILABLE_TEXT, `${key} 必须降级成 unavailable`)
  }
  assert.equal(run.match, EVALUATION_UNAVAILABLE_TEXT)
  assert.equal(run.load.status, EVALUATION_UNAVAILABLE_TEXT)
  assert.equal(run.startedAt, null)
})

test('断言骨架：每条只有 陈述 / 结论 / 来源，且没有任何聚合字段', () => {
  const built = buildWith()
  const { rows } = buildEvaluationAssertions({
    case: built.case,
    run: {
      caseId: 'sha256:case',
      load: { status: 'loaded', seq: 9 },
      observedInstructionSha256: 'f'.repeat(64),
      currentInstructionSha256: 'f'.repeat(64),
      match: 'match',
      runtimeEvents: { activities: [{ name: 'Read', count: 2 }] },
      outcome: { source: 'user', text: '产出可用。' },
    },
  })
  for (const row of rows) {
    assert.equal(EVALUATION_VERDICT_IDS.includes(row.verdict), true)
    assert.equal(['protocol', 'user', 'agent'].includes(row.source), true)
    assert.equal(typeof row.text, 'string')
    for (const banned of ['rate', 'score', 'count', 'total', 'average', 'variance']) {
      assert.equal(banned in row, false, `断言里不许有聚合字段 ${banned}`)
    }
  }
  const ids = rows.map((row) => row.id)
  assert.deepEqual(ids.slice(0, 3), ['load-evidence', 'fingerprint-match', 'references-used'])
  assert.equal(rows[0].verdict, 'pass')
  assert.equal(rows[2].verdict, 'unknown', '分不出读的是不是 references/ 时，只能是「无法判断」')
})

test('没有观察到加载证据时是「无法判断」，不是「未通过」', () => {
  const built = buildWith()
  const { rows } = buildEvaluationAssertions({ case: built.case, run: { load: { status: 'offered-only' } } })
  assert.equal(rows[0].verdict, 'unknown')
  assert.match(rows[0].why, /看不到不等于没发生/)
  const mismatch = buildEvaluationAssertions({ case: built.case, run: { match: 'mismatch', load: { status: 'loaded', seq: 3 } } })
  assert.equal(mismatch.rows[1].verdict, 'fail')
  const missing = buildEvaluationAssertions({ case: built.case, run: { load: { status: 'loaded', seq: 3 } } })
  assert.equal(missing.rows[1].verdict, 'unknown')
  assert.match(missing.rows[1].why, /不写成「不一致」/)
})

test('观察点由用户的判定决定；没有判定就是「无法判断」', () => {
  const built = buildWith()
  const first = built.case.observations[0]
  const judged = buildEvaluationAssertions({ case: built.case, run: { judgements: { [first.id]: 'pass' } } })
  const row = judged.rows.find((entry) => entry.id === first.id)
  assert.equal(row.verdict, 'pass')
  assert.equal(row.source, 'user')
  const unjudged = buildEvaluationAssertions({ case: built.case, run: {} }).rows.find((entry) => entry.id === first.id)
  assert.equal(unjudged.verdict, 'unknown')
  assert.match(unjudged.why, /插件不判定/)
})

test('对照列的事实词是一张三态真值表', () => {
  assert.equal(comparisonWordOf('pass', 'pass'), EVALUATION_COMPARISON_WORDS.bothPass)
  assert.equal(comparisonWordOf('fail', 'pass'), EVALUATION_COMPARISON_WORDS.beforeFailAfterPass)
  assert.equal(comparisonWordOf('pass', 'fail'), EVALUATION_COMPARISON_WORDS.beforePassAfterFail)
  assert.equal(comparisonWordOf('unknown', 'unknown'), EVALUATION_COMPARISON_WORDS.bothUnknown)
  assert.equal(comparisonWordOf('pass', 'fail', false), EVALUATION_COMPARISON_WORDS.notComparable)
  // 事实词里不许出现分数、百分比、名次。
  for (const word of Object.values(EVALUATION_COMPARISON_WORDS)) {
    assert.equal(/分|%|率|排名/.test(word), false, `对照词里不许有度量：${word}`)
  }
})

const runBase = {
  caseId: 'sha256:case',
  runId: 'r-before',
  model: 'deepseek-chat',
  provider: 'dsh-llm',
  reasoningEffort: 'medium',
  contextWindow: 128000,
  observedInstructionSha256: 'a'.repeat(64),
  currentInstructionSha256: 'a'.repeat(64),
  match: 'match',
  load: { status: 'loaded', seq: 6 },
  trigger: { catalogPublished: true, offerCount: 1 },
  runtimeEvents: { activities: [{ name: 'Read', count: 1 }], total: 1 },
  outcome: { source: 'user', text: '产出可用。' },
}

test('同一个 Case、条件相同、指纹不同 ⇒ 可以对照（改前 · 改后）', () => {
  const built = buildWith()
  const after = {
    ...runBase,
    runId: 'r-after',
    observedInstructionSha256: 'b'.repeat(64),
    currentInstructionSha256: 'b'.repeat(64),
  }
  const result = compareEvaluationRuns({ case: built.case, before: runBase, after })
  assert.equal(result.comparable, true)
  assert.equal(result.axis, 'before-after')
  assert.equal(result.blockers.length, 0)
  assert.equal(result.reason, null)
  assert.ok(result.rows.length > 0)
})

test('实验条件不同 ⇒ 不做对照，并说清哪一项不同', () => {
  const built = buildWith()
  const after = {
    ...runBase,
    runId: 'r-after',
    model: 'deepseek-reasoner',
    observedInstructionSha256: 'b'.repeat(64),
    currentInstructionSha256: 'b'.repeat(64),
  }
  const result = compareEvaluationRuns({ case: built.case, before: runBase, after })
  assert.equal(result.comparable, false)
  assert.equal(result.axis, 'before-after')
  assert.match(result.reason, /模型/)
  assert.equal(result.rows.every((row) => row.comparison === EVALUATION_COMPARISON_WORDS.notComparable), true)
  // 条件表逐项列出，缺项也照列（值就是 unavailable / null）。
  assert.equal(result.conditions.length, EVALUATION_CONDITION_FIELDS.length)
})

test('不是同一个 Case ⇒ 一句对照也不给', () => {
  const built = buildWith()
  const after = { ...runBase, caseId: 'sha256:another', observedInstructionSha256: 'b'.repeat(64) }
  const result = compareEvaluationRuns({ case: built.case, before: runBase, after })
  assert.equal(result.comparable, false)
  assert.equal(result.axis, null)
  assert.match(result.reason, /不是同一个 Case/)
})

test('四段证据顺序固定、每段都带「够不着什么」，且三条不等式在场', () => {
  const built = buildWith()
  const evidence = buildRuntimeEvidence({ case: built.case, run: runBase })
  assert.deepEqual(evidence.stages.map((stage) => stage.id), EVALUATION_EVIDENCE_STAGE_IDS)
  for (const stage of evidence.stages) {
    assert.equal(typeof stage.reach, 'string')
    assert.equal(stage.reach, EVALUATION_STAGE_REACH[stage.id])
    assert.equal(['protocol', 'user', 'agent'].includes(stage.source), true)
    assert.ok(stage.facts.length > 0)
  }
  assert.deepEqual(evidence.inequalities, EVALUATION_INEQUALITIES)
  const empty = buildRuntimeEvidence({ case: built.case, run: { load: { status: 'offered-only' } } })
  assert.equal(empty.stages.find((stage) => stage.id === 'use').status, 'not-observed')
  assert.equal(empty.stages.find((stage) => stage.id === 'outcome').status, 'unavailable')
})

test('这一层不许出现度量词与「已…」：生成出来的每句话都过一遍', () => {
  const built = buildWith()
  const evidence = buildRuntimeEvidence({ case: built.case, run: runBase })
  const comparisonResult = compareEvaluationRuns({ case: built.case, before: runBase, after: runBase })
  const assertions = buildEvaluationAssertions({ case: built.case, run: runBase })
  const texts = [
    built.case.taskPrompt.text,
    ...built.case.observations.map((entry) => entry.text),
    ...built.case.regressions,
    ...built.case.limitations,
    ...evidence.stages.flatMap((stage) => [...stage.facts, stage.reach, stage.label]),
    ...evidence.inequalities,
    evidence.inequalitiesNote,
    ...comparisonResult.rows.map((row) => row.comparison),
    ...comparisonResult.rows.map((row) => row.text),
    ...assertions.rows.flatMap((row) => [row.text, row.why]),
  ].join('\n')
  for (const banned of EVALUATION_FORBIDDEN_WORDS) {
    assert.equal(texts.includes(banned), false, `不许出现「${banned}」`)
  }
  for (const banned of EVALUATION_FORBIDDEN_OUTPUTS) {
    assert.equal(texts.includes(banned), false, `不许出现度量「${banned}」`)
  }
  // 但常量表本身要留着这些词：守卫与界面「刻意不出现的东西」那一块靠它。
  assert.ok(EVALUATION_FORBIDDEN_WORDS.length > 0 && EVALUATION_FORBIDDEN_OUTPUTS.length > 0)
})
