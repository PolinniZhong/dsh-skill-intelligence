/**
 * Definition Outline — a Skill's Markdown turned into a navigable structure.
 *
 * ## Why this is its own module
 *
 * The Definition Viewer has to answer two questions about a Skill body without ever persisting
 * it: *what is in here* (the outline) and *where does a declared step live* (the anchor a flow
 * node scrolls to). Both are pure functions of the text, so they are kept away from the registry
 * and from the receipt store, where a bug would turn a live read into stored project content.
 *
 * ## What this module refuses to do
 *
 * It does not interpret the Skill. It does not extract the declared flow — `runtime-alignment.mjs`
 * owns that, and running a second, differently-tuned extractor here would give the UI two
 * answers to the same question. Headings and frontmatter are reported as they are written, with
 * the line they were written on, and nothing is inferred between them.
 *
 * @module definition-outline
 */

/** Most headings carried forward. A Skill body is prose, not a document tree. */
export const OUTLINE_HEADING_LIMIT = 200

/** Longest heading text kept, after normalization. */
const OUTLINE_TITLE_MAX = 160

/** Most frontmatter keys read. Bounded so a stray large file cannot become a payload. */
const FRONTMATTER_KEY_LIMIT = 64

/** Longest frontmatter value kept. */
const FRONTMATTER_VALUE_MAX = 300

/**
 * A frontmatter block only counts when it opens on the first line.
 *
 * A `---` further down is a Markdown horizontal rule, and treating one as frontmatter would
 * silently swallow the body above it.
 */
const FRONTMATTER_OPEN = /^---\r?\n/

/**
 * Normalize heading text for display and for slugging.
 *
 * Inline Markdown is stripped: `## The \`fix\` loop` is the heading "The fix loop", and keeping
 * the backticks would put markup in a sidebar label.
 *
 * @param value - the raw heading text.
 * @returns the normalized text, bounded.
 */
export function normalizeHeading(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, OUTLINE_TITLE_MAX)
}

/**
 * Turn heading text into a stable anchor id.
 *
 * @param text - the normalized heading text.
 * @returns a lowercase slug, or `section` when the text has nothing slug-able.
 */
export function slugify(text) {
  const slug = normalizeHeading(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'section'
}

/**
 * Read a leading frontmatter block.
 *
 * Only the shape a Skill file actually uses is supported: `key: value` and one level of nested
 * keys under a parent (so `metadata:` / `  repository: …` reads as `metadata.repository`).
 * Lists, anchors, block scalars and multi-document YAML are not parsed — an unfamiliar construct
 * is left out rather than guessed at, because every consumer of these fields is a *display*
 * decision and a wrong value would be shown to someone as fact.
 *
 * @param content - the full Skill body.
 * @returns `{ present, bodyStartLine, fields }` where `fields` is a plain object of string values.
 */
export function parseFrontmatter(content) {
  const text = typeof content === 'string' ? content : ''
  if (!FRONTMATTER_OPEN.test(text)) return { present: false, bodyStartLine: 1, fields: {} }

  const lines = text.split(/\r?\n/)
  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---\s*$/.test(lines[index])) {
      closing = index
      break
    }
  }
  if (closing === -1) return { present: false, bodyStartLine: 1, fields: {} }

  const fields = {}
  let parent = ''
  for (let index = 1; index < closing; index += 1) {
    const line = lines[index]
    if (!line.trim() || /^\s*#/.test(line)) continue
    const nested = /^\s+/.test(line)
    const match = /^\s*([A-Za-z0-9_.-]{1,64})\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    const raw = match[2].trim()
    if (!raw) {
      // A bare key opens a nested block; its children are reported under it.
      parent = nested ? parent : key
      continue
    }
    if (!nested) parent = ''
    const full = nested && parent ? `${parent}.${key}` : key
    if (Object.keys(fields).length >= FRONTMATTER_KEY_LIMIT) break
    fields[full] = raw.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim().slice(0, FRONTMATTER_VALUE_MAX)
  }
  return { present: true, bodyStartLine: closing + 2, fields }
}

/**
 * Build the outline of a Skill body.
 *
 * ATX headings only (`#` … `######`). Setext headings are not recognized: a `---` underline is
 * indistinguishable from a horizontal rule without parsing the whole document, and reporting a
 * rule as a heading would put a phantom entry in the sidebar.
 *
 * @param content - the full Skill body.
 * @returns `{ entries, lineCount, headingCount, truncated }`.
 */
export function buildDefinitionOutline(content) {
  const text = typeof content === 'string' ? content : ''
  const lines = text.split(/\r?\n/)
  const frontmatter = parseFrontmatter(text)
  const entries = []
  const used = new Map()

  // Fenced code is skipped: a `# comment` inside a shell block is not a heading, and the
  // Definition Viewer anchors scroll to line numbers, so a wrong entry is visibly wrong.
  let fence = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      fence = fence === null ? fenceMatch[1][0] : (fence === fenceMatch[1][0] ? null : fence)
      continue
    }
    if (fence !== null) continue
    // The frontmatter block is structure, not a heading.
    if (frontmatter.present && index + 1 < frontmatter.bodyStartLine) continue

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!heading) continue
    const title = normalizeHeading(heading[2])
    if (!title) continue
    const base = slugify(title)
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    entries.push({
      id: seen === 0 ? base : `${base}-${seen + 1}`,
      level: heading[1].length,
      title,
      line: index + 1,
    })
    if (entries.length >= OUTLINE_HEADING_LIMIT) {
      return { entries, lineCount: lines.length, headingCount: entries.length, truncated: true }
    }
  }

  return { entries, lineCount: lines.length, headingCount: entries.length, truncated: false }
}

/**
 * Point each declared step at the outline entry it belongs under.
 *
 * This is a **containment** lookup, not a similarity match: a step is placed under the nearest
 * heading at or above the line the step was extracted from. When the extraction channel does not
 * carry a line — the ordered-list channel does, a synthesized step may not — the step is left
 * unanchored rather than being attached to whichever heading looks closest in wording.
 *
 * @param outline - the result of `buildDefinitionOutline`.
 * @param stepLines - `[{ id, line }]`, the line each declared step came from, when known.
 * @returns a `Map` from step id to outline entry id.
 */
export function anchorStepsToOutline(outline, stepLines) {
  const anchors = new Map()
  const entries = Array.isArray(outline?.entries) ? outline.entries : []
  if (entries.length === 0) return anchors
  for (const step of Array.isArray(stepLines) ? stepLines : []) {
    if (!step || typeof step.id !== 'string' || !Number.isSafeInteger(step.line)) continue
    let best = null
    for (const entry of entries) {
      if (entry.line <= step.line && (!best || entry.line > best.line)) best = entry
    }
    if (best) anchors.set(step.id, best.id)
  }
  return anchors
}
