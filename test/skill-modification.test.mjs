import test from 'node:test'
import assert from 'node:assert/strict'
import * as modification from '../src/core/skill-modification.mjs'
import {
  MODIFICATION_CONTRACT_RULES,
  MODIFICATION_DIFF_LIMITATIONS,
  MODIFICATION_DIFF_LIMITS,
  MODIFICATION_DIFF_STATUSES,
  MODIFICATION_INTENT_LIMIT,
  MODIFICATION_LOCKED_SCOPE_IDS,
  MODIFICATION_MESSAGE_SOURCE,
  MODIFICATION_SCOPE_IDS,
  MODIFICATION_SCOPE_OPTIONS,
  MODIFICATION_SNAPSHOT_GONE_MESSAGE,
  MODIFICATION_SOURCE_CHANGED_MESSAGE,
  MODIFICATION_SOURCE_KIND,
  buildModificationContractText,
  buildModificationMessageText,
  diffSkillModification,
  modificationDiffStatusText,
  modificationScopeLabel,
  modificationSnapshotKey,
  modificationScopeText,
  resolveModificationScopes,
  sourceStatus,
} from '../src/core/skill-modification.mjs'

const SKILL_BEFORE = [
  '---',
  'name: company-ui-craft',
  'description: Use this when building UI, so screens avoid generic AI looks.',
  '---',
  '',
  '# UI Craft',
  '',
  '## Rules',
  '',
  '- ask before assuming',
  '- case by default',
  '',
  '## Workflow',
  '',
  '1. explore',
  '2. code',
  '',
].join('\n')

const SKILL_AFTER = [
  '---',
  'name: company-ui-craft',
  'description: Use this when building UI, so screens avoid generic AI looks.',
  '---',
  '',
  '# UI Craft',
  '',
  '## Rules',
  '',
  '- ask before assuming',
  '- case by default',
  '- always explain the token that drives the change',
  '',
  '## Workflow',
  '',
  '1. explore',
  '2. code',
  '',
].join('\n')

const LISTING = [
  { path: 'SKILL.md', sha256: 'sha-skill-1' },
  { path: 'references/tokens.md', sha256: 'sha-tokens-1' },
]

function side(text, sha256, resources = LISTING) {
  return { sha256, text, resources }
}

test('修改协议是十二条逐字常量，最后一条说的是会话标题而不是不存在的 /name', () => {
  assert.equal(MODIFICATION_CONTRACT_RULES.length, 12)
  assert.equal(MODIFICATION_CONTRACT_RULES[0], '修改前必须读取当前文件。')
  assert.equal(MODIFICATION_CONTRACT_RULES[4], '必须保留 Skill 名称，除非用户明确要求修改名称。')
  assert.equal(MODIFICATION_CONTRACT_RULES[11], '不得自动改会话标题。')
  assert.ok(!JSON.stringify(MODIFICATION_CONTRACT_RULES).includes('/name'))
  for (const rule of MODIFICATION_CONTRACT_RULES) assert.ok(rule.length > 6)
})

test('消息来源是一个自带的 kind，不是通用的插件来源', () => {
  assert.equal(MODIFICATION_SOURCE_KIND, 'skill-intelligence-modify')
  assert.deepEqual(MODIFICATION_MESSAGE_SOURCE, { kind: 'skill-intelligence-modify' })
})

test('范围词表：六个选项、两个锁死、id 唯一、标签中英分明', () => {
  assert.equal(MODIFICATION_SCOPE_OPTIONS.length, 6)
  assert.deepEqual(MODIFICATION_SCOPE_IDS, [
    'skill-md-rules',
    'skill-md-workflow',
    'skill-md-description',
    'references',
    'scripts',
    'assets',
  ])
  assert.equal(new Set(MODIFICATION_SCOPE_IDS).size, 6)
  assert.deepEqual(MODIFICATION_LOCKED_SCOPE_IDS, ['scripts', 'assets'])
  for (const option of MODIFICATION_SCOPE_OPTIONS) {
    assert.ok(Object.isFrozen(option))
    assert.ok(typeof option.labelZh === 'string' && option.labelZh.length > 0)
    assert.ok(typeof option.labelEn === 'string' && option.labelEn.length > 0)
  }
  assert.equal(modificationScopeLabel('references', 'zh'), 'references')
  assert.equal(modificationScopeLabel('nonexistent', 'zh'), 'nonexistent')
})

