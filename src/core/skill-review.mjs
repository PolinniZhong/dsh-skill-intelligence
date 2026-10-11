/**
 * Skill Review —— 把「这个 Skill 声明了什么 / 静态验收怎么说 / 本次会话观察到了什么 / 哪些还不知道」
 * 装成一个 **Structured Review Packet**，交给 Agent 自己去读（V1.3）。
 *
 * 三条不许破的边界：
 *
 * 1. **只读，且不新增事实来源。** 这个模块不写文件、不跑 `scripts/`、不建 Agent、不调模型；
 *    `buildSkillReviewPacket()` 只**投影**别的纯函数已经算出来的结果，不重算语义、不补猜测。
 * 2. **不发会话数据，也不发正文。** Packet 里不许出现 SKILL.md 正文、正文摘录、绝对路径、
 *    工具参数与结果、会话标识。`SKILL_REVIEW_FORBIDDEN_KEYS` 就是那份键名清单（与证据快照同源），
 *    测试对它做**递归结构级**断言。正文摘录（小节的 `opening` / `items[].text`）刻意进不来：
 *    Agent 需要原文时用普通的文件读取工具自己读。
 * 3. **渲染有预算，且不许静默截断。** 模型看到的是 `renderSkillReviewPacket()` 的文本，
 *    `SKILL_REVIEW_RENDER_LIMIT` 是硬上限（内核的结果裁剪器会在 8192 字符处把中间换掉）；
 *    超预算时**逐级省略并如实报出省略了多少**，省略这件事本身也会成为一个限制条目。
 *
 * 词表一律复用既有模块，本模块不新造词汇：状态只有 `declared / observed / unavailable`（没有推断档），
 * 结论只有 `pass / needs-fix / unknown`，限制来自 `SKILL_VALIDATION_LIMITATIONS` 与
 * `EVIDENCE_LIMITATION_CODES`。
 */
import {
  EVIDENCE_BOUNDARY_LABELS,
  EVIDENCE_CHAIN_STAGE_LABELS,
  EVIDENCE_DRIFT_LABELS,
  EVIDENCE_EXPORT_FORBIDDEN_KEYS,
  EVIDENCE_INEQUALITIES,
  EVIDENCE_LIMITATION_LABELS,
  EVIDENCE_STATUS_LABELS,
  buildSkillEvidence,
} from './skill-evidence.mjs'
import { SKILL_VALIDATION_LIMITATIONS, skillValidationStatusLabel } from './skill-validation.mjs'
import { flowEvidenceLabel, flowKindLabel } from './flow-evidence.mjs'

// ---------------------------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------------------------

export const SKILL_REVIEW_SCHEMA_VERSION = 1

/** 注册给模型的工具名。宿主与守卫都按这个字面量对齐。 */
export const SKILL_REVIEW_TOOL_NAME = 'skill_review'

/** 渲染文本的硬上限（码点）。内核 `dsh-compaction-tool-result-pruner` 默认在 8192 字符处裁中间，留出余量。 */
export const SKILL_REVIEW_RENDER_LIMIT = 6000

/**
 * Packet 里不许出现的键名。与证据快照（`buildEvidenceExport`）同一份清单：
 * 会话标识 / 事件标识 / 消息 / 工具参数与结果 / 路径 / 凭据 / 思维链。
 */
export const SKILL_REVIEW_FORBIDDEN_KEYS = Object.freeze([...EVIDENCE_EXPORT_FORBIDDEN_KEYS])

/** 稳定失败原因。读不到就说读不到，不抛异常、也不假装成功。 */
export const SKILL_REVIEW_FAILURE_REASONS = Object.freeze([
  'no-agent',
  'invalid-skill-name',
  'invalid-profiles',
  'unknown-skill',
  'registry-unavailable',
  // 「Skill 在册，但这份 SKILL.md 正文读不出来」——与「没有这个 Skill」是两句话：
  // 前者说明路径在、内容读不到（权限 / 编码 / 竞态），后者说明它根本不在册。
  'skill-file-unreadable',
])

/** 这个模块自己产生的限制条目（其余限制一律沿用既有词表）。 */
export const SKILL_REVIEW_LIMITATIONS = Object.freeze({
  /** 渲染文本按预算降级过，省略了多少写在 `review.render.elided` 里。 */
  digestElided: 'review-digest-elided-for-size',
})

/** Packet 各列表的条数上限；被切掉的条数写在同级的 `*Omitted` 字段里。 */
export const SKILL_REVIEW_PACKET_LIMITS = Object.freeze({
  roles: 8,
  sections: 60,
  unclassified: 40,
  resourceGroups: 24,
  resourcePaths: 40,
  flowSteps: 40,
  chainStages: 4,
  chainFacts: 40,
  tableRows: 5,
  findings: 40,
  rules: 60,
  unjudged: 40,
  runtimeStages: 8,
  runtimeFacts: 40,
  limitations: 40,
})

/** 渲染降级阶梯：每一级就是条目列表的可见条数。0 = 只留骨架与计数。 */
export const SKILL_REVIEW_DIGEST_LEVELS = Object.freeze([12, 8, 5, 3, 0])

/**
 * 工具说明。默认放在 `description` 里（`SKILL_REVIEW_PARAMETERS_SCHEMA` / 宿主注册处都引用它）。
 *
 * 三件事必须说清：**它是什么**（读数，不是分数）、**它不是什么**（不加载、不执行、不改文件，
 * 也不要和加载 Skill 的那个 `skill` 工具混淆）、**什么时候用**（建完或改完之后，且先问过用户）。
 */
export const SKILL_REVIEW_GUIDANCE = [
  'Review one installed skill and return a structured, read-only review packet: what the skill declares',
  '(sections, roles, declared workflow, declared resources), the static validation findings with rule ids',
  'and sources, what this session observed (evidence statuses and runtime facts), and the closed list of',
  'limitations. Fields that could not be established are reported as unavailable — never guessed.',
  '',
  'Read-only audit: it does not load, run or modify the skill, never writes files, and never edits SKILL.md.',
  'It is not a score: no rating, no ranking, no benchmark. It is not the `skill` tool either — that one loads',
  'a skill\'s instructions so you can act on a task; this one only reports on a skill.',
  '',
  'Use it after creating or editing a skill, or when the user asks whether a skill is well formed. Propose the',
  'review first and wait for the user to confirm before calling it; the user may also ask for one directly.',
  'Any follow-up change still happens in this conversation with the normal file tools.',
].join('\n')

