# Changelog

## 0.4.0-beta.4 — 2026-08-28

- Distills the My Skills no-selection guide to one value statement, the existing seven-step path, and one consolidated evidence boundary.
- Removes repeated outcome summaries, eyebrow copy, boxed footer instructions, and the redundant review-workspace annotation without changing navigation or stored data.
- Keeps the evidence-to-learning sequence, DSH locale switching, verified-receipt entry point, and narrow-layout behavior intact.

## 0.4.0-beta.3 — 2026-08-28

- Replaces the unverifiable WebView Blob download with Host-owned, atomically written and read-back-verified local backup files.
- Adds backup history, exact file metadata, an OS-level “open backup folder” action, restore preview, and missing-only restore that does not overwrite an existing same-session receipt.
- Handles an active session recreating trace evidence after clear-all by supplementing only missing backed-up personal records; existing user content remains authoritative, and full restores, supplemented receipts, and unchanged receipts are reported separately.
- Serializes restore with live writes per Session, blocks new writes behind a clear-all maintenance barrier, and gives each atomic receipt write a unique temporary path to prevent concurrent rename collisions.
- Replaces the empty My Skills detail pane with a bilingual seven-step evidence-to-learning guide that uses no sample receipt, model call, or new stored data.
- Creates and verifies a safety backup before clear-all or single-receipt deletion; backup failure aborts the destructive action.
- Adds explicit saved/unsaved feedback for learning notes and continuation assessments, plus correctable output references with remove confirmation.
- Keeps bounded unsaved learning, validation, and output-reference drafts in session storage across in-app view unmounts, restores only drafts based on the same saved record revision, and warns before Desktop reload or close.
- Keeps backup contents bounded to the existing receipt privacy projection and adds no cloud, upload, telemetry, Skill-body, Prompt, conversation, credential, or project-file storage.

## 0.4.0-beta.2 — Unreleased

> Release blocked: Desktop testing reproduced a false-success state for the Blob-based backup download, and the candidate has no restore path. Do not publish this candidate as a completed local-data loop.

- Turns My Skills into a local review workspace with pending-review priority, local full-text search across user-authored learning and validation fields, and explicit sorting.
- Adds a deterministic continuation handoff card that copies only receipt identity metadata, candidate steps, the user's own notes and validation result, and the user's `manual` / `partial` / `blocked` assessment.
- Adds a bounded local archive payload and an inline-confirmed clear-all action for Skill Trace receipts; the archive payload remains local, but its current Desktop download handoff is not accepted as a completed backup.
- Gives the My Skills sidebar more working width, keeps review labels readable, and stacks local-data actions so destructive copy does not wrap or drift at narrow widths.
- Replaces the remaining native receipt-delete confirmation with an in-page confirmation state.
- Keeps Skill bodies, prompts, project content, cloud sync, automated reminders, AI summaries, scoring, ranking, installation, routing, mutation, and publication out of scope.

## 0.4.0-beta.1 — Unreleased

- Adds a human-authored validation result to an original per-session Skill receipt: expectation status, observed outcome, and optional next action.
- Adds My Skills filters for pending review and recorded validation results, plus a chronological per-Skill learning and validation timeline.
- Keeps exact and candidate history associations separate and does not synthesize a cross-session “correct understanding.”
- Stores no Skill body, project content, cloud data, telemetry, score, ranking, or automatic recommendation.

## 0.3.0-beta.2 — Unreleased

- Follows the DeepSeek Harness `zh` / `en` interface-language setting, including dynamic Inspector and My Skills copy, and refreshes the Skill Trace UI in place when the setting changes.
- Centers the fixed 1000px flow-map scene inside a wide grid viewport while preserving horizontal scrolling on narrower viewports.
- Changes presentation only; receipt evidence, persisted data, Skill declarations, and user-authored notes remain untouched.

## 0.3.0-beta.1 — 2026-08-27

First public engineering preview.

- Observes DSH `skill(name)` call/result evidence and records multiple Skill loads in a session.
- Provides the Skill receipt and flow-map reading modes, including a concise session summary.
- Adds the read-only "My Skills" catalog and local per-Skill understanding, improvement, and validation notes.
- Keeps a strict distinction between a successful load, actual instruction following, output correctness, and user-confirmed usefulness.
- Adds public source-installation, architecture, privacy, and security documentation.

Known limitations: compatibility has only been exercised against one DSH Desktop/runtime baseline; system accessibility audit, long-map navigation, and personal 24-hour learning validation remain pending.
