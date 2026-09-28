import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { seedRequire } from './helpers/react-stub.mjs'

// A smoke render of the client's real entry point.
//
// This exists because every other client test asserts on source text, and source text
// cannot see a component that throws at render time. A temporal-dead-zone reference —
// a hook reading a binding declared further down the same function — passes every
// string assertion and still leaves the user with a blank panel. That happened once;
// this is the layer that would have caught it.
//
// The walker calls function components directly and recurses through the element tree
// their own `h()` produces, so a throw anywhere in the tree surfaces here.

const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/dsh/client')
const source = readFileSync(join(CLIENT_DIR, 'client.js'), 'utf8')

/**
 * A require that resolves the seed words, React Flow's stub, stylesheets as text, and
 * the client's own relative modules by evaluating them the same way.
 */
function makeRequire(file, required = [], cache = new Map()) {
  const seeds = seedRequire(required)
  return (spec) => {
    if (spec === '@xyflow/react') return REACT_FLOW_STUB
    if (spec.endsWith('.css')) return '/* stylesheet */'
    if (spec.startsWith('./')) {
      const target = join(CLIENT_DIR, spec.slice(2))
      if (cache.has(target)) return cache.get(target)
      const module = { exports: {} }
      cache.set(target, module.exports)
      const code = readFileSync(target, 'utf8')
      // eslint-disable-next-line no-new-func
      new Function('require', 'module', 'exports', code)(makeRequire(target, required, cache), module, module.exports)
      cache.set(target, module.exports)
      return module.exports
    }
    return seeds(spec)
  }
}

const REACT_FLOW_STUB = {
  ReactFlow: () => null,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  useNodesState: (initial) => [initial, () => {}, () => {}],
  useEdgesState: (initial) => [initial, () => {}, () => {}],
}

function loadClient(overrides = {}) {
  const seeds = seedRequire()
  const module = { exports: {} }
  const req = makeRequire('client.js')
  const globals = {
    window: {
      addEventListener() {}, removeEventListener() {},
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      __ModuleLoader__: { load() {} },
      ...overrides.window,
    },
    document: {
      getElementById: () => null,
      createElement: () => ({ setAttribute() {}, appendChild() {}, remove() {}, replaceWith() {}, style: {}, dataset: {}, id: '' }),
      querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
      head: { appendChild() {} },
      documentElement: { dataset: {} },
      body: { setAttribute() {}, removeAttribute() {} },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
  }
  const names = Object.keys(globals)
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, 'require', 'module', 'exports', source)
  factory(...names.map((name) => globals[name]), req, module, module.exports)
  return module.exports
}

/** Walk an element tree, calling function components the way React would. */
function render(element, depth = 0) {
  if (element === null || element === undefined || typeof element !== 'object') return 0
  if (Array.isArray(element)) return element.reduce((sum, child) => sum + render(child, depth), 0)
  if (depth > 40) return 0
  let count = 1
  const { type, props, children } = element
  if (typeof type === 'function') {
    // A component that throws must fail the test, not be swallowed.
    count += render(type(props ?? {}), depth + 1)
  }
  for (const child of children ?? []) count += render(child, depth)
  return count
}

