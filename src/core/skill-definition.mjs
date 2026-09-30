/**
 * Skill Definition View — one live, read-only view of a Skill's definition file.
 *
 * ## What this adds that the catalog snapshot does not
 *
 * `buildCatalogSnapshot` answers *which Skills exist*. `loadSkillDefinition` answers *does the
 * content still hash the same as it did during the run*, and it deliberately throws the body
 * away — it keeps only `currentInstructionSha256`. This module is the one place that keeps the
 * body long enough to show it, which is why it is also the one place that has to be careful
 * about where the body can go.
 *
 * ## The body is live-only
 *
 * `content.text` is returned to the caller and **must not be written to a receipt**, a backup or
 * any on-disk store. The receipt keeps the hash and nothing else; that separation is the whole
 * reason a run can be re-checked later without the project's instructions being copied into a
 * plugin's data directory. Callers that persist the result are wrong, and the shape here makes
 * that visible: the content lives under `definition.content`, next to a `sha256` the persisted
 * surfaces can use instead.
 *
 * ## Three layers, never conflated
 *
 * The model receives `renderSkillContent(...)`, not the raw body. That helper lives in
 * `@deepseek-ai/dsh-skill`, and this plugin imports **nothing** from the harness at runtime — so
 * the rendered envelope cannot be reproduced here and is reported as unavailable rather than
 * approximated. A re-implementation that drifts by one newline would show a plausible envelope
 * that is not what the model saw, which is worse than showing none. What can be shown honestly
 * is the provider body (labelled as the provider body) and the observed hash from the run.
 *
 * @module skill-definition
 */

import { createHash } from 'node:crypto'

import { buildDefinitionOutline, parseFrontmatter } from './definition-outline.mjs'
import { resolveRepositorySource } from './repository-resolver.mjs'
import { safeDescription, safeProviderLabel, safeSkillName } from './source-snapshot.mjs'

/** Shape version of the payload the Definition Viewer renders. */
export const DEFINITION_SCHEMA_VERSION = 1

/** Longest body returned. Beyond this the view is truncated and says so. */
export const DEFINITION_CONTENT_BYTES = 256 * 1024

/**
 * Reasons a definition can be unavailable. Named so the UI never invents its own wording.
 */
export const DEFINITION_UNAVAILABLE_REASONS = [
  'unknown-skill',
  'registry-unavailable',
  'invalid-skill-name',
]

/**
 * How the file on disk relates to the one the run actually loaded.
 *
 * `unavailable` is not a softer `mismatch`. It means the run recorded no instruction hash for
 * this Skill — typically because it was never loaded, only listed — and calling that a mismatch
 * would accuse the Skill of changing when nobody looked.
 */
export const DEFINITION_MATCH_STATUSES = ['match', 'mismatch', 'unavailable']

/**
 * Why the rendered envelope is absent. It is not a failure — it is a boundary.
 */
export const RENDERED_ENVELOPE_LIMITATION = 'rendered-envelope-not-reproducible-outside-the-harness'

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

/**
 * Project a `SkillResourceBase` without its absolute path.
 *
 * `path` is an absolute local path — `dsh-skill-filesystem` fills it from `realpath`. It is read
 * here (the repository resolver needs a directory to walk) and then dropped: the payload keeps
 * `kind` and, when a work tree was found, a repository-relative path instead.
 */
function resourceBaseShape(resourceBase) {
  const base = resourceBase && typeof resourceBase === 'object' ? resourceBase : null
  if (!base || typeof base.kind !== 'string') {
    return { kind: null, path: null, pathOmitted: false, url: null, note: 'no-resource-base' }
  }
  if (base.kind === 'url' && typeof base.url === 'string') {
    // A url base is already public by construction — it is the one base that can be shown.
    return { kind: 'url', path: null, pathOmitted: false, url: base.url.slice(0, 400), note: null }
  }
  return {
    kind: base.kind,
    path: null,
    pathOmitted: typeof base.path === 'string' && base.path.length > 0,
    url: null,
    note: base.kind === 'opaque' ? 'base-has-no-locator' : null,
  }
}

function invocationShape(invocation) {
  const value = invocation && typeof invocation === 'object' ? invocation : {}
  return {
    modelInvocable: value.modelInvocable === true,
    userInvocable: value.userInvocable === true,
  }
}

/**
 * Build the Definition Viewer payload for one Skill.
 *
 * @param registry - a Skill registry (`get(name, options)`), or null.
 * @param skillName - the Skill to read.
 * @param options - `{ cwd, scope, now }`.
 * @returns the definition view; never throws for a missing Skill.
 */
