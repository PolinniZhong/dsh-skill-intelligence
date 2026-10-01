import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * The default page is the list of Skills this conversation loaded.
 *
 * Under the old Session-first IA the first screen was the runtime map, and the client wrote that
 * default down without ever asking. So a stored `map` is ambiguous: it is either a deliberate
 * choice or the old first screen recorded as if it were one. Reading it as a choice carried the
 * old information architecture forward — the plugin still opened on the runtime map after the
 * Skill-first release, which is exactly the screen the release was meant to replace.
 *
 * Intent cannot be recovered from a file that never recorded it, so this store records it going
 * forward: `version` names the IA whose default was in effect when the file was written. **Reading**
 * an unversioned file therefore means "no preference stated" and normalises to the current list;
 * **writing** always stamps the current version, so a page the user picks now survives.
 *
 * v3 drops the v0.5 vocabulary entirely. `skills`/`map`/`receipt` were *views of a session*; v0.6's
 * two first-level pages are the two questions a user actually asks — which Skills did this run
 * load, and which Skills can this environment discover. The runtime flow, the runtime graph and the
 * receipt are no longer pages at all (§4), so a stored `map` from v2 is not a page we can honour:
 * the version bump turns it into "no preference stated" and the reader lands on the Skill list.
 * That is the intended outcome, not a side effect.
 */
const PREFERENCES_VERSION = 3
const DEFAULT_VIEWS = Object.freeze(['current', 'installed'])
const DEFAULT_PREFERENCES = Object.freeze({ version: PREFERENCES_VERSION, defaultView: 'current' })

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace')
}

/** 读路径：只有**当前版本**写下的视图才算"用户选择"；旧文件的 `map` 是旧 IA 的第一屏，不是选择。 */
function normalizeStored(value) {
  const chosen = value?.version === PREFERENCES_VERSION && DEFAULT_VIEWS.includes(value?.defaultView)
  return {
    version: PREFERENCES_VERSION,
    defaultView: chosen ? value.defaultView : DEFAULT_PREFERENCES.defaultView,
  }
}

/** 写路径：本版客户端表达的意图直接成立，并盖上新版本号——诚实记录"这是新版写下的选择"。 */
function normalizeChosen(value) {
  return {
    version: PREFERENCES_VERSION,
    defaultView: DEFAULT_VIEWS.includes(value?.defaultView) ? value.defaultView : DEFAULT_PREFERENCES.defaultView,
  }
}

export function createPreferenceStore(root = defaultRoot()) {
  const target = join(root, 'preferences.json')
  return {
    root,
    async read() {
      try {
        return normalizeStored(JSON.parse(await readFile(target, 'utf8')))
      } catch (error) {
        if (error?.code === 'ENOENT' || error instanceof SyntaxError) return { ...DEFAULT_PREFERENCES }
        throw error
      }
    },
    async write(preferences) {
      const value = normalizeChosen(preferences)
      await mkdir(root, { recursive: true, mode: 0o700 })
      const temporary = `${target}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, target)
      return value
    },
  }
}

export { PREFERENCES_VERSION }
