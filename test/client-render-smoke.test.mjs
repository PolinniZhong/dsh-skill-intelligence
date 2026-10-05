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
 * Slice one top-level `function`/`async function` body out of the Host source.
 *
 * 「宿主读哪些 `payload.*`」那两条测试原来扫的是**整份宿主源码**，并且靠一句注释
 * （「`payload.` 只有 `handleClone` 用」）来保证扫到的就是那一条路由。v0.9.1 加了第二条
 * 读 `payload.*` 的路由之后，那句话不再成立，而**悄悄放宽成并集**恰好会放过这条测试
 * 要防的那种缝（客户端少发一个字段，两边的测试都还是绿的）。
 *
 * 边界取「下一个顶格的 `function` / `async function`」：这些处理器都写在模块顶层，
 * 缩进的嵌套具名函数不会被误当边界。
 */
function hostFunctionBody(text, name) {
  const start = text.search(new RegExp(`^[ \\t]*(?:async )?function ${name}\\(`, 'm'))
  assert.ok(start >= 0, `the Host must still declare ${name} — otherwise this guard is vacuous`)
  const indent = (/^[ \t]*/.exec(text.slice(start)) || [''])[0]
  // 边界必须**同级缩进**：这些处理器都写在同一个工厂函数里（`    async function handleDiff`），
  // 用「下一个顶格 function」当边界会一路扫到文件末尾，把别人的字段也算进来。
  const rest = text.slice(start + 1)
  const next = rest.search(new RegExp(`\\n${indent}(?:async )?function `))
  return next >= 0 ? text.slice(start, start + 1 + next) : text.slice(start)
}

/**
 * A require that resolves the seed words, React Flow's stub, stylesheets as text, and
 * the client's own relative modules by evaluating them the same way.
 */
/**
 * The smoke harness evaluates modules as CommonJS, but `src/core/*.mjs` are ESM.
 * esbuild rewrites them for the real bundle; this lowers the shapes the
 * client actually imports — named `export function` declarations, `export const`
 * tables, and single-line named `import { … } from '…'` — and fails loudly on
 * anything else so a new form cannot be lowered silently.
 *
 * `export const` arrived with the flow-evidence vocabulary: those frozen tables are
 * data the client reads directly, and rewriting them into accessor functions purely
 * to please a test harness would be the tail wagging the dog. `import` arrived with
 * the runtime-logic view: it reads that same vocabulary, and whether a core module
 * may be read by the client must not depend on how many dependencies it happens to
 * have. The guarantee that matters is unchanged — an unrecognised form still throws
 * instead of being skipped.
 */
