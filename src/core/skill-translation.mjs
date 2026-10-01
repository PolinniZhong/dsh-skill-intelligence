/**
 * v0.6 §12–§15 的翻译数据层。
 *
 * 这一层只做三件事，全部是纯函数，所以不需要真实模型就能测：
 *   1. `buildTranslationMessages` —— 组装请求。SDD §20 明确禁止把「原始 Session 全部
 *      Prompt / Tool 内容 / Cookie / Credential」当成翻译上下文，所以这里只允许定义正文
 *      本身进入 messages，别的什么都不放。
 *   2. `extractProtected` —— 从原文里抽出**必须逐字保留**的东西：代码围栏、行内代码、
 *      URL、文件路径、标题层级、frontmatter 字段名。
 *   3. `inspectTranslation` —— 把译文里同样的东西抽出来比对。模型不听话时，这一步是
 *      唯一的证据来源；§14 的那串「不得修改」逐条对应一条规则。
 *
 * 这一层**不负责**决定译文好坏：它只能证明「结构没被破坏」。语言质量不在校验范围。
 */

export const TRANSLATION_ERROR = Object.freeze({
  INVALID_REQUEST: 'invalid-request',
  SKILL_NOT_FOUND: 'skill-not-found',
  DEFINITION_CHANGED: 'definition-changed',
  DEFINITION_UNAVAILABLE: 'definition-unavailable',
  MODEL_BUSY: 'model-busy',
  TRANSLATION_FAILED: 'translation-failed',
})

const MAX_VIOLATIONS = 20
const DEFAULT_TARGET_LANGUAGE = 'zh-CN'

function text(value) {
  return typeof value === 'string' ? value : ''
}

function scanFencesAndHeadings(markdown) {
  const lines = text(markdown).split('\n')
  const fences = []
  const headings = []
  const outside = []
  let open = null
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (open) {
      const closes = marker && marker[1][0] === open.marker[0] && marker[1].length >= open.marker.length && marker[2].trim() === ''
      if (closes) {
        fences.push({ info: open.info, body: open.body.join('\n') })
        open = null
        continue
      }
      open.body.push(line)
      continue
    }
    if (marker) {
      open = { marker: marker[1], info: marker[2].trim(), body: [] }
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) headings.push(heading[1].length)
    outside.push(line)
  }
  // 未闭合的围栏也算一个围栏：它的内容同样是「不得翻译」的。
  if (open) fences.push({ info: open.info, body: open.body.join('\n') })
  return { fences, headings, outside: outside.join('\n') }
}

function frontmatterKeys(markdown) {
  const source = text(markdown)
  if (!source.startsWith('---')) return []
  const end = source.indexOf('\n---', 3)
  if (end === -1) return []
  const block = source.slice(3, end)
  const keys = []
  for (const line of block.split('\n')) {
    // 只认顶格 `key:`，嵌套结构的缩进键不算 —— 它们是值的一部分。
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:/)
    if (match) keys.push(match[1])
  }
  return keys
}

function multiset(values) {
  return values.slice().sort()
}

function sameMultiset(left, right) {
  if (left.length !== right.length) return false
  const a = multiset(left)
  const b = multiset(right)
  return a.every((value, index) => value === b[index])
}

export function extractProtected(markdown) {
  const { fences, headings, outside } = scanFencesAndHeadings(markdown)
  const inline = [...text(outside).matchAll(/`([^`\n]+)`/g)].map((match) => match[1])
  const urls = [...text(outside).matchAll(/https?:\/\/[^\s)>\])]+/g)].map((match) => match[0])
  // 带扩展名的路径（`src/core/x.mjs`、`./a/b.md`、`examples/thing.yaml`）。
  const paths = [...text(outside).matchAll(/(?:^|[\s(`"'])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]{1,8})/g)].map((match) => match[1])
  return {
    fences: fences.map((fence) => `${fence.info}\u0000${fence.body}`),
    fenceCount: fences.length,
    headingLevels: headings,
    inline: multiset(inline),
    urls: multiset(urls),
    paths: multiset(paths),
    frontmatterKeys: frontmatterKeys(markdown),
  }
}

