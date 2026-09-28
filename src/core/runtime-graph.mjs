/**
 * Correlation engine and runtime graph reconstruction.
 *
 * This module turns the normalized event stream into a graph of nodes and edges.
 * It is the stage the product's whole evidence boundary rests on, so it holds
 * one rule above all others:
 *
 *   Graph completeness < Graph truthfulness.
 *
 * Every edge carries the `evidenceIds` that support it. An edge that cannot cite
 * evidence is dropped rather than softened, and a relationship that cannot be
 * established is reported as `unlinked` rather than filled in with whichever
 * node happened to be nearby.
 *
 * Relation priority, highest first:
 *
 *   P0 runtime-native  `invocationId` (`callId`), `subagent/catalog.childId`,
 *                      `turn` / `step` containment — emitted `direct` / `observed`
 *   P1 structured      a host-published field that names its own subject
 *   P2 containment     session → turn → invocation, which is not causation
 *   P3 bounded rule    a named, narrow rule, emitted `candidate` only
 *   P4                 `unlinked`
 *
 * Nothing here renders, scores, or judges. There is no causal edge type: the
 * vocabulary cannot express "this caused that" because the runtime never said so.
 *
 * @module runtime-graph
 */

import { RETRY_RULE, aggregateInvocations } from './runtime-events.mjs'

export const GRAPH_MODEL_VERSION = 1

/** Node kinds. A capability node carries the capability it represents. */
export const NODE_TYPES = ['session', 'turn', 'skill', 'tool', 'cli', 'mcp', 'subagent']

/**
 * Edge kinds. Deliberately small and deliberately non-causal.
 *
 * `follows` means "next in the same step", never "therefore". `uses` and
 * `produces` from the SDD are not emitted: attributing a tool call to a Skill
 * requires alignment evidence this phase does not have, and an unearned `uses`
 * edge would be exactly the causal fabrication the product refuses.
 */
export const EDGE_TYPES = ['contains', 'spawns', 'retries', 'follows']

/** How an edge was established. */
export const EDGE_DERIVATIONS = ['direct', 'correlated', 'rule_based', 'candidate']

/** How completely an edge, or the relationship behind a node, was observed. */
export const EDGE_STATUSES = ['observed', 'partial', 'candidate', 'unknown']

/**
 * The only P3 rule this phase emits: two invocations are consecutive within one
 * step. It says they are adjacent in the log, nothing more.
 */
export const FOLLOWS_RULE = 'same-step-adjacent-invocation'

/**
 * Attribution rule for a spawned child. `subagent/catalog` names the child but
 * not the invocation that created it, so the invocation may be credited only when
 * exactly one candidate exists in that turn. Anything else stays unattributed.
 */
export const SPAWN_ATTRIBUTION_RULE = 'sole-subagent-invocation-in-turn'

function edgeId(type, from, to) {
  return `edge:${type}:${from}->${to}`
}

function nodeOf(nodes, id) {
  return nodes.find((node) => node.id === id)
}

/**
 * Build the runtime graph for one receipt.
 *
 * The result is a pure function of the receipt: the same receipt always yields
 * the same graph, and nothing in the output depends on a viewport, a zoom level,
 * or a previous layout.
 *
 * @param receipt - a migrated receipt holding normalized runtime events.
 * @returns the graph model, its unlinked list, and counts.
 */
