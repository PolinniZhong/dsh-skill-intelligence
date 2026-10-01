import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDefinitionOutline } from '../src/core/definition-outline.mjs'
import { extractDeclaredFlow } from '../src/core/skill-flow.mjs'
import { buildSkillFramework, classifySection, FRAMEWORK_ROLES, FRAMEWORK_UNCLASSIFIED_LABEL } from '../src/core/skill-framework.mjs'
import {
  buildSkillRuntimeLogic,
  RUNTIME_LOGIC_FORBIDDEN,
  RUNTIME_STAGE_IDS,
} from '../src/core/skill-runtime-logic.mjs'
import { FLOW_EVIDENCE_FORBIDDEN } from '../src/core/flow-evidence.mjs'

// Skill 框架与运行逻辑 —— 第二组验收。
//
// 这一组测试不回答「图画出来了没有」。它们回答 §16 那十个问题里的可判定部分：
//
//   框架 = Skill 的组成结构          → F1..F6
//   运行逻辑 = 本次会话观察到什么    → R1..R5
//   两者都不是从运行证据反推出来的   → F7 / R5
//
// 其中最重要的一条是 F1：一个复杂的 Skill 有十来个章节，而它声明的流程可能只有四步。
// 把四步当成框架，就是这次要修的那个错。

const RESOURCE_BASE = { kind: 'directory', path: null, pathOmitted: true, url: null, note: null }

function frameworkOf(text, { summary = { description: 'A demo skill.' }, truncated = false } = {}) {
  const outline = buildDefinitionOutline(text)
  return {
    outline: outline.entries,
    framework: buildSkillFramework({
      content: text,
      outline: outline.entries,
      summary,
      truncated,
      resourceBase: RESOURCE_BASE,
    }),
  }
}

const RICH_SKILL = [
  '# Demo Skill',
  '',
  'You are a careful reviewer with a taste for small diffs.',
  '',
  '## When to use',
  '',
  'Use this when a change needs a second pair of eyes.',
  '',
  '## Knobs',
  '',
  '- DEPTH (default 5) — how deep the review goes.',
  '- STRICT (default off) — whether to block on style.',
  '',
  '## Constraints',
  '',
  '- Never edit the file under review.',
  '',
  '## Discovery Phase',
  '',
  '1. Read the diff',
  '2. Run the tests',
  '3. Report findings',
  '',
  '## Reference Files',
  '',
  '### Tier 1 — Required',
  '',
  '- `references/brief.md`',
  '- `references/checklist.md`',
  '',
  '### Tier 2 — Optional',
  '',
  '- `references/style.md`',
  '',
  '## Idiosyncratic Heading',
  '',
  'Some prose that does not match a known role.',
  '',
  '## Review Format',
  '',
  '- One summary line, then findings.',
  '',
  '## Verify',
  '',
  '- Re-read the diff before reporting.',
  '',
].join('\n')

// ---------------------------------------------------------------------------
// F1 / F2 — the framework is the section structure, and the flow is one module inside it
// ---------------------------------------------------------------------------

test('F1: a Skill with eleven sections is not compressed into its four declared steps', () => {
  const { framework, outline } = frameworkOf(RICH_SKILL)
  const flow = extractDeclaredFlow(RICH_SKILL, { truncated: false })

  // 声明流程仍然是它自己：三步，来自 Discovery Phase。
  assert.deepEqual(flow.steps.map((step) => step.title), ['Read the diff', 'Run the tests', 'Report findings'])

  // 框架远大于流程 —— 这正是 §16 验收问题「第一眼能不能看出这个 Skill 由什么组成」的根据。
  assert.equal(framework.sectionCount, 9, 'every heading except the document title is a section')
  assert.ok(framework.sectionCount > flow.steps.length, 'the framework must never collapse to the declared flow')
  assert.equal(framework.sections.length, framework.sectionCount)
  assert.equal(framework.titleEntry.title, 'Demo Skill')
  assert.equal(framework.titleEntry.line, 1)
  // 标题不是一个小节：它是文档的名字，把它列成一个模块只会让框架多出一格噪声。
  assert.equal(framework.sections.some((section) => section.title === 'Demo Skill' && section.id !== 'framework:preamble'), false)

  // 每个小节都带得走锚点，且锚点就是 outline 里的 id —— 只有一处权威。
  const entryIds = new Set(outline.map((entry) => entry.id))
  for (const section of framework.sections) {
    assert.ok(entryIds.has(section.anchorId), `${section.id} must anchor to a real outline entry`)
  }
})

