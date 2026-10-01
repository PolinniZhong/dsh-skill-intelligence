import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { rebuildReceipt } from '../src/core/trace-reducer.mjs'
import { buildDefinitionOutline } from '../src/core/definition-outline.mjs'
import { extractDeclaredFlow, sanitizeFlowTitle, scanDeclaredSteps } from '../src/core/skill-flow.mjs'
import {
  attachEvidenceToFlow,
  buildSessionSkillList,
  buildSkillDetail,
  projectSkillEvidence,
} from '../src/core/skill-view-model.mjs'

// Skill-first IA — the acceptance cases.
//
// These tests do not ask "does the view render". They ask the questions the refactor exists to
// answer: is a Skill a first-class object, does its declared flow come from its own definition
// rather than from what happened to run, and can runtime evidence ever rewrite the declaration.
// A1..A12 here map to §7.1 of the Skill-first IA SDD.

const SESSION = 'session-skill-first'
let seq = 0
const nextSeq = () => (seq += 1)

function toolCall({ turn, step, name, capabilityId, args }) {
  const callId = `call_${turn}_${step}_${nextSeq()}`
  return [
    {
      type: 'tool/call',
      seq: nextSeq(),
      time: 1790000000000 + nextSeq() * 10,
      data: {
        turn,
        step,
        callId,
        name,
        ...(args === undefined ? {} : { arguments: typeof args === 'string' ? args : JSON.stringify(args) }),
      },
    },
    {
      type: 'tool/result',
      seq: nextSeq(),
      time: 1790000000000 + nextSeq() * 10,
      data: { message: { source: { callId }, isError: false } },
    },
  ]
}

function skillLoad({ turn, step, skillName, at = 1790000000000 }) {
  return {
    type: 'tool/call',
    seq: nextSeq(),
    time: at,
    data: {
      turn,
      step,
      callId: `skill-invocation:${turn}:${skillName}`,
      name: 'skill',
      arguments: JSON.stringify({ name: skillName, invocationType: 'model-invoked' }),
    },
  }
}

/** Build a receipt through the real reducer, so runtime events are DSH-shaped. */
function receiptOf({ rawEvents, traces, extra = {} }) {
  const receipt = rebuildReceipt(SESSION, rawEvents, null)
  return { ...receipt, traceEvents: traces, ...extra }
}

function loadedTrace({ skillName, turn = 2, step = 1, at = 1790000000000, fingerprint = null }) {
  return {
    eventId: `${SESSION}:invocation:${turn}:${skillName}`,
    sessionId: SESSION,
    turn,
    step,
    skillName,
    status: 'loaded',
    invocationType: 'model-invoked',
    callId: `skill-invocation:${turn}:${skillName}`,
    requestedAt: at,
    resolvedAt: at + 5,
    callSeq: 1,
    resultSeq: 2,
    consumer: 'model',
    consumerIdentity: 'observed-in-session-event',
    coverage: 'observed-injection-source',
    evidenceFingerprint: fingerprint
      ? { algorithm: 'sha256', scope: 'skill-instructions', value: fingerprint }
      : null,
  }
}

/** A definition view shaped exactly like `buildSkillDefinitionView` returns. */
function definitionOf(text, { skillName = 'skill-a', repository = null } = {}) {
  const outline = buildDefinitionOutline(text)
  const sha = `sha256:${'a'.repeat(64)}`
  return {
    schemaVersion: 1,
    skillName,
    available: true,
    reason: null,
    checkedAt: 1790000009999,
    summary: {
      description: 'A demo skill.',
      whenToUse: null,
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'custom',
      provider: 'filesystem',
    },
    resourceBase: { kind: 'directory', path: null, pathOmitted: true, url: null, note: null },
    content: {
      sha256: sha,
      returnedSha256: sha,
      bytes: text.length,
      lineCount: text.split('\n').length,
      text,
      truncated: false,
    },
    outline: outline.entries,
    outlineTruncated: outline.truncated,
    outlineHeadingCount: outline.headingCount,
    frontmatter: { present: false, keys: [], bodyStartLine: 1 },
    renderedEnvelope: { available: false, reason: 'rendered-envelope-not-reproducible-outside-the-harness' },
    repository,
    limitations: [],
  }
}

