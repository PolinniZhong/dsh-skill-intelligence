/**
 * The shared step vocabulary.
 *
 * ## Why this module is separate
 *
 * Two very different pieces of text have to land in the same vocabulary:
 *
 * - a **declared step title**, taken from the Skill's Markdown (`runtime-alignment.mjs`);
 * - a **model-authored `description`**, taken from a tool call's arguments (`runtime-evidence.mjs`).
 *
 * Comparing them is only allowed at the level of *kind* — `inspect` against `inspect` — never at
 * the level of text. Keeping one copy of the rules means the two sides cannot drift into two
 * different vocabularies that happen to agree today, which is exactly the failure mode that
 * would let a description be reported as runtime evidence.
 *
 * It lives in its own module because `runtime-evidence.mjs` sits below `runtime-events.mjs`,
 * which sits below `runtime-alignment.mjs`; importing the rules from the top of that chain would
 * close a cycle.
 *
 * @module step-kind
 */

/**
 * The step vocabulary both sides are mapped into.
 *
 * `plan` is a real member with a real, narrow runtime surface (`todo_write`).
 * When that surface is absent the step is `insufficient` — which is the whole
 * point: planning usually cannot be proven from outside.
 */
export const STEP_KINDS = ['inspect', 'edit', 'execute', 'delegate', 'consult', 'produce', 'plan', 'other']

// Keyword rules. Coarse and deterministic on purpose: the input is prose, and this only decides
// which runtime surface *could* correspond. Order matters — the first match wins, so the
// specific verbs are tested before the catch-alls.
//
// `confirm` and `check` are in the inspect rule because "Confirm the working directory" is an
// inspection of state, not an execution of the declared action. Without them the phrase fell to
// `other`, and the intent channel could then never corroborate an `inspect` step at all.
const STEP_KIND_RULES = [
  { kind: 'execute', pattern: /run|execute|build|test|lint|verify|validate|命令|运行|执行|测试|构建|校验|跑/i },
  { kind: 'edit', pattern: /edit|write|implement|fix|modify|refactor|patch|修改|实现|编写|修复|重构|落地|写入/i },
  { kind: 'delegate', pattern: /delegate|subagent|sub-agent|spawn|委派|子代理|并行处理/i },
  { kind: 'consult', pattern: /\bmcp\b|fetch|download|external api|drill into docs|联网|外部|查文档|调用接口/i },
  { kind: 'produce', pattern: /report|summari[sz]e|output|publish|present|deliver|输出|总结|报告|交付|发布|生成结果/i },
  { kind: 'inspect', pattern: /inspect|read|review|search|explore|investigate|look\s|grep|diff|confirm|check|浏览|查看|阅读|搜索|调研|了解|核实|审查|复核|评审|检查|确认/i },
  { kind: 'plan', pattern: /plan|design|decide|prioriti[sz]e|break\s?down|规划|计划|设计|方案|拆解|分析|决策|排期/i },
]

/**
 * Normalize prose before it is classified.
 *
 * The link, URL and emphasis stripping matters because a description is model-authored Markdown
 * and would otherwise be classified on its markup rather than its words.
 *
 * @param value - the raw text.
 * @returns the normalized text, bounded to 160 characters.
 */
export function normalizeTitle(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    // Underscores are deliberately kept: `SPIKE_METHOD_LOADED` is an identifier,
    // not emphasis, and stripping them would silently rewrite the declaration.
    .replace(/[`*>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

/**
 * Map one piece of prose onto the shared step vocabulary.
 *
 * Used for both a declared step title and a model-authored `description`. The result is a
 * *kind*; the caller decides what a kind is allowed to prove. For a description it proves intent
 * only — see `ALIGNMENT_RELATIONSHIPS`.
 *
 * @param title - the declared step text or the model's description.
 * @returns a step kind, or `other` when no rule applies.
 */
export function classifyStepKind(title) {
  const text = normalizeTitle(title)
  if (!text) return 'other'
  for (const rule of STEP_KIND_RULES) {
    if (rule.pattern.test(text)) return rule.kind
  }
  return 'other'
}
