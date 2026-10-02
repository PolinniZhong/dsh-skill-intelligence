# Architecture

## Product boundary

DSH Skill Intelligence (product name; npm package and plugin id stay `dsh-skill-trace`) observes event evidence produced by DeepSeek Harness and presents Skills as the primary product object. After v0.6 it has exactly two first-level pages — **本次 Skill** (which Skills this conversation loaded) and **已安装 Skill** (which Skills this DSH environment can discover) — and one second-level page, **Skill Detail** (`Skill 信息` / `Definition 元信息` / `Repository` / `SKILL.md` 原文 · Outline · 中文阅读版), where a Skill can also be cloned into a new directory. It does not decide which Skill to use, discover remote Skills, mount a Skill, or judge a model output.

```text
DSH event stream
  ├─ tool/call + tool/result        → every capability invocation (metadata only)
  ├─ user/message source.kind
  │    ├─ skill-invocation          → user-explicit `/name` load
  │    └─ skill-catalog             → published Declaration baseline
  └─ turn/start · step/start        → log-order attribution cursor
       └─ trace reducer
            └─ local session receipt        ← evidence layer, no page of its own
                 └─ /context projection      (served to the client through GET /context)
                      ├─ Skill Run          which Skills this conversation loaded, and how many times
                      └─ Evidence           declared steps ↔ scoped runtime evidence

DSH Skill registry (read live, never persisted)
  ├─ GET /installed   → what this environment can discover (never reads the receipt)
  └─ GET /skills · GET /skill · GET /definition · POST /translate
       └─ Client pages: 本次 Skill · 已安装 Skill ──→ Skill Detail
```

The receipt kept its evidence role and lost its page identity: it is no longer a screen, and neither the runtime flow nor the runtime graph is one. The route table below is the whole host surface; the section at the end, *V0.6 — 删除记录：删了什么，为什么留下的没删*, records which modules went with the deleted screens and why the reducer did not.

### Host surface

Ten routes remain. All ten are registered in `src/dsh/host/index.js` and pinned as literals by `scripts/verify-project.mjs`.

| Method | Route | Answers |
| --- | --- | --- |
| GET | `/skill-trace/context` | the session receipt (public projection), preferences, and view models |
| GET | `/skill-trace/skills` | which Skills this conversation loaded |
| GET | `/skill-trace/skill` | one loaded Skill's detail |
| GET | `/skill-trace/catalog` | which Skills this DSH environment can discover |
| GET | `/skill-trace/definition` | the live definition body, outline, repository, and fingerprint comparison |
| POST | `/skill-trace/translate` | a 中文阅读版 for one definition at one `sourceSha256`, and whether it was persisted |
| GET | `/skill-trace/translation` | the reading version already stored for `skillName` + `sourceSha256` + `targetLanguage`, or `null` |
| DELETE | `/skill-trace/translation` | delete exactly that one stored reading version |
| POST | `/skill-trace/clone` | copy one Skill into a new directory and verify the copy |
| POST | `/skill-trace/preferences` | persist the default first-level page |

The v0.7 additions follow three rules the verifier now enforces. `/skill-trace/translation` takes **no `sessionId`**: the reading version is an asset keyed by content, not a product of one conversation, and requiring a session would both invite the session into the key and imply the wrong lifetime. `/skill-trace/translate` reports a `saved` boolean that comes from an actual `translationStore.write()` — a request that started is not a save that finished — and that boolean is the only thing allowed to produce 「✓ 中文阅读版已保存」 in the interface. `/skill-trace/clone` re-reads the Skill and recomputes `sourceSha256` rather than trusting the value the client read earlier, so a body edited between the detail page loading and the clone being requested cannot slip through.

Fifteen further routes were deleted with the screens that consumed them: `/runtime`, `/inspect`, `/catalog`, `/history-note`, `/history-receipt`, `/export`, `GET`+`POST` `/backups`, `/backups/preview`, `/backups/restore`, `POST`+`DELETE` `/outputs`, `/continuity`, `/learning-note`, `/validation-result`, `DELETE /receipt`, and `DELETE /receipts`. The verifier asserts the deleted names cannot come back through the host, because a route with no page left is just a door the old information architecture can walk back in through.

## Evidence model

1. A matching `tool/call` and successful `tool/result` is recorded as a requested, successful load.
2. The result payload is read from either session format the runtime can produce. V3 wrapped a tool result in exactly one `tool-result` block inside a `user` message; V4 lifts it into a first-class `tool` message and retires that wrapper, so the content, `toolCallId`, and `isError` live on the message itself. Reading only the V3 spelling made every V4 result look empty while the record still claimed `loaded`, which silently dropped the instruction fingerprint, the candidate steps, and version-drift detection.
3. A Skill can be loaded on two paths, and both are recorded: the model calls the `skill` tool (`invocationType: model-invoked`), or the user names a Skill with the `/name` gesture, which DSH injects as a `user/message` carrying `source.kind = 'skill-invocation'` and which never produces a `skill` tool call (`invocationType: user-explicit`). DSH renders one canonical `<skill_content>` shape on both paths, so the instruction fingerprint and candidate steps come from the same extraction rule. No `implicit` value is emitted: there is no observable third path, and inventing one would be a claim the runtime cannot support.
4. `user/message` records no turn or step of its own. It is attributed by the `turn/start` / `step/start` cursor most recently seen in the same log — log order, never timestamps.
5. The reducer can associate repeated loads and multiple Skills in the same session.
6. A load record is not upgraded into proof of compliance, causal contribution, correctness, or usefulness.
7. Older releases let the user separately write an understanding, an improvement intent, a next validation plan, and later a human-authored validation result. v0.6 removed every write entry point, so those fields are legacy data: a receipt written by an earlier version may still carry them, and nothing in the current product creates, edits, or deletes them. They were always personal notes and never a quality score or causal proof.

## Runtime surface

Beyond Skill loads, the receipt keeps a bounded **normalized event stream** in `runtimeEvents`. This is the Normalizer and Invocation Aggregator stage of the Runtime Flow pipeline, and the raw material the graph is reconstructed from — not a second trace database. v0.6 removed the Runtime Flow *page* but not this stream: Skill Run and Evidence are both built from it, so it survives the screens that used to display it.

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

## Layout contract

The plugin is **embedded** in DSH, so the browser viewport is not the layout basis:

```
Browser viewport ≠ DSH content area ≠ plugin content area
```

