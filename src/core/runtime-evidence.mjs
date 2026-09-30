/**
 * Runtime Evidence extraction — the seam between raw tool arguments and the evidence model.
 *
 * ## Why this module exists
 *
 * Until now `runtime-events.mjs` kept only `callId`, `name` and `capability`, so the evidence
 * model could say nothing more than "a capability of this type ran". Measured on a real session,
 * DSH's `tool/call` events do carry `data.arguments`, and the arguments carry `command`,
 * `file_path`, `url`, `queries` and a model-authored `description`. The ceiling was set by this
 * plugin, not by the runtime.
 *
 * ## The two axes this module keeps apart
 *
 * - **Runtime evidence** — what the call's own structured input establishes. `bash` with
 *   `command: "npm test"` is a test command; that is a fact about the invocation.
 * - **Model intent** — `description` is prose the model wrote about what it meant to do. It is
 *   not a runtime fact and this module never returns its text. It is recorded as a presence flag
 *   plus the *step kind* the description maps onto, using the same rules a declared step uses.
 *   A kind is not text: it is what makes "the model said it was inspecting" comparable to a
 *   declared `inspect` step without either string ever being stored or matched.
 *
 * Conflating them is what would let "Run the test suite" in a description be reported as
 * something the runtime established.
 *
 * ## What is deliberately not done
 *
 * The raw argument is parsed, a bounded category is taken from it, and the original is dropped.
 * No caller of `extractRuntimeEvidence` receives the raw value, so it cannot reach a receipt, a
 * runtime event, a backup, an export or UI state. Nothing here reads project files, opens a
 * socket, or holds a model. There is no fuzzy matching: a declaration is never matched against
 * an argument by substring, prefix or similarity, because that would manufacture support out of
 * coincidence. Support comes from a **closed category vocabulary**, so the only way a command
 * supports "run the tests" is by being recognisably a test command.
 *
 * @module runtime-evidence
 */

import { classifyStepKind } from './step-kind.mjs'

/** The evidence types this seam can produce. Closed on purpose. */
export const EVIDENCE_TYPES = ['command', 'file-target', 'query', 'delegate', 'generic']

/**
 * Categories for `command` evidence.
 *
 * A closed vocabulary, matched on whole tokens rather than substrings: `npm test` is a test
 * command, `pwd && ls` is a listing, and no amount of partial overlap makes one into the other.
 */
export const COMMAND_CATEGORIES = ['test', 'build', 'lint', 'typecheck', 'install', 'git', 'file-listing', 'other']

/** Categories for `file-target` evidence, derived from the extension alone. */
export const FILE_CATEGORIES = ['source-file', 'test-file', 'config', 'documentation', 'image', 'other']

/** The longest command string inspected. Anything beyond is not classified. */
const COMMAND_SCAN_LIMIT = 400

/** Command tokens that name a category, in priority order. Whole-token matches only. */
const COMMAND_RULES = [
  { category: 'test', tokens: ['test', 'tests', 'jest', 'vitest', 'pytest', 'mocha', 'ava'] },
  { category: 'typecheck', tokens: ['tsc', 'typecheck', 'flow'] },
  { category: 'lint', tokens: ['lint', 'eslint', 'stylelint', 'prettier', 'fmt'] },
  { category: 'build', tokens: ['build', 'compile', 'make', 'webpack', 'rollup', 'vite', 'esbuild'] },
  { category: 'install', tokens: ['install', 'ci', 'add', 'yarn', 'pnpm', 'npm'] },
  { category: 'git', tokens: ['git', 'commit', 'checkout', 'rebase', 'merge', 'stash'] },
  { category: 'file-listing', tokens: ['ls', 'll', 'dir', 'tree', 'pwd', 'find', 'fd'] },
]

const FILE_RULES = [
  { category: 'test-file', pattern: /\.(test|spec)\.[a-z0-9]+$/i },
  { category: 'config', pattern: /\.(json|ya?ml|toml|ini|env|config\.[a-z0-9]+)$/i },
  { category: 'documentation', pattern: /\.(md|mdx|txt|rst)$/i },
  { category: 'image', pattern: /\.(png|jpe?g|webp|gif|svg|avif)$/i },
  { category: 'source-file', pattern: /\.(mjs|cjs|js|jsx|ts|tsx|py|go|rs|rb|java|kt|swift|c|h|cpp|cs|php|sh|zsh|sql|css|scss|html|vue|svelte)$/i },
]

/**
 * Parse a raw argument value into a plain object.
 *
 * Measured across a real session, `data.arguments` was a JSON string on 665 of 665 calls. It is
 * not assumed to stay that way: an object is accepted as-is, a missing or unparseable value
 * yields `null` rather than throwing, because malformed arguments must leave the runtime event
 * untouched rather than fail a render.
 *
 * @param raw - the `data.arguments` value as recorded.
 * @returns the parsed object, or `null` when there is nothing usable.
 */
