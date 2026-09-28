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
  skill: '#7c3aed',
  tool: '#047857',
  mcp: '#b45309',
  cli: '#475569',
  subagent: '#c2410c',
  mixed: '#64748b',
  'turn-range': '#334155',
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
function RuntimeNode({ data }) {
  const color = data.color
  return React.createElement('div', {
    className: 'st-flow-node',
    'data-kind': data.kind,
    'data-status': data.status,
    'data-dimmed': data.dimmed ? 'true' : undefined,
    style: { '--st-node-color': color, '--st-node-width': `${data.width}px` },
  },
  React.createElement(Handle, { type: 'target', position: Position.Left, className: 'st-flow-handle' }),
  React.createElement('span', { className: 'st-flow-node-bar', 'aria-hidden': 'true' }),
  React.createElement('div', { className: 'st-flow-node-body' },
    React.createElement('div', { className: 'st-flow-node-title' }, data.label),
    React.createElement('div', { className: 'st-flow-node-meta' },
      React.createElement('span', null, data.kindLabel),
      React.createElement('span', { className: 'st-flow-node-status', style: { color: statusColor(data.status) } },
        React.createElement('i', { 'aria-hidden': 'true' }, glyphOf(data.status)),
        data.statusLabel))),
  React.createElement(Handle, { type: 'source', position: Position.Right, className: 'st-flow-handle' }))
}

const NODE_TYPES = { dsht: RuntimeNode }

const KIND_LABELS = {
  session: '会话',
  turn: 'Turn',
  invocation: '调用',
  group: '折叠',
  child: 'Subagent',
}

const STATUS_LABELS = {
  observed: 'observed',
  partial: 'partial',
  candidate: 'candidate',
  unknown: 'unknown',
  unlinked: 'unlinked',
}

/** Convert the Host's layout into React Flow's model. Presentation only. */
function toFlowNodes(layout, selectedId, dim) {
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
function RuntimeFlowView({ layout, selectedId, onSelect, onBackground, showMiniMap = true }) {
  const focus = selectedId?.nodeId
  const dim = focus ? neighbourhoodOf(layout, focus) : null

  const nodes = React.useMemo(() => toFlowNodes(layout, selectedId?.nodeId, dim), [layout, selectedId?.nodeId, dim])
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

module.exports = { RuntimeFlowView, flowStylesheet, CAPABILITY_COLORS, STATUS_COLORS }