/**
 * 第二引导通道：`systemPrompt.section` 的正文（任务书 §8 的备选）。
 *
 * 工具的 `description` 是**低注意力频道** —— 模型只有在已经在想这个工具时才会读到它。真机上
 * 「建完 / 改完 Skill 的新会话」三次都没有主动提议审查，所以才补这条常驻但极短的提醒。
 *
 * 它必须与工具可见性**同生共死**：宿主按 agent 注册这个节，并在
 * `agent.ctx.tools.get(SKILL_REVIEW_TOOL_NAME, agent)` 取不到工具时返回空串，于是
 * `ctx.tools.restrict()` / 子 agent 的 `toolFilter` 把工具挡掉时，这段文字随之消失。
 */
export const SKILL_REVIEW_SECTION = [
  'Skill lifecycle: after you create or edit a skill (its SKILL.md), offer the user a read-only',
  '`skill_review` audit of it, and wait for their confirmation before calling the tool. It reports',
  'declarations, static validation findings, observed evidence and limitations; it never loads, runs',
  'or modifies anything, and it is not the `skill` tool.',
].join('\n')

/** 工具入参的原生 JSON Schema（原生 `ctx.tools.register()` 收的就是 JSON Schema，不是自研 DSL）。 */
export const SKILL_REVIEW_PARAMETERS_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    skillName: {
      type: 'string',
      description: 'The exact installed skill name to review (kebab-case, as shown in the skill list).',
    },
    profiles: {
      type: 'array',
      description: 'Optional validation profiles to check against: common, standard, dsh, openai, anthropic, microsoft. Omit for the defaults (common, standard, dsh). Unknown ids are ignored and reported back.',
      items: { type: 'string' },
    },
  },
  required: ['skillName'],
})

const anyObject = Object.freeze({ type: 'object', additionalProperties: true })
const stringArray = Object.freeze({ type: 'array', items: { type: 'string' } })

function anyOfObject(properties) {
  return Object.freeze({ type: 'object', additionalProperties: true, properties })
}

const DECLARED_FACTS_SCHEMA = anyOfObject({
  framework: { description: 'Declared structure of SKILL.md, or null when it could not be read.' },
  flow: { description: 'Declared workflow steps with their evidence relationship, or null.' },
})

const OBSERVED_FACTS_SCHEMA = anyOfObject({
  evidence: { description: 'The evidence model: identity, status counts, four-stage chain, boundaries, table, drift.' },
  runtimeLogic: { description: 'Observed runtime stages with their facts and limitations.' },
})

const VALIDATION_SCHEMA = anyOfObject({
  status: { type: 'string', enum: ['pass', 'needs-fix', 'unknown'] },
  statusLabel: { type: 'string' },
  summary: anyObject,
  findings: { type: 'array', items: anyObject },
  unjudged: { type: 'array', items: anyObject },
  rules: { type: 'array', items: anyObject },
  limitations: stringArray,
})

/**
 * Packet 的原生 JSON Schema。宿主把它直接当 `output.schema` 用，内核出参校验是硬闸
 * （不合 schema 的结果会被包成 `isError`），所以这份 schema 与 `buildSkillReviewPacket()` 的输出
 * 必须逐字段对齐 —— `test/skill-review.test.mjs` 用一个零依赖的 mini-validator 走一遍。
 *
 * 信封与三个轴用严格节点（多一个字段就报错），轴里面的投影用宽松节点（它们的形状由各自的核心模块
 * 负责，这里只声明「是一个对象」）。
 */
export const SKILL_REVIEW_PACKET_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'ok', 'skillName', 'reason', 'review'],
  properties: {
    schemaVersion: { type: 'integer', const: SKILL_REVIEW_SCHEMA_VERSION },
    ok: { type: 'boolean' },
    skillName: { type: 'string' },
    // 内核的 JSON Schema 子集不支持 type 数组；可空字段只能写成 oneOf（恰好命中一支）。
    reason: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    // 失败信封里 `review` 是 `null`，所以这一格同样只能写 oneOf（oneOf 旁不许有兄弟关键字）。
    review: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'skillName',
            'profiles',
            'declaredFacts',
            'observedFacts',
            'validationFindings',
            'limitations',
            'render',
            'boundaries',
          ],
          properties: {
            skillName: { type: 'string' },
            profiles: stringArray,
            declaredFacts: DECLARED_FACTS_SCHEMA,
            observedFacts: OBSERVED_FACTS_SCHEMA,
            validationFindings: VALIDATION_SCHEMA,
            limitations: stringArray,
            render: {
              type: 'object',
              additionalProperties: false,
              required: ['limit', 'length', 'elided'],
              properties: {
                limit: { type: 'integer' },
                length: { type: 'integer' },
                elided: anyObject,
              },
            },
            boundaries: stringArray,
          },
        },
      ],
    },
  },
})

/**
 * 成功信封的 `review` 键顺序（schema 与渲染都按它走）。失败信封里 `review` 是 `null`。
 */
const REVIEW_KEYS = Object.freeze([
  'skillName',
  'profiles',
  'declaredFacts',
  'observedFacts',
  'validationFindings',
  'limitations',
  'render',
  'boundaries',
])

// ---------------------------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------------------------

const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const arr = (value) => (Array.isArray(value) ? value : [])
const bool = (value) => value === true
const num = (value) => (Number.isFinite(value) ? value : 0)

/** 把任意值压成单行短字符串。空值一律给空串，不给 `undefined`。 */
function collapse(value) {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return ''
}

/** 单行、限长（按 UTF-16 单元切，永远 ≤ max）。 */
function clip(value, max) {
  const text = collapse(value)
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
}

/** 取双语对象里的中文；不是双语对象就当普通字符串处理。 */
function zhOf(value) {
  if (typeof value === 'string') return collapse(value)
  const safe = obj(value)
  return collapse(safe.zh)
}

/** 取双语对象里的英文，取不到就退回中文。 */
function enOf(value) {
  if (typeof value === 'string') return collapse(value)
  const safe = obj(value)
  return collapse(safe.en) || collapse(safe.zh)
}

/** 一个列表被切掉多少。 */
function omittedOf(list, kept) {
  return Math.max(0, arr(list).length - kept)
}

// ---------------------------------------------------------------------------------------------
// 投影：声明
// ---------------------------------------------------------------------------------------------

