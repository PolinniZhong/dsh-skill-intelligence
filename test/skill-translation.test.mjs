import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTranslationMessages,
  compareTranslationSource,
  extractProtected,
  inspectTranslation,
  TRANSLATION_ERROR,
} from '../src/core/skill-translation.mjs'

const SOURCE = [
  '---',
  'name: ui-craft',
  'description: Use for UI design work',
  '---',
  '',
  '# UI Craft',
  '',
  'Read `references/craft-intent.md` before you start.',
  '',
  '## Knobs',
  '',
  'See https://example.com/knobs for the full list.',
  '',
  '```bash',
  'node scripts/build-client.mjs',
  '```',
  '',
  'Set CRAFT_LEVEL to 8 for maximal refinement.',
  '',
  '## Gates',
  '',
  'Run the polish pass.',
].join('\n')

// 一份「只翻译自然语言、结构一字不动」的译文。它是所有反向用例的基线。
const FAITHFUL = [
  '---',
  'name: ui-craft',
  'description: Use for UI design work',
  '---',
  '',
  '# UI Craft',
  '',
  '开始之前先读 `references/craft-intent.md`。',
  '',
  '## Knobs',
  '',
  '完整列表见 https://example.com/knobs 。',
  '',
  '```bash',
  'node scripts/build-client.mjs',
  '```',
  '',
  '把 CRAFT_LEVEL 设为 8 可获得最大精修度。',
  '',
  '## Gates',
  '',
  '运行 polish pass。',
].join('\n')

test('a translation that only touches prose passes every structural rule', () => {
  const result = inspectTranslation({ source: SOURCE, translation: FAITHFUL })
  assert.deepEqual(result.violations, [])
  assert.equal(result.ok, true)
  assert.deepEqual(result.preserved, { fenceCount: 1, headingCount: 3, inlineCount: 1, urlCount: 1, pathCount: 1 })
})

test('translating inside a fenced block is caught even when the fence markers survive', () => {
  const translated = FAITHFUL.replace('node scripts/build-client.mjs', 'node scripts/构建客户端.mjs')
  const result = inspectTranslation({ source: SOURCE, translation: translated })
  assert.equal(result.ok, false)
  assert.deepEqual(result.violations.map((violation) => violation.rule), ['code-fence'])
})

test('dropping a fence is caught by count before content', () => {
  const translated = FAITHFUL.replace('```bash\nnode scripts/build-client.mjs\n```\n', '')
  const result = inspectTranslation({ source: SOURCE, translation: translated })
  assert.equal(result.violations[0].rule, 'code-fence')
  assert.match(result.violations[0].detail, /数量/)
})

test('an unterminated fence still protects its contents', () => {
  const open = '# T\n\n```bash\nnpm run verify\n'
  const protectedSpans = extractProtected(open)
  assert.equal(protectedSpans.fenceCount, 1)
  assert.equal(protectedSpans.fences[0].includes('npm run verify'), true)
})

test('a rewritten URL fails, because the reader has to be able to click it', () => {
  const translated = FAITHFUL.replace('https://example.com/knobs', 'https://例子.com/knobs')
  const result = inspectTranslation({ source: SOURCE, translation: translated })
  assert.deepEqual(result.violations.map((violation) => violation.rule), ['url'])
})

test('a changed heading level fails, and the first offender is named by position', () => {
  const translated = FAITHFUL.replace('\n## Knobs', '\n### Knobs')
  const result = inspectTranslation({ source: SOURCE, translation: translated })
  assert.deepEqual(result.violations.map((violation) => violation.rule), ['heading'])
  assert.match(result.violations[0].detail, /第 2 个标题/)
})

test('a removed heading fails', () => {
  const translated = FAITHFUL.replace('\n## Gates\n', '\n')
  const result = inspectTranslation({ source: SOURCE, translation: translated })
  assert.deepEqual(result.violations.map((violation) => violation.rule), ['heading'])
})

test('rewriting inline code fails even when the path inside it is intact', () => {
  const translated = FAITHFUL.replace('`references/craft-intent.md`', '档案')
  const result = inspectTranslation({ source: SOURCE, translation: translated })
  assert.equal(result.ok, false)
  assert.equal(result.violations.some((violation) => violation.rule === 'inline-code'), true)
})

test('rewriting a bare file path fails', () => {
  const bare = 'Read src/core/skill-flow.mjs first.'
  const translated = '先读 核心模块。'
  const result = inspectTranslation({ source: bare, translation: translated })
  assert.deepEqual(result.violations.map((violation) => violation.rule), ['file-path'])
})

test('renaming a frontmatter key fails', () => {
  const translated = FAITHFUL.replace('description: Use for UI design work', '描述: Use for UI design work')
  const result = inspectTranslation({ source: SOURCE, translation: translated })
  assert.deepEqual(result.violations.map((violation) => violation.rule), ['frontmatter'])
})

test('a faithful translation keeps the frontmatter keys byte-identical', () => {
  assert.deepEqual(extractProtected(SOURCE).frontmatterKeys, ['name', 'description'])
  assert.deepEqual(extractProtected(FAITHFUL).frontmatterKeys, ['name', 'description'])
})

test('the report is bounded so one bad translation cannot return a huge payload', () => {
  const many = Array.from({ length: 40 }, (_, index) => `## H${index}`).join('\n')
  const result = inspectTranslation({ source: many, translation: '# 只剩一个标题' })
  assert.equal(result.violations.length <= 20, true)
})

test('translation messages carry the definition and nothing else', () => {
  const built = buildTranslationMessages({ skillName: 'ui-craft', definitionText: SOURCE })
  assert.equal(built.messages.length, 1)
  assert.equal(built.messages[0].role, 'user')
  assert.equal(built.messages[0].content, SOURCE)
  assert.equal(built.targetLanguage, 'zh-CN')
  // §20: 会话消息、工具输出、凭据都不允许进入翻译上下文。
  const serialised = JSON.stringify(built)
  for (const forbidden of ['toolCall', 'sessionId', 'cookie', 'credential', 'previousMessages']) {
    assert.equal(serialised.includes(forbidden), false)
  }
  assert.match(built.system, /逐字原样保留/)
  assert.match(built.system, /只输出翻译后的 Markdown 本身/)
})

test('a blank definition is refused instead of being sent to the model', () => {
  assert.throws(() => buildTranslationMessages({ skillName: 'ui-craft', definitionText: '   ' }), /正文为空/)
  assert.throws(() => buildTranslationMessages({ skillName: '', definitionText: SOURCE }), /skillName 必填/)
})

test('the source hash decides whether an existing preview is still usable', () => {
  assert.equal(compareTranslationSource({ requestedSha256: 'sha256:a', currentSha256: 'sha256:a' }), 'match')
  assert.equal(compareTranslationSource({ requestedSha256: 'sha256:a', currentSha256: 'sha256:b' }), 'mismatch')
  // 只有一侧有 hash 时必须是 unavailable：不能温和地写成「内容已变化」。
  assert.equal(compareTranslationSource({ requestedSha256: 'sha256:a', currentSha256: null }), 'unavailable')
  assert.equal(compareTranslationSource({ requestedSha256: null, currentSha256: 'sha256:a' }), 'unavailable')
  assert.equal(compareTranslationSource({}), 'unavailable')
})

test('the error vocabulary is the one the SDD asks the endpoint to use', () => {
  assert.deepEqual(Object.values(TRANSLATION_ERROR), [
    'invalid-request',
    'skill-not-found',
    'definition-changed',
    'definition-unavailable',
    'model-busy',
    'translation-failed',
  ])
})
