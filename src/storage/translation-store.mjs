import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 中文阅读版的磁盘副本（v0.7 §5）。
 *
 * 与 `receipt-store.mjs` / `preference-store.mjs` 同一套约定：默认根
 * `~/.dsh/skill-trace`，目录 0700、文件 0600、临时文件 + rename 的原子写。
 *
 * 三条与收据不同的规矩，都写在代码里而不是只写在文档里：
 *
 * 1. **持久化键不含 sessionId。** 目标是跨会话、跨 DSH 重启复用同一份中文阅读版；
 *    键一旦带上会话，重启后必然 miss，等于没做。内存缓存（`translation-cache.mjs`）
 *    仍然带 sessionId —— 它服务的是"这一轮别重复请求"，两件事不能共用一个键。
 * 2. **源指纹变了，旧译文就不算数。** 记录里存着 `sourceSha256`，读的时候逐字比对；
 *    不匹配一律当作没有。把上一版的译文顶到当前版本下，是比"没有译文"严重得多的事故。
 * 3. **不存对话、不存工具参数与结果。** `FORBIDDEN_RECORD_FIELDS` 在写入时直接抛错，
 *    所以将来有人往记录里塞 sessionId 或 messages，会在这里失败，而不是悄悄落盘。
 */

export const TRANSLATION_STORE_VERSION = 1

/** 记录里**不允许**出现的字段。它们是隐私边界，不是命名风格。 */
export const FORBIDDEN_RECORD_FIELDS = Object.freeze([
  'sessionId',
  'sessionID',
  'messages',
  'conversation',
  'args',
  'result',
  'toolArguments',
  'toolResult',
])

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace', 'translations')
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 持久化键：skillName + sourceSha256 + targetLanguage。
 *
 * `\u0000` 分隔，与内存缓存同一手法：三个字段里都不可能出现 NUL，
 * 所以不会出现 `a|b` + `c` 与 `a` + `b|c` 撞成同一个键的情况。
 */
export function translationStoreKey({ skillName, sourceSha256, targetLanguage }) {
  return `${text(skillName)}\u0000${text(sourceSha256)}\u0000${text(targetLanguage)}`
}

/** 键的哈希就是文件名：Skill 名可以带 `.`/`:`/`/`，不适合直接当文件名。 */
export function translationStoreFile(root, key) {
  const digest = createHash('sha256').update(key, 'utf8').digest('hex')
  return join(root, `${digest}.json`)
}

function sameKey(record, { skillName, sourceSha256, targetLanguage }) {
  return text(record?.skillName) === text(skillName)
    && text(record?.sourceSha256) === text(sourceSha256)
    && text(record?.targetLanguage) === text(targetLanguage)
}

/** 一条记录要能显示成"中文阅读版"，至少得有技能名、源指纹、语言与正文。 */
export function inspectTranslationRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'not-an-object' }
  for (const field of FORBIDDEN_RECORD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) return { ok: false, reason: `forbidden-field:${field}` }
  }
  if (!text(record.skillName)) return { ok: false, reason: 'missing-skill-name' }
  if (!text(record.sourceSha256)) return { ok: false, reason: 'missing-source-sha256' }
  if (!text(record.targetLanguage)) return { ok: false, reason: 'missing-target-language' }
  if (typeof record.translation !== 'string' || record.translation.length === 0) return { ok: false, reason: 'missing-translation' }
  return { ok: true }
}

function normalize(record, now) {
  return {
    schemaVersion: TRANSLATION_STORE_VERSION,
    skillName: text(record.skillName),
    sourceSha256: text(record.sourceSha256),
    targetLanguage: text(record.targetLanguage),
    translation: record.translation,
    chunkCount: Number.isInteger(record.chunkCount) ? record.chunkCount : 0,
    fallbackChunks: Number.isInteger(record.fallbackChunks) ? record.fallbackChunks : 0,
    fallbackReasons: Array.isArray(record.fallbackReasons) ? record.fallbackReasons.filter((item) => typeof item === 'string') : [],
    model: text(record.model),
    truncated: record.truncated === true,
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    updatedAt: now,
  }
}

export function createTranslationStore(root = defaultRoot()) {
  return {
    root,
    /**
     * 只返回**与请求的源指纹一致**的记录。指纹不一致不是"旧了一点"，
     * 是"这份译文描述的是另一份文档"，所以这里和没存过完全一样。
     */
    async read(query) {
      try {
        const value = JSON.parse(await readFile(translationStoreFile(root, translationStoreKey(query)), 'utf8'))
        if (!inspectTranslationRecord(value).ok) return null
        return sameKey(value, query) ? value : null
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        if (error instanceof SyntaxError) return null
        throw error
      }
    },
    async write(record) {
      const verdict = inspectTranslationRecord(record)
      if (!verdict.ok) throw new Error(`译文记录不可保存：${verdict.reason}`)
      await mkdir(root, { recursive: true, mode: 0o700 })
      const value = normalize(record, Date.now())
      const target = translationStoreFile(root, translationStoreKey(value))
      const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
      try {
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
        await rename(temporary, target)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
      }
      return value
    },
    /** 精确删除：三个字段都要对得上，没有模糊删除。 */
    async delete(query) {
      await rm(translationStoreFile(root, translationStoreKey(query)), { force: true })
    },
    async list() {
      let files
      try {
        files = await readdir(root)
      } catch (error) {
        if (error?.code === 'ENOENT') return { translations: [], warningCount: 0 }
        throw error
      }
      const translations = []
      let warningCount = 0
      for (const file of files) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
        try {
          const value = JSON.parse(await readFile(join(root, file), 'utf8'))
          if (!inspectTranslationRecord(value).ok) {
            warningCount += 1
            continue
          }
          translations.push(value)
        } catch (error) {
          if (error?.code === 'ENOENT') continue
          if (error instanceof SyntaxError) {
            warningCount += 1
            continue
          }
          throw error
        }
      }
      return { translations, warningCount }
    },
    async clear() {
      let files
      try {
        files = await readdir(root)
      } catch (error) {
        if (error?.code === 'ENOENT') return 0
        throw error
      }
      let removed = 0
      for (const file of files) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
        await rm(join(root, file), { force: true })
        removed += 1
      }
      return removed
    },
    /**
     * 同一个 Skill 的同一个语言只留最近 `keepPerSkill` 份。
     *
     * 一个反复迭代的 Skill 会留下 A、B、C…每一版的整份译文；只有当前指纹那一份能显示，
     * 其余的永远不会被读到。留着它们的唯一后果是磁盘慢慢变大，所以在写入之后顺手收掉。
     */
    async pruneVersions({ keepPerSkill = 2 } = {}) {
      const { translations } = await this.list()
      const groups = new Map()
      for (const record of translations) {
        const key = `${record.skillName}\u0000${record.targetLanguage}`
        const bucket = groups.get(key) ?? []
        bucket.push(record)
        groups.set(key, bucket)
      }
      let removed = 0
      for (const bucket of groups.values()) {
        if (bucket.length <= keepPerSkill) continue
        bucket.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
        for (const stale of bucket.slice(keepPerSkill)) {
          await rm(translationStoreFile(root, translationStoreKey(stale)), { force: true })
          removed += 1
        }
      }
      return removed
    },
  }
}
