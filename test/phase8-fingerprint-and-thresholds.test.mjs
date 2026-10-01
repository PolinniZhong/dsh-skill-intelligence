import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFingerprintReservation, FINGERPRINT_MODEL_VERSION, FINGERPRINT_PATTERNS } from '../src/core/runtime-fingerprint.mjs'
import { buildRuntimeGraph } from '../src/core/runtime-graph.mjs'
import { buildViewModels, emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// §31 reserved structure, and §36's aggregation thresholds.
//
// §31 asks for structure to be *reserved*, not for a fingerprint to be invented. The
// test that matters is therefore the negative one: every slot must be explicitly empty,
// and "not derived" must never be representable as a finding.

function run({ turns = 1, perTurn = 1, failures = [] } = {}) {
  const events = []
  let seq = 1
  for (let turn = 1; turn <= turns; turn += 1) {
    events.push({ type: 'turn/start', seq: seq++, time: 1000 + seq, data: { turn } })
    events.push({ type: 'step/start', seq: seq++, time: 1000 + seq, data: { turn, step: 1 } })
    for (let index = 0; index < perTurn; index += 1) {
      const callId = `c${turn}-${index}`
      events.push({ type: 'tool/call', seq: seq++, time: 1000 + seq, data: { turn, step: 1, callId, name: 'bash', arguments: '{}' } })
      events.push({
        type: 'tool/result', seq: seq++, time: 1000 + seq,
        data: { turn, step: 1, message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: 'ok' }], isError: failures.includes(`${turn}-${index}`), id: `m${callId}` } },
      })
    }
  }
  let receipt = emptyReceipt('s', 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return { receipt, graph: buildRuntimeGraph(receipt) }
}

test('§31 all six patterns are reserved', () => {
  const { graph } = run({ turns: 2, perTurn: 3 })
  const reservation = buildFingerprintReservation(graph)
  assert.equal(reservation.modelVersion, FINGERPRINT_MODEL_VERSION)
  assert.deepEqual(Object.keys(reservation.patterns), FINGERPRINT_PATTERNS)
  assert.deepEqual([...FINGERPRINT_PATTERNS].sort(), ['cli', 'failure', 'mcp', 'recovery', 'runtime', 'tool'])
})

test('§31 nothing is derived, and "not derived" is not presented as a finding', () => {
  const { graph } = run({ turns: 2, perTurn: 3 })
  const reservation = buildFingerprintReservation(graph)
  assert.equal(reservation.derived, false)
  assert.equal(reservation.status, 'reserved')
  for (const pattern of Object.values(reservation.patterns)) {
    // `null` means "nobody looked". An empty array or a zero would mean "looked and
    // found nothing" — a different claim, and the one this must never make.
    assert.equal(pattern.value, null, `${pattern.key} must be null, not an empty value`)
    assert.equal(pattern.status, 'not-yet-derived')
    assert.ok(pattern.label.zh && pattern.label.en)
    assert.ok(Array.isArray(pattern.sources) && pattern.sources.length > 0)
  }
})

test('§31 no fingerprint path produces a score', () => {
  const { graph } = run({ turns: 3, perTurn: 4, failures: ['1-0'] })
  const serialized = JSON.stringify(buildFingerprintReservation(graph))
  for (const forbidden of ['score', 'rate', 'ranking', 'percent', 'confidence']) {
    assert.equal(serialized.includes(forbidden), false, `§16: a fingerprint must not carry ${forbidden}`)
  }
})

test('§31 the receipt surface carries the reservation, not a derived fingerprint', () => {
  const { receipt } = run({ turns: 2, perTurn: 3 })
  const fingerprint = buildViewModels(receipt).receipt.runtime.fingerprint
  assert.ok(fingerprint, 'the receipt view must carry the reserved structure')
  assert.equal(fingerprint.derived, false)
  assert.equal(Object.keys(fingerprint.patterns).length, 6)
})
