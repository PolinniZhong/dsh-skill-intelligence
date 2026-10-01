import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
  // §9/§12：只读、原文来源、中文阅读版存在本机 —— 三句话必须在界面上真的出现。
  '只读展示',
  '原文逐字来自 Skill 定义文件',
  '中文阅读版只用于当前页面阅读',
  '翻译没有完成',
  // v0.7 §6：保存态必须来自一次真的写入，而不是"我发起了写入"。
  '中文阅读版已保存',
  '中文阅读版没有保存到本机',
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
  // v0.6 §22 的顶栏曾经是 68px（`height:68px`），`design.md` §6.1 只规定 58px 下限。
  // 这里更早还钉过 72px —— 一个两份文档都没有的数字，谁也说不清它是从哪抄来的。
  //
  // 2026-10-05（用户：「（两个一级页面入口那块）这个背景占用太多高度，去掉这个背景后，
  // 下方数据上移」）：顶栏收到 48px 并去掉底色。48px 是贴着内容的下限 —— 分段控件本身
  // 36px，上下各留 6px；68px 里有 32px 是纯空白。省下的高度直接给下方列表。
  if (!/\.st-topbar\{[^}]*min-height:48px/.test(css)) throw new Error('§22: the top bar is 48px')
  // 同一件事的另一半，而且是用户真正指出来的那一半：顶栏不许再自己画底色。它现在是
  // 和页面同色的一行。这条守卫是反向的 —— 它守的是「那块底板不许回来」。
  if (/\.st-topbar\{[^}]*background:/.test(css)) throw new Error('§22: the top bar must not paint its own background')
  // 2026-10-05 同一次改动（用户：「本次 Skill 跟已安装 Skill 下方那条横线，我觉得也不需要了」）：
  // 顶栏连分隔线也不画了。它上面是宿主的标签条、下面是页面自己的内容，两边本来就有边界，
  // 再补一条线只是在给「这里是一块独立的板子」这件事续命。留一条反向守卫，防止它回来。
  if (/\.st-topbar\{[^}]*border-bottom/.test(css)) throw new Error('§22: the top bar must not draw its own separator')
  // 2026-10-05（用户：「Skill 列表描述这里，最多显示 4 行。统一，最多显示 4 行……用户可以点进去
  // 查看详情」）：两个列表的卡片描述都截到 4 行。这条守的是**两个**类 —— 只截一个的话，
  // 同一份描述在两个页面里会有两种长度，而用户要的恰恰是统一。
  // 截的是绘制，不是文本：DOM 里仍然是完整描述，读屏与卡片可访问名不受影响。
  for (const cls of ['st-installed-card-desc', 'st-skill-card-desc']) {
    const rule = new RegExp(`\\.${cls}\\{[^}]*\\}`).exec(css)
    if (!rule) throw new Error(`§27: missing the ${cls} rule`)
    if (!/-webkit-line-clamp:4/.test(rule[0])) {
      throw new Error(`§27: ${cls} must clamp the description to 4 lines`)
    }
    if (!/overflow:hidden/.test(rule[0])) {
      throw new Error(`§27: ${cls} clamps to 4 lines but does not hide the overflow`)
    }
  }
  // 2026-10-05（用户：「模型可调用这块变成固定在左下，没必要根据描述向上响应」）：两个列表卡片的
  // 元信息行都钉在卡片左下角。网格默认把同一行的卡片拉到等高，元信息行如果只跟着描述走，
  // 它会停在描述下面、离卡片底边还差一大截 —— 卡片看上去像没写完。
  // 反向守卫：只靠「描述多长就离多远」正是这条要挡掉的旧行为。
  if (!/\.st-installed-card-meta\{[^}]*margin-top:auto/.test(css)) {
    throw new Error('§27: the installed card meta row must be pinned to the bottom of the card')
  }
  if (!/\.st-skill-card-meta\{[^}]*margin-top:auto/.test(css)) {
    throw new Error('§27: the session card meta row must be pinned to the bottom of the card')
  }
  // 正文列没有 gap 的那一张必须自带 padding-top：auto 外边距在没有多余空间时解析成 0，
  // 只写 margin 会让元信息行贴到描述上（这条守的是那次修正本身）。
  if (!/\.st-skill-card-meta\{[^}]*padding-top:10px/.test(css)) {
    throw new Error('§27: the session card meta row loses its gap when the card has no spare height')
  }
  // 2026-10-05（用户：「下方 Skill 列表向上移，距离搜索框跟搜索顶框高度一致就可以了」）：
  // 顶栏不画分隔线之后，列表的顶部内边距就是它与顶栏之间唯一的距离。22px 会留出一条
  // 谁都不认领的空白带；10px 与顶栏自己的垂直节奏（48px 的条里放 30px 控件，上下各 9px）对齐。
  if (!/\.st-installed\{[^}]*padding:10px 24px 28px/.test(css)) {
    throw new Error('§22: the installed list must start one top-bar rhythm below the top bar, not 22px')
  }
  // 2026-10-05（用户：「本次 Skill 列表跟已安装 Skill 列表应该是平行的」）：两个一级列表
  // 共用一条顶栏，读者来回点时第一张卡片应当原地不动。两页的内边距必须**逐字相同**——
  // 一个 20/22、一个 10/24，切换页面时内容会横竖各跳一下。这条同时守住两个值。
  if (!/\.st-page\{[^}]*padding:10px 24px 28px/.test(css)) {
    throw new Error('§22: both first-level lists must start at the same place — .st-page padding must match .st-installed')
  }
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

