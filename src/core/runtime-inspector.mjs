/**
 * Inspector data for the runtime graph.
 *
 * The canvas requirement is that every line can answer **"why does this exist"**.
 * So this module never returns a relationship without also returning:
 *
 *   · the derivation and, when a rule produced it, the rule's name;
 *   · the concrete events the claim rests on;
 *   · a plain-language account of what the relationship does and does not mean.
 *
 * It is deliberately a lookup rather than a dump: the caller asks about one node
 * or one edge, so the client payload stays bounded no matter how large the run is.
 *
 * @module runtime-inspector
 */

import { RETRY_RULE } from './runtime-events.mjs'
import { FOLLOWS_RULE, SPAWN_ATTRIBUTION_RULE } from './runtime-graph.mjs'

export const INSPECTOR_MODEL_VERSION = 1

/** How many supporting events one lookup returns. A pointer, not a dump. */
export const INSPECTOR_EVIDENCE_LIMIT = 24

/**
 * How many relations one node lookup returns. A hub node — the session, or a turn
 * range — can relate to hundreds of nodes, and shipping them all would make the
 * answer to "why" larger than the graph it explains.
 */
export const INSPECTOR_RELATION_LIMIT = 24

/**
 * What each relationship means, in the terms the product is allowed to claim.
 *
 * Every entry states the limit alongside the meaning. That is not decoration: a
 * `follows` edge read as causation would be exactly the fabrication the whole
 * evidence model exists to prevent.
 */
const WHY = {
  'contains:direct': {
    meaning: '包含关系来自事件自带的 turn / step 字段：这条调用发生在该步骤内。',
    limit: '包含只说明结构位置，不说明该调用达成了什么。',
  },
  'spawns:direct': {
    meaning: '父会话发出的 subagent/catalog 事件直接命名了这个子会话，因此归属是宿主事实。',
    limit: '它证明子会话被创建，不证明子会话完成了什么，也不代表父会话的主导地位。',
  },
  'spawns:rule_based': {
    meaning: '该 Turn 内只有一个 Subagent 调用，因此把子会话归给它。',
    limit: 'catalog 事件只命名了子会话、没有命名创建者；这是具名规则下的候选归属，不是宿主事实。',
  },
  'retries:rule_based': {
    meaning: '该调用重复了同一 Turn 内先前失败的调用，判定依据是具名规则。',
    limit: '它只说明"再次尝试"，不说明重试是否更接近成功，也不说明失败的原因。',
  },
  'follows:candidate': {
    meaning: '两个调用在同一个步骤内相邻。',
    limit: '这只说明日志顺序，不说明因果关系，也不说明前者影响了后者。',
  },
}

const RULE_NAMES = {
  [RETRY_RULE]: 'same-turn-repeat-after-failure（同一 Turn 内失败后重复）',
  [FOLLOWS_RULE]: 'same-step-adjacent-invocation（同一步骤内相邻）',
  [SPAWN_ATTRIBUTION_RULE]: 'sole-subagent-invocation-in-turn（该 Turn 内唯一 Subagent 调用）',
}

/**
 * The boundary that rides on every answer. Stated as booleans so a caller — or a
 * test — can assert the absence of a claim rather than trusting prose.
 */
function evidenceBoundary() {
  return {
    causal: false,
    compliance: false,
    correctness: false,
    note: '本条关系只报告观测到的关联与它的依据；不表示因果、不表示 Skill 被遵循、不表示结果正确。',
  }
}

function explain(type, derivation, rule) {
  const entry = WHY[`${type}:${derivation}`] ?? WHY[`${type}:${rule}`]
  return {
    meaning: entry?.meaning ?? `由 ${derivation} 依据建立的关系。`,
    limit: entry?.limit ?? '本条只报告观测到的关联。',
    ruleName: rule ? (RULE_NAMES[rule] ?? rule) : null,
  }
}

function summarizeEvent(event) {
  return {
    eventId: event.eventId,
    type: event.type,
    source: event.source,
    status: event.status,
    timestamp: event.timestamp,
    capabilityId: event.capabilityId ?? null,
    capabilityName: event.capabilityName ?? null,
    invocationId: event.invocationId ?? null,
    childId: event.childId ?? null,
    rule: event.rule ?? null,
  }
}

function eventsById(runtimeEvents) {
  const map = new Map()
  for (const event of Array.isArray(runtimeEvents) ? runtimeEvents : []) {
    if (event && typeof event.eventId === 'string') map.set(event.eventId, event)
  }
  return map
}

function collectEvidence(index, evidenceIds) {
  const found = []
  const missing = []
  const seen = new Set()
  for (const id of evidenceIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const event = index.get(id)
    if (event) {
      if (found.length < INSPECTOR_EVIDENCE_LIMIT) found.push(summarizeEvent(event))
    } else if (missing.length < INSPECTOR_EVIDENCE_LIMIT) {
      missing.push(id)
    }
    if (found.length >= INSPECTOR_EVIDENCE_LIMIT && missing.length >= INSPECTOR_EVIDENCE_LIMIT) break
  }
  return { evidence: found, missingEvidenceIds: missing }
}

function relationRecord(graph, edge, direction, otherId) {
  const other = graph.nodes.find((node) => node.id === otherId)
  return {
    edgeId: edge.id,
    type: edge.type,
    direction,
    other: other
      ? { id: other.id, kind: other.type, label: other.title ?? other.id, status: other.status ?? 'unknown' }
      : { id: otherId, kind: 'unknown', label: otherId, status: 'unknown' },
    derivation: edge.derivation,
    status: edge.status,
    evidenceIds: edge.evidenceIds.slice(0, INSPECTOR_EVIDENCE_LIMIT),
    evidenceCount: edge.evidenceIds.length,
    ...explain(edge.type, edge.derivation, edge.rule),
  }
}

