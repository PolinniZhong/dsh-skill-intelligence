import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALIGNMENT_EVIDENCE_LIMIT,
  ALIGNMENT_RELATIONSHIPS,
  STEP_EXTRACTION_CHANNELS,
  STEP_KINDS,
  classifyInvocationStep,
  classifyStepKind,
  extractDeclarationSteps,
  buildAlignment,
} from '../src/core/runtime-alignment.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// Phase 3 contract: Declaration ↔ Runtime Alignment (SDD §12, PRD V0.6).
//
// The product's most important promise lives in this suite: the model says what
// a Skill declared, and what the run left evidence for — without turning missing
// evidence into a claim that a step was skipped, and without producing a score.

const sessionId = 'session-phase3'

// ---------------------------------------------------------------------------
// Declaration extraction: two channels, headings preferred
// ---------------------------------------------------------------------------

test('headings are preferred over stray numbered lists', () => {
  const body = [
    '# Some Skill',
    '',
    '## 执行流程',
    '### 1. 搜索资料',
    '### 2. 修改代码',
    '### 3. 运行测试',
    '',
    '## 注意事项',
    '1. 如果用户直接粘贴内容，先匹配最接近的条目',
    '2. 如果用户说“第二个”，按顺序对应',
  ].join('\n')
  const result = extractDeclarationSteps(body)
  assert.equal(result.channel, 'heading')
  assert.deepEqual(result.steps.map((step) => step.title), ['搜索资料', '修改代码', '运行测试'])
  // The numbered list is a conditional branch list, not the declared process.
  assert.equal(result.steps.some((step) => step.title.includes('如果用户')), false)
  assert.equal(result.headingCount, 3)
  assert.equal(result.orderedListCount, 2)
})

test('the section heading that opens a process is not itself a step', () => {
  const body = ['## 执行流程', '### 1. 第一步', '### 2. 第二步'].join('\n')
  const result = extractDeclarationSteps(body)
  assert.deepEqual(result.steps.map((step) => step.title), ['第一步', '第二步'])
})

test('a plain numbered body falls back to the ordered-list channel', () => {
  const body = ['Read the input', '', '1. Inspect the workspace', '2. Run the local check', '3. Review the diff'].join('\n')
  const result = extractDeclarationSteps(body)
  assert.equal(result.channel, 'ordered-list')
  assert.deepEqual(result.steps.map((step) => step.title), ['Inspect the workspace', 'Run the local check', 'Review the diff'])
  assert.equal(result.steps.every((step) => step.evidenceType === 'ordered-list'), true)
})

test('a deeper heading counts as a step only inside a process or with an ordinal', () => {
  const body = ['## 注意事项', '### 随便一段', '## 执行流程', '### 有编号的一步'].join('\n')
  const result = extractDeclarationSteps(body)
  // `### 随便一段` sits in a non-process section and carries no ordinal, so it is
  // not promoted into the declaration.
  assert.deepEqual(result.steps.map((step) => step.title), ['有编号的一步'])
})

test('a "Step N:" heading is an ordinal, and its number is not part of the title', () => {
  // 真实 Skill `ui-craft` 的声明流程就长这样：`## Discovery Phase` → `### Step 1..3`。
  // 旧规则只认以数字开头的标题，于是这一整类 SKILL.md 的声明流程会抽成空。
  const body = ['## Discovery', '### Step 1: Project Analysis', '### Step 2: Ask the User', '### Step 3: Apply Decisions'].join('\n')
  const result = extractDeclarationSteps(body)
  assert.deepEqual(result.steps.map((step) => step.title), ['Project Analysis', 'Ask the User', 'Apply Decisions'])
})

test('a "Phase N" heading opens a process section for its children', () => {
  const body = ['## Phase 2 — Runtime', '### Collect events', '### Normalise them'].join('\n')
  const result = extractDeclarationSteps(body)
  assert.deepEqual(result.steps.map((step) => step.title), ['Collect events', 'Normalise them'])
})

test('a "第 N 步" heading is an ordinal too', () => {
  const body = ['## 注意事项', '### 第 1 步：收集资料', '### 第 2 步：整理'].join('\n')
  const result = extractDeclarationSteps(body)
  assert.deepEqual(result.steps.map((step) => step.title), ['收集资料', '整理'])
})

test('prose that merely starts with "Step by step" is not an ordinal', () => {
  // 前缀后必须真的跟数字，否则一整类标题会被误提升成步骤。
  const body = ['## 注意事项', '### Step by step guide'].join('\n')
  const result = extractDeclarationSteps(body)
  assert.deepEqual(result.steps, [])
})

