/**
 * Reading a stored session log from disk.
 *
 * The plugin observes live sessions through the DSH `sessions` service, but
 * `sessions.get(id)` returns only **live** sessions. Opening a past conversation
 * therefore found no events, and the Runtime Graph answered "1 node / 0 edges" for
 * a run that actually contained 1095 nodes — measured, not theorised.
 *
 * This module fills that gap by reading the durable session log the same way a live
 * session is read: parse the typed events, hand them to the reducer. It is a
 * fallback only. A live session is always preferred, because the live log is the
 * authority on the current run.
 *
 * The path convention (`~/.dsh/sessions/<workspace>/<sessionId>/session.vN.jsonl*`)
 * matches the one the plugin's own stores already use for `~/.dsh/skill-trace`.
 *
 * @module session-log
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** How many decompressed logs are kept in memory. */
export const SESSION_LOG_CACHE_LIMIT = 6

/** Filenames a session log may use, newest format version first. */
const LOG_FILE = /^session\.v(\d+)\.jsonl(\.zstd)?$/

/** Bound on a single log file, so a runaway file cannot exhaust memory. */
export const SESSION_LOG_MAX_BYTES = 512 * 1024 * 1024

export function defaultSessionsRoot() {
  return join(homedir(), '.dsh', 'sessions')
}

/**
 * Locate a session's log file.
 *
 * Sessions live under one workspace directory each, and a migrated session can
 * carry several format versions side by side; the highest version is the truth.
 *
 * @returns `{ path, formatVersion }`, or `null` when there is no log on disk.
 */
export function findSessionLogFile(sessionId, options = {}) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  // The id becomes a path segment; refuse anything that could climb out.
  if (sessionId.includes('/') || sessionId.includes('\\') || sessionId.startsWith('.')) return null
  const root = options.root ?? defaultSessionsRoot()
  let workspaces
  try {
    workspaces = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch {
    return null
  }
  let best = null
  for (const workspace of workspaces) {
    const dir = join(root, workspace.name, sessionId)
    let files
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      const match = LOG_FILE.exec(file)
      if (!match) continue
      const formatVersion = Number(match[1])
      const path = join(dir, file)
      try {
        const stats = statSync(path)
        if (!stats.isFile() || stats.size > SESSION_LOG_MAX_BYTES) continue
        if (!best || formatVersion > best.formatVersion) best = { path, formatVersion, size: stats.size, mtimeMs: stats.mtimeMs }
      } catch {
        continue
      }
    }
    if (best && best.formatVersion >= 4) break
  }
  return best
}

/**
 * Decompress a stored session log.
 *
 * DSH appends one Zstandard **frame** per write batch, and neither
 * `zstdDecompressSync` nor a `createZstdDecompress` stream continues past the first
 * frame — measured on a real log: 220 bytes / 1 line decoded, against 6350 lines
 * actually stored. DSH solves this with a Node-private stream handle, which is
 * version-fragile and not something a plugin should copy.
 *
 * Instead the frames are split on the Zstandard magic and decoded independently.
 * Every frame begins with that magic, so frame `i` spans `[start_i, start_i+1)` and
 * each slice costs only its own work. A slice that fails — which is what a magic
 * sequence occurring inside compressed data produces — falls back to decoding from
 * that offset to the end, where the decoder stops on its own at the frame
 * boundary.
 *
 * Verified against `zstdcat` on a real 5.4 MB log: 3 frames, 6350 lines, identical.
 */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Bound on the frame count decoded from one file. */
export const ZSTD_FRAME_LIMIT = 4096

/** Byte offsets at which a Zstandard frame may begin. */
export function findZstdFrameStarts(buffer, limit = ZSTD_FRAME_LIMIT) {
  const starts = []
  const last = buffer.length - ZSTD_MAGIC.length
  for (let index = 0; index <= last && starts.length < limit; index += 1) {
    if (buffer[index] === 0x28 && buffer[index + 1] === 0xb5 && buffer[index + 2] === 0x2f && buffer[index + 3] === 0xfd) {
      starts.push(index)
      index += ZSTD_MAGIC.length - 1
    }
  }
  return starts
}

export function decompressZstdFrames(buffer) {
  const starts = findZstdFrameStarts(buffer)
  if (starts.length === 0) return zstdDecompressSync(buffer)
  const parts = []
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]
    const end = starts[index + 1] ?? buffer.length
    try {
      parts.push(zstdDecompressSync(buffer.subarray(start, end)))
    } catch {
      try {
        parts.push(zstdDecompressSync(buffer.subarray(start)))
      } catch {
        // A frame that cannot be decoded at all is skipped rather than failing the
        // whole read; the caller still sees every frame that did decode.
      }
    }
  }
  if (parts.length === 0) throw new Error('no Zstandard frame could be decoded')
  return Buffer.concat(parts)
}

function parseEvents(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (!line) continue
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      // A torn tail line is expected while a session is being written; skip it
      // rather than failing the whole read.
      continue
    }
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') events.push(parsed)
  }
  return events
}

/** Bounded cache of decompressed logs, keyed by path + mtime + size. */
function createCache(limit = SESSION_LOG_CACHE_LIMIT) {
  const entries = new Map()
  return {
    get(key) {
      if (!entries.has(key)) return undefined
      const value = entries.get(key)
      // Refresh recency.
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set(key, value) {
      entries.set(key, value)
      while (entries.size > limit) entries.delete(entries.keys().next().value)
      return value
    },
    get size() {
      return entries.size
    },
  }
}

let sharedCache = createCache()

/** Test seam: drop the cached logs. */
export function clearSessionLogCache() {
  sharedCache = createCache()
}

/**
 * Read the typed events of a stored session.
 *
 * @param sessionId - the session to read.
 * @param options - `root` override and `cache` injection.
 * @returns `{ events, formatVersion, path, cached }`; `events: []` when absent.
 */
export function readSessionEvents(sessionId, options = {}) {
  const file = findSessionLogFile(sessionId, options)
  if (!file) return { events: [], formatVersion: null, path: null, cached: false, found: false }

  const key = `${file.path}:${file.mtimeMs}:${file.size}`
  const cache = options.cache ?? sharedCache
  const hit = cache.get(key)
  if (hit) return { ...hit, cached: true }

  let text
  try {
    const raw = readFileSync(file.path)
    text = file.path.endsWith('.zstd') ? decompressZstdFrames(raw).toString('utf8') : raw.toString('utf8')
  } catch (error) {
    return { events: [], formatVersion: file.formatVersion, path: file.path, cached: false, found: true, error: error.message }
  }

  const result = { events: parseEvents(text), formatVersion: file.formatVersion, path: file.path, found: true }
  cache.set(key, result)
  return { ...result, cached: false }
}
