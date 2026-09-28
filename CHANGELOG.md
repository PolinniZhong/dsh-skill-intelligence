# Changelog

## 0.4.0-beta.20 — 2026-09-28

UI 治理第四批：**Contextual Inspector（§14/§15）+ 声明 ↔ 实际（§16）**。这是 Phase 3 算出的证据第一次有了界面。

- **§14 检查器随选择变化。** 此前右侧栏不管你在看什么都固定展示"我的理解与迭代"——§14 点名的正是这件事。现在学习表单只出现在 `Skill 收据` 视图（那里填写笔记就是任务本身），画布旁边不再固定占用空间。
- **§15 标签页随选中对象变化**，不再一套结构套所有节点：选中一条边 → `[关系证据]`；选中 Skill 调用 → `[运行证据] [声明 ↔ 实际] [关联关系]`；选中其他节点 → `[运行证据] [关联关系]`。
- **§16 声明 ↔ 实际**：逐条列出 Skill 声明的步骤，每条给出证据状态与**它不表示什么**，并在末尾明说"这里不评分——没有遵循率、百分比或排名"。
- **Skill 名称不从工具参数推导**（参数从不存储）。改为在**宿主侧**把加载证据与调用节点按 `(turn, step)` 连接——模型调用与用户 `/名称` 加载各自都会产生带 `turn/step` 的运行事件，因此两者都能连上。真实会话实测 **11/13 次加载**唯一匹配。
- **两个方向的歧义都被丢弃**：一次加载匹配不到唯一调用、或一次调用被两次加载认领，都**不建立连接**，界面如实说明"无法唯一对应，与其猜一个，这里留空"。这正是证据模型不允许发明关系的地方。
- 新增 13 项契约测试与 3 项 verify 守卫；实测：让声明面板渲染百分比 → 失败；把双向歧义改成"猜一个" → 失败。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

## 0.4.0-beta.19 — 2026-09-28

- **修掉一个会让整个插件消失的问题。** 上一版用静态 `import` 载入 ELK。宿主插件是一个模块图：顶层 import 失败 = **整个插件加载失败**——图谱、收据、对齐三个视图一起消失，而失败原因只是「一个可选的布局优化不可用」。实测确认：把 `elkjs` 移走后，宿主模块无法导入。现在改为首次使用时动态载入，失败即返回 `null`，布局降级为确定性并在 `engineNote` 说明原因（实测：宿主仍可正常导入并降级）。
- **修掉安装链路：git 托管的包，其依赖不会被 lockfile 协调带进来。** `dsh plugin install` 以 lockfile 为准，而 lockfile 里 `dsh-skill-trace` 的快照没有 `dependencies` 字段（它是零依赖时期生成的），因此 pnpm 报「Already up to date」而 `elkjs` 从未落盘。修法：在 lockfile 中补上该包的 `dependencies` 与 ELK 自身的 `packages`/`snapshots` 条目，并在 profile 的 `package.json` 中显式声明 `elkjs`——插件从 `<profile>/node_modules` 向上查找即可解析。
- 实测（已装副本）：`elk` 用于 ≤80 节点的视图（46 节点 62ms），超过预算走确定性布局（1–5ms）；两条路径画布高度均 ≤1036px。

## 0.4.0-beta.18 — 2026-09-28

UI 治理第三批：**ELK 宿主侧布局**（§12/§34/§35/§36），P1 收尾。

- **ELK 负责层内交叉最小化，几何仍留给本插件。** §35 的层是**语义**定义的（会话 → Turn → 能力 → 调用 → 子会话），且 §35 明确「Layer 是视觉布局概念，不代表 Runtime 因果层级」。因此把层作为 **partition** 交给 ELK，让它做真正擅长的事：层内交叉最小化。
- **为什么不让 ELK 决定坐标**：实测把真实 1095 节点会话的聚合视图交给 ELK，产出 **4804 × 4937** 的画布——一根竖条，正是 §20/§36 要防的「线条墙」。同一视图由本插件的换行放置器产出 **3164 × 1036**。这与已确认的「必须配换行」一致：ELK 给顺序，放置器给几何。
- **ELK 在大图上很贵，按实测设预算。** 45 个真实会话实测：

  | 渲染节点数 | 0–20 | 20–40 | 40–60 | 60–80 | 80–120 | 120–200 |
  |---|---|---|---|---|---|---|
  | 中位耗时 | 7ms | 13ms | 22ms | 41ms | 164ms | **556ms**（最大 1062ms） |

  因此 `ELK_NODE_LIMIT = 80`：便宜时用 ELK，超预算交回确定性放置器。**哪条路径生效会写在布局结果与界面上，不做静默替换。**
