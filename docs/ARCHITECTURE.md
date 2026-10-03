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
  ├─ GET /installed   → what this environment can discover, newest arrival first (never reads the receipt)
  └─ GET /skills · GET /skill · GET /definition · POST /translate
       └─ Client pages: 本次 Skill · 已安装 Skill ──→ Skill Detail
```

The receipt kept its evidence role and lost its page identity: it is no longer a screen, and neither the runtime flow nor the runtime graph is one. The route table below is the whole host surface; the section at the end, *V0.6 — 删除记录：删了什么，为什么留下的没删*, records which modules went with the deleted screens and why the reducer did not.

### Host surface

Twelve routes are built. The v0.8 work added exactly one — `GET /skill-trace/diff` — and deliberately added no `/lineage`, `/evolution`, `/source`, or `/versions`: lineage travels inside the existing `GET /skill-trace/skill` response, and only a genuinely heavy recomputation earns a route of its own. **v0.9.0 added none at all**: Skill validation travels as one sibling field (`validation`) on the two responses that already answer "what is this Skill", produced by one shared `validationFor()`. **v0.9.1 adds one — `POST /skill-trace/modify`** — the second route in this project that is not a pure read (the first is `POST /skill-trace/clone`), and the one that needs the most explaining. **v0.9.2 adds none at all**: installed-list ordering is derived from two read-only lookups and travels as added fields on the response that already answers "what is installed" — `ordering` for the list as a whole, `addedAt` and `lineage` per Skill, all on the existing `GET /skill-trace/catalog`. **v0.10.0 also adds no route**, and this time not even a field: instance acceptance runs entirely in the client, and the host is unchanged by a single byte (§V0.10.0). A planned `POST /skill-trace/instance-test` was cancelled — the generator is a pure client-side function over data the detail page already has, and a route would have implied a host-side capability, a persisted result, or a second runtime that this version deliberately does not have. The user's own modification intent never reaches the host at all: it lives in the client's local state, is handed to the generator as `intent`, and is gone on refresh — not persisted, not in a receipt, not in the session log. Every route is registered in `src/dsh/host/index.js` and pinned as literals by `scripts/verify-project.mjs`.

| Method | Route | Answers |
| --- | --- | --- |
| GET | `/skill-trace/context` | the session receipt (public projection), preferences, and view models |
| GET | `/skill-trace/skills` | which Skills this conversation loaded |
| GET | `/skill-trace/skill` | one loaded Skill's detail — plus, from v0.8, its lineage record, and from v0.9.0 its `validation` result |
| GET | `/skill-trace/catalog` | which Skills this DSH environment can discover — and, from v0.9.2, in the order they arrived on this machine, newest first |
| GET | `/skill-trace/definition` | the live definition body, outline, repository, fingerprint comparison, and the same `validation` result |
| POST | `/skill-trace/translate` | a 中文阅读版 for one definition at one `sourceSha256`, and whether it was persisted |
| GET | `/skill-trace/translation` | the reading version already stored for `skillName` + `sourceSha256` + `targetLanguage`, or `null` |
| DELETE | `/skill-trace/translation` | delete exactly that one stored reading version |
| POST | `/skill-trace/clone` | copy one Skill into a new directory and verify the copy |
| POST | `/skill-trace/preferences` | persist the default first-level page |
| GET | `/skill-trace/diff` | **v0.8, shipped.** The deterministic three-layer diff between one Skill and its recorded origin, with both sides' availability and content fingerprints |
| POST | `/skill-trace/modify` | **v0.9.1, working tree.** One modification, two actions: `begin` stores the pre-modification state in host memory and asks the current session's Agent to carry out the change; `compare` diffs that snapshot against a freshly read current state, releases the snapshot, and returns the same `validation` result as `/skill` and `/definition` |

**`POST /skill-trace/modify` does not break the read-only-observer identity.** It takes `{ sessionId, skillName, action: 'begin' | 'compare', intent?, scopes?, profiles? }` and writes no file at all. `begin` reads the whole `SKILL.md`, the directory listing and the source fingerprint and keeps them **in host memory only** — never on disk, never in a receipt, never in the session log, gone the moment the host restarts — then asks the Agent of the **current** conversation, through `agent.followup(message)`, to carry out the change. That single message carries `source.kind = 'skill-intelligence-modify'`, a custom kind: `MessageSourceMap` is an extensible and-type, consumers fall back to plain rendering for a kind they do not know, and the run record therefore shows at a glance that the message was not typed by hand. There is no second message, no polling of the Agent's output, and no parsing of its reply. The message does state one flow requirement the plugin will never carry out itself: *say what you intend to change before writing, and ask the user through their own question mechanism whenever anything is uncertain* — 「提出方案 → 用户确认 → 动手」 happens in the ordinary conversation, unbrokered and unparsed, but the plugin must ask for it: staying silent would read as permission to edit straight away. `compare` hands the in-memory "before" and a freshly read "now" to the pure `diffSkillModification()` — three states, `unchanged | changed | unavailable`, with line-level, section-level and resource-level changes, out-of-scope changes, and the source-fingerprint comparison — releases the snapshot in the same request, and returns the shared `validation` result alongside. Failure is named, never swallowed: an empty intent is `400 missing-intent`, a session with no running Agent (or no `followup`) is `409 session-not-live`, an unreadable `SKILL.md` is `422 skill-file-unreadable`, an unknown Skill is `404 unknown-skill`, and a dispatcher that throws releases the snapshot it just stored before answering `500 dispatch-failed` — keeping a "before" whose task never left would make the interface believe the change had been sent. What is deliberately absent is what would turn this into a writer: the plugin adds no second Agent Runtime, does not poll the Agent, and runs no file operation of its own. Clicking 「交给 Agent」 is itself the authorization; the files are changed by the current session's Agent using DSH's native file tools under DSH's own permissions. The capability is named **this modification's comparison**（本次修改对比）, not "historical version comparison" — there is no version entity here, only two `sha256` values.

The v0.7 additions follow three rules the verifier now enforces. `/skill-trace/translation` takes **no `sessionId`**: the reading version is an asset keyed by content, not a product of one conversation, and requiring a session would both invite the session into the key and imply the wrong lifetime. `/skill-trace/translate` reports a `saved` boolean that comes from an actual `translationStore.write()` — a request that started is not a save that finished — and that boolean is the only thing allowed to produce 「✓ 中文阅读版已保存」 in the interface. `/skill-trace/clone` re-reads the Skill and recomputes `sourceSha256` rather than trusting the value the client read earlier, so a body edited between the detail page loading and the clone being requested cannot slip through.

**Request validation says sentences, and the request body is a two-sided contract.** Both rules came from the same defect: from `0.7.0` the 「复刻 Skill」 button never once worked, because the client built its body without `sessionId` while `handleClone` requires it — the user's reward for clicking was the raw validator string `sessionId 必填`. The host now throws `RequestError(message, status = 400)`, which carries its own status and whose message must read as a full sentence telling the user what to do; the 400-vs-500 split reads `error.status` instead of regex-guessing the message text. That guessing was the cause, not the symptom: it forced every validator message to be a bare field name, and `sendJson` then handed that name to the user. The leftover word list serves only errors that have not been converted yet, and nothing new may be added to it. Two guards watch the seam: one reads `payload.*` out of the host source and requires the client's outgoing body to cover every field the host reads; the other requires that every prop a component destructures without a fallback is actually passed at its render site. Testing each side on its own cannot find this class of bug — the host-side test supplied the very field the client forgot.

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

`conversation.view` is a React slot with no error boundary above it, so a throw anywhere in the tree is not a local error state: React unmounts the entire slot and the user sees a blank tab. Three real occurrences set the rules.

1. **A hook after an early return.** `RuntimeView` and `FlowCanvas` placed `React.useMemo` after a `return` that fired on the first (loading) frame. The first frame called one hook fewer than the second, React threw `Minified React error #310`, and the Skill tab went white. The rule is source-level: no `React.use*` may sit after the first early return in the same component. `scripts/verify-project.mjs` (`HOOK_ORDER_OK`) compares those two line numbers, and `test/client-hook-order.test.mjs` exports `scanHookOrder(source)` and asserts zero violations against the real client. Component tests missed it because `test/client-render-smoke.test.mjs` stubs `useState` and only renders the frame where the data has already arrived — #310 needs two frames.
2. **Throwing on a missing field.** A page that received a malformed payload read `payload.coverage` off `undefined` and threw `Cannot read properties of undefined (reading 'coverage')` — the same blank tab, from a data bug rather than a hook bug. The rule: a missing field must degrade to a visible error state, and "cannot read it" must never be rendered as "there is nothing". A list that cannot be read says so; it does not render as an honest-looking empty list.
3. **An object where a React child was expected (v0.9.0).** The validation card rendered a Profile's label with `raw(profile.label ?? profile.id)`. `profiles[].label` is `{zh, en}`, and `raw()` only marks a value as "do not translate" — it does not stringify it, so React threw `Minified React error #31` ("Objects are not valid as a React child (found: object with keys {zh, en})") and the tab went blank. The render smoke test caught it only because it asserts the *text* of the verdict: its stub turns strings and numbers into text nodes and leaves an object child as an untyped node, so the label simply never appears. The rule: pick the language explicitly (`profile.label.zh`) before rendering, and let the guard forbid the bare form.

## Translation (中文阅读版)

`POST /skill-trace/translate` reads the Skill definition live (`registry.get(name, …)` → `loadSkillDefinition`), builds messages with `buildChunkMessages({skillName, chunkSource, targetLanguage, index, total, attempt})` from `src/core/skill-translation.mjs` and runs the segmented policy with `runSegmentedTranslation({…, ask})`, and calls the user's configured DSH model through `ctx.llm.stream` (`@deepseek-ai/dsh-llm` — provider-neutral, and the official non-session-polluting call pattern: `createUserMessage` → `llm.stream` → `BlockAssembler`, as in `@deepseek-ai/dsh-session-title-llm/lib/index.js:206-235`). `DEFAULT_TRANSLATION_LANGUAGE` is `'zh-CN'`.

Success returns `{ok, skillName, sourceSha256, targetLanguage, model, truncated, translation, preserved, saved}` with `translation` a plain string. Errors are a closed set: `invalid-request`, `skill-not-found`, `definition-changed`, `definition-unavailable`, `model-busy`, `translation-failed`.

The model is asked to preserve structure, and the answer is checked rather than trusted. `inspectTranslation({source, translation})` returns `{ok, violations, preserved}` with rule names `code-fence` / `heading` / `inline-code` / `url` / `file-path` / `frontmatter`, capped at 20 violations; the preservation targets themselves come from `extractProtected(markdown)`, which yields `{fences, fenceCount, headingLevels, inline, urls, paths, frontmatterKeys}`. A translation that moved a fence or edited a URL is discarded, not shown with a warning beside it — §14 of the spec is a hard rule, not a wish in the prompt. `compareTranslationSource({requestedSha256, currentSha256})` returns the string `'match' | 'mismatch' | 'unavailable'`: one side missing is `unavailable`, never a soft "the content changed".

