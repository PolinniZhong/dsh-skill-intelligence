import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildInstalledView, projectInstalledSkill } from '../src/core/installed-view.mjs'
import { buildTranslationMessages, compareTranslationSource, inspectTranslation, extractProtected } from '../src/core/skill-translation.mjs'

// v0.6 §25 的自动化验收清单。
//
// 这一份**故意**和既有测试有重叠：§25 是一条一条点名的验收项，而分散在
// `installed-view.test.mjs` / `skill-translation.test.mjs` / `client-render-smoke.test.mjs` 里的
// 用例是按模块组织的。评审要能拿着 §25 对照，就得有一条从 §25.1 到 §25.5 的通道；
// 只有编号对得上，缺一条才看得出来。重叠的部分断言得更**具体**（比如 §25.1 的
// 「列表不要求加载全文 Definition」在此处是断言宿主那条路由根本没调 `loadSkillDefinition`），
// 而不是把别处的用例抄一遍。

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_PATH = join(ROOT, 'src/dsh/client/client.js')

const client = await readFile(CLIENT_PATH, 'utf8')
const host = await readFile(join(ROOT, 'src/dsh/host/index.js'), 'utf8')

/** 取一个顶层 `function name(` 到下一个同缩进声明之间的源码。 */
function componentSource(name) {
  const start = client.indexOf(`  function ${name}(`)
  assert.notEqual(start, -1, `${name} must exist`)
  const end = client.indexOf('\n  function ', start + 10)
  return client.slice(start, end === -1 ? undefined : end)
}

function routeSource(path, method = 'GET') {
  const start = host.indexOf(`url.pathname === '${path}'`)
  assert.notEqual(start, -1, `${method} ${path} must exist`)
  const end = host.indexOf('url.pathname ===', start + 10)
  return host.slice(start, end === -1 ? undefined : end)
}

const snapshot = (overrides = {}) => ({
  status: 'complete',
  complete: true,
  observedAt: 1,
  skills: [
    { name: 'ui-craft', description: 'Craft UIs.', provider: 'filesystem', sourceFingerprint: 'sha256:aaa', invocation: { modelInvocable: true, userInvocable: true } },
    { name: 'code-review', description: null, provider: 'filesystem', sourceFingerprint: null, invocation: { modelInvocable: true, userInvocable: false } },
  ],
  ...overrides,
})

// ---------------------------------------------------------------------------
// §25.1 Skill List
// ---------------------------------------------------------------------------

test('§25.1 the current Skill list renders a card per loaded Skill', () => {
  const source = componentSource('CurrentSkillPage')
  // 第一屏是卡片列表，不是三栏工作台。
  assert.ok(source.includes('SkillCard'), 'the first page must render SkillCard')
  assert.equal(source.includes('FlowCanvas'), false, 'the canvas is not a list page any more')
})

test('§25.1 the installed list is metadata only and needs no Definition read', () => {
  const route = routeSource('/skill-trace/catalog')
  assert.equal(route.includes('loadSkillDefinition'), false, 'listing Skills must not read their Definitions')
  assert.ok(route.includes('buildCatalogSnapshot'), 'the list comes from the registry snapshot')
  const view = buildInstalledView({ catalogSnapshot: snapshot(), query: '' })
  const card = view.skills[0]
  // 出站投影只放行卡片会渲染的字段：正文、绝对路径、以及 §7.4 点名删掉的学习状态
  // 都不许跟着 metadata 一起流到客户端。
  for (const leaked of ['path', 'content', 'metadata', 'summary', 'sourceFingerprint', 'learningState', 'validationState', 'observedState', 'latestHistoryAt', 'confirmedReceiptCount', 'possiblePendingReviewCount', 'conflictCount']) {
    assert.equal(Object.hasOwn(card, leaked), false, `§25.1: the projected card must not carry ${leaked}`)
  }
})

test('§25.1 search filtering is a projection, and the honest total survives it', () => {
  const view = buildInstalledView({ catalogSnapshot: snapshot(), query: 'CRAFT' })
  assert.deepEqual(view.skills.map((skill) => skill.name), ['ui-craft'])
  assert.equal(view.totalCount, 2, 'the total counts the catalogue, not the filtered result')
  assert.equal(view.skillCount, 1)
})

