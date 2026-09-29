import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { inspectRuntimeEdge, inspectRuntimeNode } from '../src/core/runtime-inspector.mjs'

// The Host's inspect answer must carry every field the client branches on.
//
// Two defects of exactly this shape were found by screenshotting rather than by testing:
//
//   · a collapsed node's `capabilityId` was absent, so the Skill inspector's three tabs
//     (§15: 运行证据 / 声明 ↔ 实际 / 学习验证) had never once appeared in the product.
//     The component was correct and its tests were green — they supplied their own payload,
//     which of course had the field. The tests proved the component worked, not that the
//     product could reach it.
//
// So this file asserts reachability rather than behaviour: it takes the field names straight
// out of the client source and requires the Host to send them. A new client branch on a new
// field fails here until the Host provides it.

const CLIENT = new URL('../src/dsh/client/client.js', import.meta.url)
const client = await readFile(CLIENT, 'utf8')

/** Field names the client reads off the inspector's `node` object to decide what to show. */
function clientNodeFields() {
  const names = new Set()
  for (const match of client.matchAll(/\bnode\??\.([a-zA-Z][a-zA-Z0-9]*)/g)) names.add(match[1])
  // `node.id` and friends are read by every panel; the interesting ones are the branch keys.
  for (const noise of ['id', 'label', 'kindLabel', 'statusLabel', 'memberIds']) names.delete(noise)
  // `node.closest(...)` and friends are DOM APIs that happen to share the name — the scan is
  // textual, so anything the DOM provides has to be excluded by hand.
  const DOM_MEMBERS = [
    'closest', 'querySelector', 'querySelectorAll', 'textContent', 'innerText', 'innerHTML',
    'getAttribute', 'setAttribute', 'removeAttribute', 'hasAttribute', 'dispatchEvent',
    'classList', 'style', 'dataset', 'offsetWidth', 'offsetHeight', 'getBoundingClientRect',
    'appendChild', 'removeChild', 'addEventListener', 'removeEventListener', 'focus', 'blur',
    'contains', 'matches', 'scrollIntoView', 'children', 'parentNode', 'parentElement',
  ]
  for (const dom of DOM_MEMBERS) names.delete(dom)
  return [...names].sort()
}

/** Field names the client reads off the inspector's `edge` object. */
function clientEdgeFields() {
  const names = new Set()
  for (const match of client.matchAll(/\bdata\.edge\??\.([a-zA-Z][a-zA-Z0-9]*)/g)) names.add(match[1])
  return [...names].sort()
}

// A Skill capability group, and a plain tool invocation — the two node shapes the inspector
// answers differently.
function graphFixture() {
  const skill = {
    id: 'group:11:skill',
    type: 'skill',
    role: 'invocation',
    title: 'skill × 1',
    capabilityId: 'skill',
    turn: 11,
    step: 1,
    outcome: 'success',
    status: 'observed',
    collapsed: true,
    memberCount: 1,
    evidenceEventIds: ['e1'],
  }
  const tool = {
    id: 'invocation:call_1',
    type: 'tool',
    role: 'invocation',
    title: 'read_file',
    capabilityId: 'tool',
    turn: 11,
    step: 2,
    outcome: 'success',
    status: 'observed',
    evidenceEventIds: ['e2'],
  }
  // The collapsed group is *layout-only*: `buildRuntimeGraph` never emits it, and the
  // inspector answers it from the layout node. Putting it in `graph.nodes` would take the
  // ordinary path instead, which is not the shape the real product has.
  const nodes = [tool]
  const edges = [{
    id: 'e:1', from: tool.id, to: skill.id, type: 'spawns', status: 'observed',
    derivation: 'observed', evidenceIds: ['e2'],
  }]
  return { nodes, edges, modelVersion: 1 }
}

const EVENT_INDEX = { get: () => undefined, events: [] }

test('§15 the inspector sends every field the client branches on (node)', () => {
  const graph = graphFixture()
  const fields = clientNodeFields()
  assert.ok(fields.length >= 4, `only ${fields.length} node fields found in the client — the scan is wrong`)

  const layout = { nodes: [{ id: 'group:11:skill', collapsed: true, label: 'skill × 1', status: 'observed', memberCount: 1, capabilityId: 'skill', memberIds: [] }], edges: [] }

  // Which fields are required depends on the node's shape, because that is how the client
  // reads them: `collapsed` and `memberCount` are only touched inside the folded branch.
  // Requiring them everywhere would force the Host to send `collapsed: false`, which says
  // nothing; requiring too little is how the capabilityId defect stayed hidden.
  const ALWAYS = ['capabilityId', 'kind', 'role', 'status', 'outcome']
  const WHEN_COLLAPSED = ['collapsed', 'memberCount']

  const shapes = [
    { label: 'collapsed group', nodeId: 'group:11:skill', expectCollapsed: true },
    { label: 'plain invocation', nodeId: 'invocation:call_1', expectCollapsed: false },
  ]

  for (const shape of shapes) {
    const answer = inspectRuntimeNode(graph, [], shape.nodeId, { layout, eventIndex: EVENT_INDEX })
    assert.equal(answer.found, true, `${shape.label}: the inspector reported the node missing`)

    const required = shape.expectCollapsed ? [...ALWAYS, ...WHEN_COLLAPSED] : ALWAYS
    for (const field of required) {
      assert.ok(fields.includes(field), `${shape.label}: the client no longer reads node.${field}; update this list`)
      assert.ok(
        Object.hasOwn(answer.node, field),
        `${shape.label}: the client reads node.${field} but the inspector never sends it — the branch is unreachable`,
      )
    }
  }
})

test('§15 a collapsed Skill group still says it is a Skill', () => {
  // The exact defect: the collapsed path hand-builds the node object, and it omitted
  // capabilityId, which is what `isSkill` keys off.
  const graph = graphFixture()
  const layout = { nodes: [{ id: 'group:11:skill', collapsed: true, label: 'skill × 1', status: 'observed', memberCount: 1, capabilityId: 'skill', memberIds: ['invocation:call_1'] }], edges: [] }
  const answer = inspectRuntimeNode(graph, [], 'group:11:skill', { layout, eventIndex: EVENT_INDEX })
  assert.equal(answer.node.capabilityId, 'skill', 'a collapsed Skill group must still carry capabilityId')
  assert.notEqual(answer.node.capabilityId, null)
})

test('§15 the inspector sends every field the client branches on (edge)', () => {
  const graph = graphFixture()
  const fields = clientEdgeFields()
  assert.ok(fields.length >= 4, `only ${fields.length} edge fields found in the client — the scan is wrong`)

  const answer = inspectRuntimeEdge(graph, [], 'e:1', { eventIndex: EVENT_INDEX })
  assert.equal(answer.found, true, 'the inspector reported the edge missing')
  for (const field of fields) {
    assert.ok(
      Object.hasOwn(answer.edge, field),
      `the client reads edge.${field} but the inspector never sends it`,
    )
  }
  // `from.label` / `to.label` are read a level deeper; the endpoints must be named.
  for (const end of ['from', 'to']) {
    assert.equal(typeof answer.edge[end].label, 'string', `edge.${end}.label must be a string`)
  }
})
