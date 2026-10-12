/**
 * V1.4「Skill Trigger Evaluation」的落盘面（`FR-TRIG-018`）。
 *
 * 它是**同一个 evaluation 数据目录**里的两个子目录：
 *
 * ```
 * <dataRoot>/evaluation/trigger-suites/<caseHex>.json        ← 一个测试用例一个文件
 * <dataRoot>/evaluation/trigger-runs/<caseHex>/<runId>.json  ← 一个用例的所有观察
 * ```
 *
 * 为什么与 V1.0 的 `cases/` / `runs/` 分开而不是塞进去：V1.0 的 Case 身份里**含** Skill 指纹，
 * 触发用例的身份里**刻意不含**（改完 description 要能复测同一用例）。两套身份放在同一个目录里，
 * 任何一次「按 caseId 找文件」的代码都可能把两者混起来 —— 分开是省掉一个长期误读的办法。
 *
 * ## 三道闸都在最靠近磁盘的地方
 *
 * 1. **禁字段深扫**：沿用 `EVALUATION_FORBIDDEN_FIELDS`（`sessionId` / `args` / `toolResult` /
 *    `score` / `passRate` / `ranking` / `trend` …）。**一份清单，两个 store** —— 抄一份到这边，
 *    迟早会有一边先过期。
 * 2. **三态与词表的闭集校验**：`observation` / `coverage` / `invocationType` / `freshSession`
 *    与 `limitations` 必须落在 core 的封闭词表里。认不出的值**拒收**，不许「先存下来再说」。
 * 3. **原子写 + `0700` 目录 / `0600` 文件**，读取端永远 fail-soft：坏文件跳过并计数。
 */

import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

import { EVALUATION_FORBIDDEN_FIELDS } from './evaluation-store.mjs'
import {
  TRIGGER_COVERAGE_IDS,
  TRIGGER_FRESH_SESSION_IDS,
  TRIGGER_INVOCATION_IDS,
  TRIGGER_LIMITATION_LABELS,
  TRIGGER_OBSERVATION_IDS,
  TRIGGER_OUTCOME_IDS,
  TRIGGER_RUN_SCHEMA_VERSION,
  TRIGGER_CASE_SCHEMA_VERSION,
} from '../core/skill-trigger-evaluation.mjs'

export const TRIGGER_STORE_VERSION = 1

export const TRIGGER_STORE_DEFAULTS = Object.freeze({
  maxCases: 200,
  maxRunsPerCase: 20,
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
export function triggerCaseFile(root, caseId) {
  return join(root, 'trigger-suites', `${caseHex(caseId)}.json`)
}

/** Run 文件名由 `caseId` + `runId` 决定。 */
export function triggerRunFile(root, caseId, runId) {
  return join(root, 'trigger-runs', caseHex(caseId), `${runId}.json`)
}

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

export function inspectTriggerCase(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'not-an-object' }
  const forbidden = findForbiddenField(record)
  if (forbidden) return { ok: false, reason: `forbidden-field:${forbidden}` }
  if (!CASE_ID_PATTERN.test(text(record.caseId))) return { ok: false, reason: 'invalid-case-id' }
  if (!text(record.skillName)) return { ok: false, reason: 'missing-skill-name' }
  if (!text(record.title)) return { ok: false, reason: 'missing-title' }
  if (!text(record.prompt)) return { ok: false, reason: 'missing-prompt' }
  if (typeof record.expectedTrigger !== 'boolean') return { ok: false, reason: 'invalid-expected-trigger' }
  return { ok: true }
}

export function inspectTriggerRun(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'not-an-object' }
  const forbidden = findForbiddenField(record)
  if (forbidden) return { ok: false, reason: `forbidden-field:${forbidden}` }
  if (!CASE_ID_PATTERN.test(text(record.caseId))) return { ok: false, reason: 'invalid-case-id' }
  if (!RUN_ID_PATTERN.test(text(record.runId))) return { ok: false, reason: 'invalid-run-id' }
  if (!TRIGGER_OBSERVATION_IDS.includes(record.observation)) return { ok: false, reason: 'invalid-observation' }
  if (!TRIGGER_INVOCATION_IDS.includes(record.invocationType)) return { ok: false, reason: 'invalid-invocation-type' }
  if (!TRIGGER_COVERAGE_IDS.includes(record.coverage)) return { ok: false, reason: 'invalid-coverage' }
  if (!TRIGGER_FRESH_SESSION_IDS.includes(record.freshSession)) return { ok: false, reason: 'invalid-fresh-session' }
  if (!TRIGGER_OUTCOME_IDS.includes(record.outcome)) return { ok: false, reason: 'invalid-outcome' }
  const limitations = Array.isArray(record.limitations) ? record.limitations : []
  for (const id of limitations) {
    // A limitation written straight from a caller's imagination would render as a blank
    // row in the UI. The vocabulary is closed on purpose: reject, do not store.
    if (!Object.prototype.hasOwnProperty.call(TRIGGER_LIMITATION_LABELS, id)) return { ok: false, reason: `unknown-limitation:${id}` }
  }
  return { ok: true }
}

