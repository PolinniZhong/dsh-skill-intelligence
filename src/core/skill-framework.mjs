/**
 * Skill Framework — the *shape* of a Skill, read deterministically out of its SKILL.md.
 *
 * The product mistake this module exists to undo: calling `flow.steps[]` "the Skill Framework".
 * A declared flow is what a Skill says its procedure is; a framework is what the Skill is made
 * of. `ui-craft` declares four steps and is built out of nine sections — reporting the four
 * steps as its framework answered a question nobody asked and hid the eight other answers.
 *
 * Three rules hold here, and tests pin all three:
 *
 *   1. **No model call.** Classification is heading-syntax keyword matching plus document
 *      structure. The same SKILL.md always yields the same framework, offline, in a test.
 *   2. **Nothing is padded.** A Skill with no verification section gets no verification module.
 *      What is missing is *reported* (`coverage.absent`), never invented, because "this Skill
 *      declares no verification" is itself an answer a reviewer wants.
 *   3. **Declared resources are not loaded resources.** `resources.loaded` stays empty: nothing
 *      in this session's evidence says a referenced file was ever read, and marking one as read
 *      would be the exact fabricated provenance the product forbids.
 *
 * The parser reads the *outline the definition view already built* (`buildDefinitionOutline`),
 * so every module's anchor id is the same id `renderSkillMarkdown` puts on the heading. There is
 * one heading-id authority, and it is not this file.
 */

export const FRAMEWORK_SCHEMA_VERSION = 1

export const FRAMEWORK_SOURCE = 'definition'

/** The eight roles a SKILL.md section can play. Order is display order. */
export const FRAMEWORK_ROLES = ['identity', 'trigger', 'rules', 'controls', 'workflow', 'resources', 'output', 'verification']

export const FRAMEWORK_ROLE_LABELS = {
  identity: { zh: '定位 · Purpose', en: 'Purpose' },
  trigger: { zh: '触发 · Trigger', en: 'Trigger' },
  rules: { zh: '规则 · Rules', en: 'Rules' },
  controls: { zh: '参数 · Controls', en: 'Controls' },
  workflow: { zh: '流程 · Workflow', en: 'Workflow' },
  resources: { zh: '资源 · Resources', en: 'Resources' },
  output: { zh: '输出 · Output', en: 'Output' },
  verification: { zh: '验证 · Verification', en: 'Verification' },
}

/** What each role answers for a reviewer. The UI shows the hint, so the map stays honest. */
export const FRAMEWORK_ROLE_HINTS = {
  identity: { zh: '这个 Skill 是干什么的', en: 'What this Skill is' },
  trigger: { zh: '什么情况下应该用它', en: 'When it should be used' },
  rules: { zh: '有哪些核心规则', en: 'Its core rules' },
  controls: { zh: '有哪些可调参数与决策', en: 'Its knobs and decisions' },
  workflow: { zh: '它声明的工作流程', en: 'The workflow it declares' },
  resources: { zh: '它引用了哪些外部资源', en: 'The external resources it references' },
  output: { zh: '它要求产出什么', en: 'What it requires as output' },
  verification: { zh: '它如何验证结果', en: 'How it verifies results' },
}

export const FRAMEWORK_ITEM_LIMIT = 8
export const FRAMEWORK_ITEM_TEXT_MAX = 200
export const FRAMEWORK_OPENING_MAX = 240
export const FRAMEWORK_CHILD_LIMIT = 12
export const FRAMEWORK_RESOURCE_LIMIT = 80
export const FRAMEWORK_RESOURCE_LABEL_MAX = 160

export const FRAMEWORK_LIMITATIONS = {
  unclassifiedSection: 'section-heading-does-not-match-a-known-framework-role',
  truncated: 'definition-truncated-so-the-framework-may-be-incomplete',
  declaredNotLoaded: 'declared-resources-are-not-loaded-resources',
  noOutline: 'definition-has-no-headings-so-only-the-preamble-could-be-read',
}

export const FRAMEWORK_NOTE = {
  zh: '框架来自 SKILL.md 自身的章节结构：它说明这个 Skill 由什么组成，不是它的运行过程，也不会由运行证据反推。',
  en: 'The framework is read from SKILL.md\u2019s own sections. It says what the Skill is made of \u2014 not how it ran, and it is never inferred back from runtime evidence.',
}

