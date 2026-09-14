import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, sessionEventLog } from '../src/dsh/host/index.js'

// Mirrors the DSH runtime >= 0.1.2-rc.1 shape: the durable log is exposed only
// through `snapshotEvents()`. A session that also lacks `snapshotEvents()` must
// never make the host read a stale `events` field and produce empty receipts.
function skillToolEvents(sessionId) {
  return [
    { type: 'turn/start', seq: 0, time: 1_000, data: { turn: 1 } },
    { type: 'step/start', seq: 1, time: 1_001, data: { turn: 1, step: 1 } },
    {
      type: 'tool/call',
      seq: 2,
      time: 1_002,
      data: { turn: 1, step: 1, callId: `call-${sessionId}`, name: 'skill', arguments: JSON.stringify({ name: 'skill-a' }) },
    },
    {
      type: 'tool/result',
      seq: 3,
      time: 1_003,
      data: {
        turn: 1,
        step: 1,
        message: {
          source: { kind: 'tool', callId: `call-${sessionId}` },
          content: [{
            type: 'tool-result',
            toolCallId: `call-${sessionId}`,
            isError: false,
            content: [{ type: 'text', text: 'loaded skill-a' }],
          }],
        },
      },
    },
    { type: 'step/end', seq: 4, time: 1_004, data: { turn: 1, step: 1 } },
    { type: 'turn/end', seq: 5, time: 1_005, data: { turn: 1, reason: 'stop' } },
  ]
}

function createHost(dataRoot, sessions) {
  const routes = []
  const listeners = new Map()
  const webCtx = {
    on(name, handler) { listeners.set(name, handler); return () => listeners.delete(name) },
    get() { return undefined },
    effect(setup) { setup(); return () => {} },
    webServer: { register(route) { routes.push(route); return () => {} } },
    sessions: { get: (sessionId) => sessions.get(sessionId) ?? null },
    agents: { get: () => null },
  }
  apply({ inject(_names, callback) { callback(webCtx) } }, { dataRoot })
  return { routes, listeners }
}

async function readContext(route, sessionId) {
  let status = 0
  let body = ''
  const res = { writeHead(code) { status = code }, end(payload) { body = payload } }
  await route.handler({
    method: 'GET',
    url: `/skill-trace/context?sessionId=${encodeURIComponent(sessionId)}`,
    socket: { remoteAddress: '127.0.0.1' },
  }, res)
  return { status, payload: JSON.parse(body) }
}

test('reads a live session through snapshotEvents() and rebuilds its trace evidence', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-host-log-'))
  try {
    const sessionId = 'session-snapshot-api'
    const session = {
      id: sessionId,
      header: { cwd: '/tmp/example-workspace' },
      snapshotEvents: () => skillToolEvents(sessionId),
    }
    const { routes } = createHost(dataRoot, new Map([[sessionId, session]]))

    const { status, payload } = await readContext(routes[0], sessionId)
    assert.equal(status, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.receipt.traceEvents.length, 1)
    assert.equal(payload.receipt.traceEvents[0].skillName, 'skill-a')
    assert.equal(payload.receipt.traceEvents[0].status, 'loaded')
    assert.deepEqual(payload.receipt.activity.turns, [1])
    assert.equal(payload.receipt.activity.steps.length, 1)
    assert.equal(payload.views.receipt.summary.loadedCount, 1)

    const stored = await readdir(join(dataRoot, 'receipts'))
    assert.equal(stored.length, 1, 'reading the live view must persist, not erase, the receipt')
  } finally {
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('still reads the legacy events array when snapshotEvents() is unavailable', () => {
  const sessionId = 'session-legacy-api'
  const session = { id: sessionId, events: skillToolEvents(sessionId) }
  assert.equal(sessionEventLog(session).length, 6)
  assert.deepEqual(sessionEventLog({ id: 'no-log' }), [])
  assert.deepEqual(sessionEventLog(null), [])
})

test('a session without a readable log yields an explicit empty receipt, never a crash', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-host-log-'))
  try {
    const sessionId = 'session-no-log'
    const { routes } = createHost(dataRoot, new Map([[sessionId, { id: sessionId, header: {} }]]))

    const { status, payload } = await readContext(routes[0], sessionId)
    assert.equal(status, 200)
    assert.equal(payload.receipt.traceEvents.length, 0)
    assert.equal(payload.views.receipt.summary.eventCount, 0)
  } finally {
    await rm(dataRoot, { recursive: true, force: true })
  }
})
