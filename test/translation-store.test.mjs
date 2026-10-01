import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FORBIDDEN_RECORD_FIELDS,
  createTranslationStore,
  inspectTranslationRecord,
  translationStoreKey,
} from '../src/storage/translation-store.mjs'

const SOURCE_A = `sha256:${'a'.repeat(64)}`
const SOURCE_B = `sha256:${'b'.repeat(64)}`

function record(overrides = {}) {
  return {
    skillName: 'ui-craft',
    sourceSha256: SOURCE_A,
    targetLanguage: 'zh-CN',
    translation: '# UI Craft\n\n中文阅读版正文。',
    chunkCount: 3,
    fallbackChunks: 0,
    fallbackReasons: [],
    model: 'provider/model',
    ...overrides,
  }
}

async function withRoot(context, prefix) {
  const root = await mkdtemp(join(tmpdir(), `dsh-skill-trace-${prefix}-`))
  context.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('a Chinese reading version survives a restart, because its key has no session', async (context) => {
  const root = await withRoot(context, 'translation-restart')
  const first = createTranslationStore(root)
  await first.write(record())

  // 「重启」= 换一个 store 实例，只有磁盘还连着。键里只要沾了 sessionId，这里必然 miss。
  const restarted = createTranslationStore(root)
  const recovered = await restarted.read({ skillName: 'ui-craft', sourceSha256: SOURCE_A, targetLanguage: 'zh-CN' })
  assert.equal(recovered?.translation, '# UI Craft\n\n中文阅读版正文。')
  assert.equal(recovered.schemaVersion, 1)
  assert.equal(recovered.chunkCount, 3)
  assert.equal(recovered.model, 'provider/model')
  // 键本身是三个字段，没有第四个位置可以放会话。
  const key = translationStoreKey({ skillName: 'ui-craft', sourceSha256: SOURCE_A, targetLanguage: 'zh-CN' })
  assert.equal(key.split('\u0000').length, 3, 'the persistent key is exactly name + sha + language')
  assert.ok(!key.includes('session'), 'nothing session-shaped enters the persistent key')
})

test('a changed source hash makes the old reading version unreadable, not stale', async (context) => {
  const root = await withRoot(context, 'translation-sha')
  const store = createTranslationStore(root)
  await store.write(record())

  // 指纹变了：读当前版本的译文必须什么都没读到，而不是把上一版顶上来。
  assert.equal(await store.read({ skillName: 'ui-craft', sourceSha256: SOURCE_B, targetLanguage: 'zh-CN' }), null)
  // 语言也不同 —— 同样不算命中，三种语言各自成键。
  assert.equal(await store.read({ skillName: 'ui-craft', sourceSha256: SOURCE_A, targetLanguage: 'en' }), null)
  assert.equal(await store.read({ skillName: 'other-skill', sourceSha256: SOURCE_A, targetLanguage: 'zh-CN' }), null)
  // 旧的那一份还在，只是不会被当成当前版本显示。
  const { translations } = await store.list()
  assert.equal(translations.length, 1)
  assert.equal(translations[0].sourceSha256, SOURCE_A)
})

test('the delete path is exact to all three key fields', async (context) => {
  const root = await withRoot(context, 'translation-delete')
  const store = createTranslationStore(root)
  await store.write(record())
  await store.write(record({ sourceSha256: SOURCE_B, translation: '# 另一版' }))

  await store.delete({ skillName: 'ui-craft', sourceSha256: SOURCE_B, targetLanguage: 'zh-CN' })
  assert.equal(await store.read({ skillName: 'ui-craft', sourceSha256: SOURCE_B, targetLanguage: 'zh-CN' }), null)
  assert.ok(await store.read({ skillName: 'ui-craft', sourceSha256: SOURCE_A, targetLanguage: 'zh-CN' }),
    'deleting one version never takes the neighbouring one with it')
})

test('the record never carries a session, an argument or a tool result', async (context) => {
  const root = await withRoot(context, 'translation-privacy')
  const store = createTranslationStore(root)

  for (const field of FORBIDDEN_RECORD_FIELDS) {
    await assert.rejects(
      () => store.write(record({ [field]: 'leaked' })),
      new RegExp(`forbidden-field:${field}`),
      `${field} must be refused at the store, not merely omitted by the caller`,
    )
  }
  assert.equal(inspectTranslationRecord(record()).ok, true)
  assert.equal(inspectTranslationRecord(record({ translation: '' })).reason, 'missing-translation')
  assert.equal(inspectTranslationRecord(null).reason, 'not-an-object')

  const files = await readdir(root).catch(() => [])
  assert.deepEqual(files, [], 'a refused record leaves nothing on disk')
})

test('the store writes 0700/0600 and atomic files, and reads nothing it cannot vouch for', async (context) => {
  const root = await withRoot(context, 'translation-mode')
  const store = createTranslationStore(root)
  await store.write(record())

  const files = await readdir(root)
  assert.equal(files.length, 1)
  assert.match(files[0], /^[a-f0-9]{64}\.json$/, 'the file name is a hash, not the Skill name')
  assert.deepEqual(files.filter((file) => file.endsWith('.tmp')), [], 'the temporary file never survives the rename')

  if (process.platform !== 'win32') {
    const dirMode = (await stat(root)).mode & 0o777
    const fileMode = (await stat(join(root, files[0]))).mode & 0o777
    assert.equal(dirMode, 0o700, 'the directory is private')
    assert.equal(fileMode, 0o600, 'the file is private')
  }

  // 半个文件、坏 JSON、缺字段都不算"读到了" —— 中文阅读版读不出来只是回到原文，
  // 把损坏的正文当作译文显示才是事故。
  await writeFile(join(root, `${'c'.repeat(64)}.json`), '{not-json', 'utf8')
  await writeFile(join(root, `${'d'.repeat(64)}.json`), JSON.stringify({ skillName: 'x' }), 'utf8')
  const listed = await store.list()
  assert.equal(listed.translations.length, 1)
  assert.equal(listed.warningCount, 2)
  await writeFile(join(root, files[0]), '{broken', 'utf8')
  assert.equal(await store.read({ skillName: 'ui-craft', sourceSha256: SOURCE_A, targetLanguage: 'zh-CN' }), null)
})

test('pruning keeps the newest reading versions instead of hoarding every revision', async (context) => {
  const root = await withRoot(context, 'translation-prune')
  const store = createTranslationStore(root)
  // 三版同一个 Skill：只有最新的那一版可能被显示，另外两版永远不会被读到。
  for (let index = 0; index < 3; index += 1) {
    await store.write(record({
      sourceSha256: `sha256:${String(index).repeat(64)}`,
      translation: `# 第 ${index} 版`,
      createdAt: index,
    }))
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  const removed = await store.pruneVersions({ keepPerSkill: 1 })
  assert.equal(removed, 2)
  const { translations } = await store.list()
  assert.equal(translations.length, 1)
  assert.equal(translations[0].translation, '# 第 2 版', 'the newest revision is the one that survives')
})

test('clear removes translation files and leaves unrelated neighbours alone', async (context) => {
  const root = await withRoot(context, 'translation-clear')
  const store = createTranslationStore(root)
  await store.write(record())
  await store.write(record({ skillName: 'find-skills' }))
  await writeFile(join(root, 'keep.txt'), 'unrelated local file', 'utf8')
  assert.equal(await store.clear(), 2)
  assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'unrelated local file')
})
