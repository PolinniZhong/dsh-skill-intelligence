import { basename, join } from 'node:path'
import {
  addOutputReference,
  buildViewModels,
  emptyReceipt,
  migrateReceipt,
  rebuildReceipt,
  reduceSessionEvent,
  setContinuityDecision,
  setLearningNote,
  setSourceSnapshots,
  setTraceRuntimeIdentity,
} from '../../core/trace-reducer.mjs'
import { buildCatalogView } from '../../core/catalog-view.mjs'
import { buildCatalogSnapshot, buildSourceSnapshots, loadSkillDefinition } from '../../core/source-snapshot.mjs'
import { createReceiptStore } from '../../storage/receipt-store.mjs'
import { createPreferenceStore } from '../../storage/preference-store.mjs'

export const name = 'dsh-skill-trace'

const OBSERVED_EVENT_TYPES = new Set(['step/start', 'step/end', 'turn/end', 'tool/call', 'tool/result'])

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
    outputReferences: receipt.outputReferences,
    learningNotes: receipt.learningNotes,
    continuity: receipt.continuity,
  }
}

export function shouldPersistReceipt(receipt) {
  return Boolean(
    receipt?.traceEvents?.length
    || receipt?.outputReferences?.length
    || receipt?.learningNotes?.length,
  )
}

export function apply(ctx, config = {}) {
  ctx.inject(['webServer', 'sessions', 'agents'], (webCtx) => {
    const dataRoot = typeof config.dataRoot === 'string' && config.dataRoot.trim() ? config.dataRoot.trim() : null
    const store = createReceiptStore(dataRoot ? join(dataRoot, 'receipts') : undefined)
    const preferenceStore = createPreferenceStore(dataRoot || undefined)
    const cache = new Map()
    const queues = new Map()
    const pruneTask = store.prune(shouldPersistReceipt).then((removed) => {
      if (removed > 0) console.log(`[dsh-skill-trace] removed ${removed} empty receipt file(s)`)
    }).catch((error) => console.error('[dsh-skill-trace] empty receipt cleanup failed', error))

    function enqueue(sessionId, work) {
      const previous = queues.get(sessionId) ?? Promise.resolve()
      const next = previous.catch(() => {}).then(work)
      queues.set(sessionId, next)
      return next.finally(() => {
        if (queues.get(sessionId) === next) queues.delete(sessionId)
      })
    }

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

    async function refreshFromLiveSession(sessionId) {
      const previous = await load(sessionId)
      const session = webCtx.sessions.get(sessionId)
      if (!session) {
        const receipt = previous.traceEvents.length > 0 ? previous : {
          ...previous,
          coverage: {
            ...previous.coverage,
            status: 'coverage-unknown',
            note: '当前会话不在运行时内存中；只能展示已保存的最小收据。',
          },
        }
        cache.set(sessionId, receipt)
        return receipt
      }
      let receipt = rebuildReceipt(sessionId, session.events, previous)
      const { registry, liveAgent, cwd } = registryContext(sessionId)
      if (registry) {
        const sourceSnapshots = await buildSourceSnapshots(registry, receipt, cwd, { scope: liveAgent })
        receipt = setSourceSnapshots(receipt, sourceSnapshots)
      }
      cache.set(sessionId, receipt)
      return receipt
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
        let receipt = reduceSessionEvent(current, event)
        if (event.type === 'tool/result') {
          const loaded = receipt.traceEvents.find((trace) => trace.resultSeq === event.seq && trace.status === 'loaded')
          if (loaded) receipt = await captureRuntimeIdentity(receipt, sessionId, [loaded])
        }
        cache.set(sessionId, receipt)
        if (event.type === 'tool/call' || event.type === 'tool/result' || event.type === 'turn/end') await syncReceipt(receipt)
      })
    })

    webCtx.on('session/flush', (session) => {
      const sessionId = String(session.id)
      return enqueue(sessionId, async () => {
        const previous = await load(sessionId)
        let receipt = rebuildReceipt(sessionId, session.events, previous)
        const previousLoaded = new Set((previous.traceEvents ?? []).filter((trace) => trace.status === 'loaded').map((trace) => trace.eventId))
        const newTraces = receipt.traceEvents.filter((trace) => trace.status === 'loaded' && !previousLoaded.has(trace.eventId))
        receipt = await captureRuntimeIdentity(receipt, sessionId, newTraces)
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

          if (method === 'GET' && url.pathname === '/skill-trace/catalog') {
            const sessionId = requiredSessionId(url.searchParams.get('sessionId'))
            const selectedSkillName = url.searchParams.has('skillName') ? requiredSkillName(url.searchParams.get('skillName')) : ''
            const selectedEntryId = optionalEntryId(url.searchParams.get('entryId'))
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
              catalog: buildCatalogView({ catalogSnapshot, receipts, selectedSkillName, selectedEntryId, selectedDefinition, warningCount }),
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
            sendJson(res, 200, {
              ok: true,
              sessionId,
              skillName,
              record: {
                receiptId: receipt.receiptId,
                updatedAt: receipt.updatedAt,
                coverage: receipt.coverage,
                summary: buildViewModels(receipt).receipt.summary,
                note: receipt.learningNotes?.find((item) => item.skillName === skillName) ?? null,
              },
            })
            return
          }

          if (method === 'POST' && url.pathname === '/skill-trace/preferences') {
            const body = await readBody(req)
            if (!['receipt', 'map'].includes(body.defaultView)) throw new Error('defaultView 无效')
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

          if (method === 'DELETE' && url.pathname === '/skill-trace/receipt') {
            const body = await readBody(req)
            const sessionId = requiredSessionId(body.sessionId)
            await enqueue(sessionId, async () => {
              cache.delete(sessionId)
              await store.delete(sessionId)
            })
            sendJson(res, 200, { ok: true })
            return
          }

          sendJson(res, 404, { ok: false, error: 'not found' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status = /必填|无效|不能为空|只允许|过大|合法 JSON|状态无效|学习笔记|成功加载/.test(message) ? 400 : 500
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
