import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * The default view is the Skill list.
 *
 * Under the old Session-first IA the default was the receipt, so a stored `receipt` is almost
 * never a choice — it is the default that was written down. In the Skill-first IA the first
 * screen is the list of Skills this session loaded, so `receipt` normalises to `skills` rather
 * than carrying the old first screen forward. `map` is preserved because picking the runtime map
 * is a deliberate act, and the skill list remains reachable from the top bar in either case.
 *
 * Only first-level views can be a default: the receipt is an Advanced view now, so it is not a
 * valid default at all.
 */
const DEFAULT_VIEWS = Object.freeze(['skills', 'map'])
const DEFAULT_PREFERENCES = Object.freeze({ defaultView: 'skills' })

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace')
}

function normalize(value) {
  return {
    defaultView: DEFAULT_VIEWS.includes(value?.defaultView) ? value.defaultView : DEFAULT_PREFERENCES.defaultView,
  }
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
