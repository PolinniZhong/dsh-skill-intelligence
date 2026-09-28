import { createHash } from 'node:crypto'

const SCHEMA_VERSION = 6
const DEPENDENCY_TYPES = ['network', 'model', 'mcp', 'script', 'permission']
const CONTINUITY_STATUSES = ['unassessed', 'manual', 'partial', 'blocked']
const LEARNING_FIELDS = ['understanding', 'improvementIntent', 'validationPlan']
const VALIDATION_STATUSES = ['met', 'not-met', 'inconclusive']

// Phase 0 observation surface.
//
// Only two Skill load paths are observable in DSH, and both are deterministic
// loads: the model calls the `skill` tool, or the user names a skill with the
// `/name` gesture and the host injects it (source.kind `skill-invocation`).
// There is no observable "implicit" path, so no such value is emitted — an
// invented one would be a claim the runtime cannot support.
const INVOCATION_TYPES = ['user-explicit', 'model-invoked']
const CAPABILITY_KINDS = ['skill', 'tool', 'cli', 'mcp', 'subagent']
// Bounded projection of the run. Overflow is counted, never silently dropped.
const RUNTIME_EVENT_LIMIT = 1000
const CATALOG_ENTRY_LIMIT = 500
const CATALOG_DESCRIPTION_MAX = 300
const SKILL_INSTRUCTIONS_OPEN = '<skill_instructions>\n'
const SKILL_INSTRUCTIONS_CLOSE = '\n</skill_instructions>'

function cleanString(value, maxLength = 160) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function safeSkillName(value) {
  const name = cleanString(value, 128)
  return /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,127}$/.test(name) ? name : ''
}

// A registered tool name. MCP tools are the composed `mcp__<server>__<rawName>`
// form, whose parts are restricted to `[A-Za-z0-9_-]`.
function safeToolName(value) {
  const name = cleanString(value, 128)
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(name) ? name : ''
}

/**
 * Deterministic capability classification for one registered tool name.
 *
 * Classification only labels an observed invocation; it never rewrites the
 * recorded event and never invents an invocation that did not happen.
 * @param toolName - the `tool/call` `name` field.
 * @returns the capability kind plus a bounded display name, or null when the
 * name is not a usable identifier.
 */
export function classifyCapability(toolName) {
  const name = safeToolName(toolName)
  if (!name) return null
  const mcp = /^mcp__([A-Za-z0-9_-]{1,32})__(.{1,64})$/.exec(name)
  if (mcp) return { capability: 'mcp', capabilityName: mcp[1], detail: mcp[2] }
  if (name === 'skill') return { capability: 'skill', capabilityName: 'skill', detail: null }
  if (/^(bash|pwsh)([-_].*)?$/.test(name)) return { capability: 'cli', capabilityName: name, detail: null }
  if (/^subagent([-_].*)?$/.test(name)) return { capability: 'subagent', capabilityName: name, detail: null }
  return { capability: 'tool', capabilityName: name, detail: null }
}