test('F2: a heading that matches no role keeps its own title; missing roles are named, never padded', () => {
  const { framework } = frameworkOf(RICH_SKILL)
  assert.deepEqual(framework.unclassified, ['idiosyncratic-heading'])
  const odd = framework.sections.find((section) => section.id === 'idiosyncratic-heading')
  assert.equal(odd.role, null)
  assert.equal(odd.title, 'Idiosyncratic Heading', 'an unrecognised section keeps the title SKILL.md gave it')
  assert.ok(framework.limitations.includes('section-heading-does-not-match-a-known-framework-role'))

  // 认得出来的角色一个不少。
  assert.deepEqual(
    framework.roles.map((role) => role.role),
    ['identity', 'trigger', 'rules', 'controls', 'workflow', 'resources', 'output', 'verification'],
  )

  // 这份文档没有任何角色缺席，所以既不报缺席、也不补空卡片。
  assert.deepEqual(framework.coverage.absent, [])
  assert.deepEqual(framework.coverage.present.sort(), FRAMEWORK_ROLES.slice().sort())

  // 反过来：一个只有定位与规则的 Skill，缺席的角色被点名，而不是被补成空模块。
  const thin = frameworkOf('# Thin\n\nDo one thing.\n\n## Constraints\n\n- Be brief.\n').framework
  assert.deepEqual(thin.coverage.absent.sort(), ['controls', 'output', 'resources', 'verification', 'workflow'])
  assert.equal(thin.sections.length, 3, 'preamble, constraints, and the trigger the summary supplied')
  const syntheticTrigger = thin.sections.find((section) => section.role === 'trigger')
  assert.equal(syntheticTrigger.synthetic, true)
  // 缺席的五个角色一个都不能变成小节 —— 补齐一个空模块等于替 Skill 编了一句它没写过的话。
  for (const role of thin.coverage.absent) {
    assert.equal(thin.sections.some((section) => section.role === role), false, `${role} is absent and must stay absent`)
  }
})

// ---------------------------------------------------------------------------
// F3 / F4 — preamble, title detection, and a trigger that comes from the description
// ---------------------------------------------------------------------------

test('F3: a uniform-level document keeps its first section; a titled one turns the title into the preamble', () => {
  // 每个标题都在同一层：这时第一个标题**也是**一个小节。把标题规则套上去会静默吃掉第一块。
  const uniform = frameworkOf('## Alpha\n\nFirst.\n\n## Beta\n\nSecond.\n', { summary: { description: null } }).framework
  assert.equal(uniform.titleEntry, null)
  assert.deepEqual(uniform.sections.map((section) => section.title), ['Alpha', 'Beta'])

  const titled = frameworkOf(RICH_SKILL).framework
  const preamble = titled.sections[0]
  assert.equal(preamble.id, 'framework:preamble')
  assert.equal(preamble.role, 'identity')
  assert.equal(preamble.synthetic, true)
  assert.equal(preamble.opening, 'You are a careful reviewer with a taste for small diffs.')
  // 合成的开头段仍然可点：它对应的是文档标题那一行，不是凭空造出来的锚点。
  assert.equal(preamble.anchorId, titled.titleEntry.id)
})

