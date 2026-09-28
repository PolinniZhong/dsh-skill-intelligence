/**
 * ELK-assisted ordering for the runtime layout.
 *
 * §12/§34 ask ELK to own "节点位置、层级、最小交叉、分支间距". Two of those four are
 * already fixed by §35, which defines the layers **semantically** (session → turn →
 * capability → call → child) and says outright that a layer is a visual concept and
 * not a causal claim. So ELK is given the layers as partitions and owns what it is
 * genuinely better at: **minimizing edge crossings within them**.
 *
 * Height stays with this plugin. ELK's own coordinates were measured on a real
 * 1095-node session's aggregated view and produced a 4804 × 4937 canvas — a vertical
 * strip, which is the "line wall" §20/§36 exist to prevent. The placer's wrapping
 * keeps the same view at 3164 × 1036, so ELK supplies the order and the placer
 * supplies the geometry.
 *
 * ELK is also **expensive at scale**, measured across 45 real sessions:
 *
 *   rendered nodes   0–20   20–40   40–60   60–80   80–120   120–200
 *   median          7 ms   13 ms   22 ms   41 ms   164 ms    556 ms
 *
 * Shipping that on every canvas open would be indefensible, so ELK runs only while
 * it is cheap and the deterministic placer takes over past `ELK_NODE_LIMIT`. The
 * chosen engine is reported on the layout, so the substitution is never silent.
 *
 * @module runtime-layout-elk
 */

import ELK from 'elkjs/lib/elk.bundled.js'
import { computeRuntimeLayout } from './runtime-layout.mjs'

export const LAYOUT_ENGINE_ELK = 'elk'
export const LAYOUT_ENGINE_DETERMINISTIC = 'deterministic'

/**
 * Above this many rendered nodes ELK's cost outgrows its benefit.
 *
 * Measured: ≤80 nodes stays under ~71 ms, while 120–200 nodes reaches 1062 ms.
 */
export const ELK_NODE_LIMIT = 80

let sharedEngine
function elkEngine() {
  if (!sharedEngine) sharedEngine = new ELK()
  return sharedEngine
}

/** Build the ELK graph, pinning each node to its §35 layer as a partition. */
export function toElkGraph(layout) {
  return {
    id: 'runtime-flow',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.layering.strategy': 'PARTITIONING',
      'elk.partitioning.activate': 'true',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.spacing.nodeNode': '12',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: layout.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: { 'elk.partitioning.partition': String(node.layer) },
    })),
    edges: layout.edges.map((edge, index) => ({ id: `e${index}`, sources: [edge.from], targets: [edge.to] })),
  }
}

/**
 * Ask ELK for an ordering and reduce it to a rank per node.
 *
 * Only the ordering is kept: within each structural layer, nodes are ranked by
 * ELK's vertical position, which is the axis crossing minimization acts on here.
 *
 * @returns a `Map` of node id to rank, or `null` when ELK produced nothing usable.
 */
export function ranksFromElk(layout, elkResult) {
  const placed = new Map((elkResult?.children ?? []).map((child) => [child.id, child]))
  if (placed.size === 0) return null
  const byLayer = new Map()
  for (const node of layout.nodes) {
    const position = placed.get(node.id)
    if (!position) return null
    if (!byLayer.has(node.layer)) byLayer.set(node.layer, [])
    byLayer.get(node.layer).push({ id: node.id, y: position.y ?? 0, x: position.x ?? 0 })
  }
  const ranks = new Map()
  for (const entries of byLayer.values()) {
    entries.sort((a, b) => (a.y - b.y) || (a.x - b.x) || String(a.id).localeCompare(String(b.id)))
    entries.forEach((entry, index) => ranks.set(entry.id, index))
  }
  return ranks
}

/**
 * Lay the graph out, using ELK for ordering when it is affordable.
 *
 * @returns the same shape as `computeRuntimeLayout`, plus `engine` and `engineNote`.
 */
export async function computeRuntimeLayoutWithElk(graph, options = {}) {
  const base = computeRuntimeLayout(graph, options)

  const tooLarge = base.nodes.length > ELK_NODE_LIMIT
  if (tooLarge) {
    return {
      ...base,
      engine: LAYOUT_ENGINE_DETERMINISTIC,
      engineNote: `ELK skipped: ${base.nodes.length} rendered nodes exceeds the ${ELK_NODE_LIMIT}-node budget`,
    }
  }

  try {
    const result = await elkEngine().layout(toElkGraph(base))
    const ranks = ranksFromElk(base, result)
    if (!ranks) {
      return { ...base, engine: LAYOUT_ENGINE_DETERMINISTIC, engineNote: 'ELK returned no usable ordering' }
    }
    const placed = computeRuntimeLayout(graph, { ...options, orderOf: (id) => ranks.get(id) })
    return { ...placed, engine: LAYOUT_ENGINE_ELK, engineNote: null }
  } catch (error) {
    // A layout engine is not allowed to take the view down with it.
    return {
      ...base,
      engine: LAYOUT_ENGINE_DETERMINISTIC,
      engineNote: `ELK failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