A `100vh` / `100dvh` / `calc(100dvh - Npx)` makes the plugin size itself against the window
rather than the space the host actually gave it, which is why none of them appear on the height
chain. Instead the available height is **measured**: walk up to the nearest ancestor the host has
given a definite height, take the distance from this root's top to that ancestor's bottom, and
publish it as `--st-host-h`. The root rule then reads `height:var(--st-host-h,100%)`, so an absent
measurement degrades to `100%` rather than to a wrong number.

The chain that must stay intact:

```
[data-plugin="dsh-skill-trace"]  height: var(--st-host-h, 100%)
  .st-shell                      height:100%; min-height:0; display:flex; column
    .st-layout                   flex:1; min-height:0; display:grid
      page root                  min-height:0 (a list page or .st-detail)
```

v0.5's chain descended two layers further, into `.st-main → .st-flow → .st-flow-canvas-wrap → .st-flow-canvas`. Those components were deleted in v0.6 and the classes are gone, but the contract did not relax: the rule is about the *shape* of the chain, not about those particular names.

Every layer needs either `height:100%` or `flex:1` **together with `min-height:0`**; without
`min-height:0` a flex item refuses to shrink below its content and the chain silently reverts to
content height.

### The failure this guards

The root rule — `font-size`, `line-height`, `height`, `overflow`, `color`, `background` — once sat
**nested inside `@media(max-width:1050px)`**, because a closing brace that terminated the media
query had been read as stray and deleted. At every desktop width the rule therefore did not apply
at all: `font-size` fell back to the host's 16px, so the whole UI rendered a size larger, and
`height` resolved to content height, so the Runtime Graph occupied a strip at the top.

**All 337 tests then in the suite passed while that was true**, because no test parsed the stylesheet as CSS. It was
found by reading the browser's CSSOM, where the rule appeared at
`root > (max-width: 1050px) @290 #4` while the top-level rule at `root#0` held only custom
properties. `element.matches('[data-plugin="dsh-skill-trace"]')` returned `true` throughout — the
selector was correct and the *scope* was wrong.

`test/layout-contract.test.mjs` now holds the line: the root rule must sit at brace depth
0, must carry the typography and layout base, the height chain must use no viewport units, and the
stylesheet's braces must balance. The file was renamed from `phase11-layout-contract.test.mjs` in
v0.6 and its selector swapped for the v0.6 layout layers — the guard outlived the canvas, because
the accident it prevents was never about the canvas.

## Two ways the whole tab goes blank

`conversation.view` is a React slot with no error boundary above it, so a throw anywhere in the tree is not a local error state: React unmounts the entire slot and the user sees a blank tab. Two real occurrences set the rules.

1. **A hook after an early return.** `RuntimeView` and `FlowCanvas` placed `React.useMemo` after a `return` that fired on the first (loading) frame. The first frame called one hook fewer than the second, React threw `Minified React error #310`, and the Skill tab went white. The rule is source-level: no `React.use*` may sit after the first early return in the same component. `scripts/verify-project.mjs` (`HOOK_ORDER_OK`) compares those two line numbers, and `test/client-hook-order.test.mjs` exports `scanHookOrder(source)` and asserts zero violations against the real client. Component tests missed it because `test/client-render-smoke.test.mjs` stubs `useState` and only renders the frame where the data has already arrived — #310 needs two frames.
2. **Throwing on a missing field.** A page that received a malformed payload read `payload.coverage` off `undefined` and threw `Cannot read properties of undefined (reading 'coverage')` — the same blank tab, from a data bug rather than a hook bug. The rule: a missing field must degrade to a visible error state, and "cannot read it" must never be rendered as "there is nothing". A list that cannot be read says so; it does not render as an honest-looking empty list.

## Translation (中文阅读版)

`POST /skill-trace/translate` reads the Skill definition live (`registry.get(name, …)` → `loadSkillDefinition`), builds messages with `buildChunkMessages({skillName, chunkSource, targetLanguage, index, total, attempt})` from `src/core/skill-translation.mjs` and runs the segmented policy with `runSegmentedTranslation({…, ask})`, and calls the user's configured DSH model through `ctx.llm.stream` (`@deepseek-ai/dsh-llm` — provider-neutral, and the official non-session-polluting call pattern: `createUserMessage` → `llm.stream` → `BlockAssembler`, as in `@deepseek-ai/dsh-session-title-llm/lib/index.js:206-235`). `DEFAULT_TRANSLATION_LANGUAGE` is `'zh-CN'`.

Success returns `{ok, skillName, sourceSha256, targetLanguage, model, truncated, translation, preserved, saved}` with `translation` a plain string. Errors are a closed set: `invalid-request`, `skill-not-found`, `definition-changed`, `definition-unavailable`, `model-busy`, `translation-failed`.

The model is asked to preserve structure, and the answer is checked rather than trusted. `inspectTranslation({source, translation})` returns `{ok, violations, preserved}` with rule names `code-fence` / `heading` / `inline-code` / `url` / `file-path` / `frontmatter`, capped at 20 violations; the preservation targets themselves come from `extractProtected(markdown)`, which yields `{fences, fenceCount, headingLevels, inline, urls, paths, frontmatterKeys}`. A translation that moved a fence or edited a URL is discarded, not shown with a warning beside it — §14 of the spec is a hard rule, not a wish in the prompt. `compareTranslationSource({requestedSha256, currentSha256})` returns the string `'match' | 'mismatch' | 'unavailable'`: one side missing is `unavailable`, never a soft "the content changed".

**The reading version is persisted, and only when it is really persisted is the interface allowed to say so.** v0.6 held the translation in component state: leave the page, or restart DSH, and a paid model call was gone. v0.7 writes it through `src/storage/translation-store.mjs` into `<dataRoot>/translations/<sha256(key)>.json` and reads it back on entry, so a definition that has not changed costs nothing the second time.

The key is `skillName` + `sourceSha256` + `targetLanguage` and **does not include `sessionId`** — the reading version is an asset that belongs to a piece of content, not to the conversation that happened to request it, and a session in the key would both make reuse impossible and imply a lifetime the file does not have. `translationStoreKey()` joins the three with `\u0000`; the file name is the sha256 of that string. Because the key carries the content hash, **a body edit invalidates the reading version by construction**: the old file stays on disk (reverting an edit restores it) but is never served as current, and `GET /skill-trace/translation` reports `null` for the new hash, which the interface renders as 原文 plus an invitation to translate again. It never shows a translation of a different revision as if it were current.

