import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildDefinitionOutline, parseFrontmatter, slugify, anchorStepsToOutline } from '../src/core/definition-outline.mjs'
import { normalizeRemoteUrl, resolveRepositorySource, findGitRoot } from '../src/core/repository-resolver.mjs'
import { buildSkillDefinitionView, compareDefinitionToRun, RENDERED_ENVELOPE_LIMITATION } from '../src/core/skill-definition.mjs'

// Skill Definition Viewer — Core Unit Test layer.
//
// Two things are being defended here, and neither is "does it parse Markdown".
//
// 1. The Definition Viewer is the only surface in this plugin that holds a Skill's *body*
//    in memory to show it. Every other surface keeps a hash. So the tests that matter are the
//    ones about what leaves the module: no absolute path, no credential, and no reconstructed
//    `<skill_content>` envelope that the harness never actually produced.
//
// 2. The repository of a Skill is discovered, never derived. A wrong-but-plausible repository
//    would be displayed as fact, so `unresolved` has to be a normal, well-formed answer rather
//    than a failure — and it has to stay that way when a `.git` exists but points somewhere else.

const FIXTURE = `---
name: code-review
description: Reviews a diff before it is committed.
metadata:
  repository: https://github.com/example/code-review-skill
---

# Purpose

Check a change against the rules the project already agreed on.

## Workflow

1. Read the diff
2. Check the tests

\`\`\`bash
# not a heading — this is a shell comment
npm test
\`\`\`

## Workflow

A second section with the same name.
`

test('frontmatter is read as fields, and the body line is reported', () => {
  const parsed = parseFrontmatter(FIXTURE)
  assert.equal(parsed.present, true)
  assert.equal(parsed.fields.name, 'code-review')
  // A nested key is reported under its parent rather than flattened to `repository`, so the
  // repository resolver can weigh `metadata.repository` differently from a top-level one.
  assert.equal(parsed.fields['metadata.repository'], 'https://github.com/example/code-review-skill')
  assert.equal(parsed.fields.repository, undefined)
  // Line 7 is the first line after the closing fence — the heading is on 8, and the blank
  // line between them belongs to the body. Reporting 8 here would be a guess about spacing.
  assert.equal(parsed.bodyStartLine, 7)
})

test('a document with no frontmatter reports none', () => {
  const parsed = parseFrontmatter('# Purpose\n\nBody.\n')
  assert.equal(parsed.present, false)
  assert.deepEqual(parsed.fields, {})
  assert.equal(parsed.bodyStartLine, 1)
})

test('a `---` that is not on the first line is a rule, not frontmatter', () => {
  // Treating this as frontmatter would swallow the heading above it.
  const parsed = parseFrontmatter('# Purpose\n\n---\n\nname: not-frontmatter\n')
  assert.equal(parsed.present, false)
})

test('the outline carries the line each heading was written on', () => {
  const outline = buildDefinitionOutline(FIXTURE)
  assert.deepEqual(
    outline.entries.map((entry) => [entry.level, entry.title, entry.line]),
    [
      [1, 'Purpose', 8],
      [2, 'Workflow', 12],
      [2, 'Workflow', 22],
    ],
  )
  // Same title twice gets distinct anchors without either losing its own scroll target.
  assert.deepEqual(outline.entries.map((entry) => entry.id), ['purpose', 'workflow', 'workflow-2'])
  assert.equal(outline.lineCount, FIXTURE.split('\n').length)
})

test('a `#` inside a fenced block is not a heading', () => {
  const outline = buildDefinitionOutline(FIXTURE)
  assert.equal(outline.entries.some((entry) => entry.title.includes('not a heading')), false)
})

test('the frontmatter block contributes no heading', () => {
  const outline = buildDefinitionOutline(FIXTURE)
  assert.equal(outline.entries.every((entry) => entry.line >= 8), true)
})

test('a heading with nothing but markup still gets a usable anchor', () => {
  assert.equal(slugify('`***`'), 'section')
  assert.equal(slugify('目标 / Goal'), '目标-goal')
})