function lowerEsmToCjs(code, target) {
  const withRequires = code.replace(
    /^import\s+\{([^}]*)\}\s+from\s+'([^']+)'\s*$/gm,
    (_whole, names, spec) => `const {${names}} = require('${spec}')`,
  )
  if (/^import /m.test(withRequires)) {
    throw new Error(`client-modules: ${target} uses an import form this harness cannot lower`)
  }
  const names = [...withRequires.matchAll(/^export (?:function|const|let|class) (\w+)/gm)].map((match) => match[1])
  const stripped = withRequires.replace(/^export (function|const|let|class) /gm, '$1 ')
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
    fetch: overrides.fetch ?? (async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' })),
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
  // v0.9.0「Skill 验收」：这份形状照 `buildSkillValidation()` 的真实输出写。要害只有一条 ——
  // `profiles[].label` 是**双语对象**（`{zh, en}`），不是字符串。直接把它当 children 交给 React 会抛
  // #31（Objects are not valid as a React child），而 `conversation.view` 没有错误边界，整页会白屏。
  // 真机上就是这样白屏的（渲染台截图只剩背景色）；这份 fixture 让那条岔路真的走一遍。
  const validationFixture = {
    schemaVersion: 1, skillName: 'code-review', checkedAt: 1700000000000, available: true, reason: null,
    status: 'needs-fix', profileIds: ['common', 'dsh'],
    profiles: [
      { id: 'common', label: { zh: 'Common Core', en: 'Common Core' }, note: null, status: 'needs-fix', errors: 1, warnings: 0, info: 0, skipped: 2, checked: 17, total: 19 },
      { id: 'microsoft', label: { zh: 'Microsoft', en: 'Microsoft' }, note: null, status: 'pass', errors: 0, warnings: 0, info: 0, skipped: 0, checked: 4, total: 4 },
    ],
    summary: { errors: 1, warnings: 0, info: 0, skipped: 2 },
    findings: [{ id: 'CORE-REF-002', profile: 'common', severity: 'error', title: '引用路径逃出 Skill 根目录', fact: 'reference-escape', source: 'agentskills', detail: '第 56 行的链接指向 `../../examples/animation-storyboard.md`，已经越过 SKILL.md 所在的目录。' }],
    rules: [
      { id: 'CORE-REF-002', profile: 'common', severity: 'error', title: '引用路径逃出 Skill 根目录', fact: 'reference-escape', source: 'agentskills', state: 'fired' },
      { id: 'CORE-COMPAT-001', profile: 'common', severity: 'error', title: 'compatibility 字段过长', fact: 'compatibility-length', source: 'agentskills', state: 'skipped' },
    ],
    skipped: [
      { id: 'CORE-COMPAT-001', profile: 'common', severity: 'error', title: 'compatibility 字段过长', reason: 'compatibility-absent' },
      { id: 'CORE-REF-001', profile: 'common', severity: 'error', title: '引用的资源不存在', reason: 'no-directory-listing' },
    ],
    notes: ['这次没有拿到这个 Skill 的目录清单，目录类规则没有参与判定。'],
    limitations: ['静态验收只读 SKILL.md 与目录清单，不执行 Skill 里的任何脚本。', '这里没有被指出问题，不等于这份 Skill 的指令一定有效果 —— 那属于行为验证。'],
    content: { lineCount: 21, bodyLineCount: 18, bytes: 420, frontmatterPresent: true, frontmatterClosed: true, frontmatterFields: ['name', 'description'], name: 'code-review', descriptionLength: 12, directoryName: 'code-review', resourcePathCount: 1, referenceCount: 1, truncated: false },
  }
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
    // v0.8：新宿主的详情响应里**总是**有这个键；`null` = 本插件没执行过这次复刻。
    lineage: null,
    // v0.9.0：验收结果随详情一起回（`buildSkillDetail` 的 `validation`）。
    validation: validationFixture,
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
    lineage: null,
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
      [{ sessionId: 's', skillName: 'code-review', skill: skillDetailFixture }],
      [{ sessionId: 's', skillName: 'code-review', skill: unavailableSkill }],
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
  const detailNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', skill: skillDetailFixture }))
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
  const unresolvedNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', skill: unresolvedSkill }))
  assert.equal(unresolvedNodes.filter((node) => node.type === 'a' && node.props.target === '_blank').length, 0, 'an unresolved repository must not invent a link')
  assert.ok(unresolvedNodes.some((node) => node.type === '#text' && node.text.includes('未解析')), 'the surface states the repository is unresolved rather than staying blank')
  assert.ok(unresolvedNodes.some((node) => node.type === '#text' && /没有找到 git work tree/.test(node.text)), 'it repeats the limitation code in words')

  // 2c. 定义读不到：正文没有可显示的内容，界面既不能从运行时的调用反推出一串假步骤，也不能
  //     把缺一半哈希写成「文件已改变」——那是从缺失推出的结论（§10.2）。
  const unavailableNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', skill: unavailableSkill }))
  const unavailableText = unavailableNodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(unavailableText.includes('这份 Skill 的定义当前读不到'), 'the empty document explains itself')
  assert.ok(unavailableText.includes('无法比对'), 'a missing fingerprint pair is stated as 无法比对')
  assert.ok(!unavailableText.includes('文件已改变'), 'an unavailable comparison must never be reported as a mismatch')
  assert.ok(!unavailableText.includes('已失效'), 'an unavailable comparison must never be reported as "the Skill is void"')
  assert.equal(unavailableNodes.filter((node) => node.props.className === 'st-audit-step').length, 0, 'an unavailable definition yields no synthesised flow step')

  // 2d. v0.9.0「Skill 验收」：验收卡必须真的把三项事实渲染成文字 —— 结论、Profile 的双语标签、
  //     以及那条 fired 的发现（带 rule id）。`profiles[].label` 是 `{zh, en}` 对象，少选一次语言
  //     就会抛 React #31 并白屏；所以这里断言的是**文字真的出现了**，不是「节点数变了」。
  assert.ok(detailText.includes('Skill 验收'), 'the detail page states that it validated the Skill')
  assert.ok(detailText.includes('需要修正'), 'a needs-fix verdict is rendered in words, not as a score')
  assert.ok(detailText.includes('Common Core') && detailText.includes('Microsoft'), 'each profile label is localized out of its {zh, en} object and rendered')
  assert.ok(detailText.includes('CORE-REF-002') && detailText.includes('引用路径逃出 Skill 根目录'), 'a finding carries its rule id and title')
  assert.ok(detailText.includes('../../examples/animation-storyboard.md'), 'the finding says which reference escaped, verbatim')
  assert.ok(detailText.includes('错误 1') && detailText.includes('未判定 2'), 'the summary counts errors and non-judged rules separately')
  assert.ok(detailText.includes('这次没有判定') && detailText.includes('这份 SKILL.md 没有 compatibility 字段。'), 'a skipped rule states why it was not judged, instead of looking like a pass')
  const validationNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', skill: skillDetailFixture }))
  assert.equal(validationNodes.filter((node) => node.props['data-role'] === 'validation-finding').length, 1, 'one fired rule renders exactly one finding row')
  assert.equal(validationNodes.filter((node) => node.props['data-role'] === 'validation-skipped-rule').length, 2, 'two skipped rules render two rows')
  assert.ok(validationNodes.some((node) => node.props['data-role'] === 'validation-limitations'), 'the panel states what the check does not cover')
  // 字段缺失这一支：宿主还没换到这一版时，响应里**没有** `validation` 这个键 —— 必须说清是宿主旧，
  // 而不是「这份 Skill 不符合规范」（§6.11）。注意要真的把键去掉：写成 `{ ...fixture, validation: undefined }`
  // 那个键仍然存在（`hasOwnProperty` 为真），走的是另一条分支。
  const { validation: omittedValidation, ...detailWithoutValidation } = skillDetailFixture
  assert.equal(omittedValidation, validationFixture, 'the fixture used below must be the one carrying a validation result')
  const missingFieldNodes = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', skill: detailWithoutValidation }))
  const missingFieldText = missingFieldNodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(missingFieldText.includes('这次详情响应里没有验收结果。'), 'a response with no validation field says the host is old, not that the Skill failed')
  assert.ok(!missingFieldText.includes('不符合规范'), 'a missing field must never be read as a verdict')

  // 3. 空列表：宿主答了、答案是空的，这才是空态。三种"没有卡片"的原因必须分开说（§6.5）。
  const emptyNodes = collect(views.CurrentSkillPage({ sessionId: 's', onOpen() {}, loadedSkillCount: 0, onMeta() {}, onRetry() {}, list: { ...skillListFixture, skills: [] } }))
  assert.equal(emptyNodes.filter((node) => node.props.className === 'st-skill-card').length, 0, 'an empty answer renders no card')
  assert.ok(emptyNodes.some((node) => node.type === '#text' && node.text.includes('当前对话暂未加载任何 Skill。')), 'the empty state says exactly what happened')
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
  const fromInstalled = collect(views.DetailBackButton({ backLabel: '已安装 Skill', onBack() {} }))
  const backLabelText = fromInstalled.filter((node) => node.props.className === 'st-detail-back').map(childText)[0]
  const noBackInPage = collect(views.SkillDetailPage({ sessionId: 's', skillName: 'code-review', skill: skillDetailFixture }))
    .filter((node) => node.props.className === 'st-detail-back')
  assert.equal(noBackInPage.length, 0, 'the detail body no longer renders the back button: the topbar does')
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

// ── Skill 框架 ────────────────────────────────────────────────────────────────
//
// 这一块的全部风险都在措辞上，而措辞只有渲染出来才看得见。源码里搜「未执行」搜不到任何东西，
// 因为那句话本来就不该存在于源码 —— 它是一条**不存在的分支**，只能靠把四种证据状态都渲染一遍
// 来证明它没有出现。

const frameFlow = {
  schemaVersion: 1,
  source: 'definition',
  steps: [
    {
      id: 'declared:1', order: 1, title: '读取变更', kind: 'inspect', line: 3, evidenceType: 'heading',
      evidence: { relationship: 'runtime-supported', limitation: null, matchCount: 1 },
    },
    {
      id: 'declared:2', order: 2, title: '运行测试', kind: 'execute', line: 8, evidenceType: 'heading',
      evidence: { relationship: 'partial', limitation: '只观察到部分相关证据。', matchCount: 1 },
    },
    {
      id: 'declared:3', order: 3, title: '写报告', kind: 'produce', line: 14, evidenceType: 'heading',
      evidence: { relationship: 'insufficient', limitation: '证据不足不等于 Agent 没有执行该步骤。', matchCount: 0 },
    },
    // 第四次：没有 evidence 字段，也没有锚点。两件事同时缺，是真实载荷里最常见的一步。
    { id: 'declared:4', order: 4, title: '未知步骤', kind: 'mystery', line: 20, evidenceType: 'heading' },
  ],
  truncated: false, stepCount: 4,
}

function mountChineseClient(overrides = {}) {
  const client = loadClient(overrides)
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
  return client
}

test('the declared flow renders as a flow, and evidence only annotates it', () => {
  const client = mountChineseClient()
  const texts = (nodes) => nodes.filter((node) => node.type === '#text').map((node) => node.text)

  const clicked = []
  const nodes = collect(client.__views.SkillFramework({
    flow: frameFlow,
    anchors: { 'declared:1': 'a1', 'declared:2': 'a2', 'declared:3': 'a3' },
    definitionAvailable: true,
    flash: null,
    onStepClick: (id) => clicked.push(id),
  }))
  const text = texts(nodes).join('\n')

  // 1. 四步都在，顺序就是定义里的顺序 —— 运行时不许重排。
  const steps = nodes.filter((node) => node.props.className === 'st-framework-step')
  assert.equal(steps.length, 4, 'every declared step gets a node')
  assert.deepEqual(steps.map((node) => node.children[1]?.children?.[0]), ['读取变更', '运行测试', '写报告', '未知步骤'],
    'the order comes from the declaration, and nothing else may change it')

  // 2. 序号、类型、状态各占一格 —— 类型与状态不能合成一句话。
  assert.deepEqual(texts(nodes).filter((value) => /^0\d$/.test(value)), ['01', '02', '03', '04'])
  assert.ok(text.includes('查阅') && text.includes('运行') && text.includes('产出'), 'the kind column names the category')
  assert.ok(text.includes('其它'), 'an unrecognised kind degrades to 其它 instead of being dropped')

  // 3. 四种证据状态各自的说法。
  assert.ok(text.includes('有相关运行证据'), 'runtime-supported reads as an observation')
  assert.ok(text.includes('部分相关证据'), 'partial reads as an observation')
  assert.ok(text.includes('暂无足够证据'), 'insufficient reads as "not enough", never as "not executed"')
  assert.ok(text.includes('无法判断'), 'a missing relationship reads as unknown, not as absent')

  // 4. 这一条是整个功能的底线：任何一句都不能是结论。
  for (const forbidden of ['已执行', '未执行', '已完成', '未完成', '执行成功', '执行失败']) {
    assert.ok(!text.includes(forbidden), `the framework must never say ${forbidden}`)
  }

  // 5. 免责句逐字在标题下面，不是 tooltip、不是折叠区。
  assert.ok(text.includes('流程来自 SKILL.md 的声明；运行证据仅用于标注当前会话中的相关观察，不代表 Agent 内部推理过程。'),
    'the disclaimer is rendered with the flow, not hidden behind it')

  // 6. 有锚点的步骤是可点的按钮，没锚点的是不可点的元素 —— 不能给一个点了没反应的按钮。
  const buttons = steps.filter((node) => node.type === 'button')
  const statics = steps.filter((node) => node.type === 'div' && node.props['data-static'] === 'true')
  assert.equal(buttons.length, 3, 'three steps have an anchor in the document')
  assert.equal(statics.length, 1, 'the step with no anchor is rendered as static, not as a dead button')

  buttons[1].props.onClick()
  assert.deepEqual(clicked, ['a2'], 'clicking a step asks the document to jump to its anchor')

  // 7. 状态色只是旁证，tone 跟着关系走。
  assert.deepEqual(steps.map((node) => node.props['data-state']), ['observed', 'partial', 'none', 'unknown'])

  // 8. 悬停展开的那句限制来自核心层，不是界面自己编的。
  const limited = steps[2].children[3]
  assert.equal(limited.props.title, '证据不足不等于 Agent 没有执行该步骤。',
    'the tooltip carries the core layer\'s own sentence about what this state means')

  // 9. 箭头只在段与段之间。
  assert.equal(nodes.filter((node) => node.props.className === 'st-framework-arrow').length, 3,
    'n steps have n-1 arrows: a trailing arrow would point at nothing')
})

test('the framework states its own emptiness instead of inventing a flow', () => {
  const client = mountChineseClient()
  const textOf = (element) => collect(element)
    .filter((node) => node.type === '#text').map((node) => node.text).join('\n')

  // 定义读不到：不画伪流程。空数组 + 「读不到」两句话是**不同**的两句。
  const unavailable = textOf(client.__views.SkillFramework({
    flow: { steps: [], truncated: false }, anchors: {}, definitionAvailable: false, flash: null, onStepClick() {},
  }))
  assert.ok(unavailable.includes('这份 Skill 的定义当前读不到'), 'an unreadable definition says so')
  assert.ok(!unavailable.includes('没有可抽取的声明流程'), 'an unreadable definition is not the same as an empty one')
  assert.equal(collect(client.__views.SkillFramework({
    flow: { steps: [], truncated: false }, anchors: {}, definitionAvailable: false, flash: null, onStepClick() {},
  })).filter((node) => node.props.className === 'st-framework-step').length, 0,
  'no step may be synthesised from anything other than the definition')

  // 定义读得到、但抽不出步骤。
  const empty = textOf(client.__views.SkillFramework({
    flow: { steps: [], truncated: false }, anchors: {}, definitionAvailable: true, flash: null, onStepClick() {},
  }))
  assert.ok(empty.includes('当前 Skill 没有可抽取的声明流程。'), 'the empty state speaks about extraction')

  // flow 整个是 null（宿主还没答）时不能抛。
  assert.ok(textOf(client.__views.SkillFramework({ flow: null, anchors: null, definitionAvailable: true, flash: null, onStepClick() {} }))
    .includes('没有可抽取'), 'a missing flow renders the empty state rather than throwing')

  // 截断：流程可能不完整这件事必须说出来，而不是安静地少几步。
  const truncated = textOf(client.__views.SkillFramework({
    flow: { ...frameFlow, truncated: true }, anchors: {}, definitionAvailable: true, flash: null, onStepClick() {},
  }))
  assert.ok(truncated.includes('当前定义正文被截断，声明流程可能不完整。'), 'a truncated body warns that the flow may be incomplete')

  // 高亮跟着锚点走：点到哪一步，哪一步亮。
  const active = collect(client.__views.SkillFramework({
    flow: frameFlow, anchors: { 'declared:2': 'workflow' }, definitionAvailable: true, flash: 'workflow', onStepClick() {},
  })).filter((node) => node.props.className === 'st-framework-step')
  assert.deepEqual(active.map((node) => node.props['data-active']), [undefined, 'true', undefined, undefined],
    'the step whose anchor is being flashed is the only one marked active')
})

// ── 框架 / 运行逻辑 / 步骤证据：三层各自的界面 ───────────────────────────────
//
// 这三张卡回答三个不同的问题（Skill 由什么组成 / 这次会话观察到了什么 / 每一步凭什么这么说），
// 所以它们必须能分开渲染、分开断言。混成一张图正是这一版要改掉的毛病。

const frameFramework = {
  schemaVersion: 1, source: 'definition',
  titleEntry: { id: 'ui-craft', title: 'UI Craft', line: 1 },
  sectionCount: 3,
  sections: [
    { id: 'framework:preamble', title: 'UI Craft', line: 1, anchorId: 'ui-craft', role: 'identity', synthetic: true,
      opening: '你是一个有品味的设计工程师。', items: [], itemCount: 0, itemsTruncated: false },
    { id: 'rules', title: '核心规则', line: 40, anchorId: 'rules', role: 'rules', synthetic: false,
      opening: '发布任何界面前先问自己一句话。', items: ['不要默认用蓝色', '不要用全大写标题', '不要卡片网格'], itemCount: 44, itemsTruncated: false },
    { id: 'framework:trigger', title: null, line: null, anchorId: null, role: 'trigger', synthetic: true, source: 'summary',
      opening: '用在做界面设计与实现的工作上。', items: [], itemCount: 0, itemsTruncated: false },
    { id: 'odd', title: '其它章节', line: 90, anchorId: 'odd', role: null, synthetic: false,
      opening: '', items: [], itemCount: 0, itemsTruncated: false },
  ],
  roles: [
    { role: 'identity', label: { zh: '定位 · Purpose', en: 'Purpose' }, hint: { zh: '这个 Skill 是干什么的', en: 'What this Skill is' }, sections: ['framework:preamble'] },
    { role: 'rules', label: { zh: '规则 · Rules', en: 'Rules' }, hint: { zh: '它的核心规则', en: 'Its core rules' }, sections: ['rules'] },
  ],
  unclassified: ['odd'],
  chain: [
    { id: 'catalog', order: 1, label: { zh: 'Skill 目录', en: 'Skill catalog' } },
    { id: 'load', order: 2, label: { zh: '载入 Skill', en: 'Skill load' } },
    { id: 'instructions', order: 3, label: { zh: 'SKILL.md 全文', en: 'Full SKILL.md' } },
    { id: 'base', order: 4, label: { zh: '资源基准路径', en: 'Resource base' } },
    { id: 'declared', order: 5, label: { zh: '被引用的资源', en: 'Referenced resources' } },
    { id: 'ondemand', order: 6, label: { zh: '按需读取', en: 'Read on demand' } },
  ],
  coverage: { present: ['identity', 'rules'], absent: ['verification', 'resources'] },
  resources: {
    declared: [
      { order: 1, path: 'references/tokens.md', label: 'references/tokens.md', line: 300, groupLine: 296, when: '三层 token 主干。', anchorId: 'reference-files', declaredIn: 'Reference Files', role: 'resources', group: 'Tier 1', alsoDeclaredAt: [] },
      { order: 2, path: 'references/brief.md', label: 'references/brief.md', line: 7, groupLine: 296, when: '先读它，它锚定后面每一个决定。', anchorId: 'reference-files', declaredIn: 'Reference Files', role: 'resources', group: 'Tier 1', alsoDeclaredAt: [15] },
    ],
    declaredCount: 2, loaded: [], loadedCount: 0,
    groups: [{ title: 'Tier 1', count: 2, resourcePaths: ['references/tokens.md', 'references/brief.md'] }],
    tiers: [{ title: 'Tier 1 — Required', count: 2, line: 296, role: 'resources', resourcePaths: ['references/tokens.md', 'references/brief.md'] }],
    base: { kind: 'directory', pathOmitted: true },
    note: { zh: '声明资源不等于已加载资源。', en: 'Declared resources are not loaded resources.' },
  },
  limitations: ['declared-resources-are-not-loaded-resources'],
}

test('the framework shows the Skill’s structure, not a four-step strip', () => {
  const client = mountChineseClient()
  const clicked = []
  const nodes = collect(client.__views.SkillFramework({
    framework: frameFramework, flow: frameFlow,
    anchors: { 'framework:preamble': 'ui-craft', rules: 'rules' },
    definitionAvailable: true, flash: null, onStepClick() {}, onAnchorClick: (id) => clicked.push(id),
  }))
  const text = nodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')

  // 1. 角色是模块，标题来自核心层，不是界面自己编的。
  const modules = nodes.filter((node) => node.props.className === 'st-fw-module')
  assert.equal(modules.length, 3, '两个认识的角色 + 一组其它章节')
  assert.ok(text.includes('定位 · Purpose') && text.includes('规则 · Rules'), '角色标签来自核心层')
  assert.ok(text.includes('其它章节'), '认不出角色的小节收进「其它章节」，而不是丢掉')

  // 2. 没出现的角色必须说「没有」，而不是留白让读者以为漏了。
  assert.ok(nodes.some((node) => node.props.className === 'st-fw-absent' && node.children?.some?.((c) => String(c).includes('Verification'))),
    'a role the document never writes out is named as absent, not left blank')

  // 3. 一个小节显示：标题、行号、条目数，以及被截断时的总数。
  assert.ok(text.includes('核心规则') && text.includes('44 项'), '条目数是**总数**，不是渲染出来的三条')
  const longSection = nodes.find((node) => node.props.className === 'st-fw-section' && node.children?.some?.((c) => c?.props?.className === 'st-fw-items'))
  assert.equal(longSection.children.find((c) => c?.props?.className === 'st-fw-items') === undefined, false, 'items render as a list')
  assert.ok(text.includes('不要默认用蓝色'), 'the first items are shown verbatim')

  // 4. 从 description 合成出来的小节说的是来源，不是「无标题」——原文本来就没有这一节。
  assert.ok(text.includes('来自 Skill 描述'), 'a synthesised section names its source')
  assert.ok(!text.includes('（无标题）'), 'nothing is labelled untitled when we know where it came from')

  // 5. 有锚点的小节是按钮，没锚点的是静态元素。合成出来的小节没有锚点。
  const sectionNodes = nodes.filter((node) => node.props.className === 'st-fw-section')
  assert.equal(sectionNodes.filter((node) => node.type === 'button').length, 2, '两节在文档里找得到锚点')
  assert.equal(sectionNodes.filter((node) => node.props['data-static'] === 'true').length, 2, '两节没有锚点，就不做成按钮')
  sectionNodes.find((node) => node.type === 'button').props.onClick()
  assert.deepEqual(clicked, ['ui-craft'], '点击小节复用同一个 flashAnchor，不新开页面或运行图')

  // 6. 框架的免责句与声明流程的是**两句**：一句说来源，一句说证据的边界。
  assert.ok(text.includes('框架来自 SKILL.md 自身的章节结构') && text.includes('也不会由运行证据反推'),
    'the structure note states what the framework is read from, in the core layer’s own words')
  assert.ok(text.includes('流程来自 SKILL.md 的声明'), 'the declared-flow disclaimer is still rendered')
})

test('progressive disclosure counts the references and claims no reads', () => {
  const client = mountChineseClient()
  const nodes = collect(client.__views.ProgressiveDisclosure({ framework: frameFramework, onAnchorClick() {} }))
  const text = nodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')

  assert.deepEqual(
    nodes.filter((node) => node.props.className === 'st-fw-chain-label').map((node) => node.children[0]),
    ['Skill 目录', '载入 Skill', 'SKILL.md 全文', '资源基准路径', '被引用的资源', '按需读取'],
    'the chain comes from the core layer, so the interface cannot invent a stage')

  assert.ok(text.includes('声明引用 2 个 · 已读取 0 个'), 'the counts are declared vs read, said out loud')
  assert.ok(text.includes('Tier 1 — Required'), 'tier titles come from the document’s own headings')
  assert.ok(text.includes('references/brief.md') && text.includes('先读它，它锚定后面每一个决定。'),
    'each reference shows its path and the document’s own words for when to read it')
  assert.ok(text.includes('资源基准：directory（路径已省略）'), 'the resource base says the path was withheld rather than printing a guess')
  assert.ok(text.includes('声明资源不等于已读取资源'), 'the screen shares the core layer’s sentence about the difference')
})

const frameRuntimeLogic = {
  schemaVersion: 1, source: 'session-observation',
  stages: [
    { id: 'catalog', order: 1, label: { zh: 'Skill 目录', en: 'Catalog' }, hint: { zh: '这次会话发布了哪些可发现 Skill', en: 'What this session published' },
      state: 'runtime-supported', tone: 'observed', statement: '这次会话发布了 12 个可发现 Skill，其中包含这个 Skill。',
      facts: [{ id: 'catalog-entry-count', label: { zh: '目录条目', en: 'Catalog entries' }, kind: 'count', value: 12 },
        { id: 'catalog-digest', label: { zh: '目录摘要', en: 'Digest' }, kind: 'code', value: 'sha256:abcd' }], limitations: [] },
    { id: 'load', order: 2, label: { zh: '载入 Skill', en: 'Load' }, hint: { zh: '这次会话有没有调用它', en: 'Whether it was invoked' },
      state: 'runtime-supported', tone: 'observed', statement: '这次会话记录到 1 次加载。',
      facts: [{ id: 'load-count', label: { zh: '加载次数', en: 'Loads' }, kind: 'count', value: 1 },
        { id: 'load-coverage', label: { zh: '覆盖范围', en: 'Coverage' }, kind: 'code', value: 'instructions' }], limitations: [] },
    { id: 'capability', order: 3, label: { zh: '运行能力', en: 'Runtime capability' }, hint: { zh: '有没有观察到相关能力', en: 'Related capability' },
      state: 'unknown', tone: 'unknown', statement: null, facts: [],
      limitations: ['runtime-events-could-not-be-linked-to-this-skill'] },
  ],
  observedCount: 2, stageCount: 5,
  limitations: ['runtime-events-could-not-be-linked-to-this-skill'],
}

test('runtime logic states what this session observed, stage by stage', () => {
  const client = mountChineseClient()
  const nodes = collect(client.__views.RuntimeLogic({ runtimeLogic: frameRuntimeLogic }))
  const text = nodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')

  const stages = nodes.filter((node) => node.props.className === 'st-runtime-stage')
  assert.equal(stages.length, 3, 'every stage gets a node, observed or not')
  assert.deepEqual(nodes.filter((node) => node.props.className === 'st-runtime-order').map((node) => node.children[0]),
    ['01', '02', '03'], 'stages are numbered by the lifecycle, not by what happened')
  assert.deepEqual(stages.map((node) => node.props['data-state']), ['observed', 'observed', 'unknown'])
  assert.ok(text.includes('2 / 5 段'), 'the header counts observed stages against the whole lifecycle')

  // 事实按类型渲染：数字、代码、清单各是各的样子。
  assert.ok(text.includes('12') && text.includes('sha256:abcd'), 'a count is a number and a digest is code')
  assert.ok(nodes.some((node) => node.type === 'code' && node.children?.[0] === 'sha256:abcd'), 'a code fact renders as code, not as prose')
  assert.ok(text.includes('运行时事件无法与这个 Skill 关联'), 'a stage that could not be judged says why, in the shared vocabulary')

  // 五个阶段必须说清「不是因果顺序」——否则它读起来就像一张流程图。
  assert.ok(text.includes('阶段之间没有因果顺序'), 'the note denies a causal reading of the stages')
  for (const forbidden of ['已执行', '已完成', '执行成功', '已加载']) {
    assert.ok(!text.includes(forbidden), `runtime logic must not claim ${forbidden}`)
  }
})

test('step evidence shows the grounds behind each state', () => {
  const client = mountChineseClient()
  const flow = {
    ...frameFlow,
    steps: [
      { ...frameFlow.steps[0], evidence: { relationship: 'runtime-supported', limitation: null, matchCount: 2,
        runtimeEvidence: [{ type: 'tool-call', category: 'bash' }], observedNodeIds: ['invocation:1'], evidenceIds: ['e1'], matchedCapabilities: ['bash'], modelIntent: { present: true } } },
      { ...frameFlow.steps[3], evidence: undefined },
    ],
  }
  const nodes = collect(client.__views.StepEvidence({ flow }))
  const text = nodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')

  const items = nodes.filter((node) => node.props.className === 'st-steps-item')
  assert.equal(items.length, 2, 'one row per declared step, including the one with nothing to show')
  assert.deepEqual(items.map((node) => node.props['data-state']), ['observed', 'unknown'])

  // 「凭什么这么说」必须列出来，而不是只给一个状态词。
  assert.ok(text.includes('tool-call · bash'), 'the evidence kind and category are shown')
  assert.ok(text.includes('有') && text.includes('模型意图'), 'the model-intent column is shown as a yes/no fact')
  assert.ok(text.includes('暂无足够证据'), 'a step with no evidence still gets a state, not a blank')
  assert.ok(text.includes('不代表'), 'the note denies the reading "no evidence means it never happened"')

  // 没有引用可展示时，不再写「相关运行证据：没有可展示的证据引用」——先立一个名头再当场收回，
  // 读起来像这一行坏了。空就是一句话，而且这句话只出现一次（那一步确实什么都没得展示）。
  assert.equal(nodes.filter((node) => node.props.className === 'st-steps-none').length, 1,
    'a step with nothing to show gets one sentence instead of a label/value pair')
  assert.equal(nodes.filter((node) => node.type === 'dt' && node.children?.[0] === '相关运行证据').length, 1,
    'the evidence label only appears on the step that actually has evidence')

  // flow 为 null 时不能抛。
  assert.ok(collect(client.__views.StepEvidence({ flow: null })).length > 0, 'a missing flow renders rather than throwing')
})

// ── Markdown 表格 ─────────────────────────────────────────────────────────────
//
// 表格以前会退化成一行竖线串。渲染器和翻译校验共用同一份解析器，所以这里测的是渲染那一半：
// 表头进 `<th>`、数据进 `<td>`、对齐变成 style。**原文与中文预览走同一个函数**，所以这些
// 断言对两边同时成立。

test('a Markdown table becomes a real table, between the blocks around it', () => {
  const client = mountChineseClient()
  const render = client.__pure.renderSkillMarkdown
  assert.equal(typeof render, 'function', 'the renderer must be reachable from the smoke test')

  const markdown = [
    '# 参数',
    '',
    '| 参数 | 类型 | 说明 |',
    '| :--- | :---: | ---: |',
    '| `name` | string | [Skill 名称](https://example.com) |',
    '| path | string | 文件路径 |',
    '',
    '表格之后是一段正文。',
  ].join('\n')
  const nodes = collect(render(markdown, [], null, null))

  const tables = nodes.filter((node) => node.props.className === 'st-audit-table')
  assert.equal(tables.length, 1, 'exactly one table is rendered')
  const rows = nodes.filter((node) => node.type === 'tr')
  assert.equal(rows.length, 3, 'a header row plus two data rows')
  const headers = nodes.filter((node) => node.type === 'th')
  assert.deepEqual(headers.map((node) => node.children?.[0]), ['参数', '类型', '说明'], 'the header cells keep their order')
  const cells = nodes.filter((node) => node.type === 'td')
  assert.equal(cells.length, 6, 'two rows of three cells')

  // 对齐来自分隔行，落在 style 上。
  assert.deepEqual(headers.map((node) => node.props.style?.textAlign), ['left', 'center', 'right'],
    'the delimiter row decides alignment, per column')

  // 单元格里的行内标记仍然由同一个行内渲染器处理：代码是代码，链接是链接。
  assert.ok(cells.some((node) => (node.children ?? []).some((child) => child?.type === 'code')),
    'an inline code span inside a cell is rendered as code')
  assert.ok(cells.some((node) => (node.children ?? []).some((child) => child?.type === 'a')),
    'a link inside a cell is rendered as a link')

  // 表格不能吞掉邻居：标题还是标题，后面的段落还是段落。
  const text = nodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(nodes.some((node) => node.type === 'h2' && (node.children ?? []).includes('参数')), 'the heading above the table survives')
  assert.ok(text.includes('表格之后是一段正文。'), 'the paragraph after the table survives')
  // 竖线串不能再出现在正文里 —— 那正是这次要修掉的观感。
  assert.ok(!text.includes('| --- |'), 'the delimiter row is not printed as text')

  // 一张表也不认的时候（没有分隔行）就还是段落，绝不能凭空画出表格。
  const prose = collect(render('| 这不是表 |\n| 只是带竖线的正文 |', [], null, null))
  assert.equal(prose.filter((node) => node.type === 'table').length, 0, 'a pipe without a delimiter is still prose')

  // 原文与中文预览共用这次调用：只有一处 `renderSkillMarkdown(` 调用点。
  const callSites = source.split('\n').filter((line) => /[^.\w]renderSkillMarkdown\(/.test(line) && !/^\s*function /.test(line))
  assert.equal(callSites.length, 1, 'the original and the Chinese preview must share one renderer call site')
})

// v0.7 §4：已安装列表的卡片以前是 <article>，整页没有任何入口，只能看。
// 现在整张卡是 <button>，点它必须调用 onOpen(name, 'installed') —— 返回目标由这个
// 第二个参数决定（§8.4 的来源感知返回），所以断言的是那次调用的**两个**实参。
test('an installed Skill card opens the one Skill detail page', () => {
  const client = mountChineseClient()
  const installed = {
    skills: [
      { name: 'ui-craft', description: 'Use for UI design work', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
      { name: 'find-skills', description: 'Find a Skill', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: false } },
    ],
  }

  const opened = []
  const page = client.__views.InstalledSkillsPage({
    sessionId: 'session-render',
    query: '',
    onQueryChange() {},
    installed,
    onOpen: (name, from) => opened.push([name, from]),
  })
  const nodes = collect(page)

  const cards = nodes.filter((node) => node.type === 'button' && node.props.className === 'st-installed-card')
  assert.equal(cards.length, 2, 'every installed Skill becomes a card')
  assert.deepEqual(cards.map((card) => card.props['data-skill']), ['ui-craft', 'find-skills'],
    'the card carries the Skill name it stands for')

  // 整张卡就是入口，所以它内部**不能**再有一个竞争动作：一个入口出现两次，
  // 读者会以为这两个按钮不一样。全页的 button 数必须等于卡片数。
  const buttons = nodes.filter((node) => node.type === 'button')
  assert.equal(buttons.length, 2, 'the card is the only control on it — no duplicate “view detail” button')
  assert.ok(!nodes.some((node) => /查看详情|View detail/i.test(node.children?.[0] ?? '')),
    'no nested detail button is introduced')

  cards[0].props.onClick()
  assert.deepEqual(opened, [['ui-craft', 'installed']],
    'clicking a card opens that Skill, and says the reader came from the installed list')

  // 搜索过滤走的是宿主共用谓词，不是第二套匹配规则。
  const filtered = collect(client.__views.InstalledSkillsPage({
    sessionId: 'session-render', query: 'find', onQueryChange() {}, installed, onOpen() {},
  }))
  const filteredCards = filtered.filter((node) => node.props.className === 'st-installed-card')
  assert.equal(filteredCards.length, 1, 'the search box narrows the grid')

  // 没有可发现的 Skill 时给一句话，不是一张空网格 —— 空网格读起来像加载失败。
  const empty = collect(client.__views.InstalledSkillsPage({
    sessionId: 'session-render', query: '', onQueryChange() {}, installed: { skills: [] }, onOpen() {},
  }))
  assert.equal(empty.filter((node) => node.type === 'button').length, 0, 'no cards when nothing is discoverable')
  assert.ok(empty.some((node) => node.type === 'p' && node.props.className === 'st-audit-empty'),
    'the empty state is a sentence, not a bare grid')
})

// v0.9.2 §7（用户：「已安装 Skill 里带 custom 的都是我复刻出来的，现在排序又在后面，
// 得翻好几页」）：顺序改成按「加入本机」的时间倒序，并且列表必须**说出**它按什么排的。
//
// 断言的是渲染出来的东西，不是源码里的字符串：顺序由宿主算好下发（`installed.ordering`），
// 客户端只念出来、**不重排**（重排就是第二份排序规则）；卡片上那两行事实来自两个不同的
// 字段（`addedAt` / `lineage`），任一缺失都不许编一个出来。
test('the installed list says how it is ordered, and never invents a date', () => {
  const client = mountChineseClient()

  const ordered = collect(client.__views.InstalledSkillsPage({
    sessionId: 'session-render',
    query: '',
    installed: {
      ordering: { rule: 'added-desc-then-name', addedAtKnown: 2, addedAtUnknown: 1 },
      limitations: ['added-at-partial'],
      skills: [
        {
          name: 'deliver-prd-custom-custom-custom',
          description: 'x',
          addedAt: Date.now() - 60_000,
          lineage: { sourceSkillName: 'deliver-prd-custom-custom', createdAt: 1 },
        },
        {
          name: 'deliver-prd-custom-custom',
          description: 'x',
          addedAt: Date.now() - 3_600_000,
          lineage: { sourceSkillName: 'deliver-prd-custom', createdAt: 1 },
        },
        { name: 'pinokio', description: 'x', addedAt: null, lineage: null, provider: 'dsh-tauri-pet', invocation: { modelInvocable: true, userInvocable: true } },
      ],
    },
  }))

  const cards = ordered.filter((node) => node.props.className === 'st-installed-card')
  assert.deepEqual(cards.map((card) => card.props['data-skill']),
    ['deliver-prd-custom-custom-custom', 'deliver-prd-custom-custom', 'pinokio'],
    'the client renders the order it was handed — it does not re-sort')

  const orderNote = ordered.find((node) => node.props['data-role'] === 'installed-order')
  assert.ok(orderNote, 'the list says how it is ordered')
  assert.match(String(orderNote.children?.[0] ?? ''), /按加入本机的时间倒序/)
  assert.match(String(orderNote.children?.[0] ?? ''), /另有 1 个 Skill 读不到加入时间/)

  const stampSpans = ordered.filter((node) => node.type === 'span' && /加入本机/.test(String(node.children?.[0] ?? '')))
  assert.equal(stampSpans.length, 2, 'only the Skills that really have an add time show one')
  assert.match(String(stampSpans[0].children[0]), /^\d\d-\d\d 加入本机$/)

  const clonedSpans = ordered.filter((node) => node.type === 'span' && /复刻自/.test(String(node.children?.[0] ?? '')))
  assert.equal(clonedSpans.length, 2, 'only the Skills with a recorded source say where they came from')
  assert.equal(String(clonedSpans[0].children[0]), '复刻自 deliver-prd-custom-custom')

  // 2026-10-03（用户：「模型可调用、可用 /name 调用，这两个是不是重复？」）：不是重复 —— DSH 的
  // 两个开关彼此独立 —— 但在这份目录上永远都是 true/true，于是每张卡都在重复一句恒为真的话。
  // 改成只在例外时说，所以**默认成立的组合一个字都不许出现**（这三张卡的开关都是 true）。
  const pageText = ordered.map((node) => String(node.children?.[0] ?? '')).join(' ')
  assert.ok(!/模型可调用|不可由模型调用|\/name 调用/.test(pageText),
    'a Skill that is model- and user-invocable says nothing: the default is silent')
  assert.ok(!/\d\d:\d\d/.test(pageText),
    '加入时间只到日（用户：「我交互体验将来只需要有月日就行」）：卡片上不再出现时:分')
  let providerSpans = ordered.filter((node) => node.type === 'span' && /dsh-tauri-pet/.test(String(node.children?.[0] ?? '')))
  assert.equal(providerSpans.length, 1, 'provider 只在不是默认值时才说：插件提供的那个要说出来')
  assert.ok(!/filesystem/.test(pageText), '`filesystem` 是默认值，重复 68 遍不是信息')

  // 宿主给不出 `ordering`（旧版本、或载荷被削过）时**什么都不说** —— 宁可少一句，
  // 也不能顺口宣称一个没人证实的顺序。
  const legacy = collect(client.__views.InstalledSkillsPage({
    sessionId: 'session-render', query: '', installed: { skills: [{ name: 'ui-craft', description: 'x' }] }, onOpen() {},
  }))
  assert.equal(legacy.some((node) => node.props['data-role'] === 'installed-order'), false,
    'no ordering fact means no claim about ordering')

  // 一个时间都读不到、血缘也读不到：两句都要说，而且说的不是同一件事。
  const nothing = collect(client.__views.InstalledSkillsPage({
    sessionId: 'session-render',
    query: '',
    installed: {
      ordering: { rule: 'added-desc-then-name', addedAtKnown: 0, addedAtUnknown: 1 },
      limitations: ['added-at-unavailable', 'lineage-unavailable'],
      skills: [{ name: 'ui-craft', description: 'x' }],
    },
    onOpen() {},
  }))
  const nothingText = String(nothing.find((node) => node.props['data-role'] === 'installed-order')?.children?.[0] ?? '')
  assert.match(nothingText, /读不到加入本机的时间/)
  assert.match(nothingText, /读不到复刻记录/)

  // 「只在例外时说」的另一半：把开关真的关掉，字必须出现 —— 否则这套规则就变成了
  // 「永远不说」，而读者失去的是「这个 Skill 用 /name 调不出来」这类**真会改变行为**的事实。
  const exceptions = collect(client.__views.InstalledSkillsPage({
    sessionId: 'session-render',
    query: '',
    installed: {
      ordering: { rule: 'added-desc-then-name', addedAtKnown: 0, addedAtUnknown: 2 },
      skills: [
        { name: 'model-hidden', description: 'x', addedAt: null, lineage: null, provider: 'filesystem', invocation: { modelInvocable: false, userInvocable: true } },
        { name: 'slash-hidden', description: 'x', addedAt: null, lineage: null, provider: 'dsh-tauri-pet', invocation: { modelInvocable: true, userInvocable: false } },
      ],
    },
    onOpen() {},
  }))
  const exceptionText = exceptions.map((node) => String(node.children?.[0] ?? '')).join(' ')
  assert.match(exceptionText, /不可由模型调用/, 'the exception is spelled out when it is real')
  assert.match(exceptionText, /不能用 \/name 调用/, 'and so is the /name one')
  providerSpans = exceptions.filter((node) => node.type === 'span' && /dsh-tauri-pet/.test(String(node.children?.[0] ?? '')))
  assert.equal(providerSpans.length, 1, 'the plugin-provided Skill keeps its provider')
  assert.ok(!/filesystem/.test(exceptionText), 'the default provider stays silent even next to an exception')
})

// 2026-10-02（用户：「搜索框移动到本次 Skill 跟已安装 Skill 同一行，靠近刷新那个 Icon，
// 那搜索框宽度可以再缩小一点」）：搜索框从正文第一行搬进顶栏右侧。
//
// 这一条守的不只是"它现在在哪"，还有"它没有留在原地" —— 搬走之后如果页面里还留着一份，
// 界面上会出现两个搜索框（一个能用、一个不能），而源码里两次 className 都写着同一个名字，
// 任何字符串断言都看不出来。所以断言的是**渲染出来的节点数**。
test('the installed search box lives in one place, with its icon on the right', () => {
  const client = mountChineseClient()

  const box = collect(client.__views.InstalledSearchBox({ query: 'ui', onQueryChange() {} }))
  const inputs = box.filter((node) => node.type === 'input')
  assert.equal(inputs.length, 1, 'the search box is exactly one input')
  const icons = box.filter((node) => node.props.className === 'st-search-icon')
  assert.equal(icons.length, 1, 'and exactly one marker icon')
  assert.equal(box.indexOf(inputs[0]) < box.indexOf(icons[0]), true,
    'the icon follows the input — it marks the right end of the box, not the left')

  // 输入要原样交给上层：过滤发生在页面里，用的是宿主共用的那一个谓词。
  const seen = []
  const typed = collect(client.__views.InstalledSearchBox({ query: '', onQueryChange: (value) => seen.push(value) }))
  typed.find((node) => node.type === 'input').props.onChange({ target: { value: 'lark' } })
  assert.deepEqual(seen, ['lark'], 'typing hands the raw value up; the box owns no filter of its own')

  // 反向：页面里不许再有第二个搜索框。
  const page = collect(client.__views.InstalledSkillsPage({
    sessionId: 'session-render',
    query: '',
    installed: { skills: [{ name: 'ui-craft', description: 'x', provider: 'filesystem' }] },
    onOpen() {},
  }))
  assert.equal(page.filter((node) => node.type === 'input').length, 0,
    'the page body no longer renders its own search box — one search box, one place')
})

// v0.7 §7–§20：复刻对话框。它要守住三件事，而三件都只有把组件真的渲染出来才看得见：
//   1. 详情页上的对象级动作只有一个（多一个竞争动作，用户就得先猜两者有什么区别）；
//   2. 名字不合法要在**点下去之前**说，而不是让宿主退回来；
//   3. 「✓ Skill 已创建」只能出现在宿主回执之后，且目录刷新与否必须照着观察结果说。
test('the clone dialog is the only object action, and it claims nothing the Host has not confirmed', () => {
  const client = mountChineseClient()
  const sourceSha256 = `sha256:${'a'.repeat(64)}`

  // 1. 详情页对象区只有一个主动作，且它是「复刻 Skill」。
  //    这条断言只关心对象区，所以详情载荷就地写一份最小的 —— 上面那份完整夹具声明在别的
  //    测试函数里，跨作用域引用会让整条测试在渲染之前就抛 ReferenceError。
  const detailNodes = collect(client.__views.SkillDetailPage({
    sessionId: 's',
    skillName: 'code-review',
    skill: {
      schemaVersion: 1,
      skillName: 'code-review',
      summary: { description: '评审代码变更。' },
      definition: {
        available: true,
        reason: null,
        content: { sha256: sourceSha256, text: '# Code Review\n\n读一遍变更。\n', truncated: false },
        outline: [],
        resourceBase: { kind: 'directory' },
        limitations: [],
      },
      flow: null, anchors: null, framework: null, runtimeLogic: null,
      runs: [], evidence: null, repository: null, observation: null, limitations: [],
    },
  }))
  const openButtons = detailNodes.filter((node) => node.props.className === 'st-clone-open')
  assert.equal(openButtons.length, 1, 'the detail page offers exactly one clone entry point')
  // `h()` 已经把这个位置上的 RAW 包装拆成纯字符串，所以子节点就是文本本身。
  const ownText = (node) => (node.children ?? []).map((child) => (typeof child === 'string' ? child : '')).join('')
  assert.ok(ownText(openButtons[0]).includes('复刻 Skill'), 'the object action is called 复刻, not 编辑 / 创建 / 优化')
  for (const competing of ['编辑', '创建', '优化', '收藏']) {
    assert.ok(!detailNodes.some((node) => ownText(node).includes(competing)),
      `no competing object action (${competing}) exists next to 复刻`)
  }

  // 2. 表单：名字是建议出来的，范围与内容各有一对单选，默认项目级 + 完整 Skill。
  const formNodes = collect(client.__views.SkillCloneDialog({ skillName: 'ui-craft', sourceSha256, definitionAvailable: true, onClose() {} }))
  const input = formNodes.find((node) => node.props['data-role'] === 'clone-target-name')
  assert.equal(input?.props.value, 'ui-craft-custom', 'the name field starts from a suggestion')
  const radios = formNodes.filter((node) => node.type === 'input' && node.props.type === 'radio')
  assert.deepEqual(radios.map((node) => `${node.props.name}=${node.props.value}`),
    ['scope=project', 'scope=user', 'mode=bundle', 'mode=skill-md'], 'scope and mode are the only two choices')
  assert.deepEqual(radios.filter((node) => node.props.checked).map((node) => node.props.value), ['project', 'bundle'],
    'project scope and the whole Skill are the defaults')
  const submit = formNodes.find((node) => node.props.className === 'st-translate st-clone-submit')
  assert.equal(submit?.props.disabled, false, 'a valid name can be submitted')
  assert.ok(!formNodes.some((node) => typeof node?.text === 'string' && node.text.includes('已创建')),
    'nothing claims the clone happened before the request is even sent')

  // 3. 名字不合法：当场说，并禁用提交 —— 这是"先放行再被宿主退回"的反面。
  const badNodes = collect(client.__views.SkillCloneDialog({ skillName: 'ui-craft', sourceSha256, definitionAvailable: true, onClose() {}, targetName: 'UI_Craft' }))
  assert.ok(badNodes.some((node) => node.props['data-role'] === 'clone-name-error'),
    'an invalid name is reported next to the field')
  assert.equal(badNodes.find((node) => node.props.className === 'st-translate st-clone-submit')?.props.disabled, true,
    'an invalid name cannot be submitted')

  // 4. 宿主回执之后：成功态、范围、内容、调用方式各说各的，且不出现任何绝对路径。
  const doneNodes = collect(client.__views.SkillCloneDialog({
    skillName: 'ui-craft',
    sourceSha256,
    definitionAvailable: true,
    onClose() {},
    clone: {
      ok: true,
      skillName: 'ui-craft-custom',
      scope: 'project',
      pathKind: 'project-dsh',
      mode: 'bundle',
      verified: true,
      discovered: false,
      sourceUnchanged: true,
      fileCount: 12,
      invocation: '/ui-craft-custom',
      limitations: ['absolute-paths-withheld'],
    },
  }))
  const doneText = doneNodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(doneText.includes('✓ Skill 已创建'), 'the Host receipt is what earns the success sentence')
  assert.ok(doneText.includes('ui-craft-custom'), 'the created Skill is named')
  assert.ok(doneText.includes('已写入当前项目 Skill'), 'the scope that was written is named')
  assert.ok(doneText.includes('完整 Skill'), 'the copy mode is named')
  assert.ok(doneText.includes('/ui-craft-custom'), 'the invocation is shown as text to copy')
  assert.ok(doneText.includes('目录刷新状态待确认'),
    'when the catalog refresh was not observed, the dialog says so instead of promising it')
  assert.ok(!/\/Users\/|\/home\//.test(doneText), 'no absolute path ever reaches the UI')
  const copy = doneNodes.find((node) => node.props['data-role'] === 'clone-copy')
  assert.ok(copy, 'the invocation can be copied as text — and only copied')

  // 5. 真的观察到目录更新时才敢说「可以使用」。
  const foundNodes = collect(client.__views.SkillCloneDialog({
    skillName: 'ui-craft', sourceSha256, definitionAvailable: true, onClose() {},
    clone: { ok: true, skillName: 'ui-craft-custom', scope: 'user', mode: 'skill-md', verified: true, discovered: true, sourceUnchanged: true, fileCount: 1, invocation: '/ui-craft-custom', limitations: [] },
  }))
  const foundText = foundNodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(foundText.includes('目录已更新'), 'an observed catalog refresh is reported as such')
  assert.ok(foundText.includes('已写入我的 Skill'), 'user scope reads as 我的 Skill')
  assert.ok(foundText.includes('仅 SKILL.md'), 'the SKILL.md-only mode is named')

  // 6. 一个 473 个文件的 Skill 只拷进去 42 个时，「完整 Skill（42 个文件）」是句假话 ——
  //    真机验收就是这么撞上的（character-asset-kit，23 MB 的资源目录）。数字必须
  //    连同"没拷全"一起出现，而不是把丢掉的 44 个挪到下面的小字里。
  const truncatedNodes = collect(client.__views.SkillCloneDialog({
    skillName: 'ui-craft', sourceSha256, definitionAvailable: true, onClose() {},
    clone: {
      ok: true, skillName: 'ui-craft-custom', scope: 'project', mode: 'bundle', verified: true,
      discovered: false, sourceUnchanged: true, fileCount: 42, skippedCount: 44, truncated: true,
      invocation: '/ui-craft-custom',
      limitations: ['absolute-paths-withheld', 'catalog-refresh-not-observed', 'bundle-truncated-by-limit'],
    },
  }))
  // `collect` 已经把树摊平了，别再 collect 一次 —— 第二次会把每个节点的祖先也再走一遍。
  const copiedNode = truncatedNodes.find((node) => node.props['data-role'] === 'clone-copied')
  assert.ok(copiedNode, 'the copy line has a test hook')
  assert.equal(copiedNode.props['data-truncated'], 'yes')
  const copiedText = (copiedNode.children ?? []).map((child) => (typeof child === 'string' ? child : '')).join('')
  assert.ok(copiedText.includes('没有拷全'), 'a partial bundle says so in the same line as the counts')
  assert.ok(copiedText.includes('42') && copiedText.includes('44'), 'both the copied and the dropped counts are stated')

  // 7. limitations 是**代码**，不许原样出现在界面上（§7 的"不许显示裸错误码"）。
  const limitNodes = truncatedNodes.filter((node) => node.props?.className === 'st-clone-limits')
  assert.equal(limitNodes.length, 1, 'the content caveats are listed')
  const limitText = limitNodes[0].children.filter((node) => node.type === 'li')
    .map((node) => (node.children ?? []).map((child) => (typeof child === 'string' ? child : '')).join(''))
  assert.ok(limitText.some((line) => line.includes('超过了单次复刻的上限')),
    'bundle-truncated-by-limit is rendered as a sentence')
  for (const code of ['absolute-paths-withheld', 'catalog-refresh-not-observed', 'bundle-truncated-by-limit']) {
    assert.ok(!limitText.some((line) => line.includes(code)), `the raw code ${code} never reaches the user`)
  }
  // 已经有一句话说过的不再重复列一遍（目录刷新、不外发绝对路径）。
  assert.equal(limitText.length, 1, 'only the caveats that are not already said above are listed')
})

test('the clone dialog sends every field the Host reads — a request body has two sides', async () => {
  // 这条测试来自一次真机事故：「复刻 Skill」从 v0.7 起每一次都只换回一句 `sessionId 必填`。
  // 宿主读 `payload.sessionId`（它要用会话解析 registry 与 cwd），客户端根本没发这个字段。
  //
  // 两边的测试当时都是绿的，而且都"测到了"自己那一半：
  //   · `phase18-clone-routes.test.mjs` 自己把 `sessionId` 填进 body 再打路由 —— 它验的是宿主；
  //   · 组件测试只断言渲染出来的文案，从不看**真正发出去的 JSON** —— 它验的是外观。
  // 中间那条缝（客户端发的字段 ⊇ 宿主要读的字段）没有任何东西盯着。
  //
  // 所以这里从两头夹：驱动真的组件拿到真的请求体，再从宿主源码里把它真的读哪些字段挖出来。
  const requests = []
  const client = mountChineseClient({
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) })
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    },
  })
  const sourceSha256 = `sha256:${'a'.repeat(64)}`
  const nodes = collect(client.__views.SkillCloneDialog({
    sessionId: 'session-clone-contract',
    skillName: 'ui-craft',
    sourceSha256,
    definitionAvailable: true,
    onClose() {},
  }))
  const submit = nodes.find((node) => node.props.className === 'st-translate st-clone-submit')
  assert.equal(submit?.props.disabled, false, 'the form starts submittable, so submitting really sends a request')
  submit.props.onClick()

  assert.equal(requests.length, 1, 'submitting the form sends exactly one request')
  assert.equal(requests[0].url, '/skill-trace/clone')

  // `payload.` 在宿主里原先只有 `handleClone` 用（`sendJson` 那个是局部变量，不带成员访问），
  // 所以「扫全文」曾经等价于「扫这一条路由」。v0.9.1 加了 `POST /skill-trace/modify` 之后
  // 这条等价关系不再成立 —— 而**悄悄放宽成「两边字段的并集」会更糟**：那正是这条测试要防的
  // 那种缝。所以先把这个函数体切出来，只查它。
  const hostSource = readFileSync(join(CLIENT_DIR, '../../dsh/host/index.js'), 'utf8')
  const readFields = [...new Set([...hostFunctionBody(hostSource, 'handleClone').matchAll(/payload\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]))]
  assert.ok(readFields.includes('sessionId'),
    'the Host must still read payload.sessionId — otherwise this guard has quietly become vacuous')
  for (const field of readFields) {
    assert.ok(Object.prototype.hasOwnProperty.call(requests[0].body, field),
      `宿主读 payload.${field}，客户端就必须发 ${field}；这次发的是：${Object.keys(requests[0].body).join(', ')}`)
  }
})