- **实测效果**（56 个真实会话）：**ELK 覆盖 39/56**，该路径耗时中位 **10ms**、最大 89ms；回退路径中位 2ms。**两条路径的画布高度均 ≤1036px**，换行约束在两种引擎下都成立。
- 布局引擎失败时**降级而不是抛错**：ELK 不可用或返回不可用的结果时回到确定性布局，并在 `engineNote` 说明原因。
- 引擎接缝是布局模块上的一个 `orderOf` 选参——排序是布局决定，不是运行事实；层的划分依旧来自 §35。
- 新增 9 项 ELK 契约测试（预算回退、引擎不改动节点集、§36 高度约束、partition 与 §35 层一致、只取顺序不取坐标、坏结果降级）与 3 项 verify 守卫（实测：让 ELK 直接决定几何 → 失败；不再报告引擎 → 失败）。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

## 0.4.0-beta.17 — 2026-09-28

UI 治理第二批：**Runtime Flow 画布**（§6–§13）——治理文档 §2.1 与 §43 所指的主视觉。

- **`运行流程` 现在是真正的画布。** 此前它只是既有的 Skill 流程地图；现在它渲染 Runtime Flow：`会话 → Turn → 能力 → 调用 → 结果`，从左到右。§21 要求 `运行流程` 与 `运行图谱` 不能是两个"差不多的流程图"，因此前者是阅读密度、后者仍是密集视图，两者共用同一个只读渲染器。
- **渲染交给 React Flow，布局留在宿主。** 按已确认的混合式：ELK/坐标在宿主侧（§12/§32「UI 只消费已定义好的 View Model」），客户端只负责渲染与交互。React Flow 及其样式表内联进客户端产物（**354 KB**），对外仍然只依赖三个平台种子词。
- **§13 交互**：拖动平移、滚轮/双指缩放、缩放与适配控件、点选聚焦（选中节点后非关联节点降权到 28%）。
- **§2.2 只读**：`nodesDraggable`/`nodesConnectable`/`edgesUpdatable` 全部关闭，节点不可拖、不可连线。用户不能改变运行事实——这一点由构建期守卫强制，实测把任一项打开会让 `verify` 失败。
- **§9 状态不只靠颜色**：每个状态同时有字形、文字与颜色（`● observed` / `◐ partial` / `◌ candidate` / `○ unknown` / `◍ unlinked`）。
- **§10 线型语言**：实线=较强直接证据，虚线=候选或证据不足；候选边**无论类型**都画虚线（实测该守卫有效）；连线默认不带文字。
- **§7.1 节点克制**：节点只有名称、类型与状态，详情在 Inspector。选中后检查器仍复用既有 `/skill-trace/inspect`，回答"这条线为什么存在"，且每条关系同时给出**它不表示什么**。
- 新增 8 项画布契约测试（§2.2 只读、§13 交互、§8/§9 类型与状态、§10 线型、§32 不自行推断关系），以及 4 项 verify 守卫。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

## 0.4.0-beta.16 — 2026-09-28

UI 治理第一批（Design Refactor Governance §4/§5），并把客户端改为**构建产物**发布。

