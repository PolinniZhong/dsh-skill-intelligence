import { createHash } from 'node:crypto'

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function safeProvider(value) {
  if (typeof value !== 'string') return ''
  const label = value.trim()
  return /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,79}$/.test(label) ? label : ''
}

function safeSkillName(value) {
  if (typeof value !== 'string') return ''
  const name = value.trim()
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(name) ? name : ''
}

function safeDescription(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, 500)
}

export function sourceFingerprint(value) {
  if (typeof value !== 'string') return null
  const source = value.trim()
  if (!source || source.length > 4096) return null
  return sha256(source)
}

export function safeSourceLabel(value) {
  if (typeof value !== 'string') return ''
  const label = value.trim()
  if (!label || label.length > 240 || label.startsWith('/') || label.startsWith('~') || label.startsWith('file:') || /^[A-Za-z]:[\\/]/.test(label)) return ''
  if (/^https?:\/\//i.test(label)) {
    try {
      const url = new URL(label)
      if (url.username || url.password) return ''
      const path = url.pathname.split('/').filter(Boolean).slice(0, 3).join('/')
      return `remote:${url.hostname}${path ? `/${path}` : ''}`.slice(0, 240)
    } catch {
      return ''
    }
  }
  return /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,239}$/.test(label) && !label.split('/').includes('..') ? label : ''
}

function observedHashes(receipt, skillName) {
  return [...new Set((receipt.traceEvents ?? [])
    .filter((trace) => trace.skillName === skillName && trace.status === 'loaded' && trace.evidenceFingerprint?.scope === 'skill-instructions')
    .map((trace) => trace.evidenceFingerprint.value)
    .filter((value) => typeof value === 'string'))]
}

function registryOptions(cwd, scope) {
  return {
    ...(cwd ? { cwd } : {}),
    ...(scope ? { scope } : {}),
  }
}

function invocationOf(value) {
  if (!value || typeof value !== 'object') return null
  return {
    modelInvocable: value.modelInvocable === true,
    userInvocable: value.userInvocable === true,
  }
}

export async function buildCatalogSnapshot(registry, cwd, scope, now = Date.now()) {
  try {
    const snapshot = await registry.snapshot(registryOptions(cwd, scope))
    const skills = (Array.isArray(snapshot?.skills) ? snapshot.skills : []).map((summary) => {
      const name = safeSkillName(summary?.name)
      if (!name) return null
      return {
        name,
        description: safeDescription(summary?.description),
        provider: safeProvider(summary?.provider) || null,
        sourceFingerprint: sourceFingerprint(summary?.source),
        invocation: invocationOf(summary?.invocation),
      }
    }).filter(Boolean)
    return {
      status: snapshot?.complete === true ? 'complete' : 'incomplete',
      complete: snapshot?.complete === true,
      observedAt: now,
      skills,
    }
  } catch {
    return { status: 'coverage-unknown', complete: false, observedAt: now, skills: [] }
  }
}

export async function loadSkillDefinition(registry, skillName, cwd, scope) {
  const name = safeSkillName(skillName)
  if (!name) throw new Error('skillName 无效')
  let definition
  try {
    definition = await registry.get(name, registryOptions(cwd, scope))
  } catch {
    return { available: false, currentInstructionSha256: null }
  }
  return {
    available: Boolean(definition),
    currentInstructionSha256: typeof definition?.content === 'string' ? sha256(definition.content) : null,
  }
}

export async function buildSourceSnapshots(registry, receipt, cwd, nowOrOptions = Date.now(), maybeOptions = {}) {
  const now = typeof nowOrOptions === 'number' ? nowOrOptions : Date.now()
  const options = typeof nowOrOptions === 'number' ? maybeOptions : nowOrOptions
  const loadedNames = (receipt.traceEvents ?? []).filter((trace) => trace.status === 'loaded').map((trace) => trace.skillName)
  const requestedNames = Array.isArray(options?.skillNames) ? options.skillNames : loadedNames
  const names = [...new Set(requestedNames.map(safeSkillName).filter(Boolean))]
  if (names.length === 0) return []
  let snapshot
  try {
    snapshot = await registry.snapshot(registryOptions(cwd, options?.scope))
  } catch {
    return names.map((skillName) => ({
      skillName,
      snapshotComplete: false,
      definitionAvailable: false,
      runtimeIdentity: (receipt.sourceSnapshots ?? []).find((item) => item.skillName === skillName)?.runtimeIdentity ?? null,
      observedInstructionSha256: observedHashes(receipt, skillName),
      currentInstructionSha256: null,
      match: 'unavailable',
      checkedAt: now,
    }))
  }
  if (snapshot?.complete !== true) {
    return names.map((skillName) => ({
      skillName,
      snapshotComplete: false,
      definitionAvailable: false,
      runtimeIdentity: (receipt.sourceSnapshots ?? []).find((item) => item.skillName === skillName)?.runtimeIdentity ?? null,
      observedInstructionSha256: observedHashes(receipt, skillName),
      currentInstructionSha256: null,
      match: 'unavailable',
      checkedAt: now,
    }))
  }

  const summaries = new Map((snapshot.skills ?? []).map((item) => [item.name, item]))
  const results = []
  for (const skillName of names) {
    const observed = observedHashes(receipt, skillName)
    const summary = summaries.get(skillName)
    let definition
    try {
      definition = summary ? await registry.get(skillName, registryOptions(cwd, options?.scope)) : undefined
    } catch {
      definition = undefined
    }
    const currentHash = typeof definition?.content === 'string' ? sha256(definition.content) : null
    const provider = safeProvider(definition?.provider ?? summary?.provider) || null
    const fingerprint = sourceFingerprint(definition?.source ?? summary?.source)
    const previous = (receipt.sourceSnapshots ?? []).find((item) => item.skillName === skillName)
    const runtimeIdentity = options?.captureRuntimeIdentity === true && provider && fingerprint
      ? { provider, sourceFingerprint: fingerprint, capturedAt: now }
      : previous?.runtimeIdentity ?? null
    results.push({
      skillName,
      snapshotComplete: true,
      definitionAvailable: Boolean(definition),
      provider,
      source: safeSourceLabel(definition?.source ?? summary?.source) || null,
      sourceFingerprint: fingerprint,
      runtimeIdentity,
      invocation: invocationOf(definition?.invocation ?? summary?.invocation),
      observedInstructionSha256: observed,
      currentInstructionSha256: currentHash,
      match: !currentHash || observed.length === 0 ? 'unavailable' : observed.includes(currentHash) ? 'match' : 'mismatch',
      checkedAt: now,
    })
  }
  return results
}
