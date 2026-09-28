/**
 * Deterministic layout for the runtime graph.
 *
 * Layout is a view concern. It reads the graph and returns positions, sizes, and
 * edge endpoints — it never mutates the graph, never adds a fact, and never stores
 * a coordinate anywhere. The same graph always lays out identically, so a redraw
 * can never look like new evidence.
 *
 * Measured on 56 real sessions on this machine:
 *
 *   nodes   median 61 | p90 915 | max 1095
 *   edges   median 85 | p90 966 | max 1287
 *
 * A flat canvas covers the median and fails the tail, so grouping is not an
 * optimisation bolted on later — it is part of the model:
 *
 *   · a turn with many invocations collapses into one node per capability
 *   · a layer taller than `MAX_ROWS` wraps into sub-columns
 *   · the rendered set is hard-bounded, and everything left out is counted
 *
 * @module runtime-layout
 */

export const LAYOUT_MODEL_VERSION = 1

/**
 * Hard bound on rendered nodes. Past this the graph keeps collapsing.
 *
 * Set at 200 rather than 150 because a long session's turn and child columns are
 * informative on their own: collapsing those to fit a smaller bound would trade a
 * readable structure for a smaller number.
 */
export const LAYOUT_NODE_LIMIT = 200

/** A turn with more invocations than this collapses per capability. */
export const TURN_COLLAPSE_THRESHOLD = 12

/** A layer taller than this wraps into sub-columns. */
export const MAX_ROWS_PER_COLUMN = 26

/** A session with more turns than this folds them into ranges. */
export const MAX_TURN_NODES = 36

/**
 * The canvas ships geometry, and the Host keeps the evidence.
 *
 * A drawn edge therefore reports *how many* events stand behind it rather than
 * listing them, and a collapsed node reports how many nodes it stands for rather
 * than naming them. Both are still reachable: `/skill-trace/inspect` re-derives the
 * answer on demand, one node or one edge at a time. Sending the ids with the canvas
 * instead cost roughly 250 KB on a large session for data the client never read.
 */
export const LAYOUT_MEMBER_LIMIT = 24

const PADDING = 28
const COLUMN_GAP = 70
const ROW_GAP = 8
const ROW_HEIGHT = 30

const KIND_SIZES = {
  session: { width: 210, height: 34 },
  turn: { width: 176, height: 30 },
  invocation: { width: 300, height: 30 },
  group: { width: 300, height: 30 },
  child: { width: 240, height: 30 },
}

function kindOf(node) {
  if (node.type === 'session') return 'session'
  if (node.type === 'turn') return 'turn'
  if (node.role === 'child-session') return 'child'
  if (node.role === 'invocation') return 'invocation'
  return 'invocation'
}

function layerOf(kind) {
  if (kind === 'session') return 0
  if (kind === 'turn') return 1
  if (kind === 'invocation' || kind === 'group') return 2
  return 3
}

function labelOf(node) {
  if (node.type === 'session') return '会话'
  if (node.type === 'turn') return `Turn ${node.turn}`
  if (node.role === 'child-session') return String(node.title ?? '')
  return String(node.title ?? '')
}

function sublabelOf(node) {
  if (node.type === 'session') return String(node.title ?? '')
  if (node.type === 'turn') return null
  if (node.role === 'child-session') return node.subtitle ?? null
  return node.outcome ? `${node.capabilityId ?? ''} · ${node.outcome}` : (node.capabilityId ?? null)
}

/**
 * Collapse a turn's invocation nodes into one node per capability when the turn is
 * busy enough that drawing every call would stop being readable.
 */
function collapseTurn(turn, invocationNodes) {
  const byCapability = new Map()
  for (const node of invocationNodes) {
    const key = node.capabilityId ?? 'unknown'
    if (!byCapability.has(key)) byCapability.set(key, [])
    byCapability.get(key).push(node)
  }
  return [...byCapability.entries()].map(([capabilityId, members]) => ({
    id: `group:${turn}:${capabilityId}`,
    kind: 'group',
    layer: 2,
    capabilityId,
    label: `${capabilityId} × ${members.length}`,
    sublabel: `Turn ${turn} 内合并`,
    status: members.some((node) => node.status === 'partial') ? 'partial' : 'observed',
    collapsed: true,
    memberIds: members.map((node) => node.id),
    memberCount: members.length,
  }))
}

/**
 * Lay the graph out for a canvas.
 *
 * @param graph - the graph from `buildRuntimeGraph`.
 * @param options - `nodeLimit` and `collapseThreshold` overrides.
 * @returns a laid-out view. `hidden` counts everything the bound left out.
 */