test('F4: a trigger the body never states is taken from the definition summary and marked as such', () => {
  const noTrigger = ['# Skill', '', 'Body.\n', '## Constraints', '', '- Be brief.\n'].join('\n')
  const { framework } = frameworkOf(noTrigger, {
    summary: { description: 'Use this when a diff needs a second pair of eyes.' },
  })
  const trigger = framework.sections.find((section) => section.role === 'trigger')
  assert.ok(trigger, 'the summary is the only place that says when to use it')
  assert.equal(trigger.source, 'summary')
  assert.equal(trigger.synthetic, true)
  assert.equal(trigger.anchorId, null, 'there is nothing in SKILL.md to scroll to, so it must not pretend otherwise')
  assert.equal(trigger.opening, 'Use this when a diff needs a second pair of eyes.')

  // 正文自己写了触发条件时，摘要是备选而不是补充：两处都给会让人以为有两套触发规则。
  const withTrigger = frameworkOf(RICH_SKILL).framework
  assert.equal(withTrigger.sections.find((section) => section.role === 'trigger').source, undefined)
})

// ---------------------------------------------------------------------------
// F5 / F6 — declared resources, progressive disclosure, and the tier that was being lost
// ---------------------------------------------------------------------------

test('F5: declared resources are not loaded resources, and the payload says so', () => {
  const { framework } = frameworkOf(RICH_SKILL)
  assert.deepEqual(framework.resources.declared.map((item) => item.path), [
    'references/brief.md', 'references/checklist.md', 'references/style.md',
  ])
  assert.equal(framework.resources.declaredCount, 3)
  // 收据里没有任何东西能证明这些文件被读过，所以已读取永远是空的 —— 空着本身就是要说的事实。
  assert.deepEqual(framework.resources.loaded, [], 'nothing in the evidence proves a referenced file was read')
  assert.equal(framework.resources.loadedCount, 0)
  assert.ok(framework.limitations.includes('declared-resources-are-not-loaded-resources'))
  assert.equal(framework.resources.base.pathOmitted, true)

  // 每条引用记录只有"SKILL.md 在哪里写了它"这一类字段；没有任何一个字段能说它被读过。
  const provenanceKeys = new Set(['order', 'path', 'label', 'line', 'groupLine', 'when', 'anchorId', 'declaredIn', 'role', 'group', 'alsoDeclaredAt', 'absolutePath'])
  assert.equal(Object.keys(framework.resources).includes('absolutePath'), false)
  for (const item of framework.resources.declared) {
    for (const key of Object.keys(item)) {
      assert.ok(provenanceKeys.has(key), `${key} is not a declaration field — a resource record may only cite SKILL.md`)
    }
  }
})

test('F5b: tiers are the groups SKILL.md declares inside its resources section, in document order', () => {
  const { framework } = frameworkOf(RICH_SKILL)
  assert.deepEqual(framework.resources.tiers.map((tier) => tier.title), ['Tier 1 — Required', 'Tier 2 — Optional'])
  assert.deepEqual(framework.resources.tiers.map((tier) => tier.count), [2, 1])
  assert.deepEqual(framework.resources.tiers[0].resourcePaths, ['references/brief.md', 'references/checklist.md'])
  // 每个引用都指回声明它的那个小节 —— 点资源跳到 SKILL.md 的那一节，而不是跳到文档顶部。
  assert.equal(framework.resources.declared[0].anchorId, 'reference-files')
  assert.equal(framework.resources.declared[0].declaredIn, 'Reference Files')
})