/**
 * 声明结构（来自 `buildSkillFramework()`）。**正文摘录一律不进**：`opening` 与 `items[].text` 是
 * SKILL.md 的原文片段，要原文请让 Agent 用普通文件工具自己读。
 */
export function projectSkillReviewFramework(framework) {
  const safe = obj(framework)
  const limit = SKILL_REVIEW_PACKET_LIMITS
  if (safe.sectionCount === undefined && arr(safe.sections).length === 0) {
    return {
      available: false,
      reason: 'framework-unavailable',
      sectionCount: 0,
      roleCount: 0,
      roles: [],
      absentRoles: [],
      sections: [],
      sectionsOmitted: 0,
      unclassified: [],
      unclassifiedOmitted: 0,
      resources: null,
      limitations: [],
    }
  }

  const roles = arr(safe.roles).slice(0, limit.roles).map((entry) => {
    const role = obj(entry)
    return {
      id: collapse(role.role),
      labelZh: zhOf(role.label),
      labelEn: enOf(role.label),
      hintZh: zhOf(role.hint),
      sectionCount: arr(role.sections).length,
    }
  })
  const sections = arr(safe.sections).slice(0, limit.sections).map((entry) => {
    const section = obj(entry)
    return {
      id: collapse(section.id),
      title: clip(section.title, 160),
      line: num(section.line),
      role: collapse(section.role) || null,
      synthetic: bool(section.synthetic),
      level: num(section.level),
      itemCount: num(section.itemCount),
      childCount: arr(section.children).length || num(section.childCount),
      linkCount: num(section.linkCount),
      tables: num(section.tables),
      codeBlocks: num(section.codeBlocks),
    }
  })
  const coverage = obj(safe.coverage)
  const unclassified = arr(safe.unclassified).map((id) => collapse(id)).filter(Boolean)
  const resources = projectSkillReviewResources(safe.resources)
  return {
    available: true,
    reason: null,
    source: collapse(safe.source) || null,
    noteZh: zhOf(safe.note),
    disclosureNoteZh: zhOf(safe.disclosureNote),
    sectionLevel: num(safe.sectionLevel),
    sectionCount: num(safe.sectionCount),
    roleCount: roles.length,
    presentRoles: arr(coverage.present).map((id) => collapse(id)).filter(Boolean),
    absentRoles: arr(coverage.absent).map((id) => collapse(id)).filter(Boolean),
    roles,
    rolesOmitted: omittedOf(safe.roles, roles.length),
    sections,
    sectionsOmitted: omittedOf(safe.sections, sections.length),
    unclassified: unclassified.slice(0, limit.unclassified),
    unclassifiedOmitted: omittedOf(unclassified, limit.unclassified),
    resources,
    limitations: arr(safe.limitations).map((code) => collapse(code)).filter(Boolean),
  }
}

/** 声明资源（`resources.declared` 只留条数：路径在分组里，`resources.base` 带绝对路径，整块不进）。 */
function projectSkillReviewResources(resources) {
  const safe = obj(resources)
  if (safe.declaredCount === undefined && safe.loadedCount === undefined && arr(safe.groups).length === 0) return null
  const limit = SKILL_REVIEW_PACKET_LIMITS
  const groups = arr(safe.groups).slice(0, limit.resourceGroups).map((entry) => {
    const group = obj(entry)
    const paths = arr(group.resourcePaths).map((path) => clip(path, 200)).filter(Boolean)
    return {
      title: clip(group.title, 160) || null,
      role: collapse(group.role) || null,
      line: num(group.line),
      count: num(group.count),
      resourcePaths: paths.slice(0, limit.resourcePaths),
      resourcePathsOmitted: omittedOf(paths, limit.resourcePaths),
    }
  })
  return {
    declaredCount: num(safe.declaredCount),
    loadedCount: num(safe.loadedCount),
    groups,
    groupsOmitted: omittedOf(safe.groups, groups.length),
    tierTitles: arr(safe.tiers).map((tier) => clip(obj(tier).title, 120)).filter(Boolean),
    noteZh: zhOf(safe.note),
  }
}

/** 声明流程（来自 `attachEvidenceToFlow()`，运行时只能标注它，不能改它）。 */
export function projectSkillReviewFlow(flow) {
  const safe = obj(flow)
  const steps = arr(safe.steps)
  if (steps.length === 0 && safe.stepCount === undefined) {
    return { available: false, reason: 'flow-unavailable', stepCount: 0, steps: [], stepsOmitted: 0, limitations: [] }
  }
  const limit = SKILL_REVIEW_PACKET_LIMITS
  const projected = steps.slice(0, limit.flowSteps).map((entry) => {
    const step = obj(entry)
    const evidence = obj(step.evidence)
    const relationship = collapse(evidence.relationship)
    return {
      id: collapse(step.id),
      order: num(step.order),
      title: clip(step.title, 200),
      kind: collapse(step.kind) || null,
      kindLabel: clip(flowKindLabel(step.kind, 'zh'), 40),
      line: num(step.line),
      evidenceType: collapse(step.evidenceType) || null,
      relationship: relationship || null,
      relationshipLabel: relationship ? clip(flowEvidenceLabel(relationship, 'zh'), 40) : null,
      limitation: collapse(evidence.limitation) || null,
      matchCount: num(evidence.matchCount),
      modelIntentPresent: bool(obj(evidence.modelIntent).present),
    }
  })
  return {
    available: true,
    reason: null,
    source: collapse(safe.source) || null,
    channel: collapse(safe.channel) || null,
    headingCount: num(safe.headingCount),
    orderedListCount: num(safe.orderedListCount),
    stepCount: num(safe.stepCount),
    truncated: bool(safe.truncated),
    withheldCount: num(safe.withheldCount),
    noteZh: zhOf(safe.note),
    steps: projected,
    stepsOmitted: omittedOf(steps, projected.length),
    limitations: arr(safe.limitations).map((code) => collapse(code)).filter(Boolean),
  }
}

// ---------------------------------------------------------------------------------------------
// 投影：会话观察到的
// ---------------------------------------------------------------------------------------------

const STATUS_LABEL = (status) => {
  const entry = EVIDENCE_STATUS_LABELS[collapse(status)]
  return entry ? clip(zhOf(entry), 20) : collapse(status)
}