const SKILL_MD = [
  '# Purpose',
  '',
  'Review a change and report what it does.',
  '',
  '## Workflow',
  '',
  '1. Read the diff',
  '2. Run the tests',
  '3. Report findings',
  '',
].join('\n')

const flowShape = (detail) =>
  detail.flow.steps.map((step) => ({
    id: step.id,
    order: step.order,
    title: step.title,
    kind: step.kind,
    line: step.line,
  }))

// ---------------------------------------------------------------------------
// A1 / A2 — the list is load evidence, not the registry
// ---------------------------------------------------------------------------

test('A1: the Skill list contains only Skills this session loaded', () => {
  const receipt = receiptOf({
    rawEvents: [skillLoad({ turn: 2, step: 1, skillName: 'skill-a' })],
    traces: [loadedTrace({ skillName: 'skill-a' })],
    // A snapshot for a Skill that never loaded: it must not become a list entry.
    extra: { sourceSnapshots: [{ skillName: 'never-loaded', provider: 'filesystem', source: 'custom' }] },
  })
  const asked = []
  const list = buildSessionSkillList(receipt, {
    lookup: (name) => {
      asked.push(name)
      return { description: 'described', source: 'custom', provider: 'filesystem', definitionStatus: 'available' }
    },
  })
  assert.deepEqual(list.skills.map((skill) => skill.name), ['skill-a'])
  assert.deepEqual(asked, ['skill-a'], 'the registry is consulted only for names load evidence already produced')
  assert.equal(list.scope, 'session-loaded-skills-only')
  assert.equal(list.skills[0].runCount, 1)
  assert.equal(list.skills[0].description, 'described')
  assert.deepEqual(list.limitations, [])
})

test('A1b: a Skill the registry can resolve but the session never loaded stays out', () => {
  const receipt = receiptOf({
    rawEvents: [skillLoad({ turn: 2, step: 1, skillName: 'skill-a' })],
    traces: [loadedTrace({ skillName: 'skill-a' })],
  })
  const list = buildSessionSkillList(receipt, { lookup: () => ({ definitionStatus: 'available' }) })
  assert.equal(list.skills.some((skill) => skill.name === 'agentic-eval'), false)
  assert.equal(list.skillCount, 1)
})

test('A2: the list counts runs and orders by most recent load', () => {
  const receipt = receiptOf({
    rawEvents: [skillLoad({ turn: 2, step: 1, skillName: 'skill-b', at: 1790000000100 })],
    traces: [
      loadedTrace({ skillName: 'skill-a', turn: 2, step: 1, at: 1790000000100 }),
      loadedTrace({ skillName: 'skill-b', turn: 4, step: 3, at: 1790000000900 }),
      loadedTrace({ skillName: 'skill-a', turn: 6, step: 2, at: 1790000000500 }),
    ],
  })
  const list = buildSessionSkillList(receipt)
  assert.deepEqual(list.skills.map((skill) => skill.name), ['skill-b', 'skill-a'])
  assert.equal(list.skills[0].runCount, 1)
  assert.equal(list.skills[1].runCount, 2)
  assert.equal(list.skills[1].lastLoadedAt, 1790000000505)
  assert.deepEqual(list.limitations, ['registry-unavailable-so-descriptions-and-definition-status-are-missing'])
})

// ---------------------------------------------------------------------------
// A3 / A4 — runs and the definition snapshot
// ---------------------------------------------------------------------------

test('A3: a run is identified by the event the harness assigned, never a fabricated id', () => {
  const receipt = receiptOf({
    rawEvents: [skillLoad({ turn: 2, step: 1, skillName: 'skill-a' })],
    traces: [loadedTrace({ skillName: 'skill-a' })],
  })
  const detail = buildSkillDetail({ receipt, view: definitionOf(SKILL_MD), skillName: 'skill-a' })
  assert.equal(detail.runs.length, 1)
  assert.equal(detail.runs[0].runKey, `${SESSION}:invocation:2:skill-a`)
  assert.equal(detail.runs[0].eventId, `${SESSION}:invocation:2:skill-a`)
  assert.equal(detail.runs[0].turn, 2)
  assert.equal(detail.runs[0].step, 1)
  assert.equal('runId' in detail.runs[0], false, 'DSH has no native runId, so none may be invented')
})

