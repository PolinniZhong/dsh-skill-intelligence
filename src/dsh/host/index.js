import { basename, join } from 'node:path'
import {
  addOutputReference,
  buildViewModels,
  carriesSkillEvidence,
  emptyReceipt,
  migrateReceipt,
  rebuildReceipt,
  reduceSessionEvent,
  removeOutputReference,
  setContinuityDecision,
  setLearningNote,
  setRuntimeLineage,
  setSourceSnapshots,
  setTraceRuntimeIdentity,
  setValidationResult,
} from '../../core/trace-reducer.mjs'
import { buildCatalogView } from '../../core/catalog-view.mjs'
import { readSessionEvents } from '../../core/session-log.mjs'
import { buildRuntimeGraph } from '../../core/runtime-graph.mjs'
import { computeRuntimeLayout } from '../../core/runtime-layout.mjs'
import { computeRuntimeLayoutWithElk } from '../../core/runtime-layout-elk.mjs'
import { inspectRuntimeEdge, inspectRuntimeNode } from '../../core/runtime-inspector.mjs'
import { buildSkillLoadIndex } from '../../core/runtime-alignment.mjs'
import { buildSkillRuntimeScopes, projectScopesOntoLayout } from '../../core/skill-runtime-scope.mjs'
import { buildReplayTimeline } from '../../core/runtime-replay.mjs'
import { buildFingerprintReservation } from '../../core/runtime-fingerprint.mjs'
import { buildCatalogSnapshot, buildSourceSnapshots, loadSkillDefinition } from '../../core/source-snapshot.mjs'
import { buildSkillDefinitionView, compareDefinitionToRun } from '../../core/skill-definition.mjs'
import {
  buildTranslationMessages,
  compareTranslationSource,
  DEFAULT_TRANSLATION_LANGUAGE,
  inspectTranslation,
  TRANSLATION_ERROR,
} from '../../core/skill-translation.mjs'
import { buildSessionSkillList, buildSkillDetail } from '../../core/skill-view-model.mjs'
import { createBackupStore } from '../../storage/backup-store.mjs'
import { createReceiptStore } from '../../storage/receipt-store.mjs'
import { createPreferenceStore } from '../../storage/preference-store.mjs'

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
const GRAPH_NODE_LIMIT = 400

/**
 * §21：运行流程是**高层阅读视图**，运行图谱是**低层调试视图**——两者的差别必须在
 * 密度上，而不只是同一张图挂上筛选。
 *
 * 实测一个真实会话（39 Turns / 644 Steps）在默认预算下渲染出 195 个节点，
 * 铺开成一面线条墙；而 §20.1/§21 要的是「Session → Turn → Capability → 主要 Runtime
 * Event」。所以运行流程的节点预算按阅读密度定，而不是按硬上限定。
 */
const FLOW_NODE_LIMIT = 16

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
const FLOW_TURN_LIMIT = 5

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
const FLOW_ROWS_PER_COLUMN = 5

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

function requiredSessionId(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 240) throw new Error('sessionId 必填')
  return value.trim()
}

function requiredSkillName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value.trim())) throw new Error('skillName 无效')
  return value.trim()
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

