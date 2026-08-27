import { createHash } from 'node:crypto'

const SCHEMA_VERSION = 4
const DEPENDENCY_TYPES = ['network', 'model', 'mcp', 'script', 'permission']
const CONTINUITY_STATUSES = ['unassessed', 'manual', 'partial', 'blocked']
const LEARNING_FIELDS = ['understanding', 'improvementIntent', 'validationPlan']

function cleanString(value, maxLength = 160) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function safeSkillName(value) {
  const name = cleanString(value, 128)
  return /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,127}$/.test(name) ? name : ''
}

function safeHash(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value) ? value : null
}

function normalizeRuntimeIdentity(value) {
  return value && typeof value === 'object'
    && typeof value.provider === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,79}$/.test(value.provider)
    && safeHash(value.sourceFingerprint)
    ? {
        provider: value.provider,
        sourceFingerprint: safeHash(value.sourceFingerprint),
        capturedAt: Number.isSafeInteger(value.capturedAt) ? value.capturedAt : null,
      }
    : null
}

function normalizeSourceSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const skillName = safeSkillName(value.skillName)
  if (!skillName) return null
  const provider = typeof value.provider === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,79}$/.test(value.provider) ? value.provider : null
  const safeSource = typeof value.source === 'string' && value.source.length <= 240 && !value.source.startsWith('/') && !value.source.startsWith('~') && !value.source.startsWith('file:') ? value.source : null
  const identity = normalizeRuntimeIdentity(value.runtimeIdentity)
  return {
    skillName,
    snapshotComplete: value.snapshotComplete === true,
    definitionAvailable: value.definitionAvailable === true,
    provider,
    source: safeSource,
    sourceFingerprint: safeHash(value.sourceFingerprint),
    runtimeIdentity: identity,
    invocation: value.invocation && typeof value.invocation === 'object' ? {
      modelInvocable: value.invocation.modelInvocable === true,
      userInvocable: value.invocation.userInvocable === true,
    } : null,
    observedInstructionSha256: Array.isArray(value.observedInstructionSha256) ? [...new Set(value.observedInstructionSha256.map(safeHash).filter(Boolean))] : [],
    currentInstructionSha256: safeHash(value.currentInstructionSha256),
    match: ['match', 'mismatch', 'unavailable'].includes(value.match) ? value.match : 'unavailable',
    checkedAt: Number.isSafeInteger(value.checkedAt) ? value.checkedAt : Date.now(),
  }
}

function hasSensitiveLearningContent(value) {
  return /(?:^|\s)(?:~\/|file:\/\/|\/(?!\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._~ -]+)+|[A-Za-z]:\\)/i.test(value)
    || /https?:\/\/[^/\s:@]+:[^@\s]+@/i.test(value)
    || /(?:api[_ -]?key|access[_ -]?token|cookie|password)\s*[:=]\s*["']?[A-Za-z0-9_./+-]{8,}/i.test(value)
}

function safeLearningText(value, { strict = true } = {}) {
  if (strict && typeof value === 'string' && value.trim().length > 500) throw new Error('学习笔记单项不能超过 500 字')
  const text = cleanString(value, 500)
  if (!text) return ''
  if (hasSensitiveLearningContent(text)) {
    if (strict) throw new Error('学习笔记不能包含绝对路径、带凭据链接或密钥值')
    return ''
  }
  return text
}