test('resolveModificationScopes：锁死的不授予、不认识的进 unknown、顺序跟词表、空 = 只讨论', () => {
  const asked = resolveModificationScopes(['references', 'scripts', 'nope', 'references', 'skill-md-rules'])
  assert.deepEqual(asked.scopeIds, ['skill-md-rules', 'references'])
  assert.deepEqual(asked.locked, ['scripts'])
  assert.deepEqual(asked.unknown, ['nope'])
  assert.equal(asked.empty, false)

  for (const nothing of [undefined, null, [], 'skill-md-rules', 42, {}]) {
    const fallback = resolveModificationScopes(nothing)
    assert.deepEqual(fallback.scopeIds, [], String(nothing))
    assert.equal(fallback.empty, true)
  }
})

test('范围那句话：空集合有专门的说法，不许渲染成「随便改」', () => {
  assert.equal(modificationScopeText([]), '（没有指定范围：只讨论，不要改动任何文件）')
  assert.equal(modificationScopeText(['skill-md-rules', 'references']), 'SKILL.md / Rules、references')
  const contract = buildModificationContractText({ scopeIds: [], profileIds: [] })
  assert.ok(contract.includes('本次没有指定修改范围：只讨论，不要改动任何文件。'))
  assert.ok(contract.includes('12. 不得自动改会话标题。'))
  assert.ok(contract.includes('验收目标：按 DSH + Common Core。'))
})

test('送给 Agent 的消息：用户原话逐字、范围结构化、协议十二条约、「动手之前先问」与「先别说改好了」', () => {
  const text = buildModificationMessageText({
    skillName: 'company-ui-craft',
    intent: '增加一条规则：页面出现渐变时要在 token 里说明用途',
    scopeIds: ['skill-md-rules'],
    profileIds: ['common', 'dsh'],
  })
  assert.ok(text.includes('【Skill 修改任务 · 由 DSH Skill 洞察发起】'))
  assert.ok(text.includes('目标 Skill：company-ui-craft'))
  assert.ok(text.includes('修改范围：SKILL.md / Rules'))
  assert.ok(text.includes('验收目标：common、dsh'))
  // 原话必须逐字出现，插件不许改写也不许总结。
  assert.ok(text.includes('增加一条规则：页面出现渐变时要在 token 里说明用途'))
  for (let index = 0; index < 12; index += 1) {
    assert.ok(text.includes(`${index + 1}. ${MODIFICATION_CONTRACT_RULES[index]}`), `rule ${index + 1}`)
  }
  // 「提出方案 → 用户确认 → 动手」留在原生对话里（FR-MOD-003），所以消息里必须**要求**它发生：
  // 插件不代办、不解析，但也不能不提 —— 不提就等于 Agent 直接动手。
  assert.ok(text.includes('动手之前：先说明你打算怎么改'))
  assert.ok(text.includes('有拿不准的地方就用提问工具问用户，不要在猜的基础上改文件。'))
  // 顺序也要对：协议之后才是「动手之前」，再之后才是「做完之后」。
  assert.ok(text.indexOf('12. 不得自动改会话标题。') < text.indexOf('动手之前'))
  assert.ok(text.indexOf('动手之前') < text.indexOf('做完之后'))
  assert.ok(text.includes('在它给出验收结论之前，不要说改好了。'))
})

test('意图过长会被截断，空意图会反问而不是编一段意图', () => {
  const long = 'x'.repeat(MODIFICATION_INTENT_LIMIT + 50)
  const cut = buildModificationMessageText({ skillName: 'a', intent: long, scopeIds: [], profileIds: [] })
  assert.ok(cut.includes('x'.repeat(MODIFICATION_INTENT_LIMIT)))
  assert.ok(!cut.includes('x'.repeat(MODIFICATION_INTENT_LIMIT + 1)))
  const empty = buildModificationMessageText({ skillName: 'a', intent: '   ', scopeIds: [], profileIds: [] })
  assert.ok(empty.includes('（这次没有写意图，请先问我一句想怎么改。）'))
})

test('快照键：会话 + Skill 名，跨会话不许串台', () => {
  const key = modificationSnapshotKey({ sessionId: 's1', skillName: 'ui-craft' })
  assert.equal(key, 's1\u0000ui-craft')
  assert.notEqual(key, modificationSnapshotKey({ sessionId: 's2', skillName: 'ui-craft' }))
  assert.notEqual(key, modificationSnapshotKey({ sessionId: 's1', skillName: 'other' }))
})

