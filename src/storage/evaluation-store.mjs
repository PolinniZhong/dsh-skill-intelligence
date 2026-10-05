import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * V1.0「Skill 评测」的落盘面（`spec/SDD.md` §22.7）。
 *
 * 与 `translation-store.mjs` / `receipt-store.mjs` 同一套约定：目录 `0700`、文件 `0600`、
 * 临时文件 + `rename` 的原子写、读的时候把坏文件当空态。
 *
 * 四条与收据**刻意不同**的规矩，都写在代码里而不是只写在文档里：
 *
 * 1. **持久化键不含 sessionId。** 评测要跨会话复用：`caseId` 是一次实验的身份，
 *    `runId` 是一次运行的身份，两者都与「哪次会话」无关。写进来就抛错。
 * 2. **Case 的任务 Prompt 正文与用户的判定文本是刻意落盘的。** 不存下来，Case 无法复现、
 *    「改前改后」也无从对照。这是本插件唯一一处把用户的任务正文写进磁盘的地方，
 *    所以它必须出现在 `docs/PRIVACY.md` 里，且目录权限逐字写死。
 * 3. **工具参数与结果、模型回复正文永不落盘**（`FR-EVAL-007`）：证据只记元数据
 *    （工具名与次数、加载状态、指纹三态），落到磁盘的也只有这些。
 * 4. **不存任何聚合指标**（`FR-EVAL-012`）：`score` / `rate` / `variance` 之类的字段名
 *    在写入时直接抛错 —— 这一版的永久禁令要在**最靠近磁盘**的地方也有一道闸。
 */

export const EVALUATION_STORE_VERSION = 1

/** 记录里**不允许**出现的字段。它们是隐私边界与永久禁令，不是命名风格。 */
export const EVALUATION_FORBIDDEN_FIELDS = Object.freeze([
  'sessionId',
  'sessionID',
  'messages',
  'conversation',
  'args',
  'toolArguments',
  'toolResult',
  'results',
  'cwd',
  'absolutePath',
  'score',
  'scores',
  'skillScore',
  'passRate',
  'rate',
  'variance',
  'stddev',
  'ranking',
  'trend',
])

export const EVALUATION_STORE_DEFAULTS = Object.freeze({
  maxCases: 200,
  maxRunsPerCase: 50,
})

const CASE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

function defaultRoot() {
  return join(homedir(), '.dsh', 'skill-trace', 'evaluation')
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function caseHex(caseId) {
  return caseId.slice('sha256:'.length)
}

/** Case 文件名只由 `caseId` 决定：不带会话、不带 Skill 名、不带时间。 */
export function evaluationCaseFile(root, caseId) {
  return join(root, 'cases', `${caseHex(caseId)}.json`)
}

/** Run 文件名由 `caseId` + `runId` 决定：一个 Case 的所有运行放在它自己的目录里。 */
export function evaluationRunFile(root, caseId, runId) {
  return join(root, 'runs', caseHex(caseId), `${runId}.json`)
}

/** 深度扫一遍：任何一个层级出现禁字段都不许写。 */
function findForbiddenField(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return null
  if (seen.has(value)) return null
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenField(item, seen)
      if (found) return found
    }
    return null
  }
  for (const [key, item] of Object.entries(value)) {
    if (EVALUATION_FORBIDDEN_FIELDS.includes(key)) return key
    const found = findForbiddenField(item, seen)
    if (found) return found
  }
  return null
}

function inspectCommon(record, kind) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'not-an-object' }
  const forbidden = findForbiddenField(record)
  if (forbidden) return { ok: false, reason: `forbidden-field:${forbidden}` }
  if (kind === 'case') {
    if (!CASE_ID_PATTERN.test(text(record.caseId))) return { ok: false, reason: 'invalid-case-id' }
    if (!text(record.skillName)) return { ok: false, reason: 'missing-skill-name' }
    if (!record.taskPrompt || typeof record.taskPrompt !== 'object') return { ok: false, reason: 'missing-task-prompt' }
    if (!text(record.taskPrompt.text)) return { ok: false, reason: 'missing-task-prompt-text' }
  } else {
    if (!CASE_ID_PATTERN.test(text(record.caseId))) return { ok: false, reason: 'invalid-case-id' }
    if (!RUN_ID_PATTERN.test(text(record.runId))) return { ok: false, reason: 'invalid-run-id' }
  }
  return { ok: true }
}

export function inspectEvaluationCase(record) {
  return inspectCommon(record, 'case')
}

export function inspectEvaluationRun(record) {
  return inspectCommon(record, 'run')
}

function normalizeCase(record, now) {
  return {
    ...record,
    schemaVersion: EVALUATION_STORE_VERSION,
    caseId: text(record.caseId),
    skillName: text(record.skillName),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    updatedAt: now,
  }
}

