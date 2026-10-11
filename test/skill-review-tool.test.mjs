import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../src/dsh/host/index.js'
import {
  SKILL_REVIEW_FAILURE_REASONS,
  SKILL_REVIEW_GUIDANCE,
  SKILL_REVIEW_PACKET_SCHEMA,
  SKILL_REVIEW_PARAMETERS_SCHEMA,
  SKILL_REVIEW_RENDER_LIMIT,
  SKILL_REVIEW_SECTION,
  SKILL_REVIEW_TOOL_NAME,
  buildSkillReviewPacket,
} from '../src/core/skill-review.mjs'

/**
 * V1.3 §8 / §9：`skill_review` 的**注册缝**。
 *
 * 工具能不能被模型看见，`npm test` 里测不出来（那要真机）；但「宿主到底注册了什么」能测 ——
 * 用一个替身的 `tools` 服务接住注册调用，就能把下面这几件事逐一钉住：
 *
 * 1. 注册恰好一次，名字、指引、参数 schema 与出参 schema 都是核心层那一份（不是抄一份）；
 * 2. `render` 交出内核要的 `ContentBlock[]`，长度在预算内（超了会被内核静默裁剪并写回会话）；
 * 3. `execute` 在**任何**输入下都返回信封，不抛异常 —— 模型拿到的是能读的答案，不是工具报错；
 * 4. `presentCall` 是只读卡（`kind: 'read'`），不假装自己写了什么。
 */

const SESSION_ID = 'session-skill-review-tool'

/**
 * 替身 agent：真机里指引节是 `agent.ctx.inject(['systemPrompt','tools'], …)` 装上去的，
 * 所以替身也必须把这两个服务放进注入作用域，并且让 `ctx.tools.get` 的答案可以事后翻面 ——
 * 「节随工具可见性同生共死」正是靠翻这一下面来证的。
 */
function createFakeAgent() {
  const sections = []
  const state = { visible: true, disposed: 0 }
  const toolsStub = {
    get: (name) => (state.visible && name === SKILL_REVIEW_TOOL_NAME ? { name } : undefined),
  }
  return {
    sections,
    state,
    ctx: {
      tools: toolsStub,
      inject(names, callback) {
        callback({
          systemPrompt: {
            section(spec) {
              sections.push(spec)
              return () => {}
            },
            getSectionOrder: (name) => (name === 'TOOL_SESSION_QUERY' ? 2300 : 0),
          },
          tools: toolsStub,
        })
        return {
          dispose: () => {
            state.disposed += 1
            return Promise.resolve()
          },
        }
      },
    },
  }
}

function createHost({ dataRoot, withSession = true, skills = undefined, agents = undefined }) {
  const routes = []
  const tools = []
  const agent = agents === undefined ? createFakeAgent() : null
  const agentList = agents ?? [agent]
  const agentHandlers = new Map()
  const webCtx = {
    on(event, handler) {
      agentHandlers.set(event, handler)
      return () => {}
    },
    get(key) {
      // `registryContext` 先要 `agentPresets`、再要 `skills`。给一个 `get` 返回 `undefined` 的
      // 注册表 stub，就能在 `npm test` 里走通「Skill 不在册」这条真机路径（真机上是 registry miss）。
      return key === 'skills' ? skills : undefined
    },
    effect(setup) {
      setup()
      return () => {}
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    sessions: {
      get: (sessionId) => (withSession && sessionId === SESSION_ID ? { id: sessionId, header: { cwd: dataRoot } } : null),
    },
    agents: { get: () => null, list: () => agentList },
  }
  const pluginCtx = {
    on() {
      return () => {}
    },
    inject(names, callback) {
      // 真机里 `['tools']` 是**单独一条** inject：并进上面那条会让 13 条路由的可用性
      // 绑死在 tools 服务上。这里按名字分流，就是为了让这条结构在测试里也成立。
      if (Array.isArray(names) && names.includes('tools')) {
        callback({
          tools: {
            register(definition) {
              tools.push(definition)
              return () => {}
            },
          },
        })
        return () => {}
      }
      callback(webCtx)
      return () => {}
    },
  }
  apply(pluginCtx, { dataRoot })
  return { routes, tools, agent, agentList, agentHandlers }
}

async function setup(options = {}) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'st-skill-review-'))
  const { routes, tools, agent, agentHandlers } = createHost({ dataRoot, ...options })
  assert.equal(tools.length, 1, '宿主必须注册且只注册一次 skill_review')
  return { tool: tools[0], routes, dataRoot, agent, agentHandlers }
}