/**
 * Explain one node: what it is, what it relates to, and on what evidence.
 *
 * @param graph - the graph from `buildRuntimeGraph`.
 * @param runtimeEvents - the receipt's normalized events, for evidence lookup.
 * @param nodeId - the node to inspect. A collapsed group id from a layout is
 * accepted too, and is answered with the members it stands for.
 * @param options - `layout`, so a synthetic node can be resolved to its members.
 */
export function inspectRuntimeNode(graph, runtimeEvents, nodeId, options = {}) {
  const index = eventsById(runtimeEvents)
  const layoutNode = options.layout?.nodes?.find((candidate) => candidate.id === nodeId)
  const memberIds = layoutNode?.memberIds ?? []
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)

  // A collapsed group stands for other nodes. It is answered by naming them, so a
  // folded node is a shortcut to the evidence rather than a dead end.
  if (!node && layoutNode?.collapsed) {
    const { evidence, missingEvidenceIds } = collectEvidence(index, [
      ...new Set(memberIds.flatMap((id) => graph.nodes.find((candidate) => candidate.id === id)?.evidenceEventIds ?? [])),
    ])
    return {
      modelVersion: INSPECTOR_MODEL_VERSION,
      found: true,
      nodeId,
      node: {
        id: nodeId,
        kind: 'group',
        role: 'collapsed',
        label: layoutNode.label,
        status: layoutNode.status,
        collapsed: true,
        memberCount: layoutNode.memberCount,
        // **`capabilityId` 必须带上。** 客户端靠它决定 Inspector 的 Tab：
        // `isSkill = node?.capabilityId === 'skill'`。此前这个精简对象没有它，
        // 于是 §15 要求的「运行证据 / 声明 ↔ 实际 / 学习验证」三个 Tab **在真实产品里
        // 从来没有出现过**——测试用的是自己造的载荷，所以一直是绿的。
        capabilityId: layoutNode.capabilityId ?? null,
        kindLabel: layoutNode.kindLabel ?? null,
        outcome: layoutNode.outcome ?? null,
      },
      memberIds,
      relations: [],
      meaning: '这是一个折叠节点：它把同一 Turn 内同一能力的多次调用合并成一个方块，避免画布被上千个方块淹没。',
      limit: '折叠节点本身不主张任何关系。它代表哪些调用、每一次调用各自的依据，要看它列出的成员。',
      evidence,
      missingEvidenceIds,
      evidenceBoundary: evidenceBoundary(),
    }
  }

  if (!node) {
    return {
      modelVersion: INSPECTOR_MODEL_VERSION,
      found: false,
      nodeId,
      relations: [],
      evidence: [],
      evidenceBoundary: evidenceBoundary(),
    }
  }

  const allRelations = []
  for (const edge of graph.edges) {
    if (edge.from === nodeId) allRelations.push(relationRecord(graph, edge, 'out', edge.to))
    else if (edge.to === nodeId) allRelations.push(relationRecord(graph, edge, 'in', edge.from))
  }
  const relations = allRelations.slice(0, INSPECTOR_RELATION_LIMIT)

  const { evidence, missingEvidenceIds } = collectEvidence(index, node.evidenceEventIds ?? [])
  return {
    modelVersion: INSPECTOR_MODEL_VERSION,
    found: true,
    nodeId,
    node: {
      id: node.id,
      kind: node.type,
      role: node.role ?? null,
      label: node.title ?? node.id,
      capabilityId: node.capabilityId ?? null,
      turn: node.turn ?? null,
      step: node.step ?? null,
      outcome: node.outcome ?? null,
      status: node.status ?? 'unknown',
      invocationType: node.subtitle ?? null,
      memberIds,
    },
    relations,
    relationCount: allRelations.length,
    evidence,
    missingEvidenceIds,
    evidenceBoundary: evidenceBoundary(),
  }
}

/**
 * Explain one edge: why it exists, on what rule, and on which events.
 *
 * @param graph - the graph from `buildRuntimeGraph`.
 * @param runtimeEvents - the receipt's normalized events.
 * @param edgeId - the edge to inspect. Merged layout edges accept any of their ids.
 */
export function inspectRuntimeEdge(graph, runtimeEvents, edgeId) {
  const ids = Array.isArray(edgeId) ? edgeId : [edgeId]
  const edge = graph.edges.find((candidate) => ids.includes(candidate.id))
  if (!edge) {
    return {
      modelVersion: INSPECTOR_MODEL_VERSION,
      found: false,
      edgeId: ids[0] ?? null,
      evidence: [],
      evidenceBoundary: evidenceBoundary(),
    }
  }
  const index = eventsById(runtimeEvents)
  const { evidence, missingEvidenceIds } = collectEvidence(index, edge.evidenceIds)
  const from = graph.nodes.find((node) => node.id === edge.from)
  const to = graph.nodes.find((node) => node.id === edge.to)
  return {
    modelVersion: INSPECTOR_MODEL_VERSION,
    found: true,
    edgeId: edge.id,
    edge: {
      id: edge.id,
      type: edge.type,
      derivation: edge.derivation,
      status: edge.status,
      rule: edge.rule ?? null,
      evidenceIds: edge.evidenceIds,
      evidenceCount: edge.evidenceIds.length,
      from: from ? { id: from.id, kind: from.type, label: from.title ?? from.id } : { id: edge.from, kind: 'unknown', label: edge.from },
      to: to ? { id: to.id, kind: to.type, label: to.title ?? to.id } : { id: edge.to, kind: 'unknown', label: edge.to },
    },
    ...explain(edge.type, edge.derivation, edge.rule),
    evidence,
    missingEvidenceIds,
    evidenceBoundary: evidenceBoundary(),
  }
}
