import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  FORBIDDEN_LINEAGE_FIELDS,
  inspectLineageRecord,
  isLineageFileName,
  lineageFileName,
  normalizeLineageRecord,
} from '../core/skill-lineage.mjs'

/**
 * Skill 复刻血缘的磁盘副本（v0.8 §17.3）。
 *
 * 与 `translation-store.mjs` / `receipt-store.mjs` 同一套约定：默认根
 * `~/.dsh/skill-trace`，目录 0700、文件 0600、临时文件 + rename 的原子写。
 *
 * 四条与收据不同的规矩，都写在代码里而不是只写在文档里：
 *
 * 1. **一个目标 Skill 只有一条记录。** 文件名 = 目标名的摘要（`lineageFileName`），
 *    所以「同一个目标名再次被复刻」是**覆盖**。用户后来改了目标 Skill 的 `SKILL.md`、
 *    `references/`、`scripts/` 都**不产生新记录** —— 那些变化归 Diff（`FR-EVO-004`）。
 * 2. **不复用 translation store。** 键不同、拒绝字段不同、生命周期不同（`FR-EVO-007`）；
 *    两者只是碰巧用了同一套「原子写 + 0600」的落盘约定。
 * 3. **不写进 Skill 目录。** 写进去会污染该 Skill 的 bundle，并被后续的完整复刻一起拷走。
 * 4. **不进收据、不进会话日志。** 收据里那个 `lineage` 是**会话血统**，与这里无关。
 *
 * 读一条不存在的记录返回 `null` 而不是抛错：`/skill-trace/skill` 上的绝大多数 Skill
 * 都不是复刻出来的，那不是异常状态。
 */

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace', 'lineage')
}

function sameTarget(record, targetSkillName) {
  return typeof record?.targetSkillName === 'string'
    && record.targetSkillName.trim() === String(targetSkillName ?? '').trim()
}

export function createSkillLineageStore(root = defaultRoot()) {
  const fileFor = (targetSkillName) => join(root, lineageFileName(targetSkillName))

  return {
    root,

    /**
     * 读一个目标 Skill 的血缘。没有、坏掉、或文件里的目标名与请求不符（有人手改过文件名）
     * 一律当作没有 —— 血缘是事实，宁可不显示也不能显示错的。
     */
    async read(targetSkillName) {
      try {
        const value = JSON.parse(await readFile(fileFor(targetSkillName), 'utf8'))
        if (!inspectLineageRecord(value).ok) return null
        return sameTarget(value, targetSkillName) ? value : null
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        if (error instanceof SyntaxError) return null
        throw error
      }
    },

    async write(record) {
      const verdict = inspectLineageRecord(record)
      if (!verdict.ok) throw new Error(`血缘记录不可保存：${verdict.reason}`)
      const previous = await this.read(record.targetSkillName)
      const value = normalizeLineageRecord(record, Date.now(), previous)
      await mkdir(root, { recursive: true, mode: 0o700 })
      const target = fileFor(value.targetSkillName)
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

    /** 某个来源 Skill 被复刻成了哪些 Skill。这是「谁来自我」的方向。 */
    async findBySource(sourceSkillName) {
      const name = String(sourceSkillName ?? '').trim()
      const { records } = await this.list()
      return records.filter((record) => record.sourceSkillName === name)
    },

    /** 一个目标 Skill 的直接来源。与 `read` 同一件事，名字更贴近调用者的问法。 */
    async findByTarget(targetSkillName) {
      return this.read(targetSkillName)
    },

    async list() {
      let files
      try {
        files = await readdir(root)
      } catch (error) {
        if (error?.code === 'ENOENT') return { records: [], warningCount: 0 }
        throw error
      }
      const records = []
      let warningCount = 0
      for (const file of files) {
        if (!isLineageFileName(file)) continue
        try {
          const value = JSON.parse(await readFile(join(root, file), 'utf8'))
          if (!inspectLineageRecord(value).ok || lineageFileName(value.targetSkillName) !== file) {
            warningCount += 1
            continue
          }
          records.push(value)
        } catch (error) {
          if (error?.code === 'ENOENT') continue
          if (error instanceof SyntaxError) {
            warningCount += 1
            continue
          }
          throw error
        }
      }
      return { records, warningCount }
    },

    /** 精确删除：目标名决定文件名，没有模糊删除。 */
    async delete(targetSkillName) {
      await rm(fileFor(targetSkillName), { force: true })
    },

    async clear() {
      const { records } = await this.list()
      for (const record of records) await rm(fileFor(record.targetSkillName), { force: true })
      return records.length
    },

    /** 记录里不允许出现的字段。导出是为了让「拒绝字段清单」可被测试与守卫直接读到。 */
    forbiddenFields: FORBIDDEN_LINEAGE_FIELDS,
  }
}
