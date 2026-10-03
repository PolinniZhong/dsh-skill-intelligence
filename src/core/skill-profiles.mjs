/**
 * Skill 验收的规范来源与规则表。
 *
 * 这里只放**事实**，不放判断：
 *
 * - 每条规则都能追到一份公开来源（`source`），中文标题是那条来源的原话翻译，
 *   不是本插件对「好 Skill」的看法。
 * - 规则按 Profile 分开。**Common Core 只收四家都写了的条款**；只有某一家写的字段
 *   （Microsoft 的目录同名、OpenAI 的「frontmatter 只准两个字段」）留在那家自己的
 *   Profile 里。把平台差异抹平成一套标准，会让一个对 DSH 完全合法的 Skill 因为别家
 *   的建议被判成失败（规划 §十六、§三十五）。
 * - 严重度只用 error / warning / info。只有当来源用的是「必须 / Must / 会阻止装载」
 *   时才是 error；来源写 "Keep … under 500 lines" 这类祈使建议的一律 warning。
 *   没有「质量分」「风险分」这种档位，也不会有 —— 见规划 §十八、§三十三。
 *
 * 来源：
 * - agentskills.io specification（开放规范，Microsoft 文档显式引用的就是它）
 * - https://learn.microsoft.com/en-us/agent-framework/agents/skills
 * - https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md
 * - https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
 * - DSH 自身：`@deepseek-ai/dsh-skill` 与 `@deepseek-ai/dsh-skill-filesystem` 的装载源码
 */

export const SKILL_PROFILE_SCHEMA_VERSION = 1

/**
 * 五个 Profile。`common` 是基础层，其它四个各自独立。
 *
 * 顺序就是界面上的显示顺序：先共同规范，再当前平台，再其它平台。
 */
export const SKILL_PROFILE_IDS = Object.freeze(['common', 'dsh', 'microsoft', 'openai', 'anthropic'])

export const SKILL_PROFILE_LABELS = Object.freeze({
  common: Object.freeze({ zh: 'Common Core', en: 'Common Core' }),
  dsh: Object.freeze({ zh: 'DSH', en: 'DSH' }),
  microsoft: Object.freeze({ zh: 'Microsoft', en: 'Microsoft' }),
  openai: Object.freeze({ zh: 'OpenAI', en: 'OpenAI' }),
  anthropic: Object.freeze({ zh: 'Anthropic', en: 'Anthropic' }),
})

/**
 * 默认验收目标：DSH + Common。
 *
 * 默认不是「全部平台」—— 一个只给 DSH 用的 Skill 不该因为某个平台的额外建议被报错。
 */
export const SKILL_PROFILE_DEFAULT = Object.freeze(['common', 'dsh'])

/** 规则的严重度。三档，没有第四档。 */
export const SKILL_RULE_SEVERITIES = Object.freeze(['error', 'warning', 'info'])

export const SKILL_SEVERITY_LABELS = Object.freeze({
  error: Object.freeze({ zh: '错误', en: 'Error' }),
  warning: Object.freeze({ zh: '警告', en: 'Warning' }),
  info: Object.freeze({ zh: '信息', en: 'Info' }),
})

// --- 规范里的数字，全部有出处 ------------------------------------------------------

/** 开放规范：name 最长 64 字符；OpenAI 亦写 "under 64 characters"。 */
export const SKILL_NAME_MAX = 64
/** 开放规范：description 最长 1024 字符。 */
export const SKILL_DESCRIPTION_MAX = 1024
/** 开放规范：「Must be 1-500 characters if provided」。 */
export const SKILL_COMPATIBILITY_MAX = 500
/** 开放规范 / OpenAI / Anthropic / Microsoft 一致建议正文控制在 500 行以内。 */
export const SKILL_BODY_LINE_HINT = 500
/** 开放规范：「Keep file references one level deep from SKILL.md」。 */
export const SKILL_REFERENCE_DEPTH_MAX = 1
/** OpenAI 点名的、不该出现在 Skill 里的多余文档。 */
export const SKILL_EXTRANEOUS_FILES = Object.freeze([
  'README.md',
  'INSTALLATION_GUIDE.md',
  'QUICK_REFERENCE.md',
  'CHANGELOG.md',
])

