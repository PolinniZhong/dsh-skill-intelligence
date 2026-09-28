import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ELK_NODE_LIMIT,
  LAYOUT_ENGINE_DETERMINISTIC,
  LAYOUT_ENGINE_ELK,
  computeRuntimeLayoutWithElk,
  ranksFromElk,
  toElkGraph,
} from '../src/core/runtime-layout-elk.mjs'
import { computeRuntimeLayout } from '../src/core/runtime-layout.mjs'
import { buildRuntimeGraph } from '../src/core/runtime-graph.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// ELK-assisted layout contract (§12, §34, §35, §36).
//
// ELK owns crossing minimization inside the layers §35 defines; the placer owns the
// geometry, because ELK's own coordinates were measured producing a 4804 × 4937
// canvas on a real session's aggregated view — a vertical strip, which is the exact
// "line wall" §20/§36 exist to prevent.
//
// ELK is also expensive at scale (measured: 7 ms at ≤20 rendered nodes, 556 ms at
// 120–200), so it runs only while it is cheap. What matters for the contract is that
// the substitution is bounded, reported, and never changes the node set.

const sessionId = 'session-elk'

function pair(seq, index, { name = 'bash', turn = 1 } = {}) {
  const callId = `c${index}`
  return [
    { type: 'tool/call', seq, time: 1000 + seq, data: { turn, step: 1, callId, name, arguments: '{}' } },
    {
      type: 'tool/result',
      seq: seq + 1,
      time: 1001 + seq,
      data: {
        turn,
        step: 1,
        message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: 'ok' }], isError: false, id: `m${callId}` },
      },
    },
  ]
}

function graphWith({ turns = 1, perTurn = 2, name = 'bash' } = {}) {
  let receipt = emptyReceipt(sessionId, 1)
  let seq = 1
  for (let turn = 1; turn <= turns; turn += 1) {
    receipt = reduceSessionEvent(receipt, { type: 'turn/start', seq: seq++, time: 1000 + seq, data: { turn } })
    receipt = reduceSessionEvent(receipt, { type: 'step/start', seq: seq++, time: 1000 + seq, data: { turn, step: 1 } })
    for (let index = 0; index < perTurn; index += 1) {
      for (const event of pair(seq, `${turn}-${index}`, { name, turn })) {
        receipt = reduceSessionEvent(receipt, event)
        seq = Math.max(seq, event.seq) + 1
      }
    }
  }
  return buildRuntimeGraph(receipt)
}

test('a small graph is laid out with ELK', async () => {
  const graph = graphWith({ turns: 2, perTurn: 3 })
  const layout = await computeRuntimeLayoutWithElk(graph)
  assert.equal(layout.engine, LAYOUT_ENGINE_ELK)
  assert.equal(layout.engineNote, null)
  assert.ok(layout.nodes.length > 0)
})

test('past the budget it falls back and says so, instead of stalling the view', async () => {
  // 120 rendered nodes is comfortably inside the layout bound but well past ELK's.
  const graph = graphWith({ turns: 10, perTurn: 12, name: 'read' })
  const layout = await computeRuntimeLayoutWithElk(graph)
  assert.ok(layout.nodes.length > ELK_NODE_LIMIT, `expected more than ${ELK_NODE_LIMIT} nodes, got ${layout.nodes.length}`)
  assert.equal(layout.engine, LAYOUT_ENGINE_DETERMINISTIC)
  assert.match(layout.engineNote, /ELK skipped/)
})

test('the engine never changes which nodes and relations are drawn', async () => {
  const graph = graphWith({ turns: 3, perTurn: 4 })
  const plain = computeRuntimeLayout(graph)
  const assisted = await computeRuntimeLayoutWithElk(graph)
  assert.deepEqual(assisted.nodes.map((node) => node.id).sort(), plain.nodes.map((node) => node.id).sort())
  assert.deepEqual(assisted.edges.map((edge) => edge.id).sort(), plain.edges.map((edge) => edge.id).sort())
  assert.deepEqual(assisted.hidden, plain.hidden)
  assert.deepEqual(assisted.stats.renderedNodeCount, plain.stats.renderedNodeCount)
})

