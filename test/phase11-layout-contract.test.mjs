import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Layout Contract Guard.
//
// This exists because of a specific failure, and it guards that failure rather than the symptom.
//
// The plugin's root rule — the one carrying font-size, line-height, height, overflow, colour and
// background — ended up nested inside a `@media(max-width:1050px)` block. The cause was a
// deleted closing brace: `@media(max-width:1050px){...}}` where the second brace closed the
// media query. Removing it left the query unterminated, so it swallowed the root rule and every
// rule after it.
//
// The result was invisible to `npm test`. All 333 tests passed while, at any desktop width:
//   · font-size fell back to the DSH host's 16px instead of 13px, so the whole UI rendered a
//     size larger — tabs, filters, buttons, the My Skill list
//   · overflow computed to `visible` instead of `hidden`
//   · background computed transparent, so the panel leaked the host surface
//   · height resolved to content height, so the Runtime Graph never filled the host area
//
// No test could see it because none of them parsed the stylesheet as CSS. It was found only by
// reading the browser's CSSOM. The guard below closes that gap statically: it walks the emitted
// stylesheet, tracks block depth, and requires the root rule to sit at depth 0.

const root = resolve(import.meta.dirname, '..')

/** Pull one stylesheet template literal out of the client source. */
function stylesheetSource() {
  const source = readFileSync(resolve(root, 'src/dsh/client/client.js'), 'utf8')
  const start = source.indexOf('function installStyles()')
  assert.ok(start > 0, 'installStyles() must exist')
  const end = source.indexOf('function installFlowStyles()')
  assert.ok(end > start, 'installFlowStyles() must follow installStyles()')
  const body = source.slice(start, end)
  const open = body.indexOf('`')
  assert.ok(open >= 0, 'installStyles() must return a template literal')
  // The *matching* backtick, not the last one in the function: the JSDoc that follows also
  // contains backticks, and taking the last one pulls trailing JavaScript into the "stylesheet",
  // whose unbalanced braces then look like a CSS defect.
  const close = body.indexOf('`', open + 1)
  assert.ok(close > open, 'the stylesheet template literal must be terminated')
  return body.slice(open + 1, close)
}

/**
 * Report the brace depth at which a selector's rule sits.
 *
 * Blocks are tracked with a plain counter, which is what the browser does for the purposes of
 * this check: a rule inside `@media{...}` is at depth 1, a top-level rule at depth 0. Strings and
 * comments are skipped so their braces cannot skew the count.
 *
 * @param css - the stylesheet text.
 * @param selector - the selector to locate.
 * @returns the depth, or -1 when the selector is absent.
 */
function depthOf(css, selector) {
  let depth = 0
  let i = 0
  let lastSelectorAt = -1
  let depthAtSelector = -1
  while (i < css.length) {
    const two = css.slice(i, i + 2)
    if (two === '/*') {
      const end = css.indexOf('*/', i + 2)
      i = end < 0 ? css.length : end + 2
      continue
    }
    const ch = css[i]
    if (ch === '{') {
      depth += 1
      i += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      i += 1
      continue
    }
    if (ch === selector[0] && css.startsWith(selector, i)) {
      // Only the opening of a rule counts; `[data-plugin] *` is a different selector.
      const after = css[i + selector.length]
      if (after === '{') {
        lastSelectorAt = i
        depthAtSelector = depth
      }
      i += selector.length
      continue
    }
    i += 1
  }
  return lastSelectorAt < 0 ? -1 : depthAtSelector
}

test('the plugin root rule exists and is not trapped inside a media query', () => {
  const css = stylesheetSource()
  const selector = '[data-plugin="dsh-skill-trace"]'
  const depth = depthOf(css, selector)
  assert.notEqual(depth, -1, `${selector} must be declared`)
  assert.equal(
    depth,
    0,
    `${selector} is at brace depth ${depth}, i.e. inside another block — most likely a `
    + '@media query missing its closing brace. At desktop widths such a rule never applies, '
    + 'which silently reverts typography, background and height to the host defaults.',
  )
})

test('the root rule carries the typography and layout base', () => {
  const css = stylesheetSource()
  // The selector is declared more than once — the token block first, then the rule carrying the
  // layout and typography base — so this looks for the declaration among all of them rather than
  // assuming the first is the one.
  const bodies = []
  for (let at = css.indexOf('[data-plugin="dsh-skill-trace"]{'); at >= 0; at = css.indexOf('[data-plugin="dsh-skill-trace"]{', at + 1)) {
    bodies.push(css.slice(at, css.indexOf('}', at)))
  }
  assert.ok(bodies.length > 0, 'the root rule must exist')
  const body = bodies.find((candidate) => candidate.includes('font-size:13px'))
  assert.ok(body, `no [data-plugin] rule carries the typography base; found ${bodies.length} rule(s)`)
  // Each of these was lost at some point, and each loss was invisible to the test suite:
  // font-size reverted typography to the host's 16px; line-height/colour/background leaked the
  // host surface; height and overflow are what let the graph fill the host area at all.
  for (const declaration of ['font-size:13px', 'line-height:1.45', 'overflow:hidden', 'height:var(--st-host-h,100%)']) {
    assert.ok(body.includes(declaration), `the root rule must declare ${declaration}`)
  }
})

test('no viewport units are used to size the layout chain', () => {
  const css = stylesheetSource()
  for (const selector of ['.st-shell{', '.st-layout{', '.st-main{', '.st-flow{', '.st-flow-canvas{']) {
    let i = css.indexOf(selector)
    while (i >= 0) {
      const body = css.slice(i, css.indexOf('}', i))
      // The plugin is embedded, so a viewport unit sizes it against the browser window rather
      // than the host's content area. `--st-host-h` is measured from the host instead.
      assert.ok(
        !/\d(vh|dvh|svh|lvh)/.test(body),
        `${selector} sizes itself with a viewport unit: ${body.slice(0, 120)}`,
      )
      i = css.indexOf(selector, i + 1)
    }
  }
})

test('the stylesheet has balanced braces', () => {
  const css = stylesheetSource()
  let depth = 0
  let i = 0
  while (i < css.length) {
    const two = css.slice(i, i + 2)
    if (two === '/*') {
      const end = css.indexOf('*/', i + 2)
      i = end < 0 ? css.length : end + 2
      continue
    }
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      // An unmatched `}` at the top level is how the media query lost its terminator in the
      // first place once a second brace was removed to "fix" it.
      assert.ok(depth >= 0, `unmatched closing brace at offset ${i}`)
    }
    i += 1
  }
  assert.equal(depth, 0, `stylesheet ends at brace depth ${depth} — a block is unterminated`)
})