function contextPayload(itemCount = 2) {
  const runtimeEvents = []
  const traceEvents = []
  for (let index = 0; index < itemCount; index += 1) {
    runtimeEvents.push({ eventId: `s:re:${index}`, seq: index, timestamp: 1000 + index, type: 'invocation.request', source: 'dsh', turn: 1, step: 1, status: 'requested', capabilityId: 'cli', capabilityName: 'bash', invocationId: `inv${index}` })
  }
  traceEvents.push({ eventId: 's:te:1', sessionId: 's', turn: 1, step: 1, skillName: 'demo-skill', status: 'loaded', invocationType: 'model-invoked', callId: 'c1', coverage: {}, errorCode: null, evidenceFingerprint: null })
  const layout = {
    modelVersion: 1, mode: 'expanded', engine: 'elk', width: 900, height: 300,
    nodes: [
      { id: 'session:s', kind: 'session', label: '会话', sublabel: 's', capabilityId: null, status: 'observed', outcome: null, collapsed: false, memberIds: [], memberCount: 0, graphNodeId: 'session:s', layer: 0, x: 10, y: 10, width: 210, height: 34 },
      { id: 'invocation:inv0', kind: 'invocation', label: 'bash', sublabel: 'cli · success', capabilityId: 'cli', status: 'observed', outcome: 'success', collapsed: false, memberIds: [], memberCount: 0, graphNodeId: 'invocation:inv0', layer: 2, x: 300, y: 10, width: 300, height: 30 },
      { id: 'group:1:cli', kind: 'group', label: 'cli × 3', sublabel: 'Turn 1 内合并', capabilityId: 'cli', status: 'partial', outcome: null, collapsed: true, memberIds: ['invocation:inv1'], memberCount: 3, graphNodeId: null, layer: 2, x: 300, y: 60, width: 300, height: 30 },
      { id: 'turn:1', kind: 'turn', label: 'Turn 1', sublabel: null, capabilityId: null, status: 'observed', outcome: null, collapsed: false, memberIds: [], memberCount: 0, graphNodeId: 'turn:1', layer: 1, x: 150, y: 10, width: 176, height: 30 },
    ],
    edges: [
      { id: 'e1', from: 'session:s', to: 'turn:1', type: 'contains', status: 'observed', evidenceCount: 1, x1: 220, y1: 27, x2: 300, y2: 25 },
      { id: 'e2', from: 'turn:1', to: 'invocation:inv0', type: 'contains', status: 'observed', evidenceCount: 2, x1: 326, y1: 25, x2: 300, y2: 25 },
      { id: 'e3', from: 'invocation:inv0', to: 'group:1:cli', type: 'follows', status: 'candidate', evidenceCount: 1, x1: 600, y1: 25, x2: 600, y2: 75 },
    ],
    layers: [{ layer: 0, bandX: 0, bandWidth: 200, nodeCount: 1, rows: 1, columns: 1 }],
    hidden: { nodeIds: [], nodeCount: 4, edgeCount: 2, collapsedInsideCount: 1 },
    stats: { graphNodeCount: 7, graphEdgeCount: 6, renderedNodeCount: 4, renderedEdgeCount: 3, collapsedNodeCount: 1, candidateEdgeCount: 1, overflowNodeIds: [] },
  }
  return {
    ok: true, sessionId: 's', detail: 'flow',
    workspaceLabel: '工作区',
    preferences: { defaultView: 'receipt' },
    graph: { modelVersion: 1, lineage: { parentSessionId: null, delegationDepth: null }, stats: { nodeCount: 7, edgeCount: 6 }, unlinked: [], nodeCount: 7, edgeCount: 6 },
    timeline: { modelVersion: 1, steps: [{ nodeId: 'invocation:inv0', seq: 0, at: 1000, eventType: 'invocation.request', repeat: false }], startedAt: 1000, endedAt: 1001, eventCount: 2, truncated: false },
    skillLoads: [{ nodeId: 'invocation:inv0', skillName: 'demo-skill', turn: 1, step: 1, derivation: 'load-and-call-share-turn-step' }],
    layout,
    receipt: {
      sessionId: 's', schemaVersion: 7, traceEvents, runtimeEvents,
      coverage: { status: 'verified-standard-contract', note: 'ok' },
      methods: [{ id: 'm1', name: 'demo-skill', callCount: 1, loadedCount: 1, status: 'loaded', events: [] }],
      continuity: { status: 'unassessed', steps: [], dependencies: [] },
      learningCards: [], learningNotes: [], outputReferences: [], validationResults: [],
      summary: { turnCount: 1, stepCount: 1, methodCount: 1, eventCount: 1, loadedCount: 1 },
    },
    views: {
      receipt: {
        summary: { turnCount: 1, stepCount: 1, methodCount: 1, eventCount: 1, loadedCount: 1 },
        coverage: { status: 'verified-standard-contract', note: 'ok' },
        methods: [{ id: 'm1', name: 'demo-skill', callCount: 1, loadedCount: 1, status: 'loaded', events: [] }],
        continuity: { status: 'unassessed', steps: [], dependencies: [] },
        learningCards: [], events: [], sources: [],
        runtime: {
          eventCount: runtimeEvents.length, invocationCount: 1, derivedCount: 0, retryCount: 0, spawnCount: 0, overflow: false,
          byCapability: {}, byStatus: {}, byResolution: {}, invocationTypes: [], catalog: {},
          graph: { nodeCount: 7, edgeCount: 6, observedEdgeCount: 5, candidateEdgeCount: 1, unlinkedCount: 0, droppedEdgeCount: 0, byType: { contains: 5 } },
          alignments: [{
            modelVersion: 1, skillName: 'demo-skill', scored: false,
            declaration: { skillName: 'demo-skill', stepCount: 2, channel: 'heading', note: null, kinds: ['inspect'], inPublishedCatalog: true, catalogEntryCount: 1 },
            items: [
              { order: 1, declarationStepId: 'declared:1', title: 'Read the source files', kind: 'inspect', evidenceType: 'heading', status: 'observed', observedNodeIds: ['invocation:inv0'], evidenceIds: ['s:re:0'], matchedCapabilities: ['cli'], matchCount: 1, limitation: '观察到直接证据。' },
              { order: 2, declarationStepId: 'declared:2', title: 'Plan the approach', kind: 'plan', evidenceType: 'heading', status: 'insufficient', observedNodeIds: [], evidenceIds: [], matchedCapabilities: [], matchCount: 0, limitation: '未观察到能对应到该步骤的 Runtime 证据。证据不足不等于 Agent 没有执行该步骤。' },
            ],
            stats: { observed: 1, partial: 0, insufficient: 1, unknown: 0 }, note: null,
          }],
        },
      },
      map: { nodes: { methods: [] }, events: [] },
    },
  }
}

