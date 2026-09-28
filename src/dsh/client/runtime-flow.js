// Runtime Flow canvas (§6–§13).
//
// Read-only runtime replay, not a workflow editor. React Flow supplies pan, zoom,
// fit and selection; this module supplies the governed node and edge language and
// nothing else. It never reads events and never derives a relationship — every
// node and every line arrives already decided by the Host's runtime graph, and the
// only thing a click does is ask the Host why that line exists (§32).
//
// React Flow's stylesheet is inlined as text by the build (`loader: { '.css': 'text' }`),
// because the client ships as a bundle and cannot fetch a second file for it.

const React = require('react')
const {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} = require('@xyflow/react')
const flowStylesheet = require('@xyflow/react/dist/style.css')

/** §8 类型配色：只用于节点左侧类型线与小图标，不做大面积底色。 */
const CAPABILITY_COLORS = {
  session: '#0f172a',
  turn: '#334155',
  skill: '#7057df',
  tool: '#258b63',
  mcp: '#d67b2d',
  cli: '#5b6573',
  subagent: '#c2410c',
  mixed: '#64748b',
  'turn-range': '#334155',
  // §35 layer 4: an outcome is not a capability, so it gets its own two colours.
  result: '#0f766e',
  error: '#c9444f',
  unknown: '#94a3b8',
}

/** §9 状态：图标 + 文字 + 颜色三者同时出现，禁止只靠颜色。 */
const STATUS_GLYPHS = {
  observed: '●',
  partial: '◐',
  candidate: '◌',
  unknown: '○',
  unlinked: '◍',
  insufficient: '○',
  failed: '✕',
  success: '●',
}

const STATUS_COLORS = {
  observed: '#047857',
  success: '#047857',
  partial: '#b45309',
  candidate: '#b45309',
  insufficient: '#64748b',
  unknown: '#94a3b8',
  unlinked: '#b91c1c',
  failed: '#b91c1c',
}

/** §10 线型：实线=较强直接证据，虚线=候选或证据不足。 */
const EDGE_STYLE = {
  contains: { stroke: '#cbd5e1', width: 1.2, dashed: false },
  spawns: { stroke: '#c2410c', width: 1.5, dashed: false },
  retries: { stroke: '#b91c1c', width: 1.5, dashed: false },
  follows: { stroke: '#cbd5e1', width: 1, dashed: true },
}

function capabilityColor(node) {
  if (node.kind === 'session') return CAPABILITY_COLORS.session
  if (node.kind === 'turn') return CAPABILITY_COLORS.turn
  if (node.kind === 'child') return CAPABILITY_COLORS.subagent
  // §35 layer 2 takes the colour of the capability it groups, so the column reads
  // as one level rather than as a new kind of thing.
  if (node.kind === 'capability') return CAPABILITY_COLORS[node.capabilityId] ?? CAPABILITY_COLORS.unknown
  // Layer 4 is about outcome, not capability. §9 forbids colour as the only signal,
  // and here the colour *is* the outcome — the label and glyph still carry it.
  if (node.kind === 'error') return CAPABILITY_COLORS.error
  if (node.kind === 'result') return CAPABILITY_COLORS.result
  return CAPABILITY_COLORS[node.capabilityId] ?? CAPABILITY_COLORS.unknown
}

function statusColor(status) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.unknown
}

function glyphOf(status) {
  return STATUS_GLYPHS[status] ?? STATUS_GLYPHS.unknown
}

/**
 * One node. Content is deliberately small (§7.1): the detail belongs in the
 * Inspector, not inside the box.
 */
/**
 * 一个节点。内容刻意很少（§7.1）：细节属于 Inspector，不属于盒子。
 *
 * 结构对齐 `preview.html`：顶部类型色条 → 图标 + 标题 + 类型 → 正文 → 页脚（状态 + 右侧）。
 * 类型色只出现在色条、图标与状态点上（§25.1「类型色仅用于节点」）。
 */
