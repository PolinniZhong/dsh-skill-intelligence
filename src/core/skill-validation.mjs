/**
 * Skill 静态验收：把 `skill-profiles.mjs` 里那些有出处的规则，逐条作用在一份 SKILL.md 上。
 *
 * 这个模块**只做确定性判定**，所以它有三条自我约束：
 *
 * 1. **不评分。** 结果里没有分数、等级、百分比、排名，只有 `pass` / `needs-fix` / `unknown`
 *    三态，以及每条规则自己的 error / warning / info。只有 error 才推成 `needs-fix`；
 *    `warnings > 0` 不是失败（规划 §九、§十九）。
 * 2. **不判断意图。** 安全那两条只报「在第几行看到了什么形态的字面量」，并且**不回显匹配到的
 *    值** —— 一份写着 `apiKey: "your-key-here"` 的示例不是凭据，而把真的密钥抄进验收结果里
 *    本身就是二次泄漏。
 * 3. **读不到就说读不到。** 没有 SKILL.md、没有目录清单、正文被截断时，对应规则进 `skipped`
 *    并写明理由，绝不降级成「通过」。这就是 `unknown` 这一态的用途（规划 §十七、§四十九）。
 *
 * 输入是一份**纯数据**（见 `buildSkillValidation` 的 JSDoc），没有 IO、没有模型调用、
 * 没有 DSH 依赖；读文件与定位目录是宿主的事。这样它在测试里可以直接喂字符串。
 */

import {
  SKILL_BODY_LINE_HINT,
  SKILL_COMPATIBILITY_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_EXTRANEOUS_FILES,
  SKILL_NAME_CHARSET_PATTERN,
  SKILL_NAME_MAX,
  SKILL_NAME_PATTERN,
  SKILL_REFERENCE_DEPTH_MAX,
  SKILL_RESOURCE_DIRECTORIES,
  SKILL_RULES,
  SKILL_PROFILE_LABELS,
  SKILL_PROFILE_NOTES,
  SKILL_PROFILE_RULES,
  DSH_BOOLEAN_FALSE,
  DSH_BOOLEAN_TRUE,
  DSH_LEGACY_INVOCATION_FIELDS,
  skillRulesForProfiles,
  resolveSkillProfiles,
} from './skill-profiles.mjs'

export const SKILL_VALIDATION_SCHEMA_VERSION = 1

/** 三态。`unknown` 是「判不了」，不是「通过」也不是「失败」。 */
export const SKILL_VALIDATION_STATUSES = Object.freeze(['pass', 'needs-fix', 'unknown'])

export const SKILL_VALIDATION_STATUS_LABELS = Object.freeze({
  pass: Object.freeze({ zh: '通过', en: 'Pass' }),
  'needs-fix': Object.freeze({ zh: '需要修正', en: 'Needs fix' }),
  unknown: Object.freeze({ zh: '无法判断', en: 'Unknown' }),
})

export const SKILL_VALIDATION_UNAVAILABLE_MESSAGE =
  '现在读不到这个 Skill 的 SKILL.md，因此无法判断它是否符合规范。'

/** 每条规则最多列几处，避免一份大文件把结果刷屏。 */
export const SKILL_VALIDATION_LIMITS = Object.freeze({
  references: 40,
  findingsPerRule: 6,
})

/**
 * 验收结果必须一起交代的边界。
 *
 * 界面要把这几句**原样**渲染出来：它们是这份结果能被相信的前提。
 */
export const SKILL_VALIDATION_LIMITATIONS = Object.freeze([
  '静态验收只读 SKILL.md 与目录清单，不执行 Skill 里的任何脚本。',
  '这里没有被指出问题，不等于这份 Skill 的指令一定有效果 —— 那属于行为验证。',
  'description 是否准确说明用途需要人来判断，本项不做判定。',
  '只有 scripts/ references/ assets/ 下的引用按资源判定；正文里提到的其它路径可能是在说宿主工程，不做判定。',
  '目录名与目录清单只在能定位到 Skill 目录时才检查；线上来源的 Skill 没有目录。',
  '安全两条只报告观测到的字面模式，不代表这份 Skill 的意图。',
])

/** 常见于描述触发场景的词。命中其一就不再提醒；不命中只是提醒，不是错误。 */
export const SKILL_VALIDATION_TRIGGER_WORDS = Object.freeze([
  'when',
  'whenever',
  'trigger',
  'use this',
  'use it',
  'if the user',
  '当用户',
  '当你',
  '当需要',
  '当任务',
  '场景',
  '触发',
  '适用于',
  '调用时机',
])

/** 顶层字段里会做「大小写必须正确」检查的那几个（规范的拼法就是全小写）。 */
export const SKILL_KNOWN_FRONTMATTER_FIELDS = Object.freeze([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
])

/** 顶层字段里 OpenAI 认为 Codex 会读的、也是唯一被允许的两个。 */
export const SKILL_OPENAI_ALLOWED_FIELDS = Object.freeze(['name', 'description'])

/**
 * 看起来像路径的引用才会被当成资源引用。
 *
 * 判据是「有已知扩展名」或「落在三个约定目录里」，否则 `详见上文` 这种反引号片段会被误判成
 * 一个不存在的文件。
 */
