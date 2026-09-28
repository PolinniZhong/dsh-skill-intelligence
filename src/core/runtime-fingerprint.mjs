/**
 * Runtime Fingerprint — reserved structure (§31).
 *
 * §31 requires the UI refactor to *reserve structure* for a later Runtime Fingerprint:
 * a way to describe a run as a reusable pattern rather than as one session's events.
 * It does not ask for the patterns to be derived now, and this module deliberately does
 * not derive them.
 *
 * That restraint is the whole point. A fingerprint is a claim about how a run *works*,
 * and §32 forbids the interface from working out relationships for itself. So this file
 * publishes the shape and the vocabulary, states plainly that nothing has been derived,
 * and gives the later work one place to land:
 *
 *   · Runtime Pattern   — the run's overall shape
 *   · Tool Pattern      — how tool calls repeat across a run
 *   · MCP Pattern       — how MCP calls repeat
 *   · CLI Pattern       — how CLI calls repeat
 *   · Failure Pattern   — how failures cluster
 *   · Recovery Pattern  — what followed a failure
 *
 * Each slot is `null` until something can fill it from evidence. Nothing here is a score
 * (§16), and nothing here is inferred (§32).
 *
 * @module runtime-fingerprint
 */

export const FINGERPRINT_MODEL_VERSION = 1

/** The six patterns §31 names, in the order it names them. */
export const FINGERPRINT_PATTERNS = [
  'runtime',
  'tool',
  'mcp',
  'cli',
  'failure',
  'recovery',
]

/** What each slot will hold, so the reserved shape is legible without the later work. */
export const FINGERPRINT_PATTERN_LABELS = {
  runtime: { zh: '运行模式', en: 'Runtime pattern' },
  tool: { zh: '工具模式', en: 'Tool pattern' },
  mcp: { zh: 'MCP 模式', en: 'MCP pattern' },
  cli: { zh: 'CLI 模式', en: 'CLI pattern' },
  failure: { zh: '失败模式', en: 'Failure pattern' },
  recovery: { zh: '恢复模式', en: 'Recovery pattern' },
}

/**
 * Which capabilities feed which pattern. This is a routing table for the later work, not
 * a derivation: it says where a `cli` call would be counted, not what it means.
 */
export const FINGERPRINT_SOURCES = {
  runtime: ['skill', 'tool', 'mcp', 'cli', 'subagent'],
  tool: ['tool'],
  mcp: ['mcp'],
  cli: ['cli'],
  failure: ['skill', 'tool', 'mcp', 'cli', 'subagent'],
  recovery: ['skill', 'tool', 'mcp', 'cli', 'subagent'],
}

/**
 * The reserved fingerprint structure for a run.
 *
 * Returns every §31 pattern as an explicit `null` with a reason, so a caller cannot
 * mistake "not derived yet" for "derived and found empty" — the distinction this whole
 * project keeps insisting on.
 *
 * @param graph - the runtime graph, read only to report how much evidence exists.
 * @returns `{ modelVersion, status, derived, patterns, evidenceAvailable, note }`.
 */
export function buildFingerprintReservation(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph?.edges) ? graph.edges : []

  // A count of what a future derivation would have to work from. This is a count of
  // evidence, not a fingerprint: it says how much there is, never what it means.
  const byCapability = {}
  for (const node of nodes) {
    if (node?.role !== 'invocation') continue
    const key = node.capabilityId ?? 'unknown'
    byCapability[key] = (byCapability[key] ?? 0) + 1
  }

  const patterns = {}
  for (const key of FINGERPRINT_PATTERNS) {
    patterns[key] = {
      key,
      label: FINGERPRINT_PATTERN_LABELS[key],
      // §31 reserves the slot; it does not ask for a value. `null` means exactly that.
      value: null,
      status: 'not-yet-derived',
      sources: FINGERPRINT_SOURCES[key],
    }
  }

  return {
    modelVersion: FINGERPRINT_MODEL_VERSION,
    status: 'reserved',
    derived: false,
    patterns,
    evidenceAvailable: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      invocationCount: byCapability,
    },
    note: '§31 预留结构。这里只声明六个 Pattern 的位置与来源，尚未派生任何值；'
      + '空不代表「没有模式」，只代表还没有做这件事。',
  }
}
