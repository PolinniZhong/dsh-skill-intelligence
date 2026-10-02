/**
 * Skill 差异（diff）的纯函数层：结构、内容、资源三层的**确定性**比较。
 *
 * ## 这一层只陈述事实，不做判断
 *
 * 它回答「哪一节多了、哪一行改了、哪个文件不一样了」，**不回答**「哪个版本更好」。
 * 没有模型参与，没有相似度打分，没有「建议保留」。返回的模型里不许出现 score / rank /
 * quality / percent 一类键，界面上的词也只有一个闭集（`DIFF_WORDS`，见 `FR-EVO-012` /
 * `FR-EVO-014`）。这不是保守，是因为「哪个版本更好」根本无从证明 —— 一旦说了，用户就会
 * 当成结论。
 *
 * ## 比较的基准是「两侧现在长什么样」
 *
 * 不保存任何正文快照：两边都在比较的这一刻从文件系统读出来。来源那一侧的**当初**指纹
 * （`sourceOriginalSha256`，来自血缘记录）与**现在**的指纹一起返回，好让界面能说出
 * 「来源内容已发生变化」——因为来源一变，差异就不再等价于「你改了什么」（`FR-EVO-013`）。
 *
 * ## 三条实现上的坑（踩过才知道）
 *
 * 1. 两侧必须各传**自己的** `summary`，或者都传 `null`。`buildSkillFramework` 在没有
 *    trigger 小节时会拿 registry 的描述合成一节；两边共用一个 summary 会凭空造出一节
 *    不存在的差异。
 * 2. 两侧都要自己调 `buildDefinitionOutline` —— `buildSkillFramework` 只**消费** outline，
 *    不会替谁建一份。漏了就会得到「没有任何小节」的假结论。
 * 3. `SKILL.md` 正文归**内容层**比较，不进资源层。资源层列的是 references / scripts 这类
 *    附带文件，同一个改动不该在两个页签里各说一遍。
 *
 * @module skill-diff
 */

import { buildDefinitionOutline } from './definition-outline.mjs'
import { buildSkillFramework } from './skill-framework.mjs'
import { CLONE_MODES } from './skill-clone.mjs'

export const SKILL_DIFF_SCHEMA_VERSION = 1

/** 三个页签。顺序即界面顺序。 */
export const DIFF_LAYERS = Object.freeze(['structure', 'content', 'resources'])

/** 一次比较的总体状态。`unavailable` 是「读不到」，不是「没有变化」。 */
export const DIFF_STATUS = Object.freeze(['unchanged', 'changed', 'unavailable'])

/** 单项变化的种类。界面上的词只有这四个。 */
export const DIFF_CHANGE_KINDS = Object.freeze(['added', 'removed', 'modified', 'unchanged'])

/** 事实陈述的闭集词表。加词之前先读 `FR-EVO-014` 的禁用清单。 */
export const DIFF_WORDS = Object.freeze({
  added: '新增',
  removed: '删除',
  modified: '修改',
  unchanged: '保持不变',
  unavailable: '无法比较',
})

/** 来源指纹的两种说法。**不含**「已过期」「落后」这类带判断的词。 */
export const DIFF_SOURCE_WORDS = Object.freeze({
  unchanged: '来源内容未发生变化',
  changed: '来源内容已发生变化',
  unavailable: '无法读取来源',
})

/** 读不到来源时唯一允许的那句话。界面与宿主都从这里取，免得两处写岔。 */
export const DIFF_UNAVAILABLE_MESSAGE = '当前无法读取来源 Skill，无法完成差异比较。'

/** 最多比较这么多小节。Skill 正文是散文，不是文档树。 */
export const DIFF_SECTION_LIMIT = 120

/** 每个小节最多吐出这么多差异行。 */
export const DIFF_LINE_LIMIT = 240

/** 资源条目上限。 */
export const DIFF_RESOURCE_LIMIT = 200

