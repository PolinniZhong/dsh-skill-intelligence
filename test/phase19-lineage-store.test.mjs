import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkillLineageStore } from '../src/storage/skill-lineage-store.mjs'
import { lineageFileName } from '../src/core/skill-lineage.mjs'

const SOURCE_A = `sha256:${'a'.repeat(64)}`
const SOURCE_B = `sha256:${'b'.repeat(64)}`

async function workspace(context, prefix = 'lineage') {
  const root = await mkdtemp(join(tmpdir(), `dsh-skill-trace-${prefix}-`))
  context.after(() => rm(root, { recursive: true, force: true }))
  return { root, store: createSkillLineageStore(root) }
}

function record(overrides = {}) {
  return {
    sourceSkillName: 'ui-craft',
    sourceSourceSha256: SOURCE_A,
    targetSkillName: 'my-ui-craft',
    cloneMode: 'bundle',
    targetScope: 'user',
    catalogObservation: 'observed',
    ...overrides,
  }
}

test('a written record comes back, under the target-derived file name', async (context) => {
  const { root, store } = await workspace(context)
  const written = await store.write(record())
  assert.equal(written.targetSkillName, 'my-ui-craft')
  assert.deepEqual(await store.read('my-ui-craft'), written)
  assert.deepEqual(await readdir(root), [lineageFileName('my-ui-craft')])
})

test('a Skill that was never cloned reads as null — that is not an error', async (context) => {
  const { store } = await workspace(context)
  assert.equal(await store.read('ui-craft'), null)
  assert.equal(await store.findByTarget('ui-craft'), null)
  assert.deepEqual(await store.findBySource('ui-craft'), [])
  assert.deepEqual(await store.list(), { records: [], warningCount: 0 })
})

test('the directory is 0700 and the record is 0600', async (context) => {
  const { root, store } = await workspace(context)
  await store.write(record())
  assert.equal((await stat(root)).mode & 0o777, 0o700)
  assert.equal((await stat(join(root, lineageFileName('my-ui-craft')))).mode & 0o777, 0o600)
})

test('writing twice overwrites: one target, one relation — editing the Skill adds nothing', async (context) => {
  const { root, store } = await workspace(context)
  await store.write(record())
  await store.write(record({ sourceSourceSha256: SOURCE_B, catalogObservation: 'pending' }))
  assert.equal((await readdir(root)).length, 1)
  const current = await store.read('my-ui-craft')
  assert.equal(current.sourceSourceSha256, SOURCE_B)
  assert.equal(current.catalogObservation, 'pending')
})

test('the first createdAt survives an overwrite; updatedAt moves', async (context) => {
  const { store } = await workspace(context)
  const first = await store.write(record())
  const again = await store.write(record({ sourceSourceSha256: SOURCE_B }))
  assert.equal(again.createdAt, first.createdAt)
  assert.ok(again.updatedAt >= first.updatedAt)
})

test('a record with a forbidden field is refused before anything touches the disk', async (context) => {
  const { root, store } = await workspace(context)
  await assert.rejects(() => store.write(record({ sessionId: 'session-1' })), /血缘记录不可保存：forbidden-field:sessionId/)
  await assert.rejects(() => store.write(record({ content: '# body' })), /forbidden-field:content/)
  await assert.rejects(() => store.write(record({ sourceSourceSha256: 'nope' })), /missing-source-source-sha256/)
  // 一条记录都没落盘：mkdtemp 建出来的目录仍然是空的。
  assert.deepEqual(await readdir(root), [])
})

test('a truncated or malformed file reads as null instead of throwing', async (context) => {
  const { root, store } = await workspace(context)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, lineageFileName('my-ui-craft')), '{ not json', 'utf8')
  assert.equal(await store.read('my-ui-craft'), null)
  assert.deepEqual((await store.list()).warningCount, 1)
})

test('a file whose name does not match its content is counted as suspect, never served', async (context) => {
  const { root, store } = await workspace(context)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, `${'c'.repeat(64)}.json`), JSON.stringify(record()), 'utf8')
  assert.deepEqual(await store.list(), { records: [], warningCount: 1 })
})

test('the source direction answers "who came from me"', async (context) => {
  const { store } = await workspace(context)
  await store.write(record())
  await store.write(record({ targetSkillName: 'my-ui-craft-2' }))
  await store.write(record({ sourceSkillName: 'other-skill', targetSkillName: 'my-other' }))
  const fromUiCraft = await store.findBySource('ui-craft')
  assert.deepEqual(fromUiCraft.map((entry) => entry.targetSkillName).sort(), ['my-ui-craft', 'my-ui-craft-2'])
  assert.deepEqual((await store.list()).records.length, 3)
})

test('delete is exact and clear empties the store', async (context) => {
  const { root, store } = await workspace(context)
  await store.write(record())
  await store.write(record({ targetSkillName: 'my-ui-craft-2' }))
  await store.delete('my-ui-craft')
  assert.equal(await store.read('my-ui-craft'), null)
  assert.equal((await readdir(root)).length, 1)
  assert.equal(await store.clear(), 1)
  assert.deepEqual(await store.list(), { records: [], warningCount: 0 })
})

test('the atomic write leaves no temporary file behind', async (context) => {
  const { root, store } = await workspace(context)
  await store.write(record())
  const entries = await readdir(root)
  assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false)
  assert.match(await readFile(join(root, entries[0]), 'utf8'), /"targetSkillName": "my-ui-craft"/)
})
