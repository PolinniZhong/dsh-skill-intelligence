import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SEEDED, seedRequire } from './helpers/react-stub.mjs'

// Runtime Flow canvas contract (§2.2, §7–§13, §21, §32).
//
// The canvas is a read-only runtime replay. The tests below exist because the two
// ways it could go wrong are both quiet:
//
//   · it could let a click change the run, which would make the picture a claim;
//   · it could express a status or a relationship by colour and line alone, which
//     would leave the meaning unreadable to anyone who cannot see the difference.
//
// The module is loaded through the same seam the shell uses — a `require` that
// resolves only platform seed words — so this also proves the canvas itself pulls
// nothing the browser cannot provide.

const SOURCE_URL = new URL('../src/dsh/client/runtime-flow.js', import.meta.url)
const source = await readFile(SOURCE_URL, 'utf8')

/**
 * The module's own dependency surface.
 *
 * `@xyflow/react` is bundled into the shipped artifact, so in the bundle case the
 * seed harness must refuse it — that is asserted in the bundle suite. Here the
 * module is loaded from source, where React Flow is a normal dependency, so it is
 * stubbed with the same exports the module imports. The point of this suite is the
 * module's governed behaviour, not React Flow's internals.
 */
const REACT_FLOW_STUB = {
  ReactFlow: () => null,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Panel: () => null,
  ReactFlowProvider: ({ children }) => children,
  useReactFlow: () => ({ fitView: async () => {} }),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useNodesState: (initial) => [initial, () => {}, () => {}],
  useEdgesState: (initial) => [initial, () => {}, () => {}],
}

function canvasRequire(required = []) {
  const seeds = seedRequire(required)
  return (spec) => {
    if (spec === '@xyflow/react') return REACT_FLOW_STUB
    if (spec.endsWith('.css')) return '/* stylesheet */'
    return seeds(spec)
  }
}

/** Load the module the way the bundle loads it: through a require seam. */
function loadCanvasModule(required = []) {
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', source)(canvasRequire(required), module, module.exports)
  return module.exports
}

test('the canvas module loads through its own require seam', () => {
  const required = []
  const exported = loadCanvasModule(required)
  assert.equal(typeof exported.RuntimeFlowView, 'function')
  assert.equal(typeof exported.flowStylesheet, 'string')
  assert.ok(required.includes('react'))
  // Everything that reaches the module table must be a seed word. React Flow is not
  // one, which is exactly why it has to be bundled in.
  for (const spec of new Set(required)) {
    assert.ok(SEEDED.includes(spec), `the shell cannot resolve ${spec}`)
  }
  assert.ok(source.includes("require('@xyflow/react')"), 'React Flow must be a bundled dependency')
  assert.equal(SEEDED.includes('@xyflow/react'), false, 'React Flow is not a platform seed word')
})

test('§2.2 the canvas cannot change the run', () => {
  // Every affordance a workflow editor would need must be off. If any of these
  // flips, a user's drag would become a claim about what happened.
  for (const flag of [
    'nodesDraggable: false',
    'nodesConnectable: false',
    'edgesUpdatable: false',
    'draggable: false',
    'connectable: false',
  ]) {
    assert.ok(source.includes(flag), `the canvas must keep ${flag}`)
  }
  // And it must not accept a handler that could persist a mutation.
  for (const forbidden of ['onNodesChange: (changes) => {', 'setNodes(', 'onConnect:', 'onReconnect:']) {
    assert.equal(source.includes(forbidden), false, `read-only canvas must not define ${forbidden}`)
  }
})

test('§13 pan, zoom and fit are available', () => {
  for (const flag of ['panOnDrag: true', 'zoomOnScroll: true', 'zoomOnPinch: true', 'fitView: true']) {
    assert.ok(source.includes(flag), `the canvas must offer ${flag}`)
  }
  // Fit and zoom controls come from React Flow's own control surface.
  assert.ok(source.includes('Controls'), 'the canvas must expose zoom/fit controls')
})

test('§9 every status carries a glyph and a word, never colour alone', () => {
  const { STATUS_COLORS } = loadCanvasModule()
  const statuses = ['observed', 'partial', 'candidate', 'unknown', 'unlinked']
  for (const status of statuses) {
    assert.ok(STATUS_COLORS[status], `${status} needs a colour`)
  }
  // The glyph table must be spelled out in the module, and every status the layout
  // can produce must have one — colour alone is not allowed to carry meaning.
  const glyphBlock = source.slice(source.indexOf('STATUS_GLYPHS'), source.indexOf('STATUS_COLORS'))
  for (const status of statuses) {
    assert.ok(glyphBlock.includes(`${status}:`), `${status} needs a glyph`)
  }
  assert.ok(source.includes('statusLabel'), 'the status word must be rendered, not only its colour')
})

test('§8 node types are coloured, and colour is not the only signal', () => {
  const { CAPABILITY_COLORS } = loadCanvasModule()
  for (const kind of ['session', 'turn', 'skill', 'tool', 'mcp', 'cli', 'subagent']) {
    assert.ok(CAPABILITY_COLORS[kind], `${kind} needs a type colour`)
  }
  // The type is written out beside the colour.
  assert.ok(source.includes('KIND_LABELS'), 'the node kind must be labelled')
})

test('§10 the line language distinguishes direct evidence from candidates', () => {
  const block = source.slice(source.indexOf('const EDGE_STYLE'), source.indexOf('function capabilityColor'))
  // `follows` is the only candidate-producing relation, and it must be dashed.
  assert.match(block, /follows:\s*\{[^}]*dashed:\s*true/)
  assert.match(block, /contains:\s*\{[^}]*dashed:\s*false/)
  assert.match(block, /spawns:\s*\{[^}]*dashed:\s*false/)
  // A candidate edge must be drawn dashed even when its type is normally solid.
  assert.ok(source.includes("edge.status === 'candidate'"), 'a candidate edge must be dashed')
  // §10.3: lines carry no text by default — the edge objects must not set a label.
  const edgeBuilder = source.slice(source.indexOf('function toFlowEdges'), source.indexOf('/** Neighbours'))
  assert.equal(edgeBuilder.includes('label:'), false, 'edges must not carry labels by default')
})

test('§32 the canvas consumes a view model and never derives a relationship', () => {
  // It must not reach for raw events, tool arguments, or result content.
  for (const forbidden of ['/context?', 'runtimeEvents', 'evidenceIds', 'arguments', '.content']) {
    assert.equal(source.includes(forbidden), false, `the canvas must not touch ${forbidden}`)
  }
  // Its only source of structure is the layout it is handed.
  assert.ok(source.includes('layout.edges'), 'relations must come from the supplied layout')
  assert.ok(source.includes('layout.nodes'), 'nodes must come from the supplied layout')
})

test('the minimap is optional so a dense view can drop it', () => {
  assert.ok(source.includes('showMiniMap'), 'the minimap must be suppressible')
})
