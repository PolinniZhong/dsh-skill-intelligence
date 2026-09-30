import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Rules of Hooks，作为一条可机械判定的规则。
//
// 事故（0.4.0-beta.68）：`FlowCanvas` 与 `RuntimeView` 把 `const replay = React.useMemo(...)` 写在了
// `if (loading && !data) return ...` 之后。第一帧 loading 提前返回、少调一个 hook；数据到达后的
// 第二帧多调一个 hook，React 抛 #310（Rendered more hooks than during the previous render），
// `conversation.view` slot entry 崩溃卸载 —— 用户在真实 DSH 里看到的是「Skill 追踪标签页整片空白」。
//
// 为什么这一层必须存在：渲染台与 `client-render-smoke` 都只渲染"已经有数据"的那一帧（桩里的
// `useState` 不会更新，`loading` 永远到不了 `data`），所以没有一层会走到第二次渲染。
// 源码文本是这里唯一能表达该约束的东西，因此把规则写成扫描并且**给扫描本身写反例**。
const CLIENT = join(dirname(fileURLToPath(import.meta.url)), '../src/dsh/client/client.js')

/**
 * 扫描一个客户端源码字符串：同一组件内，第一个"提前 return"之后不允许再出现 React.use*。
 * @returns 违规描述数组，空数组表示合规。
 */
export function scanHookOrder(source) {
  const lines = String(source).split('\n')
  const indentOf = (line) => (line.match(/^ */) || [''])[0].length
  const offenders = []
  let current = null
  let firstReturn = 0
  let lastHook = 0
  const flush = () => {
    if (current && firstReturn && lastHook > firstReturn) {
      offenders.push(`${current}（提前 return 在第 ${firstReturn} 行，hook 在第 ${lastHook} 行）`)
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]
    const indent = indentOf(text)
    const body = text.trim()
    if (indent === 2 && (/^function [A-Z]/.test(body) || /^const [A-Z]/.test(body))) {
      flush()
      current = /^function/.test(body) ? body.slice(9).split('(')[0] : body.slice(6).split(' ')[0]
      firstReturn = 0
      lastHook = 0
      continue
    }
    if (!current) continue
    if (indent === 0 && body.length) { flush(); current = null; continue }
    if (indent !== 4) continue
    // 两种提前 return 写法：单行 `if (...) return ...`，以及 `if (...) {` 换行后 `return`。
    const oneLine = /^return\b/.test(body) || /^if \(.*\)\s+return\b/.test(body)
    const blockForm = /^if \(.*\)\s*\{?\s*$/.test(body)
      && lines[index + 1]
      && indentOf(lines[index + 1]) === 6
      && /^return\b/.test(lines[index + 1].trim())
    if (oneLine || blockForm) firstReturn = firstReturn || index + 1
    if (/React\.use[A-Z]/.test(body)) lastHook = index + 1
  }
  flush()
  return offenders
}

test('no client component calls a hook after an early return', () => {
  const offenders = scanHookOrder(readFileSync(CLIENT, 'utf8'))
  assert.deepEqual(offenders, [], `hook 排在提前 return 之后会让 React 抛 #310 并让整个 slot 白屏：${offenders.join('; ')}`)
})

test('the scan actually catches the shape it is written for', () => {
  // 反例必须是 0.4.0-beta.68 的真实形状：单行 `if (...) return ...`，且 hook 在它下面。
  const buggy = [
    '  function FlowCanvas({ data, loading }) {',
    '    const [open, setOpen] = React.useState(true)',
    '    const layout = React.useMemo(() => data?.layout ?? null, [data])',
    '    if (loading && !data) return h(TraceState, { kind: \'loading\' })',
    '    if (!data) return h(TraceState, { kind: \'empty\' })',
    '    const replay = React.useMemo(() => null, [])',
    '    return h(\'div\', null)',
    '  }',
  ].join('\n')
  assert.equal(scanHookOrder(buggy).length, 1)

  // 花括号换行的写法同样要被抓到。
  const blockForm = [
    '  function RuntimeView({ data, loading }) {',
    '    const [open, setOpen] = React.useState(true)',
    '    if (loading && !data) {',
    '      return h(TraceState, { kind: \'loading\' })',
    '    }',
    '    const replay = React.useMemo(() => null, [])',
    '    return h(\'div\', null)',
    '  }',
  ].join('\n')
  assert.equal(scanHookOrder(blockForm).length, 1)

  // 合规形状：所有 hook 都在 return 之前（这正是修复后的写法）。
  const fixed = [
    '  function FlowCanvas({ data, loading }) {',
    '    const [open, setOpen] = React.useState(true)',
    '    const replay = React.useMemo(() => null, [])',
    '    if (loading && !data) return h(TraceState, { kind: \'loading\' })',
    '    if (!data) return h(TraceState, { kind: \'empty\' })',
    '    return h(\'div\', null)',
    '  }',
  ].join('\n')
  assert.deepEqual(scanHookOrder(fixed), [])
})
