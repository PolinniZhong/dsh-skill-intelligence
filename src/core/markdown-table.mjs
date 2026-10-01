/**
 * GFM 表格的结构解析器 —— **一个解析器，两个读者**。
 *
 * 表格在 v0.5 之前会退化成一堆普通文本：`renderSkillMarkdown()` 只认标题、段落、列表、
 * 代码围栏和行内标记，于是 `| 参数 | 类型 |` 连着的三行被读成一个段落，人眼看到的是一串
 * 竖线。补上渲染是对的，但**不能各写一份**：渲染要的是「表头 / 对齐 / 每一格」，翻译校验要
 * 的是「几张表、几列、每行几格」—— 两边各自扫一遍行，迟早会在「什么算一张表」上分家，
 * 而分家的后果是界面画出五列表、校验只数到四列，两道防线同时失效。
 *
 * 所以规则住在这里：纯函数、无依赖、无 React、无 I/O。
 *
 * 它**只读结构，不读内容**：翻译后的单元格里必须是中文，这件事由语言判定管；这里只回答
 * 表格的形状有没有被改动。
 *
 * @module markdown-table
 */

/**
 * 分隔行：`| --- |`、`--- | ---`、`|:---|---:|:---:|`。
 *
 * 形状上允许没有竖线的 `---`，但那样的行在 Markdown 里是 setext 标题的下划线，不是表格。
 * 所以 `isTableDelimiter` 额外要求出现 `|` —— 单列表格写 `| a |` / `| --- |`，一样有竖线。
 */
const DELIMITER_PATTERN = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/

/** 一行是不是表格行。只要含一个竖线就算候选，真正的判定要连着下一行一起看。 */
export function isTableRow(line) {
  return typeof line === 'string' && line.includes('|') && line.trim().length > 0
}

/** 一行是不是分隔行（`| --- |`）。 */
export function isTableDelimiter(line) {
  if (typeof line !== 'string') return false
  const trimmed = line.trim()
  if (!trimmed || !trimmed.includes('|')) return false
  return DELIMITER_PATTERN.test(trimmed)
}

/**
 * 把一行拆成单元格。
 *
 * 去掉首尾的装饰性竖线（`\|` 结尾的不算装饰），`\|` 还原成字面竖线。**不 trim 之外不做任何
 * 加工**：行内标记留给渲染层，翻译校验也不需要读内容。
 */
export function splitTableRow(line) {
  let body = String(line ?? '').trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  const cells = []
  let current = ''
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]
    if (character === '\\' && body[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (character === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  cells.push(current.trim())
  return cells
}

/** 从分隔行读出每一列的对齐方式：`'left'` / `'center'` / `'right'` / `null`。 */
export function tableAlignments(line) {
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

/**
 * 从 `start` 行开始读一张表。
 *
 * 只有「表头行 + 分隔行」同时成立才算一张表 —— 这是 GFM 的规则，也是唯一能把表格和
 * 「正文里恰好有个竖线」区分开的规则。
 *
 * @returns `{ header, align, rows, columns, end }`，`end` 是表格之后的第一行；不是表格返回 `null`。
 */
export function parseTableAt(lines, start) {
  const list = Array.isArray(lines) ? lines : []
  if (!Number.isSafeInteger(start) || start < 0 || start + 1 >= list.length) return null
  if (!isTableRow(list[start]) || !isTableDelimiter(list[start + 1])) return null
  const header = splitTableRow(list[start])
  if (header.length === 0) return null
  const rows = []
  let index = start + 2
  while (index < list.length && isTableRow(list[index])) {
    rows.push(splitTableRow(list[index]))
    index += 1
  }
  return { header, align: tableAlignments(list[start + 1]), rows, columns: header.length, end: index }
}

/** 一张表的形状：列数 · 每列对齐 · 每行格数。内容不进来，一个字符都不进来。 */
function shapeOf(table) {
  const align = table.align.map((value) => (value ? value[0] : '-')).join('')
  const rows = table.rows.map((row) => row.length).join(',')
  return `${table.columns}|${align}|${rows}`
}

/**
 * 一份 Markdown 里所有表格的形状。
 *
 * 翻译校验拿它做**结构比对**：`['3|lcr|3,3']` 变成 `['2|lcr|3']` 就说明表头少了一列，
 * 翻译不通过、进重试。单元格里的自然语言怎么翻都行，形状必须逐字保持。
 *
 * 返回字符串数组而不是对象，是为了让比对本身就是 `!==`。
 */
export function tableSignature(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/)
  const shapes = []
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const table = parseTableAt(lines, index)
    if (!table) continue
    shapes.push(shapeOf(table))
    index = table.end - 1
  }
  return shapes
}
