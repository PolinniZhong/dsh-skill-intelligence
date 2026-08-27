function safeTime(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function loadedEvents(receipt, skillName) {
  return (receipt.traceEvents ?? []).filter((event) => event.skillName === skillName && event.status === 'loaded')
}

function observedHashes(events) {
  return [...new Set(events
    .filter((event) => event.evidenceFingerprint?.scope === 'skill-instructions')
    .map((event) => event.evidenceFingerprint.value)
    .filter((value) => typeof value === 'string'))]
}

export function buildHistorySummaries(receipts) {
  const histories = []
  for (const receipt of receipts) {
    const names = [...new Set((receipt.traceEvents ?? []).map((event) => event.skillName).filter(Boolean))]
    for (const skillName of names) {
      const events = (receipt.traceEvents ?? []).filter((event) => event.skillName === skillName)
      const successful = loadedEvents(receipt, skillName)
      const source = (receipt.sourceSnapshots ?? []).find((item) => item.skillName === skillName)
      const note = (receipt.learningNotes ?? []).find((item) => item.skillName === skillName)
      const identities = successful.map((event) => event.runtimeIdentity).filter((identity) => identity?.provider && identity?.sourceFingerprint)
      const uniqueIdentities = [...new Map(identities.map((identity) => [`${identity.provider}:${identity.sourceFingerprint}`, identity])).values()]
      const completeSingleIdentity = successful.length > 0 && identities.length === successful.length && uniqueIdentities.length === 1
      histories.push({
        receiptId: receipt.receiptId,
        sessionId: receipt.sessionId,
        skillName,
        updatedAt: safeTime(receipt.updatedAt),
        eventCount: events.length,
        loadedCount: successful.length,
        failedCount: events.filter((event) => event.status === 'failed').length,
        unresolvedCount: events.filter((event) => ['requested', 'unresolved', 'outcome-unknown', 'not-started'].includes(event.status)).length,
        observedInstructionSha256: observedHashes(successful),
        runtimeIdentity: completeSingleIdentity ? {
          provider: uniqueIdentities[0].provider,
          sourceFingerprint: uniqueIdentities[0].sourceFingerprint,
          capturedAt: safeTime(uniqueIdentities[0].capturedAt),
        } : null,
        identityConflict: uniqueIdentities.length > 1,
        versionState: source?.match === 'mismatch' ? 'changed' : source?.match === 'match' ? 'match' : 'unavailable',
        learningNotePresent: Boolean(note),
        learningNoteUpdatedAt: safeTime(note?.updatedAt),
      })
    }
  }
  return histories.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export function associationLevel(current, history, currentInstructionSha256 = null) {
  if (!current) return 'current-not-discovered'
  if (history.identityConflict) return 'conflict'
  const historical = history.runtimeIdentity
  const currentHasIdentity = Boolean(current.provider && current.sourceFingerprint)
  const historyHasIdentity = Boolean(historical?.provider && historical?.sourceFingerprint)
  if (currentHasIdentity && historyHasIdentity) {
    return current.provider === historical.provider && current.sourceFingerprint === historical.sourceFingerprint
      ? 'exact'
      : 'conflict'
  }
  if (currentInstructionSha256 && history.observedInstructionSha256.includes(currentInstructionSha256)) return 'content-match-candidate'
  return 'name-only-candidate'
}

function aggregateEntry(current, histories, currentInstructionSha256 = null, catalogComplete = true) {
  const related = histories.filter((item) => item.skillName === current.name).map((item) => ({
    ...item,
    associationLevel: associationLevel(current, item, currentInstructionSha256),
  }))
  const exact = related.filter((item) => item.associationLevel === 'exact')
  const candidates = related.filter((item) => ['content-match-candidate', 'name-only-candidate'].includes(item.associationLevel))
  const conflicts = related.filter((item) => item.associationLevel === 'conflict')
  return {
    id: `current:${current.provider ?? 'unknown'}:${current.sourceFingerprint ?? 'source-unknown'}:${current.name}`,
    name: current.name,
    description: current.description,
    provider: current.provider,
    sourceFingerprint: current.sourceFingerprint,
    invocation: current.invocation,
    currentState: catalogComplete ? 'discovered' : 'discovered-partial',
    confirmedReceiptCount: exact.length,
    possibleReceiptCount: candidates.length,
    conflictCount: conflicts.length,
    confirmedLearningCount: exact.filter((item) => item.learningNotePresent).length,
    possibleLearningCount: candidates.filter((item) => item.learningNotePresent).length,
    observedState: exact.length ? 'observed' : candidates.length ? 'possible-history' : 'not-observed',
    learningState: exact.some((item) => item.learningNotePresent) ? 'has-learning' : candidates.some((item) => item.learningNotePresent) ? 'possible-learning' : 'no-learning',
    versionState: exact.some((item) => item.versionState === 'changed') ? 'changed' : exact.some((item) => item.versionState === 'match') ? 'match' : 'unavailable',
    histories: related,
  }
}

function historicalEntry(skillName, histories, groupKey) {
  const related = histories.map((item) => ({ ...item, associationLevel: 'current-not-discovered' }))
  return {
    id: `history:${groupKey}`,
    name: skillName,
    description: '',
    provider: null,
    sourceFingerprint: null,
    invocation: null,
    currentState: 'current-not-discovered',
    confirmedReceiptCount: 0,
    possibleReceiptCount: related.length,
    conflictCount: 0,
    confirmedLearningCount: 0,
    possibleLearningCount: related.filter((item) => item.learningNotePresent).length,
    observedState: related.length ? 'possible-history' : 'not-observed',
    learningState: related.some((item) => item.learningNotePresent) ? 'possible-learning' : 'no-learning',
    versionState: 'unavailable',
    latestHistoryAt: related[0]?.updatedAt ?? null,
    histories: related,
  }
}

export function buildCatalogView({ catalogSnapshot, receipts, selectedSkillName = '', selectedEntryId = '', selectedDefinition = null, warningCount = 0 }) {
  const histories = buildHistorySummaries(receipts)
  const currentSkills = catalogSnapshot.skills ?? []
  const currentNames = new Set(currentSkills.map((item) => item.name))
  const entries = currentSkills.map((current) => aggregateEntry(
    current,
    histories,
    current.name === selectedSkillName ? selectedDefinition?.currentInstructionSha256 : null,
    catalogSnapshot.complete === true,
  ))
  const historicalGroups = new Map()
  for (const history of histories.filter((item) => !currentNames.has(item.skillName))) {
    const identity = history.runtimeIdentity
    const key = identity?.provider && identity?.sourceFingerprint
      ? `${history.skillName}:${identity.provider}:${identity.sourceFingerprint}`
      : `${history.skillName}:legacy:${history.sessionId}`
    const group = historicalGroups.get(key) ?? []
    group.push(history)
    historicalGroups.set(key, group)
  }
  entries.push(...[...historicalGroups.entries()].map(([key, group]) => historicalEntry(group[0].skillName, group, key)))
  entries.sort((a, b) => {
    const aCurrent = a.currentState !== 'current-not-discovered'
    const bCurrent = b.currentState !== 'current-not-discovered'
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
    return a.name.localeCompare(b.name, 'en')
  })
  const selected = entries.find((item) => selectedEntryId ? item.id === selectedEntryId : item.name === selectedSkillName) ?? null
  return {
    coverage: {
      status: catalogSnapshot.status,
      complete: catalogSnapshot.complete === true,
      observedAt: catalogSnapshot.observedAt,
      warningCount: Math.min(99, Math.max(0, warningCount)),
    },
    currentDiscoverableCount: catalogSnapshot.complete === true ? currentSkills.length : null,
    observedCandidateCount: currentSkills.length,
    entries: entries.map(({ histories: _histories, ...entry }) => entry),
    selected: selected ? {
      ...selected,
      definition: selectedDefinition ?? { available: false, currentInstructionSha256: null },
    } : null,
  }
}