test('没有快照就说无法比较，不许编一份「没有变化」', () => {
  const gone = diffSkillModification({ skillName: 'ui-craft' })
  assert.equal(gone.available, false)
  assert.equal(gone.reason, 'snapshot-missing')
  assert.equal(gone.status, 'unavailable')
  assert.equal(gone.message, MODIFICATION_SNAPSHOT_GONE_MESSAGE)
  assert.equal(gone.contentChanged, false)
  assert.deepEqual(gone.scopes, [])
  assert.deepEqual(gone.outOfScope, [])
  assert.equal(gone.limitations.length, 6)

  // 缺的是「现状」：快照还在，是磁盘上那份读不到了 —— 这才是「读不到 Skill」。
  const half = diffSkillModification({ skillName: 'ui-craft', before: side(SKILL_BEFORE, 'a') })
  assert.equal(half.available, false)
  assert.equal(half.reason, 'skill-unreadable')
  assert.equal(half.message, MODIFICATION_SNAPSHOT_GONE_MESSAGE)

  // 反过来：缺的是「改前」，而磁盘上那份好好的。这个时候说「读不到 Skill」等于把责任
  // 推给一个其实读得到的文件 —— 该说的还是「快照没了」。
  const noSnapshot = diffSkillModification({ skillName: 'ui-craft', after: side(SKILL_BEFORE, 'b') })
  assert.equal(noSnapshot.available, false)
  assert.equal(noSnapshot.reason, 'snapshot-missing')
  assert.equal(noSnapshot.message, MODIFICATION_SNAPSHOT_GONE_MESSAGE)

  // 任何输入都不抛错。
  for (const nothing of [undefined, null, 42, 'x', {}, { before: 1, after: 2 }]) {
    assert.doesNotThrow(() => diffSkillModification(nothing))
  }
})

test('同一个文本：没有变化，行级差异是 0/0，状态是 unchanged', () => {
  const same = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['skill-md-rules'],
    before: side(SKILL_BEFORE, 'sha-a'),
    after: side(SKILL_BEFORE, 'sha-a'),
  })
  assert.equal(same.available, true)
  assert.equal(same.contentChanged, false)
  assert.equal(same.status, 'unchanged')
  assert.deepEqual(same.lines, { added: 0, removed: 0, exact: true })
  assert.equal(same.summary.addedLines, 0)
  assert.equal(same.summary.outOfScopeCount, 0)
  assert.equal(same.identity.state, 'unchanged')
})

test('改了 Rules：那一节是 changed、行级差异精确、范围对账不冤枉已授权的部分', () => {
  const model = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['skill-md-rules'],
    before: side(SKILL_BEFORE, 'sha-a'),
    after: side(SKILL_AFTER, 'sha-b', [{ path: 'SKILL.md', sha256: 'sha-skill-2' }, { path: 'references/tokens.md', sha256: 'sha-tokens-1' }]),
    source: { beforeSha256: 'sha-source', afterSha256: 'sha-source' },
  })
  assert.equal(model.available, true)
  assert.equal(model.status, 'changed')
  assert.equal(model.lines.exact, true)
  assert.equal(model.lines.added, 1)
  assert.equal(model.lines.removed, 0)
  const rules = model.scopes.find((scope) => scope.id === 'skill-md-rules')
  assert.equal(rules.state, 'changed')
  assert.equal(rules.changed, true)
  const workflow = model.scopes.find((scope) => scope.id === 'skill-md-workflow')
  assert.equal(workflow.state, 'unchanged')
  // 改了 SKILL.md 的资源指纹：资源层如实列出内容变化的文件，且它没有被列为「超出范围」的正文，而是资源项。
  assert.deepEqual(model.resources.modified, ['SKILL.md'])
  // 来源这一项：两侧指纹相同，只能说「没有发生变化」。
  assert.equal(model.source.state, 'unchanged')
  assert.ok(model.source.message.includes('没有发生变化'))
})

