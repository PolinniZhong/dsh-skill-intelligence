import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreferenceStore, PREFERENCES_VERSION } from '../src/storage/preference-store.mjs'

const SKILLS = { version: PREFERENCES_VERSION, defaultView: 'skills' }
const MAP = { version: PREFERENCES_VERSION, defaultView: 'map' }

test('persists the default view without session or project content', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createPreferenceStore(root)
  assert.deepEqual(await store.read(), SKILLS)
  assert.deepEqual(await store.write({ defaultView: 'map', sessionId: 'must-not-persist' }), MAP)
  assert.deepEqual(await store.read(), MAP)
  const raw = await readFile(join(root, 'preferences.json'), 'utf8')
  assert.equal(raw.includes('sessionId'), false)
  assert.equal(raw.includes('/Users/'), false)
})

test('falls back safely when preferences are invalid', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'preferences.json'), '{bad', 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), SKILLS)
})

test('a stored receipt does not remain the first screen', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // `receipt` was the Session-first default, so almost every stored value is that default
  // written down rather than a choice. The Skill-first IA replaces the first screen, and the
  // receipt is an Advanced view now — so it is not a valid default.
  await writeFile(join(root, 'preferences.json'), JSON.stringify({ defaultView: 'receipt', version: PREFERENCES_VERSION }), 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), SKILLS)
  assert.deepEqual(
    await createPreferenceStore(root).write({ defaultView: 'receipt' }),
    SKILLS,
  )
})

test('an unversioned map is the old first screen, not a choice', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // 真实事故（0.4.0-beta.68）：beta.66 的客户端把「运行流程」当第一屏，并把 `map` 写进偏好文件，
  // 文件里没有任何字段能说明它是选择还是缺省。升级后这一个文件把插件永远钉在旧 IA 的第一屏上。
  await writeFile(join(root, 'preferences.json'), JSON.stringify({ defaultView: 'map' }), 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), SKILLS)
})

test('a versioned map is a choice and survives', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // 反例守卫：修 bug 不能把「用户真的选了运行流程」也一起丢掉。
  await writeFile(join(root, 'preferences.json'), JSON.stringify(MAP), 'utf8')
  const store = createPreferenceStore(root)
  assert.deepEqual(await store.read(), MAP)
  assert.deepEqual(await store.write({ defaultView: 'map' }), MAP)
  assert.deepEqual(await store.read(), MAP)
})
