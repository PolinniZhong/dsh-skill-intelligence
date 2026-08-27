import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldPersistReceipt } from '../src/dsh/host/index.js'
import { addOutputReference, emptyReceipt } from '../src/core/trace-reducer.mjs'

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
