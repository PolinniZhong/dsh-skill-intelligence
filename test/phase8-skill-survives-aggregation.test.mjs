import test from 'node:test'
import assert from 'node:assert/strict'

import { aggregateInvocations } from '../src/core/runtime-events.mjs'
import { computeRuntimeLayout } from '../src/core/runtime-layout.mjs'

// The reading view must be able to show the thing the product is named after.
//
// A regression guard, because this defect was silent in the worst way: every layer
// passed. The graph held the Skill, the layout placed it correctly, and the bound
// loop merged its capability group into a generic `mixed` overflow group — dropping
// the type label and, since published `memberIds` are truncated to 24, often the
// member reference too. The interface then had no way to tell that a Skill had run.
//
// Measured on a real 39-turn session before the fix:
//
//   graph 400   195 nodes, skill present in 2 groups
//   flow  40     40 nodes, skill present nowhere
//   flow  16     20 nodes, skill present nowhere
//
// The assertions below are deliberately about the *flow* budgets, not the graph,
// because the graph was never the broken one.

const SESSION = 'session-fixture'

/** One `skill.invocation` exactly as DSH writes it: self-contained, no request/result pair. */
function skillEvent(invocationId, turn, timestamp) {
  return {
    eventId: `${SESSION}:re:${invocationId}`,
    seq: Number(invocationId.split(':')[1]),
    timestamp,
    type: 'skill.invocation',
    source: 'dsh',
    turn,
    step: 1,
    status: 'success',
    capabilityId: 'skill',
    capabilityName: 'character-asset-kit',
    invocationId,
  }
}

/** A busy tool call so the graph crosses §36's aggregation threshold. */
function toolRequest(invocationId, turn, seq) {
  return {
    eventId: `${SESSION}:re:req-${seq}`,
    seq,
    timestamp: 1790045000000 + seq * 1000,
    type: 'invocation.request',
    source: 'dsh',
    turn,
    step: seq,
    status: 'requested',
    capabilityId: 'cli',
    capabilityName: 'bash',
    invocationId,
  }
}

function toolResult(invocationId, turn, seq) {
  return {
    eventId: `${SESSION}:re:res-${seq}`,
    seq: seq + 100000,
    timestamp: 1790045000000 + seq * 1000 + 400,
    type: 'invocation.result',
    source: 'dsh',
    turn,
    step: seq,
    status: 'success',
    capabilityId: 'cli',
    capabilityName: 'bash',
    invocationId,
  }
}

/**
 * A session big enough to be aggregated, with two Skill loads inside turns that the
 * turn column will fold into ranges.
 * @returns runtime events in log order.
 */
function buildEvents() {
  const events = []
  let seq = 1
  // 14 calls per turn so `collapseTurn` fires (§20.1 folds a busy turn even in a small
  // run). The real session that lost its Skill had exactly this shape: the Skill load sat
  // in a turn busy enough to be folded, so it became a `skill × 1` capability group — and
  // it was that group the bound loop swallowed.
  for (let turn = 1; turn <= 39; turn += 1) {
    for (let n = 0; n < 14; n += 1) {
      const id = `call_${turn}_${n}`
      events.push(toolRequest(id, turn, seq))
      events.push(toolResult(id, turn, seq))
      seq += 1
    }
  }
  // Inside the folded ranges, which is where the real session lost them.
  events.push(skillEvent('skill-invocation:517', 11, 1790045486435))
  events.push(skillEvent('skill-invocation:1004', 14, 1790045487000))
  return events.sort((a, b) => a.seq - b.seq)
}