test('declaration extraction is bounded and de-duplicated', () => {
  const lines = ['## 执行流程']
  for (let index = 1; index <= 30; index += 1) lines.push(`### ${index}. 步骤${index}`)
  lines.push('### 1. 步骤1')
  const result = extractDeclarationSteps(lines.join('\n'))
  assert.equal(result.steps.length, 12)
  assert.equal(new Set(result.steps.map((step) => step.title)).size, 12)
})

test('an empty body declares nothing and claims no channel', () => {
  const result = extractDeclarationSteps('')
  assert.deepEqual(result.steps, [])
  assert.equal(result.channel, null)
})

test('step kinds are classified deterministically and fall back to other', () => {
  assert.equal(classifyStepKind('Inspect the repository'), 'inspect')
  assert.equal(classifyStepKind('Run the test suite'), 'execute')
  assert.equal(classifyStepKind('Edit the configuration'), 'edit')
  assert.equal(classifyStepKind('Delegate to a subagent'), 'delegate')
  assert.equal(classifyStepKind('Summarize and output the report'), 'produce')
  assert.equal(classifyStepKind('Plan the approach before coding'), 'plan')
  assert.equal(classifyStepKind('搜索相关资料'), 'inspect')
  assert.equal(classifyStepKind('运行测试'), 'execute')
  assert.equal(classifyStepKind('紫气东来'), 'other')
})

test('runtime classification separates direct capabilities from catch-alls', () => {
  assert.deepEqual(classifyInvocationStep('read'), { kind: 'inspect', generic: false })
  assert.deepEqual(classifyInvocationStep('edit'), { kind: 'edit', generic: false })
  assert.deepEqual(classifyInvocationStep('subagent'), { kind: 'delegate', generic: false })
  assert.deepEqual(classifyInvocationStep('todo_write'), { kind: 'plan', generic: false })
  assert.deepEqual(classifyInvocationStep('mcp__github__get_pr'), { kind: 'consult', generic: false })
  // A shell tool proves that a command ran, not which command.
  assert.deepEqual(classifyInvocationStep('bash'), { kind: 'execute', generic: true })
  assert.deepEqual(classifyInvocationStep('pwsh'), { kind: 'execute', generic: true })
  // An unrecognised tool is not forced into a step kind.
  assert.deepEqual(classifyInvocationStep('some_unknown_tool'), { kind: 'other', generic: false })
})

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

function turnStart({ seq, turn }) {
  return { type: 'turn/start', seq, time: 1000 + seq, data: { turn } }
}

function stepStart({ seq, turn, step }) {
  return { type: 'step/start', seq, time: 1000 + seq, data: { turn, step } }
}

function toolCall({ seq, callId, name = 'bash', turn = 1, step = 1 }) {
  return { type: 'tool/call', seq, time: 1000 + seq, data: { turn, step, callId, name, arguments: '{"ignored":true}' } }
}

function toolResult({ seq, callId, isError = false, code, turn = 1, step = 1 }) {
  return {
    type: 'tool/result',
    seq,
    time: 1000 + seq,
    data: {
      turn,
      step,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId },
        toolCallId: callId,
        content: [{ type: 'text', text: 'ignored' }],
        isError,
        id: `m-${callId}`,
      },
      ...(code ? { error: { name: 'Error', code } } : {}),
    },
  }
}

// Loads a Skill whose declared body is supplied, so the declaration is real.
function skillLoad({ seq, callId = 'call-skill', name = 'declared-skill', body }) {
  return [
    {
      type: 'tool/call',
      seq,
      time: 1000 + seq,
      data: { turn: 1, step: 1, callId, name: 'skill', arguments: JSON.stringify({ name }) },
    },
    {
      type: 'tool/result',
      seq: seq + 1,
      time: 1001 + seq,
      data: {
        turn: 1,
        step: 1,
        message: {
          role: 'tool',
          source: { kind: 'tool', callId },
          toolCallId: callId,
          content: [{ type: 'text', text: `<skill_content name="${name}">\n<skill_instructions>\n${body}\n</skill_instructions>\n</skill_content>` }],
          isError: false,
          id: `m-${callId}`,
        },
      },
    },
  ]
}

const DECLARED_BODY = [
  '## 执行流程',
  '### 1. Read the source files',
  '### 2. Edit the implementation',
  '### 3. Run the test suite',
].join('\n')

function alignmentOf(receipt, skillName = 'declared-skill') {
  return buildAlignment(receipt, skillName)
}

