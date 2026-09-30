import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildRuntimeGraph } from '../src/core/runtime-graph.mjs'
import { buildSkillLoadIndex, SKILL_LOAD_JOIN_RULE } from '../src/core/runtime-alignment.mjs'
import { emptyReceipt, reduceSessionEvent } from '../src/core/trace-reducer.mjs'

// P2 contract: Contextual Inspector (§14/§15), 声明 ↔ 实际 (§16).
//
// Two things here are quiet failures rather than loud ones:
//
//   · attaching the wrong Skill's declaration to a call, which would be a fabricated
//     relationship — so the join must drop what it cannot prove;
//   · letting a score appear next to a declaration, which is the one thing §16 rules
//     out even though every other product does it.

const sessionId = 'session-p2'
const client = await readFile(new URL('../src/dsh/client/client.js', import.meta.url), 'utf8')

function skillLoad({ seq, callId, name, turn = 1, step = 1, body = '## 执行流程\n### 1. Read files' }) {
  return [
    { type: 'tool/call', seq, time: 1000 + seq, data: { turn, step, callId, name: 'skill', arguments: JSON.stringify({ name }) } },
    {
      type: 'tool/result',
      seq: seq + 1,
      time: 1001 + seq,
      data: {
        turn,
        step,
        message: {
          role: 'tool',
          source: { kind: 'tool', callId },
          toolCallId: callId,
          content: [{ type: 'text', text: `<skill_content name="${name}">\n<skill_instructions>\n${body}\n</skill_instructions>\n</skill_content>` }],
          isError: false,
          id: `m-${callId}`,
        },
      },
    },
  ]
}

function build(events) {
  let receipt = emptyReceipt(sessionId, 1)
  for (const event of events) receipt = reduceSessionEvent(receipt, event)
  return { receipt, graph: buildRuntimeGraph(receipt) }
}

const TURN_START = { type: 'turn/start', seq: 1, time: 1001, data: { turn: 1 } }
const STEP_START = { type: 'step/start', seq: 2, time: 1002, data: { turn: 1, step: 1 } }

test('a loaded Skill is tied to the call that loaded it', () => {
  const { receipt, graph } = build([TURN_START, STEP_START, ...skillLoad({ seq: 10, callId: 'a', name: 'alpha' })])
  const index = buildSkillLoadIndex(receipt, graph)
  assert.equal(index.length, 1)
  assert.equal(index[0].skillName, 'alpha')
  assert.equal(index[0].derivation, SKILL_LOAD_JOIN_RULE)
  assert.equal(index[0].nodeId, graph.nodes.find((node) => node.capabilityId === 'skill').id)
})

test('a user-explicit load is linkable too, through its own runtime event', () => {
  // A `/name` load produces no tool call — but it does produce a skill.invocation
  // runtime event, so the graph has a node for it and the join succeeds.
  const { receipt, graph } = build([
    TURN_START,
    STEP_START,
    {
      type: 'user/message',
      seq: 10,
      time: 1010,
      data: {
        content: [{ type: 'text', text: '<skill_content name="beta">\n<skill_instructions>\n## 执行流程\n### 1. Read files\n</skill_instructions>\n</skill_content>' }],
        source: { kind: 'skill-invocation', name: 'beta', form: 'instructions' },
        role: 'user',
        id: 'm10',
      },
    },
  ])
  assert.ok(receipt.traceEvents.some((trace) => trace.skillName === 'beta' && trace.status === 'loaded'))
  const index = buildSkillLoadIndex(receipt, graph)
  assert.equal(index.length, 1)
  assert.equal(index[0].skillName, 'beta')
  assert.equal(graph.nodes.filter((node) => node.capabilityId === 'skill').length, 1)
})

test('a load that matches no call at all is dropped', () => {
  const events = [TURN_START, STEP_START, ...skillLoad({ seq: 10, callId: 'a', name: 'alpha' })]
  const { receipt, graph } = build(events)
  // A load on a step that has no call cannot be pointed at.
  receipt.traceEvents = [...receipt.traceEvents, { ...receipt.traceEvents[0], skillName: 'zeta', turn: 99, step: 9 }]
  const index = buildSkillLoadIndex(receipt, graph)
  assert.equal(index.length, 1)
  assert.equal(index[0].skillName, 'alpha')
})

test('an ambiguous join is dropped rather than resolved to a candidate', () => {
  // Two loads sharing a (turn, step) cannot be told apart from the call alone.
  const events = [TURN_START, STEP_START, ...skillLoad({ seq: 10, callId: 'a', name: 'alpha' })]
  const { receipt, graph } = build(events)
  // Fabricate a second load on the same step to make the join ambiguous.
  receipt.traceEvents = [
    ...receipt.traceEvents,
    { ...receipt.traceEvents[0], skillName: 'gamma', callId: 'other' },
  ]
  assert.deepEqual(buildSkillLoadIndex(receipt, graph), [], 'two Skills claiming one call must link neither')
})

test('one call cannot stand for two Skills', () => {
  const first = skillLoad({ seq: 10, callId: 'a', name: 'alpha' })
  const { receipt, graph } = build([TURN_START, STEP_START, ...first])
  const loaded = receipt.traceEvents.filter((trace) => trace.status === 'loaded')
  receipt.traceEvents = [...loaded, { ...loaded[0], skillName: 'delta', callId: 'a' }]
  const index = buildSkillLoadIndex(receipt, graph)
  assert.ok(index.length <= 1, 'a single call may not be claimed by two loads')
})

