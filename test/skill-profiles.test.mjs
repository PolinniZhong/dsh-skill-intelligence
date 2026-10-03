import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DSH_BOOLEAN_FALSE,
  DSH_BOOLEAN_TRUE,
  DSH_LEGACY_INVOCATION_FIELDS,
  SKILL_BODY_LINE_HINT,
  SKILL_COMPATIBILITY_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_EXTRANEOUS_FILES,
  SKILL_NAME_MAX,
  SKILL_NAME_PATTERN,
  SKILL_PROFILE_DEFAULT,
  SKILL_PROFILE_IDS,
  SKILL_PROFILE_LABELS,
  SKILL_PROFILE_NOTES,
  SKILL_PROFILE_RULES,
  SKILL_REFERENCE_DEPTH_MAX,
  SKILL_RESOURCE_DIRECTORIES,
  SKILL_RULE_IDS,
  SKILL_RULES,
  SKILL_RULE_SEVERITIES,
  SKILL_SEVERITY_LABELS,
  resolveSkillProfiles,
  skillProfileLabel,
  skillRuleById,
  skillRulesForProfile,
  skillRulesForProfiles,
  skillSeverityLabel,
} from '../src/core/skill-profiles.mjs'

const SOURCES = ['agentskills', 'microsoft', 'openai', 'anthropic', 'dsh']

test('每条规则都是一个冻结的「事实」，带稳定的 id / profile / severity / source', () => {
  assert.ok(SKILL_RULES.length >= 30, `规则表只有 ${SKILL_RULES.length} 条，太少了，守卫可能睡着了`)
  const ids = new Set()
  const facts = new Set()
  for (const rule of SKILL_RULES) {
    assert.ok(Object.isFrozen(rule), `${rule.id} 没有被冻结`)
    assert.match(rule.id, /^[A-Z]{2,}(?:-[A-Z]{2,})*-\d{3}$/, `规则 id 形状不对：${rule.id}`)
    assert.ok(SKILL_PROFILE_IDS.includes(rule.profile), `${rule.id} 的 profile 不在五个 Profile 里：${rule.profile}`)
    assert.ok(SKILL_RULE_SEVERITIES.includes(rule.severity), `${rule.id} 的 severity 不是三档之一：${rule.severity}`)
    assert.ok(SOURCES.includes(rule.source), `${rule.id} 的 source 不是已知来源：${rule.source}`)
    assert.equal(typeof rule.title, 'string')
    assert.ok(rule.title.length > 0, `${rule.id} 没有标题`)
    assert.match(rule.fact, /^[a-z][a-z0-9-]*$/, `${rule.id} 的 fact 形状不对：${rule.fact}`)
    assert.ok(!ids.has(rule.id), `规则 id 重复：${rule.id}`)
    // 同一个 fact 只允许有一条规则 —— 两个 Profile 关心同一件事时是「指过去」，不是复制一条出来。
    assert.ok(!facts.has(rule.fact), `fact 重复：${rule.fact}（${rule.id}）—— 应该让 Profile 复用规则，而不是复制规则`)
    ids.add(rule.id)
    facts.add(rule.fact)
  }
  assert.deepEqual([...SKILL_RULE_IDS], SKILL_RULES.map((rule) => rule.id))
})

test('每个 Profile 都指向真实存在的规则，而且没有一个是空表', () => {
  for (const id of SKILL_PROFILE_IDS) {
    const ruleIds = SKILL_PROFILE_RULES[id]
    assert.ok(Array.isArray(ruleIds), `${id} 没有规则表`)
    assert.ok(ruleIds.length > 0, `${id} 的规则表是空的`)
    assert.equal(new Set(ruleIds).size, ruleIds.length, `${id} 的规则表里有重复项`)
    for (const ruleId of ruleIds) {
      assert.ok(skillRuleById(ruleId), `${id} 指向了不存在的规则：${ruleId}`)
    }
  }
  // 反方向：规则表里出现的每条规则，至少要有一个 Profile 会用它，否则它永远不会被判定。
  const reachable = new Set(Object.values(SKILL_PROFILE_RULES).flat())
  for (const rule of SKILL_RULES) {
    assert.ok(reachable.has(rule.id), `${rule.id} 没有任何 Profile 引用它，等于一条死规则`)
  }
})