export function computeRuntimeLayout(graph, options = {}) {
  const nodeLimit = Number.isSafeInteger(options.nodeLimit) ? options.nodeLimit : LAYOUT_NODE_LIMIT
  const includeMemberIds = options.includeMemberIds !== false
  // Naming every folded node costs tens of kilobytes on a large session and the
  // canvas never reads them; the count is always reported.
  const includeHiddenIds = options.includeHiddenIds !== false
  const collapseThreshold = Number.isSafeInteger(options.collapseThreshold) ? options.collapseThreshold : TURN_COLLAPSE_THRESHOLD
  const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const graphEdges = Array.isArray(graph?.edges) ? graph.edges : []

  const sessionNode = graphNodes.find((node) => node.type === 'session')
  const turnNodes = graphNodes.filter((node) => node.type === 'turn').sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0))
  const invocationNodes = graphNodes.filter((node) => node.role === 'invocation')
  const childNodes = graphNodes.filter((node) => node.role === 'child-session')

  const invocationsByTurn = new Map()
  for (const node of invocationNodes) {
    const key = node.turn ?? 'none'
    if (!invocationsByTurn.has(key)) invocationsByTurn.set(key, [])
    invocationsByTurn.get(key).push(node)
  }

  // -- decide what is drawn --------------------------------------------------
  // `ownerOf` maps a node that is not drawn to the group node standing in for it,
  // so an edge touching a collapsed node still points at something real instead of
  // silently disappearing.
  const ownerOf = new Map()
  // Grouping is decided by the size of the whole graph, not by one busy turn: a
  // 60-node session draws in full, because every node there is worth reading.
  const grouped = graphNodes.length > nodeLimit * 0.6
  const view = new Map()
  if (sessionNode) view.set(sessionNode.id, { kind: 'session', source: sessionNode })

  for (const node of childNodes) view.set(node.id, { kind: 'child', source: node })

  for (const turn of turnNodes) {
    view.set(turn.id, { kind: 'turn', source: turn })
    const members = invocationsByTurn.get(turn.turn ?? 'none') ?? []
    if (grouped && members.length > collapseThreshold) {
      for (const group of collapseTurn(turn.turn, members)) {
        view.set(group.id, { kind: 'group', synthetic: group })
        for (const memberId of group.memberIds) ownerOf.set(memberId, group.id)
      }
      continue
    }
    for (const member of members) view.set(member.id, { kind: 'invocation', source: member })
  }
  // Invocations with no turn are still shown: dropping them would hide evidence.
  const unturned = invocationsByTurn.get('none') ?? []
  for (const node of unturned) if (!view.has(node.id)) view.set(node.id, { kind: 'invocation', source: node })

  // -- fold a long session's turn column into ranges -------------------------
  // A long session has one `turn` node per turn, and those alone can exceed the
  // bound — collapsing invocations cannot help. Ranges are the next axis down.
  const overflowNodes = []
  if (turnNodes.length > MAX_TURN_NODES) {
    const rangeSize = Math.ceil(turnNodes.length / MAX_TURN_NODES)
    for (let index = 0; index < turnNodes.length; index += rangeSize) {
      const slice = turnNodes.slice(index, index + rangeSize)
      const first = slice[0].turn ?? index
      const last = slice[slice.length - 1].turn ?? index
      const id = `turnrange:${first}-${last}`
      view.set(id, {
        kind: 'group',
        synthetic: {
          id,
          kind: 'group',
          // Turn ranges stand in for turn nodes, so they belong in the turn column.
          layer: 1,
          capabilityId: 'turn-range',
          label: `Turn ${first}–${last}`,
          sublabel: `${slice.length} 个 Turn 合并`,
          status: 'observed',
          collapsed: true,
          memberIds: slice.map((node) => node.id),
          memberCount: slice.length,
        },
      })
      for (const node of slice) {
        view.delete(node.id)
        ownerOf.set(node.id, id)
      }
      overflowNodes.push(id)
    }
  }

  // -- enforce the hard bound ------------------------------------------------
  // Each pass must strictly reduce the node count, or the loop would spin: a turn
  // that has already been merged is never chosen again, and a merge only runs when
  // it removes at least two nodes and adds one.
  const mergedTurns = new Set()
  // Only the invocation column is subject to the bound loop; turn ranges stand in
  // for the turn column and folding them further would erase the structure.
  const visibleForBound = () => [...view.entries()].filter(([, entry]) => (
    entry.kind === 'invocation' || (entry.kind === 'group' && entry.synthetic?.layer !== 1)
  ))
  const turnOf = (entry) => {
    if (entry.synthetic?.layer === 1) return entry.synthetic.id
    if (entry.kind === 'invocation') return entry.source?.turn ?? 'none'
    return entry.synthetic?.turn ?? 'none'
  }
  const mergeInto = (turn, victims, label) => {
    for (const [id] of victims) view.delete(id)
    const overflowId = `overflow:${turn}`
    view.set(overflowId, {
      kind: 'group',
      synthetic: {
        id: overflowId,
        kind: 'group',
        layer: 2,
        capabilityId: 'mixed',
        turn,
        label,
        sublabel: turn === 'none' ? '未归属调用合并' : `Turn ${turn} 内合并`,
        status: 'partial',
        collapsed: true,
        memberIds: victims.map(([id]) => id),
        memberCount: victims.length,
      },
    })
    overflowNodes.push(overflowId)
  }

  let guard = 0
  while (view.size > nodeLimit && guard < 200) {
    guard += 1
    const byTurn = new Map()
    for (const [id, entry] of visibleForBound()) {
      const turn = turnOf(entry)
      if (mergedTurns.has(turn)) continue
      if (!byTurn.has(turn)) byTurn.set(turn, [])
      byTurn.get(turn).push([id, entry])
    }
    // Prefer the busiest turn; never pick one that cannot shrink the view.
    const reducible = [...byTurn.entries()]
      .filter(([, victims]) => victims.length >= 2)
      .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])))
    if (!reducible.length) break
    const [turn, victims] = reducible[0]
    mergedTurns.add(turn)
    mergeInto(turn, victims, `其余 ${victims.length} 项`)
  }
  // Everything a single turn-level merge could not fit: fold the rest into one node.
  if (view.size > nodeLimit) {
    const rest = visibleForBound().filter(([, entry]) => !mergedTurns.has(turnOf(entry)))
    if (rest.length >= 2) mergeInto('rest', rest, `其余 ${rest.length} 项（全部 Turn）`)
  }

  // -- place ----------------------------------------------------------------
  const layers = new Map()
  for (const [id, entry] of view) {
    const kind = entry.kind
    const layer = Number.isSafeInteger(entry.synthetic?.layer) ? entry.synthetic.layer : layerOf(kind)
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer).push({ id, entry, kind })
  }

  const defaultOrder = (item) => {
    const source = item.entry.source ?? item.entry.synthetic
    if (item.kind === 'turn') return [source.turn ?? 0]
    if (item.kind === 'invocation') return [source.turn ?? 1e6, source.step ?? 0, source.invocationId ?? '']
    if (item.kind === 'group') return [source.id]
    return [0]
  }
  // Ordering within a layer is a layout decision, not a fact about the run. An
  // engine may supply its own (ELK minimizes edge crossings); when it does, the
  // layers themselves are still the structural ones from §35.
  const order = typeof options.orderOf === 'function'
    ? (item) => options.orderOf(item.id) ?? defaultOrder(item)
    : defaultOrder
  for (const items of layers.values()) {
    items.sort((a, b) => {
      const left = order(a)
      const right = order(b)
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const l = left[index] ?? 0
        const r = right[index] ?? 0
        if (l < r) return -1
        if (l > r) return 1
      }
      return String(a.id).localeCompare(String(b.id))
    })
  }

  const placed = []
  const position = new Map()
  let columnX = PADDING
  const layerWidths = []
  const sortedLayerIds = [...layers.keys()].sort((a, b) => a - b)

  const bandOf = new Map()
  for (const layer of sortedLayerIds) {
    const items = layers.get(layer)
    const rows = Math.min(items.length, MAX_ROWS_PER_COLUMN) || 1
    const columns = Math.ceil(items.length / rows) || 1
    const widest = Math.max(...items.map((item) => KIND_SIZES[item.kind].width), 0)
    const bandWidth = columns * widest + (columns - 1) * 18
    layerWidths.push(bandWidth)
    bandOf.set(layer, { items, rows, columns, widest, x: columnX })

    items.forEach((item, index) => {
      const column = Math.floor(index / rows)
      const row = index % rows
      const size = KIND_SIZES[item.kind]
      const source = item.entry.source ?? item.entry.synthetic
      const x = columnX + column * (widest + 18)
      const y = PADDING + row * (ROW_HEIGHT + ROW_GAP)
      const node = {
        id: item.id,
        kind: item.kind,
        label: item.kind === 'group' ? source.label : labelOf(source),
        sublabel: item.kind === 'group' ? source.sublabel : sublabelOf(source),
        capabilityId: source.capabilityId ?? null,
        status: source.status ?? 'unknown',
        outcome: source.outcome ?? null,
        collapsed: item.entry.synthetic?.collapsed === true,
        memberIds: includeMemberIds ? (item.entry.synthetic?.memberIds ?? []).slice(0, LAYOUT_MEMBER_LIMIT) : [],
        memberCount: item.entry.synthetic?.memberCount ?? 0,
        graphNodeId: item.entry.source?.id ?? null,
        layer,
        x,
        y,
        width: size.width,
        height: size.height,
      }
      placed.push(node)
      position.set(item.id, node)
    })
    columnX += bandWidth + COLUMN_GAP
  }

  // -- route -----------------------------------------------------------------
  // An edge whose endpoint is collapsed points at its group instead. An edge whose
  // both endpoints resolve to the same node is not drawn, but is counted so a
  // hidden relationship is never a silent one.
  const resolve = (nodeId) => ownerOf.get(nodeId) ?? nodeId

  const routed = []
  const seen = new Map()
  const evidenceOf = new Map()
  let hiddenInside = 0
  for (const edge of graphEdges) {
    const from = position.has(edge.from) ? edge.from : resolve(edge.from)
    const to = position.has(edge.to) ? edge.to : resolve(edge.to)
    if (!position.has(from) || !position.has(to)) continue
    if (from === to) {
      hiddenInside += 1
      continue
    }
    const key = `${edge.type}|${from}|${to}`
    const existing = seen.get(key)
    if (existing) {
      // Keep the strongest claim and merge the evidence rather than drawing twice.
      if (existing.status !== 'observed' && edge.status === 'observed') {
        existing.status = edge.status
        existing.derivation = edge.derivation
        existing.rule = edge.rule ?? null
      }
      for (const id of edge.evidenceIds) evidenceOf.get(key).add(id)
      existing.evidenceCount = evidenceOf.get(key).size
      existing.edgeCount += 1
      continue
    }
    const start = position.get(from)
    const end = position.get(to)
    const record = {
      id: edge.id,
      edgeCount: 1,
      from,
      to,
      type: edge.type,
      status: edge.status,
      derivation: edge.derivation,
      rule: edge.rule ?? null,
      evidenceCount: edge.evidenceIds.length,
      collapsed: ownerOf.has(edge.from) || ownerOf.has(edge.to),
      x1: start.x + start.width,
      y1: start.y + start.height / 2,
      x2: end.x,
      y2: end.y + end.height / 2,
    }
    seen.set(key, record)
    evidenceOf.set(key, new Set(edge.evidenceIds))
    routed.push(record)
  }

  const hiddenNodeIds = graphNodes.map((node) => node.id).filter((id) => !view.has(id))
  const hiddenEdgeCount = graphEdges.length - routed.length - hiddenInside

  return {
    modelVersion: LAYOUT_MODEL_VERSION,
    mode: grouped ? 'grouped' : 'expanded',
    width: columnX - COLUMN_GAP + PADDING,
    height: Math.max(...placed.map((node) => node.y + node.height), 0) + PADDING,
    nodes: placed,
    edges: routed,
    layers: sortedLayerIds.map((layer) => ({
      layer,
      bandX: bandOf.get(layer).x,
      bandWidth: layerWidths[sortedLayerIds.indexOf(layer)],
      nodeCount: layers.get(layer).length,
      rows: bandOf.get(layer).rows,
      columns: bandOf.get(layer).columns,
    })),
    hidden: {
      nodeIds: includeHiddenIds ? hiddenNodeIds : [],
      nodeCount: hiddenNodeIds.length,
      edgeCount: hiddenEdgeCount,
      // Edges whose both ends collapsed into the same node: real, but unrenderable.
      collapsedInsideCount: hiddenInside,
    },
    stats: {
      graphNodeCount: graphNodes.length,
      graphEdgeCount: graphEdges.length,
      renderedNodeCount: placed.length,
      renderedEdgeCount: routed.length,
      collapsedNodeCount: placed.filter((node) => node.collapsed).length,
      candidateEdgeCount: routed.filter((edge) => edge.status === 'candidate').length,
      overflowNodeIds: overflowNodes,
    },
  }
}