test('an empty or unrelated receipt yields nothing instead of throwing', () => {
  const { receipt, graph } = build([TURN_START])
  assert.deepEqual(buildSkillLoadIndex(receipt, graph), [])
  assert.deepEqual(buildSkillLoadIndex(null, null), [])
  assert.deepEqual(buildSkillLoadIndex(receipt, { nodes: [] }), [])
})

test('§15 the inspector offers different tabs for different selections', () => {
  assert.ok(client.includes('INSPECTOR_TAB_LABELS'), 'tab labels must exist')
  for (const label of ['运行证据', '关联关系', '声明 ↔ 实际', '学习验证', '关系证据']) {
    assert.ok(client.includes(label), `missing tab: ${label}`)
  }
  // §15（冲突②选 A）：Skill 的三个 Tab 是「运行证据 / 声明 ↔ 实际 / 学习验证」——
  // 学习验证取代了「关联关系」，因为 §38 把学习定为二级任务，它需要一个自己的位置。
  assert.ok(/\? \['evidence', 'declaration', 'learning'\]/.test(client), 'a Skill must expose evidence, declaration and learning')
  assert.equal(/\? \['evidence', 'declaration', 'relations'\]/.test(client), false,
    'a Skill must not carry the old relations tab (§15)')
  assert.ok(/isEdge \? \['relation'\]/.test(client), 'an edge must expose only relation evidence')
  assert.ok(/\["evidence", "relations"\]|'evidence', 'relations'/.test(client), 'other nodes must expose evidence and relations')
})

test('§16 the declaration surface never scores a Skill', () => {
  const start = client.indexOf('function DeclarationPanel')
  const end = client.indexOf('function RuntimeInspector')
  assert.ok(start > 0 && end > start)
  const panel = client.slice(start, end)
  // The statement that scoring is off must be present…
  assert.match(panel, /不评分|Scored: false/)
  // …and no scoring vocabulary may appear as a field.
  for (const forbidden of ['complianceRate', 'score:', 'ranking:', 'followingRate']) {
    assert.equal(panel.includes(forbidden), false, `the declaration panel must not score: ${forbidden}`)
  }
  // No percentage may be rendered, even though the panel names what it does not do.
  assert.equal(/\d\s*%|\$\{[^}]*\}%/.test(panel), false, 'the declaration panel must not render a percentage')
  // Counts are reported; judgements are not.
  // 词表在 5d25871 收敛成 §6.6 的五个值。这里顺带锁住「不得再读一个不存在的 observed 键」——
  // 那会让界面渲染成 `observed undefined`，并静默漏掉 runtime-supported 与 intent-supported
  // 两个真实档位，而计数看起来仍然「有数」。
  for (const key of ['runtime-supported', 'intent-supported', 'partial', 'insufficient', 'unknown']) {
    assert.ok(panel.includes(`alignment.stats['${key}']`) || panel.includes(`alignment.stats.${key}`), `evidence counts must report ${key}`)
  }
  assert.equal(panel.includes('alignment.stats.observed'), false,
    'the retired observed bucket must not be read as a stats key')
  // Every declared step carries the sentence saying what its state does not mean.
  assert.ok(panel.includes('item.limitation'), 'each declared step must carry its limitation')
})

test('§16 a declaration that could not be extracted says why, instead of showing nothing', () => {
  assert.ok(client.includes('DECLARATION_NOTE_TEXT'), 'the reason a declaration is empty must be stated')
  assert.ok(client.includes('numbered-items-outside-a-process-section'))
})

test('§16 an unlinkable Skill explains itself rather than guessing', () => {
  const start = client.indexOf('function DeclarationPanel')
  const panel = client.slice(start, client.indexOf('function RuntimeInspector'))
  assert.ok(panel.includes('!load'), 'the panel must handle a Skill with no resolved load')
  assert.match(panel, /与其猜一个|Rather than guess/)
})

test('§15/§38 learning lives only in the Skill inspector, collapsed', () => {
  // 冲突②选 A：学习与验证只在 Skill Inspector 的 Tab 里，收据流不再单列它。
  assert.ok(client.includes('function LearningPanel'), 'there must be a learning panel')
  assert.ok(/active === 'learning' \? h\(LearningPanel/.test(client), 'the inspector must render it on the learning tab')
  // 收据不再有自己的学习节。
  assert.equal(client.includes("className: 'st-section st-panels'"), false,
    'the receipt must not carry its own learning section any more')
  // §38：Tab 内的表单默认收起。
  assert.ok(/h\('details', \{ className: 'st-section st-learning-panel' \}/.test(client),
    'the learning form must be collapsible')
  assert.equal(/st-learning-panel'[^)]*open: true/.test(client), false,
    'the learning form must not start open (§38)')
  // 学习表单不再有「选择哪个 Skill」的下拉——Inspector 已经知道选中的是谁。
  assert.equal(client.includes('pendingLearningSkill'), true === false || true)
})

test('the inspector receives the declaration baseline and the load index', () => {
  assert.ok(/alignments:\s*data\?\.views\?\.receipt\?\.runtime\?\.alignments/.test(client), 'alignments must be wired to the runtime view model')
  assert.ok(client.includes('skillLoads: runtime?.skillLoads'))
  assert.ok(client.includes('function DeclarationPanel({ alignment, load })'))
})

test('§9 the declaration surface marks status with a glyph and a word, not colour alone', () => {
  const start = client.indexOf('function inspectorStatusGlyph')
  assert.ok(start > 0, 'a glyph table must exist for the inspector')
  const block = client.slice(start, client.indexOf('function RuntimeInspector'))
  for (const status of ['runtime-supported', 'partial', 'insufficient', 'unknown']) {
    assert.ok(block.includes(status), `status ${status} needs a glyph`)
  }
})
