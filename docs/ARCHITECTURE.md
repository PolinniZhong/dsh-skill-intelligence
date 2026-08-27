# Architecture

## Product boundary

DSH Skill Trace observes event evidence produced by DeepSeek Harness and presents a local receipt plus a user-owned learning loop. It does not decide which Skill to use, discover remote Skills, mount a Skill, or judge a model output.

```text
DSH event stream
  └─ tool/call + tool/result for skill(name)
       └─ trace reducer
            ├─ local session receipt
            ├─ receipt / flow-map views
            └─ read-only My Skills catalog
                 └─ per-Skill local learning notes
```

## Evidence model

1. A matching `tool/call` and successful `tool/result` is recorded as a requested, successful load.
2. The reducer can associate repeated loads and multiple Skills in the same session.
3. A load record is not upgraded into proof of compliance, causal contribution, correctness, or usefulness.
4. The user may separately write an understanding, an improvement intent, and a next validation plan. Those fields are personal notes, not model judgments.

## Main modules

| Module | Responsibility |
| --- | --- |
| `src/dsh/host/index.js` | DSH lifecycle bridge, event observation, privacy policy, local persistence wiring |
| `src/core/trace-reducer.mjs` | Converts observed events into bounded session evidence |
| `src/core/source-snapshot.mjs` | Creates safe source identity/snapshot metadata |
| `src/core/catalog-view.mjs` | Projects receipt and note data into the read-only My Skills catalog |
| `src/storage/receipt-store.mjs` | Stores local receipts and schema migrations |
| `src/storage/preference-store.mjs` | Stores local view preferences and notes |
| `src/dsh/client/client.js` | Conversation UI: receipt, flow map, catalog, and learning notes |

## Compatibility boundary

The preview was exercised against a specific DSH Desktop/runtime baseline. DSH event schemas and consumer integrations may evolve. Any upgrade must re-check the `skill(name)` call/result pairing, session persistence, restart recovery, empty state, and host non-interference before it is claimed compatible.