function normalizeCase(record, now) {
  return {
    ...record,
    schemaVersion: TRIGGER_CASE_SCHEMA_VERSION,
    caseId: text(record.caseId),
    skillName: text(record.skillName),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    updatedAt: now,
  }
}

function normalizeRun(record, now) {
  return {
    ...record,
    schemaVersion: TRIGGER_RUN_SCHEMA_VERSION,
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

export function createTriggerEvaluationStore(root = defaultRoot(), options = {}) {
  const maxCases = Number.isInteger(options.maxCases) ? options.maxCases : TRIGGER_STORE_DEFAULTS.maxCases
  const maxRunsPerCase = Number.isInteger(options.maxRunsPerCase)
    ? options.maxRunsPerCase
    : TRIGGER_STORE_DEFAULTS.maxRunsPerCase
  const now = typeof options.now === 'function' ? options.now : Date.now

  return {
    root,
    maxCases,
    maxRunsPerCase,

    async saveCase(record) {
      const verdict = inspectTriggerCase(record)
      if (!verdict.ok) throw new Error(`触发用例不可保存：${verdict.reason}`)
      const value = normalizeCase(record, now())
      await writeJson(triggerCaseFile(root, value.caseId), value)
      await this.pruneCases()
      return value
    },

    async readCase(caseId) {
      if (!CASE_ID_PATTERN.test(text(caseId))) return null
      const { value } = await readJson(triggerCaseFile(root, caseId))
      if (!value || !inspectTriggerCase(value).ok) return null
      return value.caseId === text(caseId) ? value : null
    },

    async listCases(skillName = null) {
      const filter = text(skillName)
      const files = await readdirSafe(join(root, 'trigger-suites'))
      const cases = []
      let warningCount = 0
      for (const file of files) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
        const { value, broken } = await readJson(join(root, 'trigger-suites', file))
        if (broken || !value || !inspectTriggerCase(value).ok) {
          warningCount += 1
          continue
        }
        if (filter && value.skillName !== filter) continue
        cases.push(value)
      }
      cases.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      return { cases, warningCount }
    },

    /** 删一个用例连同它的所有观察：留着会变成谁也读不到的孤儿文件。 */
    async deleteCase(caseId) {
      if (!CASE_ID_PATTERN.test(text(caseId))) return { deleted: false, runsRemoved: 0 }
      const runs = await readdirSafe(join(root, 'trigger-runs', caseHex(caseId)))
      const existed = await stat(triggerCaseFile(root, caseId)).then(() => true).catch(() => false)
      await rm(join(root, 'trigger-runs', caseHex(caseId)), { recursive: true, force: true })
      await rm(triggerCaseFile(root, caseId), { force: true })
      return { deleted: existed, runsRemoved: runs.filter((file) => file.endsWith('.json')).length }
    },

    async saveRun(record) {
      const verdict = inspectTriggerRun(record)
      if (!verdict.ok) throw new Error(`触发观察不可保存：${verdict.reason}`)
      const value = normalizeRun(record, now())
      await writeJson(triggerRunFile(root, value.caseId, value.runId), value)
      await this.pruneRuns(value.caseId)
      return value
    },

    async readRun(caseId, runId) {
      if (!CASE_ID_PATTERN.test(text(caseId)) || !RUN_ID_PATTERN.test(text(runId))) return null
      const { value } = await readJson(triggerRunFile(root, caseId, runId))
      if (!value || !inspectTriggerRun(value).ok) return null
      return value.caseId === text(caseId) && value.runId === text(runId) ? value : null
    },

    async listRuns(caseId) {
      if (!CASE_ID_PATTERN.test(text(caseId))) return { runs: [], warningCount: 0 }
      const dir = join(root, 'trigger-runs', caseHex(caseId))
      const files = await readdirSafe(dir)
      const runs = []
      let warningCount = 0
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const { value, broken } = await readJson(join(dir, file))
        if (broken || !value || !inspectTriggerRun(value).ok) {
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
        await rm(triggerRunFile(root, caseId, stale.runId), { force: true })
        removed += 1
      }
      return removed
    },
  }
}
