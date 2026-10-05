import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  RUN_CONDITION_EVENT_TYPES,
  RUN_UNAVAILABLE,
  readLoadEvidence,
  readRunConditions,
  readRunCursor,
  summarizeToolActivity,
} from '../src/core/run-conditions.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/** 一条真实的 `request/header` 事件：带着整份工具清单、`adapterDefaults` 与 `maxTokens`。 */
function headerEvent({ seq = 12, time = 1791016884397, provider = 'deepseek-official', model = 'deepseek-flash', reasoningEffort = 'high' } = {}) {
  return {
    type: 'request/header',
    seq,
    time,
    data: {
      header: {
        config: { provider, model, reasoningEffort, maxTokens: 256000 },
        adapterDefaults: { maxTokens: true },
      },
      tools: [{ name: 'bash', description: 'run a command', parameters: { type: 'object' } }],
    },
  }
}

/** 一条真实的 `request/context` 事件：四个字段直接摆在 `data` 上。 */
function contextEvent({ seq = 13, time = 1791016884398, provider = 'deepseek-official', model = 'deepseek-flash', contextWindow = 1000000 } = {}) {
  return { type: 'request/context', seq, time, data: { provider, model, contextWindow, systemPromptUpdate: 'in-history' } }
}

function toolCall({ seq, name = 'bash', turn = 1, step = 1, args = '{"command":"ls"}' } = {}) {
  return { type: 'tool/call', seq, time: 1791016886408, data: { turn, step, callId: `call_${seq}`, name, arguments: args } }
}

test('条件只取那四个只读元数据字段，工具清单与 maxTokens 一个都不带出来', () => {
  const conditions = readRunConditions([headerEvent(), contextEvent()])
  assert.deepEqual(Object.keys(conditions).sort(), ['capturedAt', 'conditionSeq', 'contextWindow', 'model', 'provider', 'reasoningEffort'])
  assert.equal(conditions.provider, 'deepseek-official')
  assert.equal(conditions.model, 'deepseek-flash')
  assert.equal(conditions.reasoningEffort, 'high')
  assert.equal(conditions.contextWindow, 1000000)
  assert.equal(conditions.conditionSeq, 13)
  const text = JSON.stringify(conditions)
  for (const leaked of ['tools', 'bash', 'adapterDefaults', 'maxTokens', 'systemPromptUpdate', 'in-history']) {
    assert.equal(text.includes(leaked), false, `不许带出「${leaked}」`)
  }
})

test('会话中途换了模型：取的是运行到此刻那一条，不是第一条', () => {
  const events = [
    headerEvent({ seq: 12, model: 'deepseek-flash', reasoningEffort: 'high' }),
    contextEvent({ seq: 13, model: 'deepseek-flash' }),
    headerEvent({ seq: 40, model: 'deepseek-reasoner', reasoningEffort: 'medium' }),
    contextEvent({ seq: 41, model: 'deepseek-reasoner', contextWindow: 64000 }),
  ]
  const conditions = readRunConditions(events)
  assert.equal(conditions.model, 'deepseek-reasoner')
  assert.equal(conditions.reasoningEffort, 'medium')
  assert.equal(conditions.contextWindow, 64000)
  assert.equal(conditions.conditionSeq, 41)
  // 只看 seq 13 之前：回到第一组条件。游标是日志顺序，不是时间。
  const earlier = readRunConditions(events, { untilSeq: 13 })
  assert.equal(earlier.model, 'deepseek-flash')
  assert.equal(earlier.reasoningEffort, 'high')
})

test('读不到就是 unavailable，不猜一个默认模型', () => {
  assert.deepEqual(readRunConditions([]), {
    provider: RUN_UNAVAILABLE,
    model: RUN_UNAVAILABLE,
    reasoningEffort: RUN_UNAVAILABLE,
    contextWindow: RUN_UNAVAILABLE,
    conditionSeq: null,
    capturedAt: null,
  })
  // 半截事件（有 provider 没有 model）只填它能填的那一半。
  const partial = readRunConditions([{ type: 'request/context', seq: 3, data: { provider: 'p' } }])
  assert.equal(partial.provider, 'p')
  assert.equal(partial.model, RUN_UNAVAILABLE)
  assert.equal(partial.contextWindow, RUN_UNAVAILABLE)
  // 不在条件事件表里的类型一律不看。
  assert.equal(readRunConditions([{ type: 'assistant/message', seq: 9, data: { model: 'x' } }]).model, RUN_UNAVAILABLE)
  assert.deepEqual(RUN_CONDITION_EVENT_TYPES, ['request/header', 'request/context'])
})