test('steps are anchored by line containment, not by wording', () => {
  const outline = buildDefinitionOutline(FIXTURE)
  const anchors = anchorStepsToOutline(outline, [
    { id: 'step-1', line: 13 },
    { id: 'step-2', line: 14 },
    { id: 'step-3', line: 25 },
  ])
  assert.equal(anchors.get('step-1'), 'workflow')
  assert.equal(anchors.get('step-2'), 'workflow')
  // A later section is a different anchor even though its title reads the same.
  assert.equal(anchors.get('step-3'), 'workflow-2')
})

test('a step above the first heading is left unanchored rather than attached', () => {
  const outline = buildDefinitionOutline(FIXTURE)
  const anchors = anchorStepsToOutline(outline, [{ id: 'step-0', line: 1 }, { id: 'step-x', line: 'twelve' }])
  assert.equal(anchors.has('step-0'), false)
  assert.equal(anchors.has('step-x'), false)
})

test('remote URLs are normalised, and a credentialed one is refused whole', () => {
  assert.deepEqual(normalizeRemoteUrl('https://github.com/example/code-review-skill.git'), {
    label: 'remote:github.com/example/code-review-skill',
    cloneCommand: 'https://github.com/example/code-review-skill',
    host: 'github.com',
    path: 'example/code-review-skill',
  })
  // The SSH form carries a user but no secret; it is a remote like any other.
  assert.equal(normalizeRemoteUrl('git@github.com:example/code-review-skill.git').label, 'remote:github.com/example/code-review-skill')
  // A token in the URL is refused rather than stripped: a partially shown credential is
  // still a credential on screen.
  assert.equal(normalizeRemoteUrl('https://user:secret@github.com/example/x.git').refused, 'credential-bearing-remote')
  assert.equal(normalizeRemoteUrl('/Users/someone/projects/x').refused, 'unrecognised-remote')
  assert.equal(normalizeRemoteUrl('').refused, 'empty-remote')
})

test('a Skill that names its repository is resolved from the frontmatter, and no work tree is consulted', async () => {
  const resolved = await resolveRepositorySource({
    frontmatter: parseFrontmatter(FIXTURE),
    resourceBase: { kind: 'directory', path: '/does/not/exist/skills/code-review' },
  })
  assert.equal(resolved.status, 'resolved')
  assert.equal(resolved.basis, 'frontmatter')
  assert.equal(resolved.key, 'metadata.repository')
  assert.equal(resolved.label, 'remote:github.com/example/code-review-skill')
  assert.equal(resolved.cloneCommand, 'https://github.com/example/code-review-skill')
})

test('a Skill with no repository field is unresolved, not guessed', async () => {
  const resolved = await resolveRepositorySource({
    frontmatter: { present: false, fields: {} },
    resourceBase: { kind: 'directory', path: join(tmpdir(), 'definitely-not-a-work-tree-deep-path') },
  })
  assert.equal(resolved.status, 'unresolved')
  assert.equal(resolved.basis, null)
  assert.equal(resolved.label, null)
  assert.equal(resolved.limitations.includes('no-git-work-tree-found'), true)
})

test('a URL resource base has no directory to inspect, and says so', async () => {
  const resolved = await resolveRepositorySource({
    frontmatter: { present: false, fields: {} },
    resourceBase: { kind: 'url', url: 'https://example.com/skill' },
  })
  assert.equal(resolved.status, 'unresolved')
  assert.equal(resolved.limitations.includes('no-local-directory-to-inspect'), true)
})

