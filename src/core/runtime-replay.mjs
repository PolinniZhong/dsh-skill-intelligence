/**
 * Runtime replay timeline (§37).
 *
 * The timeline is the sequence of **drawn** nodes in runtime-event order, so a
 * replay step always lands on something the user can see. Building it on the Host is
 * not a preference: a collapsed group owns several invocations, and the canvas
 * deliberately does not ship `memberIds`, so the client could not resolve an event to
 * its group even if it were allowed to.
 *
 * Two properties matter more than the ordering itself:
 *
 *   · replay is a read. It produces a list of node ids and nothing else — no write,
 *     no mutation, no receipt change;
 *   · structural nodes (session, turn) are context, not steps. §37's example walks
 *     Skill → Read → MCP → Test → Error → Retry, which are capability nodes.
 *
 * @module runtime-replay
 */

export const REPLAY_MODEL_VERSION = 1

/** How many steps a timeline may carry. A long run stays steppable, not exhaustive. */
export const REPLAY_STEP_LIMIT = 400

/**
 * Build the replay timeline.
 *
 * @param graph - the runtime graph (unused for ordering, kept for shape symmetry).
 * @param layout - a layout **with** `memberIds`, so groups can be resolved.
 * @param runtimeEvents - the receipt's normalized events, in log order.
 * @returns `{ modelVersion, steps, startedAt, endedAt, eventCount, truncated }`.
 */
export function buildReplayTimeline(graph, layout, runtimeEvents) {
  const nodes = Array.isArray(layout?.nodes) ? layout.nodes : []
  const events = Array.isArray(runtimeEvents) ? runtimeEvents : []

  // Which drawn node stands for a given graph node: itself, or the group holding it.
  const ownerOf = new Map()
  for (const node of nodes) {
    if (node.graphNodeId) ownerOf.set(node.graphNodeId, node.id)
    for (const memberId of node.memberIds ?? []) ownerOf.set(memberId, node.id)
  }

  const steps = []
  const seen = new Set()
  let last = null
  let startedAt = null
  let endedAt = null
  let truncated = false

  for (const event of events) {
    if (typeof event?.timestamp === 'number') {
      if (startedAt === null || event.timestamp < startedAt) startedAt = event.timestamp
      if (endedAt === null || event.timestamp > endedAt) endedAt = event.timestamp
    }
    if (!event?.invocationId) continue
    const nodeId = ownerOf.get(`invocation:${event.invocationId}`)
    if (!nodeId) continue
    // Consecutive events on one node are one step; the user is walking nodes, not a log.
    if (nodeId === last) continue
    last = nodeId
    if (steps.length >= REPLAY_STEP_LIMIT) {
      truncated = true
      break
    }
    steps.push({
      nodeId,
      seq: typeof event.seq === 'number' ? event.seq : null,
      at: typeof event.timestamp === 'number' ? event.timestamp : null,
      eventType: event.type,
      // A node may be revisited later in the run; the label keeps the step readable.
      repeat: seen.has(nodeId),
    })
    seen.add(nodeId)
  }

  return {
    modelVersion: REPLAY_MODEL_VERSION,
    steps,
    startedAt,
    endedAt,
    eventCount: events.length,
    truncated,
  }
}
