#!/usr/bin/env node
/**
 * Builds the client bundle the DSH web shell loads.
 *
 * The shell reads a plugin's `./client` export **verbatim** and composes it into a
 * combo script — it does not bundle anything. And at run time the module table
 * resolves a `require(spec)` only when `spec` is a **platform seed word**, another
 * plugin's registered client, or something already materialized. Anything else
 * throws `build-time externals drift` in the browser.
 *
 * So this script does two things that are not optional:
 *
 *   1. Inlines every dependency that is not a seed word.
 *   2. **Fails the build** if the output still asks for a module outside the seed
 *      table — a misconfiguration that would otherwise only surface as a blank
 *      plugin at run time, in the user's browser, after a restart.
 *
 * It also stamps the output with a hash of the client sources, so verification can
 * prove the shipped bundle was built from the sources being reviewed. Without that,
 * editing the client and forgetting to rebuild would ship stale UI silently.
 *
 * @module scripts/build-client
 */

import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The package id the client registers itself under. */
export const CLIENT_ID = 'dsh-skill-trace'

/**
 * Every module the DSH web shell seeds into the client module table.
 *
 * Measured from `dsh-web-frontend`'s `staticModules` factory. A require outside
 * this list can only resolve if another plugin registered it, which this plugin
 * does not rely on.
 */
export const CLIENT_SEED_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** Where the client sources live; every file here feeds the stamp. */
export const CLIENT_SOURCE_DIR = 'src/dsh/client'

/** The built artifact the shell must be pointed at. */
export const CLIENT_OUTPUT = 'dist/client.js'

/** Stamp prefix; verification recomputes the hash and compares. */
export const CLIENT_STAMP = 'dsh-skill-trace:client-build'

/** Hash of every client source file, so a stale bundle is detectable. */
export function clientSourceHash() {
  const dir = resolve(ROOT, CLIENT_SOURCE_DIR)
  const hash = createHash('sha256')
  for (const name of readdirSync(dir).sort()) {
    hash.update(name)
    hash.update(readFileSync(join(dir, name)))
  }
  hash.update(CLIENT_SEED_MODULES.join(','))
  hash.update(CLIENT_ID)
  return hash.digest('hex').slice(0, 16)
}

/** The registration wrapper the shell expects around a plugin client. */
function wrap(bundled) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(CLIENT_ID)},
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    ;(() => {
${bundled}
    })()
    return module.exports
  },
})
`
}

/** Every `require("...")` specifier left in a bundle. */
export function externalRequiresOf(source) {
  const found = new Set()
  for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) found.add(match[1])
  return [...found].sort()
}

/**
 * Bundle the client.
 *
 * @returns `{ code, map, hash, externals }`.
 * @throws when the bundle asks for a module the shell cannot resolve.
 */
export async function bundleClient({ minify = true, sourcemap = true } = {}) {
  const result = await build({
    entryPoints: [resolve(ROOT, CLIENT_SOURCE_DIR, 'client.js')],
    // An external source map needs an output path even when esbuild does not write;
    // the basename also becomes the map's `file` field, which must match the name
    // the shell serves the bundle under.
    outfile: resolve(ROOT, CLIENT_OUTPUT),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    // The shell serves bundles as `text/javascript; charset=utf-8`, so escaping
    // non-ASCII would only inflate the artifact and hide the copy.
    charset: 'utf8',
    // A dependency's stylesheet has to travel inside the bundle: the client cannot
    // fetch a second file, so CSS arrives as text and is injected at runtime.
    loader: { '.css': 'text' },
    minify,
    sourcemap: sourcemap ? 'external' : false,
    external: CLIENT_SEED_MODULES,
    write: false,
    logLevel: 'warning',
  })

  const hash = clientSourceHash()
  const js = result.outputFiles.find((file) => file.path.endsWith('.js'))
  const map = result.outputFiles.find((file) => file.path.endsWith('.map'))
  const body = `${js.text}\n// ${CLIENT_STAMP} ${hash}\n`
  const code = wrap(body)

  const externals = externalRequiresOf(js.text)
  const unresolved = externals.filter((spec) => !CLIENT_SEED_MODULES.includes(spec))
  if (unresolved.length > 0) {
    throw new Error(
      `client bundle requires modules the web shell cannot resolve: ${unresolved.join(', ')}\n` +
      'Add them as bundled dependencies (not externals), or they will throw "externals drift" in the browser.',
    )
  }

  return { code, map: map?.text ?? null, hash, externals }
}

/** Build and write `dist/client.js` (+ map). */
export async function writeClientBundle(options) {
  const { code, map, hash, externals } = await bundleClient(options)
  const out = resolve(ROOT, CLIENT_OUTPUT)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, code)
  if (map) writeFileSync(`${out}.map`, map)
  return { out, bytes: Buffer.byteLength(code), hash, externals }
}

/** True when the shipped bundle was built from the current client sources. */
export function shippedBundleIsFresh() {
  try {
    const code = readFileSync(resolve(ROOT, CLIENT_OUTPUT), 'utf8')
    const match = new RegExp(`${CLIENT_STAMP} ([0-9a-f]+)`).exec(code)
    return match !== null && match[1] === clientSourceHash()
  } catch {
    return false
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, bytes, hash, externals } = await writeClientBundle()
  console.log(`built ${CLIENT_OUTPUT} (${(bytes / 1024).toFixed(0)} KB)`)
  console.log(`  source hash : ${hash}`)
  console.log(`  externals   : ${externals.join(', ') || '(none)'}`)
}
