import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTableRow, isTableDelimiter, splitTableRow, tableAlignments, parseTableAt, tableSignature,
} from '../src/core/markdown-table.mjs'

// 表格解析器有一个不寻常的性质：它同时是渲染器和翻译校验的依据。所以这一组用例分成两类 ——
// 「画得对不对」和「比得对不对」，而且**同一个输入必须同时让两边满意**。两边分家过一次：
// 渲染器按 `|` 切、校验按行数比，于是表头少一列时界面画得出来、校验却没发现。

const TABLE = [
  '| 参数 | 类型 | 说明 |',
  '| --- | --- | --- |',
  '| name | string | Skill 名称 |',
  '| path | string | 文件路径 |',
]

test('a header plus a delimiter makes a table, and nothing else does', () => {
  const table = parseTableAt(TABLE, 0)
  assert.equal(table.columns, 3, 'three columns come from the header')
  assert.deepEqual(table.header, ['参数', '类型', '说明'])
  assert.deepEqual(table.rows, [['name', 'string', 'Skill 名称'], ['path', 'string', '文件路径']])
  assert.equal(table.end, 4, 'the table ends at the first line that is not a row')

  // 分隔行是判定的全部依据。少了它，`| a | b |` 只是一段恰好带竖线的正文。
  assert.equal(parseTableAt(['| 参数 | 类型 |', '| name | string |'], 0), null, 'a header without a delimiter is prose')

  // setext 标题的 `---` 不能被当成单列表格的分隔行：它没有竖线。
  assert.equal(parseTableAt(['参数', '---'], 0), null, 'a setext underline is not a one-column delimiter')
  assert.equal(isTableDelimiter('---'), false, 'a bare --- is a setext underline, not a delimiter')
  assert.equal(isTableDelimiter('| --- |'), true, 'a one-column table still carries its pipe')
})

test('every alignment form is read, including the absent one', () => {
  assert.deepEqual(tableAlignments('| :--- | :---: | ---: | --- |'), ['left', 'center', 'right', null])
  assert.deepEqual(tableAlignments('|:--|--:|:-:'), ['left', 'right', 'center'])
  // 对齐只是样式：读不出来就当没有，不能因此让整张表不算表。
  assert.deepEqual(tableAlignments('| --- | x |'), [null, null])
})

test('a cell keeps its inline markup, and an escaped pipe is not a separator', () => {
  const table = parseTableAt([
    '| 参数 | 类型 |',
    '| --- | --- |',
    '| `name` | [string](https://example.com) |',
    '| a \\| b | c |',
  ], 0)
  assert.deepEqual(table.rows[0], ['`name`', '[string](https://example.com)'], 'inline markup survives to the renderer intact')
  assert.deepEqual(table.rows[1], ['a | b', 'c'], 'an escaped pipe stays inside its cell')
})

test('the leading and trailing pipes are decoration, not columns', () => {
  assert.deepEqual(splitTableRow('| a | b |'), ['a', 'b'])
  assert.deepEqual(splitTableRow('a | b'), ['a', 'b'], 'GFM allows the outer pipes to be omitted')
  assert.deepEqual(splitTableRow('| a | b'), ['a', 'b'])
  assert.deepEqual(splitTableRow('|  |  |'), ['', ''], 'two empty cells are still two cells')
  assert.equal(isTableRow('没有竖线'), false)
  assert.equal(isTableRow(''), false)
})

test('the shape is a signature, so a comparison is an inequality', () => {
  assert.deepEqual(tableSignature(TABLE.join('\n')), ['3|---|3,3'])
  assert.deepEqual(tableSignature([
    '| a | b | c |',
    '| :-- | :-: | --: |',
    '| 1 | 2 | 3 |',
  ].join('\n')), ['3|lcr|3'])

  // 三种损坏必须都能被看出来 —— 每一种都会让界面上少一列或错一行。
  const droppedColumn = tableSignature([
    '| 参数 | 类型 |',
    '| --- | --- |',
    '| name | string | Skill 名称 |',
  ].join('\n'))
  assert.notDeepEqual(droppedColumn, ['3|---|3,3'], 'a dropped header column changes the shape')

  const droppedCell = tableSignature([
    '| 参数 | 类型 | 说明 |',
    '| --- | --- | --- |',
    '| name | string |',
  ].join('\n'))
  assert.notDeepEqual(droppedCell, ['3|---|3,3'], 'a row that lost a cell changes the shape')

  const eatenDelimiter = tableSignature([
    '| 参数 | 类型 | 说明 |',
    '| name | string | Skill 名称 |',
  ].join('\n'))
  assert.deepEqual(eatenDelimiter, [], 'without its delimiter the table stops being a table at all')
})

test('a table does not swallow the blocks around it', () => {
  const lines = [
    '## 参数',
    '',
    '| 参数 | 类型 |',
    '| --- | --- |',
    '| name | string |',
    '',
    '表格之后是一段正文。',
    '',
    '```sh',
    'node scripts/build-client.mjs',
    '```',
  ]
  const table = parseTableAt(lines, 2)
  assert.equal(table.end, 5, 'the table stops at the blank line, leaving the paragraph for the renderer')
  assert.equal(lines[table.end], '', 'the paragraph is not eaten as a row')

  // 一份文档里有两张表时，两张都要被数出来 —— 只数第一张是这类扫描器最典型的漏。
  const two = tableSignature([
    '| a | b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '中间一段。',
    '',
    '| c | d | e |',
    '| --- | --- | --- |',
    '| 3 | 4 | 5 |',
  ].join('\n'))
  assert.deepEqual(two, ['2|--|2', '3|---|3'], 'one character per column: two columns hold two dashes')

  // 代码围栏里的一张"表"是代码，不是表格：围栏内容是正文，扫描器只看得到竖线。
  // 这一条记录的是**已知边界**而不是期望行为 —— 换行符在围栏里就该被当代码，
  // 而这里没有 fence 状态；所以断言的是"我们不假装它不存在"。
  const insideFence = tableSignature(['```md', '| a | b |', '| --- | --- |', '| 1 | 2 |', '```'].join('\n'))
  assert.deepEqual(insideFence, ['2|--|2'], 'a fenced table is counted; the renderer never reaches it because the fence branch runs first')
})
