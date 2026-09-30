/**
 * Repository Resolver — where a Skill's source lives, and how sure we are of it.
 *
 * ## The rule this module exists to keep
 *
 * DSH has **no** repository field. The Skill registry reports a provider name
 * (`filesystem`), a source bucket (`project-dsh`, `project-agents`, …) and a resource base whose
 * `directory` is an absolute local path. None of those is a repository, and the provider exports
 * no git information — the only `.git` usage in `dsh-skill-filesystem` is an internal project-root
 * probe that is never surfaced.
 *
 * So a repository is **discovered, never derived from the Skill's identity**. Two bases are
 * accepted, in order, and each one is reported so the UI can say which it is:
 *
 * 1. `basis: 'frontmatter'` — the Skill file names its own repository.
 * 2. `basis: 'git-remote'` — the file sits inside a git work tree; the remote comes from
 *    `.git/config`.
 *
 * When neither holds, the answer is `unresolved`. It is never guessed from a directory name, a
 * provider label or a cwd: a plausible-looking wrong repository is worse than an admitted
 * unknown, because the whole point of this surface is to let someone check the receipt.
 *
 * ## Credentials
 *
 * A remote URL can carry a token (`https://user:secret@host/…`). Such a remote is **refused
 * entirely** — not stripped, not partially shown — and the refusal is recorded as a limitation.
 * Half-showing a credential is how it ends up in a screenshot.
 *
 * @module repository-resolver
 */

import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { safeSourceLabel } from './source-snapshot.mjs'

/** How far up from a Skill directory to look for a work tree. */
export const GIT_ROOT_WALK_LIMIT = 12

/** Longest remote URL read out of a git config. */
const REMOTE_URL_MAX = 400

/** Frontmatter keys read as a repository, most specific first. */
const FRONTMATTER_REPOSITORY_KEYS = [
  'repository',
  'metadata.repository',
  'repo',
  'homepage',
  'metadata.homepage',
]

/** Result statuses. `unavailable` means we were not allowed to look; `unresolved` means we looked. */
export const REPOSITORY_STATUSES = ['resolved', 'unresolved', 'unavailable']

/**
 * Normalize a remote URL into something safe to display.
 *
 * @param raw - the remote URL as written in git config.
 * @returns `{ label, cloneCommand, host, path }`, or `{ refused }` with a reason.
 */
export function normalizeRemoteUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim().slice(0, REMOTE_URL_MAX) : ''
  if (!value) return { refused: 'empty-remote' }
  // A remote with credentials is refused whole: no partial display, no stripping.
  if (/\/\/[^/@]*:[^/@]*@/.test(value) || /^[A-Za-z0-9._-]+:[^@]*@/.test(value)) {
    return { refused: 'credential-bearing-remote' }
  }

  let host = ''
  let repoPath = ''
  const scp = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):(.+)$/.exec(value)
  const url = /^(?:https?|ssh|git):\/\/(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+)(?::\d+)?\/(.+)$/.exec(value)
  if (url) {
    host = url[1]
    repoPath = url[2]
  } else if (scp) {
    host = scp[1]
    repoPath = scp[2]
  } else {
    return { refused: 'unrecognised-remote' }
  }

  repoPath = repoPath.replace(/\.git$/, '').replace(/\/+$/, '')
  if (!host || !repoPath) return { refused: 'unrecognised-remote' }

  const cloneCommand = value.replace(/\.git$/, '')
  // The label goes through the same sanitizer as every other source string, so the displayed
  // value can never be an absolute local path even if the remote looks like one.
  const label = safeSourceLabel(`https://${host}/${repoPath}`)
  if (!label) return { refused: 'unrecognised-remote' }
  return { label, cloneCommand, host, path: repoPath }
}

/**
 * Read `remote.origin.url` out of a git config file.
 *
 * @param configPath - absolute path to a `.git/config`.
 * @returns the URL string, or an empty string.
 */
async function readOriginRemote(configPath) {
  let text = ''
  try {
    text = await readFile(configPath, 'utf8')
  } catch {
    return ''
  }
  // Only the `[remote "origin"]` section is read, and only its `url`. A config is a
  // user-authored file; anything else in it is not our business.
  let inOrigin = false
  for (const line of text.split(/\r?\n/)) {
    const section = /^\s*\[(.+)\]\s*$/.exec(line)
    if (section) {
      inOrigin = /^remote\s+"origin"$/.test(section[1].trim())
      continue
    }
    if (!inOrigin) continue
    const entry = /^\s*url\s*=\s*(.+?)\s*$/.exec(line)
    if (entry) return entry[1].trim().slice(0, REMOTE_URL_MAX)
  }
  return ''
}