`write()` refuses any record containing one of `FORBIDDEN_RECORD_FIELDS` (`sessionId`, `sessionID`, `messages`, `conversation`, `args`, `result`, `toolArguments`, `toolResult`) by throwing, so a future caller cannot quietly start persisting a session id next to a translation. The directory is `0700`, the file `0600`, and the write is a temp-file-plus-`rename`, copying `src/storage/receipt-store.mjs` exactly. `saved` in the translate response is the return of that write: `persistTranslation()` returns `false` on any throw and logs, and the interface's 「✓ 中文阅读版已保存（本地保存）」 is driven by that boolean alone — initiating a request is not evidence that a save happened. Nothing in `src/core/skill-translation.mjs` touches disk (the guard still forbids `receipt` / `localStorage` / `sessionStorage` / `writeFile` / `receiptStore` there); persistence is a host-side step after the text has already been validated. The one thing that leaves the machine is still the definition text sent to the model provider the user configured — stated plainly here because it is the entire outbound surface of this feature. `docs/PRIVACY.md` carries the same boundary for readers who care about data rather than modules.

## Installed Skill view

`GET /skill-trace/catalog` resolves the registry for the session, calls the existing `buildCatalogSnapshot(registry, cwd, liveAgent)`, and projects it through `buildInstalledView({catalogSnapshot, query})` from `src/core/installed-view.mjs`:

```
{schemaVersion:1, scope:'installed-skills', query,
 coverage:'complete'|'incomplete'|'unknown', observedAt,
 totalCount, skillCount, skills, limitations}
```

Each skill is `{name, description, provider, invocation:{modelInvocable,userInvocable}}` — a whitelist projection, so a field the host adds later does not silently flow to the client. `sourceFingerprint` is deliberately absent: no card renders it, no search filters on it, and an unread hash in an outbound projection eventually gets used as if it meant something.

The route **never reads the receipt**: what is installed on this machine has nothing to do with what a conversation happened to load. That is the same boundary `buildSessionSkillList(receipt, {lookup})` draws from the other side — the loaded list uses the registry only to describe names already loaded, never to discover members.

It is named `/installed` rather than the SDD §16 name `/catalog` because the old `/catalog` route — the learning workbench's endpoint — still existed when it was added. That workbench is now gone, so the name is a deliberate deviation from the spec, kept because renaming it after the fact buys nothing; it is not a bug.

## Main modules

| Module | Responsibility |
| --- | --- |
| `src/dsh/host/index.js` | DSH lifecycle bridge, the ten routes, event observation, privacy policy, local persistence wiring |
| `src/core/trace-reducer.mjs` | Converts observed events into bounded session evidence — the load-evidence layer v0.6 was required not to break |
| `src/core/runtime-events.mjs` | Normalizes session events into the RuntimeEvent model and aggregates invocations |
| `src/core/runtime-graph.mjs` | Correlates invocations into a provenance-bearing graph; refuses to invent relationships |
| `src/core/runtime-alignment.mjs` | Aligns declared Skill steps with scoped runtime evidence; never scores and never claims a step was skipped |
| `src/core/runtime-fingerprint.mjs` | Builds the definition-fingerprint reservation carried on the receipt |
| `src/core/skill-runtime-scope.mjs` | Bounds runtime evidence to the Turn in which a Skill loaded; no imports, so it is a leaf |
| `src/core/skill-flow.mjs` | `Markdown → Declared Flow`, definition-only; imports no runtime module |
| `src/core/skill-view-model.mjs` | Composition layer; runtime evidence may annotate the declared flow but never add, remove, or reorder a step |
| `src/core/skill-framework.mjs` | `Markdown → Skill Framework`, definition-only and deterministic — no model call, no summary. Splits the body into sections, classifies each heading into one of eight roles, synthesises a preamble section, keeps every unmatched heading as `unclassified` rather than dropping it, reports absent roles as absent instead of inventing them, and extracts declared resources with their tiers. `flow` is one sub-module of the result, not the result |
| `src/core/skill-definition.mjs` | One live read-only view of a definition, with `currentInstructionSha256`; the body is never persisted |
| `src/core/definition-outline.mjs` | Markdown outline plus declared-step anchors; pure, and does not interpret the Skill |
| `src/core/repository-resolver.mjs` | Resolves the repository a definition points at; never derives it from Skill identity, because DSH has no repository field |
| `src/core/installed-view.mjs` | Projects the catalog snapshot into the installed-skills view; never reads the receipt |
| `src/core/skill-translation.mjs` | Pure translation policy: protected-span masking, blank-line chunking, the per-segment prompt, `checkChunk` (structure **and** "did a translation actually happen"), `alignHeadingLevels` (repair a level the model "helpfully" changed), `splitChunkSource` (cut a failing segment in half instead of losing it whole), and violation inspection; the model call itself is injected as `ask` |
| `src/core/translation-cache.mjs` | Where a finished translation lives: an in-process `Map`, keyed by `sessionId` + skill + `sourceSha256`, capped at 8 entries, LRU. No storage, no filesystem, no IPC — the plugin unloading is what clears it |
| `src/core/installed-view.mjs` | The installed-catalog search predicate, shared by the host and the client so "found it" cannot depend on which end answered |
| `src/core/runtime-evidence.mjs` | Seam between raw tool arguments and the evidence model |
| `src/core/step-kind.mjs` | Shared step vocabulary; alignment compares only at kind level |
| `src/core/flow-evidence.mjs` | The labels the framework is allowed to use: five states keyed by the alignment relationships, the shared disclaimer, and `FLOW_EVIDENCE_FORBIDDEN` — the eight words that assert execution rather than observation. The guard imports this module and checks the resolved labels, because a source-text check would be satisfied by the forbidden list itself |
| `src/core/skill-runtime-logic.mjs` | `Receipt → what this session could actually observe`, in five stages (catalog / load / instructions / capability / evidence). Every stage carries the five-state vocabulary, the facts that *were* observed, and a per-stage limitation when nothing was. No receipt means the most conservative state for every stage, never a negative claim; `RUNTIME_LOGIC_FORBIDDEN` extends the flow-evidence ban with 已加载 / 已读取 / 已注入 / 已生效 |
| `src/core/markdown-table.mjs` | GFM table parsing — `parseTableAt` (header row plus delimiter row, or it is not a table) and `tableSignature` (columns, alignments, per-row cell counts). Shared deliberately: the renderer and the translation check must agree on what counts as a table, or "it renders" and "it validates" drift apart |
| `src/core/source-snapshot.mjs` | Safe source identity and snapshot metadata (sha256 plus provider sanitizing) |
| `src/core/session-log.mjs` | Reads the durable session log from disk as a fallback; the live session is always preferred |
| `src/storage/receipt-store.mjs` | Stores local receipts and schema migrations |
| `src/storage/preference-store.mjs` | Stores the default-view preference, at version 3 |
| `src/storage/translation-store.mjs` | Stores 中文阅读版 by `skillName` + `sourceSha256` + `targetLanguage` — deliberately **without** `sessionId` — at `0700`/`0600` with an atomic rename, and refuses to write any record carrying a session, conversation, or tool-argument field |
| `src/core/skill-clone.mjs` | Pure clone logic: name grammar, frontmatter split/rewrite, `<root>/<name>/SKILL.md` versus `<root>/<name>.md` bundle shape, entry selection with limits and named exclusion reasons, and the seven error codes |
| `src/core/skill-clone-path.mjs` | Which real directory a clone may land in, in DSH's own rank order, plus the two on-disk shapes that count as a name collision |
| `src/storage/skill-clone-writer.mjs` | The only module that writes a clone. Plain `node:fs/promises`, **not `ctx.fs`** — see below |
| `src/dsh/client/client.js` | Conversation view: 本次 Skill, 已安装 Skill, Skill Detail, the clone dialog, and the DSH `ctx.locale` adapter |