export const SKILL_REFERENCE_EXTENSIONS = Object.freeze([
  'md',
  'markdown',
  'txt',
  'json',
  'yaml',
  'yml',
  'csv',
  'xml',
  'py',
  'js',
  'mjs',
  'cjs',
  'ts',
  'sh',
  'bash',
  'ps1',
  'cs',
  'csx',
  'rb',
  'go',
  'rs',
  'html',
  'css',
  'toml',
  'ini',
  'png',
  'jpg',
  'jpeg',
  'svg',
  'gif',
  'webp',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
])

/**
 * 疑似凭据的字面形态。
 *
 * `capture` 指向需要做「占位符豁免」的那个分组：`your-api-key-here`、`xxx`、`<TOKEN>` 这类
 * 是文档在讲怎么填，不是真凭据。
 */
export const SKILL_CREDENTIAL_PATTERNS = Object.freeze(
  [
    { id: 'private-key-block', label: '私钥块', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { id: 'aws-access-key', label: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
    { id: 'github-token', label: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
    { id: 'api-key-literal', label: '疑似 API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    { id: 'slack-token', label: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
    {
      id: 'assigned-secret',
      label: '键值形式的密钥赋值',
      pattern: /(api[_-]?key|apikey|secret|token|password|passwd|credential|access[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9_\-+/]{16,})["']?/i,
      capture: 2,
    },
  ].map((entry) => Object.freeze(entry)),
)

/**
 * 疑似外传数据 / 绕过权限的字面形态。
 *
 * 与凭据一样：这些都是**观测到的写法**，不是对这份 Skill 的判决。
 */
export const SKILL_EXFILTRATION_PATTERNS = Object.freeze(
  [
    {
      id: 'credential-in-command',
      label: '命令里带凭据变量',
      pattern:
        /\b(curl|wget|nc|netcat|http)\b[^\n]{0,120}(\$\{?[A-Za-z_]*(TOKEN|KEY|SECRET|PASS|CREDENTIAL)[A-Za-z_]*\}?)/i,
    },
    {
      id: 'upload-credentials',
      label: '指示上传凭据',
      pattern:
        /(upload|send|post|transmit|exfiltrate)[^\n]{0,60}(credential|token|secret|password|api[_-]?key|cookie)/i,
    },
    {
      id: 'read-env-secrets',
      label: '读取环境里的密钥',
      pattern:
        /\b(cat|print|echo|printenv|env)\b[^\n]{0,40}(\.env\b|\$\{?(AWS|GITHUB|NPM|OPENAI|ANTHROPIC|DSH)[A-Z_]*)/,
    },
    {
      id: 'bypass-permission',
      label: '绕过权限或审批',
      pattern: /(bypass|skip|disable|ignore)[^\n]{0,40}(permission|approval|sandbox|guardrail|safety)/i,
    },
    { id: 'destructive-command', label: '破坏性删除命令', pattern: /\brm\s+-rf\s+\/(?!\w)/ },
    { id: 'privilege-escalation', label: '提权执行', pattern: /\bsudo\s+(rm|chmod|chown|dd|mkfs)\b/ },
  ].map((entry) => Object.freeze(entry)),
)

/** 明显是占位符的值，不该被当成凭据。 */
const PLACEHOLDER_PATTERN =
  /(your|my|example|sample|placeholder|dummy|fake|redacted|change[_-]?me|here|todo|xxx|\.\.\.|<|>|\{\{|\$\{)/i

/**
 * 读一份 frontmatter 块。
 *
 * 与 `definition-outline.mjs` 的 `parseFrontmatter` 是**两个口径**，这里分开写是有意的：
 * 那个函数的用途是显示，它把值截到 300 字符、折叠空白、丢掉重复键 —— 于是
 * 「description 有 1200 字符」和「name 写了两次」这两件事在它那里根本看不见，
 * 而这两件事恰好是本次要判定的事实。所以这里保留原始值、原始行号与缩进层级。
 *
 * @param content - SKILL.md 全文。
 * @returns `{ present, closed, bodyStartLine, entries, topLevel, duplicates, unknownLines, casing }`。
 */
export function scanFrontmatter(content) {
  const text = typeof content === 'string' ? content : ''
  const lines = text.split(/\r?\n/)
  const empty = {
    present: false,
    closed: false,
    bodyStartLine: 1,
    entries: [],
    topLevel: [],
    duplicates: [],
    unknownLines: [],
    unsupportedLines: [],
    casing: [],
  }
  if (lines.length === 0 || !/^---\s*$/.test(lines[0])) return empty

  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---\s*$/.test(lines[index])) {
      closing = index
      break
    }
  }

  const entries = []
  const unknownLines = []
  const unsupportedLines = []
  const stack = []
  const end = closing === -1 ? lines.length : closing
  for (let index = 1; index < end; index += 1) {
    const line = lines[index]
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = (/^[ \t]*/.exec(line) ?? [''])[0].replace(/\t/g, '  ').length
    const match = /^\s*([A-Za-z0-9_.-]{1,64})\s*:\s*(.*)$/.exec(line)
    if (!match) {
      // 列表项、锚点、别名、复杂键：YAML 本身合法，只是这里不解析。它们不能算
      // 「解析失败」——否则一份用列表写 allowed-tools 的规范 Skill 会被报成错误。
      if (/^\s*[-?*&!]/.test(line)) unsupportedLines.push({ line: index + 1, text: line.trim().slice(0, 80) })
      else unknownLines.push({ line: index + 1, text: line.trim().slice(0, 80) })
      continue
    }
    const key = match[1]
    const raw = match[2].trim()
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack.map((entry) => entry.key).join('.')
    const path = parent ? `${parent}.${key}` : key
    entries.push({
      key,
      path,
      parent: parent || null,
      indent,
      raw,
      value: unquote(raw),
      line: index + 1,
      opens: raw === '',
    })
    if (raw === '') stack.push({ indent, key })
  }

  const seen = new Map()
  const duplicates = []
  for (const entry of entries) {
    if (entry.parent !== null) continue
    const count = (seen.get(entry.path) ?? 0) + 1
    seen.set(entry.path, count)
    if (count === 2) duplicates.push({ key: entry.path, line: entry.line })
  }

  const casing = []
  for (const entry of entries) {
    if (entry.parent !== null) continue
    if (entry.key === entry.key.toLowerCase()) continue
    if (!SKILL_KNOWN_FRONTMATTER_FIELDS.includes(entry.key.toLowerCase())) continue
    casing.push({ key: entry.key, line: entry.line })
  }

  return {
    present: true,
    closed: closing !== -1,
    bodyStartLine: closing === -1 ? lines.length + 1 : closing + 2,
    entries,
    topLevel: entries.filter((entry) => entry.parent === null),
    duplicates,
    unknownLines,
    unsupportedLines,
    casing,
  }
}

/**
 * 取某个字段的值（同一字段出现多次时取第一次）。
 *
 * @param scan - `scanFrontmatter` 的结果。
 * @param path - 字段路径，如 `name` 或 `metadata.repository`。
 * @returns 去引号后的值；没有该字段时返回 `undefined`。
 */
export function frontmatterValue(scan, path) {
  const entry = scan?.entries?.find((item) => item.path === path)
  return entry ? entry.value : undefined
}

/**
 * 扫 Markdown 正文里的结构事实：正文有没有内容、有多长、代码围栏是否闭合、引用了哪些文件。
 *
 * 围栏内的内容不参与引用与围栏计数以外的解析 —— `# 注释` 不是标题，代码块里的
 * `[文字](x)` 也不是链接。
 *
 * @param content - SKILL.md 全文。
 * @param bodyStartLine - 正文起始行（1 基）。
 * @returns `{ bodyPresent, bodyLineCount, fences, unclosedFences, references }`。
 */
export function scanMarkdown(content, bodyStartLine = 1) {
  const text = typeof content === 'string' ? content : ''
  const lines = text.split(/\r?\n/)
  const bodyLines = lines.slice(Math.max(0, bodyStartLine - 1))
  const fences = []
  const unclosedFences = []
  const references = []
  let open = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const inBody = index + 1 >= bodyStartLine
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      const info = fenceMatch[2].trim()
      if (open === null) {
        open = { char: marker[0], length: marker.length, line: index + 1, info, closed: false }
        fences.push(open)
        continue
      }
      if (marker[0] === open.char && marker.length >= open.length && info === '') {
        open.closed = true
        open = null
      }
      continue
    }
    if (open !== null || !inBody) continue

    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      references.push({ raw: match[1], line: index + 1, kind: 'markdown-link' })
    }
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      references.push({ raw: match[1], line: index + 1, kind: 'inline-code' })
    }
  }
  if (open !== null) unclosedFences.push(open)

  return {
    bodyPresent: bodyLines.some((line) => line.trim() !== ''),
    bodyLineCount: bodyLines.length,
    fences,
    unclosedFences,
    references,
  }
}

/**
 * 判断一个引用目标是不是「Skill 根目录里的文件」，并算出它有没有越界、深了几层。
 *
 * 只认相对路径：带 scheme 的是外链，`/` 或盘符开头的是绝对路径，`..` 把深度弹到 0 以下就是逃逸。
 *
 * @param raw - 引用目标的原文。
 * @returns `{ kind, scheme, path, depth, directoryDepth }`；`kind` ∈
 *   `markdown-anchor` | `remote` | `absolute` | `escape` | `inside` | `empty`。
 */
export function classifyReference(raw) {
  const value = typeof raw === 'string' ? raw.trim().replace(/^<|>$/g, '') : ''
  if (!value) return { kind: 'empty', scheme: null, path: null, depth: 0, directoryDepth: 0 }
  if (value.startsWith('#')) return { kind: 'markdown-anchor', scheme: null, path: null, depth: 0, directoryDepth: 0 }
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(value)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    return { kind: 'remote', scheme, path: null, depth: 0, directoryDepth: 0 }
  }
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)) {
    return { kind: 'absolute', scheme: null, path: null, depth: 0, directoryDepth: 0 }
  }

  const withoutAnchor = value.split('#')[0].split('?')[0].replace(/\\/g, '/')
  const segments = withoutAnchor.split('/').filter((segment) => segment !== '' && segment !== '.')
  const kept = []
  let escaped = false
  for (const segment of segments) {
    if (segment === '..') {
      if (kept.length === 0) escaped = true
      else kept.pop()
      continue
    }
    kept.push(segment)
  }
  if (escaped) return { kind: 'escape', scheme: null, path: null, depth: 0, directoryDepth: 0 }
  const path = kept.join('/')
  const looksLikeFile = /\.[A-Za-z0-9]{1,8}$/.test(kept[kept.length - 1] ?? '')
  const directoryDepth = Math.max(0, kept.length - (looksLikeFile ? 1 : 0))
  return { kind: 'inside', scheme: null, path, depth: kept.length, directoryDepth }
}

