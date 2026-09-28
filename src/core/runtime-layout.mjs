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

/** §36: past these sizes the canvas enters aggregation mode rather than drawing
 * every node in full. They are the governance's numbers, not a reading of what
 * happens to fit. */
export const AGGREGATE_NODE_THRESHOLD = 30
export const AGGREGATE_EDGE_THRESHOLD = 50

/** A layer taller than this wraps into sub-columns. */
export const MAX_ROWS_PER_COLUMN = 7

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
const ROW_GAP = 10
// 对齐 preview.html：节点统一 190 宽；运行流程为 115 高，运行图谱使用 88 高紧凑卡片。
const KIND_NAMES = ['session', 'turn', 'invocation', 'group', 'child', 'capability', 'result', 'error']

function kindOf(node) {
  if (node.type === 'session') return 'session'
  if (node.type === 'turn') return 'turn'
  if (node.role === 'child-session') return 'child'
  if (node.role === 'invocation') return 'invocation'
  return 'invocation'
}

/**
 * §35's five layers. A layer is a reading level, never a causal claim: the vertical
 * position says "this sits at the capability level of this run", not "this caused that".
 *
 *   0 Task / Session      1 Turn / Agent       2 Capability
 *   3 Tool / MCP / CLI    4 Result / Error
 */