test('§25.1 the same Skill discovered twice is listed once, under a unique name', () => {
  const duped = snapshot({ skills: [...snapshot().skills, { name: 'ui-craft', description: 'again', provider: 'filesystem' }] })
  const view = buildInstalledView({ catalogSnapshot: duped, query: '' })
  const names = view.skills.map((skill) => skill.name)
  assert.deepEqual(names, [...new Set(names)], 'names must be unique in the projection')
})

test('§25.1 a projection never rounds unknown metadata into a claim', () => {
  const card = projectInstalledSkill({ name: 'x' })
  // 描述缺失就是空串，卡片据此**不渲染**那一段；空串不会变成一句「没有描述」的断言。
  assert.equal(card.description, '')
  assert.equal(/description \? h\('p'/.test(client), true, 'the card renders nothing for an empty description')
  // 调用方式缺失不是「可调用」：两个方向都必须显式为 true 才算。
  assert.deepEqual(card.invocation, { modelInvocable: false, userInvocable: false })
  assert.equal(card.provider, null)
  // 没有名字的条目被丢掉，而不是渲染成一张空卡片。
  assert.equal(projectInstalledSkill({ description: 'nameless' }), null)
})

// ---------------------------------------------------------------------------
// §25.2 Skill Detail
// ---------------------------------------------------------------------------

test('§25.2 clicking a card is what opens the Detail page', () => {
  const card = componentSource('SkillCard')
  assert.ok(/onClick:\s*onOpen/.test(card), 'the card must hand the click to its caller')
  assert.ok(/h\('button'/.test(card), 'the whole card is the hit target')
  const list = componentSource('CurrentSkillPage')
  assert.ok(/onOpen/.test(list), 'the list supplies the click handler')
})

test('§25.2 Back returns to the list the user came from, never to a fixed one', () => {
  // 返回键 2026-10-01 搬进了顶栏（用户指出顶栏标题块与段头重复），所以它现在是自己的
  // 组件、由 Workbench 实例化。§25.2 要问的两件事没变：标签从哪来、有没有写死。
  const back = componentSource('DetailBackButton')
  assert.ok(/backLabel/.test(back), 'the return label is a prop')
  assert.equal(/backLabel\s*:\s*['"]/.test(back), false, 'the label must not be hard-coded')
  const workbench = componentSource('Workbench')
  assert.ok(/backLabel:/.test(workbench), 'the caller decides where Back goes')
  assert.ok(/openSkill\.from/.test(workbench), 'and it decides from the list the user actually came from')
})

test('§25.2 a Definition that cannot be read says so instead of showing an empty document', () => {
  const detail = componentSource('SkillDetailPage')
  assert.ok(detail.includes('这份 Skill 的定义当前读不到'), 'the unreadable branch is rendered')
  assert.equal(/available\s*!==\s*false.*content/.test(detail), false, 'an unavailable definition must not fall through to content')
})

test('§25.2 the fingerprint has three states and "cannot compare" is one of them', () => {
  const detail = componentSource('SkillDetailPage')
  for (const word of ['一致', '文件已改变', '无法比对']) {
    assert.ok(detail.includes(word), `§25.2: the fingerprint must be able to say ${word}`)
  }
  // `unavailable` 必须是独立分支：它既不是 match，也不是 mismatch。
  assert.ok(/unavailable/.test(detail), 'a half-known fingerprint is its own state')
})

// ---------------------------------------------------------------------------
// §25.3 Viewer
// ---------------------------------------------------------------------------

test('§25.3 every colour in the shell comes from a token, so both themes stay legible', () => {
  const styleStart = client.indexOf('function installStyles')
  const css = client.slice(styleStart, client.indexOf('\n  }', styleStart))
  // `--st-*` 是语义层，它必须**全部**由宿主的 `--dsw-alias-*` 推导出来。写死一个颜色
  // 就意味着暗色主题下这一块不会跟着走 —— 而渲染台不加载宿主 CSS，所以它看不出来。
  const definitions = [...css.matchAll(/--st-[a-z-]+:\s*([^;}]+)/g)]
  assert.ok(definitions.length > 10, 'the semantic layer must exist')
  assert.ok(css.includes('--dsw-alias-'), 'the semantic layer is built on the host aliases')
  for (const [, value] of definitions) {
    const usesAlias = value.includes('--dsw-alias-')
    const usesSemantic = /var\(--st-[a-z-]+/.test(value)
    assert.ok(usesAlias || usesSemantic, `§25.3: ${value.trim()} is neither an alias nor a semantic token`)
  }
})

test('§25.3 the viewer renders Markdown structure, and only http(s) becomes a link', () => {
  // §9.4/§25.3：标题降一级（面板自己已有 h1）、围栏以 `data-lang` 带出语言、
  // 行内代码有独立元素、链接只认 http(s) 且必须带 noopener。
  assert.ok(/Math\.min\(heading\[1\]\.length \+ 1, 6\)/.test(client), 'headings shift down one level')
  assert.ok(/className: 'st-audit-pre'/.test(client), 'a fence renders as a code block')
  assert.ok(/data-lang/.test(client), 'the fence language survives to the DOM')
  assert.ok(/className: 'st-audit-code'/.test(client), 'inline code renders as <code>')
  assert.ok(client.includes('i.test(link[2])'), 'only an http(s) target is allowed through')
  assert.ok(/rel: 'noreferrer noopener'/.test(client), 'an external link cannot reach back through window.opener')
})

// ---------------------------------------------------------------------------
// §25.4 Skill Run
// ---------------------------------------------------------------------------

test('§25.4 a load that failed is not described as never having happened', () => {
  // 「本次会话没有记录到该 Skill 的成功加载」是宿主给出的一条 limitation，措辞在
  // 客户端的限制词表里；详情页必须能把它显示出来，而不是自己另编一句。
  assert.ok(client.includes("'this-session-recorded-no-successful-load-of-this-skill'"))
  assert.ok(client.includes('本次会话没有记录到该 Skill 的成功加载。'))
  const detail = componentSource('SkillDetailPage')
  assert.ok(/limitationLabel/.test(detail), 'the Detail page renders the host’s limitations')
  assert.ok(/invocationLabel|runSourceLabel/.test(detail), 'the invocation mode is stated, not implied')
})

test('§25.4 multiple loads are counted rather than collapsed to a boolean', () => {
  // §6.3：卡片上是「已加载 N 次」；§5.3：详情页左栏是「本次使用 N」。
  assert.ok(/已加载 \$\{entry\.runCount \?\? 0\} 次/.test(client), 'the card carries the load count')
  const detail = componentSource('SkillDetailPage')
  assert.ok(/本次使用/.test(detail) && /runs\.length/.test(detail), 'the Detail page carries the same count')
})

// ---------------------------------------------------------------------------
// §25.5 Translation
// ---------------------------------------------------------------------------

const definition = [
  '# Purpose',
  '',
  'Use this when reviewing a component.',
  '',
  '```bash',
  'npm run check -- --strict',
  '```',
  '',
  'See https://example.com/docs and `src/index.ts`.',
  '',
].join('\n')

test('§25.5 a faithful translation keeps heading levels, fences, commands, URLs and paths', () => {
  const faithful = [
    '# 用途',
    '',
    '评审组件时使用。',
    '',
    '```bash',
    'npm run check -- --strict',
    '```',
    '',
    '见 https://example.com/docs 与 `src/index.ts`。',
    '',
  ].join('\n')
  const report = inspectTranslation({ source: definition, translation: faithful })
  assert.equal(report.ok, true, JSON.stringify(report.violations))
})

test('§25.5 each protected class is caught when it is translated', () => {
  const cases = [
    ['code-fence', definition.replace('npm run check -- --strict', 'npm 运行检查')],
    ['heading', definition.replace('# Purpose', '## 用途')],
    ['inline-code', definition.replace('`src/index.ts`', '`源文件`')],
    ['url', definition.replace('https://example.com/docs', 'https://例子.com/文档')],
  ]
  for (const [rule, translated] of cases) {
    const report = inspectTranslation({ source: definition, translation: translated })
    assert.equal(report.ok, false, `${rule} must be caught`)
    assert.ok(report.violations.some((violation) => violation.rule === rule), `${rule} must be named`)
  }
})

test('§25.5 the model is handed the definition and nothing else', () => {
  const built = buildTranslationMessages({ definitionText: definition, skillName: 'ui-craft', targetLanguage: 'zh-CN' })
  assert.ok(Array.isArray(built.messages))
  const text = JSON.stringify(built)
  assert.ok(text.includes('# Purpose'), 'the definition is in the prompt')
  // §12.5: 提示词里不得夹带会话内容 —— 这条路径上没有会话可带。
  assert.equal(text.includes('sessionId'), false, 'a translation must not know about the session')
  assert.equal(text.includes('callId'), false, 'a translation must not know about the trace')
})

test('§25.5 a stale preview is invalidated by the source hash, not by a timestamp', () => {
  assert.equal(compareTranslationSource({ requestedSha256: 'sha256:a', currentSha256: 'sha256:a' }), 'match')
  assert.equal(compareTranslationSource({ requestedSha256: 'sha256:a', currentSha256: 'sha256:b' }), 'mismatch')
  // 缺一半哈希同样是失效：不能拿「不知道」当「没变」。
  assert.equal(compareTranslationSource({ requestedSha256: null, currentSha256: 'sha256:b' }), 'unavailable')
  assert.equal(compareTranslationSource({ requestedSha256: 'sha256:a', currentSha256: null }), 'unavailable')
})

test('§25.5 a failure is retryable: the route answers with an error the page can act on', () => {
  const route = routeSource('/skill-trace/translate', 'POST')
  assert.ok(route.includes('TRANSLATION_ERROR'), 'the failure carries one of the governed codes')
  const detail = componentSource('SkillDetailPage')
  assert.ok(detail.includes('翻译没有完成'), 'the page states the failure')
  // 失败后分段控件回到原文，但错误必须留在屏幕上 —— 一次静默失败比摆在明面的失败糟得多。
  assert.ok(/setTranslation\(\{ state: 'error'/.test(detail), 'the error state is held in memory')
  assert.ok(/setTab\('original'\)/.test(detail), 'the segment shows what is actually on screen')
})

test('§25.5 the translation is never written anywhere, and it dies with the page', async () => {
  const detail = componentSource('SkillDetailPage')
  for (const sink of ['localStorage', 'sessionStorage', 'indexedDB', 'navigator.sendBeacon', 'fetch(\'/skill-trace/receipt']) {
    assert.equal(detail.includes(sink), false, `§25.5: the translation must not reach ${sink}`)
  }
  // 宿主一侧：翻译路由不碰任何存储，也不往会话里追加消息。
  const route = routeSource('/skill-trace/translate', 'POST')
  for (const sink of ['store.write', 'syncReceipt', 'preferenceStore.write', 'sessions.update', '.append(']) {
    assert.equal(route.includes(sink), false, `§25.5: the translate route must not call ${sink}`)
  }
  const core = await readFile(join(ROOT, 'src/core/skill-translation.mjs'), 'utf8')
  for (const sink of ['receipt', 'localStorage', 'sessionStorage', 'writeFile']) {
    assert.equal(core.includes(sink), false, `§25.5: the translation core must not know about ${sink}`)
  }
})

test('§25.5 the protected inventory covers fences, headings, inline code, URLs and paths', () => {
  const protectedParts = extractProtected(definition)
  assert.equal(protectedParts.fenceCount, 1, 'the shell command lives inside one fence')
  assert.ok(protectedParts.fences[0].includes('npm run check -- --strict'), 'the fence body is held verbatim')
  assert.deepEqual(protectedParts.headingLevels, [1], 'the heading level inventory travels with the text')
  assert.ok(protectedParts.inline.includes('src/index.ts'), 'inline code is protected')
  assert.ok(protectedParts.urls.includes('https://example.com/docs'), 'the URL is protected')
  // 围栏**内**的东西不算路径：把它算进去会让合法译文被误判（`npm` 会被认成路径的一部分）。
  assert.equal(protectedParts.paths.some((entry) => entry.includes('npm run')), false, 'fence contents are not scanned as prose')
})