/**
 * 判断一个引用目标看起来像不像 Skill 自己的资源文件。
 *
 * 只有落在规范约定的三个资源目录（`scripts/` / `references/` / `assets/`）下的路径才算。
 *
 * 这条收窄是很重要的：真实 Skill 的正文里经常提到**宿主工程**的路径
 * （`package.json`、`lib/index.js`、`packages/bundle/<name>/cordis.patch.yml`），那是它在讲
 * 自己住在哪个仓库里，不是它声明了一个资源。把这些一律判成「引用的文件不存在」，
 * 等于用一条规则制造一批假指控 —— 规划 §二十五 要的是死引用，不是「正文里出现过斜杠」。
 *
 * @param path - 已归一化的相对路径。
 * @returns 布尔值。
 */
export function isResourceReference(path) {
  const value = typeof path === 'string' ? path : ''
  const first = value.split('/')[0]
  return SKILL_RESOURCE_DIRECTORIES.includes(first)
}

/**
 * 判断一个路径是不是「有已知扩展名的文件」。
 *
 * `references/` 这种指到目录的写法不是文件引用；把它当文件去查存在性会得到一句假指控。
 *
 * @param path - 已归一化的相对路径。
 * @returns 布尔值。
 */
export function hasKnownExtension(path) {
  const extension = (/\.([A-Za-z0-9]{1,8})$/.exec(typeof path === 'string' ? path : '') ?? [])[1]
  return Boolean(extension) && SKILL_REFERENCE_EXTENSIONS.includes(extension.toLowerCase())
}

