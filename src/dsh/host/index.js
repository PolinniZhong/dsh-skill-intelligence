import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  buildViewModels,
  carriesSkillEvidence,
  emptyReceipt,
  migrateReceipt,
  rebuildReceipt,
  reduceSessionEvent,
  setRuntimeLineage,
  setSourceSnapshots,
  setTraceRuntimeIdentity,
} from '../../core/trace-reducer.mjs'
import { readSessionEvents } from '../../core/session-log.mjs'
import { buildCatalogSnapshot, buildSourceSnapshots, safeSkillName } from '../../core/source-snapshot.mjs'
import { buildInstalledView } from '../../core/installed-view.mjs'
import { buildSkillDefinitionView, compareDefinitionToRun, DEFINITION_CONTENT_BYTES } from '../../core/skill-definition.mjs'
import {
  buildChunkMessages,
  compareTranslationSource,
  DEFAULT_TRANSLATION_LANGUAGE,
  inspectTranslation,
  runSegmentedTranslation,
  TRANSLATION_ERROR,
} from '../../core/skill-translation.mjs'
import { buildSessionSkillList, buildSkillDetail } from '../../core/skill-view-model.mjs'
import {
  CLONE_ERROR,
  describeCloneResult,
  isSkillName as isCloneSkillName,
  planCloneSource,
  rewriteSkillName,
} from '../../core/skill-clone.mjs'
import { resolveCloneRoot } from '../../core/skill-clone-path.mjs'
import { buildLineageRecord } from '../../core/skill-lineage.mjs'
import { buildSkillDiff, DIFF_ERROR } from '../../core/skill-diff.mjs'
// v0.9.0：Skill 验收。规范表与确定性验收器都是纯函数、零依赖、无模型调用 —— 它们回答的是
// 「这份 SKILL.md 当前有哪些可以机械判定的事实」，不是「这份 Skill 好不好」。
// 验收目标（Profile 集合）由验收器自己解析，宿主只把用户给的那串 id 原样传下去。
import { buildSkillValidation } from '../../core/skill-validation.mjs'
// v0.9.1：对话式修改。协议正文、送给 Agent 的那条消息、以及「本次修改对比」全是纯函数；
// 宿主只做三件它才能做的事 —— 读磁盘、把「改前」记进内存、请当前会话的 Agent 把任务发出去。
// 它**不**解析 Agent 的方案，也**不**碰文件：写文件是 Agent 用 DSH 原生工具做的，走 DSH 的权限。
import {
  buildModificationMessageText,
  diffSkillModification,
  MODIFICATION_SOURCE_KIND,
  resolveModificationScopes,
} from '../../core/skill-modification.mjs'
import { resolveSkillProfiles } from '../../core/skill-profiles.mjs'
import { createReceiptStore } from '../../storage/receipt-store.mjs'
import { createPreferenceStore } from '../../storage/preference-store.mjs'
import { createSkillLineageStore } from '../../storage/skill-lineage-store.mjs'
import { createTranslationStore } from '../../storage/translation-store.mjs'
// v0.9.1 §「本次修改对比」：**内存**快照库。它必须在 `apply` 作用域里只建一次 ——
// 每请求新建一份就等于什么都没记住。它自己保证不碰磁盘（见该模块的文件头）。
import { createModificationSnapshotStore } from '../../storage/modification-snapshot-store.mjs'
import {
  bodySha256,
  cloneTargetTaken,
  findProjectRoot,
  listSkillFiles,
  probeExistingRoots,
  probePopulatedRoots,
  readBackClone,
  readSkillSource,
  readSkillSourceSha256,
  readSkillBody,
  readSkillFile,
  removeClone,
  // v0.9.2：已安装列表的排序事实。「加入本机」＝ Skill 目录的 birthtime，只有宿主读得到。
  skillAddedAtByName,
  skillRootCandidates,
  writeClone,
} from '../../storage/skill-clone-writer.mjs'

export const name = 'dsh-skill-trace'

// Catalog projection keeps original receipt chronology; later local edits only change updatedAt.
//
// `turn/start` advances the log-order cursor that attributes a `user/message`,
// which carries no turn/step of its own. `user/message` carries the two Skill
// facts no tool call exposes: a user-explicit `/name` load (`source.kind`
// `skill-invocation`) and the published skill catalog (`source.kind`
// `skill-catalog`). Every `tool/call` is kept as bounded runtime evidence, so
// Tool, CLI and MCP invocations are no longer discarded at the door.
const OBSERVED_EVENT_TYPES = new Set([
  'turn/start',
  'step/start',
  'step/end',
  'turn/end',
  'tool/call',
  'tool/result',
  'user/message',
  // Parent-owned direct-child catalog: the durable, explicit subagent correlation
  // key, so a spawned child never has to be inferred from tool ordering.
  'subagent/catalog',
])

// DSH exposes a live session's durable log through `session.snapshotEvents()`.
// The older `session.events` field it replaced is gone by runtime 0.1.2-rc.1, and
// reading it silently yielded `undefined`, so every rebuild produced an empty
// receipt. Accept both spellings so a runtime rename can never blank the views.
export function sessionEventLog(session) {
  if (typeof session?.snapshotEvents === 'function') return session.snapshotEvents()
  if (Array.isArray(session?.events)) return session.events
  return []
}

/** §21: how dense the debug view may get, against the flow view's default budget. */

/**
 * §21：运行流程是**高层阅读视图**，运行图谱是**低层调试视图**——两者的差别必须在
 * 密度上，而不只是同一张图挂上筛选。
 *
 * 实测一个真实会话（39 Turns / 644 Steps）在默认预算下渲染出 195 个节点，
 * 铺开成一面线条墙；而 §20.1/§21 要的是「Session → Turn → Capability → 主要 Runtime
 * Event」。所以运行流程的节点预算按阅读密度定，而不是按硬上限定。
 */

/**
 * How many Skills one session list may ask the registry about.
 *
 * The lookups exist only to decorate entries that load evidence already produced, so this is a
 * guard against a pathological session, not a product limit: a session that loaded more than
 * this many distinct Skills still gets the list — just without descriptions past the cap.
 */
const SKILL_LIST_LOOKUP_LIMIT = 50

/**
 * 运行流程还要折叠 Turn 列。一个 39 Turns 的真实会话若逐个画出 Turn，就是一根 34 行
 * 的竖条——仍然不可读。§36 的区间折叠按阅读密度触发，而不是按硬上限。
 */

/**
 * 每列最多几行。实测（39 Turns / 644 Steps 的真实会话，视口约 1130×700）：
 *
 *   nodes=40 turn=12 rows= 7 → 40 节点 1650× 921px，fitView ≈ 0.68  文字乘 0.68 读不了
 *   nodes=20 turn= 6 rows= 6 → 21 节点 1182× 796px，fitView ≈ 0.88  临界
 *   nodes=16 turn= 5 rows= 5 → 20 节点 1182× 671px，fitView ≈ 0.96  ✓ 约 100%
 *
 * **`fitView` 同时适配宽和高**，所以把布局变高反而缩得更小——这是实测纠正的判断错误。
 * 结论：40 个 115px 高的节点不可能既全部可见又 100% 缩放。
 *
 * preview 能做到，是因为它只有 **11 个节点**（930×760 舞台）。**preview 的本质不是
 * 「一屏看全」，而是「节点在 100% 下可读」**——所以这里按后者定预算，而不是按"画布多大"。
 */

/** The canvas never reads member lists; the timeline already used them. */
function stripMemberIds(layout) {
  return { ...layout, nodes: layout.nodes.map((node) => ({ ...node, memberIds: [] })) }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(payload)
}

async function readBody(req, maxBytes = 32 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

/**
 * 请求层面的错误：**消息是给人看的句子，状态码由 `status` 明确带着走。**
 *
 * 这里以前不是这样。catch 用一个正则去消息里找「必填 / 无效」来猜 400 还是 500，
 * 于是「状态码是什么」和「消息怎么写」被绑成了一件事，校验消息就只好写成字段名。
 * 而这条消息会**原样出现在界面上** —— 用户看到的是 `sessionId 必填`，
 * 不是「发生了什么、怎么恢复」（§29、AGENTS §7）。
 *
 * 新写的校验请抛这个：状态码不再靠猜，消息不再受正则约束。
 */
class RequestError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

function requiredSessionId(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 240) {
    throw new RequestError('这次请求没有带上会话标识，无法确认它属于哪个会话。请刷新页面后重试；如果刷新无效，请重启 DSH。')
  }
  return value.trim()
}

function requiredSkillName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value.trim())) {
    throw new RequestError('这次请求没有带上合法的 Skill 名，无法定位 Skill。请刷新页面后重试。')
  }
  return value.trim()
}

/**
 * 指纹的形状是固定的（`sha256:` + 64 位小写十六进制）。校验形状而不是只检查非空，
 * 是因为这两个字段直接参与持久化键：一个手抖的空格会变成一份永远读不到的中文阅读版。
 */
function requiredSourceSha256(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
    throw new RequestError('这次请求没有带上合法的正文指纹，无法确认译文对应的是哪一版正文。请刷新页面后重试。')
  }
  return text
}

function optionalTargetLanguage(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, 40) : DEFAULT_TRANSLATION_LANGUAGE
}

function optionalEntryId(value) {
  if (value === null || value === '') return ''
  if (typeof value !== 'string' || value.length > 512 || /[\x00-\x1f]/.test(value)) throw new Error('entryId 无效')
  return value
}