/** 证据模型（来自 `buildSkillEvidence()`）：身份 / 四段链 / 边界 / 状态表 / 漂移 / 不等式。 */
export function projectSkillReviewEvidence(model) {
  const safe = obj(model)
  if (Object.keys(safe).length === 0) {
    return { available: false, reason: 'evidence-unavailable', limitationCodes: [], inequalities: [...EVIDENCE_INEQUALITIES] }
  }
  const limit = SKILL_REVIEW_PACKET_LIMITS
  const identity = obj(safe.identity)
  const chain = arr(safe.chain).slice(0, limit.chainStages).map((entry) => {
    const stage = obj(entry)
    const id = collapse(stage.id)
    const status = collapse(stage.status)
    const facts = arr(stage.facts).slice(0, limit.chainFacts).map((fact) => {
      const item = obj(fact)
      return {
        label: clip(zhOf(item.label), 120),
        kind: collapse(item.kind) || null,
        value: clip(item.value, 200),
        status: collapse(item.status) || null,
      }
    })
    return {
      id,
      labelZh: zhOf(stage.label) || zhOf(EVIDENCE_CHAIN_STAGE_LABELS[id]),
      status,
      statusLabel: STATUS_LABEL(status),
      factCount: arr(stage.facts).length,
      facts,
      factsOmitted: omittedOf(stage.facts, facts.length),
      limitations: arr(stage.limitations).map((item) => collapse(obj(item).code ?? item)).filter(Boolean),
    }
  })
  const table = arr(safe.table).slice(0, limit.tableRows).map((entry) => {
    const row = obj(entry)
    const status = collapse(row.status)
    return {
      subject: clip(zhOf(row.fact), 160),
      subjectId: collapse(row.subjectId) || null,
      status,
      statusLabel: STATUS_LABEL(status),
      source: clip(zhOf(row.source), 200),
      limitation: clip(row.limitation, 200) || null,
    }
  })
  const drift = obj(safe.drift)
  const driftState = collapse(drift.state)
  const evaluation = obj(safe.evaluation)
  return {
    available: true,
    reason: null,
    statusCounts: obj(safe.statusCounts),
    skillFingerprint: clip(obj(identity.skillFingerprint).value, 120) || null,
    sourceIdentity: {
      status: collapse(obj(identity.sourceIdentity).status) || null,
      provider: clip(obj(identity.sourceIdentity).provider, 80) || null,
      kind: clip(obj(identity.sourceIdentity).kind, 80) || null,
      resourceKind: clip(obj(identity.sourceIdentity).resourceKind, 40) || null,
    },
    instruction: {
      status: collapse(obj(identity.instructionFingerprint).status) || null,
      match: clip(obj(identity.instructionFingerprint).match, 40) || null,
      current: clip(obj(identity.instructionFingerprint).current, 120) || null,
      observedCount: arr(obj(identity.instructionFingerprint).observed).length,
    },
    chain,
    chainOmitted: omittedOf(safe.chain, chain.length),
    boundaries: arr(safe.boundaries).slice(0, limit.chainStages + 2).map((entry) => {
      const boundary = obj(entry)
      const id = collapse(boundary.id)
      const label = obj(EVIDENCE_BOUNDARY_LABELS[id])
      const statement = boundary.statement ?? boundary.text ?? boundary.note
      return {
        id,
        labelZh: zhOf(boundary.label) || zhOf(label),
        statementZh: clip(zhOf(statement), 240) || null,
      }
    }),
    table,
    tableOmitted: omittedOf(safe.table, table.length),
    drift: {
      state: driftState || null,
      labelZh: zhOf(EVIDENCE_DRIFT_LABELS[driftState]),
      noteZh: clip(zhOf(drift.note), 200) || null,
    },
    inequalities: arr(safe.inequalities).length > 0
      ? arr(safe.inequalities).map((line) => clip(line, 80))
      : [...EVIDENCE_INEQUALITIES],
    limitationCodes: arr(safe.limitationCodes).map((code) => collapse(code)).filter(Boolean),
    limitationLabels: arr(safe.limitationCodes)
      .map((code) => ({ code: collapse(code), labelZh: zhOf(EVIDENCE_LIMITATION_LABELS[collapse(code)]) }))
      .filter((entry) => entry.code),
    // 评测条件不进这个包（那属于 Skill 评测），但要把「这里没有」说清楚。
    evaluationAvailable: bool(evaluation.available),
    notes: { scopeZh: zhOf(obj(safe.notes).scope), noScoreZh: zhOf(obj(safe.notes).noScore) },
  }
}

/** 运行事实（来自 `buildSkillRuntimeLogic()`）：五段、每段的真实事实与它自己的限制。 */
export function projectSkillReviewRuntimeLogic(runtimeLogic) {
  const safe = obj(runtimeLogic)
  const stages = arr(safe.stages)
  if (stages.length === 0) {
    return { available: false, reason: 'runtime-logic-unavailable', stageCount: 0, stages: [], stagesOmitted: 0, limitations: [] }
  }
  const limit = SKILL_REVIEW_PACKET_LIMITS
  const projected = stages.slice(0, limit.runtimeStages).map((entry) => {
    const stage = obj(entry)
    const facts = arr(stage.facts).slice(0, limit.runtimeFacts).map((fact) => {
      const item = obj(fact)
      return {
        label: clip(zhOf(item.label), 120),
        kind: collapse(item.kind) || null,
        value: clip(item.value, 200) || null,
      }
    })
    return {
      id: collapse(stage.id),
      order: num(stage.order),
      labelZh: zhOf(stage.label),
      hintZh: zhOf(stage.hint),
      state: collapse(stage.state) || null,
      statementZh: clip(zhOf(stage.statement), 240) || null,
      factCount: arr(stage.facts).length,
      facts,
      factsOmitted: omittedOf(stage.facts, facts.length),
      limitations: arr(stage.limitations).map((item) => collapse(obj(item).code ?? item)).filter(Boolean),
    }
  })
  return {
    available: true,
    reason: null,
    stageCount: num(safe.stageCount),
    observedCount: num(safe.observedCount),
    noteZh: zhOf(safe.note),
    stages: projected,
    stagesOmitted: omittedOf(stages, projected.length),
    limitations: arr(safe.limitations).map((item) => collapse(obj(item).code ?? item)).filter(Boolean),
  }
}

// ---------------------------------------------------------------------------------------------
// 投影：静态验收
// ---------------------------------------------------------------------------------------------

const UNJUDGED_REASONS = Object.freeze({
  'no-evaluator': 'no-evaluator',
  'no-directory-listing': 'no-directory-listing',
  'skill-file-unreadable': 'skill-file-unreadable',
})