function itemFor(alignment, titleFragment) {
  return alignment.items.find((item) => item.title.includes(titleFragment))
}

test('a declared step matched by a named capability is partial, not runtime-supported', () => {
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: DECLARED_BODY }),
    toolCall({ seq: 20, callId: 'r1', name: 'read' }),
    toolResult({ seq: 21, callId: 'r1' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const alignment = alignmentOf(receipt)
  const item = itemFor(alignment, 'Read the source files')
  assert.equal(item.kind, 'inspect')
  // A registered tool name proves the capability that ran, not what it was applied to. Tool
  // arguments are never stored and no declared step carries a correlation id, so "Read the
  // source files" cannot be proven — only that a read capability ran. This assertion used to
  // read `observed`, which was the over-interpretation this round removed.
  assert.equal(item.relationship, 'partial')
  assert.deepEqual(item.observedNodeIds, ['invocation:r1'])
  assert.equal(item.evidenceIds.includes(`${sessionId}:re:20`), true)
  assert.equal(item.evidenceIds.includes(`${sessionId}:re:21`), true)
  assert.deepEqual(item.matchedCapabilities, ['tool'])
})

test('a step matched only by a catch-all command is partial, never supported', () => {
  // `bash` proves a command ran. It cannot prove the test suite was what ran,
  // because tool arguments are not stored.
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: DECLARED_BODY }),
    toolCall({ seq: 20, callId: 'b1', name: 'bash' }),
    toolResult({ seq: 21, callId: 'b1' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const item = itemFor(alignmentOf(receipt), 'Run the test suite')
  assert.equal(item.kind, 'execute')
  assert.equal(item.relationship, 'partial')
  assert.equal(item.limitation.includes('能力层面'), true)
  assert.equal(item.evidenceIds.length > 0, true)
})

test('a step matched only by an unfinished call is partial', () => {
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: DECLARED_BODY }),
    toolCall({ seq: 20, callId: 'r1', name: 'read' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const item = itemFor(alignmentOf(receipt), 'Read the source files')
  assert.equal(item.relationship, 'partial')
})

test('missing evidence is reported as insufficient, never as not done', () => {
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: ['## 执行流程', '### 1. Delegate to a subagent'].join('\n') }),
    toolCall({ seq: 20, callId: 'b1', name: 'bash' }),
    toolResult({ seq: 21, callId: 'b1' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const item = alignmentOf(receipt).items[0]
  assert.equal(item.kind, 'delegate')
  assert.equal(item.relationship, 'insufficient')
  assert.deepEqual(item.evidenceIds, [])
  assert.deepEqual(item.observedNodeIds, [])
  assert.equal(item.limitation.includes('不等于 Agent 没有执行'), true)
  // The vocabulary cannot express "did not happen".
  assert.equal(ALIGNMENT_RELATIONSHIPS.includes('not-observed'), false)
  assert.equal(ALIGNMENT_RELATIONSHIPS.includes('skipped'), false)
})

test('planning is insufficient without a planning surface and partial with one', () => {
  const body = ['## 执行流程', '### 1. Plan the approach before coding'].join('\n')
  const withoutPlanSurface = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body }),
    toolCall({ seq: 20, callId: 'b1', name: 'bash' }),
    toolResult({ seq: 21, callId: 'b1' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of withoutPlanSurface) receipt = reduceSessionEvent(receipt, event)
  assert.equal(alignmentOf(receipt).items[0].relationship, 'insufficient')

  const withPlanSurface = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body }),
    toolCall({ seq: 20, callId: 't1', name: 'todo_write' }),
    toolResult({ seq: 21, callId: 't1' }),
  ]
  let planned = emptyReceipt(sessionId, 1)
  for (const event of withPlanSurface) planned = reduceSessionEvent(planned, event)
  assert.equal(alignmentOf(planned).items[0].relationship, 'partial')
})

test('a step no rule can map is insufficient rather than guessed', () => {
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: ['## 执行流程', '### 1. 紫气东来'].join('\n') }),
    toolCall({ seq: 20, callId: 'r1', name: 'read' }),
    toolResult({ seq: 21, callId: 'r1' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const item = alignmentOf(receipt).items[0]
  assert.equal(item.kind, 'other')
  assert.equal(item.relationship, 'insufficient')
})