test('the modify dialog sends every field the Host reads — the same seam, one路由 over', async () => {
  // 与上一条同一条纪律，只是换成 v0.9.1 的 `POST /skill-trace/modify`：它的 `begin` 支读
  // `sessionId / skillName / action / intent / scopes / profiles`，少发一个就会在真机上换回
  // 一句 400 —— 而且**客户端自己的测试仍然全绿**（§8.10）。
  const requests = []
  const client = mountChineseClient({
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) })
      return { ok: true, status: 200, json: async () => ({ ok: true, dispatched: true }) }
    },
  })
  const nodes = collect(client.__views.SkillModifyDialog({
    sessionId: 'session-modify-contract',
    skillName: 'ui-craft',
    onClose() {},
    onDispatched() {},
  }))
  const submit = nodes.find((node) => node.props['data-role'] === 'modify-submit')
  assert.ok(submit, 'the dialog must still have its 「交给 Agent」 button')
  // 意图是空的也要发得出去：宿主会回一句「请先写一句你希望这个 Skill 怎么改」，
  // 而这一条测的是**请求体的两半**，不是校验顺序。
  submit.props.onClick()

  assert.equal(requests.length, 1, 'submitting the dialog sends exactly one request')
  assert.equal(requests[0].url, '/skill-trace/modify')
  assert.equal(requests[0].body.action, 'begin', 'the first call opens a transaction')

  const hostSource = readFileSync(join(CLIENT_DIR, '../../dsh/host/index.js'), 'utf8')
  const readFields = [...new Set([...hostFunctionBody(hostSource, 'handleModify').matchAll(/payload\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]))]
  assert.ok(readFields.includes('sessionId'), 'the modify route must still need the session it dispatches into')
  assert.ok(readFields.includes('intent'), 'the modify route must still read the user\'s own words')
  for (const field of readFields) {
    assert.ok(Object.prototype.hasOwnProperty.call(requests[0].body, field),
      `宿主读 payload.${field}，客户端就必须发 ${field}；这次发的是：${Object.keys(requests[0].body).join(', ')}`)
  }
})