/**
 * 静态验收（来自 `buildSkillValidation()`）。**规则与状态一个字都不重写**：
 * 结论只有 `pass / needs-fix / unknown`，`unjudged` 是「没判定的」，不许被读成「通过」。
 */
export function projectSkillReviewValidation(validation) {
  const safe = obj(validation)
  if (Object.keys(safe).length === 0) {
    return {
      available: false,
      reason: 'validation-unavailable',
      status: 'unknown',
      statusLabel: skillValidationStatusLabel('unknown', 'zh'),
      summary: { errors: 0, warnings: 0, info: 0, skipped: 0 },
      profileIds: [],
      profiles: [],
      findings: [],
      findingsOmitted: 0,
      unjudged: [],
      unjudgedOmitted: 0,
      rules: [],
      limitations: [...SKILL_VALIDATION_LIMITATIONS],
    }
  }
  const limit = SKILL_REVIEW_PACKET_LIMITS
  const status = collapse(safe.status) || 'unknown'
  const findings = arr(safe.findings).slice(0, limit.findings).map((entry) => {
    const finding = obj(entry)
    return {
      id: collapse(finding.id),
      profile: collapse(finding.profile) || null,
      severity: collapse(finding.severity) || null,
      title: clip(finding.title, 200),
      detail: clip(finding.detail, 400),
      fact: clip(finding.fact, 240) || null,
      note: clip(finding.note, 240) || null,
      sourceLabel: clip(finding.sourceLabel, 80) || null,
      sourceKind: collapse(finding.sourceKind) || null,
    }
  })
  const rules = arr(safe.rules).slice(0, limit.rules).map((entry) => {
    const rule = obj(entry)
    return {
      id: collapse(rule.id),
      profile: collapse(rule.profile) || null,
      severity: collapse(rule.severity) || null,
      title: clip(rule.title, 200),
      state: collapse(rule.state) || null,
      sourceLabel: clip(rule.sourceLabel, 80) || null,
      sourceKind: collapse(rule.sourceKind) || null,
    }
  })
  const reasonById = new Map(arr(safe.skipped).map((entry) => [collapse(obj(entry).id), collapse(obj(entry).reason)]))
  const unjudgedAll = arr(safe.rules)
    .filter((entry) => collapse(obj(entry).state) === 'skipped')
    .map((entry) => {
      const rule = obj(entry)
      const id = collapse(rule.id)
      const reason = reasonById.get(id) || ''
      return {
        id,
        severity: collapse(rule.severity) || null,
        title: clip(rule.title, 200),
        fact: clip(rule.fact, 240) || null,
        reason: UNJUDGED_REASONS[reason] ?? (clip(reason, 80) || null),
      }
    })
  return {
    available: bool(safe.available),
    reason: collapse(safe.reason) || null,
    status,
    statusLabel: skillValidationStatusLabel(status, 'zh'),
    summary: {
      errors: num(obj(safe.summary).errors),
      warnings: num(obj(safe.summary).warnings),
      info: num(obj(safe.summary).info),
      skipped: num(obj(safe.summary).skipped),
    },
    profileIds: arr(safe.profileIds).map((id) => collapse(id)).filter(Boolean),
    profiles: arr(safe.profiles).map((entry) => {
      const profile = obj(entry)
      return {
        id: collapse(profile.id),
        kind: collapse(profile.kind) || null,
        kindLabelZh: zhOf(profile.kindLabel),
        labelZh: zhOf(profile.label),
        noteZh: clip(zhOf(profile.note), 200) || null,
        status: collapse(profile.status) || null,
        errors: num(profile.errors),
        warnings: num(profile.warnings),
        info: num(profile.info),
        skipped: num(profile.skipped),
        checked: num(profile.checked),
        total: num(profile.total),
      }
    }),
    findings,
    findingsOmitted: omittedOf(safe.findings, findings.length),
    unjudged: unjudgedAll.slice(0, limit.unjudged),
    unjudgedOmitted: omittedOf(unjudgedAll, limit.unjudged),
    rules,
    rulesOmitted: omittedOf(safe.rules, rules.length),
    notes: arr(safe.notes).map((note) => clip(note, 240)).filter(Boolean),
    content: {
      lineCount: num(obj(safe.content).lineCount),
      bodyLineCount: num(obj(safe.content).bodyLineCount),
      bytes: num(obj(safe.content).bytes),
      frontmatterPresent: bool(obj(safe.content).frontmatterPresent),
      frontmatterClosed: bool(obj(safe.content).frontmatterClosed),
      frontmatterFields: arr(obj(safe.content).frontmatterFields).map((key) => collapse(key)).filter(Boolean),
      descriptionLength: num(obj(safe.content).descriptionLength),
      resourcePathCount: obj(safe.content).resourcePathCount ?? null,
      referenceCount: num(obj(safe.content).referenceCount),
      truncated: bool(obj(safe.content).truncated),
    },
    limitations: arr(safe.limitations).length > 0
      ? arr(safe.limitations).map((code) => collapse(code)).filter(Boolean)
      : [...SKILL_VALIDATION_LIMITATIONS],
  }
}

// ---------------------------------------------------------------------------------------------
// Packet
// ---------------------------------------------------------------------------------------------

/** 收集所有轴上出现过的限制条目（去重、保序、限长）。 */
function collectLimitations(axes) {
  const seen = new Set()
  const out = []
  for (const axis of axes) {
    const safe = obj(axis)
    for (const code of [...arr(safe.limitations), ...arr(safe.limitationCodes)]) {
      const value = collapse(code)
      if (!value || seen.has(value)) continue
      seen.add(value)
      out.push(value)
    }
  }
  return out.slice(0, SKILL_REVIEW_PACKET_LIMITS.limitations)
}

function reviewBoundaries() {
  return [
    'read-only: nothing is loaded, executed or written; edits still happen in the conversation with normal file tools',
    'declared-vs-observed: SKILL.md declarations and observed evidence are reported side by side and never derived from each other',
    'no-score: no rating, no ranking, no benchmark, no compliance percentage',
    'no-session-data: no SKILL.md body, no body excerpts, no absolute paths, no tool arguments or results, no session identifiers',
  ]
}

