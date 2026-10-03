import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  INSTANCE_TEST_GOAL_TEXT,
  INSTANCE_TEST_GOAL_TITLE,
  INSTANCE_TEST_HEADLINE,
  INSTANCE_TEST_INTENTS,
  INSTANCE_TEST_OBSERVATION_NOTE,
  INSTANCE_TEST_OBSERVATION_TITLE,
  INSTANCE_TEST_PRIMARY_SCOPE_ORDER,
  INSTANCE_TEST_PROMPT_BLOCKS,
  INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS,
  INSTANCE_TEST_PROMPT_TITLE,
  INSTANCE_TEST_RELATIVE_TIME_WORDS,
  INSTANCE_TEST_SCOPE_FOCUS,
  INSTANCE_TEST_SCOPE_IDS,
  INSTANCE_TEST_SCOPE_ROLES,
  INSTANCE_TEST_SOURCES,
  INSTANCE_TEST_UNAVAILABLE_MESSAGES,
  INSTANCE_TEST_UNAVAILABLE_REASONS,
  SKILL_INSTANCE_TEST_SCHEMA_VERSION,
  buildInstanceTest,
  buildSkillInstanceTest,
} from '../src/core/skill-instance-test.mjs'
import { MODIFICATION_SCOPE_IDS } from '../src/core/skill-modification.mjs'

const DEFINITION = `---
name: deliver-prd
description: 当用户需要把一段产品想法整理成可交付的需求文档时使用。产出必须能让工程直接开工。
license: MIT
---

# deliver-prd

## 何时使用
用户带着一段零散想法来，要求落到一份能开工的文档。

## 正文
先把想法里的角色与场景写清楚，再补验收标准。

## 输出
一份 Markdown 需求文档，含角色、场景、范围与验收标准。

## 约束
必须逐条给出验收标准；不得省略不做清单。

## 素材
需要一张信息架构图作为附件。
`

const FRAMEWORK = {
  schemaVersion: 1,
  sections: [
    { id: 'a', title: '何时使用', role: 'trigger', opening: '用户带着一段零散想法来，要求落到一份能开工的文档。' },
    { id: 'b', title: '输出', role: 'output', opening: '一份 Markdown 需求文档，含角色、场景、范围与验收标准。' },
    { id: 'c', title: '约束', role: 'rules', opening: '必须逐条给出验收标准；不得省略不做清单。' },
    { id: 'd', title: '素材', role: 'resources', opening: '需要一张信息架构图作为附件。' },
  ],
  roles: [],
  unclassified: [],
  coverage: { present: [], absent: [] },
  chain: [],
  resources: { groups: [] },
  sectionCount: 4,
}

function comparisonFor(changedIds, extra = {}) {
  const all = MODIFICATION_SCOPE_IDS.map((id) => ({
    id,
    label: INSTANCE_TEST_SCOPE_FOCUS[id].label,
    target: id.startsWith('skill-md-') ? 'skill-md' : 'resources',
    section: null,
    state: changedIds.includes(id) ? 'changed' : 'unchanged',
    reason: null,
    changed: changedIds.includes(id),
  }))
  return {
    schemaVersion: 1,
    skillName: 'deliver-prd',
    available: true,
    reason: null,
    status: 'changed',
    message: null,
    scopeIds: changedIds,
    limitations: [],
    notes: [],
    sections: { added: [], removed: [], truncated: false },
    resources: { available: true, added: [], removed: [], modified: [] },
    scopes: all,
    outOfScope: [],
    identity: { state: 'unchanged', before: 'deliver-prd', after: 'deliver-prd' },
    source: { state: 'unchanged', message: '' },
    summary: { scopesChanged: changedIds.length, scopesUnchanged: 6 - changedIds.length, scopesUnknown: 0, outOfScopeCount: 0, addedLines: 3, removedLines: 1 },
    contentChanged: true,
    ...extra,
  }
}

