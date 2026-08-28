import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace', 'receipts')
}

function receiptFile(root, sessionId) {
  const digest = createHash('sha256').update(String(sessionId)).digest('hex')
  return join(root, `${digest}.json`)
}

export function createReceiptStore(root = defaultRoot()) {
  return {
    root,
    async read(sessionId) {
      try {
        const text = await readFile(receiptFile(root, sessionId), 'utf8')
        const value = JSON.parse(text)
        return value?.sessionId === sessionId ? value : null
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
      }
    },
    async write(receipt) {
      await mkdir(root, { recursive: true, mode: 0o700 })
      const target = receiptFile(root, receipt.sessionId)
      const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
      try {
        await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
        await rename(temporary, target)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
      }
      return receipt
    },
    async delete(sessionId) {
      await rm(receiptFile(root, sessionId), { force: true })
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
    async list() {
      let files
      try {
        files = await readdir(root)
      } catch (error) {
        if (error?.code === 'ENOENT') return { receipts: [], warningCount: 0 }
        throw error
      }
      const receipts = []
      let warningCount = 0
      for (const file of files) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
        try {
          const value = JSON.parse(await readFile(join(root, file), 'utf8'))
          if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.sessionId !== 'string') {
            warningCount += 1
            continue
          }
          receipts.push(value)
        } catch (error) {
          if (error?.code === 'ENOENT') continue
          if (error instanceof SyntaxError) {
            warningCount += 1
            continue
          }
          throw error
        }
      }
      return { receipts, warningCount }
    },
    async prune(keep) {
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
        try {
          const target = join(root, file)
          const value = JSON.parse(await readFile(target, 'utf8'))
          if (!keep(value)) {
            await rm(target, { force: true })
            removed += 1
          }
        } catch (error) {
          if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
        }
      }
      return removed
    },
  }
}
