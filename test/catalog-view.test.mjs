import test from 'node:test'
import assert from 'node:assert/strict'
import { associationLevel, buildCatalogView } from '../src/core/catalog-view.mjs'
import { emptyReceipt, rebuildReceipt, reduceSessionEvent, setLearningNote, setTraceRuntimeIdentity } from '../src/core/trace-reducer.mjs'

function receiptFor(sessionId, name = 'demo-skill') {
  const events = [
    { type: 'tool/call', seq: 1, time: 1, data: { turn: 1, step: 1, callId: 'call-1', name: 'skill', arguments: JSON.stringify({ name }) } },
    { type: 'tool/result', seq: 2, time: 2, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', toolCallId: 'call-1', isError: false, content: [{ type: 'text', text: `<skill_content name="${name}">\n<skill_instructions>\n1. Do work\n</skill_instructions>\n</skill_content>` }] }] } } },
  ]
  return rebuildReceipt(sessionId, events, emptyReceipt(sessionId, 1))
}

const current = { name: 'demo-skill', description: 'Demo', provider: 'filesystem', sourceFingerprint: `sha256:${'a'.repeat(64)}`, invocation: null }

test('association requires provider and source fingerprint for exact history', () => {
  const base = { observedInstructionSha256: [`sha256:${'b'.repeat(64)}`], runtimeIdentity: null }
  assert.equal(associationLevel(current, base, `sha256:${'b'.repeat(64)}`), 'content-match-candidate')
  assert.equal(associationLevel(current, base), 'name-only-candidate')
  assert.equal(associationLevel(current, { ...base, runtimeIdentity: { provider: 'filesystem', sourceFingerprint: current.sourceFingerprint } }), 'exact')
  assert.equal(associationLevel(current, { ...base, runtimeIdentity: { provider: 'remote', sourceFingerprint: current.sourceFingerprint } }), 'conflict')
})

test('catalog keeps old receipts as candidates and historical-only Skills visible', () => {
  let receipt = setLearningNote(receiptFor('session-a'), 'demo-skill', { understanding: '我的会话理解' }, 3)
  const oldOnly = receiptFor('session-b', 'old-skill')
  const catalog = buildCatalogView({
    catalogSnapshot: { status: 'complete', complete: true, observedAt: 5, skills: [current] },
    receipts: [receipt, oldOnly],
    selectedSkillName: 'demo-skill',
    selectedDefinition: { available: true, currentInstructionSha256: receipt.traceEvents[0].evidenceFingerprint.value },
  })
  assert.equal(catalog.currentDiscoverableCount, 1)
  assert.equal(catalog.entries.length, 2)
  assert.equal(catalog.entries.find((item) => item.name === 'demo-skill').confirmedReceiptCount, 0)
  assert.equal(catalog.entries.find((item) => item.name === 'demo-skill').possibleLearningCount, 1)
  assert.equal(catalog.entries.find((item) => item.name === 'old-skill').currentState, 'current-not-discovered')
  assert.equal(catalog.selected.histories[0].associationLevel, 'content-match-candidate')
  assert.equal(JSON.stringify(catalog.entries).includes('我的会话理解'), false)
})

test('runtime-captured identity creates exact history without exposing source paths', () => {
  let receipt = receiptFor('session-exact')
  receipt = setTraceRuntimeIdentity(receipt, receipt.traceEvents[0].eventId, { provider: 'filesystem', sourceFingerprint: current.sourceFingerprint, capturedAt: 2 }, 3)
  const catalog = buildCatalogView({
    catalogSnapshot: { status: 'complete', complete: true, observedAt: 5, skills: [current] },
    receipts: [receipt],
    selectedSkillName: 'demo-skill',
  })
  assert.equal(catalog.entries[0].confirmedReceiptCount, 1)
  assert.equal(catalog.selected.histories[0].associationLevel, 'exact')
})

test('one missing or conflicting event identity prevents receipt-level exact association', () => {
  const first = receiptFor('session-mixed')
  const secondEvents = [
    { type: 'tool/call', seq: 3, time: 3, data: { turn: 2, step: 1, callId: 'call-2', name: 'skill', arguments: '{"name":"demo-skill"}' } },
    { type: 'tool/result', seq: 4, time: 4, data: { turn: 2, step: 1, message: { source: { kind: 'tool', callId: 'call-2' }, content: [{ type: 'tool-result', toolCallId: 'call-2', isError: false, content: [{ type: 'text', text: '<skill_content name="demo-skill">\n<skill_instructions>\n1. Do work\n</skill_instructions>\n</skill_content>' }] }] } } },
  ]
  let mixed = secondEvents.reduce((receipt, event) => reduceSessionEvent(receipt, event), first)
  mixed = setTraceRuntimeIdentity(mixed, mixed.traceEvents[0].eventId, { provider: 'filesystem', sourceFingerprint: current.sourceFingerprint, capturedAt: 2 }, 5)
  let catalog = buildCatalogView({ catalogSnapshot: { status: 'complete', complete: true, observedAt: 5, skills: [current] }, receipts: [mixed], selectedSkillName: 'demo-skill' })
  assert.equal(catalog.selected.histories[0].associationLevel, 'name-only-candidate')
  mixed = setTraceRuntimeIdentity(mixed, mixed.traceEvents[1].eventId, { provider: 'remote', sourceFingerprint: `sha256:${'c'.repeat(64)}`, capturedAt: 4 }, 6)
  catalog = buildCatalogView({ catalogSnapshot: { status: 'complete', complete: true, observedAt: 6, skills: [current] }, receipts: [mixed], selectedSkillName: 'demo-skill' })
  assert.equal(catalog.selected.histories[0].associationLevel, 'conflict')
})

test('incomplete snapshots never expose a definitive discoverable total', () => {
  const catalog = buildCatalogView({
    catalogSnapshot: { status: 'incomplete', complete: false, observedAt: 5, skills: [current] },
    receipts: [],
  })
  assert.equal(catalog.currentDiscoverableCount, null)
  assert.equal(catalog.observedCandidateCount, 1)
  assert.equal(catalog.entries[0].currentState, 'discovered-partial')
})

test('legacy same-name historical receipts remain separate entries without identity evidence', () => {
  const catalog = buildCatalogView({
    catalogSnapshot: { status: 'complete', complete: true, observedAt: 5, skills: [] },
    receipts: [receiptFor('legacy-a', 'old-skill'), receiptFor('legacy-b', 'old-skill')],
  })
  assert.equal(catalog.entries.length, 2)
  assert.notEqual(catalog.entries[0].id, catalog.entries[1].id)
})

test('current Skills sharing one provider source still receive unique entry ids', () => {
  const sibling = { ...current, name: 'sibling-skill' }
  const catalog = buildCatalogView({
    catalogSnapshot: { status: 'complete', complete: true, observedAt: 5, skills: [current, sibling] },
    receipts: [],
  })
  assert.notEqual(catalog.entries[0].id, catalog.entries[1].id)
})
