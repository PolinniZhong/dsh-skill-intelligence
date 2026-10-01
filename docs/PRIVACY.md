# Privacy

## Local-first design

This preview does not implement telemetry, cloud synchronization, receipt upload, or remote analysis. Its receipts are intended to remain in the local DSH environment. Exactly one feature ever sends anything off the machine — the 中文预览 translation of a Skill definition, to the model provider the user themselves configured, on one explicit user action. That is described in full below.

## Data boundary

The observer and storage layer are designed to avoid persisting:

- complete prompts or conversation content;
- complete Skill instruction text;
- tokens, cookies, credentials, or authorization material;
- absolute local paths; and
- project files or generated output contents.

It stores only the minimum bounded metadata needed to display the observed load record, plus a safe source identity/snapshot. Skill definitions are read live and never persisted, and translation results never touch disk at all. A receipt written by a release before v0.6 may still contain the learning notes and human-authored validation results the user typed into that older version. v0.6 removed every write path for them, so the current plugin neither creates, edits, nor deletes those fields — it only reads them back when displaying a receipt that already has them.

The only local file outside the receipt store is the default-view preference, `~/.dsh/skill-trace/preferences.json`. It holds two fields and nothing else: `{"version": 3, "defaultView": "current" | "installed"}` — which first-level page the plugin opens on (本次 Skill or 已安装 Skill), plus which information architecture wrote it. The version field is the only thing that distinguishes a user's choice from a default written by an older release: only `version: 3` carrying one of those two values counts as a stated preference. Anything else — an older `skills` / `map` / `receipt` value, or a file with no version field at all — is treated as "no preference expressed", and the plugin opens on 本次 Skill (`current`). A write always stamps version 3. The file contains no session id, no Skill name, no path, and nothing derived from conversation content. The plugin has no clear-all action that removes it; it goes away only with the plugin's local data area.

## What the translation feature sends

中文预览 is the only feature that puts anything on the network, so it is worth stating plainly.

When the user asks to translate one Skill, the plugin reads that Skill's definition body live and sends **that definition text** to the model provider configured in DSH — the user's own provider and credentials; nothing is routed through the plugin author. The call uses the standard DSH model interface, with the same non-session-polluting pattern DSH itself uses for background work, so it neither creates a conversation nor appends anything to the current one.

Nothing else is sent. No receipt, no session id, no prompts or conversation content, no tool arguments or results, no project files, no absolute paths, and no other Skill.

The result stays in page memory. A translation is held in the Skill Detail component's state for the current page only: it is never written to the receipt, a backup, `localStorage`, `sessionStorage`, `indexedDB`, `sendBeacon`, or the filesystem, and it is never appended to the conversation as a user message. Leaving the page, or closing the plugin, discards it.

The answer is checked rather than trusted. The plugin compares code fences, heading levels, inline code, URLs, file paths, and frontmatter keys against the source definition and refuses a translation that moved or edited one of them.

## User control

The current plugin offers no field for the user to author, and v0.6 removed the clear-all and single-receipt deletion routes along with the entire export, backup, and restore chain. There is therefore no in-product deletion action and no safety backup taken before one: receipts live in the plugin's local data area, and removing them is an ordinary local file operation. Removing the plugin does not itself delete the receipts it wrote.

Locally stored user-authored fields carried over from older receipts are not sent to the project maintainer, used to score a Skill, or treated as causal proof. Locale switching translates only plugin-owned interface copy — never receipt evidence, Skill text, or any user-authored field.

## Reporting bugs

Never include prompts, Skill text, access tokens, cookies, personal paths, or project material in a public GitHub Issue. There is no dedicated private vulnerability-reporting channel in this preview; use public Issues only for non-sensitive reports.