export const DISCLOSURE_NOTE = {
  zh: '声明资源不等于已读取资源：这里只显示 SKILL.md 写到的引用。没有来源证据时，界面不会标记任何资源为「已读取」。',
  en: 'Declared resources are not loaded resources: this lists only what SKILL.md cites. Without provenance, nothing is ever marked as read.',
}

export const DISCLOSURE_CHAIN = [
  { id: 'catalog', zh: 'Skill 目录', en: 'Skill catalog' },
  { id: 'load', zh: '载入 Skill', en: 'Skill load' },
  { id: 'instructions', zh: 'SKILL.md 全文', en: 'Full SKILL.md' },
  { id: 'base', zh: '资源基准路径', en: 'Resource base' },
  { id: 'declared', zh: '被引用的资源', en: 'Referenced resources' },
  { id: 'ondemand', zh: '按需读取', en: 'Read on demand' },
]

/** Sections that hold no role still get shown under this heading, by their real title. */
export const FRAMEWORK_UNCLASSIFIED_LABEL = { zh: '其它章节', en: 'Other sections' }

const ROLE_MATCHERS = [
  {
    // `Verify` / `Verification` / `Quality Bar` / `Acceptance` — §2 maps `## Verify` here and
    // `## Quality Bar` to output/quality; quality gates read better as verification.
    role: 'verification',
    en: /\b(verif\w*|validat\w*|checklists?|acceptance|quality|qa|self[- ]?check|tests?|testing|eval\w*)\b/,
    zh: ['验证', '校验', '验收', '检查', '质量', '自检', '测试'],
  },
  {
    role: 'output',
    en: /\b(outputs?|deliverables?|artifacts?|reports?|response format|review format|formats?|templates? of the answer)\b/,
    zh: ['产出', '输出', '交付', '交付物', '报告', '格式'],
  },
  {
    role: 'resources',
    en: /\b(resources?|reference files?|references?|assets?|files?|scripts?|fixtures?|links?)\b/,
    zh: ['资源', '参考文件', '参考', '素材', '附件'],
  },
  {
    // Checked before workflow: `Knobs (ask during Discovery)` must read as controls, and
    // decision frameworks `Quick Decision Frameworks`, `Motion Budget`, `Should This Animate?`
    // literally govern the declared knobs.
    role: 'controls',
    en: /\b(knobs?|parameters?|params?|options?|configuration|config|settings?|defaults?|tuning|decisions?|frameworks?|budgets?|thresholds?|modes?)\b/,
    zh: ['参数', '开关', '配置', '选项', '决策', '阈值', '模式'],
  },
  {
    role: 'rules',
    en: /\b(rules?|constraints?|requirements?|musts?|never|forbidden|anti[- ]?slop|principles?|guardrails?|polic\w+|quick ?start|quick ?reference|cheat ?sheet|top \d+|non[- ]?negotiables?)\b/,
    zh: ['规则', '约束', '原则', '规范', '禁止', '必须', '铁律', '要点', '红线'],
  },
  {
    role: 'workflow',
    en: /\b(workflow\w*|process\w*|procedures?|steps?|phases?|pipelines?|routings?|flows?|discovery|detections?|sequences?|stages?|run first)\b/,
    zh: ['流程', '步骤', '阶段', '工作流', '路由', '执行顺序', '发现'],
  },
  {
    role: 'trigger',
    en: /\b(when to (use|invoke|apply|run)|triggers?|use when|invocation|use cases?|scope of use)\b/,
    zh: ['何时使用', '触发', '适用', '使用场景', '什么时候'],
  },
  {
    role: 'identity',
    en: /\b(purpose|identity|overview|about|what this is|introduction|summary|goals?|mission|who you are|role)\b/,
    zh: ['简介', '概述', '目的', '定位', '介绍', '是什么', '目标', '角色'],
  },
]

