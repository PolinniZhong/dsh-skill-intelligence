/**
 * V1.0 §22.4：一次评测运行**条件**与**活动汇总**的唯一入口。
 *
 * 这两个东西都来自会话日志里的事件，而日志里的数据比一次评测需要的多得多：`request/header`
 * 事件里带着整份工具清单与 `maxTokens`，`tool/call` 事件里带着完整的工具参数。这个模块的
 * 全部职责就是**只取那几个只读元数据字段**，其余一个字节都不许带出去 ——
 * `FR-EVAL-007`（模型与 Provider 只读元数据、不读 prompt 正文与工具参数结果）与
 * `FR-EVAL-010`（Use 段只报工具活动的元数据）都靠这一层兑现。
 *
 * 三条纪律：
 *   1. **缺就是缺**：读不到写 `unavailable`，不猜、不用默认值顶替。
 *   2. **不改写历史**：`turn` / `step` 是日志顺序游标，不是时间，也不是「第几轮」。
 *   3. **纯函数**：没有时钟、没有随机数、没有 I/O —— 传进来的事件数组决定一切。
 */

/** 模型的实验条件来自这两类事件；顺序固定，永远是「后者覆盖前者」。 */
export const RUN_CONDITION_EVENT_TYPES = ['request/header', 'request/context']

/** 缺项的字面量。全项目只有这一个写法（`FR-EVAL-006`）。 */
export const RUN_UNAVAILABLE = 'unavailable'

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function dataOf(event) {
  return event && typeof event === 'object' && event.data !== null && typeof event.data === 'object' ? event.data : null
}

function seqOf(event) {
  return Number.isSafeInteger(event?.seq) ? event.seq : null
}

/**
 * 从会话事件里取模型、Provider、推理档位与上下文窗口。
 *
 * 取**最后一条** `request/context`（它带着 `provider` / `model` / `contextWindow`）与
 * 最后一条 `request/header`（`data.header.config` 里的 `reasoningEffort`）—— 一次会话里模型
 * 可能被换过，运行记录要记的是**运行到此刻**的条件，而不是第一次的条件。
 *
 * @param events 会话事件（日志顺序）。
 * @param options.untilSeq 只看这个 seq 之前（含）的事件；缺省看到底。
 */
export function readRunConditions(events = [], options = {}) {
  const list = Array.isArray(events) ? events : []
  const until = Number.isSafeInteger(options.untilSeq) ? options.untilSeq : Infinity
  const conditions = {
    provider: RUN_UNAVAILABLE,
    model: RUN_UNAVAILABLE,
    reasoningEffort: RUN_UNAVAILABLE,
    contextWindow: RUN_UNAVAILABLE,
    conditionSeq: null,
    capturedAt: null,
  }
  for (const event of list) {
    if (!event || !RUN_CONDITION_EVENT_TYPES.includes(event.type)) continue
    const seq = seqOf(event)
    if (seq !== null && seq > until) continue
    const data = dataOf(event)
    if (!data) continue
    // `request/header` 的形状是 `data.header.config`；`request/context` 直接把四个字段摆在 `data` 上。
    const config = data.header && typeof data.header === 'object' && data.header.config && typeof data.header.config === 'object'
      ? data.header.config
      : data
    const provider = text(config.provider)
    const model = text(config.model)
    const reasoningEffort = text(config.reasoningEffort)
    if (provider) conditions.provider = provider
    if (model) conditions.model = model
    if (reasoningEffort) conditions.reasoningEffort = reasoningEffort
    if (Number.isFinite(data.contextWindow)) conditions.contextWindow = data.contextWindow
    if (seq !== null) conditions.conditionSeq = seq
    if (Number.isSafeInteger(event.time)) conditions.capturedAt = event.time
  }
  return conditions
}

/**
 * 这次运行的日志游标：最后一个带 `seq` 的事件，以及它经过的 `turn` / `step`。
 * **它排序、不解释** —— 界面不许把它说成时间或者「第几轮」。
 */
export function readRunCursor(events = []) {
  const list = Array.isArray(events) ? events : []
  const cursor = { seq: null, turn: null, step: null, startedAt: null }
  for (const event of list) {
    const seq = seqOf(event)
    if (seq === null) continue
    cursor.seq = seq
    const data = dataOf(event)
    if (Number.isSafeInteger(data?.turn)) cursor.turn = data.turn
    if (Number.isSafeInteger(data?.step)) cursor.step = data.step
    if (cursor.startedAt === null && Number.isSafeInteger(event.time)) cursor.startedAt = event.time
    // `turn/start` 与 `turn/end` 把 turn 摆在 data 里；`step/*` 把两者都摆着。
    if (Number.isSafeInteger(event.turn)) cursor.turn = event.turn
    if (Number.isSafeInteger(event.step)) cursor.step = event.step
  }
  return cursor
}

/**
 * 工具活动的**汇总**：只数名字与次数。参数、结果、`callId`、耗时一概不取 ——
 * 「有工具活动」只能报成「有工具活动」，报不出「它用了这条指令」（`FR-EVAL-010` 的 Use 段）。
 *
 * @returns `{ activities: [{name, count}], total }`，按第一次出现的顺序排列。
 */
export function summarizeToolActivity(events = [], options = {}) {
  const list = Array.isArray(events) ? events : []
  const until = Number.isSafeInteger(options.untilSeq) ? options.untilSeq : Infinity
  const counts = new Map()
  for (const event of list) {
    if (!event || event.type !== 'tool/call') continue
    const seq = seqOf(event)
    if (seq !== null && seq > until) continue
    const name = text(dataOf(event)?.name)
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const activities = [...counts.entries()].map(([name, count]) => ({ name, count }))
  return { activities, total: activities.reduce((sum, entry) => sum + entry.count, 0) }
}

/**
 * 一次运行里「加载」那一段的协议事实：这个 Skill 的正文有没有被送进过对话。
 *
 * 判据只有一条 —— 会话收据里的 trace 事件。`loaded` 是**协议级**事实（正文进入了模型可见的
 * 对话），它**不证明模型采用了它**；`offered-only` 是目录里提供过，更弱。
 */
export function readLoadEvidence(receipt, skillName) {
  const traces = Array.isArray(receipt?.traceEvents) ? receipt.traceEvents : []
  const name = text(skillName)
  const mine = name ? traces.filter((trace) => trace?.skillName === name) : []
  const loaded = mine.filter((trace) => trace?.status === 'loaded')
  const offered = mine.filter((trace) => trace?.status === 'offered' || trace?.status === 'published')
  const first = loaded[0] ?? null
  if (loaded.length > 0) {
    return {
      status: 'loaded',
      seq: Number.isSafeInteger(first?.resultSeq) ? first.resultSeq : (Number.isSafeInteger(first?.callSeq) ? first.callSeq : null),
      callSeq: Number.isSafeInteger(first?.callSeq) ? first.callSeq : null,
      resultSeq: Number.isSafeInteger(first?.resultSeq) ? first.resultSeq : null,
    }
  }
  if (offered.length > 0) return { status: 'offered-only', seq: null, callSeq: null, resultSeq: null }
  // 没有 trace 与「确定没加载」是两件事：这里只说「拿不到」。
  return { status: RUN_UNAVAILABLE, seq: null, callSeq: null, resultSeq: null }
}