const build = (changedIds, extra = {}, input = {}) => buildSkillInstanceTest({
  skillName: 'deliver-prd',
  comparison: comparisonFor(changedIds, extra),
  definitionText: DEFINITION,
  description: '当用户需要把一段产品想法整理成可交付的需求文档时使用。产出必须能让工程直接开工。',
  validation: { available: true },
  ...input,
})

/** 把结果里所有字符串挖出来，供「不许出现某个词」这类断言使用。 */
function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const entry of value) allStrings(entry, out)
  else if (value && typeof value === 'object') for (const entry of Object.values(value)) allStrings(entry, out)
  return out
}

test('生成的 Prompt 用固定的四块结构，且没有「验收关注点」这一块', () => {
  const result = build(['skill-md-workflow'])
  assert.equal(result.available, true)
  assert.deepEqual(INSTANCE_TEST_PROMPT_BLOCKS, ['任务', '工作目标', '输出要求', '注意'])
  assert.ok(result.prompt.text.startsWith('你需要完成下面这个真实任务。'))
  const positions = INSTANCE_TEST_PROMPT_BLOCKS.map((block) => result.prompt.text.indexOf(`【${block}】`))
  assert.ok(positions.every((position) => position > 0), '四块标题都必须出现')
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, '四块必须按固定顺序出现')
  assert.equal(result.prompt.text.includes('【验收关注点】'), false)
  assert.equal(result.promptText, result.prompt.text)
})

test('Prompt 里不许出现 diff 元信息、范围标签与判断词', () => {
  const result = build(INSTANCE_TEST_SCOPE_IDS, {
    sections: { added: ['Workflow', '新增一节叫 references 的东西'], removed: ['Rules'], truncated: false },
  })
  for (const word of INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS) {
    assert.equal(result.prompt.text.includes(word), false, `Prompt 里不得出现「${word}」`)
  }
  for (const scope of Object.values(INSTANCE_TEST_SCOPE_FOCUS)) {
    assert.equal(result.prompt.text.includes(`【${scope.label}】`), false)
  }
})

test('验收关注点只给用户看：观察项一个字都不在 Prompt 里', () => {
  const result = build(['skill-md-rules', 'references'])
  assert.ok(result.observations.length >= 4)
  for (const observation of result.observations) {
    assert.equal(result.prompt.text.includes(observation.text), false, `观察项不得出现在 Prompt 里：${observation.text}`)
  }
  assert.equal(result.prompt.text.includes(INSTANCE_TEST_OBSERVATION_TITLE), false)
  assert.equal(result.prompt.text.includes(INSTANCE_TEST_OBSERVATION_NOTE), false)
})

test('观察项是疑问句，按固定顺序：通用两条 → 范围重点 → 修改行为 → 原有能力', () => {
  const result = build(['skill-md-rules', 'references', 'scripts'])
  assert.deepEqual(result.observations.map((entry) => entry.id), ['used', 'flow', 'skill-md-rules', 'references', 'scripts', 'modified-behaviour'])
  for (const observation of result.observations) {
    assert.ok(observation.text.endsWith('？'), `观察项必须是疑问句：${observation.text}`)
  }
  assert.ok(result.observations.length <= 6)
})

test('同一个输入生成同一份结果（纯确定性，没有时间与随机）', () => {
  const first = build(['skill-md-workflow'])
  const second = build(['skill-md-workflow'])
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)))
})

test('六个范围各自决定任务的形状，而且六种形状互不相同', () => {
  const texts = INSTANCE_TEST_PRIMARY_SCOPE_ORDER.map((id) => build([id]).prompt.text)
  assert.equal(new Set(texts).size, INSTANCE_TEST_PRIMARY_SCOPE_ORDER.length, '六个范围必须给出六种不同的 Prompt')
  for (const text of texts) assert.ok(text.length > 60)
})

test('多个范围同时变化时，主范围按优先级选（Workflow > Rules > Description > 资源）', () => {
  assert.equal(build(['scripts', 'references', 'skill-md-workflow']).primaryScopeId, 'skill-md-workflow')
  assert.equal(build(['assets', 'skill-md-rules']).primaryScopeId, 'skill-md-rules')
  assert.equal(build(['scripts', 'references']).primaryScopeId, 'references')
})

