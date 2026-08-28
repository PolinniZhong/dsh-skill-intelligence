import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLocalArchive, clearReceiptsWithSafetyBackup, createSessionMutationQueue, restoreMissingReceipts, shouldPersistReceipt } from '../src/dsh/host/index.js'
import { addOutputReference, emptyReceipt, setContinuityDecision, setLearningNote, setValidationResult } from '../src/core/trace-reducer.mjs'
import { createBackupStore } from '../src/storage/backup-store.mjs'
import { createReceiptStore } from '../src/storage/receipt-store.mjs'

test('does not persist an empty session as a zero-data receipt', () => {
  assert.equal(shouldPersistReceipt(emptyReceipt('empty-session')), false)
})

test('persists trace or explicit output links, but not legacy assessment-only data', () => {
  const traced = emptyReceipt('traced-session')
  traced.traceEvents.push({ eventId: 'event-1' })
  assert.equal(shouldPersistReceipt(traced), true)
  const legacyAssessed = emptyReceipt('assessed-session')
  legacyAssessed.humanAssessment = { value: 'useful', confirmedAt: 2000 }
  assert.equal(shouldPersistReceipt(legacyAssessed), false)
  assert.equal(shouldPersistReceipt(addOutputReference(emptyReceipt('output-session'), 'docs/result.md')), true)
})

test('persists explicit local learning notes with the receipt', () => {
  const receipt = emptyReceipt('session-learning')
  receipt.learningNotes = [{ skillName: 'skill-a', understanding: 'my note', authorship: 'human', updatedAt: 1 }]
  assert.equal(shouldPersistReceipt(receipt), true)
})

test('persists explicit local validation results with the original receipt', () => {
  const receipt = emptyReceipt('session-validation')
  receipt.validationResults = [{ skillName: 'skill-a', status: 'met', observedOutcome: 'met expectation', authorship: 'human', validatedAt: 1, updatedAt: 1 }]
  assert.equal(shouldPersistReceipt(receipt), true)
})

test('local archive is versioned and contains only the bounded receipt projection', () => {
  const receipt = emptyReceipt('session-archive', 1)
  receipt.traceEvents = [{ skillName: 'skill-a', status: 'loaded' }]
  receipt.learningNotes = [{ skillName: 'skill-a', understanding: 'my local note', authorship: 'human', updatedAt: 2 }]
  const archive = buildLocalArchive([receipt], 3)
  assert.equal(archive.format, 'dsh-skill-trace.local-backup')
  assert.equal(archive.formatVersion, 1)
  assert.equal(archive.exportedAt, 3)
  assert.equal(archive.receiptCount, 1)
  assert.equal(archive.receipts[0].learningNotes[0].understanding, 'my local note')
  assert.equal(JSON.stringify(archive).includes('skillBody'), false)
  assert.equal(JSON.stringify(archive).includes('prompt'), false)
})

test('backup restore adds only missing receipts and keeps existing records authoritative', async () => {
  const existing = emptyReceipt('existing', 1)
  existing.traceEvents = [{ eventId: 'event-existing', sessionId: 'existing', skillName: 'skill-a', status: 'loaded' }]
  existing.learningNotes = [{ skillName: 'skill-a', understanding: 'newer local note', authorship: 'human', updatedAt: 10 }]
  const incomingExisting = emptyReceipt('existing', 1)
  incomingExisting.traceEvents = [{ eventId: 'event-existing', sessionId: 'existing', skillName: 'skill-a', status: 'loaded' }]
  incomingExisting.learningNotes = [{ skillName: 'skill-a', understanding: 'older backup note', authorship: 'human', updatedAt: 2 }]
  const incomingMissing = emptyReceipt('missing', 1)
  incomingMissing.traceEvents = [{ eventId: 'event-1', sessionId: 'missing', skillName: 'skill-a', status: 'loaded' }]
  const values = new Map([['existing', existing]])
  const store = {
    read: async (sessionId) => values.get(sessionId) || null,
    write: async (receipt) => { values.set(receipt.sessionId, receipt) },
  }
  const result = await restoreMissingReceipts([incomingExisting, incomingMissing], store)
  assert.deepEqual(result, { restored: 1, merged: 0, skipped: 1, invalid: 0 })
  assert.equal(values.get('existing').learningNotes[0].understanding, 'newer local note')
  assert.equal(values.get('missing').sessionId, 'missing')
})

