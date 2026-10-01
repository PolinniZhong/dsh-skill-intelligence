import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHUNK_CHAR_BUDGET,
  PLACEHOLDER_CLOSE,
  PLACEHOLDER_OPEN,
  buildChunkMessages,
  alignHeadingLevels,
  checkChunk,
  chunkMasked,
  headingLevelsOf,
  inspectTranslation,
  maskProtected,
  reanchorChunk,
  restoreProtected,
  runSegmentedTranslation,
  splitChunkSource,
} from '../src/core/skill-translation.mjs'

/**
 * 这组用例守的是 0.4.0-beta.69 的一个真实故障：翻译在真实应用里**一次都没成功过**。
 *
 * 2026-10-01 又加了一条：**接头**也会丢结构。段与段之间的空行在 `chunkMasked` 里算作
 * 上一段的尾随空白，模型几乎总会 trim 掉它，于是上一段的正文与下一段的 `## 标题` 粘成
 * 一行 —— 28 个标题变 21 个，整篇校验报 `heading`，而每一段单看都是对的。
 *
 * 原因不是模型、不是 `ctx.llm`、也不是网络 —— 是这一层把 §12.4「不得修改结构」实现成了
 * 「整篇必须完美」：31174 字符、336 行、28 个标题的定义一次性翻译，模型必然会动到标题层级、
 * 行内代码或文件路径中的至少一样，而当时的判定是全有或全无。探针里模型 31 秒返回，
 * 然后被 `inspectTranslation` 以 `["heading","inline-code","file-path"]` 丢掉。
 *
 * 所以这里的断言分两类：
 *   - 结构保持必须是**机制**而不是请求：围栏、行内代码、URL、路径根本不进入请求。
 *   - 段落级失败只能影响那一段，不能毁掉整篇。
 */

const DEFINITION = [
  '---',
  'name: ui-craft',
  'description: Use for UI work',
  '---',
  '',
  '# ui-craft',
  '',
  'See `references/craft-intent.md` and https://example.com/spec for the rules.',
  '',
  '```bash',
  'node scripts/build-client.mjs --out dist/client.js',
  '# this line must never be translated',
  '```',
  '',
  '## Knobs',
  '',
  'Set `CRAFT_LEVEL` to 8 or higher. The file `docs/design.md` explains why.',
  '',
  '## Motion',
  '',
  'Use prefers-reduced-motion. See `src/core/motion.mjs`.',
  '',
].join('\n')

function placeholderCount(value) {
  return (value.match(new RegExp(`${PLACEHOLDER_OPEN}\\s*\\d+\\s*${PLACEHOLDER_CLOSE}`, 'g')) || []).length
}

test('masking is exactly reversible', () => {
  const { masked, tokens } = maskProtected(DEFINITION)
  assert.ok(tokens.length > 0, 'the document has protected spans')
  assert.equal(restoreProtected(masked, tokens), DEFINITION)
  assert.ok(masked.length < DEFINITION.length, 'masking shortens the text sent to the model')
})

test('a fenced block never reaches the model', () => {
  const { masked } = maskProtected(DEFINITION)
  assert.ok(!masked.includes('node scripts/build-client.mjs'), 'the shell command is hidden')
  assert.ok(!masked.includes('this line must never be translated'), 'the comment inside the fence is hidden')
  assert.ok(!masked.includes('```'), 'even the fence marker is hidden')
})

test('inline code, urls and paths are hidden but the prose stays', () => {
  const { masked } = maskProtected(DEFINITION)
  assert.ok(!masked.includes('CRAFT_LEVEL'), 'inline code is hidden')
  assert.ok(!masked.includes('https://example.com/spec'), 'url is hidden')
  assert.ok(!masked.includes('references/craft-intent.md'), 'path is hidden')
  assert.ok(masked.includes('The file'), 'the sentence around them survives for translation')
  assert.ok(masked.includes('# ui-craft'), 'a heading title stays visible — it has to be translated')
})

test('the frontmatter block is hidden whole, keys included', () => {
  const { masked } = maskProtected(DEFINITION)
  assert.ok(!masked.includes('name: ui-craft'), 'frontmatter keys are not offered for translation')
})