## Client component tree

`src/dsh/client/client.js` is the entire client — about 2343 lines, down from about 3536 before v0.6, with a bundle of about 126 KB down from about 421 KB. It registers exactly one slot (`conversation.view`, id `skill-trace`, order 70) plus the `dsh-skill-trace` locale namespace and the stylesheet lifecycle. What it renders today:

```text
Workbench                      first-level page switch + host preference
  ├─ TraceState                {kind, message, onRetry} — the shared failure state
  ├─ Icon
  ├─ CurrentSkillPage          本次 Skill     ← GET /skills, GET /skill
  │    └─ SkillCard            {name, description, meta, onOpen}
  ├─ InstalledSkillsPage       已安装 Skill   ← GET /catalog
  │    └─ InstalledSkillGrid   one clickable button per Skill — the whole card is the target
  └─ SkillDetailPage           Skill Detail   ← GET /definition, POST /translate, GET /translation
       ├─ sidePanel            facts + the object action (复刻 Skill — the only one)
       ├─ SkillFramework       the Skill's composition, above the document
       │    ├─ FrameworkStructure     sections grouped into eight roles (+ 其它章节, + absent roles)
       │    ├─ DeclaredWorkflow       flow.steps[] + evidence status — a sub-module, not the framework
       │    └─ ProgressiveDisclosure  declared vs loaded resources, with tiers
       ├─ RuntimeLogic         the five observable stages of this session
       ├─ StepEvidence         detail.flow.steps[].evidence, rendered for the first time
       ├─ renderSkillMarkdown  one call site for the original and the reading version
       └─ SkillCloneDialog     560px, rendered only while open; POST /clone
```

Two rules hold this shape together, and both are enforced by `SKILL_FRAMEWORK_OK` rather than by convention:

- **Declaration and observation render apart.** `SkillFramework` (structure, declared workflow, resources) reads only the definition; `RuntimeLogic` and `StepEvidence` read only the receipt. No path leads from runtime evidence back into the framework — a Skill whose structure was inferred from what happened would describe the run, not the Skill, which is the same mistake the deleted runtime graph made. Runtime data may *annotate* a declared step; it may never add, remove, or reorder one.
- **The four layers keep their order.** The detail body is `framework, runtimeLogic, stepEvidence, docPanel`; the guard matches that literal order and fails with `the detail body must read 框架 → 运行逻辑 → 步骤证据 → SKILL.md, in that order`. Reversing it is a different product: read the document first, guess the structure second. Putting runtime logic above the framework reads a declaration as an observation.
- **One renderer, one call site.** The assertion counts `renderSkillMarkdown(` call sites (excluding the definition and the `__pure` export) and requires exactly one. Two call sites would mean the original and the Chinese reading version could diverge, and only one of the two behaviours would be tested.
- **One object action, and no duplicate door.** `InstalledSkillGrid` renders one `button.st-installed-card` per Skill and nothing else, so the installed page's button count equals its card count. Before v0.7 the card was a non-interactive `article`: the list could be read but not entered, and the only way into a Skill you had installed was to load it in a conversation first. Adding a 「查看详情」 button beside a clickable card would have produced two controls for one action, one of which is always redundant.

None of these layers is a canvas: no `elkjs`, no `@xyflow/react`, no `mermaid` — the guard rejects all of them as dependencies. The framework draws roles and sections; the declared workflow draws the chain the definition already describes; the runtime logic draws five stages with no edges between them. That is why the whole thing costs a `grid`, a divider and a `<dl>` rather than a layout engine.

`detail.anchors` is a **shared** map: declared steps and framework sections both resolve to an outline entry id, because the same click handler serves both. A section without an anchor (a synthesised one, whose `anchorId` is `null`) renders as a non-clickable row and is absent from the map entirely — a button that does nothing when clicked is worse than an element that never claimed to be clickable.

The client calls only the ten surviving routes and nothing else. It holds no receipt, no graph, no draft buffer, and no backup state: a page fetches the projection it renders, and `TraceState` renders whatever the fetch could not establish — which is why the missing-field rule above matters more than it looks. A page that throws is not a page that shows an error; it is a blank tab.

## The clone write path

`POST /skill-trace/clone` is the only route in the plugin that creates files outside its own data directory, and every decision in it follows from one of four constraints.

**It does not use `ctx.fs`.** The sandboxed filesystem has no `mkdir`, no delete, and no move, and `writeText` is fenced to the workspace root — so it cannot reach `<dshHome>/skills` or `<agentsHome>/skills` at all, which is exactly where a user-scope clone belongs. `src/storage/skill-clone-writer.mjs` therefore uses plain `node:fs/promises`, the same choice the receipt and preference stores already made for their own directories.