test('skill-review-tool · 注册的是核心层那一份定义，不是抄一份', async () => {
  const { tool } = await setup()
  assert.equal(tool.name, SKILL_REVIEW_TOOL_NAME)
  assert.equal(tool.name, 'skill_review')
  assert.equal(tool.description, SKILL_REVIEW_GUIDANCE)
  assert.equal(tool.parameters, SKILL_REVIEW_PARAMETERS_SCHEMA)
  assert.equal(tool.output.schema, SKILL_REVIEW_PACKET_SCHEMA)
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(typeof tool.execute, 'function')
  assert.deepEqual(tool.parameters.required, ['skillName'])
  assert.equal(tool.parameters.properties.skillName.type, 'string')
  assert.equal(tool.parameters.properties.profiles.type, 'array')
})

test('skill-review-tool · 注册工具不会顺手多挂一条路由', async () => {
  const { routes } = await setup()
  // 宿主只注册**一条** catch-all，13 条路由是它内部按 `url.pathname` 分的支（守卫按字面钉住）。
  // 这里要的是：注册 `skill_review` 不许再挂一条自己的路由 —— 它直接读核心层。
  assert.equal(routes.length, 1, `宿主的路由注册数不许变，现在是 ${routes.length}`)
  assert.equal(typeof routes[0].handler, 'function')
})

test('skill-review-tool · render 交出内核要的 ContentBlock[]，长度在预算内', async () => {
  const { tool } = await setup()
  const value = buildSkillReviewPacket({ skillName: 'ui-craft' })
  const blocks = tool.output.render({ skillName: 'ui-craft' }, value)
  assert.equal(Array.isArray(blocks), true)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  assert.equal(typeof blocks[0].text, 'string')
  assert.equal(Array.from(blocks[0].text).length <= SKILL_REVIEW_RENDER_LIMIT, true)
})

test('skill-review-tool · presentCall 是只读卡，坏参数也不炸', async () => {
  const { tool } = await setup()
  assert.deepEqual(tool.presentCall({ skillName: 'ui-craft' }), {
    card: 'generic',
    title: 'Review skill ui-craft',
    kind: 'read',
    rawInput: 'ui-craft',
  })
  assert.equal(tool.presentCall({}).kind, 'read')
  assert.equal(tool.presentCall({ skillName: 42 }).rawInput, '')
  assert.equal(tool.presentCall(undefined).title, 'Review skill')
})

test('skill-review-tool · 没有会话 / 名字不合法 / profiles 不合法都回信封', async () => {
  const { tool } = await setup()
  const noAgent = await tool.execute({ skillName: 'ui-craft' }, {})
  assert.equal(noAgent.ok, false)
  assert.equal(noAgent.reason, 'no-agent')
  assert.equal(noAgent.review, null)
  assert.equal(noAgent.skillName, 'ui-craft')

  const exec = { agent: { session: { id: SESSION_ID } } }
  const cases = [
    [{}, 'invalid-skill-name'],
    [{ skillName: '' }, 'invalid-skill-name'],
    [{ skillName: 'UI Craft' }, 'invalid-skill-name'],
    [{ skillName: 'UI_Craft' }, 'invalid-skill-name'],
    [{ skillName: `${'a'.repeat(80)}` }, 'invalid-skill-name'],
    [{ skillName: 'ui-craft', profiles: 'openai' }, 'invalid-profiles'],
    [{ skillName: 'ui-craft', profiles: [1, 2] }, 'invalid-profiles'],
    [{ skillName: 'ui-craft', profiles: [{ id: 'openai' }] }, 'invalid-profiles'],
  ]
  for (const [args, reason] of cases) {
    const packet = await tool.execute(args, exec)
    assert.equal(packet.ok, false, `${JSON.stringify(args)} 必须回失败信封`)
    assert.equal(packet.reason, reason, `${JSON.stringify(args)} 的原因应该是 ${reason}`)
    assert.equal(packet.review, null)
    assert.equal(Number.isInteger(packet.schemaVersion), true)
  }
})