test('the detail page passes the clone dialog every prop it destructures — "passing undefined" is not passing', () => {
  // 上面那条测试是**直接**渲染弹窗的，所以它看不见详情页那一层。而这次事故的另一半
  // 恰好就在那一层：组件已经会往请求体里放 `sessionId`，但详情页渲染它时没传下去 ——
  // `JSON.stringify` 会把 `sessionId: undefined` 悄悄丢掉，用户看到的错误一字不差。
  //
  // 所以这里钉一条通用的合同，不针对某一个 prop：
  //   **组件解构出来、又没有兜底的 prop，渲染处必须真的传过去。**
  // "没有兜底"有两个来源，都从源码里读，不靠人记：
  //   · 写法里有默认值 —— `onClose = () => {}`；
  //   · 别名 + 函数体里对别名做了兜底 —— `clone: suppliedResult` 且体内有 `suppliedResult ?? …`。
  // 后者正是这个组件注释里写的"注入缝"：渲染烟测的 React 桩不会跑 `useEffect`，
  // 那两条分支只有注得进去才渲染得出来，所以它们**必须**允许不传。
  const matchingBrace = (open) => {
    let depth = 0
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') { depth -= 1; if (depth === 0) return index }
    }
    return assert.fail('花括号不平衡 —— 这条守卫没能读到组件体')
  }
  const componentBody = (componentName) => {
    const signature = new RegExp(`function ${componentName}\\(\\{([\\s\\S]*?)\\}\\s*\\)\\s*\\{`).exec(source)
    assert.ok(signature, `${componentName} 必须还是一个解构 props 的函数组件`)
    const brace = signature.index + signature[0].length - 1
    return { propsText: signature[1], body: source.slice(brace + 1, matchingBrace(brace)) }
  }
  const renderBodyOf = (componentName) => {
    const start = source.indexOf(`h(${componentName}, {`)
    assert.ok(start > -1, `${componentName} 必须被渲染`)
    const open = source.indexOf('{', start)
    return source.slice(open + 1, matchingBrace(open))
  }
  const isOptional = (entry, body) => {
    if (entry.includes('=')) return true                                     // 有默认值
    const aliased = entry.split(':')
    if (aliased.length !== 2) return false
    const local = aliased[1].trim()
    return new RegExp(`\\b${local}\\s*(\\?\\?|\\|\\|)`).test(body)            // 别名在体内有兜底
  }

  const { propsText, body } = componentBody('SkillCloneDialog')
  const declared = propsText.split(',').map((entry) => entry.trim()).filter(Boolean)
  const required = declared.filter((entry) => !isOptional(entry, body)).map((entry) => entry.split(':')[0].trim())

  assert.ok(required.includes('sessionId'),
    'sessionId 没有兜底，所以它必须在这一组里 —— 否则这条守卫是空的')
  assert.ok(required.length < declared.length,
    '至少要有 prop 被判定为可选，否则「兜底」那条规则可能已经悄悄失效（看一眼 `clone` / `targetName`）')

  const renderBody = renderBodyOf('SkillCloneDialog')
  for (const prop of required) {
    assert.ok(new RegExp(`\\b${prop}\\s*[,:}]`).test(renderBody),
      `SkillCloneDialog 解构了没有兜底的 \`${prop}\`，详情页渲染它时就必须传过去（现在是：${renderBody.replace(/\s+/g, ' ').trim()}）`)
  }
})