**Not overwriting is a filesystem property, not a check.** `writeClone()` calls `mkdir(directory)` **without** `recursive`, so an existing target raises `EEXIST` and is reported as `target-exists`. There is no delete-then-write step anywhere in the path, which means there is no window in which a user's Skill has been removed and not yet replaced. A same-name collision is also probed *before* writing, through the whole catalog plus both on-disk shapes, so the user is told to rename rather than discovering the clash halfway through.

**A half-written Skill is worse than a failed clone.** Every copy failure (a missing declared reference, a permission error, a limit exceeded mid-walk) removes the directory it created and reports `write-failed`. The target directory is created first and populated second, and the caller never sees a partial Skill presented as a success. What the walk did *not* copy is reported too, and reported honestly: a bundle cut off by `CLONE_MAX_BYTES` sets `truncated`, and the interface says 「完整 Skill 没有拷全（已复制 N 个文件，M 个超过单次复刻上限）」 rather than calling a partial copy 完整. The walk also does not *enter* `.git` or `node_modules` and does not count them as skipped — a git-tracked Skill would otherwise report several hundred 「跳过的条目」 that were never content in the first place.

**The copy is read back before success is claimed.** After writing, `readBackClone()` re-parses the copy's frontmatter and compares the name it finds against the name requested; a mismatch removes the directory and fails. Only then does the response carry `verified: true`. The response also re-reads the **source** and compares `readSkillSourceSha256()` against the hash read before the write, so 「源 Skill 未被修改」 is a measurement rather than an assurance — and when the reread cannot be compared, `sourceUnchanged` is `false` and `source-reread-did-not-match` lands in `limitations`.

Two further rules shape what the handler may say. It never returns an absolute path; the caller gets `pathKind` (`project-dsh` / `user-dsh` / `user-agents`) and a sentence naming the scope. And it **polls the registry** for the target name — up to six attempts, 250 ms apart, because the filesystem provider's chokidar watcher needs its own write-stability window before it invalidates — to report `discovered` honestly. The plugin cannot force a rescan (`invalidateCache` is private, and only a provider's own `control.invalidate` is callable), so when the poll does not see the name, the interface says 「Skill 已写入 Skill 目录，目录刷新状态待确认。」 rather than claiming a refresh it did not observe.

**Which root a user-scope clone lands in is measured, not assumed.** `resolveCloneRoot()` answers in two tiers: first an existing root that already **holds Skills**, then an existing root in DSH rank order, then the default `<dshHome>/skills`. Ranking by existence alone was wrong on this very machine — `~/.dsh/skills` exists but is empty while `~/.agents/skills` holds the real user Skills, so a clone landed in a directory DSH can discover but the user does not use (reasons `populated-dsh-user-root` / `populated-agents-user-root` / `existing-dsh-user-root` / `existing-agents-user-root` / `default-dsh-user-root`). `probePopulatedRoots()` and `looksLikeSkillRoot()` decide "holds Skills" from directory contents — a child directory matching the Skill-name grammar that contains `SKILL.md`, or a child file `<name>.md` — never from the path's spelling.

## Legacy receipt fields

A receipt written by an older version may still contain `learningNotes[]` and `validationResults[]` from the learning loop v0.6 deleted. Nothing writes them any more: there is no note route, no validation route, and no editor component, so they are read only when rendering a receipt that already has them. They are never migrated into a new shape and never used to derive a status the current UI displays.

## Interface language

DSH Skill Intelligence follows the DeepSeek Harness locale service rather than the browser language. Its client registers a `dsh-skill-trace` namespace with `zh` and `en` dictionaries for static keys, uses explicit locale branches for dynamic templates, subscribes to the locale snapshot, and re-renders in place on a Host language change. The tab labels are locale-aware functions, so they also update without slot re-registration.

Only plugin-owned interface copy is translated. Receipt evidence, Skill names and declarations, workspace names, and any legacy output references, learning notes, or validation results remain local source data and are never translated, uploaded, or rewritten. The DSH locale contract currently ships `zh` and `en`; an unknown active locale follows DSH’s English fallback. A missing plugin dictionary key remains visible as its source key so omissions fail loud during review rather than silently rewriting evidence.

## Compatibility boundary

The preview was exercised against a specific DSH Desktop/runtime baseline. DSH event schemas and consumer integrations may evolve. Any upgrade must re-check the `skill(name)` call/result pairing, session persistence, restart recovery, empty state, and host non-interference before it is claimed compatible.

One such change already landed. The DSH session format V3 → V4 migration retired the `tool-result` wrapper block and lifted a tool result into a first-class `tool` message. Because the observer had matched only the V3 wrapper, sessions migrated to V4 recorded loads with no readable result: the instruction fingerprint, candidate steps, and version-drift detection were empty while the receipt still reported `loaded`. `test/session-format-v4-contract.test.mjs` now pins both spellings and is built from a captured V4 event, and `scripts/verify-project.mjs` rejects a return to V3-only matching. Prefer a captured real event over a hand-written fixture when pinning any event shape: the earlier fixtures encoded the V3 wrapper, which is why a green suite did not catch the break.

---

## V0.5 — Skill Runtime Scope

### 它解决什么

Declaration ↔ Runtime Alignment 此前是：

```
Skill 声明  ↕  整个 Session 的 Runtime Event
```

`buildAlignment` 的实现就是 `aggregateInvocations(receipt.runtimeEvents)`——**整个会话**。
于是「Turn 1 的 read、Turn 2 加载 Skill A、Turn 3 的 test」会让 Skill A 的声明步骤
「Inspect → Test」同时匹配到 Turn 1 与 Turn 3。**事件是真的，归属是编的。**

V0.5 改为：

```
Skill Declaration  ↕  Skill Runtime Scope  ↕  Observed Runtime Events
```

Alignment **只读取 Scope 内的事件**。Scope 无法建立时，范围内事件为空，所有声明步骤落进
`insufficient`——**诚实的读法是"Runtime 说不出来"，不是"没有做"。**

### Scope 的边界是怎么定的

**用 Turn，不用时间相邻。** 实测真实会话中 `turn` 字段在 **1343/1343** 个事件上存在，
而 `Session → Turn → Invocation` 是 **Runtime 自己声明的包含关系**。所以 Turn 是**结构边界**，
不是推断出来的。

明确**不采用**：「相邻事件」「最近事件」「时间距离最短」「最后一个 Tool」「Skill 之后的所有事件」——
这些都会产出证据不支持、却读起来像关系的归属。

