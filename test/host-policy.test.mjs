import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionMutationQueue, shouldPersistReceipt } from '../src/dsh/host/index.js'
import { addOutputReference, emptyReceipt, setContinuityDecision, setLearningNote, setValidationResult } from '../src/core/trace-reducer.mjs'
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
