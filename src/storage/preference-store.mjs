import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_PREFERENCES = Object.freeze({ defaultView: 'receipt' })

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace')
}

function normalize(value) {
  return { defaultView: value?.defaultView === 'map' ? 'map' : 'receipt' }
}

export function createPreferenceStore(root = defaultRoot()) {
  const target = join(root, 'preferences.json')
  return {
    root,
    async read() {
      try {
        return normalize(JSON.parse(await readFile(target, 'utf8')))
      } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) return { ...DEFAULT_PREFERENCES }
        throw error
      }
    },
    async write(preferences) {
      const value = normalize(preferences)
      await mkdir(root, { recursive: true, mode: 0o700 })
      const temporary = `${target}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, target)
      return value
    },
  }
}