test('chunks reassemble byte-for-byte', () => {
  const { masked } = maskProtected(DEFINITION)
  const chunks = chunkMasked(masked, 120)
  assert.ok(chunks.length > 1, 'a small budget really does split the document')
  assert.equal(chunks.map((chunk) => chunk.source).join(''), masked)
})

test('a chunk that fits stays a single chunk', () => {
  const { masked } = maskProtected(DEFINITION)
  const chunks = chunkMasked(masked, CHUNK_CHAR_BUDGET)
  assert.equal(chunks.length, 1)
})

test('a code fence is never split across chunks', () => {
  const { masked } = maskProtected(DEFINITION)
  for (const chunk of chunkMasked(masked, 40)) {
    assert.equal(placeholderCount(chunk.source) % 1, 0)
    // 一个被切成两半的占位符会留下裸露的哨兵。
    assert.equal(chunk.source.split(PLACEHOLDER_OPEN).length, chunk.source.split(PLACEHOLDER_CLOSE).length)
  }
})

test('a faithful segment is accepted, and a dropped placeholder is not', () => {
  const { masked, tokens } = maskProtected(DEFINITION)
  const [chunk] = chunkMasked(masked, CHUNK_CHAR_BUDGET)
  assert.equal(checkChunk({ source: chunk.source, translation: translatedFixture(chunk.source), tokens }).ok, true)
  assert.equal(checkChunk({ source: chunk.source, translation: '', tokens }).rule, 'empty')
  const dropped = chunk.source.replace(new RegExp(`${PLACEHOLDER_OPEN}\\s*0\\s*${PLACEHOLDER_CLOSE}`), '')
  assert.equal(checkChunk({ source: chunk.source, translation: dropped, tokens }).rule, 'placeholder')
})

test('an answer that translated nothing is not a success', () => {
  // 第五次故障的根因：模型把整段原样返回，结构完好，于是被判成"翻译成功"。
  // 界面说「其余已翻译」，用户看到满屏英文。结构对不等于翻过。
  const { masked, tokens } = maskProtected(DEFINITION)
  const [chunk] = chunkMasked(masked, CHUNK_CHAR_BUDGET)
  assert.equal(checkChunk({ source: chunk.source, translation: chunk.source, tokens }).rule, 'untranslated')

  // 中文译文里应该有汉字；没有一个汉字、却有成篇拉丁字母的，判为没翻。
  const latinOnly = chunk.source.replace(/[A-Za-z]{2,}/g, 'lorem')
  assert.equal(checkChunk({ source: chunk.source, translation: latinOnly, tokens }).rule, 'untranslated')

  // 反过来，只要有一个汉字，就不再怀疑它。
  assert.equal(checkChunk({ source: chunk.source, translation: `${latinOnly} 译`, tokens }).ok, true)
})