/** 通配符、占位符写法不是某个具体文件，不能拿它查存在性。 */
const REFERENCE_PATTERN_HINT = /[*?<>${}]/

/**
 * 在整份正文里找疑似凭据的字面量。
 *
 * **不回显匹配到的值**：只给出模式名与行号。
 *
 * @param content - SKILL.md 全文。
 * @returns `{ pattern, label, line }[]`。
 */
export function scanCredentialPatterns(content) {
  const text = typeof content === 'string' ? content : ''
  const lines = text.split(/\r?\n/)
  const found = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const pattern of SKILL_CREDENTIAL_PATTERNS) {
      const match = pattern.pattern.exec(line)
      if (!match) continue
      if (pattern.capture) {
        const captured = match[pattern.capture]
        if (!captured || captured.length < 16) continue
        if (PLACEHOLDER_PATTERN.test(captured)) continue
      }
      found.push({ pattern: pattern.id, label: pattern.label, line: index + 1 })
      break
    }
  }
  return found
}

/**
 * 在整份正文里找疑似外传数据 / 绕过权限的字面写法。
 *
 * @param content - SKILL.md 全文。
 * @returns `{ pattern, label, line }[]`。
 */
export function scanExfiltrationPatterns(content) {
  const text = typeof content === 'string' ? content : ''
  const lines = text.split(/\r?\n/)
  const found = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const pattern of SKILL_EXFILTRATION_PATTERNS) {
      if (!pattern.pattern.test(line)) continue
      found.push({ pattern: pattern.id, label: pattern.label, line: index + 1 })
      break
    }
  }
  return found
}

/**
 * 判断 description 里有没有「什么时候用」的线索。
 *
 * 这是**词表判定**，不是语义判定 —— 所以它只推出一条警告，标题里也写明了
 * 「未写明」，而不是「写得不好」。
 *
 * @param description - description 原文。
 * @returns 命中触发词时为 true。
 */
export function hasTriggerHint(description) {
  const value = typeof description === 'string' ? description.toLowerCase() : ''
  if (!value) return false
  return SKILL_VALIDATION_TRIGGER_WORDS.some((word) => value.includes(word))
}

/**
 * 逐条判定一个 Skill 是否符合规范。
 *
 * @param input - 一份纯数据：
 *   - `skillName`：界面问的那个 Skill 名（可以为 null）。
 *   - `available`：SKILL.md 是否读到了。
 *   - `reason`：读不到时的原因码。
 *   - `content`：SKILL.md 全文。
 *   - `truncated`：正文是否被截断过（截断时不做引用存在性判定）。
 *   - `directoryName`：Skill 所在目录名（拿不到就给 null）。
 *   - `resourcePaths`：目录里的相对路径清单（拿不到就给 null）。
 *   - `profileIds`：验收目标，默认 `['common','dsh']`。
 *   - `now`：时间戳。
 * @returns 验收结果；**任何输入都不会让它抛错**。
 */