export async function buildSkillDefinitionView(registry, skillName, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const name = safeSkillName(skillName)
  if (!name) {
    return {
      schemaVersion: DEFINITION_SCHEMA_VERSION,
      skillName: null,
      available: false,
      reason: 'invalid-skill-name',
      checkedAt: now,
    }
  }

  const unavailable = (reason) => ({
    schemaVersion: DEFINITION_SCHEMA_VERSION,
    skillName: name,
    available: false,
    reason,
    checkedAt: now,
  })

  if (!registry || typeof registry.get !== 'function') return unavailable('registry-unavailable')

  let definition
  try {
    definition = await registry.get(name, { cwd: options.cwd, scope: options.scope })
  } catch {
    return unavailable('registry-unavailable')
  }
  // `SkillRegistry.get` returns undefined for a miss rather than throwing — a Skill that was
  // loaded during the run may simply not be installed any more. That is a finding, not an error.
  if (!definition) return unavailable('unknown-skill')

  const content = typeof definition.content === 'string' ? definition.content : ''
  const truncated = content.length > DEFINITION_CONTENT_BYTES
  const text = truncated ? content.slice(0, DEFINITION_CONTENT_BYTES) : content
  const frontmatter = parseFrontmatter(text)
  const outline = buildDefinitionOutline(text)
  const resourceBase = resourceBaseShape(definition.resourceBase)

  const rawBase = definition.resourceBase && typeof definition.resourceBase === 'object' ? definition.resourceBase : null
  const repository = await resolveRepositorySource({
    frontmatter,
    resourceBase: rawBase,
    cwd: options.cwd,
  })

  const limitations = []
  if (truncated) limitations.push('definition-truncated-for-display')
  if (resourceBase.pathOmitted) limitations.push('resource-base-path-withheld')
  limitations.push(RENDERED_ENVELOPE_LIMITATION)
  for (const item of repository.limitations) limitations.push(`repository:${item}`)

  return {
    schemaVersion: DEFINITION_SCHEMA_VERSION,
    skillName: name,
    available: true,
    reason: null,
    checkedAt: now,
    summary: {
      description: safeDescription(definition.description),
      whenToUse: safeDescription(definition.whenToUse) || null,
      invocation: invocationShape(definition.invocation),
      source: typeof definition.source === 'string' ? definition.source.slice(0, 80) : null,
      provider: safeProviderLabel(definition.provider) || null,
    },
    resourceBase,
    content: {
      sha256: sha256(content),
      returnedSha256: sha256(text),
      bytes: content.length,
      lineCount: outline.lineCount,
      text,
      truncated,
    },
    outline: outline.entries,
    outlineTruncated: outline.truncated,
    outlineHeadingCount: outline.headingCount,
    frontmatter: {
      present: frontmatter.present,
      keys: Object.keys(frontmatter.fields),
      bodyStartLine: frontmatter.bodyStartLine,
    },
    renderedEnvelope: { available: false, reason: RENDERED_ENVELOPE_LIMITATION },
    repository,
    limitations,
  }
}

/**
 * Relate a live definition to the run that is being explained.
 *
 * Everything here already exists in the receipt: the instruction hash the run observed, whether
 * the Skill was actually loaded (as opposed to merely published in the catalog), and whether it
 * appeared in the catalog at that moment. This function only *joins* those facts to the live
 * body — it adds no new evidence, and in particular it does not decide that a matching hash
 * means the Skill behaved as written. A hash match says the file is the same file.
 *
 * @param receipt - the persisted receipt for the session.
 * @param skillName - the Skill being viewed.
 * @param view - the result of `buildSkillDefinitionView`.
 * @returns `{ match, observedInstructionSha256, currentInstructionSha256, loadedDuringRun, inPublishedCatalog, catalogPublication }`.
 */
export function compareDefinitionToRun(receipt, skillName, view) {
  const name = safeSkillName(skillName)
  const empty = {
    match: 'unavailable',
    observedInstructionSha256: [],
    currentInstructionSha256: view?.content?.sha256 ?? null,
    loadedDuringRun: false,
    inPublishedCatalog: null,
    catalogPublication: null,
  }
  if (!name) return empty

  const traces = Array.isArray(receipt?.traceEvents) ? receipt.traceEvents : []
  const observed = [
    ...new Set(
      traces
        .filter((trace) => trace?.skillName === name && trace?.status === 'loaded' && typeof trace?.evidenceFingerprint?.value === 'string')
        .map((trace) => trace.evidenceFingerprint.value),
    ),
  ]
  const loadedDuringRun = traces.some((trace) => trace?.skillName === name && trace?.status === 'loaded')

  const published = receipt?.catalogPublished && typeof receipt.catalogPublished === 'object' ? receipt.catalogPublished : null
  const entries = Array.isArray(published?.entries) ? published.entries : null
  const inPublishedCatalog = entries ? entries.some((entry) => entry?.name === name) : null

  const current = view?.content?.sha256 ?? null
  let match = 'unavailable'
  if (current && observed.length > 0) match = observed.includes(current) ? 'match' : 'mismatch'

  return {
    match,
    observedInstructionSha256: observed,
    currentInstructionSha256: current,
    loadedDuringRun,
    inPublishedCatalog,
    catalogPublication: published
      ? {
          observedAt: published.observedAt ?? null,
          seq: published.seq ?? null,
          turn: published.turn ?? null,
          step: published.step ?? null,
          update: published.update === true,
          entryCount: published.entryCount ?? (entries ? entries.length : null),
          entriesDigest: published.entriesDigest ?? null,
        }
      : null,
  }
}