实测一个真实会话：Turn 11 = `skill:1` + `cli:30` + `tool:8`，Turn 14 = `skill:1` + `tool:10` + `cli:18`。
**Scope 把 1343 个事件收敛到 68 个（5.1%）**，且构成与该 Turn 完全吻合。

### 范围状态

| 状态 | 含义 |
|---|---|
| `observed` | 这次加载自身（Scope 的锚点） |
| `correlated` | 与加载同一 Turn。**Runtime 声明了包含，但没有声明 Skill 导致了这次调用。** |
| `candidate` | 一条具名、可测、很窄的规则放进来的 |
| `unlinked` | Runtime 放不进去。**事件保留，不归属。** |

### 七个必须处理的情况

| | 情况 | 结果 |
|---|---|---|
| A | Skill 在某 Turn 加载，随后同 Turn 多个调用 | Scope = 该 Turn |
| B | 同一 Session 加载两个 Skill | 两个互不相交的 Scope |
| C | 同一 Turn 内多个 Invocation | 全部在该 Turn 的 Scope 内 |
| D | 用户 `/name` 显式加载 | 处理方式相同——它同样带 turn/step |
| E | 加载后该 Turn 没有别的事件 | Scope 只含加载自身 |
| F | 加载无法唯一匹配 | `unlinked`，不建 Scope |
| G | **同一 Turn 内两个 Skill** | **两者都 `unlinked`**——Turn 分不开，就不分 |

### Scope 不是什么

- **不是工作流。** 它不把事件排成 Agent 走过的步骤。
- **不是 Agent 思维链。** 不读提示词、不读工具参数、不读项目内容。
- **不是因果图。** 没有任何事件被说成由 Skill 引起。
- **不是遵循度。** Scope 里有事件，不代表 Skill 被遵循。

它只陈述一件事：**在当前 Runtime Evidence 下，这些事件可以可靠归属于这次 Skill 运行的证据范围。**

### 隐私

Scope 只存标识符与分类。不含提示词正文、不含工具参数、不含项目内容。
每个成员事件都必须能回指真实 runtime event id——**这正是 Scope 可审计的原因**。

### 仍然受限的地方

- **Subagent 谱系不可用**：实测 `childId` 在 1343 个事件里出现 **0** 次，且 `subagent.spawn`
  不指名是哪个 Invocation 创建的。因此 Subagent 派生**无法进入 Scope 的可靠边界**。
- **跨 Turn 的 Skill 工作不在 Scope 内。** 这是刻意的：宁可少算，不算错。
- **工具词表是固定的**：`classifyInvocationStep` 认识 `read`/`edit`/`bash` 等，
  实测会话里的 `read_image`/`job_output` 不在其中，会归类为 `other`（不强行归入某个步骤）。

---

## V5.0 — Skill-first Information Architecture

### 它解决什么

到 `0.4.0-beta.66` 为止，插件已经有 Definition Viewer、`SKILL.md` 原文、Definition Outline、
Repository Resolver、Runtime Alignment、Runtime Evidence 与 Runs。但它们全部挂在
「本次运行 → 定义视图」之下：

```
Session ├ Skill Receipt ├ Runtime Flow ├ Runtime Graph ├ Definition └ My Skills
```

Definition 是**运行的一个属性**。用户仍然必须先理解 Turn / Step / Invocation / Runtime Graph /
Scope / Edge，才能理解一个 Skill。判定标准很直接：如果必须先理解运行模型才能理解 Skill，
Skill-first 就没有完成。

V5.0 把 Skill 提升为一级对象：

```
Skill ├ Definition ├ Declared Flow ├ Runs ├ Evidence └ Repository
```

数据关系是 `Skill → Skill Definition → Declared Skill Flow → Skill Run → Runtime Evidence`。
Tool / MCP / CLI / Subagent **不是**一级对象，只能作为 Runtime Evidence 的来源出现。

### 方向不可逆：声明流程来自定义，不来自运行时

这是本次重构在技术上的核心一条。

```
Skill Definition → Definition Parser → Declared Skill Flow
                                            ↓
Runtime Evidence ────────────────→ attach evidence to Flow step
```

反过来做——从运行时事件归纳出一条流程——是被明确禁止的。那种产物是 Agent 的执行轨迹，
不是 Skill 的声明；而且它会让「Flow 有几步」取决于这次会话凑巧触发了什么。

实现上分成两个模块，边界就是这条方向：

- `src/core/skill-flow.mjs`：**只**依赖定义文本。它不 import 任何 runtime 模块。
  `extractDeclaredFlow(content, {truncated})` 产出
  `steps[{id: 'declared:N', order, title, kind, line, evidenceType}]`，另外带上
  `channel` / `note` / `headingCount` / `orderedListCount` / `stepCount` / `truncated` /
  `withheldCount` / `limitations`。步骤标题经 `sanitizeFlowTitle`，含绝对路径 / `~/` /
  Windows 盘符的整条扣留并计入 `withheldCount`——**宁可少一步，不落一条路径**。
- `src/core/skill-view-model.mjs`：组合层。`attachEvidenceToFlow(flow, annotated, hasRuntime)`
  **只从 flow 取 `id/order/title/kind/line/evidenceType`**，其余全部放进 `evidence.*`。
  这是「运行时只能标注、不能增删改序」的实现点。

`alignment` 仍然存在，但不再是 Flow 的来源，只是 `evidence` 的计算器。

同一段 SKILL.md 文本喂进 `extractDeclaredFlow`，无论手上有没有 receipt，`flow.steps` 必须逐字相同
（`test/phase15-skill-first-ia.test.mjs` 的 A5），而加入运行时证据后只有 `evidence.*` 变化（A6）。

### 扫描器只有一份

`Markdown → Declared Flow` 的扫描器（heading 优先、有序列表兜底、围栏与 frontmatter 跳过）住在
`src/core/skill-flow.mjs` 的 `scanDeclaredSteps`。**receipt 路径也走同一个它**：`runtime-alignment.mjs`
里的 `extractDeclarationSteps` 现在是一层包装，`scripts/verify-project.mjs` 会断言
`runtime-alignment.mjs` 必须包含 `scanDeclaredSteps`——即 receipt 路径不得另留一份拷贝。