/** 失败信封：稳定形状、不抛异常、说清为什么读不到。 */
export function skillReviewFailure(skillName, reason) {
  const name = collapse(skillName)
  const code = SKILL_REVIEW_FAILURE_REASONS.includes(reason) ? reason : 'unknown-skill'
  return {
    schemaVersion: SKILL_REVIEW_SCHEMA_VERSION,
    ok: false,
    skillName: name,
    reason: code,
    review: null,
  }
}

/**
 * 组装 Packet。输入要么是失败原因，要么是一份 `buildSkillDetail()` 的结果（宿主已经算好的事实）。
 *
 * @param {{ ok?: boolean, reason?: string, skillName?: string, detail?: object }} options
 */
export function buildSkillReviewPacket(options = {}) {
  const safe = obj(options)
  const skillName = collapse(safe.skillName) || collapse(obj(obj(safe.detail).summary).name)
  if (safe.ok === false) return skillReviewFailure(skillName, collapse(safe.reason))
  if (!skillName) return skillReviewFailure(skillName, 'unknown-skill')

  const detail = obj(safe.detail)
  const validation = projectSkillReviewValidation(detail.validation)
  const framework = projectSkillReviewFramework(detail.framework)
  const flow = projectSkillReviewFlow(detail.flow)
  const evidence = projectSkillReviewEvidence(buildSkillEvidence(detail))
  const runtimeLogic = projectSkillReviewRuntimeLogic(detail.runtimeLogic)
  const limitations = collectLimitations([validation, framework, flow, evidence, runtimeLogic])

  const review = {
    skillName,
    profiles: validation.profileIds,
    declaredFacts: { framework, flow },
    observedFacts: { evidence, runtimeLogic },
    validationFindings: validation,
    limitations,
    render: { limit: SKILL_REVIEW_RENDER_LIMIT, length: 0, elided: {} },
    boundaries: reviewBoundaries(),
  }
  const packet = {
    schemaVersion: SKILL_REVIEW_SCHEMA_VERSION,
    ok: true,
    skillName,
    reason: null,
    review,
  }

  // 渲染一次，把「实际长度」与「省略了多少」写回 Packet；有省略就补一条限制条目，再渲染一次
  // （补条目只会让文本变长，所以最多两轮就稳定）。
  for (let pass = 0; pass < 3; pass += 1) {
    const digest = renderSkillReviewPacket(packet)
    const elidedAny = Object.values(digest.elided).some((count) => num(count) > 0)
    const needsCode = elidedAny && !review.limitations.includes(SKILL_REVIEW_LIMITATIONS.digestElided)
    const settled = review.render.length === digest.length
      && JSON.stringify(review.render.elided) === JSON.stringify(digest.elided)
      && !needsCode
    review.render.length = digest.length
    review.render.elided = digest.elided
    if (needsCode) review.limitations.push(SKILL_REVIEW_LIMITATIONS.digestElided)
    if (settled) break
  }
  // 补过限制条目之后长度可能再变，最后再对一次账：Packet 里写的长度必须是这段文字的真实长度。
  const finalDigest = renderSkillReviewPacket(packet)
  review.render.length = finalDigest.length
  review.render.elided = finalDigest.elided
  return packet
}

// ---------------------------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------------------------

const ELIDED_KEYS = Object.freeze([
  'sections',
  'roles',
  'resourcePaths',
  'flowSteps',
  'chainFacts',
  'tableRows',
  'findings',
  'unjudged',
  'runtimeStages',
  'runtimeFacts',
  'limitations',
])

/** 限制条目：有封闭词表文案就带上 code，读起来是人话、也能被引用。 */
function limitationText(code) {
  const value = collapse(code)
  const label = zhOf(EVIDENCE_LIMITATION_LABELS[value])
  return label ? `${label}（${value}）` : value
}

function emptyElided() {
  const out = {}
  for (const key of ELIDED_KEYS) out[key] = 0
  return out
}

/**
 * 按某一级 cap 把 Packet 压成一段给模型看的文本。**每一行都是「字段 → 值」，没有任何推断**；
 * 被 cap 挡掉的条目在这里只体现为计数（`elided`），真实数据仍在 Packet 里。
 */
/** 收尾：长度一律按**码点**数（不是 UTF-16 长度）算，它是这段文字的唯一权威读数。 */
function finishDigest(lines, elided) {
  const text = lines.join('\n')
  return { text, length: Array.from(text).length, elided }
}

