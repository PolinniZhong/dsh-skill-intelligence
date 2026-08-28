import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const client = await readFile(new URL('../src/dsh/client/client.js', import.meta.url), 'utf8')

test('client buffers each user-authored draft type in session storage', () => {
  assert.match(client, /dsh-skill-trace\.unsaved-drafts\.v1/)
  assert.match(client, /window\.sessionStorage\.setItem\(DRAFT_KEY/)
  assert.match(client, /draftId\('learning', receipt\.sessionId, learningSkill\)/)
  assert.match(client, /draftId\('validation', sessionId, skillName\)/)
  assert.match(client, /draftId\('output', receipt\.sessionId\)/)
  assert.match(client, /未保存草稿只暂存在当前 Desktop 运行期间/)
})

test('client restores compatible drafts and rejects stale saved-record bases', () => {
  assert.match(client, /readDraft\(learningDraftId, savedLearningNote\?\.updatedAt\)/)
  assert.match(client, /readDraft\(validationDraftId, initialResult\?\.updatedAt\)/)
  assert.match(client, /draft\.baseUpdatedAt \?\? null/)
  assert.match(client, /delete buffer\[id\]/)
})

test('successful saves and destructive actions clear only the intended draft scope', () => {
  assert.match(client, /clearDraft\(learningDraftId\)/)
  assert.match(client, /clearDraft\(validationDraftId\)/)
  assert.match(client, /clearDraft\(outputDraftId\)/)
  assert.match(client, /clearSessionDrafts\(receipt\.sessionId\)/)
  assert.match(client, /clearAllDrafts\(\)/)
})

test('client warns before unloading while unsaved drafts remain', () => {
  assert.match(client, /window\.addEventListener\('beforeunload', handler\)/)
  assert.match(client, /if \(!hasDrafts\(\)\) return/)
  assert.match(client, /event\.returnValue = ''/)
})

test('client fails visibly when session draft storage is unavailable', () => {
  assert.match(client, /const volatileDrafts = new Set\(\)/)
  assert.match(client, /volatileDrafts\.add\(id\)/)
  assert.match(client, /volatileDrafts\.size > 0/)
  assert.match(client, /当前无法暂存，切换页面前请先保存/)
})
