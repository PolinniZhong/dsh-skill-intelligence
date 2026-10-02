/**
 * Skill 复刻血缘（lineage）的纯函数层：schema、校验、归一化、键。
 *
 * 这一层不碰磁盘、不认识 DSH，只回答「这条血缘记录能不能成立、它长什么样、
 * 它落在哪个文件里」。真正的落盘留给 `src/storage/skill-lineage-store.mjs`。
 *
 * 三条不许违反的规矩（`spec/PRD.md` §5.7 `FR-EVO-001`–`FR-EVO-008`）：
 *
 * 1. **血缘只有一个数据源：本插件自己成功执行过的复刻。** A 与 B 内容很像、名字很像、
 *    同属一个 GitHub 仓库、用户在 Finder 里手动复制的、用户自己新建的 —— 都不建立血缘。
 *    观察不到证据，就推不出关系；这与运行时那套「声明不等于执行」是同一条纪律。
 * 2. **字段是闭集。** 任何 Skill 正文或资源内容、会话标识、会话日志、Tool 参数或结果、
 *    Token / Cookie、未脱敏绝对路径都不许进来。`FORBIDDEN_LINEAGE_FIELDS` 在写入时直接
 *    抛错，所以将来有人往记录里塞 sessionId 或正文，会在这里失败而不是悄悄落盘。
 * 3. **一个目标 Skill 只有一条直接来源记录。** 文件名由目标名决定，所以「同一个目标名
 *    再次被复刻」是覆盖而不是追加；用户后来改了目标 Skill 的任何文件都**不产生新记录**
 *    —— 那些变化归 Diff。
 *
 * ⚠️ 这里的 `lineage` 与收据里那个 `lineage` **是两个无关对象**：收据的是**会话父子血统**
 * （`parentSessionId` / `delegationDepth`），由 `trace-reducer.mjs` 维护。两者不得互相读写、
 * 不得共用字段名，复刻血缘**永不进收据**（`FR-EVO-008`）。
 */

import { createHash } from 'node:crypto'
import { CLONE_MODES, CLONE_SCOPES } from './skill-clone.mjs'

export const SKILL_LINEAGE_VERSION = 1

/** 目录刷新观察到了没有。`pending` 不是失败（§8.4 / `FR-EVO-005`）。 */
export const LINEAGE_CATALOG_OBSERVATIONS = Object.freeze(['observed', 'pending'])

/** 正文指纹的形状。与 `sourceSha256` 校验用的是同一个。 */
const SHA256 = /^sha256:[a-f0-9]{64}$/

/**
 * 记录里**不允许**出现的字段。它们是隐私边界，不是命名风格。
 *
 * 前半段与 `translation-store.mjs` 的 `FORBIDDEN_RECORD_FIELDS` 同源（会话与工具面），
 * 后半段是血缘特有的：一条血缘记录只描述「谁来自谁」，任何**内容**字段都是越界。
 */
