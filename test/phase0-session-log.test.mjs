import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import {
  SESSION_LOG_MAX_BYTES,
  clearSessionLogCache,
  decompressZstdFrames,
  defaultSessionsRoot,
  findSessionLogFile,
  findZstdFrameStarts,
  readSessionEvents,
} from '../src/core/session-log.mjs'
import { rebuildReceipt } from '../src/core/trace-reducer.mjs'
import { buildRuntimeGraph } from '../src/core/runtime-graph.mjs'

// P0 contract: a past conversation's runtime evidence is recoverable from its
// durable log.
//
// The defect this suite pins down was measured, not imagined: the host read only
// live sessions, so the Runtime Graph answered "1 node / 0 edges" for a run whose
// log held 1095 nodes.
//
// The subtlest part is compression. DSH appends one Zstandard **frame** per write
// batch, and Node's decompressors stop after the first frame — a real 5.4 MB log
// decoded to 220 bytes and 1 line instead of 6350. So the frame handling below is
// the load-bearing behaviour, tested against buffers built the same way.

const WORKSPACE = '--Users-test-workspace--'

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-session-log-'))
  mkdirSync(join(root, WORKSPACE), { recursive: true })
  return root
}

function writeLog(root, sessionId, lines, { name = 'session.v4.jsonl.zstd', compress = true, frames = 1 } = {}) {
  const dir = join(root, WORKSPACE, sessionId)
  mkdirSync(dir, { recursive: true })
  const body = lines.map((line) => JSON.stringify(line)).join('\n') + '\n'
  if (!compress) {
    writeFileSync(join(dir, name), body)
    return join(dir, name)
  }
  // One frame per chunk, exactly how the persistence layer appends.
  const per = Math.ceil(lines.length / frames)
  const parts = []
  for (let index = 0; index < lines.length; index += per) {
    const chunk = lines.slice(index, index + per).map((line) => JSON.stringify(line)).join('\n') + '\n'
    parts.push(zstdCompressSync(Buffer.from(chunk, 'utf8')))
  }
  const path = join(dir, name)
  writeFileSync(path, Buffer.concat(parts.length ? parts : [zstdCompressSync(Buffer.from(''))]))
  return path
}

function sampleEvents(count) {
  const events = [{ type: 'session', id: 'session-test', seq: 0 }]
  for (let index = 0; index < count; index += 1) {
    const seq = index + 1
    events.push({ type: 'tool/call', seq, time: 1000 + seq, data: { turn: 1, step: 1, callId: `c${index}`, name: 'bash', arguments: '{}' } })
  }
  return events
}

