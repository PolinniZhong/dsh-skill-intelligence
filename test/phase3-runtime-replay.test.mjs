import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { REPLAY_MODEL_VERSION, REPLAY_STEP_LIMIT, buildReplayTimeline } from '../src/core/runtime-replay.mjs'
import { computeRuntimeLayout } from '../src/core/runtime-layout.mjs'
import { buildRuntimeGraph } from '../src/core/runtime-graph.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// Runtime replay contract (§37).
//
// The replay is a read. Two failure modes it must not have:
//
//   · stepping onto a node the canvas is not drawing, which reads as "nothing
//     happened" at that step;
//   · writing anything while replaying, which would make the picture a claim.

const sessionId = 'session-replay'
const client = await readFile(new URL('../src/dsh/client/client.js', import.meta.url), 'utf8')

function pair(seq, index, { name = 'bash', turn = 1, at = 1000 + seq, isError = false } = {}) {
  const callId = `c${index}`
  return [
    { type: 'tool/call', seq, time: at, data: { turn, step: 1, callId, name, arguments: '{}' } },
    {
      type: 'tool/result',
      seq: seq + 1,
      time: at + 1,
      data: {
        turn,
        step: 1,
        message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: 'ok' }], isError, id: `m${callId}` },
      },
    },
  ]
}

function build(events) {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const graph = buildRuntimeGraph(receipt)
  const layout = computeRuntimeLayout(graph)
  return { receipt, graph, layout }
}

const TURN = { type: 'turn/start', seq: 1, time: 1000, data: { turn: 1 } }
const STEP = { type: 'step/start', seq: 2, time: 1001, data: { turn: 1, step: 1 } }

test('the timeline follows runtime-event order', () => {
  const { receipt, graph, layout } = build([TURN, STEP, ...pair(10, 'a'), ...pair(20, 'b'), ...pair(30, 'c')])
  const timeline = buildReplayTimeline(graph, layout, receipt.runtimeEvents)
  assert.equal(timeline.modelVersion, REPLAY_MODEL_VERSION)
  assert.ok(timeline.steps.length >= 3)
  // The events arrive in order, so the timeline is in order.
  const seqs = timeline.steps.map((step) => step.seq).filter((seq) => seq !== null)
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'steps must not go back in time')
})

test('consecutive events on one node are one step, not two', () => {
  // A request and its result both belong to one node; walking them separately would
  // make the replay appear to stall on a single box.
  const { receipt, graph, layout } = build([TURN, STEP, ...pair(10, 'a')])
  const timeline = buildReplayTimeline(graph, layout, receipt.runtimeEvents)
  const ids = timeline.steps.map((step) => step.nodeId)
  assert.equal(new Set(ids).size, ids.length, 'no node may appear twice in a row')
})

test('every step lands on a drawn node', () => {
  const { receipt, graph, layout } = build([TURN, STEP, ...pair(10, 'a'), ...pair(20, 'b')])
  const drawn = new Set(layout.nodes.map((node) => node.id))
  const timeline = buildReplayTimeline(graph, layout, receipt.runtimeEvents)
  assert.ok(timeline.steps.length > 0)
  for (const step of timeline.steps) {
    assert.ok(drawn.has(step.nodeId), `step points at an undrawn node: ${step.nodeId}`)
  }
})

test('an event for a folded node resolves to the group that drew it', () => {
  // Many calls in one turn collapse; a step must still land on the visible group.
  const events = [TURN, STEP]
  for (let index = 0; index < 30; index += 1) events.push(...pair(100 + index * 2, `g${index}`))
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  const graph = buildRuntimeGraph(receipt)
  // Folding only kicks in past a size threshold; lower it so the case is reachable.
  const layout = computeRuntimeLayout(graph, { nodeLimit: 20 })
  const collapsed = layout.nodes.filter((node) => node.collapsed)
  assert.ok(collapsed.length > 0, 'expected the view to fold something')
  const timeline = buildReplayTimeline(graph, layout, receipt.runtimeEvents)
  const drawn = new Set(layout.nodes.map((node) => node.id))
  const folded = new Set(collapsed.map((node) => node.id))
  assert.ok(timeline.steps.some((step) => folded.has(step.nodeId)), 'a folded group must be steppable')
  for (const step of timeline.steps) assert.ok(drawn.has(step.nodeId))
})