const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+(.+)$/
const FENCE = /^\s{0,3}(?:```|~~~)/
const TABLE_ROW = /^\s{0,3}\|/
const LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const INLINE_CODE = /`([^`]+)`/g
const PATH_EXT = /\.(md|markdown|txt|json|ya?ml|toml|csv|tsv|py|sh|bash|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|html|svg|png|jpe?g|webp|gif|pdf|xml|ini|cfg|conf|lock)$/i
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

function plainText(value) {
  return String(value ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(LINK, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function clampText(value, max) {
  const text = plainText(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Map one heading title onto a framework role, or `null` when it matches nothing.
 *
 * Returning `null` is a real answer: the section is still listed (under its own title) and the
 * limitation says why. Guessing a role would be the same category of error as guessing a flow.
 */
export function classifySection(title) {
  const text = plainText(title).toLowerCase().replace(/[_/]+/g, ' ').replace(/-/g, ' ')
  if (!text) return null
  for (const matcher of ROLE_MATCHERS) {
    if (matcher.en.test(text)) return matcher.role
    for (const token of matcher.zh) if (text.includes(token)) return matcher.role
  }
  return null
}

function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isDelimiterRow(line) {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')))
}

function looksLikePath(value) {
  const text = String(value ?? '').trim()
  if (!text || text.length > 300) return false
  if (EXTERNAL_TARGET.test(text)) return false
  if (/\s/.test(text)) return false
  if (!PATH_EXT.test(text)) return false
  return text.includes('/') || /^[\w.-]+$/.test(text)
}

function scanSections(content, outline) {
  const lines = String(content ?? '').split('\n')
  const entries = Array.isArray(outline) ? outline.filter((entry) => entry && Number.isSafeInteger(entry.line)) : []
  if (entries.length === 0) return { sections: [], titleEntry: null, preamble: null }

  const minLevel = Math.min(...entries.map((entry) => entry.level))
  const first = entries[0]
  const hasDeeper = entries.some((entry) => entry.level > minLevel)
  const titleEntry = first.level === minLevel && hasDeeper ? first : null
  const rest = titleEntry ? entries.slice(1) : entries
  if (rest.length === 0) return { sections: [], titleEntry, preamble: null }

  const sectionLevel = Math.min(...rest.map((entry) => entry.level))
  const headings = rest.filter((entry) => entry.level === sectionLevel)

  const sections = headings.map((heading, position) => {
    const next = headings[position + 1] ?? null
    const end = next ? next.line - 1 : lines.length
    const children = rest.filter((entry) => entry.line > heading.line && entry.level > sectionLevel && (!next || entry.line < next.line))
    return { heading, end, children }
  })

  const preambleStart = titleEntry ? titleEntry.line + 1 : 1
  const preambleEnd = headings.length > 0 ? headings[0].line - 1 : lines.length
  const preamble = collectPreamble(lines, preambleStart, preambleEnd)
  return { sections, titleEntry, preamble }
}

function collectPreamble(lines, start, end) {
  const kept = []
  let fenced = false
  for (let line = start; line <= end && line <= lines.length; line += 1) {
    const text = lines[line - 1] ?? ''
    if (FENCE.test(text)) { fenced = !fenced; continue }
    if (fenced) continue
    const trimmed = text.trim()
    if (!trimmed) continue
    if (/^#{1,6}\s/.test(trimmed)) continue
    if (TABLE_ROW.test(trimmed)) continue
    if (LIST_ITEM.test(trimmed)) { kept.push({ kind: 'item', text: clampText(trimmed.replace(/^>\s*/, ''), FRAMEWORK_OPENING_MAX), line }); continue }
    kept.push({ kind: 'text', text: clampText(trimmed.replace(/^>\s*/, ''), FRAMEWORK_OPENING_MAX), line })
    if (kept.length >= 3) break
  }
  if (kept.length === 0) return null
  return { line: kept[0].line, texts: kept.map((item) => item.text), items: kept.filter((item) => item.kind === 'item').length }
}

function scanSectionBody(lines, start, end) {
  const items = []
  let opening = ''
  let tables = 0
  let maxColumns = 0
  let codeBlocks = 0
  let links = 0
  let listItems = 0
  let fenced = false
  let inTable = false
  let firstContentLine = null

  for (let line = start + 1; line <= end && line <= lines.length; line += 1) {
    const text = lines[line - 1] ?? ''
    if (FENCE.test(text)) {
      fenced = !fenced
      if (fenced) codeBlocks += 1
      inTable = false
      continue
    }
    if (fenced) continue
    const trimmed = text.trim()
    if (!trimmed) { inTable = false; continue }
    links += (text.match(LINK) ?? []).length + (text.match(INLINE_CODE) ?? []).filter((span) => looksLikePath(span.slice(1, -1))).length

    if (TABLE_ROW.test(trimmed)) {
      const cells = splitRow(trimmed)
      if (!inTable && !isDelimiterRow(trimmed)) { tables += 1 }
      inTable = true
      maxColumns = Math.max(maxColumns, cells.length)
      continue
    }
    inTable = false
    if (/^#{1,6}\s/.test(trimmed)) continue

    const match = LIST_ITEM.exec(trimmed)
    if (match) {
      listItems += 1
      if (items.length < FRAMEWORK_ITEM_LIMIT) items.push(clampText(match[1], FRAMEWORK_ITEM_TEXT_MAX))
      continue
    }
    if (!opening) {
      opening = clampText(trimmed, FRAMEWORK_OPENING_MAX)
      firstContentLine = line
    }
  }

  return { items, opening, firstContentLine, tables, maxColumns, codeBlocks, links, listItems }
}

function collectResources(lines, sectionOfLine) {
  const found = new Map()
  let fenced = false
  let inTable = false
  let order = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1
    const text = lines[index] ?? ''
    if (FENCE.test(text)) { fenced = !fenced; inTable = false; continue }
    if (fenced) continue
    const trimmed = text.trim()
    if (!trimmed) { inTable = false; continue }

    const isRow = TABLE_ROW.test(trimmed)
    const cells = isRow ? splitRow(trimmed) : []
    if (isRow) {
      if (isDelimiterRow(trimmed)) { inTable = true; continue }
      if (!inTable) inTable = true
    } else {
      inTable = false
    }

    const targets = []
    LINK.lastIndex = 0
    let match = LINK.exec(text)
    while (match) {
      targets.push({ value: match[2], label: match[1] })
      match = LINK.exec(text)
    }
    if (targets.length === 0) {
      INLINE_CODE.lastIndex = 0
      let span = INLINE_CODE.exec(text)
      while (span) {
        if (looksLikePath(span[1])) targets.push({ value: span[1], label: '' })
        span = INLINE_CODE.exec(text)
      }
    }

    for (const target of targets) {
      if (!looksLikePath(target.value)) continue
      const key = plainText(target.value)
      if (!key) continue
      const owner = sectionOfLine(line)
      const when = isRow && cells.length > 1 ? clampText(cells.slice(1).find((cell) => cell && !isDelimiterRow(cell)) ?? '', FRAMEWORK_RESOURCE_LABEL_MAX) : ''
      const existing = found.get(key)
      if (existing) {
        // A later mention sitting under a heading carries more structure than the first prose
        // mention, so it *upgrades* the record instead of being thrown away. Rejecting the second
        // mention is what lost ui-craft's Tier 1 table entirely — and a mention inside the
        // resources section outranks one that merely happens to sit under a workflow sub-heading,
        // because the resources section is where progressive disclosure is declared on purpose.
        const outranks = Boolean(owner?.group) && (
          !existing.group || (existing.role !== 'resources' && owner.role === 'resources')
        )
        if (outranks) {
          existing.group = owner.group
          existing.groupLine = line
          existing.declaredIn = owner.title ?? existing.declaredIn
          existing.anchorId = owner.anchorId ?? existing.anchorId
          existing.role = owner.role ?? existing.role
          existing.when = when || existing.when
        } else if (!existing.when && when) {
          existing.when = when
        }
        if (existing.line !== line && existing.alsoDeclaredAt.length < FRAMEWORK_ITEM_LIMIT) existing.alsoDeclaredAt.push(line)
        continue
      }
      order += 1
      found.set(key, {
        order,
        path: key,
        label: clampText(target.label, FRAMEWORK_RESOURCE_LABEL_MAX) || null,
        line,
        groupLine: owner?.group ? line : null,
        when: when || null,
        anchorId: owner?.anchorId ?? null,
        declaredIn: owner?.title ?? null,
        role: owner?.role ?? null,
        group: owner?.group ?? null,
        alsoDeclaredAt: [],
      })
    }
  }
  return found
}

/**
 * Build the framework for one definition body.
 *
 * @param options.content - the SKILL.md text. Required for anything to be read.
 * @param options.outline - `definition.outline`; supplies heading ids and line numbers. The
 *   framework never re-slugs a heading, so a module's anchor is the id the renderer emitted.
 * @param options.summary - `definition.summary`; the only source for a `trigger` module when the
 *   body declares no trigger section (the registry description *is* the trigger text).
 * @param options.truncated - `definition.content.truncated`.
 */
export function buildSkillFramework(options = {}) {
  const content = typeof options.content === 'string' ? options.content : ''
  const outline = Array.isArray(options.outline) ? options.outline : []
  const summary = options.summary ?? null
  const truncated = options.truncated === true
  const lines = content.split('\n')

  const limitations = []
  const { sections: rawSections, titleEntry, preamble } = scanSections(content, outline)
  const roleById = new Map()

  const sections = rawSections.map((raw) => {
    const body = scanSectionBody(lines, raw.heading.line, raw.end)
    const role = classifySection(raw.heading.title)
    const anchorId = typeof raw.heading.id === 'string' ? raw.heading.id : null
    return {
      id: anchorId ?? `section:${raw.heading.line}`,
      title: plainText(raw.heading.title),
      level: raw.heading.level,
      line: raw.heading.line,
      anchorId,
      role,
      synthetic: false,
      opening: body.opening || null,
      items: body.items,
      itemCount: body.listItems,
      itemLimit: FRAMEWORK_ITEM_LIMIT,
      itemsTruncated: body.listItems > body.items.length,
      tables: body.tables,
      maxColumns: body.maxColumns,
      codeBlocks: body.codeBlocks,
      linkCount: body.links,
      children: raw.children.slice(0, FRAMEWORK_CHILD_LIMIT).map((entry) => ({
        id: entry.id, title: plainText(entry.title), level: entry.level, line: entry.line,
      })),
      childCount: raw.children.length,
    }
  })

  // The prose between the title and the first section is the Skill's self-description: the
  // identity module, and for most real Skills the only identity material there is.
  if (preamble) {
    sections.unshift({
      id: 'framework:preamble',
      title: titleEntry ? plainText(titleEntry.title) : null,
      level: titleEntry ? titleEntry.level : 1,
      line: preamble.line,
      anchorId: titleEntry && typeof titleEntry.id === 'string' ? titleEntry.id : null,
      role: 'identity',
      synthetic: true,
      opening: preamble.texts[0] ?? null,
      items: [],
      itemCount: 0,
      itemLimit: FRAMEWORK_ITEM_LIMIT,
      itemsTruncated: false,
      tables: 0,
      maxColumns: 0,
      codeBlocks: 0,
      linkCount: 0,
      children: [],
      childCount: 0,
    })
  }
  sections.sort((a, b) => a.line - b.line)

  for (const section of sections) if (section.anchorId) roleById.set(section.anchorId, section)

  // Group lookup for resources: the nearest deeper heading above a line names the resource's
  // tier — that heading *is* the progressive-disclosure structure SKILL.md declared.
  const deepHeadings = outline.filter((entry) => Number.isSafeInteger(entry?.line))
  const sectionOfLine = (line) => {
    let owner = null
    for (const raw of rawSections) {
      if (line < raw.heading.line) break
      owner = raw
    }
    if (!owner) return null
    const section = roleById.get(owner.heading.id) ?? null
    let group = null
    for (const entry of deepHeadings) {
      if (entry.line <= owner.heading.line) continue
      if (entry.line > owner.end) break
      if (entry.level > owner.heading.level && entry.line <= line) group = entry.title
    }
    return {
      anchorId: owner.heading.id,
      title: section?.title ?? plainText(owner.heading.title),
      role: section?.role ?? null,
      group: group ? plainText(group) : null,
    }
  }

  // Trigger: a body heading wins; the registry description is a legitimate, labelled fallback
  // because for a Skill with no trigger section it is the only statement of when to use it.
  const hasTrigger = sections.some((section) => section.role === 'trigger')
  const description = typeof summary?.description === 'string' ? summary.description : ''
  const whenToUse = typeof summary?.whenToUse === 'string' ? summary.whenToUse : ''
  const triggerText = (whenToUse || description).trim()
  if (!hasTrigger && triggerText) {
    sections.push({
      id: 'framework:trigger',
      title: null,
      level: 0,
      line: null,
      anchorId: null,
      role: 'trigger',
      synthetic: true,
      source: 'summary',
      opening: clampText(triggerText, FRAMEWORK_OPENING_MAX * 3),
      items: [],
      itemCount: 0,
      itemLimit: FRAMEWORK_ITEM_LIMIT,
      itemsTruncated: false,
      tables: 0,
      maxColumns: 0,
      codeBlocks: 0,
      linkCount: 0,
      children: [],
      childCount: 0,
    })
    sections.sort((a, b) => (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER))
  }

  const roles = FRAMEWORK_ROLES.map((role) => ({
    role,
    label: FRAMEWORK_ROLE_LABELS[role],
    hint: FRAMEWORK_ROLE_HINTS[role],
    sections: sections.filter((section) => section.role === role).map((section) => section.id),
  })).filter((entry) => entry.sections.length > 0)

  const presentRoles = roles.map((entry) => entry.role)
  const absentRoles = FRAMEWORK_ROLES.filter((role) => !presentRoles.includes(role))
  const unclassified = sections.filter((section) => section.role === null).map((section) => section.id)
  if (unclassified.length > 0) limitations.push(FRAMEWORK_LIMITATIONS.unclassifiedSection)

  // Progressive disclosure: the declared *organisation* of resources — the tiers SKILL.md puts
  // them in and the condition it attaches to each. What was actually read is a runtime question.
  const declared = [...collectResources(lines, sectionOfLine).values()].slice(0, FRAMEWORK_RESOURCE_LIMIT)
  const groups = []
  for (const resource of declared) {
    const key = resource.group ?? ''
    let group = groups.find((entry) => entry.title === key)
    if (!group) { group = { title: key || null, count: 0, line: null, role: resource.role ?? null, resourcePaths: [] }; groups.push(group) }
    group.count += 1
    if (resource.role === 'resources') group.role = 'resources'
    const at = resource.groupLine ?? resource.line
    if (Number.isSafeInteger(at) && (group.line === null || at < group.line)) group.line = at
    if (group.resourcePaths.length < FRAMEWORK_ITEM_LIMIT) group.resourcePaths.push(resource.path)
  }
  groups.sort((a, b) => (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER))
  // Tiers are the groups SKILL.md declared *inside* its resources section. Those are the ones
  // that mean "read this before writing UI, that one on demand" — progressive disclosure proper.
  const tiers = groups.filter((group) => group.role === 'resources' && group.title)

  if (truncated) limitations.push(FRAMEWORK_LIMITATIONS.truncated)
  if (outline.length === 0) limitations.push(FRAMEWORK_LIMITATIONS.noOutline)
  if (declared.length > 0) limitations.push(FRAMEWORK_LIMITATIONS.declaredNotLoaded)

  const resourceBase = options.resourceBase ?? null

  return {
    schemaVersion: FRAMEWORK_SCHEMA_VERSION,
    source: FRAMEWORK_SOURCE,
    note: FRAMEWORK_NOTE,
    disclosureNote: DISCLOSURE_NOTE,
    chain: DISCLOSURE_CHAIN.map((stage, index) => ({ id: stage.id, order: index + 1, label: { zh: stage.zh, en: stage.en } })),
    sectionLevel: rawSections.length > 0 ? rawSections[0].heading.level : null,
    titleEntry: titleEntry ? { id: titleEntry.id, title: plainText(titleEntry.title), line: titleEntry.line } : null,
    sections,
    sectionCount: sections.length,
    roles,
    unclassified,
    coverage: { present: presentRoles, absent: absentRoles },
    resources: {
      declared,
      declaredCount: declared.length,
      loaded: [],
      loadedCount: 0,
      groups,
      tiers,
      base: resourceBase,
      note: DISCLOSURE_NOTE,
    },
    limitations: [...new Set(limitations)],
  }
}