test('a multi-frame log decodes every frame, not only the first', () => {
  const root = makeRoot()
  try {
    const events = sampleEvents(30)
    writeLog(root, 'session-multi', events, { frames: 6 })
    const result = readSessionEvents('session-multi', { root })
    assert.equal(result.found, true)
    assert.equal(result.events.length, events.length, 'every stored event must survive decompression')
    // The first-frame-only failure mode: a handful of events instead of all of them.
    assert.ok(result.events.length > 10)
    assert.deepEqual(result.events.map((event) => event.seq), events.map((event) => event.seq))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('frame splitting finds every magic and reproduces the log exactly', () => {
  const lines = [JSON.stringify({ type: 'a', seq: 1 }), JSON.stringify({ type: 'b', seq: 2 })]
  const frames = [zstdCompressSync(Buffer.from(lines[0] + '\n')), zstdCompressSync(Buffer.from(lines[1] + '\n'))]
  const buffer = Buffer.concat(frames)
  const starts = findZstdFrameStarts(buffer)
  assert.equal(starts.length, 2)
  assert.equal(starts[0], 0)
  assert.equal(starts[1], frames[0].length)
  const out = decompressZstdFrames(buffer).toString('utf8')
  assert.equal(out, `${lines[0]}\n${lines[1]}\n`)
})

test('a single-frame log still decodes', () => {
  const root = makeRoot()
  try {
    writeLog(root, 'session-single', sampleEvents(4), { frames: 1 })
    assert.equal(readSessionEvents('session-single', { root }).events.length, 5)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an uncompressed log is read as well as a compressed one', () => {
  const root = makeRoot()
  try {
    writeLog(root, 'session-plain', sampleEvents(3), { name: 'session.v4.jsonl', compress: false })
    const result = readSessionEvents('session-plain', { root })
    assert.equal(result.events.length, 4)
    assert.equal(result.formatVersion, 4)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the highest format version wins when a session was migrated', () => {
  const root = makeRoot()
  try {
    writeLog(root, 'session-migrated', sampleEvents(2), { name: 'session.v3.jsonl.zstd' })
    writeLog(root, 'session-migrated', sampleEvents(7), { name: 'session.v4.jsonl.zstd' })
    const file = findSessionLogFile('session-migrated', { root })
    assert.equal(file.formatVersion, 4)
    assert.equal(readSessionEvents('session-migrated', { root }).events.length, 8)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unknown session reports not-found rather than throwing', () => {
  const root = makeRoot()
  try {
    const result = readSessionEvents('session-absent', { root })
    assert.equal(result.found, false)
    assert.deepEqual(result.events, [])
    assert.equal(result.path, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a session id cannot climb out of the sessions root', () => {
  const root = makeRoot()
  try {
    for (const id of ['../escape', 'a/b', 'a\\b', '.hidden', '']) {
      assert.equal(findSessionLogFile(id, { root }), null, `id ${JSON.stringify(id)} must be refused`)
      assert.equal(readSessionEvents(id, { root }).found, false)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a torn trailing line is skipped instead of failing the read', () => {
  const root = makeRoot()
  try {
    const dir = join(root, WORKSPACE, 'session-torn')
    mkdirSync(dir, { recursive: true })
    const body = '{"type":"session","seq":0}\n{"type":"tool/call","seq":1,"data":{}}\n{"type":"tool/ca'
    writeFileSync(join(dir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(body)))
    const result = readSessionEvents('session-torn', { root })
    assert.equal(result.events.length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('events without a type are dropped, so the reducer only sees real events', () => {
  const root = makeRoot()
  try {
    writeLog(root, 'session-untyped', [{ type: 'session', seq: 0 }, { seq: 1 }, null, { type: 'tool/call', seq: 2 }])
    const events = readSessionEvents('session-untyped', { root }).events
    assert.equal(events.length, 2)
    assert.equal(events.every((event) => typeof event.type === 'string'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reads are cached against the file revision and refreshed when it changes', async () => {
  const root = makeRoot()
  try {
    clearSessionLogCache()
    writeLog(root, 'session-cached', sampleEvents(3))
    const first = readSessionEvents('session-cached', { root })
    assert.equal(first.cached, false)
    const second = readSessionEvents('session-cached', { root })
    assert.equal(second.cached, true)
    assert.equal(second.events.length, first.events.length)

    // A newer revision must not be served from the stale cache.
    await new Promise((resolve) => setTimeout(resolve, 12))
    writeLog(root, 'session-cached', sampleEvents(9))
    const third = readSessionEvents('session-cached', { root })
    assert.equal(third.cached, false)
    assert.ok(third.events.length > first.events.length, 'a rewritten log must be re-read')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the size gate is declared and every log found stays under it', () => {
  // The gate guards against loading a runaway file; it is not exercised with a
  // 512 MB fixture. What is asserted here is that discovery reports a size the
  // gate can act on at all.
  assert.ok(SESSION_LOG_MAX_BYTES > 0)
  const root = makeRoot()
  try {
    writeLog(root, 'session-sized', sampleEvents(2))
    const file = findSessionLogFile('session-sized', { root })
    assert.equal(typeof file.size, 'number')
    assert.ok(file.size > 0 && file.size < SESSION_LOG_MAX_BYTES)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unreadable root is not an error', () => {
  assert.equal(findSessionLogFile('session-any', { root: join(tmpdir(), 'dsh-does-not-exist-xyz') }), null)
})

test('the default root follows the plugin data convention', () => {
  assert.match(defaultSessionsRoot(), /\.dsh\/sessions$/)
})

test('the recovered evidence is what the runtime graph needs', () => {
  // End to end: log on disk -> receipt -> graph. This is the P0 acceptance path.
  const root = makeRoot()
  try {
    const events = sampleEvents(6)
    events.push({ type: 'turn/start', seq: 100, time: 2000, data: { turn: 1 } })
    writeLog(root, 'session-e2e', events, { frames: 3 })
    const { events: recovered } = readSessionEvents('session-e2e', { root })
    const receipt = rebuildReceipt('session-e2e', recovered, null)
    assert.ok(receipt.runtimeEvents.length > 0, 'runtime events must be recoverable from a stored log')
    const graph = buildRuntimeGraph(receipt)
    assert.ok(graph.stats.nodeCount > 1, `graph only reached ${graph.stats.nodeCount} nodes`)
    // A session node plus one node per recovered invocation.
    assert.equal(graph.nodes.filter((node) => node.type === 'session').length, 1)
    assert.equal(graph.nodes.filter((node) => node.role === 'invocation').length, receipt.runtimeEvents.length)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('round-tripping a compressed buffer through the decoder is lossless', () => {
  const payload = JSON.stringify({ type: 'user/message', seq: 1, data: { content: '中文与 emoji 🎯 混合\n第二行' } }) + '\n'
  const out = decompressZstdFrames(zstdCompressSync(Buffer.from(payload, 'utf8'))).toString('utf8')
  assert.equal(out, payload)
})
