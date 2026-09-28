# Architecture

## Product boundary

DSH Skill Trace observes event evidence produced by DeepSeek Harness and presents a local receipt plus a user-owned learning loop. It does not decide which Skill to use, discover remote Skills, mount a Skill, or judge a model output.

```text
DSH event stream
  └─ tool/call + tool/result for skill(name)
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
3. The reducer can associate repeated loads and multiple Skills in the same session.
4. A load record is not upgraded into proof of compliance, causal contribution, correctness, or usefulness.
5. The user may separately write an understanding, an improvement intent, and a next validation plan. Those fields are personal notes, not model judgments.
6. The user may later record whether that plan met expectations, what they observed, and what to do next. This is a human-authored validation result attached to the original session receipt, not a quality score or causal proof.

## Main modules

| Module | Responsibility |
| --- | --- |
| `src/dsh/host/index.js` | DSH lifecycle bridge, event observation, privacy policy, local persistence wiring |
| `src/core/trace-reducer.mjs` | Converts observed events into bounded session evidence |
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