/** LCS 表的格子预算。超了就诚实地说这段比不了，而不是猜。 */
const DIFF_CELL_LIMIT = 240000

/** 比较受限的原因。闭集 —— 界面上不会出现没登记过的托词。 */
export const DIFF_LIMITATIONS = Object.freeze({
  sourceUnavailable: 'source-unavailable',
  targetUnavailable: 'target-unavailable',
  sectionsTruncated: 'section-list-truncated',
  sectionTooLarge: 'section-too-large-to-compare-line-by-line',
  linesTruncated: 'diff-lines-truncated',
  resourcesTruncated: 'resource-list-truncated',
  skillMdCloneHasNoResources: 'resources-not-copied-by-skill-md-clone',
  bundleTruncation: 'resource-differences-may-come-from-a-truncated-clone',
  modeUnknown: 'clone-mode-unknown-for-this-comparison',
})

/**
 * 差异路由自己的错误码。与 `CLONE_ERROR` 分开：复刻会写盘、差异只读，
 * 同一句「来源变了」在两条路上是完全不同的意思 —— 复刻要拒绝，差异要照常回答。
 */
export const DIFF_ERROR = Object.freeze({
  INVALID_REQUEST: 'invalid-request',
  NO_LINEAGE: 'no-lineage',
  UNKNOWN_SKILL: 'unknown-skill',
  DIFF_FAILED: 'diff-failed',
})

/**
 * 读一侧的输入，缺正文就当作读不到。
 *
 * @param side - `{ skillName, content, summary?, files?, sha256?, reason? }`。
 * @returns 归一化后的一侧，或 `null`。
 */
function readSide(side) {
  if (!side || typeof side !== 'object') return null
  if (typeof side.content !== 'string') return null
  return {
    skillName: typeof side.skillName === 'string' ? side.skillName : null,
    content: side.content,
    summary: side.summary && typeof side.summary === 'object' ? side.summary : null,
    files: Array.isArray(side.files) ? side.files : [],
    sha256: typeof side.sha256 === 'string' ? side.sha256 : null,
    reason: typeof side.reason === 'string' ? side.reason : null,
  }
}

/** 空的一层。读不到东西时用它，绝不退化成一堆 `unchanged`。 */
function emptyLayer(status, limitations = []) {
  return { status, counts: { added: 0, removed: 0, modified: 0, unchanged: 0 }, sections: [], limitations }
}

/**
 * 两侧的小节列表。每一侧都自己建 outline，见模块头的坑 2。
 */
function sectionsOf(read) {
  const outline = buildDefinitionOutline(read.content)
  const framework = buildSkillFramework({
    content: read.content,
    outline: outline.entries,
    summary: read.summary,
    truncated: outline.truncated,
  })
  // 只留正文里真实存在的小节。`framework:trigger` 是拿 registry 描述合成的一节，没有行号；
  // 它不是文件里的结构，把它算进来就等于比较了两个都不在文档里的东西。
  const sections = framework.sections.filter((section) => Number.isSafeInteger(section.line))
  return { lines: read.content.split('\n'), sections: sections.slice(0, DIFF_SECTION_LIMIT), truncated: sections.length > DIFF_SECTION_LIMIT }
}

/**
 * 两侧小节按「标题（第几次出现）」配对。
 *
 * 配对的键是标题而不是行号：行号一改就全错位，用户会看到整篇被改成新的一篇。同名小节
 * 按出现次序配对，所以「第二个『规则』小节」不会跟「第一个」互换。
 */
