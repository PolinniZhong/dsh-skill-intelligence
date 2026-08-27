import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const required = [
  'package.json',
  'cordis.patch.yml',
  'src/core/trace-reducer.mjs',
  'src/core/source-snapshot.mjs',
  'src/core/catalog-view.mjs',
  'src/storage/receipt-store.mjs',
  'src/storage/preference-store.mjs',
  'src/dsh/host/index.js',
  'src/dsh/client/client.js',
]

for (const file of required) await readFile(resolve(root, file), 'utf8')

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
if (packageJson.name !== 'dsh-skill-trace') throw new Error('package name mismatch')
if (!packageJson.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-ui-conversation')) throw new Error('conversation client injection missing')

for (const file of ['src/core/trace-reducer.mjs', 'src/core/source-snapshot.mjs', 'src/core/catalog-view.mjs', 'src/storage/receipt-store.mjs', 'src/storage/preference-store.mjs', 'src/dsh/host/index.js', 'src/dsh/client/client.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${file} syntax check failed:\n${result.stderr}`)
}

const client = await readFile(resolve(root, 'src/dsh/client/client.js'), 'utf8')
for (const requiredText of [
  'Skill 收据',
  '流程地图',
  "localStorage.setItem(VIEW_KEY",
  "view === 'receipt'",
  '当前对话暂未加载可追踪的 Skill。',
  '暂时无法确认当前对话是否加载了 Skill。',
  "'data-simple': !hasTrace",
  'method.callCount',
  'model.events',
  "api('/preferences'",
  '本次 Skill 使用记录',
  '本次流程小结',
  '发生了什么',
  '这不能说明什么',
  'width:max(100%,1000px)',
  '逐个看懂 Skill',
  '我的理解与迭代',
  '复制清单',
  '不会自动修改或发布 Skill',
  '我的 Skill',
  '当前可发现',
  '有真实收据',
  '历次会话理解',
  '内容相符候选',
  '不选择最新一条充当当前综合理解',
]) {
  if (!client.includes(requiredText)) throw new Error(`client contract missing: ${requiredText}`)
}
if (client.includes('Promise.all([buildReceipt') || client.includes('generateImage')) throw new Error('dual view must not generate duplicate analyses')
if (/\.slice\(0,\s*4\)/.test(client)) throw new Error('trace views must not silently cap Skill events at four')
if (client.includes('人工反馈') || client.includes("api('/assessment'")) throw new Error('feedback UI must remain absent until a real receiving loop exists')
for (const supersededText of ['Skill 方法追踪', '方法收据', '方法地图', '方法加载结果', '方法延续卡', '本次运行概要']) {
  if (client.includes(supersededText)) throw new Error(`superseded UI terminology remains: ${supersededText}`)
}

const host = await readFile(resolve(root, 'src/dsh/host/index.js'), 'utf8')
for (const requiredText of ['preferenceStore.read()', "'/skill-trace/preferences'", 'preferenceStore.write', 'shouldPersistReceipt', 'syncReceipt', 'store.prune', 'store.list()', "'/skill-trace/learning-note'", "'/skill-trace/catalog'", "'/skill-trace/history-receipt'", 'agentPresets?.serviceFor', 'scope: liveAgent', 'setLearningNote']) {
  if (!host.includes(requiredText)) throw new Error(`preference persistence contract missing: ${requiredText}`)
}
if (host.includes("'/skill-trace/assessment'")) throw new Error('assessment route must remain absent until a real receiving loop exists')

const reducer = await readFile(resolve(root, 'src/core/trace-reducer.mjs'), 'utf8')
for (const requiredText of ['methodCount:', 'eventCount:', 'methods,', 'events,', 'turnDetails,', 'summary,', ": 'mixed'", 'learningCards', 'learningNotes', 'buildLearningCards']) {
  if (!reducer.includes(requiredText)) throw new Error(`projection contract missing: ${requiredText}`)
}

const catalog = await readFile(resolve(root, 'src/core/catalog-view.mjs'), 'utf8')
for (const requiredText of ["'exact'", "'content-match-candidate'", "'name-only-candidate'", "'conflict'", "'current-not-discovered'", 'runtimeIdentity']) {
  if (!catalog.includes(requiredText)) throw new Error(`catalog evidence contract missing: ${requiredText}`)
}

const snapshot = await readFile(resolve(root, 'src/core/source-snapshot.mjs'), 'utf8')
for (const requiredText of ['buildCatalogSnapshot', 'loadSkillDefinition', 'sourceFingerprint', 'captureRuntimeIdentity']) {
  if (!snapshot.includes(requiredText)) throw new Error(`scoped registry contract missing: ${requiredText}`)
}
for (const forbidden of ['prompt:', 'skillBody', 'cookie:', 'token:']) {
  if (reducer.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`privacy implementation contains forbidden persisted field: ${forbidden}`)
}

for (const source of [client, host]) {
  for (const forbiddenAction of ['ctx.skills.register(', 'skill_create', 'publishSkill', 'installSkill']) {
    if (source.includes(forbiddenAction)) throw new Error(`automatic Skill mutation or publication must remain absent: ${forbiddenAction}`)
  }
}

console.log('PROJECT_STRUCTURE_OK')
console.log('CLIENT_DUAL_VIEW_CONTRACT_OK')
console.log('SOURCE_PRIVACY_FIELDS_OK')
console.log('LOCAL_LEARNING_LOOP_OK')
console.log('MY_SKILL_READ_ONLY_CATALOG_OK')
