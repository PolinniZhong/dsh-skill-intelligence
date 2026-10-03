import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  MODIFICATION_SNAPSHOT_MAX,
  MODIFICATION_SNAPSHOT_TTL_MS,
  createModificationSnapshotStore,
} from '../src/storage/modification-snapshot-store.mjs'

/** 一份「修改前」的样子：正文 + 目录清单指纹 + 来源指纹。 */
function begin(store, overrides = {}) {
  return store.begin({
    sessionId: 'session-1',
    skillName: 'company-ui-craft',
    sourceSha256: 'sha-source-1',
    text: '# UI Craft\n\n## Rules\n- A\n',
    resources: [{ path: 'SKILL.md', sha256: 'sha-skill-1' }, { path: 'references/tokens.md', sha256: 'sha-tokens-1' }],
    scopes: ['skill-md-rules'],
    profiles: ['common', 'dsh'],
    ...overrides,
  })
}

test('记下再取回：正文、清单、范围都在，而且取回的是副本', () => {
  const store = createModificationSnapshotStore()
  const descriptor = begin(store)
  assert.equal(descriptor.sessionId, 'session-1')
  assert.equal(descriptor.skillName, 'company-ui-craft')
  assert.deepEqual(descriptor.scopes, ['skill-md-rules'])
  assert.deepEqual(descriptor.profiles, ['common', 'dsh'])

  const record = store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' })
  assert.equal(record.sourceSha256, 'sha-source-1')
  assert.ok(record.text.includes('## Rules'))
  assert.deepEqual(record.resources, [
    { path: 'SKILL.md', sha256: 'sha-skill-1' },
    { path: 'references/tokens.md', sha256: 'sha-tokens-1' },
  ])
  // 改副本不许影响库里那一份。
  record.resources[0].path = 'tampered'
  record.scopes.push('assets')
  const again = store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' })
  assert.equal(again.resources[0].path, 'SKILL.md')
  assert.deepEqual(again.scopes, ['skill-md-rules'])
})

test('跨会话不许串台：同一个 Skill 名、不同会话是两份东西', () => {
  const store = createModificationSnapshotStore()
  begin(store, { sessionId: 'session-1', text: 'first' })
  begin(store, { sessionId: 'session-2', text: 'second' })
  assert.equal(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }).text, 'first')
  assert.equal(store.read({ sessionId: 'session-2', skillName: 'company-ui-craft' }).text, 'second')
  assert.equal(store.read({ sessionId: 'session-3', skillName: 'company-ui-craft' }), null)
  assert.equal(store.read({ sessionId: 'session-1', skillName: 'other-skill' }), null)
  assert.equal(store.size(), 2)
})

test('过期之后什么都不剩 —— 宁可说不知道，也不冒充刚刚的修改前', () => {
  let clock = 1_000
  const store = createModificationSnapshotStore({ now: () => clock, ttlMs: 100 })
  begin(store)
  assert.ok(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }))
  clock = 1_099
  assert.ok(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }), '边界内还在')
  clock = 1_100
  assert.equal(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }), null)
  assert.equal(store.size(), 0, '过期项在读取时就被清掉')
})

test('释放：对比做完就放掉，释放过一次就没有第二次', () => {
  const store = createModificationSnapshotStore()
  begin(store)
  assert.equal(store.size(), 1)
  assert.equal(store.release({ sessionId: 'session-1', skillName: 'company-ui-craft' }), true)
  assert.equal(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }), null)
  assert.equal(store.release({ sessionId: 'session-1', skillName: 'company-ui-craft' }), false)
  assert.equal(store.release({ sessionId: 'nobody', skillName: 'nothing' }), false)
})

test('同一个会话同一个 Skill 再开一次会覆盖：上一次没走完的事务不是这一次的「修改前」', () => {
  let clock = 10
  const store = createModificationSnapshotStore({ now: () => clock })
  begin(store, { text: 'old' })
  clock = 20
  begin(store, { text: 'new' })
  const record = store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' })
  assert.equal(record.text, 'new')
  assert.equal(record.createdAt, 20)
  assert.equal(store.size(), 1)
})

test('清单拿不到时是 null，不是空数组 —— 空数组会被读成「目录真的是空的」', () => {
  const store = createModificationSnapshotStore()
  begin(store, { resources: null })
  assert.equal(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }).resources, null)
  begin(store, { resources: [] })
  assert.deepEqual(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }).resources, [])
  // 清单里的脏条目丢掉，不整份作废。
  begin(store, { resources: [null, { path: 'SKILL.md' }, { nope: true }] })
  assert.deepEqual(store.read({ sessionId: 'session-1', skillName: 'company-ui-craft' }).resources, [
    { path: 'SKILL.md', sha256: null },
  ])
})

test('内存有上限：超了丢最早的一份，最新的还在', () => {
  const store = createModificationSnapshotStore({ now: () => 5, max: 2 })
  begin(store, { skillName: 'a' })
  begin(store, { skillName: 'b' })
  begin(store, { skillName: 'c' })
  assert.equal(store.size(), 2)
  assert.equal(store.read({ sessionId: 'session-1', skillName: 'a' }), null)
  assert.ok(store.read({ sessionId: 'session-1', skillName: 'c' }))
})

test('任何输入都不抛错：null、非对象、缺字段一律 null/false', () => {
  const store = createModificationSnapshotStore()
  for (const nothing of [undefined, null, 42, 'x', [], {}]) {
    assert.equal(store.begin(nothing), null, String(nothing))
    assert.equal(store.read(nothing), null, String(nothing))
    assert.equal(store.release(nothing), false, String(nothing))
  }
  assert.equal(store.begin({ sessionId: '', skillName: 'a' }), null)
  assert.equal(store.begin({ sessionId: 's', skillName: '' }), null)
  assert.equal(store.read({ sessionId: 's' }), null)
  assert.equal(store.size(), 0)
})

test('这个模块根本不碰文件系统：没有 fs、没有写、没有读', async () => {
  const path = fileURLToPath(new URL('../src/storage/modification-snapshot-store.mjs', import.meta.url))
  const source = await readFile(path, 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const verboten of ['node:fs', 'fs/promises', 'writeFile', 'readFile', 'createWriteStream', 'mkdir', 'writeFileSync']) {
    assert.ok(!code.includes(verboten), `${verboten} 不该出现在快照库里`)
  }
  assert.ok(code.includes('new Map()'), '快照库就该是一个内存 Map')
  assert.equal(MODIFICATION_SNAPSHOT_TTL_MS, 30 * 60 * 1000)
  assert.equal(MODIFICATION_SNAPSHOT_MAX, 32)
})
