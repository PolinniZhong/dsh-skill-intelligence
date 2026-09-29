import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { computeRuntimeLayout } from '../src/core/runtime-layout.mjs'
import { buildReplayTimeline } from '../src/core/runtime-replay.mjs'
import { inspectRuntimeNode } from '../src/core/runtime-inspector.mjs'
import { buildSkillLoadIndex } from '../src/core/runtime-alignment.mjs'

// The collapsed-group seam.
//
// A collapsed group (`group:turn:capability`) is synthesised by the layout and exists in no
// graph. Everything around it, though, is written as though a node were an invocation — so
// every lookup by node id is a place where a group silently finds nothing.
//
// Four defects of this shape were found by screenshotting, one at a time:
//
//   beta.43  the bound loop swallowed a `skill × 1` group and lost its type label
//   beta.44  a collapsed node reached the client without `capabilityId`
//   beta.46  the learning tab had no label, and the panel thought no Skill was selected
//   beta.47  skillLoads matched on invocation ids and never saw the group
//
// This file audits the whole class rather than the next instance. It walks every lookup the
// product performs on a node id and asserts that a collapsed group resolves — or, where the
// lookup is already group-shaped, records why.

const CLIENT = new URL('../src/dsh/client/client.js', import.meta.url)
const client = await readFile(CLIENT, 'utf8')

const SESSION = 'session-seam'

function runtimeEvents() {
  const events = []
  let seq = 1
  for (let turn = 1; turn <= 6; turn += 1) {
    for (let n = 0; n < 14; n += 1) {
      const id = `call_${turn}_${n}`
      events.push({ eventId: `${SESSION}:req-${seq}`, seq, timestamp: 1790000000000 + seq * 1000, type: 'invocation.request', turn, step: n, status: 'requested', capabilityId: 'cli', capabilityName: 'bash', invocationId: id })
      events.push({ eventId: `${SESSION}:res-${seq}`, seq: seq + 90000, timestamp: 1790000000000 + seq * 1000 + 300, type: 'invocation.result', turn, step: n, status: 'success', capabilityId: 'cli', capabilityName: 'bash', invocationId: id })
      seq += 1
    }
  }
  // One Skill load inside a busy turn, which is what makes it a capability group.
  events.push({
    eventId: `${SESSION}:re:517`, seq: 517, timestamp: 1790045486435, type: 'skill.invocation',
    source: 'dsh', turn: 3, step: 1, status: 'success', capabilityId: 'skill',
    capabilityName: 'character-asset-kit', invocationId: 'skill-invocation:517',
  })
  return events.sort((a, b) => a.seq - b.seq)
}

async function fixture() {
  const { aggregateInvocations } = await import('../src/core/runtime-events.mjs')
  const invocations = aggregateInvocations(runtimeEvents())
  const nodes = [{ id: 'session', type: 'session', title: SESSION, role: 'session' }]
  const edges = []
  const byTurn = new Map()
  for (const invocation of invocations) {
    const key = invocation.turn ?? 'none'
    if (!byTurn.has(key)) byTurn.set(key, [])
    byTurn.get(key).push(invocation)
  }
  for (const turn of [...byTurn.keys()].sort((a, b) => a - b)) {
    nodes.push({ id: `turn:${turn}`, type: 'turn', title: `Turn ${turn}`, turn, role: 'turn' })
    edges.push({ id: `e:s:${turn}`, from: 'session', to: `turn:${turn}`, type: 'contains', evidenceIds: [] })
    for (const invocation of byTurn.get(turn)) {
      const id = `invocation:${invocation.invocationId}`
      nodes.push({
        id, type: invocation.kind === 'unknown' ? 'tool' : invocation.kind, title: invocation.name,
        role: 'invocation', capabilityId: invocation.kind, turn, step: invocation.step,
        outcome: invocation.status, status: 'observed', invocationId: invocation.invocationId,
        evidenceEventIds: [invocation.requestEventId].filter(Boolean),
      })
      edges.push({ id: `e:${turn}:${id}`, from: `turn:${turn}`, to: id, type: 'contains', evidenceIds: [] })
    }
  }
  const graph = { nodes, edges, modelVersion: 1 }
  // The loads the index joins against. Without these the index is empty by construction and
  // the test would pass for the wrong reason.
  const traceEvents = [{
    eventId: `${SESSION}:invocation:517`, sessionId: SESSION, turn: 3, step: 1,
    skillName: 'character-asset-kit', status: 'loaded',
  }]
  const receipt = { sessionId: SESSION, runtimeEvents: runtimeEvents(), traceEvents }
  const layout = computeRuntimeLayout(graph, { nodeLimit: 16, turnNodeLimit: 5, maxRowsPerColumn: 5, includeMemberIds: true })
  return { graph, receipt, layout }
}