function layerOf(kind) {
  if (kind === 'session') return 0
  // A delegated child session is an Agent, and §35 puts Agent with Turn.
  if (kind === 'turn' || kind === 'child') return 1
  if (kind === 'capability') return 2
  if (kind === 'result' || kind === 'error') return 4
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
  const compact = options.compact === true
  const rowHeight = compact ? 88 : 115
  const kindSizes = Object.fromEntries(KIND_NAMES.map((kind) => [kind, { width: 190, height: rowHeight }]))

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
  // §36: aggregation begins at a stated size — Node > 30 or Edge > 50 — rather than at
  // whatever fraction of the hard bound the graph happens to reach.
  const grouped = graphNodes.length > AGGREGATE_NODE_THRESHOLD || graphEdges.length > AGGREGATE_EDGE_THRESHOLD
  const view = new Map()
  if (sessionNode) view.set(sessionNode.id, { kind: 'session', source: sessionNode })

  for (const node of childNodes) view.set(node.id, { kind: 'child', source: node })

  for (const turn of turnNodes) {
    view.set(turn.id, { kind: 'turn', source: turn })
    const members = invocationsByTurn.get(turn.turn ?? 'none') ?? []
    // §20.1 folds repetitive calls inside one turn — `grep × 8`, `web_search × 11` —
    // and that is about the turn, not about the size of the whole graph. §36's global
    // thresholds decide the other kind of aggregation, so the two triggers stay
    // separate: a single busy turn folds even in a small run.
    if (members.length > collapseThreshold) {
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
  const turnNodeLimit = Number.isSafeInteger(options.turnNodeLimit) ? options.turnNodeLimit : MAX_TURN_NODES
  if (turnNodes.length > turnNodeLimit) {
    const rangeSize = Math.ceil(turnNodes.length / turnNodeLimit)
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
  /**
   * 一个受害者可能本身就是分组。此时必须记录**它内部的调用 id**，而不是分组的 id——
   * 分组随后就被删掉了，记它的 id 等于把成员链断在这里。
   *
   * 实测一个 39 Turns 的会话：修复前 14 个 overflow 分组里有 **24 个成员引用指向已删分组**
   * （断链），修复后为 0。溢出分组是靠 memberIds 说明"我代表了哪些调用"的，断链会让
   * Inspector 报出无法解释的成员。
   *
   * **注意：这不是"运行流程里看不到 Skill"的原因。** 修好之后 Skill 仍然不可达——它在
   * 到达这个循环之前就已经不在 view 里了，具体位置尚未查明（见 CHANGELOG beta.42）。
   */
  const expandMembers = (id, entry) => {
    const nested = entry?.synthetic?.memberIds
    return Array.isArray(nested) && nested.length ? nested : [id]
  }
  const mergeInto = (turn, victims, label) => {
    for (const [id] of victims) view.delete(id)
    const mergedMemberIds = victims.flatMap(([id, entry]) => expandMembers(id, entry))
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
        memberIds: mergedMemberIds,
        memberCount: mergedMemberIds.length,
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

  // -- capability and outcome levels (§8/§35) --------------------------------
  // Layer 2 groups the calls a Turn made of one capability; layer 4 holds what those
  // calls produced. A capability node is drawn only where it actually groups something:
  // a lone call needs no parent standing between it and its Turn.
  //
  // Everything here is derived from fields the Runtime events already carry — `turn`,
  // `capabilityId`, `invocationId`, and the result event's `status`. No edge below is an
  // inference (§32); each one is containment the evidence itself states.
  const projectedEdges = []
  const turnIdOf = new Map()
  for (const turn of turnNodes) turnIdOf.set(turn.turn ?? 'none', turn.id)

  const byCapability = new Map()
  for (const [id, entry] of view) {
    if (entry.kind !== 'invocation') continue
    const source = entry.source
    const key = `${source.turn ?? 'none'}|${source.capabilityId ?? 'unknown'}`
    if (!byCapability.has(key)) {
      byCapability.set(key, { turn: source.turn ?? 'none', capabilityId: source.capabilityId ?? 'unknown', members: [] })
    }
    byCapability.get(key).members.push({ id, source })
  }

  const evidenceOfNode = (source) => source?.evidenceEventIds ?? []
  const makeEdge = (from, to, evidenceIds, derivation) => ({
    id: `${from}->${to}:${derivation}`,
    from, to, type: 'contains', status: 'observed',
    derivation, rule: null, evidenceIds,
  })
  const makeNode = (id, layer, capabilityId, label, sublabel, status, outcome, memberIds = [], memberCount = 0) => ({
    id, kind: layer === 2 ? 'capability' : (outcome === 'failure' ? 'error' : 'result'),
    synthetic: {
      id, layer, capabilityId, label, sublabel, status,
      outcome: outcome ?? null, collapsed: false, memberIds, memberCount,
    },
  })

  // The projection shares the hard bound with the drawn graph rather than sitting on
  // top of it: §35's levels are never a reason to exceed the budget, and when the
  // budget is gone the levels a reader does not get are counted, not silently dropped.
  let projectionBudget = Math.max(0, nodeLimit - view.size)
  let skippedLevels = 0

  // Capability nodes first: they carry the structure a reader needs most.
  const groups = [...byCapability.values()]
    .filter((group) => group.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length || String(a.turn).localeCompare(String(b.turn)))
  const withCapability = []
  for (const group of groups) {
    if (projectionBudget <= 0) { skippedLevels += 1; continue }
    const capId = `capability:${group.turn}:${group.capabilityId}`
    const failures = group.members.filter((member) => member.source.outcome === 'failure')
    const status = failures.length ? 'failure'
      : group.members.some((member) => member.source.status === 'partial') ? 'partial' : 'observed'
    view.set(capId, makeNode(capId, 2, group.capabilityId, group.capabilityId,
      `Turn ${group.turn} · ${group.members.length} 次调用`, status, failures.length ? 'failure' : 'success',
      group.members.map((member) => member.id), group.members.length))
    projectionBudget -= 1
    const turnId = turnIdOf.get(group.turn)
    const turnEvidence = group.members.flatMap((member) => evidenceOfNode(member.source))
    if (turnId) projectedEdges.push(makeEdge(turnId, capId, turnEvidence, 'layout:capability-of-turn'))
    for (const member of group.members) {
      projectedEdges.push(makeEdge(capId, member.id, evidenceOfNode(member.source), 'layout:capability-of-turn'))
    }
    withCapability.push({ group, capId, failures })
  }

  // Then outcomes. A failure always gets its own node — it is the thing a reader is
  // looking for — while a clean group gets one Result node standing for its calls.
  //
  // The budget is stated rather than silent: past it the outcome level is skipped, and
  // the count of what was skipped is reported with the layout.
  let skippedOutcomes = 0
  for (const { group, capId, failures } of withCapability) {
    for (const member of failures) {
      if (projectionBudget <= 0) { skippedOutcomes += 1; continue }
      const errorId = `error:${member.source.invocationId ?? member.id}`
      view.set(errorId, makeNode(errorId, 4, group.capabilityId, '失败',
        `Turn ${group.turn} · ${group.capabilityId}`.trim(), 'failure', 'failure', [member.id], 1))
      projectedEdges.push(makeEdge(capId, errorId, evidenceOfNode(member.source), 'layout:outcome-of-call'))
      projectionBudget -= 1
    }
    if (failures.length === group.members.length) continue
    if (projectionBudget <= 0) { skippedOutcomes += 1; continue }
    const resultId = `result:${group.turn}:${group.capabilityId}`
    const okCount = group.members.length - failures.length
    const okMembers = group.members.filter((member) => member.source.outcome !== 'failure')
    view.set(resultId, makeNode(resultId, 4, group.capabilityId, '结果',
      `${okCount} 次成功`, 'observed', 'success', okMembers.map((member) => member.id), okCount))
    projectedEdges.push(makeEdge(capId, resultId,
      okMembers.flatMap((member) => evidenceOfNode(member.source)), 'layout:outcome-of-call'))
    projectionBudget -= 1
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
    // Turn 区间必须按**起始 Turn 号**排，而不是按 id 字符串——否则 "turnrange:12-14"
    // 会排在 "turnrange:5-8" 前面，读者看到的是乱序的 1-4, 12-14, … , 5-8, 9-11。
    if (item.kind === 'group') {
      const range = /^turnrange:(\d+)-(\d+)$/.exec(String(source.id))
      if (range) return [0, Number(range[1]), Number(range[2])]
      return [1, source.id]
    }
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
    const rows = Math.min(items.length, Number.isSafeInteger(options.maxRowsPerColumn) ? options.maxRowsPerColumn : MAX_ROWS_PER_COLUMN) || 1
    const columns = Math.ceil(items.length / rows) || 1
    const widest = Math.max(...items.map((item) => kindSizes[item.kind].width), 0)
    const bandWidth = columns * widest + (columns - 1) * 18
    layerWidths.push(bandWidth)
    bandOf.set(layer, { items, rows, columns, widest, x: columnX })

    items.forEach((item, index) => {
      const column = Math.floor(index / rows)
      const row = index % rows
      const size = kindSizes[item.kind]
      const source = item.entry.source ?? item.entry.synthetic
      const x = columnX + column * (widest + 18)
      const y = PADDING + row * (rowHeight + ROW_GAP)
      const node = {
        id: item.id,
        kind: item.kind,
        label: item.entry.synthetic ? (source.label ?? labelOf(source)) : labelOf(source),
        sublabel: item.entry.synthetic ? source.sublabel ?? null : sublabelOf(source),
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
  for (const edge of [...graphEdges, ...projectedEdges]) {
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
    // `mode` describes what the layout did, not which trigger fired: a single busy turn
    // folds even when the whole graph is small, and calling that 'expanded' would
    // misdescribe the result.
    mode: placed.some((node) => node.collapsed) ? 'grouped' : 'expanded',
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
      // §35 levels that were projected, and how many outcome nodes the budget skipped.
      capabilityNodeCount: placed.filter((node) => node.kind === 'capability').length,
      resultNodeCount: placed.filter((node) => node.kind === 'result').length,
      errorNodeCount: placed.filter((node) => node.kind === 'error').length,
      skippedOutcomeCount: skippedOutcomes,
      skippedLevelCount: skippedLevels,
    },
  }
}