test('the timeline reports the run window and the event count', () => {
  const { receipt, graph, layout } = build([TURN, STEP, ...pair(10, 'a', { at: 5000 }), ...pair(20, 'b', { at: 9000 })])
  const timeline = buildReplayTimeline(graph, layout, receipt.runtimeEvents)
  assert.equal(timeline.eventCount, receipt.runtimeEvents.length)
  assert.ok(timeline.startedAt <= timeline.endedAt)
  assert.equal(typeof timeline.startedAt, 'number')
})

test('a very long run is truncated rather than shipped whole', () => {
  const many = [TURN, STEP]
  for (let index = 0; index < REPLAY_STEP_LIMIT + 40; index += 1) many.push(...pair(100 + index * 2, `x${index}`, { name: 'read' }))
  const { receipt, graph, layout } = build(many)
  const timeline = buildReplayTimeline(graph, layout, receipt.runtimeEvents)
  assert.ok(timeline.steps.length <= REPLAY_STEP_LIMIT, `steps ${timeline.steps.length}`)
  // Truncation is reported, not silent.
  if (timeline.steps.length === REPLAY_STEP_LIMIT) assert.equal(timeline.truncated, true)
})

test('a run with nothing to replay yields an empty timeline, not an error', () => {
  assert.deepEqual(buildReplayTimeline(null, null, null).steps, [])
  assert.deepEqual(buildReplayTimeline({}, { nodes: [] }, []).steps, [])
  const { graph, layout } = build([TURN])
  assert.deepEqual(buildReplayTimeline(graph, layout, []).steps, [])
})

test('§37 replay is a read: the module produces node ids and nothing else', async () => {
  const source = await readFile(new URL('../src/core/runtime-replay.mjs', import.meta.url), 'utf8')
  for (const forbidden of ['writeFile', 'append(', 'fetch(', 'store.', 'receipt.traceEvents =']) {
    assert.equal(source.includes(forbidden), false, `the timeline must not write: ${forbidden}`)
  }
})

test('§37 the client steps rather than animating', () => {
  const start = client.indexOf('function ReplayControls')
  const end = client.indexOf('function FlowCanvas')
  assert.ok(start > 0 && end > start, 'replay controls must exist')
  const block = client.slice(start, end)
  // Discrete controls, an explicit counter, and a pause.
  for (const required of ['上一步', '下一步', '当前', '暂停']) {
    assert.ok(block.includes(required), `replay must offer ${required}`)
  }
  // §37: not a video. No animation loop, and no transition-driven highlight.
  for (const forbidden of ['requestAnimationFrame', 'transition:', 'animate(', '@keyframes']) {
    assert.equal(block.includes(forbidden), false, `replay must not animate: ${forbidden}`)
  }
  // Time range is shown (§37).
  assert.ok(block.includes('startedAt') && block.includes('endedAt'), 'the run window must be shown')
})

test('§37 replay never writes back to the receipt', () => {
  // 只取回放组件自身（到下一个组件定义为止）。此前用一个 6000 字符的窗口，
  // 一旦相邻组件出现 onUpdate / setData 就会误报——那是窗口太宽，不是回放写数据。
  const start = client.indexOf('function ReplayControls')
  const end = client.indexOf('\n  function ', start + 10)
  const block = client.slice(start, end > start ? end : start + 4000)
  for (const forbidden of ['api(', "method: 'POST'", 'onUpdate', 'setData(']) {
    assert.equal(block.includes(forbidden), false, `replay must not call the API: ${forbidden}`)
  }
  // The controls are driven by an index and a playing flag, nothing else.
  assert.ok(block.includes('onIndex') && block.includes('onPlaying'))
})
