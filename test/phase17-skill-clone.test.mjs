import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLONE_ERROR,
  CLONE_MAX_BYTES,
  CLONE_MODES,
  CLONE_SCOPES,
  cloneTargetName,
  describeCloneResult,
  isSkillName,
  planCloneSource,
  rewriteSkillName,
  selectCloneEntries,
  splitFrontmatter,
} from '../src/core/skill-clone.mjs'

const SKILL_MD = [
  '---',
  'name: frontend-design',
  'description: Build interfaces that do not look generated.',
  'whenToUse: when the user asks for a UI',
  '---',
  '',
  '# Frontend Design',
  '',
  'Body text.',
  '',
].join('\n')

test('the clone target name follows the DSH Skill-name grammar, not the looser host one', () => {
  assert.equal(isSkillName('ui-craft'), true)
  assert.equal(isSkillName('a'), true)
  assert.equal(isSkillName('ui--craft'), false, 'doubled separators are not a DSH name')
  assert.equal(isSkillName('UI-Craft'), false, 'the host rule allows uppercase; DSH does not')
  assert.equal(isSkillName('ui_craft'), false)
  assert.equal(isSkillName('ui.craft'), false)
  assert.equal(isSkillName('ui/craft'), false)
  assert.equal(isSkillName(' ui-craft '), false)
  assert.equal(isSkillName(''), false)
  assert.equal(isSkillName('-ui-craft'), false)
  assert.equal(isSkillName('a'.repeat(129)), false)
  assert.deepEqual([...CLONE_SCOPES], ['project', 'user'])
  assert.deepEqual([...CLONE_MODES], ['bundle', 'skill-md'])
})

test('the suggested target name is a suggestion, and stays legal when the source name is long', () => {
  assert.equal(cloneTargetName('frontend-design'), 'frontend-design-custom')
  assert.equal(isSkillName(cloneTargetName('frontend-design')), true)
  const long = cloneTargetName('a'.repeat(200))
  assert.equal(isSkillName(long), true)
  assert.equal(long.endsWith('-custom'), true)
  // 冲突时不允许在这里退让成 frontend-design-custom-2 —— §14 要求让用户改名。
  assert.equal(cloneTargetName('frontend-design'), cloneTargetName('frontend-design'))
})

test('frontmatter is split by the same rules the filesystem provider uses', () => {
  const split = splitFrontmatter(SKILL_MD)
  assert.equal(split.ok, true)
  assert.match(split.frontmatter, /^name: frontend-design$/m)
  assert.equal(split.body.startsWith('# Frontend Design'), true)
  assert.equal(split.body.endsWith('Body text.'), true, 'the body is trimmed like parseSkillFile does')

  assert.equal(splitFrontmatter('name: no-fence\n').reason, 'missing-frontmatter')
  assert.equal(splitFrontmatter('---\nname: x\n').reason, 'unterminated-frontmatter')
  assert.equal(splitFrontmatter('').reason, 'empty-file')
  // 第一行是 `--- ` 也不行：必须整整一行。
  assert.equal(splitFrontmatter('--- \nname: x\n---\n').reason, 'missing-frontmatter')
})

test('only the copy gets renamed, and only its name line', () => {
  const rewritten = rewriteSkillName(SKILL_MD, 'frontend-design-custom')
  assert.equal(rewritten.ok, true)
  assert.match(rewritten.text, /^name: frontend-design-custom$/m)
  assert.match(rewritten.text, /^description: Build interfaces that do not look generated\.$/m)
  assert.match(rewritten.text, /^whenToUse: when the user asks for a UI$/m)
  assert.equal(rewritten.text.includes('name: frontend-design\n'), false, 'the source name must not survive as a second field')
  assert.equal(splitFrontmatter(rewritten.text).body, splitFrontmatter(SKILL_MD).body, 'the body is copied byte for byte')

  assert.equal(rewriteSkillName(SKILL_MD, 'Frontend Custom').reason, 'invalid-target-name')
  assert.equal(rewriteSkillName('---\ndescription: x\n---\nbody\n', 'ok-name').reason, 'missing-name-field')
  assert.equal(rewriteSkillName('no fence\n', 'ok-name').reason, 'missing-frontmatter')
  // 源字符串本身没有被改动（纯函数，输入是只读的）。
  assert.match(SKILL_MD, /^name: frontend-design$/m)
})