test('A4: a definition snapshot compares hashes and refuses to call a missing hash a mismatch', () => {
  const fingerprint = `sha256:${'a'.repeat(64)}`
  const withHash = receiptOf({
    rawEvents: [skillLoad({ turn: 2, step: 1, skillName: 'skill-a' })],
    traces: [loadedTrace({ skillName: 'skill-a', fingerprint })],
  })
  const view = definitionOf(SKILL_MD)
  const matched = buildSkillDetail({ receipt: withHash, view, skillName: 'skill-a' })
  assert.equal(matched.runs[0].definitionSnapshot.match, 'match')
  assert.equal(matched.observation.match, 'match')

  const changed = definitionOf(SKILL_MD)
  changed.content.sha256 = `sha256:${'b'.repeat(64)}`
  changed.content.returnedSha256 = `sha256:${'b'.repeat(64)}`
  const mismatched = buildSkillDetail({ receipt: withHash, view: changed, skillName: 'skill-a' })
  assert.equal(mismatched.runs[0].definitionSnapshot.match, 'mismatch')

  const noHash = receiptOf({
    rawEvents: [skillLoad({ turn: 2, step: 1, skillName: 'skill-a' })],
    traces: [loadedTrace({ skillName: 'skill-a', fingerprint: null })],
  })
  const unavailable = buildSkillDetail({ receipt: noHash, view, skillName: 'skill-a' })
  assert.equal(unavailable.runs[0].definitionSnapshot.match, 'unavailable')
  assert.equal(unavailable.observation.match, 'unavailable')
  assert.equal(JSON.stringify(unavailable).includes('"mismatch"'), false, 'an absent hash is not a change')
})

// ---------------------------------------------------------------------------
// A5 / A6 — the flow comes from the definition, and evidence may only fill it in
// ---------------------------------------------------------------------------

test('A5: the declared flow is identical with and without runtime evidence', () => {
  const view = definitionOf(SKILL_MD)
  const withRuntime = receiptOf({
    rawEvents: [
      skillLoad({ turn: 2, step: 1, skillName: 'skill-a' }),
      ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'npm test' } }),
    ],
    traces: [loadedTrace({ skillName: 'skill-a' })],
  })
  const noRuntime = receiptOf({
    rawEvents: [],
    traces: [loadedTrace({ skillName: 'skill-a' })],
  })
  const a = buildSkillDetail({ receipt: withRuntime, view, skillName: 'skill-a' })
  const b = buildSkillDetail({ receipt: noRuntime, view, skillName: 'skill-a' })
  assert.deepEqual(flowShape(a), flowShape(b))
  assert.deepEqual(a.flow.steps.map((step) => step.id), ['declared:1', 'declared:2', 'declared:3'])
  assert.equal(a.flow.source, 'definition')
  assert.equal(a.flow.steps[0].title, 'Read the diff')
  assert.equal(a.flow.steps[0].kind, 'inspect')
  assert.equal(a.flow.steps[1].kind, 'execute')
  assert.equal(a.flow.steps[2].kind, 'produce')
})

test('A5b: a definition that only has prose declares an empty flow rather than a guess', () => {
  const view = definitionOf('# Notes\n\nThis skill has no numbered workflow at all.\n')
  const detail = buildSkillDetail({ receipt: receiptOf({ rawEvents: [], traces: [] }), view, skillName: 'skill-a' })
  assert.deepEqual(detail.flow.steps, [])
  assert.equal(detail.flow.source, 'definition')
  assert.ok(detail.limitations.includes('this-session-recorded-no-successful-load-of-this-skill'))
})