test('a collapsed Skill group resolves to the invocation it stands for', async () => {
  const { graph, layout } = await fixture()
  const group = layout.nodes.find((node) => node.capabilityId === 'skill')
  assert.ok(group, 'the fixture must produce a collapsed Skill group')
  assert.equal(group.collapsed, true)
  assert.ok((group.memberIds ?? []).length > 0, 'a collapsed group must name its members')

  // The inspector must answer for the group id, which exists in no graph.
  const answer = inspectRuntimeNode(graph, [], group.id, { layout })
  assert.equal(answer.found, true, 'the inspector could not answer for a collapsed group')
  assert.equal(answer.node.capabilityId, 'skill')
  assert.ok(Array.isArray(answer.memberIds) && answer.memberIds.length > 0)

  // Every member the inspector names must be a real invocation, never another group.
  const invocationIds = new Set(graph.nodes.map((node) => node.id))
  for (const member of answer.memberIds) {
    assert.ok(invocationIds.has(member), `member ${member} is not an invocation — the chain is broken`)
  }
})

test('every load the receipts know about is reachable through the group the canvas draws', async () => {
  const { graph, receipt, layout } = await fixture()
  const loads = buildSkillLoadIndex(receipt, graph)
  assert.ok(loads.length > 0, 'the fixture must produce at least one Skill load')

  const group = layout.nodes.find((node) => node.capabilityId === 'skill')
  const answer = inspectRuntimeNode(graph, [], group.id, { layout })

  // What the product needs to be able to do: start from the node the user selected — a group
  // — and reach the load. The group id is never a load's nodeId, so the only route is its
  // members, which the inspector must therefore publish.
  assert.equal(
    loads.some((load) => load.nodeId === group.id), false,
    'the fixture is wrong: a group id must never appear as a load nodeId',
  )
  for (const load of loads) {
    assert.ok(
      (answer.memberIds ?? []).includes(load.nodeId),
      `load ${load.nodeId} is unreachable from group ${group.id} — the panel would say "select a Skill" while one is selected`,
    )
  }
})

test('the replay timeline names only nodes the canvas draws', async () => {
  const { graph, receipt, layout } = await fixture()
  const drawn = new Set(layout.nodes.map((node) => node.id))
  for (const step of buildReplayTimeline(graph, layout, receipt.runtimeEvents).steps ?? []) {
    if (!step.nodeId) continue
    assert.ok(drawn.has(step.nodeId), `a replay step points at ${step.nodeId}, which is never drawn — the highlight lands nowhere`)
  }
})

// SCOPE. These tests cover the *core* side of the seam: that a collapsed group names real
// invocations, that those members are the only route to a Skill load, and that replay steps
// land on drawn nodes.
//
// They do **not** cover the client's own lookup (`resolveSkillLoad`, inline in client.js).
// An earlier version of the second test re-implemented that lookup and passed with the client
// fix reverted — it was testing itself. Exercising the real one needs the client loaded
// through the shell's module seam, the way client-render-smoke.test.mjs does it. Until then
// the client's half is verified by screenshot, not by test, and that gap is worth closing.
