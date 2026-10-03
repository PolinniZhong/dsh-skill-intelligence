import test from 'node:test'
import assert from 'node:assert/strict'

import { buildInstalledView, INSTALLED_ORDERING_RULE, matchesInstalledQuery, projectInstalledSkill } from '../src/core/installed-view.mjs'

const snapshot = (skills, extra = {}) => ({
  status: 'complete',
  complete: true,
  observedAt: 1_700_000_000_000,
  skills,
  ...extra,
})

const UI_CRAFT = { name: 'ui-craft', description: 'Use for UI design work', provider: 'filesystem', sourceFingerprint: 'sha256:abc', invocation: { modelInvocable: true, userInvocable: false } }
const LOREFLOW = { name: 'loreflow-copilot', description: 'LoRA 训练助手', provider: 'filesystem', sourceFingerprint: 'sha256:def', invocation: { modelInvocable: true, userInvocable: true } }

test('the installed list is metadata only and never carries an absolute path', () => {
  // `SkillSummary.path` 是绝对路径，宿主的 snapshot 已经剥掉它；这里守住第二道。
  const view = buildInstalledView({ catalogSnapshot: snapshot([{ ...UI_CRAFT, path: '/Users/someone/secret-skills/ui-craft/SKILL.md' }]) })
  assert.equal(view.skills.length, 1)
  const skill = view.skills[0]
  assert.deepEqual(Object.keys(skill).sort(), ['addedAt', 'description', 'invocation', 'lineage', 'name', 'provider'])
  assert.equal(JSON.stringify(view).includes('/Users/'), false)
})

test('unknown host fields do not flow through to the client', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([{ ...UI_CRAFT, learningStatus: 'verified', pendingReview: true, validationCount: 3 }]),
  })
  const serialised = JSON.stringify(view)
  for (const forbidden of ['learningStatus', 'pendingReview', 'validationCount']) {
    assert.equal(serialised.includes(forbidden), false)
  }
})

test('a skill without a usable name is dropped rather than rendered blank', () => {
  assert.equal(projectInstalledSkill({ name: '   ' }), null)
  assert.equal(projectInstalledSkill({ name: 42 }), null)
  assert.equal(projectInstalledSkill(null), null)
  const view = buildInstalledView({ catalogSnapshot: snapshot([{ name: '  ' }, UI_CRAFT]) })
  assert.deepEqual(view.skills.map((skill) => skill.name), ['ui-craft'])
})

test('the same Skill discovered twice appears once', () => {
  const view = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT, { ...UI_CRAFT, provider: 'custom' }]) })
  assert.equal(view.totalCount, 1)
  assert.equal(view.skills[0].provider, 'filesystem')
})

test('the most recently added Skill comes first, and the ones with no add time come last', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW, { name: 'a-skill', description: '' }]),
    addedAtByName: { 'ui-craft': 1_700_000_300_000, 'a-skill': 1_700_000_200_000 },
    lineageByName: {},
  })
  // 有时间的按时间倒序在前；没有时间的（loreflow-copilot）按名称排在最后。
  assert.deepEqual(view.skills.map((skill) => skill.name), ['ui-craft', 'a-skill', 'loreflow-copilot'])
  assert.deepEqual(view.ordering, { rule: INSTALLED_ORDERING_RULE, addedAtKnown: 2, addedAtUnknown: 1 })
  assert.equal(view.limitations.includes('added-at-partial'), true)
})

test('with no readable add time the list falls back to name order and says why', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW, { name: 'a-skill' }]),
    lineageByName: {},
  })
  assert.deepEqual(view.skills.map((skill) => skill.name), ['a-skill', 'loreflow-copilot', 'ui-craft'])
  assert.deepEqual(view.ordering, { rule: INSTALLED_ORDERING_RULE, addedAtKnown: 0, addedAtUnknown: 3 })
  assert.deepEqual(view.limitations, ['added-at-unavailable'])
})

test('a skill with a known add time always outranks one without', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW]),
    addedAtByName: { 'ui-craft': 5 },
    lineageByName: {},
  })
  // 名称上 loreflow-copilot 排在 ui-craft 前面，但 ui-craft 有真实时间 —— 顺序由时间决定。
  assert.deepEqual(view.skills.map((skill) => skill.name), ['ui-craft', 'loreflow-copilot'])
  assert.deepEqual(view.limitations, ['added-at-partial'])
})

