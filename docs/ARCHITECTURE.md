# Architecture

## Product boundary

DSH Skill Trace observes event evidence produced by DeepSeek Harness and presents a local receipt plus a user-owned learning loop. It does not decide which Skill to use, discover remote Skills, mount a Skill, or judge a model output.

```text
DSH event stream
  ├─ tool/call + tool/result        → every capability invocation (metadata only)
  ├─ user/message source.kind
  │    ├─ skill-invocation          → user-explicit `/name` load
  │    └─ skill-catalog             → published Declaration baseline
  └─ turn/start · step/start        → log-order attribution cursor
       └─ trace reducer
            ├─ local session receipt
            ├─ receipt / flow-map views
            └─ read-only My Skills workspace
                 ├─ no-selection seven-step learning guide
                 ├─ per-Skill learning and validation timeline
                 ├─ pending-review projection and local user-text search
                 └─ deterministic continuation handoff
```

## Evidence model

1. A matching `tool/call` and successful `tool/result` is recorded as a requested, successful load.
2. The result payload is read from either session format the runtime can produce. V3 wrapped a tool result in exactly one `tool-result` block inside a `user` message; V4 lifts it into a first-class `tool` message and retires that wrapper, so the content, `toolCallId`, and `isError` live on the message itself. Reading only the V3 spelling made every V4 result look empty while the record still claimed `loaded`, which silently dropped the instruction fingerprint, the candidate steps, and version-drift detection.
3. A Skill can be loaded on two paths, and both are recorded: the model calls the `skill` tool (`invocationType: model-invoked`), or the user names a Skill with the `/name` gesture, which DSH injects as a `user/message` carrying `source.kind = 'skill-invocation'` and which never produces a `skill` tool call (`invocationType: user-explicit`). DSH renders one canonical `<skill_content>` shape on both paths, so the instruction fingerprint and candidate steps come from the same extraction rule. No `implicit` value is emitted: there is no observable third path, and inventing one would be a claim the runtime cannot support.
4. `user/message` records no turn or step of its own. It is attributed by the `turn/start` / `step/start` cursor most recently seen in the same log — log order, never timestamps.
5. The reducer can associate repeated loads and multiple Skills in the same session.
6. A load record is not upgraded into proof of compliance, causal contribution, correctness, or usefulness.
7. The user may separately write an understanding, an improvement intent, and a next validation plan. Those fields are personal notes, not model judgments.
8. The user may later record whether that plan met expectations, what they observed, and what to do next. This is a human-authored validation result attached to the original session receipt, not a quality score or causal proof.

## Runtime surface

Beyond Skill loads, the receipt keeps a bounded **normalized event stream** in `runtimeEvents`. This is the Normalizer and Invocation Aggregator stage of the Runtime Flow pipeline, and the raw material the graph is reconstructed from — not a second trace database.

Raw session events become `RuntimeEvent`s with a stable, citeable identity:

```text
eventId · seq · timestamp · type · source (dsh | derived) · status
turn · step · invocationId · capabilityId (skill | tool | cli | mcp | subagent)
capabilityName · detail · errorCode · rule
```

Two disciplines hold:

1. **`source` separates host fact from plugin derivation.** `dsh` means the host reported it; `derived` means a named deterministic rule produced it. A derived event is only ever *appended* — it never rewrites or replaces the record it read, and a derivation that cannot cite a rule is not emitted. The one rule so far is `same-turn-repeat-after-failure` (`RETRY_RULE`), which marks an invocation repeated after the same capability identity failed earlier in the same turn. Log order decides; timestamps never do.
2. **No half-invocation is ever invented.** Aggregation pairs strictly by `invocationId`. Time adjacency is never used, so a request whose result was never observed stays `unresolved-request` and a result with no observed request stays `orphan-result`, rather than being completed with whichever event happened to be nearby. `evidenceState` then separates a settled call from a followed one: `observed` requires a request *and* a successful result, `partial` means a failure, `requested` means half-observed. `success` still means only that the call settled.

Each invocation carries the `evidenceEventIds` that support it, so a later graph edge can cite real evidence instead of asserting a relationship.

The vocabulary is `invocation.request` / `invocation.result` / `skill.invocation` / `retry`, not the per-capability request/result types. That is deliberate: a DSH `tool/result` carries no tool name, so a result event cannot assert which capability it belongs to. Capability is a property of the *invocation*, resolved from the request that opened it and left unset when that request is not observable. Naming a result `cli.result` would be a claim the raw event does not support.