function pairSections(sourceSections, targetSections) {
  const keysOf = (sections) => {
    const seen = new Map()
    return sections.map((section) => {
      const title = typeof section.title === 'string' && section.title ? section.title : `#${section.line}`
      const count = seen.get(title) ?? 0
      seen.set(title, count + 1)
      return count === 0 ? title : `${title}\u0000${count + 1}`
    })
  }
  const sourceKeys = keysOf(sourceSections)
  const targetKeys = keysOf(targetSections)
  const sourceByKey = new Map(sourceKeys.map((key, index) => [key, index]))
  const targetByKey = new Map(targetKeys.map((key, index) => [key, index]))

  const pairs = []
  const used = new Set()
  targetKeys.forEach((key, index) => {
    const sourceIndex = sourceByKey.get(key)
    if (sourceIndex === undefined) {
      pairs.push({ key, status: 'added', source: null, target: targetSections[index] })
      return
    }
    used.add(key)
    pairs.push({ key, status: null, source: sourceSections[sourceIndex], target: targetSections[index] })
  })
  sourceKeys.forEach((key, index) => {
    if (used.has(key) || targetByKey.has(key)) return
    pairs.push({ key, status: 'removed', source: sourceSections[index], target: null })
  })
  return pairs
}

/**
 * 一节的正文行区间（含标题行，含到下一节标题的前一行）。
 *
 * @param sections - 已按行号排好的小节列表。
 * @param lineCount - 整个文件的行数。
 * @param index - 这一节在列表里的位置。
 * @returns `[firstLine, lastLine]`，1 基，闭区间。
 */
function rangeOf(sections, lineCount, index) {
  const first = sections[index].line
  const next = index + 1 < sections.length ? sections[index + 1].line - 1 : lineCount
  return [first, Math.max(first, next)]
}

/**
 * 取某一节的正文行（含标题行）。
 *
 * @param view - `sectionsOf` 的结果。
 * @param index - 这一节在 `view.sections` 里的位置；`undefined` 表示另一侧没有这一节。
 * @returns `{ lines, start }`；`start` 是这一段第一行在文件里的 1 基行号，用来把差异行号
 *   换算回**文件里的绝对行号** —— 界面点一行要能跳到 `SKILL.md` 的对应位置。
 */
function bodyOf(view, index) {
  if (index === undefined) return { lines: [], start: 1 }
  const [first, last] = rangeOf(view.sections, view.lines.length, index)
  return { lines: trimTail(view.lines.slice(first - 1, last)), start: first }
}

/** 逐行归一：去掉行尾空白。除此之外一个字都不动 —— 比较不是清洗。 */
function trimTail(lines) {
  const out = lines.map((line) => (typeof line === 'string' ? line.replace(/\s+$/, '') : ''))
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

/**
 * 两段文本的逐行差异（LCS）。
 *
 * @returns `{ lines, truncated }`，或 `null` 表示这段太大、算不动（调用方如实标注）。
 */
function diffLines(sourceLines, targetLines) {
  const n = sourceLines.length
  const m = targetLines.length
  if (n === 0 && m === 0) return { lines: [], truncated: false }
  if (n === 0) {
    return { lines: targetLines.map((text, index) => ({ kind: 'added', text, sourceLine: null, targetLine: index + 1 })), truncated: false }
  }
  if (m === 0) {
    return { lines: sourceLines.map((text, index) => ({ kind: 'removed', text, sourceLine: index + 1, targetLine: null })), truncated: false }
  }
  if (n * m > DIFF_CELL_LIMIT) return null

  const width = m + 1
  const table = new Int32Array((n + 1) * width)
  const at = (i, j) => i * width + j
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[at(i, j)] = sourceLines[i] === targetLines[j]
        ? table[at(i + 1, j + 1)] + 1
        : Math.max(table[at(i + 1, j)], table[at(i, j + 1)])
    }
  }

  const lines = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (sourceLines[i] === targetLines[j]) {
      lines.push({ kind: 'unchanged', text: sourceLines[i], sourceLine: i + 1, targetLine: j + 1 })
      i += 1
      j += 1
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      lines.push({ kind: 'removed', text: sourceLines[i], sourceLine: i + 1, targetLine: null })
      i += 1
    } else {
      lines.push({ kind: 'added', text: targetLines[j], sourceLine: null, targetLine: j + 1 })
      j += 1
    }
  }
  while (i < n) {
    lines.push({ kind: 'removed', text: sourceLines[i], sourceLine: i + 1, targetLine: null })
    i += 1
  }
  while (j < m) {
    lines.push({ kind: 'added', text: targetLines[j], sourceLine: null, targetLine: j + 1 })
    j += 1
  }
  const truncated = lines.length > DIFF_LINE_LIMIT
  return { lines: truncated ? lines.slice(0, DIFF_LINE_LIMIT) : lines, truncated }
}