function normalizeInvocationType(value, callId) {
  if (INVOCATION_TYPES.includes(value)) return value
  // Receipts written before the observation surface widened could only be
  // produced by the `skill` tool call, so a legacy record carrying a callId is
  // model-invoked as a matter of record, not inference.
  return typeof callId === 'string' && callId ? 'model-invoked' : null
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

function safeLearningText(value, { strict = true, label = '学习笔记' } = {}) {
  if (strict && typeof value === 'string' && value.trim().length > 500) throw new Error(`${label}单项不能超过 500 字`)
  const text = cleanString(value, 500)
  if (!text) return ''
  if (hasSensitiveLearningContent(text)) {
    if (strict) throw new Error(`${label}不能包含绝对路径、带凭据链接或密钥值`)
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

function normalizeValidationResult(value, { strict = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const skillName = safeSkillName(value.skillName)
  if (!skillName) return null
  const status = VALIDATION_STATUSES.includes(value.status) ? value.status : ''
  const observedOutcome = safeLearningText(value.observedOutcome, { strict, label: '验证结果' })
  const nextAction = safeLearningText(value.nextAction, { strict, label: '验证结果' })
  if (strict && !status) throw new Error('验证结果状态无效')
  if (strict && !observedOutcome) throw new Error('实际观察不能为空')
  if (!status || !observedOutcome) return null
  const updatedAt = Number.isSafeInteger(value.updatedAt) ? value.updatedAt : Date.now()
  return {
    skillName,
    status,
    observedOutcome,
    nextAction,
    authorship: 'human',
    validatedAt: Number.isSafeInteger(value.validatedAt) ? value.validatedAt : updatedAt,
    updatedAt,
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

// Returns the object that carries a tool result's content, for either session
// format this observer can meet:
//
//   - V3 wrapped the result in exactly one `tool-result` block, so the content
//     lives on that block.
//   - V4 lifted the result into a first-class `tool` message and retired the
//     wrapper entirely, so the content lives directly on `data.message`.
//
// Reading only the V3 spelling made every V4 result look empty while still
// being reported as a successful load, which silently dropped the instruction
// fingerprint, the candidate steps, and version-drift detection.
function resultBlock(event) {
  const message = event?.data?.message
  if (!message || typeof message !== 'object') return null
  const content = message.content
  if (!Array.isArray(content)) return null
  return content.find((block) => block?.type === 'tool-result') ?? message
}

function safeErrorCode(value) {
  const code = cleanString(value, 64)
  return /^[A-Z0-9_-]+$/.test(code) ? code : 'SKILL_LOAD_FAILED'
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

/**
 * Model-facing text of a message or result carrier. Serves both session
 * formats: V4 puts a result's own blocks on the message, V3 wrapped them in a
 * single `tool-result` block. Both expose a `content` block array.
 */
function contentText(value) {
  if (typeof value?.content === 'string') return value.content
  if (!Array.isArray(value?.content)) return ''
  return value.content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
}

function toolResultText(block) {
  return contentText(block)
}

/**
 * The `<skill_instructions>` body DSH renders inside `<skill_content>`. The
 * model sees one canonical rendering on both load paths, so this extraction
 * serves the `skill` tool result and the user-explicit injection alike.
 */
function instructionsFromText(text) {
  if (!text || text.length > 2 * 1024 * 1024) return ''
  const start = text.indexOf(SKILL_INSTRUCTIONS_OPEN)
  if (start < 0) return ''
  const end = text.indexOf(SKILL_INSTRUCTIONS_CLOSE, start + SKILL_INSTRUCTIONS_OPEN.length)
  return end < 0 ? '' : text.slice(start + SKILL_INSTRUCTIONS_OPEN.length, end)
}

function skillInstructionsFromResult(block) {
  return instructionsFromText(toolResultText(block))
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
      // Log-order cursors. `user/message` carries no turn/step, so attribution
      // comes from the most recent `turn/start` / `step/start` in the same log.
      // That is deterministic — never inferred from timestamps.
      currentTurn: null,
      currentStep: null,
    },
    traceEvents: [],
    // Phase 0 runtime surface: one bounded record per observed tool invocation,
    // metadata only — no arguments and no result content.
    runtimeEvents: [],
    runtimeEventOverflow: 0,
    // The durable skill catalog DSH published into this session: what the model
    // was actually offered. This is the Declaration baseline. A live registry
    // snapshot answers a different question and drifts once the session ends.
    catalogPublished: null,
    catalogPublicationCount: 0,
    sourceSnapshots: [],
    humanAssessment: {
      value: 'pending',
      confirmedAt: null,
    },
    outputReferences: [],
    learningNotes: [],
    validationResults: [],
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

function normalizeRuntimeEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const callId = cleanString(value.callId, 240)
  const capability = CAPABILITY_KINDS.includes(value.capability) ? value.capability : ''
  const name = safeToolName(value.name)
  if (!callId || !capability || !name) return null
  const status = ['requested', 'success', 'failure'].includes(value.status) ? value.status : 'requested'
  return {
    callId,
    capability,
    name,
    detail: safeToolName(value.detail) || null,
    turn: Number.isSafeInteger(value.turn) ? value.turn : null,
    step: Number.isSafeInteger(value.step) ? value.step : null,
    callSeq: Number.isSafeInteger(value.callSeq) ? value.callSeq : null,
    resultSeq: Number.isSafeInteger(value.resultSeq) ? value.resultSeq : null,
    startedAt: Number.isSafeInteger(value.startedAt) ? value.startedAt : null,
    endedAt: Number.isSafeInteger(value.endedAt) ? value.endedAt : null,
    durationMs: Number.isSafeInteger(value.durationMs) ? value.durationMs : null,
    status,
    errorCode: status === 'failure' ? safeErrorCode(value.errorCode) : null,
  }
}

function normalizeCatalogPublished(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = (Array.isArray(value.entries) ? value.entries : [])
    .map((entry) => {
      const name = safeSkillName(entry?.name)
      if (!name) return null
      return { name, description: cleanString(entry?.description, CATALOG_DESCRIPTION_MAX) }
    })
    .filter(Boolean)
    .slice(0, CATALOG_ENTRY_LIMIT)
  if (!entries.length) return null
  return {
    observedAt: Number.isSafeInteger(value.observedAt) ? value.observedAt : null,
    seq: Number.isSafeInteger(value.seq) ? value.seq : null,
    turn: Number.isSafeInteger(value.turn) ? value.turn : null,
    step: Number.isSafeInteger(value.step) ? value.step : null,
    update: value.update === true,
    entryCount: entries.length,
    entriesDigest: safeHash(value.entriesDigest),
    entries,
  }
}

export function migrateReceipt(value, sessionId) {
  if (!value || typeof value !== 'object') return emptyReceipt(sessionId)
  const createdAt = Number.isSafeInteger(value.createdAt) ? value.createdAt : Date.now()
  const base = emptyReceipt(sessionId, createdAt)
  const traceEvents = Array.isArray(value.traceEvents) ? value.traceEvents.map((trace) => {
    const invocationType = normalizeInvocationType(trace?.invocationType, trace?.callId)
    // The user-explicit path has no tool call, so its consumer and coverage
    // must not be overwritten with the model-invoked tool contract.
    const userExplicit = invocationType === 'user-explicit'
    return {
      ...trace,
      sessionId: base.sessionId,
      invocationType,
      consumer: userExplicit ? 'skill-invocation' : 'skill-tool',
      consumerIdentity: 'unavailable',
      coverage: userExplicit ? 'observed-injection-source' : 'observed-tool-contract',
      runtimeIdentity: normalizeRuntimeIdentity(trace.runtimeIdentity),
    }
  }) : []
  const runtimeEvents = Array.isArray(value.runtimeEvents)
    ? value.runtimeEvents.map(normalizeRuntimeEvent).filter(Boolean).slice(-RUNTIME_EVENT_LIMIT)
    : []
  const loadedSkillNames = new Set(traceEvents.filter((trace) => trace.status === 'loaded').map((trace) => trace.skillName))
  const learningNotes = Array.isArray(value.learningNotes)
    ? value.learningNotes.map((note) => normalizeLearningNote(note)).filter((note) => note && loadedSkillNames.has(note.skillName))
    : []
  const validationResults = Array.isArray(value.validationResults)
    ? value.validationResults.map((result) => normalizeValidationResult(result)).filter((result) => result && loadedSkillNames.has(result.skillName))
    : []
  const storedActivity = value.activity && typeof value.activity === 'object' ? value.activity : {}
  return {
    ...base,
    updatedAt: Number.isSafeInteger(value.updatedAt) ? value.updatedAt : createdAt,
    activity: {
      ...base.activity,
      turns: Array.isArray(storedActivity.turns) ? storedActivity.turns.filter(Number.isSafeInteger) : [],
      steps: Array.isArray(storedActivity.steps) ? storedActivity.steps : [],
      lastObservedSeq: Number.isSafeInteger(storedActivity.lastObservedSeq) ? storedActivity.lastObservedSeq : null,
      currentTurn: Number.isSafeInteger(storedActivity.currentTurn) ? storedActivity.currentTurn : null,
      currentStep: Number.isSafeInteger(storedActivity.currentStep) ? storedActivity.currentStep : null,
    },
    traceEvents,
    runtimeEvents,
    runtimeEventOverflow: Number.isSafeInteger(value.runtimeEventOverflow) ? Math.max(0, value.runtimeEventOverflow) : 0,
    catalogPublished: normalizeCatalogPublished(value.catalogPublished),
    catalogPublicationCount: Number.isSafeInteger(value.catalogPublicationCount) ? Math.max(0, value.catalogPublicationCount) : 0,
    sourceSnapshots: Array.isArray(value.sourceSnapshots) ? value.sourceSnapshots.map(normalizeSourceSnapshot).filter(Boolean) : [],
    humanAssessment: value.humanAssessment && typeof value.humanAssessment === 'object' ? value.humanAssessment : base.humanAssessment,
    outputReferences: Array.isArray(value.outputReferences) ? value.outputReferences : [],
    learningNotes,
    validationResults,
    continuity: automaticContinuity(traceEvents, value.continuity),
  }
}

function addUniqueNumber(items, value) {
  if (!Number.isSafeInteger(value) || items.includes(value)) return items
  return [...items, value].sort((a, b) => a - b)
}

// Attribution helpers. An event that carries its own turn/step is authoritative;
// otherwise the log-order cursor from the most recent `turn/start` / `step/start`
// applies. Never derived from timestamps.
function observedTurn(receipt, data) {
  if (Number.isSafeInteger(data?.turn)) return data.turn
  return Number.isSafeInteger(receipt.activity?.currentTurn) ? receipt.activity.currentTurn : null
}

function observedStep(receipt, data) {
  if (Number.isSafeInteger(data?.step)) return data.step
  return Number.isSafeInteger(receipt.activity?.currentStep) ? receipt.activity.currentStep : null
}

function withObservedActivity(receipt, event) {
  const data = event?.data ?? {}
  const type = event?.type
  const currentTurn = type === 'turn/end'
    ? null
    : type === 'turn/start' || type === 'step/start'
      ? (Number.isSafeInteger(data.turn) ? data.turn : receipt.activity.currentTurn)
      : receipt.activity.currentTurn
  const currentStep = type === 'step/start'
    ? (Number.isSafeInteger(data.step) ? data.step : receipt.activity.currentStep)
    : type === 'turn/start' || type === 'step/end' || type === 'turn/end'
      ? null
      : receipt.activity.currentStep
  return {
    ...receipt,
    updatedAt: Number.isSafeInteger(event?.time) ? event.time : Date.now(),
    activity: {
      turns: addUniqueNumber(receipt.activity.turns, data.turn),
      steps: type === 'step/start'
        ? [...receipt.activity.steps, { turn: data.turn, step: data.step }].filter((item, index, all) => all.findIndex((other) => other.turn === item.turn && other.step === item.step) === index)
        : receipt.activity.steps,
      lastObservedSeq: Number.isSafeInteger(event?.seq) ? event.seq : receipt.activity.lastObservedSeq,
      currentTurn,
      currentStep,
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

function appendRuntimeEvent(receipt, entry) {
  const events = [...receipt.runtimeEvents, entry]
  if (events.length <= RUNTIME_EVENT_LIMIT) {
    return { runtimeEvents: events, runtimeEventOverflow: receipt.runtimeEventOverflow }
  }
  // Bounded window: keep the most recent evidence and report what was dropped,
  // so a truncated run is never presented as a complete one.
  const dropped = events.length - RUNTIME_EVENT_LIMIT
  return { runtimeEvents: events.slice(dropped), runtimeEventOverflow: receipt.runtimeEventOverflow + dropped }
}

// One bounded record per observed tool invocation. Arguments and result content
// are never read here, let alone stored: Phase 0 keeps only correlation and
// classification metadata.
function reduceRuntimeCall(receipt, event) {
  const data = event?.data ?? {}
  const callId = cleanString(data.callId, 240)
  const kind = classifyCapability(data.name)
  if (!callId || !kind) return receipt
  if (receipt.runtimeEvents.some((item) => item.callId === callId)) return receipt
  const entry = {
    callId,
    capability: kind.capability,
    name: kind.capabilityName,
    detail: kind.detail,
    turn: observedTurn(receipt, data),
    step: observedStep(receipt, data),
    callSeq: Number.isSafeInteger(event.seq) ? event.seq : null,
    resultSeq: null,
    startedAt: Number.isSafeInteger(event.time) ? event.time : null,
    endedAt: null,
    durationMs: null,
    status: 'requested',
    errorCode: null,
  }
  return { ...receipt, ...appendRuntimeEvent(receipt, entry) }
}

function reduceRuntimeResult(receipt, event) {
  const data = event?.data ?? {}
  const block = resultBlock(event)
  const callId = cleanString(data.message?.source?.callId || block?.toolCallId, 240)
  if (!callId) return receipt
  const index = receipt.runtimeEvents.findIndex((item) => item.callId === callId)
  if (index < 0) return receipt
  if (receipt.runtimeEvents[index].status !== 'requested') return receipt
  const failed = block?.isError === true || Boolean(data.error)
  const endedAt = Number.isSafeInteger(event.time) ? event.time : null
  const runtimeEvents = receipt.runtimeEvents.map((item, itemIndex) => itemIndex === index ? {
    ...item,
    status: failed ? 'failure' : 'success',
    errorCode: failed ? safeErrorCode(data.error?.code) : null,
    resultSeq: Number.isSafeInteger(event.seq) ? event.seq : null,
    endedAt,
    durationMs: Number.isSafeInteger(item.startedAt) && Number.isSafeInteger(endedAt) ? endedAt - item.startedAt : null,
  } : item)
  return { ...receipt, runtimeEvents }
}

// The durable skill catalog DSH published into this session. This is the
// Declaration baseline: what the model was actually offered.
function reduceSkillCatalog(receipt, event) {
  const source = event?.data?.source ?? {}
  const entries = (Array.isArray(source.entries) ? source.entries : [])
    .map((entry) => {
      const name = safeSkillName(entry?.name)
      if (!name) return null
      return { name, description: cleanString(entry?.description, CATALOG_DESCRIPTION_MAX) }
    })
    .filter(Boolean)
    .slice(0, CATALOG_ENTRY_LIMIT)
  if (!entries.length) return receipt
  const observedAt = Number.isSafeInteger(event.time) ? event.time : Date.now()
  return {
    ...receipt,
    catalogPublished: {
      observedAt,
      seq: Number.isSafeInteger(event.seq) ? event.seq : null,
      turn: observedTurn(receipt, event?.data),
      step: observedStep(receipt, event?.data),
      update: source.update === true,
      entryCount: entries.length,
      // Digest over the published names: a cheap, stable drift check that does
      // not depend on description wording.
      entriesDigest: sha256(entries.map((item) => item.name).sort().join('\n')),
      entries,
    },
    catalogPublicationCount: receipt.catalogPublicationCount + 1,
  }
}

// A user-explicit `/name` load. DSH injects the same canonical `<skill_content>`
// rendering the `skill` tool returns, so the instruction fingerprint and the
// candidate steps come from the same extraction rule as the model path.
function reduceSkillInvocation(receipt, event) {
  const data = event?.data ?? {}
  const skillName = safeSkillName(data?.source?.name)
  if (!skillName) return receipt
  const seq = Number.isSafeInteger(event.seq) ? event.seq : null
  const eventId = `${receipt.sessionId}:invocation:${seq ?? receipt.traceEvents.length}`
  if (receipt.traceEvents.some((trace) => trace.eventId === eventId)) return receipt
  const injectedAt = Number.isSafeInteger(event.time) ? event.time : Date.now()
  const text = contentText(data)
  const instructions = instructionsFromText(text)
  const evidenceFingerprint = instructions
    ? { algorithm: 'sha256', scope: 'skill-instructions', value: sha256(instructions) }
    : text ? { algorithm: 'sha256', scope: 'rendered-skill-injection', value: sha256(text) } : null
  const trace = {
    eventId,
    sessionId: receipt.sessionId,
    turn: observedTurn(receipt, data),
    step: observedStep(receipt, data),
    skillName,
    status: 'loaded',
    invocationType: 'user-explicit',
    callId: null,
    callSeq: seq,
    resultSeq: seq,
    requestedAt: injectedAt,
    resolvedAt: injectedAt,
    consumer: 'skill-invocation',
    consumerIdentity: 'unavailable',
    coverage: 'observed-injection-source',
    errorCode: null,
    evidenceFingerprint,
    continuityCandidate: instructions ? extractContinuityCandidate(skillName, instructions) : null,
    runtimeIdentity: null,
  }
  receipt = { ...receipt, traceEvents: [...receipt.traceEvents, trace] }
  return { ...receipt, continuity: automaticContinuity(receipt.traceEvents, receipt.continuity) }
}

function reduceUserMessage(receipt, event) {
  const kind = event?.data?.source?.kind
  if (kind === 'skill-invocation') return reduceSkillInvocation(receipt, event)
  if (kind === 'skill-catalog') return reduceSkillCatalog(receipt, event)
  return receipt
}

/**
 * Whether one session event can carry Skill evidence that no tool call exposes:
 * a user-explicit `/name` load, or the published skill catalog. The host uses
 * this to decide when a `user/message` is worth persisting.
 * @param event - one DSH session event.
 * @returns true when the event's source kind is Skill evidence.
 */
export function carriesSkillEvidence(event) {
  if (event?.type !== 'user/message') return false
  const kind = event?.data?.source?.kind
  return kind === 'skill-invocation' || kind === 'skill-catalog'
}

export function reduceSessionEvent(source, event) {
  let receipt = withObservedActivity(source, event)
  const data = event?.data ?? {}

  if (event?.type === 'user/message') return reduceUserMessage(receipt, event)

  // Phase 0: every tool invocation is recorded, not only `skill`. Tool, CLI and
  // MCP invocations already arrive on this stream — discarding them here is what
  // left the runtime graph without raw material.
  if (event?.type === 'tool/call') receipt = reduceRuntimeCall(receipt, event)
  if (event?.type === 'tool/result') receipt = reduceRuntimeResult(receipt, event)

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
        turn: observedTurn(receipt, data),
        step: observedStep(receipt, data),
        skillName,
        status: 'requested',
        invocationType: 'model-invoked',
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
    validationResults: Array.isArray(manual.validationResults) ? manual.validationResults : [],
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

export function setValidationResult(receipt, skillName, values, now = Date.now()) {
  const name = safeSkillName(skillName)
  if (!name || !receipt.traceEvents.some((trace) => trace.skillName === name && trace.status === 'loaded')) {
    throw new Error('只能为本次成功加载的 Skill 保存验证结果')
  }
  const remaining = (receipt.validationResults ?? []).filter((item) => item.skillName !== name)
  if (values?.status === 'unassessed') {
    return { ...receipt, updatedAt: now, validationResults: remaining }
  }
  const existing = (receipt.validationResults ?? []).find((item) => item.skillName === name)
  const result = normalizeValidationResult({
    skillName: name,
    ...(values ?? {}),
    validatedAt: existing?.validatedAt ?? now,
    updatedAt: now,
  }, { strict: true })
  return {
    ...receipt,
    updatedAt: now,
    validationResults: [...remaining, result],
  }
}

export function addOutputReference(receipt, relativeRef, now = Date.now()) {
  const value = cleanString(relativeRef, 240)
  if (!value) throw new Error('输出引用不能为空')
  if (value.startsWith('/') || value.startsWith('~') || value.includes('://') || value.split(/[\\/]+/).includes('..')) {
    throw new Error('只允许工作区内的相对引用')
  }
  if (receipt.outputReferences.some((item) => item.relativeRef === value)) return receipt
  const nextId = receipt.outputReferences.reduce((highest, item) => {
    const match = /^output:(\d+)$/.exec(item.outputId)
    return Math.max(highest, match ? Number(match[1]) : 0)
  }, 0) + 1
  return {
    ...receipt,
    updatedAt: now,
    outputReferences: [...receipt.outputReferences, {
      outputId: `output:${nextId}`,
      kind: 'local-relative-ref',
      relativeRef: value,
      linkedBy: 'human',
      confirmedAt: now,
    }],
  }
}

export function removeOutputReference(receipt, outputId, now = Date.now()) {
  const value = cleanString(outputId, 80)
  if (!/^output:\d+$/.test(value)) throw new Error('outputId 无效')
  if (!receipt.outputReferences.some((item) => item.outputId === value)) throw new Error('输出引用不存在')
  return {
    ...receipt,
    updatedAt: now,
    outputReferences: receipt.outputReferences.filter((item) => item.outputId !== value),
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
      validationResult: (receipt.validationResults ?? []).find((item) => item.skillName === method.name) ?? null,
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
    invocationType: trace.invocationType ?? null,
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
    validationResults: receipt.validationResults ?? [],
    sourceSnapshots: receipt.sourceSnapshots ?? [],
    // Phase 0 runtime surface, projected as counts. No argument and no result
    // content is carried here, and `overflow` states truncation instead of
    // presenting a bounded window as a complete run.
    runtime: {
      eventCount: (receipt.runtimeEvents ?? []).length,
      overflow: receipt.runtimeEventOverflow ?? 0,
      byCapability: Object.fromEntries(CAPABILITY_KINDS.map((kind) => [
        kind,
        (receipt.runtimeEvents ?? []).filter((item) => item.capability === kind).length,
      ])),
      invocationTypes: Object.fromEntries(INVOCATION_TYPES.map((type) => [
        type,
        events.filter((event) => event.invocationType === type).length,
      ])),
      catalog: receipt.catalogPublished ? {
        observedAt: receipt.catalogPublished.observedAt,
        update: receipt.catalogPublished.update,
        entryCount: receipt.catalogPublished.entryCount,
        entriesDigest: receipt.catalogPublished.entriesDigest,
        publicationCount: receipt.catalogPublicationCount ?? 0,
      } : null,
    },
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