/** 约定俗成的三个资源目录。四家一致，且都是 optional。 */
export const SKILL_RESOURCE_DIRECTORIES = Object.freeze(['scripts', 'references', 'assets'])

/** DSH 自己的 name 语法（`dsh-skill` 的 SKILL_NAME 常量）。 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 开放规范的 name 字符集：小写字母、数字、连字符。 */
export const SKILL_NAME_CHARSET_PATTERN = /^[a-z0-9-]+$/

/**
 * DSH 认识的顶层字段与它接受的布尔写法。
 *
 * 这两条是从 `dsh-skill-filesystem` 的 `parseInvocationPolicy` / `frontmatterBoolean`
 * 抄下来的**装载行为**：写错了不是「不太好」，而是整个 Skill 被丢掉。
 */
export const DSH_INVOCATION_FIELDS = Object.freeze(['disable-model-invocation', 'user-invocable'])
export const DSH_LEGACY_INVOCATION_FIELDS = Object.freeze({
  disableModelInvocation: 'disable-model-invocation',
  modelInvocable: 'disable-model-invocation',
  userInvocable: 'user-invocable',
})
export const DSH_BOOLEAN_TRUE = Object.freeze(['true', 'yes', 'on', '1'])
export const DSH_BOOLEAN_FALSE = Object.freeze(['false', 'no', 'off', '0'])

/**
 * 规则表。
 *
 * `fact` 是「这条规则在断言哪个事实」。同一个 fact 只允许出现在一条规则里 ——
 * 两个 Profile 都关心同一件事时，用 Profile 的 `ruleIds` 指过去，而不是复制一条规则
 * 出来制造两条一模一样的警告。
 *
 * `skipWhen` 不在表里：能不能判定是运行期的输入决定的（比如没有目录就没有目录名），
 * 那属于 `skill-validation.mjs` 的事，规则表只描述事实本身。
 */