/**
 * v0.8：血缘与差异的界面。
 *
 * 这一节测的不是「渲染出来了没有」，而是**它说了哪句话**。三件事各自都会在代码看起来
 * 完全正常的时候坏掉：
 *
 * 1. 没有血缘时猜一个来源 —— 「手动复制」和「本插件没执行过」在数据上都是 `null`，
 *    猜就等于把用户自己写的 Skill 说成别人的衍生物。
 * 2. 「来源变了 / 没变 / 没法比」退化成两句 —— 三态塌成两态时，「没有可比的原始指纹」
 *    会被说成「没变」，而那是编造（`FR-EVO-010`）。
 * 3. 读不到来源时渲染一张空表 —— 空表读起来就是「两边一样」。这条最危险，因为
 *    **看起来最正常**。
 */
function diffFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    comparison: {
      status: 'changed',
      source: {
        skillName: 'ui-craft', available: true, reason: null,
        originalSha256: `sha256:${'a'.repeat(64)}`, currentSha256: `sha256:${'b'.repeat(64)}`, changed: true,
      },
      target: { skillName: 'ui-craft-custom', available: true, reason: null, currentSha256: `sha256:${'c'.repeat(64)}` },
      limitations: [],
    },
    structure: {
      status: 'changed',
      counts: { added: 1, removed: 0, modified: 1, unchanged: 2 },
      sections: [
        { title: 'Rules', level: 2, role: null, status: 'modified', changed: ['items'], anchorId: 'rules', side: 'target', sourceLine: 5, targetLine: 5 },
        { title: 'Debugging', level: 2, role: null, status: 'added', changed: ['presence'], anchorId: 'debugging', side: 'target', sourceLine: null, targetLine: 14 },
      ],
    },
    content: {
      status: 'changed',
      counts: { added: 1, removed: 0, modified: 0, unchanged: 2 },
      limitations: [],
      sections: [
        {
          title: 'Rules', status: 'modified', anchorId: 'rules', side: 'target', sourceLine: 5, targetLine: 5,
          sourceLineCount: 2, targetLineCount: 3, linesTruncated: false,
          lines: [
            { kind: 'unchanged', text: '- Be precise', sourceLine: 6, targetLine: 6 },
            { kind: 'added', text: '- Always check the token table', sourceLine: null, targetLine: 8 },
          ],
        },
      ],
    },
    resources: {
      status: 'changed', mode: 'bundle',
      counts: { added: 0, removed: 1, modified: 1, unchanged: 1 },
      entries: [
        { path: 'references/tokens.md', status: 'modified', sourceSha256: `sha256:${'d'.repeat(64)}`, targetSha256: `sha256:${'e'.repeat(64)}` },
        { path: 'legacy.md', status: 'removed', sourceSha256: `sha256:${'f'.repeat(64)}`, targetSha256: null },
      ],
    },
    ...overrides,
  }
}

/** 读不到任何一侧的响应 —— 宿主真的会这么回（`buildSkillDiff` 的 unavailable 分支）。 */
function unavailableFixture() {
  const empty = { status: 'unavailable', counts: { added: 0, removed: 0, modified: 0, unchanged: 0 } }
  return {
    schemaVersion: 1,
    comparison: {
      status: 'unavailable',
      source: { skillName: 'ui-craft', available: false, reason: 'source-unavailable', originalSha256: null, currentSha256: null, changed: null },
      target: { skillName: 'ui-craft-custom', available: true, reason: null, currentSha256: `sha256:${'c'.repeat(64)}` },
      limitations: ['source-unavailable', 'resource-differences-may-come-from-a-truncated-clone'],
    },
    structure: { ...empty, sections: [], sectionCount: 0 },
    content: { ...empty, sections: [], limitations: [] },
    resources: { ...empty, mode: null, entries: [] },
  }
}

/**
 * 「复刻完一个字没改」的响应 —— 形状抄自一次**真实**复刻的真机响应（用户把一个真 Skill
 * 复刻出来、没做任何改动之后，宿主对 `GET /skill-trace/diff` 的回包）。
 *
 * 为什么要抄真形状而不是自己编一个：`.st-diff-*` 三层渲染的每一个分支都靠 `counts` 与
 * `entries`/`sections` 的长度说话，而「全都没变」是**唯一**会让三层的 `+`/`−` 行同时消失的
 * 输入 —— 也就是唯一能验出「没有变化」会不会被渲染成一张空表的输入。编一个「改过一点」的
 * 夹具永远走不到这一格。
 *
 * 指纹同值是这个夹具的重点：复刻必须改写副本 frontmatter 里的 `name:`，如果指纹算的是整份
 * 文件，「一个字没改」的复刻也会永远报「来源内容已发生变化」。宿主算的是**正文**，所以这两
 * 个 sha 必须一模一样。
 */
function unchangedFixture() {
  const body = `sha256:${'7'.repeat(64)}`
  const titles = [
    ['Product Requirements Document (PRD)', 1, 'identity', 4],
    ['When to Use', 2, 'trigger', 6],
    ['When NOT to Use', 2, null, 14],
    ['Instructions', 2, null, 21],
    ['Output Format', 2, 'output', 58],
    ['Quality Checklist', 2, 'verification', 62],
    ['Examples', 2, null, 77],
  ]
  const section = ([title, level, role, line]) => ({
    title, level, role, status: 'unchanged', changed: [], side: 'target', sourceLine: line, targetLine: line,
    anchorId: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  })
  return {
    schemaVersion: 1,
    comparison: {
      status: 'unchanged',
      source: { skillName: 'ui-craft', available: true, reason: null, originalSha256: body, currentSha256: body, changed: false },
      target: { skillName: 'ui-craft-custom', available: true, reason: null, currentSha256: body },
      limitations: [],
    },
    structure: { status: 'unchanged', counts: { added: 0, removed: 0, modified: 0, unchanged: 7 }, sections: titles.map(section), sectionCount: 7 },
    content: {
      status: 'unchanged',
      counts: { added: 0, removed: 0, modified: 0, unchanged: 7 },
      limitations: [],
      // 全部未变 ⇒ 每一节的 `lines` 都是空的。这一层「没有一行」与「没有比较」必须分得开。
      sections: titles.map((entry) => ({ ...section(entry), sourceLineCount: 3, targetLineCount: 3, lines: [], linesTruncated: false })),
    },
    resources: {
      status: 'unchanged',
      mode: 'bundle',
      counts: { added: 0, removed: 0, modified: 0, unchanged: 4 },
      // 四条都是复刻真的搬过去的文件。`SKILL.md` 不在这一层：它的正文归上面的内容层。
      entries: ['HISTORY.md', 'evals/trigger-fixtures.json', 'references/EXAMPLE.md', 'references/TEMPLATE.md']
        .map((path) => ({ path, status: 'unchanged', sourceSha256: `sha256:${'8'.repeat(64)}`, targetSha256: `sha256:${'8'.repeat(64)}` })),
    },
  }
}