test('F6: a later mention inside the resources section outranks an earlier one under a workflow heading', () => {
  // 真实事故：ui-craft 的 `references/brief.md` 第一次出现在 Routing 的表格里，
  // 「先出现者胜」于是把整个 Tier 1 分组都丢了 —— 又一次编辑就会悄悄丢掉渐进披露。
  const text = [
    '# Skill',
    '',
    '## Routing',
    '',
    '| Reference | When to Read |',
    '| --- | --- |',
    '| `references/brief.md` | Before writing anything. |',
    '',
    '## Reference Files',
    '',
    '### Tier 1 — Required',
    '',
    '| Reference | When to Read |',
    '| --- | --- |',
    '| `references/brief.md` | Craft read, signature bets. |',
    '| `references/palette.md` | When picking colour. |',
    '',
  ].join('\n')
  const { framework } = frameworkOf(text)
  const brief = framework.resources.declared.find((item) => item.path === 'references/brief.md')
  assert.equal(brief.declaredIn, 'Reference Files', 'the resources section owns the record, not the first mention')
  assert.equal(brief.group, 'Tier 1 — Required')
  assert.equal(brief.when, 'Craft read, signature bets.', 'the tier table says when to read it')
  assert.ok(brief.alsoDeclaredAt.includes(15), 'the later mention is kept, so nothing is silently dropped')
  assert.deepEqual(framework.resources.tiers[0].resourcePaths, ['references/brief.md', 'references/palette.md'])
  assert.equal(framework.resources.declaredCount, 2, 'one path is one resource, however often it is mentioned')
})

// ---------------------------------------------------------------------------
// F7 — the framework is read off the document, never inferred from a run
// ---------------------------------------------------------------------------

test('F7: the framework is a pure function of the document, and carries no runtime input', () => {
  const first = frameworkOf(RICH_SKILL).framework
  const second = frameworkOf(RICH_SKILL).framework
  assert.deepEqual(first, second, 'same document, same framework — no ordering, no clock, no randomness')

  // 签名里根本没有 receipt / runs / evidence 的位置：框架不可能被运行证据污染，
  // 因为构造它的函数看不到运行证据。
  const withGarbage = buildSkillFramework({
    content: RICH_SKILL,
    outline: buildDefinitionOutline(RICH_SKILL).entries,
    summary: { description: 'A demo skill.' },
    truncated: false,
    resourceBase: RESOURCE_BASE,
    receipt: { runtimeEvents: [{ name: 'bash' }] },
    runs: [{ turn: 99 }],
  })
  assert.deepEqual(withGarbage, first)

  const json = JSON.stringify(first)
  for (const forbidden of FLOW_EVIDENCE_FORBIDDEN) {
    assert.equal(json.includes(forbidden), false, `the framework must never say ${forbidden}`)
  }
  assert.equal(json.includes('/Users/'), false)
})

test('F8: classifySection is total, and a heading it does not know stays unclassified', () => {
  assert.equal(classifySection('Reference Files'), 'resources')
  assert.equal(classifySection('Knobs'), 'controls')
  assert.equal(classifySection('When to use'), 'trigger')
  assert.equal(classifySection('Verify'), 'verification')
  assert.equal(classifySection('Something else entirely'), null)
  assert.equal(classifySection(''), null)
  assert.equal(classifySection(null), null)
  // 八个角色就是八个分类：凡是能被分到角色名下的标题，结果必在这张表里。
  const classified = new Set()
  for (const role of FRAMEWORK_ROLES) {
    for (const probe of [role, `${role}s`, `Its ${role}`, `关于${role}`]) {
      const found = classifySection(probe)
      if (found !== null) classified.add(found)
    }
  }
  assert.ok(classified.size >= 6, 'the classifier is total enough to survive paraphrase')
  assert.equal(typeof FRAMEWORK_UNCLASSIFIED_LABEL.zh, 'string')
})

// ---------------------------------------------------------------------------
// R1 / R2 — the runtime logic is five honest stages, not a graph
// ---------------------------------------------------------------------------

const run = (over = {}) => ({
  runKey: 'session:invocation:2:skill-a',
  eventId: 'session:invocation:2:skill-a',
  turn: 2,
  step: 1,
  invocationType: 'model-invoked',
  consumer: 'skill-tool',
  coverage: 'observed-tool-contract',
  ...over,
})

const evidenceOf = (over = {}) => ({ hasRuntime: false, invocationCount: 0, invocations: [], scope: null, ...over })

