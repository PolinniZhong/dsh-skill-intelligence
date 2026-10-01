import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPreferenceStore, PREFERENCES_VERSION } from '../src/storage/preference-store.mjs'

const CURRENT = { version: PREFERENCES_VERSION, defaultView: 'current' }
const INSTALLED = { version: PREFERENCES_VERSION, defaultView: 'installed' }
// v0.5 的词汇：`skills` 是旧的第一屏，`map` 是旧第一屏写下来的缺省，`receipt` 是更早的缺省。
// 它们都不是 v0.6 的页面，所以读出来只能落回「本次 Skill」。
const LEGACY = { version: PREFERENCES_VERSION, defaultView: 'skills' }

test('persists the default page without session or project content', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = createPreferenceStore(root)
  assert.deepEqual(await store.read(), CURRENT)
  assert.deepEqual(await store.write({ defaultView: 'installed', sessionId: 'must-not-persist' }), INSTALLED)
  assert.deepEqual(await store.read(), INSTALLED)
  const raw = await readFile(join(root, 'preferences.json'), 'utf8')
  assert.equal(raw.includes('sessionId'), false)
  assert.equal(raw.includes('/Users/'), false)
})

test('falls back safely when preferences are invalid', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'preferences.json'), '{bad', 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), CURRENT)
})

test('a stored receipt does not remain the first screen', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // `receipt` was the Session-first default, so almost every stored value is that default
  // written down rather than a choice. The receipt is not a page in v0.6 at all (§4).
  await writeFile(join(root, 'preferences.json'), JSON.stringify({ defaultView: 'receipt', version: PREFERENCES_VERSION }), 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), CURRENT)
  assert.deepEqual(
    await createPreferenceStore(root).write({ defaultView: 'receipt' }),
    CURRENT,
  )
})

test('an unversioned map is the old first screen, not a choice', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // 真实事故（0.4.0-beta.68）：beta.66 的客户端把「运行流程」当第一屏，并把 `map` 写进偏好文件，
  // 文件里没有任何字段能说明它是选择还是缺省。升级后这一个文件把插件永远钉在旧 IA 的第一屏上。
  await writeFile(join(root, 'preferences.json'), JSON.stringify({ defaultView: 'map' }), 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), CURRENT)
})

test('a map chosen under the previous IA cannot survive the page vocabulary change', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // v0.5 的版本号是 2。即使那次 `map` 真的是用户按下的，v0.6 里已经没有「运行流程」这个页面了，
  // 所以它不能被兑现 —— 版本号抬升把这个意图变成「未表达偏好」，落到「本次 Skill」。
  await writeFile(join(root, 'preferences.json'), JSON.stringify({ defaultView: 'map', version: 2 }), 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), CURRENT)
})

test('a page chosen under the current IA survives', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // 反例守卫：修 bug 不能把「用户真的选了已安装 Skill」也一起丢掉。
  await writeFile(join(root, 'preferences.json'), JSON.stringify(INSTALLED), 'utf8')
  const store = createPreferenceStore(root)
  assert.deepEqual(await store.read(), INSTALLED)
  assert.deepEqual(await store.write({ defaultView: 'current' }), CURRENT)
  assert.deepEqual(await store.read(), CURRENT)
})

test('a v0.5 vocabulary value stamped with the current version is not a page', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-trace-preferences-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  // 即使版本号对得上，`skills` 也不是 v0.6 的页面名 —— 白名单必须同时管住词汇表和版本号。
  await writeFile(join(root, 'preferences.json'), JSON.stringify(LEGACY), 'utf8')
  assert.deepEqual(await createPreferenceStore(root).read(), CURRENT)
})