Tool arguments and result content are never read, let alone stored; `scripts/verify-project.mjs` rejects a change that would start reading either field. Classification is deterministic: `mcp__<server>__<rawName>` identifies an MCP tool, `bash`/`pwsh` are CLI, `subagent` is a Subagent, and everything else is a Tool. Classification only labels an invocation; it never rewrites the recorded event, and an over-long identifier is refused rather than truncated into a different valid name.

The stream keeps the 2000 most recent events and reports how many were dropped as `runtimeEventOverflow`, so a bounded window is never presented as a complete run. Truncation can cut a request from its result; the aggregator then reports `unresolved-request` or `orphan-result` instead of repairing the pair.

### Write policy

Skill evidence keeps immediate durability — a newly opened load, a settled load, or a published/replaced catalog is written the moment it is observed, gated by `skillEvidenceSignature`. The runtime event stream does not: it is derived evidence that a turn boundary or any later rebuild reproduces from the durable session log, so it is persisted at turn boundaries. A settled invocation costs two normalized events, so rewriting the whole receipt on every `tool/call` and `tool/result` would write the same growing file hundreds of times per session.

`catalogPublished` holds the Declaration baseline: the entries DSH durably published into this session, i.e. what the model was actually offered. A replacement publication supersedes the previous baseline and increments `catalogPublicationCount`. This is deliberately not a live registry snapshot, which answers what is installed *now* and drifts once the session ends. `entriesDigest` hashes the published names so drift can be checked without comparing description wording.

## Correlation and provenance

`src/core/runtime-graph.mjs` turns the normalized stream into nodes and edges. One rule sits above every other in it:

> **Graph completeness < Graph truthfulness.**

The graph may be incomplete. It may never be wrong. Every emitted edge must cite at least one event the receipt still holds; an edge that cannot is dropped and counted in `droppedEdgeCount` rather than softened into a weaker claim. A relationship that cannot be established is reported as `unlinked` with a reason, never filled in with whichever node happened to be nearby.

Relation priority, highest first:

| Level | Evidence | Emitted as |
| --- | --- | --- |
| P0 runtime-native | `invocationId` (`callId`), `subagent/catalog.childId`, `turn` / `step` | `direct` / `observed` |
| P1 structured host field | a host-published field that names its own subject | `correlated` |
| P2 containment | session → turn → invocation | `direct` / `observed` — this is structure, not causation |
| P3 bounded rule | one named, narrow rule | `candidate` only |
| P4 | nothing usable | `unlinked` |

Containment and subagent spawns are observed because they rest on host facts. Adjacency is the only heuristic in the engine: it is bounded to **consecutive invocations inside one step** and emitted `candidate` under `same-step-adjacent-invocation`.

`subagent/catalog` is the parent-owned direct-child catalog, so a spawned child is observed rather than inferred from tool ordering. The catalog's free-text `label` is deliberately not read — it is caller text, and this plugin stores no prompts or task descriptions. A child is attributed to the invocation that created it **only** when exactly one subagent invocation exists in that turn, under `sole-subagent-invocation-in-turn`; with two concurrent spawns the child stays attributed to the session alone and its node is `partial`.

The edge vocabulary is closed on purpose: `contains`, `spawns`, `retries`, `follows`. There is no `uses` and no `produces` edge, because attributing a tool call to a Skill needs alignment evidence this phase does not have. No edge type can express "this caused that", because the runtime never said so. `scripts/verify-project.mjs` pins both the node and edge vocabularies as exact literals, so widening them has to be a visible, deliberate change.

Node `status` is evidence completeness (`observed` / `partial` / `unlinked`), not outcome; a fully observed failure is `observed` with `outcome: 'failure'`.

The graph is a pure function of the receipt: the same receipt always yields the same graph, and nothing in it depends on a viewport, a zoom level, or a previous layout. It is derived on read and never persisted.

## Declaration ↔ Runtime Alignment

`src/core/runtime-alignment.mjs` puts what a Skill declared next to what the run left evidence for. Three commitments hold:

1. **No score.** Counts of evidence states are reported; compliance rates, percentages, and rankings are not. `scored: false` rides on every model, and a verify guard pins the absence of scoring fields.
2. **Absence of evidence is not evidence of absence.** A declared step with no matching evidence is `insufficient`, never "not done". `not-observed` is deliberately absent from the vocabulary, because no amount of missing data can establish that an Agent skipped a step. Much of what a Skill asks for — deciding, weighing, planning — leaves no external trace.
3. **Direct evidence is not generic evidence.** A `bash` call proves a command ran; it cannot prove the test step ran, because tool arguments are not stored. A step whose only match is a catch-all capability is `partial`.