export function buildRuntimeGraph(receipt) {
  const sessionId = typeof receipt?.sessionId === 'string' ? receipt.sessionId : ''
  const events = Array.isArray(receipt?.runtimeEvents) ? receipt.runtimeEvents : []
  const invocations = aggregateInvocations(events)
  const knownEventIds = new Set(events.map((event) => event.eventId))

  const rootId = `session:${sessionId}`
  const nodes = [{
    id: rootId,
    type: 'session',
    title: sessionId,
    status: 'observed',
    turn: null,
    step: null,
    evidenceEventIds: [],
  }]
  const edges = []
  const unlinked = []

  // -- P2 containment: a turn exists because events carried its number --------
  const turnEvidence = new Map()
  for (const event of events) {
    if (!Number.isSafeInteger(event.turn)) continue
    if (!turnEvidence.has(event.turn)) turnEvidence.set(event.turn, new Set())
    turnEvidence.get(event.turn).add(event.eventId)
  }
  for (const [turn, ids] of [...turnEvidence.entries()].sort((left, right) => left[0] - right[0])) {
    const id = `turn:${turn}`
    const evidence = [...ids]
    nodes.push({ id, type: 'turn', title: `Turn ${turn}`, status: 'observed', turn, step: null, evidenceEventIds: evidence })
    edges.push({
      id: edgeId('contains', rootId, id),
      from: rootId,
      to: id,
      type: 'contains',
      derivation: 'direct',
      status: 'observed',
      evidenceIds: evidence,
      rule: null,
    })
  }

  // -- capability nodes ------------------------------------------------------
  const requestSeq = new Map()
  for (const event of events) {
    if (event.type === 'invocation.request' && event.invocationId && Number.isSafeInteger(event.seq)) {
      requestSeq.set(event.invocationId, event.seq)
    }
  }

  const capabilityNodes = []
  for (const invocation of invocations) {
    const id = `invocation:${invocation.invocationId}`
    const hasTurn = Number.isSafeInteger(invocation.turn)
    // `status` is evidence completeness, not outcome. A failed call that was
    // fully observed is still `observed`; the outcome rides on `outcome`.
    const status = !hasTurn
      ? 'unlinked'
      : invocation.resolution === 'matched' ? 'observed' : 'partial'
    nodes.push({
      id,
      type: invocation.kind === 'unknown' ? 'tool' : invocation.kind,
      title: invocation.detail ? `${invocation.name}/${invocation.detail}` : invocation.name,
      subtitle: invocation.invocationType ?? null,
      role: 'invocation',
      invocationId: invocation.invocationId,
      capabilityId: invocation.kind,
      turn: Number.isSafeInteger(invocation.turn) ? invocation.turn : null,
      step: Number.isSafeInteger(invocation.step) ? invocation.step : null,
      outcome: invocation.status,
      status,
      evidenceEventIds: invocation.evidenceEventIds,
    })
    capabilityNodes.push({ nodeId: id, invocation })

    if (!hasTurn) {
      unlinked.push({ nodeId: id, reason: 'no-turn-attribution' })
      continue
    }
    const turnNodeId = `turn:${invocation.turn}`
    if (!nodeOf(nodes, turnNodeId)) {
      unlinked.push({ nodeId: id, reason: 'turn-has-no-evidence' })
      continue
    }
    edges.push({
      id: edgeId('contains', turnNodeId, id),
      from: turnNodeId,
      to: id,
      type: 'contains',
      derivation: 'direct',
      status: 'observed',
      evidenceIds: invocation.evidenceEventIds,
      rule: null,
    })
  }

  // -- P0 spawns: the parent-owned catalog names the child -------------------
  const spawnEvents = events.filter((event) => event.type === 'subagent.spawn' && event.childId)
  for (const event of spawnEvents) {
    const id = `subagent:${event.childId}`
    if (nodeOf(nodes, id)) continue
    const candidates = capabilityNodes.filter((candidate) => (
      candidate.invocation.kind === 'subagent' && candidate.invocation.turn === event.turn
    ))
    const attributable = candidates.length === 1
    nodes.push({
      id,
      type: 'subagent',
      title: event.childId,
      subtitle: event.mode ?? null,
      role: 'child-session',
      turn: Number.isSafeInteger(event.turn) ? event.turn : null,
      step: Number.isSafeInteger(event.step) ? event.step : null,
      // `observed` only when the spawn could be attributed to the invocation that
      // created it. The session→child edge below is observed either way.
      status: attributable ? 'observed' : 'partial',
      evidenceEventIds: [event.eventId],
    })
    edges.push({
      id: edgeId('spawns', rootId, id),
      from: rootId,
      to: id,
      type: 'spawns',
      derivation: 'direct',
      status: 'observed',
      evidenceIds: [event.eventId],
      rule: null,
    })
    if (!attributable) continue
    const [candidate] = candidates
    edges.push({
      id: edgeId('spawns', candidate.nodeId, id),
      from: candidate.nodeId,
      to: id,
      type: 'spawns',
      derivation: 'rule_based',
      status: 'candidate',
      evidenceIds: [event.eventId, ...candidate.invocation.evidenceEventIds].filter((value, index, all) => all.indexOf(value) === index),
      rule: SPAWN_ATTRIBUTION_RULE,
    })
  }

  // -- retries: the derived event names both ends ----------------------------
  for (const event of events) {
    if (event.type !== 'retry' || !event.retryOf || !event.invocationId) continue
    const from = `invocation:${event.retryOf}`
    const to = `invocation:${event.invocationId}`
    if (!nodeOf(nodes, from) || !nodeOf(nodes, to)) continue
    const previousResult = events.find((candidate) => (
      candidate.type === 'invocation.result' && candidate.invocationId === event.retryOf
    ))
    edges.push({
      id: edgeId('retries', from, to),
      from,
      to,
      type: 'retries',
      derivation: 'rule_based',
      status: 'observed',
      evidenceIds: [event.eventId, previousResult?.eventId].filter(Boolean),
      rule: event.rule ?? RETRY_RULE,
    })
  }

  // -- P3 follows: consecutive invocations inside one step, candidate only ----
  const byStep = new Map()
  for (const { nodeId, invocation } of capabilityNodes) {
    if (!Number.isSafeInteger(invocation.turn) || !Number.isSafeInteger(invocation.step)) continue
    const key = `${invocation.turn}|${invocation.step}`
    if (!byStep.has(key)) byStep.set(key, [])
    byStep.get(key).push({ nodeId, invocation })
  }
  for (const group of byStep.values()) {
    const ordered = [...group].sort((left, right) => (
      (requestSeq.get(left.invocation.invocationId) ?? 0) - (requestSeq.get(right.invocation.invocationId) ?? 0)
    ))
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]
      const current = ordered[index]
      const evidence = [...previous.invocation.evidenceEventIds, ...current.invocation.evidenceEventIds]
        .filter((value, position, all) => all.indexOf(value) === position)
      if (!evidence.length) continue
      edges.push({
        id: edgeId('follows', previous.nodeId, current.nodeId),
        from: previous.nodeId,
        to: current.nodeId,
        type: 'follows',
        derivation: 'candidate',
        status: 'candidate',
        evidenceIds: evidence,
        rule: FOLLOWS_RULE,
      })
    }
  }

  // -- provenance guard: an edge that cannot cite evidence does not survive ---
  const keptEdges = []
  let droppedEdges = 0
  for (const edge of edges) {
    const ok = edge.evidenceIds.length > 0 && edge.evidenceIds.every((id) => knownEventIds.has(id))
    if (ok) keptEdges.push(edge)
    else droppedEdges += 1
  }

  const byType = Object.fromEntries(EDGE_TYPES.map((type) => [type, 0]))
  for (const edge of keptEdges) byType[edge.type] = (byType[edge.type] ?? 0) + 1

  return {
    sessionId,
    modelVersion: GRAPH_MODEL_VERSION,
    rootId,
    lineage: receipt?.lineage ?? { parentSessionId: null, delegationDepth: null },
    nodes,
    edges: keptEdges,
    unlinked,
    stats: {
      nodeCount: nodes.length,
      edgeCount: keptEdges.length,
      observedEdgeCount: keptEdges.filter((edge) => edge.status === 'observed').length,
      candidateEdgeCount: keptEdges.filter((edge) => edge.status === 'candidate').length,
      droppedEdgeCount: droppedEdges,
      unlinkedCount: unlinked.length,
      byType,
    },
  }
}