function normalizeLearningNote(value, { strict = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const skillName = safeSkillName(value.skillName)
  if (!skillName) return null
  const fields = Object.fromEntries(LEARNING_FIELDS.map((field) => [field, safeLearningText(value[field], { strict })]))
  if (LEARNING_FIELDS.every((field) => !fields[field])) return null
  return {
    skillName,
    ...fields,
    authorship: 'human',
    updatedAt: Number.isSafeInteger(value.updatedAt) ? value.updatedAt : Date.now(),
  }
}

function parseArguments(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || value.length > 64 * 1024) return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function resultBlock(event) {
  const content = event?.data?.message?.content
  if (!Array.isArray(content)) return null
  return content.find((block) => block?.type === 'tool-result') ?? null
}

function safeErrorCode(value) {
  const code = cleanString(value, 64)
  return /^[A-Z0-9_-]+$/.test(code) ? code : 'SKILL_LOAD_FAILED'
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function toolResultText(block) {
  if (typeof block?.content === 'string') return block.content
  if (!Array.isArray(block?.content)) return ''
  return block.content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
}

function skillInstructionsFromResult(block) {
  const text = toolResultText(block)
  if (!text || text.length > 2 * 1024 * 1024) return ''
  const open = '<skill_instructions>\n'
  const close = '\n</skill_instructions>'
  const start = text.indexOf(open)
  if (start < 0) return ''
  const end = text.indexOf(close, start + open.length)
  return end < 0 ? '' : text.slice(start + open.length, end)
}

function safeStepText(value) {
  const raw = cleanString(value, 500)
  if (!raw || /(?:^|\s)(?:~\/|\/[A-Za-z0-9._-]|[A-Za-z]:\\)/.test(raw)) return ''
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[`*>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function extractContinuityCandidate(skillName, instructions) {
  const steps = []
  for (const line of instructions.split(/\r?\n/)) {
    const match = line.match(/^\s{0,3}\d{1,2}[.)]\s+(.+)$/)
    const title = safeStepText(match?.[1])
    if (!title || steps.some((item) => item.title === title)) continue
    steps.push({
      order: steps.length + 1,
      title,
      skillName,
      evidenceType: 'ordered-list-candidate',
    })
    if (steps.length >= 5) break
  }

  const dependencyMatchers = {
    network: /https?:\/\/|\b(?:network|online|web search|browse|curl|fetch)\b|联网|网络|浏览器|搜索网页/i,
    model: /\b(?:llm|model|embedding|vision model)\b|大模型|语言模型|视觉模型/i,
    mcp: /\bmcp\b|model context protocol/i,
    script: /\b(?:script|python|node(?:\.js)?|bash|shell|command)\b|脚本|命令行|终端/i,
    permission: /\b(?:permission|approval|authorize|credential|api[ -]?key)\b|权限|批准|授权|凭据/i,
  }
  const clauses = instructions.split(/(?:\r?\n|[.;；。]|\bbut\b|\bhowever\b|但是|但)/i).map((item) => item.trim()).filter(Boolean)
  const dependencySignals = DEPENDENCY_TYPES
    .filter((type) => clauses.some((clause) => {
      if (!dependencyMatchers[type].test(clause)) return false
      return !/(?:does\s+not|doesn't|do\s+not|don't)\s+(?:explicitly\s+)?require|\bnot\s+required\b|\bno\b.{0,80}\brequired\b|无需|不需要|不依赖|不要求/i.test(clause)
    }))
    .map((type) => ({ type, evidenceType: 'keyword-signal' }))

  return { steps, dependencySignals }
}

function automaticContinuity(traceEvents, previous = null) {
  const loaded = traceEvents.filter((trace) => trace.status === 'loaded')
  const methodNames = [...new Set(loaded.map((trace) => trace.skillName))]
  const steps = []
  for (const trace of loaded) {
    for (const step of trace.continuityCandidate?.steps ?? []) {
      if (!steps.some((item) => item.skillName === step.skillName && item.title === step.title)) {
        steps.push({ ...step, order: steps.length + 1 })
      }
      if (steps.length >= 5) break
    }
    if (steps.length >= 5) break
  }
  const signaled = new Set(loaded.flatMap((trace) => (trace.continuityCandidate?.dependencySignals ?? []).map((item) => item.type)))
  const confirmed = previous?.reviewState === 'human-confirmed' && CONTINUITY_STATUSES.includes(previous.status)
  return {
    status: confirmed ? previous.status : 'unassessed',
    reviewState: confirmed ? 'human-confirmed' : 'candidate',
    confirmedAt: confirmed && Number.isSafeInteger(previous.confirmedAt) ? previous.confirmedAt : null,
    goal: methodNames.length
      ? `继续本次会话中 ${methodNames.join('、')} 的已观察方法。`
      : '',
    limitations: [
      '候选步骤来自本次实际返回的 Skill 指令结构，不代表 Agent 已经遵循。',
      '依赖信号只提示需要核对，不等于该依赖必需、可用或支持完全离线。',
    ],
    steps,
    dependencies: DEPENDENCY_TYPES.map((type) => ({
      type,
      required: signaled.has(type) ? 'candidate' : 'unknown',
      availability: 'unknown',
      evidenceType: signaled.has(type) ? 'keyword-signal' : 'none',
    })),
    provenance: {
      type: 'observed-skill-instructions-structure',
      methodCount: methodNames.length,
      stepCount: steps.length,
    },
  }
}

function statusCounterKey(status) {
  if (status === 'outcome-unknown') return 'outcomeUnknownCount'
  if (status === 'not-started') return 'notStartedCount'
  return `${status}Count`
}

export function emptyReceipt(sessionId, now = Date.now()) {
  const safeSessionId = cleanString(sessionId, 240)
  return {
    schemaVersion: SCHEMA_VERSION,
    receiptId: `receipt:${safeSessionId}`,
    sessionId: safeSessionId,
    createdAt: now,
    updatedAt: now,
    coverage: {
      observer: 'skill-tool-event-contract',
      status: 'verified-standard-contract',
      verifiedConsumers: ['@deepseek-ai/dsh-tool-skill@0.1.1-rc.2', 'dsh-skillflux@0.2.0#962264b'],
      consumerIdentity: 'unavailable-in-session-event',
      note: '标准 skill 工具事件已在官方 Consumer 与 SkillFlux 0.2.0 隔离验证；单条事件仍不包含 Consumer 身份。',
    },
    activity: {
      turns: [],
      steps: [],
      lastObservedSeq: null,
    },
    traceEvents: [],
    sourceSnapshots: [],
    humanAssessment: {
      value: 'pending',
      confirmedAt: null,
    },
    outputReferences: [],
    learningNotes: [],
    continuity: {
      status: 'unassessed',
      reviewState: 'candidate',
      confirmedAt: null,
      goal: '',
      limitations: ['尚未人工确认能否按同一方法继续。'],
      steps: [],
      dependencies: DEPENDENCY_TYPES.map((type) => ({
        type,
        required: 'unknown',
        availability: 'unknown',
        evidenceType: 'none',
      })),
      provenance: {
        type: 'none',
        methodCount: 0,
        stepCount: 0,
      },
    },
  }
}

export function migrateReceipt(value, sessionId) {
  if (!value || typeof value !== 'object') return emptyReceipt(sessionId)
  const createdAt = Number.isSafeInteger(value.createdAt) ? value.createdAt : Date.now()
  const base = emptyReceipt(sessionId, createdAt)
  const traceEvents = Array.isArray(value.traceEvents) ? value.traceEvents.map((trace) => ({
    ...trace,
    sessionId: base.sessionId,
    consumer: 'skill-tool',
    consumerIdentity: 'unavailable',
    coverage: 'observed-tool-contract',
    runtimeIdentity: normalizeRuntimeIdentity(trace.runtimeIdentity),
  })) : []
  const loadedSkillNames = new Set(traceEvents.filter((trace) => trace.status === 'loaded').map((trace) => trace.skillName))
  const learningNotes = Array.isArray(value.learningNotes)
    ? value.learningNotes.map((note) => normalizeLearningNote(note)).filter((note) => note && loadedSkillNames.has(note.skillName))
    : []
  return {
    ...base,
    updatedAt: Number.isSafeInteger(value.updatedAt) ? value.updatedAt : createdAt,
    activity: value.activity && typeof value.activity === 'object' ? value.activity : base.activity,
    traceEvents,
    sourceSnapshots: Array.isArray(value.sourceSnapshots) ? value.sourceSnapshots.map(normalizeSourceSnapshot).filter(Boolean) : [],
    humanAssessment: value.humanAssessment && typeof value.humanAssessment === 'object' ? value.humanAssessment : base.humanAssessment,
    outputReferences: Array.isArray(value.outputReferences) ? value.outputReferences : [],
    learningNotes,
    continuity: automaticContinuity(traceEvents, value.continuity),
  }
}

function addUniqueNumber(items, value) {
  if (!Number.isSafeInteger(value) || items.includes(value)) return items
  return [...items, value].sort((a, b) => a - b)
}

function withObservedActivity(receipt, event) {
  const data = event?.data ?? {}
  return {
    ...receipt,
    updatedAt: Number.isSafeInteger(event?.time) ? event.time : Date.now(),
    activity: {
      turns: addUniqueNumber(receipt.activity.turns, data.turn),
      steps: event?.type === 'step/start'
        ? [...receipt.activity.steps, { turn: data.turn, step: data.step }].filter((item, index, all) => all.findIndex((other) => other.turn === item.turn && other.step === item.step) === index)
        : receipt.activity.steps,
      lastObservedSeq: Number.isSafeInteger(event?.seq) ? event.seq : receipt.activity.lastObservedSeq,
    },
  }
}

function unresolvedAtBoundary(receipt, event) {
  if (event.type !== 'step/end' && event.type !== 'turn/end') return receipt
  const now = Number.isSafeInteger(event.time) ? event.time : Date.now()
  let changed = false
  const traceEvents = receipt.traceEvents.map((trace) => {
    if (trace.status !== 'requested') return trace
    const sameStep = event.type === 'step/end' && trace.turn === event.data?.turn && trace.step === event.data?.step
    const sameTurn = event.type === 'turn/end' && trace.turn === event.data?.turn
    if (!sameStep && !sameTurn) return trace
    changed = true
    return { ...trace, status: 'unresolved', resolvedAt: now }
  })
  return changed ? { ...receipt, traceEvents, updatedAt: now } : receipt
}

export function reduceSessionEvent(source, event) {
  let receipt = withObservedActivity(source, event)
  const data = event?.data ?? {}

  if (event?.type === 'tool/call' && data.name === 'skill') {
    const args = parseArguments(data.arguments)
    const skillName = safeSkillName(args?.name)
    const callId = cleanString(data.callId, 240)
    if (!skillName || !callId) return receipt
    if (receipt.traceEvents.some((trace) => trace.callId === callId)) return receipt
    const requestedAt = Number.isSafeInteger(event.time) ? event.time : Date.now()
    receipt = {
      ...receipt,
      traceEvents: [...receipt.traceEvents, {
        eventId: `${receipt.sessionId}:${callId}`,
        sessionId: receipt.sessionId,
        turn: Number.isSafeInteger(data.turn) ? data.turn : null,
        step: Number.isSafeInteger(data.step) ? data.step : null,
        skillName,
        status: 'requested',
        callId,
        callSeq: Number.isSafeInteger(event.seq) ? event.seq : null,
        resultSeq: null,
        requestedAt,
        resolvedAt: null,
        consumer: 'skill-tool',
        consumerIdentity: 'unavailable',
        coverage: 'observed-tool-contract',
        errorCode: null,
        evidenceFingerprint: null,
        continuityCandidate: null,
        runtimeIdentity: null,
      }],
    }
    return receipt
  }

  if (event?.type === 'tool/result') {
    const block = resultBlock(event)
    const callId = cleanString(event?.data?.message?.source?.callId || block?.toolCallId, 240)
    if (!callId) return receipt
    const target = receipt.traceEvents.find((trace) => trace.callId === callId && trace.status === 'requested')
    if (!target) return receipt
    const failed = block?.isError === true || Boolean(data.error)
    const errorCode = failed ? safeErrorCode(data.error?.code) : null
    const status = errorCode === 'TOOL_OUTCOME_UNKNOWN'
      ? 'outcome-unknown'
      : errorCode === 'TOOL_NOT_STARTED'
        ? 'not-started'
        : failed ? 'failed' : 'loaded'
    const resultText = failed ? '' : toolResultText(block)
    const instructions = failed ? '' : skillInstructionsFromResult(block)
    const evidenceFingerprint = instructions
      ? { algorithm: 'sha256', scope: 'skill-instructions', value: sha256(instructions) }
      : resultText ? { algorithm: 'sha256', scope: 'rendered-tool-result', value: sha256(resultText) } : null
    const continuityCandidate = instructions ? extractContinuityCandidate(target.skillName, instructions) : null
    const resolvedAt = Number.isSafeInteger(event.time) ? event.time : Date.now()
    receipt = {
      ...receipt,
      traceEvents: receipt.traceEvents.map((trace) => trace.callId === callId ? {
        ...trace,
        status,
        resultSeq: Number.isSafeInteger(event.seq) ? event.seq : null,
        resolvedAt,
        errorCode,
        evidenceFingerprint,
        continuityCandidate,
      } : trace),
    }
    return { ...receipt, continuity: automaticContinuity(receipt.traceEvents, receipt.continuity) }
  }

  return unresolvedAtBoundary(receipt, event)
}

export function rebuildReceipt(sessionId, events, previous = null) {
  const manual = migrateReceipt(previous, sessionId)
  let receipt = emptyReceipt(sessionId, manual.createdAt)
  for (const event of Array.isArray(events) ? events : []) receipt = reduceSessionEvent(receipt, event)
  const previousIdentities = new Map(manual.traceEvents.filter((trace) => trace.runtimeIdentity).map((trace) => [trace.eventId, trace.runtimeIdentity]))
  const traceEvents = receipt.traceEvents.map((trace) => previousIdentities.has(trace.eventId) ? { ...trace, runtimeIdentity: previousIdentities.get(trace.eventId) } : trace)
  return {
    ...receipt,
    traceEvents,
    humanAssessment: manual.humanAssessment ?? receipt.humanAssessment,
    outputReferences: Array.isArray(manual.outputReferences) ? manual.outputReferences : [],
    learningNotes: Array.isArray(manual.learningNotes) ? manual.learningNotes : [],
    sourceSnapshots: Array.isArray(manual.sourceSnapshots) ? manual.sourceSnapshots : [],
    continuity: automaticContinuity(traceEvents, manual.continuity),
  }
}

export function setContinuityDecision(receipt, status, now = Date.now()) {
  if (!CONTINUITY_STATUSES.includes(status)) throw new Error('方法延续状态无效')
  return {
    ...receipt,
    updatedAt: now,
    continuity: {
      ...receipt.continuity,
      status,
      reviewState: status === 'unassessed' ? 'candidate' : 'human-confirmed',
      confirmedAt: status === 'unassessed' ? null : now,
    },
  }
}

export function setSourceSnapshots(receipt, sourceSnapshots, now = Date.now()) {
  return {
    ...receipt,
    updatedAt: now,
    sourceSnapshots: Array.isArray(sourceSnapshots) ? sourceSnapshots.map(normalizeSourceSnapshot).filter(Boolean) : [],
  }
}

export function setTraceRuntimeIdentity(receipt, eventId, runtimeIdentity, now = Date.now()) {
  const identity = normalizeRuntimeIdentity(runtimeIdentity)
  if (!identity) return receipt
  let changed = false
  const traceEvents = receipt.traceEvents.map((trace) => {
    if (trace.eventId !== eventId || trace.status !== 'loaded') return trace
    changed = true
    return { ...trace, runtimeIdentity: identity }
  })
  return changed ? { ...receipt, updatedAt: now, traceEvents } : receipt
}

export function setLearningNote(receipt, skillName, values, now = Date.now()) {
  const name = safeSkillName(skillName)
  if (!name || !receipt.traceEvents.some((trace) => trace.skillName === name && trace.status === 'loaded')) {
    throw new Error('只能为本次成功加载的 Skill 保存学习笔记')
  }
  const note = normalizeLearningNote({ skillName: name, ...(values ?? {}), updatedAt: now }, { strict: true })
  const remaining = (receipt.learningNotes ?? []).filter((item) => item.skillName !== name)
  return {
    ...receipt,
    updatedAt: now,
    learningNotes: note ? [...remaining, note] : remaining,
  }
}

export function addOutputReference(receipt, relativeRef, now = Date.now()) {
  const value = cleanString(relativeRef, 240)
  if (!value) throw new Error('输出引用不能为空')
  if (value.startsWith('/') || value.startsWith('~') || value.includes('://') || value.split(/[\\/]+/).includes('..')) {
    throw new Error('只允许工作区内的相对引用')
  }
  if (receipt.outputReferences.some((item) => item.relativeRef === value)) return receipt
  return {
    ...receipt,
    updatedAt: now,
    outputReferences: [...receipt.outputReferences, {
      outputId: `output:${receipt.outputReferences.length + 1}`,
      kind: 'local-relative-ref',
      relativeRef: value,
      linkedBy: 'human',
      confirmedAt: now,
    }],
  }
}

function buildLearningCards(receipt, methods, events) {
  return methods.filter((method) => method.loadedCount > 0).map((method) => {
    const loadedEvents = events.filter((event) => event.name === method.name && event.status === 'loaded')
    const steps = []
    for (const event of loadedEvents) {
      for (const step of event.continuityCandidate?.steps ?? []) {
        if (!steps.some((item) => item.title === step.title)) steps.push({ ...step, order: steps.length + 1 })
        if (steps.length >= 8) break
      }
      if (steps.length >= 8) break
    }
    const dependencySignals = new Set(loadedEvents.flatMap((event) => (event.continuityCandidate?.dependencySignals ?? []).map((item) => item.type)))
    const source = (receipt.sourceSnapshots ?? []).find((item) => item.skillName === method.name)
    const observedHashes = [...new Set(loadedEvents.map((event) => event.evidenceFingerprint?.scope === 'skill-instructions' ? event.evidenceFingerprint.value : null).filter(Boolean))]
    const versionState = source?.match === 'match' ? 'match' : source?.match === 'mismatch' ? 'changed' : 'unavailable'
    return {
      skillName: method.name,
      loadCount: method.callCount,
      loadedCount: method.loadedCount,
      observedHashes,
      currentHash: source?.currentInstructionSha256 ?? null,
      versionState,
      steps,
      dependencies: DEPENDENCY_TYPES.map((type) => ({
        type,
        required: dependencySignals.has(type) ? 'candidate' : 'unknown',
        evidenceType: dependencySignals.has(type) ? 'keyword-signal' : 'none',
      })),
      evidenceState: steps.length > 0 ? 'structured-candidate' : 'no-structured-steps',
      note: (receipt.learningNotes ?? []).find((item) => item.skillName === method.name) ?? null,
      limitations: [
        '候选步骤来自本次返回的 Skill 指令，不代表 Agent 已经执行。',
        '版本比较只说明正文 Hash 是否相同，不证明 Skill 的作者、质量或安全性。',
      ],
    }
  })
}

export function buildViewModels(receipt) {
  const events = receipt.traceEvents.map((trace) => ({
    id: trace.eventId,
    name: trace.skillName,
    status: trace.status,
    turn: trace.turn,
    step: trace.step,
    callSeq: trace.callSeq,
    resultSeq: trace.resultSeq,
    consumer: trace.consumer,
    consumerIdentity: trace.consumerIdentity,
    coverage: trace.coverage,
    errorCode: trace.errorCode,
    evidenceFingerprint: trace.evidenceFingerprint,
    continuityCandidate: trace.continuityCandidate,
  }))

  const methodMap = new Map()
  for (const event of events) {
    const existing = methodMap.get(event.name) ?? {
      id: `method:${event.name}`,
      name: event.name,
      status: 'requested',
      callCount: 0,
      loadedCount: 0,
      failedCount: 0,
      unresolvedCount: 0,
      outcomeUnknownCount: 0,
      notStartedCount: 0,
      requestedCount: 0,
      consumer: event.consumer,
      coverage: event.coverage,
      events: [],
    }
    existing.callCount += 1
    const counterKey = statusCounterKey(event.status)
    existing[counterKey] = (existing[counterKey] ?? 0) + 1
    existing.events.push(event)
    methodMap.set(event.name, existing)
  }

  const methods = [...methodMap.values()].map((method) => ({
    ...method,
    status: method.loadedCount === method.callCount
      ? 'loaded'
      : method.failedCount === method.callCount
        ? 'failed'
        : method.outcomeUnknownCount === method.callCount
          ? 'outcome-unknown'
          : method.notStartedCount === method.callCount
            ? 'not-started'
        : method.unresolvedCount === method.callCount
          ? 'unresolved'
          : method.requestedCount === method.callCount
            ? 'requested'
            : 'mixed',
  }))

  const turnDetails = receipt.activity.turns.map((turn) => {
    const turnSteps = receipt.activity.steps.filter((item) => item.turn === turn)
    const turnEvents = events.filter((event) => event.turn === turn)
    return {
      turn,
      stepCount: turnSteps.length,
      eventCount: turnEvents.length,
      skillNames: [...new Set(turnEvents.map((event) => event.name))],
      loadedCount: turnEvents.filter((event) => event.status === 'loaded').length,
      failedCount: turnEvents.filter((event) => event.status === 'failed').length,
      unresolvedCount: turnEvents.filter((event) => ['requested', 'unresolved'].includes(event.status)).length,
      outcomeUnknownCount: turnEvents.filter((event) => event.status === 'outcome-unknown').length,
      notStartedCount: turnEvents.filter((event) => event.status === 'not-started').length,
    }
  })
  const summary = {
    turnCount: receipt.activity.turns.length,
    stepCount: receipt.activity.steps.length,
    methodCount: methods.length,
    eventCount: events.length,
    loadedCount: events.filter((event) => event.status === 'loaded').length,
    failedCount: events.filter((event) => event.status === 'failed').length,
    unresolvedCount: events.filter((event) => ['requested', 'unresolved'].includes(event.status)).length,
    outcomeUnknownCount: events.filter((event) => event.status === 'outcome-unknown').length,
    notStartedCount: events.filter((event) => event.status === 'not-started').length,
    orderedSkillNames: [...new Set(events.map((event) => event.name))],
    eventSkillNames: events.map((event) => event.name),
    repeatedMethods: methods
      .filter((method) => method.callCount > 1)
      .map((method) => ({ name: method.name, callCount: method.callCount })),
    outputCount: receipt.outputReferences.length,
  }
  const learningCards = buildLearningCards(receipt, methods, events)
  const shared = {
    sessionId: receipt.sessionId,
    coverage: receipt.coverage,
    hasTrace: events.length > 0,
    eventCount: events.length,
    methodCount: methods.length,
    methods,
    events,
    activity: receipt.activity,
    turnDetails,
    summary,
    outputs: receipt.outputReferences,
    continuity: receipt.continuity,
    learningCards,
    learningNotes: receipt.learningNotes ?? [],
    sourceSnapshots: receipt.sourceSnapshots ?? [],
  }
  return {
    receipt: shared,
    map: {
      ...shared,
      nodes: {
        task: { id: 'task', type: 'task', label: '当前会话的 Skill 使用情况' },
        methods: methods.map((method) => ({
          id: method.id,
          type: 'skill',
          label: method.name,
          name: method.name,
          status: method.status,
          callCount: method.callCount,
          loadedCount: method.loadedCount,
          failedCount: method.failedCount,
          unresolvedCount: method.unresolvedCount,
          outcomeUnknownCount: method.outcomeUnknownCount,
          notStartedCount: method.notStartedCount,
          requestedCount: method.requestedCount,
          events: method.events,
          learningCard: learningCards.find((card) => card.skillName === method.name) ?? null,
        })),
        steps: events.map((event, index) => ({
          ...event,
          id: `step:${event.id}`,
          type: 'step',
          order: index + 1,
          label: `Turn ${event.turn ?? '?'} · Step ${event.step ?? '?'}`,
          methodId: `method:${event.name}`,
        })),
        dependencies: receipt.continuity.dependencies.map((item) => ({ id: `dependency:${item.type}`, type: 'dependency', ...item })),
        outputs: receipt.outputReferences.map((item) => ({ id: item.outputId, type: 'output', label: item.relativeRef, status: 'human-confirmed' })),
      },
    },
  }
}