test('skill-review-tool · 读不到现状时给稳定失败原因，不抛异常', async () => {
  const { tool } = await setup()
  const exec = { agent: { session: { id: SESSION_ID } } }
  const packet = await tool.execute({ skillName: 'ui-craft' }, exec)
  assert.equal(packet.ok, false)
  assert.equal(SKILL_REVIEW_FAILURE_REASONS.includes(packet.reason), true, `原因不在封闭清单里：${packet.reason}`)
  assert.equal(packet.review, null)
  // 这份信封本身要能过出参 schema（内核会在出参处再校验一次）。
  assert.equal(typeof packet.schemaVersion, 'number')
})

test('skill-review-tool · 不在册的 Skill 说 unknown-skill，不说 skill-file-unreadable', async () => {
  // v1.3 真机修正（`definitely-not-a-skill`）：不在册与「读不出来」在事实层面是两件事，而这两者
  // 都没有正文可读 —— 验收器只会回 `skill-file-unreadable`，所以信封必须先认 `definition.reason`。
  const { tool } = await setup({
    skills: {
      async get() {
        return undefined
      },
    },
  })
  const exec = { agent: { session: { id: SESSION_ID } } }
  const miss = await tool.execute({ skillName: 'definitely-not-a-skill' }, exec)
  assert.equal(miss.ok, false)
  assert.equal(miss.reason, 'unknown-skill', `不在册的 Skill 必须说 unknown-skill，实际是 ${miss.reason}`)
  assert.equal(miss.review, null)
  assert.equal(SKILL_REVIEW_FAILURE_REASONS.includes(miss.reason), true)
})

test('skill-review-tool · 注册表整个没挂上时说 registry-unavailable', async () => {
  // 同一处优先级的另一面：没有注册表时 `definition.reason` 是 `registry-unavailable`，
  // 不许被验收器的 `skill-file-unreadable` 顶掉（旧口径下这里回的就是后者）。
  const { tool } = await setup()
  const exec = { agent: { session: { id: SESSION_ID } } }
  const packet = await tool.execute({ skillName: 'ui-craft' }, exec)
  assert.equal(packet.ok, false)
  assert.equal(packet.reason, 'registry-unavailable', `没有注册表时必须说 registry-unavailable，实际是 ${packet.reason}`)
  assert.equal(SKILL_REVIEW_FAILURE_REASONS.includes(packet.reason), true)
})

test('skill-review-tool · 任何输入都不抛异常（工具边界不许把错误抛给模型）', async () => {
  const { tool } = await setup()
  const inputs = [
    [undefined, undefined],
    [null, null],
    [{}, {}],
    [{ skillName: null }, { agent: {} }],
    [{ skillName: 'ui-craft', profiles: null }, { agent: { session: {} } }],
    [{ skillName: 'ui-craft', extraKey: true }, { agent: { session: { id: SESSION_ID } } }],
    [{ skillName: 'ui-craft', profiles: [] }, { agent: { session: { id: 'no-such-session' } } }],
  ]
  for (const [args, exec] of inputs) {
    await assert.doesNotReject(async () => {
      const packet = await tool.execute(args, exec)
      assert.equal(typeof packet, 'object')
      assert.equal(typeof packet.ok, 'boolean')
    })
  }
})

