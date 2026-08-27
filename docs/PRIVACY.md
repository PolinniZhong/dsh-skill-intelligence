# Privacy

## Local-first design

This preview does not implement telemetry, cloud synchronization, receipt upload, or remote analysis. Its receipts and learning notes are intended to remain in the local DSH environment.

## Data boundary

The observer and storage layer are designed to avoid persisting:

- complete prompts or conversation content;
- complete Skill instruction text;
- tokens, cookies, credentials, or authorization material;
- absolute local paths; and
- project files or generated output contents.

It stores only the minimum bounded metadata needed to display the observed load record, a safe source identity/snapshot, and user-entered local learning notes.

## User control

Learning notes exist for the local user to revisit in the relevant Skill and receipt views. They are not sent to the project maintainer. Removing the plugin does not itself delete those local records; deletion should remain an explicit user choice.

## Reporting bugs

Never include prompts, Skill text, access tokens, cookies, personal paths, or project material in a public GitHub Issue. There is no dedicated private vulnerability-reporting channel in this preview; use public Issues only for non-sensitive reports.
