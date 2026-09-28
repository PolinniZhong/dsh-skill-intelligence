import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LAYOUT_MODEL_VERSION,
  LAYOUT_NODE_LIMIT,
  MAX_ROWS_PER_COLUMN,
  MAX_TURN_NODES,
  TURN_COLLAPSE_THRESHOLD,
  computeRuntimeLayout,
} from '../src/core/runtime-layout.mjs'
import { buildRuntimeGraph } from '../src/core/runtime-graph.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// Phase 4 layout contract.
//
// Layout is a view concern. Two properties matter more than the geometry:
//
//   1. It never changes the facts. The graph is untouched, no coordinate is stored,
//      and the same graph always lays out identically.
//   2. It never loses anything silently. What the bound leaves out is counted, and
//      a collapsed node keeps the ids of what it stands for.
//
// Thresholds are pinned against the measured distribution: node counts run 61
// median, 915 p90, 1095 max across the real sessions on this machine.

const sessionId = 'session-layout'

function callAndResult(seq, index, { name = 'bash', turn = 1, step = 1 } = {}) {
  const callId = `c${index}`
  return [
    { type: 'tool/call', seq, time: 1000 + seq, data: { turn, step, callId, name, arguments: '{}' } },
    {
      type: 'tool/result',
      seq: seq + 1,
      time: 1001 + seq,
      data: {
        turn,
        step,
        message: {
          role: 'tool',
          source: { kind: 'tool', callId },
          toolCallId: callId,
          content: [{ type: 'text', text: 'ok' }],
          isError: false,
          id: `m${callId}`,
        },
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
      for (const event of callAndResult(seq, `${turn}-${index}`, { name, turn })) {
        receipt = reduceSessionEvent(receipt, event)
        seq = Math.max(seq, event.seq) + 1
      }
    }
  }
  return { graph: buildRuntimeGraph(receipt), receipt }
}

test('a small graph draws every node and groups nothing', () => {
  const { graph } = graphWith({ turns: 2, perTurn: 3 })
  const layout = computeRuntimeLayout(graph)
  assert.equal(layout.modelVersion, LAYOUT_MODEL_VERSION)
  assert.equal(layout.mode, 'expanded')
  assert.equal(layout.nodes.length, graph.nodes.length)
  assert.equal(layout.hidden.nodeCount, 0)
  assert.equal(layout.stats.collapsedNodeCount, 0)
})

test('a busy turn collapses into one node per capability', () => {
  const { graph } = graphWith({ turns: 1, perTurn: TURN_COLLAPSE_THRESHOLD + 6 })
  // Force grouping without inflating the graph: lower the limit for this case.
  const layout = computeRuntimeLayout(graph, { nodeLimit: 10 })
  assert.equal(layout.mode, 'grouped')
  const groups = layout.nodes.filter((node) => node.collapsed)
  assert.ok(groups.length >= 1)
  for (const group of groups) {
    assert.ok(group.memberIds.length >= 2)
    assert.equal(group.memberCount, group.memberIds.length)
  }
  // The members are real graph nodes, so nothing is invented.
  const known = new Set(graph.nodes.map((node) => node.id))
  for (const group of groups) for (const id of group.memberIds) assert.equal(known.has(id), true)
})

test('a long session folds its turn column into ranges', () => {
  const { graph } = graphWith({ turns: MAX_TURN_NODES + 12, perTurn: 1 })
  const layout = computeRuntimeLayout(graph)
  const ranges = layout.nodes.filter((node) => node.collapsed && node.label.startsWith('Turn ') && node.label.includes('–'))
  assert.ok(ranges.length >= 1, 'turn ranges are expected')
  for (const range of ranges) {
    assert.ok(range.memberIds.length >= 2)
    assert.equal(range.layer, 1, 'a turn range belongs in the turn column')
  }
  // The turn column shrank rather than vanished.
  const turnColumn = layout.nodes.filter((node) => node.layer === 1)
  assert.ok(turnColumn.length <= MAX_TURN_NODES)
  assert.ok(turnColumn.length > 0)
})

test('the rendered graph stays inside the bound, and reports what it left out', () => {
  const { graph } = graphWith({ turns: 40, perTurn: 12 })
  const layout = computeRuntimeLayout(graph)
  assert.ok(layout.nodes.length <= LAYOUT_NODE_LIMIT, `rendered ${layout.nodes.length}`)
  assert.equal(layout.stats.renderedNodeCount, layout.nodes.length)
  assert.equal(layout.stats.graphNodeCount, graph.nodes.length)

  // Conservation: every graph node is either drawn itself or stands inside a
  // group, and synthetic groups are additions rather than substitutions.
  const drawnGraphNodeIds = new Set(layout.nodes.filter((node) => node.graphNodeId).map((node) => node.graphNodeId))
  const syntheticCount = layout.nodes.length - drawnGraphNodeIds.size
  const hiddenGraphNodes = graph.nodes.filter((node) => !drawnGraphNodeIds.has(node.id))
  assert.equal(layout.hidden.nodeCount, hiddenGraphNodes.length)
  assert.equal(drawnGraphNodeIds.size + hiddenGraphNodes.length, graph.nodes.length)
  assert.equal(layout.nodes.length, drawnGraphNodeIds.size + syntheticCount)
  // Everything hidden is named, so the inspector can still reach it.
  assert.deepEqual(
    [...layout.hidden.nodeIds].sort(),
    hiddenGraphNodes.map((node) => node.id).sort(),
  )
})

test('a tall layer wraps into sub-columns instead of one endless column', () => {
  const { graph } = graphWith({ turns: 1, perTurn: 40, name: 'read' })
  const layout = computeRuntimeLayout(graph, { nodeLimit: 500, collapseThreshold: 100 })
  const invocationLayer = layout.layers.find((layer) => layer.layer === 2)
  if (invocationLayer && invocationLayer.nodeCount > MAX_ROWS_PER_COLUMN) {
    assert.ok(invocationLayer.rows <= MAX_ROWS_PER_COLUMN)
    assert.ok(invocationLayer.columns >= 2)
    assert.ok(layout.height < invocationLayer.nodeCount * 30, 'wrapping must reduce the height')
  }
})

test('the layout is deterministic and leaves the graph untouched', () => {
  const { graph } = graphWith({ turns: 12, perTurn: 6 })
  const before = JSON.parse(JSON.stringify(graph))
  const first = computeRuntimeLayout(graph)
  const second = computeRuntimeLayout(graph)
  assert.deepEqual(first, second)
  assert.deepEqual(graph, before, 'layout must not mutate the graph')
})

test('the graph carries no coordinates and the layout carries no new facts', () => {
  const { graph } = graphWith({ turns: 3, perTurn: 4 })
  const serializedGraph = JSON.stringify(graph)
  for (const forbidden of ['"x"', '"y"', 'position', 'viewport']) {
    assert.equal(serializedGraph.includes(forbidden), false, `graph leaked layout state: ${forbidden}`)
  }
  // Every laid-out node points back at a graph node or names the nodes it stands for.
  const known = new Set(graph.nodes.map((node) => node.id))
  for (const node of computeRuntimeLayout(graph).nodes) {
    if (node.graphNodeId) assert.equal(known.has(node.graphNodeId), true)
    else assert.ok(node.memberIds.length > 0, `synthetic node ${node.id} names no members`)
  }
})

test('every rendered edge points at a rendered node and carries its evidence', () => {
  const { graph } = graphWith({ turns: 8, perTurn: 10 })
  const layout = computeRuntimeLayout(graph)
  const rendered = new Set(layout.nodes.map((node) => node.id))
  for (const edge of layout.edges) {
    assert.equal(rendered.has(edge.from), true)
    assert.equal(rendered.has(edge.to), true)
    // The canvas reports how many events stand behind an edge rather than listing
    // them; the ids stay on the Host and are fetched per edge by the inspector.
    assert.ok(edge.evidenceCount > 0, `edge ${edge.id} lost its evidence`)
    assert.equal(edge.evidenceIds, undefined)
    assert.equal(typeof edge.x1, 'number')
    assert.equal(typeof edge.x2, 'number')
  }
})

test('the canvas payload omits member ids unless they are asked for', () => {
  const { graph } = graphWith({ turns: 1, perTurn: TURN_COLLAPSE_THRESHOLD + 6 })
  const lean = computeRuntimeLayout(graph, { nodeLimit: 10, includeMemberIds: false })
  const full = computeRuntimeLayout(graph, { nodeLimit: 10 })
  const leanGroup = lean.nodes.find((node) => node.collapsed)
  const fullGroup = full.nodes.find((node) => node.collapsed)
  assert.ok(leanGroup && fullGroup)
  assert.deepEqual(leanGroup.memberIds, [])
  assert.ok(fullGroup.memberIds.length >= 2)
  // The count survives either way, so a folded node is never an unsigned claim.
  assert.equal(leanGroup.memberCount, fullGroup.memberCount)
  // The client is never sent what it does not draw.
  assert.ok(JSON.stringify(lean).length < JSON.stringify(full).length)
})

test('the canvas reports how much it hid without shipping every hidden id', () => {
  const { graph } = graphWith({ turns: 40, perTurn: 12 })
  const lean = computeRuntimeLayout(graph, { includeHiddenIds: false })
  const full = computeRuntimeLayout(graph)
  assert.ok(lean.hidden.nodeCount > 0)
  // The count is identical; only the id list is withheld.
  assert.equal(lean.hidden.nodeCount, full.hidden.nodeCount)
  assert.equal(lean.hidden.edgeCount, full.hidden.edgeCount)
  assert.equal(lean.hidden.collapsedInsideCount, full.hidden.collapsedInsideCount)
  assert.deepEqual(lean.hidden.nodeIds, [])
  assert.equal(full.hidden.nodeIds.length, full.hidden.nodeCount)
  assert.ok(JSON.stringify(lean).length < JSON.stringify(full).length)
})

test('an edge whose ends collapse together is counted, not silently dropped', () => {
  const { graph } = graphWith({ turns: 1, perTurn: TURN_COLLAPSE_THRESHOLD + 4 })
  const layout = computeRuntimeLayout(graph, { nodeLimit: 8, collapseThreshold: 2 })
  assert.ok(layout.hidden.collapsedInsideCount > 0, 'expected at least one intra-group edge')
  // Those edges exist in the graph; the layout just cannot draw them.
  assert.ok(layout.hidden.edgeCount >= 0)
  assert.equal(
    layout.stats.renderedEdgeCount + layout.hidden.edgeCount + layout.hidden.collapsedInsideCount,
    graph.edges.length,
  )
})

test('layout cost stays sane on a session the size of the real maximum', () => {
  // The measured maximum is 1095 nodes; 60 turns x 18 calls is past that.
  const { graph } = graphWith({ turns: 60, perTurn: 18 })
  assert.ok(graph.nodes.length > 900, `graph only reached ${graph.nodes.length} nodes`)
  const started = process.hrtime.bigint()
  const layout = computeRuntimeLayout(graph)
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(layout.nodes.length <= LAYOUT_NODE_LIMIT)
  assert.ok(elapsed < 500, `layout took ${elapsed.toFixed(1)}ms`)
})