const textOf = (nodes) => nodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
/** 一个节点**自己**的文本。`collect` 会把子文本摊成平行的 `#text` 条目，所以 `textOf([node])` 拿不到它。 */
const ownText = (node) => (node.children ?? []).filter((child) => typeof child === 'string').join('')
/** 一整棵子树的文本 —— 行是嵌套结构（标题格 + 状态格），自己的 `children` 里只有元素。 */
const subtreeText = (node) => collect(node).filter((n) => n.type === '#text').map((n) => n.text).join('')

test('the evolution card says "not cloned by this plugin" instead of guessing a source', () => {
  const client = mountChineseClient()
  const nodes = collect(client.__views.SkillEvolution({
    skillName: 'ui-craft', lineage: null, source: null, onOpenDiff() {}, openRef: { current: null },
  }))
  const text = textOf(nodes)

  assert.ok(text.includes('Skill 演进'), '左栏这一块要有自己的标题')
  assert.ok(text.includes('这个 Skill 不是由本插件复刻出来的。'),
    '没有血缘就必须说没有血缘 —— 手动复制与用户自建在这一格里是同一件事')
  // 一个点了只会告诉你「没有来源」的按钮，比一个不可点的元素更糟（§8.5 的同一条理由）。
  assert.equal(nodes.filter((node) => node.props['data-role'] === 'diff-open').length, 0,
    '没有血缘时不许出现「查看差异」')

  // 「没有血缘」有两种成因，渲染出来必须是两句话（§6.11）。宿主把插件读进内存之后不会自动换代码，
  // 所以「客户端已经是 v0.8、宿主还是 v0.7」是插件升级的正常路径（§6.2 / 附录 B）——那时详情响应里
  // **根本没有 `lineage` 这个键**。把它渲染成「不是由本插件复刻出来的」，就是对着一个真的复刻过的
  // Skill 说假话。这一条走的是 `SkillDetailPage` 的真实接缝，不是直接调 `SkillEvolution`。
  const detailOf = (skill) => textOf(collect(client.__views.SkillDetailPage({
    sessionId: 's', skillName: 'ui-craft', skill,
  })))
  // `validation: null` = 「宿主答了、这次没有验收结果」，与 `lineage: null` 是同一种回答方式。
  // 缺了它，验收卡会替宿主喊「宿主可能还没换到这一版」，把下面那条**只谈血缘**的断言顶红 ——
  // 新字段落地时，这些共用 fixture 要一起补齐。
  const bare = { skillName: 'ui-craft', summary: null, definition: null, flow: null, anchors: {}, runs: [], evidence: null, repository: null, observation: null, limitations: [], validation: null }
  const noRecord = detailOf({ ...bare, lineage: null })
  const staleHost = detailOf({ ...bare })
  assert.ok(noRecord.includes('这个 Skill 不是由本插件复刻出来的。'), '`lineage: null` 才是「本插件没复刻过」')
  assert.ok(!noRecord.includes('宿主可能还没换到这一版的代码'), '新宿主答了 `null`，就不该提重启')
  assert.ok(staleHost.includes('宿主可能还没换到这一版的代码'),
    '详情响应里没有 `lineage` 键 = 读不到 = 老宿主，必须说人话（§6.11）')
  assert.ok(!staleHost.includes('这个 Skill 不是由本插件复刻出来的。'),
    '「读不到」不许说成「没有」——那可能是唯一一次真的复刻过的 Skill')

  // 复刻过的 Skill 走同一个接缝：渲染桩不跑 effect，所以这就是**第一帧** —— 详情到了、
  // `/diff` 还没回来。这一帧说的话不能是「无法读取来源」，否则每一次打开副本详情页，
  // 用户都会先读到一句关于来源的假话，再眼看着它自己改口（§6.11 的第四次出现）。
  const cloned = detailOf({
    ...bare,
    lineage: {
      lineageId: `sha256:${'1'.repeat(64)}`,
      sourceSkillName: 'ui-craft',
      sourceSourceSha256: `sha256:${'a'.repeat(64)}`,
      cloneMode: 'bundle',
    },
  })
  assert.ok(cloned.includes('正在读取来源…'), '第一帧还没问回来，只能说「正在读取」，不能说「读不到」')
  assert.ok(!cloned.includes('无法读取来源'), '「还没问」不是「读不到」')
})

test('the source state keeps every sentence apart — "cannot compare" is not "unchanged", and "not asked yet" is neither', () => {
  const client = mountChineseClient()
  const lineage = {
    lineageId: `sha256:${'1'.repeat(64)}`,
    sourceSkillName: 'ui-craft',
    sourceSourceSha256: `sha256:${'a'.repeat(64)}`,
    cloneMode: 'bundle',
  }
  const opened = []
  const stateOf = (source, diffPhase = 'ready') => {
    const nodes = collect(client.__views.SkillEvolution({
      skillName: 'ui-craft-custom', lineage, source, diffPhase, onOpenDiff: () => opened.push(true), openRef: { current: null },
    }))
    return {
      nodes,
      mark: nodes.find((node) => node.props['data-role'] === 'evolution-source-state')?.props['data-changed'],
      text: textOf(nodes),
    }
  }

  const moved = stateOf({ available: true, changed: true, currentSha256: `sha256:${'b'.repeat(64)}` })
  const still = stateOf({ available: true, changed: false, currentSha256: `sha256:${'a'.repeat(64)}` })
  // 来源**读得到**，但这一对没有「复刻当初那一版」的指纹（拿别的 Skill 当 `against` 时
  // 宿主就是这么回的）。它既不是变了也不是没变 —— 这正是三态里最容易塌掉的一格。
  const noFingerprint = stateOf({ available: true, changed: null, currentSha256: `sha256:${'c'.repeat(64)}` })
  const unreadable = stateOf({ available: false, changed: null, currentSha256: null, reason: 'source-unavailable' })

  assert.deepEqual([moved.mark, still.mark, noFingerprint.mark, unreadable.mark], ['yes', 'no', 'unknown', 'unknown'])
  assert.ok(moved.text.includes('来源内容已发生变化'))
  assert.ok(still.text.includes('来源内容未发生变化'))
  assert.ok(noFingerprint.text.includes('无法比较'))
  assert.ok(unreadable.text.includes('无法读取来源'))
  // 四句说法必须互斥：三态塌成两态就是从这一行开始的。
  assert.ok(!moved.text.includes('来源内容未发生变化'), '「变了」不能同时说「没变」')
  assert.ok(!still.text.includes('来源内容已发生变化'))
  assert.ok(!noFingerprint.text.includes('来源内容未发生变化'),
    '「没有可比的指纹」不许说成「没变」—— 那是从缺失推出的结论')
  assert.ok(!noFingerprint.text.includes('来源内容已发生变化'))
  assert.ok(!unreadable.text.includes('来源内容未发生变化'))

  // 第四态：**还没听到回音**。详情页要先拿 `/skill` 的血缘、再去问 `/diff`，中间这一段
  // `comparison.source` 根本不存在 —— 那时说的话不能是「无法读取来源」，因为没有人检查过。
  // 这一格漏掉的话，每一次打开副本详情页都会先蹦出一句关于来源的假话。
  const pending = stateOf(null, 'loading')
  const failed = stateOf(null, 'error')
  assert.equal(pending.mark, 'pending')
  assert.ok(pending.text.includes('正在读取来源…'), '还没问就说「读不到」，是替宿主宣布它没说过的话')
  assert.ok(!pending.text.includes('无法读取来源'), '「还没问」与「读不到」是两句话（§6.11）')
  assert.ok(!pending.text.includes('来源内容未发生变化'))
  assert.ok(failed.text.includes('读取来源失败'), '请求失败要说是「读取失败」，不能听起来像宿主检查过了')
  assert.ok(!failed.text.includes('正在读取来源…'), '已经失败了就不能还挂着「正在读取」')

  // 四组事实与出口都在，且出口真的接上了处理器。
  for (const fact of ['当前 Skill', '来源 Skill', '复刻来源指纹', '当前来源指纹']) {
    assert.ok(moved.text.includes(fact), `演进卡要说清 ${fact}`)
  }
  const open = moved.nodes.find((node) => node.props['data-role'] === 'diff-open')
  assert.equal(ownText(open), '查看差异')
  open.props.onClick()
  assert.equal(opened.length, 1, '「查看差异」必须真的打开面板')
})

test('an unreadable source is an alert with a sentence — never an empty list that reads as "no changes"', () => {
  const client = mountChineseClient()
  const nodes = collect(client.__views.SkillDiffPanel({
    sessionId: 's-unavailable', skillName: 'ui-craft-custom', diff: unavailableFixture(), onClose() {},
  }))

  const alert = nodes.find((node) => node.props['data-role'] === 'diff-unavailable')
  assert.ok(alert, '读不到来源必须**说出来**')
  assert.equal(alert.props.role, 'alert', '要说给辅助技术听，不是画一行灰字')
  assert.deepEqual(alert.children, ['当前无法读取来源 Skill，无法完成差异比较。'])

  // 三层一条都不许渲染。空表是这一屏最坏的失败方式：它看起来完全正常。
  assert.equal(nodes.filter((node) => node.props.className === 'st-diff-row').length, 0,
    '读不到来源时不许靠一张空列表把「无法比较」画成「没有变化」')
  const text = textOf(nodes)
  assert.ok(!text.includes('新增 0'), '「新增 0」本身就是一句「比较过了，没变化」')

  // limitation 代码必须都有人话 —— 裸代码是 v0.6 就定下的禁区（`test/phase16` 的 R6）。
  assert.ok(text.includes('当前无法读取来源 Skill，无法完成差异比较。'))
  assert.ok(!/source-unavailable|resource-differences-may-come-from-a-truncated-clone/.test(text),
    'limitation 不许以代码形式出现在界面上')
})

test('the diff panel renders all three layers, and every word it uses is a fact word', () => {
  const client = mountChineseClient()
  const renderPanel = (tab) => collect(client.__views.SkillDiffPanel({
    sessionId: 's-diff', skillName: 'ui-craft-custom', diff: diffFixture(), tab, onClose() {},
  }))

  const structure = renderPanel('structure')
  assert.deepEqual(
    structure.filter((node) => node.props.className === 'st-diff-tab').map(ownText),
    ['结构', '内容', '资源'],
    '一个模态，三个入口',
  )
  const rows = structure.filter((node) => node.props.className === 'st-diff-row')
  assert.deepEqual(rows.map(subtreeText), ['Rules修改', 'Debugging新增'])
  const structureText = textOf(structure)
  for (const word of ['新增', '删除', '修改', '保持不变']) {
    assert.ok(structureText.includes(word), `计数行要用事实词「${word}」`)
  }

  // 内容层给的是行，行首是 + / − / 空格 —— 增删不能只靠颜色说。
  const content = renderPanel('content')
  const lines = content.filter((node) => node.props.className === 'st-diff-lines').flatMap((node) => node.children)
  // 三个字符位：`+` 新增、`−` 删除、空格未变。增删不能只靠颜色说。
  assert.deepEqual(lines.map(subtreeText), [' - Be precise', '+- Always check the token table'])

  // 资源层给的是相对路径，且**不含 SKILL.md**（正文归内容层）。
  const resources = renderPanel('resources')
  const resourceText = textOf(resources)
  assert.ok(resourceText.includes('references/tokens.md'))
  assert.ok(resourceText.includes('legacy.md'))
  assert.ok(!resourceText.includes('SKILL.md'))

  // 三层渲染出来的每一个字都不许是判断（`FR-EVO-014`）。这一条要跑在**渲染结果**上，
  // 不是源码上：源码里那些词根本不存在，而字典接错一行就可能冒出来。
  const all = textOf([...structure, ...content, ...resources])
  for (const forbidden of ['更优秀', '更完整', '更合理', '质量', '优化', '推荐', '建议保留', '建议删除', '最佳', '落后', '过期', '旧版本', '最新版本']) {
    assert.ok(!all.includes(forbidden), `差异面板不许出现判断词「${forbidden}」`)
  }
  for (const path of ['/Users/', '/home/']) {
    assert.ok(!all.includes(path), '绝对路径一个都不许出网（`docs/PRIVACY.md`）')
  }
})

/**
 * 这一条是「什么都没改的复刻」走一遍三层渲染。
 *
 * 它是差异功能存在的理由，也是最容易悄悄坏掉的一格：三层全都是「保持不变」时，行数、计数、
 * 空行列表三样东西**同时**变空，而一个渲染成空的面板与一个渲染成「没有变化」的面板在屏幕上
 * 长得一模一样（`FR-EVO-015`）。所以这里逐层数行，不接受「看起来对」。
 */