export const FORBIDDEN_LINEAGE_FIELDS = Object.freeze([
  'sessionId',
  'sessionID',
  'messages',
  'conversation',
  'log',
  'logs',
  'args',
  'result',
  'toolArguments',
  'toolResult',
  'content',
  'body',
  'text',
  'skillMd',
  'markdown',
  'translation',
  'resources',
  'files',
  'entries',
  'path',
  'filePath',
  'absolutePath',
  'cwd',
  'token',
  'cookie',
  'credentials',
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 目标名的摘要。文件名与 `lineageId` 都由它派生，两者永远指向同一个 Skill。 */
function targetDigest(targetSkillName) {
  return createHash('sha256').update(text(targetSkillName), 'utf8').digest('hex')
}

/**
 * 血缘的身份：`sha256:<目标名摘要>`。
 *
 * 它**不是**内容指纹 —— 它标识「这是哪个目标 Skill 的血缘」，而内容的身份是
 * `sourceSourceSha256`。两者形状相同、含义不同，不要拿它去比对正文。
 */
export function lineageIdFor(targetSkillName) {
  return `sha256:${targetDigest(targetSkillName)}`
}

/** 键的哈希就是文件名：Skill 名可以带 `.`/`:`/`/`，不适合直接当文件名。 */
export function lineageFileName(targetSkillName) {
  return `${targetDigest(targetSkillName)}.json`
}

export function isLineageFileName(file) {
  return typeof file === 'string' && /^[a-f0-9]{64}\.json$/.test(file)
}

/** 带凭据的 URL 一律不记（`FR-EVO-003`）。`https://user:pass@host/x` 这种形状。 */
function hasCredentials(url) {
  return /\/\/[^/@\s]*:[^/@\s]*@/.test(url)
}

/**
 * 一条血缘记录要能成立，至少得有：合法的目标名、合法的来源名、来源正文指纹、
 * 复刻模式与保存范围。缺一个都不写盘 —— 半个血缘比没有血缘更坏，因为它看起来像事实。
 */
export function inspectLineageRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'not-an-object' }
  for (const field of FORBIDDEN_LINEAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) return { ok: false, reason: `forbidden-field:${field}` }
  }
  const targetSkillName = text(record.targetSkillName)
  const sourceSkillName = text(record.sourceSkillName)
  if (!targetSkillName) return { ok: false, reason: 'missing-target-skill-name' }
  if (!sourceSkillName) return { ok: false, reason: 'missing-source-skill-name' }
  if (!SHA256.test(text(record.sourceSourceSha256))) return { ok: false, reason: 'missing-source-source-sha256' }
  if (!CLONE_MODES.includes(record.cloneMode)) return { ok: false, reason: 'invalid-clone-mode' }
  if (!CLONE_SCOPES.includes(record.targetScope)) return { ok: false, reason: 'invalid-target-scope' }
  if (record.catalogObservation !== undefined && !LINEAGE_CATALOG_OBSERVATIONS.includes(record.catalogObservation)) {
    return { ok: false, reason: 'invalid-catalog-observation' }
  }
  const repository = text(record.sourceRepository)
  if (repository && hasCredentials(repository)) return { ok: false, reason: 'repository-url-has-credentials' }
  return { ok: true }
}

/**
 * 归一化：只保留闭集里的字段，顺序固定。
 *
 * `createdAt` 在**覆盖**时保留第一次复刻的时间（那条血缘关系确实是从那时开始的），
 * `updatedAt` 每次写入都刷新 —— 这与 translation store 的做法不同，因为这里
 * 「同一个目标名再次被复刻」更新的是同一条关系，而不是新增一条。
 */
export function normalizeLineageRecord(record, now = Date.now(), previous = null) {
  const repository = text(record.sourceRepository)
  const firstCreated = Number.isFinite(previous?.createdAt) ? previous.createdAt : now
  return {
    schemaVersion: SKILL_LINEAGE_VERSION,
    lineageId: lineageIdFor(record.targetSkillName),
    sourceSkillName: text(record.sourceSkillName),
    sourceSourceSha256: text(record.sourceSourceSha256),
    targetSkillName: text(record.targetSkillName),
    cloneMode: record.cloneMode,
    targetScope: record.targetScope,
    catalogObservation: LINEAGE_CATALOG_OBSERVATIONS.includes(record.catalogObservation)
      ? record.catalogObservation
      : 'pending',
    ...(repository ? { sourceRepository: repository } : {}),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : firstCreated,
    updatedAt: now,
  }
}

/**
 * 从一次**成功的**复刻的事实里造记录。
 *
 * 调用方（宿主）只在这一刻才能拿到这些值：`writeClone` 成功、`readBackClone` 通过、
 * 源 Skill 复核过之后。清单里少任何一个都不该走到这里 —— 那条路径本来就回滚了。
 */
export function buildLineageRecord(options = {}) {
  return normalizeLineageRecord(
    {
      sourceSkillName: options.sourceSkillName,
      sourceSourceSha256: options.sourceSourceSha256,
      targetSkillName: options.targetSkillName,
      cloneMode: options.cloneMode,
      targetScope: options.targetScope,
      catalogObservation: options.catalogObservation,
      sourceRepository: options.sourceRepository,
    },
    Number.isFinite(options.now) ? options.now : Date.now(),
    options.previous ?? null,
  )
}