// --- v0.7 §5：中文阅读版落盘，但键里不许有会话，记录里不许有正文以外的东西 --------
// v0.6 这条断言说的是「译文只活在内存里」。v0.7 把它改成持久化之后，那句话不再成立，
// 但当初要防的东西一个都没变：Skill 正文的中文副本不该跟着会话走（跟着走就等于
// 「退出 DSH 就没了」换个写法继续存在），也不该顺带把工具参数、对话正文写进磁盘。
// 所以这条守卫不是被删掉，而是被换成更细的几条 —— 删掉它等于把当初那起事故的
// 唯一防线一起删掉。
{
  const start = host.indexOf("url.pathname === '/skill-trace/translate'")
  if (start === -1) throw new Error('v0.7 §5: the host must expose POST /skill-trace/translate')
  const nextRoute = host.indexOf('url.pathname ===', start + 10)
  const route = host.slice(start, nextRoute === -1 ? undefined : nextRoute)
  // 翻译这件事本身仍然不许写 receipt、不许碰偏好、不许写 session log。
  for (const forbidden of ['store.write', 'syncReceipt', 'preferenceStore.write', '.append(']) {
    if (route.includes(forbidden)) {
      throw new Error(`v0.7 §5: a translation must never reach the receipt, but the route calls ${forbidden}`)
    }
  }
  // 落盘只能走 translationStore，而且响应必须带回「真的存上了」这个事实 ——
  // 否则界面只能靠"我发起了写入"来猜成功（design.md §8.5）。
  if (!route.includes('saved: await persistTranslation(')) {
    throw new Error('v0.7 §6: the translate response must carry a real `saved` fact, not an assumption')
  }
  // 翻译核心仍然不认识存储：它只做结构保护与分段。
  const core = await readFile(resolve(root, 'src/core/skill-translation.mjs'), 'utf8')
  for (const forbidden of ['receipt', 'localStorage', 'sessionStorage', 'writeFile', 'receiptStore']) {
    if (core.includes(forbidden)) {
      throw new Error(`v0.7 §5: the translation core must not know about ${forbidden}`)
    }
  }
  const store = await readFile(resolve(root, 'src/storage/translation-store.mjs'), 'utf8')
  for (const expected of ['0o700', '0o600', 'rename(', 'FORBIDDEN_RECORD_FIELDS', 'translationStoreKey']) {
    if (!store.includes(expected)) throw new Error(`v0.7 §5: the translation store must pin ${expected}`)
  }
  // 持久化键里出现 sessionId，整个功能就退回内存缓存了。
  const keyStart = store.indexOf('export function translationStoreKey')
  if (keyStart === -1) throw new Error('v0.7 §5: the translation store must expose translationStoreKey()')
  const keyBody = store.slice(keyStart, store.indexOf('\n}', keyStart))
  if (/session/i.test(keyBody)) {
    throw new Error('v0.7 §5: the persistent translation key must not contain a session id')
  }
  if (!/persistTranslation\(\{[\s\S]{0,500}?sourceSha256/.test(host)) {
    throw new Error('v0.7 §5: the persisted record must be keyed by the source hash')
  }
  const persistCall = host.slice(host.indexOf('persistTranslation({'), host.indexOf('persistTranslation({') + 600)
  if (/sessionId/.test(persistCall)) {
    throw new Error('v0.7 §5: the persisted translation record must not carry a sessionId')
  }
  console.log('TRANSLATION_PERSISTENCE_OK')

// --- 翻译必须是分段的，而且必须自己说哪几段没翻成 -------------------------------
// 0.4.0-beta.69 的翻译在真实应用里**一次都没成功过**，而 341 个测试全绿。原因不是模型，
// 是当时那条路必须连上真模型才能跑：单元测试只覆盖了 `inspectTranslation` 的正确性，
// 而它一直是正确的 —— 错的是"整篇必须完美"这个策略，那个策略当时没有任何测试能碰到。
// 所以这里钉住三件让修复成立的事：掩码真的接在策略里、宿主真的把回退段数带回界面、
// 界面真的有那句话。
{
  const core = await readFile(resolve(root, 'src/core/skill-translation.mjs'), 'utf8')
  for (const expected of ['runSegmentedTranslation', 'maskProtected', 'restoreProtected', 'checkChunk', 'reanchorChunk', 'PLACEHOLDER_OPEN']) {
    if (!core.includes(expected)) throw new Error(`the translation core must export ${expected}`)
  }
  // 定义存在不等于用上了：掩码必须真的在策略入口处被调用。
  if (!/runSegmentedTranslation[\s\S]{0,600}maskProtected\(definitionText\)/.test(core)) {
    throw new Error('runSegmentedTranslation must mask the definition before it asks the model anything')
  }
  // 2026-10-01 的第二次真实故障在**接头**上：模型 trim 掉段尾空行之后，上一段的正文与
  // 下一段的 `## 标题` 粘成一行，28 个标题变 21 个，整篇校验报 `heading`。段级校验看不见它，
  // 因为每一段单看都是对的。所以这里要求拼接时按原文还原首尾空白。
  if (!/reanchorChunk\(\{ source, translation: verdict\.translation \}\)/.test(core)) {
    throw new Error('a segment must be re-anchored to its own blank lines before it is joined, or the headings stick together')
  }
  const route = host.slice(host.indexOf("url.pathname === '/skill-trace/translate'"))
  for (const expected of ['result.fallbackChunks', 'chunkCount']) {
    if (!route.includes(expected)) throw new Error(`the translation route must report ${expected}`)
  }
  if (!clientCode.includes('fallbackChunks')) {
    throw new Error('the client must say how many segments fell back to the original')
  }
  // 只说「有几段没成功」而不说为什么，等于把诊断成本推给用户：上一次真实故障里，
  // 界面上那句话与真正的原因（接头吞掉了空行）之间隔着一整轮探针。
  for (const expected of ['result.fallbackReasons', 'fallbackReasons']) {
    if (!route.includes(expected)) throw new Error(`the translation route must report ${expected}`)
  }
  if (!clientCode.includes('fallbackReasonSuffix') || !/TRANSLATION_RULE_TEXT\s*=\s*\{/.test(clientCode)) {
    throw new Error('the client must translate a fallback rule into a reason the user can read')
  }
  // 2026-10-01 的第三次真实故障最贵：模型把 3302 字符**原样返回英文**，而当时的 `checkChunk`
  // 只查结构 —— "结构完好"被判成"翻译成功"，界面于是说「其余已翻译」，用户看到满屏英文。
  // 用户的原话是「宏观你那是提示成功，但是我没有看到」。一个不看语言的判定，配上"一段不过
  // 就整段退回"，就是这句话的全部成因。所以钉三件：判定要看语言、层级能修就修、修不了就拆小。
  for (const expected of ['looksUntranslated', 'alignHeadingLevels', 'splitChunkSource']) {
    if (!core.includes(expected)) throw new Error(`the translation core must handle ${expected}`)
  }
  // 「含这个词」不等于「真的用了它」—— 把调用改成 `if (false && looksUntranslated(...))`
  // 这种写法仍然能骗过按词匹配的守卫，所以这里连**它必须导致的失败**一起钉住。
  if (!/if \(looksUntranslated\(original\.trim\(\), translated\.trim\(\), targetLanguage\)\) \{\s*return \{ ok: false, rule: 'untranslated'/.test(core)) {
    throw new Error('checkChunk must notice when the model handed the source back untranslated')
  }
  if (!/const halves = splitChunkSource\(source\)/.test(core)) {
    throw new Error('a segment that keeps failing must be split, not thrown away whole')
  }
  if (!clientCode.includes('untranslated')) {
    throw new Error('the client must be able to say that the model returned the source unchanged')
  }
  // 译文要活得比"一次页面访问"久（切到别的 Skill 再回来还在），但**不能**比插件久。
  // 前半句靠核心那个 Map，后半句靠"它只在这个模块里" —— 插件卸载，模块一起消失。
  const cacheModule = await readFile(resolve(root, 'src/core/translation-cache.mjs'), 'utf8')
  for (const expected of ['translationCacheKey', 'readCachedTranslation', 'writeCachedTranslation']) {
    if (!cacheModule.includes(`export function ${expected}`)) {
      throw new Error(`the translation cache must export ${expected}`)
    }
  }
  // 查的是**调用**，不是词：注释里解释"没有 localStorage"是这个模块该说的话，
  // 一个按词匹配的守卫会逼着注释不许提到它 —— 那是让文档迁就工具。
  for (const forbidden of ['localStorage.', 'sessionStorage.', 'writeFile(', 'node:fs', 'receipt']) {
    if (cacheModule.includes(forbidden)) {
      throw new Error(`a translation must not outlive the plugin, but the cache knows about ${forbidden}`)
    }
  }
  if (!clientCode.includes('translation-cache.mjs')) {
    throw new Error('the client must read through the shared translation cache')
  }
  // 定义存在不等于用上了：详情页必须**真的**先读缓存、成功后再写缓存。
  if (!/readCachedTranslation\(translationCacheKey\(/.test(clientCode)) {
    throw new Error('the detail page must look in the cache before it translates again')
  }
  if (!/writeCachedTranslation\(translationCacheKey\(/.test(clientCode)) {
    throw new Error('a finished translation must be cached, or switching Skills starts over')
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

// v0.5 Skill Detail 增强：声明流程 + GFM 表格 ------------------------------------------
//
// 这两件事有一个共同的失败模式：**看起来做完了，其实什么都没变**。流程图可以从运行证据里
// 现编一张（那就把这次重构拿掉的"运行优先"又装回去了），表格可以解析成功但渲染成一行竖线
// （那就是没做）。所以这里钉的是关系，不是函数名是否存在。
{
  const flowEvidence = await readFile(resolve(root, 'src/core/flow-evidence.mjs'), 'utf8')
  const markdownTable = await readFile(resolve(root, 'src/core/markdown-table.mjs'), 'utf8')

  // 1. 状态词表：五档、逐句、以及**禁用词**。
  for (const expected of ['FLOW_EVIDENCE_STATES', 'FLOW_EVIDENCE_FORBIDDEN', 'FLOW_DECLARATION_NOTE', 'flowEvidenceLabel', 'flowKindLabel']) {
    if (!flowEvidence.includes(expected)) throw new Error(`the flow vocabulary must carry ${expected}`)
  }
  // 状态说的是"观察到了什么"，不是"Agent 做了什么"。`未执行` 是这一层最危险的词：
  // 它把"没看到证据"写成"没做过"，而前者推不出后者。
  //
  // 查的是**解析出来的标签**，不是源码里的字面量。二者的区别是一次真实漏检：把
  // `zh: '暂无足够证据'` 改成 `zh: '未执行'` 时，按字面量搜的守卫一声不响 —— 因为
  // `FLOW_EVIDENCE_FORBIDDEN` 这行自己就含那个词，搜到了它，于是放行。词表的用途
  // 正是被禁止的词，所以只能在**取值处**验。
  const { FLOW_EVIDENCE_STATES, FLOW_EVIDENCE_FORBIDDEN } = await import(
    pathToFileURL(resolve(root, 'src/core/flow-evidence.mjs')).href
  )
  for (const [relationship, state] of Object.entries(FLOW_EVIDENCE_STATES)) {
    for (const forbidden of FLOW_EVIDENCE_FORBIDDEN) {
      if (state.zh.includes(forbidden) || state.en.includes(forbidden)) {
        throw new Error(`Skill Framework 不能把「${forbidden}」当作 ${relationship} 的说法：我们只观察到证据，没观察到执行`)
      }
    }
  }
  for (const forbidden of FLOW_EVIDENCE_FORBIDDEN) {
    if (client.includes(`'${forbidden}'`)) {
      throw new Error(`Skill Framework 不能把「${forbidden}」写在界面里：我们只观察到证据，没观察到执行`)
    }
  }
  if (!client.includes('FLOW_DECLARATION_NOTE')) {
    throw new Error('the framework must render the shared disclaimer, not its own paraphrase of one')
  }
  // `intent-supported` 必须有自己的说法：模型 description 与步骤对得上，那是意图不是运行事实。
  // 与 `partial` 合并会让用户把"模型说它要做"读成"运行动过"。
  if (FLOW_EVIDENCE_STATES['intent-supported'].zh === FLOW_EVIDENCE_STATES.partial.zh) {
    throw new Error('an intent statement must not be filed under partial evidence')
  }

  // 2. 步骤只来自定义。`SkillFramework` 的整个函数体里不许出现运行时数据源 ——
  //    这条断言的意义在于：一旦有人为了"多显示点东西"把 runs 接进来，步骤数就会随运行变化，
  //    而声明流程的条数是**定义**的性质。
  const frameworkStart = client.indexOf('function SkillFramework(')
  if (frameworkStart === -1) throw new Error('the client must define SkillFramework')
  const frameworkEnd = client.indexOf('\n  function ', frameworkStart + 10)
  const framework = client.slice(frameworkStart, frameworkEnd === -1 ? undefined : frameworkEnd)
  if (!framework.includes('flow?.steps')) throw new Error('the framework must read its steps from the declared flow')
  for (const forbidden of ['runs', 'invocations', 'observedNodeIds', 'evidenceIds', 'runtimeEvidence']) {
    if (framework.includes(forbidden)) {
      throw new Error(`the declared flow may only be annotated by evidence, never built from ${forbidden}`)
    }
  }
  // 点击 = 定位，不是跳转：复用文档已有的 flashAnchor，不新开页面、不打开运行图。
  if (!/onStepClick: flashAnchor/.test(client)) {
    throw new Error('clicking a declared step must reuse the document anchor mechanism')
  }
  for (const forbidden of ['ReactFlow', 'window.open', 'location.href']) {
    if (framework.includes(forbidden)) throw new Error(`a step click must stay inside this page, but the framework touches ${forbidden}`)
  }
  // 顺序：框架 → 本次运行逻辑 → 步骤证据 → SKILL.md。位置反过来就是另一种产品（先读文档、
  // 再猜结构）；把运行逻辑排到框架前面，则是把「声明」读成「观察到」。
  if (!/className: 'st-detail-main' \}, framework, runtimeLogic, stepEvidence, docPanel/.test(client)) {
    throw new Error('the detail body must read 框架 → 运行逻辑 → 步骤证据 → SKILL.md, in that order')
  }

  // 3. 表格：一个解析器，两个读者。渲染器和翻译校验共用它，否则"画得出来"与"校验得过"
  //    会在"什么算一张表"上分家。
  for (const expected of ['parseTableAt', 'tableSignature']) {
    if (!markdownTable.includes(`export function ${expected}`)) throw new Error(`the table parser must export ${expected}`)
  }
  if (!client.includes('markdown-table.mjs') || !client.includes('st-audit-table')) {
    throw new Error('the client must render tables with the shared parser')
  }
  if (!/import \{ tableSignature \} from '\.\/markdown-table\.mjs'/.test(core)) {
    throw new Error('the translation check must read the same table definition the renderer draws')
  }
  if (!/return \{ ok: false, rule: 'table', missing: \[\] \}/.test(core)) {
    throw new Error('a translation that changes a table\'s shape must fail, not be reported as done')
  }
  if (!client.includes('table:')) {
    throw new Error('the client must be able to say that a table structure changed')
  }

  // 4. 原文与中文预览共用**同一个**渲染器调用点。两个调用点意味着两套行为，
  //    而两套行为里必有一套没人测。
  const rendererCalls = client
    .split('\n')
    .filter((line) => line.includes('renderSkillMarkdown(')
      && !/function renderSkillMarkdown\(/.test(line)
      && !/__pure/.test(line))
  if (rendererCalls.length !== 1) {
    throw new Error(`the original and the Chinese preview must share one renderer call site, found ${rendererCalls.length}`)
  }

  // 5. 没有为这两件事引入任何重依赖。流程图与表格都是几十行纯函数，装一个库就意味着
  //    往客户端 bundle 里塞进一个我们控制不了、也测不到的解析器。
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  for (const heavy of ['mermaid', 'marked', 'markdown-it', 'remark', 'rehype', 'reactflow', '@xyflow/react', 'elkjs', 'd3']) {
    if (deps[heavy]) throw new Error(`the framework and the table renderer must stay hand-written, but ${heavy} is a dependency`)
  }
  console.log('SKILL_FRAMEWORK_OK')
}
}

// --- 发布资产的版本一致性 ---------------------------------------------------
// README 是**发布资产**，不是随手笔记：它的"当前版本"与安装示例会直接被人复制。
// 实测漂移过一次——`package.json` 已到 0.4.0-beta.52，README 还写着"当前公开预发布版为
// 0.4.0-beta.3"、安装示例是 v0.4.0-beta.4，**落后 49 个版本**。
//
// 这里只钉"会被人照抄的两处"：当前版本声明与安装示例。逐版历史由 CHANGELOG 负责，
// 不要求 README 同步——否则每次发版都要改 README，规则会被绕过。
//
// `0.5.0` 起这个项目有了不带 `-beta` 的正式版，措辞从「当前公开预发布版为」改成「当前公开版为」。
// 正则同时接受两种写法：措辞不该为了迁就守卫而定，守卫也不该为了措辞再改一次。
{
  const pkgVersion = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
  const readme = await readFile(resolve(root, 'README.md'), 'utf8')

  const declared = /当前公开(?:预发布)?版为\s*`([^`]+)`/.exec(readme)
  if (!declared) throw new Error('README must state the current published version')
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

// --- 指纹预留结构（§31 预留位置，§32 不许界面自推） --------------------------------
// 这一段也曾经**只是一句 `console.log`**：`FINGERPRINT_RESERVED_OK` 印在输出里，而它之前
// 没有任何断言。与 `FIVE_LAYER_MODEL_OK` 不同的是，它守的模块今天还在，所以这里补断言，
// 而不是把 marker 删掉。
//
// 要钉的是**克制**本身。§31 只要求"预留位置"，§32 禁止界面自己推导关系，所以断言必须在
// **给了一个有内容的图之后**仍然成立 —— 否则这条守卫只是在重复"这个模块存在"。
{
  const {
    buildFingerprintReservation,
    FINGERPRINT_PATTERNS,
    FINGERPRINT_PATTERN_LABELS,
    FINGERPRINT_SOURCES,
  } = await import(pathToFileURL(resolve(root, 'src/core/runtime-fingerprint.mjs')).href)

  const expected = ['runtime', 'tool', 'mcp', 'cli', 'failure', 'recovery']
  if (JSON.stringify(FINGERPRINT_PATTERNS) !== JSON.stringify(expected)) {
    throw new Error(`§31 点名的六个 Pattern 必须逐字、按序，实际是 ${FINGERPRINT_PATTERNS.join(', ')}`)
  }
  for (const [name, table] of [['FINGERPRINT_PATTERN_LABELS', FINGERPRINT_PATTERN_LABELS], ['FINGERPRINT_SOURCES', FINGERPRINT_SOURCES]]) {
    const keys = Object.keys(table).sort()
    if (JSON.stringify(keys) !== JSON.stringify([...expected].sort())) {
      throw new Error(`${name} 必须与六个 Pattern 一一对应，实际是 ${Object.keys(table).join(', ')}`)
    }
  }

  // 一个"看起来能派生点什么"的图。哪天有人把推导接上，这里就会红 —— 这才是这条守卫的意义。
  const graph = {
    nodes: [
      { id: 'session:s', type: 'session' },
      { id: 'turn:1', type: 'turn' },
      { id: 'call:1', role: 'invocation', capabilityId: 'tool' },
      { id: 'call:2', role: 'invocation', capabilityId: 'tool' },
    ],
    edges: [{ id: 'edge:contains:turn:1->call:1', from: 'turn:1', to: 'call:1' }],
  }
  const reservation = buildFingerprintReservation(graph)
  if (reservation.derived !== false || reservation.status !== 'reserved') {
    throw new Error('§31 只预留结构：`derived` 必须是 false、`status` 必须是 reserved')
  }
  for (const pattern of Object.values(reservation.patterns)) {
    if (pattern.value !== null) {
      throw new Error(`§32：指纹是"这次运行怎么工作"的判断，界面不得自推（${pattern.key} 被填了值）`)
    }
    if (pattern.status !== 'not-yet-derived') {
      throw new Error(`${pattern.key} 未派生时只能写 not-yet-derived，不能写别的`)
    }
    if (!Array.isArray(pattern.sources) || !pattern.sources.length) {
      throw new Error(`${pattern.key} 必须写明它由哪些能力喂，否则预留结构不可读`)
    }
  }
  // 它读图是为了**报数**，不是为了判断。"空"与"没有模式"是两句话，所以这句必须在。
  if (typeof reservation.note !== 'string' || !reservation.note.includes('尚未派生')) {
    throw new Error('预留结构必须自己说明"空不代表没有模式"，否则读者会把 null 读成"没有模式"')
  }
  const available = reservation.evidenceAvailable ?? {}
  if (available.nodeCount !== 4 || available.edgeCount !== 1) {
    throw new Error('预留结构只报证据量，不解释证据')
  }
  if (available.invocationCount?.tool !== 2) {
    throw new Error('预留结构应如实数出每个能力的调用次数')
  }

  console.log('FINGERPRINT_RESERVED_OK')
}

// --- 有断言的 marker 才算数 --------------------------------------------------------
// 这条守卫守的是**上面每一条 marker 自己**。
//
// 实测事故（`FIVE_LAYER_MODEL_OK`，v0.7 知识库治理时才发现）：它和
// `FINGERPRINT_RESERVED_OK` 两句一直印在输出里，而它们之前没有任何断言 —— 输出说
// "这条契约成立"，其实没有人检查过。前者的模块（`src/core/runtime-layout.mjs`、
// `src/dsh/client/runtime-flow.js`、`test/phase8-five-layer-model.test.mjs`）在 v0.6 删掉
// 运行图谱画布时一起删了，marker 却留了下来 —— 正是本文件上面自己写下的那个反模式。
// 所以这次不是补断言，而是**删掉 marker**：它守的界面已经不存在了。
//
// 规则：每个 marker 所在的那一段里必须出现过抛错。段的边界是**顶格的 `}`**，
// 因此连续印出的那十四个 marker 共用一段，只要该段有过断言就全部算数。
{
  const lines = (await readFile(resolve(root, 'scripts/verify-project.mjs'), 'utf8')).split('\n')
  const backed = []
  const bare = []
  let threwSinceBoundary = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
    if (line === '}') threwSinceBoundary = false
    else if (trimmed.includes('throw new Error')) threwSinceBoundary = true
    const marker = /^console\.log\('([A-Z_]+_OK)'\)$/.exec(trimmed)
    if (!marker) continue
    if (threwSinceBoundary) backed.push(marker[1])
    else bare.push(marker[1])
  }

  if (bare.length) {
    throw new Error(
      `这些 marker 前面没有任何断言，输出会声称契约成立而其实没人检查过：${bare.join(', ')}`
      + ' —— 补上断言，或者在同一次改动里删掉 marker。',
    )
  }
  // 反方向也要成立：如果这条守卫自己不再扫到任何 marker，它就变成了一个永远为真的空循环。
  if (backed.length < 15) {
    throw new Error(`只扫到 ${backed.length} 条带断言的 marker，怀疑本守卫已经扫不到东西了`)
  }

  console.log('GUARD_MARKERS_ARE_BACKED_OK')
}