/** 结构层的形状差异：层级、角色、各类计数。正文归内容层，这里不比。 */
const SHAPE_FIELDS = Object.freeze([
  ['level', (section) => section.level],
  ['role', (section) => section.role ?? null],
  ['items', (section) => section.itemCount],
  ['tables', (section) => section.tables],
  ['codeBlocks', (section) => section.codeBlocks],
  ['links', (section) => section.linkCount],
  ['children', (section) => section.childCount],
])

/**
 * 结构差异能用的名字，闭集。`presence` 表示这一节只存在于一侧。
 *
 * 表驱动而不是一排 `if`：名字集合是从同一张表里长出来的，测试和守卫可以拿它当权威，
 * 不会出现「加了新维度但词表没跟上」。
 */
export const DIFF_SHAPE_FIELDS = Object.freeze(['presence', ...SHAPE_FIELDS.map(([name]) => name)])

function structuralChanges(source, target) {
  return SHAPE_FIELDS.filter(([, read]) => read(source) !== read(target)).map(([name]) => name)
}

function tally(entries) {
  const counts = { added: 0, removed: 0, modified: 0, unchanged: 0 }
  for (const entry of entries) counts[entry.status] += 1
  return counts
}

/**
 * 资源层的条目。`SKILL.md` 不进这一层（见模块头的坑 3）。
 *
 * `skill-md` 模式只复制了 SKILL.md，所以「来源有、副本没有」的文件**不是被删掉的** ——
 * 它们本来就没被复制过来。这种情况下列出来就是一句假话，所以直接不列，另附一句说明。
 */
function resourceEntries(sourceFiles, targetFiles, mode, limitations) {
  const byPath = (files) => {
    const map = new Map()
    for (const file of files) {
      if (!file || typeof file.path !== 'string' || !file.path) continue
      if (/(^|\/)skill\.md$/i.test(file.path)) continue
      map.set(file.path, typeof file.sha256 === 'string' ? file.sha256 : null)
    }
    return map
  }
  const source = byPath(sourceFiles)
  const target = byPath(targetFiles)
  const skillMdOnly = mode === 'skill-md'
  // 不知道当初是整包复刻还是只抄了 SKILL.md 时（跟别的血缘节点比），资源差异说不清来历。
  // 说清楚「不知道」，而不是让读者以为每个「删除」都是自己动手删的。
  const modeUnknown = mode !== 'skill-md' && mode !== 'bundle'
  if (skillMdOnly) limitations.push(DIFF_LIMITATIONS.skillMdCloneHasNoResources)

  const entries = []
  let missingFromTarget = false
  const paths = [...new Set([...target.keys(), ...source.keys()])].sort()
  for (const path of paths) {
    const inSource = source.has(path)
    const inTarget = target.has(path)
    if (inSource && inTarget) {
      entries.push({
        path,
        status: source.get(path) !== null && source.get(path) === target.get(path) ? 'unchanged' : 'modified',
        sourceSha256: source.get(path),
        targetSha256: target.get(path),
      })
      continue
    }
    if (inTarget) {
      entries.push({ path, status: 'added', sourceSha256: null, targetSha256: target.get(path) })
      continue
    }
    // 来源有、副本没有。`skill-md` 副本里"没有"是**本来就没有**，不是被删了。
    if (skillMdOnly) continue
    missingFromTarget = true
    entries.push({ path, status: 'removed', sourceSha256: source.get(path), targetSha256: null })
  }

  // 「来源有、副本没有」这一条在 bundle 下有两种来历：用户删了它，或者复刻当时就因限额没拷。
  // 血缘里没记当初截断没有，所以两种可能都得说 —— 只报其中一种就是替用户下结论。
  if (missingFromTarget && mode === 'bundle') limitations.push(DIFF_LIMITATIONS.bundleTruncation)
  if (missingFromTarget && modeUnknown) limitations.push(DIFF_LIMITATIONS.modeUnknown)

  const truncated = entries.length > DIFF_RESOURCE_LIMIT
  if (truncated) limitations.push(DIFF_LIMITATIONS.resourcesTruncated)
  return truncated ? entries.slice(0, DIFF_RESOURCE_LIMIT) : entries
}

