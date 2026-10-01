# Privacy

## Local-first design

This preview does not implement telemetry, cloud synchronization, receipt upload, or remote analysis. Its receipts are intended to remain in the local DSH environment. Exactly one feature ever sends anything off the machine — the 中文阅读版 translation of a Skill definition, to the model provider the user themselves configured, on one explicit user action. That is described in full below.

## Data boundary

The observer and storage layer are designed to avoid persisting:

- complete prompts or conversation content;
- complete Skill instruction text;
- tokens, cookies, credentials, or authorization material;
- absolute local paths; and
- project files or generated output contents.

It stores only the minimum bounded metadata needed to display the observed load record, plus a safe source identity/snapshot. Skill definitions are read live and never persisted. A receipt written by a release before v0.6 may still contain the learning notes and human-authored validation results the user typed into that older version. v0.6 removed every write path for them, so the current plugin neither creates, edits, nor deletes those fields — it only reads them back when displaying a receipt that already has them.

The only local file outside the receipt store is the default-view preference, `~/.dsh/skill-trace/preferences.json`. It holds two fields and nothing else: `{"version": 3, "defaultView": "current" | "installed"}` — which first-level page the plugin opens on (本次 Skill or 已安装 Skill), plus which information architecture wrote it. The version field is the only thing that distinguishes a user's choice from a default written by an older release: only `version: 3` carrying one of those two values counts as a stated preference. Anything else — an older `skills` / `map` / `receipt` value, or a file with no version field at all — is treated as "no preference expressed", and the plugin opens on 本次 Skill (`current`). A write always stamps version 3. The file contains no session id, no Skill name, no path, and nothing derived from conversation content. The plugin has no clear-all action that removes it; it goes away only with the plugin's local data area.

The only other local file is the reading-version store, `<plugin data area>/translations/<sha256>.json`. It exists so that a translation the user paid for is still there tomorrow, and its key is the reason it is safe to keep: `skillName` + `sourceSha256` + `targetLanguage`. **There is no session id in the key and none in the file.** Each record holds `{schemaVersion, skillName, sourceSha256, targetLanguage, translation, chunkCount, fallbackChunks, fallbackReasons, model, createdAt, updatedAt}` — the translated text plus the metadata needed to decide whether it still applies. It never holds the definition body, a conversation, tool arguments or results, or a path. The store refuses to write a record carrying any of `sessionId`, `sessionID`, `messages`, `conversation`, `args`, `result`, `toolArguments`, `toolResult`, and the guard `TRANSLATION_PERSISTENCE_OK` pins both that list and the absence of `session` from the key function itself. Because the key contains the content hash, editing the Skill makes the stored translation unreachable rather than stale-but-shown: the old file is left in place (so reverting the edit brings it back) and a new hash simply has no entry. The directory is `0700`, each file `0600`, and every write is a temp file followed by a rename. The store keeps at most two revisions per Skill and language. The plugin has no clear-all action that removes these; they go away only with the plugin's local data area.

## What the translation feature sends

中文阅读版 is the only feature that puts anything on the network, so it is worth stating plainly.

When the user asks to translate one Skill, the plugin reads that Skill's definition body live and sends **that definition text** to the model provider configured in DSH — the user's own provider and credentials; nothing is routed through the plugin author. The call uses the standard DSH model interface, with the same non-session-polluting pattern DSH itself uses for background work, so it neither creates a conversation nor appends anything to the current one.

Nothing else is sent. No receipt, no session id, no prompts or conversation content, no tool arguments or results, no project files, no absolute paths, and no other Skill.

The result stays on this machine. A translation is written only to the reading-version store described above: not to the receipt, not to a backup, not `localStorage`, `sessionStorage`, `indexedDB`, `sendBeacon`, and never appended to the conversation as a user message. It is not uploaded, not synchronized, and not shared between machines. Deleting the stored file, or the plugin's data area, removes it.

The answer is checked rather than trusted. The plugin compares code fences, heading levels, inline code, URLs, file paths, and frontmatter keys against the source definition and refuses a translation that moved or edited one of them. Only a translation that passed that check is written.

## What the clone feature writes

复刻 Skill copies one Skill into a new directory. It is the only feature that creates files outside the plugin's own data area, so its boundary is stated here too.

It writes **only into a Skill directory DSH already uses** — the project's `.dsh/skills` or `.agents/skills` for a project-scope clone, or the user's `~/.dsh/skills` / `~/.agents/skills` for a user-scope clone — and only when the target name is free. If a Skill of that name is discoverable in the catalog, or either on-disk shape already exists, the clone is refused and the user is asked to pick another name; the plugin never overwrites, and never deletes first. The copy is a new directory, created with a non-recursive `mkdir` precisely so that an existing directory becomes an error rather than a merge.

It never modifies the source. It reads the source definition, copies the declared resource files, rewrites the copy's frontmatter `name:` so DSH can identify it, and then reads the copy back to verify it. It does not execute anything in the Skill — no `scripts/`, no `bash`, no Python, no Agent invocation — and copying a Skill does not load or run it.

It never returns a local absolute path to the interface: the caller receives a path *kind* (`project-dsh` / `user-dsh` / `user-agents`) and a sentence naming the scope. Symbolic links inside a Skill bundle are recorded and skipped rather than followed, so a clone cannot pull in a file from outside the Skill. `.git` and `node_modules` are not copied and are not counted as skipped content — they are not part of the Skill. A copy that fails partway through is removed rather than left behind, a copy cut off by the size limit is reported as incomplete rather than as a full copy, and the response re-reads the source and compares its hash so 「源 Skill 未被修改」 is a measurement, not an assurance.

## User control

The current plugin offers no field for the user to author, and v0.6 removed the clear-all and single-receipt deletion routes along with the entire export, backup, and restore chain. There is therefore no in-product deletion action and no safety backup taken before one: receipts live in the plugin's local data area, and removing them is an ordinary local file operation. Removing the plugin does not itself delete the receipts it wrote.

Locally stored user-authored fields carried over from older receipts are not sent to the project maintainer, used to score a Skill, or treated as causal proof. Locale switching translates only plugin-owned interface copy — never receipt evidence, Skill text, or any user-authored field.

## Reporting bugs

Never include prompts, Skill text, access tokens, cookies, personal paths, or project material in a public GitHub Issue. There is no dedicated private vulnerability-reporting channel in this preview; use public Issues only for non-sensitive reports.