export function buildSkillValidation(input = {}) {
  const now = Number.isFinite(input.now) ? input.now : Date.now()
  const skillName = typeof input.skillName === 'string' && input.skillName ? input.skillName : null
  const selection = resolveSkillProfiles(input.profileIds)
  const profileIds = selection.profileIds

  const available = input.available === true && typeof input.content === 'string'
  const content = available ? input.content : ''
  const directoryName =
    typeof input.directoryName === 'string' && input.directoryName ? input.directoryName : null
  const resourcePaths = Array.isArray(input.resourcePaths)
    ? input.resourcePaths.filter((path) => typeof path === 'string' && path)
    : null
  const truncated = input.truncated === true

  const scan = scanFrontmatter(content)
  const markdown = scanMarkdown(content, scan.bodyStartLine)
  const name = frontmatterValue(scan, 'name')
  const description = frontmatterValue(scan, 'description')
  const compatibility = frontmatterValue(scan, 'compatibility')

  const context = {
    available,
    reason: typeof input.reason === 'string' ? input.reason : null,
    truncated,
    skillName,
    content,
    name: typeof name === 'string' && name ? name : null,
    description: typeof description === 'string' && description ? description : null,
    compatibility: typeof compatibility === 'string' && compatibility ? compatibility : null,
    scan,
    markdown,
    directoryName,
    resourcePaths,
    references: collectReferences(markdown.references),
  }

  const findings = []
  const skipped = []
  const rules = []

  for (const rule of skillRulesForProfiles(profileIds)) {
    const evaluate = EVALUATORS[rule.id]
    if (typeof evaluate !== 'function') {
      rules.push({ ...ruleView(rule), state: 'skipped' })
      skipped.push({ id: rule.id, reason: 'no-evaluator' })
      continue
    }
    const outcome = available ? evaluate(context) : { reason: 'definition-unavailable' }
    if (outcome && typeof outcome.reason === 'string') {
      rules.push({ ...ruleView(rule), state: 'skipped' })
      skipped.push({ id: rule.id, reason: outcome.reason })
      continue
    }
    const details = Array.isArray(outcome?.details) ? outcome.details : []
    if (details.length === 0) {
      rules.push({ ...ruleView(rule), state: 'clean' })
      continue
    }
    rules.push({ ...ruleView(rule), state: 'fired' })
    for (const detail of details.slice(0, SKILL_VALIDATION_LIMITS.findingsPerRule)) {
      findings.push({ ...ruleView(rule), detail })
    }
  }

  const summary = {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
    skipped: skipped.length,
  }

  const profiles = profileIds.map((id) =>
    buildProfileRollup(id, rules, findings, skipped),
  )

  const status = !available ? 'unknown' : summary.errors > 0 ? 'needs-fix' : 'pass'

  const notes = []
  if (selection.unknown.length > 0) notes.push(`忽略未知的验收目标：${selection.unknown.join('、')}`)
  if (truncated) notes.push('正文过长，本次只验收了前面的一部分。')
  if (scan.unsupportedLines.length > 0) {
    notes.push(`frontmatter 里有 ${scan.unsupportedLines.length} 行本工具不解析的 YAML 结构（列表、锚点等），它们没有参与判定。`)
  }
  if (!available) notes.push(SKILL_VALIDATION_UNAVAILABLE_MESSAGE)

  return {
    schemaVersion: SKILL_VALIDATION_SCHEMA_VERSION,
    skillName,
    checkedAt: now,
    available,
    reason: context.reason,
    status,
    profileIds,
    profiles,
    summary,
    findings,
    rules,
    skipped,
    notes,
    limitations: [...SKILL_VALIDATION_LIMITATIONS],
    content: {
      lineCount: available ? content.split(/\r?\n/).length : 0,
      bodyLineCount: available ? markdown.bodyLineCount : 0,
      bytes: available ? content.length : 0,
      frontmatterPresent: scan.present,
      frontmatterClosed: scan.closed,
      frontmatterFields: scan.topLevel.map((entry) => entry.key),
      name: context.name,
      descriptionLength: context.description ? context.description.length : 0,
      directoryName,
      resourcePathCount: resourcePaths ? resourcePaths.length : null,
      referenceCount: context.references.length,
      truncated,
    },
  }
}

/**
 * 取某个状态与严重度的界面说法。
 *
 * @param value - 状态或严重度。
 * @param language - `'zh'` 或 `'en'`。
 * @returns 显示名；未知取值时原样返回。
 */
export function skillValidationStatusLabel(value, language = 'zh') {
  const labels = SKILL_VALIDATION_STATUS_LABELS[value]
  if (!labels) return typeof value === 'string' ? value : ''
  return language === 'en' ? labels.en : labels.zh
}

/** 一条规则的展示投影。 */
function ruleView(rule) {
  return {
    id: rule.id,
    profile: rule.profile,
    severity: rule.severity,
    title: rule.title,
    fact: rule.fact,
    source: rule.source,
  }
}

/** 某个 Profile 的汇总：只看它关心的那些规则。 */
function buildProfileRollup(id, rules, findings, skipped) {
  const ids = new Set(SKILL_PROFILE_RULES[id] ?? [])
  const mine = rules.filter((rule) => ids.has(rule.id))
  const myFindings = findings.filter((finding) => ids.has(finding.id))
  const errors = myFindings.filter((finding) => finding.severity === 'error').length
  const warnings = myFindings.filter((finding) => finding.severity === 'warning').length
  const info = myFindings.filter((finding) => finding.severity === 'info').length
  const mineSkipped = skipped.filter((entry) => ids.has(entry.id)).length
  const judged = mine.filter((rule) => rule.state !== 'skipped').length
  return {
    id,
    label: SKILL_PROFILE_LABELS[id] ?? { zh: id, en: id },
    note: SKILL_PROFILE_NOTES[id] ?? null,
    status: errors > 0 ? 'needs-fix' : judged === 0 ? 'unknown' : 'pass',
    errors,
    warnings,
    info,
    skipped: mineSkipped,
    checked: judged,
    total: mine.length,
  }
}