test('R1: the runtime logic is the fixed five-stage lifecycle, in order, with no timestamps', () => {
  const logic = buildSkillRuntimeLogic({})
  assert.deepEqual(logic.stages.map((stage) => stage.id), RUNTIME_STAGE_IDS)
  assert.deepEqual(logic.stages.map((stage) => stage.order), [1, 2, 3, 4, 5])
  assert.equal(logic.stageCount, 5)
  assert.equal(logic.source, 'session-observation')
  // 阶段之间没有因果关系，也没有时间：加一个 `at` 字段就等于把生命周期读成时间线。
  const json = JSON.stringify(logic)
  assert.equal(json.includes('"at"'), false)
  assert.equal(json.includes('"startedAt"'), false)
})

test('R2: an unobserved stage says it observed nothing, and never claims execution', () => {
  const logic = buildSkillRuntimeLogic({})
  assert.equal(logic.observedCount, 0)
  for (const stage of logic.stages) {
    assert.equal(stage.state, 'unknown')
    assert.ok(stage.statement === null || typeof stage.statement.zh === 'string')
    assert.ok(Array.isArray(stage.facts))
    assert.equal(stage.facts.length, 0)
  }
  const json = JSON.stringify(logic)
  for (const forbidden of RUNTIME_LOGIC_FORBIDDEN) {
    assert.equal(json.includes(forbidden), false, `the runtime logic must never say ${forbidden}`)
  }
  // 「已加载」进入禁用词，是因为界面上另外两处（原文/中文预览）在说同一件事时会用到它，
  // 而运行逻辑只能观察到载入记录，不能观察到"已经加载完成"。
  assert.ok(RUNTIME_LOGIC_FORBIDDEN.includes('已加载'))
  assert.ok(FLOW_EVIDENCE_FORBIDDEN.every((word) => RUNTIME_LOGIC_FORBIDDEN.includes(word)))
})

test('R3: a correlated run fills the catalog, load and instruction stages with facts', () => {
  const logic = buildSkillRuntimeLogic({
    receipt: null,
    runs: [run()],
    evidence: evidenceOf({
      hasRuntime: true,
      invocationCount: 2,
      invocations: [
        { stepKind: 'inspect', evidenceCategory: 'file', modelIntentPresent: true },
        { stepKind: 'execute', evidenceCategory: 'test', modelIntentPresent: false },
      ],
    }),
    observation: {
      match: 'match',
      inPublishedCatalog: true,
      observedInstructionSha256: ['sha256:' + 'a'.repeat(64)],
      currentInstructionSha256: 'sha256:' + 'a'.repeat(64),
      catalogPublication: { turn: 1, step: 4, entryCount: 66, entriesDigest: 'sha256:0f467e53' },
    },
  })
  const byId = new Map(logic.stages.map((stage) => [stage.id, stage]))
  assert.equal(byId.get('catalog').state, 'runtime-supported')
  assert.equal(byId.get('load').state, 'runtime-supported')
  assert.equal(byId.get('instructions').state, 'runtime-supported')
  assert.equal(byId.get('evidence').state, 'runtime-supported')
  // 关联范围没有建立时，能力阶段必须留空 —— 时间上相邻不等于有关联。
  assert.equal(byId.get('capability').state, 'unknown')
  assert.ok(byId.get('capability').limitations.includes('runtime-events-could-not-be-linked-to-this-skill'))
  assert.equal(logic.observedCount, 4)

  const fact = (stageId, factId) => byId.get(stageId).facts.find((entry) => entry.id === factId)
  assert.equal(fact('catalog', 'catalog-entry-count').value, 66)
  assert.equal(fact('catalog', 'catalog-entry-count').kind, 'count')
  assert.equal(fact('load', 'load-count').value, 1)
  assert.equal(fact('load', 'load-consumer').kind, 'code')
  assert.equal(fact('instructions', 'instruction-fingerprint-match').value, true)
  assert.equal(fact('evidence', 'evidence-invocation-count').value, 2)
})