test('范围对账：只授权 Rules，却动了 Workflow / Description，要如实报出来', () => {
  const after = SKILL_AFTER.replace('avoid generic AI looks', 'avoid generic AI looking screens').replace('2. code', '2. write code')
  const model = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['skill-md-rules'],
    before: side(SKILL_BEFORE, 'sha-a'),
    after: side(after, 'sha-b'),
  })
  const ids = model.outOfScope.map((entry) => entry.id)
  assert.ok(ids.includes('skill-md-description'), JSON.stringify(ids))
  assert.ok(ids.includes('skill-md-workflow'), JSON.stringify(ids))
  assert.ok(!ids.includes('skill-md-rules'), '已授权且真的改了的范围不该被报成超出范围')
  for (const entry of model.outOfScope) {
    assert.ok(entry.detail.includes('不在本次指定的修改范围里'), entry.detail)
  }
  assert.equal(model.summary.outOfScopeCount, model.outOfScope.length)
})

test('范围对账：资源被改而它没被授权时，一条里写清改的是哪个文件，同一件事不许报两遍', () => {
  const model = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['skill-md-rules'],
    before: side(SKILL_BEFORE, 'sha-a', [
      { path: 'SKILL.md', sha256: 'x' },
      { path: 'references/keep.md', sha256: 'k1' },
    ]),
    after: side(SKILL_BEFORE, 'sha-a', [
      { path: 'SKILL.md', sha256: 'x' },
      { path: 'references/keep.md', sha256: 'k2' },
    ]),
  })
  const ids = model.outOfScope.map((entry) => entry.id)
  assert.deepEqual([...new Set(ids)], ids, `同一件事不许报两遍：${ids.join(',')}`)
  const references = model.outOfScope.find((entry) => entry.id === 'references')
  assert.ok(references, JSON.stringify(ids))
  assert.ok(references.detail.includes('references/keep.md'), references.detail)
})

test('没有指定任何范围时，正文一动就如实报「没有指定任何 SKILL.md 范围」', () => {
  const model = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: [],
    before: side(SKILL_BEFORE, 'sha-a'),
    after: side(SKILL_AFTER, 'sha-b'),
  })
  assert.ok(model.notes.some((note) => note.includes('这次没有指定修改范围')))
  assert.ok(model.outOfScope.some((entry) => entry.detail.includes('本次没有指定任何 SKILL.md 范围')))
})

test('资源层：新增/删除/内容变化按 sha256 算，清单缺失就整层判不了', () => {
  const model = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['references'],
    before: side(SKILL_BEFORE, 'sha-a', [
      { path: 'SKILL.md', sha256: 'x' },
      { path: 'references/old.md', sha256: 'o1' },
      { path: 'references/keep.md', sha256: 'k1' },
    ]),
    after: side(SKILL_BEFORE, 'sha-a', [
      { path: 'SKILL.md', sha256: 'x' },
      { path: 'references/keep.md', sha256: 'k2' },
      { path: 'references/new.md', sha256: 'n1' },
    ]),
  })
  assert.equal(model.resources.available, true)
  assert.deepEqual(model.resources.added, ['references/new.md'])
  assert.deepEqual(model.resources.removed, ['references/old.md'])
  assert.deepEqual(model.resources.modified, ['references/keep.md'])
  const references = model.scopes.find((scope) => scope.id === 'references')
  assert.equal(references.state, 'changed')

  const noListing = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['references'],
    before: side(SKILL_BEFORE, 'sha-a', null),
    after: side(SKILL_BEFORE, 'sha-a', null),
  })
  assert.equal(noListing.resources.available, false)
  assert.equal(noListing.scopes.find((scope) => scope.id === 'references').state, 'unknown')
  assert.equal(noListing.scopes.find((scope) => scope.id === 'references').reason, 'no-directory-listing')
  assert.ok(noListing.notes.some((note) => note.includes('目录清单')))

  // 空的数组会被当成「目录真的是空的」，所以调用方必须传 null 而不是 []。
  const emptyIsNotMissing = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['references'],
    before: side(SKILL_BEFORE, 'sha-a', []),
    after: side(SKILL_BEFORE, 'sha-a', []),
  })
  assert.equal(emptyIsNotMissing.resources.available, true)
})

test('改了 name 要写进 notes（协议第 5 条要求保留名称）', () => {
  const renamed = diffSkillModification({
    skillName: 'company-ui-craft',
    scopeIds: ['skill-md-description'],
    before: side(SKILL_BEFORE, 'sha-a'),
    after: side(SKILL_AFTER.replace('name: company-ui-craft', 'name: company-ui-craft-v2'), 'sha-b'),
  })
  assert.equal(renamed.identity.state, 'changed')
  assert.ok(renamed.notes.some((note) => note.includes('name 字段在这次修改里变了')))
})