test('任务主语来自描述，且剥掉「当用户需要…时使用」这类触发前缀', () => {
  const result = build(['skill-md-workflow'])
  assert.equal(result.prompt.text.includes('当用户需要把一段产品想法整理成可交付的需求文档时使用'), false)
  assert.ok(result.prompt.text.includes('把一段产品想法整理成可交付的需求文档'))
})

test('交付物来自 Skill 自己声明的输出小节，不是编出来的文件名', () => {
  const result = build(['skill-md-workflow'])
  assert.ok(result.prompt.text.includes('一份 Markdown 需求文档'), result.prompt.text)
})

test('回归约束只能来自没有被这次改动触及的声明能力', () => {
  const result = build(['skill-md-workflow'], { sections: { added: ['Workflow'], removed: [], truncated: false } })
  assert.equal(result.regression.available, true)
  assert.ok(result.regression.constraints.length > 0)
  assert.ok(result.regression.constraints.every((line) => line.includes('原有「')), result.regression.constraints.join('\n'))
  assert.ok(result.regression.constraints.every((line) => !line.includes('Workflow')))
})

test('拿不到没被触及的声明能力时，如实说拿不到，绝不写「确保原有能力没有受到影响」', () => {
  const result = buildSkillInstanceTest({
    skillName: 'plain',
    comparison: comparisonFor(['skill-md-workflow']),
    definitionText: '---\nname: plain\ndescription: 做一件事。\n---\n\n## Workflow\n先做这个。\n',
    description: '做一件事。',
  })
  assert.equal(result.regression.available, false)
  assert.equal(result.regression.constraints.length, 0)
  assert.ok(result.regression.unavailable[0].includes('拿不到'))
  assert.equal(allStrings(result).some((text) => text.includes('确保原有能力没有受到影响')), false)
})

test('四种「生成不出来」各说各话，都不抛异常', () => {
  assert.equal(buildSkillInstanceTest(null).reason, 'no-comparison')
  assert.equal(buildSkillInstanceTest({}).reason, 'no-comparison')
  assert.equal(buildSkillInstanceTest({ comparison: { available: false, message: '快照没了' } }).reason, 'comparison-unavailable')
  assert.equal(buildSkillInstanceTest({ comparison: { available: false, message: '快照没了' } }).message, '快照没了')
  assert.equal(buildSkillInstanceTest({ comparison: comparisonFor([]) }).reason, 'no-changed-scope')
  assert.equal(buildSkillInstanceTest({ comparison: comparisonFor(['skill-md-workflow']) }).reason, 'no-definition')
  assert.deepEqual(INSTANCE_TEST_UNAVAILABLE_REASONS, Object.keys(INSTANCE_TEST_UNAVAILABLE_MESSAGES))
  for (const reason of INSTANCE_TEST_UNAVAILABLE_REASONS) {
    assert.ok(INSTANCE_TEST_UNAVAILABLE_MESSAGES[reason].length > 10)
  }
})

test('坏输入只会降级，不会抛：范围表不是数组、小节是字符串、描述是数字', () => {
  const weird = buildSkillInstanceTest({
    skillName: 42,
    comparison: { available: true, scopes: 'nope', sections: { added: 'x', removed: null }, summary: null },
    definitionText: DEFINITION,
    description: 7,
  })
  assert.equal(weird.available, false)
  assert.equal(weird.reason, 'no-changed-scope')
  assert.equal(weird.skillName, '')
  const scopesOnly = buildSkillInstanceTest({
    comparison: { available: true, scopes: [{ id: 'skill-md-rules', changed: true }] },
    definitionText: DEFINITION,
  })
  assert.equal(scopesOnly.available, true)
  assert.deepEqual(scopesOnly.changedScopeIds, ['skill-md-rules'])
})

