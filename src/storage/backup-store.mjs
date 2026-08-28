import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BACKUP_FILE = /^dsh-skill-trace-backup-(\d{8}T\d{6}Z)-([a-f0-9]{8})\.json$/
const MAX_BACKUP_BYTES = 16 * 1024 * 1024

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace', 'backups')
}

function timestamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function requiredBackupId(value) {
  if (typeof value !== 'string' || !BACKUP_FILE.test(value)) throw new Error('backupId 无效')
  return value
}

function validateArchive(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份不是合法对象')
  if (value.format !== 'dsh-skill-trace.local-backup') throw new Error('备份格式不受支持')
  if (value.formatVersion !== 1) throw new Error('备份版本不受支持')
  if (!Number.isSafeInteger(value.exportedAt) || value.exportedAt <= 0) throw new Error('备份时间无效')
  if (!Array.isArray(value.receipts)) throw new Error('备份收据列表无效')
  if (value.receipts.length > 5000) throw new Error('备份收据数量超限')
  if (value.receiptCount !== value.receipts.length) throw new Error('备份收据数量不一致')
  return value
}

function metadata(id, archive, size) {
  return {
    id,
    filename: id,
    createdAt: Number(archive.exportedAt) || 0,
    receiptCount: archive.receiptCount,
    skippedReceiptCount: Math.min(99, Math.max(0, Number(archive.skippedReceiptCount) || 0)),
    size,
    reason: ['manual', 'before-clear', 'before-delete'].includes(archive.backupReason) ? archive.backupReason : 'manual',
  }
}

export function createBackupStore(root = defaultRoot()) {
  async function readRecord(id) {
    const backupId = requiredBackupId(id)
    const target = join(root, backupId)
    const info = await stat(target)
    if (!info.isFile() || info.size <= 0 || info.size > MAX_BACKUP_BYTES) throw new Error('备份文件大小无效')
    const archive = validateArchive(JSON.parse(await readFile(target, 'utf8')))
    return { archive, backup: metadata(backupId, archive, info.size) }
  }

  return {
    root,
    async create(archive, reason = 'manual') {
      const value = validateArchive({ ...archive, backupReason: reason })
      await mkdir(root, { recursive: true, mode: 0o700 })
      await chmod(root, 0o700)
      const id = `dsh-skill-trace-backup-${timestamp(value.exportedAt)}-${randomBytes(4).toString('hex')}.json`
      const target = join(root, id)
      const temporary = `${target}.${process.pid}.tmp`
      try {
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        await rename(temporary, target)
        return (await readRecord(id)).backup
      } catch (error) {
        await unlink(temporary).catch(() => {})
        throw error
      }
    },
    read: readRecord,
    async list() {
      let files
      try {
        files = await readdir(root)
      } catch (error) {
        if (error?.code === 'ENOENT') return { backups: [], warningCount: 0 }
        throw error
      }
      const backups = []
      let warningCount = 0
      for (const file of files) {
        if (!BACKUP_FILE.test(file)) continue
        try {
          backups.push((await readRecord(file)).backup)
        } catch {
          warningCount += 1
        }
      }
      backups.sort((a, b) => b.createdAt - a.createdAt || b.filename.localeCompare(a.filename, 'en'))
      return { backups, warningCount }
    },
  }
}

export { MAX_BACKUP_BYTES, validateArchive }