拆分的动机是可观测的：receipt 路径历史上吃的是 harness 渲染的 `<skill_instructions>` 外壳，
定义路径吃的是原始 `SKILL.md`。两者正常同源，但外壳一旦增删结构就会分歧。
放在同一份扫描器下，分歧至少是可测的，而不是两套「声明步骤」各自演化。

### Skill 列表只认加载证据

`buildSessionSkillList(receipt, {lookup})` 只从 `receipt.traceEvents` 里 `status === 'loaded'`
的项建列表。`lookup`（Host 侧的 `registry.get`）**只用来给已经加载过的名字补描述与定义状态**，
绝不用来发现列表成员。因此「当前 Registry 里可发现」与「本次会话加载过」不会被混成一个列表——
后者是本页，前者是「我的 Skill」。

`definitionStatus` 是「registry 现在能否解析这个名字」，**不是哈希比对**。哈希三态属于 Skill 详情，
那里才真的读正文。这个区分是刻意的：列表不该因为读不到正文而说某个 Skill 有问题。

### Run 不伪造标识

DSH 没有原生的 `runId`。`buildSkillRuns` 用宿主自己给出的事件标识（`eventId`，退回
`callId` / `turn-step`）作为 `runKey`，**不发明字段**。定义指纹比对写进
`definitionSnapshot{observedInstructionSha256, currentInstructionSha256, match}`，
任一侧哈希缺失即 `unavailable`——**不为 `mismatch`**，也不写成「Skill 已失效」：
哈希只证明版本变化，不证明好坏。

### 证据词表与投影

`SkillRun` 与 Flow 步骤之间的关系标注沿用五值词表
（`runtime-supported` / `intent-supported` / `partial` / `insufficient` / `unknown`），
界面上投影成三类徽章。它回答「这一步拿到了什么证据」，**不回答「这一步做对了」**。
`Evidence ≠ correctness`，`Insufficient ≠ not executed`；没有 compliance rate、score、
ranking 或百分比。

### 默认视图

默认页偏好只有 `current`（本次 Skill）与 `installed`（已安装 Skill）两个取值，版本号是 3。
`skills` / `map` / `receipt` / `audit` / `runtime` 都是旧 IA 的取值，客户端把它们一律映射到
`current`，`catalog` 映射到 `installed`（见 `LEGACY_VIEWS`）——迁移的是第一屏，不是对用户意图的考古。

旧值的可信度问题仍然成立，而且正是版本号存在的理由：文件本身不记录这个值是用户点的、
还是旧 IA 写下的缺省值。所以只有**版本号匹配**的文件才算「用户表达过偏好」：

| 磁盘上的值 | 判定 | 第一屏 |
|---|---|---|
| `{"version":3,"defaultView":"current"}` | 本版写下 | `current` |
| `{"version":3,"defaultView":"installed"}` | 本版写下，用户主动选的 | `installed` |
| `{"version":2,…}` 或 `{"defaultView":"map"}`（无 `version`） | 版本不匹配 → 视为**从未表达偏好** | `current` |

`src/storage/preference-store.mjs` 的 `PREFERENCES_VERSION = 3` 是唯一版本源，读路径走
`normalizeStored`（版本或取值不匹配即回落 `current`），写路径走 `normalizeChosen`（一律盖章 3）。
客户端 `src/dsh/client/client.js` 里另有一份 `PREFERENCE_VERSION = 3`：只有它等于响应里的
`preferences.version` 时才采纳宿主偏好——这样**旧宿主**（响应里根本没有 `version` 字段，
或还停在版本 2）也不会把第一屏交回给旧的运行地图。两份常量由 `scripts/verify-project.mjs` 的
`PREFERENCE_VERSION_OK` 钉住必须相等：它们若漂移，失败方式是静默的——不报错，只是第一屏换回去。

### 两个端点的信封

Skill-first 第一屏要的数据来自两个只读端点，都必须带 `sessionId`（缺失即 `400`）：

| 端点 | 响应 | 载荷 |
|---|---|---|
| `GET /skill-trace/skills?sessionId=` | `{ok, sessionId, workspaceLabel, list}` | `list` = `buildSessionSkillList(receipt, {lookup})` |
| `GET /skill-trace/skill?sessionId=&skillName=` | `{ok, sessionId, workspaceLabel, list, skill}` | 多一个 `skill` = `buildSkillDetail({receipt, view, skillName, listEntry})` |

**列表套在 `list` 里，详情套在 `skill` 里**，客户端必须各解一层。这个信封确实错配过一次
（服务端发 `body.list`，客户端读 `body.skills`），而当时两侧测试都是绿的：接口测试只看响应形状，
组件测试走的是注入进去的列表。抓到它的是渲染台用**真实载荷**截的那张图——副标题按收据数着
「1 个 Skill」，正文却写着「暂未加载」。现在由 `scripts/verify-project.mjs` 的成对断言钉住：
宿主必须含 `list: buildSessionSkillList(`，客户端必须含 `setList(body?.list ?? null)`——
只改一端就失败。

两个端点都只读、不写盘；定义正文现读现返，不落盘。

### Hooks 顺序是渲染合同

`conversation.view` 的 slot entry 是一个 React 组件，而且**没有错误边界接住它**：
组件一抛错，整个标签页就空掉，用户看到的是一片白。`0.4.0-beta.67` 就栽在这里——
`RuntimeView` 与 `FlowCanvas` 把 `React.useMemo` 写在了提前 return 之后，第一帧（loading）
少调一个 hook、数据到达后的第二帧多调一个，React 抛 `Minified React error #310`，
Skill 标签页整片空白。

所以「同一个组件里 hook 不得排在提前 return 之后」在本项目是源码级合同，由两道守卫执行：

- `scripts/verify-project.mjs` 的 `HOOK_ORDER_OK`：按缩进切分顶层组件，比较**第一个提前 return**
  与**最后一个 `React.use*`** 的行号，倒置即失败。
- `test/client-hook-order.test.mjs`：导出 `scanHookOrder(source)`，对真实客户端断言零违规，
  并用内联 fixture 证明扫描器两种写法都认——单行 `if (...) return ...` 与花括号换行。

组件测试没抓到的原因值得记住：`test/client-render-smoke.test.mjs` 的 `useState` 桩永不更新，
它只渲染「数据已经到了」的那一帧，而 #310 需要**两帧**才出现。

### 仍然受限的地方