/**
 * 把 Markdown 与反引号里挑出来的引用，收成一份去重、有限、只留**资源引用**的清单。
 *
 * 只收两类：
 * - 落在 `scripts/` `references/` `assets/` 下的路径（规范约定的资源目录）；
 * - Markdown 链接形式的 `../` 逃逸（那是**声明的**引用，不是正文里提到的一个路径）。
 *
 * 其余一律丢弃 —— 见 `isResourceReference` 的注释：宿主工程路径不是 Skill 资源。
 */
function collectReferences(raw) {
  const seen = new Set()
  const collected = []
  for (const reference of Array.isArray(raw) ? raw : []) {
    if (collected.length >= SKILL_VALIDATION_LIMITS.references) break
    const classified = classifyReference(reference.raw)
    if (classified.kind === 'remote' || classified.kind === 'absolute') continue
    if (classified.kind === 'markdown-anchor' || classified.kind === 'empty') continue
    const escapes = classified.kind === 'escape'
    if (escapes && reference.kind !== 'markdown-link') continue
    if (!escapes) {
      if (!isResourceReference(classified.path)) continue
      if (!hasKnownExtension(classified.path)) continue
      if (REFERENCE_PATTERN_HINT.test(String(reference.raw))) continue
    }
    const key = `${classified.kind}|${classified.path ?? ''}|${reference.line}`
    if (seen.has(key)) continue
    seen.add(key)
    collected.push({
      raw: String(reference.raw).slice(0, 200),
      kind: reference.kind,
      target: classified.kind,
      path: classified.path,
      directoryDepth: classified.directoryDepth,
      line: reference.line,
    })
  }
  return collected
}

/** 去掉成对的首尾引号。 */
function unquote(value) {
  const text = typeof value === 'string' ? value : ''
  if (text.length >= 2 && (text[0] === '"' || text[0] === "'") && text[text.length - 1] === text[0]) {
    return text.slice(1, -1)
  }
  return text
}

/** 判断一个值是不是 YAML 流式集合（`[a]` 或 `{a: 1}`）—— 在 DSH 眼里它就不是字符串。 */
function isFlowCollection(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))
}

/** 判断一个值是不是块标量（`|` / `>`，可能带修饰符）。块标量在 YAML 里仍然是字符串。 */
function isBlockScalar(value) {
  return /^[|>][+-]?\d*$/.test(typeof value === 'string' ? value.trim() : '')
}

/**
 * 每条规则怎么判定。
 *
 * 返回值约定：
 * - `{ details: [] }` —— 判定过，没发现问题；
 * - `{ details: ['…'] }` —— 判定过，每一句是一个独立发现（会各自成为一条结果）；
 * - `{ reason: '…' }` —— 现在判不了，进 `skipped` 并写明理由。
 *
 * 判定函数不许抛错：宿主拿不到目录、正文被截断、字段类型不对，都要走 `reason`。
 */