export const SKILL_RULES = Object.freeze(
  [
    // --- Common Core ---------------------------------------------------------
    {
      id: 'CORE-FM-001',
      profile: 'common',
      severity: 'error',
      title: 'SKILL.md 存在',
      fact: 'skill-file',
      source: 'agentskills',
      note: '规范：Skill 根目录包含 SKILL.md。',
    },
    {
      id: 'CORE-FM-002',
      profile: 'common',
      severity: 'error',
      title: 'YAML frontmatter 存在',
      fact: 'frontmatter-present',
      source: 'agentskills',
      note: '规范：「must contain YAML frontmatter followed by Markdown content」。',
    },
    {
      id: 'CORE-FM-003',
      profile: 'common',
      severity: 'error',
      title: 'frontmatter 可解析',
      fact: 'frontmatter-parseable',
      source: 'agentskills',
      note: '闭合标记存在，且块内每一行都是注释、空行或 `key: value`。',
    },
    {
      id: 'CORE-FM-004',
      profile: 'common',
      severity: 'error',
      title: 'name 字段存在且非空',
      fact: 'name-present',
      source: 'agentskills',
      note: 'name 是 Required 字段。',
    },
    {
      id: 'CORE-FM-005',
      profile: 'common',
      severity: 'error',
      title: 'description 字段存在且非空',
      fact: 'description-present',
      source: 'agentskills',
      note: 'description 是 Required 字段，且必须非空。',
    },
    {
      id: 'CORE-FM-006',
      profile: 'common',
      severity: 'error',
      title: 'Markdown 正文存在',
      fact: 'body-present',
      source: 'agentskills',
      note: '规范要求 frontmatter 之后有 Markdown 内容。',
    },
    {
      id: 'CORE-NAME-001',
      profile: 'common',
      severity: 'error',
      title: 'name 长度为 1–64 字符',
      fact: 'name-length',
      source: 'agentskills',
      note: '规范：Max 64 characters；OpenAI：under 64 characters。',
    },
    {
      id: 'CORE-NAME-002',
      profile: 'common',
      severity: 'error',
      title: 'name 只含小写字母、数字与连字符',
      fact: 'name-charset',
      source: 'agentskills',
      note: '反例 `PDF-Processing`：uppercase not allowed。',
    },
    {
      id: 'CORE-NAME-003',
      profile: 'common',
      severity: 'error',
      title: 'name 不以连字符开头或结尾、不含连续连字符',
      fact: 'name-hyphen-position',
      source: 'agentskills',
      note: '反例 `-pdf`、`pdf--processing`。',
    },
    {
      id: 'CORE-DESC-001',
      profile: 'common',
      severity: 'error',
      title: 'description 不超过 1024 字符',
      fact: 'description-length',
      source: 'agentskills',
      note: '规范：Must be 1-1024 characters。',
    },
    {
      id: 'CORE-DESC-002',
      profile: 'common',
      severity: 'warning',
      title: 'description 未写明适用场景',
      fact: 'description-trigger-hint',
      source: 'agentskills',
      note: '四家都写 Should describe both what the skill does and when to use it —— Should 只能是警告。',
    },
    {
      id: 'CORE-COMPAT-001',
      profile: 'common',
      severity: 'error',
      title: 'compatibility 不超过 500 字符',
      fact: 'compatibility-length',
      source: 'agentskills',
      note: '规范：Must be 1-500 characters if provided。',
    },
    {
      id: 'CORE-BODY-001',
      profile: 'common',
      severity: 'warning',
      title: '正文超过 500 行建议长度',
      fact: 'body-line-hint',
      source: 'agentskills',
      note: '四家都写 "Keep SKILL.md under 500 lines"，但没有任何一家的装载阻断清单包含行数。',
    },
    {
      id: 'CORE-FENCE-001',
      profile: 'common',
      severity: 'error',
      title: '代码围栏未闭合',
      fact: 'fence-balance',
      source: 'agentskills',
      note: '围栏不闭合会把后面的正文吞进代码块，属于结构损坏。',
    },
    {
      id: 'CORE-REF-001',
      profile: 'common',
      severity: 'error',
      title: '正文引用的文件不存在',
      fact: 'reference-exists',
      source: 'agentskills',
      note: '引用路径按 Skill 根目录解析；找不到就是死引用。',
    },
    {
      id: 'CORE-REF-002',
      profile: 'common',
      severity: 'error',
      title: '引用路径逃出 Skill 根目录',
      fact: 'reference-escape',
      source: 'agentskills',
      note: '规范要求相对 Skill 根目录引用；`../` 逃逸会把 Skill 之外的文件拉进来。',
    },
    {
      id: 'CORE-REF-003',
      profile: 'common',
      severity: 'warning',
      title: '引用路径深于一层',
      fact: 'reference-depth',
      source: 'agentskills',
      note: '规范：Keep file references one level deep from SKILL.md。',
    },
    {
      id: 'CORE-SAFE-001',
      profile: 'common',
      severity: 'warning',
      title: '出现疑似凭据或密钥的字面量',
      fact: 'credential-pattern',
      source: 'anthropic',
      note: 'Anthropic「Lack of Surprise」：Skill 不应包含能危及系统安全的内容。只报观测到的模式。',
    },
    {
      id: 'CORE-SAFE-002',
      profile: 'common',
      severity: 'warning',
      title: '出现疑似外传数据或绕过权限的指令',
      fact: 'exfiltration-pattern',
      source: 'anthropic',
      note: '同上。只报观测到的字面模式，不判断这份 Skill 的意图。',
    },

    // --- DSH Profile ---------------------------------------------------------
    {
      id: 'DSH-NAME-001',
      profile: 'dsh',
      severity: 'error',
      title: 'name 不符合 DSH 的命名语法',
      fact: 'dsh-name-grammar',
      source: 'dsh',
      note: 'DSH 用 /^[a-z0-9]+(?:-[a-z0-9]+)*$/ 校验；不匹配的 Skill 不会被收录。',
    },
    {
      id: 'DSH-FM-001',
      profile: 'dsh',
      severity: 'error',
      title: 'name / description 不是 DSH 要求的非空字符串',
      fact: 'dsh-string-field',
      source: 'dsh',
      note: 'DSH 的 stringField 要求非空字符串，否则整个文件被忽略（空字符串也算缺失）。',
    },
    {
      id: 'DSH-INVOC-001',
      profile: 'dsh',
      severity: 'error',
      title: '使用了 DSH 已废弃的 invocation 字段',
      fact: 'dsh-legacy-invocation',
      source: 'dsh',
      note: 'disableModelInvocation / modelInvocable / userInvocable 会让 DSH 装载抛错。',
    },
    {
      id: 'DSH-INVOC-002',
      profile: 'dsh',
      severity: 'error',
      title: 'invocation 字段的值不是 DSH 接受的布尔写法',
      fact: 'dsh-invocation-boolean',
      source: 'dsh',
      note: 'DSH 接受 boolean、1/0、"1"/"0"、true/yes/on、false/no/off；其它值抛 TypeError。',
    },

    // --- Microsoft Profile ---------------------------------------------------
    {
      id: 'MS-DIR-001',
      profile: 'microsoft',
      severity: 'error',
      title: 'name 与所在目录名不一致',
      fact: 'directory-name-match',
      source: 'microsoft',
      note: 'Microsoft 原文：Must match the parent directory name。',
    },
    {
      id: 'MS-FM-001',
      profile: 'microsoft',
      severity: 'error',
      title: '同一个顶层字段出现了多次',
      fact: 'frontmatter-duplicate-key',
      source: 'microsoft',
      note: 'Microsoft：duplicate recognized fields prevent the skill from loading。',
    },
    {
      id: 'MS-FM-002',
      profile: 'microsoft',
      severity: 'error',
      title: '已知顶层字段的大小写不正确',
      fact: 'frontmatter-field-casing',
      source: 'microsoft',
      note: 'Microsoft：incorrect field casing prevents the skill from loading。',
    },
    {
      id: 'MS-META-001',
      profile: 'microsoft',
      severity: 'warning',
      title: 'metadata 含非字符串值',
      fact: 'metadata-shape',
      source: 'microsoft',
      note: 'Microsoft：Invalid metadata entries, including nested collections, are skipped with a warning。',
    },

    // --- OpenAI Profile ------------------------------------------------------
    {
      id: 'OA-FM-001',
      profile: 'openai',
      severity: 'warning',
      title: 'frontmatter 含 name / description 以外的字段',
      fact: 'openai-frontmatter-fields',
      source: 'openai',
      note: 'OpenAI：These are the only fields that Codex reads；Do not include any other fields。',
    },
    {
      id: 'OA-DIR-001',
      profile: 'openai',
      severity: 'warning',
      title: '目录名与 Skill 名不一致',
      fact: 'openai-directory-name',
      source: 'openai',
      note: 'OpenAI：Name the skill folder exactly after the skill name。',
    },
    {
      id: 'OA-FILES-001',
      profile: 'openai',
      severity: 'warning',
      title: '存在被点名的多余文档文件',
      fact: 'openai-extraneous-files',
      source: 'openai',
      note: 'OpenAI：Do NOT create README.md / INSTALLATION_GUIDE.md / QUICK_REFERENCE.md / CHANGELOG.md。',
    },
    {
      id: 'OA-AGENTS-001',
      profile: 'openai',
      severity: 'info',
      title: '没有 agents/openai.yaml',
      fact: 'openai-agents-metadata',
      source: 'openai',
      note: 'OpenAI 把 agents/openai.yaml 列为 recommended（界面用的显示名与默认提示）。',
    },

    // --- Anthropic Profile ---------------------------------------------------
    {
      id: 'AN-COMPAT-001',
      profile: 'anthropic',
      severity: 'info',
      title: '使用了 compatibility 字段',
      fact: 'anthropic-compatibility',
      source: 'anthropic',
      note: 'Anthropic 把 compatibility 标为 optional / rarely needed。',
    },
  ].map((rule) => Object.freeze(rule)),
)