function composeSkillReviewDigest(packet, cap) {
  // `cap` 是「每条明细最多显示几条」。缺省时退回最宽的一级，绝不能退化成 0
  // ——那会让这段文字把每一条都写成「已省略」，而它其实一条都没看过。
  const visible = Number.isSafeInteger(cap) && cap >= 0 ? cap : SKILL_REVIEW_DIGEST_LEVELS[0]
  const review = obj(obj(packet).review)
  const declared = obj(review.declaredFacts)
  const observed = obj(review.observedFacts)
  const framework = obj(declared.framework)
  const flow = obj(declared.flow)
  const evidence = obj(observed.evidence)
  const runtimeLogic = obj(observed.runtimeLogic)
  const validation = obj(review.validationFindings)
  const elided = emptyElided()
  const lines = []
  const skillName = collapse(obj(packet).skillName)
  const ok = obj(packet).ok === true

  lines.push(`Skill Review · ${skillName || '(unknown)'} · 只读审查包`)
  if (!ok) {
    lines.push('')
    lines.push(`读不到这个 Skill：${collapse(obj(packet).reason) || 'unknown-skill'}`)
    lines.push('这不是「通过」，也不是「Skill 有问题」——只是这次没能把它读起来。')
    return finishDigest(lines, elided)
  }
  lines.push('')

  // ---- 结论 ---------------------------------------------------------------------------------
  lines.push('【结论】')
  const summary = obj(validation.summary)
  const profileIds = arr(review.profiles).join(', ')
  lines.push(
    `- 静态验收：${validation.statusLabel || validation.status || '无法判断'} · 错误 ${num(summary.errors)} / 警告 ${num(summary.warnings)} / 信息 ${num(summary.info)} / 未判定 ${num(summary.skipped)}${profileIds ? ` · 目标 ${profileIds}` : ''}`,
  )
  const counts = obj(evidence.statusCounts)
  if (evidence.available === true) {
    lines.push(
      `- 会话观察：声明 ${num(counts.declared)} · 已观察 ${num(counts.observed)} · 无法取得 ${num(counts.unavailable)} · 判据 ${num(counts.total)} 条`,
    )
  } else {
    lines.push('- 会话观察：这个 Skill 的证据模型这次没能建起来')
  }
  lines.push('- 这个包只写 SKILL.md 的声明与本次会话观察到的事实：不给分、不排名、也不判断 Skill 好不好。')
  lines.push('')

  // ---- 声明 ---------------------------------------------------------------------------------
  lines.push('【声明 · 来自 SKILL.md】')
  if (framework.available === true) {
    lines.push(
      `- 结构：${num(framework.sectionCount)} 个小节 · 角色 ${num(framework.roleCount)} 个${arr(framework.absentRoles).length > 0 ? ` · 没命中的角色：${arr(framework.absentRoles).join(' / ')}` : ''} · 未列入角色的章节 ${arr(framework.unclassified).length} 个`,
    )
    const roleList = arr(framework.roles)
    const shownRoles = cap > 0 ? roleList.slice(0, cap) : []
    elided.roles = num(framework.rolesOmitted) + (roleList.length - shownRoles.length)
    if (shownRoles.length > 0) {
      const shown = shownRoles
      lines.push(
        `- 蓝图：${shown.map((role) => `${role.labelZh || role.id} ${num(role.sectionCount)}${num(role.sectionCount) === 0 ? '（未声明）' : ''}`).join(' · ')}`,
      )
    }
    const sectionList = arr(framework.sections)
    const shownSections = cap > 0 ? sectionList.slice(0, cap) : []
    elided.sections = num(framework.sectionsOmitted) + (sectionList.length - shownSections.length)
    if (shownSections.length > 0) {
      const shown = shownSections
      lines.push(`- 小节（最多 ${cap} 条）：`)
      for (const section of shown) {
        lines.push(
          `  ${String(num(section.line)).padStart(4, ' ')} · ${section.title} [${section.role || 'unclassified'} · ${num(section.itemCount)} 项 · ${num(section.childCount)} 子节 · ${num(section.tables)} 表]`,
        )
      }
    }
    const resources = obj(framework.resources)
    if (resources && arr(resources.groups).length > 0) {
      lines.push(`- 资源：声明 ${num(resources.declaredCount)} 个引用，读到证据的 ${num(resources.loadedCount)} 个`)
      for (const group of arr(resources.groups)) {
        const paths = arr(group.resourcePaths)
        const shown = cap > 0 ? paths.slice(0, cap) : []
        elided.resourcePaths += paths.length - shown.length
        lines.push(
          `  · ${group.title || '(未命名分组)'}（${num(group.count)} 个）${shown.length > 0 ? `：${shown.join('、')}` : ''}`,
        )
      }
    }
  } else {
    lines.push('- 声明结构：读不到 SKILL.md 的正文，结构、流程与资源这一次都没有')
  }
  if (flow.available === true) {
    lines.push(
      `- 声明流程：${num(flow.stepCount)} 步${bool(flow.truncated) ? '（正文被截断，只抽取了前面一部分）' : ''}${num(flow.withheldCount) > 0 ? ` · ${num(flow.withheldCount)} 步因为没有标题被扣下` : ''}`,
    )
    const steps = arr(flow.steps)
    const shown = cap > 0 ? steps.slice(0, cap) : []
    elided.flowSteps = num(flow.stepsOmitted) + (steps.length - shown.length)
    for (const step of shown) {
      lines.push(
        `  ${String(num(step.order)).padStart(2, '0')} ${step.title} [${step.kindLabel || '其它'} · ${step.relationshipLabel || '无法判断'}${num(step.matchCount) > 0 ? ` · 相关证据 ${num(step.matchCount)} 条` : ''}]`,
      )
    }
  } else {
    lines.push('- 声明流程：SKILL.md 里没有可抽取的声明流程（这是结构事实，不是缺失）')
  }
  lines.push('- 正文原文与正文摘录不在这个包里：要读原文请用普通文件读取工具读 SKILL.md。')
  lines.push('')

  // ---- 观察 ---------------------------------------------------------------------------------
  lines.push('【本次会话观察到的】')
  if (evidence.available === true) {
    const identity = obj(evidence.instruction)
    lines.push(
      `- 身份：来源 ${obj(evidence.sourceIdentity).provider || '无法取得'} / ${obj(evidence.sourceIdentity).kind || '无法取得'} · 内容指纹 ${evidence.skillFingerprint || '无法取得'} · 指令指纹 ${identity.current || '无法取得'}（${identity.match || '无法取得'}）`,
    )
    if (arr(evidence.chain).length > 0) {
      lines.push(
        `- 四段链：${arr(evidence.chain).map((stage) => `${stage.labelZh || stage.id} ${stage.statusLabel}`).join(' → ')}`,
      )
    }
    for (const stage of arr(evidence.chain)) {
      const facts = arr(stage.facts)
      const shown = cap > 0 ? facts.slice(0, cap) : []
      elided.chainFacts += num(stage.factsOmitted) + (facts.length - shown.length)
      if (shown.length > 0) {
        lines.push(
          `  · ${stage.labelZh || stage.id}：${shown.map((fact) => `${fact.label} ${fact.value}`).join(' · ')}`,
        )
      }
      if (arr(stage.limitations).length > 0) lines.push(`    限制：${arr(stage.limitations).map(limitationText).join('、')}`)
    }
    const table = arr(evidence.table)
    const shownRows = cap > 0 ? table.slice(0, cap) : []
    elided.tableRows = num(evidence.tableOmitted) + (table.length - shownRows.length)
    if (shownRows.length > 0) {
      lines.push('- 证据状态表：')
      for (const row of shownRows) {
        lines.push(`  · ${row.subject} = ${row.statusLabel} · 来源 ${row.source}${row.limitation ? ` · 限制 ${row.limitation}` : ''}`)
      }
    }
    const drift = obj(evidence.drift)
    if (drift.state) lines.push(`- 漂移：${drift.labelZh || drift.state}（历史证据仍有意义，只是绑在另一份指纹上）`)
    if (arr(evidence.inequalities).length > 0) {
      lines.push(
        `- 三条不等式（不许被读成一条因果链）：${arr(evidence.inequalities).join(' · ')}。评测条件不在这个包里（它属于 Skill 评测）。`,
      )
    }
    if (arr(evidence.boundaries).length > 0) {
      lines.push(`- 边界：${arr(evidence.boundaries).map((boundary) => boundary.labelZh || boundary.id).join(' / ')}`)
    }
  } else {
    lines.push('- 证据模型这次没能建起来（原因写在 Packet 的 observedFacts.evidence 里）')
  }
  if (runtimeLogic.available === true) {
    const stages = arr(runtimeLogic.stages)
    const shown = cap > 0 ? stages.slice(0, cap) : []
    elided.runtimeStages = num(runtimeLogic.stagesOmitted) + (stages.length - shown.length)
    lines.push(`- 运行事实（${num(runtimeLogic.stageCount)} 段，观察到 ${num(runtimeLogic.observedCount)} 段）：`)
    for (const stage of shown) {
      const facts = arr(stage.facts)
      const shownFacts = cap > 0 ? facts.slice(0, cap) : []
      elided.runtimeFacts += facts.length - shownFacts.length
      lines.push(
        `  · ${stage.labelZh || stage.id}｜${stage.statementZh || ''}${shownFacts.length > 0 ? `（${shownFacts.map((fact) => `${fact.label} ${fact.value}`).join(' · ')}）` : ''}`,
      )
    }
  }
  lines.push('')

  // ---- 没判定的 -----------------------------------------------------------------------------
  const unjudged = arr(validation.unjudged)
  lines.push('【没判定的（是缺失，不是通过）】')
  if (unjudged.length === 0) {
    lines.push('- 这次没有未判定的规则。')
  } else {
    const shown = cap > 0 ? unjudged.slice(0, cap) : []
    elided.unjudged = num(validation.unjudgedOmitted) + (unjudged.length - shown.length)
    for (const rule of shown) {
      lines.push(`- ${rule.id} ${rule.title}${rule.reason ? ` · 原因 ${rule.reason}` : ''}`)
    }
  }
  lines.push('')

  // ---- 需要修正的 ---------------------------------------------------------------------------
  const findings = arr(validation.findings)
  lines.push(`【结论不是「通过」的条目（${findings.length} 条）】`)
  if (findings.length === 0) {
    lines.push('- 没有错误与警告。')
  } else {
    const shown = cap > 0 ? findings.slice(0, cap) : []
    elided.findings = num(validation.findingsOmitted) + (findings.length - shown.length)
    for (const finding of shown) {
      lines.push(
        `- ${finding.id} ${finding.title} · ${finding.severity} · ${finding.sourceLabel || '来源未知'} · ${finding.sourceKind || ''}`,
      )
      if (finding.detail) lines.push(`  ${finding.detail}`)
    }
  }
  lines.push('')

  // ---- 限制 ---------------------------------------------------------------------------------
  const limitations = arr(review.limitations)
  lines.push(`【限制（封闭词表，共 ${limitations.length} 条）】`)
  const shownLimits = visible > 0 ? limitations.slice(0, visible) : []
  elided.limitations = limitations.length - shownLimits.length
  for (const code of shownLimits) lines.push(`- ${limitationText(code)}`)
  if (limitations.length === 0) lines.push('- 没有额外限制。')
  lines.push('')

  // ---- 边界与省略 ---------------------------------------------------------------------------
  lines.push('【边界】')
  for (const line of arr(review.boundaries)) lines.push(`- ${line}`)
  const elidedTotal = Object.values(elided).reduce((sum, count) => sum + num(count), 0)
  if (elidedTotal > 0) {
    lines.push(
      `- 本次按渲染预算省略了 ${elidedTotal} 条明细（小节 ${elided.sections} / 角色 ${elided.roles} / 资源路径 ${elided.resourcePaths} / 流程步骤 ${elided.flowSteps} / 链事实 ${elided.chainFacts} / 状态表 ${elided.tableRows} / 运行段 ${elided.runtimeStages} / 运行事实 ${elided.runtimeFacts} / 修正条目 ${elided.findings} / 未判定 ${elided.unjudged} / 限制 ${elided.limitations}）；完整数据在 Packet 的 review.declaredFacts、review.observedFacts、review.validationFindings 与 review.limitations 里。`,
    )
    lines.push('- 省略只影响这段文字，不影响 Packet 本身；被省略的条目仍然在 Packet 的对应数组里。')
  }
  return finishDigest(lines, elided)
}