test('a receipt with no runtime evidence at all reports unknown, not insufficient', () => {
  // This is the real shape of a receipt written before the runtime stream existed:
  // the declaration survived, the runtime evidence did not.
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: DECLARED_BODY }),
  ]) receipt = reduceSessionEvent(receipt, event)
  receipt = { ...receipt, runtimeEvents: [] }
  const alignment = alignmentOf(receipt)
  assert.equal(alignment.items.length, 3)
  assert.equal(alignment.items.every((item) => item.relationship === 'unknown'), true)
  assert.equal(alignment.items[0].limitation.includes('无法判断'), true)
})

test('alignment reports counts of evidence states and no score', () => {
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: DECLARED_BODY }),
    toolCall({ seq: 20, callId: 'r1', name: 'read' }),
    toolResult({ seq: 21, callId: 'r1' }),
    toolCall({ seq: 22, callId: 'e1', name: 'edit' }),
    toolResult({ seq: 23, callId: 'e1' }),
    toolCall({ seq: 24, callId: 'b1', name: 'bash' }),
    toolResult({ seq: 25, callId: 'b1' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const alignment = alignmentOf(receipt)
  assert.equal(alignment.scored, false)
  assert.deepEqual(alignment.stats, { 'runtime-supported': 0, 'intent-supported': 0, partial: 3, insufficient: 0, unknown: 0 })
  for (const key of Object.keys(alignment.stats)) {
    assert.equal(ALIGNMENT_RELATIONSHIPS.includes(key), true)
  }
  const serialized = JSON.stringify(alignment).toLowerCase()
  for (const forbidden of ['compliance', 'percent', 'score"', 'rate"', 'ranking']) {
    assert.equal(serialized.includes(forbidden), false, `alignment must not produce ${forbidden}`)
  }
})

test('every cited evidence id exists in the receipt', () => {
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: DECLARED_BODY }),
    toolCall({ seq: 20, callId: 'r1', name: 'read' }),
    toolResult({ seq: 21, callId: 'r1' }),
    toolCall({ seq: 22, callId: 'e1', name: 'edit' }),
    toolResult({ seq: 23, callId: 'e1' }),
  ]
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const known = new Set(receipt.runtimeEvents.map((event) => event.eventId))
  for (const item of alignmentOf(receipt).items) {
    for (const id of item.evidenceIds) {
      assert.equal(known.has(id), true, `alignment cites unknown event ${id}`)
    }
  }
})

test('the declaration baseline comes from the published catalog, not a live snapshot', () => {
  const withCatalog = (entries) => ({
    type: 'user/message',
    seq: 5,
    time: 1005,
    data: {
      content: [{ type: 'text', text: '<system-reminder/>' }],
      source: { kind: 'skill-catalog', form: 'catalog', entries },
      role: 'user',
      id: 'm5',
    },
  })
  const build = (catalogEvent) => {
    let receipt = emptyReceipt(sessionId, 1)
    for (const event of [
      turnStart({ seq: 1, turn: 1 }),
      stepStart({ seq: 2, turn: 1, step: 1 }),
      ...(catalogEvent ? [catalogEvent] : []),
      ...skillLoad({ seq: 10, body: DECLARED_BODY }),
      toolCall({ seq: 20, callId: 'r1', name: 'read' }),
      toolResult({ seq: 21, callId: 'r1' }),
    ]) receipt = reduceSessionEvent(receipt, event)
    return receipt
  }
  // Offered to the model this session.
  const listed = alignmentOf(build(withCatalog([{ name: 'declared-skill', description: 'x' }])))
  assert.equal(listed.declaration.inPublishedCatalog, true)
  assert.equal(listed.declaration.catalogEntryCount, 1)
  // Loaded but not in the published catalog — exactly what a user-explicit
  // `/name` load of a model-disabled Skill looks like.
  const unlisted = alignmentOf(build(withCatalog([{ name: 'other-skill', description: 'y' }])))
  assert.equal(unlisted.declaration.inPublishedCatalog, false)
  // No catalog published at all: unknown, not "false".
  const noCatalog = alignmentOf(build(null))
  assert.equal(noCatalog.declaration.inPublishedCatalog, null)
  assert.equal(noCatalog.declaration.catalogEntryCount, 0)
})

test('a user-explicit load aligns exactly like a model-invoked one', () => {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    {
      type: 'user/message',
      seq: 10,
      time: 1010,
      data: {
        content: [{ type: 'text', text: `<skill_content name="declared-skill">\n<skill_instructions>\n${DECLARED_BODY}\n</skill_instructions>\n</skill_content>` }],
        source: { kind: 'skill-invocation', name: 'declared-skill', form: 'instructions' },
        role: 'user',
        id: 'm10',
      },
    },
    toolCall({ seq: 20, callId: 'r1', name: 'read' }),
    toolResult({ seq: 21, callId: 'r1' }),
  ]) receipt = reduceSessionEvent(receipt, event)
  const alignment = alignmentOf(receipt)
  assert.equal(alignment.items.length, 3)
  assert.equal(itemFor(alignment, 'Read the source files').relationship, 'partial')
})