- **声明流程与运行时步骤的对应仍靠 step kind。** `alignStep` 只在类别层面匹配，不比文本。
  一个声明为 `inspect` 的步骤遇到一次 `bash` 调用不会直接判 `runtime-supported`；
  它会走到 `intent-supported` 或停在 `partial`。这是「宁可说证据不足」的一贯取舍。
- **receipt 路径仍然可能把围栏代码里的 `#` 当标题。** 定义路径已跳过围栏，receipt 路径为了
  与历史收据逐字一致仍走原样扫描。两条路径产出的步骤因此在边界情况下会分歧，且这是已知的、
  被测试锁住的行为，不是偶发缺陷。
- **`<skill_content>` 外壳不可复现。** 插件里没有任何 `@deepseek-ai` 运行时导入，
  `renderSkillContent()` 拿不到，因此该层显式报告为「不可在宿主之外复现」，而不是自己拼一个像的。

---

## V0.6 — 删除记录：删了什么，为什么留下的没删

v0.6 只做一件事：把「本次对话加载了哪些 Skill」与「这台机器上有哪些 Skill」变成两个可读页面，
其余全部删掉。它没有新增证据模型，也**没有删掉任何证据**——删掉的是页面、画法和写入口。

### 删除顺序

按 SDD §4.4 的顺序落地，因为反过来做会先删掉还在被引用的东西：

```
UI 组件 → View consumer → Host consumer / 路由 → 图布局依赖 → 最后才是只服务运行图的代码
```

| 类别 | 删掉的东西 |
| --- | --- |
| 路由 | 15 条：`/runtime`、`/inspect`、`/catalog`、`/history-note`、`/history-receipt`、`/export`、`GET`+`POST` `/backups`、`/backups/preview`、`/backups/restore`、`POST`+`DELETE` `/outputs`、`/continuity`、`/learning-note`、`/validation-result`、`DELETE /receipt`、`DELETE /receipts` |
| 模块 | `src/core/runtime-layout.mjs`、`src/core/runtime-layout-elk.mjs`、`src/core/runtime-inspector.mjs`、`src/core/runtime-replay.mjs`、`src/core/catalog-view.mjs`、`src/storage/backup-store.mjs`、`src/dsh/client/runtime-flow.js` |
| 组件 | 运行视图（`RuntimeView`、`RuntimeInspector`、`FlowCanvas`、`ReplayControls`、`MapView`、`Inspector`）、收据（`ReceiptView`、`ReceiptDetails`、`ReceiptRow`、`FingerprintSection`）、学习与校验（`ValidationEditor`、`DeclarationPanel`、`LearningPanel`、`HistoricalContinuationAction`）、旧目录工作台（`CatalogPage`、`CatalogGuide`、`CatalogDetail`、`HistoryCard`）、布局外壳（`Aside`、`SessionSummary`、`SessionStatus`） |
| 依赖 | `elkjs`（分层布局）与 `@xyflow/react`（画布）。`dependencies` 因此为空，只剩 `devDependencies: { esbuild }`；`peerDependencies` 保留 `@deepseek-ai/dsh-llm`，因为翻译要用它 |

因此客户端从约 3536 行降到约 2343 行，bundle 从 421 KB 降到约 126 KB，只调用留下来的十条路由，
并且只注册一个 slot（`conversation.view`）。

### 为什么 `runtime-layout.mjs` 死了，而 `trace-reducer.mjs` 和指纹模块活着

判据只有一条：**这个模块是在陈述证据，还是在陈述证据的一种画法。**

`runtime-layout.mjs` 是画法。它的输入是图、输出是坐标，它自己不产生任何关于会话的断言——
删掉它，`/context` 返回的 receipt 一个字节都不变。`runtime-inspector.mjs` 同理，它是
「这条线为什么存在」的问答界面；`catalog-view.mjs` 是旧 My Skills 工作台的投影，而它的消费者
（学习时间线、待复核、继续交接）已经不存在；`backup-store.mjs` 服务的是一整套被删掉的
导出 / 备份 / 还原链——没有入口的备份不是备份，只是一条没人走的写路径。

`trace-reducer.mjs` 不是画法。它把观测到的事件变成**有界会话证据**：哪些 Skill 被加载、
加载了几次、每次的指令指纹是什么。这正是 SDD §4 明确要求**不得破坏**的那个 reducer，
`GET /context` 与第一屏「本次 Skill」都在用它。它 import 的三个模块因此一并留下：

- `runtime-graph.mjs` —— `trace-reducer.mjs:971` 每次归约都调用 `buildRuntimeGraph(receipt)`，把结果
  的 `stats` 写进收据的图摘要，并用同一个图生成指纹预留位（`buildFingerprintReservation(runtimeGraph)`）。
  删掉它，收据的图摘要与指纹路径会同时断掉。
- `runtime-alignment.mjs` —— 声明步骤 ↔ 运行证据的对照。`trace-reducer.mjs` 直接调用它的
  `buildAlignment` 与 `extractDeclarationSteps`，这是 Evidence 的来源。
- `runtime-fingerprint.mjs` —— 定义指纹预留位，让「这次加载看到的是哪一版正文」可以被比对；
  哈希三态 `match` / `mismatch` / `unavailable` 必须保留，否则 `definition-changed` 无从判定。

`skill-runtime-scope.mjs` 一并留下：它把证据收敛到加载发生的那个 Turn，是 `runtime-alignment.mjs`
的直接输入，而且**没有任何 import**——留着它的成本是零。

一句话：删除的判据不是「和运行图有关」，而是「删掉之后，收据还能不能回答它一直在回答的问题」。
`runtime-layout.mjs` 删掉之后答案不变；`trace-reducer.mjs` 删掉之后答案就没有了。

### 保留的是角色，不是页面

Receipt 失去了页面身份，没有失去职责：它仍然是「本次对话加载了哪些 Skill、各自加载了几次」的
证据层，只是不再有自己的一屏，改为通过 `GET /skill-trace/context` 提供。运行图与运行流程同样
不再有页面：图以 `graph.stats` 的形式留在收据摘要里，运行流程的数据仍留在 `runtimeEvents` 里，
Skill Run 与 Evidence 都从后者构建。

旧版本写入的学习笔记与验证结果**仍然留在收据里**，但 v0.6 删除了全部写入入口：没有 note 路由、
没有 validation 路由、也没有编辑组件。它们只在渲染旧收据时被读到，见上面的「Legacy receipt fields」。
