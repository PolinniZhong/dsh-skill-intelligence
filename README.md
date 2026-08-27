# DSH Skill Trace

> Experimental preview for DeepSeek Harness · 中文界面名：**Skill 追踪**

DSH Skill Trace is a local-first DeepSeek Harness plugin that turns observed Skill-load events into an understandable, reviewable learning record. It helps a user answer:

- Which Skill did the Agent actually request to load in this session?
- What declared steps and dependencies does that Skill expose?
- What happened in this session, without claiming that loading caused the result?
- What do I understand, want to improve, and want to verify next time?

It is deliberately **not** a Skill marketplace, installer, sync service, dynamic router, quality scorer, or automatic Skill editor/publisher.

## Preview status

`0.3.0-beta.1` is an engineering preview. It has been verified locally with DeepSeek Harness Desktop `0.8.3` and the DSH runtime baseline `0.1.1-rc.2`; other DSH versions are not yet verified.

The implementation supports multiple Skill load records in one session, an empty state when none is observed, two read views (Skill receipt and flow map), a read-only "My Skills" catalog, and local per-Skill learning notes.

The remaining product validation is personal recall and a 24-hour retest. Do not treat the preview as proof that users understand a Skill, or that a loaded Skill caused a successful output.

## Install from source

Prerequisites: Node.js `>=22.19`, Git, and a compatible DeepSeek Harness Desktop installation.

```bash
git clone https://github.com/PolinniZhong/dsh-skill-trace.git
cd dsh-skill-trace
npm test
npm run verify
dsh plugin --profile web add "link:$(pwd)"
```

Restart DeepSeek Harness Desktop, open a non-empty conversation, then open **Skill 追踪**.

To remove the plugin from the `web` profile:

```bash
dsh plugin --profile web remove dsh-skill-trace
```

Removing the plugin does not automatically delete existing local receipts. Delete any local data only through an explicit user action in the product.

## What the evidence means

An observed successful `skill(name)` tool call proves that the Agent requested a load and DSH returned successfully. It does **not** prove the Agent followed every instruction, that the Skill caused the output, or that the output is correct. The UI keeps those distinctions visible.

See [Architecture](docs/ARCHITECTURE.md) and [Privacy](docs/PRIVACY.md) for the exact boundary.

## Development

```bash
npm test
npm run verify
npm pack --dry-run
```

The test suite exercises event reduction, receipt persistence, preference persistence, catalog projection, source snapshots, and host privacy policy. `npm run verify` checks the package structure and public contracts; neither command is a full end-to-end Desktop test.

## Scope and non-goals

- Local-first: no analytics or receipt upload is implemented.
- Privacy-minimal: receipts avoid full prompts, full Skill text, tokens, cookies, absolute paths, and project contents.
- Read-only catalog: "My Skills" is a learning index, not an installer or manager.
- No automatic Skill modification, execution, installation, submission, or publication.
- Independent from `dsh-visual-acceptance`; a user may manually hand a Web output to that plugin, but no coupling is implemented.

## License and security

Released under the [MIT License](LICENSE). For non-sensitive bugs, use GitHub Issues. Please read the [security policy](SECURITY.md) before reporting a vulnerability.
