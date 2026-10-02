import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIFF_CHANGE_KINDS,
  DIFF_SHAPE_FIELDS,
  DIFF_LIMITATIONS,
  DIFF_SOURCE_WORDS,
  DIFF_STATUS,
  DIFF_UNAVAILABLE_MESSAGE,
  DIFF_WORDS,
  buildSkillDiff,
} from '../src/core/skill-diff.mjs'

const SOURCE_SHA = `sha256:${'a'.repeat(64)}`
const OTHER_SHA = `sha256:${'b'.repeat(64)}`

const BASE = `---
name: ui-craft
description: Build UI from a token file
---

# ui-craft

You build UI the way the house builds UI.

## When to use

Use this when a screen needs to match the design system.

## Rules

- Be precise
- Never invent a colour

## Workflow

1. Read the token file
2. Write the CSS
3. Check contrast
`

function side(name, content, overrides = {}) {
  return { skillName: name, content, summary: { description: 'Build UI' }, sha256: SOURCE_SHA, ...overrides }
}

function diff(sourceContent, targetContent, overrides = {}) {
  return buildSkillDiff({
    source: side('ui-craft', sourceContent),
    target: side('my-ui-craft', targetContent),
    ...overrides,
  })
}

function sectionOf(model, title) {
  return model.content.sections.find((section) => section.title === title)
}

function shapeOf(model, title) {
  return model.structure.sections.find((section) => section.title === title)
}

function kinds(model, title) {
  return (sectionOf(model, title)?.lines ?? []).map((line) => line.kind)
}

test('two identical Skills compare as unchanged on all three layers', () => {
  const model = diff(BASE, BASE)
  assert.equal(model.comparison.status, 'unchanged')
  assert.equal(model.structure.status, 'unchanged')
  assert.equal(model.content.status, 'unchanged')
  assert.equal(model.resources.status, 'unchanged')
  assert.equal(model.structure.counts.modified, 0)
  assert.equal(model.structure.counts.added, 0)
  assert.equal(model.structure.counts.removed, 0)
  assert.ok(model.structure.counts.unchanged >= 4, 'every declared section is matched, not listed as new')
  assert.equal(model.comparison.limitations.length, 0)
})

test('an added section is added, a removed one is removed, and neither is a rewrite', () => {
  const grown = `${BASE}\n## Pitfalls\n\n- Do not round every corner\n`
  const added = diff(BASE, grown)
  assert.equal(added.comparison.status, 'changed')
  assert.equal(added.structure.counts.added, 1)
  assert.equal(added.structure.counts.removed, 0)
  assert.equal(sectionOf(added, 'Pitfalls').status, 'added')
  assert.equal(added.content.counts.added, 1)

  const shrunk = diff(grown, BASE)
  assert.equal(shrunk.structure.counts.removed, 1)
  assert.equal(shrunk.structure.counts.added, 0)
  assert.equal(sectionOf(shrunk, 'Pitfalls').status, 'removed')
  assert.equal(shrunk.content.counts.removed, 1)
})

test('a changed section reports the changed lines with real line numbers on both sides', () => {
  const edited = BASE.replace('- Never invent a colour', '- Never invent a colour\n- Ask before adding one')
  const model = diff(BASE, edited)
  assert.equal(model.comparison.status, 'changed')
  assert.equal(sectionOf(model, 'Rules').status, 'modified')
  assert.equal(sectionOf(model, 'When to use').status, 'unchanged')
  assert.deepEqual(kinds(model, 'Rules'), ['unchanged', 'unchanged', 'unchanged', 'unchanged', 'added'])

  const addedLine = sectionOf(model, 'Rules').lines.at(-1)
  assert.equal(addedLine.text, '- Ask before adding one')
  assert.equal(addedLine.sourceLine, null, 'a line that was added has no source line to jump to')
  assert.equal(addedLine.targetLine, 18, 'the line number is the one in the file, not the one in the section')
  assert.equal(sectionOf(model, 'Rules').sourceLine, 14)
  assert.equal(sectionOf(model, 'Rules').anchorId, 'rules', 'the anchor is the outline id the viewer already emits')
})