export function parseArguments(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'object') return Array.isArray(raw) ? null : raw
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text.startsWith('{')) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Classify a command string into a bounded category.
 *
 * Matching is on whole tokens split from the command, never on substrings: `pretest` does not
 * make something a test command by containing "test", and neither does a path. The first rule
 * that matches wins, in the declared order — a `npm test` is a test command, not an install.
 *
 * @param command - the command string.
 * @returns one of `COMMAND_CATEGORIES`.
 */
export function classifyCommand(command) {
  if (typeof command !== 'string' || !command.trim()) return 'other'
  const tokens = new Set(
    command
      .slice(0, COMMAND_SCAN_LIMIT)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
  for (const rule of COMMAND_RULES) {
    if (rule.tokens.some((token) => tokens.has(token))) return rule.category
  }
  return 'other'
}

/**
 * Classify a file path into a bounded category, using the extension only.
 *
 * The path itself is not kept. Two files under the same directory are indistinguishable here on
 * purpose: "a source file was read" is what the runtime input supports, and claiming it was the
 * *declared* file would require matching text the declaration happens to share with a path.
 *
 * @param filePath - the recorded path.
 * @returns one of `FILE_CATEGORIES`.
 */
export function classifyFileTarget(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return 'other'
  for (const rule of FILE_RULES) {
    if (rule.pattern.test(filePath)) return rule.category
  }
  return 'other'
}

/** The tool names whose evidence is a command. */
const COMMAND_TOOLS = new Set(['bash', 'pwsh', 'shell', 'sh', 'zsh', 'exec', 'run', 'run_command', 'terminal'])
/** The tool names whose evidence is a file target. */
const FILE_TOOLS = new Set(['read', 'read_file', 'read_image', 'edit', 'write', 'str_replace_editor', 'apply_patch', 'multi_edit', 'notebook_edit', 'notebook_read', 'ls', 'list_dir'])
/** The tool names whose evidence is a query. */
const QUERY_TOOLS = new Set(['grep', 'glob', 'web_search', 'web_fetch'])

/**
 * Extract bounded evidence from one tool call.
 *
 * Returns categories and booleans, never values. `specific` answers whether the runtime input is
 * itself concrete enough to speak to a declared action — a recognised test command is, and so is
 * a query; a bare capability with no usable input is not.
 *
 * `modelIntent` records whether a `description` was present, and which step kind that description
 * maps onto. The text is classified and discarded in the same expression, so it cannot escape
 * this function; only a kind from a closed vocabulary leaves.
 *
 * @param input - `{ name, capabilityId, arguments }`, where `arguments` is the raw recorded value.
 * @returns `{ evidenceType, category, specific, modelIntent }`.
 */
export function extractRuntimeEvidence(input) {
  const name = typeof input?.name === 'string' ? input.name : ''
  const capabilityId = typeof input?.capabilityId === 'string' ? input.capabilityId : ''
  const parsed = parseArguments(input?.arguments)
  // The value is classified here and never returned, so no caller can persist it.
  const description = parsed && typeof parsed.description === 'string' ? parsed.description : ''
  const modelIntent = { present: Boolean(description.trim()), kind: classifyStepKind(description) }

  if (parsed && typeof parsed.command === 'string' && parsed.command.trim()) {
    const category = classifyCommand(parsed.command)
    return { evidenceType: 'command', category, specific: category !== 'other', modelIntent }
  }
  if (parsed && typeof parsed.file_path === 'string' && parsed.file_path.trim()) {
    const category = classifyFileTarget(parsed.file_path)
    return { evidenceType: 'file-target', category, specific: category !== 'other', modelIntent }
  }
  if (parsed && (typeof parsed.url === 'string' || Array.isArray(parsed.queries) || typeof parsed.query === 'string')) {
    return { evidenceType: 'query', category: 'query', specific: true, modelIntent }
  }
  if (COMMAND_TOOLS.has(name)) return { evidenceType: 'command', category: 'other', specific: false, modelIntent }
  if (FILE_TOOLS.has(name)) return { evidenceType: 'file-target', category: 'other', specific: false, modelIntent }
  if (QUERY_TOOLS.has(name)) return { evidenceType: 'query', category: 'query', specific: true, modelIntent }
  if (capabilityId === 'subagent' || name === 'subagent' || name === 'task') {
    // A delegated task is evidence that delegation happened. The prompt is not kept.
    return { evidenceType: 'delegate', category: 'delegate', specific: true, modelIntent }
  }
  if (capabilityId === 'mcp' || name.startsWith('mcp__')) {
    return { evidenceType: 'query', category: 'mcp-call', specific: true, modelIntent }
  }
  return { evidenceType: 'generic', category: 'capability', specific: false, modelIntent }
}