test('A6: runtime evidence fills a step in but never rewrites what it declares', () => {
  const view = definitionOf(SKILL_MD)
  const receipt = receiptOf({
    rawEvents: [
      skillLoad({ turn: 2, step: 1, skillName: 'skill-a' }),
      ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'npm test' } }),
    ],
    traces: [loadedTrace({ skillName: 'skill-a' })],
  })
  const withEvidence = buildSkillDetail({ receipt, view, skillName: 'skill-a' })
  const bare = buildSkillDetail({
    receipt: receiptOf({ rawEvents: [], traces: [loadedTrace({ skillName: 'skill-a' })] }),
    view,
    skillName: 'skill-a',
  })

  // Identity is byte-for-byte stable...
  assert.deepEqual(flowShape(withEvidence), flowShape(bare))
  assert.deepEqual(
    JSON.parse(JSON.stringify(withEvidence.flow.steps.map((step) => step.id))),
    JSON.parse(JSON.stringify(bare.flow.steps.map((step) => step.id))),
  )
  // ...and the only thing that moved is the evidence.
  const evidenceOnly = (detail) => detail.flow.steps.map((step) => step.evidence.relationship)
  assert.notDeepEqual(evidenceOnly(withEvidence), evidenceOnly(bare))
  assert.deepEqual(evidenceOnly(withEvidence), ['insufficient', 'runtime-supported', 'insufficient'])
})

test('A6b: attachEvidenceToFlow reads the step and nothing else from the alignment item', () => {
  const flow = {
    schemaVersion: 1,
    source: 'definition',
    steps: [{ id: 'declared:1', order: 1, title: 'Run the tests', kind: 'execute', line: 8, evidenceType: 'ordered-list' }],
    stepCount: 1,
    limitations: [],
  }
  const annotated = [
    {
      invocation: { resolution: 'matched', evidenceCategory: 'test', modelIntentPresent: true },
      specificity: 'generic',
      step: { kind: 'execute' },
    },
  ]
  const filled = attachEvidenceToFlow(flow, annotated, true)
  assert.equal(filled.steps[0].title, 'Run the tests')
  assert.equal(filled.steps[0].kind, 'execute')
  assert.equal(filled.steps[0].line, 8)
  assert.equal(filled.steps[0].id, 'declared:1')
  assert.equal(filled.steps[0].evidence.relationship, 'runtime-supported')
})

// ---------------------------------------------------------------------------
// A7 / A8 — no definition, no flow; anchors travel with the steps
// ---------------------------------------------------------------------------

test('A7: without a definition the flow is honestly empty and never built from invocations', () => {
  const receipt = receiptOf({
    rawEvents: [
      skillLoad({ turn: 2, step: 1, skillName: 'skill-a' }),
      ...toolCall({ turn: 2, step: 2, name: 'bash', capabilityId: 'cli', args: { command: 'npm test' } }),
    ],
    traces: [loadedTrace({ skillName: 'skill-a' })],
  })
  const detail = buildSkillDetail({
    receipt,
    view: { schemaVersion: 1, skillName: 'skill-a', available: false, reason: 'unknown-skill', checkedAt: 1 },
    skillName: 'skill-a',
  })
  assert.deepEqual(detail.flow.steps, [])
  assert.equal(detail.flow.source, 'definition')
  assert.equal(detail.flow.stepCount, 0)
  assert.ok(detail.limitations.includes('definition-unavailable-so-no-declared-flow-could-be-extracted'))
  // The run is still reported — evidence is not hidden just because the declaration is gone.
  assert.equal(detail.runs.length, 1)
  assert.equal(detail.evidence.invocationCount >= 0, true)
})

test('A8: every anchored step points at a real outline entry', () => {
  const view = definitionOf(SKILL_MD)
  const detail = buildSkillDetail({ receipt: receiptOf({ rawEvents: [], traces: [] }), view, skillName: 'skill-a' })
  const entryIds = new Set(view.outline.map((entry) => entry.id))
  assert.deepEqual(Object.keys(detail.anchors).sort(), ['declared:1', 'declared:2', 'declared:3'])
  for (const entryId of Object.values(detail.anchors)) assert.ok(entryIds.has(entryId))
  assert.equal(detail.anchors['declared:1'], 'workflow')
})

// ---------------------------------------------------------------------------
// A9 / A10 — the evidence carries categories, never argument text
// ---------------------------------------------------------------------------