test('skill-review-tool · 第二引导通道：指引节装在每个 agent 上', async () => {
  // 真机上「建完 / 改完 Skill 的新会话」三次都没有主动提议审查 —— tool description 是低注意力
  // 频道。任务书 §8 的备选通道是 `systemPrompt.section`：常驻一条极短的提醒。
  const { agent } = await setup()
  assert.equal(agent.sections.length, 1, `每个 agent 恰好装一节，实际 ${agent.sections.length}`)
  const [section] = agent.sections
  assert.equal(section.name, 'context:skill-review')
  assert.equal(section.order, 2301, '插在工具类指引的槽位里（TOOL_SESSION_QUERY 之后）')
  assert.equal(typeof section.text, 'function', '正文必须是函数，才能在每次组装时重新判可见性')
  assert.equal(section.text({}), SKILL_REVIEW_SECTION)
})

test('skill-review-tool · 指引节与工具可见性同生共死（场景 C 的可证伪面）', async () => {
  const { agent } = await setup()
  const [section] = agent.sections
  assert.equal(section.text({}), SKILL_REVIEW_SECTION)
  // 工具被 `ctx.tools.restrict()` / 子 agent 的 `toolFilter` 挡掉：节还在注册表里，
  // 但渲染出来的必须是空串 —— 不然就成了「工具看不到、却还在被提醒用这个工具」。
  agent.state.visible = false
  assert.equal(section.text({}), '')
  agent.state.visible = true
  assert.equal(section.text({}), SKILL_REVIEW_SECTION)
})

test('skill-review-tool · 安装幂等：同一个 agent 不会被装两次', async () => {
  // 内核对同名 `systemPrompt.section` 的重复注册会抛错，所以安装必须按 agent 去重。
  const { agent, agentHandlers } = await setup()
  const created = agentHandlers.get('agent/created')
  assert.equal(typeof created, 'function')
  created({ agent })
  created({ agent })
  assert.equal(agent.sections.length, 1, '重复的 agent/created 不许装出第二份')
  // 坏载荷只该被忽略，不该炸掉事件分发。
  assert.doesNotThrow(() => created({}))
  assert.doesNotThrow(() => created({ agent: null }))
  assert.equal(agent.sections.length, 1)
})

test('skill-review-tool · 新会话的 agent 也会装上指引节，退场时卸载', async () => {
  const { agent, agentHandlers } = await setup()
  const second = createFakeAgent()
  agentHandlers.get('agent/created')({ agent: second })
  assert.equal(second.sections.length, 1, 'agent/created 之后新建的 agent 也要有这一节')
  agentHandlers.get('agent/disposed')({ agent: second })
  assert.equal(second.state.disposed, 1, 'agent 退场必须把节卸载掉')
  assert.equal(agent.state.disposed, 0, '不许顺手把别的 agent 的节也卸了')
  // 没有装过节（或已经卸过）的 agent 不该让分发出错。
  assert.doesNotThrow(() => agentHandlers.get('agent/disposed')({ agent: second }))
  assert.equal(second.state.disposed, 1)
})

test('skill-review-tool · 指引节短、仍然先问用户、不含因果词', async () => {
  const { agent } = await setup()
  const [section] = agent.sections
  const text = section.text({})
  assert.equal(Array.from(text).length <= 600, true, `一节常驻提醒不该吃预算，现在 ${Array.from(text).length} 码点`)
  assert.equal(text.includes('offer the user'), true)
  assert.equal(text.includes('wait for their confirmation'), true)
  assert.equal(text.includes('read-only'), true)
  assert.equal(text.includes('never loads, runs'), true)
  assert.equal(text.includes('not the `skill` tool'), true)
  for (const word of ['导致', 'proves', 'causes']) {
    assert.equal(text.includes(word), false, `指引节不许出现因果词 ${word}`)
  }
})