/**
 * 把 Packet 渲染成给模型看的文本：按 `SKILL_REVIEW_DIGEST_LEVELS` 逐级降级，第一段放进预算的就用它；
 * 全都放不进时输出最省的骨架（此时每一条明细都只是计数，不会静默丢掉中间一段）。
 *
 * @param {object} packet - `buildSkillReviewPacket()` 的结果。
 * @param {{ limit?: number }} [options]
 */
export function renderSkillReviewPacket(packet, options = {}) {
  const limit = Number.isSafeInteger(obj(options).limit) && obj(options).limit > 0
    ? obj(options).limit
    : SKILL_REVIEW_RENDER_LIMIT
  let last = null
  for (const cap of SKILL_REVIEW_DIGEST_LEVELS) {
    const digest = composeSkillReviewDigest(packet, cap)
    const length = Array.from(digest.text).length
    last = { text: digest.text, length, elided: digest.elided }
    if (length <= limit) return last
  }
  // 连骨架都超预算：保住末尾那段「如实说明」（省略说明与边界），其余从末尾一行一行去掉。
  // 说明行本身也占预算，而且位数随被裁行数变化，所以先按「含说明行」的总长裁，裁完再放它进去。
  // 判据：返回的文字一定 ≤ 预算；除非预算小到连一句说明都放不下 —— 那时宁可超一点，也不静默。
  const lines = String(last.text).split('\n')
  const noticeFor = (count) => `- 这段文字超过渲染预算（${limit} 码点），已去掉 ${count} 行明细；被去掉的条目仍然完整地留在 Packet 里。`
  const totalOf = (kept, count) => kept.reduce((sum, line) => sum + Array.from(line).length + 1, 0)
    + Array.from(noticeFor(count)).length + 1
  const protectedCount = Math.min(3, lines.length)
  const tail = lines.slice(lines.length - protectedCount)
  let head = lines.slice(0, lines.length - protectedCount)
  let dropped = 0
  while (head.length > 0 && totalOf([...head, ...tail], dropped) > limit) {
    head = head.slice(0, -1)
    dropped += 1
  }
  let kept = [...head, ...tail]
  while (kept.length > 1 && totalOf(kept, dropped) > limit) {
    kept = kept.slice(1)
    dropped += 1
  }
  if (dropped > 0) kept = [...kept, noticeFor(dropped)]
  const text = kept.join('\n')
  return { text, length: Array.from(text).length, elided: last.elided }
}