test('A9: the evidence projection carries categories and booleans, not arguments', () => {
  const receipt = receiptOf({
    rawEvents: [
      skillLoad({ turn: 2, step: 1, skillName: 'skill-a' }),
      ...toolCall({
        turn: 2,
        step: 2,
        name: 'bash',
        capabilityId: 'cli',
        args: { command: 'npm test --token=super-secret-value', description: 'Run /Users/someone/private suite' },
      }),
      ...toolCall({ turn: 2, step: 3, name: 'read', capabilityId: 'file', args: { file_path: '/Users/someone/private/secret.txt' } }),
    ],
    traces: [loadedTrace({ skillName: 'skill-a' })],
  })
  const evidence = projectSkillEvidence(receipt, 'skill-a')
  const json = JSON.stringify(evidence)
  assert.equal(json.includes('super-secret-value'), false)
  assert.equal(json.includes('secret.txt'), false)
  assert.equal(json.includes('Run /Users/someone'), false)
  assert.equal(json.includes('/Users/'), false)
  assert.equal(json.includes('"command"'), false)
  assert.equal(json.includes('"arguments"'), false)
  const kinds = evidence.invocations.map((invocation) => invocation.stepKind)
  assert.deepEqual(kinds, ['execute', 'inspect'], 'the load is the run start, not a step evidence entry')
  assert.equal(evidence.invocations.some((invocation) => invocation.name === 'skill'), false)
})

test('A10: the whole Skill detail payload never leaks an absolute path', () => {
  const view = definitionOf(SKILL_MD)
  const receipt = receiptOf({
    rawEvents: [
      skillLoad({ turn: 2, step: 1, skillName: 'skill-a' }),
      ...toolCall({ turn: 2, step: 2, name: 'read', capabilityId: 'file', args: { file_path: '/Users/someone/private/secret.txt' } }),
    ],
    traces: [loadedTrace({ skillName: 'skill-a', fingerprint: `sha256:${'a'.repeat(64)}` })],
  })
  const detail = buildSkillDetail({ receipt, view, skillName: 'skill-a' })
  const json = JSON.stringify(detail)
  assert.equal(json.includes('/Users/'), false)
  assert.equal(json.includes('secret.txt'), false)
})

test('A10b: the returned payload is JSON-serialisable — no Map leaks into it', () => {
  const detail = buildSkillDetail({
    receipt: receiptOf({ rawEvents: [], traces: [] }),
    view: definitionOf(SKILL_MD),
    skillName: 'skill-a',
  })
  const roundTripped = JSON.parse(JSON.stringify(detail))
  assert.deepEqual(roundTripped.anchors, detail.anchors)
  assert.equal(roundTripped.flow.steps.length, 3)
})

// ---------------------------------------------------------------------------
// A11 — the flow parser withholds rather than guesses
// ---------------------------------------------------------------------------

test('A11: a step title carrying a local path is withheld, not scrubbed into something plausible', () => {
  assert.equal(sanitizeFlowTitle('Read /Users/someone/project/secret.md'), '')
  assert.equal(sanitizeFlowTitle('Read ~/notes/private.md'), '')
  assert.equal(sanitizeFlowTitle('Read C:\\Users\\someone\\notes.md'), '')
  const body = ['## Workflow', '', '1. Read the diff', '2. Inspect /Users/someone/private/notes.md', '3. Report findings', ''].join('\n')
  const flow = extractDeclaredFlow(body, { truncated: false })
  assert.deepEqual(flow.steps.map((step) => step.title), ['Read the diff', 'Report findings'])
  assert.equal(flow.withheldCount, 1)
  assert.ok(flow.limitations.includes('flow-steps-withheld-by-sanitiser'))
  assert.equal(JSON.stringify(flow).includes('/Users/'), false)
})

test('A11b: the definition-side parser skips fenced code that the receipt-side parser sees', () => {
  const body = [
    '## Workflow',
    '',
    '```bash',
    '### Install the dependencies',
    'npm install',
    '```',
    '',
    '1. Read the diff',
    '',
  ].join('\n')
  const fromDefinition = extractDeclaredFlow(body, { truncated: false })
  assert.deepEqual(fromDefinition.steps.map((step) => step.title), ['Read the diff'])
  // The receipt path keeps its existing behaviour: it has no fence awareness, so the `###` inside
  // the fence is a heading candidate — and because headings win over ordered lists there, the
  // receipt path declares a flow of one step that the Skill never declared, taken from a shell
  // comment inside a code block. This divergence is deliberate, and it is why the definition side
  // owns the declared flow.
  const rawScan = scanDeclaredSteps(body)
  assert.deepEqual(rawScan.candidates.map((candidate) => candidate.title), ['Install the dependencies'])
  assert.equal(rawScan.channel, 'heading')
})

