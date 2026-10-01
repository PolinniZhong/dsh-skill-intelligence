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

for (const file of ['src/core/trace-reducer.mjs', 'src/core/source-snapshot.mjs', 'src/core/installed-view.mjs', 'src/core/skill-translation.mjs', 'src/storage/receipt-store.mjs', 'src/storage/preference-store.mjs', 'src/dsh/host/index.js', 'src/dsh/client/client.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${file} syntax check failed:\n${result.stderr}`)
}

const client = await readFile(resolve(root, 'src/dsh/client/client.js'), 'utf8')
// v0.6 的客户端契约。这张清单只保留**今天仍然存在**的东西：语言、主题生命周期、
// 两个一级页面和唯一二级页、偏好落盘、以及定义/仓库/翻译这三组事实的措辞。
//
// 删掉的那些（`model.events`、`st-map-stage`、`api('/receipts'`、`const DRAFT_KEY` …）不是
// 被放宽了，而是它们的宿主页面已经不在 v0.6 里了（§4）。一条守卫如果断言一个不存在的
// 页面，它唯一的作用就是拦住删除 —— 所以在删页面的同一次改动里删掉它们。
//
// 而且断言必须在**字典之外**成立。`EN` 里的条目说的是「界面可能会说这句话」，
// 不是「界面在说这句话」—— 一段死文案只要还留在字典里，`client.includes()` 就照样为真。
// 这个路径真的发生过：删掉 22 个组件之后仍有 45 条断言在通过，其中一条
// （`正在读取当前目录…`）的界面文案其实早就换成了「正在读取当前环境…」，
// 只是字典里还留着旧键。所以下面比的是去掉 EN 块之后的源码。
const dictStart = client.indexOf('  const EN = {')
const dictEnd = client.indexOf('\n  }', dictStart) + 4
if (dictStart < 0 || dictEnd < 4) throw new Error('cannot locate the EN dictionary')
const clientCode = client.slice(0, dictStart) + client.slice(dictEnd)
for (const requiredText of [
  // 双语与主题生命周期。`t()` 会查字典，所以字典就是界面的英文。
  'ctx.locale.register(NS',
  'React.useSyncExternalStore',
  "active || 'en') !== 'zh'",
  'ctx.effect(() => installStyles()',
  'if (previous) previous.replaceWith(style)',
  'if (document.getElementById(STYLE_ID) === style) style.remove()',
  // §6/§7：两个一级页面各自的空态、读不到、与副标题，必须说自己的那件事。
  '当前对话暂未加载可追踪的 Skill。',
  '正在读取当前对话的 Skill 使用情况…',
  '本次 Skill 使用记录',
  '本次 Skill',
  '正在读取当前环境…',
  '工作区未连接',
  // §8：返回的措辞由调用方给，所以页面里必须有「返回 Skill 列表」这个地方。
  '返回 Skill 列表',
  // 偏好：本地记住 + 写回宿主；两处都在，缺一处只会在下次启动时才显形。
  'localStorage.setItem(VIEW_KEY',
  "api('/preferences'",
  // §10/§11：指纹三态与仓库未解析时必须说人话，不能显示裸代码，也不能沉默。
  '指令指纹比对',
  '一致',
  '无法比对',
  '定义可用',
  '注册表不可用',
  '没有找到 git work tree，无法确定仓库来源。',
  '这份 Skill 的定义当前读不到，所以无法抽取声明流程。',
  // §9/§12：只读、原文来源、译文不落盘 —— 三句话必须在界面上真的出现。
  '只读展示',
  '原文逐字来自 Skill 定义文件',
  '中文预览只用于当前页面阅读',
  '翻译没有完成',
  // 新界面的样式钩子：卡片、已安装网格、文档面板、状态块。
  'st-skill-card',
  'st-installed-grid',
  'st-detail-doc',
  'st-trace-state',
]) {
  if (!clientCode.includes(requiredText)) throw new Error(`client contract missing (outside the dictionary): ${requiredText}`)
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
// v0.6 的宿主按「会话」组织：偏好、收据落盘、观测面、以及七个查询路由。
//
// 删掉的路由（`/backups*`、`/outputs`、`/continuity`、`/learning-note`、
// `/validation-result`、`/receipts`、`/runtime`、`/inspect`、`/catalog`）不是被放宽了：
// 它们服务的页面在 v0.6 里不存在（§4），所以这条断言必须和页面一起消失。
for (const requiredText of [
  'preferenceStore.read()',
  "'/skill-trace/preferences'",
  'preferenceStore.write',
  // 收据仍然落盘 —— §4.4 只删它的**页面身份**，不删「这次加载发生过」这条证据。
  'shouldPersistReceipt',
  'syncReceipt',
  'store.prune',
  'store.read(',
  'store.write(',
  'store.delete(',
  'createSessionMutationQueue',
  'runMaintenance',
  // 观测面：注册表与实时 agent 的来路。
  'agentPresets?.serviceFor',
  'scope: liveAgent',
  'sessionEventLog(session)',
  'session.snapshotEvents()',
  // v0.6 的七个查询/写入端点。少一个都会让某个页面在运行时 404。
  "'/skill-trace/context'",
  "'/skill-trace/skills'",
  "'/skill-trace/skill'",
  "'/skill-trace/catalog'",
  "'/skill-trace/definition'",
  "'/skill-trace/translate'",
  'buildInstalledView',
  'buildChunkMessages',
  'runSegmentedTranslation',
]) {
  if (!host.includes(requiredText)) throw new Error(`host contract missing: ${requiredText}`)
}
// 删掉的东西不得以别的方式回来。
for (const forbidden of ["'/skill-trace/runtime'", "'/skill-trace/inspect'", "'/skill-trace/backups'", "'/skill-trace/learning-note'", "'/skill-trace/validation-result'", "'/skill-trace/receipts'", 'buildRuntimeGraph', 'computeRuntimeLayout', 'buildCatalogView']) {
  if (host.includes(forbidden)) throw new Error(`a deleted v0.5 surface is still wired into the host: ${forbidden}`)
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
  // v0.6 §22 的顶栏是 68px（`height:68px`），`design.md` §6.1 只规定 58px 下限。
  // 这里曾经钉的是 72px —— 一个两份文档都没有的数字，谁也说不清它是从哪抄来的。
  if (!/\.st-topbar\{[^}]*min-height:68px/.test(css)) throw new Error('§22: the top bar is 68px')
  // 2026-10-01：页面标题这一层被删了两次 —— 先是顶栏那块（用户指出它与正文段头重复），
  // 再是正文段头本身（用户：「本次加载的 Skill 就可以删除了」）。页面名现在由顶栏导航的
  // `aria-pressed` 说着，正文里最大的字是 SKILL.md 文档里的 H2。
  //
  // 所以这条断言不再问「有没有一个 16px 的页面标题」—— 那个说法已经没有主语了，留着它
  // 只会逼着一个被删掉的元素复活。它改问**字阶的顶端还在不在**：文档标题占住 v0.6 设计
  // §5.1 的 "Section title: 14–16px"。上面那段数值扫描仍然守着 10.5–18px 的硬性边界。
  if (!/\.st-audit-doc h2\.st-audit-doc-heading\{font-size:(1[4-6])px\}/.test(css)) throw new Error('§26: the section title sits at 14-16px')
  // v0.6 §8.2/§9.3 replaced the three-column workbench with one detail page: a 280px
  // fact column, and a 170px outline strip inside the SKILL.md panel. The old
  // assertions described a page that no longer exists, so they moved with it.
  if (!/\.st-detail-card h3\{[^}]*font-size:(1[3-5](?:\.\d+)?)px/.test(css)) throw new Error('§26: a card title is 13-15px')
  if (!/grid-template-columns:280px minmax\(0,1fr\)/.test(css)) throw new Error('§8.2: the detail fact column is 280px')
  if (!/grid-template-columns:170px minmax\(0,1fr\)/.test(css)) throw new Error('§9.3: the document outline is a 170px navigation strip')
  // §27: cards are the exception, not the default — most structure is a divider.
  //
  // 这里原本断言「border-radius 声明数 ≤ 70」。那是一条**把比例写成了数量**的检查：
  // 加 §11 的 Definition Viewer 之前，整份样式的圆角声明正好是 70 条——上限被用满了，
  // 于是任何新页面都会失败，哪怕它比整份样式的平均水平**更少**用圆角（新页面的圆角/分隔线
  // 比值是 9/5 = 1.8，而其余部分是 70/14 = 5.0）。§27 说的是「圆角是例外，结构主要靠
  // 分隔线」，那是比值，不是绝对数。所以改成比值：每一条分隔线最多配 5.5 个圆角。
  const radii = (css.match(/border-radius:/g) ?? []).length
  const dividers = (css.match(/border-bottom:1px solid/g) ?? []).length
  // 同样的道理：`dividers >= 8` 也是把 v0.5 那份样式表的规模写成了门槛。v0.6 删掉
  // 收据工作台后样式表从 529 行降到 227 行，分隔线自然跟着少——但 §27 要说的是**比例**，
  // 所以这里只要求「分隔线还在用」，把判断留给下面的比值。
  if (dividers < 3) throw new Error(`§27: structure should lean on dividers (${dividers})`)
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

// `/skill-trace/skills` 的信封必须在两端一致：宿主把列表套在 `list` 里返回，客户端必须显式
// 解包。这两条断言成对存在，是因为只改一端不会让任何单元测试变红——列表会静默变成空数组，
// 第一屏只是「看起来这个会话没有 Skill」。渲染台截图抓到过这个 bug。
if (!host.includes('list: buildSessionSkillList(')) throw new Error('the skills endpoint must nest its payload under `list`')
// 断言的是**解包这个动作**，不是某个 state setter 的名字 —— 组件改名（`setList` →
// `setFetchedList`）不该让这条守卫失效，而「客户端不再解 `list`」必须让它失效。
if (!client.includes('body?.list ?? null')) throw new Error('the client must unwrap the skills payload from `list`')

// DSH 主题 alias 白名单 -------------------------------------------------------------------
// `--dsw-alias-*` 由宿主注入。名字拼错不会有任何报错：CSS 自定义属性未定义时静默失效，
// `var(--x, fallback)` 会永远走 fallback，于是插件在渲染台（不加载宿主 CSS，所有 alias 都
// 落到 fallback）里看起来完全正常，只在真实 DSH 里跟不动主题。
// 已经踩过三次：`--dsw-alias-border-strong` 与 `--dsw-alias-warning` 根本不存在；
// 而 `--dsw-alias-brand-primary` 存在但语义不同 —— 它是 #0f1115 的「主按钮对比色」，
// 不是蓝色强调色，暗色下变近白，配 `color:white` 就是白底白字。
//
// 下面的白名单是 2026-10-01 从 `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 的
// `body{...}` 与 `body[data-ds-dark-theme]{...}` 两块里逐字核对过的名字（该文件共 111 个
// `--dsw-alias-*`）。新增引用前必须先确认它在宿主里真实存在，再登记到这里。
{
  const allowed = new Set([
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-3',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-border-l3',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-hover-accent',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-link',
    '--dsw-alias-markdown-code-block',
    '--dsw-alias-state-business-primary',
    '--dsw-alias-state-error-primary',
    '--dsw-alias-state-success-primary',
    '--dsw-alias-state-warn-primary'
  ])
  const used = [...client.matchAll(/var\(\s*(--dsw-alias-[a-z0-9-]+)/g)].map((match) => match[1])
  if (!used.length) {
    throw new Error('the client must read DSH theme aliases instead of literal colours')
  }
  for (const name of new Set(used)) {
    if (!allowed.has(name)) {
      throw new Error(`unknown DSH theme alias \`${name}\`: it does not exist in @deepseek-ai/dsh-client-ui-theme, so \`var(${name})\` would silently fall back forever`)
    }
  }
}

// --- 文案必须有人读：字典里的每个键都要在字典之外被真用上 --------------------------
// 这是同一种失败的第三种形态。第 5 步之后 `EN` 字典里留着五个界面早就不再渲染的词
// （`我的 Skill`、`Skill 收据`、`高级`、`运行图谱`、`删除`），而它们之所以看起来还活着，
// 只是因为**注释里提到了它们** —— 注释不是消费者。第 5 步删掉 `正在读取当前目录…` 那句时
// 已经踩过一次：那条断言之所以一直通过，全靠死键还留在字典里（`client.includes()` 一样命中）。
// 一条靠死文案维持的断言，和一个没有断言的 marker，是同一种失败：输出说「检查过了」，其实没有。
const dictKeys = [...client.slice(dictStart, dictEnd).matchAll(/'((?:[^'\\]|\\.)+)':\s*'/g)].map((m) => m[1])
const clientCodeOnly = clientCode
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/(?<!:)\/\/[^\n'"]*$/gm, '')
const unreadCopy = dictKeys.filter((key) => !clientCodeOnly.includes(key))
if (unreadCopy.length) throw new Error(`client dictionary keys no code reads (comments are not consumers): ${unreadCopy.join(', ')}`)

// 这一行一行都是**结论**，不是清单。每个 marker 都必须有上面一段仍然存在的断言撑着：
// 一个没有断言的 marker 会在输出里说「这条契约成立」，而实际上没有人检查过它。
// 第 5 步删页面时就踩过一次——断言块随页面删掉了，marker 却留了下来，
// 于是 `CANVAS_BOUNDED_OK`、`ELK_LAYOUT_BOUNDED_OK`、`CONTEXTUAL_INSPECTOR_OK`、
// `REPLAY_READ_ONLY_OK`、`RUNTIME_FLOW_READONLY_OK`、`GRAPH_FILTERS_OK`、
// `MY_SKILL_READ_ONLY_CATALOG_OK`、`MY_SKILLS_SLIM_OK` 八个名字一直印在输出里，
// 而它们守的界面早就不存在了。**删断言块时，同一次改动里删掉它的 marker。**
console.log('PROJECT_STRUCTURE_OK')
console.log('CLIENT_CONTRACT_OK')
console.log('CLIENT_COPY_LIVE_OK')
console.log('SOURCE_PRIVACY_FIELDS_OK')
console.log('LEGACY_LEARNING_FIELDS_OK')
console.log('SESSION_FORMAT_TOOL_RESULT_CONTRACT_OK')
console.log('OBSERVATION_SURFACE_OK')
console.log('RUNTIME_MODEL_OK')
console.log('CORRELATION_PROVENANCE_OK')
console.log('ALIGNMENT_NO_SCORE_OK')
console.log('SESSION_LOG_RECOVERY_OK')
console.log('CLIENT_BUNDLE_CONTRACT_OK')
console.log('RECEIPT_SECTIONS_OK')
console.log('VISUAL_TOKENS_OK')

// --- Rules of Hooks：hook 不得写在提前 return 之后 --------------------------------
// 实测事故（0.4.0-beta.68）：`FlowCanvas` 与 `RuntimeView` 把 `const replay = React.useMemo(...)`
// 写在了 `if (loading && !data) return ...` 之后。loading 首屏提前返回、少调一个 hook，数据到达后的
// 第二次渲染多调一个 hook，React 抛 #310（Rendered more hooks than during the previous render），
// `conversation.view` slot entry 崩溃并卸载 —— 用户在真实 DSH 里看到的是「Skill 追踪标签页整片空白」。
// 渲染台与既有单元测试都只渲染"已经有数据"的那一帧，所以两层都没抓到。
//
// 这里只钉一条可机械判定的规则：同一组件内，第一个"提前 return"之后不允许再出现 React.use*。
{
  const source = await readFile(resolve(root, 'src/dsh/client/client.js'), 'utf8')
  const lines = source.split('\n')
  const indentOf = (line) => (line.match(/^ */) || [''])[0].length
  let current = null
  let firstReturn = 0
  let lastHook = 0
  const offenders = []
  const flush = () => {
    if (current && firstReturn && lastHook > firstReturn) {
      offenders.push(`${current}（提前 return 在第 ${firstReturn} 行，hook 在第 ${lastHook} 行）`)
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]
    const indent = indentOf(text)
    const body = text.trim()
    if (indent === 2 && (/^function [A-Z]/.test(body) || /^const [A-Z]/.test(body))) {
      flush()
      current = /^function/.test(body) ? body.slice(9).split('(')[0] : body.slice(6).split(' ')[0]
      firstReturn = 0
      lastHook = 0
      continue
    }
    if (!current) continue
    if (indent === 0 && body.length) { flush(); current = null; continue }
    if (indent !== 4) continue
    // 两种提前 return 写法：单行 `if (...) return ...`，以及 `if (...) {` 换行后 `return`。
    const oneLine = /^return\b/.test(body) || /^if \(.*\)\s+return\b/.test(body)
    const blockForm = /^if \(.*\)\s*\{?\s*$/.test(body)
      && lines[index + 1]
      && indentOf(lines[index + 1]) === 6
      && /^return\b/.test(lines[index + 1].trim())
    if (oneLine || blockForm) firstReturn = firstReturn || index + 1
    if (/React\.use[A-Z]/.test(body)) lastHook = index + 1
  }
  flush()
  if (offenders.length) {
    throw new Error(`a hook must never follow an early return in the same component — React #310 unmounts the whole conversation.view slot: ${offenders.join('; ')}`)
  }
  console.log('HOOK_ORDER_OK')
}

// --- 偏好文件的 IA 版本号：宿主与客户端必须一致 ------------------------------
// `src/storage/preference-store.mjs` 用它决定"读到的偏好算不算用户选择"，`src/dsh/client/client.js`
// 用它决定"要不要采用宿主给的默认视图"。两处不一致会静默地让第一屏回到旧 IA（实测就是 `map` 那一屏），
// 而且不会报错——所以钉成成对断言。
{
  const store = await readFile(resolve(root, 'src/storage/preference-store.mjs'), 'utf8')
  const client = await readFile(resolve(root, 'src/dsh/client/client.js'), 'utf8')
  const storeVersion = /const PREFERENCES_VERSION = (\d+)/.exec(store)?.[1]
  const clientVersion = /const PREFERENCE_VERSION = (\d+)/.exec(client)?.[1]
  if (!storeVersion) throw new Error('src/storage/preference-store.mjs must declare PREFERENCES_VERSION')
  if (!clientVersion) throw new Error('src/dsh/client/client.js must declare PREFERENCE_VERSION')
  if (storeVersion !== clientVersion) {
    throw new Error(`the preference version must match across the store and the client: ${storeVersion} !== ${clientVersion}`)
  }
  console.log('PREFERENCE_VERSION_OK')
}

// --- v0.6 §12.4：译文只允许活在页面内存里 -----------------------------------
// 这条约束没有任何自然反馈：往 receipt 里多写一个字段，界面上一切照旧，只有去翻
// ~/.dsh/skill-trace/receipts/*.json 才会发现 Skill 正文的中文副本躺在了磁盘上。
// 所以钉两条——翻译路由不碰任何存储，翻译核心根本不认识存储。
{
  const start = host.indexOf("url.pathname === '/skill-trace/translate'")
  if (start === -1) throw new Error('v0.6 §13: the host must expose POST /skill-trace/translate')
  const nextRoute = host.indexOf('url.pathname ===', start + 10)
  const route = host.slice(start, nextRoute === -1 ? undefined : nextRoute)
  for (const forbidden of ['store.write', 'syncReceipt', 'preferenceStore.write', 'cache.set', '.append(']) {
    if (route.includes(forbidden)) {
      throw new Error(`v0.6 §12.4: a translation must never be persisted, but the route calls ${forbidden}`)
    }
  }
  const core = await readFile(resolve(root, 'src/core/skill-translation.mjs'), 'utf8')
  for (const forbidden of ['receipt', 'localStorage', 'sessionStorage', 'writeFile', 'receiptStore']) {
    if (core.includes(forbidden)) {
      throw new Error(`v0.6 §12.4: the translation core must not know about ${forbidden}`)
    }
  }
  console.log('TRANSLATION_MEMORY_ONLY_OK')

// --- 翻译必须是分段的，而且必须自己说哪几段没翻成 -------------------------------
// 0.4.0-beta.69 的翻译在真实应用里**一次都没成功过**，而 341 个测试全绿。原因不是模型，
// 是当时那条路必须连上真模型才能跑：单元测试只覆盖了 `inspectTranslation` 的正确性，
// 而它一直是正确的 —— 错的是"整篇必须完美"这个策略，那个策略当时没有任何测试能碰到。
// 所以这里钉住三件让修复成立的事：掩码真的接在策略里、宿主真的把回退段数带回界面、
// 界面真的有那句话。
{
  const core = await readFile(resolve(root, 'src/core/skill-translation.mjs'), 'utf8')
  for (const expected of ['runSegmentedTranslation', 'maskProtected', 'restoreProtected', 'checkChunk', 'PLACEHOLDER_OPEN']) {
    if (!core.includes(expected)) throw new Error(`the translation core must export ${expected}`)
  }
  // 定义存在不等于用上了：掩码必须真的在策略入口处被调用。
  if (!/runSegmentedTranslation[\s\S]{0,600}maskProtected\(definitionText\)/.test(core)) {
    throw new Error('runSegmentedTranslation must mask the definition before it asks the model anything')
  }
  const route = host.slice(host.indexOf("url.pathname === '/skill-trace/translate'"))
  for (const expected of ['result.fallbackChunks', 'chunkCount']) {
    if (!route.includes(expected)) throw new Error(`the translation route must report ${expected}`)
  }
  if (!clientCode.includes('fallbackChunks')) {
    throw new Error('the client must say how many segments fell back to the original')
  }
  console.log('TRANSLATION_SEGMENTED_OK')
}

// v0.6 §6 / §8 / §9 Skill-first 的信息架构 ----------------------------------------------
// 这一段的断言全部关于**形状**，不是措辞：卡片列表、唯一的二级页、以及「译文只在内存里」。
{
  for (const required of ['function SkillCard(', 'function CurrentSkillPage(', 'function SkillDetailPage(']) {
    if (!client.includes(required)) throw new Error(`v0.6 §6/§8: the client must define ${required}`)
  }
  // 旧的三栏工作台整个退役。它一旦回来，第一屏就不再是「这次加载了哪些 Skill」。
  if (client.includes('function SkillWorkbench(')) throw new Error('v0.6 §4.4: the old three-column workbench must stay deleted')
  if (client.includes('st-skill-item')) throw new Error('v0.6 §6.2: Skill cards replaced the old workbench rows')

  // §12.4 的另一半在客户端：译文只活在组件 state 里，既不落盘也不进会话。
  const detailStart = client.indexOf('function SkillDetailPage(')
  const detailEnd = client.indexOf('\n  function ', detailStart + 10)
  const component = client.slice(detailStart, detailEnd === -1 ? undefined : detailEnd)
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'navigator.sendBeacon']) {
    if (component.includes(forbidden)) {
      throw new Error(`v0.6 §12.4: Skill Detail must keep a translation in memory only, but it touches ${forbidden}`)
    }
  }
  if (!component.includes('setTranslation(')) {
    throw new Error('v0.6 §12: Skill Detail must hold the translation in component state')
  }
  // §8.4：返回的目标由调用方给进来，页面里不能写死任何一个列表页。
  if (/backLabel\s*:\s*'/.test(component) || /onBack:\s*\(\)\s*=>\s*setView/.test(component)) {
    throw new Error('v0.6 §8.4: the detail page must not hard-code which list it returns to')
  }
  console.log('SKILL_FIRST_DETAIL_OK')
}
}

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