### Declaration extraction

Two channels, with headings preferred:

| Channel | When it applies |
| --- | --- |
| `heading` | A level-3+ heading inside a process section, or any heading carrying its own ordinal. A level-2 heading that *opens* a process section names the section and is not itself a step. |
| `ordered-list` | A numbered item inside a process-ish section, or any numbered item in a body with no level-2 sections at all. |

Precision is preferred over recall. A Skill whose body lists constraints under `## 硬约束` and keeps its real process in a referenced file genuinely declares no steps *here*; it reports `numbered-items-outside-a-process-section` rather than promoting its constraints into an alignment. The section, the channel, and the reason nothing was declared all ride along so the declaration stays auditable.

Both sides are mapped into one shared vocabulary — `inspect`, `edit`, `execute`, `delegate`, `consult`, `produce`, `plan`, `other` — by deterministic keyword and tool-name rules. Classification is coarse by design and never rewrites the declaration.

### Evidence states

| Status | Means |
| --- | --- |
| `observed` | A direct, settled invocation matches the declared step. |
| `partial` | Only a catch-all capability matched, or the matching invocation never settled. |
| `insufficient` | No matching evidence was found. **This does not mean the step was skipped.** |
| `unknown` | There was no runtime evidence to align against at all. |

Every item carries `observedNodeIds`, `evidenceIds`, `matchedCapabilities`, and a `limitation` sentence stating what its status does and does not mean. A citation is a pointer, not a dump: lists are bounded samples while `matchCount` reports the true total.

The declaration baseline is the durable published catalog. `inPublishedCatalog` distinguishes a Skill that was offered to the model from one loaded anyway by a user-explicit `/name` gesture, and reports `null` — not `false` — when no catalog was published at all.

## Canvas

The plugin's third view draws the runtime graph. It is worth stating what the canvas is *not*: it is not a second source of truth. It receives positions, draws them, and asks the Host why a line exists when one is clicked.

### Why grouping is in the model

Measured across 56 real sessions before any layout code was written:

| | median | p90 | max |
| --- | --- | --- | --- |
| graph nodes | 61 | 915 | 1095 |
| graph edges | 85 | 966 | 1287 |

A flat canvas covers the median and fails the tail, so three rules run in order:

| Rule | Trigger | Effect |
| --- | --- | --- |
| Capability collapse | a turn with more than 12 invocations | one node per capability, naming what it stands for |
| Turn ranges | more than 36 turns | consecutive turns fold into labelled ranges |
| Layer wrapping | more than 26 nodes in a layer | the layer wraps into sub-columns |

Together they hold the canvas at 200 nodes and roughly 1036 px tall whatever the graph size. Across all 56 sessions nothing exceeded the bound; layout cost is 0.3 ms at the median and 15 ms at the worst.

Layout is a pure function of the graph. It stores no coordinate, keeps no viewport or zoom state, and never mutates the graph — the same receipt always draws the same picture, so a redraw can never look like new evidence.

### What a folded node owes the reader

A bound that cannot say what it dropped is not a bound. `hidden` reports the node, edge, and intra-group edge counts; a collapsed node carries `memberCount`; a merged edge carries `evidenceCount`. The canvas sends counts rather than id lists, because the client never reads the ids — the inspector re-derives them.

### The inspector

`/skill-trace/inspect` answers for one node or one edge:

- the derivation, and the rule's own name when a rule produced the relationship;
- the events the claim rests on, as a bounded sample with the true count;
- `meaning` — what the relationship says;
- `limit` — what it does not. A `follows` edge is log order, not causation. A rule-based `spawns` attribution is not a host fact. A `retries` edge does not mean the retry went better.

Every answer carries `evidenceBoundary: { causal: false, compliance: false, correctness: false }`, asserted as booleans so absence of a claim is testable rather than merely written down.

## Main modules