test('R3b: a mismatch is partial, not a failure — the definition changed, the run did not', () => {
  const logic = buildSkillRuntimeLogic({
    runs: [run()],
    evidence: evidenceOf({ hasRuntime: true, invocationCount: 1 }),
    observation: { match: 'mismatch', observedInstructionSha256: [], currentInstructionSha256: 'sha256:' + 'b'.repeat(64) },
  })
  const instructions = logic.stages.find((stage) => stage.id === 'instructions')
  assert.equal(instructions.state, 'partial')
  assert.equal(instructions.facts.find((entry) => entry.id === 'instruction-fingerprint-match').value, false)
  const json = JSON.stringify(instructions)
  for (const forbidden of ['执行失败', '未执行', '不匹配就是没跑']) {
    assert.equal(json.includes(forbidden), false)
  }
})

test('R4: the evidence stage counts the same states the step list shows, so there is one vocabulary', () => {
  const stepStates = { 'runtime-supported': 1, insufficient: 2, unknown: 1 }
  const logic = buildSkillRuntimeLogic({
    runs: [run()],
    evidence: evidenceOf({ hasRuntime: true, invocationCount: 3 }),
    observation: { match: 'match' },
    stepStates,
  })
  const evidenceStage = logic.stages.find((stage) => stage.id === 'evidence')
  const fact = evidenceStage.facts.find((entry) => entry.id === 'step-evidence-states')
  assert.ok(fact, 'the runtime view reports the step states it did not compute itself')
  assert.equal(fact.kind, 'evidence-states')
  assert.deepEqual(
    fact.value.map((pair) => [pair.label, pair.value]),
    [['runtime-supported', 1], ['insufficient', 2], ['unknown', 1]],
  )
})

test('R5: runtime facts stay categorical — no argument text, no paths, no commands', () => {
  const logic = buildSkillRuntimeLogic({
    receipt: null,
    runs: [run()],
    evidence: evidenceOf({
      hasRuntime: true,
      invocationCount: 1,
      scope: {
        established: true,
        relationStatus: 'correlated',
        eventCount: 68,
        observedByClass: { file: { total: 12, byName: { read: 12 } } },
        turnRange: { from: 2, to: 9 },
      },
      invocations: [{ stepKind: 'inspect', evidenceCategory: 'file', modelIntentPresent: true }],
    }),
    observation: { match: 'match' },
  })
  const json = JSON.stringify(logic)
  assert.equal(json.includes('/Users/'), false)
  assert.equal(json.includes('references/'), false)
  assert.equal(json.includes('npm test'), false)
  // 能力阶段只有在范围真的建立、且事件数大于零时才敢说"有运行支持"。
  const capability = logic.stages.find((stage) => stage.id === 'capability')
  assert.equal(capability.state, 'runtime-supported')
  assert.ok(capability.facts.some((entry) => entry.id === 'scope-event-count' && entry.value === 68))
  assert.ok(capability.facts.some((entry) => entry.id === 'scope-turn-range' && entry.value === '2 — 9'))
  assert.deepEqual(logic.limitations, [
    'runtime-facts-come-only-from-what-this-session-observed',
    'runtime-evidence-is-categorical-and-carries-no-argument-text',
  ])
})

test('R6: every runtime limitation code has a client-side sentence, so none renders as a bare code', async () => {
  const { RUNTIME_LOGIC_LIMITATIONS } = await import('../src/core/skill-runtime-logic.mjs')
  const client = await import('node:fs').then(({ readFileSync }) => readFileSync(new URL('../src/dsh/client/client.js', import.meta.url), 'utf8'))
  for (const code of Object.values(RUNTIME_LOGIC_LIMITATIONS)) {
    if (code === 'rendered-envelope-not-reproducible-outside-the-harness') continue
    assert.ok(client.includes(code), `${code} must be named in the client's limitation table`)
  }
})