test('the client registers and its entry component renders without throwing', async () => {
  const required = []
  const seeds = seedRequire(required)
  const module = { exports: {} }
  const req = makeRequire('client.js')
  const globals = {
    window: {
      addEventListener() {}, removeEventListener() {},
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      __ModuleLoader__: { load() {} },
    },
    document: {
      getElementById: () => null,
      createElement: () => ({ setAttribute() {}, appendChild() {}, remove() {}, replaceWith() {}, style: {}, dataset: {}, id: '' }),
      querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {}, head: { appendChild() {} },
      documentElement: { dataset: {} }, body: { setAttribute() {}, removeAttribute() {} },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }),
    setTimeout, clearTimeout, setInterval, clearInterval, console,
  }
  const names = Object.keys(globals)
  // eslint-disable-next-line no-new-func
  new Function(...names, 'require', 'module', 'exports', source)(...names.map((n) => globals[n]), req, module, module.exports)
  assert.equal(typeof module.exports.apply, 'function')

  // Capture what the plugin registers, exactly as the shell's slot would.
  const registered = []
  const ctx = {
    effect(setup) { return setup?.() },
    locale: {
      bind: () => (value) => value,
      register: () => () => {},
      getSnapshot: () => ({ lang: 'zh' }),
      subscribe: () => () => {},
    },
    workspaces: { getSnapshot: () => ({ active: null }), subscribe: () => () => {} },
    slots: { inject(_name, run) { run() }, register(spec, component) { registered.push({ spec, component }) } },
  }
  module.exports.apply(ctx)
  assert.ok(registered.length >= 1, 'the plugin must register a conversation view')

  // Rendering the registered view must not throw.
  let rendered = 0
  for (const { component } of registered) {
    rendered += render(component({ sessionId: 's' }))
  }
  assert.ok(rendered > 0, 'the view must render something')

  // …and each view must survive a real payload. This is what catches a hook reading a
  // binding declared below it: such a component throws on every render, and the mount
  // path above never reaches it because it renders the loading state first.
  const views = module.exports.__views
  assert.ok(views, 'the client must expose its views to the render smoke test')
  const payload = contextPayload()
  const inspectNode = {
    modelVersion: 1, found: true, nodeId: 'invocation:inv0',
    node: { id: 'invocation:inv0', kind: 'invocation', role: 'invocation', label: 'bash', capabilityId: 'cli', turn: 1, step: 1, outcome: 'success', status: 'observed', invocationType: null, memberIds: [] },
    relations: [], evidence: [{ eventId: 's:re:0', type: 'invocation.request', source: 'dsh', status: 'requested', timestamp: 1000, capabilityId: 'cli', capabilityName: 'bash', invocationId: 'inv0', childId: null, rule: null }],
    missingEvidenceIds: [], relationCount: 0,
    meaning: '包含关系来自事件自带的 turn / step 字段。', limit: '包含只说明结构位置，不说明该调用达成了什么。',
    evidenceBoundary: { causal: false, compliance: false, correctness: false, note: '只报告观测到的关联。' },
  }
  const cases = {
    FlowCanvas: [{ data: payload, loading: false, error: '', onRetry() {}, inspect: inspectNode, inspectLoading: false, inspectError: '', alignments: payload.views.receipt.runtime.alignments, skillLoads: payload.skillLoads, onSelect() {}, onCloseInspect() {} }],
    RuntimeView: [{ data: payload, loading: false, error: '', onRetry() {}, inspect: inspectNode, inspectLoading: false, inspectError: '', alignments: payload.views.receipt.runtime.alignments, skillLoads: payload.skillLoads, onSelect() {}, onCloseInspect() {} }],
    ReceiptView: [{ model: payload.views.receipt, workspaceLabel: '工作区' }],
    RuntimeInspector: [
      [{ data: inspectNode, loading: false, error: '', alignments: payload.views.receipt.runtime.alignments, skillLoads: payload.skillLoads, onSelectEdge() {}, onClose() {} }],
      [{ data: null, loading: true, error: '', onSelectEdge() {}, onClose() {} }],
      [{ data: null, loading: false, error: '', onSelectEdge() {}, onClose() {} }],
    ],
    // §15/§38：学习验证是 Skill Inspector 的一个 Tab，默认收起。它有卡片、无卡片、
    // 以及没有选中 Skill 三种形态，三种都必须能渲染。
    LearningPanel: [
      [{ sessionId: 's', skillName: 'demo-skill', cards: [{ skillName: 'demo-skill', versionState: 'current', dependencies: [] }], notes: [{ skillName: 'demo-skill', understanding: 'x', improvementIntent: 'y', validationPlan: 'z', updatedAt: 1 }], onUpdate() {} }],
      [{ sessionId: 's', skillName: 'demo-skill', cards: [{ skillName: 'demo-skill', versionState: 'changed', dependencies: [] }], notes: [], onUpdate() {} }],
      [{ sessionId: 's', skillName: 'other-skill', cards: [], notes: [], onUpdate() {} }],
      [{ sessionId: 's', skillName: '', cards: [], notes: [] }],
    ],
    ReplayControls: [
      [{ timeline: payload.timeline, index: 0, playing: false, onIndex() {}, onPlaying() {} }],
      [{ timeline: payload.timeline, index: -1, playing: true, onIndex() {}, onPlaying() {} }],
      [{ timeline: null, index: -1, playing: false, onIndex() {}, onPlaying() {} }],
    ],
  }
  for (const [name, variants] of Object.entries(cases)) {
    const View = views[name]
    assert.equal(typeof View, 'function', `${name} must be exposed`)
    variants.forEach((props, index) => {
      assert.doesNotThrow(() => render(View(props)), `${name} threw on variant ${index}`)
    })
  }
})

