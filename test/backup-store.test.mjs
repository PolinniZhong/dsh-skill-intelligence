import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBackupStore } from '../src/storage/backup-store.mjs'

function archive(receipts = []) {
  return {
    format: 'dsh-skill-trace.local-backup',
    formatVersion: 1,
    exportedAt: Date.UTC(2026, 7, 28, 8, 9, 10),
    receiptCount: receipts.length,
    skippedReceiptCount: 0,
    receipts,
  }
}

test('creates, verifies, reads, and lists an immutable local backup', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-backups-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createBackupStore(root)
  const created = await store.create(archive([{ sessionId: 's-1' }]), 'manual')
  assert.match(created.id, /^dsh-skill-trace-backup-20260828T080910Z-[a-f0-9]{8}\.json$/)
  assert.equal(created.receiptCount, 1)
  assert.ok(created.size > 0)
  const stored = await store.read(created.id)
  assert.equal(stored.archive.receipts[0].sessionId, 's-1')
  assert.equal(stored.backup.reason, 'manual')
  const mode = (await stat(join(root, created.id))).mode & 0o777
  assert.equal(mode, 0o600)
  assert.equal((await stat(root)).mode & 0o777, 0o700)
  const listed = await store.list()
  assert.deepEqual(listed.backups, [created])
})

test('rejects path traversal, corrupt archives, and unsupported versions', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-backups-invalid-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createBackupStore(root)
  await assert.rejects(store.read('../preferences.json'), /backupId/)
  const corrupt = 'dsh-skill-trace-backup-20260828T080910Z-aaaaaaaa.json'
  await writeFile(join(root, corrupt), '{invalid', 'utf8')
  assert.deepEqual(await store.list(), { backups: [], warningCount: 1 })
  await assert.rejects(store.create({ ...archive(), formatVersion: 2 }), /版本/)
})

test('does not leave a success artifact when the backup directory is not writable', async (context) => {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-backups-denied-'))
  context.after(async () => { await chmod(parent, 0o700); await rm(parent, { recursive: true, force: true }) })
  const root = join(parent, 'backups')
  await chmod(parent, 0o500)
  if (process.getuid?.() === 0) return
  const store = createBackupStore(root)
  await assert.rejects(store.create(archive()), /EACCES|EPERM/)
})