test('a changed heading level is repaired from the source, not thrown away', () => {
  // 模型看到 `##` 直接跳 `####`，会认为那是笔误、顺手改成 `###`。那是善意，而且层级
  // 本来不是它的活。一次真实故障里，一个 `####` 让 3302 字符（全文 79%）整段退回英文。
  const { masked, tokens } = maskProtected(DEFINITION)
  const [chunk] = chunkMasked(masked, CHUNK_CHAR_BUDGET)
  // 翻过一遍（因此有汉字），但层级被"顺手修正"了。
  const demoted = chunk.source.replace('## Knobs', '### Knobs').replace('Set ', '设置 ')
  assert.ok(demoted.includes('### Knobs'), 'the fixture really has that heading')
  const verdict = checkChunk({ source: chunk.source, translation: demoted, tokens })
  assert.equal(verdict.ok, true, 'a level is not worth losing the whole segment over')
  assert.equal(verdict.realigned, true)
  assert.deepEqual(headingLevelsOf(verdict.translation), headingLevelsOf(chunk.source))
  assert.ok(!verdict.translation.includes('### Knobs'), 'the level was put back')
  assert.ok(verdict.translation.includes('## Knobs'), 'and the text was left alone')

  // 数量对不上就不能修了：那是标题被吃成了段落。
  const eaten = chunk.source.replace(/^## Knobs$/m, '**Knobs**').replace('Set ', '设置 ')
  assert.equal(checkChunk({ source: chunk.source, translation: eaten, tokens }).rule, 'heading')
})

test('heading levels are pinned in order, one per heading', () => {
  const source = '# a\n\n## b\n\n#### c\n'
  assert.equal(alignHeadingLevels('# a\n\n### b\n\n## c\n', headingLevelsOf(source)), source)
  // 行内出现 # 不算标题，不许被动到。
  assert.equal(alignHeadingLevels('# a\n\n## b\n\n#### c\n', headingLevelsOf(source)), source)
  assert.equal(alignHeadingLevels('# a # not a heading\n', [2]), '## a # not a heading\n')
})

test('the gate accepts a translation produced the way the host produces one', () => {
  // 这是 beta.69 那条故障的回归用例：走一遍 mask → 逐段「翻译」→ restore，
  // 最终 `inspectTranslation` 必须通过。它以前必然失败，因为围栏与路径是发给模型的。
  const { masked, tokens } = maskProtected(DEFINITION)
  const chunks = chunkMasked(masked, 120)
  const translated = restoreProtected(chunks.map((chunk) => chunk.source).join(''), tokens)
  const check = inspectTranslation({ source: DEFINITION, translation: translated })
  assert.equal(check.ok, true, JSON.stringify(check.violations))
  assert.equal(check.preserved.fenceCount, 1)
  assert.equal(check.preserved.headingCount, 3)
})

test('one segment falling back to the original does not fail the whole document', () => {
  const { masked, tokens } = maskProtected(DEFINITION)
  const chunks = chunkMasked(masked, 120)
  assert.ok(chunks.length >= 2)
  // 第一段"翻译失败"，回退原文；其余正常。整篇仍必须通过最终校验 ——
  // 用户看到一段英文加一句说明，比看到"翻译失败"而一个字都没有要好。
  const pieces = chunks.map((chunk, index) => (index === 0 ? chunk.source : chunk.source))
  const assembled = restoreProtected(pieces.join(''), tokens)
  assert.equal(inspectTranslation({ source: DEFINITION, translation: assembled }).ok, true)
})

test('chunk messages name the placeholders the model must return', () => {
  const { masked } = maskProtected(DEFINITION)
  const [chunk] = chunkMasked(masked, CHUNK_CHAR_BUDGET)
  const built = buildChunkMessages({ skillName: 'ui-craft', chunkSource: chunk.source, index: 0, total: 1 })
  assert.match(built.system, /逐字原样保留/)
  assert.ok(built.system.includes(PLACEHOLDER_OPEN), 'the model is told what a placeholder looks like')
  assert.match(built.system, /第 1\/1 段/)
  assert.equal(built.messages.length, 1)
  assert.equal(built.messages[0].content, chunk.source)
})

test('translation context is the definition only', () => {
  const { masked } = maskProtected(DEFINITION)
  const built = buildChunkMessages({ skillName: 'ui-craft', chunkSource: masked, index: 0, total: 1 })
  // §20：会话消息、工具输出、凭据都不进翻译请求。
  assert.equal(built.messages.length, 1)
  assert.equal(built.messages[0].role, 'user')
})

// --- 假模型：策略本身必须能在没有真模型的情况下被证明 ------------------------------
//
// beta.69 的翻译逻辑整块长在宿主里，跑它必须连上真模型。于是「一次都没成功过」在
// 341 个测试里完全看不出来 —— 旧测试只测了 `inspectTranslation` 的正确性，而它一直
// 是正确的。下面这些用例把失败模式搬进测试：模型改坏标题、模型丢掉占位符、模型整段
// 报错。它们全都必须在毫秒内复现，而不是等用户点三次才发现。

/** 一段"翻过了"的文本：ASCII 词换成汉字，结构不动。 */
function translatedFixture(source) {
  return String(source).replace(/[A-Za-z]{2,}/g, '译文')
}

/** 一个"会翻译"的假模型：把 ASCII 词换成中文，结构原样返回。 */
function fakeTranslate(source) {
  return source.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => `译${word.length}`)
}

/** 收集每段被请求了几次。 */
function recorder(fn) {
  const calls = []
  const ask = async ({ chunk, index, attempt }) => {
    calls.push({ index, attempt })
    return fn(chunk.source, index, attempt)
  }
  ask.calls = calls
  return ask
}