test('a reworded heading is a removal plus an addition, not a silently reused section', () => {
  const renamed = BASE.replace('## Rules', '## House rules')
  const model = diff(BASE, renamed)
  assert.equal(model.structure.counts.added, 1)
  assert.equal(model.structure.counts.removed, 1)
  assert.equal(model.structure.counts.modified, 0)
  assert.equal(sectionOf(model, 'House rules').status, 'added')
  assert.equal(sectionOf(model, 'Rules').status, 'removed')
})

test('structure compares shape, and a workflow that grew a step is a modified section', () => {
  const grown = BASE.replace('2. Write the CSS', '2. Write the CSS\n0. Confirm the target file')
  const model = diff(BASE, grown)
  assert.equal(sectionOf(model, 'Workflow').status, 'modified')
  assert.equal(shapeOf(model, 'Workflow').status, 'modified')
  assert.ok(shapeOf(model, 'Workflow').changed.includes('items'),
    'the counted items changed, so the shape changed too')
  assert.equal(sectionOf(model, 'Rules').status, 'unchanged')
})

test('resources report added, removed, modified and unchanged files by path', () => {
  const sourceFiles = [
    { path: 'SKILL.md', sha256: 'doc-1' },
    { path: 'references/tokens.md', sha256: 'tokens-1' },
    { path: 'references/motion.md', sha256: 'motion-1' },
    { path: 'scripts/gen.py', sha256: 'gen-1' },
  ]
  const targetFiles = [
    { path: 'SKILL.md', sha256: 'doc-2' },
    { path: 'references/tokens.md', sha256: 'tokens-2' },
    { path: 'references/motion.md', sha256: 'motion-1' },
    { path: 'notes/decisions.md', sha256: 'notes-1' },
  ]
  const model = buildSkillDiff({
    source: side('ui-craft', BASE, { files: sourceFiles }),
    target: side('my-ui-craft', BASE, { files: targetFiles }),
    cloneMode: 'bundle',
  })
  const byPath = new Map(model.resources.entries.map((entry) => [entry.path, entry.status]))
  assert.equal(byPath.get('references/tokens.md'), 'modified')
  assert.equal(byPath.get('references/motion.md'), 'unchanged')
  assert.equal(byPath.get('scripts/gen.py'), 'removed')
  assert.equal(byPath.get('notes/decisions.md'), 'added')
  assert.equal(byPath.has('SKILL.md'), false, 'SKILL.md is the content layer\'s business, not a resource')
  assert.equal(model.resources.status, 'changed')
  assert.equal(model.resources.mode, 'bundle')
})

test('a skill-md clone did not copy resources, so a source-only file is not called deleted', () => {
  const model = buildSkillDiff({
    source: side('ui-craft', BASE, { files: [{ path: 'references/tokens.md', sha256: 'tokens-1' }] }),
    target: side('my-ui-craft', BASE, { files: [] }),
    cloneMode: 'skill-md',
  })
  assert.equal(model.resources.status, 'unchanged')
  assert.deepEqual(model.resources.entries, [],
    'those files were never copied, so listing them as 删除 would be a false statement')
  assert.ok(model.comparison.limitations.includes(DIFF_LIMITATIONS.skillMdCloneHasNoResources))
})

test('a moved source is reported as a fact, not as a failed request', () => {
  const model = buildSkillDiff({
    source: side('ui-craft', BASE, { sha256: OTHER_SHA }),
    target: side('my-ui-craft', BASE),
    sourceOriginalSha256: SOURCE_SHA,
  })
  assert.equal(model.comparison.source.changed, true)
  assert.equal(model.comparison.source.originalSha256, SOURCE_SHA)
  assert.equal(model.comparison.source.currentSha256, OTHER_SHA)
  assert.equal(DIFF_SOURCE_WORDS.changed, '来源内容已发生变化')
  // 两件不同的事实：来源**移动过**，和两侧**现在**不一样。上面这份内容一字不差，所以后者是
  // `unchanged`；把两者混成一个字段，界面就没法同时说清「来源变了」和「你没有改」。
  assert.equal(model.comparison.status, 'unchanged')

  const unmoved = buildSkillDiff({
    source: side('ui-craft', BASE, { sha256: SOURCE_SHA }),
    target: side('my-ui-craft', BASE),
    sourceOriginalSha256: SOURCE_SHA,
  })
  assert.equal(unmoved.comparison.source.changed, false)

  const unknown = diff(BASE, BASE)
  assert.equal(unknown.comparison.source.changed, null,
    'with no lineage record there is no earlier fingerprint to compare against — say so instead of guessing')
})