/** 规则 id 的集合，用于防止重名与重复 fact。 */
export const SKILL_RULE_IDS = Object.freeze(SKILL_RULES.map((rule) => rule.id))

const RULES_BY_ID = new Map(SKILL_RULES.map((rule) => [rule.id, rule]))

/**
 * 每个 Profile 关心哪些规则。
 *
 * 这里允许共同规则被多个 Profile 引用 —— 这正是「同一件事各家都要求」的表达方式，
 * 它不会产生第二条警告，只是让界面能按 Profile 汇总（规划 §四十九：每一条结果都要
 * 能找到对应 rule）。
 */
export const SKILL_PROFILE_RULES = Object.freeze({
  common: Object.freeze(SKILL_RULES.filter((rule) => rule.profile === 'common').map((rule) => rule.id)),
  dsh: Object.freeze([
    'CORE-FM-002',
    'CORE-FM-004',
    'CORE-FM-005',
    'DSH-NAME-001',
    'DSH-FM-001',
    'DSH-INVOC-001',
    'DSH-INVOC-002',
  ]),
  microsoft: Object.freeze([
    'CORE-FM-001',
    'CORE-FM-002',
    'CORE-FM-003',
    'CORE-NAME-001',
    'CORE-NAME-002',
    'CORE-NAME-003',
    'CORE-DESC-001',
    'CORE-COMPAT-001',
    'CORE-BODY-001',
    'MS-DIR-001',
    'MS-FM-001',
    'MS-FM-002',
    'MS-META-001',
  ]),
  openai: Object.freeze([
    'CORE-FM-001',
    'CORE-FM-002',
    'CORE-NAME-001',
    'CORE-DESC-001',
    'CORE-BODY-001',
    'OA-FM-001',
    'OA-DIR-001',
    'OA-FILES-001',
    'OA-AGENTS-001',
  ]),
  anthropic: Object.freeze([
    'CORE-FM-001',
    'CORE-FM-002',
    'CORE-DESC-002',
    'CORE-BODY-001',
    'AN-COMPAT-001',
  ]),
})