test('a flat-file Skill is never mistaken for a directory bundle', () => {
  const bundle = planCloneSource({
    sourceName: 'ui-craft',
    definitionName: 'ui-craft',
    definitionAvailable: true,
    resourceBasePath: '/Users/someone/.dsh/skills/ui-craft',
  })
  assert.equal(bundle.mode, 'bundle')
  assert.equal(bundle.directory, '/Users/someone/.dsh/skills/ui-craft')

  // 扁平 Skill 的 resourceBase 指向 skills 根目录：照它递归会把别人的 Skill 全拷走。
  const flat = planCloneSource({
    sourceName: 'lark-doc',
    definitionName: 'lark-doc',
    definitionAvailable: true,
    resourceBasePath: '/Users/someone/.dsh/skills',
  })
  assert.equal(flat.mode, 'skill-md')
  assert.equal(flat.directory, null)
  assert.equal(flat.reason, 'resource-base-is-not-the-skill-directory')

  // 目录名和 Skill 名不一致时同样只敢拷 SKILL.md。
  const renamed = planCloneSource({
    sourceName: 'ui-craft',
    definitionName: 'ui-craft',
    definitionAvailable: true,
    resourceBasePath: '/Users/someone/.dsh/skills/some-other-dir',
  })
  assert.equal(renamed.mode, 'skill-md')

  const missing = planCloneSource({ sourceName: 'ui-craft', definitionName: 'ui-craft', definitionAvailable: false, resourceBasePath: '/x' })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, CLONE_ERROR.DEFINITION_UNAVAILABLE)
  const mismatch = planCloneSource({ sourceName: 'ui-craft', definitionName: 'other', definitionAvailable: true, resourceBasePath: '/x' })
  assert.equal(mismatch.code, CLONE_ERROR.SKILL_NOT_FOUND)
  const bad = planCloneSource({ sourceName: 'UI_Craft', definitionName: 'UI_Craft', definitionAvailable: true, resourceBasePath: '/x' })
  assert.equal(bad.code, CLONE_ERROR.INVALID_REQUEST)
})

test('the copy plan says out loud what it is leaving behind', () => {
  const plan = selectCloneEntries([
    { path: 'SKILL.md', type: 'file', size: 1200 },
    { path: 'references/tokens.md', type: 'file', size: 400 },
    { path: 'references/../escape.md', type: 'file', size: 10 },
    { path: '/etc/passwd', type: 'file', size: 10 },
    { path: 'node_modules/left-pad/index.js', type: 'file', size: 10 },
    { path: '.git/config', type: 'file', size: 10 },
    { path: 'assets/logo.png', type: 'symlink', size: 0 },
    { path: 'scripts', type: 'directory', size: 0 },
  ])
  assert.deepEqual(plan.files.map((file) => file.path), ['SKILL.md', 'references/tokens.md'])
  assert.equal(plan.bytes, 1600)
  assert.equal(plan.truncated, false)
  const reasons = new Map(plan.skipped.map((entry) => [entry.path, entry.reason]))
  assert.equal(reasons.get('references/../escape.md'), 'unsafe-path')
  assert.equal(reasons.get('/etc/passwd'), 'unsafe-path')
  assert.equal(reasons.get('node_modules/left-pad/index.js'), 'excluded-directory')
  assert.equal(reasons.get('.git/config'), 'excluded-directory')
  assert.equal(reasons.get('assets/logo.png'), 'symlink', 'a symlink can point outside the Skill directory')
  assert.equal(reasons.get('scripts'), 'not-a-file')
})

test('the copy plan is bounded and reports truncation instead of quietly stopping', () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ path: `references/f${index}.md`, type: 'file', size: 10 }))
  const bounded = selectCloneEntries(many, { maxFiles: 5 })
  assert.equal(bounded.files.length, 5)
  assert.equal(bounded.truncated, true)
  assert.equal(bounded.skipped.filter((entry) => entry.reason === 'over-limit').length, 15)

  const heavy = selectCloneEntries([{ path: 'SKILL.md', type: 'file', size: 10 }, { path: 'assets/big.bin', type: 'file', size: CLONE_MAX_BYTES + 1 }])
  assert.deepEqual(heavy.files.map((file) => file.path), ['SKILL.md'])
  assert.equal(heavy.truncated, true)
})

test('the success sentence names the scope and the mode, never an absolute path', () => {
  const sentence = describeCloneResult({
    skillName: 'frontend-design-custom',
    scope: 'user',
    mode: 'bundle',
    fileCount: 7,
    skippedCount: 2,
    truncated: false,
  })
  assert.match(sentence, /用户级/)
  assert.match(sentence, /完整 Skill/)
  assert.match(sentence, /7 个文件/)
  assert.match(sentence, /跳过 2 个条目/)
  assert.equal(sentence.includes('/'), false, 'a local absolute path must not reach the UI')
  const minimal = describeCloneResult({ skillName: 'x-custom', scope: 'project', mode: 'skill-md', fileCount: 1, skippedCount: 0, truncated: false })
  assert.match(minimal, /仅 SKILL\.md/)
  assert.match(minimal, /当前项目/)
  assert.equal(minimal.includes('跳过'), false)
})

test('every documented clone failure has a code, because a bare "Clone failed" is not an answer', () => {
  assert.deepEqual(Object.keys(CLONE_ERROR).sort(), [
    'BUNDLE_UNREADABLE',
    'DEFINITION_UNAVAILABLE',
    'INVALID_REQUEST',
    'SKILL_NOT_FOUND',
    'SOURCE_CHANGED',
    'TARGET_EXISTS',
    'WRITE_FAILED',
  ])
})
