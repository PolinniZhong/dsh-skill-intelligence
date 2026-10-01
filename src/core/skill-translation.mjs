/**
 * v0.6 §12–§15 的翻译数据层。
 *
 * 这一层只做三件事，全部是纯函数，所以不需要真实模型就能测：
 *   1. `buildTranslationMessages` / `buildChunkMessages` —— 组装请求。SDD §20 明确禁止把
 *      「原始 Session 全部 Prompt / Tool 内容 / Cookie / Credential」当成翻译上下文，
 *      所以这里只允许定义正文本身进入 messages，别的什么都不放。
 *   2. `extractProtected` / `inspectTranslation` —— 从原文与译文里抽出**必须逐字保留**的
 *      东西并比对：代码围栏、行内代码、URL、文件路径、标题层级、frontmatter 字段名。
 *      §14 的那串「不得修改」逐条对应一条规则。
 *   3. `maskProtected` / `restoreProtected` / `chunkMasked` —— 让「逐字保留」变成**结构性
 *      事实**而不是对模型的请求。见下。
 *
 * ## 为什么需要 mask/restore
 *
 * 0.4.0-beta.69 上线后翻译在真实应用里**一次都没成功过**。探针证明模型与 `ctx.llm` 通路
 * 都正常（31 秒返回），失败的是 `inspectTranslation`：一份 31174 字符、336 行、28 个标题
 * 的定义一次性翻译，模型必然会动到标题层级、行内代码或文件路径中的至少一样，而当时的判定
 * 是**全有或全无** —— 任何一条 violation 就丢掉整篇。那是把 §12.4「不得修改结构」的意图
 * 实现成了「整篇必须完美」，而整篇完美是做不到的。
 *
 * 所以现在：
 *   - 必须逐字保留的片段（围栏、行内代码、URL、路径、frontmatter）**根本不发给模型**，
 *     它们在正文里被换成占位符，模型返回后再原样换回来。围栏内容因此不可能被改坏 ——
 *     不是「请模型别改」，是「模型看不到」。
 *   - 正文按空行切成若干段，逐段翻译。一段失败只重试该段，再失败只**回退该段**
 *     （显示原文），而不是丢掉整篇。
 *   - 标题层级仍然比对，但只在段内比对，且段落边界优先落在标题之前。
 *
 * 这一层**不负责**决定译文好坏：它只能证明「结构没被破坏」。语言质量不在校验范围。
 */

import { tableSignature } from './markdown-table.mjs'

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

/** 占位符用私用区字符：单 token、几乎不会被翻译，也不与 Markdown 语法冲突。 */
export const PLACEHOLDER_OPEN = '\uE000'
export const PLACEHOLDER_CLOSE = '\uE001'

/** 每次模型调用的掩码后正文上限。6000 字符的输入配 4096 maxTokens 足够，也不会截断。 */
export const CHUNK_CHAR_BUDGET = 6000

// 一段连续失败时最多劈几层。2 层把 3302 字符压到约 800 字符 —— 代价可控（多几次调用），
// 换来的是失败不再等于「整段英文」。
export const MAX_SPLIT_DEPTH = 2

function text(value) {
  return typeof value === 'string' ? value : ''
}

function placeholderFor(index) {
  return `${PLACEHOLDER_OPEN}${index}${PLACEHOLDER_CLOSE}`
}

