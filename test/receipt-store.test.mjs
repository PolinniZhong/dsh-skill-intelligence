import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyReceipt } from '../src/core/trace-reducer.mjs'
import { createReceiptStore } from '../src/storage/receipt-store.mjs'

test('writes, reads, and deletes an isolated receipt atomically', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-test-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createReceiptStore(root)
  const receipt = emptyReceipt('session/store-test', 1)
  await store.write(receipt)
  assert.deepEqual(await store.read(receipt.sessionId), receipt)
  const files = await import('node:fs/promises').then(({ readdir }) => readdir(root))
  assert.equal(files.length, 1)
  assert.match(files[0], /^[a-f0-9]{64}\.json$/)
  const raw = await readFile(join(root, files[0]), 'utf8')
  assert.equal(raw.includes('/Users/'), false)
  await store.delete(receipt.sessionId)
  assert.equal(await store.read(receipt.sessionId), null)
})

test('concurrent writes use distinct temporary files and leave one complete receipt', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-concurrent-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createReceiptStore(root)
  const first = emptyReceipt('same-session', 1)
  first.traceEvents = [{ eventId: 'first' }]
  const second = emptyReceipt('same-session', 2)
  second.traceEvents = [{ eventId: 'second' }]
  await Promise.all([store.write(first), store.write(second)])
  const stored = await store.read('same-session')
  assert.equal(['first', 'second'].includes(stored.traceEvents[0].eventId), true)
  const files = await import('node:fs/promises').then(({ readdir }) => readdir(root))
  assert.deepEqual(files.filter((file) => file.endsWith('.tmp')), [])
  assert.equal(files.filter((file) => file.endsWith('.json')).length, 1)
})

test('prunes only receipts rejected by the persistence policy', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-prune-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createReceiptStore(root)
  const empty = emptyReceipt('empty')
  const traced = emptyReceipt('traced')
  traced.traceEvents.push({ eventId: 'event-1' })
  await store.write(empty)
  await store.write(traced)
  assert.equal(await store.prune((receipt) => receipt.traceEvents?.length > 0), 1)
  assert.equal(await store.read('empty'), null)
  assert.deepEqual(await store.read('traced'), traced)
})

test('lists valid receipts while bounding corrupt-file warnings', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-list-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createReceiptStore(root)
  await store.write(emptyReceipt('listed-session', 1))
  await writeFile(join(root, `${'a'.repeat(64)}.json`), '{not-json', 'utf8')
  await writeFile(join(root, 'ignored.txt'), 'not a receipt', 'utf8')
  const result = await store.list()
  assert.equal(result.receipts.length, 1)
  assert.equal(result.receipts[0].sessionId, 'listed-session')
  assert.equal(result.warningCount, 1)
})

test('clear removes only receipt files owned by the store', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-clear-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createReceiptStore(root)
  await store.write(emptyReceipt('clear-a', 1))
  await store.write(emptyReceipt('clear-b', 2))
  await writeFile(join(root, 'keep.txt'), 'unrelated local file', 'utf8')
  assert.equal(await store.clear(), 2)
  assert.equal(await store.read('clear-a'), null)
  assert.equal(await store.read('clear-b'), null)
  assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'unrelated local file')
})