test('结果里没有判断词、没有分数、没有相对时间说法', () => {
  const strings = allStrings(build(INSTANCE_TEST_SCOPE_IDS))
  for (const word of ['成功', '失败', '有效', '无效', '质量', '评分', '得分', '通过率', '优秀', '%']) {
    assert.equal(strings.some((text) => text.includes(word)), false, `结果里不得出现「${word}」`)
  }
  for (const word of INSTANCE_TEST_RELATIVE_TIME_WORDS) {
    assert.equal(strings.some((text) => text.includes(word)), false, `结果里不得出现相对时间「${word}」`)
  }
})

test('三意图内部支持，界面只生成一个综合 Prompt', () => {
  assert.deepEqual(INSTANCE_TEST_INTENTS, ['core', 'boundary', 'regression'])
  assert.equal(build(['skill-md-rules']).intent, 'core+boundary+regression')
})

test('范围清单必须与 skill-modification.mjs 的六个范围逐字一致、顺序一致', () => {
  assert.deepEqual(INSTANCE_TEST_SCOPE_IDS, [...MODIFICATION_SCOPE_IDS])
  assert.deepEqual([...INSTANCE_TEST_PRIMARY_SCOPE_ORDER].sort(), [...MODIFICATION_SCOPE_IDS].sort())
})

test('资源类范围才带上「看不到文件内容」那条限制', () => {
  assert.equal(build(['skill-md-rules'], {}, { framework: FRAMEWORK }).limitations.length, 2)
  assert.equal(build(['references'], {}, { framework: FRAMEWORK }).limitations.length, 3)
  assert.ok(build(['references'], {}, { framework: FRAMEWORK }).limitations.some((line) => line.includes('看不到文件内容')))
})

test('缺哪一样输入就说哪一样：框架缺了、静态验收缺了、验收里有判不了的结论', () => {
  const withoutFramework = build(['skill-md-rules'])
  assert.ok(withoutFramework.limitations.some((line) => line.includes('框架结构')))
  assert.equal(withoutFramework.regression.source, 'definition')

  const withoutValidation = build(['skill-md-rules'], {}, { framework: FRAMEWORK, validation: null })
  assert.ok(withoutValidation.limitations.some((line) => line.includes('没有静态验收结论')))

  const unknownValidation = build(['skill-md-rules'], {}, {
    framework: FRAMEWORK,
    validation: { available: true, status: 'unknown', profiles: [{ id: 'common', status: 'unknown' }] },
  })
  assert.ok(unknownValidation.limitations.some((line) => line.includes('判不了的结论')))
  assert.equal(unknownValidation.trace.validationUnknownCount, 1)
  assert.equal(unknownValidation.trace.validationStatus, 'unknown')
})

test('回归约束来自框架里没被这次改动碰过的能力（按角色排除，不只是按标题）', () => {
  const result = build(['skill-md-rules'], {}, { framework: FRAMEWORK })
  assert.equal(result.regression.available, true)
  assert.equal(result.regression.source, 'framework')
  const joined = result.regression.constraints.join('\n')
  assert.equal(joined.includes('约束'), false, '规则块被这次改动碰过，不许再当回归约束')
  assert.ok(joined.includes('输出'), '没被碰过的输出块应当成为回归约束')
  assert.ok(joined.includes('Markdown 需求文档'), '约束里要带上它自己声明的那句能力')
  assert.deepEqual(INSTANCE_TEST_SCOPE_ROLES.references, 'resources')
})

test('用户意图只对齐主范围，一个字都不进结果', () => {
  const hinted = build(['skill-md-rules', 'references'], {}, { intent: '把 references 的使用要求写清楚' })
  assert.equal(hinted.primaryScopeId, 'references')
  assert.equal(hinted.trace.hintedScopeId, 'references')
  assert.equal(allStrings(hinted).join('\n').includes('把 references 的使用要求写清楚'), false)

  const notChanged = build(['skill-md-rules'], {}, { intent: '顺手改一下脚本' })
  assert.equal(notChanged.primaryScopeId, 'skill-md-rules')
  assert.equal(notChanged.trace.hintedScopeId, null)
})