- **§4 信息架构**：`流程地图` 更名为 `运行流程`，并成为当前会话的**默认阅读模式**。此前默认落在 `Skill 收据` 上，与 §43「第一次打开就知道 Agent 在干什么」相悖。内部存储键仍是 `map`，因此偏好协议与既有本地配置都不受影响（§3 不允许改动持久化协议）。
- **§5 顶部导航**：`我的 Skill` 是跨会话入口，`当前会话` 只是上下文标签，三个会话视图同级——这三条在现有实现上已经成立，本批未改动，仅随 §4 一并核对。
- **客户端改为构建产物发布。** DSH 的 Web 外壳对插件的 `./client` 是**逐字节读取**、不打包，而浏览器模块表只解析**平台种子词**（实测仅 9 个：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`），其余一律抛 `build-time externals drift`。此前客户端是源码直发且只依赖 `react`，因此能工作；P1 要引入 React Flow 与 ELK，必须改为打包发布。
- 新增 `scripts/build-client.mjs`：esbuild 打包为 CJS，仅把种子词留作 external，其余依赖内联，并包回 `window.__ModuleLoader__.load({ id, factory })` 注册形态。产物 **143 KB**（UTF-8 保持中文可读；转义写法会多 26 KB 且把文案藏起来）。
- **两个构建期硬检查**，因为它们失败时只会在用户的浏览器里表现为插件空白：产物若 `require` 了种子表以外的模块，**构建直接失败**；产物内嵌客户端源码哈希，源码改了却忘记重建时 `verify` 会失败（两项均已实测触发）。
- 测试改为对**已发布产物**做契约校验（`pretest` 强制先构建），新增 7 项：注册形态、在真实 loader 下装载为可用插件、产物内全部 require 均为种子词、构建戳新鲜度、源码映射引用、治理标签为可读 UTF-8。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）；画布渲染仍只能消费既有 view model（§32）。

## 0.4.0-beta.15 — 2026-09-28

- Makes a past conversation's runtime evidence recoverable. The Host observed only live sessions — `sessions.get(id)` is documented as "look up a live session" — so opening an older conversation produced an empty graph. Measured on a real session, the Runtime Graph answered **1 node / 0 edges** for a run whose log actually held **1095 nodes / 1161 edges**. It now reads the durable session log and rebuilds. (P0 prerequisite for the UI refactor: with Runtime Flow as the default view, an empty default view would have been the first thing a user saw.)
- Fixes the compression detail that made this non-trivial, and would have made a naive version silently wrong. DSH appends one Zstandard **frame** per write batch, and Node's decompressors stop after the first frame: on a real 5.4 MB log, `zstdDecompressSync` returned 220 bytes / 1 line against 6350 lines actually stored. A `createZstdDecompress` stream behaved the same. DSH solves this with a Node-private stream handle, which is version-fragile, so frames are split on the Zstandard magic and decoded independently — O(n), verified byte-identical to `zstdcat` on a real log.
- Keeps the fallback honest. A session with no log on disk still reports `coverage-unknown`, now saying it looked on disk too. A torn trailing line is skipped rather than failing the read. A session id that could traverse the filesystem is refused. Oversized logs are gated. Decompressed logs are cached against the file revision, so a rewritten log is re-read and a stale one is not.
- Adds 15 contract tests and a verify guard that fails the build if the reader ever decodes only the first frame.
- Changes no receipt content, stored data, backup format, UI, or privacy projection. The new read is the same durable log the Host already reads for live sessions.

## 0.4.0-beta.14 — 2026-09-28

- Fixes an honesty bug found by running the acceptance checks against the live Host: a collapsed node was described by the size of the sample list it received rather than the number of nodes it stands for, so a group standing for 61 calls announced "represents 24 nodes". It now reports the true count, and the named list is labelled as a sample of it.
- A folded node now explains itself. Clicking one used to return no meaning and no limit, which read as an unexplained box; it now says that folding merges same-capability calls within a turn to keep the canvas readable, and that the folded node itself claims no relationship.
- Defines the capability legend style, which the canvas referenced but never declared.
- Adds a verify guard so a folded node can never again be described by its sample length.

## 0.4.0-beta.13 — 2026-09-28

- Adds the **runtime graph canvas** as a third view inside the plugin. This is the first UI change since beta.5, and the first time the runtime model is visible from DeepSeek Harness itself.
- **Measured first, as the plan required.** Across 56 real sessions on this machine the graph runs 61 nodes at the median, 915 at p90, and 1095 at the maximum — roughly ten times the scale a flat canvas was designed for. Grouping is therefore part of the model, not a later optimisation.
- Three layering rules, each chosen from that measurement: a turn with more than 12 invocations collapses to one node per capability; a session with more than 36 turns folds its turn column into ranges; a layer taller than 26 rows wraps into sub-columns. Together they cap the canvas at 200 nodes and about 1036 px tall regardless of graph size, and across all 56 sessions **nothing exceeded the bound** (max 200 rendered, layout cost median 0.3 ms, worst 15 ms).
- `src/core/runtime-layout.mjs` computes positions deterministically and never touches the graph. The same receipt always draws the same picture, no coordinate is ever stored, and the client draws what it is handed rather than deciding anything — a verify guard fails the build if the client starts computing layout.
- `src/core/runtime-inspector.mjs` answers **"why does this line exist"** for one node or one edge at a time. Every relationship returns its derivation and rule, the events behind it, and an explicit statement of what it does **not** claim: a `follows` edge says it is log order and not causation; a rule-based `spawns` attribution says catalog events never named the creator; a `retries` edge says it does not mean the retry went better.
- Two new Host routes, `/skill-trace/runtime` and `/skill-trace/inspect`. Both are bounded by construction: the canvas reports how many events stand behind an edge and how many nodes it folded rather than listing them, and the inspector re-derives the detail on demand.
- Bounds the canvas payload honestly rather than by truncation. Evidence-id lists, folded-member lists, and hidden-node id lists were each costing tens of kilobytes for data the client never read; they are now reported as counts. On the largest session the response went from **481 KB to 145 KB**, median 21 KB, with the true totals still shown.
- Changes no receipt content, stored data, backup format, learning data, or privacy projection. Layout and inspection are derived on read and never persisted.

## 0.4.0-beta.12 — 2026-09-28

- Stops projecting the invocation list into the client view model. It is one object per tool call, nothing renders it, and the receipt and map projections share one block — so a large session was sending it twice.
- Measured on a real 667-invocation session, the payload the Host hands the WebView fell from **837 KB to 57 KB**. Nothing observable is lost: the list was never read, and `aggregateInvocations()` and `buildRuntimeGraph()` still return it to any caller that wants it.
- Adds a verify guard so an unbounded list cannot be projected to the client again.
- Changes no receipt content, stored data, Host route, backup format, UI, or privacy projection.

## 0.4.0-beta.11 — 2026-09-28

- Adds Declaration ↔ Runtime Alignment in `src/core/runtime-alignment.mjs`: what a Skill said to do, next to what the run left evidence for. This is the step the product turns on, and it keeps three commitments.
- **No score.** There is no compliance rate, no percentage, no ranking. Counts of evidence states are reported; judgments are not. A verify guard pins the absence.
- **Absence of evidence is not evidence of absence.** A declared step with no matching runtime evidence is `insufficient`, never "not done". `not-observed` is deliberately absent from the vocabulary, because no amount of missing data can establish that an Agent skipped a step. A verify guard rejects reintroducing it.
- **Direct evidence is not generic evidence.** A `bash` call proves a command ran; it cannot prove the test step ran, because tool arguments are not stored. A step matched only by a catch-all capability is `partial`.
- Fixes the declaration extraction, which was the real defect behind all of this. The previous rule scraped ordered lists, and on a real Skill that produced five conditional branches and content categories as the "declared process" while missing all seven actual steps. Extraction now uses two channels — headings and ordered lists — with headings preferred, and a level-2 heading that opens a process section is treated as the section name rather than a step. The section, the rule, and the reason nothing was declared all ride along so the declaration stays auditable.
- Refuses to relabel constraints as a process. A Skill whose body lists `## 硬约束` items and keeps its real process in a referenced file genuinely declares no steps here; it now reports `numbered-items-outside-a-process-section` instead of promoting nine rules into an alignment. Ordered-list items qualify only inside a process-ish section, or in a body with no sections at all.
- Bounds the citations. A generic step can match hundreds of calls, so node and evidence lists are bounded samples while `matchCount` still reports the true total; on a real session this cut the alignment payload from roughly 100 KB to 7.4 KB without hiding anything.
- Reads the declaration baseline from the durable published catalog, so `inPublishedCatalog` distinguishes a Skill that was offered to the model from one loaded anyway by a user-explicit `/name` gesture — and reports `null`, not `false`, when no catalog was published at all.
- Verified against real session logs: `ai-frontier-daily-topics` now yields its seven real declared steps (搜索 / 核实 / 初筛 / 自我评审 / 输出 / 写入选题库 / 用户采纳意图识别) with three `observed`, one `partial` — the write step matched only by a generic shell call — and three `insufficient`, none of them claiming the Agent skipped anything.
- Changes no Host route, backup format, UI copy, learning data, or privacy projection. Alignment is derived on read and is never persisted.

