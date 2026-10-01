import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  FLOW_DECLARATION_NOTE, FLOW_EMPTY_TEXT, FLOW_EVIDENCE_FALLBACK, FLOW_EVIDENCE_FORBIDDEN,
  FLOW_EVIDENCE_STATES, FLOW_KIND_LABELS, FLOW_TRUNCATED_TEXT, FLOW_UNAVAILABLE_TEXT,
  flowEvidenceLabel, flowEvidenceState, flowKindLabel,
} from '../src/core/flow-evidence.mjs'
import { ALIGNMENT_RELATIONSHIPS } from '../src/core/runtime-alignment.mjs'

// 这一组用例守的是一句措辞，而不是一个函数。
//
// 整个界面里最容易说错的一句话是「这一步有没有执行」。我们知道的只有「有没有留下可对齐的
// 运行证据」，而这两件事之间没有任何推理关系：一个 Skill 的步骤完全可以由模型在推理里完成，
// 只是没留下工具调用。所以状态词表里**不允许出现任何结论性动词**，并且这一条要用源码断言钉住，
// 而不是靠评审时看见。

test('every alignment relationship has exactly one wording', () => {
  const covered = Object.keys(FLOW_EVIDENCE_STATES)
  assert.deepEqual([...covered].sort(), [...ALIGNMENT_RELATIONSHIPS].sort(),
    'the wording table and the model layer must agree on the set of relationships')
})

test('the words say what was observed, never what the Agent did', () => {
  for (const [relationship, state] of Object.entries(FLOW_EVIDENCE_STATES)) {
    for (const forbidden of FLOW_EVIDENCE_FORBIDDEN) {
      assert.ok(!state.zh.includes(forbidden), `${relationship} must not say ${forbidden}`)
      assert.ok(!state.en.includes(forbidden), `${relationship} must not say ${forbidden} in English`)
    }
  }

  // 五个状态必须是五句不同的话：`insufficient` 与 `unknown` 合成一句，
  // 「我们没看到」与「我们判断不了」就分不开了，而这两件事的处理方式不同。
  const labels = Object.values(FLOW_EVIDENCE_STATES).map((state) => state.zh)
  assert.equal(new Set(labels).size, labels.length, 'no two relationships share a wording')

  // 缺证据那一档的具体措辞：它读起来必须是"没看到"，不是"没发生"。
  assert.equal(FLOW_EVIDENCE_STATES.insufficient.zh, '暂无足够证据')
  assert.equal(FLOW_EVIDENCE_STATES.insufficient.en, 'Not enough evidence')
})

test('an unknown relationship falls back to 无法判断, not to "no evidence"', () => {
  assert.equal(FLOW_EVIDENCE_FALLBACK, 'unknown')
  for (const value of [undefined, null, '', 'made-up', 42]) {
    assert.equal(flowEvidenceState(value).zh, '无法判断', `a missing relationship (${String(value)}) must not read as "no evidence"`)
    assert.equal(flowEvidenceLabel(value), '无法判断')
  }
  assert.equal(flowEvidenceLabel('runtime-supported'), '有相关运行证据')
  assert.equal(flowEvidenceLabel('runtime-supported', 'en'), 'Observed')
  assert.equal(flowEvidenceLabel('partial', 'en'), 'Partial')
  // `intent-supported` 说的是模型 description 与步骤对得上 —— 那是意图，不是运行事实。
  // 它必须有一档自己的说法，混进 partial 会让用户以为运行动过。
  assert.equal(flowEvidenceLabel('intent-supported'), '仅有模型意图')
  assert.equal(flowEvidenceLabel('intent-supported', 'en'), 'Intent only')
  assert.notEqual(FLOW_EVIDENCE_STATES['intent-supported'].zh, FLOW_EVIDENCE_STATES.partial.zh)
})

test('a step kind is a noun, and an unknown one becomes 其它', () => {
  assert.equal(flowKindLabel('inspect'), '查阅')
  assert.equal(flowKindLabel('execute'), '运行', 'execute is "run", never "已经运行"')
  assert.equal(flowKindLabel('execute', 'en'), 'Run')
  assert.equal(flowKindLabel('made-up'), '其它')
  assert.equal(flowKindLabel(null), '其它')
  assert.equal(flowKindLabel(undefined, 'en'), 'Other')
  for (const entry of Object.values(FLOW_KIND_LABELS)) {
    assert.ok(!entry.zh.endsWith('了'), 'a kind is a category, not an outcome')
  }
})

test('the disclaimer and the empty states are verbatim, not assembled', () => {
  assert.equal(FLOW_DECLARATION_NOTE.zh,
    '流程来自 SKILL.md 的声明；运行证据仅用于标注当前会话中的相关观察，不代表 Agent 内部推理过程。')
  assert.equal(FLOW_EMPTY_TEXT.zh, '当前 Skill 没有可抽取的声明流程。')
  assert.equal(FLOW_TRUNCATED_TEXT.zh, '当前定义正文被截断，声明流程可能不完整。')
  assert.equal(FLOW_UNAVAILABLE_TEXT.zh, '这份 Skill 的定义当前读不到，所以没有声明流程可以显示。')

  // 免责句必须同时说清"流程从哪来"和"证据能证明什么"。少了后半句，这一块就变成了一张
  // 假装知道 Agent 在想什么的图。
  for (const phrase of ['SKILL.md', '不代表', '声明']) {
    assert.ok(FLOW_DECLARATION_NOTE.zh.includes(phrase), `the disclaimer must mention ${phrase}`)
  }
  // 「没有可抽取的声明流程」不能被写成「这个 Skill 没有流程」：我们说的是抽取结果。
  assert.ok(FLOW_EMPTY_TEXT.zh.includes('可抽取'), 'the empty state speaks about extraction, not about the Skill')
})

test('the forbidden words are absent from the client, not merely avoided by the table', () => {
  const clientPath = join(dirname(fileURLToPath(import.meta.url)), '../src/dsh/client/client.js')
  const source = readFileSync(clientPath, 'utf8')
  for (const forbidden of FLOW_EVIDENCE_FORBIDDEN) {
    // 唯一允许它们出现的地方是 `FLOW_EVIDENCE_FORBIDDEN` 自己的解释性注释，
    // 而那段注释在核心模块里，不在客户端。客户端一个都不许有。
    assert.ok(!source.includes(`'${forbidden}'`), `the client must not ship the wording ${forbidden}`)
  }
})
