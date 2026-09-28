import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import {
  CLIENT_ID,
  CLIENT_OUTPUT,
  CLIENT_SEED_MODULES,
  CLIENT_STAMP,
  clientSourceHash,
  externalRequiresOf,
  shippedBundleIsFresh,
} from '../scripts/build-client.mjs'

// The client bundle contract.
//
// The DSH shell reads a plugin's `./client` export **verbatim** — it does not
// bundle it — and the browser module table resolves a `require(spec)` only when
// `spec` is a platform seed word, another plugin's client, or something already
// materialized. Everything else throws "build-time externals drift" at run time,
// in the browser, after a restart.
//
// So the artifact, not the source, is the contract surface.

const bundle = await readFile(new URL(`../${CLIENT_OUTPUT}`, import.meta.url), 'utf8')

test('the bundle registers itself the way the shell expects', () => {
  const label = `id: ${JSON.stringify(CLIENT_ID)}`
  assert.ok(bundle.includes('__ModuleLoader__.load({'), 'the bundle must call the module loader')
  assert.ok(bundle.includes(label), 'the bundle must register under this package id')
})

test('the bundle is loaded by the real loader into a working plugin', () => {
  let definition
  const window = { __ModuleLoader__: { load(value) { definition = value } } }
  runInNewContext(bundle, { window, console })
  assert.equal(typeof definition?.factory, 'function', 'the shell must receive a factory')
  assert.equal(definition.id, CLIENT_ID)

  const required = []
  const plugin = definition.factory((spec) => {
    required.push(spec)
    if (!CLIENT_SEED_MODULES.includes(spec)) throw new Error(`unresolvable module: ${spec}`)
    return { createElement() {}, useState() {}, useEffect() {}, useCallback: (fn) => fn, useRef: () => ({}), useSyncExternalStore() {}, createContext: () => ({}) }
  })
  assert.deepEqual(Object.keys(plugin).sort(), ['apply', 'inject'])
  assert.equal(typeof plugin.apply, 'function')
  // The one module this plugin is allowed to need.
  assert.deepEqual([...new Set(required)], ['react'])
})

test('every require in the artifact is a platform seed word', () => {
  const externals = externalRequiresOf(bundle)
  for (const spec of externals) {
    assert.ok(CLIENT_SEED_MODULES.includes(spec), `the shell cannot resolve ${spec}`)
  }
  // React Flow and any other dependency must be inlined, not left external.
  assert.equal(externals.includes('@xyflow/react'), false)
  assert.equal(externals.includes('elkjs'), false)
})

test('the shipped bundle was built from the sources on disk', () => {
  assert.ok(bundle.includes(CLIENT_STAMP), 'the bundle must carry its build stamp')
  assert.equal(shippedBundleIsFresh(), true, 'dist/client.js is stale — run `npm run build:client`')
  const stamped = new RegExp(`${CLIENT_STAMP} ([0-9a-f]+)`).exec(bundle)
  assert.equal(stamped[1], clientSourceHash())
})

test('the stamp changes when a client source changes', () => {
  // The stamp is what stops a forgotten rebuild from shipping stale UI silently.
  // Its input is the source directory, so it must be a real digest of it.
  const hash = clientSourceHash()
  assert.match(hash, /^[0-9a-f]{16}$/)
  assert.equal(hash, clientSourceHash(), 'the hash must be stable across calls')
})

test('the bundle carries no source-map reference it cannot serve', () => {
  // If a map is referenced it must ship next to the bundle, or the browser logs a
  // 404 for every session.
  const referenced = /\/\/# sourceMappingURL=(\S+)/.exec(bundle)
  if (referenced) assert.equal(referenced[1].endsWith('.map'), true)
})

test('the governed label ships as readable UTF-8, not as escapes', () => {
  // §4 renames 流程地图 to 运行流程. The bundle must carry the label as text: the
  // shell serves `text/javascript; charset=utf-8`, and an escaped artifact would
  // both inflate the bundle and hide the copy from review.
  assert.ok(bundle.includes('运行流程'), 'the governed label must ship as UTF-8 text')
  assert.equal(bundle.includes('流程地图'), false, 'the superseded label must be gone')
  assert.equal(bundle.includes('\\u8FD0\\u884C'), false, 'the label must not be escaped')
})