test('an unreadable side is unavailable — never "no changes"', () => {
  const noSource = buildSkillDiff({ source: { skillName: 'ui-craft', content: null, reason: 'source-missing' }, target: side('my-ui-craft', BASE) })
  assert.equal(noSource.comparison.status, 'unavailable')
  assert.equal(noSource.comparison.source.available, false)
  assert.equal(noSource.comparison.source.reason, 'source-missing')
  assert.equal(noSource.structure.status, 'unavailable')
  assert.equal(noSource.content.status, 'unavailable')
  assert.equal(noSource.resources.status, 'unavailable')
  assert.deepEqual(noSource.structure.sections, [])
  assert.deepEqual(noSource.structure.counts, { added: 0, removed: 0, modified: 0, unchanged: 0 })
  assert.ok(noSource.comparison.limitations.includes(DIFF_LIMITATIONS.sourceUnavailable))

  const noTarget = buildSkillDiff({ source: side('ui-craft', BASE), target: null })
  assert.equal(noTarget.comparison.status, 'unavailable')
  assert.equal(noTarget.comparison.target.available, false)
  assert.ok(noTarget.comparison.limitations.includes(DIFF_LIMITATIONS.targetUnavailable))

  const neither = buildSkillDiff({})
  assert.equal(neither.comparison.status, 'unavailable')
  assert.ok(neither.comparison.limitations.includes(DIFF_LIMITATIONS.sourceUnavailable))
  assert.ok(neither.comparison.limitations.includes(DIFF_LIMITATIONS.targetUnavailable))
})

test('the model says only the words a fact can use — no verdict, no score', () => {
  const model = diff(BASE, BASE.replace('Never invent a colour', 'Always invent a colour'))
  const flat = JSON.stringify(model)
  assert.deepEqual(DIFF_CHANGE_KINDS, ['added', 'removed', 'modified', 'unchanged'])
  assert.deepEqual(Object.keys(DIFF_WORDS).sort(), ['added', 'modified', 'removed', 'unavailable', 'unchanged'])
  assert.deepEqual(DIFF_STATUS, ['unchanged', 'changed', 'unavailable'])
  for (const banned of ['score', 'rank', 'quality', 'percent', 'better', 'worse', 'best', 'recommend', '更优秀', '更差', '质量', '优化', '建议保留', '建议删除', '最佳']) {
    assert.equal(flat.includes(banned), false, `the diff model must not carry "${banned}"`)
  }
  assert.equal(DIFF_UNAVAILABLE_MESSAGE, '当前无法读取来源 Skill，无法完成差异比较。')

  // 结构层的形状差异必须用闭集里的名字，否则界面就得自己造词。
  const tabled = diff(BASE, BASE.replace('- Be precise', '- Be precise\n\n| token | use |\n| --- | --- |\n| --bg | page |'))
  assert.ok(shapeOf(tabled, 'Rules').changed.includes('tables'))
  const names = [...model.structure.sections, ...tabled.structure.sections].flatMap((section) => section.changed)
  assert.ok(names.length > 0, 'the fixture must actually produce some shape change, or this guard is asleep')
  for (const name of names) assert.ok(DIFF_SHAPE_FIELDS.includes(name), `"${name}" is not a registered shape field`)

  // 降一级会把这一节变成上一节的子节，于是它在结构上确实是「没了」而不是「改小了」——
  // 这是框架的既有判定，差异层照抄，不自己发明第二套层级规则。
  const demoted = diff(BASE, BASE.replace('## Rules', '### Rules'))
  assert.equal(sectionOf(demoted, 'Rules').status, 'removed')
  assert.equal(shapeOf(demoted, 'Rules').changed[0], 'presence')
})

test('a section too large to compare line by line says so instead of guessing', () => {
  const bulk = Array.from({ length: 700 }, (_, index) => `- line ${index}`).join('\n')
  const oversized = `${BASE}\n## Bulk\n\n${bulk}\n`
  const edited = oversized.replace('- line 700', '- line 700')
  const model = diff(oversized, `${edited.replace('- line 3\n', '- line three\n')}`)
  const bulkSection = sectionOf(model, 'Bulk')
  assert.equal(bulkSection.status, 'modified')
  assert.deepEqual(bulkSection.lines, [])
  assert.ok(model.content.limitations.includes(DIFF_LIMITATIONS.sectionTooLarge))
})