/**
 * 比对原文与译文的结构。返回的每条 violation 对应 SDD §14 的一条硬规则，
 * 所以失败信息可以直接给用户看（不暴露内部路径或模型细节）。
 */
export function inspectTranslation({ source, translation } = {}) {
  const original = extractProtected(source)
  const translated = extractProtected(translation)
  const violations = []
  const push = (rule, detail) => {
    if (violations.length < MAX_VIOLATIONS) violations.push({ rule, detail })
  }

  if (original.fenceCount !== translated.fenceCount) {
    push('code-fence', `代码围栏数量由 ${original.fenceCount} 变成 ${translated.fenceCount}`)
  } else {
    for (let index = 0; index < original.fences.length; index += 1) {
      if (original.fences[index] !== translated.fences[index]) {
        push('code-fence', `第 ${index + 1} 个代码围栏的内容或语言标记被改动`)
      }
    }
  }

  if (original.headingLevels.length !== translated.headingLevels.length) {
    push('heading', `标题数量由 ${original.headingLevels.length} 变成 ${translated.headingLevels.length}`)
  } else {
    for (let index = 0; index < original.headingLevels.length; index += 1) {
      if (original.headingLevels[index] !== translated.headingLevels[index]) {
        push('heading', `第 ${index + 1} 个标题的层级被改动`)
        break
      }
    }
  }

  if (!sameMultiset(original.inline, translated.inline)) {
    push('inline-code', '行内代码被翻译或改写')
  }
  if (!sameMultiset(original.urls, translated.urls)) {
    push('url', 'URL 被翻译或改写')
  }
  if (!sameMultiset(original.paths, translated.paths)) {
    push('file-path', '文件路径被翻译或改写')
  }
  if (!sameMultiset(original.frontmatterKeys, translated.frontmatterKeys)) {
    push('frontmatter', 'frontmatter 字段名被翻译或改写')
  }

  return {
    ok: violations.length === 0,
    violations,
    preserved: {
      fenceCount: original.fenceCount,
      headingCount: original.headingLevels.length,
      inlineCount: original.inline.length,
      urlCount: original.urls.length,
      pathCount: original.paths.length,
    },
  }
}

export function buildTranslationMessages({ skillName, definitionText, targetLanguage = DEFAULT_TARGET_LANGUAGE } = {}) {
  const name = text(skillName).trim()
  const body = text(definitionText)
  if (!name) throw new Error('skillName 必填')
  if (!body.trim()) throw new Error('definition 正文为空，无法翻译')
  const system = [
    `你是 Markdown 结构保持翻译器。把下面这份 Skill 定义（${name}）翻译成 ${targetLanguage}。`,
    '',
    '硬规则：',
    '1. 只翻译自然语言。以下内容必须逐字原样保留，一个字符都不能动：代码围栏（连围栏标记与语言标记一起）、围栏内的全部内容、行内代码、URL、文件路径、shell 命令、环境变量名、参数名、JSON/YAML/XML 的结构与字段名、Skill 名、工具名。',
    '2. 不增加、不删除、不合并、不拆分任何段落。',
    '3. 不改变任何标题的层级与数量。',
    '4. 不添加解释、前言、后记，也不要把结果包进代码块。',
    '5. 只输出翻译后的 Markdown 本身。',
  ].join('\n')
  return {
    system,
    // §20：翻译上下文只有定义正文。会话消息、工具输出、凭据都不进来。
    messages: [{ role: 'user', content: body }],
    targetLanguage,
  }
}

/**
 * 译文与请求时的定义是否还对得上（§15）。只有一侧有 hash 就是 `unavailable`，
 * 不能温和地写成「内容变了」。
 */
export function compareTranslationSource({ requestedSha256, currentSha256 } = {}) {
  const requested = text(requestedSha256).trim()
  const current = text(currentSha256).trim()
  if (!requested || !current) return 'unavailable'
  return requested === current ? 'match' : 'mismatch'
}

export const DEFAULT_TRANSLATION_LANGUAGE = DEFAULT_TARGET_LANGUAGE