test('游标是 seq/turn/step：它是排序用的，不是时间', () => {
  const cursor = readRunCursor([
    { type: 'session', seq: 0, time: 1791016884005, data: { version: 4 } },
    toolCall({ seq: 17, turn: 1, step: 1 }),
    { type: 'step/end', seq: 18, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', seq: 19, data: { turn: 1, step: 2 } },
  ])
  assert.equal(cursor.seq, 19)
  assert.equal(cursor.turn, 1)
  assert.equal(cursor.step, 2)
  assert.equal(cursor.startedAt, 1791016884005, '起点取第一个带 time 的事件')
  assert.deepEqual(readRunCursor([]), { seq: null, turn: null, step: null, startedAt: null })
})

test('工具活动只数名字与次数，参数与 callId 不进结果', () => {
  const summary = summarizeToolActivity([
    toolCall({ seq: 17, name: 'bash', args: '{"command":"cat /etc/passwd"}' }),
    toolCall({ seq: 21, name: 'read', args: '{"path":"/Users/someone/secret.md"}' }),
    toolCall({ seq: 25, name: 'bash' }),
  ])
  assert.deepEqual(summary.activities, [{ name: 'bash', count: 2 }, { name: 'read', count: 1 }])
  assert.equal(summary.total, 3)
  const text = JSON.stringify(summary)
  for (const leaked of ['/etc/passwd', 'secret.md', 'arguments', 'callId', 'call_']) {
    assert.equal(text.includes(leaked), false, `不许带出「${leaked}」`)
  }
  // 没有任何工具活动时是 0 与空表 —— 不是 `unavailable`：数得出来就是数得出来。
  assert.deepEqual(summarizeToolActivity([{ type: 'user/message', seq: 2, data: { text: 'hi' } }]), { activities: [], total: 0 })
})

test('加载证据分三态：loaded 有 seq、offered-only 更弱、拿不到就说 unavailable', () => {
  const loaded = readLoadEvidence({
    traceEvents: [
      { skillName: 'ui-craft', status: 'published', callSeq: 4 },
      { skillName: 'ui-craft', status: 'loaded', callSeq: 6, resultSeq: 8, evidenceFingerprint: { value: 'f'.repeat(64) } },
      { skillName: 'other-skill', status: 'loaded', callSeq: 30, resultSeq: 31 },
    ],
  }, 'ui-craft')
  assert.deepEqual(loaded, { status: 'loaded', seq: 8, callSeq: 6, resultSeq: 8 })
  assert.deepEqual(readLoadEvidence({ traceEvents: [{ skillName: 'ui-craft', status: 'published', callSeq: 4 }] }, 'ui-craft'), {
    status: 'offered-only', seq: null, callSeq: null, resultSeq: null,
  })
  assert.deepEqual(readLoadEvidence({ traceEvents: [] }, 'ui-craft'), {
    status: RUN_UNAVAILABLE, seq: null, callSeq: null, resultSeq: null,
  })
  // 没有 trace 不等于「确定没加载」：这里绝不许返回一个表示否定的状态。
  assert.equal(readLoadEvidence(null, 'ui-craft').status, RUN_UNAVAILABLE)
})

test('这一层没有时钟、没有随机数（否则运行记录就不再可复算）', async () => {
  const source = await readFile(join(here, '..', 'src', 'core', 'run-conditions.mjs'), 'utf8')
  for (const forbidden of ['Date.now', 'Math.random', 'new Date(']) {
    assert.equal(source.includes(forbidden), false, `run-conditions.mjs 里不许出现 ${forbidden}`)
  }
})
