/**
 * Declared Skill Flow, extracted from the Skill Definition itself.
 *
 * This module is the *definition side* of the product. It answers one question —
 * "what process did this Skill declare?" — and it answers it from the SKILL.md text
 * alone. It never reads a receipt, a runtime event, a clock or a registry, and it
 * never calls a model. The same text always produces the same flow.
 *
 * That is the whole point of the Skill-first refactor: `extractDeclarationSteps` in
 * `runtime-alignment.mjs` used to be fed the `<skill_instructions>` envelope sliced
 * out of a tool result at reduce time — so a Skill that had never run declared no
 * process at all. The scanner moved here, and `runtime-alignment.mjs` now imports it
 * from here, so both readers share exactly one set of rules.
 *
 * Runtime evidence is attached *afterwards* (`attachEvidenceToFlow` lives in
 * `skill-view-model.mjs`, to keep this module free of any runtime dependency). It may
 * only fill in `evidence.*`; it may never add, remove, rename or reorder a step.
 */

import { classifyStepKind, normalizeTitle } from './step-kind.mjs'
import { anchorStepsToOutline } from './definition-outline.mjs'

export const DECLARED_FLOW_SCHEMA_VERSION = 1

/**
 * The provenance label. It is written into every flow payload and asserted by the
 * contract test: a flow whose `source` is anything but `'definition'` is not the
 * declared flow, it is a runtime guess wearing its clothes.
 */
export const DECLARED_FLOW_SOURCE = 'definition'

/** Twelve steps is already more process than any real Skill declares. */
export const FLOW_STEP_LIMIT = 12

export const FLOW_TITLE_LIMIT = 160

export const FLOW_WITHHELD_LIMITATION = 'flow-steps-withheld-by-sanitiser'
export const FLOW_TRUNCATED_LIMITATION = 'definition-truncated-so-the-flow-may-be-incomplete'

function isProcessSection(title) {
  return /流程|步骤|阶段|steps?|procedure|process|workflow|工作流|执行顺序|pipeline|phases?/i.test(title ?? '')
}

// 「Step 1: …」「Phase 2 — …」「第 3 步：…」是编号步骤最常见的写法。
// 旧规则只认以数字开头的标题（`1. Foo`），于是这一整类 SKILL.md 的声明流程会抽成空——
// 实测真实 Skill `ui-craft` 的 `## Discovery Phase` → `### Step 1/2/3` 就整段落空。
// 要求前缀后必须跟数字，所以 `Step-by-step guide` 这类标题不会被误判。
const PREFIXED_ORDINAL = /^(?:step|phase|stage)\s*(\d{1,2})\s*[.)、:：\-—]?\s+(.+)$/i
const CJK_ORDINAL = /^第\s*(\d{1,2})\s*步\s*[.)、:：\-—]?\s*(.+)$/

/** 「1. Foo」「Step 2: Bar」「第 3 步：Baz」——都返回去掉编号后的标题；没有编号则原样返回。 */
function splitOrdinal(text) {
  const value = String(text ?? '')
  const numeric = /^(\d{1,2})\s*[.)、:：]\s*(.+)$/.exec(value)
  if (numeric) return numeric[2].trim()
  const prefixed = PREFIXED_ORDINAL.exec(value) || CJK_ORDINAL.exec(value)
  return prefixed ? prefixed[2].trim() : value
}

/**
 * Scan a Skill body for declared steps.
 *
 * Headings describe a declared process far more faithfully than stray numbered lists,
 * which in real Skills are usually conditional branches, constraint lists, or routing
 * rules rather than steps. So headings win whenever they yield a step.
 *
 * The ordered-list channel is narrower still: items qualify only inside a process-ish
 * section, or in a body with no sections at all (plain numbered instructions). A Skill
 * whose body lists constraints under `## 硬约束` and hides its real process in a
 * referenced file genuinely declares no steps *here*, and saying so is more useful than
 * relabelling its constraints as a process.
 *
 * @param body - the raw Skill body.
 * @param options.skipFences - skip fenced code (`# comment` in a shell block is not a
 *   heading). The live definition is raw Markdown, so this defaults on for callers that
 *   opt in; the receipt path keeps the historical behaviour.
 * @param options.skipFrontmatter - ignore the leading `---` block.
 * @returns `{ candidates, channel, headingCount, orderedListCount, hasSections, note }`,
 *   where each candidate is `{ title, line, evidenceType }` with `line` 1-based.
 */