test('backup restore supplements personal records after an active session reconstructs trace evidence', async () => {
  const trace = { eventId: 'event-active', sessionId: 'active', skillName: 'skill-a', status: 'loaded' }
  const reconstructed = emptyReceipt('active', 10)
  reconstructed.traceEvents = [trace]
  let backup = emptyReceipt('active', 1)
  backup.traceEvents = [trace]
  backup = setLearningNote(backup, 'skill-a', { understanding: 'my backed-up understanding', validationPlan: 'run the edge case' }, 2)
  backup = setValidationResult(backup, 'skill-a', { status: 'met', observedOutcome: 'the edge case passed', nextAction: 'keep this method' }, 3)
  backup = addOutputReference(backup, 'docs/result.md', 4)
  backup = setContinuityDecision(backup, 'manual', 5)
  const values = new Map([['active', reconstructed]])
  const cache = new Map([['active', reconstructed]])
  const entered = []
  const result = await restoreMissingReceipts([backup], {
    read: async (sessionId) => values.get(sessionId) || null,
    write: async (receipt) => { values.set(receipt.sessionId, receipt) },
  }, cache, async (sessionId, work) => {
    entered.push(sessionId)
    return work()
  })
  assert.deepEqual(result, { restored: 0, merged: 1, skipped: 0, invalid: 0 })
  assert.deepEqual(entered, ['active'])
  const restored = values.get('active')
  assert.equal(restored.traceEvents.length, 1)
  assert.equal(restored.learningNotes[0].understanding, 'my backed-up understanding')
  assert.equal(restored.validationResults[0].observedOutcome, 'the edge case passed')
  assert.equal(restored.outputReferences[0].relativeRef, 'docs/result.md')
  assert.equal(restored.continuity.status, 'manual')
  assert.deepEqual(cache.get('active'), restored)
})

test('backup restore fills only missing personal fields and never replaces current user records', async () => {
  const trace = { eventId: 'event-current', sessionId: 'current', skillName: 'skill-a', status: 'loaded' }
  let current = emptyReceipt('current', 1)
  current.traceEvents = [trace]
  current = setLearningNote(current, 'skill-a', { understanding: 'current note' }, 20)
  current = setValidationResult(current, 'skill-a', { status: 'not-met', observedOutcome: 'current result' }, 21)
  current = setContinuityDecision(current, 'blocked', 22)
  let backup = emptyReceipt('current', 1)
  backup.traceEvents = [trace]
  backup = setLearningNote(backup, 'skill-a', { understanding: 'older backup note' }, 2)
  backup = setValidationResult(backup, 'skill-a', { status: 'met', observedOutcome: 'older backup result' }, 3)
  backup = addOutputReference(backup, 'docs/from-backup.md', 4)
  backup = setContinuityDecision(backup, 'manual', 5)
  const values = new Map([['current', current]])
  const result = await restoreMissingReceipts([backup], {
    read: async (sessionId) => values.get(sessionId) || null,
    write: async (receipt) => { values.set(receipt.sessionId, receipt) },
  })
  assert.deepEqual(result, { restored: 0, merged: 1, skipped: 0, invalid: 0 })
  const restored = values.get('current')
  assert.equal(restored.learningNotes[0].understanding, 'current note')
  assert.equal(restored.validationResults[0].observedOutcome, 'current result')
  assert.equal(restored.continuity.status, 'blocked')
  assert.equal(restored.outputReferences[0].relativeRef, 'docs/from-backup.md')
})

