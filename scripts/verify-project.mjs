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
if (!packageJson.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-locale')) throw new Error('locale client injection missing')

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
  'st-map-stage',
  'margin-inline:auto',
  'ctx.locale.register(NS',
  'React.useSyncExternalStore',
  'Related load records (',
  'Dependency signals: ',
  'Agent invocable',
  'Instruction fingerprint(s): ',
  "active || 'en') !== 'zh'",
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
  '验证结果回执',
  '学习与验证时间线',
  "['pending', '待回看']",
  "['validated', '已记录结果']",
  "api('/validation-result'",
  '不代表 Skill 的普遍质量',
  '回看工作台',
  'function CatalogGuide()',
  'st-catalog-guide',
  'if (previous) previous.replaceWith(style)',
  'if (document.getElementById(STYLE_ID) === style) style.remove()',
  'st-guide-link',
  '打开 Skill Trace 使用指南',
  '把一次 Skill 使用，变成可回看的学习记录',
  "['观察加载请求', '只记录可观测事件']",
  "['回来记录结果', '把复测结果留在原会话']",
  '不上传或翻译个人内容',
  '搜索 Skill 名称、声明和我的记录',
  '复制继续行动卡',
  "api('/backups'",
  "api('/backups/restore'",
  "fetch('/api/host.openPath'",
  "api('/receipts'",
  '确认清空全部本地收据',
  "'回看工作台': 'Review workspace'",
  "'搜索 Skill 名称、声明和我的记录': 'Search Skill names, declarations, and my records'",
  "'排序方式': 'Sort order'",
  "'创建本地备份': 'Create local backup'",
  "'打开备份文件夹': 'Open backup folder'",
  "'恢复缺失收据': 'Restore missing receipts'",
  "'恢复缺失数据': 'Restore missing data'",
  "'清空本地收据': 'Clear local receipts'",
  "'确认清空全部收据': 'Clear all receipts'",
  "'复制继续行动卡': 'Copy continuation card'",
  "const DRAFT_KEY = 'dsh-skill-trace.unsaved-drafts.v1'",
  "draftId('learning', receipt.sessionId, learningSkill)",
  "draftId('validation', sessionId, skillName)",
  "draftId('output', receipt.sessionId)",
  "window.addEventListener('beforeunload', handler)",
  '未保存草稿只暂存在当前 Desktop 运行期间',
  '当前无法暂存，切换页面前请先保存',
  'const volatileDrafts = new Set()',
]) {
  if (!client.includes(requiredText)) throw new Error(`client contract missing: ${requiredText}`)
}
if (client.includes('Promise.all([buildReceipt') || client.includes('generateImage')) throw new Error('dual view must not generate duplicate analyses')
if (client.includes('window.confirm(')) throw new Error('destructive actions must use inline confirmation')
if (client.includes('if (document.getElementById(STYLE_ID)) return () => {}')) throw new Error('stylesheet lifecycle must not leave a newer client instance without ownership')
if (/\.slice\(0,\s*4\)/.test(client)) throw new Error('trace views must not silently cap Skill events at four')
if (client.includes('人工反馈') || client.includes("api('/assessment'")) throw new Error('feedback UI must remain absent until a real receiving loop exists')
for (const supersededText of ['Skill 方法追踪', '方法收据', '方法地图', '方法加载结果', '方法延续卡', '本次运行概要']) {
  if (client.includes(supersededText)) throw new Error(`superseded UI terminology remains: ${supersededText}`)
}

const host = await readFile(resolve(root, 'src/dsh/host/index.js'), 'utf8')
for (const requiredText of ['preferenceStore.read()', "'/skill-trace/preferences'", 'preferenceStore.write', 'shouldPersistReceipt', 'syncReceipt', 'store.prune', 'store.list()', 'store.clear()', "'/skill-trace/learning-note'", "'/skill-trace/validation-result'", "'/skill-trace/catalog'", "'/skill-trace/history-receipt'", "'/skill-trace/backups'", "'/skill-trace/backups/preview'", "'/skill-trace/backups/restore'", "'/skill-trace/receipts'", 'createVerifiedBackup', 'buildLocalArchive', 'mergeMissingReceiptData', 'createSessionMutationQueue', 'runMaintenance', 'restoreMissingReceipts(archive.receipts, store, cache, enqueue)', 'agentPresets?.serviceFor', 'scope: liveAgent', 'setLearningNote', 'setValidationResult', 'sessionEventLog(session)', 'session.snapshotEvents()']) {
  if (!host.includes(requiredText)) throw new Error(`preference persistence contract missing: ${requiredText}`)
}
if (host.includes('rebuildReceipt(sessionId, session.events')) throw new Error('host must rebuild from the live session log, not the removed session.events field')
if (host.includes("'/skill-trace/assessment'")) throw new Error('assessment route must remain absent until a real receiving loop exists')

const reducer = await readFile(resolve(root, 'src/core/trace-reducer.mjs'), 'utf8')
for (const requiredText of ['methodCount:', 'eventCount:', 'methods,', 'events,', 'turnDetails,', 'summary,', ": 'mixed'", 'learningCards', 'learningNotes', 'validationResults', 'setValidationResult', 'buildLearningCards']) {
  if (!reducer.includes(requiredText)) throw new Error(`projection contract missing: ${requiredText}`)
}

const receiptStore = await readFile(resolve(root, 'src/storage/receipt-store.mjs'), 'utf8')
for (const requiredText of ['randomBytes(6)', "await rm(temporary, { force: true })"]) {
  if (!receiptStore.includes(requiredText)) throw new Error(`receipt atomic-write contract missing: ${requiredText}`)
}

const catalog = await readFile(resolve(root, 'src/core/catalog-view.mjs'), 'utf8')
for (const requiredText of ["'exact'", "'content-match-candidate'", "'name-only-candidate'", "'conflict'", "'current-not-discovered'", 'runtimeIdentity', 'pendingReview', 'confirmedValidationCount', 'searchMatchEntryIds', 'userSearchText']) {
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