| Module | Responsibility |
| --- | --- |
| `src/dsh/host/index.js` | DSH lifecycle bridge, event observation, privacy policy, local persistence wiring |
| `src/core/trace-reducer.mjs` | Converts observed events into bounded session evidence |
| `src/core/runtime-events.mjs` | Normalizes session events into the RuntimeEvent model and aggregates invocations (Phase 1) |
| `src/core/runtime-graph.mjs` | Correlates invocations into a provenance-bearing graph; refuses to invent relationships (Phase 2) |
| `src/core/runtime-alignment.mjs` | Aligns declared Skill steps with runtime evidence; never scores and never claims a step was skipped (Phase 3) |
| `src/core/runtime-layout.mjs` | Deterministic layered layout with grouping; positions only, never facts (Phase 4) |
| `src/core/runtime-inspector.mjs` | Answers "why does this line exist" for one node or edge, with an explicit limit (Phase 4) |
| `src/core/source-snapshot.mjs` | Creates safe source identity/snapshot metadata |
| `src/core/catalog-view.mjs` | Projects receipt, note, pending-review, validation-result, local search, and review-priority data into the read-only My Skills workspace |
| `src/storage/receipt-store.mjs` | Stores local receipts and schema migrations |
| `src/storage/preference-store.mjs` | Stores the local default-view preference |
| `src/storage/backup-store.mjs` | Creates, verifies, lists, and reads immutable local recovery backups |
| `src/dsh/client/client.js` | Conversation UI: receipt, flow map, catalog, learning notes, and the DSH `ctx.locale` adapter |

## Unsaved draft protection

The Client keeps bounded unsaved learning-note, validation-result, and output-reference drafts in WebView `sessionStorage`, keyed by draft type, Session, and Skill where applicable. This buffer survives React view unmounts during in-app navigation but is not a second receipt database: it is limited to the current Desktop run, capped to 24 recent drafts and 500 characters per field, and excluded from Host backups until the user explicitly saves.

Each learning or validation draft records the `updatedAt` value of the saved receipt field it was based on. A later saved revision invalidates the buffered draft rather than silently applying stale text over newer local data. Successful saves remove only the matching draft; successful single-receipt deletion removes that Session's drafts; successful clear-all removes the complete buffer. Failed Host actions keep drafts available. If `sessionStorage` rejects a write, the Client keeps an in-memory dirty marker, shows an explicit “cannot buffer” warning, and continues to warn before unload instead of claiming the draft is protected. A `beforeunload` guard warns while any draft remains, while ordinary DSH tab/view switching is handled by restoring the buffer when the view mounts again.

## Learning validation result

The receipt schema keeps `validationResults[]` next to `learningNotes[]`. A result is keyed by the Skill name already proven loaded in that receipt and contains only a bounded human-selected status (`met`, `not-met`, or `inconclusive`), a human-authored observation, an optional next action, authorship, and timestamps. Saving `unassessed` with empty text removes that local result.

The My Skills projection derives review state without creating a second database: a history item is pending when it contains a non-empty validation plan and no validation result; it is recorded when a result exists. Exact and candidate histories retain separate counts, so same-name or identity-conflicting records are never promoted into verified history. The detail view orders the original receipt notes and validation results by receipt time and does not select or synthesize a latest “correct understanding.”

The same loopback route is used from the current-session sidebar and an expanded historical timeline card. Both paths write only to the referenced local receipt. No reminder scheduler, telemetry, model call, cloud sync, Skill scoring, or automatic recommendation is introduced.

## Review workspace and local search

The catalog derives a review summary and deterministic sort keys from the same stored receipts. `pending review` still means only that a user-authored validation plan exists while no human validation result is attached to that receipt. It does not mean overdue, important, or system-recommended. Sorting may prioritize that explicit state, version drift, or original receipt time without creating a new status.

Local full-text search covers the Skill name and declared description plus bounded user-authored fields already stored in receipts: understanding, improvement intent, validation plan, observed outcome, and next action. The Host returns only a bounded local search projection to the loopback client. It does not index complete Skill instructions, prompts, conversations, project files, or generated outputs.

## Deterministic continuation handoff

The continuation handoff is formatted in the client from an original receipt projection. It may include the Skill name, receipt time, short instruction fingerprints, candidate steps extracted by existing deterministic rules, the user's local notes, the user's validation result, and the user's `manual`, `partial`, or `blocked` decision. It is copied to the clipboard only after an explicit user action.

The handoff does not call a model, select a Skill, claim a current correct understanding, infer causality, execute a tool, or modify or publish a Skill. Historical handoffs continue to point to their original receipt rather than silently merging sessions.

## Local archive and clearing

`0.4.0-beta.2` used `GET /skill-trace/export` to produce a JSON payload that the Client handed to a WebView Blob download, but it could not verify that a file was saved. Desktop testing reproduced a false success state. In `0.4.0-beta.3`, that legacy route returns `409` so it cannot continue to masquerade as an accepted backup delivery mechanism.