/**
 * Profile 的说明文案。
 *
 * `contributes` 说清这个 Profile 相对 Common Core **多**要求了什么；Anthropic 那一条
 * 是实话：它公开资料里可静态判定的硬规则最少，它的价值主要在「修改 → 测试 → 评估」的
 * 流程规范上，而那属于行为层，V0.9 不做（规划 §五十二）。
 */
export const SKILL_PROFILE_NOTES = Object.freeze({
  common: Object.freeze({
    zh: '四份公开来源（agentskills.io 开放规范、Microsoft、OpenAI、Anthropic）都写到的共同条款。',
    en: 'Clauses stated by all four public sources (the agentskills.io spec, Microsoft, OpenAI, Anthropic).',
  }),
  dsh: Object.freeze({
    zh: 'DSH 自身的装载行为：命名语法、必填字符串字段、invocation 字段的合法写法。DSH 不看目录名。',
    en: 'How DSH itself loads a Skill: name grammar, required string fields, legal invocation values. DSH does not compare directory names.',
  }),
  microsoft: Object.freeze({
    zh: '在共同条款之外，Microsoft 额外要求 name 与父目录同名，并把重复字段、字段大小写列为装载阻断项。',
    en: 'Beyond the common clauses: name must match the parent directory, and duplicate fields or wrong casing block loading.',
  }),
  openai: Object.freeze({
    zh: '在共同条款之外，OpenAI 要求 frontmatter 只放 name 与 description，并点名了不该存在的文档文件。',
    en: 'Beyond the common clauses: frontmatter holds only name and description, and certain documentation files are named as unwanted.',
  }),
  anthropic: Object.freeze({
    zh: 'Anthropic 可静态判定的硬规则最少：它把 compatibility 标为很少需要。它的重点在修改与评估流程上，属于行为层。',
    en: 'Anthropic states the fewest statically checkable rules; compatibility is marked rarely needed. Its emphasis is the modify/evaluate loop, which is behavioral.',
  }),
})