## 0.4.0-beta.10 — 2026-09-28

- Adds the correlation engine and graph reconstruction in `src/core/runtime-graph.mjs`: normalized events become nodes, and only relationships the runtime actually reported become edges. No UI is added by this change.
- Holds one rule above the rest: **graph completeness is worth less than graph truthfulness**. Every emitted edge must cite at least one event the receipt still holds; an edge that cannot is dropped and counted in `droppedEdgeCount` rather than softened into a weaker claim.
- Emits edges at the priority the runtime supports. Containment (`session → turn → invocation`) and subagent spawns are `direct` / `observed`, because `turn`/`step` and the parent-owned `subagent/catalog.childId` are host facts. Adjacency is the only heuristic, it is bounded to consecutive invocations inside one step, and it is emitted `candidate` with a named rule.
- Observes `subagent/catalog`. DSH emits it when it creates a direct child session, so the child relationship no longer has to be inferred from tool ordering — the one case the SDD flagged as unsafe. The catalog's free-text `label` is deliberately not read: it is caller text, and this plugin stores no prompts or task descriptions.
- Attributes a spawned child to the invocation that created it only when exactly one subagent invocation exists in that turn, and marks that edge `candidate` under `sole-subagent-invocation-in-turn`. With two concurrent spawns in one turn the child is left attributed to the session alone and its node is reported `partial` — the SDD §17.4 concurrent-subagent case, implemented rather than described.
- Reports `unlinked` instead of attaching what it cannot place: an invocation with no observable turn is listed in `unlinked` with a reason and gets no containment edge.
- Keeps the edge vocabulary closed and non-causal. There is no `uses` and no `produces` edge, because attributing a tool call to a Skill needs alignment evidence this phase does not have; and no edge type can express "this caused that", because the runtime never said so. A verify guard pins both vocabularies as exact literals.
- Carries durable session lineage from the header (`parentSession`, `delegationDepth`) rather than inferring it, so a child receipt can point at its parent.
- Adds the SDD §17.4 false-relation suite **before** the engine, so it defines the contract rather than describing the implementation: adjacency yields no observed edge, concurrent subagents are never guessed, a successful Skill load yields no compliance or correctness claim, and an unplaceable invocation stays unlinked. 26 new tests across the false-relation and structure suites.
- Verified against real session logs: 702 nodes and 772 edges on a 667-invocation session with zero edges lacking valid evidence, zero dangling endpoints, and zero candidate edges mislabelled as observed; and on a session with a real subagent, the child shows an `observed` session edge and a `candidate` invocation edge.
- Changes no Host route, backup format, UI copy, learning data, or privacy projection. The graph is derived on read and is never persisted.

