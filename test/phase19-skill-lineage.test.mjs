import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FORBIDDEN_LINEAGE_FIELDS,
  LINEAGE_CATALOG_OBSERVATIONS,
  SKILL_LINEAGE_VERSION,
  buildLineageRecord,
  inspectLineageRecord,
  isLineageFileName,
  lineageFileName,
  lineageIdFor,
} from '../src/core/skill-lineage.mjs'

const SOURCE_A = `sha256:${'a'.repeat(64)}`
const SOURCE_B = `sha256:${'b'.repeat(64)}`

function record(overrides = {}) {
  return {
    sourceSkillName: 'ui-craft',
    sourceSourceSha256: SOURCE_A,
    targetSkillName: 'my-ui-craft',
    cloneMode: 'bundle',
    targetScope: 'user',
    catalogObservation: 'observed',
    ...overrides,
  }
}

function lineage(overrides = {}, now = 1_000, previous = null) {
  return buildLineageRecord({ ...record(overrides), now, previous })
}

test('a record is a closed set of fields — no Skill body ever gets in', () => {
  const value = lineage()
  assert.deepEqual(Object.keys(value).sort(), [
    'catalogObservation',
    'cloneMode',
    'createdAt',
    'lineageId',
    'schemaVersion',
    'sourceSkillName',
    'sourceSourceSha256',
    'targetScope',
    'targetSkillName',
    'updatedAt',
  ])
  assert.equal(value.schemaVersion, SKILL_LINEAGE_VERSION)
  assert.equal(value.sourceSourceSha256, SOURCE_A)
})

test('every forbidden field is rejected by name, not merely dropped', () => {
  // 闭集的价值在于「写进去会失败」。如果哪天有人把正文塞进记录，这里必须响。
  for (const field of FORBIDDEN_LINEAGE_FIELDS) {
    const verdict = inspectLineageRecord(record({ [field]: 'anything' }))
    assert.equal(verdict.ok, false, `${field} should be refused`)
    assert.equal(verdict.reason, `forbidden-field:${field}`)
  }
  assert.ok(FORBIDDEN_LINEAGE_FIELDS.includes('sessionId'))
  assert.ok(FORBIDDEN_LINEAGE_FIELDS.includes('content'))
  assert.ok(FORBIDDEN_LINEAGE_FIELDS.includes('absolutePath'))
})

test('the required facts are exactly the ones a successful clone produces', () => {
  assert.equal(inspectLineageRecord(null).reason, 'not-an-object')
  assert.equal(inspectLineageRecord([]).reason, 'not-an-object')
  assert.equal(inspectLineageRecord(record({ targetSkillName: '  ' })).reason, 'missing-target-skill-name')
  assert.equal(inspectLineageRecord(record({ sourceSkillName: '' })).reason, 'missing-source-skill-name')
  assert.equal(inspectLineageRecord(record({ sourceSourceSha256: 'sha256:abc' })).reason, 'missing-source-source-sha256')
  assert.equal(inspectLineageRecord(record({ sourceSourceSha256: '' })).reason, 'missing-source-source-sha256')
  assert.equal(inspectLineageRecord(record({ cloneMode: 'everything' })).reason, 'invalid-clone-mode')
  assert.equal(inspectLineageRecord(record({ targetScope: 'wherever' })).reason, 'invalid-target-scope')
  assert.equal(inspectLineageRecord(record({ catalogObservation: 'maybe' })).reason, 'invalid-catalog-observation')
  assert.equal(inspectLineageRecord(record()).ok, true)
})

test('a pending catalog observation is a valid record — the file landed, DSH has not looked yet', () => {
  assert.deepEqual([...LINEAGE_CATALOG_OBSERVATIONS], ['observed', 'pending'])
  assert.equal(lineage({ catalogObservation: 'pending' }).catalogObservation, 'pending')
  // 缺省不是「观察到了」，而是「还不知道」。
  assert.equal(lineage({ catalogObservation: undefined }).catalogObservation, 'pending')
})

test('the key is derived from the target name, so one target can only ever have one record', () => {
  assert.equal(lineageIdFor('my-ui-craft'), lineageIdFor('my-ui-craft'))
  assert.notEqual(lineageIdFor('my-ui-craft'), lineageIdFor('my-ui-craft-2'))
  assert.equal(lineageFileName('my-ui-craft'), `${lineageIdFor('my-ui-craft').slice('sha256:'.length)}.json`)
  assert.ok(isLineageFileName(lineageFileName('my-ui-craft')))
  assert.equal(isLineageFileName('my-ui-craft.json'), false)
  assert.equal(isLineageFileName(`${'a'.repeat(63)}.json`), false)
  // 目标名带 `.` / `:` / `/` 也不是路径问题：文件名是摘要，不是名字。
  assert.ok(isLineageFileName(lineageFileName('a/b:c.md')))
})

test('the identity is a digest of the name, never the content — content identity is separate', () => {
  const first = lineage()
  const moved = lineage({ sourceSourceSha256: SOURCE_B }, 2, first)
  assert.equal(moved.lineageId, first.lineageId)
  assert.equal(moved.sourceSourceSha256, SOURCE_B)
})

test('re-cloning the same target keeps the day the relation started, and refreshes updatedAt', () => {
  const first = lineage({}, 1_000)
  assert.equal(first.createdAt, 1_000)
  assert.equal(first.updatedAt, 1_000)
  const again = lineage({ sourceSourceSha256: SOURCE_B }, 2_000, first)
  assert.equal(again.createdAt, 1_000, 'the relation began when it began')
  assert.equal(again.updatedAt, 2_000)
})

test('a repository is remembered only when it carries no credentials', () => {
  const withRepo = lineage({ sourceRepository: 'github.com/acme/skills' })
  assert.equal(withRepo.sourceRepository, 'github.com/acme/skills')
  assert.equal(Object.hasOwn(lineage(), 'sourceRepository'), false)
  assert.equal(
    inspectLineageRecord(record({ sourceRepository: 'https://user:token@github.com/acme/skills' })).reason,
    'repository-url-has-credentials',
  )
})