/**
 * Resolve the git directory for a starting path, following one `gitdir:` indirection.
 *
 * @param gitPath - a `.git` directory or file.
 * @returns absolute git dir, or null.
 */
async function resolveGitDir(gitPath) {
  try {
    const info = await stat(gitPath)
    if (info.isDirectory()) return gitPath
    if (!info.isFile()) return null
    const pointer = (await readFile(gitPath, 'utf8')).trim()
    const match = /^gitdir:\s*(.+)$/.exec(pointer)
    if (!match) return null
    return isAbsolute(match[1]) ? match[1] : resolve(dirname(gitPath), match[1])
  } catch {
    return null
  }
}

/**
 * Walk up from a directory looking for a work tree.
 *
 * @param startPath - absolute directory to start from.
 * @returns `{ gitDir, root }`, or null.
 */
export async function findGitRoot(startPath) {
  if (typeof startPath !== 'string' || !isAbsolute(startPath)) return null
  let current = startPath
  for (let depth = 0; depth < GIT_ROOT_WALK_LIMIT; depth += 1) {
    const gitPath = join(current, '.git')
    const gitDir = await resolveGitDir(gitPath)
    if (gitDir) return { gitDir, root: current }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

/**
 * Resolve the repository a Skill's source belongs to.
 *
 * @param options - `{ frontmatter, resourceBase, cwd, repositoryOverride }`.
 * @returns a repository record; never throws and never guesses.
 */
export async function resolveRepositorySource(options = {}) {
  const limitations = []
  const frontmatter = options.frontmatter && typeof options.frontmatter === 'object' ? options.frontmatter : {}
  const fields = frontmatter.fields && typeof frontmatter.fields === 'object' ? frontmatter.fields : {}

  for (const key of FRONTMATTER_REPOSITORY_KEYS) {
    const raw = fields[key]
    if (typeof raw !== 'string' || !raw.trim()) continue
    const normalized = normalizeRemoteUrl(raw)
    if (normalized.refused) {
      limitations.push(`frontmatter-${key}-${normalized.refused}`)
      continue
    }
    return {
      status: 'resolved',
      basis: 'frontmatter',
      key,
      label: normalized.label,
      relativePath: null,
      cloneCommand: normalized.cloneCommand,
      limitations,
    }
  }

  // A local path base is the only base that can carry a work tree. A url or opaque base has no
  // directory to walk, so there is nothing to look at and nothing to report.
  const base = options.resourceBase && typeof options.resourceBase === 'object' ? options.resourceBase : null
  const baseDirectory = base && base.kind === 'directory' && typeof base.path === 'string' ? base.path : ''
  if (!baseDirectory) {
    return {
      status: 'unresolved',
      basis: null,
      key: null,
      label: null,
      relativePath: null,
      cloneCommand: null,
      limitations: [...limitations, 'no-local-directory-to-inspect'],
    }
  }

  const found = await findGitRoot(baseDirectory)
  if (!found) {
    return {
      status: 'unresolved',
      basis: null,
      key: null,
      label: null,
      relativePath: null,
      cloneCommand: null,
      limitations: [...limitations, 'no-git-work-tree-found'],
    }
  }

  const remote = await readOriginRemote(join(found.gitDir, 'config'))
  const relativePath = relative(found.root, baseDirectory).split(sep).join('/') || '.'
  if (!remote) {
    return {
      status: 'unresolved',
      basis: null,
      key: null,
      label: null,
      relativePath,
      cloneCommand: null,
      limitations: [...limitations, 'git-work-tree-has-no-origin-remote'],
    }
  }

  const normalized = normalizeRemoteUrl(remote)
  if (normalized.refused) {
    return {
      status: 'unresolved',
      basis: null,
      key: null,
      label: null,
      relativePath,
      cloneCommand: null,
      limitations: [...limitations, `git-remote-${normalized.refused}`],
    }
  }

  return {
    status: 'resolved',
    basis: 'git-remote',
    key: 'remote.origin.url',
    label: normalized.label,
    relativePath,
    cloneCommand: normalized.cloneCommand,
    limitations,
  }
}