test('A11c: a truncated definition says so instead of looking complete', () => {
  const flow = extractDeclaredFlow(SKILL_MD, { truncated: true })
  assert.ok(flow.limitations.includes('definition-truncated-so-the-flow-may-be-incomplete'))
  assert.equal(flow.truncated, true)
})

// ---------------------------------------------------------------------------
// A12 — the repository is resolved or it is absent; it is never guessed
// ---------------------------------------------------------------------------

test('A12: an unresolved repository produces no link, no URL and no plausible guess', () => {
  const repository = {
    status: 'unresolved',
    basis: null,
    key: null,
    label: null,
    relativePath: null,
    cloneCommand: null,
    limitations: ['no-git-work-tree-found'],
  }
  const detail = buildSkillDetail({
    receipt: receiptOf({ rawEvents: [], traces: [] }),
    view: definitionOf(SKILL_MD, { repository }),
    skillName: 'skill-a',
  })
  assert.equal(detail.repository.status, 'unresolved')
  assert.equal(detail.repository.label, null)
  assert.equal(detail.repository.cloneCommand, null)
  const json = JSON.stringify(detail)
  assert.equal(json.includes('github.com'), false, 'the Skill name must never be turned into a repository URL')
  assert.equal(json.includes('http'), false)
})

// ---------------------------------------------------------------------------
// A13 — the wiring the client depends on actually exists
// ---------------------------------------------------------------------------

test('A13: the host registers the Skill-first routes and refuses receipt as a default view', () => {
  const host = readFileSync(new URL('../src/dsh/host/index.js', import.meta.url), 'utf8')
  assert.ok(host.includes("'/skill-trace/skills'"), 'the Skill list route must be registered')
  assert.ok(host.includes("'/skill-trace/skill'"), 'the Skill detail route must be registered')
  assert.ok(host.includes("'/skill-trace/installed'"), 'the installed Skill page must have its own route (§7)')
  assert.ok(host.includes("['current', 'installed']"), 'only the two first-level pages may be a default')
  assert.equal(host.includes("['receipt', 'map']"), false, 'the Session-first default is retired')
  assert.equal(host.includes("['skills', 'map']"), false, 'the v0.5 view vocabulary is retired with the pages it named')
  assert.ok(host.includes('buildSessionSkillList'), 'the list comes from the view model, not from the route')
  assert.ok(host.includes('buildSkillDetail'), 'the detail comes from the view model, not from the route')

  const preferences = readFileSync(new URL('../src/storage/preference-store.mjs', import.meta.url), 'utf8')
  assert.ok(preferences.includes("defaultView: 'current'"), 'a fresh install opens on the Skills this run loaded')
  assert.ok(preferences.includes('const PREFERENCES_VERSION = 3'), 'stored preferences record the IA they were written under')
  assert.ok(preferences.includes('value?.version === PREFERENCES_VERSION'), 'an unversioned preference is not a choice')
})

test('A14: the client ignores a default view that carries no IA version', () => {
  // 真实事故：beta.66 把「运行流程」写成缺省并落进偏好文件，升级后插件仍开在那一屏。
  // 文件里没有字段能区分"选择"与"旧缺省"，所以客户端也要求版本号。
  const client = readFileSync(new URL('../src/dsh/client/client.js', import.meta.url), 'utf8')
  assert.ok(client.includes('const PREFERENCE_VERSION = 3'), 'the client must know the current preference version')
  assert.ok(
    client.includes('next.preferences?.version === PREFERENCE_VERSION'),
    'the client must not honour an unversioned default view',
  )
  assert.ok(client.includes("const PAGES = ['current', 'installed']"), 'the client knows exactly two first-level pages')
  assert.equal(
    client.includes("const VIEW_KEYS = ['skills', 'map', 'runtime', 'receipt']"),
    false,
    'the v0.5 view vocabulary is gone — a legacy value is translated, not honoured',
  )
  assert.equal(
    client.includes('const wanted = normalizeView(next.preferences?.defaultView)'),
    false,
    'reading the stored view without its version is the bug that reopened the runtime map',
  )
})