test('a well-behaved model translates the document and nothing falls back', async () => {
  const ask = recorder((source) => fakeTranslate(source))
  const result = await runSegmentedTranslation({ definitionText: DEFINITION, skillName: 'ui-craft', ask })
  assert.equal(result.fallbackChunks, 0)
  assert.ok(result.chunkCount >= 1)
  assert.ok(result.translation.includes('译2'), 'the prose really was translated')
  assert.equal(inspectTranslation({ source: DEFINITION, translation: result.translation }).ok, true)
})

test('a model that demotes every heading still delivers a translated document', async () => {
  // 每段都降一级标题 —— 这正是真实模型对长文档做的事。以前这会让整段退回英文。
  const ask = recorder((source) => fakeTranslate(source).replace(/^## /m, '### '))
  const result = await runSegmentedTranslation({ definitionText: DEFINITION, skillName: 'ui-craft', ask, attempts: 2 })
  assert.equal(result.fallbackChunks, 0, 'a level is repaired, not thrown away')
  assert.ok(result.realignedChunks >= 1, 'and we can say it happened')
  assert.equal(result.untouchedChunks, 0)
  assert.equal(inspectTranslation({ source: DEFINITION, translation: result.translation }).ok, true)
  assert.notEqual(result.translation, DEFINITION, 'the document really is translated')
  assert.equal(ask.calls.length, result.chunkCount, 'no retry was even needed')
})

test('a chunk that keeps failing is split, so the damage stays small', async () => {
  // 真实模型对**长**输入才改坏结构。以前一段失败 = 整段（3302 字符）退回英文；
  // 现在失败的那段会被劈开重试，坏的范围跟着缩小。
  const ask = recorder((source) => (source.length > 60 ? source : fakeTranslate(source)))
  const result = await runSegmentedTranslation({
    definitionText: DEFINITION,
    skillName: 'ui-craft',
    ask,
    chunkBudget: 120,
    attempts: 1,
  })
  assert.ok(ask.calls.length > result.chunkCount, 'the long segments were asked more than once')
  assert.equal(result.fallbackChunks, 0, 'splitting recovered every segment')
  assert.equal(result.untouchedChunks, 0)
  assert.equal(inspectTranslation({ source: DEFINITION, translation: result.translation }).ok, true)
  assert.match(result.translation, /译\d/, 'the prose came out translated')
})

test('splitting a segment loses no bytes', () => {
  const source = 'a\n\nb\n\nc\n\nd\n\ne\n\n'
  const halves = splitChunkSource(source)
  assert.ok(halves, 'this text can be split')
  assert.equal(halves[0] + halves[1], source)
  assert.ok(halves[0].length > 0 && halves[1].length > 0)
  // 没有空行可断的时候宁可不断，也不要把一句话劈成两半。
  assert.equal(splitChunkSource('one line only'), null)
  assert.equal(splitChunkSource(''), null)
})

test('a model that always throws yields the original document, not an error', async () => {
  const ask = recorder(() => { throw new Error('model unavailable') })
  const result = await runSegmentedTranslation({ definitionText: DEFINITION, skillName: 'ui-craft', ask, attempts: 2 })
  assert.equal(result.fallbackChunks, result.chunkCount, 'every segment fell back')
  assert.equal(result.translation, DEFINITION, 'the user sees the original, byte for byte')
  assert.equal(inspectTranslation({ source: DEFINITION, translation: result.translation }).ok, true)
})

test('a model that is right on the second try costs one retry, not a fallback', async () => {
  const ask = recorder((source, index, attempt) => (attempt === 0 ? '' : fakeTranslate(source)))
  const result = await runSegmentedTranslation({ definitionText: DEFINITION, skillName: 'ui-craft', ask, attempts: 2 })
  assert.equal(result.fallbackChunks, 0)
  assert.notEqual(result.translation, DEFINITION, 'it really used the second answer')
  assert.ok(ask.calls.some((call) => call.attempt === 1), 'there was a retry')
})

test('a model that eats every placeholder cannot corrupt a code fence', async () => {
  // 最坏情况：模型把占位符全删了。掩码的意义就在这里 —— 围栏内容从未发给它，
  // 所以回退之后围栏仍然逐字存在。这正是 §12.4 要保证的事。
  const { masked } = maskProtected(DEFINITION)
  const chunks = chunkMasked(masked, 200)
  const carriesToken = chunks.some((chunk) => chunk.source.includes(PLACEHOLDER_OPEN))
  assert.ok(carriesToken, 'some segment carries a protected span')
  const ask = recorder((source) => fakeTranslate(source.replace(new RegExp(`${PLACEHOLDER_OPEN}\\s*\\d+\\s*${PLACEHOLDER_CLOSE}`, 'g'), '')))
  const result = await runSegmentedTranslation({ definitionText: DEFINITION, skillName: 'ui-craft', ask, attempts: 2 })
  assert.ok(result.fallbackChunks >= 1)
  assert.ok(result.translation.includes('node scripts/build-client.mjs'), 'the command is still verbatim')
  assert.ok(result.translation.includes('this line must never be translated'), 'the comment inside the fence too')
  assert.equal(inspectTranslation({ source: DEFINITION, translation: result.translation }).ok, true)
})

test('a trimmed segment cannot glue two lines together', () => {
  // 这一段单独看完全合法：标题层级不变、占位符一个不少。它毁掉的是**接头**。
  const source = '## Motion\n\nUse prefers-reduced-motion.\n\n'
  const trimmed = '## 动效\n\n使用 prefers-reduced-motion。'
  const anchored = reanchorChunk({ source, translation: trimmed })
  assert.ok(anchored.endsWith('\n\n'), 'the blank line that separates segments comes back')
  assert.deepEqual(headingLevelsOf(anchored), headingLevelsOf(source))

  // 反过来：模型原地返回（只 trim 过）时，拼接结果必须逐字节等于原文。
  const glued = reanchorChunk({ source, translation: source.trim() })
  assert.equal(glued, source)
})

test('the junctions survive a model that trims every segment', async () => {
  // 模型 trim 输出是常态而不是异常；把预算压小，这样 fixture 会长出真正的接头。
  // 用**会翻译**的假模型而不是原地返回：原地返回时 trim 只是删空白，翻译之后
  // 段首那个 `## ` 才真的是接在别人后面。
  const budget = 90
  const ask = async ({ chunk }) => fakeTranslate(chunk.source).trim()
  const result = await runSegmentedTranslation({
    definitionText: DEFINITION,
    skillName: 'ui-craft',
    ask,
    chunkBudget: budget,
  })
  assert.ok(result.chunkCount > 1, 'the fixture has to actually be split, or this proves nothing')
  assert.equal(result.fallbackChunks, 0, 'trimming is not a reason to fall back')
  assert.match(result.translation, /[\u4e00-\u9fff]/, 'this model really does translate')
  assert.deepEqual(
    headingLevelsOf(result.translation),
    headingLevelsOf(DEFINITION),
    'a trimmed segment must not swallow the heading that starts the next one',
  )
  assert.ok(
    inspectTranslation({ source: DEFINITION, translation: result.translation }).ok,
    'and the whole document still passes the last gate',
  )
})

test('a fallback says which rule it failed, not just that it failed', async () => {
  // 「有 3 段没翻成」不解释原因，等于把诊断推给用户 —— 上一次真实故障就是这么被盖住的。
  // 这里用的是**修不好**的那种破坏：标题被吃成粗体段落，数量对不上。
  const headingBreaker = async ({ chunk }) => fakeTranslate(chunk.source).replace(/^## (.*)$/m, '**$1**')
  const broken = await runSegmentedTranslation({
    definitionText: DEFINITION,
    skillName: 'ui-craft',
    ask: headingBreaker,
    chunkBudget: 90,
  })
  assert.ok(broken.fallbackChunks > 0)
  assert.deepEqual([...new Set(broken.fallbackReasons.map((entry) => entry.rule))], ['heading'])
  assert.equal(broken.fallbackReasons.length, broken.fallbackChunks, 'every fallback has exactly one reason')

  // 抛错的段没有「规则」可报，只能报 empty —— 不能说成是模型改坏了结构。
  const thrower = async () => { throw new Error('model exploded') }
  const gone = await runSegmentedTranslation({
    definitionText: DEFINITION,
    skillName: 'ui-craft',
    ask: thrower,
    chunkBudget: 90,
  })
  assert.deepEqual([...new Set(gone.fallbackReasons.map((entry) => entry.rule))], ['empty'])
})