`0.4.0-beta.3` moves persistence into a dedicated Host-side backup store under the plugin data root. A backup is successful only after atomic write, stat, read, and JSON parse validation. The Client receives bounded metadata and can list the backup history. To open the fixed backup directory, it calls the official same-origin `host.openPath` RPC directly: the installed `dsh-better-sidebar` profile plugin wraps `ctx.workspaces.openPath` for file-editor routing and can swallow directory opens.

Restore validates every archive receipt before mutation and runs each write through the same per-Session queue as live event updates. A missing `sessionId` restores the complete receipt. If the active session has already reconstructed a trace-only receipt after clear-all, restore unions missing backed-up trace identity and supplements only absent user-owned fields: learning note and validation result by Skill name, output reference by relative reference, and a human-confirmed continuation decision only when the current receipt is still unassessed. Current user fields remain authoritative. Results report full restores, supplemented receipts, and unchanged receipts separately. Receipt-store writes use a unique temporary file per attempt so concurrent operations cannot move the same temporary path.

Clear-all uses a global maintenance barrier around safety-backup creation and receipt removal. Session writes that began before the barrier finish first; writes arriving during clear-all wait until it completes. A single-receipt deletion keeps its read, verified safety backup, and delete inside the target Session queue. This avoids a late save or restore interleaving with destructive storage work while keeping unrelated reads available.

Archives continue to exclude complete Skill bodies, prompts, conversation content, project files, credentials, and absolute paths. The plugin does not upload them. Backup identifiers are validated and resolved only inside the fixed backup root; arbitrary local paths are not accepted as delete or restore targets.

`DELETE /skill-trace/receipts` clears only receipt files owned by this plugin after an inline client confirmation. Preferences and DeepSeek Harness conversations are not deleted. In `0.4.0-beta.3`, clear-all and single-receipt deletion create and verify a safety backup first; backup failure aborts deletion. If the current DSH session remains available, observed trace evidence can still be reconstructed from the live event stream, but that is not a substitute for restoring user-authored notes and validation results.

## My Skills no-selection guide

When no catalog entry is selected on a wide layout, the Client renders a static seven-step guide in the otherwise empty detail pane. The guide explains the evidence-to-learning path and directs the user to a real Skill entry. It does not query a model, read a Skill body, create sample receipts, mutate storage, or change catalog association rules. On narrow layouts the catalog list remains the primary selection surface; the full guide is not inserted into the scrolling list.

## Interface language

DSH Skill Trace follows the DeepSeek Harness locale service rather than the browser language. Its client registers a `dsh-skill-trace` namespace with `zh` and `en` dictionaries for static keys, uses explicit locale branches for dynamic templates, subscribes to the locale snapshot, and re-renders in place on a Host language change. The tab labels are locale-aware functions, so they also update without slot re-registration.

Only plugin-owned interface copy is translated. Receipt evidence, Skill names and declarations, workspace names, output references, user-authored learning notes, and validation results remain local source data and are never translated, uploaded, or rewritten. The DSH locale contract currently ships `zh` and `en`; an unknown active locale follows DSH’s English fallback. A missing plugin dictionary key remains visible as its source key so omissions fail loud during review rather than silently rewriting evidence.

## Flow-map layout

The grid viewport can expand beyond the map's fixed coordinate system. A 1000px `st-map-stage` owns the SVG relationship layer, labels, and absolutely positioned nodes, and is centered inside that viewport. When the available width is below 1000px, the outer canvas keeps its 1000px minimum width and the scroll container exposes horizontal navigation. This is a presentation-only wrapper; the flow map and receipt continue to consume the same View Model and persistence is unchanged.

## Compatibility boundary

The preview was exercised against a specific DSH Desktop/runtime baseline. DSH event schemas and consumer integrations may evolve. Any upgrade must re-check the `skill(name)` call/result pairing, session persistence, restart recovery, empty state, and host non-interference before it is claimed compatible.

One such change already landed. The DSH session format V3 → V4 migration retired the `tool-result` wrapper block and lifted a tool result into a first-class `tool` message. Because the observer had matched only the V3 wrapper, sessions migrated to V4 recorded loads with no readable result: the instruction fingerprint, candidate steps, and version-drift detection were empty while the receipt still reported `loaded`. `test/session-format-v4-contract.test.mjs` now pins both spellings and is built from a captured V4 event, and `scripts/verify-project.mjs` rejects a return to V3-only matching. Prefer a captured real event over a hand-written fixture when pinning any event shape: the earlier fixtures encoded the V3 wrapper, which is why a green suite did not catch the break.