/**
 * 比较两个 Skill 的当前定义。
 *
 * @param options.source - `{ skillName, content, summary, files, sha256, reason }`；读不到就传 `null` 或带 `reason`。
 * @param options.target - 同上，另一侧。
 * @param options.sourceOriginalSha256 - 血缘记录里当初复制的那一版指纹，用来判断来源是否已经变化。
 * @param options.cloneMode - `bundle` / `skill-md`，来自血缘记录；资源差异靠它解释。
 * @returns 一个纯数据的差异模型，可以直接 JSON 序列化。
 */
export function buildSkillDiff(options = {}) {
  const limitations = []
  const sourceRead = readSide(options.source)
  const targetRead = readSide(options.target)
  const cloneMode = CLONE_MODES.includes(options.cloneMode) ? options.cloneMode : null
  const original = typeof options.sourceOriginalSha256 === 'string' ? options.sourceOriginalSha256 : null

  if (!sourceRead) limitations.push(DIFF_LIMITATIONS.sourceUnavailable)
  if (!targetRead) limitations.push(DIFF_LIMITATIONS.targetUnavailable)

  const sourceSha = sourceRead?.sha256 ?? null
  const sourceChanged = original !== null && sourceSha !== null ? original !== sourceSha : null

  const comparison = {
    status: 'unavailable',
    source: {
      skillName: sourceRead?.skillName ?? options.source?.skillName ?? null,
      available: sourceRead !== null,
      reason: sourceRead ? null : (options.source?.reason ?? DIFF_LIMITATIONS.sourceUnavailable),
      originalSha256: original,
      currentSha256: sourceSha,
      changed: sourceChanged,
    },
    target: {
      skillName: targetRead?.skillName ?? options.target?.skillName ?? null,
      available: targetRead !== null,
      reason: targetRead ? null : (options.target?.reason ?? DIFF_LIMITATIONS.targetUnavailable),
      currentSha256: targetRead?.sha256 ?? null,
    },
    limitations,
  }

  // 读不到任何一侧就不比较。**绝不**把读不到说成「没有变化」。
  if (!sourceRead || !targetRead) {
    return {
      schemaVersion: SKILL_DIFF_SCHEMA_VERSION,
      comparison,
      structure: emptyLayer('unavailable'),
      content: { ...emptyLayer('unavailable'), sections: [] },
      resources: { status: 'unavailable', mode: cloneMode, counts: { added: 0, removed: 0, modified: 0, unchanged: 0 }, entries: [], limitations: [] },
    }
  }

  const sourceView = sectionsOf(sourceRead)
  const targetView = sectionsOf(targetRead)
  if (sourceView.truncated || targetView.truncated) limitations.push(DIFF_LIMITATIONS.sectionsTruncated)

  const sameContent = sourceRead.content === targetRead.content
  const pairs = pairSections(sourceView.sections, targetView.sections)
  const sourceIndexByLine = new Map(sourceView.sections.map((section, index) => [section.line, index]))
  const targetIndexByLine = new Map(targetView.sections.map((section, index) => [section.line, index]))

  const structureSections = []
  const contentSections = []
  const contentLimitations = []

  for (const pair of pairs) {
    const source = pair.source
    const target = pair.target
    const anchorId = target?.anchorId ?? source?.anchorId ?? null
    const side = target ? 'target' : 'source'
    const changed = source && target ? structuralChanges(source, target) : (pair.status === 'unchanged' ? [] : ['presence'])
    const status = pair.status ?? (changed.length > 0 ? 'modified' : 'unchanged')

    structureSections.push({
      title: (target ?? source)?.title ?? null,
      level: (target ?? source)?.level ?? null,
      role: (target ?? source)?.role ?? null,
      status,
      changed,
      anchorId,
      side,
      sourceLine: source?.line ?? null,
      targetLine: target?.line ?? null,
    })

    const sourceBody = bodyOf(sourceView, source ? sourceIndexByLine.get(source.line) : undefined)
    const targetBody = bodyOf(targetView, target ? targetIndexByLine.get(target.line) : undefined)
    const sourceLines = sourceBody.lines
    const targetLines = targetBody.lines
    // 差异行号是段内相对的；换回文件里的绝对行号，界面才能拿它去锚。
    const absolute = (diffLinesOut) => diffLinesOut.map((line) => ({
      ...line,
      sourceLine: line.sourceLine === null ? null : line.sourceLine + sourceBody.start - 1,
      targetLine: line.targetLine === null ? null : line.targetLine + targetBody.start - 1,
    }))

    let lines = []
    let linesTruncated = false
    let lineStatus = status
    const identical = sameContent || (sourceLines.join('\n') === targetLines.join('\n'))
    if (identical) {
      // 只有一侧有这一节时，空小节在文字层确实「没有变化」；有内容的那一侧按 added/removed 说。
      lines = []
      lineStatus = pair.status && (sourceLines.length > 0 || targetLines.length > 0) ? pair.status : 'unchanged'
    } else {
      const diff = diffLines(sourceLines, targetLines)
      if (diff === null) {
        contentLimitations.push(DIFF_LIMITATIONS.sectionTooLarge)
        lineStatus = 'modified'
      } else {
        lines = absolute(diff.lines)
        linesTruncated = diff.truncated
        if (diff.truncated) contentLimitations.push(DIFF_LIMITATIONS.linesTruncated)
        lineStatus = diff.lines.some((line) => line.kind !== 'unchanged') ? 'modified' : 'unchanged'
        if (lineStatus === 'modified' && pair.status) lineStatus = pair.status
      }
    }

    contentSections.push({
      title: (target ?? source)?.title ?? null,
      status: lineStatus,
      anchorId,
      side,
      sourceLine: source?.line ?? null,
      targetLine: target?.line ?? null,
      sourceLineCount: sourceLines.length,
      targetLineCount: targetLines.length,
      lines,
      linesTruncated,
    })
  }

  const structureCounts = tally(structureSections)
  const contentCounts = tally(contentSections)
  const resources = resourceEntries(sourceRead.files, targetRead.files, cloneMode, limitations)
  const resourceCounts = tally(resources)

  const structure = {
    status: structureSections.some((section) => section.status !== 'unchanged') ? 'changed' : 'unchanged',
    counts: structureCounts,
    sections: structureSections,
    sectionCount: structureSections.length,
  }
  const content = {
    status: contentSections.some((section) => section.status !== 'unchanged') ? 'changed' : 'unchanged',
    counts: contentCounts,
    sections: contentSections,
    limitations: [...new Set(contentLimitations)],
  }
  const resourceLayer = {
    status: resources.some((entry) => entry.status !== 'unchanged') ? 'changed' : 'unchanged',
    mode: cloneMode,
    counts: resourceCounts,
    entries: resources,
  }

  comparison.status = structure.status === 'unchanged' && content.status === 'unchanged' && resourceLayer.status === 'unchanged'
    ? 'unchanged'
    : 'changed'

  return {
    schemaVersion: SKILL_DIFF_SCHEMA_VERSION,
    comparison,
    structure,
    content,
    resources: resourceLayer,
  }
}