const EVALUATORS = {
  // --- Common Core -----------------------------------------------------------
  'CORE-FM-001': (ctx) => ({ details: [] }),
  'CORE-FM-002': (ctx) =>
    ctx.scan.present ? { details: [] } : { details: ['SKILL.md 开头没有 `---` 包裹的 YAML frontmatter。'] },
  'CORE-FM-003': (ctx) => {
    if (!ctx.scan.present) return { reason: 'frontmatter-missing' }
    const details = []
    if (!ctx.scan.closed) details.push('frontmatter 的 --- 只有开头没有结尾，整块无法解析。')
    for (const line of ctx.scan.unknownLines) {
      details.push('第 ' + line.line + ' 行既不是 key: value，也不是注释或空行：' + line.text)
    }
    return { details }
  },
  'CORE-FM-004': (ctx) =>
    ctx.name ? { details: [] } : { details: ['frontmatter 里没有可用的 `name`。'] },
  'CORE-FM-005': (ctx) =>
    ctx.description ? { details: [] } : { details: ['frontmatter 里没有可用的 `description`。'] },
  'CORE-FM-006': (ctx) =>
    ctx.markdown.bodyPresent ? { details: [] } : { details: ['frontmatter 之后没有 Markdown 正文。'] },
  'CORE-NAME-001': (ctx) => {
    if (!ctx.name) return { reason: 'name-missing' }
    if (ctx.name.length <= SKILL_NAME_MAX) return { details: [] }
    return { details: [`name 有 ${ctx.name.length} 个字符，超过 ${SKILL_NAME_MAX} 的上限。`] }
  },
  'CORE-NAME-002': (ctx) => {
    if (!ctx.name) return { reason: 'name-missing' }
    if (SKILL_NAME_CHARSET_PATTERN.test(ctx.name)) return { details: [] }
    const offenders = [...new Set(ctx.name.replace(/[a-z0-9-]/g, '').split(''))]
    return {
      details: [
        `name 含规范之外的字符：${offenders.map((char) => JSON.stringify(char)).join('、')}（只允许小写字母、数字与连字符）。`,
      ],
    }
  },
  'CORE-NAME-003': (ctx) => {
    if (!ctx.name) return { reason: 'name-missing' }
    const details = []
    if (ctx.name.startsWith('-')) details.push('name 以连字符开头。')
    if (ctx.name.endsWith('-')) details.push('name 以连字符结尾。')
    if (ctx.name.includes('--')) details.push('name 含连续的连字符。')
    return { details }
  },
  'CORE-DESC-001': (ctx) => {
    if (ctx.description === null) return { reason: 'description-missing' }
    if (ctx.description.length <= SKILL_DESCRIPTION_MAX) return { details: [] }
    return {
      details: [`description 有 ${ctx.description.length} 个字符，超过 ${SKILL_DESCRIPTION_MAX} 的上限。`],
    }
  },
  'CORE-DESC-002': (ctx) => {
    if (ctx.description === null) return { reason: 'description-missing' }
    if (hasTriggerHint(ctx.description)) return { details: [] }
    return {
      details: [
        'description 里没找到描述适用场景的词（按词表判断），规范建议同时说明「做什么」与「什么时候用」。',
      ],
    }
  },
  'CORE-COMPAT-001': (ctx) => {
    if (ctx.compatibility === null) return { reason: 'compatibility-absent' }
    if (ctx.compatibility.length <= SKILL_COMPATIBILITY_MAX) return { details: [] }
    return {
      details: [
        `compatibility 有 ${ctx.compatibility.length} 个字符，超过 ${SKILL_COMPATIBILITY_MAX} 的上限。`,
      ],
    }
  },
  'CORE-BODY-001': (ctx) => {
    if (ctx.markdown.bodyLineCount <= SKILL_BODY_LINE_HINT) return { details: [] }
    return {
      details: [
        `正文有 ${ctx.markdown.bodyLineCount} 行，超过建议的 ${SKILL_BODY_LINE_HINT} 行；详细内容通常应拆到 references/。`,
      ],
    }
  },
  'CORE-FENCE-001': (ctx) => {
    const details = ctx.markdown.unclosedFences.map(
      (fence) => `第 ${fence.line} 行开始的代码围栏没有闭合。`,
    )
    return { details }
  },
  'CORE-REF-001': (ctx) => {
    if (!ctx.resourcePaths) return { reason: 'no-directory-listing' }
    if (ctx.truncated) return { reason: 'body-truncated' }
    const known = new Set(ctx.resourcePaths.map((path) => path.replace(/^\.\//, '')))
    const details = []
    for (const reference of ctx.references) {
      if (reference.target !== 'inside' || !reference.path) continue
      if (known.has(reference.path)) continue
      details.push(`第 ${reference.line} 行引用了 \`${reference.raw}\`，Skill 目录里没有这个文件。`)
    }
    return { details }
  },
  'CORE-REF-002': (ctx) => {
    const details = ctx.references
      .filter((reference) => reference.target === 'escape')
      .map(
        (reference) =>
          `第 ${reference.line} 行的链接指向 \`${reference.raw}\`，已经越过 SKILL.md 所在的目录。`,
      )
    return { details }
  },
  'CORE-REF-003': (ctx) => {
    const details = ctx.references
      .filter(
        (reference) =>
          reference.target === 'inside' && reference.directoryDepth > SKILL_REFERENCE_DEPTH_MAX,
      )
      .map(
        (reference) =>
          `第 ${reference.line} 行的引用 \`${reference.raw}\` 深入了 ${reference.directoryDepth} 层目录，规范建议不超过 ${SKILL_REFERENCE_DEPTH_MAX} 层。`,
      )
    return { details }
  },
  'CORE-SAFE-001': (ctx) => ({
    details: scanCredentialPatterns(ctx.content ?? '').map(
      (found) => `第 ${found.line} 行出现「${found.label}」形态的字面量（值不展示）。`,
    ),
  }),
  'CORE-SAFE-002': (ctx) => ({
    details: scanExfiltrationPatterns(ctx.content ?? '').map(
      (found) => `第 ${found.line} 行出现「${found.label}」形态的指令。`,
    ),
  }),

  // --- DSH Profile -----------------------------------------------------------
  'DSH-NAME-001': (ctx) => {
    if (!ctx.name) return { reason: 'name-missing' }
    if (SKILL_NAME_PATTERN.test(ctx.name)) return { details: [] }
    return {
      details: [`name 不匹配 DSH 的命名语法，DSH 不会收录这个 Skill：${ctx.name}`],
    }
  },
  'DSH-FM-001': (ctx) => {
    const details = []
    for (const field of ['name', 'description']) {
      const value = frontmatterValue(ctx.scan, field)
      if (typeof value !== 'string' || value.length === 0) {
        details.push(`DSH 需要非空的 \`${field}\` 字符串：缺失或为空时整个文件会被忽略。`)
        continue
      }
      if (isFlowCollection(value)) {
        details.push(`\`${field}\` 是集合而不是标量，DSH 读不到它，会忽略整个文件。`)
      }
    }
    return { details }
  },
  'DSH-INVOC-001': (ctx) => {
    const details = []
    for (const entry of ctx.scan.topLevel) {
      const replacement = DSH_LEGACY_INVOCATION_FIELDS[entry.key]
      if (!replacement) continue
      details.push(`第 ${entry.line} 行的 \`${entry.key}\` 是废弃写法，DSH 装载时会抛错；应改用 \`${replacement}\`。`)
    }
    return { details }
  },
  'DSH-INVOC-002': (ctx) => {
    const details = []
    for (const entry of ctx.scan.topLevel) {
      if (entry.key !== 'disable-model-invocation' && entry.key !== 'user-invocable') continue
      const value = unquote(entry.raw).toLowerCase()
      if (value === '' || isBlockScalar(value) || isFlowCollection(value)) {
        details.push(`第 ${entry.line} 行的 \`${entry.key}\` 不是 DSH 接受的布尔写法。`)
        continue
      }
      if (DSH_BOOLEAN_TRUE.includes(value) || DSH_BOOLEAN_FALSE.includes(value)) continue
      details.push(
        `第 ${entry.line} 行的 \`${entry.key}\` 值是 \`${value}\`，DSH 只接受 ${DSH_BOOLEAN_TRUE.join(' / ')} 与 ${DSH_BOOLEAN_FALSE.join(' / ')}。`,
      )
    }
    return { details }
  },

  // --- Microsoft Profile -----------------------------------------------------
  'MS-DIR-001': (ctx) => {
    if (!ctx.directoryName) return { reason: 'no-directory-name' }
    if (!ctx.name) return { reason: 'name-missing' }
    if (ctx.directoryName === ctx.name) return { details: [] }
    return {
      details: [`目录名是 \`${ctx.directoryName}\`，frontmatter 的 name 是 \`${ctx.name}\`：Microsoft 要求两者一致。`],
    }
  },
  'MS-FM-001': (ctx) => ({
    details: ctx.scan.duplicates.map(
      (entry) => `顶层字段 \`${entry.key}\` 出现了多次（第 ${entry.line} 行再次出现）：Microsoft 说重复字段会阻止装载。`,
    ),
  }),
  'MS-FM-002': (ctx) => ({
    details: ctx.scan.casing.map(
      (entry) => `字段写成了 \`${entry.key}\`（第 ${entry.line} 行）：Microsoft 要求使用表里的小写拼法，大小写不符会阻止装载。`,
    ),
  }),
  'MS-META-001': (ctx) => {
    const details = []
    for (const entry of ctx.scan.entries) {
      if (entry.path !== 'metadata' && !entry.path.startsWith('metadata.')) continue
      const nestedDepth = entry.path.split('.').length
      if (nestedDepth > 2) {
        details.push(`第 ${entry.line} 行的 \`${entry.path}\` 是嵌套集合：Microsoft 会跳过它并告警。`)
        continue
      }
      if (entry.path.startsWith('metadata.') && (isFlowCollection(entry.raw) || isBlockScalar(entry.raw))) {
        details.push(`第 ${entry.line} 行的 \`${entry.path}\` 不是字符串值：Microsoft 会跳过它并告警。`)
        continue
      }
      if (entry.path === 'metadata' && isFlowCollection(entry.raw)) {
        details.push(`第 ${entry.line} 行的 \`metadata\` 是集合写法，Microsoft 只接受字符串到字符串的映射。`)
      }
    }
    return { details }
  },

  // --- OpenAI Profile --------------------------------------------------------
  'OA-FM-001': (ctx) => {
    const extra = ctx.scan.topLevel
      .map((entry) => entry.key)
      .filter((key) => !SKILL_OPENAI_ALLOWED_FIELDS.includes(key))
    if (extra.length === 0) return { details: [] }
    return {
      details: [`frontmatter 还有 ${[...new Set(extra)].join('、')}：OpenAI 说 Codex 只读 name 与 description。`],
    }
  },
  'OA-DIR-001': (ctx) => {
    if (!ctx.directoryName) return { reason: 'no-directory-name' }
    if (!ctx.name) return { reason: 'name-missing' }
    if (ctx.directoryName === ctx.name) return { details: [] }
    return { details: [`目录名 \`${ctx.directoryName}\` 与 Skill 名 \`${ctx.name}\` 不一致。`] }
  },
  'OA-FILES-001': (ctx) => {
    if (!ctx.resourcePaths) return { reason: 'no-directory-listing' }
    const found = ctx.resourcePaths.filter((path) => {
      const base = path.split('/').pop()
      return SKILL_EXTRANEOUS_FILES.includes(base)
    })
    if (found.length === 0) return { details: [] }
    return { details: [`目录里有 ${[...new Set(found)].join('、')}：OpenAI 说这类文件不该出现在 Skill 里。`] }
  },
  'OA-AGENTS-001': (ctx) => {
    if (!ctx.resourcePaths) return { reason: 'no-directory-listing' }
    if (ctx.resourcePaths.some((path) => path.startsWith('agents/'))) return { details: [] }
    return { details: ['目录里没有 agents/openai.yaml（OpenAI 列为 recommended）。'] }
  },

  // --- Anthropic Profile -----------------------------------------------------
  'AN-COMPAT-001': (ctx) => {
    if (ctx.compatibility === null) return { reason: 'compatibility-absent' }
    return { details: ['这份 SKILL.md 使用了 compatibility 字段；Anthropic 把它标为很少需要。'] }
  },
}

/** 校验规则表与判定表没有对不上：每条规则都得有判定函数。 */
export const SKILL_VALIDATION_UNIMPLEMENTED_RULES = Object.freeze(
  SKILL_RULES.filter((rule) => typeof EVALUATORS[rule.id] !== 'function').map((rule) => rule.id),
)