export function buildLocalArchive(receipts, exportedAt = Date.now(), skippedReceiptCount = 0) {
  const safeReceipts = receipts
    .map((receipt) => migrateReceipt(receipt, receipt?.sessionId))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map(publicReceipt)
  return {
    format: 'dsh-skill-trace.local-backup',
    formatVersion: 1,
    exportedAt,
    receiptCount: safeReceipts.length,
    skippedReceiptCount: Math.min(99, Math.max(0, Number(skippedReceiptCount) || 0)),
    receipts: safeReceipts,
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

function validateRestorableReceipt(value) {
  const sessionId = requiredSessionId(value?.sessionId)
  const receipt = migrateReceipt(value, sessionId)
  if (!Array.isArray(value.traceEvents) || value.traceEvents.length > 5000) throw new Error('备份收据事件无效')
  if (Array.isArray(value.runtimeEvents) && value.runtimeEvents.length > 5000) throw new Error('备份运行事件无效')
  if ((value.learningNotes?.length ?? 0) !== receipt.learningNotes.length) throw new Error('备份学习笔记无效')
  if ((value.validationResults?.length ?? 0) !== receipt.validationResults.length) throw new Error('备份验证结果无效')
  const outputIds = new Set()
  const outputRefs = new Set()
  for (const item of receipt.outputReferences) {
    const outputId = typeof item?.outputId === 'string' ? item.outputId : ''
    const relativeRef = typeof item?.relativeRef === 'string' ? item.relativeRef.trim() : ''
    if (!/^output:\d+$/.test(outputId) || outputIds.has(outputId)) throw new Error('备份输出引用无效')
    if (!relativeRef || relativeRef.length > 240 || relativeRef.startsWith('/') || relativeRef.startsWith('~') || relativeRef.includes('://') || relativeRef.split(/[\\/]+/).includes('..') || outputRefs.has(relativeRef)) throw new Error('备份输出引用无效')
    outputIds.add(outputId)
    outputRefs.add(relativeRef)
  }
  for (const trace of receipt.traceEvents) {
    if (!trace || typeof trace !== 'object' || !requiredSkillName(trace.skillName)) throw new Error('备份收据事件无效')
    if (!['requested', 'loaded', 'failed', 'unresolved', 'outcome-unknown', 'not-started'].includes(trace.status)) throw new Error('备份收据事件无效')
  }
  const canonical = publicReceipt(receipt)
  if (!shouldPersistReceipt(canonical)) throw new Error('备份收据没有可恢复数据')
  return canonical
}

function mergeMissingReceiptData(currentValue, backupValue) {
  const current = migrateReceipt(currentValue, backupValue.sessionId)
  const backup = migrateReceipt(backupValue, backupValue.sessionId)
  const noteSkills = new Set(current.learningNotes.map((item) => item.skillName))
  const validationSkills = new Set(current.validationResults.map((item) => item.skillName))
  const outputRefs = new Set(current.outputReferences.map((item) => item.relativeRef))
  const missingNotes = backup.learningNotes.filter((item) => !noteSkills.has(item.skillName))
  const missingValidations = backup.validationResults.filter((item) => !validationSkills.has(item.skillName))
  let nextOutputId = current.outputReferences.reduce((highest, item) => {
    const match = /^output:(\d+)$/.exec(item.outputId)
    return Math.max(highest, match ? Number(match[1]) : 0)
  }, 0)
  const missingOutputs = backup.outputReferences
    .filter((item) => !outputRefs.has(item.relativeRef))
    .map((item) => ({ ...item, outputId: `output:${++nextOutputId}` }))
  const currentContinuityConfirmed = current.continuity?.reviewState === 'human-confirmed'
  const backupContinuityConfirmed = backup.continuity?.reviewState === 'human-confirmed'
  const restoreContinuity = !currentContinuityConfirmed && backupContinuityConfirmed
  if (!missingNotes.length && !missingValidations.length && !missingOutputs.length && !restoreContinuity) {
    return { receipt: current, changed: false }
  }
  const traceIds = new Set(current.traceEvents.map((item) => item.eventId))
  const traceEvents = [...current.traceEvents, ...backup.traceEvents.filter((item) => !traceIds.has(item.eventId))]
  const continuity = restoreContinuity
    ? {
        ...current.continuity,
        status: backup.continuity.status,
        reviewState: backup.continuity.reviewState,
        confirmedAt: backup.continuity.confirmedAt,
      }
    : current.continuity
  const sourceSkills = new Set(current.sourceSnapshots.map((item) => item.skillName))
  const merged = migrateReceipt({
    ...current,
    updatedAt: Math.max(current.updatedAt ?? 0, backup.updatedAt ?? 0),
    traceEvents,
    sourceSnapshots: [...current.sourceSnapshots, ...backup.sourceSnapshots.filter((item) => !sourceSkills.has(item.skillName))],
    outputReferences: [...current.outputReferences, ...missingOutputs],
    learningNotes: [...current.learningNotes, ...missingNotes],
    validationResults: [...current.validationResults, ...missingValidations],
    continuity,
  }, backup.sessionId)
  const changed = merged.traceEvents.length !== current.traceEvents.length
    || merged.sourceSnapshots.length !== current.sourceSnapshots.length
    || merged.outputReferences.length !== current.outputReferences.length
    || merged.learningNotes.length !== current.learningNotes.length
    || merged.validationResults.length !== current.validationResults.length
    || merged.continuity.status !== current.continuity.status
  return { receipt: merged, changed }
}

export async function restoreMissingReceipts(receipts, store, cache = null, runExclusive = async (_sessionId, work) => work()) {
  const candidates = []
  const sessionIds = new Set()
  for (const receipt of receipts) {
    const sessionId = requiredSessionId(receipt?.sessionId)
    if (sessionIds.has(sessionId)) throw new Error('备份包含重复会话')
    sessionIds.add(sessionId)
    candidates.push(validateRestorableReceipt(receipt))
  }
  let restored = 0
  let merged = 0
  let skipped = 0
  for (const receipt of candidates) {
    const outcome = await runExclusive(receipt.sessionId, async () => {
      const current = await store.read(receipt.sessionId)
      if (!current) {
        await store.write(receipt)
        cache?.set(receipt.sessionId, receipt)
        return 'restored'
      }
      const next = mergeMissingReceiptData(current, receipt)
      if (!next.changed) return 'skipped'
      await store.write(next.receipt)
      cache?.set(receipt.sessionId, next.receipt)
      return 'merged'
    })
    if (outcome === 'restored') restored += 1
    else if (outcome === 'merged') merged += 1
    else skipped += 1
  }
  return { restored, merged, skipped, invalid: 0 }
}

export async function createVerifiedBackupForStore(store, backupStore, reason = 'manual', now = Date.now()) {
  const listed = await store.list()
  const receipts = []
  let warningCount = listed.warningCount
  for (const stored of listed.receipts) {
    try {
      receipts.push(migrateReceipt(stored, stored.sessionId))
    } catch {
      warningCount += 1
    }
  }
  return backupStore.create({ ...buildLocalArchive(receipts, now, warningCount), backupReason: reason }, reason)
}

export async function clearReceiptsWithSafetyBackup(store, backupStore) {
  const safetyBackup = await createVerifiedBackupForStore(store, backupStore, 'before-clear')
  const removedCount = await store.clear()
  return { removedCount, safetyBackup }
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
async function translateSkillDefinition({ llm, selection, skillName, definitionText, targetLanguage }) {
  const { BlockAssembler, createUserMessage } = await import('@deepseek-ai/dsh-llm')
  const built = buildTranslationMessages({ skillName, definitionText, targetLanguage })
  const messages = [createUserMessage({
    content: [{ type: 'text', text: built.messages[0].content }],
    source: { kind: 'dsh-skill-trace-translate' },
  })]
  const request = {
    provider: selection.provider,
    model: selection.model,
    messages,
    system: built.system,
    maxTokens: 8192,
  }
  if (selection.reasoningEffort) request.reasoningEffort = selection.reasoningEffort
  const assembler = new BlockAssembler()
  for await (const chunk of llm.stream(request)) assembler.push(chunk)
  const blocks = assembler.blocks()
  // 只取文本块。模型若返回 tool-call，那段内容不属于译文，忽略即可 —— 后面的结构校验
  // 会因为段落缺失而拒绝这份结果。
  return blocks.filter((block) => block.type === 'text').map((block) => block.text).join('')
}

export function apply(ctx, config = {}) {
  ctx.inject(['webServer', 'sessions', 'agents'], (webCtx) => {
    const dataRoot = typeof config.dataRoot === 'string' && config.dataRoot.trim() ? config.dataRoot.trim() : null
    const store = createReceiptStore(dataRoot ? join(dataRoot, 'receipts') : undefined)
    const backupStore = createBackupStore(dataRoot ? join(dataRoot, 'backups') : undefined)
    const preferenceStore = createPreferenceStore(dataRoot || undefined)
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

    async function createVerifiedBackup(reason = 'manual') {
      return createVerifiedBackupForStore(store, backupStore, reason)
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
          if (method === 'GET' && url.pathname === '/skill-trace/runtime') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const receipt = await enqueue(sessionId, () => receiptForRuntime(sessionId))
            const graph = buildRuntimeGraph(receipt)
            // §21: one renderer, two densities. The flow view stays quiet; the graph
            // view is allowed to be denser because its job is debugging.
            const detail = url.searchParams.get('detail') === 'graph' ? 'graph' : 'flow'
            const layoutWithMembers = await computeRuntimeLayoutWithElk(graph, {
              includeHiddenIds: false,
              nodeLimit: detail === 'graph' ? GRAPH_NODE_LIMIT : FLOW_NODE_LIMIT,
              turnNodeLimit: detail === 'graph' ? undefined : FLOW_TURN_LIMIT,
              maxRowsPerColumn: detail === 'graph' ? undefined : FLOW_ROWS_PER_COLUMN,
              compact: detail === 'graph',
            })
            sendJson(res, 200, {
              ok: true,
              sessionId,
              detail,
              graph: {
                modelVersion: graph.modelVersion,
                lineage: graph.lineage,
                stats: graph.stats,
                unlinked: graph.unlinked.slice(0, 20),
                nodeCount: graph.nodes.length,
                edgeCount: graph.edges.length,
              },
              // ELK orders within each layer while it is affordable; the placer keeps
              // the geometry so height stays bounded. Which engine ran is reported.
              //
              // Computed with members so the replay timeline can resolve an event to
              // the group that drew it; the member lists are then dropped from the
              // payload, which is what `includeMemberIds: false` did before.
              layout: stripMemberIds(layoutWithMembers),
              timeline: buildReplayTimeline(graph, layoutWithMembers, receipt.runtimeEvents),
              // §31: the reserved shape, not a derived fingerprint.
              fingerprint: buildFingerprintReservation(graph),
              // Which call loaded which Skill. Derived here, on the Host, because the
              // Skill name never comes from tool arguments; the graph node only ever
              // says "skill". Only unambiguous joins are reported.
              skillLoads: buildSkillLoadIndex(receipt, graph),
              // §十二：Scope 的画布表达。只有 observed/correlated 的成员会进入 inScopeNodeIds。
              scopes: projectScopesOntoLayout(buildSkillRuntimeScopes(receipt), layoutWithMembers),
            })
            return
          }

          // Inspector: one node or one edge at a time, so answering "why does this
          // line exist" never requires shipping the whole graph to the client.
          if (method === 'GET' && url.pathname === '/skill-trace/inspect') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const nodeId = optionalEntryId(url.searchParams.get('nodeId'))
            const edgeId = optionalEntryId(url.searchParams.get('edgeId'))
            if (!nodeId && !edgeId) throw new Error('nodeId 或 edgeId 必填')
            const receipt = await enqueue(sessionId, () => receiptForRuntime(sessionId))
            const graph = buildRuntimeGraph(receipt)
            const payload = edgeId
              ? inspectRuntimeEdge(graph, receipt.runtimeEvents, edgeId)
              : inspectRuntimeNode(graph, receipt.runtimeEvents, nodeId, { layout: computeRuntimeLayout(graph) })
            sendJson(res, 200, { ok: true, sessionId, ...payload })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/catalog') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const selectedSkillName = url.searchParams.has('skillName') ? requiredSkillName(url.searchParams.get('skillName')) : ''
            const selectedEntryId = optionalEntryId(url.searchParams.get('entryId'))
            const searchQuery = optionalSearchQuery(url.searchParams.get('query'))
            const { registry, liveAgent, session, cwd } = registryContext(sessionId)
            const [listed, catalogSnapshot] = await Promise.all([
              store.list(),
              registry && liveAgent
                ? buildCatalogSnapshot(registry, cwd, liveAgent)
                : Promise.resolve({ status: 'coverage-unknown', complete: false, observedAt: Date.now(), skills: [] }),
            ])
            const receipts = []
            let warningCount = listed.warningCount
            for (const stored of listed.receipts) {
              try {
                receipts.push(migrateReceipt(stored, stored.sessionId))
              } catch {
                warningCount += 1
              }
            }
            const selectedDefinition = selectedSkillName && registry && liveAgent
              ? await loadSkillDefinition(registry, selectedSkillName, cwd, liveAgent)
              : null
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: session?.header?.cwd ? basename(session.header.cwd) : '工作区未连接',
              catalog: buildCatalogView({ catalogSnapshot, receipts, selectedSkillName, selectedEntryId, selectedDefinition, warningCount, searchQuery }),
            })
            return
          }

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
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: session?.header?.cwd ? basename(session.header.cwd) : '工作区未连接',
              definition,
              observation: compareDefinitionToRun(receipt, skillName, definition),
            })
            return
          }

          // v0.6 §13：翻译。整条路径只读定义、只回一次结果。
          //
          // 这里刻意**不**落盘、不写 receipt、不动偏好文件：§12.4 要求译文只存在页面运行时
          // 内存里，退出插件即消失。所以响应之后宿主不再持有它，客户端刷新页面也就没有了。
          if (method === 'POST' && url.pathname === '/skill-trace/translate') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const skillName = requiredSkillName(body.skillName)
            const sourceSha256 = typeof body.sourceSha256 === 'string' ? body.sourceSha256.trim() : ''
            if (!sourceSha256) throw new Error('sourceSha256 必填')
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
            let translation = ''
            try {
              translation = await translateSkillDefinition({
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
            sendJson(res, 200, {
              ok: true,
              sessionId,
              workspaceLabel: session?.header?.cwd ? basename(session.header.cwd) : '工作区未连接',
              list,
              skill: buildSkillDetail({ receipt, view: definition, skillName, listEntry }),
            })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/history-note') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const skillName = requiredSkillName(url.searchParams.get('skillName'))
            const stored = await store.read(sessionId)
            const receipt = stored ? migrateReceipt(stored, sessionId) : null
            const note = receipt?.learningNotes?.find((item) => item.skillName === skillName) ?? null
            sendJson(res, 200, { ok: true, sessionId, skillName, note })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/history-receipt') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const skillName = requiredSkillName(url.searchParams.get('skillName'))
            const stored = await store.read(sessionId)
            if (!stored) {
              sendJson(res, 404, { ok: false, error: '本地收据不存在' })
              return
            }
            const receipt = migrateReceipt(stored, sessionId)
            const views = buildViewModels(receipt)
            sendJson(res, 200, {
              ok: true,
              sessionId,
              skillName,
              record: {
                receiptId: receipt.receiptId,
                createdAt: receipt.createdAt,
                updatedAt: receipt.updatedAt,
                coverage: receipt.coverage,
                summary: views.receipt.summary,
                learningCard: views.receipt.learningCards?.find((item) => item.skillName === skillName) ?? null,
                note: receipt.learningNotes?.find((item) => item.skillName === skillName) ?? null,
                validationResult: receipt.validationResults?.find((item) => item.skillName === skillName) ?? null,
                continuity: receipt.continuity,
              },
            })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/export') {
            sendJson(res, 409, { ok: false, error: 'Desktop 下载交付已停用，请使用可验证的本地备份' })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/backups') {
            const listed = await backupStore.list()
            sendJson(res, 200, { ok: true, backupDirectory: backupStore.root, ...listed })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/backups') {
            const backup = await createVerifiedBackup('manual')
            sendJson(res, 201, { ok: true, backup })
            return
          }

          if (method === 'GET' && url.pathname === '/skill-trace/backups/preview') {
            const { archive, backup } = await backupStore.read(url.searchParams.get('id'))
            const sessionIds = new Set()
            let invalid = 0
            for (const receipt of archive.receipts) {
              try {
                const sessionId = requiredSessionId(receipt?.sessionId)
                if (sessionIds.has(sessionId)) throw new Error('备份包含重复会话')
                sessionIds.add(sessionId)
                validateRestorableReceipt(receipt)
              } catch {
                invalid += 1
              }
            }
            sendJson(res, 200, { ok: true, backup, summary: { receiptCount: archive.receiptCount, invalidReceiptCount: invalid, canRestore: invalid === 0 } })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/backups/restore') {
            const body = await readBody(req)
            const { archive, backup } = await backupStore.read(body.backupId)
            const result = await restoreMissingReceipts(archive.receipts, store, cache, enqueue)
            sendJson(res, 200, { ok: true, backup, ...result })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/preferences') {
            const body = await readBody(req)
            if (!['skills', 'map'].includes(body.defaultView)) throw new Error('defaultView 无效')
            const preferences = await preferenceStore.write({ defaultView: body.defaultView })
            sendJson(res, 200, { ok: true, preferences })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/outputs') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const receipt = await enqueue(sessionId, async () => {
              const current = await refreshFromLiveSession(sessionId)
              const value = addOutputReference(current, body.relativeRef)
              cache.set(sessionId, value)
              await store.write(value)
              return value
            })
            sendJson(res, 201, { ok: true, receipt: publicReceipt(receipt), views: buildViewModels(receipt) })
            return
          }

          if (method === 'DELETE' && url.pathname === '/skill-trace/outputs') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const receipt = await enqueue(sessionId, async () => {
              const current = await refreshFromLiveSession(sessionId)
              const value = removeOutputReference(current, body.outputId)
              cache.set(sessionId, value)
              await syncReceipt(value)
              return value
            })
            sendJson(res, 200, { ok: true, receipt: publicReceipt(receipt), views: buildViewModels(receipt) })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/continuity') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const receipt = await enqueue(sessionId, async () => {
              const current = await refreshFromLiveSession(sessionId)
              const value = setContinuityDecision(current, body.status)
              cache.set(sessionId, value)
              await syncReceipt(value)
              return value
            })
            sendJson(res, 200, { ok: true, receipt: publicReceipt(receipt), views: buildViewModels(receipt) })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/learning-note') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const receipt = await enqueue(sessionId, async () => {
              const current = await refreshFromLiveSession(sessionId)
              const value = setLearningNote(current, body.skillName, {
                understanding: body.understanding,
                improvementIntent: body.improvementIntent,
                validationPlan: body.validationPlan,
              })
              cache.set(sessionId, value)
              await syncReceipt(value)
              return value
            })
            sendJson(res, 200, { ok: true, receipt: publicReceipt(receipt), views: buildViewModels(receipt) })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/validation-result') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const skillName = requiredSkillName(body.skillName)
            const receipt = await enqueue(sessionId, async () => {
              const stored = await store.read(sessionId)
              if (!stored) throw new Error('本地收据不存在')
              const current = migrateReceipt(stored, sessionId)
              const value = setValidationResult(current, skillName, {
                status: body.status,
                observedOutcome: body.observedOutcome,
                nextAction: body.nextAction,
              })
              cache.set(sessionId, value)
              await syncReceipt(value)
              return value
            })
            sendJson(res, 200, { ok: true, receipt: publicReceipt(receipt), views: buildViewModels(receipt) })
            return
          }

          if (method === 'DELETE' && url.pathname === '/skill-trace/receipt') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            const result = await enqueue(sessionId, async () => {
              const stored = await store.read(sessionId)
              if (!stored) return null
              const safetyBackup = await createVerifiedBackup('before-delete')
              cache.delete(sessionId)
              await store.delete(sessionId)
              return { removed: 1, safetyBackup }
            })
            if (!result) {
              sendJson(res, 404, { ok: false, error: '本地收据不存在' })
              return
            }
            sendJson(res, 200, { ok: true, ...result })
            return
          }

          if (method === 'DELETE' && url.pathname === '/skill-trace/receipts') {
            const { safetyBackup, removedCount } = await runMaintenance(async () => {
              const cleared = await clearReceiptsWithSafetyBackup(store, backupStore)
              cache.clear()
              return cleared
            })
            sendJson(res, 200, { ok: true, removedCount, safetyBackup })
            return
          }

          sendJson(res, 404, { ok: false, error: 'not found' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status = /必填|无效|不能为空|只允许|过大|超限|不受支持|不一致|合法 JSON|状态无效|学习笔记|验证结果|实际观察|成功加载|本地收据不存在|重复会话|输出引用不存在/.test(message) ? 400 : 500
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
