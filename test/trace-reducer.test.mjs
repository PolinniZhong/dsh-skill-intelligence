import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addOutputReference,
  buildViewModels,
  emptyReceipt,
  migrateReceipt,
  rebuildReceipt,
  reduceSessionEvent,
  setContinuityDecision,
  setLearningNote,
  setTraceRuntimeIdentity,
  setSourceSnapshots,
} from '../src/core/trace-reducer.mjs'

const sessionId = 'session-test-1'

function skillCall({ seq = 10, callId = 'call-1', name = 'impeccable', turn = 2, step = 3 } = {}) {
  return {
    type: 'tool/call', seq, time: 1000 + seq,
    data: { turn, step, callId, name: 'skill', arguments: JSON.stringify({ name, prompt: 'must never persist' }) },
  }
}

function skillResult({ seq = 11, callId = 'call-1', failed = false, turn = 2, step = 3, instructions = 'Secret paragraph must never persist.\n1. Check the input\n2. Run the local script\n3. Review the result with the model' } = {}) {
  return {
    type: 'tool/result', seq, time: 1000 + seq,
    data: {
      turn, step,
      message: {
        source: { kind: 'tool', callId },
        content: [{ type: 'tool-result', toolCallId: callId, isError: failed, content: [{ type: 'text', text: failed ? 'private error result' : `<skill_content name="impeccable">\n<skill_instructions>\n${instructions}\n</skill_instructions>\n</skill_content>` }] }],
      },
      ...(failed ? { error: { name: 'Error', code: 'SKILL_NOT_FOUND', message: 'private error text' } } : {}),
    },
  }
}