export function scanDeclaredSteps(body, options = {}) {
  const text = typeof body === 'string' ? body : ''
  const empty = { candidates: [], channel: null, headingCount: 0, orderedListCount: 0, hasSections: false, note: 'no-instructions' }
  if (!text) return empty

  const skipFences = options.skipFences === true
  const skipFrontmatter = options.skipFrontmatter === true

  const headingSteps = []
  const listSteps = []
  let inProcessSection = false
  let hasSections = false
  let fence = null
  let inFrontmatter = skipFrontmatter && /^\s*---\s*$/.test(text.split(/\r?\n/)[0] ?? '')

  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const position = index + 1

    if (skipFrontmatter && inFrontmatter) {
      if (position > 1 && /^\s*---\s*$/.test(rawLine)) inFrontmatter = false
      continue
    }

    if (skipFences) {
      const fenceMatch = /^\s*(```+|~~~+)/.exec(rawLine)
      if (fenceMatch) {
        fence = fence === null ? fenceMatch[1][0] : (fence === fenceMatch[1][0] ? null : fence)
        continue
      }
      if (fence !== null) continue
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(rawLine)
    if (heading) {
      const level = heading[1].length
      const rawTitle = heading[2]
      const title = normalizeTitle(splitOrdinal(rawTitle))
      const numbered = splitOrdinal(rawTitle) !== rawTitle
      if (level === 1) continue
      if (level === 2) {
        // A level-2 heading that opens a process section names the section, not a
        // step — so it is not carried, but its children are.
        //
        // 用 **rawTitle** 而不是去掉编号后的 title 判断：`## Phase 2 — Runtime` 一旦被
        // 剥成 `Runtime`，「Phase」这个词就没了，这一节会被当成普通小节，子标题全落空。
        hasSections = true
        inProcessSection = isProcessSection(rawTitle)
        if (!inProcessSection && numbered && title) headingSteps.push({ title, position, evidenceType: 'heading' })
        continue
      }
      // Deeper headings count as steps inside a declared process, or when they carry
      // their own ordinal. Precision is preferred over recall: inventing a step that
      // the Skill never declared corrupts every alignment below it.
      if (title && (inProcessSection || numbered)) {
        headingSteps.push({ title, position, evidenceType: 'heading' })
      }
      continue
    }

    const item = /^\s{0,3}\d{1,2}\s*[.)]\s+(.+)$/.exec(rawLine)
    if (item) {
      const title = normalizeTitle(item[1])
      if (title) listSteps.push({ title, position, evidenceType: 'ordered-list', inProcess: inProcessSection })
    }
  }

  const headingCount = headingSteps.length
  const orderedListCount = listSteps.length
  // In a sectioned body, only a process section's list describes a process.
  const usableList = hasSections ? listSteps.filter((step) => step.inProcess) : listSteps
  const channel = headingCount ? 'heading' : (usableList.length ? 'ordered-list' : null)
  const chosen = headingCount ? headingSteps : usableList

  const candidates = []
  const seen = new Set()
  for (const step of chosen) {
    const key = step.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ title: step.title, line: step.position, evidenceType: step.evidenceType })
    if (candidates.length >= FLOW_STEP_LIMIT) break
  }

  // Say why nothing was declared, so an empty declaration is not mistaken for a Skill
  // that has no process.
  let note = null
  if (!candidates.length) {
    if (hasSections && orderedListCount) note = 'numbered-items-outside-a-process-section'
    else if (!hasSections && !orderedListCount) note = 'no-declared-process'
  }

  return { candidates, channel, headingCount, orderedListCount, hasSections, note }
}

/**
 * The privacy sanitiser the receipt path has always applied to step titles.
 *
 * It lives here now because the definition path needs the same rule, and one rule with
 * two copies drifts. A title that looks like a local path is withheld rather than
 * cleaned: a half-redacted path is still a path.
 *
 * @returns the sanitised title, or `''` when the title must be withheld.
 */
export function sanitizeFlowTitle(value) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!raw || /(?:^|\s)(?:~\/|\/[A-Za-z0-9._-]|[A-Za-z]:\\)/.test(raw)) return ''
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[`*>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FLOW_TITLE_LIMIT)
}

/**
 * Extract the Declared Skill Flow from a Skill Definition body.
 *
 * Pure and total: no I/O, no clock, no receipt. Calling this twice on the same string
 * returns deeply equal output, which is what the contract test asserts.
 *
 * @param content - the SKILL.md text.
 * @param options.truncated - the caller knows the body was cut short for display.
 * @returns `{ schemaVersion, source, steps, channel, note, headingCount,
 *   orderedListCount, stepCount, truncated, withheldCount, limitations }`, where each
 *   step is `{ id, order, title, kind, line, evidenceType }`.
 */
export function extractDeclaredFlow(content, options = {}) {
  const scan = scanDeclaredSteps(content, { skipFences: true, skipFrontmatter: true })

  const steps = []
  let withheldCount = 0
  for (const candidate of scan.candidates) {
    const title = sanitizeFlowTitle(candidate.title)
    if (!title) {
      withheldCount += 1
      continue
    }
    steps.push({
      id: `declared:${steps.length + 1}`,
      order: steps.length + 1,
      title,
      kind: classifyStepKind(title),
      line: candidate.line,
      evidenceType: candidate.evidenceType,
    })
  }

  const limitations = []
  if (withheldCount > 0) limitations.push(FLOW_WITHHELD_LIMITATION)
  if (options.truncated === true) limitations.push(FLOW_TRUNCATED_LIMITATION)

  return {
    schemaVersion: DECLARED_FLOW_SCHEMA_VERSION,
    source: DECLARED_FLOW_SOURCE,
    steps,
    channel: scan.channel,
    note: scan.note,
    headingCount: scan.headingCount,
    orderedListCount: scan.orderedListCount,
    stepCount: steps.length,
    truncated: options.truncated === true,
    withheldCount,
    limitations,
  }
}

/**
 * Point each flow step at the outline entry it belongs under.
 *
 * A thin, named wrapper over `anchorStepsToOutline` so the flow's own shape — not the
 * outline module's — is what the composer passes around.
 */
export function flowAnchors(flow, outline) {
  return anchorStepsToOutline(outline, flow?.steps ?? [])
}