test('alignment is deterministic and carries its extraction channels', () => {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: DECLARED_BODY }),
    toolCall({ seq: 20, callId: 'r1', name: 'read' }),
    toolResult({ seq: 21, callId: 'r1' }),
  ]) receipt = reduceSessionEvent(receipt, event)
  assert.deepEqual(alignmentOf(receipt), alignmentOf(receipt))
  const alignment = alignmentOf(receipt)
  assert.equal(alignment.declaration.channel, 'heading')
  assert.equal(alignment.items.every((item) => STEP_EXTRACTION_CHANNELS.includes(item.evidenceType)), true)
  assert.equal(alignment.items.every((item) => STEP_KINDS.includes(item.kind)), true)
  assert.deepEqual(alignment.items.map((item) => item.declarationStepId), ['declared:1', 'declared:2', 'declared:3'])
})

test('an unknown Skill aligns to an empty declaration without inventing steps', () => {
  const receipt = emptyReceipt(sessionId, 1)
  const alignment = alignmentOf(receipt, 'never-loaded')
  assert.deepEqual(alignment.items, [])
  assert.equal(alignment.declaration.stepCount, 0)
  assert.deepEqual(alignment.stats, { 'runtime-supported': 0, 'intent-supported': 0, partial: 0, insufficient: 0, unknown: 0 })
})

test('numbered items outside a process section are not relabelled as steps', () => {
  // The real shape of a Skill whose body holds constraints and routing rules and
  // whose actual process lives in a referenced file. Calling those rules "steps"
  // would put every alignment below them on a false declaration.
  const body = [
    '# 某 Skill',
    '## 硬约束（任何门都适用）',
    '1. 门径驱动，用户过门才推进',
    '2. 身份签名是最高优先级',
    '## 按需加载',
    '1. 新开工先读本文件',
    '2. 到哪一门读对应一节',
  ].join('\n')
  const result = extractDeclarationSteps(body)
  assert.deepEqual(result.steps, [])
  assert.equal(result.channel, null)
  assert.equal(result.note, 'numbered-items-outside-a-process-section')
  assert.equal(result.orderedListCount, 4)
})

test('a numbered list inside a process section is still a declaration', () => {
  const body = ['## 执行流程', '1. 第一步', '2. 第二步', '## 备注', '1. 与流程无关'].join('\n')
  const result = extractDeclarationSteps(body)
  assert.equal(result.channel, 'ordered-list')
  assert.deepEqual(result.steps.map((step) => step.title), ['第一步', '第二步'])
})

test('a body with no process at all says so rather than declaring nothing silently', () => {
  assert.equal(extractDeclarationSteps('Just prose, no steps here.').note, 'no-declared-process')
})

test('the declaration note reaches the alignment model', () => {
  const body = ['## 硬约束', '1. 规则一', '2. 规则二'].join('\n')
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body }),
  ]) receipt = reduceSessionEvent(receipt, event)
  const alignment = alignmentOf(receipt)
  assert.equal(alignment.declaration.stepCount, 0)
  assert.equal(alignment.declaration.note, 'numbered-items-outside-a-process-section')
})

test('a step matching hundreds of calls keeps a bounded citation but the true count', () => {
  const events = [
    turnStart({ seq: 1, turn: 1 }),
    stepStart({ seq: 2, turn: 1, step: 1 }),
    ...skillLoad({ seq: 10, body: ['## 执行流程', '### 1. Run the test suite'].join('\n') }),
  ]
  for (let index = 0; index < 40; index += 1) {
    const seq = 100 + index * 2
    events.push(toolCall({ seq, callId: `b${index}`, name: 'bash' }))
    events.push(toolResult({ seq: seq + 1, callId: `b${index}` }))
  }
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)

  const item = alignmentOf(receipt).items[0]
  assert.equal(item.relationship, 'partial')
  assert.equal(item.matchCount, 40)
  assert.equal(item.evidenceIds.length, ALIGNMENT_EVIDENCE_LIMIT)
  assert.ok(item.observedNodeIds.length <= 12)
  // The bounded list is still a real citation, not a placeholder.
  const known = new Set(receipt.runtimeEvents.map((event) => event.eventId))
  assert.equal(item.evidenceIds.every((id) => known.has(id)), true)
})
