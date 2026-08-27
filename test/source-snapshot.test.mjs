import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalogSnapshot, buildSourceSnapshots, loadSkillDefinition, safeSourceLabel } from '../src/core/source-snapshot.mjs'
import { emptyReceipt, rebuildReceipt } from '../src/core/trace-reducer.mjs'

function events() {
  return [
    { type: 'tool/call', seq: 1, time: 1, data: { turn: 1, step: 1, callId: 'call-1', name: 'skill', arguments: '{"name":"demo-skill"}' } },
    { type: 'tool/result', seq: 2, time: 2, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', toolCallId: 'call-1', isError: false, content: [{ type: 'text', text: '<skill_content name="demo-skill">\n<skill_instructions>\n1. Do the work\n</skill_instructions>\n</skill_content>' }] }] } } },
  ]
}

test('safe source labels exclude local absolute paths and credentials', () => {
  assert.equal(safeSourceLabel('/Users/private/skill'), '')
  assert.equal(safeSourceLabel('file:///private/skill'), '')
  assert.equal(safeSourceLabel('https://token@example.com/owner/repo'), '')
  assert.equal(safeSourceLabel('https://github.com/owner/repo?token=secret'), 'remote:github.com/owner/repo')
  assert.equal(safeSourceLabel('project-dsh'), 'project-dsh')
})

test('source snapshot compares current definition without persisting content', async () => {
  const receipt = rebuildReceipt('source-session', events(), emptyReceipt('source-session'))
  const registry = {
    async snapshot() { return { complete: true, skills: [{ name: 'demo-skill', provider: 'filesystem', source: 'project-dsh' }] } },
    async get() { return { name: 'demo-skill', provider: 'filesystem', source: 'project-dsh', invocation: { modelInvocable: true, userInvocable: false }, content: '1. Do the work' } },
  }
  const [snapshot] = await buildSourceSnapshots(registry, receipt, '/workspace', 5000)
  assert.equal(snapshot.provider, 'filesystem')
  assert.equal(snapshot.source, 'project-dsh')
  assert.equal(snapshot.match, 'match')
  assert.equal(snapshot.checkedAt, 5000)
  assert.equal(JSON.stringify(snapshot).includes('Do the work'), false)
})

test('incomplete registry observations fail closed', async () => {
  const receipt = rebuildReceipt('source-session', events())
  const snapshots = await buildSourceSnapshots({ async snapshot() { return { complete: false, skills: [] } } }, receipt, '/workspace', 5000)
  assert.equal(snapshots[0].snapshotComplete, false)
  assert.equal(snapshots[0].match, 'unavailable')
})

test('catalog snapshot forwards live scope and never exposes a raw source path', async () => {
  const live = { id: 'live-agent' }
  let received
  const registry = {
    async snapshot(options) {
      received = options
      return { complete: true, skills: [{ name: 'demo-skill', description: '  Demo   work  ', provider: 'filesystem', source: '/Users/private/skill', invocation: { modelInvocable: true } }] }
    },
  }
  const catalog = await buildCatalogSnapshot(registry, '/workspace', live, 5000)
  assert.equal(received.scope, live)
  assert.equal(catalog.complete, true)
  assert.equal(catalog.skills[0].description, 'Demo work')
  assert.match(catalog.skills[0].sourceFingerprint, /^sha256:[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(catalog).includes('/Users/private'), false)
})

test('runtime identity is only added when explicitly captured', async () => {
  const receipt = rebuildReceipt('source-session', events())
  const registry = {
    async snapshot() { return { complete: true, skills: [{ name: 'demo-skill', provider: 'filesystem', source: '/Users/private/skill' }] } },
    async get() { return { provider: 'filesystem', source: '/Users/private/skill', content: '1. Do the work' } },
  }
  const [ordinary] = await buildSourceSnapshots(registry, receipt, '/workspace', 5000)
  assert.equal(ordinary.runtimeIdentity, null)
  const [captured] = await buildSourceSnapshots(registry, receipt, '/workspace', 5000, { captureRuntimeIdentity: true, skillNames: ['demo-skill'] })
  assert.equal(captured.runtimeIdentity.provider, 'filesystem')
  assert.match(captured.runtimeIdentity.sourceFingerprint, /^sha256:[a-f0-9]{64}$/)
  assert.equal(captured.source, null)
  assert.equal(JSON.stringify(captured).includes('/Users/private'), false)
  assert.equal((await loadSkillDefinition(registry, 'demo-skill', '/workspace', {})).available, true)
})