## 0.4.0-beta.9 — 2026-09-28

- Moves the runtime model into `src/core/runtime-events.mjs` as the Normalizer and Invocation Aggregator: raw session events become a stable, citeable RuntimeEvent stream, and that stream folds into logical capability invocations. No UI is added by this change.
- Records who produced each event. `source: 'dsh'` means the host reported it; `source: 'derived'` means a named deterministic rule produced it. A derived event is only ever appended — it never rewrites or replaces the record it read, and a derivation that cannot cite a rule is not emitted.
- Derives `retry` under one named rule, `same-turn-repeat-after-failure`: an invocation repeated after the same capability identity failed earlier in the same turn. Log order decides, never timestamps, and the derived event carries both its rule name and the `retryOf` invocation it repeats.
- Aggregates invocations strictly by `invocationId`. Adjacency and timing are never used, so a request whose result was never observed stays `unresolved-request` and a result with no observed request stays `orphan-result`, rather than being completed with whichever event happened to be nearby.
- Gives every event a stable `eventId` and every invocation the `evidenceEventIds` that support it, so a later graph edge can cite real evidence instead of asserting a relationship.
- Separates a settled invocation from a followed one: `evidenceState` is `observed` only for a request plus a successful result, `partial` for a failure, `requested` for a half-observed call, and `unknown` otherwise. `success` still means only that the call settled.
- Names the model honestly where DSH cannot support the SDD's shape: a `tool/result` carries no tool name, so a result event does not assert a capability it cannot know — capability is resolved from the request that opened the invocation, and left unset when that request is not observable. The vocabulary is therefore `invocation.request` / `invocation.result` / `skill.invocation` / `retry` rather than per-capability result types.
- Defers runtime-evidence writes to the turn boundary while Skill evidence keeps its immediate durability. A settled invocation costs two normalized events, so rewriting the whole receipt on every `tool/call` and `tool/result` wrote the same growing file hundreds of times per session; runtime evidence is derived and a rebuild reproduces it from the durable session log.
- Stops truncating an over-long skill or tool name into a *different* valid name. Length is now checked before trimming, so a malformed identifier is refused instead of being recorded as an invocation that never happened.
- Bumps the receipt schema to version 7. Receipts written by 0.4.0-beta.8 upgrade in place: each paired runtime row becomes a request event plus a result event. Verified against the seven real receipts on this machine and against real session logs, where 667 of 667 invocations paired and nine retries were derived with their evidence chains intact.
- Changes no Host route, backup format, UI copy, learning data, or privacy projection. Runtime evidence remains metadata only: arguments and result content are still never read, and the verify guards now reject a change that would start reading them or that would pair invocations by adjacency.

## 0.4.0-beta.8 — 2026-09-28