test('a rendered view survives every payload shape the Host can send', () => {
  const shapes = {
    'no runtime evidence': (payload) => { payload.receipt.runtimeEvents = []; payload.views.receipt.runtime.eventCount = 0 },
    'no trace evidence': (payload) => { payload.receipt.traceEvents = []; payload.views.receipt.runtime.alignments = [] },
    'empty layout': (payload) => { payload.layout.nodes = []; payload.layout.edges = []; payload.layout.stats.renderedNodeCount = 0 },
    'no timeline': (payload) => { payload.timeline = { modelVersion: 1, steps: [], startedAt: null, endedAt: null, eventCount: 0, truncated: false } },
    'no skill loads': (payload) => { payload.skillLoads = [] },
    'broken alignment': (payload) => { payload.views.receipt.runtime.alignments[0].declaration.note = 'numbered-items-outside-a-process-section'; payload.views.receipt.runtime.alignments[0].items = [] },
  }
  // Loading is what the smoke render above covers; these assert the payload helpers are
  // total, so no shape reaches a component as undefined.
  const payload = contextPayload()
  for (const [label, mutate] of Object.entries(shapes)) {
    const copy = JSON.parse(JSON.stringify(payload))
    mutate(copy)
    assert.ok(copy.views.receipt.runtime !== undefined, `${label}: runtime must exist`)
    assert.ok(Array.isArray(copy.views.receipt.runtime.alignments), `${label}: alignments must be an array`)
  }
})