function RuntimeNode({ data }) {
  const color = data.color
  // 图标用类型名首字符：与 preview 的 .n-icon 一致，不需要额外图标资源。
  const initial = (data.kindLabel || '?').slice(0, 1)
  const kindKey = data.capabilityId || data.kind
  return React.createElement('div', {
    className: 'st-flow-node',
    'data-kind': data.kind,
    'data-status': data.status,
    'data-dimmed': data.dimmed ? 'true' : undefined,
    'data-replay': data.replay ?? undefined,
    'data-collapsed': data.collapsed ? 'true' : undefined,
    'data-tone': kindKey,
    style: { '--st-node-color': color, '--st-node-width': `${data.width}px` },
    title: data.label,
  },
  React.createElement(Handle, { type: 'target', position: Position.Left, className: 'st-flow-handle' }),
  React.createElement('span', { className: 'st-flow-node-bar', 'aria-hidden': 'true' }),
  React.createElement('div', { className: 'st-flow-node-head' },
    React.createElement('span', { className: 'st-flow-node-icon', 'aria-hidden': 'true' }, initial),
    React.createElement('span', { className: 'st-flow-node-heading' },
      React.createElement('span', { className: 'st-flow-node-title' }, data.label),
      React.createElement('span', { className: 'st-flow-node-type' }, data.kindLabel))),
  React.createElement('div', { className: 'st-flow-node-body' }, data.sublabel || ''),
  React.createElement('div', { className: 'st-flow-node-foot' },
    React.createElement('span', { className: 'st-flow-node-status', style: { color: statusColor(data.status) } },
      React.createElement('i', { className: 'st-flow-node-dot', 'aria-hidden': 'true' }),
      data.statusLabel),
    React.createElement('span', { className: 'st-flow-node-right' },
      data.collapsed && data.memberCount ? `${data.memberCount} 项` : '')),
  React.createElement(Handle, { type: 'source', position: Position.Right, className: 'st-flow-handle' }))
}

const NODE_TYPES = { dsht: RuntimeNode }

const KIND_LABELS = {
  session: '会话',
  turn: 'Turn',
  invocation: '调用',
  group: '折叠',
  child: 'Subagent',
  // §35 layers 2 (Capability) and 4 (Result / Error).
  capability: '能力',
  result: '结果',
  error: '错误',
}

const STATUS_LABELS = {
  observed: 'observed',
  partial: 'partial',
  candidate: 'candidate',
  unknown: 'unknown',
  unlinked: 'unlinked',
}

/** Convert the Host's layout into React Flow's model. Presentation only. */
function toFlowNodes(layout, selectedId, dim, replay) {
  return layout.nodes.map((node) => ({
    id: node.id,
    type: 'dsht',
    position: { x: node.x, y: node.y },
    draggable: false,
    connectable: false,
    selectable: true,
    data: {
      label: node.label,
      sublabel: node.sublabel,
      kind: node.kind,
      status: node.status,
      width: node.width,
      color: capabilityColor(node),
      kindLabel: node.collapsed
        ? `${KIND_LABELS[node.kind] ?? node.kind} · ${node.memberCount}`
        : (KIND_LABELS[node.kind] ?? node.kind),
      statusLabel: STATUS_LABELS[node.status] ?? node.status,
      dimmed: dim ? !dim.has(node.id) : false,
      // §37: replay walks the run in event order. Nodes not yet reached recede; the
      // step being read is the only one at full weight.
      replay: replay ? (replay.currentId === node.id ? 'current' : (replay.seenIds.has(node.id) ? 'past' : 'future')) : null,
    },
  }))
}

function toFlowEdges(layout, selectedEdgeId, dim) {
  return layout.edges.map((edge) => {
    const style = EDGE_STYLE[edge.type] ?? EDGE_STYLE.contains
    const candidate = edge.status === 'candidate'
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      // §10.3: no text on lines by default — only the line style speaks.
      type: 'smoothstep',
      selectable: true,
      style: {
        stroke: style.stroke,
        strokeWidth: selectedEdgeId === edge.id ? 2.6 : style.width,
        strokeDasharray: style.dashed || candidate ? '5 3' : undefined,
      },
      data: { edgeType: edge.type, status: edge.status, evidenceCount: edge.evidenceCount },
      dimmed: dim ? !(dim.has(edge.from) && dim.has(edge.to)) : false,
    }
  })
}


/** §22: the buckets a user filters by. */
const FILTER_TYPES = ['session', 'turn', 'skill', 'tool', 'mcp', 'cli', 'subagent', 'other']

/** Which §22 bucket a node belongs to. Presentation only. */
function filterTypeOf(node) {
  if (node.kind === 'session') return 'session'
  if (node.kind === 'turn') return 'turn'
  if (node.capabilityId === 'turn-range') return 'turn'
  if (FILTER_TYPES.includes(node.capabilityId)) return node.capabilityId
  if (node.kind === 'child') return 'subagent'
  return 'other'
}