**The reading version is persisted, and only when it is really persisted is the interface allowed to say so.** v0.6 held the translation in component state: leave the page, or restart DSH, and a paid model call was gone. v0.7 writes it through `src/storage/translation-store.mjs` into `<dataRoot>/translations/<sha256(key)>.json` and reads it back on entry, so a definition that has not changed costs nothing the second time.

The key is `skillName` + `sourceSha256` + `targetLanguage` and **does not include `sessionId`** — the reading version is an asset that belongs to a piece of content, not to the conversation that happened to request it, and a session in the key would both make reuse impossible and imply a lifetime the file does not have. `translationStoreKey()` joins the three with `\u0000`; the file name is the sha256 of that string. Because the key carries the content hash, **a body edit invalidates the reading version by construction**: the old file stays on disk (reverting an edit restores it) but is never served as current, and `GET /skill-trace/translation` reports `null` for the new hash, which the interface renders as 原文 plus an invitation to translate again. It never shows a translation of a different revision as if it were current.

`write()` refuses any record containing one of `FORBIDDEN_RECORD_FIELDS` (`sessionId`, `sessionID`, `messages`, `conversation`, `args`, `result`, `toolArguments`, `toolResult`) by throwing, so a future caller cannot quietly start persisting a session id next to a translation. The directory is `0700`, the file `0600`, and the write is a temp-file-plus-`rename`, copying `src/storage/receipt-store.mjs` exactly. `saved` in the translate response is the return of that write: `persistTranslation()` returns `false` on any throw and logs, and the interface's 「✓ 中文阅读版已保存（本地保存）」 is driven by that boolean alone — initiating a request is not evidence that a save happened. Nothing in `src/core/skill-translation.mjs` touches disk (the guard still forbids `receipt` / `localStorage` / `sessionStorage` / `writeFile` / `receiptStore` there); persistence is a host-side step after the text has already been validated. The one thing that leaves the machine is still the definition text sent to the model provider the user configured — stated plainly here because it is the entire outbound surface of this feature. `docs/PRIVACY.md` carries the same boundary for readers who care about data rather than modules.

## Installed Skill view

`GET /skill-trace/catalog` resolves the registry for the session, calls the existing `buildCatalogSnapshot(registry, cwd, liveAgent)`, and projects it through `buildInstalledView({catalogSnapshot, query, addedAtByName, lineageByName})` from `src/core/installed-view.mjs`. The last two arguments are the v0.9.2 read-only lookups, and both are optional: `addedAtByName` answers when each Skill's directory arrived on this machine, `lineageByName` answers which name was cloned from which (see §V0.9.2):

```
{schemaVersion:1, scope:'installed-skills', query,
 coverage:'complete'|'incomplete'|'unknown', observedAt,
 totalCount, skillCount, skills,
 ordering:{rule, addedAtKnown, addedAtUnknown}, limitations}
```

Each skill is `{name, description, provider, invocation:{modelInvocable,userInvocable}, addedAt, lineage}` — a whitelist projection, so a field the host adds later does not silently flow to the client. `addedAt` is a number or `null`, `lineage` is `{sourceSkillName, createdAt}` or `null`, and `sourceFingerprint` is deliberately absent: no card renders it, no search filters on it, and an unread hash in an outbound projection eventually gets used as if it meant something.

The `skills` array is **ordered by when each Skill arrived on this machine, newest first**, and the rule has a name rather than a description: `INSTALLED_ORDERING_RULE = 'added-desc-then-name'`, exported from the module and copied into `ordering.rule`. A Skill whose arrival time cannot be read sorts last, by name; two Skills with the same arrival time also fall back to name. `ordering.addedAtKnown` / `addedAtUnknown` are counted over the **whole catalog**, not the current search results — typing in the search box must not change how many Skills can state an arrival time. The four limitation codes and the reason the time is the directory's `birthtime` are in §V0.9.2; the client only reads this rule, it never re-sorts.

The route **never reads the receipt**: what is installed on this machine has nothing to do with what a conversation happened to load. That is the same boundary `buildSessionSkillList(receipt, {lookup})` draws from the other side — the loaded list uses the registry only to describe names already loaded, never to discover members.

It is named `/installed` rather than the SDD §16 name `/catalog` because the old `/catalog` route — the learning workbench's endpoint — still existed when it was added. That workbench is now gone, so the name is a deliberate deviation from the spec, kept because renaming it after the fact buys nothing; it is not a bug.

## Main modules

