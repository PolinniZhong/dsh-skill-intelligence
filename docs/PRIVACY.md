# Privacy

## Local-first design

This preview does not implement telemetry, cloud synchronization, receipt upload, or remote analysis. Its receipts, learning notes, and human-authored validation results are intended to remain in the local DSH environment.

## Data boundary

The observer and storage layer are designed to avoid persisting:

- complete prompts or conversation content;
- complete Skill instruction text;
- tokens, cookies, credentials, or authorization material;
- absolute local paths; and
- project files or generated output contents.

It stores only the minimum bounded metadata needed to display the observed load record, a safe source identity/snapshot, user-entered local learning notes, and user-entered validation status, observation, and next action.

Unsaved learning, validation, and output-reference drafts are temporarily buffered in the Desktop WebView's `sessionStorage` so in-app tab or view switches do not silently discard user input. This buffer is local, capped to 24 recent drafts and 500 characters per field, is not uploaded, and is not included in a Host backup until the user saves. It is removed after a successful save, matching receipt deletion, clear-all, or the end of the WebView session.

## User control

Learning notes and validation results exist for the local user to revisit in the relevant Skill and receipt views. They are not sent to the project maintainer, used to score a Skill, or treated as causal proof. Removing the plugin does not itself delete those local records; deletion should remain an explicit user choice.

The archive payload contains the same bounded receipt metadata and user-authored fields already stored by the plugin; it does not add complete Skill instructions, prompts, conversation content, project files, credentials, or absolute paths. The plugin does not upload it. The `0.4.0-beta.2` Desktop Blob-download handoff could not verify file persistence and was removed. `0.4.0-beta.3` stores verified backup files in the plugin's local data area and exposes only bounded backup metadata to the UI; opening the containing folder is an explicit local user action.

The clear-all action removes only DSH Skill Trace receipt files after an inline confirmation. It does not remove DeepSeek Harness conversations or view preferences. Evidence from a still-running DSH session may be reconstructed, but reconstruction alone does not recover user-authored notes or validation results. `0.4.0-beta.3` therefore requires a verified local safety backup before clear-all or single-receipt deletion; if that backup fails, deletion does not proceed. During restore, an active trace-only receipt may receive personal fields that are missing from the current record, but existing learning notes, validation results, output references, and a human-confirmed continuation decision are not replaced by backup values.

The no-selection guide in My Skills is static plugin-owned interface copy. It does not inspect or transmit a Skill body, receipt content, user-authored understanding, or project material. Locale switching translates only the guide copy, not user data.

## Reporting bugs

Never include prompts, Skill text, access tokens, cookies, personal paths, or project material in a public GitHub Issue. There is no dedicated private vulnerability-reporting channel in this preview; use public Issues only for non-sensitive reports.