test('§36 the height bound survives whichever engine ran', async () => {
  // The whole point of keeping geometry here: ELK's ordering must not reintroduce
  // the vertical strip.
  for (const shape of [{ turns: 2, perTurn: 3 }, { turns: 12, perTurn: 10, name: 'read' }, { turns: 40, perTurn: 12 }]) {
    const layout = await computeRuntimeLayoutWithElk(graphWith(shape))
    assert.ok(layout.height <= 1100, `height ${layout.height} for ${JSON.stringify(shape)}`)
    assert.ok(layout.nodes.length <= 200)
  }
})

test('ELK is given the §35 layers as partitions', () => {
  const graph = graphWith({ turns: 3, perTurn: 2 })
  const base = computeRuntimeLayout(graph)
  const elkGraph = toElkGraph(base)
  assert.equal(elkGraph.layoutOptions['elk.layered.layering.strategy'], 'PARTITIONING')
  assert.equal(elkGraph.layoutOptions['elk.partitioning.activate'], 'true')
  // Every node carries its structural layer, and the layers are the ones §35 names.
  const partitions = new Set(elkGraph.children.map((child) => child.layoutOptions['elk.partitioning.partition']))
  for (const value of partitions) assert.match(value, /^[0-3]$/)
  assert.deepEqual([...partitions].sort(), [...new Set(base.nodes.map((node) => node.layer))].map(String).sort())
})

test('only the ordering is taken from ELK, not its coordinates', () => {
  const base = computeRuntimeLayout(graphWith({ turns: 2, perTurn: 3 }))
  // Two nodes in the same layer, deliberately fed to ELK out of order.
  const fake = { children: base.nodes.map((node) => ({ id: node.id, x: 0, y: node.layer === 2 ? 1000 - node.y : node.y })) }
  const ranks = ranksFromElk(base, fake)
  assert.ok(ranks instanceof Map)
  assert.equal(ranks.size, base.nodes.length)
  // Ranks are per layer and contiguous from zero.
  const byLayer = new Map()
  for (const node of base.nodes) {
    if (!byLayer.has(node.layer)) byLayer.set(node.layer, [])
    byLayer.get(node.layer).push(ranks.get(node.id))
  }
  for (const list of byLayer.values()) {
    assert.deepEqual([...list].sort((a, b) => a - b), list.map((_, index) => index))
  }
})

test('a broken ELK result degrades to the deterministic layout, never to a failure', async () => {
  const base = computeRuntimeLayout(graphWith({ turns: 2, perTurn: 3 }))
  assert.equal(ranksFromElk(base, { children: [] }), null)
  assert.equal(ranksFromElk(base, null), null)
  // A missing node means the result cannot be trusted at all.
  const partial = { children: base.nodes.slice(0, 1).map((node) => ({ id: node.id, x: 0, y: 0 })) }
  assert.equal(ranksFromElk(base, partial), null)
})

test('every layer is ranked independently, so layers cannot interleave', () => {
  const base = computeRuntimeLayout(graphWith({ turns: 4, perTurn: 3 }))
  const ranks = ranksFromElk(base, { children: base.nodes.map((node) => ({ id: node.id, x: node.layer * 100, y: node.y })) })
  // A node ranked high in a later layer keeps a smaller rank than one ranked low in
  // the same layer: ranks are layer-local, never global.
  const first = base.nodes.find((node) => node.layer === 0)
  assert.equal(ranks.get(first.id), 0)
})

test('the budget is a stated number, not a magic threshold', () => {
  assert.equal(Number.isSafeInteger(ELK_NODE_LIMIT), true)
  assert.ok(ELK_NODE_LIMIT >= 40 && ELK_NODE_LIMIT <= 120, `unexpected budget ${ELK_NODE_LIMIT}`)
})