test('Common 永远在验收目标里，未知目标要点出来而不是静默当成合法值', () => {
  assert.deepEqual(resolveSkillProfiles(undefined), { profileIds: [...SKILL_PROFILE_DEFAULT], unknown: [] })
  // 空数组、非数组、乱类型都回退到默认，而不是变成「一个都不验」。
  for (const value of [[], null, 'dsh', 42, {}]) {
    assert.deepEqual(resolveSkillProfiles(value), { profileIds: [...SKILL_PROFILE_DEFAULT], unknown: [] }, `${String(value)} 没有回退到默认`)
  }
  // 只选平台时自动补上 common。
  assert.deepEqual(resolveSkillProfiles(['microsoft']).profileIds, ['common', 'microsoft'])
  assert.deepEqual(resolveSkillProfiles(['common']).profileIds, ['common'])
  // 顺序永远是 SKILL_PROFILE_IDS 的顺序，跟传进来的顺序无关。
  assert.deepEqual(resolveSkillProfiles(['dsh', 'common']).profileIds, ['common', 'dsh'])
  assert.deepEqual(resolveSkillProfiles(['anthropic', 'openai', 'microsoft']).profileIds, [
    'common',
    'microsoft',
    'openai',
    'anthropic',
  ])
  // 未知目标不静默。
  assert.deepEqual(resolveSkillProfiles(['nope', 'dsh']), { profileIds: ['common', 'dsh'], unknown: ['nope'] })
  // 去重。
  assert.deepEqual(resolveSkillProfiles(['common', 'common', 'dsh']).profileIds, ['common', 'dsh'])
})

test('多 Profile 取规则时去重，并且顺序跟着规则表走（不跟着传参走）', () => {
  const merged = skillRulesForProfiles(['dsh', 'common'])
  const ids = merged.map((rule) => rule.id)
  assert.equal(new Set(ids).size, ids.length, '合并后有重复规则')
  const order = new Map(SKILL_RULES.map((rule, index) => [rule.id, index]))
  const sorted = [...ids].sort((a, b) => order.get(a) - order.get(b))
  assert.deepEqual(ids, sorted, '合并后的顺序不是规则表的顺序')
  // 单 Profile 取规则与按规则表过滤的结果一致。
  for (const id of SKILL_PROFILE_IDS) {
    const expected = SKILL_RULES.filter((rule) => SKILL_PROFILE_RULES[id].includes(rule.id)).map((rule) => rule.id)
    assert.deepEqual(skillRulesForProfile(id).map((rule) => rule.id), expected, `${id} 取规则的结果不对`)
  }
})

test('标签是逐字给的常量，不是拼出来的', () => {
  assert.equal(skillProfileLabel('common', 'zh'), 'Common Core')
  assert.equal(skillProfileLabel('common', 'en'), 'Common Core')
  assert.equal(skillProfileLabel('dsh', 'zh'), 'DSH')
  assert.equal(skillProfileLabel('microsoft', 'zh'), 'Microsoft')
  // 未知取值原样返回，不编一个说法。
  assert.equal(skillProfileLabel('nope', 'zh'), 'nope')
  assert.equal(skillSeverityLabel('error', 'zh'), '错误')
  assert.equal(skillSeverityLabel('warning', 'zh'), '警告')
  assert.equal(skillSeverityLabel('info', 'zh'), '信息')
  assert.equal(skillSeverityLabel('error', 'en'), 'Error')
  for (const id of SKILL_PROFILE_IDS) {
    assert.ok(SKILL_PROFILE_LABELS[id].zh && SKILL_PROFILE_LABELS[id].en, `${id} 缺标签`)
  }
  // 严重度只有三档，没有第四档（没有分数、没有风险分）。
  assert.deepEqual([...SKILL_RULE_SEVERITIES], ['error', 'warning', 'info'])
})