test('backup restore rejects duplicate sessions before writing any receipt', async () => {
  const writes = []
  const receipt = emptyReceipt('duplicate', 1)
  receipt.traceEvents = [{ eventId: 'event-duplicate', sessionId: 'duplicate', skillName: 'skill-a', status: 'loaded' }]
  await assert.rejects(restoreMissingReceipts([receipt, receipt], {
    read: async () => null,
    write: async (value) => { writes.push(value) },
  }), /重复会话/)
  assert.equal(writes.length, 0)
})

test('backup restore rejects invalid receipts before writing any receipt', async () => {
  const writes = []
  const empty = emptyReceipt('empty', 1)
  const unsafeOutput = emptyReceipt('unsafe-output', 1)
  unsafeOutput.outputReferences = [{ outputId: 'output:1', relativeRef: '/Users/example/private.txt' }]
  for (const receipt of [empty, unsafeOutput]) {
    await assert.rejects(restoreMissingReceipts([receipt], {
      read: async () => null,
      write: async (value) => { writes.push(value) },
    }), /没有可恢复数据|输出引用无效/)
  }
  assert.equal(writes.length, 0)
})

test('safety backup, clear, and restore complete an isolated receipt round trip', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-roundtrip-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createReceiptStore(join(root, 'receipts'))
  const backups = createBackupStore(join(root, 'backups'))
  const base = emptyReceipt('roundtrip-session', 1)
  base.traceEvents = [{ eventId: 'event-1', sessionId: base.sessionId, skillName: 'skill-a', status: 'loaded' }]
  const receipt = setLearningNote(base, 'skill-a', { understanding: 'keep me' }, 2)
  await store.write(receipt)
  const cleared = await clearReceiptsWithSafetyBackup(store, backups)
  assert.equal(cleared.removedCount, 1)
  assert.equal(cleared.safetyBackup.reason, 'before-clear')
  assert.equal(await store.read(receipt.sessionId), null)
  const saved = await backups.read(cleared.safetyBackup.id)
  assert.deepEqual(await restoreMissingReceipts(saved.archive.receipts, store), { restored: 1, merged: 0, skipped: 0, invalid: 0 })
  assert.equal((await store.read(receipt.sessionId)).learningNotes[0].understanding, 'keep me')
})

test('clear aborts when the safety backup cannot be created', async () => {
  let cleared = false
  await assert.rejects(clearReceiptsWithSafetyBackup({
    list: async () => ({ receipts: [emptyReceipt('protected', 1)], warningCount: 0 }),
    clear: async () => { cleared = true; return 1 },
  }, {
    create: async () => { throw new Error('disk full') },
  }), /disk full/)
  assert.equal(cleared, false)
})

test('maintenance waits for existing session writes and blocks new writes until clear completes', async () => {
  const { enqueue, runMaintenance } = createSessionMutationQueue()
  const order = []
  let releaseFirst
  let releaseMaintenance
  let markFirstStarted
  let markMaintenanceStarted
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })
  const maintenanceGate = new Promise((resolve) => { releaseMaintenance = resolve })
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve })
  const maintenanceStarted = new Promise((resolve) => { markMaintenanceStarted = resolve })
  const first = enqueue('session-a', async () => {
    order.push('first-start')
    markFirstStarted()
    await firstGate
    order.push('first-end')
  })
  await firstStarted
  const maintenance = runMaintenance(async () => {
    order.push('maintenance-start')
    markMaintenanceStarted()
    await maintenanceGate
    order.push('maintenance-end')
  })
  const late = enqueue('session-b', async () => { order.push('late-write') })
  await Promise.resolve()
  assert.deepEqual(order, ['first-start'])
  releaseFirst()
  await first
  await maintenanceStarted
  assert.deepEqual(order, ['first-start', 'first-end', 'maintenance-start'])
  releaseMaintenance()
  await Promise.all([maintenance, late])
  assert.deepEqual(order, ['first-start', 'first-end', 'maintenance-start', 'maintenance-end', 'late-write'])
})