function optionalSearchQuery(value) {
  if (value === null || value === '') return ''
  if (typeof value !== 'string' || value.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error('searchQuery 无效')
  return value.trim()
}

/** `against` 是可选的比较对象；给了就必须是一个合法的 Skill 名，没有就返回 `null`。 */
function optionalSkillName(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? requiredSkillName(text) : null
}

function isLoopbackAddress(value) {
  const address = String(value || '').replace(/^::ffff:/, '')
  return address === '127.0.0.1' || address === '::1' || address === 'localhost'
}

function publicReceipt(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    sessionId: receipt.sessionId,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    coverage: receipt.coverage,
    activity: receipt.activity,
    traceEvents: receipt.traceEvents.map((trace) => ({
      eventId: trace.eventId,
      sessionId: trace.sessionId,
      turn: trace.turn,
      step: trace.step,
      skillName: trace.skillName,
      status: trace.status,
      invocationType: trace.invocationType ?? null,
      callId: trace.callId,
      callSeq: trace.callSeq,
      resultSeq: trace.resultSeq,
      requestedAt: trace.requestedAt,
      resolvedAt: trace.resolvedAt,
      consumer: trace.consumer,
      consumerIdentity: trace.consumerIdentity,
      coverage: trace.coverage,
      errorCode: trace.errorCode,
      evidenceFingerprint: trace.evidenceFingerprint,
      continuityCandidate: trace.continuityCandidate,
      runtimeIdentity: trace.runtimeIdentity ?? null,
    })),
    sourceSnapshots: receipt.sourceSnapshots,
    runtimeEvents: receipt.runtimeEvents ?? [],
    runtimeEventOverflow: receipt.runtimeEventOverflow ?? 0,
    catalogPublished: receipt.catalogPublished ?? null,
    catalogPublicationCount: receipt.catalogPublicationCount ?? 0,
    lineage: receipt.lineage ?? { parentSessionId: null, delegationDepth: null },
    outputReferences: receipt.outputReferences,
    learningNotes: receipt.learningNotes,
    validationResults: receipt.validationResults,
    continuity: receipt.continuity,
  }
}

export function shouldPersistReceipt(receipt) {
  return Boolean(
    receipt?.traceEvents?.length
    || receipt?.outputReferences?.length
    || receipt?.learningNotes?.length
    || receipt?.validationResults?.length,
  )
}

export function createSessionMutationQueue() {
  const queues = new Map()
  let maintenance = Promise.resolve()

  function enqueue(sessionId, work) {
    const previous = queues.get(sessionId) ?? Promise.resolve()
    const gate = maintenance
    const next = Promise.all([previous.catch(() => {}), gate.catch(() => {})]).then(work)
    queues.set(sessionId, next)
    return next.finally(() => {
      if (queues.get(sessionId) === next) queues.delete(sessionId)
    })
  }

  async function runMaintenance(work) {
    const previousMaintenance = maintenance
    const pendingSessionWrites = [...queues.values()]
    let release
    const barrier = new Promise((resolve) => { release = resolve })
    const slot = previousMaintenance.catch(() => {}).then(() => barrier)
    maintenance = slot
    await previousMaintenance.catch(() => {})
    await Promise.allSettled(pendingSessionWrites)
    try {
      return await work()
    } finally {
      release()
      if (maintenance === slot) maintenance = Promise.resolve()
    }
  }

  return { queues, enqueue, runMaintenance }
}

/**
 * Cheap signature of the evidence that must reach disk as soon as it is seen.
 *
 * Skill evidence keeps its immediate durability: a newly opened load, a load
 * that settled, or a published/replaced catalog all change this signature. The
 * runtime event stream does not — it is derived evidence that a turn boundary or
 * any later rebuild reproduces from the durable session log, so it is persisted
 * at turn boundaries instead.
 *
 * That distinction matters: a settled invocation costs two normalized events, so
 * rewriting the whole receipt on every `tool/call` and `tool/result` would write
 * the same growing file hundreds of times per session.
 * @param receipt - the in-memory receipt.
 * @returns a stable string that changes exactly when Skill evidence changes.
 */
export function skillEvidenceSignature(receipt) {
  const traces = receipt?.traceEvents ?? []
  const settled = traces.filter((trace) => trace.status !== 'requested').length
  return `${traces.length}|${settled}|${receipt?.catalogPublicationCount ?? 0}|${receipt?.catalogPublished?.seq ?? ''}`
}

/**
 * §12.5：一次辅助模型调用，用于生成当前页面的临时中文预览。
 *
 * 照 `@deepseek-ai/dsh-session-title-llm` 的官方模式自己造 messages 并消费
 * `ctx.llm.stream`。区别是**什么都不写回会话**：它把请求追加进 session log
 * （`session/title-llm-request`），而 §12.4 要求译文只活在页面内存里，所以这里既不传
 * `sessionId` 给路由、也不 append 任何 session 事件，更不会往用户对话里插一条消息。
 *
 * `@deepseek-ai/dsh-llm` 用动态 import：解析失败只会让翻译不可用，不会让整个宿主插件
 * 起不来 —— 它是一个能力，不是一个启动依赖。
 */
// 每次模型调用的输出上限。分段之后每段输入 ≤ 6000 字符，4096 的输出预算足够，
// 也不会再出现「整篇译文被 maxTokens 截断」这种看不出来的失败。
// 8192，不是 4096。旧值 4096 是这条路上第二个没说出口的失败源：31174 字符的定义一次性
// 翻译，即使模型没有动标题，4096 个输出 token 也装不下它的中文 —— 输出会在半路被截断，
// 后半篇的标题因此对不上，报出来的正是 `heading`。分段之后每段只有几千字符，8192 有富余。
const TRANSLATION_MAX_TOKENS = 8192
// 每段最多问两次。第二次仍不听话就**回退这一段**（显示原文），而不是丢掉整篇 ——
// 用户宁可看到一段英文加一句说明，也不该看到「翻译失败」而一个字都没有。
const TRANSLATION_ATTEMPTS_PER_CHUNK = 2

/**
 * 把定义正文翻成目标语言。
 *
 * 这里不再「一次性把 3 万字符交给模型然后祈祷它一个字符都不改」——那是 beta.69 翻译
 * 一次都没成功的原因。现在必须逐字保留的片段（围栏、行内代码、URL、路径、frontmatter）
 * 根本不进入请求，正文按空行分段逐段翻译，段内校验占位符与标题层级。
 *
 * 返回 `{ translation, chunkCount, fallbackChunks }`；`fallbackChunks` 是**回退到原文的
 * 段数**，界面必须把它说出来，不能让用户以为整篇都翻好了。
 */
