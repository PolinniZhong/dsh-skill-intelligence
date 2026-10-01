/**
 * 声明流程的状态词表 —— 「这一步有没有留下相关运行证据」这句话的**唯一**说法。
 *
 * ## 为什么单独一层
 *
 * 这个界面最容易犯的错，是把「没看到证据」写成「没执行」。两者差得很远：一个 Skill 的步骤
 * 完全可以由模型在推理里完成，只是没有留下任何可对齐的工具调用。`runtime-alignment.mjs`
 * 已经用五个关系把这件事分得很清楚（`runtime-supported` / `intent-supported` / `partial` /
 * `insufficient` / `unknown`），但那是模型层的词汇，直接摆到界面上没人看得懂；而如果界面
 * 自己另造一套词，两套词就会各自漂移 —— 今天是对的，明天有人把 `insufficient` 改成「未执行」
 * 也不会有人发现。
 *
 * 所以映射写在这里：纯数据、纯函数、无 React、无 I/O，可以直接测。词表里的每一句都只
 * 陈述「观察到了什么」，**没有一句陈述「Agent 做了什么」**。
 *
 * @module flow-evidence
 */

/**
 * 五个关系各自的说法。
 *
 * `tone` 只影响配色，不影响措辞 —— 颜色可以被忽略，句子不行，所以不能说的事情不能靠颜色
 * 找补。`intent-supported` 单列一档而不是并进 `partial`：它说的是「模型自己写的 description
 * 与这一步对得上」，那是模型的意图陈述，不是运行事实，混进「部分证据」会让用户以为运行动过。
 */
export const FLOW_EVIDENCE_STATES = Object.freeze({
  'runtime-supported': { tone: 'observed', zh: '有相关运行证据', en: 'Observed' },
  partial: { tone: 'partial', zh: '部分相关证据', en: 'Partial' },
  'intent-supported': { tone: 'intent', zh: '仅有模型意图', en: 'Intent only' },
  insufficient: { tone: 'none', zh: '暂无足够证据', en: 'Not enough evidence' },
  unknown: { tone: 'unknown', zh: '无法判断', en: 'Unknown' },
})

/** 关系缺失时的兜底：说「无法判断」，绝不说「没有」。 */
export const FLOW_EVIDENCE_FALLBACK = 'unknown'

/**
 * 这些词一个都不许出现在状态文案里。
 *
 * 它们全都是**结论**，而这一层只有观察。`未执行` 尤其危险：它是从「没有证据」推出的
 * 「没做过」，而证据缺失从来推不出没做过。把它列成常量，守卫就能在源码里搜它。
 */
export const FLOW_EVIDENCE_FORBIDDEN = Object.freeze([
  '已执行', '未执行', '已完成', '未完成', '执行成功', '执行失败', '已运行', '未运行',
])

/**
 * 标题下面那句说明。用户要求它必须逐字出现，所以它是一个常量而不是模板拼接 ——
 * 一句话拆成几段拼起来，改掉其中一段不会有人发现。
 */
export const FLOW_DECLARATION_NOTE = Object.freeze({
  zh: '流程来自 SKILL.md 的声明；运行证据仅用于标注当前会话中的相关观察，不代表 Agent 内部推理过程。',
  en: 'The flow comes from the declarations in SKILL.md. Runtime evidence only marks related observations from this session; it does not represent the Agent\u2019s internal reasoning.',
})

/** 空态与截断提示。同样逐字给，不拼接。 */
export const FLOW_EMPTY_TEXT = Object.freeze({
  zh: '当前 Skill 没有可抽取的声明流程。',
  en: 'This Skill declares no extractable flow.',
})

export const FLOW_TRUNCATED_TEXT = Object.freeze({
  zh: '当前定义正文被截断，声明流程可能不完整。',
  en: 'The definition body was truncated, so this flow may be incomplete.',
})

export const FLOW_UNAVAILABLE_TEXT = Object.freeze({
  zh: '这份 Skill 的定义当前读不到，所以没有声明流程可以显示。',
  en: 'The definition cannot be read right now, so there is no declared flow to show.',
})

/**
 * 步骤类型（`step.kind`）的说法。
 *
 * 它们是**名词**，说的是这一步声明成哪一类动作，不是它做成了什么。`execute` 译成「运行」而不是
 * 「已运行」—— 这一列永远在回答「哪一类」，状态那一列才回答「有没有证据」。
 */
export const FLOW_KIND_LABELS = Object.freeze({
  inspect: { zh: '查阅', en: 'Inspect' },
  edit: { zh: '修改', en: 'Edit' },
  execute: { zh: '运行', en: 'Run' },
  delegate: { zh: '委派', en: 'Delegate' },
  consult: { zh: '外部查询', en: 'Consult' },
  produce: { zh: '产出', en: 'Produce' },
  plan: { zh: '规划', en: 'Plan' },
  other: { zh: '其它', en: 'Other' },
})

/** 一个关系的说法。未知关系兜底成 `unknown`，绝不兜底成「没有证据」。 */
export function flowEvidenceState(relationship) {
  return FLOW_EVIDENCE_STATES[relationship] ?? FLOW_EVIDENCE_STATES[FLOW_EVIDENCE_FALLBACK]
}

/** 一个关系的显示文案。`language` 只认 `'en'`，其余一律中文（与客户端其它文案一致）。 */
export function flowEvidenceLabel(relationship, language = 'zh') {
  const state = flowEvidenceState(relationship)
  return language === 'en' ? state.en : state.zh
}

/** 一个步骤类型的显示文案。空的或没见过的 kind 归到 `other`。 */
export function flowKindLabel(kind, language = 'zh') {
  const entry = FLOW_KIND_LABELS[kind] ?? FLOW_KIND_LABELS.other
  return language === 'en' ? entry.en : entry.zh
}