/**
 * 按 id 取一条规则。
 *
 * @param id - 规则 id。
 * @returns 规则对象，或 undefined。
 */
export function skillRuleById(id) {
  return RULES_BY_ID.get(id)
}

/**
 * 把用户选的目标归一成一组 Profile。
 *
 * 规则：`common` 永远在（它是共同规范层，不是可选平台）；未知 id 被丢弃并单独返回，
 * 不静默当成合法 —— 一个拼错的 Profile 名不该被当成「验收通过」。
 *
 * **空数组与「没传」是同一件事**：调用方还没选，用产品默认（DSH + Common）。想只要共同规范层，
 * 就显式传 `['common']` —— 那与「什么都没传」是两回事，不能靠「传个空的」来表达。
 *
 * @param selection - Profile id 数组，或 undefined。
 * @returns `{ profileIds, unknown }`；`profileIds` 已去重并按 SKILL_PROFILE_IDS 排序。
 */
export function resolveSkillProfiles(selection) {
  const asked = Array.isArray(selection) && selection.length > 0 ? selection : SKILL_PROFILE_DEFAULT
  const known = []
  const unknown = []
  for (const raw of asked) {
    const id = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!SKILL_PROFILE_IDS.includes(id)) {
      if (id) unknown.push(id)
      continue
    }
    if (!known.includes(id)) known.push(id)
  }
  if (!known.includes('common')) known.push('common')
  const profileIds = SKILL_PROFILE_IDS.filter((id) => known.includes(id))
  return { profileIds, unknown }
}

/**
 * 取某个 Profile 关心的规则描述。
 *
 * @param profileId - Profile id。
 * @returns 规则数组（未知 Profile 返回空数组）。
 */
export function skillRulesForProfile(profileId) {
  const ids = SKILL_PROFILE_RULES[profileId]
  if (!ids) return []
  return ids.map((id) => RULES_BY_ID.get(id)).filter(Boolean)
}

/**
 * 取一组 Profile 合起来的规则描述（按规则表顺序，不重复）。
 *
 * @param profileIds - Profile id 数组。
 * @returns 规则数组。
 */
export function skillRulesForProfiles(profileIds) {
  const wanted = new Set()
  for (const profileId of Array.isArray(profileIds) ? profileIds : []) {
    for (const id of SKILL_PROFILE_RULES[profileId] ?? []) wanted.add(id)
  }
  return SKILL_RULES.filter((rule) => wanted.has(rule.id))
}

/**
 * 取某个 Profile 的显示名。
 *
 * @param profileId - Profile id。
 * @param language - `'zh'` 或 `'en'`。
 * @returns 显示名字符串。
 */
export function skillProfileLabel(profileId, language = 'zh') {
  const labels = SKILL_PROFILE_LABELS[profileId]
  if (!labels) return typeof profileId === 'string' ? profileId : ''
  return language === 'en' ? labels.en : labels.zh
}

/**
 * 取某个严重度的显示名。
 *
 * @param severity - error / warning / info。
 * @param language - `'zh'` 或 `'en'`。
 * @returns 显示名字符串。
 */
export function skillSeverityLabel(severity, language = 'zh') {
  const labels = SKILL_SEVERITY_LABELS[severity]
  if (!labels) return typeof severity === 'string' ? severity : ''
  return language === 'en' ? labels.en : labels.zh
}
