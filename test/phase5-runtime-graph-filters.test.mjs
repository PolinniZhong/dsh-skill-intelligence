import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { seedRequire } from './helpers/react-stub.mjs'

// P5 contract: Runtime Graph governance (§20/§21/§22).
//
// Filtering is the one place in this UI where the canvas decides what *not* to draw,
// so it carries two risks that no type check would catch:
//
//   · it could hide something and let the canvas read as a smaller run than it was;
//   · it could become the place relationships are invented, which §32 forbids.
//
// So the filter may only remove, must count what it removed, and must say so.

const source = await readFile(new URL('../src/dsh/client/runtime-flow.js', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/dsh/client/client.js', import.meta.url), 'utf8')

const REACT_FLOW_STUB = {
  ReactFlow: () => null,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Panel: () => null,
  ReactFlowProvider: ({ children }) => children,
  useReactFlow: () => ({ fitView: async () => {} }),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  useNodesState: (initial) => [initial, () => {}, () => {}],
  useEdgesState: (initial) => [initial, () => {}, () => {}],
}

function loadCanvas(required = []) {
  const seeds = seedRequire(required)
  const module = { exports: {} }
  const req = (spec) => {
    if (spec === '@xyflow/react') return REACT_FLOW_STUB
    if (spec.endsWith('.css')) return '/* stylesheet */'
    return seeds(spec)
  }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', source)(req, module, module.exports)
  return module.exports
}

const LAYOUT = {
  nodes: [
    { id: 'session', kind: 'session', capabilityId: null },
    { id: 'turn', kind: 'turn', capabilityId: null },
    { id: 'skill', kind: 'invocation', capabilityId: 'skill', status: 'observed' },
    { id: 'cli-ok', kind: 'invocation', capabilityId: 'cli', status: 'observed', outcome: 'success' },
    { id: 'cli-bad', kind: 'invocation', capabilityId: 'cli', status: 'partial', outcome: 'failure' },
    { id: 'child', kind: 'child', capabilityId: 'subagent', status: 'observed' },
  ],
  edges: [
    { id: 'e1', from: 'session', to: 'turn', type: 'contains', status: 'observed' },
    { id: 'e2', from: 'turn', to: 'skill', type: 'contains', status: 'observed' },
    { id: 'e3', from: 'turn', to: 'cli-ok', type: 'contains', status: 'observed' },
    { id: 'e4', from: 'skill', to: 'cli-ok', type: 'follows', status: 'candidate' },
    { id: 'e5', from: 'cli-ok', to: 'cli-bad', type: 'retries', status: 'observed' },
  ],
}

test('§22 the filter buckets cover the governed types', () => {
  const { FILTER_TYPES, filterTypeOf } = loadCanvas()
  for (const key of ['session', 'turn', 'skill', 'tool', 'mcp', 'cli', 'subagent']) {
    assert.ok(FILTER_TYPES.includes(key), `missing filter bucket: ${key}`)
  }
  assert.equal(filterTypeOf(LAYOUT.nodes[0]), 'session')
  assert.equal(filterTypeOf(LAYOUT.nodes[1]), 'turn')
  assert.equal(filterTypeOf(LAYOUT.nodes[2]), 'skill')
  assert.equal(filterTypeOf(LAYOUT.nodes[5]), 'subagent')
})

test('§22 filtering by type keeps only what was asked for', () => {
  const { filterLayout } = loadCanvas()
  const filtered = filterLayout(LAYOUT, { types: ['cli'] })
  assert.deepEqual(filtered.nodes.map((node) => node.id).sort(), ['cli-bad', 'cli-ok'])
  // No relation may survive without both of its ends.
  for (const edge of filtered.edges) {
    assert.ok(filtered.nodes.some((node) => node.id === edge.from))
    assert.ok(filtered.nodes.some((node) => node.id === edge.to))
  }
})

test('§22 the main path hides candidates, and only candidates', () => {
  const { filterLayout } = loadCanvas()
  const filtered = filterLayout(LAYOUT, { hideCandidate: true })
  assert.equal(filtered.edges.some((edge) => edge.status === 'candidate'), false, 'candidates must be hidden')
  // Structural and retry relations survive: this hides the weakest class, not evidence.
  assert.ok(filtered.edges.some((edge) => edge.type === 'contains'))
  assert.ok(filtered.edges.some((edge) => edge.type === 'retries'))
})

test('§22 the failure filter keeps failures and partials, not everything', () => {
  const { filterLayout } = loadCanvas()
  const filtered = filterLayout(LAYOUT, { failuresOnly: true })
  const ids = filtered.nodes.map((node) => node.id)
  assert.ok(ids.includes('cli-bad'), 'a failed call must survive the failure filter')
  assert.equal(ids.includes('cli-ok'), false, 'a clean call must not')
})

test('a filtered canvas counts what it hid, so it cannot read as a smaller run', () => {
  const { filterLayout } = loadCanvas()
  const filtered = filterLayout(LAYOUT, { types: ['cli'] })
  assert.equal(filtered.filtered.totalNodes, LAYOUT.nodes.length)
  assert.equal(filtered.filtered.totalEdges, LAYOUT.edges.length)
  assert.equal(filtered.filtered.hiddenNodes, LAYOUT.nodes.length - filtered.nodes.length)
  assert.equal(filtered.filtered.hiddenEdges, LAYOUT.edges.length - filtered.edges.length)
  assert.ok(filtered.filtered.hiddenNodes > 0)
})

test('§32 the filter only removes: it never adds a node or a relation', () => {
  const { filterLayout } = loadCanvas()
  const known = new Set(LAYOUT.nodes.map((node) => node.id))
  const knownEdges = new Set(LAYOUT.edges.map((edge) => edge.id))
  for (const filter of [{ types: ['cli'] }, { hideCandidate: true }, { failuresOnly: true }, { types: ['skill'], hideCandidate: true }]) {
    const filtered = filterLayout(LAYOUT, filter)
    for (const node of filtered.nodes) assert.ok(known.has(node.id), `the filter invented a node: ${node.id}`)
    for (const edge of filtered.edges) assert.ok(knownEdges.has(edge.id), `the filter invented a relation: ${edge.id}`)
    assert.ok(filtered.nodes.length <= LAYOUT.nodes.length)
    assert.ok(filtered.edges.length <= LAYOUT.edges.length)
  }
})

test('no filter means the layout is passed through untouched', () => {
  const { filterLayout } = loadCanvas()
  assert.equal(filterLayout(LAYOUT, null), LAYOUT)
  assert.equal(filterLayout(null, { types: ['cli'] }), null)
})

test('§21 the two views share one renderer instead of two flowcharts', () => {
  // The graph view used to draw its own SVG while the flow view used React Flow —
  // exactly the "two near-identical flowcharts" §21 rules out.
  assert.equal(client.includes('st-rt-edge'), false, 'the graph view must not keep its own SVG edges')
  assert.equal(client.includes('rtEdgePath'), false, 'the graph view must not keep its own SVG path builder')
  const graphView = client.slice(client.indexOf('function RuntimeView('), client.indexOf('function ReplayControls('))
  assert.ok(graphView.length > 0 && graphView.includes('RuntimeFlowView'), 'the graph view must reuse the canvas renderer')
})

test('§22 the graph view offers the governed controls', () => {
  const graphView = client.slice(client.indexOf('function RuntimeView('), client.indexOf('function ReplayControls('))
  for (const control of ['仅显示主路径', '只看失败/重试', '全部']) {
    assert.ok(graphView.includes(control), `the graph view must offer: ${control}`)
  }
  // Defaults: main path on, everything else off (§22).
  assert.ok(/useState\(true\)/.test(graphView), 'the main-path default must be on')
  assert.ok(graphView.includes('FILTER_TYPES.map'), 'the type filters must come from the governed list')
})

test('§21 the flow view is the quiet one and says what it dropped', () => {
  const flowStart = client.indexOf('function FlowCanvas(')
  const flowView = client.slice(flowStart, client.indexOf('\n  function Workbench(', flowStart))
  assert.ok(flowView.includes('hideCandidate: true'), '运行流程 must drop candidate relations')
  assert.match(flowView, /已隐藏|Hiding/, '运行流程 must state how many it dropped')
  assert.ok(flowView.includes('运行图谱'), 'it must point at where the candidates can be seen')
})

test('§21 the client no longer asks the Host for a graph density', () => {
  // v0.6 §4：运行图谱已从 UI 消失，视图驱动的 `graph`/`flow` 密度选择也随之消失。
  // 这段代码（连同 `loadRuntime`）在下一步与 Runtime Graph 专用代码一起删除。
  assert.equal(
    client.includes("view === 'runtime' ? 'graph' : 'flow'"),
    false,
    'the density must not follow a view that is no longer a page',
  )
})