/**
 * Apply §20/§22 filters to a laid-out graph.
 *
 * This is presentation over a view model the Host already proved — it shows and hides
 * what exists, and never adds a node or a line that was not there. A filtered-out node
 * is counted, so the canvas can say what it is not showing instead of quietly implying
 * the run was smaller than it was.
 *
 * @param layout - the Host's layout.
 * @param filter - `{ types, hideCandidate, failuresOnly }`. Absent means draw everything.
 * @returns a layout-shaped object plus `filtered` counts.
 */
function filterLayout(layout, filter) {
  if (!layout || !filter) return layout
  const types = Array.isArray(filter.types) && filter.types.length > 0 ? new Set(filter.types) : null
  const nodes = layout.nodes.filter((node) => {
    if (types && !types.has(filterTypeOf(node))) return false
    // §22's "显示失败/重试": a failed call, or one whose evidence could not be placed.
    if (filter.failuresOnly && node.outcome !== 'failure' && node.status !== 'unlinked' && node.status !== 'partial') return false
    return true
  })
  const keep = new Set(nodes.map((node) => node.id))
  const edges = layout.edges.filter((edge) => {
    if (!keep.has(edge.from) || !keep.has(edge.to)) return false
    // §10.2/§21: a candidate relation is the weakest claim, so it is the first thing
    // the quiet view drops — and dropping it is stated, not silent.
    if (filter.hideCandidate && edge.status === 'candidate') return false
    return true
  })
  return {
    ...layout,
    nodes,
    edges,
    filtered: {
      hiddenNodes: layout.nodes.length - nodes.length,
      hiddenEdges: layout.edges.length - edges.length,
      totalNodes: layout.nodes.length,
      totalEdges: layout.edges.length,
    },
  }
}

/** Neighbours of one node, from the layout alone — a view concern, not a claim. */
function neighbourhoodOf(layout, nodeId) {
  const keep = new Set([nodeId])
  for (const edge of layout.edges) {
    if (edge.from === nodeId) keep.add(edge.to)
    else if (edge.to === nodeId) keep.add(edge.from)
  }
  return keep
}

/**
 * The canvas.
 *
 * `onSelect` receives `{ nodeId }` or `{ edgeId }`; the Host answers what it means.
 */
function RuntimeFlowView({ layout, selectedId, onSelect, onBackground, showMiniMap = true, replay = null }) {
  const focus = selectedId?.nodeId
  const dim = focus ? neighbourhoodOf(layout, focus) : null

  const nodes = React.useMemo(() => toFlowNodes(layout, selectedId?.nodeId, dim, replay), [layout, selectedId?.nodeId, dim, replay])
  const edges = React.useMemo(() => toFlowEdges(layout, selectedId?.edgeId, dim), [layout, selectedId?.edgeId, dim])

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(edges)

  React.useEffect(() => { setFlowNodes(nodes) }, [nodes, setFlowNodes])
  React.useEffect(() => { setFlowEdges(edges) }, [edges, setFlowEdges])

  return React.createElement(ReactFlow, {
    nodes: flowNodes,
    edges: flowEdges,
    onNodesChange,
    onEdgesChange,
    nodeTypes: NODE_TYPES,
    // §2.2: read-only runtime replay. Nothing here may mutate the run.
    nodesDraggable: false,
    nodesConnectable: false,
    edgesUpdatable: false,
    elementsSelectable: true,
    panOnDrag: true,
    zoomOnScroll: true,
    zoomOnPinch: true,
    fitView: true,
    fitViewOptions: { padding: 0.15, maxZoom: 1.2 },
    minZoom: 0.15,
    maxZoom: 2.5,
    proOptions: { hideAttribution: true },
    onNodeClick: (event, node) => onSelect({ nodeId: node.id }),
    onEdgeClick: (event, edge) => onSelect({ edgeId: edge.id }),
    onPaneClick: () => onBackground?.(),
  },
  React.createElement(Background, { color: '#e2e8f0', gap: 18, size: 1 }),
  React.createElement(Controls, { showInteractive: false, position: 'top-right' }),
  showMiniMap ? React.createElement(MiniMap, { pannable: true, zoomable: true, position: 'bottom-right', nodeColor: (node) => node.data?.color ?? '#94a3b8' }) : null)
}

module.exports = { RuntimeFlowView, flowStylesheet, CAPABILITY_COLORS, STATUS_COLORS, FILTER_TYPES, filterLayout, filterTypeOf }
