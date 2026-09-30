import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreferenceStore } from '../src/storage/preference-store.mjs'

test('persists the default view without session or project content', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createPreferenceStore(root)
  assert.deepEqual(await store.read(), { defaultView: 'skills' })
  assert.deepEqual(await store.write({ defaultView: 'map', sessionId: 'must-not-persist' }), { defaultView: 'map' })
  assert.deepEqual(await store.read(), { defaultView: 'map' })
  const raw = await readFile(join(root, 'preferences.json'), 'utf8')
  assert.equal(raw.includes('sessionId'), false)
  assert.equal(raw.includes('/Users/'), false)
})

test('falls back safely when preferences are invalid', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'preferences.json'), '{bad', 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), { defaultView: 'skills' })
})

test('a stored receipt does not remain the first screen', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // `receipt` was the Session-first default, so almost every stored value is that default
  // written down rather than a choice. The Skill-first IA replaces the first screen, and the
  // receipt is an Advanced view now — so it is not a valid default.
  await writeFile(join(root, 'preferences.json'), JSON.stringify({ defaultView: 'receipt' }), 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), { defaultView: 'skills' })
  assert.deepEqual(
    await createPreferenceStore(root).write({ defaultView: 'receipt' }),
    { defaultView: 'skills' },
  )
})