test('规范里的数字是写死的常量，改了就要有出处', () => {
  assert.equal(SKILL_NAME_MAX, 64)
  assert.equal(SKILL_DESCRIPTION_MAX, 1024)
  assert.equal(SKILL_COMPATIBILITY_MAX, 500)
  assert.equal(SKILL_BODY_LINE_HINT, 500)
  assert.equal(SKILL_REFERENCE_DEPTH_MAX, 1)
  assert.deepEqual([...SKILL_RESOURCE_DIRECTORIES], ['scripts', 'references', 'assets'])
  assert.deepEqual([...SKILL_EXTRANEOUS_FILES], ['README.md', 'INSTALLATION_GUIDE.md', 'QUICK_REFERENCE.md', 'CHANGELOG.md'])
  assert.deepEqual([...DSH_BOOLEAN_TRUE], ['true', 'yes', 'on', '1'])
  assert.deepEqual([...DSH_BOOLEAN_FALSE], ['false', 'no', 'off', '0'])
  assert.deepEqual(Object.keys(DSH_LEGACY_INVOCATION_FIELDS).sort(), ['disableModelInvocation', 'modelInvocable', 'userInvocable'])
})

test('DSH 的 name 语法与 dsh-skill 的 SKILL_NAME 常量一致（比开放规范更严）', () => {
  for (const good of ['ui-craft', 'pdf', 'a1-b2', 'skill-creator']) {
    assert.ok(SKILL_NAME_PATTERN.test(good), `${good} 应该合法`)
  }
  for (const bad of ['UI-Craft', '-pdf', 'pdf-', 'pdf--processing', 'pdf_processing', 'pdf.processing', '技能']) {
    assert.ok(!SKILL_NAME_PATTERN.test(bad), `${bad} 不该合法`)
  }
})

test('平台差异不许被抹平成一套标准', () => {
  // 「目录名必须与 name 一致」在 Microsoft 是 error，在 OpenAI 只是 warning ——
  // 同一件事、两条规则、两个 Profile，这不是重复，这是平台差异。
  assert.equal(skillRuleById('MS-DIR-001').severity, 'error')
  assert.equal(skillRuleById('OA-DIR-001').severity, 'warning')
  assert.notEqual(skillRuleById('MS-DIR-001').fact, skillRuleById('OA-DIR-001').fact)
  // DSH 不看目录名，所以它的规则表里不许出现目录名相关的规则。
  const dshFacts = skillRulesForProfile('dsh').map((rule) => rule.fact)
  assert.ok(!dshFacts.includes('directory-name-match'), 'DSH Profile 里混进了目录名规则')
  assert.ok(!dshFacts.includes('openai-directory-name'), 'DSH Profile 里混进了目录名规则')
  for (const ruleId of SKILL_PROFILE_RULES.dsh) {
    assert.ok(ruleId.startsWith('CORE-') || ruleId.startsWith('DSH-'), `DSH Profile 引用了别的平台的规则：${ruleId}`)
  }
  // 正文行数永远只能是 warning：四家的装载阻断清单里都没有行数。
  assert.equal(skillRuleById('CORE-BODY-001').severity, 'warning')
  assert.equal(skillRuleById('CORE-BODY-001').fact, 'body-line-hint')
})

test('Anthropic Profile 只有一条自己的规则，而且这是有意的实话', () => {
  const own = SKILL_PROFILE_RULES.anthropic.filter((ruleId) => ruleId.startsWith('AN-'))
  assert.deepEqual(own, ['AN-COMPAT-001'])
  assert.equal(skillRuleById('AN-COMPAT-001').severity, 'info')
  assert.ok(SKILL_PROFILE_NOTES.anthropic.zh.length > 0, 'Anthropic 的规则少，就得说明为什么少')
  // 每个 Profile 都能拿到一句说明（中英各一句，逐字给的常量）。
  for (const id of SKILL_PROFILE_IDS) {
    const note = SKILL_PROFILE_NOTES[id]
    assert.ok(note && typeof note.zh === 'string' && note.zh.length > 0, `${id} 缺中文说明`)
    assert.ok(typeof note.en === 'string' && note.en.length > 0, `${id} 缺英文说明`)
  }
})