async function translateSkillDefinition({ llm, selection, skillName, definitionText, targetLanguage }) {
  const { BlockAssembler, createUserMessage } = await import('@deepseek-ai/dsh-llm')

  const askModel = async (system, body) => {
    const messages = [createUserMessage({
      content: [{ type: 'text', text: body }],
      source: { kind: 'dsh-skill-trace-translate' },
    })]
    const request = {
      provider: selection.provider,
      model: selection.model,
      messages,
      system,
      maxTokens: TRANSLATION_MAX_TOKENS,
    }
    if (selection.reasoningEffort) request.reasoningEffort = selection.reasoningEffort
    const assembler = new BlockAssembler()
    for await (const chunk of llm.stream(request)) assembler.push(chunk)
    // 只取文本块。模型若返回 tool-call，那段内容不属于译文，忽略即可 —— 段内校验
    // 会因为占位符缺失或标题不符而拒绝它。
    return assembler.blocks().filter((block) => block.type === 'text').map((block) => block.text).join('')
  }

  // 策略（掩码、分段、重试、段级回退）全在 `runSegmentedTranslation` 里，那部分用假模型
  // 就能测；这里只负责把 DSH 的 llm 包成一个 `ask`。
  return runSegmentedTranslation({
    definitionText,
    skillName,
    targetLanguage,
    attempts: TRANSLATION_ATTEMPTS_PER_CHUNK,
    ask: ({ chunk, index, total, attempt }) => {
      const built = buildChunkMessages({ skillName, chunkSource: chunk.source, targetLanguage, index, total, attempt })
      return askModel(built.system, built.messages[0].content)
    },
  })
}
export function apply(ctx, config = {}) {
  ctx.inject(['webServer', 'sessions', 'agents'], (webCtx) => {
    const dataRoot = typeof config.dataRoot === 'string' && config.dataRoot.trim() ? config.dataRoot.trim() : null
    const store = createReceiptStore(dataRoot ? join(dataRoot, 'receipts') : undefined)
    const preferenceStore = createPreferenceStore(dataRoot || undefined)
    // v0.7 §5：中文阅读版落盘。位置跟着 dataRoot 走，与 receipts/preferences 同一套根目录约定。
    const translationStore = createTranslationStore(dataRoot ? join(dataRoot, 'translations') : undefined)
    // v0.8 §17.3：Skill 复刻血缘。**不是**收据里那个 `lineage`（那是会话父子血统）——
    // 这里存的是「本插件执行过一次 A → B 的复刻」这条长期资产关系。
    const lineageStore = createSkillLineageStore(dataRoot ? join(dataRoot, 'lineage') : undefined)
    // v0.9.2 §7：已安装列表上「复刻自 X」那一行。读不出来时返回 `null`，让 core 如实记成
    // `lineage-unavailable` —— 「这些 Skill 都不是复刻来的」与「我读不到复刻记录」是两句话，
    // 分不清就不许说前一句。
    const lineageByTargetName = async () => {
      try {
        const { records } = await lineageStore.list()
        const map = {}
        for (const record of records) {
          const target = safeSkillName(record?.targetSkillName)
          const source = safeSkillName(record?.sourceSkillName)
          if (!target || !source) continue
          map[target] = { sourceSkillName: source, createdAt: record.createdAt }
        }
        return map
      } catch (error) {
        console.error('[dsh-skill-trace] lineage read failed', error)
        return null
      }
    }
    // v0.9.1 §「本次修改对比」：一次修改事务的「改前」。**只在内存里**，跟着宿主进程活；
    // 不落盘、不进收据、不进会话日志，DSH 重启之后什么都不剩 —— 那时只能说「本次修改前状态不可用」。
    const modificationStore = createModificationSnapshotStore()
    const cache = new Map()
    const { queues, enqueue, runMaintenance } = createSessionMutationQueue()
    const pruneTask = store.prune(shouldPersistReceipt).then((removed) => {
      if (removed > 0) console.log(`[dsh-skill-trace] removed ${removed} empty receipt file(s)`)
    }).catch((error) => console.error('[dsh-skill-trace] empty receipt cleanup failed', error))

    async function load(sessionId) {
      if (cache.has(sessionId)) return cache.get(sessionId)
      const stored = await store.read(sessionId)
      const receipt = stored ? migrateReceipt(stored, sessionId) : emptyReceipt(sessionId)
      cache.set(sessionId, receipt)
      return receipt
    }

    function registryContext(sessionId) {
      const liveAgent = webCtx.agents.get(sessionId)
      const agentPresets = webCtx.get('agentPresets')
      const registry = (liveAgent ? agentPresets?.serviceFor(liveAgent, 'skills') : undefined) ?? webCtx.get('skills')
      const session = webCtx.sessions.get(sessionId)
      return { registry, liveAgent, session, cwd: session?.header?.cwd }
    }

    /**
     * 把中文阅读版落盘，并返回**真的存上了**这个事实。
     *
     * 界面靠这个布尔值决定说「中文阅读版已保存」还是什么都不说 —— 只报"我调用了写函数"
     * 会在磁盘满、目录只读的时候给出一个假的成功态（design.md §8.5）。
     */
    async function persistTranslation(record) {
      try {
        await translationStore.write(record)
        // 同一个 Skill、同一种语言只留最近两份：旧指纹那一份永远不会被读到，
        // 留着它的唯一后果是磁盘慢慢变大。
        void translationStore.pruneVersions({ keepPerSkill: 2 }).catch(() => {})
        return true
      } catch (error) {
        console.error('[dsh-skill-trace] translation persist failed', error)
        return false
      }
    }

    /**
     * 把一次**已经成功**的复刻记成血缘，并返回真的记上了这个事实。
     *
     * 与 `persistTranslation` 同形：绝不抛。走到这里时副本已经在磁盘上、已经回读过、
     * 源也复核过了，把写血缘的失败报成「复刻失败，没有产生任何副本」是撒谎；所以失败
     * 只在 `limitations` 里加一条 `lineage-not-recorded`，不回滚也不 500（§17.4）。
     *
     * 反方向的纪律同样重要：**回读没通过就不许写血缘**。所以这个函数只在
     * `readBackClone(` 成功之后才会被调用 —— 守卫按源码顺序把这件事钉住。
     */
    async function writeLineage(record) {
      try {
        await lineageStore.write(record)
        return true
      } catch (error) {
        console.error('[dsh-skill-trace] lineage persist failed', error)
        return false
      }
    }

    /**
     * 读差异的一侧。指纹与正文分开取，因为它们是两个口径：
     *
     * - 指纹用 registry 投影里的 `content.sha256` —— 与复刻、与血缘记录同一个口径。
     *   换一个口径，「来源内容已发生变化」这句话就跨不了路由。
     * - 正文直接从磁盘读 —— 差异要的是**现在**真实的字节，不是给界面看的那份可能被截断的投影。
     *
     * 资源清单只在 Skill 真的住在以自己的名字命名的目录里时才列，判据与复刻的
     * `planCloneSource` 相同（`resourceBase` 的末段就是 Skill 名）。否则退回空清单：
     * 把一台机器上碰巧相关的别的目录算成它的资源，比说「这里没有可比的文件」更糟。
     */
    async function readDiffSide({ registry, skillName, cwd, scope, now }) {
      const definition = await buildSkillDefinitionView(registry, skillName, { cwd, scope, now })
      if (!definition.available) {
        return { skillName, available: false, reason: definition.reason ?? 'definition-unavailable' }
      }
      const raw = await registry.get(skillName, { cwd, scope })
      const skillFile = typeof raw?.path === 'string' ? raw.path : null
      const body = skillFile ? await readSkillBody({ skillFile }) : { ok: false, reason: 'source-file-missing' }
      if (!body.ok) return { skillName, available: false, reason: body.reason }
      const base = typeof raw?.resourceBase?.path === 'string' ? raw.resourceBase.path : ''
      return {
        skillName,
        available: true,
        reason: null,
        content: body.body,
        summary: definition.summary,
        sha256: definition.content.sha256,
        files: base && basename(base) === skillName ? await listSkillFiles(base) : [],
      }
    }

    /**
     * 收集验收器要用的**纯数据**（v0.9.0）。
     *
     * 验收器自己不做 IO，所以「这个 Skill 住在哪个目录」「目录里有哪些文件」必须在这里问出来。
     * 两条纪律：
     *
     * 1. 目录名取自 `SKILL.md` 所在的目录，不取自 `resourceBase` 的末段。v0.8 的差异层用
     *    `basename(base) === skillName` 当「能不能列资源」的条件，那对差异是合理的（只在
     *    自己复刻的目录里列清单），但对验收是**错**的：目录名和 name 不一致恰好是 Microsoft
     *    Profile 要判的那件事（`MS-DIR-001`），先按「名字对得上」过滤掉，那条规则就永远
     *    判不出来。
     * 2. 列不出来就给 `null`，不给空数组。验收器把 `null` 读成「拿不到清单，这条规则现在
     *    判不了」，把 `[]` 读成「目录真的空的，里面引用的文件都不存在」。后者是一句指控，
     *    只有在**确认清单完整**时才允许说 —— 判据是 `SKILL.md` 自己出现在清单里。
     *    （§8.10：一条规则能把「正文里出现过斜杠」判成「引用的文件不存在」，方向是制造假指控，
     *    那正是这个项目最不能犯的错。）
     */
    async function validationFacts({ registry, skillName, cwd, scope }) {
      // registry 抛错与「读不到文件」是同一类事实：验收要说「无法判断」，不能把整条路由打成 500。
      // （真机上 registry 会去读盘，文件在这两次调用之间消失时就可能抛 ENOENT。）
      let raw
      try {
        raw = await registry.get(skillName, { cwd, scope })
      } catch {
        return { directoryName: null, resourcePaths: null, text: null, truncated: false }
      }
      const skillFile = typeof raw?.path === 'string' && raw.path ? raw.path : null
      if (!skillFile) return { directoryName: null, resourcePaths: null, text: null, truncated: false }
      const skillDir = dirname(skillFile)
      const listed = await listSkillFiles(skillDir)
      const paths = listed.map((file) => file.path)
      // v0.9.0：验收要判的事实一多半在 frontmatter 里，而 registry 的 `content`（与
      // `readSkillBody`）刻意只给正文 —— 拿正文去判，每一份真实 Skill 都会被判「缺少
      // frontmatter」（真机实测：`content.text` 的第一行就是 `# UI Craft`）。所以这里读整份文件。
      const file = await readSkillFile({ skillFile })
      const text = file.ok ? file.text : ''
      const truncated = file.ok && file.text.length > DEFINITION_CONTENT_BYTES
      return {
        directoryName: basename(skillDir),
        resourcePaths: paths.includes('SKILL.md') ? paths : null,
        // 读不出来就是 `null`：调用方据此降级成「无法判断」，而不是拿一份没有 frontmatter 的
        // 正文去判出一堆假错误。
        text: file.ok ? (truncated ? text.slice(0, DEFINITION_CONTENT_BYTES) : text) : null,
        truncated,
      }
    }

    /**
     * v0.9.0：算出这个 Skill 当前的规范事实。
     *
     * **两条详情路由都要用它**：`/skill-trace/definition` 把它作为同级字段，`/skill-trace/skill`
     * 把它放进 `skill` 里 —— 而详情页读的是后者（客户端 `setFetched(body?.skill ?? null)`）。
     * 只在 `/definition` 上挂字段会让验收卡在真机上永远显示「这次详情响应里没有验收结果」，
     * 而两边的单边测试都看不见这条缝（§8.10：请求体有两半）。
     *
     * 验收目标由 `profiles` 查询参数给出，缺省是 DSH + Common（规划 §三十五：不默认把全部
     * 平台约束强加给用户 —— 否则一个对 DSH 完全合法的 Skill 会因为某个平台的额外建议被误判）。
     *
     * 传给验收器的是**用户原样给的那串 id**，不是 `resolveSkillProfiles` 的结果：那个函数返回
     * `{profileIds, unknown}` 而不是数组，把整个对象当 `profileIds` 传下去会被验收器当成「非法
     * 输入 → 回退默认」，于是 `?profiles=openai` 静默变成 common+dsh。让验收器自己解析还多一件
     * 事：不认识的 id 会变成结果里的一句说明，而不是被悄悄丢掉。
     */
    async function validationFor({ registry, skillName, cwd, scope, searchParams, definition }) {
      const profilesParam = searchParams.get('profiles')
      const selection = typeof profilesParam === 'string'
        ? profilesParam.split(',').map((value) => value.trim()).filter(Boolean)
        : []
      // 调用方通常已经读好了定义（两条路由都要它），这里只在没给的时候自己读一次 ——
      // 同一次请求里读两遍同一份 SKILL.md 会让「两处事实来自不同时刻」变成可能。
      const view = definition ?? await buildSkillDefinitionView(registry, skillName, { cwd, scope, now: Date.now() })
      const facts = await validationFacts({ registry, skillName, cwd, scope })
      const readable = typeof facts.text === 'string'
      return buildSkillValidation({
        skillName,
        // 连 SKILL.md 都读不出来时说「无法判断」，而不是拿 registry 里的正文冒充整份文件
        // —— 后者会判出「缺少 frontmatter」这种假指控。
        available: readable ? view.available : false,
        reason: readable ? view.reason : 'skill-file-unreadable',
        content: readable ? facts.text : '',
        truncated: readable ? facts.truncated : false,
        directoryName: facts.directoryName,
        resourcePaths: facts.resourcePaths,
        profileIds: selection.length > 0 ? selection : undefined,
        now: Date.now(),
      })
    }

    /**
     * 差异比较：只读，不写任何东西，也不缓存。
     *
     * 与复刻最重要的区别是**来源变了不是错误**。复刻遇到 `409` 要拒绝，因为它会把一个混合体
     * 落进目录；差异什么都不写，来源动过恰好是它要说出来的那件事，所以照样 `200`，
     * 用 `comparison.source.changed` 回答（§17.6）。
     *
     * 返回 `{status, body}`，理由与 `handleClone` 相同：每条失败路径要有自己的状态码。
     */
    async function handleDiff(searchParams) {
      const fail = (status, code, error, extra) => ({ status, body: { ok: false, code, error, ...extra } })
      let sessionId
      let skillName
      try {
        sessionId = requiredSessionId(searchParams.get('sessionId'))
        skillName = requiredSkillName(searchParams.get('skillName'))
      } catch (error) {
        return fail(400, DIFF_ERROR.INVALID_REQUEST, error.message)
      }
      let against
      try {
        against = optionalSkillName(searchParams.get('against'))
      } catch (error) {
        return fail(400, DIFF_ERROR.INVALID_REQUEST, error.message)
      }
      const { registry, liveAgent, cwd } = registryContext(sessionId)
      if (!registry) {
        return fail(500, DIFF_ERROR.DIFF_FAILED, '差异比较失败：当前宿主没有挂载 Skill 注册表，读不到 Skill 目录。请重启 DSH 后重试。')
      }
      const record = await lineageStore.read(skillName)
      const againstName = against ?? (typeof record?.sourceSkillName === 'string' ? record.sourceSkillName : null)
      if (!againstName) {
        return fail(404, DIFF_ERROR.NO_LINEAGE, '这个 Skill 不是由本插件复刻出来的，没有可以比较的来源。')
      }
      const now = Date.now()
      const targetSide = await readDiffSide({ registry, skillName, cwd, scope: liveAgent, now })
      if (!targetSide.available) {
        return fail(404, DIFF_ERROR.UNKNOWN_SKILL, `找不到 Skill「${skillName}」，它可能已经被删除或改名。`, { reason: targetSide.reason })
      }
      // 只有「与记录里那个直接来源比」时才存在「复刻当初的那一版」。与别的节点比时它是未知的
      // —— 界面必须说「无法比较这一项」，而不是拿目标现在的指纹凑一个出来（§17.6 边界三）。
      const againstRecordedSource = againstName === record?.sourceSkillName
      const sourceSide = againstName === skillName
        ? { skillName: againstName, content: null, reason: 'same-skill' }
        : await readDiffSide({ registry, skillName: againstName, cwd, scope: liveAgent, now })
      const diff = buildSkillDiff({
        source: sourceSide,
        target: targetSide,
        sourceOriginalSha256: againstRecordedSource ? record.sourceSourceSha256 : null,
        cloneMode: againstRecordedSource ? record.cloneMode : null,
      })
      return {
        status: 200,
        body: { ok: true, sessionId, skillName, against: againstName, lineage: record, ...diff },
      }
    }

    /**
     * v0.9.1：对话式修改 Skill。一条路由，两个动作。
     *
     * - `begin`：读整份 `SKILL.md` + 来源指纹 → 记进**内存**快照 → 请**当前会话的 Agent** 发一条
     *   带 Modification Contract 的修改任务（`source.kind = 'skill-intelligence-modify'`）。
     * - `compare`：拿内存里那份「改前」重读一次现在 → `diffSkillModification()` → 释放快照 →
     *   顺带复用 v0.9.0 的验收（同一份现状文本，不读两遍）。
     *
     * 三条纪律写在代码里，而不是只写在文档里：
     *
     * 1. **插件不写文件。** 这条路由里没有任何 `writeFile` / `ctx.fs.write` —— 改文件是 Agent 用
     *    DSH 原生文件工具做的事，走 DSH 自己的权限与审批。插件在这里只读。
     * 2. **快照只在内存里活着。** 丢了就说「本次修改前状态不可用」，绝不拿现状凑一个假的「改前」。
     * 3. **消息是用户点了「交给 Agent」之后才发的。** 那条消息的 `source.kind` 标出它的来源，
     *    运行记录里一眼能看出它不是手打的，也不是插件替用户偷偷说的。
     *
     * 返回 `{status, body}`，与 `handleDiff` / `handleClone` 同一套：每条失败路径有自己的状态码。
     */
    async function handleModify(body) {
      const payload = body && typeof body === 'object' ? body : {}
      const fail = (status, code, error, extra) => ({ status, body: { ok: false, code, error, ...extra } })
      let sessionId
      let skillName
      try {
        sessionId = requiredSessionId(payload.sessionId)
        skillName = requiredSkillName(payload.skillName)
      } catch (error) {
        return fail(400, 'invalid-request', error.message)
      }
      const action = payload.action === 'compare' ? 'compare' : 'begin'
      const { registry, liveAgent, cwd } = registryContext(sessionId)
      if (!registry) {
        return fail(500, 'registry-unavailable', '当前宿主没有挂载 Skill 注册表，读不到 Skill 目录。请重启 DSH 后重试。')
      }

      if (action === 'compare') {
        // 「改前」只能来自内存快照。没有就是没有 —— 这时 `diffSkillModification` 会给出
        // `available: false` + 那句实话，而不是一份看起来像「没有变化」的结果。
        const snapshot = modificationStore.read({ sessionId, skillName })
        const facts = await validationFacts({ registry, skillName, cwd, scope: liveAgent })
        const view = await buildSkillDefinitionView(registry, skillName, { cwd, scope: liveAgent, now: Date.now() })
        const after = typeof facts.text === 'string'
          ? { sha256: bodySha256(facts.text), text: facts.text, resources: facts.resourcePaths }
          : null
        const before = snapshot && typeof snapshot.text === 'string'
          ? { sha256: bodySha256(snapshot.text), text: snapshot.text, resources: snapshot.resources }
          : null
        const record = await lineageStore.read(skillName)
        const comparison = diffSkillModification({
          skillName,
          scopeIds: snapshot ? snapshot.scopes : [],
          profileIds: snapshot ? snapshot.profiles : [],
          before,
          after,
          source: {
            beforeSha256: snapshot ? snapshot.sourceSha256 : null,
            afterSha256: typeof record?.sourceSourceSha256 === 'string' ? record.sourceSourceSha256 : null,
          },
        })
        // 对比做完就释放：这份「改前」没有理由比这次修改活得更久。
        const released = modificationStore.release({ sessionId, skillName })
        // 复用 v0.9.0 的验收，并且把刚读到的现状传下去 —— 同一次请求读两遍同一份 SKILL.md，
        // 会让「对比看到的」和「验收看到的」来自两个不同的时刻。
        const validation = await validationFor({
          registry,
          skillName,
          cwd,
          scope: liveAgent,
          searchParams: new URLSearchParams(),
          definition: view,
        })
        return {
          status: 200,
          body: { ok: true, sessionId, skillName, action, released, comparison, validation },
        }
      }

      // ---- begin ----
      const intent = typeof payload.intent === 'string' ? payload.intent : ''
      if (intent.trim().length === 0) {
        return fail(400, 'missing-intent', '请先写一句你希望这个 Skill 怎么改。')
      }
      if (!liveAgent || typeof liveAgent.followup !== 'function') {
        // 没有正在运行的 Agent 就没法「交给它」。这不是 500：会话可能还没起来。
        return fail(409, 'session-not-live', '当前会话没有正在运行的 Agent，修改任务没有发出去。请先在这个会话里发一条消息，让 Agent 起来后再试。')
      }
      const scopes = resolveModificationScopes(payload.scopes)
      const profiles = resolveSkillProfiles(payload.profiles)
      const facts = await validationFacts({ registry, skillName, cwd, scope: liveAgent })
      if (typeof facts.text !== 'string') {
        return fail(422, 'skill-file-unreadable', `读不到「${skillName}」的 SKILL.md，因此没有记下改前的样子，修改任务也没有发出去。请确认这个 Skill 还在，并重启 DSH 后重试。`)
      }
      const view = await buildSkillDefinitionView(registry, skillName, { cwd, scope: liveAgent, now: Date.now() })
      if (!view.available) {
        return fail(404, 'unknown-skill', `找不到 Skill「${skillName}」，它可能已经被删除或改名。`, { reason: view.reason })
      }
      const record = await lineageStore.read(skillName)
      const recorded = modificationStore.begin({
        sessionId,
        skillName,
        sourceSha256: typeof record?.sourceSourceSha256 === 'string' ? record.sourceSourceSha256 : null,
        text: facts.text,
        resources: facts.resourcePaths,
        scopes: scopes.scopeIds,
        profiles: profiles.profileIds,
      })
      if (!recorded) {
        return fail(500, 'snapshot-failed', '没能记下这次修改前的状态，因此不会把修改任务发出去。请重启 DSH 后重试。')
      }
      const text = buildModificationMessageText({
        skillName,
        intent,
        scopeIds: scopes.scopeIds,
        profileIds: profiles.profileIds,
      })
      const message = {
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: MODIFICATION_SOURCE_KIND },
      }
      try {
        liveAgent.followup(message)
      } catch (error) {
        // 发不出去就把快照撤掉：留着一份「改前」而任务根本没出去，界面会以为改完了。
        modificationStore.release({ sessionId, skillName })
        const reason = error instanceof Error ? error.message : String(error)
        return fail(500, 'dispatch-failed', `没能把修改任务发给当前会话：${reason}`)
      }
      return {
        status: 200,
        body: {
          ok: true,
          sessionId,
          skillName,
          action,
          dispatched: true,
          messageId: message.id,
          sourceKind: MODIFICATION_SOURCE_KIND,
          scopeIds: scopes.scopeIds,
          lockedScopeIds: scopes.locked,
          unknownScopeIds: scopes.unknown,
          profileIds: profiles.profileIds,
          unknownProfileIds: profiles.unknown,
          createdAt: recorded.createdAt,
          before: {
            sha256: bodySha256(facts.text),
            bytes: view.content?.bytes ?? null,
            lineCount: view.content?.lineCount ?? null,
            truncated: facts.truncated,
          },
        },
      }
    }

    /**
     * 复刻：读源 → 校验指纹 → 写副本 → 回读 → 问 catalog。
     *
     * 返回 `{status, body}` 而不是直接写响应，是为了让每条失败路径都带自己的状态码和
     * 自己的中文说明 —— `spec/SDD.md` §3.3 要求错误必须写清「发生了什么、怎么恢复」，
     * 而 catch-all 只会把认不出的消息一律当 500。
     *
     * 绝对路径在这条路上没有任何出口：响应里只有范围、落点类型与文件数量。
     * 这是产品里唯一会写盘的动作，也是唯一会让界面说出「已创建」的动作，
     * 所以它只在这一层拿到回读与 catalog 的答案之后才敢说成功。
     */
    async function handleClone(body) {
      const payload = body && typeof body === 'object' ? body : {}
      const fail = (status, code, error, extra) => ({ status, body: { ok: false, code, error, ...extra } })
      const sourceSkillName = typeof payload.sourceSkillName === 'string' ? payload.sourceSkillName.trim() : ''
      const targetSkillName = typeof payload.targetSkillName === 'string' ? payload.targetSkillName.trim() : ''
      const sourceSha256 = typeof payload.sourceSha256 === 'string' ? payload.sourceSha256.trim() : ''
      const targetScope = payload.targetScope === 'user' || payload.targetScope === 'project' ? payload.targetScope : ''
      const cloneMode = payload.cloneMode === 'bundle' || payload.cloneMode === 'skill-md' ? payload.cloneMode : ''

      // 名字用 DSH 自己的语法（小写 kebab-case），而不是宿主其它路由那条更宽的规则：
      // 宽规则允许大写与斜杠，写进目录就是一个 DSH 永远不会发现的 Skill。
      if (!isCloneSkillName(sourceSkillName) || !isCloneSkillName(targetSkillName)) {
        return fail(400, CLONE_ERROR.INVALID_REQUEST, 'Skill 名只能用小写字母、数字和连字符，并以字母或数字开头（例如 my-skill-custom）。请修改后重试。')
      }
      if (targetSkillName === sourceSkillName) {
        return fail(400, CLONE_ERROR.INVALID_REQUEST, '目标名称不能与来源相同，请换一个名称。')
      }
      if (!targetScope) return fail(400, CLONE_ERROR.INVALID_REQUEST, '保存范围必须是「当前项目」或「我的 Skill」。')
      if (!cloneMode) return fail(400, CLONE_ERROR.INVALID_REQUEST, '复刻内容必须是「完整 Skill」或「仅 SKILL.md」。')
      if (!/^sha256:[a-f0-9]{64}$/.test(sourceSha256)) {
        return fail(400, CLONE_ERROR.INVALID_REQUEST, '缺少来源版本指纹，请刷新页面后重试。')
      }

      let sessionId
      try {
        sessionId = requiredSessionId(payload.sessionId)
      } catch (error) {
        return fail(400, CLONE_ERROR.INVALID_REQUEST, error.message)
      }

      const { registry, liveAgent, cwd } = registryContext(sessionId)
      if (!registry) {
        return fail(500, CLONE_ERROR.WRITE_FAILED, '复刻失败：当前宿主没有挂载 Skill 注册表，无法读写 Skill 目录。请重启 DSH 后重试。')
      }

      try {
        const definition = await buildSkillDefinitionView(registry, sourceSkillName, { cwd, scope: liveAgent, now: Date.now() })
        if (!definition.available) {
          return fail(
            422,
            CLONE_ERROR.DEFINITION_UNAVAILABLE,
            definition.reason === 'unknown-skill'
              ? `找不到 Skill「${sourceSkillName}」，它可能已经被删除或改名。`
              : '这个 Skill 的定义当前不可读取，因此无法复刻。请稍后重试。',
            { reason: definition.reason },
          )
        }
        // 前端提交的是它**读到过**的那份正文的指纹。源在这期间改过，就说明它读的那份
        // 已经过时；此时照写就是把一个混合体落进目录，宁可让它重来一次。
        if (definition.content.sha256 !== sourceSha256) {
          return fail(409, CLONE_ERROR.SOURCE_CHANGED, '来源 Skill 已经变化，请重新打开详情页再复刻。', { currentSha256: definition.content.sha256 })
        }

        const raw = await registry.get(sourceSkillName, { cwd, scope: liveAgent })
        if (!raw) {
          return fail(422, CLONE_ERROR.DEFINITION_UNAVAILABLE, `找不到 Skill「${sourceSkillName}」的原始定义，无法复刻。`)
        }
        const plan = planCloneSource({
          sourceName: sourceSkillName,
          definitionName: raw.name,
          definitionAvailable: true,
          resourceBasePath: raw.resourceBase?.path ?? null,
        })
        if (!plan.ok) {
          return fail(
            plan.code === CLONE_ERROR.SKILL_NOT_FOUND ? 422 : 400,
            plan.code,
            plan.code === CLONE_ERROR.SKILL_NOT_FOUND
              ? '这个 Skill 的目录名与它自己声明的名字对不上，无法可靠复刻。'
              : '无法解析这个 Skill 的来源，请刷新页面后重试。',
          )
        }
        const wantsBundle = cloneMode === 'bundle'
        // 要整包、但这一层判不出可靠的资源目录时明说，不假装拷全了（§十二）。
        if (wantsBundle && plan.mode !== 'bundle') {
          return fail(422, CLONE_ERROR.BUNDLE_UNREADABLE, '当前无法确认完整资源目录，因此无法复刻完整 Skill。可以改选「仅 SKILL.md」。', { availableMode: 'skill-md' })
        }
        const mode = wantsBundle ? 'bundle' : 'skill-md'

        const source = await readSkillSource({ skillFile: raw.path, directory: plan.directory, mode, limits: {} })
        if (!source.ok) {
          return fail(422, CLONE_ERROR.DEFINITION_UNAVAILABLE, '读取来源 Skill 的文件失败，因此无法复刻。请稍后重试。', { reason: source.reason })
        }
        // 读盘之后指纹又对一次：前面的校验查的是 registry 里的定义，这一次查的是
        // 刚才真正读到的字节。两次之间目录仍然可能被改。
        if (source.sha256 !== sourceSha256) {
          return fail(409, CLONE_ERROR.SOURCE_CHANGED, '来源 Skill 在复刻过程中发生了变化，请重新打开详情页再复刻。')
        }

        const projectRoot = await findProjectRoot(cwd ?? process.cwd())
        const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
        const agentsHome = process.env.DSH_AGENTS_HOME && process.env.DSH_AGENTS_HOME.trim() ? process.env.DSH_AGENTS_HOME.trim() : join(homedir(), '.agents')
        const candidates = [
          join(projectRoot, '.dsh', 'skills'),
          join(projectRoot, '.agents', 'skills'),
          join(dshHome, 'skills'),
          join(agentsHome, 'skills'),
        ]
        const existing = await probeExistingRoots(candidates)
        // 用户级有两个根，而且两个都可能存在。只按 rank 选会把复刻写进那个空的
        // `~/.dsh/skills`，而用户二十多个 Skill 都在 `~/.agents/skills`。
        const populated = await probePopulatedRoots(existing)
        const root = resolveCloneRoot({ scope: targetScope, projectRoot, dshHome, agentsHome, existing, populated })
        if (!root.path) {
          return fail(500, CLONE_ERROR.WRITE_FAILED, '找不到可以写入的 Skill 目录，无法复刻。请确认 DSH_HOME 或项目目录可用后重试。')
        }

        const taken = await cloneTargetTaken({ registry, targetName: targetSkillName, cwd, scope: liveAgent, root: root.path })
        if (taken.taken) {
          return fail(409, CLONE_ERROR.TARGET_EXISTS, 'Skill 名称已存在，请更换名称。', { where: taken.where })
        }

        const rewritten = rewriteSkillName(source.text, targetSkillName)
        if (!rewritten.ok) {
          return fail(422, CLONE_ERROR.DEFINITION_UNAVAILABLE, '来源 Skill 的 frontmatter 无法改写，因此无法复刻。', { reason: rewritten.reason })
        }

        const written = await writeClone({
          root: root.path,
          targetName: targetSkillName,
          skillMd: rewritten.text,
          plan: source.plan,
          sourceDirectory: plan.directory,
          mode,
        })
        if (!written.ok) {
          // 目录已存在是并发或竞态，状态码与前面那次冲突保持一致。
          if (written.reason === 'target-exists') return fail(409, CLONE_ERROR.TARGET_EXISTS, 'Skill 名称已存在，请更换名称。')
          return fail(500, CLONE_ERROR.WRITE_FAILED, '写入 Skill 目录失败，没有产生任何副本。请检查磁盘空间与目录权限后重试。')
        }

        // 写完必须回读：目录里真的躺着一份名字正确的 SKILL.md，才算数。
        const back = await readBackClone({ root: root.path, targetName: targetSkillName })
        if (!back.ok) {
          await removeClone({ root: root.path, targetName: targetSkillName })
          return fail(500, CLONE_ERROR.WRITE_FAILED, '副本写入后没有通过回读校验，已回滚。请稍后重试。', { reason: back.reason })
        }

        // catalog 是另一回事：文件在磁盘上不等于 DSH 已经看见它。watcher 有约 200ms
        // 的写入稳定期，所以这里等一会儿再问，问不到就说问不到（§十八）。
        let discovered = false
        let discoveryAttempts = 0
        for (let attempt = 0; attempt < 6; attempt += 1) {
          discoveryAttempts = attempt + 1
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250))
          const found = await registry.get(targetSkillName, { cwd, scope: liveAgent })
          if (found) {
            discovered = true
            break
          }
        }

        // 源一个字节都没动，这是 §十三 的承诺，也是可以当场验证的事实。
        const reread = await readSkillSourceSha256({ skillFile: raw.path })
        const sourceUnchanged = reread !== null && reread === sourceSha256

        // 血缘：只有走到这里才允许记录 —— 写盘成功、回读通过、源复核过。手动复制与自建
        // 都不产生这个事实，所以界面上「我从谁来」这一行有据可依。`sourceSourceSha256`
        // 记的是**当初复制的那一版**；来源后来改成什么样，由 Diff 实时去读，不进记录。
        const lineageRecorded = await writeLineage(buildLineageRecord({
          sourceSkillName,
          sourceSourceSha256: sourceSha256,
          targetSkillName,
          cloneMode: mode,
          targetScope,
          catalogObservation: discovered ? 'observed' : 'pending',
          sourceRepository: definition.repository?.label ?? null,
        }))

        const limitations = ['absolute-paths-withheld', 'clone-is-not-attached-to-this-session']
        if (!discovered) limitations.push('catalog-refresh-not-observed')
        else limitations.push('catalog-refresh-observed')
        if (!sourceUnchanged) limitations.push('source-reread-did-not-match')
        if (!lineageRecorded) limitations.push('lineage-not-recorded')
        if (mode === 'skill-md') limitations.push('bundle-declared-resources-not-copied')
        if (source.plan.truncated) limitations.push('bundle-truncated-by-limit')
        else if (source.plan.skipped.length > 0) limitations.push('bundle-partially-skipped')

        return {
          status: 200,
          body: {
            ok: true,
            skillName: targetSkillName,
            sourceSkillName,
            scope: targetScope,
            pathKind: root.kind,
            mode,
            verified: true,
            discovered,
            discoveryAttempts,
            sourceUnchanged,
            fileCount: source.plan.files.length,
            skippedCount: source.plan.skipped.length,
            truncated: source.plan.truncated === true,
            invocation: `/${targetSkillName}`,
            summary: describeCloneResult({
              skillName: targetSkillName,
              scope: targetScope,
              mode,
              fileCount: source.plan.files.length,
              skippedCount: source.plan.skipped.length,
              truncated: source.plan.truncated === true,
            }),
            limitations,
          },
        }
      } catch (error) {
        // 兜底文案里不能出现任何路径：异常消息可能带着绝对路径。
        console.error('[dsh-skill-trace] clone failed', error)
        return fail(500, CLONE_ERROR.WRITE_FAILED, '复刻失败，没有产生任何副本。请稍后重试；若持续失败，请检查 Skill 目录权限。')
      }
    }

    /**
     * Descriptions and sourcing for the Skills this session loaded.
     *
     * The registry is consulted *only* for names that already appear in the receipt's load
     * evidence, so a Skill the registry can discover but this session never loaded cannot leak
     * into the list. Lookups are bounded and failures degrade to a status rather than throwing:
     * a list that loses its descriptions is still a truthful list.
     *
     * `definitionStatus` here means "the registry can resolve this name right now" — it is a
     * resolution fact, not a hash comparison. The observed/current hash tri-state lives in the
     * detail view, where the body is actually read.
     */
    async function buildSkillListLookup(registry, receipt, cwd, scope) {
      if (!registry) return null
      const names = [...new Set(
        (receipt?.traceEvents ?? [])
          .filter((trace) => trace?.status === 'loaded' && typeof trace.skillName === 'string')
          .map((trace) => trace.skillName),
      )].slice(0, SKILL_LIST_LOOKUP_LIMIT)
      if (!names.length) return null
      const entries = await Promise.all(names.map(async (name) => {
        try {
          const skill = await registry.get(name, { cwd, scope })
          if (!skill) return [name, { definitionStatus: 'unknown-skill' }]
          return [name, {
            description: skill.description ?? null,
            source: skill.source ?? null,
            provider: skill.provider ?? null,
            definitionStatus: 'available',
          }]
        } catch {
          return [name, { definitionStatus: 'registry-unavailable' }]
        }
      }))
      const table = new Map(entries)
      return (name) => table.get(name) ?? null
    }

    function mergeSourceSnapshots(receipt, updates) {
      const merged = new Map((receipt.sourceSnapshots ?? []).map((item) => [item.skillName, item]))
      for (const update of updates) merged.set(update.skillName, update)
      return setSourceSnapshots(receipt, [...merged.values()])
    }

    async function captureRuntimeIdentity(receipt, sessionId, traces) {
      if (!traces.length) return receipt
      const { registry, liveAgent, cwd } = registryContext(sessionId)
      if (!registry || !liveAgent) return receipt
      const skillNames = [...new Set(traces.map((trace) => trace.skillName))]
      const snapshots = await buildSourceSnapshots(registry, receipt, cwd, {
        scope: liveAgent,
        skillNames,
        captureRuntimeIdentity: true,
      })
      let next = mergeSourceSnapshots(receipt, snapshots)
      const identities = new Map(snapshots.map((snapshot) => [snapshot.skillName, snapshot.runtimeIdentity]))
      for (const trace of traces) next = setTraceRuntimeIdentity(next, trace.eventId, identities.get(trace.skillName))
      return next
    }

    // Session-header lineage. A child session's header names its parent and its
    // delegation depth, so the parent link is a durable header fact rather than a
    // relationship this plugin has to infer.
    function withLineage(receipt, sessionId) {
      const header = webCtx.sessions.get(sessionId)?.header
      if (!header) return receipt
      return setRuntimeLineage(receipt, {
        parentSessionId: header.parentSession,
        delegationDepth: header.delegationDepth,
      })
    }

    async function refreshFromLiveSession(sessionId) {
      const previous = await load(sessionId)
      const session = webCtx.sessions.get(sessionId)
      if (!session) {
        // Not live. Before falling back to the minimal stored receipt, read the
        // durable session log: a past conversation's runtime evidence is fully
        // recoverable from it, and without this the Runtime Graph answered
        // "1 node / 0 edges" for a run that really contained 1095 nodes.
        const { events, found } = readSessionEvents(sessionId)
        if (found && events.length > 0) {
          const rebuilt = withLineage(rebuildReceipt(sessionId, events, previous), sessionId)
          cache.set(sessionId, rebuilt)
          return rebuilt
        }
        const receipt = previous.traceEvents.length > 0 ? previous : {
          ...previous,
          coverage: {
            ...previous.coverage,
            status: 'coverage-unknown',
            note: '当前会话不在运行时内存中，磁盘上也找不到它的会话日志；只能展示已保存的最小收据。',
          },
        }
        cache.set(sessionId, receipt)
        return receipt
      }
      let receipt = rebuildReceipt(sessionId, sessionEventLog(session), previous)
      const { registry, liveAgent, cwd } = registryContext(sessionId)
      if (registry) {
        const sourceSnapshots = await buildSourceSnapshots(registry, receipt, cwd, { scope: liveAgent })
        receipt = setSourceSnapshots(receipt, sourceSnapshots)
      }
      receipt = withLineage(receipt, sessionId)
      cache.set(sessionId, receipt)
      return receipt
    }

    /**
     * The receipt a runtime query should read.
     *
     * A live session's receipt is authoritative; otherwise the store is refreshed
     * from the durable log so historical conversations have a graph at all.
     */
    async function receiptForRuntime(sessionId) {
      const session = webCtx.sessions.get(sessionId)
      if (session) return load(sessionId)
      return refreshFromLiveSession(sessionId)
    }

    async function syncReceipt(receipt) {
      if (shouldPersistReceipt(receipt)) await store.write(receipt)
      else await store.delete(receipt.sessionId)
      return receipt
    }


    webCtx.on('session/event', (session, event) => {
      if (!OBSERVED_EVENT_TYPES.has(event.type)) return
      const sessionId = String(session.id)
      return enqueue(sessionId, async () => {
        const current = await load(sessionId)
        const previousSkillEvidence = skillEvidenceSignature(current)
        let receipt = reduceSessionEvent(current, event)
        if (event.type === 'tool/result') {
          const loaded = receipt.traceEvents.find((trace) => trace.resultSeq === event.seq && trace.status === 'loaded')
          if (loaded) receipt = await captureRuntimeIdentity(receipt, sessionId, [loaded])
        }
        receipt = withLineage(receipt, sessionId)
        cache.set(sessionId, receipt)
        // Skill evidence is written the moment it is observed. Everything else —
        // including the runtime event stream — is written at the turn boundary.
        const skillEvidenceGained = carriesSkillEvidence(event)
          || skillEvidenceSignature(receipt) !== previousSkillEvidence
        if (event.type === 'turn/end' || skillEvidenceGained) await syncReceipt(receipt)
      })
    })

    webCtx.on('session/flush', (session) => {
      const sessionId = String(session.id)
      return enqueue(sessionId, async () => {
        const previous = await load(sessionId)
        let receipt = rebuildReceipt(sessionId, sessionEventLog(session), previous)
        const previousLoaded = new Set((previous.traceEvents ?? []).filter((trace) => trace.status === 'loaded').map((trace) => trace.eventId))
        const newTraces = receipt.traceEvents.filter((trace) => trace.status === 'loaded' && !previousLoaded.has(trace.eventId))
        receipt = await captureRuntimeIdentity(receipt, sessionId, newTraces)
        receipt = withLineage(receipt, sessionId)
        cache.set(sessionId, receipt)
        await syncReceipt(receipt)
      })
    })

    const route = {
      kind: 'prefix',
      path: '/skill-trace',
      handler: async (req, res) => {
        if (!isLoopbackAddress(req.socket?.remoteAddress)) {
          sendJson(res, 403, { ok: false, error: '仅允许本机访问' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://localhost')
        const method = req.method ?? 'GET'
        try {
          if (method === 'GET' && url.pathname === '/skill-trace/context') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const [receipt, preferences] = await Promise.all([
              enqueue(sessionId, async () => {
                const value = await refreshFromLiveSession(sessionId)
                return syncReceipt(value)
              }),
              preferenceStore.read(),
            ])
            const live = webCtx.sessions.get(sessionId)
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: live?.header?.cwd ? basename(live.header.cwd) : '工作区未连接',
              preferences,
              receipt: publicReceipt(receipt),
              views: buildViewModels(receipt),
            })
            return
          }

          // Runtime graph canvas. The layout is bounded by construction, so this
          // response cannot grow with the size of the run.

          // Inspector: one node or one edge at a time, so answering "why does this
          // line exist" never requires shipping the whole graph to the client.


          if (method === 'GET' && url.pathname === '/skill-trace/definition') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const skillName = requiredSkillName(url.searchParams.get('skillName'))
            const { registry, liveAgent, session, cwd } = registryContext(sessionId)
            // The body is read here and returned here. It is deliberately not written into the
            // receipt: `receiptForRuntime` below is only read for what the *run* recorded —
            // hashes, load facts, the published catalog — never for content.
            const definition = await buildSkillDefinitionView(registry, skillName, {
              cwd,
              scope: liveAgent,
              now: Date.now(),
            })
            const receipt = await enqueue(sessionId, () => receiptForRuntime(sessionId))
            // v0.9.0：验收结果并入**同一个响应**，不新开路由（§6.12 的默认答案是「不加」）。
            // 计算过程与详情路由共用 `validationFor`，见上面的注释。
            const validation = await validationFor({
              registry,
              skillName,
              cwd,
              scope: liveAgent,
              searchParams: url.searchParams,
              definition,
            })
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: session?.header?.cwd ? basename(session.header.cwd) : '工作区未连接',
              definition,
              validation,
              observation: compareDefinitionToRun(receipt, skillName, definition),
            })
            return
          }

          // v0.6 §13 起是翻译路径。整条路径只读定义、只回一次结果。
          //
          // **v0.7 修订**：这里曾经写着「刻意不落盘……§12.4 要求译文只存在页面运行时内存里」，
          // 那句话在 v0.7 起已经不成立 —— 见下面 `persistTranslation` 的分支：译文现在作为
          // **本机资产**落到 `<dataRoot>/translations/`，键是「Skill 名 + 正文指纹 + 语言」且
          // **不含会话**（`FR-UI-060`）。仍然不变的是另外三条：不写 receipt、不动偏好文件、
          // 不把正文或 args 带进任何记录 —— 落盘的只有译文本身。
          // 写失败时响应里回 `saved: false`，客户端据此**不**显示「已保存」。
          if (method === 'POST' && url.pathname === '/skill-trace/translate') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const skillName = requiredSkillName(body.skillName)
            const sourceSha256 = typeof body.sourceSha256 === 'string' ? body.sourceSha256.trim() : ''
            if (!sourceSha256) {
              throw new RequestError('这次请求没有带上正文指纹，无法确认译文对应的是哪一版正文。请刷新页面后重试。')
            }
            const targetLanguage = typeof body.targetLanguage === 'string' && body.targetLanguage.trim()
              ? body.targetLanguage.trim().slice(0, 40)
              : DEFAULT_TRANSLATION_LANGUAGE
            const { registry, liveAgent, cwd } = registryContext(sessionId)
            const definition = await buildSkillDefinitionView(registry, skillName, { cwd, scope: liveAgent, now: Date.now() })
            if (!definition.available) {
              sendJson(res, 422, { ok: false, code: TRANSLATION_ERROR.DEFINITION_UNAVAILABLE, error: '无法读取这个 Skill 的定义。' })
              return
            }
            // §15：请求必须带指纹，且必须和当前正文对得上。正文过长时客户端可能拿到的是
            // 截断后那一段的 hash，两个都认，但绝不接受"没有 hash 就当同一个"。
            const sameAsFull = compareTranslationSource({ requestedSha256: sourceSha256, currentSha256: definition.content.sha256 }) === 'match'
            const sameAsReturned = definition.content.truncated === true && sourceSha256 === definition.content.returnedSha256
            if (!sameAsFull && !sameAsReturned) {
              sendJson(res, 409, { ok: false, code: TRANSLATION_ERROR.DEFINITION_CHANGED, error: 'Skill 内容已变化，请重新翻译。' })
              return
            }
            const llm = webCtx.get('llm')
            const selection = webCtx.get('agentDefaultModel')?.currentSelection?.()
            if (!llm || typeof llm.stream !== 'function' || typeof selection?.provider !== 'string' || typeof selection?.model !== 'string') {
              sendJson(res, 429, { ok: false, code: TRANSLATION_ERROR.MODEL_BUSY, error: '当前没有可用的模型服务，稍后再试。' })
              return
            }
            let result = null
            try {
              result = await translateSkillDefinition({
                llm,
                selection,
                skillName: definition.skillName,
                definitionText: definition.content.text,
                targetLanguage,
              })
            } catch {
              sendJson(res, 500, { ok: false, code: TRANSLATION_ERROR.TRANSLATION_FAILED, error: '翻译失败，可以重试。' })
              return
            }
            const translation = result.translation
            // §14 是硬规则，不是提示词里的愿望。模型改动了围栏、URL、路径或标题层级时，
            // 宁可返回失败也不能把一份改坏结构的文档当成"中文预览"交给用户。
            const check = inspectTranslation({ source: definition.content.text, translation })
            if (!check.ok) {
              sendJson(res, 502, {
                ok: false,
                code: TRANSLATION_ERROR.TRANSLATION_FAILED,
                error: '这份翻译改动了文档结构，已丢弃。可以重试。',
                violations: check.violations.map((violation) => violation.rule),
              })
              return
            }
            sendJson(res, 200, {
              ok: true,
              skillName: definition.skillName,
              sourceSha256: definition.content.sha256,
              targetLanguage,
              model: `${selection.provider}/${selection.model}`,
              // 正文被截断时译文也只覆盖可见部分，必须让界面说清楚。
              truncated: definition.content.truncated === true,
              translation,
              preserved: check.preserved,
              // 有段落回退到原文时必须说出来。用户看到一段英文而界面声称「已翻译」，
              // 比看到「翻译失败」更糟 —— 那是在无声地骗他。
              chunkCount: result.chunkCount,
              fallbackChunks: result.fallbackChunks,
              // 只说**为什么**，规则名是我自己的词表（heading / placeholder / empty），
              // 不带模型名、不带路径、不带段落原文。
              fallbackReasons: result.fallbackReasons.map((entry) => entry.rule),
              // v0.7 §6：界面只有在**真的落盘了**之后才允许说「中文阅读版已保存」。
              // 存不下不影响这次阅读（译文已经在响应里），但也不能假装存上了。
              saved: await persistTranslation({
                skillName: definition.skillName,
                sourceSha256: definition.content.sha256,
                targetLanguage,
                translation,
                chunkCount: result.chunkCount,
                fallbackChunks: result.fallbackChunks,
                fallbackReasons: result.fallbackReasons.map((entry) => entry.rule),
                model: `${selection.provider}/${selection.model}`,
                truncated: definition.content.truncated === true,
              }),
            })
            return
          }

          // v0.6 §7：已安装 Skill。回答「当前 DSH 环境可发现哪些 Skill」，与本次会话
          // 发生过什么无关 —— 所以这条路由**不读 receipt**，也不把学习状态带回来。
          //
          // **v0.7 修订**：这里曾经写着「名字暂用 `/installed` 而不是 SDD §16 写的 `/catalog`」，
          // 但字面早就是 `/skill-trace/catalog`，「我的 Skill」工作台也已在 `0.5.0` 删除，
          // 改名条件已经满足。注释留在原处只会让后来的人以为还有一次改名欠着。
          if (method === 'GET' && url.pathname === '/skill-trace/catalog') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const query = optionalSearchQuery(url.searchParams.get('query'))
            const { registry, liveAgent, session, cwd } = registryContext(sessionId)
            // 发现不完整是**事实**，不是错误：`buildCatalogSnapshot` 把 registry 抛错与
            // 并发改动都收敛成 status，`buildInstalledView` 再把它写成 coverage。
            const catalogSnapshot = registry && liveAgent
              ? await buildCatalogSnapshot(registry, cwd, liveAgent)
              : null
            // v0.9.2：排序要「这个 Skill 什么时候出现在本机」，卡片要「复刻自 X」。这两件事
            // 都不在目录快照里（快照里每个 Skill 只有名字、描述、provider、指纹与调用方式），
            // 只有宿主读得到 —— 目录 birthtime 来自文件系统，血缘来自 v0.8 的血缘库。
            // 两处读盘都不抛错：读不到就是「说不出来」，由 core 记成 limitations。
            const installed = buildInstalledView({
              catalogSnapshot,
              query,
              addedAtByName: await skillAddedAtByName({
                names: (Array.isArray(catalogSnapshot?.skills) ? catalogSnapshot.skills : []).map((skill) => skill?.name),
                roots: await skillRootCandidates({ cwd }),
              }),
              lineageByName: await lineageByTargetName(),
            })
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: session?.header?.cwd ? basename(session.header.cwd) : '工作区未连接',
              installed,
            })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/skills') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const { registry, liveAgent, session, cwd } = registryContext(sessionId)
            const receipt = await enqueue(sessionId, () => receiptForRuntime(sessionId))
            const lookup = await buildSkillListLookup(registry, receipt, cwd, liveAgent)
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: session?.header?.cwd ? basename(session.header.cwd) : '工作区未连接',
              list: buildSessionSkillList(receipt, { lookup }),
            })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/skill') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const skillName = requiredSkillName(url.searchParams.get('skillName'))
            const { registry, liveAgent, session, cwd } = registryContext(sessionId)
            // The Skill's definition body is read here and returned here — same contract as
            // `/skill-trace/definition` above: live read, read-only, never written into the
            // receipt. Everything else about the Skill is assembled from what the run recorded.
            const definition = await buildSkillDefinitionView(registry, skillName, {
              cwd,
              scope: liveAgent,
              now: Date.now(),
            })
            const receipt = await enqueue(sessionId, () => receiptForRuntime(sessionId))
            const lookup = await buildSkillListLookup(registry, receipt, cwd, liveAgent)
            const list = buildSessionSkillList(receipt, { lookup })
            const listEntry = list.skills.find((entry) => entry.name === skillName) ?? null
            // 血缘与详情一起回，不为它单开路由：它是这个 Skill 的基础事实，跟 summary、
            // framework 一样属于「这个 Skill 是什么」。`null` 表示本插件没有执行过这次复刻
            // —— 手动复制的 Skill 得到的也是 `null`，因为那两件事在事实上没有区别。
            const lineage = await lineageStore.read(skillName)
            // v0.9.0：验收结果走**这条**路由回界面。详情页读的是 `body.skill`，所以字段必须
            // 长在 `skill` 里；只在 `/skill-trace/definition` 上挂同级字段的话，验收卡在真机上
            // 永远只会显示「这次详情响应里没有验收结果」（§8.10：请求体有两半）。
            const validation = await validationFor({
              registry,
              skillName,
              cwd,
              scope: liveAgent,
              searchParams: url.searchParams,
              definition,
            })
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: session?.header?.cwd ? basename(session.header.cwd) : '工作区未连接',
              list,
              skill: buildSkillDetail({ receipt, view: definition, skillName, listEntry, lineage, validation }),
            })
            return
          }








          if (method === 'POST' && url.pathname === '/skill-trace/preferences') {
            const body = await readBody(req)
            // v0.6 §7：一级页面只有两个。白名单必须和 `preference-store.mjs` 的
            // `DEFAULT_VIEWS` 一致，否则客户端会挑一个宿主随后归零的页面。
            if (!['current', 'installed'].includes(body.defaultView)) {
              throw new RequestError('默认页面只能是「本次 Skill」或「已安装 Skill」，这次请求里的值无法识别。请刷新页面后重试。')
            }
            const preferences = await preferenceStore.write({ defaultView: body.defaultView })
            sendJson(res, 200, { ok: true, preferences })
            return
          }








          // v0.7 §28：中文阅读版的读与删。
          //
          // 这一对路由**不要求 sessionId**：中文阅读版是跨会话的资产，键是
          // skillName + sourceSha256 + targetLanguage，让会话出现在请求里只会暗示
          // 它跟会话有关 —— 而"退出 DSH 就没了"正是这一版要修掉的事。
          // 访问边界仍然是函数开头那条：只允许本机。
          if (method === 'GET' && url.pathname === '/skill-trace/translation') {
            const skillName = requiredSkillName(url.searchParams.get('skillName'))
            const sourceSha256 = requiredSourceSha256(url.searchParams.get('sourceSha256'))
            const targetLanguage = optionalTargetLanguage(url.searchParams.get('targetLanguage'))
            const record = await translationStore.read({ skillName, sourceSha256, targetLanguage })
            sendJson(res, 200, {
              ok: true,
              skillName,
              sourceSha256,
              targetLanguage,
              // 指纹对不上就是**没有**，不回一份"旧了一点"的译文。
              translation: record ? {
                translation: record.translation,
                chunkCount: record.chunkCount,
                fallbackChunks: record.fallbackChunks,
                fallbackReasons: record.fallbackReasons,
                model: record.model,
                truncated: record.truncated === true,
                savedAt: record.updatedAt,
              } : null,
            })
            return
          }

          if (method === 'DELETE' && url.pathname === '/skill-trace/translation') {
            const skillName = requiredSkillName(url.searchParams.get('skillName'))
            const sourceSha256 = requiredSourceSha256(url.searchParams.get('sourceSha256'))
            const targetLanguage = optionalTargetLanguage(url.searchParams.get('targetLanguage'))
            const existing = await translationStore.read({ skillName, sourceSha256, targetLanguage })
            // 精确到三个字段：没有"清空这个 Skill 的所有译文"这种模糊删除。
            await translationStore.delete({ skillName, sourceSha256, targetLanguage })
            sendJson(res, 200, { ok: true, skillName, sourceSha256, targetLanguage, deleted: Boolean(existing) })
            return
          }

          // v0.7 §15 / §17：复刻。
          //
          // 整个产品里唯一会写盘的动作，所以规矩最多：只读源、只写副本、不覆盖、写完回读、
          // 再问 registry 这个新 Skill 到底有没有被看见。任何一步对不上都不算成功。
          if (method === 'POST' && url.pathname === '/skill-trace/clone') {
            const outcome = await handleClone(await readBody(req))
            sendJson(res, outcome.status, outcome.body)
            return
          }

          // v0.8：唯一新增的一条路由。血缘不在这里 —— 它是 Skill 的基础事实，随
          // `/skill-trace/skill` 回；只有差异是真的要重算（两侧解析 + 行级对比）才值得一条路由。
          if (method === 'GET' && url.pathname === '/skill-trace/diff') {
            const outcome = await handleDiff(url.searchParams)
            sendJson(res, outcome.status, outcome.body)
            return
          }

          // v0.9.1：对话式修改。这是产品里第二条「不是纯读」的路由（第一条是复刻），
          // 但它**不写文件**：只把「改前」记进内存，再用当前会话的 Agent 发一条带协议的修改任务。
          // 用户点「交给 Agent」这个动作本身就是授权 —— 插件不是偷偷替用户说话。
          // 真正的写入由 Agent 用 DSH 原生文件工具完成，走 DSH 自己的权限与审批。
          if (method === 'POST' && url.pathname === '/skill-trace/modify') {
            const outcome = await handleModify(await readBody(req))
            sendJson(res, outcome.status, outcome.body)
            return
          }

          sendJson(res, 404, { ok: false, error: 'not found' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          // 新写的校验抛 `RequestError`，状态码随对象走。下面这条正则只服务那批还没有
          // 改成 `RequestError` 的旧错误（`readBody` 的两句 + 收据/搜索那几个）——
          // **不要再往这条正则里加词**：它的存在会逼着消息写成字段名（见 `RequestError`）。
          const status = error instanceof RequestError
            ? error.status
            : (/必填|无效|不能为空|只允许|过大|超限|不受支持|不一致|合法 JSON|状态无效|学习笔记|验证结果|实际观察|成功加载|本地收据不存在|重复会话|输出引用不存在/.test(message) ? 400 : 500)
          sendJson(res, status, { ok: false, error: message })
        }
      },
    }

    webCtx.effect(() => {
      const unregister = webCtx.webServer.register(route)
      console.log('[dsh-skill-trace] host ready')
      return async () => {
        unregister()
        await pruneTask
        await Promise.allSettled([...queues.values()])
        queues.clear()
        cache.clear()
        console.log('[dsh-skill-trace] host disposed')
      }
    }, 'dsh-skill-trace: observer, routes and store')
  })
}