function placeholderPattern(index) {
  // 宽松匹配：模型偶尔会在哨兵两侧加空格，那不算丢占位符。
  return new RegExp(`${PLACEHOLDER_OPEN}\\s*${index}\\s*${PLACEHOLDER_CLOSE}`, 'g')
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

const CJK_PATTERN = /[\u3400-\u9FFF]/
const ASCII_LETTER = /[A-Za-z]/g

function letterCount(value) {
  return (text(value).match(ASCII_LETTER) || []).length
}

/**
 * 「没翻」也是一种失败，而且是最坏的一种：它看起来像成功。
 *
 * 第五次故障的根因就在这里。模型把整段原样返回，而 `checkChunk` 只看结构 —— 结构完好，
 * 于是整段英文被判成「翻译成功」，界面说「其余已翻译」，用户看到满屏英文。
 * 结构对不等于翻过。
 */
function looksUntranslated(original, produced, targetLanguage) {
  const letters = letterCount(produced)
  if (original === produced) return letters >= 24
  if (!String(targetLanguage || '').toLowerCase().startsWith('zh')) return false
  // 目标是中文：整段没有一个汉字、却有成篇的拉丁字母，那就是没翻。
  return letters >= 24 && !CJK_PATTERN.test(produced)
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

/** 段内的标题层级序列。用来证明模型没有增删或升降标题。 */
export function headingLevelsOf(markdown) {
  return text(markdown)
    .split('\n')
    .map((line) => line.match(/^(#{1,6})\s+\S/))
    .filter(Boolean)
    .map((match) => match[1].length)
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
 *
 * 有了 mask/restore 之后，这条路径在实践中不再失败 —— 它留着当最后一道网：
 * 如果它真的报了 violation，说明掩码还原本身出了问题，那是必须看见的 bug。
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
  // 表格和标题一样是**结构**：单元格里的字该翻，行列不该动。整篇校验与分段校验用同一份
  // 解析器，所以「一段里画的表」和「整篇里画的表」是同一张表。
  const wantTables = tableSignature(source)
  const gotTables = tableSignature(translation)
  if (wantTables.length !== gotTables.length || wantTables.some((shape, index) => shape !== gotTables[index])) {
    push('table', `表格结构被改动（原文 ${wantTables.length} 张：${wantTables.join(' / ')}，译文 ${gotTables.length} 张：${gotTables.join(' / ')}）`)
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

/**
 * 把「必须逐字保留」的片段抽出来换成占位符。
 *
 * 抽取顺序有讲究：**先围栏**（它内部的行内代码、URL、路径都不该被单独抽出来），
 * 再 frontmatter 整块，最后才是正文里的行内代码、URL、路径。每一步都在上一步的产物上做，
 * 所以后面的规则看不见前面已经藏起来的内容。
 *
 * 返回 `{ masked, tokens }`，`restoreProtected(masked, tokens)` 是恒等还原。
 */
export function maskProtected(markdown) {
  const tokens = []
  const hide = (value) => {
    const index = tokens.length
    tokens.push(value)
    return placeholderFor(index)
  }

  let masked = text(markdown)

  // 1. 围栏整块（含围栏标记与语言标记）。用与 inspectTranslation 相同的围栏扫描逻辑，
  //    但这里需要原样切片，所以按行重建。
  {
    const lines = masked.split('\n')
    const out = []
    let open = null
    for (const line of lines) {
      const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
      if (open) {
        open.lines.push(line)
        const closes = marker && marker[1][0] === open.marker[0] && marker[1].length >= open.marker.length && marker[2].trim() === ''
        if (closes) {
          out.push(hide(open.lines.join('\n')))
          open = null
        }
        continue
      }
      if (marker) {
        open = { marker: marker[1], lines: [line] }
        continue
      }
      out.push(line)
    }
    if (open) out.push(hide(open.lines.join('\n')))
    masked = out.join('\n')
  }

  // 2. frontmatter 整块：字段名与值都不该被翻译。
  if (masked.startsWith('---')) {
    const end = masked.indexOf('\n---', 3)
    if (end !== -1) {
      const stop = masked.indexOf('\n', end + 1)
      const block = stop === -1 ? masked.slice(0, end + 4) : masked.slice(0, stop)
      masked = hide(block) + masked.slice(block.length)
    }
  }

  // 3. 行内代码、URL、路径 —— 长匹配优先，避免 URL 里的路径被单独抽走。
  masked = masked.replace(/`[^`\n]+`/g, (match) => hide(match))
  masked = masked.replace(/https?:\/\/[^\s)>\])]+/g, (match) => hide(match))
  masked = masked.replace(/(?:^|[\s("'])((?:\.{1,2}\/)?(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]{1,8})/g, (match, path) => {
    const at = match.lastIndexOf(path)
    return match.slice(0, at) + hide(path)
  })

  return { masked, tokens }
}

/** `maskProtected` 的逆运算。宽松匹配哨兵，容忍模型加的空格。 */
export function restoreProtected(masked, tokens = []) {
  return text(masked).replace(
    new RegExp(`${PLACEHOLDER_OPEN}\\s*(\\d+)\\s*${PLACEHOLDER_CLOSE}`, 'g'),
    (match, index) => {
      const token = tokens[Number(index)]
      return typeof token === 'string' ? token : match
    },
  )
}

/**
 * 把掩码后的正文切成若干段。切点在空行，**优先切在标题之前** ——
 * 段落边界落在标题与它的正文之间会让模型只看到半截结构。
 *
 * 原子形式 `{ text, sep }` 保证 `atoms.map(a => a.text + a.sep).join('')` 是恒等还原，
 * 所以「把每段译文按顺序拼回去」与「原文」逐字节对得上。
 */
export function chunkMasked(masked, budget = CHUNK_CHAR_BUDGET) {
  const source = text(masked)
  const atoms = []
  {
    let last = 0
    let match
    const re = /\n{2,}/g
    while ((match = re.exec(source))) {
      const body = source.slice(last, match.index)
      if (body.length) atoms.push({ text: body, sep: match[0] })
      else if (atoms.length) atoms[atoms.length - 1].sep += match[0]
      else atoms.push({ text: '', sep: match[0] })
      last = match.index + match[0].length
    }
    const tail = source.slice(last)
    if (tail.length) atoms.push({ text: tail, sep: '' })
    else if (atoms.length) atoms[atoms.length - 1].sep += tail
    else atoms.push({ text: '', sep: '' })
  }

  const chunks = []
  let current = []
  let size = 0
  for (const atom of atoms) {
    const length = atom.text.length + atom.sep.length
    const startsHeading = /^#{1,6}\s/.test(atom.text)
    // 超预算时收口；若当前原子是标题，且上一段已有内容，也优先在这里断开，
    // 让「标题 + 它的正文」尽量待在同一段里。
    if (current.length && (size + length > budget || (startsHeading && size > budget / 2))) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(atom)
    size += length
  }
  if (current.length) chunks.push(current)

  return chunks.map((list, index) => ({
    index,
    source: list.map((atom) => atom.text + atom.sep).join(''),
  }))
}

/**
 * 段级校验：占位符一个不少、标题一个不多不少，层级由原文钉回去。
 *
 * 围栏、URL、路径、行内代码在这个阶段已经不可能出问题（它们没发给模型），
 * 所以这里只查模型仍可能做错的两件事。
 *
 * 标题层级**不再是失败条件**。模型看到 `##` 之后直接跳 `####`，容易认为那是笔误、
 * "顺手修正"成 `###` —— 那是善意，而且层级本来不是它的活。§12.4 说结构来自原文，
 * 所以这里按顺序把层级还原成原文的，而不是为了一个 `#` 丢掉整段译文：
 * 一次真实故障里，一个 `####` 让 3302 字符（全文 79%）整段退回英文。
 */
export function checkChunk({ source, translation, tokens = [], targetLanguage = DEFAULT_TARGET_LANGUAGE } = {}) {
  const original = text(source)
  const translated = text(translation)
  if (!translated.trim()) return { ok: false, rule: 'empty', missing: [] }

  const missing = []
  for (let index = 0; index < tokens.length; index += 1) {
    const pattern = placeholderPattern(index)
    const before = (original.match(pattern) || []).length
    const after = (translated.match(pattern) || []).length
    if (before !== after) missing.push(index)
  }
  if (missing.length) return { ok: false, rule: 'placeholder', missing }

  // 结构没坏，但一个字都没翻 —— 这一条以前不存在，于是"原样返回"拿了满分。
  if (looksUntranslated(original.trim(), translated.trim(), targetLanguage)) {
    return { ok: false, rule: 'untranslated', missing: [] }
  }

  // 表格：单元格里的自然语言随便翻，**形状一格都不能动**。表头少一列、某行少一格、
  // 分隔行被模型"顺手整理"掉，都是结构损坏 —— 界面上会画出一张缺列的表，而人眼很难
  // 发现少的是哪一列。判定用的是和渲染器同一份解析器，所以"画得出来"与"校验得过"
  // 用的是同一张表的定义。
  const wantTables = tableSignature(original)
  const gotTables = tableSignature(translated)
  if (wantTables.length !== gotTables.length || wantTables.some((shape, index) => shape !== gotTables[index])) {
    return { ok: false, rule: 'table', missing: [] }
  }

  const want = headingLevelsOf(original)
  const got = headingLevelsOf(translated)
  // 数量对不上不能修：那意味着模型把标题吃成了段落，或者凭空造了一个。
  if (want.length !== got.length) return { ok: false, rule: 'heading', missing: [] }

  const aligned = alignHeadingLevels(translated, want)
  return { ok: true, rule: null, missing: [], translation: aligned, realigned: aligned !== translated }
}

/**
 * 按顺序把每个标题的 `#` 换成原文的层级。只动 `#`，不动标题文字 —— 文字是模型的活，
 * 层级不是。行数与标题数已经相等（调用方保证），所以按下标一一对上。
 */
export function alignHeadingLevels(markdown, levels = []) {
  let seen = 0
  return text(markdown).split('\n').map((line) => {
    const match = line.match(/^(#{1,6})(\s+)(\S.*)$/)
    if (!match) return line
    const level = levels[seen]
    seen += 1
    if (!level || level === match[1].length) return line
    return '#'.repeat(level) + match[2] + match[3]
  }).join('\n')
}

/**
 * 把一段切成两半，**保证 `left + right === source` 逐字节相等**。
 *
 * 只在空行上断：段落和标题都从行首开始，断在空行上就不会把一句话劈成两半，
 * 而空行本身留在左半边的尾巴上，`reanchorChunk` 会把它原样还回去。
 */
export function splitChunkSource(source) {
  const original = text(source)
  if (original.trim().length < 2) return null
  const middle = Math.floor(original.length / 2)
  let cut = original.indexOf('\n\n', middle)
  if (cut === -1) cut = original.lastIndexOf('\n\n', middle)
  if (cut === -1) return null
  cut += 2
  const left = original.slice(0, cut)
  const right = original.slice(cut)
  if (!left.trim() || !right.trim()) return null
  return [left, right]
}

/**
 * 段级提示词。与整篇版本的两处差别：明确告诉模型占位符是什么、要求原样放回原位。
 */
export function buildChunkSystemPrompt({ skillName, targetLanguage = DEFAULT_TARGET_LANGUAGE, index, total, attempt = 0 } = {}) {
  const name = text(skillName).trim()
  const rules = [
    `你是 Markdown 结构保持翻译器。把下面这段 Skill 定义（${name}）的第 ${index + 1}/${total} 段翻译成 ${targetLanguage}。`,
    '',
    '硬规则：',
    `1. 文中的 ${PLACEHOLDER_OPEN}0${PLACEHOLDER_CLOSE}、${PLACEHOLDER_OPEN}1${PLACEHOLDER_CLOSE} 这类记号是**已保护的片段**（代码块、行内代码、URL、文件路径）。必须逐字原样保留、数量不变、位置不乱，一个都不能丢，也不要翻译或改动它们。`,
    '2. 只翻译自然语言。不增加、不删除、不合并、不拆分任何段落。',
    '3. 不改变任何标题的层级与数量（# 的个数必须和原文一致）。',
    '4. Markdown 表格只翻译单元格里的文字：`|`、分隔行（`| --- |`）、列数、行数、每行的格数都必须逐字保持原样。',
    '5. 不添加解释、前言、后记，也不要把结果包进代码块。',
    '6. 只输出翻译后的 Markdown 本身。',
  ]
  if (attempt > 0) {
    // 重试必须说清楚上次错在哪，否则就是把同一句话再问一遍。真实故障里，
    // 模型把整段原样返回、结构完好，于是被判成"翻译成功"——第二次必须点名这件事。
    rules.push(
      '',
      '注意：上一次的回答没有通过校验。请重新翻译这一段的全部自然语言，',
      `必须输出 ${targetLanguage} 的译文，不要把原文原样返回；`,
      '同时逐字保留所有占位符、保持每一行的标题层级不变、表格的行列结构不变。'
    )
  }
  return rules.join('\n')
}

export function buildChunkMessages({ skillName, chunkSource, targetLanguage = DEFAULT_TARGET_LANGUAGE, index = 0, total = 1, attempt = 0 } = {}) {
  const body = text(chunkSource)
  if (!body.trim()) throw new Error('chunk 正文为空，无法翻译')
  return {
    system: buildChunkSystemPrompt({ skillName, targetLanguage, index, total, attempt }),
    // §20：翻译上下文只有定义正文。会话消息、工具输出、凭据都不进来。
    messages: [{ role: 'user', content: body }],
    targetLanguage,
  }
}

/**
 * 整篇版本的提示词（保留：单段文档仍走它，测试也钉着它）。
 */
export function buildTranslationMessages({ skillName, definitionText, targetLanguage = DEFAULT_TARGET_LANGUAGE } = {}) {
  const name = text(skillName).trim()
  const body = text(definitionText)
  if (!name) throw new Error('skillName 必填')
  if (!body.trim()) throw new Error('definition 正文为空，无法翻译')
  const system = [
    `你是 Markdown 结构保持翻译器。把下面这份 Skill 定义（${name}）翻译成 ${targetLanguage}。`,
    '',
    '硬规则：',
    `1. 只翻译自然语言。${PLACEHOLDER_OPEN}0${PLACEHOLDER_CLOSE} 这类记号是已保护的片段（代码块、行内代码、URL、文件路径），必须逐字原样保留、数量不变、位置不乱。`,
    '2. 不增加、不删除、不合并、不拆分任何段落。',
    '3. 不改变任何标题的层级与数量。',
    '4. Markdown 表格只翻译单元格里的文字：`|`、分隔行（`| --- |`）、列数、行数、每行的格数都必须逐字保持原样。',
    '5. 不添加解释、前言、后记，也不要把结果包进代码块。',
    '6. 只输出翻译后的 Markdown 本身。',
  ].join('\n')
  return {
    system,
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

/**
 * 每一段译文的**首尾空白按原文还原**。
 *
 * 这一条是 2026-10-01 的真实故障换来的：段与段之间的空行在 `chunkMasked` 里算作上一段的
 * 尾随空白，而模型几乎总会把它的输出 trim 掉。八段拼起来时，上一段的正文与下一段的
 * `## 标题` 粘成一行 —— `^#{1,6}\s` 不再匹配，**28 个标题变成 21 个**，最后那道整篇
 * 校验报 `heading`，用户看到的还是「这份翻译改动了文档结构，已丢弃。可以重试。」。
 *
 * 段级校验抓不到它：**每一段单独看都是对的，坏的是接头**。
 */
export function reanchorChunk({ source, translation } = {}) {
  const original = text(source)
  const produced = text(translation)
  if (!original.trim() || !produced.trim()) return original
  const lead = (original.match(/^\s*/) || [''])[0]
  const trail = (original.match(/\s*$/) || [''])[0]
  return lead + produced.replace(/^\s+/, '').replace(/\s+$/, '') + trail
}

/**
 * 分段翻译的**策略**部分，与 DSH 无关：`ask` 是注入的，所以真实的 `llm.stream` 与
 * 一个说假话的假模型走的是同一段代码。
 *
 * 这是这一版最重要的设计决定。beta.69 的翻译逻辑整块长在宿主里、必须连上真模型才能跑，
 * 于是「一次都没成功过」在单元测试里完全看不出来 —— 测试只测了 `inspectTranslation`
 * 正确性，而它一直是正确的。策略搬到这里之后，「模型毁了第 3 段」是一个可以在毫秒内
 * 复现的用例，而不是要等用户点三次才能发现的故障。
 */
export async function runSegmentedTranslation({
  definitionText,
  skillName,
  targetLanguage = DEFAULT_TARGET_LANGUAGE,
  ask,
  attempts = 2,
  chunkBudget = CHUNK_CHAR_BUDGET,
  maxSplitDepth = MAX_SPLIT_DEPTH,
} = {}) {
  if (typeof ask !== 'function') throw new Error('ask 必须是函数')
  const { masked, tokens } = maskProtected(definitionText)
  const chunks = chunkMasked(masked, chunkBudget)
  const stats = { realignedChunks: 0 }

  const translateLeaf = async (source, index, total, depth) => {
    // 为什么这一段最后回退了。界面要能说出原因 —— 「有 3 段没翻成」而不说为什么，
    // 用户只能靠猜；一次真实故障就是被这一句话盖住的。
    let lastRule = 'empty'
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let produced = ''
      try {
        produced = await ask({ chunk: { index, source }, index, total, attempt })
      } catch {
        produced = ''
      }
      const verdict = checkChunk({ source, translation: produced, tokens, targetLanguage })
      if (verdict.ok) {
        if (verdict.realigned) stats.realignedChunks += 1
        return { text: reanchorChunk({ source, translation: verdict.translation }), failed: false, rule: null }
      }
      lastRule = verdict.rule
    }

    // 这一段落败了。整段退回英文太贵：一次真实故障里，一个 `####` 让 3302 字符（全文 79%）
    // 退回英文，而它旁边那段 610 字符是好的。所以先劈成两半再试 —— 坏的那半继续往下劈，
    // 好的那半把译文留住。用户看到的是「有几处还是英文」，而不是「整篇没翻」。
    if (depth < maxSplitDepth) {
      const halves = splitChunkSource(source)
      if (halves) {
        const left = await translateLeaf(halves[0], index, total, depth + 1)
        const right = await translateLeaf(halves[1], index, total, depth + 1)
        return {
          text: left.text + right.text,
          failed: left.failed || right.failed,
          rule: left.failed ? left.rule : right.rule,
        }
      }
    }

    // 回退的是**掩码态**原文，稍后与其它段一起还原，所以围栏与路径仍然是逐字的。
    return { text: source, failed: true, rule: lastRule }
  }

  const pieces = []
  const fallbackIndexes = []
  const fallbackReasons = []

  for (const chunk of chunks) {
    const leaf = await translateLeaf(chunk.source, chunk.index, chunks.length, 0)
    pieces.push(leaf.text)
    if (leaf.failed) {
      fallbackIndexes.push(chunk.index)
      fallbackReasons.push({ index: chunk.index, rule: leaf.rule })
    }
  }

  return {
    translation: restoreProtected(pieces.join(''), tokens),
    chunkCount: chunks.length,
    fallbackChunks: fallbackIndexes.length,
    fallbackIndexes,
    fallbackReasons,
    realignedChunks: stats.realignedChunks,
    // 只算**最终**回退且原因是"没翻"的段落。重试过一次但后来翻好了的不算 ——
    // 这个数字是给人和探针看的诊断，不是重试计数。
    untouchedChunks: fallbackReasons.filter((entry) => entry.rule === 'untranslated').length,
  }
}

export const DEFAULT_TRANSLATION_LANGUAGE = DEFAULT_TARGET_LANGUAGE
