/**
 * V0.9.1 —— **本次修改对比**用的内存快照。
 *
 * 这里存的只有**一次修改事务**在开始之前的样子：`SKILL.md` 的正文、目录清单的指纹、
 * 来源 Skill 的指纹、以及用户这次勾的范围。它只活在宿主进程的内存里：
 *
 * - 不写磁盘、不建目录、不进 receipt、不进 session log、不上传；
 * - DSH 重启之后什么都不剩，那时只能如实说「本次修改前状态不可用」；
 * - 过期（默认 30 分钟）之后同样什么都不剩 —— 宁可说不知道，也不拿旧内容冒充「刚刚的修改前」。
 *
 * 为什么不把「修改前」压成一个 sha256 了事：那样只能回答「变没变」，回答不了「改了什么」，
 * 而「改了什么」正是这个功能存在的理由。为什么不落盘：`SKILL.md` 一直是现读现返、从不落盘，
 * 为了做一次对比就把它长期存下来，会把这个项目最硬的那条隐私纪律改成另一个样子。
 *
 * 能力名是「本次修改对比」，不是「历史版本对比」：这里没有版本实体，没有时间线。
 */

/** 默认保留 30 分钟：够用户看完方案、确认、等 Agent 改完，又不至于把一小时前的东西翻出来。 */
export const MODIFICATION_SNAPSHOT_TTL_MS = 30 * 60 * 1000

/** 最多同时留几份。超出时丢最早的一份 —— 这是内存，不是档案库。 */
export const MODIFICATION_SNAPSHOT_MAX = 32

function normalizeId(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeResources(resources) {
  // 拿不到清单时要 `null`，不要 `[]`：空数组会被读成「目录真的是空的」，
  // 那会让「引用的文件都不存在」变成一句假指控。
  if (!Array.isArray(resources)) return null
  const files = []
  for (const file of resources) {
    if (!file || typeof file.path !== 'string') continue
    files.push({ path: file.path, sha256: typeof file.sha256 === 'string' ? file.sha256 : null })
  }
  return files
}

/**
 * 建一个内存快照库。`now` 可以注入，测试里就不用真的等 30 分钟。
 *
 * 返回的每个方法都不抛错：参数不合法时返回 `null` / `false`，由调用方决定怎么说话。
 */
export function createModificationSnapshotStore({ ttlMs = MODIFICATION_SNAPSHOT_TTL_MS, now = Date.now, max = MODIFICATION_SNAPSHOT_MAX } = {}) {
  const entries = new Map()
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : MODIFICATION_SNAPSHOT_TTL_MS
  const clock = typeof now === 'function' ? now : Date.now
  const limit = Number.isFinite(max) && max > 0 ? max : MODIFICATION_SNAPSHOT_MAX

  const keyOf = (sessionId, skillName) => `${sessionId}\u0000${skillName}`

  function expired(entry, at) {
    return at - entry.createdAt >= ttl
  }

  function prune() {
    const at = clock()
    let removed = 0
    for (const [key, entry] of entries) {
      if (expired(entry, at)) {
        entries.delete(key)
        removed += 1
      }
    }
    return removed
  }

  function trim() {
    if (entries.size <= limit) return 0
    const ordered = [...entries.values()].sort((a, b) => a.createdAt - b.createdAt)
    let removed = 0
    while (entries.size > limit && ordered.length > 0) {
      const oldest = ordered.shift()
      entries.delete(keyOf(oldest.sessionId, oldest.skillName))
      removed += 1
    }
    return removed
  }

  return {
    /**
     * 记下「这次修改之前的样子」。同一个会话 + 同一个 Skill 再开一次会**覆盖**上一份：
     * 上一次没走完的事务不该被当成这一次的「修改前」。
     */
    begin(input) {
      // 默认参数只对 `undefined` 生效；`null` 也要收敛成空对象，否则一个空请求会抛错。
      const { sessionId, skillName, sourceSha256, text, resources, scopes, profiles } =
        input !== null && typeof input === 'object' ? input : {}
      const session = normalizeId(sessionId)
      const name = normalizeId(skillName)
      if (!session || !name) return null
      const createdAt = clock()
      const entry = {
        sessionId: session,
        skillName: name,
        createdAt,
        sourceSha256: typeof sourceSha256 === 'string' ? sourceSha256 : null,
        before: {
          text: typeof text === 'string' ? text : null,
          resources: normalizeResources(resources),
        },
        scopes: Array.isArray(scopes) ? scopes.filter((id) => typeof id === 'string') : [],
        profiles: Array.isArray(profiles) ? profiles.filter((id) => typeof id === 'string') : [],
      }
      entries.set(keyOf(session, name), entry)
      prune()
      trim()
      return { sessionId: session, skillName: name, createdAt, scopes: [...entry.scopes], profiles: [...entry.profiles] }
    },

    /** 取回「修改前」。没有、过期、或已经释放过，一律 `null` —— 不返回半份数据。 */
    read(input) {
      const { sessionId, skillName } = input !== null && typeof input === 'object' ? input : {}
      const session = normalizeId(sessionId)
      const name = normalizeId(skillName)
      if (!session || !name) return null
      const entry = entries.get(keyOf(session, name))
      if (!entry) return null
      if (expired(entry, clock())) {
        entries.delete(keyOf(session, name))
        return null
      }
      return {
        sessionId: entry.sessionId,
        skillName: entry.skillName,
        createdAt: entry.createdAt,
        sourceSha256: entry.sourceSha256,
        text: entry.before.text,
        resources: entry.before.resources === null ? null : entry.before.resources.map((file) => ({ ...file })),
        scopes: [...entry.scopes],
        profiles: [...entry.profiles],
      }
    },

    /**
     * 释放。对比做完就调用它 —— 「改前快照」没有理由比这次修改活得更久。
     * 返回是否真的释放了一份（界面上那句「快照已释放」要有依据）。
     */
    release(input) {
      const { sessionId, skillName } = input !== null && typeof input === 'object' ? input : {}
      const session = normalizeId(sessionId)
      const name = normalizeId(skillName)
      if (!session || !name) return false
      return entries.delete(keyOf(session, name))
    },

    /** 清掉过期项，返回清掉几份。宿主可以顺手调，也可以不调。 */
    prune,

    /** 现在留了几份（测试与诊断用；不是界面文案）。 */
    size() {
      prune()
      return entries.size
    },
  }
}