test('a clone with nothing changed renders as "nothing changed" — in all three layers, not as an empty panel', () => {
  const client = mountChineseClient()
  const diff = unchangedFixture()
  const renderPanel = (tab) => collect(client.__views.SkillDiffPanel({
    sessionId: 's-unchanged', skillName: 'ui-craft-custom', diff, tab, onClose() {},
  }))

  // ① 卡片那一句。复刻强制改写副本的 frontmatter `name:`，所以指纹必须算正文 ——
  //    否则这一句会永远说「来源内容已发生变化」，而用户一个字都没动过。
  const card = collect(client.__views.SkillEvolution({
    skillName: 'ui-craft-custom', lineage: diff, source: diff.comparison.source, diffPhase: 'ready',
    onOpenDiff() {}, openRef: { current: null },
  }))
  const cardText = textOf(card)
  assert.ok(cardText.includes('来源内容未发生变化'))
  assert.ok(!cardText.includes('来源内容已发生变化'), '一个字没改的复刻不许报「来源变了」')

  // ② 结构层：七个小节都要**列出来**并各自说「保持不变」，不能只留一行计数。
  const structure = renderPanel('structure')
  const structureRows = structure.filter((node) => node.props.className === 'st-diff-row')
  assert.equal(structureRows.length, 7, '结构层要逐节说话，不是一句「没有变化」了事')
  assert.deepEqual([...new Set(structureRows.map((node) => node.props['data-status']))], ['unchanged'])
  for (const row of structureRows) assert.ok(subtreeText(row).endsWith('保持不变'))
  const structureText = textOf(structure)
  assert.ok(structureText.includes('修改 0'), '计数行要给事实数字')
  assert.ok(structureText.includes('保持不变 7'))
  assert.ok(structureText.includes('Product Requirements Document (PRD)'), '真实的节标题要原样出现')

  // ③ 内容层：一行 `+` / `−` 都不许有 —— 那就是「哪儿都没改」的唯一证据。
  const content = renderPanel('content')
  assert.equal(content.filter((node) => node.props.className === 'st-diff-lines').length, 0,
    '一个字没改就不该有任何增删行')
  assert.equal(content.filter((node) => node.props.className === 'st-diff-row').length, 7,
    '内容层也要逐节列出来，否则用户分不清「没有差异」与「没有比较」')

  // ④ 资源层：四条，四条都在，`SKILL.md` 不在（它的正文归内容层）。
  const resources = renderPanel('resources')
  const resourceRows = resources.filter((node) => node.props.className === 'st-diff-row')
  assert.deepEqual(
    resourceRows.map((node) => ownText(node.children[0].children[0])),
    ['HISTORY.md', 'evals/trigger-fixtures.json', 'references/EXAMPLE.md', 'references/TEMPLATE.md'],
  )
  assert.ok(!textOf(resources).includes('SKILL.md'), 'SKILL.md 是正文，不属于资源层')

  // ⑤ 三层合起来仍不许出现判断词：全是「保持不变」时最容易顺手加一句「完全一致，无需处理」。
  const all = textOf([...structure, ...content, ...resources])
  for (const forbidden of ['更优秀', '更完整', '更合理', '质量', '优化', '推荐', '建议', '最佳', '落后', '过期', '一致', '无需']) {
    assert.ok(!all.includes(forbidden), `「没有变化」也不许带判断词「${forbidden}」`)
  }
})

test('closing the diff panel is Escape, and it stops there — closing a panel is not going back', () => {
  const client = mountChineseClient()
  let closed = 0
  const nodes = collect(client.__views.SkillDiffPanel({
    sessionId: 's-esc', skillName: 'ui-craft-custom', diff: diffFixture(), onClose: () => { closed += 1 },
  }))

  const overlay = nodes.find((node) => node.props.className === 'st-diff-overlay')
  assert.equal(overlay.props.role, 'dialog')
  assert.equal(overlay.props['aria-modal'], 'true')
  assert.equal(typeof overlay.props.onKeyDown, 'function')

  let stopped = 0
  overlay.props.onKeyDown({ key: 'Escape', stopPropagation: () => { stopped += 1 } })
  assert.equal(closed, 1, 'Esc 关掉面板')
  // stopPropagation 不是装饰：外层还有别的 Esc 处理器，让事件冒上去就等于
  // 「关一个面板」顺手把用户带回了列表页。
  assert.equal(stopped, 1, 'Esc 到此为止，不许继续冒泡')
  assert.equal(textOf(nodes).includes('关闭'), true, '键盘之外也得有出口')
})

// --- v0.9.1 「修改 Skill」：对话框与「本次修改对比」块 ------------------------------------
// 这两个组件回答的是同一个产品的两个时刻：**发出去之前**（用户授权了什么）与**改完之后**
// （文件里到底哪里不一样了）。它们最容易坏的两种方式都不长在表面上：
//   · 对话框把锁死的范围画成可点的 —— 用户以为 scripts/ 也在授权里；
//   · 对比块在拿不到「改前」时渲染成一份空结果 —— 那一屏读起来就是「这次修改什么都没变」。
test('the modify dialog offers exactly the scopes the core module grants, and the locked two cannot be armed', async () => {
  const core = await import('../src/core/skill-modification.mjs')
  const profiles = await import('../src/core/skill-profiles.mjs')
  const client = mountChineseClient()
  const nodes = collect(client.__views.SkillModifyDialog({
    sessionId: 's-modify', skillName: 'ui-craft', onClose() {}, onDispatched() {},
  }))

  const unlocked = nodes.filter((node) => node.props['data-role'] === 'modify-scope')
  const locked = nodes.filter((node) => node.props['data-role'] === 'modify-locked')
  // **两边对账，不抄一遍**：界面上的 id 与顺序必须就是核心模块那一份。少一项、把锁死的
  // 那两项放开、或者自己造一个新范围，都会在这里红。
  assert.deepEqual(
    [...unlocked, ...locked].map((node) => node.props['data-scope']),
    [...core.MODIFICATION_SCOPE_IDS],
    '对话框画出来的范围必须与核心模块逐字逐序相同',
  )
  assert.deepEqual(
    locked.map((node) => node.props['data-scope']),
    [...core.MODIFICATION_LOCKED_SCOPE_IDS],
    '默认锁死的就是 scripts 与 assets',
  )
  for (const node of locked) {
    assert.equal(node.props.disabled, true, '锁死的范围必须是按不动的 —— 画出来但不可点，比看不见它更诚实')
    assert.equal(node.props.onClick, undefined, '不可点的东西不该挂着处理器')
    assert.equal(node.props['data-locked'], 'true')
  }
  // 默认勾上的是**四个未锁的**：默认全不勾会让人以为「不勾就等于不改」。
  assert.deepEqual(unlocked.filter((node) => node.props['data-on'] === 'true').map((node) => node.props['data-scope']),
    [...core.MODIFICATION_SCOPE_IDS].filter((id) => !core.MODIFICATION_LOCKED_SCOPE_IDS.includes(id)))

  // 验收目标：Common Core 永远在里面且不可取消，其余四个平台可选。
  const targetChips = nodes.filter((node) => node.props['data-role'] === 'modify-profile')
  assert.deepEqual(targetChips.map((node) => node.props['data-profile']), [...profiles.SKILL_PROFILE_IDS])
  const common = targetChips.find((node) => node.props['data-profile'] === 'common')
  assert.equal(common.props['data-locked'], 'true', 'Common Core 不是选项，是底座')

  // 意图是**自然语言**，不是结构化表单：一个 textarea，长度上限来自核心模块。
  const intents = nodes.filter((node) => node.props['data-role'] === 'modify-intent')
  assert.equal(intents.length, 1, '一次修改只有一个自然语言入口')
  assert.equal(intents[0].type, 'textarea', '这里要写一整句话，不是填字段')
  assert.equal(intents[0].props.maxLength, core.MODIFICATION_INTENT_LIMIT)

  // 这个对话框不许长成一个编辑器：没有第二个可输入的控件，没有路径输入框。
  assert.equal(nodes.filter((node) => node.type === 'textarea' || node.type === 'input').length, 1,
    '插件不改文件：这里一旦出现第二个输入框，下一步就会有人把它接到写盘上')

  const submit = nodes.find((node) => node.props['data-role'] === 'modify-submit')
  assert.equal(ownText(submit), '交给 Agent')
  assert.equal(typeof submit.props.onClick, 'function', '「交给 Agent」这个点击本身就是授权')

  const text = textOf(nodes)
  for (const forbidden of ['已执行', '已完成', '已加载', '已读取', '优秀', '分数', '等级']) {
    assert.ok(!text.includes(forbidden), `修改对话框里不许出现「${forbidden}」`)
  }
})

test('the modification card says "not comparable" instead of an empty result that reads as "nothing changed"', () => {
  const client = mountChineseClient()
  const render = (modification) => collect(client.__views.SkillModificationPanel({
    modification,
    onCompare() {},
    onOpenModify() {},
  }))

  // 还没开始：它不该占着地方。详情页平时就有这张卡的话，用户会把「没有修改」读成一种状态。
  assert.equal(render({ phase: 'idle' }).filter((node) => node.props['data-role'] === 'skill-modification').length, 0,
    '没有修改事务时，这一块根本不出现')

  // 发出去了、Agent 还没改完：只能等，且**不轮询**。
  let compared = 0
  const waiting = collect(client.__views.SkillModificationPanel({
    modification: { phase: 'waiting' },
    onCompare: () => { compared += 1 },
    onOpenModify() {},
  }))
  assert.ok(textOf(waiting).includes('修改任务已经发给当前会话的 Agent'))
  const compareButton = waiting.find((node) => node.props['data-role'] === 'mod-compare')
  assert.equal(ownText(compareButton), '对比本次修改')
  compareButton.props.onClick()
  assert.equal(compared, 1, '「对比本次修改」必须真的去问宿主')

  // 拿不到「改前」：说出来，而且**一条结果都不许渲染**。
  const unavailable = render({
    phase: 'ready',
    released: false,
    comparison: {
      available: false,
      reason: 'snapshot-missing',
      message: '本次修改前状态不可用，暂时无法比较本次修改的内容。',
      source: { state: 'unknown', message: '这次没有可以对比的来源指纹。' },
    },
  })
  const alert = unavailable.find((node) => node.props['data-role'] === 'mod-unavailable')
  assert.ok(alert, '快照没了必须**说出来**，不是画一张空表')
  assert.equal(alert.props.role, 'alert')
  assert.deepEqual(alert.children, ['本次修改前状态不可用，暂时无法比较本次修改的内容。'])
  assert.equal(unavailable.filter((node) => node.props['data-role'] === 'mod-scopes').length, 0,
    '无法比较时不许渲染范围表：一张空表看起来完全正常')
  assert.equal(unavailable.filter((node) => node.props['data-role'] === 'mod-lines').length, 0,
    '「新增 0 行 · 删除 0 行」本身就是一句「比较过了，没有变化」')

  // 真的对比出来了：逐项都是**事实**，没有一个判断词。
  const ready = render({
    phase: 'ready',
    released: true,
    comparison: {
      available: true,
      status: 'changed',
      lines: { added: 3, removed: 2, exact: true },
      sections: { added: ['Gradients'], removed: [], truncated: false },
      resources: { available: true, added: [], removed: [], modified: ['references/tokens.md'] },
      scopes: [
        { id: 'skill-md-rules', state: 'changed', changed: true },
        { id: 'references', state: 'unchanged', changed: false },
      ],
      outOfScope: [{ id: 'skill-md-workflow', detail: 'SKILL.md / Workflow 发生了变化，但它不在本次指定的修改范围里。' }],
      identity: { state: 'unchanged' },
      source: { state: 'unchanged', message: '来源 Skill 没有发生变化。' },
      notes: ['这次没有指定修改范围，所以任何变化都会被列为超出范围。'],
      limitations: ['改前快照只活在宿主内存里，DSH 重启之后就没了。'],
    },
  })
  const status = ready.find((node) => node.props['data-role'] === 'mod-status')
  assert.equal(status.props['data-status'], 'changed')
  assert.equal(ownText(status), '有变化')
  assert.ok(textOf(ready).includes('新增 3 行 · 删除 2 行'))
  assert.deepEqual(
    ready.filter((node) => node.props['data-role'] === 'mod-scope').map((node) => [node.props['data-scope'], node.props['data-state']]),
    [['skill-md-rules', 'changed'], ['references', 'unchanged']],
  )
  assert.deepEqual(
    ready.filter((node) => node.props['data-role'] === 'mod-out-of-scope-item').map((node) => node.props['data-id']),
    ['skill-md-workflow'],
    '超出范围的变化必须**如实报出来** —— 那是用户确认过的范围，不是插件说了算',
  )
  assert.ok(ready.some((node) => node.props['data-role'] === 'mod-resource' && node.props['data-kind'] === 'modified'))
  assert.ok(ready.some((node) => node.props['data-role'] === 'mod-released'), '快照释放了就要说，否则用户会以为还能再对比一次')
  assert.ok(ready.some((node) => node.props['data-role'] === 'mod-limitations'))

  const text = textOf(ready)
  for (const forbidden of ['已执行', '已完成', '已加载', '已读取', '优秀', '最佳', '分数', '等级', '质量']) {
    assert.ok(!text.includes(forbidden), `对比块里不许出现「${forbidden}」`)
  }
  for (const code of ['snapshot-missing', 'skill-unreadable', 'no-directory-listing']) {
    assert.ok(!text.includes(code), '理由码不许以代码形式出现在界面上')
  }
})

