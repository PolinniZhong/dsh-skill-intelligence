/**
 * V1.3 `skill_review` —— 纯函数层（`src/core/skill-review.mjs`）的行为与边界。
 *
 * 这一层**不 import 任何 DSH 包**：工具注册、可见性、出参校验链都在真机上验（任务书 §9 / §11）。
 * 这里锁的是「Packet 里装了什么、装不下时怎么办、渲染放不放得进预算、失败长什么样」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SKILL_REVIEW_DIGEST_LEVELS,
  SKILL_REVIEW_FAILURE_REASONS,
  SKILL_REVIEW_FORBIDDEN_KEYS,
  SKILL_REVIEW_GUIDANCE,
  SKILL_REVIEW_LIMITATIONS,
  SKILL_REVIEW_PACKET_SCHEMA,
  SKILL_REVIEW_RENDER_LIMIT,
  SKILL_REVIEW_SCHEMA_VERSION,
  buildSkillReviewPacket,
  renderSkillReviewPacket,
  skillReviewFailure,
} from '../src/core/skill-review.mjs'
import { buildSkillFramework } from '../src/core/skill-framework.mjs'
import { buildDefinitionOutline } from '../src/core/definition-outline.mjs'
import { buildSkillValidation } from '../src/core/skill-validation.mjs'
import { extractDeclaredFlow } from '../src/core/skill-flow.mjs'
import { attachEvidenceToFlow } from '../src/core/skill-view-model.mjs'
import { FLOW_EVIDENCE_STATES } from '../src/core/flow-evidence.mjs'
import { buildSkillRuntimeLogic } from '../src/core/skill-runtime-logic.mjs'

// ---------------------------------------------------------------------------------------------
// 自写的 mini-validator（零依赖，只认内核声明支持的那个 JSON Schema 子集）
// ---------------------------------------------------------------------------------------------

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value, type) {
  const actual = typeOf(value)
  if (type === 'number') return actual === 'number' || actual === 'integer'
  return actual === type
}

function validate(schema, value, path = 'value', errors = []) {
  if (!schema || typeof schema !== 'object') return errors
  if (Array.isArray(schema.oneOf)) {
    const hits = schema.oneOf.filter((branch) => validate(branch, value, path, []).length === 0)
    if (hits.length !== 1) errors.push(`${path} must match exactly one oneOf branch (matched ${hits.length})`)
    return errors
  }
  if (typeof schema.type === 'string' && !matchesType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type} (got ${typeOf(value)})`)
    return errors
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path} must equal ${JSON.stringify(schema.const)}`)
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${path} is not one of the enum values`)
  if (Array.isArray(value) && schema.items) value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`, errors))
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {}
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required`)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${path}.${key} is not a declared property`)
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validate(child, value[key], `${path}.${key}`, errors)
    }
  }
  return errors
}

// ---------------------------------------------------------------------------------------------
// 夹具：一个「大 Skill」——342 行 / 11 小节 / 39 个引用（与 `ui-craft` 同量级）
// ---------------------------------------------------------------------------------------------

const PROSE_SENTENCE = 'Follow the house style guide and keep every panel readable at a glance.'

function bigSkill() {
  const lines = [
    '---',
    'name: ui-craft',
    'description: Use when building or reviewing UI panels; covers layout, spacing, contrast and copy.',
    'license: MIT',
    'metadata:',
    '  owner: design-systems',
    'allowed-tools: Read',
    '---',
    '',
    '# UI Craft',
    '',
    PROSE_SENTENCE,
    '',
  ]
  const sections = [
    ['## Purpose', 'identity'],
    ['## Trigger', 'trigger'],
    ['## Rules', 'rules'],
    ['## Controls', 'controls'],
    ['## Workflow', 'workflow'],
    ['## Resources', 'resources'],
    ['## Output', 'output'],
    ['## Verification', 'verification'],
    ['## Examples', null],
    ['## Anti-patterns', null],
    ['## Changelog', null],
  ]
  let link = 0
  sections.forEach(([title], index) => {
    lines.push(title, '')
    for (let n = 0; n < 4; n += 1) {
      lines.push(`- ${PROSE_SENTENCE}`)
      link += 1
      if (link <= 39) lines.push(`- See [reference ${link}](references/part-${link}.md) for the details.`)
    }
    if (index === 4) {
      lines.push('', '1. Project Analysis', '2. Ask the User', '3. Apply Decisions', '4. Verify Contrast', '')
    }
    if (index === 0) {
      lines.push('', '| Token | Value |', '| --- | --- |', '| radius | 6 |', '| gap | 8 |', '')
    }
    if (index === 1) lines.push('', '```bash', 'echo "never executed by this plugin"', '```', '')
    if (index === 5) lines.push('', '- A stray link: [escape hatch](../../examples/storyboard.md)', '')
    lines.push('', '### Notes', '', `- ${PROSE_SENTENCE}`, '')
  })
  lines.push('## Notes', '', `- ${PROSE_SENTENCE}`, '')
  return lines.join('\n')
}

function bigDetail() {
  const content = bigSkill()
  const outline = buildDefinitionOutline(content)
  const framework = buildSkillFramework({
    content,
    outline: outline.entries,
    summary: { name: 'ui-craft' },
    truncated: false,
    resourceBase: { kind: 'directory' },
  })
  const flow = attachEvidenceToFlow(extractDeclaredFlow(content), [], false)
  const validation = buildSkillValidation({
    skillName: 'ui-craft',
    available: true,
    content,
    directoryName: 'ui-craft',
    resourcePaths: Array.from({ length: 39 }, (_, index) => `references/part-${index + 1}.md`),
    now: 1770000000000,
  })
  const evidence = { scope: { key: 'receipt:turn9.step10', total: 0, relationship: 'unavailable' } }
  const runtimeLogic = buildSkillRuntimeLogic({ receipt: null, runs: [], evidence, observation: {}, stepStates: [] })
  return {
    skillName: 'ui-craft',
    summary: { name: 'ui-craft', provider: 'filesystem', source: 'custom', runCount: 0, lastLoadedAt: null },
    definition: {
      available: true,
      reason: null,
      resourceBase: { kind: 'directory', path: '/Users/someone/.dsh/skills/ui-craft', pathOmitted: true },
      content: { sha256: 'f'.repeat(64), returnedSha256: 'f'.repeat(64), bytes: content.length, lineCount: 342, text: content, truncated: false },
      summary: { description: 'Use when building or reviewing UI panels.' },
    },
    framework,
    flow,
    runs: [],
    evidence,
    runtimeLogic,
    observation: { match: 'unavailable', currentInstructionSha256: 'f'.repeat(64), observedInstructionSha256: [] },
    validation,
    repository: { status: 'unresolved' },
    lineage: null,
  }
}

function bigPacket() {
  return buildSkillReviewPacket({ skillName: 'ui-craft', ok: true, detail: bigDetail() })
}

// ---------------------------------------------------------------------------------------------
// Packet：形状与来源
// ---------------------------------------------------------------------------------------------

test('skill-review · Packet 信封与 schema 对齐（自写 mini-validator 走一遍）', () => {
  const packet = bigPacket()
  assert.equal(packet.schemaVersion, SKILL_REVIEW_SCHEMA_VERSION)
  assert.equal(packet.ok, true)
  assert.equal(packet.skillName, 'ui-craft')
  assert.equal(packet.reason, null)
  assert.deepEqual(validate(SKILL_REVIEW_PACKET_SCHEMA, packet), [])
  assert.deepEqual(Object.keys(packet), ['schemaVersion', 'ok', 'skillName', 'reason', 'review'])
  assert.deepEqual(Object.keys(packet.review), [
    'skillName',
    'profiles',
    'declaredFacts',
    'observedFacts',
    'validationFindings',
    'limitations',
    'render',
    'boundaries',
  ])
})

test('skill-review · mini-validator 不是空转（多键 / 缺键 / 类型错都能抓住）', () => {
  const packet = bigPacket()
  const extra = { ...packet, sneaky: 1 }
  assert.ok(validate(SKILL_REVIEW_PACKET_SCHEMA, extra).length > 0)
  const missing = { ...packet }
  delete missing.review
  assert.ok(validate(SKILL_REVIEW_PACKET_SCHEMA, missing).length > 0)
  const wrongType = { ...packet, review: { ...packet.review, limitations: 'not-an-array' } }
  assert.ok(validate(SKILL_REVIEW_PACKET_SCHEMA, wrongType).length > 0)
  const badEnum = { ...packet, review: { ...packet.review, validationFindings: { ...packet.review.validationFindings, status: 'ok' } } }
  assert.ok(validate(SKILL_REVIEW_PACKET_SCHEMA, badEnum).length > 0)
})

test('skill-review · 声明轴与验收轴来自既有纯函数，不自造事实', () => {
  const detail = bigDetail()
  const packet = buildSkillReviewPacket({ skillName: 'ui-craft', ok: true, detail })
  const framework = packet.review.declaredFacts.framework
  assert.equal(framework.available, true)
  assert.equal(framework.sectionCount, detail.framework.sectionCount)
  assert.equal(framework.sectionCount >= 11, true)
  assert.deepEqual(framework.absentRoles, detail.framework.coverage.absent)
  assert.equal(framework.sections[0].title, detail.framework.sections[0].title)
  assert.equal(framework.sections[0].line, detail.framework.sections[0].line)
  // 正文摘录与正文原文都不在 Packet 里
  assert.equal('opening' in framework.sections[0], false)
  assert.equal(JSON.stringify(packet).includes(PROSE_SENTENCE), false)
  assert.equal(JSON.stringify(packet).includes('references/part-1.md'), true)
  // 验收轴逐项沿用 buildSkillValidation 的结论
  const validation = packet.review.validationFindings
  assert.equal(validation.status, detail.validation.status)
  assert.equal(validation.statusLabel, '需要修正')
  assert.deepEqual(validation.summary, detail.validation.summary)
  assert.deepEqual(validation.profileIds, detail.validation.profileIds)
  assert.equal(
    validation.findings.some((finding) => finding.id === 'CORE-REF-002' && finding.severity === 'error'),
    true,
  )
  assert.equal(validation.unjudged.length > 0, true)
  for (const rule of validation.unjudged) {
    assert.equal(detail.validation.skipped.some((entry) => entry.id === rule.id), true)
  }
})

test('skill-review · 限制沿用封闭词表（验收 + 证据两端都在）', () => {
  const packet = bigPacket()
  const codes = packet.review.limitations
  assert.equal(codes.includes('declared-value-is-not-runtime-behaviour'), true)
  assert.equal(codes.includes('load-does-not-prove-content-use'), true)
  assert.equal(codes.includes('outcome-is-not-causal-attribution'), true)
  assert.equal(codes.some((code) => code.includes('静态验收只读 SKILL.md')), true)
  const evidence = packet.review.observedFacts.evidence
  assert.equal(evidence.limitationCodes.length > 0, true)
  for (const code of ['declared-value-is-not-runtime-behaviour', 'load-does-not-prove-content-use', 'outcome-is-not-causal-attribution']) {
    assert.equal(evidence.limitationCodes.includes(code), true, `证据限制里缺少 ${code}`)
  }
  assert.deepEqual(evidence.inequalities, ['加载 ≠ 使用', '使用 ≠ 结果', '结果 ≠ 这个 Skill 造成的'])
  assert.equal(evidence.table.every((row) => ['declared', 'observed', 'unavailable'].includes(row.status)), true)
  const causal = evidence.table.find((row) => row.subjectId === 'skill-outcome')
  assert.equal(causal === undefined || causal.status === 'unavailable', true)
})

test('skill-review · 运行事实逐段沿用 buildSkillRuntimeLogic', () => {
  const detail = bigDetail()
  const packet = buildSkillReviewPacket({ skillName: 'ui-craft', ok: true, detail })
  const runtime = packet.review.observedFacts.runtimeLogic
  assert.equal(runtime.available, true)
  assert.equal(runtime.stageCount, detail.runtimeLogic.stageCount)
  assert.equal(runtime.observedCount, detail.runtimeLogic.observedCount)
  assert.deepEqual(runtime.stages.map((stage) => stage.id), detail.runtimeLogic.stages.map((stage) => stage.id))
  assert.equal(runtime.stages[0].labelZh, detail.runtimeLogic.stages[0].label.zh)
  for (const stage of runtime.stages) {
    // 运行段的状态用的是既有的「五个关系」词表（`FLOW_EVIDENCE_STATES`），不是证据模型的三态
    assert.equal(Object.keys(FLOW_EVIDENCE_STATES).includes(stage.state), true, `未知状态：${stage.state}`)
  }
})

// ---------------------------------------------------------------------------------------------
// 隐私：禁止键 / 绝对路径 / 会话数据 / 正文
// ---------------------------------------------------------------------------------------------

function walk(value, visit, path = 'packet') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child, `${path}.${key}`)
      walk(child, visit, `${path}.${key}`)
      }
    return
  }
  visit(null, value, path)
}

test('skill-review · 禁止键递归结构级断言', () => {
  const hits = []
  walk(bigPacket(), (key, _value, path) => {
    if (key !== null && SKILL_REVIEW_FORBIDDEN_KEYS.includes(key)) hits.push(path)
  })
  assert.deepEqual(hits, [])
  assert.equal(SKILL_REVIEW_FORBIDDEN_KEYS.includes('sessionId'), true)
  assert.equal(SKILL_REVIEW_FORBIDDEN_KEYS.includes('eventId'), true)
  assert.equal(SKILL_REVIEW_FORBIDDEN_KEYS.includes('args'), true)
  assert.equal(SKILL_REVIEW_FORBIDDEN_KEYS.includes('result'), true)
})

test('skill-review · 没有绝对路径、没有会话标识、没有正文', () => {
  const packet = bigPacket()
  const strings = []
  walk(packet, (_key, value, path) => {
    if (typeof value === 'string') strings.push([path, value])
  })
  assert.equal(strings.length > 50, true)
  const absolute = /\/(?:Users|home|tmp|var|private|opt|etc)\//
  for (const [path, value] of strings) {
    assert.equal(absolute.test(value), false, `${path} 里出现了绝对路径：${value}`)
    assert.equal(/sessionId|session-id|runKey|eventId|toolArguments|toolResult/.test(value), false, `${path} 里出现了会话标识：${value}`)
    assert.equal(value.includes(PROSE_SENTENCE), false, `${path} 里出现了正文摘录`)
    assert.equal(/^---$/m.test(value), false, `${path} 里出现了 frontmatter`)
  }
  assert.equal(JSON.stringify(packet).includes('SKILL.md'), true)
  assert.equal(JSON.stringify(packet).includes('# UI Craft'), false)
})

test('skill-review · Packet 是确定性且可 JSON 往返的（同一输入两次逐字节相同）', () => {
  const first = bigPacket()
  const second = bigPacket()
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(first))), JSON.stringify(first))
})

// ---------------------------------------------------------------------------------------------
// 渲染预算
// ---------------------------------------------------------------------------------------------

test('skill-review · 渲染文本放得进 6000 码点预算，且省略计数如实', () => {
  const packet = bigPacket()
  const rendered = renderSkillReviewPacket(packet)
  assert.equal(SKILL_REVIEW_RENDER_LIMIT, 6000)
  const length = Array.from(rendered.text).length
  assert.equal(length <= SKILL_REVIEW_RENDER_LIMIT, true, `渲染长度 ${length}`)
  assert.equal(length > 2000, true, `渲染长度 ${length} —— 这个夹具不该被压成骨架`)
  assert.equal(rendered.length, length)
  assert.equal(packet.review.render.limit, SKILL_REVIEW_RENDER_LIMIT)
  assert.equal(packet.review.render.length, length)
  const elidedTotal = Object.values(packet.review.render.elided).reduce((sum, count) => sum + count, 0)
  assert.equal(
    packet.review.limitations.includes(SKILL_REVIEW_LIMITATIONS.digestElided),
    elidedTotal > 0,
    '有省略就必须补上 review-digest-elided-for-size',
  )
  if (elidedTotal > 0) {
    assert.equal(rendered.text.includes('省略'), true)
    assert.equal(rendered.text.includes('完整数据在 Packet 的'), true)
  }
  // 省略只影响这段文字：Packet 里的条目一条不少
  assert.equal(packet.review.validationFindings.findings.length > 0, true)
  assert.equal(packet.review.declaredFacts.framework.sections.length >= 11, true)
  // 强制一个装不下的预算：必须真的省略、必须真的说出来、必须仍然放进预算
  const forced = renderSkillReviewPacket(packet, { limit: 2000 })
  const forcedTotal = Object.values(forced.elided).reduce((sum, count) => sum + count, 0)
  assert.equal(forcedTotal > 0, true)
  assert.equal(forced.text.includes('本次按渲染预算省略了'), true)
  assert.equal(Array.from(forced.text).length <= 2000, true)
})

test('skill-review · 预算收紧只会让这段文字更短、省略更多（阶梯单调）', () => {
  const packet = bigPacket()
  let previousLength = Infinity
  let previousElided = -1
  for (const limit of [100000, 6000, 4000, 2500, 1500, 900, 500, 300]) {
    const rendered = renderSkillReviewPacket(packet, { limit })
    const length = Array.from(rendered.text).length
    const elided = Object.values(rendered.elided).reduce((sum, count) => sum + count, 0)
    assert.equal(length <= limit, true, `limit ${limit} 超预算：${length}`)
    assert.equal(length <= previousLength, true, `limit ${limit} 反而更长了`)
    assert.equal(elided >= previousElided, true, `limit ${limit} 省略得比上一级还少`)
    previousLength = length
    previousElided = elided
  }
  // 阶梯的第一级就是「每条明细最多 12 条」，所以预算再宽也不会无限变长；该省的必须说出来
  const roomy = renderSkillReviewPacket(packet, { limit: 100000 })
  assert.equal(Object.values(roomy.elided).reduce((sum, count) => sum + count, 0) > 0, true)
  assert.equal(roomy.text.includes('本次按渲染预算省略了'), true)
  assert.equal(roomy.text.includes('完整数据在 Packet 的'), true)
  // 连骨架都放不下时按整行从末尾裁，并如实说明（不裁中间、不静默）
  const trimmed = renderSkillReviewPacket(packet, { limit: 300 })
  assert.equal(Array.from(trimmed.text).length <= 300, true)
  assert.equal(trimmed.text.includes('已去掉'), true)
  assert.equal(trimmed.text.includes('留在 Packet 里'), true)
  assert.equal(SKILL_REVIEW_DIGEST_LEVELS.at(-1), 0)
  assert.equal(packet.review.limitations.includes(SKILL_REVIEW_LIMITATIONS.digestElided), true)
})
test('skill-review · 渲染文本里没有因果断言，也没有分数', () => {
  const text = renderSkillReviewPacket(bigPacket()).text
  for (const word of ['导致', 'proves', 'causes', '评分', '百分比', 'compliance rate']) {
    assert.equal(text.includes(word), false, `渲染文本里出现了 ${word}`)
  }
  assert.equal(text.includes('不给分、不排名'), true)
  assert.equal(text.includes('加载 ≠ 使用'), true)
})

// ---------------------------------------------------------------------------------------------
// 失败与降级输入
// ---------------------------------------------------------------------------------------------

test('skill-review · 失败信封是稳定形状，不抛异常', () => {
  const packet = buildSkillReviewPacket({ ok: false, skillName: 'nope', reason: 'unknown-skill' })
  assert.deepEqual(packet, {
    schemaVersion: SKILL_REVIEW_SCHEMA_VERSION,
    ok: false,
    skillName: 'nope',
    reason: 'unknown-skill',
    review: null,
  })
  assert.deepEqual(validate(SKILL_REVIEW_PACKET_SCHEMA, packet), [])
  assert.equal(renderSkillReviewPacket(packet).text.includes('读不到这个 Skill'), true)
  for (const reason of SKILL_REVIEW_FAILURE_REASONS) {
    assert.equal(skillReviewFailure('x', reason).reason, reason)
  }
  assert.equal(skillReviewFailure('x', 'made-up').reason, 'unknown-skill')
  assert.equal(skillReviewFailure(undefined, undefined).skillName, '')
})

test('skill-review · 读不到的输入一律降级成 unavailable，不编内容', () => {
  const undecided = buildSkillReviewPacket({ skillName: 'ghost', ok: true, detail: { skillName: 'ghost' } })
  assert.equal(undecided.ok, true)
  assert.equal(undecided.review.declaredFacts.framework.available, false)
  assert.equal(undecided.review.declaredFacts.flow.available, false)
  assert.equal(undecided.review.observedFacts.runtimeLogic.available, false)
  assert.equal(undecided.review.validationFindings.status, 'unknown')
  assert.equal(undecided.review.validationFindings.statusLabel, '无法判断')
  assert.equal(undecided.review.profiles.length, 0)
  assert.deepEqual(validate(SKILL_REVIEW_PACKET_SCHEMA, undecided), [])
  const rendered = renderSkillReviewPacket(undecided)
  assert.equal(Array.from(rendered.text).length <= SKILL_REVIEW_RENDER_LIMIT, true)
  assert.equal(rendered.text.includes('读不到 SKILL.md 的正文'), true)
})

test('skill-review · 工具指引说清「只读 / 不是分数 / 要先问用户」', () => {
  for (const needle of [
    'Read-only audit',
    'does not load, run or modify the skill',
    'never writes files',
    'no rating, no ranking, no benchmark',
    'wait for the user to confirm',
    'not the `skill` tool',
  ]) {
    assert.equal(SKILL_REVIEW_GUIDANCE.includes(needle), true, `指引里缺少：${needle}`)
  }
})
