import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearTranslationCache,
  readCachedTranslation,
  translationCacheKey,
  translationCacheSize,
  writeCachedTranslation,
} from '../src/core/translation-cache.mjs'

// 译文缓存的全部行为。
//
// 存在的理由是一个用户在真实应用里提出的要求：在插件里从一个 Skill 切到另一个再切回来，
// 译文还在；退出 DeepSeek Harness 才清掉。功能是纯数据，所以它不需要人眼验收 ——
// 需要人眼的是它**看起来**对不对，而"切回来还在不在"这种事没有理由靠点击来证明。
//
// 另一半（"只存内存"）这里证不了，交给 `scripts/verify-project.mjs`：那个模块不许出现
// localStorage / sessionStorage / 任何写盘调用。

const ready = (text) => ({
  state: 'ready',
  text,
  sha: 'sha256:aaaa',
  error: '',
  chunkCount: 2,
  fallbackChunks: 0,
  fallbackReasons: [],
})

test('a translation outlives the page it was made on', () => {
  clearTranslationCache()
  const key = translationCacheKey('session-1', 'ui-craft', 'sha256:a')
  writeCachedTranslation(key, ready('译文'))
  // 换个页面组件再来读：同一次进程里应该拿回同一份译文。
  assert.equal(readCachedTranslation(key)?.text, '译文')
})

test('a changed definition never inherits the old translation', () => {
  // 这是缓存成立的**前提**：正文换了，旧译文就配不上屏幕了，宁可重译。
  clearTranslationCache()
  writeCachedTranslation(translationCacheKey('session-1', 'ui-craft', 'sha256:a'), ready('旧'))
  assert.equal(readCachedTranslation(translationCacheKey('session-1', 'ui-craft', 'sha256:b')), null, '指纹变了')
  assert.equal(readCachedTranslation(translationCacheKey('session-1', 'another-skill', 'sha256:a')), null, 'Skill 变了')
  assert.equal(readCachedTranslation(translationCacheKey('session-2', 'ui-craft', 'sha256:a')), null, '会话变了')
})

test('the cache is dropped when the plugin goes away', () => {
  clearTranslationCache()
  writeCachedTranslation(translationCacheKey('s', 'a', '1'), ready('x'))
  assert.equal(translationCacheSize(), 1)
  // 插件卸载 = 模块消失 = 这份数据没了。在测试里就是这一句。
  clearTranslationCache()
  assert.equal(translationCacheSize(), 0)
  assert.equal(readCachedTranslation(translationCacheKey('s', 'a', '1')), null)
})

test('the oldest entry is evicted, and reading refreshes what counts as old', () => {
  clearTranslationCache()
  for (let index = 0; index < 8; index += 1) {
    writeCachedTranslation(translationCacheKey('s', `skill-${index}`, '1'), ready(String(index)))
  }
  // 用一下最早的那份：它就不该再算"最久没用过"。
  assert.equal(readCachedTranslation(translationCacheKey('s', 'skill-0', '1')).text, '0')
  writeCachedTranslation(translationCacheKey('s', 'skill-8', '1'), ready('8'))
  assert.equal(translationCacheSize(), 8, '上限之外不再涨')
  assert.ok(readCachedTranslation(translationCacheKey('s', 'skill-0', '1')), '刚读过的还在')
  assert.equal(readCachedTranslation(translationCacheKey('s', 'skill-1', '1')), null, '先走的该是最久没用过的')
})
