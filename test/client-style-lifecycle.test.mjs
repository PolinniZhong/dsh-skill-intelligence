import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

// Load the artifact the shell actually loads, not the source it was built from:
// the registration wrapper only exists in the bundle.
const clientSource = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8')

function createStyleDocument() {
  const elements = new Map()
  const document = {
    createElement(tagName) {
      assert.equal(tagName, 'style')
      return {
        id: '',
        textContent: '',
        replaceWith(replacement) {
          if (elements.get(this.id) !== this) return
          elements.delete(this.id)
          elements.set(replacement.id, replacement)
        },
        remove() {
          if (elements.get(this.id) === this) elements.delete(this.id)
        },
      }
    },
    getElementById(id) {
      return elements.get(id) || null
    },
    head: {
      appendChild(element) {
        elements.set(element.id, element)
      },
    },
  }
  return document
}

function loadClientFactory(document) {
  let definition
  const window = {
    __ModuleLoader__: { load(value) { definition = value } },
    addEventListener() {},
    removeEventListener() {},
    sessionStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  }
  runInNewContext(clientSource, { window, document, console, fetch: async () => {}, setTimeout, clearTimeout })
  assert.equal(typeof definition?.factory, 'function')
  return definition.factory
}

function applyClient(factory) {
  const effects = new Map()
  const React = { createElement() {} }
  const plugin = factory((name) => {
    assert.equal(name, 'react')
    return React
  })
  plugin.apply({
    effect(setup, label) { effects.set(label, setup()) },
    locale: {
      bind() { return (value) => value },
      register() { return () => {} },
    },
    slots: { inject() {} },
  })
  return effects
}

test('a newer client instance keeps stylesheet ownership when an older instance disposes', () => {
  const document = createStyleDocument()
  const factory = loadClientFactory(document)

  const oldEffects = applyClient(factory)
  const oldStyle = document.getElementById('dsh-skill-trace-style')
  assert.ok(oldStyle)
  assert.match(oldStyle.textContent, /data-plugin="dsh-skill-trace"/)

  const newEffects = applyClient(factory)
  const newStyle = document.getElementById('dsh-skill-trace-style')
  assert.ok(newStyle)
  assert.notEqual(newStyle, oldStyle)

  oldEffects.get('dsh-skill-trace: stylesheet')()
  assert.equal(document.getElementById('dsh-skill-trace-style'), newStyle)

  newEffects.get('dsh-skill-trace: stylesheet')()
  assert.equal(document.getElementById('dsh-skill-trace-style'), null)
})