test('a work tree resolves the repository and the path relative to its root', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'skill-trace-repo-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const skillDir = join(root, 'skills', 'code-review')
  await mkdir(skillDir, { recursive: true })
  await mkdir(join(root, '.git'), { recursive: true })
  await writeFile(
    join(root, '.git', 'config'),
    '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = git@github.com:example/code-review-skill.git\n\tfetch = +refs/heads/*\n',
  )

  assert.deepEqual(await findGitRoot(skillDir), { gitDir: join(root, '.git'), root })
  const resolved = await resolveRepositorySource({
    frontmatter: { present: false, fields: {} },
    resourceBase: { kind: 'directory', path: skillDir },
  })
  assert.equal(resolved.status, 'resolved')
  assert.equal(resolved.basis, 'git-remote')
  assert.equal(resolved.key, 'remote.origin.url')
  assert.equal(resolved.label, 'remote:github.com/example/code-review-skill')
  // A repository-relative path is what the Repository Source card shows. The absolute local
  // path never leaves the resolver.
  assert.equal(resolved.relativePath, 'skills/code-review')
})

test('a work tree whose origin carries a token stays unresolved', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'skill-trace-repo-token-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, '.git'), { recursive: true })
  await writeFile(join(root, '.git', 'config'), '[remote "origin"]\n\turl = https://user:ghp_secret@github.com/example/x.git\n')

  const resolved = await resolveRepositorySource({
    frontmatter: { present: false, fields: {} },
    resourceBase: { kind: 'directory', path: root },
  })
  assert.equal(resolved.status, 'unresolved')
  assert.equal(resolved.label, null)
  assert.equal(resolved.limitations.includes('git-remote-credential-bearing-remote'), true)
  // The path is still reported: knowing where in the tree the Skill sits is not a secret.
  assert.equal(resolved.relativePath, '.')
})

function fixtureRegistry(definition) {
  return { get: async () => definition }
}

test('the definition view keeps the body, its hash and its outline together', async () => {
  const view = await buildSkillDefinitionView(
    fixtureRegistry({
      name: 'code-review',
      description: 'Reviews a diff before it is committed.',
      source: 'project-agents',
      provider: 'filesystem',
      invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: { kind: 'directory', path: '/Users/someone/project/skills/code-review' },
      content: FIXTURE,
    }),
    'code-review',
    { now: 1790000000000 },
  )

  assert.equal(view.available, true)
  assert.equal(view.summary.source, 'project-agents')
  assert.equal(view.summary.invocation.modelInvocable, true)
  assert.equal(view.content.text, FIXTURE)
  assert.equal(view.content.bytes, FIXTURE.length)
  assert.match(view.content.sha256, /^sha256:[0-9a-f]{64}$/)
  assert.equal(view.outline.length, 3)
  assert.equal(view.frontmatter.keys.includes('metadata.repository'), true)
  assert.equal(view.repository.status, 'resolved')
  assert.equal(view.repository.basis, 'frontmatter')
})

test('the absolute resource path is read and then withheld', async () => {
  const view = await buildSkillDefinitionView(
    fixtureRegistry({
      name: 'code-review',
      description: '',
      invocation: {},
      resourceBase: { kind: 'directory', path: '/Users/someone/project/skills/code-review' },
      content: '# Purpose\n',
    }),
    'code-review',
  )
  assert.equal(view.resourceBase.kind, 'directory')
  assert.equal(view.resourceBase.path, null)
  assert.equal(view.resourceBase.pathOmitted, true)
  assert.equal(view.limitations.includes('resource-base-path-withheld'), true)
  // Nothing anywhere in the payload may carry the local path.
  assert.equal(JSON.stringify(view).includes('/Users/someone'), false)
})

test('the rendered envelope is reported as unavailable, never reconstructed', async () => {
  const view = await buildSkillDefinitionView(
    fixtureRegistry({ name: 'x', content: 'hi\n', invocation: {}, resourceBase: { kind: 'directory', path: '/' } }),
    'x',
  )
  assert.deepEqual(view.renderedEnvelope, { available: false, reason: RENDERED_ENVELOPE_LIMITATION })
})

test('a Skill that is no longer installed is unknown, not an error', async () => {
  const view = await buildSkillDefinitionView({ get: async () => undefined }, 'code-review')
  assert.equal(view.available, false)
  assert.equal(view.reason, 'unknown-skill')
  assert.equal(view.skillName, 'code-review')
})