test('六个来源的在场情况如实记进 trace，Prompt 里不许出现这次改动的小节标题', () => {
  assert.deepEqual(INSTANCE_TEST_SOURCES, ['intent', 'scopeIds', 'comparison', 'description', 'framework', 'validation'])
  const full = build(['skill-md-rules'], {}, {
    intent: '把规则收紧一点',
    framework: FRAMEWORK,
    validation: { available: true, status: 'pass' },
  })
  assert.deepEqual(full.trace.sources, INSTANCE_TEST_SOURCES)
  const lean = build(['skill-md-rules'], {}, { framework: FRAMEWORK, validation: null })
  assert.deepEqual(lean.trace.sources, ['scopeIds', 'comparison', 'description', 'framework'])

  const withSection = build(['skill-md-workflow'], { sections: { added: ['读资料的新步骤'], removed: [], truncated: false } }, { framework: FRAMEWORK })
  assert.equal(withSection.prompt.text.includes('读资料的新步骤'), false)
})

test('规格 §15 建议的那个名字也能用；§19 的两处抬头都在', () => {
  assert.equal(buildInstanceTest, buildSkillInstanceTest)
  assert.equal(INSTANCE_TEST_GOAL_TITLE, '验证目标')
  assert.ok(INSTANCE_TEST_GOAL_TEXT.includes('验证本次修改是否改变了这个 Skill 的实际行为'))
  assert.equal(INSTANCE_TEST_PROMPT_TITLE, '测试 Prompt')
})

test('限制里写清「不调用模型、同一份输入同一份任务」与「不运行、不判定」', () => {
  const result = build(['skill-md-workflow'])
  const joined = result.limitations.join('\n')
  assert.ok(joined.includes('不调用模型'))
  assert.ok(joined.includes('不运行它、不读结果、不判定是否达到预期'))
})

test('抬头那句说的是这件事，而不是一句待办', () => {
  assert.ok(INSTANCE_TEST_HEADLINE.includes('针对你刚才修改的 Skill'))
  assert.ok(INSTANCE_TEST_HEADLINE.includes('验证修改是否生效'))
  assert.ok(INSTANCE_TEST_OBSERVATION_NOTE.includes('观察不到痕迹不等于没有被执行'))
})

test('模块是零依赖纯函数：不 import、不读时间、不掷骰子', () => {
  const source = readFileSync(new URL('../src/core/skill-instance-test.mjs', import.meta.url), 'utf8')
  assert.equal(/^\s*import\s/m.test(source), false)
  assert.equal(source.includes('Math.random'), false)
  assert.equal(source.includes('Date.now'), false)
  assert.equal(source.includes('new Date'), false)
  assert.equal(/from 'node:/.test(source), false)
})

test('schemaVersion 是本模块自己的版本号', () => {
  assert.equal(SKILL_INSTANCE_TEST_SCHEMA_VERSION, 1)
  assert.equal(build(['skill-md-workflow']).schemaVersion, 1)
})

test('任务句按词边界截断：英文描述不会被切在半个单词上', () => {
  const long = build(['skill-md-rules'], {}, {
    description: 'Use for UI design and implementation work to avoid generic AI-looking interfaces and knob defaults applied only when needed.',
  })
  assert.equal(long.available, true)
  const task = long.prompt.task
  assert.ok(task.includes('…'), '过长的描述必须带省略号')
  assert.equal(task.includes('avo'), false, '不许切在半个单词上（此前出现过「…to avo.」）')
  const head = task.slice(0, task.indexOf('…')).trim()
  const lastToken = head.slice(head.lastIndexOf(' ') + 1)
  assert.ok(lastToken.length >= 4, `省略号前应当停在一个完整的词上，实际以「${lastToken}」结尾`)

  const short = build(['skill-md-rules'], {}, { description: '整理会议纪要。' })
  assert.equal(short.prompt.task.includes('…'), false, '不长的描述不该出现省略号')
})
