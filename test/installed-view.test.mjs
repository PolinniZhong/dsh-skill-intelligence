import test from 'node:test'
import assert from 'node:assert/strict'

import { buildInstalledView, matchesInstalledQuery, projectInstalledSkill } from '../src/core/installed-view.mjs'

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
  assert.deepEqual(Object.keys(skill).sort(), ['description', 'invocation', 'name', 'provider'])
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

test('skills are sorted by name so the list does not reshuffle between polls', () => {
  const view = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT, LOREFLOW, { name: 'a-skill', description: '' }]) })
  assert.deepEqual(view.skills.map((skill) => skill.name), ['a-skill', 'loreflow-copilot', 'ui-craft'])
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
  assert.deepEqual(unknown.limitations, ['catalog-coverage-incomplete'])
  assert.equal(unknown.totalCount, 0)

  const incomplete = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT], { status: 'incomplete', complete: false }) })
  assert.equal(incomplete.coverage, 'incomplete')
  assert.deepEqual(incomplete.limitations, ['catalog-coverage-incomplete'])
  assert.equal(incomplete.skills.length, 1)

  const complete = buildInstalledView({ catalogSnapshot: snapshot([UI_CRAFT]) })
  assert.equal(complete.coverage, 'complete')
  assert.deepEqual(complete.limitations, [])
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