// v0.10.0 §5.12：实例验收那一段只做一件事 —— 把这次修改变成一段能拿去真跑的任务。
// 这一屏有两处「少说一句就出事」的地方，所以两处都断言：生成的 Prompt 里**必须**没有观察项
// （有的话等于我们在 Prompt 里重新教 Agent 该怎么做，测试被自己污染），以及拿不到东西时
// 界面说出来、而不是给一段看起来哪儿都能用的通用任务。
test('the instance-test block hands over a task, never a verdict, and never merges the observation list into it', async () => {
  const client = mountChineseClient()
  const core = await import('../src/core/skill-instance-test.mjs')
  const comparison = {
    available: true,
    status: 'changed',
    scopeIds: ['skill-md-workflow'],
    scopes: [{ id: 'skill-md-workflow', label: '运行逻辑', target: 'workflow', section: '## 运行逻辑', state: 'changed', changed: true }],
    sections: { added: [], removed: [], truncated: false },
    resources: { available: true, added: [], removed: [], modified: [] },
    outOfScope: [],
    identity: { state: 'unchanged' },
    source: { state: 'unchanged', message: '来源 Skill 没有发生变化。' },
    summary: { scopesChanged: 1, scopesUnchanged: 0, scopesUnknown: 0, outOfScopeCount: 0, addedLines: 2, removedLines: 1 },
    contentChanged: true,
    limitations: [],
    notes: [],
    lines: { added: 2, removed: 1, exact: true },
  }
  const definitionText = ['# demo-skill', '', '## 运行逻辑', '', '1. 先读资料再动手。', '', '## 输出', '', '一份会议纪要。'].join('\n')
  const ready = core.buildSkillInstanceTest({
    skillName: 'demo-skill',
    comparison,
    definitionText,
    description: '当用户需要整理会议纪要时使用。',
    validation: null,
  })
  assert.equal(ready.available, true)

  const card = collect(client.__views.SkillModificationPanel({
    modification: { phase: 'ready', released: false, comparison },
    instanceTest: { phase: 'ready', test: ready },
    onCompare() {},
    onGenerateInstanceTest() {},
    onOpenModify() {},
  }))

  const promptNode = card.find((node) => node.props['data-role'] === 'mod-instance-prompt')
  assert.ok(promptNode, '生成好了就要把 Prompt 摆出来 —— 用户要复制的是它')
  const promptText = ownText(promptNode)
  assert.ok(promptText.includes('【任务】') && promptText.includes('【注意】'))

  // 规格 §19 的卡面结构与 §21 那条最核心的验收标准（Prompt 与这次修改的对应关系要看得见）：
  // 两块抬头 + 一行「这个任务用了哪些输入」，都在这一屏里。
  const wholeText = textOf(card)
  assert.ok(wholeText.includes('验证目标'), '实例验收卡要有「验证目标」抬头（规格 §19）')
  assert.ok(wholeText.includes('测试 Prompt'), 'Prompt 那块要写明它是「测试 Prompt」')
  const traces = card.filter((node) => node.props['data-role'] === 'mod-instance-trace')
  assert.ok(traces.length > 0, '要说清这个任务用了哪些输入 —— 那条最核心的验收标准靠它')
  const traceText = traces.map((node) => ownText(node)).join(' ')
  assert.ok(traceText.includes('这个任务用了这些输入'), `来源行要摆出输入清单，实际「${traceText}」`)
  assert.ok(traceText.includes('任务形状由主范围决定'), '要说明任务形状是从哪个范围来的')
  assert.ok(!wholeText.includes('你这次的意图点名了它'), '没拿到意图时不许说意图点名了它')
  for (const line of ready.trace.sources) {
    assert.ok(!traceText.includes(line), `trace 里递的是人话标签，不该出现内部 id「${line}」`)
  }

  for (const entry of ready.observations) {
    assert.ok(!promptText.includes(entry.text), `观察项「${entry.text}」不许进 Prompt`)
  }
  const observations = card.filter((node) => node.props['data-role'] === 'mod-instance-observation')
  assert.equal(observations.length, ready.observations.length, '观察项要一条不少地摆给用户看')
  for (const node of observations) assert.ok(ownText(node).endsWith('？'))

  const whole = textOf(card)
  for (const forbidden of ['成功率', '通过率', '评分', '得分', '优秀', '合格', '成功', '失败', '有效', '无效']) {
    assert.ok(!whole.includes(forbidden), `实例验收这一屏不许出现结论性词汇「${forbidden}」`)
  }

  // 还没点：只给一个入口；生成不了：说清楚为什么，且一个 Prompt 都不画。
  const idle = collect(client.__views.SkillModificationPanel({
    modification: { phase: 'ready', released: false, comparison },
    instanceTest: { phase: 'idle' },
    onCompare() {},
    onGenerateInstanceTest() {},
    onOpenModify() {},
  }))
  assert.ok(idle.some((node) => node.props['data-role'] === 'mod-instance-generate'))
  assert.equal(idle.filter((node) => node.props['data-role'] === 'mod-instance-prompt').length, 0)

  let generated = 0
  const clickable = collect(client.__views.SkillModificationPanel({
    modification: { phase: 'ready', released: false, comparison },
    instanceTest: { phase: 'idle' },
    onCompare() {},
    onGenerateInstanceTest: () => { generated += 1 },
    onOpenModify() {},
  }))
  clickable.find((node) => node.props['data-role'] === 'mod-instance-generate').props.onClick()
  assert.equal(generated, 1, '「生成实例验收」必须真的去生成')

  const unavailable = collect(client.__views.SkillModificationPanel({
    modification: { phase: 'ready', released: false, comparison },
    instanceTest: { phase: 'unavailable', message: '这次改动没有落在可以生成实例验收的范围里，因此没有可生成的任务。' },
    onCompare() {},
    onGenerateInstanceTest() {},
    onOpenModify() {},
  }))
  const alert = unavailable.find((node) => node.props['data-role'] === 'mod-instance-unavailable')
  assert.ok(alert, '生成不了就要说出来，而不是退回一个什么都能用的通用任务')
  assert.equal(alert.props.role, 'alert')
  assert.equal(unavailable.filter((node) => node.props['data-role'] === 'mod-instance-prompt').length, 0)

  // 只有真的存在「本次修改」时这一段才出现（规格 §十三）。
  const idleModification = collect(client.__views.SkillModificationPanel({
    modification: { phase: 'idle' },
    instanceTest: { phase: 'idle' },
    onCompare() {},
    onGenerateInstanceTest() {},
    onOpenModify() {},
  }))
  assert.equal(idleModification.length, 0, '没有修改事务时，连实例验收这一段都不该出现')
})

test('the evaluation card is a ledger: four stages, three inequalities, factual comparison — and no aggregate anywhere', async () => {
  const client = mountChineseClient()
  const core = await import('../src/core/skill-evaluation.mjs')
  const sha = (letter) => `sha256:${letter.repeat(64)}`

  const comparison = {
    available: true,
    status: 'changed',
    scopeIds: ['skill-md-workflow'],
    scopes: [{ id: 'skill-md-workflow', label: '运行逻辑', target: 'workflow', section: '## 运行逻辑', state: 'changed', changed: true }],
    sections: { added: [], removed: [], truncated: false },
    resources: { available: true, added: [], removed: [], modified: [] },
    outOfScope: [],
    identity: { state: 'unchanged' },
    source: { state: 'unchanged', message: '来源 Skill 没有发生变化。' },
    summary: { scopesChanged: 1, scopesUnchanged: 0, scopesUnknown: 0, outOfScopeCount: 0, addedLines: 2, removedLines: 1 },
    contentChanged: true,
    limitations: [],
    notes: [],
    lines: { added: 2, removed: 1, exact: true },
  }
  const definitionText = ['# demo-skill', '', '## 运行逻辑', '', '1. 先读资料再动手。', '', '## 输出', '', '一份会议纪要。'].join('\n')
  const built = core.buildEvaluationCase({
    skillName: 'demo-skill',
    intent: '把规则收紧一点',
    comparison,
    definitionText,
    description: '当用户需要整理会议纪要时使用。',
    framework: null,
    validation: null,
    scopeIds: ['skill-md-workflow'],
    skillFingerprint: { instructionSha256: sha('a'), match: 'match' },
  })
  assert.equal(built.available, true, '夹具自己得是一份生成得出来的 Case')
  const caseRecord = { ...built.case, caseId: sha('b') }
  const observationIds = caseRecord.observations.map((entry) => entry.id)

  const runOf = (runId, observed, match, firstVerdict, outcome, startedAt) => core.normalizeEvaluationRun({
    caseId: caseRecord.caseId,
    runId,
    startedAt,
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    reasoningEffort: 'high',
    contextWindow: 1000000,
    pluginVersion: '1.0.0',
    dshVersion: 'unavailable',
    turn: 3,
    step: 12,
    observedInstructionSha256: observed,
    currentInstructionSha256: sha('a'),
    match,
    load: { status: 'loaded', seq: 6, callSeq: 6, resultSeq: 8 },
    trigger: { catalogPublished: true, offerCount: null },
    runtimeEvents: { available: true, activities: [{ name: 'read', count: 2 }], total: 2 },
    outcome,
    judgements: Object.fromEntries(observationIds.map((id, index) => [id, index === 0 ? firstVerdict : 'unknown'])),
  })
  const beforeRun = runOf('r-before', sha('c'), 'mismatch', 'fail', { source: 'user', text: '产出还是套话排版。' }, 1790858000000)
  const afterRun = runOf('r-after', sha('a'), 'match', 'pass', { source: 'user', text: '只用了主题 token。' }, 1790858600000)

  // 详情页有一条注入缝（`evaluation`），所以这里不经过网络就能渲染真卡。
  const nodes = collect(client.__views.SkillDetailPage({
    sessionId: 's',
    skillName: 'demo-skill',
    skill: {
      skillName: 'demo-skill',
      summary: { name: 'demo-skill', description: '当用户需要整理会议纪要时使用。' },
      definition: { available: true, skillName: 'demo-skill', content: { text: definitionText, sha256: sha('a'), lineCount: 9, bytes: definitionText.length }, outline: [], limitations: [] },
      validation: null,
      framework: null,
      runtimeLogic: null,
      flow: null,
      evidence: null,
      runs: [],
      observation: { match: 'match', observedInstructionSha256: [sha('a')], currentInstructionSha256: sha('a'), loadedDuringRun: true, inPublishedCatalog: true, catalogPublication: null },
      limitations: [],
      lineage: null,
    },
    evaluation: { phase: 'ready', caseRecord, caseId: caseRecord.caseId, runs: [afterRun, beforeRun], judgements: afterRun.judgements, outcome: afterRun.outcome, runRoles: {} },
  }))

  const card = nodes.find((node) => node.props['data-role'] === 'eval-card')
  assert.ok(card, '评测卡必须渲染出来')
  const cardText = nodes.filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  assert.ok(cardText.includes('Skill 评测'), '抬头写「Skill 评测」')
  assert.ok(cardText.includes('不给分、不排序、不画走势'), '这一屏的第一句话就要把边界说清楚')

  // ① Case 的身份只用宿主算出来的那个；客户端不许自己算哈希。
  const identity = nodes.find((node) => node.props['data-role'] === 'eval-identity')
  assert.equal(ownText(identity), caseRecord.caseId, '身份来自宿主')
  assert.ok(ownText(nodes.find((node) => node.props['data-role'] === 'eval-prompt')).includes('【任务】'))
  assert.equal(nodes.filter((node) => node.props['data-role'] === 'eval-observation').length, caseRecord.observations.length)

  // ② 判定三态都在，且是人不给就写「无法判断」的措辞。
  assert.ok(cardText.includes('沉默不折算成「未通过」'))
  for (const id of core.EVALUATION_VERDICT_IDS) {
    assert.ok(cardText.includes(core.EVALUATION_VERDICT_LABELS[id]), `三态判定要在场：${id}`)
  }

  // ⑤ 四段证据按固定顺序，每段带「够不着什么」，并念出三条不等式。
  const stages = nodes.filter((node) => node.props['data-role'] === 'eval-stage')
  assert.deepEqual(stages.map((node) => node.props['data-stage']), ['trigger', 'load', 'use', 'outcome'])
  // 三条不等式是这一块里的 `<span>`，所以查整张卡的文本（`ownText` 只收直接字符串子节点）。
  assert.ok(nodes.some((node) => node.props['data-role'] === 'eval-inequalities'), '不等式那一块要在场')
  for (const line of core.EVALUATION_INEQUALITIES) assert.ok(cardText.includes(line), `不等式要在场：${line}`)
  for (const id of core.EVALUATION_EVIDENCE_STAGE_IDS) {
    assert.ok(cardText.includes(core.EVALUATION_STAGE_REACH[id]), `每段都要写清它够不着什么：${id}`)
  }

  // 指纹只许出现一层前缀（这一条是渲染级的回归测试：曾经会渲染成 sha256:sha256:…）。
  const loadStage = stages.find((node) => node.props['data-stage'] === 'load')
  const loadText = loadStage.children.filter((child) => typeof child === 'string').join(' ')
  assert.equal(loadText.includes('sha256:sha256:'), false, '指纹不许出现两层前缀')

  // ⑥ 断言与对照：行数与核心模块一致，对照列只用事实词。
  const expected = core.compareEvaluationRuns({ case: caseRecord, before: beforeRun, after: afterRun })
  const rows = nodes.filter((node) => node.props['data-role'] === 'eval-assertion')
  assert.equal(rows.length, expected.rows.length, '断言行数与核心模块逐条对齐')
  assert.ok(cardText.includes(core.EVALUATION_COMPARISON_WORDS.beforeFailAfterPass), '对照列说的是事实差别')

  // 永久禁令：**除 ⑦「刻意不出现的东西」那一块之外**，整张卡一个聚合口径都不许出现。
  // ⑦ 那一块本来就要把它们划掉摆出来（`.st-eval-forbidden-item`，`line-through`）——
  // 「刻意不出现」和「出现了」如果长得一样，这一块就没有意义。所以扫描要排除它。
  const forbiddenAt = nodes.findIndex((node) => node.props['data-role'] === 'eval-forbidden')
  assert.ok(forbiddenAt > 0, '⑦「刻意不出现的东西」那一块要在场')
  const classifiedText = nodes.slice(0, forbiddenAt).filter((node) => node.type === '#text').map((node) => node.text).join('\n')
  for (const banned of core.EVALUATION_FORBIDDEN_OUTPUTS) {
    assert.equal(classifiedText.includes(banned), false, `评测卡里不许出现聚合口径「${banned}」`)
  }
  // 而 ⑦ 本身要把它们逐条划掉摆出来：一个都不许少。
  const struck = nodes.filter((node) => node.props.className === 'st-eval-forbidden-item')
  assert.deepEqual(struck.map((node) => ownText(node)), [...core.EVALUATION_FORBIDDEN_OUTPUTS], '⑦ 要逐条列出永久不做的那些口径')

  // 还没有 Case：只给一个入口，一个 Prompt / 一段证据都不画。
  const empty = collect(client.__views.SkillDetailPage({
    sessionId: 's',
    skillName: 'demo-skill',
    skill: null,
    evaluation: { phase: 'ready', caseRecord: null, runs: [], judgements: {}, outcome: { source: 'user', text: '' }, runRoles: {} },
  }))
  const emptyCard = empty.find((node) => node.props['data-role'] === 'eval-card')
  if (emptyCard) {
    assert.ok(empty.find((node) => node.props['data-role'] === 'eval-unavailable'), '没有 Case 时说清楚，不画空壳')
    assert.equal(empty.filter((node) => node.props['data-role'] === 'eval-stage').length, 0, '没有 Case 就不该有证据段')
  }
})