function normalizeRun(record, now) {
  return {
    ...record,
    schemaVersion: EVALUATION_STORE_VERSION,
    caseId: text(record.caseId),
    runId: text(record.runId),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    updatedAt: now,
  }
}

async function readJson(file) {
  try {
    return { value: JSON.parse(await readFile(file, 'utf8')) }
  } catch (error) {
    if (error?.code === 'ENOENT') return { value: null }
    if (error instanceof SyntaxError) return { value: null, broken: true }
    throw error
  }
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  return value
}

async function readdirSafe(dir) {
  try {
    return await readdir(dir)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

/**
 * 一个 Case 一次运行，落一个文件。读取端永远 fail-soft：坏文件被跳过并计数，
 * 不是抛错给界面 —— 磁盘上多一个坏文件不该让整块界面对不起来。
 */
export function createEvaluationStore(root = defaultRoot(), options = {}) {
  const maxCases = Number.isInteger(options.maxCases) ? options.maxCases : EVALUATION_STORE_DEFAULTS.maxCases
  const maxRunsPerCase = Number.isInteger(options.maxRunsPerCase)
    ? options.maxRunsPerCase
    : EVALUATION_STORE_DEFAULTS.maxRunsPerCase
  const now = typeof options.now === 'function' ? options.now : Date.now

  return {
    root,
    maxCases,
    maxRunsPerCase,

    async saveCase(record) {
      const verdict = inspectEvaluationCase(record)
      if (!verdict.ok) throw new Error(`评测 Case 不可保存：${verdict.reason}`)
      const value = normalizeCase(record, now())
      await writeJson(evaluationCaseFile(root, value.caseId), value)
      await this.pruneCases()
      return value
    },

    async readCase(caseId) {
      if (!CASE_ID_PATTERN.test(text(caseId))) return null
      const { value } = await readJson(evaluationCaseFile(root, caseId))
      if (!value || !inspectEvaluationCase(value).ok) return null
      return value.caseId === text(caseId) ? value : null
    },

    async listCases() {
      const files = await readdirSafe(join(root, 'cases'))
      const cases = []
      let warningCount = 0
      for (const file of files) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
        const { value, broken } = await readJson(join(root, 'cases', file))
        if (broken || !value || !inspectEvaluationCase(value).ok) {
          warningCount += 1
          continue
        }
        cases.push(value)
      }
      cases.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      return { cases, warningCount }
    },

    /** 删一个 Case 连同它的所有运行：留着会变成谁也读不到的孤儿文件。 */
    async deleteCase(caseId) {
      if (!CASE_ID_PATTERN.test(text(caseId))) return { deleted: false, runsRemoved: 0 }
      const runs = await readdirSafe(join(root, 'runs', caseHex(caseId)))
      const existed = await stat(evaluationCaseFile(root, caseId)).then(() => true).catch(() => false)
      await rm(join(root, 'runs', caseHex(caseId)), { recursive: true, force: true })
      await rm(evaluationCaseFile(root, caseId), { force: true })
      return { deleted: existed, runsRemoved: runs.filter((file) => file.endsWith('.json')).length }
    },

    async saveRun(record) {
      const verdict = inspectEvaluationRun(record)
      if (!verdict.ok) throw new Error(`评测运行不可保存：${verdict.reason}`)
      const value = normalizeRun(record, now())
      await writeJson(evaluationRunFile(root, value.caseId, value.runId), value)
      await this.pruneRuns(value.caseId)
      return value
    },

    async readRun(caseId, runId) {
      if (!CASE_ID_PATTERN.test(text(caseId)) || !RUN_ID_PATTERN.test(text(runId))) return null
      const { value } = await readJson(evaluationRunFile(root, caseId, runId))
      if (!value || !inspectEvaluationRun(value).ok) return null
      return value.caseId === text(caseId) && value.runId === text(runId) ? value : null
    },

    async listRuns(caseId) {
      if (!CASE_ID_PATTERN.test(text(caseId))) return { runs: [], warningCount: 0 }
      const dir = join(root, 'runs', caseHex(caseId))
      const files = await readdirSafe(dir)
      const runs = []
      let warningCount = 0
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const { value, broken } = await readJson(join(dir, file))
        if (broken || !value || !inspectEvaluationRun(value).ok) {
          warningCount += 1
          continue
        }
        runs.push(value)
      }
      runs.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      return { runs, warningCount }
    },

    async pruneCases() {
      const { cases } = await this.listCases()
      if (cases.length <= maxCases) return 0
      let removed = 0
      for (const stale of cases.slice(maxCases)) {
        await this.deleteCase(stale.caseId)
        removed += 1
      }
      return removed
    },

    async pruneRuns(caseId) {
      const { runs } = await this.listRuns(caseId)
      if (runs.length <= maxRunsPerCase) return 0
      let removed = 0
      for (const stale of runs.slice(maxRunsPerCase)) {
        await rm(evaluationRunFile(root, caseId, stale.runId), { force: true })
        removed += 1
      }
      return removed
    },
  }
}