test('the add-time counts describe the whole catalogue, not the current search', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW]),
    query: 'ui',
    addedAtByName: { 'ui-craft': 5 },
    lineageByName: {},
  })
  assert.equal(view.skillCount, 1)
  assert.equal(view.ordering.addedAtKnown, 1)
  assert.equal(view.ordering.addedAtUnknown, 1)
})

test('a cloned skill carries where it came from, and only as a name', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT]),
    lineageByName: { 'ui-craft': { sourceSkillName: 'ui-craft-base', createdAt: 1_700_000_000_000 } },
  })
  assert.deepEqual(view.skills[0].lineage, { sourceSkillName: 'ui-craft-base', createdAt: 1_700_000_000_000 })
  assert.equal(view.limitations.includes('lineage-unavailable'), false)
})

test('a lineage record that is not a plain Skill name is dropped, never printed', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT]),
    lineageByName: { 'ui-craft': { sourceSkillName: '../../etc/passwd\n<b>x</b>', createdAt: 1 } },
  })
  assert.equal(view.skills[0].lineage, null)
})

test('an unusable add time is null, never a fabricated date', () => {
  const view = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT]),
    addedAtByName: { 'ui-craft': 0 },
    lineageByName: {},
  })
  assert.equal(view.skills[0].addedAt, null)
  assert.equal(view.ordering.addedAtKnown, 0)
  assert.deepEqual(view.skills[0].lineage, null)
})

test('an unreadable lineage store is said out loud instead of reading as "never cloned"', () => {
  const unreadable = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT]) })
  assert.equal(unreadable.limitations.includes('lineage-unavailable'), true)
  const readable = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT]), lineageByName: {} })
  assert.equal(readable.limitations.includes('lineage-unavailable'), false)
})

test('search filters on name and description, case-insensitively', () => {
  const view = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW]), query: 'UI' })
  assert.deepEqual(view.skills.map((skill) => skill.name), ['ui-craft'])
  assert.equal(view.skillCount, 1)
  assert.equal(view.totalCount, 2)
  const byDescription = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW]), query: '训练' })
  assert.deepEqual(byDescription.skills.map((skill) => skill.name), ['loreflow-copilot'])
})

test('an empty query keeps every skill and a query with no match keeps the honest total', () => {
  const all = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW]), query: '   ' })
  assert.equal(all.skillCount, 2)
  assert.equal(all.query, '')
  const none = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW]), query: 'nope' })
  assert.equal(none.skillCount, 0)
  assert.equal(none.totalCount, 2, 'a filtered-to-nothing list must still say how many are installed')
})

test('an incomplete discovery says so instead of reading as "you have no skills"', () => {
  const unknown = buildInstalledView({ catalogSnapshot: { status: 'coverage-unknown', complete: false, observedAt: 1, skills: [] } })
  assert.equal(unknown.coverage, 'unknown')
  // 空目录没有「加入时间」可说，所以这里没有 added-at-* —— 「一个 Skill 都没有」与
  // 「有 Skill 但读不到时间」必须分得开。
  assert.deepEqual(unknown.limitations, ['catalog-coverage-incomplete', 'lineage-unavailable'])
  assert.equal(unknown.totalCount, 0)

  const incomplete = buildInstalledView({
    catalogSnapshot: snapshot([UI_CRAFT], { status: 'incomplete', complete: false }),
    lineageByName: {},
  })
  assert.equal(incomplete.coverage, 'incomplete')
  assert.deepEqual(incomplete.limitations, ['catalog-coverage-incomplete', 'added-at-unavailable'])
  assert.equal(incomplete.skills.length, 1)

  const complete = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT]), lineageByName: {} })
  assert.equal(complete.coverage, 'complete')
  assert.deepEqual(complete.limitations, ['added-at-unavailable'])
})

test('a missing snapshot is an unknown catalogue, never a crash', () => {
  const view = buildInstalledView({})
  assert.equal(view.coverage, 'unknown')
  assert.deepEqual(view.skills, [])
  assert.equal(view.observedAt, null)
})

test('matchesInstalledQuery treats a blank query as "everything"', () => {
  const skill = projectInstalledSkill(UI_CRAFT)
  assert.equal(matchesInstalledQuery(skill, ''), true)
  assert.equal(matchesInstalledQuery(skill, '   '), true)
  assert.equal(matchesInstalledQuery(skill, 'design'), true)
  assert.equal(matchesInstalledQuery(skill, 'designer'), false)
})