| Module | Responsibility |
| --- | --- |
| `src/dsh/host/index.js` | DSH lifecycle bridge, the twelve routes, event observation, privacy policy, local persistence wiring |
| `src/core/trace-reducer.mjs` | Converts observed events into bounded session evidence — the load-evidence layer v0.6 was required not to break |
| `src/core/runtime-events.mjs` | Normalizes session events into the RuntimeEvent model and aggregates invocations |
| `src/core/runtime-graph.mjs` | Correlates invocations into a provenance-bearing graph; refuses to invent relationships |
| `src/core/runtime-alignment.mjs` | Aligns declared Skill steps with scoped runtime evidence; never scores and never claims a step was skipped |
| `src/core/runtime-fingerprint.mjs` | Builds the definition-fingerprint reservation carried on the receipt |
| `src/core/skill-runtime-scope.mjs` | Bounds runtime evidence to the Turn in which a Skill loaded; no imports, so it is a leaf |
| `src/core/skill-flow.mjs` | `Markdown → Declared Flow`, definition-only; imports no runtime module |
| `src/core/skill-view-model.mjs` | Composition layer; runtime evidence may annotate the declared flow but never add, remove, or reorder a step. From v0.9.0 it also carries `validation` through unchanged — the key always exists and is `null` when the host had nothing to pass, because the client tells "the host did not send this field" apart from "this Skill could not be read" by `hasOwnProperty` |
| `src/core/skill-framework.mjs` | `Markdown → Skill Framework`, definition-only and deterministic — no model call, no summary. Splits the body into sections, classifies each heading into one of eight roles, synthesises a preamble section, keeps every unmatched heading as `unclassified` rather than dropping it, reports absent roles as absent instead of inventing them, and extracts declared resources with their tiers. `flow` is one sub-module of the result, not the result |
| `src/core/skill-definition.mjs` | One live read-only view of a definition, with `currentInstructionSha256`; the body is never persisted |
| `src/core/definition-outline.mjs` | Markdown outline plus declared-step anchors; pure, and does not interpret the Skill |
| `src/core/repository-resolver.mjs` | Resolves the repository a definition points at; never derives it from Skill identity, because DSH has no repository field |
| `src/core/installed-view.mjs` | Projects the catalog snapshot into the installed-skills view; from v0.9.2 it also sorts by arrival time (`INSTALLED_ORDERING_RULE = 'added-desc-then-name'`, unknowns last by name) and reports `ordering` over the whole catalog; it never reads the receipt and imports nothing, because the client requires it |
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
| `src/storage/skill-clone-writer.mjs` | The only module that writes a clone. Plain `node:fs/promises`, **not `ctx.fs`** — see below. Since v0.9.0 it also exports `readSkillFile`, the read the validator needs: `readSkillBody` deliberately returns the body only (it matches the registry's `SkillDefinition.content`, which is `parsed.body.trim()`), so validating a real Skill through it would report "frontmatter missing" for every Skill on disk. Since v0.9.2 it also exports the two read-only ordering lookups, `skillAddedAtByName({names, roots})` and `skillRootCandidates({cwd})` — both read `stat` and nothing else, and neither writes, clones, or executes anything (§V0.9.2) |
| `src/core/skill-profiles.mjs` | **v0.9.0.** The rule table, as data: five Profiles (`common` + `dsh` / `microsoft` / `openai` / `anthropic`), thirty-two rules, each `{id, profile, severity, title, fact, source, note}`. Constants only — no judgement, no IO. A rule's `fact` is unique across the table, so two Profiles can share one rule by reference instead of restating it, and the same fact may legitimately carry a different severity per Profile (`MS-DIR-001` is `error`, `OA-DIR-001` is `warning`, and the DSH Profile has no directory rule at all) |
| `src/core/skill-validation.mjs` | **v0.9.0.** The deterministic validator, a pure function of data the host read (`{skillName, available, reason, content, truncated, directoryName, resourcePaths, profileIds, now}`). Ships its own `scanFrontmatter` (the display-oriented `parseFrontmatter` truncates values at 300 characters and lets a duplicate key overwrite its predecessor, so it cannot answer "this description is 1200 characters" or "`name` is written twice"), its own fence/link scan, and two literal-pattern security scanners that report the pattern and never echo the matched value. Status is `pass \| needs-fix \| unknown`; only an `error` finding reaches `needs-fix`, and a rule it could not evaluate is `skipped` with a reason rather than clean |
| `src/core/skill-modification.mjs` | **v0.9.1.** The modification contract and the diff model, as pure functions: `MODIFICATION_CONTRACT_RULES` — the twelve rules, verbatim — the six scope ids in fixed order with `scripts` and `assets` locked, the message builder that carries the user's own words plus the structured scope plus the contract, and `diffSkillModification()`, which takes a stored "before" and a freshly read "now" and returns `unchanged \| changed \| unavailable` with line-level, section-level and resource-level changes, out-of-scope changes, and the source-fingerprint comparison. Zero IO, zero model calls, zero clock, zero randomness — `now` is always passed in |
| `src/core/skill-instance-test.mjs` | **v0.10.0.** The instance-acceptance generator, as one zero-dependency pure function — 571 lines, and the guard asserts that boundary on the code rather than the prose: no `import `, no `require(`, no `Math.random`, no `Date.now`, no `new Date`, no `navigator`, no `fetch(`, no `setTimeout`. `buildSkillInstanceTest({skillName, intent, comparison, definitionText, description, framework, validation})` — seven real fields, of which `intent` and `framework` were wired only in the second V0.10.0 round — returns one record — `{schemaVersion, skillName, intent, scopeIds, changedScopeIds, prompt, promptText, observations, regression, unavailable, limitations, notes, trace, available, reason, message, primaryScopeId}` — where `intent` is `'core+boundary+regression'` (the internal `INSTANCE_TEST_INTENTS` list names `core` / `boundary` / `regression`, but the UI ships **one** combined prompt, not three buttons). It reads the six scopes through `INSTANCE_TEST_SCOPE_FOCUS` / `INSTANCE_TEST_SCOPE_IDS` with `INSTANCE_TEST_PRIMARY_SCOPE_ORDER` deciding which one the prompt leads with — unless the user's intent names a scope the diff genuinely changed, in which case `INTENT_SCOPE_HINTS` makes that scope primary and `trace.hintedScopeId` records it. It reports which of the six inputs `INSTANCE_TEST_SOURCES` were actually present in `trace.sources` (present ones only, fixed order) and maps the scopes to framework roles through `INSTANCE_TEST_SCOPE_ROLES` (`skill-md-rules` → `rules`, `skill-md-workflow` → `workflow`, `skill-md-description` → `trigger`, and the three resource scopes → `resources`). It builds the four fixed blocks `INSTANCE_TEST_PROMPT_BLOCKS` (`任务` → `工作目标` → `输出要求` → `注意`), refuses to copy a source sentence that hits `INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS` (the diff, tool and judgement vocabulary), and reports impossibility rather than inventing a generic task through `INSTANCE_TEST_UNAVAILABLE_REASONS` and `INSTANCE_TEST_UNAVAILABLE_MESSAGES`. It derives `regression.constraints` from `framework.sections[]` first, dropping any section whose title the diff touched or whose role maps to a changed scope, and falls back to level-2 body headings only when the framework yields nothing, reporting `regression.source` as `'framework'`, `'definition'` or `null`. The third V0.10.0 round rewrote the 任务 sentence from a verbatim copy of the Skill's `description` into a real assignment, and added one private `clip()` that truncates any extracted sentence on a **word boundary** — the earlier character cut could end the task on half a word (measured: `…to avo.`) and read like broken text. The task sentence (`subjectOf()`) and the regression half's `capabilityLine()` both go through that same `clip()`. The UI copy it owns is `INSTANCE_TEST_HEADLINE`, `INSTANCE_TEST_GOAL_TITLE` / `INSTANCE_TEST_GOAL_TEXT` (the 验证目标 block), `INSTANCE_TEST_PROMPT_TITLE`, `INSTANCE_TEST_OBSERVATION_TITLE`, `INSTANCE_TEST_OBSERVATION_NOTE` and `INSTANCE_TEST_LIMITATION_NOTE`; `INSTANCE_TEST_RELATIVE_TIME_WORDS` names the clock-relative words the generator must never emit. `export const buildInstanceTest = buildSkillInstanceTest` re-exports the same function under the name the product spec suggested, so neither contract has to rename the other. Zero IO, zero model calls, zero clock, zero randomness — and **zero judgement**: no score, no pass rate, and no 「valid」 anywhere in the output |
| `src/storage/modification-snapshot-store.mjs` | **v0.9.1.** Keeps one modification transaction's "before", and keeps it **in host memory only**: TTL 30 minutes, at most 32 entries, keyed by `${sessionId}\u0000${skillName}`, never written to disk, never in a receipt, never in the session log, gone when the host restarts. The file header states the five privacy disciplines, and the module imports no filesystem at all. Releasing is explicit, and an expired or released snapshot reports `snapshot-missing` rather than falling back to the current file — "读不到" is not the same sentence as "没有" |
| `src/dsh/client/client.js` | Conversation view: 本次 Skill, 已安装 Skill (with the ordering sentence `InstalledOrderNote` renders above the grid), Skill Detail, the clone dialog, the validation card, the modify dialog, this modification's comparison, and the DSH `ctx.locale` adapter |

## Client component tree

`src/dsh/client/client.js` is the entire client — about 3625 lines (v0.6 took it from about 3536 down to about 2348; v0.8 added the Skill Evolution card and the diff panel; v0.9.0 added the validation card; v0.9.1 added the modify dialog and this modification's comparison; v0.9.2 added the installed-order note and the two card facts; v0.10.0 added the instance-acceptance block inside that comparison, and its second round added the 验证目标 / 测试 Prompt headings and the 「这个任务是怎么来的」 trace line), with a bundle of 189256 bytes, whose source hash is `faed5e9cef7db24c` (about 421 KB before v0.6, about 142 KB at v0.8, about 150 KB at v0.9.0, about 167 KB at v0.9.1). The byte count and the source hash move independently: `clientSourceHash()` in `scripts/build-client.mjs:65-75` hashes only the files under `src/dsh/client/` (plus the seed module list and the client id — `CLIENT_SOURCE_DIR = 'src/dsh/client'`, `scripts/build-client.mjs:56`), so **the third V0.10.0 round changed the bundle bytes (188899 → 189256) without changing `faed5e9cef7db24c` at all** — it edited `src/core/skill-instance-test.mjs`, which the stamp does not read. It registers exactly one slot (`conversation.view`, id `skill-trace`, order 70) plus the `dsh-skill-trace` locale namespace and the stylesheet lifecycle. It requires the core modules by name, and the whitelist went from **seven to eight** at v0.10.0: the eighth is `src/core/skill-instance-test.mjs`, which is a leaf with no IO and no imports precisely so the client can hold it — the guard counts the client's `require('../../core/…')` calls and fails on any number other than eight. What it renders today:

```text
Workbench                      first-level page switch + host preference
  ├─ TraceState                {kind, message, onRetry} — the shared failure state
  ├─ Icon
  ├─ CurrentSkillPage          本次 Skill     ← GET /skills, GET /skill
  │    └─ SkillCard            {name, description, meta, onOpen}
  ├─ InstalledSkillsPage       已安装 Skill   ← GET /catalog
  │    ├─ InstalledOrderNote   the ordering sentence above the grid — rendered only when `ordering` is present
  │    └─ InstalledSkillGrid   one clickable button per Skill — the whole card is the target;
  │                            card meta = MM-DD 加入本机, and 复刻自 <source> only when lineage exists;
  │                            defaults stay silent (invocation flags, `filesystem` provider)
  ├─ SkillModifyDialog         intent ≤2000 chars, scope chips, profile chips (Common Core always on)
  │                            rendered only while open; POST /modify (begin)
  └─ SkillDetailPage           Skill Detail   ← GET /skill, GET /definition, POST /modify, POST /translate, GET /translation
       ├─ sidePanel            facts + the object action (复刻 Skill — the only one)
       ├─ SkillValidation      验收 — three states, per-Profile rows, findings, skipped
       ├─ SkillModification    本次修改对比 — idle renders nothing at all;
       │                       waiting / error / ready; POST /modify (compare).
       │                       Inside the ready card, one more section, 实例验收
       │                       (`data-role="mod-instance"`) — not a component of its own,
       │                       and it exists only when this modification does
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

- **Declaration and observation render apart.** `SkillFramework` (structure, declared workflow, resources) reads only the definition; `RuntimeLogic` and `StepEvidence` read only the receipt. No path leads from runtime evidence back into the framework — a Skill whose structure was inferred from what happened would describe the run, not the Skill, which is the same mistake the deleted runtime graph made. Runtime data may *annotate* a declared step; it may never add, remove, or reorder one. `SkillValidation` sits on the declaration side too: it reads the `SKILL.md` bytes and the directory listing, never the receipt, which is why v0.9.0 could put it above the runtime layers.
- **The layers keep their order.** The detail body is `h(SkillValidationPanel, …), skillModification, framework, runtimeLogic, stepEvidence, docPanel`; the guard matches that literal order and fails with `the detail body must read 验收 → 本次修改对比 → 框架 → 运行逻辑 → 步骤证据 → SKILL.md, in that order`. Reversing it is a different product: read the document first, guess the structure second. Putting runtime logic above the framework reads a declaration as an observation. This modification's comparison sits directly under validation because the two answer the same question — "after this change, what is it now" — and it renders nothing at all when no modification is in flight (see §V0.9.1).
- **Instance acceptance is a section, not a destination.** It is not a fifth card, not a page, and not a route: it is one block (`data-role="mod-instance"`) rendered inside `SkillModificationPanel`'s ready card, in a fixed internal order — headline → 验证目标 (`INSTANCE_TEST_GOAL_TITLE` + `INSTANCE_TEST_GOAL_TEXT`) → 「生成实例验收」 → the 测试 Prompt heading → the Prompt in a scrollable `<pre>` → 「复制测试 Prompt」 → the weak hint about running it in a new session → 预期观察点 → 回归约束 → the limitation note (「这个任务是怎么来的」), whose `<details>` opens with a `data-role="mod-instance-trace"` line naming the inputs the task was built from and the primary scope that shaped it. It exists only while a real modification transaction is on screen, so a detail page with no modification in flight renders not one word of it (see §V0.10.0). The user's intent that aligns that primary scope stays in the component's local state and is never sent anywhere; a hard refresh drops it, and `trace.sources` then simply has one entry fewer. Its button writes text to the clipboard and does nothing else: it never injects a command into the composer, never sends a message, and never triggers an Agent — the same discipline every other copy action in this client follows, and here it is the first boundary rather than a detail.
- **One renderer, one call site.** The assertion counts `renderSkillMarkdown(` call sites (excluding the definition and the `__pure` export) and requires exactly one. Two call sites would mean the original and the Chinese reading version could diverge, and only one of the two behaviours would be tested.
- **One object action, and no duplicate door.** `InstalledSkillGrid` renders one `button.st-installed-card` per Skill and nothing else, so the installed page's button count equals its card count. Before v0.7 the card was a non-interactive `article`: the list could be read but not entered, and the only way into a Skill you had installed was to load it in a conversation first. Adding a 「查看详情」 button beside a clickable card would have produced two controls for one action, one of which is always redundant.

None of these layers is a canvas: no `elkjs`, no `@xyflow/react`, no `mermaid` — the guard rejects all of them as dependencies. The framework draws roles and sections; the declared workflow draws the chain the definition already describes; the runtime logic draws five stages with no edges between them. That is why the whole thing costs a `grid`, a divider and a `<dl>` rather than a layout engine.

`detail.anchors` is a **shared** map: declared steps and framework sections both resolve to an outline entry id, because the same click handler serves both. A section without an anchor (a synthesised one, whose `anchorId` is `null`) renders as a non-clickable row and is absent from the map entirely — a button that does nothing when clicked is worse than an element that never claimed to be clickable.

The client calls only the twelve surviving routes and nothing else. It holds no receipt, no graph, no draft buffer, and no backup state: a page fetches the projection it renders, and `TraceState` renders whatever the fetch could not establish — which is why the missing-field rule above matters more than it looks. A page that throws is not a page that shows an error; it is a blank tab.

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

因此客户端从约 3536 行降到约 2348 行，bundle 从 421 KB 降到约 126 KB，只调用留下来的十条路由（**这是 v0.6 当时的数字**；v0.8 之后是 2735 行 / 142672 字节 / 11 条；v0.9.1 工作树是 3356 行 / 167506 字节 / 12 条路由；v0.9.2 发布口径是 3448 行 / 170324 字节 / 12 条路由），
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

## V0.8 — Skill Evolution

**This whole section is shipped.** All three phases landed on 2026-10-02 and every paragraph below describes code that exists: the lineage modules (`src/core/skill-lineage.mjs` / `src/storage/skill-lineage-store.mjs`), the diff module (`src/core/skill-diff.mjs`), the host hook plus `GET /skill-trace/diff` (**eleven** routes), the detail page's 「Skill 演进」 card and its 720px diff modal (`SkillEvolution` / `SkillDiffPanel`), guards 24 and 25 — both halves — and five render smoke tests. `npm test` is 474 green, `npm run verify` is 25 groups. Real-machine acceptance passed on 2026-10-02 — twelve checkpoints, run against a real clone (`deliver-prd-custom-custom`, whose lineage record was the first one this machine ever wrote), not against a fixture; two of the defects recorded in `CHANGELOG.md` were found there and not by the tests. **It is released as `0.8.0`** (2026-10-02, GitHub Release + npm; results in `docs/RELEASE.md` §6.0). `spec/SDD.md` §0.1 D8 records the boundary and §17 holds the full design.

v0.8 answers one question: after cloning a Skill into your own version, **where did it come from, what did you change, and has the origin moved since**. Three capabilities — lineage, diff, and one compact evolution block — all inside the existing Skill detail page. No new first-level page, no history page, no version centre, and no second registry, invocation engine, or Agent runtime. Behavioural evaluation (baseline vs with-Skill, regression) was planned for v0.9 and slid to **V1.0+** when v0.9 was split into validation (V0.9.0) and modification (V0.9.1).

### Lineage has exactly one source: a clone this plugin performed

A lineage record is **not** "B looks like it came from A". It is "this plugin ran a clone from A to B". Similar content, a similar name, the same GitHub repository, a file the user copied by hand, and a Skill the user wrote from scratch all produce **no record**, because the plugin has no evidence for them. That is the same discipline the runtime side already follows: a declaration is not an execution.

The record holds identity and provenance only — `lineageId`, `sourceSkillName`, `sourceSourceSha256`, `targetSkillName`, `cloneMode`, `targetScope`, `catalogObservation`, timestamps, and an optional `sourceRepository` when the origin could actually be confirmed. It never holds a Skill body, a resource file's contents, a session id, a conversation, tool arguments or results, or an absolute path. It lives in `<plugin data area>/lineage/<sha256(targetSkillName)>.json`, directory `0700`, file `0600`, written by temp file plus rename. The filename is the whole concurrency story: **one target Skill has exactly one direct origin**, and editing that Skill later adds no records — those changes are the diff's business.

Lineage is never written into a Skill directory (that would pollute the Skill's own bundle and be copied along by the next full clone), never into a receipt, and never into the session log. The `lineage` field a receipt already carries is unrelated: it is the **session** parent/child lineage taken from the session header, read by `trace-reducer.mjs` and consumed by `host/index.js` and `runtime-graph.mjs`. The two share no field names and never read or write each other.

### The hook sits after read-back, and fails soft

`handleClone` already runs `writeClone` → `readBackClone` → rollback-or-continue → catalog observation → success. The lineage write goes after the observation and before the success return, for two reasons that are both about not lying:

- **A failed read-back produces no lineage**, because that path removes the copy and fails the request — there is no directory on disk for a record to describe. The `SKILL_LINEAGE_OK` guard pins this with a source-order assertion (`writeLineage(` must appear after `readBackClone(`) rather than trusting memory.
- **A failed lineage write does not fail the clone.** The copy is already on disk; reporting "the clone failed and nothing was created" would be false. The write follows the same shape as `persistTranslation` and returns a boolean, and a failure only adds `lineage-not-recorded` to `limitations`.

A directory the watcher did not observe in time is not a failure either: the response's existing `discovered` boolean maps onto `catalogObservation: observed | pending`.

### Diff is deterministic, and both sides are read live

The comparison is always **the current target against the current origin**, never against a stored snapshot of the origin as it was at clone time — the plugin does not persist Skill bodies, and `spec/PRD.md` `FR-EVO-002` forbids it. Three layers, none of which involves a model:

| Layer | Built from | Reports |
| --- | --- | --- |
| Structure | `buildDefinitionOutline()` then `buildSkillFramework()` on each side | sections and roles added, removed, or changed |
| Content | both `SKILL.md` bodies, aligned by Markdown structure | lines added, removed, modified, with line numbers for anchors |
| Resources | each side's relative file list | paths added, removed, changed |

Three implementation traps came out of reading the existing parser, and each one produces a wrong answer rather than a crash:

1. **Pass each side its own `summary`, or pass `null` for both.** `buildSkillFramework` synthesises a trigger section from `summary.whenToUse || summary.description` when no body section classifies as one. Feeding the two sides different summaries fabricates a structural difference that does not exist.
2. **Call `buildDefinitionOutline(side.content.text)` for both sides.** `buildSkillFramework` consumes an outline; it does not build one. Skipping this yields empty `sections`.
3. **Do not render the diff with `renderSkillMarkdown(`.** The `SKILL_FRAMEWORK_OK` guard pins the client to a single call site of that function.

Two honest limits are designed in rather than discovered later. First, because no snapshot is kept, the two sides' content fingerprints decide what the diff means: when they match, the difference **is** what the user changed; when they differ, part of the difference may come from the origin itself and the interface has to say so — which is why 「来源内容未发生变化」 is the single most informative line in the feature. Second, a `skill-md` clone copies only `SKILL.md`, so the origin's resource files are *absent from the copy by construction*, and the interface must explain that instead of calling them deleted; a `bundle` clone can likewise miss files under `CLONE_MAX_BYTES`. A name is not an identity either: if the origin's name is later taken over by a different Skill, the plugin cannot tell, and does not claim to.

The layering follows the existing one: lineage and diff are host-side domain logic in `src/core/skill-lineage.mjs`, `src/core/skill-diff.mjs`, and `src/storage/skill-lineage-store.mjs`; the host exposes them through one new route and one new field; the client only renders what it is given and requires none of those modules. Reading an unavailable origin returns `unavailable` with 「当前无法读取来源 Skill，无法完成差异比较。」 in an `role="alert"` region — never `unchanged`.

`SKILL_LINEAGE_OK` and `SKILL_DIFF_NO_JUDGEMENT_OK` raise the verifier's guard count from 23 to two dozen plus one, and the wording itself is in the contract: the diff may say 新增 / 删除 / 修改 / 保持不变 and nothing that ranks, praises, or recommends.

## V0.9 — Skill Validation

**This section describes what shipped as `0.9.2` on 2026-10-03** (GitHub Release + npm; results in `docs/RELEASE.md` §6.0). The code exists and is green — `npm test` is 561 tests (553 at v0.9.1, 474 at v0.8), `npm run verify` is 28 guard groups (27 at v0.9.1, 25 at v0.8), the client is 3448 lines with a bundle of 170324 bytes (about 3356 lines and 167 KB at v0.9.1; the v0.9.2 ordering work first landed at 3431 lines / 170354 bytes, and the meta row was then trimmed on 2026-10-03) — and `package.json` (`0.9.2`), `README.md`, `CHANGELOG.md` (`## 0.9.2`), `spec/PRD.md`, `spec/SDD.md` and `AGENTS.md` §1 all agree, which is the six places listed in `AGENTS.md` §9.1. `spec/PRD.md` §5.9 holds `FR-VAL-001`…`020` and `spec/SDD.md` §18 holds the full design.

v0.9.0 answers one question: **is this Skill, right now, conformant — and if not, against which rule?** It is deliberately not a score. Three states (`pass` / `needs-fix` / `unknown`), three severities (`error` / `warning` / `info`), and every single line traceable to a rule id. It does not decide what the Skill should become, and it does not evaluate behaviour.

### The rule table is data, and the Profiles are never merged

`src/core/skill-profiles.mjs` is constants only: five Profiles — the shared layer `common` plus `dsh`, `microsoft`, `openai`, `anthropic` — and thirty-two rules of the shape `{id, profile, severity, title, fact, source, note}`. A rule's `fact` is unique across the whole table, so "the name must match the parent directory" is stated once and referenced by the Profiles that care; what differs between them is the severity and whether they list it at all.

That is the whole point of not collapsing four vendors into one standard. The same fact, the same Skill, three different answers:

| Fact | Microsoft | OpenAI | DSH |
| --- | --- | --- | --- |
| name must match the parent directory | `MS-DIR-001`, **error** ("Must match the parent directory name") | `OA-DIR-001`, **warning** ("Name the skill folder exactly after the skill name") | **no rule** — `dsh-skill-filesystem` never compares the frontmatter name with the directory |

Severity follows the source's own verb. A rule whose source says *must*, or whose violation stops the Skill from loading, is an `error`; an imperative suggestion is a `warning` even when all four sources repeat it, which is why a 500-line `SKILL.md` can never be an error — none of the four load-blocking lists mention length. The DSH Profile is read out of the loader rather than out of documentation: `@deepseek-ai/dsh-skill/lib/index.js` holds `SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`, and it has no length constant, so a 70-character name violates the open specification's 64-character cap (`CORE-NAME-001`, error) and is perfectly clean in DSH (`DSH-NAME-001`, clean). Same input, two Profiles, two verdicts. A background note in the module records the honest asymmetry: Anthropic's public material has the fewest statically decidable hard rules — one — because its value lies in the create → test → measure workflow, which is behaviour, and behaviour is V1.0+.

`resolveSkillProfiles(selection)` returns `{profileIds, unknown}`, always adds `common`, orders by the table's own order, and reports unknown ids instead of silently accepting them. An empty array means "nothing selected yet" and falls back to the product default `['common', 'dsh']`; asking for the shared layer alone requires passing `['common']` explicitly. The default is a decision, not a convenience: DSH is where the Skill actually runs, and quietly validating only Common Core would skip the errors that matter most.

### Deterministic is the half we can stand behind

The design splits hard rules (format, fields, paths, structural facts) to code and soft rules (interpreting a specification, organising resources, maintainability) to the Agent. **v0.9.0 ships only the first half.** A validator that can be wrong about facts is worse than no validator at all, because its output reads as an accusation.

Two independent reads are needed, and neither existing one could be reused:

- `definition-outline.mjs`'s `parseFrontmatter` is lossy on purpose — it is built for display, truncates values at 300 characters, and lets a duplicate key overwrite its predecessor, so it cannot answer "this description is 1200 characters" or "`name` is written twice".
- The registry's `definition.content.text` is `parsed.body.trim()` — **the body only**. The real-machine probe made this concrete: `GET /skill-trace/definition?sessionId=probe&skillName=ui-craft` returned `frontmatter {present: false}` with the text starting `# UI Craft`. Validating that would have reported "frontmatter missing" for every real Skill on disk. Hence `readSkillFile()` in `src/storage/skill-clone-writer.mjs`: it reads the whole file for this one request, keeps it in memory until the validation finishes, and is never written to disk, a receipt, or a log. `readSkillBody` keeps its own contract (body only), because a clone rewrites the frontmatter `name:` and the outline anchors are line-numbered against the body.

Three honesty rules are built in, not bolted on. A rule that could not be evaluated is `skipped` with a machine-readable reason and a sentence in the interface — "we did not check" is not "it passed". `warnings > 0` never produces `needs-fix`; only an `error` finding does. And the resource-existence rule judges only declared resources: paths under the Skill's own `scripts/` `references/` `assets/`, plus markdown links that escape the Skill root. The first version treated every relative path in the prose as a file reference and produced six false "this file does not exist" errors on a real host Skill (`cordis-plugin-development`), whose prose legitimately mentions `package.json` and `lib/index.js` to describe the host project. A validator that manufactures findings fails this product's own identity test, and the narrowing is pinned by a test that feeds it those exact strings.

### Where it plugs in: two old responses, no new route

`validationFacts()` reads the Skill once — `registry.get`, `dirname`, `listSkillFiles` — and hands the validator plain data. Two details are deliberate. The directory name comes from the directory that holds `SKILL.md`, not from `resourceBase`'s last segment: v0.8's `basename(base) === skillName` filter would have made `MS-DIR-001` unjudgeable, since a Skill whose directory disagrees with its name is exactly the case that filter discards. And the resource list is `null` rather than `[]` when it cannot be trusted, because `[]` already means "the directory is empty, so every referenced file is missing" — a missing `SKILL.md` in the listing is the proof that the listing is complete.

`validationFor()` is shared by `GET /skill` (through `buildSkillDetail`) and `GET /definition`, so the two answers cannot drift, and a Skill whose file disappears between the two reads degrades to `unknown` rather than to a 500. That sharing is the fix for the first of two ways this card could have lied.

### Two ways the card could have lied

1. **The field was on the wrong route.** The first version attached `validation` to `GET /skill-trace/definition` only — and the client never calls that route on this path; it reads `body.skill` from `GET /skill-trace/skill`. Both single-sided tests were green. This is the v0.7 `sessionId` defect over again: the request body has two halves, and a host-side test supplies the very field the client forgot. The fix carries `validation` through `buildSkillDetail` (the key always exists, `null` when there is nothing to say) and the guard now pins the client's own call literal, `setFetched(body?.skill ?? null)`, and the `hasOwnProperty` check.
2. **A bilingual object as a React child.** `profiles[].label` is `{zh, en}`; rendering it through `raw()` produced React #31 and a blank tab — the third entry in *Two ways the whole tab goes blank* above. The panel picks a language explicitly and the guard forbids the bare form.

A third, quieter one belonged to the same family: the panel destructured `fieldMissing` while its call site passed `validationFieldMissing`, so the "the host may not have updated yet" sentence could never appear and a stale host would have been reported as this Skill being unreadable. Both sentences say "cannot determine" and they are not interchangeable — one describes the Skill, the other describes the host.

### What the card says, and what it refuses to say

One card at the top of the detail main column, because it answers this version's primary question: 「Skill 验收」 with a three-state badge, the line `错误 N · 警告 N · 信息 N · 未判定 N`, one row per selected Profile with its own state, the findings each showing rule id, severity and title, a 「这次没有判定」 block listing every skipped rule with its reason in words, and a `<details>` that states what was and was not checked. `role="status"` carries the verdict; when the whole result is unavailable it is a `role="alert"`. The component has no hooks at all, so it cannot fall foul of the hook-order rule.

It prints no score, no rank, no quality adjective, and none of the execution vocabulary. `SKILL_VALIDATION_OK` raises the verifier to 26 groups and asserts all of that by literal, on the code with comments stripped — including that the table never contains a scoring word, that the validator has exactly one import and touches no IO, that the DSH Profile contains no directory rule, and that the three state branches are written out in full (a short-circuited `if (false && status === 'needs-fix')` still contains the string, and fooled the first version of that assertion). Fifteen deliberate mutations were each confirmed to fail the intended check: a severity downgrade, a directory rule smuggled into the DSH Profile, a length rule promoted to error, a second import, an extra state, a `skills.register` call, a missing `data-role`, a forbidden word in the card, a short-circuited branch, and removing the field from the response.

### What v0.9.0 is not

Not a generator, not a scorer, not a second Skill registry — `ctx.skills.register` would mean mounting a Skill into DSH, which is not this plugin's decision to make, so validation is host-side domain logic in `src/core/` and not a Skill of its own. Not a behaviour benchmark either: whether a change improved what the Skill does is V1.0+.

`[修改 Skill]` — the user's intent, a structured scope and a Modification Contract, `agent.followup()` on the current session, read-back, this same validator, and a modification diff — was recorded here as **V0.9.1** before any of it existed. It now exists in the working tree; the next section describes it. Two constraints were written down in advance and both survived: it reuses the current DSH session rather than creating a dedicated one (LoreFlow's dedicated-session route was rolled back in production because `ask_user_question` then appears in a session the user cannot see), and its first version invented no structured proposal RPC — the scope is structured on the user's side and everything else happens in the ordinary conversation.

## V0.9.1 — Skill Modification

**This section describes what shipped as `0.9.2` on 2026-10-03** (GitHub Release + npm; results in `docs/RELEASE.md` §6.0). `npm test` is 561 tests (553 at v0.9.1, 474 at v0.8) and `npm run verify` is 28 guard groups (27 at v0.9.1, 25 at v0.8); the host is 1625 lines across 12 routes (1590 at v0.9.1), the client is 3448 lines with a bundle of 170324 bytes, `src/core/` is 29 modules and 10353 lines (10263 at v0.9.1), and `src/storage/` 6 modules and 1117 lines (1062 at v0.9.1) — and all six places listed in `AGENTS.md` §9.1 say `0.9.2`. `spec/PRD.md` and `spec/SDD.md` hold the design; this section records the boundary and the reasons behind it.

v0.9.1 answers a different question from v0.9.0. Validation asks *is this Skill, right now, conformant*. Modification asks the user *how should it change*, hands that one change to the Agent, and then reports **what it was before, what it is now, and whether the result still passes the same validation**. The plugin never decides what the Skill should become. It records, it dispatches once, and it compares afterwards.

### One click hands one change to the Agent in this conversation

The entry point is `[修改 Skill]` in the detail page's 「Skill 演进」 card — present in both branches, with and without a lineage record. It opens `SkillModifyDialog`: an intent of at most 2000 characters, scope chips, and Profile chips with the shared `common` layer always in the selection. Pressing 「交给 Agent」 is the authorization; there is no second confirmation and no separate permission prompt, because the action the user just took *is* the decision to let the Agent edit under DSH's own permission and approval flow.

The plugin writes no files. Nothing in the `/modify` handler calls `writeFile` or `ctx.fs.write`, and there is no code path in which the host edits a Skill. The Agent does the editing with DSH's native file tools, in this conversation, under DSH's permissions — which is also why the plugin cannot and does not claim to have enforced the contract it attaches to the message.

### Two actions, and why there is no third

`POST /skill-trace/modify` takes `{ sessionId, skillName, action: 'begin' | 'compare', intent?, scopes?, profiles? }`. The two actions are the two halves of one transaction, and the split is where the honesty lives.

- **`begin`** reads the whole `SKILL.md`, the directory listing, and the recorded source fingerprint, stores that as the "before" in a host-memory snapshot, and dispatches **one** message through the current session's live Agent — `agent.followup(message)` — with `source.kind = 'skill-intelligence-modify'`. That kind is a custom value on an extensible union (`MessageSourceMap` is an open sum type and consumers render an unknown kind through their fallback), so the message is visibly not something the user typed and visibly not something the plugin said on the user's behalf. `begin` sends exactly one message: it does not send a second, does not poll, and never parses the Agent's reply. The message does ask for one thing the plugin will not do itself — say what you intend to change before you write, and ask the user whenever anything is uncertain — because `FR-MOD-003`'s 「提出方案 → 用户确认 → 动手」 belongs to the ordinary conversation: the plugin states the requirement and nothing more. It says *ask the user through the asking tool* rather than naming `ask_user_question`: the same lesson as `/name` versus `/rename` — the message must not hard-code an internal tool identifier, and DSH exposes exactly one interactive asking tool, so the plain-language instruction is unambiguous.
- **`compare`** hands the stored "before" and a freshly read "now" to the pure function `diffSkillModification()`, then **releases the snapshot** in the same request. The response carries the three-state result (`unchanged` / `changed` / `unavailable`) with line-level, section-level and resource-level changes, any change that fell outside the authorized scopes, and the source-fingerprint comparison — and, in the same body, the `validation` result described below.

There is no third action because the plugin has nothing else it can truthfully do. An "apply" action would mean writing files, which is the Agent's job; a "poll" action would mean reading the Agent's output to guess when the change is finished, which the plugin refuses to do. The user decides when to compare. `begin` and `compare` are the only two moments at which the plugin knows something the interface can state without inventing it.

The failure semantics are one status code per failure, and each says which thing went wrong rather than collapsing into a generic error: an empty intent is `400 missing-intent`; a session with no running Agent, or one whose Agent has no `followup`, is `409 session-not-live` — a session that has not started yet is not a server fault; an unreadable `SKILL.md` is `422 skill-file-unreadable`, and the message says the pre-modification state was therefore not recorded and the task was not sent; an unknown Skill is `404 unknown-skill`; and a `followup` that throws is `500 dispatch-failed` **after releasing the snapshot that was just stored** — keeping a "before" whose task never left would make the panel look like a completed modification.

### Why not a dedicated session

The obvious design — the plugin creates its own session for the modification, so the edit cannot disturb the conversation the user is reading — is the one that was rejected. LoreFlow's plan A built exactly that dedicated session, and it was rolled back in real use for one concrete reason: the user cannot see that session, and `ask_user_question` then raises its question in a place the user is not looking at, so the Agent waits forever on an answer that was never visible.

The plugin's slot already lives in `conversation.view`, and `props.sessionId` is the session the user is looking at. The modification therefore happens there: the Agent's questions appear where the user already is, the edit is visible as it happens, and the plugin never has to mirror a conversation it does not own.

### The snapshot lives in host memory, and nowhere else

`src/storage/modification-snapshot-store.mjs` is named like a store and is deliberately not one. It keeps at most 32 entries, each with a 30-minute TTL, keyed by `${sessionId}\u0000${skillName}` — two segments, because reusing one session's "before" in another session would be a different Skill's history wearing this one's name. Four boundaries hold it:

1. **It is never written to disk.** The module imports no filesystem at all.
2. **It never enters a receipt.**
3. **It never enters the session log.**
4. **A host restart leaves nothing behind.** Expiry and restart are the same outcome from the interface's point of view, and so is an explicit release after `compare`.

When the snapshot is gone, the panel says so in one fixed sentence: `本次修改前状态不可用，暂时无法比较本次修改的内容。` with `reason: 'snapshot-missing'`. Two mistakes are ruled out by that sentence and its reason. It does not fabricate a "before" by pairing the current file with itself. And it does not blame a file it can actually read — `skill-unreadable` is a different outcome with a different sentence, and the store's `normalizeResources` returns `null` rather than `[]` for the same reason `validationFacts()` does: an empty list already means something specific, and "we could not look" must not borrow its meaning.

### The source is protected by a fingerprint, and the sentence is fixed

A clone records the source it came from. Modification compares the recorded `sourceSourceSha256` before and after and returns one of three states: `unchanged`, `changed`, or `unknown`. The wording is fixed by the module, and the middle state's sentence is exactly `来源 Skill 在本次修改期间发生变化。` — notice what it does not say. It never says the Agent changed the source. There is no evidence for that claim: a fingerprint that differs proves the source moved, not who moved it or when, and the plugin has no way to attribute the change. The guard enforces this by rejecting the source text outright for `Agent 修改了来源` and its paraphrases. The other two sentences are equally fixed: `来源 Skill 的内容没有发生变化。` and, when there was no fingerprint to compare, `没有拿到来源 Skill 的指纹，来源是否变化无法判断。` — `unknown` is not `unchanged`.

### The scope contract: six ids, two of them locked

`MODIFICATION_SCOPE_OPTIONS` lists six scopes in a fixed order — `skill-md-rules`, `skill-md-workflow`, `skill-md-description`, `references`, `scripts`, `assets` — and the order is the order the chips appear in, not a preference of the caller. `scripts` and `assets` are **locked**: they are drawn, they cannot be selected, and they are never granted. The locked pair is part of the response rather than a rendering convention, so the client and the host agree on which scopes were refused instead of one of them quietly omitting a chip.

An unrecognized scope id is not dropped and not silently accepted: it is reported back in `unknown`, so a typo in a future caller surfaces as itself. An empty scope set is a valid request and has its own meaning — `（没有指定范围：只讨论，不要改动任何文件）` — because "I want to discuss this Skill" is a real intent and must not be read as "modify everything".

### It reuses v0.9.0's validator instead of asking again

`compare` returns the same `validation` object that `GET /skill` and `GET /definition` return, produced by the same `validationFor()` from the definition view the request already read. Reusing the function is the smaller half of that decision; the larger half is that the definition is read **once**. The freshly read current state is what is diffed, and the same text is what is validated, so the comparison and the verdict cannot describe two different moments in the same response.

The client takes the opportunity: when `/modify` answers, the panel stores the returned `validation` in place of the previously fetched one. That saves a second `/skill` request and, more importantly, removes a window in which the file could change between the two reads and leave the card showing a verdict for a version the diff no longer describes.

### The comparison panel has four states, and one of them renders nothing

`SkillModificationPanel` renders 「本次修改对比」 in the detail main column, immediately after the validation card — the two answer the same question, "after this change, what is true now". It has four states: `idle` renders **the entire block as `null`**, `waiting` says the task has been sent and offers the compare action, `error` is an alert, and `ready` shows the comparison, the released-snapshot notice, and the limitations.

`idle` rendering nothing is the point. A permanent empty card would be read as a state — "no change detected" when nothing has been asked for, or "nothing happened" when a modification is in progress elsewhere — so a user who has never modified this Skill sees no such card at all. The panel also prints the diff's limitations rather than a summary of them, because a comparison that hides its own bounds invites the reader to assume it has none.

The detail body's order is pinned by a literal in the guard, and the sentence it fails with is exact: `the detail body must read 验收 → 本次修改对比 → 框架 → 运行逻辑 → 步骤证据 → SKILL.md, in that order`. In English that is validation → this modification's comparison → framework → runtime logic → step evidence → `SKILL.md`. This comparison sits second and not first because the verdict is the headline and the diff is its evidence; the framework, the runtime logic and the step evidence still describe what the Skill declares and what this session observed.

### What v0.9.1 is not

Not a second Agent runtime: there is one Agent, the one in this session, and the plugin only asks it to do something the user has already asked for. Not a structured proposal RPC: nothing about *what the change should be* is structured — the scope is, and the rest happens in the ordinary conversation, in words, where a proposal belongs. Not a version store: there is no version entity, no history, no timeline, and no version number — only two `sha256` values and the difference between them. Not an executor: it does not run anything under `scripts/`, does not commit to git, and does not rename the session.

### The guard, and the mutation lesson

`SKILL_MODIFICATION_OK` is the 27th group, immediately after `SKILL_VALIDATION_OK`. It asserts, on the code with comments stripped: the module constants (`MODIFICATION_SOURCE_KIND`, the 30-minute TTL, the 32-entry cap) as literals rather than as values that merely happen to be equal; the twelve contract rules, including the soft limits and the ban on renaming the session through an API DSH does not have; the flow sentence the message must carry — *explain the plan before writing, ask the user whenever anything is uncertain* — and its place between the twelve rules and the closing paragraph, because `FR-MOD-003` keeps 「提出方案 → 用户确认 → 动手」 in the ordinary conversation: the plugin states the requirement and brokers nothing; the six scope ids in order and the locked pair as `scripts,assets`; the fixed sentences and the words the module may **not** contain; the route literal, the dispatch call, and the release that must follow a failed dispatch; and a two-way reconciliation of the panel's `data-role` set — a role that is drawn but not guarded fails, and so does a role that is guarded but no longer drawn.

The lesson is about how those mutations are exercised. The client half of the contract is asserted against the **built** bundle's source, so a deliberate fault introduced in `src/dsh/client/client.js` fails first on the bundle being stale — `dist/client.js is stale or missing` — and never reaches the assertion it was meant to test. Rebuild first (`npm run build:client`), then run the verifier, or the mutation proves nothing.

## V0.9.2 — Installed List Ordering

**This section describes what shipped as `0.9.2` on 2026-10-03** (GitHub Release + npm; results in `docs/RELEASE.md` §6.0). `npm test` is 561 tests (553 at v0.9.1, 474 at v0.8) and `npm run verify` is 28 guard groups (27 at v0.9.1, 25 at v0.8); the six places listed in `AGENTS.md` §9.1 all say `0.9.2`.

The change came from the user's own report (2026-10-03): every `…-custom` Skill in 「已安装 Skill」 had been produced by the clone feature and now sorted at the bottom, and the sort should instead put the newest first — 「我想看到我刚复刻的那个在第一行……否则要翻着名字找」. So the list is now ordered by **when each Skill arrived on this machine**, newest first.

### Arrival is the directory's birthtime, not the file's

The time is the **`birthtimeMs` of the Skill's directory**, `<root>/<name>` — never `mtime` or `ctime`, and never the file-level birthtime of `SKILL.md`. The reason is a real measurement, not a preference: any editor that rewrites `SKILL.md` through a temp file plus `rename` gives the **file** a fresh birthtime while the directory keeps the old one. On this machine `deliver-prd-custom-custom-custom/SKILL.md` read `23:29` after such an edit while its directory still read `22:39`. "When did this Skill arrive here" must not change because someone edited the prose, so the timestamp is the directory's, and the guard forbids `mtimeMs` and `ctimeMs` anywhere inside `skillAddedAtByName()`.

### One named rule, three states

The rule is exported as `INSTALLED_ORDERING_RULE = 'added-desc-then-name'` from `src/core/installed-view.mjs` and copied into `ordering.rule`; the client repeats it in words rather than inventing its own meaning. `compareInstalledSkills()` implements it: two readable times sort newest first (`rightAt - leftAt`), a readable time always outranks an unreadable one, and everything else — two unreadable times, or a tie — falls back to name. `buildInstalledView()` reports the outcome as `ordering:{rule, addedAtKnown, addedAtUnknown}`, counted over the **whole catalog** rather than the current search results, so the search box cannot change how many Skills can state an arrival time.

The three states the interface can be in are the three the counter can produce:

- **All known** — `addedAtKnown === skills.length`, `addedAtUnknown === 0`: strict newest-first, and `InstalledOrderNote` says so.
- **Partially known** — `addedAtKnown > 0` with some unknown: known Skills sort newest-first, the rest follow by name, and the note adds 「另有 N 个 Skill 读不到加入时间，按名称排在最后。」
- **Unknown** — `addedAtKnown === 0`: the A–Z fallback is the whole order, and the note says 「读不到加入本机的时间，这里按名称排列。」 instead of claiming a recency order it cannot show.

### The two read-only lookups

Both helpers live in `src/storage/skill-clone-writer.mjs` and are exported for the catalog route; both read `stat` and nothing else, and both leave the clone write path untouched.

- `skillAddedAtByName({names, roots})` — for each name, in root order, `stat(join(root, name))`, keeping only a **directory** whose `birthtimeMs` is finite and `> 0`; the first hit wins and later roots are not consulted, so a name present in more than one root resolves deterministically. Names are filtered through `isSkillName` (from `src/core/skill-clone.mjs`) before any path is joined, and a repeated name is skipped.
- `skillRootCandidates({cwd})` — the candidate roots in the clone writer's own rank order: `<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`, `<DSH_HOME|~/.dsh>/skills`, `<DSH_AGENTS_HOME|~/.agents>/skills`.

Every way these can fail has its own limitation code, because "we read it" and "we could not read it" must not collapse into one sentence:

| Code | Meaning |
| --- | --- |
| `catalog-coverage-incomplete` | The catalog snapshot itself was not complete; the list may be missing Skills rather than misordered |
| `added-at-unavailable` | The catalog has Skills but **none** of their arrival times could be read — the list is pure A–Z and says so |
| `added-at-partial` | Some arrival times were readable and some were not; those Skills sort last by name |
| `lineage-unavailable` | The host could not supply readable lineage at all, so "not a clone" and "cannot read the clone record" are kept apart — the note states the limitation instead of implying no Skill was cloned |

The fourth is the subtle one. `lineageByTargetName()` in `src/dsh/host/index.js` returns `null` — not an empty map — when `lineageStore.list()` throws, logs `[dsh-skill-trace] lineage read failed`, and the view turns that `null` into `lineage-unavailable`; a Skill that genuinely has no lineage record simply reports `lineage: null` and no limitation.

### The client reads the rule, never re-sorts, never invents a date

`InstalledSkillsPage` filters the received array by the shared search predicate and renders it in the order it arrived — there is no `.sort()` on the client at all, and the guard rejects one. `InstalledOrderNote` renders one sentence above the grid (`p.st-installed-order`, `data-role="installed-order"`) derived only from `ordering` and `limitations`, and returns `null` when `ordering` is absent, so a host that has not been restarted into v0.9.2 shows no sentence rather than a wrong one. The rule name itself is never hard-coded in the client: the guard rejects the literal `added-desc-then-name` anywhere in `client.js`, so the words in the interface have to come from the data.

`formatAddedAt(value)` renders an absolute `MM-DD` date, adding the year only when the timestamp is outside the current year. It never renders a clock time, and it never says 今天 / 昨天 / 刚刚 / 几分钟前 — those words need a clock and a frame of reference, and render tests have to be able to assert the exact string; the hour:minute reading was dropped on 2026-10-03 because "which one is newer" is already answered by the list order, so the clock only added a fleeting sense of precision (the guard rejects `getHours` / `getMinutes` in that block). A missing or unusable `addedAt` is `null`, and the card then simply omits the stamp rather than showing a placeholder date.

The meta row also follows one rule about **when to speak at all**: defaults stay silent, only exceptions get words (`FR-ORD-013`). The two invocation flags are written only when they are exactly `false` (「不可由模型调用」/「不能用 /name 调用」), and `provider` is written only when it is not the default `filesystem`. The reason is measured, not aesthetic: all 69 Skills in the live catalogue are `{modelInvocable:true, userInvocable:true}` and 68 of them are `filesystem`, so those labels repeated one identical, always-true sentence on every card. Strict `=== false` matters because the component is pure-props: a payload that merely lacks the field must not be read as a negative claim.

### "Arrived here" and "cloned from" are two different facts

The card's meta row writes them as two separate spans: `MM-DD 加入本机` comes from the directory's birthtime, and `复刻自 <source>` comes from the lineage store. They are printed separately because they are not the same claim and neither implies the other: a Skill can be cloned onto this machine long after the clone happened elsewhere (arrival ≠ clone time), and a Skill that was not cloned still arrived at some point (arrival without lineage). Neither fact is computed from the other, and both degrade independently — no lineage means no 复刻自 line, no readable birthtime means no 加入本机 line, and the ordering note is the only place the whole list's state is summarised.

### The guard, and the new tests

`INSTALLED_ORDERING_OK` is the 28th group, immediately after `SKILL_MODIFICATION_OK`. It asserts, as literals against `src/core/installed-view.mjs`, `src/storage/skill-clone-writer.mjs`, the host source and the built client: the directory-only `stat`, the `isDirectory() && Number.isFinite(birthtimeMs) && birthtimeMs > 0` acceptance test, the absence of `mtimeMs` / `ctimeMs`, the `isSkillName` filter and the first-hit `break`, the four root fragments, `INSTALLED_ORDERING_RULE`, `compareInstalledSkills` with both known-before-unknown branches, `addedAtKnown` counted from `skills` rather than `matched`, the three new limitation codes, and the absence of any `import` in `installed-view.mjs`. On the client side it asserts the `installed-order` `data-role`, the `null`-when-absent guard, `formatAddedAt(skill.addedAt) ? h('span' …`, the `复刻自 ${skill.lineage.sourceSkillName}` span — and the three prohibitions: no `.sort(`, no hard-coded rule name, no relative time words.

The behaviour is covered by pure-function tests rather than by the guard. `test/installed-view.test.mjs` (17 tests) pins the exact keys of a projected Skill, newest-first ordering with unknowns last by name (`['ui-craft','a-skill','loreflow-copilot']` with `ordering {addedAtKnown: 2, addedAtUnknown: 1}`), the A–Z-only fallback with `added-at-unavailable`, the rule that a known time always outranks an unknown one, the fact that the counts describe the whole catalogue rather than the current search, `lineage` name-only shape checking, an unusable add time becoming `null`, an unreadable lineage store becoming `lineage-unavailable`, and the empty-catalogue limitations. `test/client-render-smoke.test.mjs` (25 tests) covers what the note actually says.

### What v0.9.2 is not

Not a history or version comparison: it reads one `stat` per name and stores nothing, so there is no timeline of arrivals, no "this Skill existed on three machines", and no way to tell an arrival from a re-clone. Not a user-defined sort: there is one rule, it is named, and the client cannot reorder the list even if it wanted to — no sort menu, no column headers, no persisted sort preference. Not a removal of the A–Z fallback: unreadable arrival times stay a first-class state (`added-at-unavailable` / `added-at-partial`) and sort by name, because a list that silently reordered itself around a missing timestamp would be worse than one that admits the timestamp is missing. And no new route, no new dependency, and no change to the `/skill-trace/catalog` contract beyond the two read-only lookups and the added fields.

## V0.10.0 — Skill Instance Test

**This section describes the working tree on 2026-10-03, unreleased** (`package.json` is still `0.9.2`; the release records for `0.9.2` above are unchanged and remain what shipped). It is the layer between the two neighbours it must not be confused with: the static validation card (§V0.9) reads the `SKILL.md` bytes and says whether the Skill is *written* correctly; this says only what to *try* on it; and Skill Evaluation — whether the thing actually worked — is V1.0 and deliberately not here. The name is 「Skill 实例验收」 / Skill Instance Test, and the interface wording it forbids is as much a part of the design as the code: no Skill Run, no Skill Execute, no Skill Benchmark, no Skill Evaluation, no 测试中心.

Its worktree numbers, measured 2026-10-03: `npm test` is 590 tests (589 after the second V0.10.0 round, 584 after the first, 561 at `0.9.2`) and `npm run verify` is 29 guard groups (28 at `0.9.2`); the client is 3625 lines with a 189256-byte bundle whose source hash is `faed5e9cef7db24c` (3569 / 184471 / `2d202a05030a1d58` after the first round) — the bytes moved with the third round while the hash stayed put, because `clientSourceHash()` reads only `src/dsh/client/`; `src/core/` is 30 modules and 10924 lines (10903 after the second round, 10774 after the first); and `src/storage/` is still 6 modules and 1117 lines while the host is still 1625 lines across 12 routes — the instance-test round changed no storage and, as the Host surface section says, not one byte of the host.

The shape of the whole feature is one sentence: **turn this modification into one real task a person can carry into a fresh conversation, and be honest about everything that cannot be known from here.** The plugin writes the task; the user runs it. Nothing in this version runs, waits, watches, reads back, judges, or scores anything.

### Why it is generated, not asked for

A model call would have been the easy way to make a test prompt look good, and it is exactly what this version refuses. The generator is a pure function of what the detail page already has, so **the same input always produces the same prompt, byte for byte**, and the guard proves it by calling the builder twice and comparing the serialised results. That property is not a nicety: it is the only way the claim "this prompt is about *this* change" can be tested at all. A model's flourish would make the output unassertable, and would also mean the prompt could be different on two machines looking at the same edit.

It is also why the builder may not reach for anything outside its arguments: `src/core/skill-instance-test.mjs` is 571 lines with no imports, no `require(`, no `Math.random`, no `Date.now`, no `new Date`, no `navigator`, no `fetch(`, no `setTimeout`, and the guard strips comments and then asserts every one of those absences on the code rather than trusting this paragraph. The third round's private `clip()` sits inside that same boundary — it is a pure string helper with no imports of its own. No clock means no 「刚刚」; no randomness means no drifting phrasing; no IO and no model means generation cannot quietly change any other state, which is what lets the button be a pure `setState` and nothing more.

Inputs come in already assembled, from seven named fields: `skillName`, `intent` (what the user asked for in the modify dialog), `comparison` (the `diffSkillModification()` result — scopes, added and removed sections, resource changes), `definitionText` (the live `SKILL.md`), `description` (the live trigger text), `framework` (the host's parsed `buildSkillFramework()` result), and `validation` (the static result — now read, but only to count how many conclusions came back `unknown`, never to draw a conclusion). A second, optional input carries the declared scopes (`scopeIds`) when the comparison does not. The builder reads no disk and asks nothing.

Those seven fields are not the same thing as the **six sources** the product spec names, and the module keeps the distinction explicit in `INSTANCE_TEST_SOURCES = ['intent', 'scopeIds', 'comparison', 'description', 'framework', 'validation']`. The result carries a `trace` object — `{sources, frameworkAvailable, validationStatus, validationUnknownCount, hintedScopeId}` — whose `sources` lists, in that fixed order, only the inputs that were actually present. Its whole job is to let the interface answer 「这个任务是怎么来的」 with a fact instead of an assurance.

The intent is the one input that enters by not one byte. It is used for exactly two things: to pick the primary scope when its words name a scope the diff genuinely changed (`INTENT_SCOPE_HINTS`, first hit only), and to make `trace.sources` one item longer. Its raw text is never written into the record — the guard asserts that on `JSON.stringify(result)` — because the intent describes *what was changed*, and putting it in the prompt would re-teach the Skill inside the prompt, which is the same failure mode the forbidden-word list exists to prevent. That is also why the host never sees it: it stays in the detail page's local state — not persisted, not in a receipt, not in the session log — and a refresh simply produces a `trace.sources` with one fewer entry.

### Two artifacts that never merge

The function returns one record, and inside it there are two outputs that are never allowed to touch.

- `prompt.text` is what the user pastes into a new conversation. It is built from four fixed blocks in fixed order — `【任务】` → `【工作目标】` → `【输出要求】` → `【注意】` — preceded by the line 「你需要完成下面这个真实任务。」 and closed by the standing note 「请直接完成任务，不需要解释你为什么选择某个 Skill。请按照当前环境中的 Skill 能力完成任务。」 It reads like something a person wants done, not like a rubric. The 任务 block is a real assignment, not the Skill's `description` copied whole: `subjectOf()` strips the trigger prefix (`当用户…` / `use when…`), cuts at the first sentence and clause, and hands the result to that same `clip()` — so a long English description ends on a whole word instead of on `…to avo.`, and a description short enough to survive the window carries no ellipsis at all.
- `observations` are for the user, and they render in the UI as 「预期观察点」: a list of **questions**, each ending in `？`. The guard requires every one of them to be interrogative and requires, one by one, that its exact text does **not** appear in `prompt.text`.

The card announces both artifacts with fixed copy of its own: 验证目标 (`INSTANCE_TEST_GOAL_TITLE` + `INSTANCE_TEST_GOAL_TEXT`) above, then the 测试 Prompt heading (`INSTANCE_TEST_PROMPT_TITLE`) over the `<pre>`. Neither sentence names the change; they say what the task is for and what the block below is.

The separation is the feature's one hard boundary, and it is physical rather than stylistic. An observation is a thing to check after the run ("was the declared constraint actually honoured in the output?"). Put it in the prompt and the Agent is told what will be graded — which is re-teaching the Agent inside the test, and the test then measures the prompt instead of the Skill. The same reasoning bans the other half of the vocabulary: `prompt.text` may contain no diff meta-information at all. No `本次修改`, no `这次修改`, no `刚才的修改`, no scope labels (`skill-md-workflow`, `references/`, `assets/`, `scripts/`), no `diff` / `scope` / `snapshot`, no changed section titles, and none of the Skill's own declared step names. `INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS` is that closed list, and the guard loops over it against the real generated prompt. When a source sentence cannot be used without importing one of those words, `usableSourceText()` drops the whole sentence and falls back to neutral phrasing rather than filtering the sentence into something that says less and hides more.

The same discipline governs what the generator will not say about outcomes. Its output contains no score, no pass rate, no 成功 / 失败 / 有效 / 无效, and no 已执行 / 未执行 — the guard flattens the whole record to a string and fails if any of that vocabulary appears. The module file's own header states the rule in the form it is easiest to keep: this module judges nothing.

### Regression constraints come from the framework, not from a slogan

The regression half of the prompt has one rule: it may only name capabilities **this change did not touch**. `regressionOf({definitionText, framework, changedTitles, changedScopeIds})` reads `framework.sections[]` first — the parsed, role-tagged section list the host already built — and skips any section whose title appears among the diff's changed titles or whose role is one of the roles `INSTANCE_TEST_SCOPE_ROLES` maps to a changed scope. Excluding by role is stricter than matching titles as strings, and that is the point: a scope id and a section title rarely agree, so a title-only filter would quietly let a touched capability through. Surviving sections become `这次改动不应影响原有「X」的要求：…`, capped at `MAX_CAPABILITIES`. The `…` is `capabilityLine()`: it runs the section's opening through `usableSourceText()` and then through the **same `clip()`** the task sentence uses, so both halves of the artifact truncate on a word boundary rather than mid-word.

Only when the framework yields nothing does it fall back to the level-2 headings of the body. `regression.source` records which path answered — `'framework'`, `'definition'`, or `null`. When neither path finds anything, `available` is `false` and the module says so in one honest sentence; it does not fall back to 「确保没有破坏任何东西」, because a constraint that names no capability constrains nothing while reading as if something had been checked.

### When it cannot be built, it says so

Four named reasons, each with a plain-words sentence rather than a code, and none of them is allowed to fall back to a generic task:

- `no-comparison` — 「还没有可用的本次修改对比，因此没有可生成的任务。」
- `comparison-unavailable` — 「本次修改前状态不可用，因此没有可生成的任务。」
- `no-changed-scope` — 「这次改动没有落在可以生成实例验收的范围里，因此没有可生成的任务。」
- `no-definition` — 「读不到这个 Skill 的正文与描述，因此没有可生成的任务。」

The guard tests three of the four directly: no comparison at all, a comparison whose scopes are all unchanged, and an unreadable definition. The interface renders the reason as an alert (`data-role="mod-instance-unavailable"`) and stops there. It does not offer a "generic test prompt" instead, because a generic prompt would be the one artifact this feature must not produce: it would look like the feature worked while saying nothing about the change it was supposed to target.

The four reasons are also the *only* four. A missing framework and a missing validation result are not among them: both are recorded in `trace` and turn into a limitation, but the task is still generated and `available` stays `true`. Collapsing "the optional input is absent" into "the task cannot be built" would have hidden the generate button for reasons that have nothing to do with the change.

The three limitations the second round added are written the same way as the rest — as statements of what this layer does not know, not as hedging:

- no framework → 「这次没有拿到这个 Skill 的框架结构，回归约束只从正文小节里找，可能比框架里声明的少。」
- no static validation result → 「这次生成没有静态验收结论可用，实例验收不据此推断实际行为。」
- a static validation that itself contains `unknown` → 「静态验收里有判不了的结论，实例验收不据此推断实际行为。」

The wording of all three is deliberate: the instance test never upgrades a static `unknown` into a claim about behaviour, in either direction.

### Six scopes, six questions, and one thing that is never inferred

The scopes are the ones v0.9.1 already knows, and each has its own observation focus in `INSTANCE_TEST_SCOPE_FOCUS`:

- `skill-md-rules` — 「它声明的约束在产出里是否被遵守？」
- `skill-md-workflow` — 「产出的形成顺序与步骤要求是否体现？」
- `skill-md-description` — 「这次任务的描述是否落在它声明的适用场景里？」
- `references` — 「它自己的资料是否在任务中被实际用到？」
- `scripts` — 「它涉及的脚本能力是否被触发并体现在产出里？」
- `assets` — 「它涉及的资源是否真的被用上，而不是只出现在产出旁边？」

One of them decides the shape of the task. `INSTANCE_TEST_PRIMARY_SCOPE_ORDER` ranks them `skill-md-workflow` → `skill-md-rules` → `skill-md-description` → `references` → `assets` → `scripts`, and the highest-ranked changed scope drives the phrasing, because workflow and rules are the two things that change what the task *is* — the three resource scopes usually change only what completing it requires. `coreLines()` therefore has six genuinely different openings, not one sentence with a swapped noun. The generator is also explicit that it is not claiming the whole modification was captured: when the comparison contained scopes it could not read, a limitation says the task covers only the scopes that could be confirmed.

`INSTANCE_TEST_SCOPE_ROLES` gives the scope list its second job — not observation, but exclusion: it maps each scope to the framework role it belongs to (`rules` / `workflow` / `trigger` / `resources`), which is what lets the regression step drop a touched *capability* instead of a touched *title*.

The user's intent is allowed to override the ranking, within one limit: `INTENT_SCOPE_HINTS` takes effect only when the scope it names was genuinely changed by the diff, and the first hint wins. So 「把 references 的使用要求写清楚」 promotes `references` to primary — but only if `references` is actually in `changedScopeIds`; an intent that names an untouched scope changes nothing. When it does apply, `trace.hintedScopeId` is set and the interface says so in the user's own terms (「你这次的意图点名了它」).

There are two general observation items before the scope-specific ones — 「它是否实际使用了相关 Skill？」 and 「Skill 中的关键流程是否被执行？」 — and two after them — 「本次修改涉及的行为是否体现？」 and 「原有核心能力是否保持？」 — and the whole list is capped at six (`MAX_OBSERVATIONS`). The cap is a courtesy, not a limit on honesty: a page-long checklist stops being a thing anyone reads.

The three resource scopes carry the evidence principle this project states everywhere else and enforces hardest here. **A file appearing, changing, or disappearing is all this layer can see; it cannot see what the Agent did with it.** So `references`, `scripts` and `assets` may produce observation items only — never an assertion, never an inference that a script ran because the script changed, and never the reverse. The observation block says this in the user's own words above the list — 「注意：观察不到痕迹不等于没有被执行；下面只列可以核对的现象。」 — and the limitation note repeats it: absence of evidence is not evidence of absence, and a declared resource's presence is not evidence that it was used.

### Where it lives, and when it exists

Instance acceptance is **not a new component, page, or destination.** It is one section (`data-role="mod-instance"`) inside `SkillModificationPanel`'s ready card — the same 「本次修改对比」 card v0.9.1 added — and it appears only while a real modification transaction exists, with the section's own generate step in front of it. A detail page opened without a modification in flight renders not one word of it, which is the same rule the comparison card already followed: the block renders nothing at all rather than rendering an empty frame.

Its internal order is fixed, and the guard pins the pieces as literals: headline → 验证目标 (a heading plus `INSTANCE_TEST_GOAL_TEXT`) → 「生成实例验收」 → the 测试 Prompt heading (`INSTANCE_TEST_PROMPT_TITLE`) → the prompt in a scrollable `<pre>` (`max-height: 240px`) → 「复制测试 Prompt」 → the weak hint that suggests running it in a new conversation, in the user's own words — 「建议在新的 DSH 会话中运行，以避免当前修改对话中的上下文影响测试结果。」 → 预期观察点 → 回归约束 → the limitation note (「这个任务是怎么来的」), a `<details>` that opens with the `data-role="mod-instance-trace"` lines and then lists how the task was produced and what it does not do.

The copy button does exactly one thing: `navigator.clipboard.writeText(text)`. It never injects a command into the composer, never sends a message, never triggers an Agent — the discipline every other copy action in this client already follows (§十九), and here it is restated in the source comment as the feature's first boundary. There is no second Runtime, no auto-run, no polling, and no persisted result: whatever the user pastes and sees lives in that new conversation, not in this plugin's data. The `mod-instance-trace` lines are the interface's half of the acceptance criterion: they name the inputs the task was built from and the primary scope that shaped it, so the correspondence between the artifact and the change can be read rather than assumed. `SkillModifyDialog`'s dispatch and `SkillDetailPage`'s `onDispatched` carry the user's intent back as a second argument, which lands in the page's local `lastIntent` state and is handed to `generateInstanceTest()` as `intent: lastIntent || null` (with `framework: detail?.framework ?? null` beside it). None of that leaves the browser: the intent is not persisted, not put in a receipt, and not written to the session log.

### The guard, and the new tests

`SKILL_INSTANCE_TEST_OK` is the **29th** group (it makes `npm run verify` print 29 `_OK` markers), immediately before `INSTALLED_ORDERING_OK` (the 28th). It asserts, as above: the code-level purity of `src/core/skill-instance-test.mjs` (each forbidden token, after comments are stripped); the four prompt blocks present and in order; the standing 「注意」 sentence verbatim; the whole forbidden-word list absent from `prompt.text`, plus the scope ids absent; every observation ending in `？` and absent from `prompt.text`; byte-identical results across two calls; the absence of the conclusion vocabulary; the unavailable reasons; the client literals — the eighth `require('../../core/skill-instance-test.mjs')`, the six `data-role`s, the new-session hint verbatim, `INSTANCE_TEST_GOAL_TITLE` and `INSTANCE_TEST_PROMPT_TITLE`, the `'data-role': 'mod-instance-trace'` line, and the two arguments that carry the intent and the framework into the generator (`intent: lastIntent || null`, `framework: detail?.framework ?? null`); exactly **eight** core `require` calls in the client; and the absence of the five forbidden product names in both the client and the module.

The group's **6b** block is the second round's, and it is what makes traceability assertable rather than merely visible. It builds one input whose intent names `references` *and* whose diff says `references` really changed, and then requires: the primary scope to follow the intent (`trace.hintedScopeId === 'references'`); the touched role (`运行逻辑` / `workflow`) to be absent from the regression constraints while an untouched one (`输出` / `output`) is present; `regression.source === 'framework'`; the intent's raw text to appear nowhere in `JSON.stringify(result)`; `trace.sources` to equal the present inputs exactly (`'intent scopeIds comparison description framework'`); a changed section title from the diff to be absent from `prompt.text`; and `export const buildInstanceTest = buildSkillInstanceTest` to exist. A companion `guardedRoles` entry for `mod-instance-trace` keeps the new `<li>` from being drawn without anyone watching it.

The behavioural half lives in `test/skill-instance-test.test.mjs` (27 tests, up from 21), as pure-function tests rather than render assertions: the prompt's four-block contract, the exclusion rules, observation count and shape, determinism, the unavailable reasons, and the regression-constraint rules — `regressionOf()` reads the framework's role-tagged sections first and falls back to level-2 body headings only when that finds nothing, returns `available: false` with an honest sentence when neither path does, and never emits a vague 「确保没有破坏任何东西」. It also covers the six sources as a set (present ones only, in fixed order), the intent's authority over the primary scope together with its absence from the record, the three limitations the second round added, and — the third round's one new test — the word-boundary truncation: a long English `description` must yield a 任务 that carries `…`, never contains the half-word `avo`, and ends on a whole token, while a short Chinese `description` must carry no ellipsis at all. `test/client-render-smoke.test.mjs` (still 26 tests) covers what the block actually draws, with the new assertions folded into its existing instance-acceptance case.

### What v0.10.0 is not

Not a runner: no test is executed, no session is opened, no result is read back, and there is no Test Runs screen to look at because there are no runs. Not a judge: no score, no pass rate, no 有效 / 无效, no verdict column, and no automatic comparison of what the Agent produced against what the Skill declared. Not a test suite and not a dataset: no Test History, no Evaluation Database, no Benchmark Dataset, no saved cases — the whole artifact is text on screen and one clipboard write, and reopening the detail page starts from nothing. Not a new surface: no page, no navigation entry, no route, no second Agent Runtime, and not one byte changed in `src/dsh/host/index.js` — the planned `POST /skill-trace/instance-test` was cancelled, precisely so that instance acceptance could not grow a server side, a stored result, or a lifecycle of its own. And not V1.0's Skill Evaluation: whether a modification actually improved a Skill is a judgement, judgements need evidence from a run, and this version's contribution is to be the honest, reproducible part that comes before it.

The acceptance criterion for this version is the one the user set: the interface must let a person believe that the generated prompt is about *this* modification, and not just a well-written generic test prompt. Everything above — determinism, the forbidden-word list, the physical separation of prompt and observations, the framework-first regression constraints, the recorded provenance, and the refusal to invent a task when the evidence is not there — exists to make that one sentence true rather than plausible. The 「这个任务是怎么来的」 block is where the user can check it: it names the inputs the task was built from and the scope that decided its shape, so the correspondence between the artifact and the change is something to read, not something to believe on faith.