- Records a user-explicit Skill load. The observer subscribed only to tool events, so a `/name` gesture — which DSH injects as a `user/message` carrying `source.kind = 'skill-invocation'` and never produces a `skill` tool call — left no trace at all. Verified against a real log: two `/character-asset-kit` loads in one session were previously invisible and now appear with their instruction fingerprint, candidate steps, and dependency signals.
- Reads the instruction body on both load paths, because DSH renders one canonical `<skill_content>` shape for the `skill` tool result and the user-explicit injection alike. A Skill loaded either way now yields the same fingerprint and candidate steps.
- Stores the published skill catalog as the Declaration baseline. DSH persists what the model was actually offered as a `user/message` with `source.kind = 'skill-catalog'` and `entries`; a live registry snapshot answers a different question and drifts once the session ends. Replacement publications supersede the previous baseline and are counted.
- Keeps every tool invocation as bounded runtime evidence instead of discarding everything that is not named `skill`. Tool, CLI, MCP and Subagent invocations already arrived on the stream and were dropped at the door, which is what left the runtime graph without raw material. Each record holds correlation and classification metadata only — arguments and result content are never read, and a verify guard rejects a change that would start reading them.
- Attributes a `user/message` to a turn and step by log order. These events record no turn or step of their own, so attribution comes from the `turn/start` / `step/start` cursor most recently seen in the same log, never from timestamps.
- Counts truncation instead of hiding it: the runtime projection keeps the 1000 most recent invocations and reports `runtimeEventOverflow`, so a bounded window is never presented as a complete run.
- Adds a Phase 0 contract test suite whose event shapes were captured from a real session log, with content synthesised so no local path or personal catalog ships in the fixture.
- Bumps the receipt schema to version 6. Receipts written earlier migrate in place: a legacy record carrying a `callId` is labelled `model-invoked` as a matter of record, and one without stays unlabelled rather than being guessed.
- Changes no Host route, backup format, UI copy, learning data, or privacy projection. The new collections are additive and derived from the durable log.

## 0.4.0-beta.7 — 2026-09-28

- Restores the Skill instruction fingerprint, candidate steps, dependency signals, and version-drift detection on DSH runtimes that read session format V4. The observer read only the released V3 `tool-result` wrapper block, but V4 lifts a tool result into a first-class `tool` message and retires that wrapper, so `resultBlock()` returned `null` for every result.
- Stops reporting a load that was never actually read. Because the failure flag was also read off that missing block, every V4 result was recorded as `loaded` with no fingerprint and no candidate steps, while the receipt still claimed a successful load. The reducer now reads both spellings, so V3 evidence stays byte-identical and V4 evidence is recovered.
- Adds a session-format contract test built from an actual V4 event captured from `session.v4.jsonl`: it asserts the V4 fixture carries no retired wrapper, that V4 and V3 yield the same fingerprint and candidate steps for the same Skill body, that V4 failure identity still comes from `message.isError` and the `error` payload, and that an unreadable V4 result stays empty instead of inventing evidence.
- Adds a verify guard so the tool-result reader cannot regress to matching only the retired V3 wrapper.
- Changes no receipt schema, stored data, Host route, backup format, privacy projection, or UI copy. Existing V3-era receipts are unaffected; V4-era receipts regain evidence on the next session rebuild.

## 0.4.0-beta.6 — 2026-09-14

- Restores Skill receipts, the process map, and My Skills history for every conversation. The Host read a live session's durable log through the removed `session.events` field, so every rebuild produced an empty receipt on DSH runtime 0.1.2-rc.1 and later.
- Reads the log through `session.snapshotEvents()` — the accessor current runtimes expose — with a fallback to the legacy `events` array, so a future rename cannot blank the views again.
- Stops a view read from erasing stored evidence: because viewing a conversation persists the rebuild result, the wrongly empty receipt also deleted that session's stored record on every open.
- Adds a Host route regression test that drives a `snapshotEvents()`-only session, and a verify guard against reintroducing the removed field.
- Changes no receipt evidence, local learning data, backup contents, Host API, or persistence format.

## 0.4.0-beta.5 — 2026-08-28

- Makes the client stylesheet hot-reload safe: each new client instance atomically replaces the prior style node and only removes the style it still owns.
- Prevents an older plugin instance from stripping styles after a newer instance has mounted, which previously left receipt content rendered with browser-default controls and exposed SVG markers.
- Changes no receipt evidence, local learning data, backup contents, Host API, or persistence behavior.

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