test('某一节在两侧都不存在时说「判不了」，不说「没变」', () => {
  const thin = ['---', 'name: a', 'description: b', '---', '', '# A', '', 'text', ''].join('\n')
  const model = diffSkillModification({
    skillName: 'a',
    scopeIds: ['skill-md-rules'],
    before: side(thin, 'sha-a'),
    after: side(thin, 'sha-a'),
  })
  const rules = model.scopes.find((scope) => scope.id === 'skill-md-rules')
  assert.equal(rules.state, 'unknown')
  assert.equal(rules.reason, 'section-not-found')
  assert.equal(rules.changed, false)
})

test('超过逐行比对上限时给近似值并标注不精确', () => {
  const lines = Array.from({ length: MODIFICATION_DIFF_LIMITS.lcsLines + 80 }, (_, index) => `line ${index}`)
  const before = lines.join('\n')
  const changed = [...lines]
  changed[10] = 'line 10 changed'
  const after = changed.join('\n')
  const model = diffSkillModification({
    skillName: 'big',
    scopeIds: [],
    before: side(before, 'sha-a'),
    after: side(after, 'sha-b'),
  })
  assert.equal(model.lines.exact, false)
  assert.equal(model.lines.added, 1)
  assert.equal(model.lines.removed, 1)
  assert.ok(model.notes.some((note) => note.includes('近似值')))
  assert.ok(model.notes.length <= 4)
})

test('来源保护只比指纹，说法必须是「发生变化」，不许指控某个 Agent 改了来源', () => {
  const same = sourceStatus({ beforeSha256: 'a', afterSha256: 'a' })
  assert.equal(same.state, 'unchanged')
  const changed = sourceStatus({ beforeSha256: 'a', afterSha256: 'b' })
  assert.equal(changed.state, 'changed')
  assert.equal(changed.message, '来源 Skill 在本次修改期间发生变化。')
  const missing = sourceStatus({})
  assert.equal(missing.state, 'unknown')
  const allText = JSON.stringify([MODIFICATION_SOURCE_CHANGED_MESSAGE, changed.message, missing.message])
  for (const accusation of ['Agent 修改了', 'Agent 改了', '被 Agent', '篡改']) {
    assert.ok(!allText.includes(accusation), accusation)
  }
})

test('状态文案只有三态，没有分数、等级、优秀', () => {
  assert.deepEqual(MODIFICATION_DIFF_STATUSES, ['unchanged', 'changed', 'unavailable'])
  assert.equal(modificationDiffStatusText('changed', 'zh'), '有变化')
  assert.equal(modificationDiffStatusText('unchanged', 'en'), 'No change')
  assert.equal(modificationDiffStatusText('unavailable', 'zh'), '无法比较')
  assert.equal(modificationDiffStatusText('whatever', 'zh'), 'whatever')
})

test('模块里所有对外文案都不含 §6.7 禁用词与评分词', () => {
  const forbidden = ['已执行', '未执行', '已完成', '未完成', '执行成功', '执行失败', '已运行', '未运行', '已加载', '已读取', '已注入', '已生效']
  const scoreWords = ['评分', '分数', '等级', '优秀', '最佳', '推荐度', '得分']
  const strings = []
  const walk = (value) => {
    if (typeof value === 'string') { strings.push(value); return }
    if (Array.isArray(value)) { value.forEach(walk); return }
    if (value && typeof value === 'object') { Object.values(value).forEach(walk) }
  }
  for (const value of Object.values(modification)) walk(value)
  assert.ok(strings.length > 40, String(strings.length))
  for (const text of strings) {
    for (const word of [...forbidden, ...scoreWords]) {
      assert.ok(!text.includes(word), `${word} in ${text}`)
    }
  }
})

test('限制说明写清了「快照丢了不编造」「没有版本实体」', () => {
  assert.equal(MODIFICATION_DIFF_LIMITATIONS.length, 6)
  const joined = MODIFICATION_DIFF_LIMITATIONS.join('\n')
  assert.ok(joined.includes('DSH 重启或快照过期之后'))
  assert.ok(joined.includes('没有版本实体'))
  assert.ok(joined.includes('不评价这次修改好不好'))
})