test('a registry that throws is reported as unavailable rather than crashing the route', async () => {
  const view = await buildSkillDefinitionView({ get: async () => { throw new Error('no registry') } }, 'code-review')
  assert.equal(view.available, false)
  assert.equal(view.reason, 'registry-unavailable')
})

test('a body over the display cap is truncated and says so', async () => {
  const big = `${'# Purpose\n'}${'x'.repeat(300 * 1024)}`
  const view = await buildSkillDefinitionView(fixtureRegistry({ name: 'x', content: big, invocation: {}, resourceBase: null }), 'x')
  assert.equal(view.content.truncated, true)
  assert.equal(view.content.bytes, big.length)
  assert.equal(view.content.text.length, 256 * 1024)
  // The hash is of the whole body, so a truncated view still identifies the real file.
  assert.notEqual(view.content.sha256, view.content.returnedSha256)
  assert.equal(view.limitations.includes('definition-truncated-for-display'), true)
})

test('an invalid skill name is refused before the registry is touched', async () => {
  let called = false
  const view = await buildSkillDefinitionView({ get: async () => { called = true; return null } }, '../../etc/passwd')
  assert.equal(view.available, false)
  assert.equal(view.reason, 'invalid-skill-name')
  assert.equal(called, false)
})

test('a definition is related to the run by hash, load fact and catalog membership', async () => {
  const view = await buildSkillDefinitionView(
    fixtureRegistry({ name: 'code-review', content: FIXTURE, invocation: {}, resourceBase: null }),
    'code-review',
  )
  const receipt = {
    traceEvents: [
      { skillName: 'code-review', status: 'loaded', evidenceFingerprint: { scope: 'skill-instructions', value: view.content.sha256 } },
    ],
    catalogPublished: {
      observedAt: 1790000000000,
      seq: 4,
      turn: 2,
      step: 1,
      update: false,
      entryCount: 3,
      entriesDigest: 'sha256:aaa',
      entries: [{ name: 'code-review', description: 'x' }, { name: 'other', description: 'y' }],
    },
  }
  const observation = compareDefinitionToRun(receipt, 'code-review', view)
  assert.equal(observation.match, 'match')
  assert.equal(observation.loadedDuringRun, true)
  assert.equal(observation.inPublishedCatalog, true)
  assert.equal(observation.catalogPublication.entryCount, 3)
  assert.deepEqual(observation.observedInstructionSha256, [view.content.sha256])
})

test('a changed file is a mismatch, and an unloaded Skill is unavailable rather than a mismatch', async () => {
  const view = await buildSkillDefinitionView(
    fixtureRegistry({ name: 'code-review', content: FIXTURE, invocation: {}, resourceBase: null }),
    'code-review',
  )
  const changed = {
    traceEvents: [
      { skillName: 'code-review', status: 'loaded', evidenceFingerprint: { scope: 'skill-instructions', value: 'sha256:other' } },
    ],
  }
  assert.equal(compareDefinitionToRun(changed, 'code-review', view).match, 'mismatch')

  // Listed but never loaded: the run recorded no instruction hash, so there is nothing to
  // compare against and no accusation to make.
  const neverLoaded = { traceEvents: [{ skillName: 'code-review', status: 'listed' }] }
  const observation = compareDefinitionToRun(neverLoaded, 'code-review', view)
  assert.equal(observation.match, 'unavailable')
  assert.equal(observation.loadedDuringRun, false)
  assert.equal(observation.inPublishedCatalog, null)
  assert.equal(observation.catalogPublication, null)
})

test('an empty receipt never produces a match', () => {
  const observation = compareDefinitionToRun(null, 'code-review', { content: { sha256: 'sha256:x' } })
  assert.equal(observation.match, 'unavailable')
  assert.deepEqual(observation.observedInstructionSha256, [])
})
