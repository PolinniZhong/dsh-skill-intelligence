// 译文在内存里的寿命。
//
// 用户的要求很短：在插件里从一个 Skill 切到另一个再切回来，译文还在；退出 DeepSeek
// Harness 才清掉。所以它就是一个模块级的 Map —— 插件卸载时模块一起消失，不需要谁来
// 清理，也没有 localStorage、没有落盘、没有 IPC。v0.6 §12.4 的「只存内存、不改 SKILL.md、
// 不进对话」原样成立，变的只是内存里这份数据活多久。
//
// 键里带 `sha`：定义换了就是另一份译文。拿一份对不上屏幕正文的译文去显示，
// 比没有译文更糟。
//
// 纯函数、无 node 内置依赖，所以能被内联进客户端（与 installed-view.mjs 同样的理由）。

// 上限按**条数**记，不按字节：一条译文最大也就几十 KB，8 条足够覆盖一个人在一次
// 会话里真正会翻的 Skill 数，而再多也不会把内存撑坏。
const LIMIT = 8

const entries = new Map()

export function translationCacheKey(sessionId, skillName, sha) {
  return `${sessionId}\u0000${skillName}\u0000${sha}`
}

/** 命中就返回，同时把它挪到队尾 —— 淘汰时先丢最久没用过的那份。 */
export function readCachedTranslation(key) {
  const hit = entries.get(key)
  if (!hit) return null
  entries.delete(key)
  entries.set(key, hit)
  return hit
}

export function writeCachedTranslation(key, value) {
  entries.delete(key)
  entries.set(key, value)
  while (entries.size > LIMIT) {
    entries.delete(entries.keys().next().value)
  }
}

/** 只给测试用：把"插件退出"这件事在一个进程里演出来。 */
export function clearTranslationCache() {
  entries.clear()
}

/** 只给测试用：看清淘汰真的发生了。 */
export function translationCacheSize() {
  return entries.size
}