test('pairs a native skill call and successful result without storing body text', () => {
  let receipt = emptyReceipt(sessionId, 1)
  receipt = reduceSessionEvent(receipt, skillCall())
  receipt = reduceSessionEvent(receipt, skillResult())
  assert.equal(receipt.traceEvents.length, 1)
  assert.equal(receipt.schemaVersion, 4)
  assert.equal(receipt.traceEvents[0].status, 'loaded')
  assert.equal(receipt.traceEvents[0].consumer, 'skill-tool')
  assert.equal(receipt.traceEvents[0].consumerIdentity, 'unavailable')
  assert.equal(receipt.traceEvents[0].evidenceFingerprint.scope, 'skill-instructions')
  assert.match(receipt.traceEvents[0].evidenceFingerprint.value, /^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(receipt.continuity.steps.map((item) => item.title), ['Check the input', 'Run the local script', 'Review the result with the model'])
  assert.equal(receipt.continuity.dependencies.find((item) => item.type === 'script').required, 'candidate')
  assert.equal(receipt.continuity.dependencies.find((item) => item.type === 'model').required, 'candidate')
  const serialized = JSON.stringify(receipt)
  assert.equal(serialized.includes('must never persist'), false)
  assert.equal(serialized.includes('Secret paragraph'), false)
})

test('records an explicit failure but only keeps a bounded error category', () => {
  let receipt = reduceSessionEvent(emptyReceipt(sessionId), skillCall())
  receipt = reduceSessionEvent(receipt, skillResult({ failed: true }))
  assert.equal(receipt.traceEvents[0].status, 'failed')
  assert.equal(receipt.traceEvents[0].errorCode, 'SKILL_NOT_FOUND')
  assert.equal(JSON.stringify(receipt).includes('private error text'), false)
})

test('keeps meaningful underscores and rejects explicitly negated dependency claims', () => {
  const result = skillResult({ instructions: '1. Finish with `SPIKE_METHOD_LOADED`.\nThis method does not require network access, scripts, MCP, or project permissions.' })
  const receipt = rebuildReceipt(sessionId, [skillCall(), result])
  assert.equal(receipt.continuity.steps[0].title, 'Finish with SPIKE_METHOD_LOADED.')
  assert.deepEqual(receipt.continuity.dependencies.filter((item) => item.required === 'candidate'), [])
})

test('marks an unmatched request unresolved at the step boundary', () => {
  let receipt = reduceSessionEvent(emptyReceipt(sessionId), skillCall())
  receipt = reduceSessionEvent(receipt, { type: 'step/end', seq: 12, time: 1012, data: { turn: 2, step: 3 } })
  assert.equal(receipt.traceEvents[0].status, 'unresolved')
})

test('distinguishes DSH recovery outcome states from ordinary failure', () => {
  for (const [code, status] of [['TOOL_OUTCOME_UNKNOWN', 'outcome-unknown'], ['TOOL_NOT_STARTED', 'not-started']]) {
    let receipt = reduceSessionEvent(emptyReceipt(sessionId), skillCall())
    const result = skillResult({ failed: true })
    result.data.error.code = code
    receipt = reduceSessionEvent(receipt, result)
    assert.equal(receipt.traceEvents[0].status, status)
  }
})

test('ignores non-skill tools and malformed skill arguments', () => {
  let receipt = reduceSessionEvent(emptyReceipt(sessionId), { type: 'tool/call', seq: 1, time: 1, data: { turn: 1, step: 1, callId: 'bash-1', name: 'bash', arguments: '{}' } })
  receipt = reduceSessionEvent(receipt, { type: 'tool/call', seq: 2, time: 2, data: { turn: 1, step: 1, callId: 'skill-2', name: 'skill', arguments: '{bad' } })
  assert.equal(receipt.traceEvents.length, 0)
})

test('rebuild preserves only explicit human fields from the previous receipt', () => {
  let previous = emptyReceipt(sessionId)
  previous.humanAssessment = { value: 'useful', confirmedAt: 2000 }
  previous = addOutputReference(previous, 'docs/report.md', 2001)
  const receipt = rebuildReceipt(sessionId, [skillCall(), skillResult()], previous)
  assert.equal(receipt.traceEvents[0].status, 'loaded')
  assert.equal(receipt.humanAssessment.value, 'useful')
  assert.equal(receipt.outputReferences[0].relativeRef, 'docs/report.md')
})

test('rebuild preserves runtime identity on the same observed load event', () => {
  const events = [skillCall(), skillResult()]
  let previous = rebuildReceipt(sessionId, events)
  previous = setTraceRuntimeIdentity(previous, previous.traceEvents[0].eventId, {
    provider: 'filesystem',
    sourceFingerprint: `sha256:${'a'.repeat(64)}`,
    capturedAt: 2000,
  }, 2000)
  const rebuilt = rebuildReceipt(sessionId, events, previous)
  assert.equal(rebuilt.traceEvents[0].runtimeIdentity.provider, 'filesystem')
  assert.equal(rebuilt.traceEvents[0].runtimeIdentity.capturedAt, 2000)
})

test('migrates stored schema 1 coverage without inventing missing evidence', () => {
  const old = {
    ...emptyReceipt(sessionId, 1),
    schemaVersion: 1,
    coverage: { status: 'native-observer-active', note: 'legacy claim' },
    traceEvents: [{ eventId: 'old:1', sessionId, skillName: 'old-skill', status: 'loaded', consumer: 'dsh-tool-skill' }],
  }
  const receipt = migrateReceipt(old, sessionId)
  assert.equal(receipt.schemaVersion, 4)
  assert.equal(receipt.coverage.status, 'verified-standard-contract')
  assert.deepEqual(receipt.coverage.verifiedConsumers, ['@deepseek-ai/dsh-tool-skill@0.1.1-rc.2', 'dsh-skillflux@0.2.0#962264b'])
  assert.equal(receipt.traceEvents[0].consumer, 'skill-tool')
  assert.equal(receipt.traceEvents[0].evidenceFingerprint, undefined)
})

test('receipt and map projections share the exact same trace facts', () => {
  const receipt = rebuildReceipt(sessionId, [skillCall(), skillResult()])
  const views = buildViewModels(receipt)
  assert.deepEqual(views.receipt.methods, views.map.methods)
  assert.deepEqual(views.receipt.outputs, views.map.outputs)
  assert.deepEqual(views.receipt.continuity, views.map.continuity)
})

test('continuity stays candidate until a local user decision is recorded', () => {
  let receipt = rebuildReceipt(sessionId, [skillCall(), skillResult()])
  assert.equal(receipt.continuity.status, 'unassessed')
  assert.equal(receipt.continuity.reviewState, 'candidate')
  receipt = setContinuityDecision(receipt, 'partial', 3000)
  assert.equal(receipt.continuity.status, 'partial')
  assert.equal(receipt.continuity.reviewState, 'human-confirmed')
  assert.equal(receipt.continuity.confirmedAt, 3000)
  receipt = rebuildReceipt(sessionId, [skillCall(), skillResult()], receipt)
  assert.equal(receipt.continuity.status, 'partial')
  assert.equal(receipt.continuity.reviewState, 'human-confirmed')
})

test('groups repeated Skill calls while preserving every load event', () => {
  const events = [
    skillCall({ seq: 10, callId: 'a-1', name: 'skill-a', turn: 1, step: 1 }),
    skillResult({ seq: 11, callId: 'a-1', turn: 1, step: 1 }),
    skillCall({ seq: 20, callId: 'b-1', name: 'skill-b', turn: 2, step: 1 }),
    skillResult({ seq: 21, callId: 'b-1', turn: 2, step: 1 }),
    skillCall({ seq: 30, callId: 'a-2', name: 'skill-a', turn: 3, step: 2 }),
    skillResult({ seq: 31, callId: 'a-2', failed: true, turn: 3, step: 2 }),
    skillCall({ seq: 40, callId: 'c-1', name: 'skill-c', turn: 4, step: 1 }),
    skillResult({ seq: 41, callId: 'c-1', turn: 4, step: 1 }),
    skillCall({ seq: 50, callId: 'd-1', name: 'skill-d', turn: 5, step: 1 }),
    skillResult({ seq: 51, callId: 'd-1', turn: 5, step: 1 }),
  ]
  const views = buildViewModels(rebuildReceipt(sessionId, events))
  assert.equal(views.receipt.methodCount, 4)
  assert.equal(views.receipt.eventCount, 5)
  assert.equal(views.receipt.methods.length, 4)
  assert.equal(views.map.nodes.steps.length, 5)
  const repeated = views.receipt.methods.find((method) => method.name === 'skill-a')
  assert.equal(repeated.callCount, 2)
  assert.equal(repeated.loadedCount, 1)
  assert.equal(repeated.failedCount, 1)
  assert.equal(repeated.status, 'mixed')
  assert.equal(repeated.events.length, 2)
  assert.deepEqual(views.map.nodes.steps.map((step) => step.order), [1, 2, 3, 4, 5])
  assert.deepEqual(views.receipt.summary, {
    turnCount: 5,
    stepCount: 0,
    methodCount: 4,
    eventCount: 5,
    loadedCount: 4,
    failedCount: 1,
    unresolvedCount: 0,
    outcomeUnknownCount: 0,
    notStartedCount: 0,
    orderedSkillNames: ['skill-a', 'skill-b', 'skill-c', 'skill-d'],
    eventSkillNames: ['skill-a', 'skill-b', 'skill-a', 'skill-c', 'skill-d'],
    repeatedMethods: [{ name: 'skill-a', callCount: 2 }],
    outputCount: 0,
  })
  assert.equal(views.map.nodes.methods.find((method) => method.name === 'skill-a').events.length, 2)
})

test('builds plain-language activity facts per observed turn', () => {
  const events = [
    { type: 'step/start', seq: 1, time: 1001, data: { turn: 1, step: 1 } },
    skillCall({ seq: 2, callId: 'a-1', name: 'skill-a', turn: 1, step: 1 }),
    skillResult({ seq: 3, callId: 'a-1', turn: 1, step: 1 }),
    { type: 'step/start', seq: 4, time: 1004, data: { turn: 1, step: 2 } },
    { type: 'step/start', seq: 5, time: 1005, data: { turn: 2, step: 1 } },
    skillCall({ seq: 6, callId: 'b-1', name: 'skill-b', turn: 2, step: 1 }),
    skillResult({ seq: 7, callId: 'b-1', failed: true, turn: 2, step: 1 }),
  ]
  const view = buildViewModels(rebuildReceipt(sessionId, events)).receipt
  assert.equal(view.summary.turnCount, 2)
  assert.equal(view.summary.stepCount, 3)
  assert.deepEqual(view.turnDetails, [
    { turn: 1, stepCount: 2, eventCount: 1, skillNames: ['skill-a'], loadedCount: 1, failedCount: 0, unresolvedCount: 0, outcomeUnknownCount: 0, notStartedCount: 0 },
    { turn: 2, stepCount: 1, eventCount: 1, skillNames: ['skill-b'], loadedCount: 0, failedCount: 1, unresolvedCount: 0, outcomeUnknownCount: 0, notStartedCount: 0 },
  ])
})

test('empty projections expose a single explicit no-trace state', () => {
  const views = buildViewModels(emptyReceipt(sessionId))
  assert.equal(views.receipt.hasTrace, false)
  assert.equal(views.receipt.eventCount, 0)
  assert.equal(views.receipt.methodCount, 0)
  assert.deepEqual(views.receipt.methods, [])
  assert.deepEqual(views.map.nodes.steps, [])
})

test('output references reject absolute, remote, and parent paths', () => {
  const receipt = emptyReceipt(sessionId)
  for (const value of ['/tmp/output.md', 'https://example.com/a', '../secret.md', '~/secret.md']) {
    assert.throws(() => addOutputReference(receipt, value), /相对引用/)
  }
})

test('builds isolated learning cards for each successfully loaded Skill', () => {
  const events = [
    skillCall({ seq: 10, callId: 'a-1', name: 'skill-a', turn: 1, step: 1 }),
    skillResult({ seq: 11, callId: 'a-1', turn: 1, step: 1, instructions: '1. Inspect A\n2. Verify A\nUse the local script.' }),
    skillCall({ seq: 20, callId: 'b-1', name: 'skill-b', turn: 2, step: 1 }),
    skillResult({ seq: 21, callId: 'b-1', turn: 2, step: 1, instructions: '1. Research B\n2. Review B\nBrowse the web.' }),
    skillCall({ seq: 30, callId: 'a-2', name: 'skill-a', turn: 3, step: 1 }),
    skillResult({ seq: 31, callId: 'a-2', turn: 3, step: 1, instructions: '1. Inspect A\n2. Record A' }),
  ]
  const receipt = rebuildReceipt(sessionId, events)
  const cards = buildViewModels(receipt).receipt.learningCards
  assert.equal(cards.length, 2)
  assert.deepEqual(cards.find((card) => card.skillName === 'skill-a').steps.map((step) => step.title), ['Inspect A', 'Verify A', 'Record A'])
  assert.deepEqual(cards.find((card) => card.skillName === 'skill-b').steps.map((step) => step.title), ['Research B', 'Review B'])
  assert.equal(cards.find((card) => card.skillName === 'skill-a').dependencies.find((item) => item.type === 'script').required, 'candidate')
  assert.equal(cards.find((card) => card.skillName === 'skill-a').dependencies.find((item) => item.type === 'network').required, 'unknown')
  assert.equal(cards.find((card) => card.skillName === 'skill-b').dependencies.find((item) => item.type === 'network').required, 'candidate')
})

test('learning card reports version drift from the safe source snapshot', () => {
  let receipt = rebuildReceipt(sessionId, [skillCall({ name: 'skill-a' }), skillResult()])
  receipt = setSourceSnapshots(receipt, [{
    skillName: 'skill-a',
    match: 'mismatch',
    currentInstructionSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }], 2000)
  const card = buildViewModels(receipt).receipt.learningCards[0]
  assert.equal(card.versionState, 'changed')
  assert.equal(card.currentHash, 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
})

test('stores bounded human-authored learning notes and restores them through rebuild', () => {
  let receipt = rebuildReceipt(sessionId, [skillCall({ name: 'skill-a' }), skillResult()])
  receipt = setLearningNote(receipt, 'skill-a', {
    understanding: '先检查输入，再执行步骤，最后复核结果。',
    improvementIntent: '补充失败分支。',
    validationPlan: '下次用缺失输入的案例验证。',
  }, 3000)
  assert.deepEqual(receipt.learningNotes[0], {
    skillName: 'skill-a',
    understanding: '先检查输入，再执行步骤，最后复核结果。',
    improvementIntent: '补充失败分支。',
    validationPlan: '下次用缺失输入的案例验证。',
    authorship: 'human',
    updatedAt: 3000,
  })
  receipt = rebuildReceipt(sessionId, [skillCall({ name: 'skill-a' }), skillResult()], receipt)
  assert.equal(buildViewModels(receipt).receipt.learningCards[0].note.understanding, '先检查输入，再执行步骤，最后复核结果。')
})

test('learning notes reject unobserved Skills and sensitive local values', () => {
  const receipt = rebuildReceipt(sessionId, [skillCall({ name: 'skill-a' }), skillResult()])
  assert.throws(() => setLearningNote(receipt, 'skill-b', { understanding: 'test' }), /成功加载/)
  assert.throws(() => setLearningNote(receipt, 'skill-a', { understanding: '查看 /Users/example/private/project' }), /绝对路径/)
  assert.throws(() => setLearningNote(receipt, 'skill-a', { understanding: '查看 /workspace/private/project' }), /绝对路径/)
  assert.throws(() => setLearningNote(receipt, 'skill-a', { understanding: '查看 file:///workspace/private/project' }), /绝对路径/)
  assert.throws(() => setLearningNote(receipt, 'skill-a', { improvementIntent: 'api_key=abcdefgh12345678' }), /密钥值/)
  assert.throws(() => setLearningNote(receipt, 'skill-a', { validationPlan: 'x'.repeat(501) }), /500 字/)
})

test('clearing all learning fields removes the local note', () => {
  let receipt = rebuildReceipt(sessionId, [skillCall({ name: 'skill-a' }), skillResult()])
  receipt = setLearningNote(receipt, 'skill-a', { understanding: 'temporary' }, 3000)
  receipt = setLearningNote(receipt, 'skill-a', { understanding: '', improvementIntent: '', validationPlan: '' }, 4000)
  assert.deepEqual(receipt.learningNotes, [])
})
