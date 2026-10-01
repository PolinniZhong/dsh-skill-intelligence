import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
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
/**
 * The smoke harness evaluates modules as CommonJS, but `src/core/*.mjs` are ESM.
 * esbuild rewrites them for the real bundle; this lowers the one export shape the
 * client actually imports — named `export function` declarations — and fails loudly
 * on anything else so a new export form cannot be lowered silently.
 */
function lowerEsmToCjs(code, target) {
  const names = [...code.matchAll(/^export function (\w+)/gm)].map((match) => match[1])
  const stripped = code.replace(/^export function (\w+)/gm, 'function $1')
  if (/^export /m.test(stripped)) {
    throw new Error(`client-modules: ${target} uses an export form this harness cannot lower`)
  }
  return `${stripped}\nmodule.exports = { ${names.join(', ')} }\n`
}

function makeRequire(file, required = [], cache = new Map()) {
  const seeds = seedRequire(required)
  return (spec) => {
    if (spec === '@xyflow/react') return REACT_FLOW_STUB
    if (spec.endsWith('.css')) return '/* stylesheet */'
    // 相对路径按**当前文件**解析，而不是一律按 client 目录：客户端现在会 import
    // `../../core/installed-view.mjs`（搜索谓词必须与宿主共用一份）。
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const target = resolve(dirname(file), spec)
      if (cache.has(target)) return cache.get(target)
      const module = { exports: {} }
      cache.set(target, module.exports)
      const raw = readFileSync(target, 'utf8')
      const code = target.endsWith('.mjs') ? lowerEsmToCjs(raw, target) : raw
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
  Panel: () => null,
  ReactFlowProvider: ({ children }) => children,
  useReactFlow: () => ({ fitView: async () => {}, zoomIn: async () => {}, zoomOut: async () => {} }),
  // §13 画布工具栏用 useViewport 读缩放比例；桩里缺了它会让每次渲染都抛。
  useViewport: () => ({ zoom: 1, x: 0, y: 0 }),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  useNodesState: (initial) => [initial, () => {}, () => {}],
  useEdgesState: (initial) => [initial, () => {}, () => {}],
}

function loadClient(overrides = {}) {
  const seeds = seedRequire()
  const module = { exports: {} }
  const req = makeRequire(join(CLIENT_DIR, 'client.js'))
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

/**
 * Same walk as render(), but returns the nodes instead of a count, so a test can assert on
 * *what* was rendered rather than merely that something was. Node counts only prove that a
 * branch executed; they say nothing about whether it executed correctly.
 */
function collect(element, out = [], depth = 0) {
  if (element === null || element === undefined) return out
  if (Array.isArray(element)) {
    for (const child of element) collect(child, out, depth)
    return out
  }
  if (typeof element !== 'object' || depth > 40) return out
  const { type, props, children } = element
  out.push({ type, props: props ?? {}, children })
  if (typeof type === 'function') collect(type(props ?? {}), out, depth + 1)
  for (const child of children ?? []) {
    if (typeof child === 'string' || typeof child === 'number') out.push({ type: '#text', props: {}, text: String(child) })
    else collect(child, out, depth)
  }
  return out
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
  const req = makeRequire(join(CLIENT_DIR, 'client.js'))
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
      // The contract is `active: LocaleId` (dsh-client-locale/lib/types/client/index.d.ts:51).
      // 这里原本只写了 `lang: 'zh'`——一个不属于契约的字段。客户端读的是 `active`，读到
      // undefined 就退回 'en'，于是这个桩一直在悄悄渲染英文，而它的写法看上去是在渲染中文。
      getSnapshot: () => ({ active: 'zh', lang: 'zh' }),
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
  // §11 的注入口搬去了 SkillWorkbench：`list` 与 `skill` 平时由 `useEffect` 里的 fetch 填，
  // 而这个测试的 react stub 不执行 effect，所以不注入就等于「右栏一行都不跑」——Markdown
  // 渲染器、Evidence 面板、目录候选清单全都在注入之后的分支之下。这里给一份**真形状**的
  // `/skill` 载荷（列表 + 详情），用一份带围栏、标题、列表、行内标记与不安全协议的正文去压渲染器。
  const skillListFixture = {
    schemaVersion: 1, sessionId: 's', scope: 'session-loaded-skills-only',
    skills: [
      {
        name: 'code-review', description: '评审代码变更。', source: 'project-agents', provider: 'filesystem',
        runCount: 1, lastLoadedAt: 1700000000000, lastInvocationType: 'model-invoked',
        definitionStatus: 'available', repositoryStatus: 'resolved',
      },
      {
        name: 'demo-skill', description: null, source: 'project-agents', provider: 'filesystem',
        runCount: 0, lastLoadedAt: null, lastInvocationType: null,
        definitionStatus: 'unknown-skill', repositoryStatus: 'unresolved',
      },
    ],
    skillCount: 2, limitations: [],
  }
  // 仓库来源住在 `skill.repository`——Host 把它与 `definition` 并列放在详情顶层。
  // 放错一层，「打开仓库 ↗」就永远不渲染，而测试照样绿。
  const resolvedRepository = { status: 'resolved', basis: 'frontmatter', key: 'repository', label: 'example/code-review-skill', relativePath: 'skills/code-review', cloneCommand: 'https://github.com/example/code-review-skill', limitations: [] }
  const skillDetailFixture = {
    schemaVersion: 1, skillName: 'code-review',
    summary: {
      name: 'code-review', description: '评审代码变更。', whenToUse: null,
      invocation: { modelInvocable: true, userInvocable: true }, source: 'project-agents', provider: 'filesystem',
      runCount: 1, lastLoadedAt: 1700000000000, definitionStatus: 'available', definitionReason: null,
    },
    definition: {
      schemaVersion: 1, skillName: 'code-review', available: true, reason: null, checkedAt: 1700000000000,
      summary: { description: '评审代码变更。', whenToUse: null, invocation: { modelInvocable: true, userInvocable: true }, source: 'project-agents', provider: 'filesystem' },
      resourceBase: { kind: 'directory', path: null, pathOmitted: true, url: null, note: null },
      content: {
        sha256: 'sha256:abc', returnedSha256: 'sha256:abc', bytes: 420, lineCount: 21, truncated: false,
        text: [
          '---',
          'name: code-review',
          'metadata:',
          '  repository: https://github.com/example/code-review-skill',
          '---',
          '# Purpose',
          '',
          'Review **changes** and `diff` output.',
          '',
          '## Workflow',
          '',
          '1. Read changes',
          '2. Run tests',
          '',
          '```bash',
          '# not a heading',
          'npm test',
          '```',
          '',
          '- [unsafe](javascript:alert(1))',
        ].join('\n'),
      },
      outline: [
        { id: 'purpose', level: 1, title: 'Purpose', line: 6 },
        { id: 'workflow', level: 2, title: 'Workflow', line: 10 },
      ],
      outlineTruncated: false, outlineHeadingCount: 2,
      frontmatter: { present: true, bodyStartLine: 6, keys: ['name', 'metadata'] },
      renderedEnvelope: { available: false, reason: 'rendered-envelope-not-reproducible-outside-the-harness' },
      repository: resolvedRepository,
      limitations: ['resource-base-path-withheld'],
    },
    // 声明流程来自**定义正文**。证据只标注它：`order` 原样保留，条数不由运行时反推。
    flow: {
      schemaVersion: 1, source: 'definition',
      steps: [
        {
          id: 'declared:1', order: 1, title: 'Purpose', kind: 'heading', line: 6, evidenceType: 'heading',
          evidence: { relationship: 'runtime-supported', limitation: null, runtimeEvidence: [{ type: 'invocation.request', category: 'cli' }], observedNodeIds: ['invocation:inv0'], evidenceIds: ['s:re:0'], matchedCapabilities: ['cli'], matchCount: 1, modelIntent: { present: false } },
        },
        {
          id: 'declared:2', order: 2, title: 'Workflow', kind: 'heading', line: 10, evidenceType: 'heading',
          evidence: { relationship: 'insufficient', limitation: '未观察到能对应到该步骤的 Runtime 证据。', runtimeEvidence: [], observedNodeIds: [], evidenceIds: [], matchedCapabilities: [], matchCount: 0, modelIntent: { present: false } },
        },
      ],
      channel: 'heading', note: null, headingCount: 2, orderedListCount: 1, stepCount: 2, truncated: false, withheldCount: 0, limitations: [],
    },
    anchors: { 'declared:1': 'purpose', 'declared:2': 'workflow' },
    runs: [{
      runKey: 's:te:1', eventId: 's:te:1', skillName: 'code-review', status: 'loaded', invocationType: 'model-invoked',
      turn: 1, step: 1, callSeq: 1, resultSeq: 2, requestedAt: 1700000000000, consumer: null, consumerIdentity: null,
      coverage: {},
      evidenceFingerprint: { algorithm: 'sha256', scope: 'skill-load', value: 'sha256:deadbeefdeadbeef' },
      definitionSnapshot: { observedInstructionSha256: 'sha256:abc', currentInstructionSha256: 'sha256:abc', match: 'match' },
    }],
    evidence: { hasRuntime: true, scope: 'session', invocations: [], invocationCount: 0 },
    repository: resolvedRepository,
    observation: {
      match: 'match', observedInstructionSha256: 'sha256:abc', currentInstructionSha256: 'sha256:abc',
      loadedDuringRun: true, inPublishedCatalog: true,
      catalogPublication: { observedAt: 1, seq: 2, turn: 2, step: 1, update: false, entryCount: 44, entriesDigest: 'sha256:digest' },
    },
    limitations: [],
  }
  const skillPayload = { ok: true, sessionId: 's', workspaceLabel: '工作区', list: skillListFixture, skill: skillDetailFixture }
  // 定义读不到时的形状：`definition` 只剩可用性字段，`flow.steps` 是**空数组**，
  // 限制码说明「抽不出声明流程」。绝不从运行时调用反推步骤。
  const unavailableSkill = {
    schemaVersion: 1, skillName: 'code-review',
    summary: {
      name: 'code-review', description: null, whenToUse: null,
      invocation: { modelInvocable: true, userInvocable: true }, source: 'project-agents', provider: 'filesystem',
      runCount: 1, lastLoadedAt: 1700000000000, definitionStatus: 'unknown-skill', definitionReason: 'unknown-skill',
    },
    definition: { schemaVersion: 1, skillName: 'code-review', available: false, reason: 'unknown-skill', checkedAt: 1700000000000 },
    flow: { schemaVersion: 1, source: 'definition', steps: [], channel: null, note: null, headingCount: 0, orderedListCount: 0, stepCount: 0, truncated: false, withheldCount: 0, limitations: ['definition-unavailable-so-no-declared-flow-could-be-extracted'] },
    anchors: {},
    runs: [],
    evidence: { hasRuntime: true, scope: 'session', invocations: [], invocationCount: 0 },
    repository: { status: 'unresolved', basis: null, label: null, relativePath: null, cloneCommand: null, limitations: ['no-git-work-tree-found'] },
    observation: { match: 'unavailable', observedInstructionSha256: null, currentInstructionSha256: null, loadedDuringRun: true, inPublishedCatalog: false, catalogPublication: null },
    limitations: ['definition-unavailable-so-no-declared-flow-could-be-extracted'],
  }
  // 44 条候选：越过 `AUDIT_CATALOG_LIMIT`（40），逼出「另有 N 个未列出」那条分支。
  const catalogEntries = Array.from({ length: 44 }, (unused, index) => ({ name: `skill-${index}`, description: `候选 ${index}` }))
  const catalogPayload = { ...payload, receipt: { ...payload.receipt, catalogPublished: { observedAt: 1, seq: 2, turn: 2, step: 1, update: false, entryCount: 44, entriesDigest: 'sha256:digest', entries: catalogEntries } } }

  const cases = {
    // v0.6 §6：「本次 Skill」的第一屏是卡片列表。三个形态：有卡片、空列表（宿主答了、
    // 答案是空）、还没答（loading）。卡片整体是一个 `<button>`，点它进 Detail（§6.4）。
    CurrentSkillPage: [
      [{ sessionId: 's', onOpen() {}, loadedSkillCount: 2, onMeta() {}, onRetry() {}, list: skillListFixture }],
      [{ sessionId: 's', onOpen() {}, loadedSkillCount: 2, onMeta() {}, onRetry() {}, list: { ...skillListFixture, skills: [] } }],
      [{ sessionId: 's', onOpen() {}, loadedSkillCount: 0, onMeta() {}, onRetry() {} }],
    ],
    // v0.6 §8：唯一的二级页面。三个形态：定义读得到、定义读不到（`available === false`）、
    // 还没读到（loading）。定义读不到那条最容易漏 —— 它走的是另一条渲染分支。
    SkillDetailPage: [
      [{ sessionId: 's', skillName: 'code-review', onBack() {}, backLabel: '本次 Skill', skill: skillDetailFixture }],
      [{ sessionId: 's', skillName: 'code-review', onBack() {}, backLabel: '已安装 Skill', skill: unavailableSkill }],
      [{ sessionId: 's', skillName: 'code-review', onBack() {}, skill: null }],
    ],
    SkillCard: [
      [{ name: 'code-review', description: '评审代码变更。', meta: [{ label: '已加载 1 次', tone: 'accent' }], onOpen() {} }],
      [{ name: 'demo-skill', description: null, meta: [], onOpen() {} }],
    ],
  }
  for (const [name, variants] of Object.entries(cases)) {
    const View = views[name]
    assert.equal(typeof View, 'function', `${name} must be exposed`)
    variants.forEach((props, index) => {
      assert.doesNotThrow(() => render(View(props)), `${name} threw on variant ${index}`)
    })
  }
  // 下面全部走真注入：注入的清单与详情必须**真的**渲染出来，而且要渲染成正确的形状。只比
  // 节点数是不行的：从卡片到 Markdown 渲染器到目录清单，每一层都有分支，节点数涨了不代表
  // 每个分支都对。曾经那个断言（+200 个节点）既测不出 `javascript:` 链接漏成了 `<a>`，
  // 也测不出目录条目截断写错 —— 它只证明「多了不少东西」。
  const listNodes = collect(views.CurrentSkillPage({ sessionId: 's', onOpen() {}, loadedSkillCount: 2, onMeta() {}, onRetry() {}, list: skillListFixture }))
  const detailNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', onBack() {}, backLabel: '本次 Skill', skill: skillDetailFixture }))
  const detailText = detailNodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  const detailElements = (type) => detailNodes.filter((node) => node.type === type)
  const childText = (node) => (node.children ?? []).map((child) => (typeof child === 'string' ? child : '')).join('')

  // 0. 第一屏是 Skill 卡片列表，不是运行图谱，也不是任何 Runtime 画布（§6.4）。清单按宿主
  //    给的最后加载时间倒序原样显示，卡片上**不带**运行节点数 / 边数 / 工具数。
  const cardNames = listNodes.filter((node) => node.props.className === 'st-skill-card-name').map(childText)
  assert.deepEqual(cardNames, ['code-review', 'demo-skill'], 'the first screen lists exactly the Skills this session loaded, in Host order')
  const listText = listNodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(listText.includes('评审代码变更。'), 'a Skill description is shown as written')
  assert.ok(listText.includes('已加载 1 次'), 'each card states how many times the Skill was loaded')
  assert.equal(listNodes.filter((node) => node.props.className === 'st-flow-node').length, 0, 'the list page renders no runtime graph node')
  const cardOpeners = listNodes.filter((node) => node.props.className === 'st-skill-card')
  assert.equal(cardOpeners.length, 2, 'each Skill is one card')
  assert.equal(typeof cardOpeners[0].props.onClick, 'function', 'the whole card is the control that opens the detail page')

  // 1. Markdown 渲染器认得出标题、行内代码、围栏块。
  const headingText = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].flatMap((tag) => detailElements(tag).map(childText))
  assert.ok(headingText.includes('Purpose') && headingText.includes('Workflow'), 'the outline headings become heading elements')
  assert.ok(!headingText.some((heading) => heading.includes('not a heading')), 'a # inside a fenced code block must not become a heading')
  assert.ok(detailText.includes('# not a heading'), 'the fenced block keeps its content verbatim, as code')
  assert.ok(detailText.includes('diff'), 'inline code is rendered')
  assert.ok(detailText.includes('changes') && !detailText.includes('**changes**'), 'bold is rendered as <strong>, not left as literal asterisks')
  // 面板自己已经有层级，所以正文标题降一级：`# Purpose` 是 h2，页面里不会出现第二个 h1。
  assert.ok(!detailElements('h1').some((node) => childText(node).includes('Purpose')), 'a body heading never becomes another <h1>')
  // 锚点 id 取自宿主 outline 的条目 id；客户端二次 slug 一旦和它不一致就会锚错段落。
  assert.ok(detailNodes.some((node) => node.props.id === 'st-audit-doc-purpose' && node.type === 'h2'), 'the heading id comes from the Host outline entry, not a client-side slug')

  // 2. 第三方 SKILL.md 能写任何东西。只有 http(s) 允许变成链接，其余协议必须退化成纯文本，
  //    否则一份 Skill 文档就能把 `javascript:` 带进界面（§9.4）。
  const anchors = detailElements('a')
  assert.ok(anchors.every((node) => /^https?:\/\//i.test(String(node.props.href))), 'only http(s) hrefs may become anchors')
  assert.ok(detailText.includes('javascript:alert(1)'), 'a non-http link degrades to plain text instead of an anchor')
  const external = anchors.filter((node) => node.props.target === '_blank')
  assert.equal(external.length, 1, 'a resolved repository is offered exactly once, from the Definition column')
  assert.equal(external[0].props.href, 'https://github.com/example/code-review-skill', 'the external link points at the resolved clone command')
  assert.ok(/noopener/.test(String(external[0].props.rel)), 'external links carry rel="noreferrer noopener"')

  // 2b. §11.9：仓库没解析出来时，界面上不能出现猜测出来的链接，也不能留一个禁用态的占位。
  const unresolvedSkill = {
    ...skillDetailFixture,
    repository: { status: 'unresolved', basis: null, label: null, relativePath: null, cloneCommand: null, limitations: ['no-git-work-tree-found'] },
    definition: { ...skillDetailFixture.definition, repository: { status: 'unresolved', basis: null, label: null, relativePath: null, cloneCommand: null, limitations: ['no-git-work-tree-found'] } },
  }
  const unresolvedNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', onBack() {}, skill: unresolvedSkill }))
  assert.equal(unresolvedNodes.filter((node) => node.type === 'a' && node.props.target === '_blank').length, 0, 'an unresolved repository must not invent a link')
  assert.ok(unresolvedNodes.some((node) => node.type === '#text' && node.text.includes('未解析')), 'the surface states the repository is unresolved rather than staying blank')
  assert.ok(unresolvedNodes.some((node) => node.type === '#text' && /没有找到 git work tree/.test(node.text)), 'it repeats the limitation code in words')

  // 2c. 定义读不到：正文没有可显示的内容，界面既不能从运行时的调用反推出一串假步骤，也不能
  //     把缺一半哈希写成「文件已改变」——那是从缺失推出的结论（§10.2）。
  const unavailableNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', onBack() {}, skill: unavailableSkill }))
  const unavailableText = unavailableNodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(unavailableText.includes('这份 Skill 的定义当前读不到'), 'the empty document explains itself')
  assert.ok(unavailableText.includes('无法比对'), 'a missing fingerprint pair is stated as 无法比对')
  assert.ok(!unavailableText.includes('文件已改变'), 'an unavailable comparison must never be reported as a mismatch')
  assert.ok(!unavailableText.includes('已失效'), 'an unavailable comparison must never be reported as "the Skill is void"')
  assert.equal(unavailableNodes.filter((node) => node.props.className === 'st-audit-step').length, 0, 'an unavailable definition yields no synthesised flow step')

  // 3. 空列表：宿主答了、答案是空的，这才是空态。三种"没有卡片"的原因必须分开说（§6.5）。
  const emptyNodes = collect(views.CurrentSkillPage({ sessionId: 's', onOpen() {}, loadedSkillCount: 0, onMeta() {}, onRetry() {}, list: { ...skillListFixture, skills: [] } }))
  assert.equal(emptyNodes.filter((node) => node.props.className === 'st-skill-card').length, 0, 'an empty answer renders no card')
  assert.ok(emptyNodes.some((node) => node.type === '#text' && node.text.includes('当前对话暂未加载可追踪的 Skill。')), 'the empty state says exactly what happened')
  const loadingNodes = collect(views.CurrentSkillPage({ sessionId: 's', onOpen() {}, loadedSkillCount: 0, onMeta() {}, onRetry() {} }))
  assert.equal(loadingNodes.filter((node) => node.props.className === 'st-skill-card').length, 0, 'a pending read renders no card')

  // 4. 段控与翻译按钮的默认态：原文 active、按钮写「翻译」；译文只活在组件内存里（§12.4），
  //    所以初始渲染里不可能已经有一份译文。
  const segButtons = detailNodes.filter((node) => node.props.className === undefined && node.type === 'button' && node.children?.includes('原文'))
  assert.equal(segButtons.length, 1, 'the segmented control offers 原文')
  assert.equal(segButtons[0].props['data-active'], true, '原文 is the default segment')
  const translateButtons = detailNodes.filter((node) => node.props.className === 'st-translate')
  assert.equal(translateButtons.length, 1, 'the detail page offers exactly one translate button')
  assert.ok(childText(translateButtons[0]).includes('翻译'), 'the idle state reads 翻译')
  assert.ok(detailText.includes('只读展示'), 'the document header states the file is read-only')
  assert.ok(detailText.includes('原文逐字来自 Skill 定义文件'), 'the notice states where the original text comes from')
  const outlineItems = detailNodes.filter((node) => node.props.className === 'st-detail-outline-item')
  assert.deepEqual(outlineItems.map(childText), ['Purpose', 'Workflow'], 'the outline lists the document headings in order')

  // 5. §8.4：Detail 记住的是"从哪个列表进来"，所以返回按钮的措辞由调用方给，不是写死的。
  const fromInstalled = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', onBack() {}, backLabel: '已安装 Skill', skill: skillDetailFixture }))
  const backLabelText = fromInstalled.filter((node) => node.props.className === 'st-detail-back').map(childText)[0]
  assert.ok(backLabelText.includes('已安装 Skill'), 'the back label follows the list the user came from')
  assert.ok(!backLabelText.includes('本次 Skill'), 'it does not hard-code one list')

  // 6. `invocationLabel` 与 `runSourceLabel` 回答的是两个不同的问题，不能互相顶替：
  //    「没有加载记录」是「未使用」，不是「未知来源」。
  const invocationLabel = module.exports.__pure.invocationLabel
  assert.equal(typeof invocationLabel, 'function', 'the invocation wording must be exposed to the smoke test')
  assert.equal(invocationLabel('model-invoked'), 'model')
  assert.equal(invocationLabel('user-explicit'), '/name')
  assert.equal(invocationLabel(null), '未使用')
  assert.equal(invocationLabel({ modelInvocable: true, userInvocable: false }), 'model')
  assert.equal(invocationLabel({ modelInvocable: false, userInvocable: true }), '/name')
  assert.equal(invocationLabel({ modelInvocable: true, userInvocable: true }), 'model / /name')
})

test('an unreachable Skill list is not reported as "no Skill was loaded"', () => {
  const client = loadClient()
  // 断言中文文案，所以要先真的挂上 zh：`localized()` 拿不到 locale 时会退回英文，
  // 而这一屏的措辞正是被测对象。
  client.apply({
    effect(setup) { return setup?.() },
    locale: {
      bind: () => (value) => value,
      register: () => () => {},
      getSnapshot: () => ({ active: 'zh', lang: 'zh' }),
      subscribe: () => () => {},
    },
    workspaces: { getSnapshot: () => ({ active: null }), subscribe: () => () => {} },
    slots: { inject(_name, run) { run() }, register() {} },
  })
  const resolve = client.__pure.resolveSkillListState
  assert.equal(typeof resolve, 'function', 'the first-screen state resolver must be exposed to the smoke test')

  // 升级窗口：客户端已经更新、宿主进程还是旧的，`/skills` 直接 404。这时收据里明明记着
  // Skill，页头也在数它们——正文如果写「暂未加载」，同一屏上就自相矛盾。
  const unavailable = resolve({ hasSkills: false, hasDetail: false, loading: false, listError: 'not found', loadedSkillCount: 1 })
  assert.equal(unavailable.kind, 'error', 'an unreachable list endpoint is an error, not an empty state')
  assert.ok(!unavailable.message.includes('暂未加载'), 'it must not claim nothing was loaded while the receipt says otherwise')
  assert.ok(unavailable.message.includes('1 个 Skill'), 'it repeats the count the receipt already knows')
  assert.ok(unavailable.message.includes('重启'), 'it tells the user what to do about it')

  // 拉不到、而且收据里也没有加载记录：仍然是错误态，但不能凭空写「0 个 Skill」。
  const unknown = resolve({ hasSkills: false, hasDetail: false, loading: false, listError: 'not found', loadedSkillCount: 0 })
  assert.equal(unknown.kind, 'error', 'an unreachable endpoint stays an error even when the count is unknown')
  assert.ok(!unknown.message.includes('0 个 Skill'), 'a zero count is not spelled out')

  // 宿主答了、答案是空列表：这才是真的空态。
  assert.equal(resolve({ hasSkills: false, hasDetail: false, loading: false, listError: '', loadedSkillCount: 0 }).kind, 'empty', 'an empty answer from the host is the empty state')
  // 加载中优先于错误：还不知道结果时不能先报错。
  assert.equal(resolve({ hasSkills: false, hasDetail: false, loading: true, listError: 'not found', loadedSkillCount: 1 }).kind, 'loading', 'loading outranks the previous error')
  // 有内容时什么都不返回，正文照常渲染。
  assert.equal(resolve({ hasSkills: true, hasDetail: false, loading: false, listError: '', loadedSkillCount: 1 }), null, 'a non-empty list yields no placeholder')
  assert.equal(resolve({ hasSkills: false, hasDetail: true, loading: false, listError: 'not found', loadedSkillCount: 1 }), null, 'a detail alone yields no placeholder')
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
