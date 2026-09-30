import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const required = [
  'package.json',
  'cordis.patch.yml',
  'src/core/trace-reducer.mjs',
  'src/core/source-snapshot.mjs',
  'src/core/catalog-view.mjs',
  'src/storage/receipt-store.mjs',
  'src/storage/preference-store.mjs',
  'src/dsh/host/index.js',
  'src/dsh/client/client.js',
]

for (const file of required) await readFile(resolve(root, file), 'utf8')

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
if (packageJson.name !== 'dsh-skill-trace') throw new Error('package name mismatch')
if (!packageJson.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-ui-conversation')) throw new Error('conversation client injection missing')
if (!packageJson.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-locale')) throw new Error('locale client injection missing')

for (const file of ['src/core/trace-reducer.mjs', 'src/core/source-snapshot.mjs', 'src/core/catalog-view.mjs', 'src/storage/receipt-store.mjs', 'src/storage/preference-store.mjs', 'src/dsh/host/index.js', 'src/dsh/client/client.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${file} syntax check failed:\n${result.stderr}`)
}

const client = await readFile(resolve(root, 'src/dsh/client/client.js'), 'utf8')
for (const requiredText of [
  'Skill 收据',
  '运行流程',
  "localStorage.setItem(VIEW_KEY",
  "view === 'receipt'",
  '当前对话暂未加载可追踪的 Skill。',
  '暂时无法确认当前对话是否加载了 Skill。',
  "'data-simple': 'true'",
  'method.callCount',
  'model.events',
  "api('/preferences'",
  '本次 Skill 使用记录',
  '本次流程小结',
  '发生了什么',
  '这不能说明什么',
  'width:max(100%,1000px)',
  'st-map-stage',
  'margin-inline:auto',
  'ctx.locale.register(NS',
  'React.useSyncExternalStore',
  'Related load records (',
  'Dependency signals: ',
  'Agent invocable',
  'Instruction fingerprint(s): ',
  "active || 'en') !== 'zh'",
  '逐个看懂 Skill',
  '我的理解与迭代',
  '复制清单',
  '不会自动修改或发布 Skill',
  '我的 Skill',
  '当前可发现',
  '有真实收据',
  '历次会话理解',
  '内容相符候选',
  '不选择最新一条充当当前综合理解',
  '验证结果回执',
  '学习与验证时间线',
  "['pending', '待回看']",
  "['validated', '已记录结果']",
  "api('/validation-result'",
  '不代表 Skill 的普遍质量',
  '回看工作台',
  'function CatalogGuide()',
  'st-catalog-guide',
  'if (previous) previous.replaceWith(style)',
  'if (document.getElementById(STYLE_ID) === style) style.remove()',
  'st-guide-link',
  '打开 Skill Trace 使用指南',
  '把一次 Skill 使用，变成可回看的学习记录',
  "['观察加载请求', '只记录可观测事件']",
  "['回来记录结果', '把复测结果留在原会话']",
  '不上传或翻译个人内容',
  '搜索 Skill 名称、声明和我的记录',
  '复制继续行动卡',
  "api('/backups'",
  "api('/backups/restore'",
  "fetch('/api/host.openPath'",
  "api('/receipts'",
  '确认清空全部本地收据',
  "'回看工作台': 'Review workspace'",
  "'搜索 Skill 名称、声明和我的记录': 'Search Skill names, declarations, and my records'",
  "'排序方式': 'Sort order'",
  "'创建本地备份': 'Create local backup'",
  "'打开备份文件夹': 'Open backup folder'",
  "'恢复缺失收据': 'Restore missing receipts'",
  "'恢复缺失数据': 'Restore missing data'",
  "'清空本地收据': 'Clear local receipts'",
  "'确认清空全部收据': 'Clear all receipts'",
  "'复制继续行动卡': 'Copy continuation card'",
  "const DRAFT_KEY = 'dsh-skill-trace.unsaved-drafts.v1'",
  "draftId('learning', receipt.sessionId, learningSkill)",
  "draftId('validation', sessionId, skillName)",
  "draftId('output', receipt.sessionId)",
  "window.addEventListener('beforeunload', handler)",
  '未保存草稿只暂存在当前 Desktop 运行期间',
  '当前无法暂存，切换页面前请先保存',
  'const volatileDrafts = new Set()',
]) {
  if (!client.includes(requiredText)) throw new Error(`client contract missing: ${requiredText}`)
}
if (client.includes('Promise.all([buildReceipt') || client.includes('generateImage')) throw new Error('dual view must not generate duplicate analyses')
if (client.includes('window.confirm(')) throw new Error('destructive actions must use inline confirmation')
if (client.includes('if (document.getElementById(STYLE_ID)) return () => {}')) throw new Error('stylesheet lifecycle must not leave a newer client instance without ownership')
// The receipt's own evidence lists must never be silently shortened: a capped list
// reads as "this is all of it". Sample-style truncation elsewhere is fine as long as
// it is labelled with the true count, which the runtime inspector does.
for (const list of ['methods', 'events', 'learningCards', 'traceEvents', 'validationResults', 'outputs']) {
  if (new RegExp(`\\.${list}\\.slice\\(0,\\s*\\d+\\)`).test(client)) {
    throw new Error(`trace views must not silently cap ${list}`)
  }
}
if (client.includes('人工反馈') || client.includes("api('/assessment'")) throw new Error('feedback UI must remain absent until a real receiving loop exists')
for (const supersededText of ['Skill 方法追踪', '方法收据', '方法地图', '方法加载结果', '方法延续卡', '本次运行概要']) {
  if (client.includes(supersededText)) throw new Error(`superseded UI terminology remains: ${supersededText}`)
}

const host = await readFile(resolve(root, 'src/dsh/host/index.js'), 'utf8')
for (const requiredText of ['preferenceStore.read()', "'/skill-trace/preferences'", 'preferenceStore.write', 'shouldPersistReceipt', 'syncReceipt', 'store.prune', 'store.list()', 'store.clear()', "'/skill-trace/learning-note'", "'/skill-trace/validation-result'", "'/skill-trace/catalog'", "'/skill-trace/history-receipt'", "'/skill-trace/backups'", "'/skill-trace/backups/preview'", "'/skill-trace/backups/restore'", "'/skill-trace/receipts'", 'createVerifiedBackup', 'buildLocalArchive', 'mergeMissingReceiptData', 'createSessionMutationQueue', 'runMaintenance', 'restoreMissingReceipts(archive.receipts, store, cache, enqueue)', 'agentPresets?.serviceFor', 'scope: liveAgent', 'setLearningNote', 'setValidationResult', 'sessionEventLog(session)', 'session.snapshotEvents()']) {
  if (!host.includes(requiredText)) throw new Error(`preference persistence contract missing: ${requiredText}`)
}
if (host.includes('rebuildReceipt(sessionId, session.events')) throw new Error('host must rebuild from the live session log, not the removed session.events field')
if (host.includes("'/skill-trace/assessment'")) throw new Error('assessment route must remain absent until a real receiving loop exists')
// Phase 0 observation surface. `user/message` carries the user-explicit `/name`
// load and the published catalog; `turn/start` advances the log-order cursor that
// attributes it, because a `user/message` records no turn/step of its own.
for (const requiredText of ["'user/message'", "'turn/start'", 'carriesSkillEvidence(event)', 'runtimeEventOverflow']) {
  if (!host.includes(requiredText)) throw new Error(`observation surface missing from host: ${requiredText}`)
}
// Skill evidence stays immediately durable; derived runtime evidence is written at
// the turn boundary instead of on every tool event.
if (!host.includes('skillEvidenceSignature') || !host.includes("event.type === 'turn/end' || skillEvidenceGained")) {
  throw new Error('host must keep Skill evidence immediate and defer runtime evidence to the turn boundary')
}
if (host.includes("event.type === 'tool/call'\n          || event.type === 'tool/result'")) {
  throw new Error('host must not rewrite the receipt on every tool event')
}

const reducer = await readFile(resolve(root, 'src/core/trace-reducer.mjs'), 'utf8')
for (const requiredText of ['methodCount:', 'eventCount:', 'methods,', 'events,', 'turnDetails,', 'summary,', ": 'mixed'", 'learningCards', 'learningNotes', 'validationResults', 'setValidationResult', 'buildLearningCards']) {
  if (!reducer.includes(requiredText)) throw new Error(`projection contract missing: ${requiredText}`)
}
// Session format V4 retired the `tool-result` wrapper and lifted a tool result into a
// first-class `tool` message. A reader that matches only the V3 wrapper returns no
// content while still reporting `loaded`, which silently drops the instruction
// fingerprint, the candidate steps, and version-drift detection.
if (!reducer.includes("block?.type === 'tool-result'") || !reducer.includes('?? message')) {
  throw new Error('tool result reader must accept both the retired V3 tool-result wrapper and the first-class V4 tool message')
}
for (const requiredText of ['export function carriesSkillEvidence', "'skill-invocation'", "'skill-catalog'", 'catalogPublished', 'runtimeEvents', 'invocationType', 'RUNTIME_EVENT_LIMIT', "export { classifyCapability }"]) {
  if (!reducer.includes(requiredText)) throw new Error(`phase 0/1 observation contract missing: ${requiredText}`)
}
{
  // Runtime evidence is a metadata-only projection. Tool arguments and result
  // content must never reach it, so the call reducer may not read either field.
  const start = reducer.indexOf('function reduceRuntimeCall')
  const end = reducer.indexOf('function reduceRuntimeResult')
  if (start < 0 || end <= start) throw new Error('runtime event reducer missing')
  const callBody = reducer.slice(start, end)
  for (const forbidden of ['arguments', 'content']) {
    if (callBody.includes(forbidden)) throw new Error(`runtime events must not read tool ${forbidden}`)
  }
  if (!reducer.includes('runtimeEventOverflow: receipt.runtimeEventOverflow + dropped')) {
    throw new Error('runtime event truncation must be counted, never silently dropped')
  }
}

// Phase 1 normalized model. The two properties that must survive any later edit:
// a derived event is never written over a `dsh` one, and pairing is by
// `invocationId` rather than by adjacency.
const runtimeModel = await readFile(resolve(root, 'src/core/runtime-events.mjs'), 'utf8')
for (const requiredText of [
  'export function classifyCapability',
  'export function aggregateInvocations',
  'export function deriveRetryEvent',
  'export const RETRY_RULE',
  "export const RUNTIME_EVENT_SOURCES = ['dsh', 'derived']",
  "'unresolved-request'",
  "'orphan-result'",
]) {
  if (!runtimeModel.includes(requiredText)) throw new Error(`phase 1 runtime model contract missing: ${requiredText}`)
}
if (!runtimeModel.includes('byId.get(event.invocationId)')) throw new Error('invocations must be paired by invocationId')
if (!runtimeModel.includes('candidate.turn !== turn')) throw new Error('the retry rule must stay bounded to one turn')
if (runtimeModel.includes('getTime()') || runtimeModel.includes('Date.now() -')) throw new Error('runtime correlation must not use wall-clock adjacency')
if (!reducer.includes("from './runtime-events.mjs'")) throw new Error('the reducer must consume the shared runtime model')

// Phase 2 correlation and provenance. The graph may be incomplete; it may never
// assert a relationship the runtime did not report.
const graphModel = await readFile(resolve(root, 'src/core/runtime-graph.mjs'), 'utf8')
for (const requiredText of [
  'export function buildRuntimeGraph',
  'export const FOLLOWS_RULE',
  'export const SPAWN_ATTRIBUTION_RULE',
  'export const EDGE_TYPES',
  "'contains', 'spawns', 'retries', 'follows'",
  'unlinked',
  'droppedEdgeCount',
  'Graph completeness < Graph truthfulness',
]) {
  if (!graphModel.includes(requiredText)) throw new Error(`phase 2 graph contract missing: ${requiredText}`)
}
// The edge vocabulary is closed on purpose: there is no causal edge type, because
// the runtime never reported causation. Pinned as an exact literal so adding one
// has to be a deliberate, visible change.
{
  const edgeTypesLine = graphModel.split('\n').find((line) => line.startsWith('export const EDGE_TYPES'))
  if (edgeTypesLine !== "export const EDGE_TYPES = ['contains', 'spawns', 'retries', 'follows']") {
    throw new Error('the edge vocabulary must stay closed and non-causal')
  }
  const nodeTypesLine = graphModel.split('\n').find((line) => line.startsWith('export const NODE_TYPES'))
  if (nodeTypesLine !== "export const NODE_TYPES = ['session', 'turn', 'skill', 'tool', 'cli', 'mcp', 'subagent']") {
    throw new Error('the node vocabulary must stay closed')
  }
}
{
  // Layout is a view concern: the graph model must carry no coordinates, and the
  // same receipt must yield the same graph at any window size.
  const code = graphModel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  if (/\bviewport\b|\bzoom\b|\bposition\s*:|[xy]\s*:\s*-?\d/.test(code)) {
    throw new Error('the graph model must carry no layout state')
  }
}
for (const requiredText of ["'subagent/catalog'", 'withLineage', 'setRuntimeLineage']) {
  if (!host.includes(requiredText)) throw new Error(`phase 2 correlation input missing from host: ${requiredText}`)
}
if (!runtimeModel.includes("'subagent.spawn'")) throw new Error('the runtime model must carry the durable spawn event')
// The catalog label is caller text and must never be read.
if (/data\.label|\.label\b/.test(runtimeModel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) {
  throw new Error('the subagent catalog label is caller text and must not be read')
}

// Phase 3 Declaration <-> Runtime Alignment. Two promises are pinned here: the
// alignment cannot express "the Agent skipped this", and it cannot produce a score.
const alignmentModel = await readFile(resolve(root, 'src/core/runtime-alignment.mjs'), 'utf8')
for (const requiredText of [
  'export function buildAlignment',
  'export function extractDeclarationSteps',
  "export const ALIGNMENT_RELATIONSHIPS = ['runtime-supported', 'intent-supported', 'partial', 'insufficient', 'unknown']",
  "export const STEP_EXTRACTION_CHANNELS = ['heading', 'ordered-list']",
  'scored: false',
  '证据不足不等于 Agent 没有执行该步骤',
]) {
  if (!alignmentModel.includes(requiredText)) throw new Error(`phase 3 alignment contract missing: ${requiredText}`)
}
{
  const statusLine = alignmentModel.split('\n').find((line) => line.startsWith('export const ALIGNMENT_RELATIONSHIPS'))
  for (const forbidden of ['not-observed', 'not_observed', 'skipped', 'not-done']) {
    if (statusLine.includes(forbidden)) throw new Error(`the alignment must not claim a step was skipped: ${forbidden}`)
  }
  const code = alignmentModel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const forbidden of ['complianceRate', 'compliance_rate', 'percent', 'ranking', 'followedRate']) {
    if (code.includes(forbidden)) throw new Error(`the alignment must not score a Skill: ${forbidden}`)
  }
  // Headings must outrank stray numbered lists, or real constraint lists get
  // relabelled as a declared process. The rule now lives in the shared scanner:
  // `runtime-alignment.mjs` and `skill-flow.mjs` were split so the receipt path and the
  // definition path cannot drift into two different notions of "declared step".
  const skillFlow = await readFile(resolve(root, 'src/core/skill-flow.mjs'), 'utf8')
  if (!skillFlow.includes("headingCount ? 'heading'")) {
    throw new Error('the heading channel must outrank the ordered-list fallback')
  }
  if (!alignmentModel.includes('scanDeclaredSteps')) {
    throw new Error('the receipt path must share the declared-step scanner instead of owning a copy')
  }
}
if (!reducer.includes("from './runtime-alignment.mjs'")) throw new Error('the reducer must consume the alignment model')
// The client payload must stay bounded. The invocation list is one object per tool
// call, nothing renders it, and projecting it cost roughly 300 KB per large session
// before being sent twice (the receipt and map projections share one block).
if (/invocations:\s*aggregateInvocations/.test(reducer)) {
  throw new Error('the client view model must not carry the unbounded invocation list')
}

// Phase 4 canvas. Layout is a view concern that must stay separate from the facts,
// and the client must draw what it is given rather than decide anything itself.
const layoutModel = await readFile(resolve(root, 'src/core/runtime-layout.mjs'), 'utf8')
for (const requiredText of [
  'export function computeRuntimeLayout',
  'export const LAYOUT_NODE_LIMIT',
  'export const MAX_ROWS_PER_COLUMN',
  'export const MAX_TURN_NODES',
  'export const TURN_COLLAPSE_THRESHOLD',
  'collapsedInsideCount',
  'memberIds',
]) {
  if (!layoutModel.includes(requiredText)) throw new Error(`phase 4 layout contract missing: ${requiredText}`)
}
{
  const code = layoutModel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  if (/\bviewport\b|\bzoom\b/.test(code)) throw new Error('the layout must not model a viewport')
  // A bound that cannot report what it dropped is not a bound.
  if (!layoutModel.includes('hidden: {')) throw new Error('the layout must report what it left out')
}

const inspectorModel = await readFile(resolve(root, 'src/core/runtime-inspector.mjs'), 'utf8')
for (const requiredText of [
  'export function inspectRuntimeNode',
  'export function inspectRuntimeEdge',
  'causal: false',
  'compliance: false',
  'correctness: false',
  'INSPECTOR_EVIDENCE_LIMIT',
]) {
  if (!inspectorModel.includes(requiredText)) throw new Error(`phase 4 inspector contract missing: ${requiredText}`)
}
// Every inspected relation must state its own limit, not only its meaning, and the
// fallback must be a sentence rather than nothing.
if (!inspectorModel.includes("limit: entry?.limit ??")) {
  throw new Error('every relation must state what it does not claim')
}

for (const requiredText of ["'/skill-trace/runtime'", "'/skill-trace/inspect'", 'computeRuntimeLayout(graph)', 'inspectRuntimeEdge', 'inspectRuntimeNode']) {
  if (!host.includes(requiredText)) throw new Error(`phase 4 route missing from host: ${requiredText}`)
}
for (const requiredText of ['/runtime?sessionId=', '/inspect?sessionId=', "'运行图谱'", 'RuntimeFlowView', 'memberCount']) {
  if (!client.includes(requiredText)) throw new Error(`phase 4 canvas missing from client: ${requiredText}`)
}
// The client draws positions it was handed. If it ever computed them, the layout
// would stop being one reviewable, testable thing on the Host side.
for (const forbidden of ['MAX_ROWS_PER_COLUMN', 'LAYOUT_NODE_LIMIT', 'computeRuntimeLayout']) {
  if (client.includes(forbidden)) throw new Error(`the client must not compute layout: ${forbidden}`)
}
// A folded node must be described by its true member count, never by the size of
// the sample list the canvas happened to receive.
if (/它代表 \$\{data\.memberIds\.length\}/.test(client)) {
  throw new Error('a folded node must report its true member count, not the sample length')
}

// P0: recovering a past conversation's evidence from its durable log.
//
// The defect this pins was measured: without it the Runtime Graph answered
// "1 node / 0 edges" for a run whose log held 1095 nodes.
const sessionLog = await readFile(resolve(root, 'src/core/session-log.mjs'), 'utf8')
for (const requiredText of [
  'export function readSessionEvents',
  'export function findSessionLogFile',
  'export function decompressZstdFrames',
  'export function findZstdFrameStarts',
  'SESSION_LOG_MAX_BYTES',
  'ZSTD_MAGIC',
]) {
  if (!sessionLog.includes(requiredText)) throw new Error(`session log contract missing: ${requiredText}`)
}
// DSH appends one Zstandard frame per write batch and Node stops after the first,
// so multi-frame handling is the load-bearing part of this module.
if (!sessionLog.includes('const end = starts[index + 1] ?? buffer.length')) {
  throw new Error('the session log reader must decode every Zstandard frame, not only the first')
}
// A session id becomes a path segment; it must never climb out of the root.
if (!sessionLog.includes("sessionId.includes('/')")) {
  throw new Error('a session id must be refused when it could traverse the filesystem')
}
if (!sessionLog.includes('SESSION_LOG_MAX_BYTES')) throw new Error('the session log reader needs a size gate')
if (!host.includes('readSessionEvents(sessionId)')) {
  throw new Error('the host must read a stored session log when the session is not live')
}
if ((host.match(/receiptForRuntime\(sessionId\)/g) ?? []).length < 2) {
  throw new Error('both runtime routes must read the receipt refreshed from the durable log')
}

// The client ships as a built bundle, because the shell reads the client entry
// verbatim and resolves only platform seed words at run time. Three things must
// hold, and each of them fails silently in a browser otherwise.
const builder = await import(new URL('./build-client.mjs', import.meta.url))
for (const spec of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']) {
  if (!builder.CLIENT_SEED_MODULES.includes(spec)) throw new Error(`the platform seed table must include ${spec}`)
}
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
if (manifest.exports?.['./client'] !== './dist/client.js') {
  throw new Error('exports["./client"] must point at the built bundle; the shell does not bundle source')
}
if (!(manifest.files ?? []).includes('dist')) throw new Error('the built bundle must be published')
if (!manifest.scripts?.build) throw new Error('the client bundle needs a build script')
if (!manifest.scripts?.pretest) throw new Error('tests must run against a freshly built client bundle')
if (!builder.shippedBundleIsFresh()) {
  throw new Error('dist/client.js is stale or missing — run `npm run build:client` and commit the result')
}
{
  const bundle = await readFile(resolve(root, builder.CLIENT_OUTPUT), 'utf8')
  if (!bundle.includes('__ModuleLoader__.load({')) throw new Error('the bundle must register through the module loader')
  if (!bundle.includes(`id: ${JSON.stringify(builder.CLIENT_ID)}`)) throw new Error('the bundle must register under this package id')
  // A require outside the seed table throws "externals drift" at run time, in the
  // browser, after a restart — so it must never reach the artifact.
  const unresolved = builder.externalRequiresOf(bundle).filter((spec) => !builder.CLIENT_SEED_MODULES.includes(spec))
  if (unresolved.length > 0) throw new Error(`the bundle requires modules the shell cannot resolve: ${unresolved.join(', ')}`)
}

// Runtime Flow canvas governance (§2.2, §8–§13, §32).
//
// The canvas is a read-only runtime replay. Both ways it could go wrong are quiet:
// it could let a click change the run, or it could carry meaning by colour and line
// alone. Neither would fail a type check.
const canvas = await readFile(resolve(root, 'src/dsh/client/runtime-flow.js'), 'utf8')
for (const requiredText of [
  'export',                       // (module shape checked below)
  'nodesDraggable: false',
  'nodesConnectable: false',
  'edgesUpdatable: false',
  'panOnDrag: true',
  'zoomOnScroll: true',
  'fitView: true',
  'STATUS_GLYPHS',
  'KIND_LABELS',
  "edge.status === 'candidate'",
]) {
  if (requiredText === 'export') continue
  if (!canvas.includes(requiredText)) throw new Error(`canvas contract missing: ${requiredText}`)
}
if (!canvas.includes('module.exports = { RuntimeFlowView')) {
  throw new Error('the canvas must export RuntimeFlowView')
}
// §2.2: no affordance that could turn a user action into a claim about the run.
for (const forbidden of ['onConnect:', 'onReconnect:', 'nodesDraggable: true', 'edgesUpdatable: true']) {
  if (canvas.includes(forbidden)) throw new Error(`the canvas must stay read-only: ${forbidden}`)
}
// §32: it consumes a view model and never reaches for evidence itself.
for (const forbidden of ['runtimeEvents', 'evidenceIds', '/context?', 'arguments']) {
  if (canvas.includes(forbidden)) throw new Error(`the canvas must not read evidence directly: ${forbidden}`)
}
// §10.2: a candidate relationship may never be drawn as a settled one.
if (!/follows:\s*\{[^}]*dashed:\s*true/.test(canvas)) {
  throw new Error('the follows relation must be drawn dashed')
}
if (!client.includes('h(FlowCanvas')) throw new Error('运行流程 must render the Runtime Flow canvas')
if (!client.includes('installFlowStyles')) throw new Error("React Flow's stylesheet must be installed by the client")

// ELK-assisted layout (§12/§34/§35/§36).
//
// ELK owns crossing minimisation inside §35's layers. It must not own geometry:
// its own coordinates produced a 4804 × 4937 canvas on a real session, the vertical
// strip §20/§36 exist to prevent. And it must not run unbounded — measured at 556 ms
// for 120–200 rendered nodes.
const elkLayout = await readFile(resolve(root, 'src/core/runtime-layout-elk.mjs'), 'utf8')
for (const requiredText of [
  'export async function computeRuntimeLayoutWithElk',
  'export const ELK_NODE_LIMIT',
  "elk.partitioning.partition",
  "'elk.layered.layering.strategy': 'PARTITIONING'",
  "engine: LAYOUT_ENGINE_ELK",
  "engine: LAYOUT_ENGINE_DETERMINISTIC",
]) {
  if (!elkLayout.includes(requiredText)) throw new Error(`ELK layout contract missing: ${requiredText}`)
}
// Ordering only: the placer must be what produces the final geometry, so the height
// bound survives.
if (!elkLayout.includes('computeRuntimeLayout(graph, { ...options, orderOf:')) {
  throw new Error('ELK must supply ordering only; the placer owns geometry so §36 holds')
}
// A layout engine may never take the view down with it.
if (!elkLayout.includes('catch (error)')) throw new Error('the ELK path must degrade instead of throwing')
if (!host.includes('await computeRuntimeLayoutWithElk')) throw new Error('the runtime route must offer the ELK-assisted layout')
if (!client.includes("data-engine")) throw new Error('the client must report which layout engine ran')

// Contextual Inspector (§14), per-type tabs (§15) and 声明 ↔ 实际 (§16).
const alignment = await readFile(resolve(root, 'src/core/runtime-alignment.mjs'), 'utf8')
if (!alignment.includes('export function buildSkillLoadIndex')) {
  throw new Error('the Skill load join must live on the Host, not in the UI')
}
// An ambiguous join must be dropped, never resolved to the nearest candidate.
if (!alignment.includes('if (hits.length !== 1) continue')) {
  throw new Error('an ambiguous Skill load must be left unlinked rather than guessed')
}
for (const requiredText of [
  'INSPECTOR_TAB_LABELS',
  'DeclarationPanel',
  "tabs.includes(tab) ? tab : tabs[0]",
  '不评分',
]) {
  if (!client.includes(requiredText)) throw new Error(`contextual inspector contract missing: ${requiredText}`)
}
// §16: the declaration surface may never grow a score.
{
  const panel = client.slice(client.indexOf('function DeclarationPanel'), client.indexOf('function inspectorStatusColor'))
  for (const forbidden of ['遵循率', '百分比', '排名', 'score:', 'percent', 'complianceRate']) {
    if (panel.includes(forbidden) && !panel.includes(`没有遵循率`)) {
      throw new Error(`the declaration panel must not score a Skill: ${forbidden}`)
    }
  }
  if (!/不评分|Scored: false/.test(panel)) throw new Error('the declaration panel must state that scoring is off')
}
// §15/§38（冲突②选 A）：学习与验证只作 Skill Inspector 的一个 Tab，
// 既不是固定侧栏，也不再在收据流里单列。
if (client.includes("h('aside', { className: 'st-aside' }")) {
  throw new Error('the learning rail must not be pinned as a side column (§14)')
}
if (client.includes("className: 'st-section st-panels'")) {
  throw new Error('the receipt must not carry its own learning section (§15/§38)')
}
if (!client.includes('function LearningPanel')) {
  throw new Error('there must be a learning panel (§15/§38)')
}
if (!/active === 'learning' \? h\(LearningPanel/.test(client)) {
  throw new Error('the inspector must render the learning panel on its learning tab')
}
// §15: Skill 的三个 Tab 是「运行证据 / 声明 ↔ 实际 / 学习验证」。
if (!/\? \['evidence', 'declaration', 'learning'\]/.test(client)) {
  throw new Error('a Skill must expose evidence, declaration and learning tabs (§15)')
}
// §38: 表单默认收起。
if (!/h\('details', \{ className: 'st-section st-learning-panel' \}/.test(client)) {
  throw new Error('the learning form must be collapsible (§38)')
}
if (/st-learning-panel'[^)]*open: true/.test(client)) {
  throw new Error('the learning form must default to collapsed (§38)')
}
// §13: replay belongs to the canvas, so both densities have it.
for (const name of ['FlowCanvas', 'RuntimeView']) {
  const start = client.indexOf(`function ${name}(`)
  const body = client.slice(start, client.indexOf('\n  function ', start + 10))
  if (!body.includes('ReplayControls')) throw new Error(`§13: ${name} must offer replay`)
}
// §22 lists "all events" as its own control, not as the absence of a toggle.
if (!client.includes("'显示全部事件'")) throw new Error('§22: the graph view needs an explicit all-events control')
if (!/alignments:\s*data\?\.views\?\.receipt\?\.runtime\?\.alignments/.test(client)) {
  throw new Error('the inspector must receive the declaration baseline')
}

// Runtime replay (§37). It is a read of the Host's timeline: stepping must not be
// able to change what the receipt says happened, and it must not become a video.
const replay = await readFile(resolve(root, 'src/core/runtime-replay.mjs'), 'utf8')
for (const requiredText of [
  'export function buildReplayTimeline',
  'export const REPLAY_STEP_LIMIT',
  'truncated',
  'startedAt',
]) {
  if (!replay.includes(requiredText)) throw new Error(`replay contract missing: ${requiredText}`)
}
// A step must land on a drawn node, so a folded group has to be resolvable.
if (!replay.includes('node.memberIds ?? []')) {
  throw new Error('the timeline must resolve an event to the group that drew it')
}
if (!replay.includes('if (nodeId === last) continue')) {
  throw new Error('consecutive events on one node must be one step, not two')
}
// Truncation must be reported rather than silent.
if (!replay.includes('truncated = true')) throw new Error('a truncated timeline must say so')
{
  const code = replay.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const forbidden of ['writeFile', 'fetch(', 'store.']) {
    if (code.includes(forbidden)) throw new Error(`replay must not write: ${forbidden}`)
  }
}
if (!client.includes('function ReplayControls')) throw new Error('the canvas must offer replay controls')
{
  const start = client.indexOf('function ReplayControls')
  const block = client.slice(start, client.indexOf('function FlowCanvas'))
  // §37: a step-through, not an auto-playing video.
  for (const forbidden of ['requestAnimationFrame', '@keyframes', 'transition:']) {
    if (block.includes(forbidden)) throw new Error(`replay must not animate: ${forbidden}`)
  }
  if (!block.includes('上一步') || !block.includes('下一步') || !block.includes('暂停')) {
    throw new Error('replay must offer step, step back and pause')
  }
  // And it may not write while replaying.
  for (const forbidden of ['api(', 'onUpdate', 'setData(']) {
    if (block.includes(forbidden)) throw new Error(`replay must not call the API: ${forbidden}`)
  }
}

// §17/§18: the receipt is a set of sections, not a numbered wizard.
if (client.includes("st-section-number' }, '1'")) {
  throw new Error('the receipt must not use numbered step circles (§17.2)')
}
for (const requiredText of ['function ReceiptDetails', 'st-receipt-run-line', "'运行摘要'", "'Skill 加载证据'", "'候选依赖'", "'运行指纹（预留结构）'"]) {
  if (!client.includes(requiredText)) throw new Error(`receipt governance missing: ${requiredText}`)
}
// §17.1: every part can be folded, so a long receipt stays navigable.
if (!client.includes("h('details', { className: 'st-rsec'")) {
  throw new Error('receipt sections must be collapsible (§17.1)')
}

// Runtime Graph governance (§20/§21/§22).
const canvasModule = await readFile(resolve(root, 'src/dsh/client/runtime-flow.js'), 'utf8')
for (const requiredText of [
  'function filterLayout',
  'const FILTER_TYPES =',
  'function filterTypeOf',
  'hiddenNodes',
  'hiddenEdges',
]) {
  if (!canvasModule.includes(requiredText)) throw new Error(`graph filter contract missing: ${requiredText}`)
}
// §32: a filter may only remove. If it could construct a node or an edge, the canvas
// would become a place where relationships are invented.
{
  const fn = canvasModule.slice(canvasModule.indexOf('function filterLayout'))
  for (const forbidden of ['nodes.push', 'edges.push', 'concat(', 'from: ', 'to: ']) {
    if (fn.includes(forbidden)) throw new Error(`the filter must only remove: ${forbidden}`)
  }
}
// §21: one renderer, two densities — not two similar flowcharts.
// The old graph view drew its own SVG path builder and edge class; both must stay gone.
if (client.includes('rtEdgePath') || client.includes("className: 'st-rt-edge'")) {
  throw new Error('the graph view must not draw its own canvas (§21)')
}
if (!client.includes('h(RuntimeFlowView')) throw new Error('the graph view must reuse the one canvas renderer')
for (const requiredText of ['仅显示主路径', '只看失败/重试', 'FILTER_TYPES.map', 'hideCandidate: true']) {
  if (!client.includes(requiredText)) throw new Error(`§22 control missing: ${requiredText}`)
}
// §22's default is the main path, and what is hidden is always stated.
if (!/已隐藏|Hiding/.test(client)) throw new Error('a filtered canvas must state what it hid')
if (!client.includes("view === 'runtime' ? 'graph' : 'flow'")) {
  throw new Error('the graph view must be allowed its own density (§21)')
}
if (!canvasModule.includes("density === 'graph' ? 'bottom-left' : 'top-right'")) {
  throw new Error('the graph legend must move to the bottom-left (§21)')
}
for (const requiredText of ['conversation.composer', 'st-host', '--st-host-composer-h', 'hostRect.bottom - top']) {
  if (!client.includes(requiredText)) throw new Error(`host composer accommodation missing: ${requiredText}`)
}
if (!host.includes('GRAPH_NODE_LIMIT')) throw new Error('the Host must own the debug density budget')

// My Skills slimming (§23/§24).
//
// §24 permits the unselected-state guide and forbids the promo treatment around it:
// oversized headline, numbered step circles, benefit cards, "your Skill is getting
// stronger" copy. The guide must also keep saying what it does not do.
if (client.includes('st-guide-number')) {
  throw new Error('My Skills must not use numbered step circles (§17.2/§24)')
}
if (/\.st-guide-header h2\{[^}]*font-size:2[0-9]px/.test(client)) {
  throw new Error('My Skills must not use a promo-scale heading (§24/§26)')
}
if (!client.includes('把一次 Skill 使用')) {
  throw new Error('the unselected-state guide must remain (§24 permits it)')
}
if (!client.includes('不判断是否有效，也不上传或翻译个人内容')) {
  throw new Error('the guide must keep stating its evidence boundary')
}
for (const forbidden of ['你的 Skill 正在变强', '正在变强', '立即开始']) {
  if (client.includes(forbidden)) throw new Error(`conclusive marketing copy is not allowed: ${forbidden}`)
}

// Visual tokens (§25/§26/§27). These are the rules that a stylesheet drifts away from
// one page at a time, and that no functional test can see.
{
  const styleStart = client.indexOf('function installStyles')
  const styleEnd = client.indexOf('\n  }', styleStart)
  const css = client.slice(styleStart, styleEnd)
  // §25.2 prohibited outright.
  for (const [pattern, label] of [
    [/backdrop-filter/, 'glassmorphism'],
    [/text-shadow/, 'glow'],
    [/border-radius:\s*(1[4-9]|[2-9][0-9])px/, 'large-radius cards'],
    [/\[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\]/u, 'emoji as icons'],
  ]) {
    if (pattern.test(css)) throw new Error(`§25.2 forbids ${label}`)
  }
  // §26: every type size sits in a governed band, and nothing is smaller than the
  // auxiliary floor or larger than a page title.
  const sizes = [...new Set([...css.matchAll(/font-size:([\d.]+)px/g)].map((m) => Number(m[1])))]
  for (const size of sizes) {
    if (size > 18) throw new Error(`§26 caps a page title at 18px; found ${size}px`)
    if (size < 10.5) throw new Error(`§26 floors auxiliary text at 10.5px; found ${size}px`)
  }
  // §26's structural sizes.
  if (!/\.st-topbar\{[^}]*min-height:72px/.test(css)) throw new Error('§26: the top bar is 72px')
  if (!/\.st-heading h1\{[^}]*font-size:(1[6-8])px/.test(css)) throw new Error('§26: the page title is 16-18px')
  if (!/\.st-rsec-name\{[^}]*font-size:(1[3-5](?:\.\d+)?)px/.test(css)) throw new Error('§26: a section title is 13-15px')
  // §26: the inspector column is 300-340px.
  if (!/grid-template-columns:minmax\(0,1fr\) (3[0-4][0-9])px/.test(css)) throw new Error('§26: the inspector column is 300-340px')
  // §27: cards are the exception, not the default — most structure is a divider.
  //
  // 这里原本断言「border-radius 声明数 ≤ 70」。那是一条**把比例写成了数量**的检查：
  // 加 §11 的 Definition Viewer 之前，整份样式的圆角声明正好是 70 条——上限被用满了，
  // 于是任何新页面都会失败，哪怕它比整份样式的平均水平**更少**用圆角（新页面的圆角/分隔线
  // 比值是 9/5 = 1.8，而其余部分是 70/14 = 5.0）。§27 说的是「圆角是例外，结构主要靠
  // 分隔线」，那是比值，不是绝对数。所以改成比值：每一条分隔线最多配 5.5 个圆角。
  const radii = (css.match(/border-radius:/g) ?? []).length
  const dividers = (css.match(/border-bottom:1px solid/g) ?? []).length
  if (dividers < 8) throw new Error(`§27: structure should lean on dividers (${dividers})`)
  const cardRatio = radii / dividers
  if (cardRatio > 5.5) {
    throw new Error(`§27: too many rounded cards relative to dividers (${radii} radii / ${dividers} dividers = ${cardRatio.toFixed(1)}, cap 5.5)`)
  }
  // §11.9 / §16 E: every colour the UI paints comes from a token, so the same markup stays
  // legible on either theme.
  //
  // 颜色字面量只允许出现在 `:root` 的 token 定义里——那是 token 该有字面值的地方，也是唯一
  // 一处「字面值」与「主题」解耦的位置。其它任何地方写死一个颜色，就是一个**跟不动主题**的
  // 值：§11 的文档高亮一开始照抄 demo 的 `#fff8d8`，于是不得不补一条
  // `body[data-ds-dark-theme]` 覆盖来救它——那条覆盖本身就是这个 bug 的证据。改成
  // `color-mix(…,var(--st-layer))` 之后，覆盖消失了，浅色/深色各自算各自的底色。
  //
  // `var(--token,#fallback)` 不算违规：fallback 只在宿主一个 token 都没给时才生效，而宿主
  // 总会给。纯白豁免（`#fff` / `white`）：它只画在 brand 填充之上，而 brand 蓝在两种主题下
  // 都是蓝的，白字两种主题下都对。
  const withoutTokens = css.replace(/--st-[a-z0-9-]+\s*:[^;}]*/g, '')
  let bare = ''
  for (let i = 0; i < withoutTokens.length; i += 1) {
    if (withoutTokens.startsWith('var(', i)) {
      let depth = 0
      let j = i + 3
      for (; j < withoutTokens.length; j += 1) {
        if (withoutTokens[j] === '(') depth += 1
        else if (withoutTokens[j] === ')') {
          depth -= 1
          if (depth === 0) break
        }
      }
      i = j
      continue
    }
    bare += withoutTokens[i]
  }
  for (const [, value] of bare.matchAll(/(?:^|[{;])\s*(?:[a-z-]*color|background|fill|stroke)\s*:\s*([^;}]+)/g)) {
    const literal = value.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/)
    if (!literal) continue
    if (/^#(?:fff|ffffff)$/i.test(literal[0])) continue
    throw new Error(`§11.9: colour literal ${literal[0]} in "${value.trim()}" cannot follow the theme — use a --st-* token`)
  }
}

// §8/§35: the five-layer model.
const layoutModule = await readFile(resolve(root, 'src/core/runtime-layout.mjs'), 'utf8')
for (const requiredText of [
  "if (kind === 'capability') return 2",
  "if (kind === 'result' || kind === 'error') return 4",
  "if (kind === 'turn' || kind === 'child') return 1",
  'const KIND_NAMES',
  'const rowHeight = compact ? 88 : 115',
  '{ width: 190, height: rowHeight }',
  'capabilityNodeCount',
  'skippedLevelCount',
]) {
  if (!layoutModule.includes(requiredText)) throw new Error(`five-layer model missing: ${requiredText}`)
}
// §32: the projection may only draw containment. If it could cite a correlation rule or
// emit another relation type, the canvas would be inferring relationships again.
{
  const fn = layoutModule.slice(layoutModule.indexOf('const projectedEdges'))
  for (const forbidden of ["type: 'follows'", "type: 'spawns'", "type: 'retries'", 'rule: \'']) {
    if (fn.includes(forbidden)) throw new Error(`§32: the projection may not draw ${forbidden}`)
  }
}
// §36: the projected levels share the hard bound rather than sitting on top of it.
if (!layoutModule.includes('projectionBudget = Math.max(0, nodeLimit - view.size)')) {
  throw new Error('§36: the layer projection must share the node budget')
}
// The canvas has to know the kinds it is asked to draw.
const flowModule = await readFile(resolve(root, 'src/dsh/client/runtime-flow.js'), 'utf8')
for (const requiredText of ["capability: '能力'", "result: '结果'", "error: '错误'", 'CAPABILITY_COLORS.error', 'CAPABILITY_COLORS.result']) {
  if (!flowModule.includes(requiredText)) throw new Error(`the canvas cannot draw §35 layer 2 or 4: ${requiredText}`)
}
// The outcome level is about outcome, not capability — and its colour needs a label
// beside it so §9 holds.
if (!flowModule.includes("if (node.kind === 'capability') return CAPABILITY_COLORS[node.capabilityId]")) {
  throw new Error('a capability node must take the colour of the capability it groups')
}

// §31: the Runtime Fingerprint structure is reserved and nothing is derived from it.
const fingerprintModule = await readFile(resolve(root, 'src/core/runtime-fingerprint.mjs'), 'utf8')
for (const requiredText of [
  'export const FINGERPRINT_PATTERNS',
  "'runtime'",
  "'tool'",
  "'mcp'",
  "'cli'",
  "'failure'",
  "'recovery'",
  "status: 'not-yet-derived'",
  'value: null',
  'derived: false',
]) {
  if (!fingerprintModule.includes(requiredText)) throw new Error(`§31 fingerprint reservation missing: ${requiredText}`)
}
// §16/§31: a reserved fingerprint must not carry a score, and must not present "nobody
// looked" as "looked and found nothing".
{
  // Comments are allowed to name what the code refuses to do; only real code is checked.
  const code = fingerprintModule.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const forbidden of ['score', 'rate:', 'ranking', 'percent']) {
    if (code.includes(forbidden)) throw new Error(`§16: the fingerprint must not carry ${forbidden}`)
  }
}
if (!client.includes('FingerprintSection') || !client.includes('尚未派生')) {
  throw new Error('§31: the receipt must show the reserved structure and say it is not derived')
}
if (!client.includes('空不代表')) {
  throw new Error('§31: the reserved surface must distinguish "not derived" from "none found"')
}
// §36: aggregation begins at the governed size, and §20.1's per-turn folding is its own
// trigger rather than a consequence of the global one.
for (const requiredText of ['export const AGGREGATE_NODE_THRESHOLD = 30', 'export const AGGREGATE_EDGE_THRESHOLD = 50']) {
  if (!layoutModule.includes(requiredText)) throw new Error(`§36 threshold missing: ${requiredText}`)
}
if (!layoutModule.includes('members.length > collapseThreshold')) {
  throw new Error('§20.1: a busy turn must fold on its own trigger')
}

const receiptStore = await readFile(resolve(root, 'src/storage/receipt-store.mjs'), 'utf8')
for (const requiredText of ['randomBytes(6)', "await rm(temporary, { force: true })"]) {
  if (!receiptStore.includes(requiredText)) throw new Error(`receipt atomic-write contract missing: ${requiredText}`)
}

const catalog = await readFile(resolve(root, 'src/core/catalog-view.mjs'), 'utf8')
for (const requiredText of ["'exact'", "'content-match-candidate'", "'name-only-candidate'", "'conflict'", "'current-not-discovered'", 'runtimeIdentity', 'pendingReview', 'confirmedValidationCount', 'searchMatchEntryIds', 'userSearchText']) {
  if (!catalog.includes(requiredText)) throw new Error(`catalog evidence contract missing: ${requiredText}`)
}

const snapshot = await readFile(resolve(root, 'src/core/source-snapshot.mjs'), 'utf8')
for (const requiredText of ['buildCatalogSnapshot', 'loadSkillDefinition', 'sourceFingerprint', 'captureRuntimeIdentity']) {
  if (!snapshot.includes(requiredText)) throw new Error(`scoped registry contract missing: ${requiredText}`)
}
for (const forbidden of ['prompt:', 'skillBody', 'cookie:', 'token:']) {
  if (reducer.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`privacy implementation contains forbidden persisted field: ${forbidden}`)
}

for (const source of [client, host]) {
  for (const forbiddenAction of ['ctx.skills.register(', 'skill_create', 'publishSkill', 'installSkill']) {
    if (source.includes(forbiddenAction)) throw new Error(`automatic Skill mutation or publication must remain absent: ${forbiddenAction}`)
  }
}

// `/skill-trace/skills` 的信封必须在两端一致：宿主把列表套在 `list` 里返回，客户端必须显式
// 解包。这两条断言成对存在，是因为只改一端不会让任何单元测试变红——列表会静默变成空数组，
// 第一屏只是「看起来这个会话没有 Skill」。渲染台截图抓到过这个 bug。
if (!host.includes('list: buildSessionSkillList(')) throw new Error('the skills endpoint must nest its payload under `list`')
if (!client.includes('setList(body?.list ?? null)')) throw new Error('the client must unwrap the skills payload from `list`')

console.log('PROJECT_STRUCTURE_OK')
console.log('CLIENT_DUAL_VIEW_CONTRACT_OK')
console.log('SOURCE_PRIVACY_FIELDS_OK')
console.log('LOCAL_LEARNING_LOOP_OK')
console.log('MY_SKILL_READ_ONLY_CATALOG_OK')
console.log('SESSION_FORMAT_TOOL_RESULT_CONTRACT_OK')
console.log('OBSERVATION_SURFACE_OK')
console.log('RUNTIME_MODEL_OK')
console.log('CORRELATION_PROVENANCE_OK')
console.log('ALIGNMENT_NO_SCORE_OK')
console.log('CANVAS_BOUNDED_OK')
console.log('SESSION_LOG_RECOVERY_OK')
console.log('CLIENT_BUNDLE_CONTRACT_OK')
console.log('RUNTIME_FLOW_READONLY_OK')
console.log('ELK_LAYOUT_BOUNDED_OK')
console.log('CONTEXTUAL_INSPECTOR_OK')
console.log('REPLAY_READ_ONLY_OK')
console.log('RECEIPT_SECTIONS_OK')
console.log('GRAPH_FILTERS_OK')
console.log('MY_SKILLS_SLIM_OK')
console.log('VISUAL_TOKENS_OK')

// --- 发布资产的版本一致性 ---------------------------------------------------
// README 是**发布资产**，不是随手笔记：它的"当前版本"与安装示例会直接被人复制。
// 实测漂移过一次——`package.json` 已到 0.4.0-beta.52，README 还写着"当前公开预发布版为
// 0.4.0-beta.3"、安装示例是 v0.4.0-beta.4，**落后 49 个版本**。
//
// 这里只钉"会被人照抄的两处"：当前版本声明与安装示例。逐版历史由 CHANGELOG 负责，
// 不要求 README 同步——否则每次发版都要改 README，规则会被绕过。
{
  const pkgVersion = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
  const readme = await readFile(resolve(root, 'README.md'), 'utf8')

  const declared = /当前公开预发布版为\s*`([^`]+)`/.exec(readme)
  if (!declared) throw new Error('README must state the current pre-release version')
  if (declared[1] !== pkgVersion) {
    throw new Error(`README says the current version is ${declared[1]} but package.json says ${pkgVersion} — README is a release asset`)
  }

  const install = /dsh plugin --profile [a-z0-9-]+ add "github:[^"#]+#v([^"&]+)/.exec(readme)
  if (!install) throw new Error('README must show an install command pinned to a tag')
  if (install[1] !== pkgVersion) {
    throw new Error(`README's install example pins v${install[1]} but package.json says ${pkgVersion} — people copy this line`)
  }

  console.log('RELEASE_ASSETS_IN_SYNC_OK')
}

console.log('FIVE_LAYER_MODEL_OK')
console.log('FINGERPRINT_RESERVED_OK')