function buildGraph() {
  const invocations = aggregateInvocations(buildEvents())
  const invocationsByTurn = new Map()
  for (const invocation of invocations) {
    const key = invocation.turn ?? 'none'
    if (!invocationsByTurn.has(key)) invocationsByTurn.set(key, [])
    invocationsByTurn.get(key).push(invocation)
  }

  const nodes = [{ id: 'session', type: 'session', title: SESSION, role: 'session' }]
  const edges = []
  const turns = [...invocationsByTurn.keys()].filter((key) => key !== 'none').sort((a, b) => a - b)
  for (const turn of turns) {
    nodes.push({ id: `turn:${turn}`, type: 'turn', title: `Turn ${turn}`, turn, role: 'turn' })
    edges.push({ id: `e:session:${turn}`, from: 'session', to: `turn:${turn}`, type: 'contains', evidenceIds: [] })
    for (const invocation of invocationsByTurn.get(turn)) {
      const id = `invocation:${invocation.invocationId}`
      nodes.push({
        id,
        type: invocation.kind === 'unknown' ? 'tool' : invocation.kind,
        title: invocation.name,
        role: 'invocation',
        capabilityId: invocation.kind,
        turn,
        step: invocation.step,
        outcome: invocation.status,
        status: 'observed',
        invocationId: invocation.invocationId,
      })
      edges.push({ id: `e:${turn}:${id}`, from: `turn:${turn}`, to: id, type: 'contains', evidenceIds: [] })
    }
  }
  return { nodes, edges, modelVersion: 1 }
}

test('§8 a Skill load survives aggregation in the reading view', () => {
  const graph = buildGraph()
  const graphSkill = graph.nodes.filter((node) => node.capabilityId === 'skill')
  assert.equal(graphSkill.length, 2, 'the fixture must actually contain two Skill loads')

  // The flow budgets, not the graph budget: the graph was never the broken one.
  for (const budget of [
    { label: 'flow default rows', options: {} },
    { label: 'flow wide', options: { nodeLimit: 40, turnNodeLimit: 12 } },
    { label: 'flow narrow', options: { nodeLimit: 16, turnNodeLimit: 5, maxRowsPerColumn: 5 } },
  ]) {
    const layout = computeRuntimeLayout(graph, { ...budget.options, includeMemberIds: true })
    const rendered = layout.nodes.filter((node) => node.capabilityId === 'skill')
    assert.ok(
      rendered.length > 0,
      `${budget.label}: no node with capabilityId "skill" — a Skill Trace whose reading view cannot show a Skill`,
    )
    // A `mixed` bucket would mean the type label was dropped, which is how this broke.
    for (const node of rendered) {
      assert.notEqual(node.capabilityId, 'mixed', `${budget.label}: the Skill was merged into an untyped bucket`)
    }
  }
})

test('§36 protecting the Skill does not unbind the size', () => {
  const graph = buildGraph()
  for (const nodeLimit of [16, 40]) {
    const layout = computeRuntimeLayout(graph, { nodeLimit, includeMemberIds: true })
    // Protecting Skill groups makes the bound soft, not absent: measured on a real 39-turn
    // session it lands at nodeLimit + 6 (16 -> 22). A linear blow-up would mean the loop
    // stopped reducing, which is the failure this guards.
    assert.ok(
      layout.nodes.length <= nodeLimit * 2,
      `nodeLimit ${nodeLimit} produced ${layout.nodes.length} nodes — the loop stopped reducing`,
    )
  }
})

test('§32 a merged bucket never references a node that is not drawn', () => {
  const graph = buildGraph()
  const layout = computeRuntimeLayout(graph, { nodeLimit: 16, includeMemberIds: true })
  const drawn = new Set(layout.nodes.map((node) => node.id))
  const skills = graph.nodes.filter((node) => node.capabilityId === 'skill').map((node) => node.id)

  for (const node of layout.nodes) {
    for (const member of node.memberIds ?? []) {
      // Either it is drawn, or it is one of the calls folded into this bucket — but it
      // must never be the id of another bucket, which would break the chain silently.
      assert.ok(
        !String(member).startsWith('group:') && !String(member).startsWith('overflow:'),
        `${node.id} references the group ${member}, which is itself collapsed — the chain is broken`,
      )
    }
  }
  const reachable = layout.nodes.some((node) => (
    skills.includes(node.id) || (node.memberIds ?? []).some((member) => skills.includes(member))
  ))
  assert.ok(reachable, 'no drawn node accounts for the Skill loads')
})
