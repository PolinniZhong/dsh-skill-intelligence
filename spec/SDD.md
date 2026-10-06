# DSH Skill Intelligence · DSH Skill 智能实验室 · 软件设计文档（SDD）

> **当前版本**：`dsh-skill-trace@1.0.0`（`package.json`；`1.0.0` 是 V1.0「Skill 评测」（§22）：把 V0.10 临时生成的实例验收任务固化成可重复的 Evaluation Case，记录每次运行的条件与四段证据、同一 Case 的两侧对照与用户判定，2026-10-05 发到 GitHub Release 与 npm，tag `v1.0.0`）。上一版是 `0.10.0`（V0.10.0「Skill 实例验收」（§21）：把「这次修改」变成一段可以真的拿去跑一遍的真实测试任务与一组观察项，2026-10-05 发布）。再上一版是 `0.9.2`（把 V0.9.0「Skill 验收」（§18）、V0.9.1「Skill Modify」（§19）与 V0.9.2「已安装列表排序」（§20）三批设计合成一版，2026-10-03 发布）。再上一版是 `0.8.0`（V0.8「Skill 演进」：血缘 / 差异 / 界面三个 Phase，另带「Skill 洞察」短显示名与「复刻 Skill」请求体缺陷修复）
> **本版**：**V1.0「Skill 评测（Skill Evaluation）」** 已随 `1.0.0` 发布（2026-10-05 落地并发布，见 §22）——把 V0.10 临时生成的实例验收任务固化成**可重复的 Evaluation Case**，记录每次运行的条件与四段证据、同一 Case 的两侧对照与用户判定。**新增第 13 条路由** `POST /skill-trace/evaluation`（宿主 12 → 13 条）与一处本机落盘（`<dataRoot>/evaluation/`）、详情页多一张「Skill 评测」卡；**不新增页面 / 导航 / 第二套 Agent Runtime、不调模型、不判分**：评测纯函数在 `src/core/skill-evaluation.mjs`（**565 行**，唯一 import 是单行 `./skill-instance-test.mjs`）与 `src/core/run-conditions.mjs`（**168 行**，零时钟），客户端**第 9 支 `require`**。
> **这份文件是什么**：本插件**唯一一份描述当前实现**的技术设计 —— 分层、运行架构、宿主接口面、数据流、存储与隐私、模块清单、契约守卫、验证边界。
> **目录定位**：
> - **`spec/SDD.md`（本文件）= 当前架构的唯一权威。** 分层、13 条路由、数据流、存储与隐私、模块清单都以此为准。
> - **`spec/PRD.md` = 当前产品语义的唯一权威**（目标、业务对象、状态语义、范围与验收标准）。本文件不重复「做什么、为什么做」，只在实现需要处引用它。
> - **`docs/ARCHITECTURE.md`** = 运行时那条链（事件 → 收据 → 定义视图）的深挖、布局合同的由来，以及 v0.6 的组件删除记录。
> - **`docs/archive/technical-design-v0.1-v0.5.md` = pre-0.7 的技术设计，已冻结。** 它只用于追溯；其中的 §0「当前架构」写于 V0.6，数字与路由数都已过时（见 §0.1）。
> - **冲突时以源码 + 测试为准**，不以任何规格文档为准。规格写的是意图，源码写的是事实。
> **本文档的书写规则**：不发明架构；每条规则都指向实现它的文件与符号；文档与源码冲突时以源码为准，并把分歧登记在 §0.1。不写 V0.1–V0.6 的变更叙事、不写「修正」日期（一条规则若源自某次事故，只写规则本身与它防住的那一类失败）；不复制 `spec/PRD.md` 的范围与验收标准，也不复制 `design.md` 的逐组件视觉表。

---

## 0. 阅读须知

### 0.1 文档漂移登记（写本文件时实测）

| # | 位置 | 文档/注释说 | 源码事实 | 处理 |
|---|---|---|---|---|
| D1 | `src/dsh/host/index.js` translate 路由的注释 | 原文写「这里刻意**不**落盘……§12.4 要求译文只存在页面运行时内存里」 | 同文件 `saved: await persistTranslation({...})`，v0.7 起译文落盘 | **已修（2026-10-02）**：注释改成 v0.7 的事实——落盘为本机资产、键不含会话，同时保留不写 receipt / 不动偏好 / 不读正文三条 |
| D2 | `src/dsh/host/index.js` catalog 路由的注释 | 「名字暂用 `/installed` 而不是 SDD §16 写的 `/catalog`」 | 路由字面早就是 `/skill-trace/catalog`，「我的 Skill」工作台也已在 `0.5.0` 删除 | **已修（2026-10-02）**：那段「等改名收口」的注释删掉了，它会让后来的人以为还欠一次改名 |
| D3 | `docs/ARCHITECTURE.md` 模块表 | 写「the seven routes」 | 宿主有 **12** 条路由（V0.8 加 `GET /skill-trace/diff`，V0.9.1 加 `POST /skill-trace/modify`） | **已修（2026-10-02）**：改成「the ten routes」；**2026-10-03 再修**为「the eleven routes」；**V0.9.1 登记**：现为 **12** 条，该文件仍写「the eleven routes」，尚未同步（见 D11） |
| D4 | `docs/archive/technical-design-v0.1-v0.5.md` §0 | 宿主只注册 **7 条**路由、客户端约 1500 行 / 约 62 KB、`src/core/` 20 个模块约 6164 行 | 12 条 / **3625 行** / **189256 字节** / **30 个模块 10924 行**（V0.10.0 早期工作树为 3569 行 / 184471 字节 / 30 个模块 10774 行 / source hash `2d202a05030a1d58`；V0.9.2 发布口径为 3448 行 / 170324 字节 / 29 个模块 10353 行；V0.9.1 工作树时为 3356 行 / 167506 字节 / 10263 行） | 归档只作追溯，本文件不复用这些数字 |
| D5 | `scripts/verify-project.mjs` 末尾 | `console.log('FIVE_LAYER_MODEL_OK')` / `console.log('FINGERPRINT_RESERVED_OK')` 两句声称两条契约成立 | 两句之前**没有任何断言**。`FIVE_LAYER_MODEL_OK` 守的模块（`src/core/runtime-layout.mjs`、`src/dsh/client/runtime-flow.js`、`test/phase8-five-layer-model.test.mjs`）在 v0.6 删运行图谱画布时一起删了，marker 却留了下来 | **已修（2026-10-02）**：`FIVE_LAYER_MODEL_OK` 删掉（它守的界面不存在了）；`FINGERPRINT_RESERVED_OK` 补上真断言；新增 `GUARD_MARKERS_ARE_BACKED_OK` 反向检查每一个 marker 之前是否有断言。见 §13.1 |
| D6 | `AGENTS.md` §6.6 | 客户端 `require` 的 core 模块列举了 6 支 | 实际 `require` **7** 支（多一支 `skill-clone.mjs`，见 §10.3） | **已修（2026-10-02）**：本文改成七支并列出全部七个 |
| D7 | `spec/PRD.md` | `AGENTS.md` §4 把它列为产品语义权威 | 写本文件时 `PRD.md` 尚未落盘 | **已消解**：`spec/PRD.md` 已落盘（692 行），本文件与它互为产品/技术两侧 |
| D8 | 本文件 §3 标题 / §3.1 第 11 行 / §11.1 / §13 / §14.2 / §17，以及 `spec/PRD.md` §5.7 | 写完 V0.8.0 的设计之后，这些位置写的是 **11 条路由**、`FR-EVO-*`、`<dataRoot>/lineage/`、**25 组**守卫、4 个新测试文件 | **Phase 1、Phase 2 与 Phase 3 都已落地**（2026-10-02）：三个新模块 `src/core/skill-lineage.mjs` / `src/storage/skill-lineage-store.mjs` / `src/core/skill-diff.mjs` 都已存在；`handleClone` 会写血缘（fail-soft）；`/skill-trace/skill` 会回 `lineage`；宿主新增 `GET /skill-trace/diff`，**共 11 条**路由；详情页左栏有「Skill 演进」卡、它打开 720px 的差异面板（`SkillEvolution` / `SkillDiffPanel`，只在 `__views` 上导出以便烟测）；守卫 **25 组**全绿（第 25 条的客户端那半 Phase 3 补齐）；4 个新测试文件都在（`test/` 共 41 个 `*.test.mjs`，`npm test` **474 项**）。**这一版的设计已全部落地，并随 `0.8.0` 发布**（2026-10-02，GitHub Release + npm） | **本次登记（2026-10-02）**：本文件描述的是**已冻结的设计**（`AGENTS.md` §4：规格写的是意图，源码写的是事实）。落地已完成，真机验收也已于 2026-10-02 通过（12 个检查点，清单在 `01_重构方案/v0.8-真机验收清单.md`），**已随 `0.8.0` 发布**（2026-10-02）：六处状态文字已按 §9.1 同步，本文件 §9 与 §14 的实测值即为发布时口径 |
| D10 | 本文件 §9 模块清单 / §13 守卫表 / §14.1 测试规模，以及 `spec/PRD.md` 头部与 §5.9 | V0.8.0 发布后，这些位置写的是 **26 个 core 模块 / 8049 行**、**25 组**守卫、**474 项**测试、客户端 **2735 行**、`dist/client.js` **142672 字节** | **V0.9.0「Skill 验收」已在工作树落地**（2026-10-03）：`src/core/skill-profiles.mjs`（590）与 `src/core/skill-validation.mjs`（1025）已存在；`skill-view-model.mjs` 透传 `validation`；宿主 `validationFor()` 由 `/skill` 与 `/definition` 两条路由共用（**路由仍恰好 11 条**，不新增）；详情页新增「Skill 验收」卡；守卫 **26 组**；`npm test` **510 项**；客户端 **2910 行**、`dist/client.js` **150750 字节** | **本次登记（2026-10-03）**：本文件与 PRD 已按工作树重跑数字，并在 §18 / `FR-VAL-*` 里明确标注**尚未发版**（当时 `package.json` 已是 `0.9.2`、README 的版本声明也已锚到 `0.9.2`（待发布口径））。V0.8.0 的发布口径保留在各处的括注里。**已随 `0.9.2` 发布**（2026-10-03）：本批的验收卡与 §18 现在是已发布的事实 |
| D9 | 本文件 §13 前言 | 写「`scripts/verify-project.mjs`（**962 行**）」 | 实测 **1068 行** | **本次登记（2026-10-02）**：§13 前言改成不带行数的说法，行数属实测值，改代码就会过期 |
| D11 | 本文件 §0.1 D3 / §1.1 / §3 / §6.1 / §9 / §11.2 / §13 / §14 / §16.3 / §18.4 / §18.5 / §19，以及 `spec/PRD.md` | V0.9.0 工作树口径：**11 条路由**、**26 组**守卫、**510 项**测试、客户端 **2910 行**、`dist/client.js` **150750 字节**、`src/core/` **28 个模块 9671 行** | **V0.9.1「Skill Modify」已在工作树落地**（2026-10-03）：新增 `src/core/skill-modification.mjs`（592）与 `src/storage/modification-snapshot-store.mjs`（157）；宿主新增 `POST /skill-trace/modify`（**11 → 恰好 12 条**），它只把「改前」写进宿主内存、**不写任何文件**；详情页新增 `SkillModifyDialog` 与「本次修改对比」（`SkillModificationPanel`）；守卫 **27 组**（第 27 条 `SKILL_MODIFICATION_OK`）；`npm test` **553 项**（`test/*.test.mjs` 47 个）；`src/core/` **29 个模块 10263 行**、`src/storage/` **6 个 1062 行**、客户端 **3356 行**、`dist/client.js` **167506 字节**（source hash `b391ec909986207a`） | **本次登记（2026-10-03）**：本文件已按工作树重跑数字并新增 §19；`package.json` 已是 `0.9.2`、README 的版本声明也已锚到 `0.9.2`（待发布口径）、CHANGELOG 在 `## Unreleased` 里逐条登记了这三批改动（标题等发版那天再换成版本号） ⇒ **已随 `0.9.2` 发布**（2026-10-03，GitHub Release + npm，tag `v0.9.2`）。V0.9.0 与 V0.8.0 的发布口径保留在各处括注里；`docs/ARCHITECTURE.md` 的路由数尚未跟上（见 D3） |
| D12 | 本文件 §1.1 / §3.2 / §9 / §10.1 / §10.3 / §11.2 / §13 / §14 / §16.2 / §16.3 / §19.7 / §20，以及 `spec/PRD.md` 的 `FR-ORD-*` | V0.9.1 工作树口径：已安装列表按**名称 A–Z** 排列（`compareInstalledSkills` 只比 name），卡片 meta 只有名字与描述；投影白名单是 `{name, description, provider, invocation}`；**27 组**守卫、**553 项**测试、客户端 **3356 行**、`dist/client.js` **167506 字节** | **V0.9.2「已安装列表排序」已在工作树落地**（2026-10-03，需求原文见 §20）：已安装列表按**「这个 Skill 什么时候出现在本机」倒序**（规则名 `INSTALLED_ORDERING_RULE = 'added-desc-then-name'`，经 `ordering.rule` 下发），时间取**候选根下 Skill 目录的 `birthtimeMs`**（不是 mtime/ctime，也不是文件级 —— 见 §20.1）；`src/core/installed-view.mjs` **151 行**，投影新增 `addedAt` 与 `lineage`，`limitations` 新增 `added-at-unavailable` / `added-at-partial` / `lineage-unavailable`；`src/storage/skill-clone-writer.mjs` 新增只读的 `skillAddedAtByName()` 与 `skillRootCandidates()`（**424 行**）；`GET /skill-trace/catalog` 多读两处盘（都不抛错），**路由仍恰好 12 条**；客户端新增 `InstalledOrderNote` 与卡片上两条分开的事实（**只念不排**；2026-10-03 又按用户要求改成**只说例外**：默认成立的调用方式与 `filesystem` 不写、日期只到 `MM-DD`，见 §20.4 与 `FR-ORD-013`）；守卫 **28 组**（第 28 条 `INSTALLED_ORDERING_OK`）；`npm test` **561 项**；`src/core/` **29 个模块 10353 行**、`src/storage/` **6 个 1117 行**、客户端 **3448 行**、`dist/client.js` **170324 字节**（source hash `66dd0b76118e7b85`） | **本次登记（2026-10-03）**：本文件已按工作树重跑数字并新增 §20；`package.json` 已是 `0.9.2`、README 的版本声明也已锚到 `0.9.2`（待发布口径）、CHANGELOG 在 `## Unreleased` 里逐条登记了这三批改动（标题等发版那天再换成版本号） ⇒ **已随 `0.9.2` 发布**（2026-10-03，GitHub Release + npm，tag `v0.9.2`）。V0.9.1 / V0.9.0 / V0.8.0 的旧口径保留在各处括注里 |
| D13 | 本文件 §1.1 / §3.2 / §9 / §9.1 / §9.2 / §10.1 / §10.3 / §11.2 / §13 / §14 / §16.3 / §21，以及 `spec/PRD.md` §5.12 的 `FR-INST-*` | V0.9.2 发布口径：**28 组**守卫、**561 项**测试（`test/*.test.mjs` 47 个）、客户端 **3448 行**、`dist/client.js` **170324 字节**（source hash `66dd0b76118e7b85`）、`src/core/` **29 个模块 10353 行** | **V0.10.0「Skill 实例验收（Skill Instance Test）」已落地并发布**（2026-10-03 落地 / 2026-10-05 随 `0.10.0` 发布，需求原文见 `spec/PRD.md` §5.12）：新增 `src/core/skill-instance-test.mjs`（**571 行，零 `import` / 零依赖**：`buildSkillInstanceTest()` 由六个输入**确定性**生成四块结构的 Prompt 与一组观察项，导出 `INSTANCE_TEST_SOURCES`（六项输入的顺序清单）、`INSTANCE_TEST_SCOPE_ROLES`（六个范围 id → 框架角色）、`INSTANCE_TEST_GOAL_TITLE` / `INSTANCE_TEST_GOAL_TEXT` / `INSTANCE_TEST_PROMPT_TITLE`（卡面抬头）与别名 `buildInstanceTest`；签名收 `{skillName, intent, comparison, definitionText, description, framework, validation}`，回 `trace = {sources, frameworkAvailable, validationStatus, validationUnknownCount, hintedScopeId}`）；客户端新增**第 8 支 `require`** 与 `SkillModificationPanel` 里 `data-role="mod-instance"` 一整段（**14 个 `mod-instance*` data-role**，含新增的 `mod-instance-trace`）⇒ 客户端 3448 → **3625 行**、`dist/client.js` 170324 → **189256 字节**（source hash `faed5e9cef7db24c`）；`src/core/` 29 → **30 个模块**、10353 → **10924 行**；`src/storage/` **6 个 1117 行不变**；**宿主 `src/dsh/host/index.js` 1625 行不变 —— 路由仍恰好 12 条**（原计划里的 `POST /skill-trace/instance-test` 已取消，`spec/PRD.md` 的 `FR-INST-015` 记了这件事：实例验收**完全发生在客户端**）；守卫 28 → **29 组**（第 29 条 `SKILL_INSTANCE_TEST_OK`，本轮在它里面加「6b」段：意图点名**且真的改过**的范围决定主范围、回归约束按框架产出且不含被碰过的角色、`regression.source === 'framework'`、意图原文不出现在结果的 `JSON.stringify` 里、`trace.sources` 按固定顺序、diff 自己的小节标题不许出现在 `prompt.text`、源码里必须有别名导出，另加 5 条客户端 needle）；`npm test` 561 → **590 项**（`test/*.test.mjs` 47 → **48 个**：新增 `test/skill-instance-test.test.mjs` **27 例**，`test/client-render-smoke.test.mjs` 原有的实例验收用例里补断言、该文件仍 **26** 项） | **本次登记（2026-10-03）**：本文件已按工作树重跑数字并新增 §21；**已随 `0.10.0` 发布**（2026-10-05，GitHub Release + npm，tag `v0.10.0`）；旧值（561 项 / 28 组 / 3448 行 / 170324 字节 / `66dd0b76118e7b85` / 29 个模块 10353 行；V0.10.0 早期工作树为 **584 项** / **3569 行** / **184471 字节** / `2d202a05030a1d58` / **30 个模块 10774 行** / `mod-instance*` **13 个** / 测试文件 **21 例**）在各处作历史括注保留 |
| D14 | 本文件 §1.1 / §3 / §3.1 / §9 / §9.2 / §11.1 / §13 / §14 / §22，以及 `spec/PRD.md` §5.13 的 `FR-EVAL-*`、`docs/PRIVACY.md`、`docs/ARCHITECTURE.md` | V0.10.0 **发布**口径：**29 组**守卫、**590 项**测试（`test/*.test.mjs` 48 个）、客户端 **3625 行**、`dist/client.js` **189256 字节**（source hash `faed5e9cef7db24c`）、`src/core/` **30 个模块 10924 行**、`src/storage/` **6 个 1117 行**、宿主 **1625 行 / 12 条路由** | **V1.0「Skill 评测」已随 `1.0.0` 发布（2026-10-05）**（需求原文 `spec/PRD.md` §5.13，技术设计见本文件 §22）：新增 `src/core/skill-evaluation.mjs`（**565 行**，唯一 import 是单行 `./skill-instance-test.mjs`）与 `src/core/run-conditions.mjs`（**168 行**，零时钟纯函数：`readRunConditions` / `readRunCursor` / `summarizeToolActivity` / `readLoadEvidence` / `pickObservedFingerprint`）+ `src/storage/evaluation-store.mjs`（**294 行**：`cases/<hex>.json` + `runs/<hex>/<runId>.json`，`0700`/`0600`、原子 rename、深层禁字段、上限 200 / 50、删 Case 级联）⇒ `src/core/` **32 个模块 11657 行**、`src/storage/` **7 个 1411 行**；宿主新增**第 13 条路由** `POST /skill-trace/evaluation`（八个动作 `case-save` / `case-list` / `case-read` / `case-delete` / `run-save` / `run-capture` / `run-list` / `run-read`；`sessionId` 只校验**绝不落盘**；`run-capture` 的条件与事实由宿主从会话日志与收据里取，客户端只交 `judgements` 与 `outcome`）⇒ 宿主 **1844 行**；客户端新增**第 9 支 `require`**（`skill-evaluation.mjs`）与详情页「Skill 评测」卡（**30 个 `eval-*` data-role**，七段：Case / 记录运行 / 运行清单 / 两次条件 / 四段证据 / 断言与对照 / 刻意不出现的清单）⇒ **4284 行**、`dist/client.js` **228715 字节**（source hash **`54bee3888d0299d8`**）；守卫 29 → **30 组**（第 30 条 `SKILL_EVALUATION_OK`：钉住模块固定面、卡片区 30 个 data-role、**卡片区不许出现任何聚合口径**、宿主注册与隐私文档路径）；`npm test` 590 → **636 项**（48 → **52 个**文件：新增 `test/skill-evaluation.test.mjs` 17 例、`test/evaluation-route.test.mjs` 10 例、`test/evaluation-store.test.mjs` 9 例、`test/run-conditions.test.mjs` 9 例） | **本次登记（2026-10-05）**：本文件已按工作树重跑数字并新增 §22（§9.2 抬头、§9 增量段、§3.1 第 13 行、§3.2 说明、§11.1 落盘行、§11.2 第 8 条同步）；`docs/PRIVACY.md` 新增评测落盘一节；`docs/ARCHITECTURE.md` 已加 `## V1.0 — Skill Evaluation`；`CHANGELOG.md` 在 `## Unreleased` 里逐条登记。**`package.json` 已是 `1.0.0`：V1.0 已随 `1.0.0` 发布、版本号由用户定为 `1.0.0`**；验收前必须重启 DSH（这一版改了宿主半边）；旧值（590 项 / 29 组 / 3625 行 / 189256 字节 / `faed5e9cef7db24c` / 30 个模块 10924 行 / 6 个 1117 行）在各处作历史括注保留 |

---

## 1. 技术结论与分层

### 1.1 一句话架构

一个 DSH 插件包，含**两半**：

- **宿主半边**（`src/dsh/host/index.js`，1844 行）：订阅会话事件、归约出本地收据、把收据与「现读的 Skill 定义」投影成 **13 条 `GET`/`POST`/`DELETE` 路由**（全部挂在 `/skill-trace` 前缀下；第 13 条是 V1.0 的 `POST /skill-trace/evaluation`，见 §22.7）。
- **客户端半边**（`src/dsh/client/client.js`，4284 行，构建产物 `dist/client.js` 228715 字节，source hash `54bee3888d0299d8`）：一个 React 工厂闭包，注册进 DSH 的 `conversation.view` slot，只调那 13 条路由，不持有收据本体。

纯函数逻辑放在 `src/core/`（32 个模块，11657 行），落盘放在 `src/storage/`（7 个模块，1411 行）。**`src/core/` 与 `src/storage/` 都不认识 DSH 会话对象**——它们只吃普通数据结构。

### 1.2 三层模块与不可逆方向

`docs/archive/technical-design-v0.1-v0.5.md` §0 的三分法仍是当前设计（其余内容不是）：

| 层 | 目录 | 认识什么 | 不认识什么 |
|---|---|---|---|
| 定义侧 | `src/core/skill-definition.mjs`、`skill-framework.mjs`、`skill-flow.mjs`、`definition-outline.mjs`、`step-kind.mjs`、`repository-resolver.mjs` | `SKILL.md` 正文与 frontmatter、outline、仓库来源 | 会话、收据、运行证据 |
| 运行时侧 | `src/core/trace-reducer.mjs`、`runtime-events.mjs`、`runtime-evidence.mjs`、`runtime-graph.mjs`、`runtime-alignment.mjs`、`skill-runtime-scope.mjs`、`session-log.mjs` | DSH 事件、收据、运行证据 | `SKILL.md` 正文内容（只吃名字与哈希） |
| 组合侧 | `src/core/skill-view-model.mjs`、`skill-runtime-logic.mjs`、`installed-view.mjs`、`source-snapshot.mjs`、`skill-clone*.mjs`、`translation-cache.mjs`、`markdown-table.mjs`、`flow-evidence.mjs` | 两侧的**输出** | 不新增事实，只装配 |

**方向不可逆**（硬约束，守卫 `SKILL_FRAMEWORK_OK` 与 `skill-framework.mjs` 的纯函数性共同钉住）：

```
SKILL.md → Definition → Framework → 声明流程 → 运行证据只能标注它
```

- 禁止从运行证据反推框架或流程；`attachEvidenceToFlow()` 只从 flow 取 `id/order/title/kind/line/evidenceType`，其余都放进 `evidence.*`。
- 禁止为「总结 Skill 的框架」增加模型调用：`skill-framework.mjs` 是确定性纯函数。
- 声明资源 ≠ 已读取资源：没有 provenance 时界面只能说「声明引用 N 个」，`resources.loaded` 永远是 `[]`。

### 1.3 依赖与运行面

| 项 | 值 |
|---|---|
| `type` | `module`（包根）；`src/dsh/client/` 由同目录 `package.json` 覆写成 `commonjs` |
| `main` | `src/dsh/host/index.js` |
| `exports` | `{".":"./src/dsh/host/index.js","./client":"./dist/client.js","./cordis.patch.yml":"./cordis.patch.yml","./package.json":"./package.json"}` |
| `files` | `["src","cordis.patch.yml","README.md","package.json","dist"]` |
| `dsh.bundle.patch` | `./cordis.patch.yml`（bundle 声明：`- insert:` / `- id: dsh-skill-trace`） |
| `dsh.client.platform` | `web` |
| `dsh.client.inject` | `["@deepseek-ai/dsh-client-runtime","@deepseek-ai/dsh-client-ui-conversation","@deepseek-ai/dsh-client-locale"]` |
| `engines.node` | `>=22.19` |
| `dependencies` | **空**（硬约束：新增运行时依赖会被守卫拒绝；`elkjs` / `@xyflow/react` / `mermaid` / `marked` / `d3` 等点名拒绝） |
| `devDependencies` | 只有 `esbuild` |
| `peerDependencies` | `@deepseek-ai/dsh-llm`，**可选**，只用于中文阅读版 |

`dist/client.js` 是**提交进仓库的发布产物**，不是构建缓存；守卫 `CLIENT_BUNDLE_CONTRACT_OK` 调 `builder.shippedBundleIsFresh()`，旧了就报：

```
dist/client.js is stale or missing — run `npm run build:client` and commit the result
```

---

## 2. 运行架构

### 2.1 宿主注册与生命周期

```js
export function apply(ctx, config = {}) {
  ctx.inject(['webServer', 'sessions', 'agents'], (webCtx) => { … })
}
```

- `config.dataRoot` 决定落盘根；三个 store 在注入回调里构造：`createReceiptStore(join(dataRoot,'receipts'))`、`createPreferenceStore(dataRoot)`、`createTranslationStore(join(dataRoot,'translations'))`。
- 注册一个**前缀路由**：`{ kind: 'prefix', path: '/skill-trace', handler }`，由 `webCtx.effect(() => { const unregister = webCtx.webServer.register(route); … })` 管理；卸载回调 `unregister()` → `await pruneTask` → `await Promise.allSettled([...queues.values()])` → `queues.clear()` / `cache.clear()`。
- 启动与卸载各打一行日志：`[dsh-skill-trace] host ready` / `[dsh-skill-trace] host disposed`。
- 后台任务：`pruneTask = store.prune(shouldPersistReceipt)` 在注册时启动，卸载时被等待。

**访问边界**：每个请求先过 `isLoopbackAddress(req.socket?.remoteAddress)`（去 `::ffff:` 前缀后必须是 `127.0.0.1` / `::1` / `localhost`），否则

```json
403 { "ok": false, "error": "仅允许本机访问" }
```

**并发模型**：`createSessionMutationQueue()` 提供按 `sessionId` 串行的 `enqueue(sessionId, work)`，加一个全局 `runMaintenance(work)` 屏障。所有会读/写收据的路径都走 `enqueue`，避免同一会话的两个请求写出两份收据。

**错误收敛**（catch-all，`1085-1089` 行）：把 `error.message` 按固定模式分类，

```
/必填|无效|不能为空|只允许|过大|超限|不受支持|不一致|合法 JSON|状态无效|学习笔记|验证结果|实际观察|成功加载|本地收据不存在|重复会话|输出引用不存在/
```

命中 → **400** `{ok:false, error}`，否则 → **500** `{ok:false, error}`。未匹配任何路由的路径 → **404** `{ok:false, error:'not found'}`。

> 这是「所有『读不到』都必须说人话」的实现面：错误消息是给用户看的中文句子，不是错误码；分类只决定 HTTP 状态，不改写消息。

### 2.2 客户端注册与打包

- `src/dsh/client/client.js` 是**手写 CommonJS**（`const React = require('react')`），文件头注释明写：**绝不要把 `exports['./client']` 指向这个文件**，浏览器跑的是构建产物。
- `scripts/build-client.mjs`（174 行）用 esbuild 打包成 `dist/client.js`，并包成 `window.__ModuleLoader__.load({ id, factory })`；除 platform seed 之外的依赖全部内联。
- `CLIENT_SEED_MODULES` 必须包含 `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`；守卫还要求 `externalRequiresOf(bundle)` 全部落在这个集合里，否则浏览器重启后 externals 会漂移。
- 打包时机：`scripts.pretest` 与 `scripts.build` 都是 `node scripts/build-client.mjs`，因此 `npm test` 会自动重建。
- 客户端注册 `conversation.view` slot 与 locale 命名空间 `dsh-skill-trace`（静态键走 `zh`/`en` 字典，动态模板走显式 locale 分支）；slot 的 `label` 就是 DSH 会话里的**短显示名**，读「Skill 洞察 / Skill Insight」——产品品牌 DSH Skill 智能实验室 / DSH Skill Intelligence 留在文档层与包描述层，不进这个高频入口。

### 2.3 修改后必须做什么（两条硬约束）

| 改了哪一侧 | 生效条件 | 原因 |
|---|---|---|
| `src/dsh/host/index.js` 或任何 `src/core/*.mjs` | **必须重启 DSH** | 宿主把模块读进内存后不会自动换；不重启打接口得到的是**旧答案**，而且它答得很正常、不报错。探针：`curl -s "http://127.0.0.1:3080/skill-trace/catalog?sessionId=probe"` |
| `src/dsh/client/client.js` | **硬刷新浏览器** | 浏览器跑 `dist/client.js`，插件本身不缓存 |

另外，宿主启动时只解析 `package.json` 的 `exports['./client']` 记下**路径字符串**，浏览器请求时才读该路径当时的内容 ⇒ 插件在宿主运行期间换版后必须立即重启，否则插件界面会静默消失（外壳发出一个没人注册的模块）。

---

## 3. 宿主接口面（13 条路由；第 13 条是 V1.0 新增的 `POST /skill-trace/evaluation`，见 §22.7）

全部在 `src/dsh/host/index.js`，全部挂在 `/skill-trace` 前缀下，全部先过 §2.1 的 loopback 门禁。

### 3.1 路由总表

| # | 方法 | 路径 | 会话作用域 | 入参 | 返回要点 |
|---|---|---|---|---|---|
| 1 | `GET` | `/skill-trace/context` | **需要 `sessionId`** | query `sessionId` | 收据公共投影 + `preferences` + `views`（view models） |
| 2 | `GET` | `/skill-trace/definition` | **需要 `sessionId`** | query `sessionId`、`skillName` | `definition`（现读正文/outline/repository/指纹）+ `observation`（与运行比对） |
| 3 | `POST` | `/skill-trace/translate` | **需要 `sessionId`**（body） | body `sessionId`、`skillName`、`sourceSha256`、可选 `targetLanguage` | 译文 + `preserved` + `chunkCount` + `fallbackChunks` + `fallbackReasons` + `saved` |
| 4 | `GET` | `/skill-trace/catalog` | **需要 `sessionId`**（只用来解析 registry） | query `sessionId`、可选 `query` | `installed` 投影（**不读收据**） |
| 5 | `GET` | `/skill-trace/skills` | **需要 `sessionId`** | query `sessionId` | `list`：本次会话加载过的 Skill |
| 6 | `GET` | `/skill-trace/skill` | **需要 `sessionId`** | query `sessionId`、`skillName` | `list` + `skill`（详情模型） |
| 7 | `POST` | `/skill-trace/preferences` | **不要 `sessionId`** | body `defaultView` ∈ `['current','installed']` | `preferences` |
| 8 | `GET` | `/skill-trace/translation` | **不要 `sessionId`** | query `skillName`、`sourceSha256`、可选 `targetLanguage` | 已存的阅读版，否则 `translation: null` |
| 9 | `DELETE` | `/skill-trace/translation` | **不要 `sessionId`** | 同 8 | `deleted: boolean` |
| 10 | `POST` | `/skill-trace/clone` | **需要 `sessionId`**（body，用来解析 registry） | body 见 §8.2 | 复刻结果 + `verified` + `discovered` + `limitations` |
| 11 | `GET` | `/skill-trace/diff` | **需要 `sessionId`**（只用来解析 registry 与 `cwd`） | query `sessionId`、`skillName`（目标）、可选 `against`（来源名，缺省取血缘里的来源） | `lineage` 摘要 + `source` / `target` 两侧可用性与指纹 + `comparison` + `structure` / `content` / `resources` 三层差异。**不含绝对路径**；正文本就是详情页已有的可见内容，这里只多返回「哪几行变了」 |
| 12 | `POST` | `/skill-trace/modify` | **需要 `sessionId`**（body；决定「改前」快照存进哪个会话、以及把那条消息代发给哪个会话的 Agent） | body `sessionId`、`skillName`、`action` ∈ `['begin','compare']`、`intent`（`begin` 必填，≤ 2000 字）、可选 `scopes`、可选 `profiles` | `begin`：把「改前」（整份正文 + 目录清单 + 来源指纹）记进**宿主内存快照**，再用当前会话的 `agent.followup()` 代发一条消息（`source.kind = 'skill-intelligence-modify'`）；`compare`：三态结论 + 行级 / 小节级 / 资源级变化 + 超出授权范围的变化 + 来源指纹对比，**并释放快照**，同一响应里带上与 `/skill` 同源的 `validation` |
| 13 | `POST` | `/skill-trace/evaluation` | **需要 `sessionId`**（只用来校验请求来自哪个会话，**一个字节都不落盘**） | body `sessionId`、`action` ∈ `['case-save','case-list','case-read','case-delete','run-save','run-capture','run-list','run-read']`；其余字段随 `action` | `case-save`：`caseId = sha256(hashInput)` 由**宿主**算，与送来的 `caseId` 不一致就拒绝；`case-read` 回 `{case, runs, warningCount}`；`run-save` 用 `normalizeEvaluationRun` 把缺项降级成 `unavailable`，`runId` 缺省由宿主生成；`case-delete` 连运行一起删 |

**会话作用域的三条判据**（v0.7 新增路由为什么这样定）：

1. `GET`/`DELETE /skill-trace/translation` **刻意不带 `sessionId`**：中文阅读版是按内容键的资产，不是某次会话的产物；把会话放进请求里既让缓存无法复用，又暗示了错误的生命周期。
2. `/skill-trace/catalog` 虽然要 `sessionId`，但只用它解析 registry（`registryContext`），与「本次会话发生过什么」无关。
3. `/skill-trace/clone` 的 `sessionId` 只用于解析 registry 与 `cwd`，复刻本身**不挂到这次会话**（响应里 `clone-is-not-attached-to-this-session`）。
4. `/skill-trace/diff` 的 `sessionId` 同样只用于 `registryContext` 解析两侧 Skill 的目录：**差异是文件系统两侧的事实，与「本次会话发生过什么」无关**。也正因如此，血缘与演进**不单独开路由**——它们是 Skill 详情的基础事实，随 `/skill-trace/skill` 一起返回；只有真正的重计算（两侧解析 + 行级差异 + 资源遍历）才值得一条独立路由（`FR-EVO-020`）。

### 3.2 逐条说明

**1. `GET /skill-trace/context`** —— 唯一同时给 `preferences` 与收据投影的路由；一级页面的默认视图选择由它开场。

```js
const [receipt, preferences] = await Promise.all([
  enqueue(sessionId, async () => syncReceipt(await refreshFromLiveSession(sessionId))),
  preferenceStore.read(),
])
// → { ok, sessionId, workspaceLabel, preferences, receipt: publicReceipt(receipt), views: buildViewModels(receipt) }
```

`workspaceLabel` = 活跃会话 `header.cwd` 的 basename；会话不在内存里时是 `'工作区未连接'`（不是 `null`，也不是空串）。

**2. `GET /skill-trace/definition`** —— `buildSkillDefinitionView(registry, skillName, {cwd, scope: liveAgent, now: Date.now()})`，再 `enqueue(sessionId, () => receiptForRuntime(sessionId))`：

```js
// → { ok, sessionId, workspaceLabel, definition,
//     observation: compareDefinitionToRun(receipt, skillName, definition) }
```

正文**现读现返，永不写进收据**：`receiptForRuntime` 只取运行记录过的内容（哈希、加载事实、已发布 catalog），从不取正文。`definition` 不可用**不是错误**，而是 `available: false` + 原因，界面渲染成可见的不可用态。

**3. `POST /skill-trace/translate`**（分段与落盘细节见 §7）—— 入参 `requiredSessionId(body.sessionId)` / `requiredSkillName(body.skillName)` / `body.sourceSha256` 非空（否则 `'sourceSha256 必填'` → 400）；`targetLanguage` 空则 `DEFAULT_TRANSLATION_LANGUAGE`，否则 `.trim().slice(0, 40)`。状态码闭集：

| 状态 | `code` | `error` | 触发 |
|---|---|---|---|
| 422 | `TRANSLATION_ERROR.DEFINITION_UNAVAILABLE` | `无法读取这个 Skill 的定义。` | `definition.available === false` |
| 409 | `TRANSLATION_ERROR.DEFINITION_CHANGED` | `Skill 内容已变化，请重新翻译。` | 指纹既非 full match，也非「截断且 `returnedSha256` 相等」 |
| 429 | `TRANSLATION_ERROR.MODEL_BUSY` | `当前没有可用的模型服务，稍后再试。` | 无 `llm.stream` 或 `agentDefaultModel.currentSelection()` 缺 provider/model |
| 500 | `TRANSLATION_ERROR.TRANSLATION_FAILED` | `翻译失败，可以重试。` | 翻译过程抛错 |
| 502 | `TRANSLATION_ERROR.TRANSLATION_FAILED` | `这份翻译改动了文档结构，已丢弃。可以重试。` + `violations: [...rule]` | `inspectTranslation` 不通过 |

指纹规则是硬规则：**绝不接受「没有 hash 就当同一个」**；正文过长时客户端可能拿到截断段的哈希，因此「full match」与「truncated 且 `returnedSha256` 相等」两种都认。

**4. `GET /skill-trace/catalog`** —— `registry && liveAgent ? await buildCatalogSnapshot(registry, cwd, liveAgent) : null`，再 `installed: buildInstalledView({catalogSnapshot, query, addedAtByName: await skillAddedAtByName({ names: (Array.isArray(catalogSnapshot?.skills) ? catalogSnapshot.skills : []).map((skill) => skill?.name), roots: await skillRootCandidates({ cwd }) }), lineageByName: await lineageByTargetName()})`（V0.9.2，§20：`addedAtByName` 与 `lineageByName` 各是一次**只读**读盘，两处都不抛错）。**不读收据**，也不把学习状态带回来。发现不完整是**事实**：`buildCatalogSnapshot` 把 registry 抛错与并发改动收敛成 status，`buildInstalledView` 再把它写成 `coverage`（`complete` / `incomplete` / `unknown`）。`query` 经 `optionalSearchQuery`（≤500 且无控制字符，否则 `'searchQuery 无效'`）。同一响应里还有 `ordering: { rule, addedAtKnown, addedAtUnknown }`（按**整个目录**计数，换搜索词不变）与 V0.9.2 的三个新限制码（§20.3）；读不到就是读不到（`addedAt: null` / `lineage: null` + 限制码），**绝不拿别的时钟顶替，也绝不把「没读过」说成「没复刻过」**。

**5. `GET /skill-trace/skills`** —— `buildSkillListLookup(registry, receipt, cwd, liveAgent)` → `{ok, sessionId, workspaceLabel, list: buildSessionSkillList(receipt, {lookup})}`。registry 只对**收据里已出现过的名字**查询（registry 能发现但本次会话没加载的 Skill 不会漏进列表），次数上界 `SKILL_LIST_LOOKUP_LIMIT = 50`，失败降级为状态 —— 「丢掉了描述的列表仍然是一个诚实的列表」。列表**必须嵌在 `list` 字段**里，客户端对应地用 `body?.list ?? null` 解包；这一对字面由守卫成对钉住。

**6. `GET /skill-trace/skill`** —— 和 `definition` 一样现读正文，并 `list.skills.find((entry) => entry.name === skillName) ?? null` 取 `listEntry`：

```js
// → { ok, sessionId, workspaceLabel, list, skill: buildSkillDetail({ receipt, view: definition, skillName, listEntry }) }
```

`list` 随详情一起返回，是为了让返回键知道「用户是从哪个列表进来的」。

V0.8 起 `skill` 里多一个 `lineage` 字段（见 §17）：这个 Skill 是不是**由本插件复刻出来的**、从谁来、复刻模式与时间、来源内容有没有变化。**它不新增路由**。`lineage: null` 表示「没有血缘记录」——这既包括「手动复制的」，也包括「用户自己新建的」；两者在事实上是同一件事：**本插件没有执行过这次复刻**（`FR-EVO-001`）。

**7. `POST /skill-trace/preferences`** —— `defaultView` 必须 ∈ `['current','installed']`（与 `DEFAULT_VIEWS` 一致），否则 `throw new Error('defaultView 无效')`；写盘时 `normalizeChosen` 一律盖章 `PREFERENCES_VERSION = 3`。**不需要 `sessionId`**：默认一级页面是机器级偏好。客户端侧有对应的 `const PREFERENCE_VERSION = 3`，守卫 `PREFERENCE_VERSION_OK` 要求两处数字相等。

**8/9. `GET` / `DELETE /skill-trace/translation`** —— 三个字段：`requiredSkillName(skillName)` + `requiredSourceSha256(sourceSha256)` + `optionalTargetLanguage(...)`。

```js
// GET    → { ok, skillName, sourceSha256, targetLanguage,
//            translation: record ? {translation, chunkCount, fallbackChunks, fallbackReasons,
//                                    model, truncated, savedAt: record.updatedAt} : null }
// DELETE → 先 read 记 existing，再 delete → { ok, …, deleted: Boolean(existing) }
```

**精确到三个字段**：没有「清空这个 Skill 的所有译文」这种模糊删除。

**10. `POST /skill-trace/clone`** —— `const outcome = await handleClone(await readBody(req)); sendJson(res, outcome.status, outcome.body)`；校验顺序、错误码与成功响应见 §8。

**11. `GET /skill-trace/diff`** —— 唯一新增的路由（§17.4）。`requiredSessionId` + `requiredSkillName` + 可选 `against`（缺省从血缘记录里取 `sourceSkillName`）。

```js
// → { ok, sessionId, skillName, against,
//     lineage: { lineageId, sourceSkillName, sourceSourceSha256, targetSkillName, cloneMode,
//                targetScope, catalogObservation, createdAt, updatedAt } | null,
//     comparison: { status: 'unchanged' | 'changed' | 'unavailable',
//                   source: { skillName, available, reason, originalSha256, currentSha256, changed },
//                   target: { skillName, available, reason, currentSha256 },
//                   limitations: [...] },
//     structure: { status, counts: {added, removed, modified, unchanged}, sectionCount,
//                  sections: [{ title, level, role, status, changed: [...shapeFields], anchorId,
//                               side, sourceLine, targetLine }] },
//     content:   { status, counts, sections: [{ title, status, anchorId, side, sourceLine,
//                                              targetLine, sourceLineCount, targetLineCount,
//                                              lines: [{kind, text, sourceLine, targetLine}],
//                                              linesTruncated }], limitations: [...] },
//     resources: { status, mode: 'bundle' | 'skill-md' | null, counts,
//                  entries: [{ path, status, sourceSha256, targetSha256 }] } }
```

三条硬约束之外的**状态码分界**（实测，`FR-EVO-013`）：

- **目标侧读不到** → `404 unknown-skill`：「找不到 Skill「…」，它可能已经被删除或改名。」+ `reason`。比较的一方没了，这不是一次可以作答的请求。
- **来源侧读不到** → **`200`** 且 `comparison.status = 'unavailable'`、三层全部 `unavailable`、`source.changed = null`、`limitations` 含 `source-unavailable`。请求本身是成立的：用户问的问题有答案，答案是「读不到来源」。
- **源在复刻之后又改过** → **仍然是 `200`**，`comparison.source.changed = true`、`originalSha256` 与 `currentSha256` 并列给出。**这条路径里没有 409**：复刻遇到源变了要拒绝（拒绝的是「把一个混合体落盘」），而差异什么都不写，源动过恰好是它要报告的那件事。两者共用「来源变了」这句话，但意思相反 —— 所以 `DIFF_ERROR` 与 `CLONE_ERROR` 是两套码。
- **没有血缘可依** → `404 no-lineage`：「这个 Skill 不是由本插件复刻出来的，没有可以比较的来源。」

三条硬约束：

1. **只在两侧都真的读到时才算差异**；任一侧读不到 → `comparison.status = 'unavailable'` 并把原因说清楚，**不许退化成「没有变化」**（`FR-EVO-015`）。
2. **不返回绝对路径**：资源差异只给相对于 Skill 目录的路径（`references/tokens.md`），范围只说「当前项目 Skill」/「用户级 Skill」（`FR-EVO-019`）。
3. **`mode` 必须跟着资源差异一起回**：`skill-md` 复刻出来的副本本来就只有 `SKILL.md`，来源的其它资源不在本地是**复刻方式决定的**，不是用户删的（`FR-EVO-016`）。

**12. `POST /skill-trace/modify`** —— 唯一一条由插件**代发消息**的路由（设计见 §19）。两种动作：

- **`begin`**：读整份 `SKILL.md`（含 frontmatter，走 §18.4 的 `readSkillFile()`）+ 目录清单 + 血缘里的来源指纹 → **只存进宿主内存的快照库**（`src/storage/modification-snapshot-store.mjs`：TTL 30 分钟、上限 32 份、键 = `modificationSnapshotKey({sessionId, skillName})`）→ 用**当前会话的 live Agent** `liveAgent.followup(message)` 代发**一条**消息。消息是 `{id: randomUUID(), role: 'user', content: [{type:'text', text}], source: {kind: MODIFICATION_SOURCE_KIND}}`，`MODIFICATION_SOURCE_KIND = 'skill-intelligence-modify'`（自定义 source kind，让它在运行记录里可识别）。**不发第二条、不轮询、不解析 Agent 的回复。**
- **`compare`**：把内存里那份「改前」与**重新读到的现状**交给纯函数 `diffSkillModification()`（`src/core/skill-modification.mjs`）→ 三态 `unchanged | changed | unavailable` + 行级 / 小节级 / 资源级变化 + 超出授权范围的变化 + 来源指纹对比 → **然后 `modificationStore.release()` 释放快照**（这份「改前」没有理由比这次修改活得更久）。同一个响应里带上与 `GET /skill-trace/skill` / `GET /skill-trace/definition` **同源**的 `validation`：复用 `validationFor()` 并把刚读到的 definition view 传下去，**同一次请求不读两遍 `SKILL.md`**（§18.4）。响应体是 `{ok, sessionId, skillName, action, released, comparison, validation}`。

**错误码闭集**（`code` 字段，每条失败路径有自己的状态码）：

| 状态 | `code` | 触发 |
|---|---|---|
| 400 | `invalid-request` | `requiredSessionId` / `requiredSkillName` 不通过 |
| 400 | `missing-intent` | `begin` 而 `intent` 为空（`请先写一句你希望这个 Skill 怎么改。`） |
| 404 | `unknown-skill` | 定义视图 `available === false` |
| 409 | `session-not-live` | 会话里没有正在运行的 Agent，或它没有 `followup` |
| 422 | `skill-file-unreadable` | `SKILL.md` 读不出来 |
| 500 | `registry-unavailable` | 宿主没有挂载 Skill 注册表 |
| 500 | `snapshot-failed` | 没能把「改前」记进内存 —— 这时**也不会把修改任务发出去** |
| 500 | `dispatch-failed` | `followup()` 抛错 —— **先释放刚存下的快照再回 500**，不能留着一份「改前」而任务根本没出去 |

**内存快照的四条硬边界**：**不写盘、不进收据、不进会话日志、重启即消失**。它不是持久资产，也不是「版本」—— 本版没有版本实体、没有版本号、没有历史时间线（§19 的「不做」清单）。

**它不是插件在改文件。** 这条路由里没有任何 `writeFile` / `ctx.fs.write`：插件只把「用户的原话 + 结构化后的修改范围 + 验收目标 + Modification Contract」交给当前会话的 Agent，真正的修改由 Agent 用 DSH 原生文件工具、在 DSH 权限下完成。用户点「交给 Agent」这个动作本身就是授权。消息里另有一句要求 Agent **动手之前先说明打算怎么改、拿不准就用提问工具问用户**（见 §19.5）：于是「提出方案 → 用户确认 → 动手」发生在原生对话里 —— 插件只提这个要求，不代办，也不解析它的方案。

**V0.10.0 不新增任何路由**（仍 **12 条**）：Skill 实例验收**完全发生在客户端** —— 生成器就是客户端**第 8 支 `require`** 的 `src/core/skill-instance-test.mjs`（**571 行**、零依赖、零 `import`、不读时间、不掷骰子），宿主既不参与生成也不参与判定。原设计里的 `POST /skill-trace/instance-test` 已取消（`spec/PRD.md` 的 `FR-INST-015` 记了这件事，见 §21.7），`src/dsh/host/index.js` 因此**一行未动**（仍 **1625 行**）。§3.1 的路由表因此**一字未变**。

**13. `POST /skill-trace/evaluation`（V1.0，§22.7）** —— 评测的落盘面。它只做四件事：算身份、落盘、读回来、按 `caseId` 精确删除。**不建会话、不发消息、不调模型、不判定**（`FR-EVAL-015`）：跑不跑由用户在自己的会话里决定，插件只负责把那次运行的条件、`unavailable` 与用户自己的判定记下来。`sessionId` 必须校验，但**一个字节都不落盘** —— 实验的身份是 `caseId`（`sha256(hashInput)`），不是会话（`FR-EVAL-016`）。写盘失败时返回 500 与一句人话：页面上的内容还在，重启 DSH 之后不会留下它。

### 3.3 请求与响应的公共约定

- 响应头由 `sendJson` 统一写：`content-type: application/json; charset=utf-8`、`content-length`、`cache-control: no-store`、`x-content-type-options: nosniff`。
- 请求体由 `readBody(req, maxBytes = 32 * 1024)` 读；超限 `'请求体过大'`，非 JSON `'请求体不是合法 JSON'`。
- 校验器抛 `RequestError`（`status` 随对象走，默认 400）。**消息必须是给人看的完整句子** ——
  `sendJson` 直接把它当 `error` 发给界面，所以这里不许出现裸字段名（§7「所有『读不到』都必须说人话」）：
  - `requiredSessionId`：非空字符串且 ≤ 240 字符 → 「这次请求没有带上会话标识，无法确认它属于哪个会话。请刷新页面后重试；如果刷新无效，请重启 DSH。」
  - `requiredSkillName`：`/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/` → 「这次请求没有带上合法的 Skill 名，无法定位 Skill。请刷新页面后重试。」
  - `requiredSourceSha256`：`/^sha256:[a-f0-9]{64}$/` → 「这次请求没有带上合法的正文指纹，无法确认译文对应的是哪一版正文。请刷新页面后重试。」
  - `optionalTargetLanguage`：空 → `DEFAULT_TRANSLATION_LANGUAGE`，否则 `.slice(0,40)`。
  - `optionalSearchQuery`：≤ 500 且无控制字符，错误 `'searchQuery 无效'`。
  - `optionalEntryId`（`src/dsh/host/index.js:203`）：**当前是死代码** —— 只定义、零调用点。
    它校验的 `entryId` 属于 v0.6 已删除的页面入口。
- 400 / 500 的分流是 `error instanceof RequestError ? error.status : 猜词正则`。那条正则
  （`必填|无效|不能为空|…`）只服务还没改成 `RequestError` 的旧错误，**不要再往里加词**：
  靠猜消息决定状态码，正是「校验消息被迫写成字段名」的成因（见 `CHANGELOG.md` 的 `### Fixed`）。
- **请求体是双边的合同**：客户端发出去的字段必须覆盖宿主读的字段。这条缝曾经没人盯 ——
  `POST /skill-trace/clone` 的客户端请求体漏了 `sessionId`，于是从 v0.7.0 起那个按钮每一次都只换回
  一句裸字段名，而两边各自的测试都是绿的（路由测试自己填了 `sessionId`；渲染测试只看渲染出来的文案）。
  现在两道守卫都从**源码**读合同：一条扫 `src/dsh/host/index.js` 里真正被读的 `payload.*` 并要求
  客户端发出去的请求体覆盖它们；另一条要求「组件解构出来、又没有兜底的 prop，渲染处必须真的传」。
- 收据**永不出宿主**：`publicReceipt(receipt)` 是白名单投影，字段闭集为

```
schemaVersion, receiptId, sessionId, createdAt, updatedAt, coverage, activity,
traceEvents[…], sourceSnapshots, runtimeEvents, runtimeEventOverflow,
catalogPublished, catalogPublicationCount, lineage, outputReferences,
learningNotes, validationResults, continuity
```

`traceEvents[]` 的投影再收一层：`eventId, sessionId, turn, step, skillName, status, invocationType, callId, callSeq, resultSeq, requestedAt, resolvedAt, consumer, consumerIdentity, coverage, errorCode, evidenceFingerprint, continuityCandidate, runtimeIdentity`。

> ⚠️ **`lineage` 这个词在这个仓库里有两个互不相关的意思**，读到它时先分清：
>
> - **上面那张表里的 `lineage`（会话血统）**：收据里的 `{ parentSessionId, delegationDepth }`，来自 DSH 会话头部这条**持久事实**，由 `src/core/trace-reducer.mjs` 的 `normalizeLineage` / `setRuntimeLineage` 维护（`src/dsh/host/index.js:255`、`src/core/runtime-graph.mjs:294` 也会读）。它回答「这个会话是不是某个会话的子会话」。
> - **V0.8 的「Skill 复刻血缘」（§17）**：`<dataRoot>/lineage/` 里的本地记录，回答「这个 Skill 是从哪个 Skill 复刻出来的」。
>
> 两者**不得互相读写、不得共用字段名、不得互相解释**（`FR-EVO-008`）。会话血统留在收据里；**复刻血缘永不进收据** —— 它是跨会话的资产关系，不属于任何一次会话。

---

## 4. 数据流：事件 → 收据 → 视图

### 4.1 观测面

宿主只订阅两类东西：

```js
const OBSERVED_EVENT_TYPES = new Set([
  'turn/start', 'step/start', 'step/end', 'turn/end',
  'tool/call', 'tool/result', 'user/message', 'subagent/catalog',
])
```

- **`session/event`**：每条事件走 `reduceSessionEvent(current, event)`；若 `tool/result` 能对上一条 `status === 'loaded'` 的 trace，追加一次 `captureRuntimeIdentity(receipt, sessionId, [loaded])`；然后 `withLineage`、更新内存 `cache`。
- **`session/flush`**：`rebuildReceipt(sessionId, sessionEventLog(session), previous)`，只对**新增**的 loaded trace 重新 `captureRuntimeIdentity`。

`sessionEventLog(session)` 的回退链是 `session.snapshotEvents()` → `session.events` → `[]`。事件日志恢复还覆盖重启场景：`src/core/session-log.mjs` 从 `~/.dsh/sessions/<workspace>/<sessionId>/session.vN.jsonl*` 读取历史，其中 `decompressZstdFrames` / `findZstdFrameStarts` 处理「Node 的 zstd 只解第一个 frame」这一事实（多 frame 是会话日志的常态，不是异常）。`sessionId.includes('/')` 一律拒绝，堵住路径穿越。

### 4.2 写盘门禁

```js
export function skillEvidenceSignature(receipt) {
  return `${traces.length}|${settled}|${receipt?.catalogPublicationCount ?? 0}|${receipt?.catalogPublished?.seq ?? ''}`
}
```

- `skillEvidenceGained = carriesSkillEvidence(event) || skillEvidenceSignature(receipt) !== previousSkillEvidence`
- 只有当 `event.type === 'turn/end' || skillEvidenceGained` 时才 `await syncReceipt(receipt)`。

这是**写策略**的核心：Skill 证据（新开的 load、已结算的 load、发布或替换的 catalog）由签名门禁、观察到即写；运行事件流不即时写 —— 它可以从耐久的会话日志在 turn 边界重建，所以只在 turn 边界持久化。持久化与否还过一道 `shouldPersistReceipt(receipt)`：`traceEvents` / `outputReferences` / `learningNotes` / `validationResults` 任一非空才值得落盘。

### 4.3 从收据到视图

```
session 事件 ──reduce──▶ 收据（内存 + 落盘）──┬─▶ publicReceipt()  ──▶ 客户端「事实」列
                                            ├─▶ buildViewModels() ──▶ views（列表/概览）
                                            ├─▶ buildSkillDefinitionView() ──▶ definition（现读）
                                            ├─▶ compareDefinitionToRun()  ──▶ observation（指纹比对）
                                            ├─▶ buildSkillRuntimeLogic()  ──▶ 本次运行逻辑五段
                                            └─▶ buildAlignment()          ──▶ 步骤证据
```

收据本身**没有自己的页面**：它是证据层，只通过上面这些投影被看见。

---

## 5. 证据模型与关联

### 5.1 一次 Skill 加载如何被记下来

- **配对**：`tool/call` 与它成功的 `tool/result` 成对出现，才记为一次 requested-successful load。
- **两种会话格式**：V3 把工具结果包在 `user` message 的 `tool-result` block 里；V4 把它提升为一等 `tool` message（`content` / `toolCallId` / `isError` 落在 message 上）。**只认 V3 会让每个 V4 结果看起来是空的，而记录仍然写 `loaded`** —— 这正是 `test/session-format-v4-contract.test.mjs` 同时钉两种写法的原因，也是「钉事件形状优先用真实捕获的事件而不是手写 fixture」这条纪律的由来。
- **两条加载路径**，都记 `invocationType`：
  - `model-invoked`：模型调用 `skill` 工具；
  - `user-explicit`：用户在对话里写 `/name`，事件是 `user/message` 且 `source.kind === 'skill-invocation'`，没有 `skill` 工具调用。
  DSH 对这两条路径渲染同一个 `<skill_content>` 形状；插件**不发 `implicit`**。
- **归属用游标不用时间戳**：`user/message` 自身没有 turn/step，靠同一日志里最近见过的 `turn/start` / `step/start` 归属。日志顺序是唯一依据。
- **能力上界**：load 记录只证明「这一次调用被请求过、并结算了」，**不升级为遵循度、因果、正确性、有用性证明**。

### 5.2 运行事件模型（`src/core/runtime-events.mjs`）

```
RuntimeEvent = { eventId, seq, timestamp, type, source, status, turn, step,
                 invocationId, capabilityId, capabilityName, detail, errorCode, rule }
```

- `source ∈ ['dsh','derived']`：`dsh` 是宿主事实，`derived` 是插件派生。派生事件只追加、不改写、**不能引用规则就不发**；唯一规则是 `RETRY_RULE = 'same-turn-repeat-after-failure'`。
- `capabilityId ∈ ['skill','tool','cli','mcp','subagent']`（`CAPABILITY_KINDS`），分类是确定性的：`mcp__<server>__<rawName>` → MCP，`bash`/`pwsh` → CLI，`subagent` → Subagent，其余 → Tool。标识符过长**直接拒绝**，不截断成另一个看起来合法的名字（`RUNTIME_EVENT_NAME_MAX = 128`、`RUNTIME_EVENT_CALL_ID_MAX = 240`）。
- `status ∈ ['requested','success','failure','unknown']`；`success` 只表示调用**已结算**，不表示结果正确。
- **绝不发明半个调用**：严格按 `invocationId` 配对，绝不使用「时间相邻」；只有请求 → `unresolved-request`，只有结果 → `orphan-result`。
- `evidenceState`：`observed` 需要请求**且**成功结果；`partial` 是失败或半观测；`requested` 是半观测。
- 事件词表是 `invocation.request` / `invocation.result` / `skill.invocation` / `retry`，**不是按能力的 request/result** —— DSH 的 `tool/result` 不带工具名，结果事件不能断言自己属于哪个能力。
- 保留最近 `RUNTIME_EVENT_LIMIT = 2000` 条，被丢弃的数量记进 `runtimeEventOverflow`。
- **工具参数与结果内容从不读取**（`runtime-evidence.mjs` 是唯一接缝，只做参数分类与文件目标识别；`reduceRuntimeCall` 的函数体不得出现 `arguments` 或 `content`，守卫 `SOURCE_PRIVACY_FIELDS_OK` 钉住）。

### 5.3 关联与溯源（`src/core/runtime-graph.mjs`）

最高规则：**图完整性 < 图真实性**（`Graph completeness < Graph truthfulness`）。每条边必须引用收据仍持有的至少一个事件，否则丢弃并计入 `droppedEdgeCount`。

| 优先级 | 依据 | 派生 | 状态 |
|---|---|---|---|
| P0 | runtime-native：`invocationId`（`callId`）、`subagent/catalog.childId`、`turn`/`step` | `direct` | `observed` |
| P1 | 结构化宿主字段 | `correlated` | — |
| P2 | 包含关系：session → turn → invocation（结构，不是因果） | `direct` | `observed` |
| P3 | 有界规则 | `candidate` | — |
| P4 | 无可用依据 | —（`unlinked`） | `unknown` |

- 唯一的启发式是「一个 step 内相邻的两次 invocation」，规则名 `FOLLOWS_RULE = 'same-step-adjacent-invocation'`，状态 `candidate`。
- `subagent/catalog` 是父方直接子目录，所以子节点是观察到的；catalog 的自由文本 `label` **刻意不读**。
- 只有该 turn 内恰好有一次 subagent invocation 时，才把子节点归给创建它的那次调用（`SPAWN_ATTRIBUTION_RULE = 'sole-subagent-invocation-in-turn'`）；两个并发 spawn 时子节点只归给会话，节点状态 `partial`。
- 词表封闭：`EDGE_TYPES = ['contains', 'spawns', 'retries', 'follows']`，`NODE_TYPES = ['session','turn','skill','tool','cli','mcp','subagent']`。**没有 `uses` / `produces`**，也没有任何一条边能表达「这导致了那」。
- 节点 `status` 是**证据完整度**（`observed` / `partial` / `unlinked`），不是结果；一次被完整观测到的失败是 `observed` 且 `outcome: 'failure'`。
- 图是收据的**纯函数**，读时派生、从不持久化。

### 5.4 声明 ↔ 运行对齐（`src/core/runtime-alignment.mjs`）

三条承诺：

1. **无分数。** `scored: false` 挂在每个模型上；守卫 `ALIGNMENT_NO_SCORE_OK` 要求源码里不出现 `complianceRate` / `compliance_rate` / `percent` / `ranking` / `followedRate`。
2. **证据缺失不是缺失的证据。** 没有匹配证据的声明步骤是 `insufficient`，永不写「没做」；状态词表刻意没有 `not-observed` / `skipped` / `not-done`。
3. **直接证据 ≠ 泛化证据。** 一次 `bash` 调用能证明跑了命令，不能证明「测试步骤」跑了；只被兜底能力匹配到的步骤是 `partial`。

声明抽取走两通道，**heading 优先**（`STEP_EXTRACTION_CHANNELS = ['heading','ordered-list']`）：

- `heading`：流程小节内的三级及以下标题，或任何自带序号的标题；**开启流程小节的那个二级标题是给小节命名的，本身不是步骤**。
- `ordered-list`：流程类小节内的编号项；或整个正文没有二级小节时的任何编号项。

宁可精确不要召回：如果正文把约束列在 `## 硬约束` 而真实流程在引用文件里，它报 `numbered-items-outside-a-process-section`，**不把约束提升成流程**。两侧映射到同一套词汇：`inspect` / `edit` / `execute` / `delegate` / `consult` / `produce` / `plan` / `other`。

| 证据状态 | 含义 |
|---|---|
| `observed` | 直接、已结算的调用匹配该声明步骤 |
| `partial` | 只被兜底能力匹配，或匹配的调用从未结算 |
| `insufficient` | 没找到匹配证据，**不表示步骤被跳过** |
| `unknown` | 完全没有可对齐的运行证据 |

`ALIGNMENT_RELATIONSHIPS = ['runtime-supported','intent-supported','partial','insufficient','unknown']`。每项带 `observedNodeIds`、`evidenceIds`、`matchedCapabilities` 与一句 `limitation`；**引用是指针不是倾倒**，列表是有界样本（`ALIGNMENT_NODE_LIMIT = 12`、`ALIGNMENT_EVIDENCE_LIMIT = 24`、`DECLARATION_STEP_LIMIT = 12`），`matchCount` 才是真总数。声明基线取持久发布的 catalog；`inPublishedCatalog` 区分「被提供给模型」与「用户 `/name` 加载」，没有发布过 catalog 时报 `null` 而不是 `false`。

### 5.5 指纹三态

| 值 | 含义 |
|---|---|
| `match` | 请求的哈希与当前正文一致 |
| `mismatch` | 两侧都有哈希且不同 |
| `unavailable` | 任一侧缺哈希 |

**`unavailable` 不是 `mismatch`**，也不能写成「Skill 已失效」：哈希只证明版本变了，不证明好坏。仓库来源同理 —— 只能来自 frontmatter / git origin / 用户配置，猜不到就显示「未解析」，**不造链接**。

---

## 6. 详情页四层的实现

### 6.1 顺序是合同

```js
h('div', { className: 'st-detail-main' }, h(SkillValidationPanel, { validation, validationFieldMissing }), skillModification, framework, runtimeLogic, stepEvidence, docPanel)
```

守卫按字面匹配这条主列的顺序（v0.9.0 起最前面是验收卡、v0.9.1 起第二块是「本次修改对比」，四层仍在最后四位），失败信息是：

```
the detail body must read 验收 → 本次修改对比 → 框架 → 运行逻辑 → 步骤证据 → SKILL.md, in that order
```

| 层 | 组件 | 数据源 | 内容 |
|---|---|---|---|
| 1 | `SkillFramework` → `FrameworkStructure` / `DeclaredWorkflow` / `ProgressiveDisclosure` | `GET /definition`（定义侧） | 八角色模块（结构 + 声明流程 + 渐进披露） |
| 2 | `RuntimeLogic` | 收据（运行时侧） | 五个可观察阶段的真实事实 |
| 3 | `StepEvidence` | 收据（运行时侧） | `detail.flow.steps[].evidence` |
| 4 | `renderSkillMarkdown` | `GET /definition` + `GET /translation` | `SKILL.md` 原文 / 中文阅读版 |

**声明与观测分开渲染**：`SkillFramework` 只读定义（守卫要求它的组件体含 `flow?.steps`，且不含 `runs` / `invocations` / `observedNodeIds` / `evidenceIds` / `runtimeEvidence`）；`RuntimeLogic` / `StepEvidence` 只读收据。**没有从运行证据回到框架的路。**

**一个渲染器一个调用点**：`renderSkillMarkdown(` 在客户端只允许出现一次调用（守卫排除定义与 `__pure` 后计数必须恰为 1）——原文与阅读版共用同一个渲染器，表格渲染只有一处实现。

### 6.2 框架的八个角色（`src/core/skill-framework.mjs`）

```js
FRAMEWORK_ROLES = ['identity','trigger','rules','controls','workflow','resources','output','verification']
```

| 角色 | 界面标签 | 提示语 |
|---|---|---|
| `identity` | 定位 · Purpose | 这个 Skill 是干什么的 |
| `trigger` | 触发 · Trigger | 什么情况下应该用它 |
| `rules` | 规则 · Rules | 有哪些核心规则 |
| `controls` | 参数 · Controls | 有哪些可调参数与决策 |
| `workflow` | 流程 · Workflow | 它声明的工作流程 |
| `resources` | 资源 · Resources | 它引用了哪些外部资源 |
| `output` | 输出 · Output | 它要求产出什么 |
| `verification` | 验证 · Verification | 它如何验证结果 |

- 解析是**纯函数、确定性、无依赖**，`ROLE_MATCHERS` 的匹配顺序是 verification → output → resources → controls → rules → workflow → trigger → identity。
- 有界：`FRAMEWORK_ITEM_LIMIT = 8`、`FRAMEWORK_ITEM_TEXT_MAX = 200`、`FRAMEWORK_OPENING_MAX = 240`、`FRAMEWORK_CHILD_LIMIT = 12`、`FRAMEWORK_RESOURCE_LIMIT = 80`、`FRAMEWORK_RESOURCE_LABEL_MAX = 160`。
- 缺的角色不静默消失：走 `absentRoles`，界面渲染一行「`SKILL.md` 里没有可识别的模块：验证 · Verification」。
- **分组是布局层合成的**，因此 `FrameworkStructure` 有一层兜底：角色分组与 `unclassified` 都没覆盖到的小节，推回「其它章节」渲染。少显示一节，读者会以为 `SKILL.md` 里本来就没有它。
- 「声明流程」是**框架内部的子模块**，不是框架本身。

### 6.3 本次运行逻辑五段（`src/core/skill-runtime-logic.mjs`）

```js
RUNTIME_STAGE_IDS = ['catalog','load','instructions','capability','evidence']
RUNTIME_LOGIC_SCHEMA_VERSION = 1
RUNTIME_LOGIC_SOURCE = 'session-observation'
```

每段是 `{id, order, label, hint, state, tone, statement, facts, limitations}`；`facts[]` 是 `{id, label:{zh,en}, kind, value}`，`kind ∈ count / text / flag / code / names / step-kinds / pairs / evidence-states`。事实 ID 举例：`catalog-entry-count`（目录中的 Skill 数）、`catalog-published-at`、`catalog-digest`、`load-count`、`load-position`、`load-invocation-type`、`instruction-fingerprint-match`、`scope-relation`、`scope-event-count`、`capability-classes`、`evidence-invocation-count`、`step-evidence-states`。

固定说明（界面按字面显示）：

> 这里只列出当前会话能观察到的事实，以及观察不到的地方。阶段之间没有因果顺序，也不表示 Skill 内部的执行步骤。

`RUNTIME_LOGIC_LIMITATIONS` 是四个稳定标识：`runtime-facts-come-only-from-what-this-session-observed`、`runtime-evidence-is-categorical-and-carries-no-argument-text`、`rendered-envelope-not-reproducible-outside-the-harness`、`runtime-events-could-not-be-linked-to-this-skill`。

### 6.4 证据词表是封闭五值

| 值 | 中文 | tone |
|---|---|---|
| `runtime-supported` | 有相关运行证据 | `observed` |
| `partial` | 部分相关证据 | `partial` |
| `intent-supported` | 仅有模型意图 | `intent` |
| `insufficient` | 暂无足够证据 | `none` |
| `unknown` | 无法判断 | `unknown` |

`src/core/flow-evidence.mjs` 的 `FLOW_EVIDENCE_STATES` 与 `FLOW_EVIDENCE_FORBIDDEN`、`src/core/skill-runtime-logic.mjs` 的 `RUNTIME_LOGIC_FORBIDDEN` 是**唯一来源**，界面中文标签也定义在这两个模块里。禁用词：

```
FLOW_EVIDENCE_FORBIDDEN = 已执行 / 未执行 / 已完成 / 未完成 / 执行成功 / 执行失败 / 已运行 / 未运行
RUNTIME_LOGIC_FORBIDDEN = 上面八个 + 已加载 / 已读取 / 已注入 / 已生效
```

守卫 `SKILL_FRAMEWORK_OK` 查的是**解析后的标签值**而不是源码文本（源码里当然会写着这些词 —— 它们就在禁用清单里），并额外要求 `FLOW_EVIDENCE_STATES['intent-supported'].zh !== FLOW_EVIDENCE_STATES.partial.zh`（两句话不能长得一样）。

「暂无足够证据」**不能带一个名头再当场收回**：没有证据的步骤只输出一句 `没有可展示的证据引用`，并且只有真有证据时才出现那个 `dt`。

### 6.5 锚点

`detail.anchors` 是**共用**映射：声明步骤与框架小节都指向 outline entry id，因为**同一个点击处理器服务两者**。点击 → `onStepClick: flashAnchor` → 滚到 `SKILL.md` 对应章节并高亮。

合成小节（例如 `framework:preamble` 与框架自己合成的 `trigger`）的 `anchorId` 是 `null`：渲染成**不可点的行**，且**不出现在映射里**。「一个点了不动的按钮比不可点的元素更糟」。

---

## 7. 中文阅读版：分段、校验、落盘

### 7.1 调用链

```
POST /skill-trace/translate
  → registry.get(name, {cwd, scope}) → buildSkillDefinitionView()   // 现读
  → 指纹校验（full match 或 truncated 且 returnedSha256 相等）
  → translateSkillDefinition({llm, selection, skillName, definitionText, targetLanguage})
      → await import('@deepseek-ai/dsh-llm')  // 动态 import：解析失败只让翻译不可用，不让宿主起不来
      → askModel(system, body) → llm.stream()  // 单条 user message，source.kind = 'dsh-skill-trace-translate'
      → BlockAssembler 只取 text block 拼接
      → runSegmentedTranslation({definitionText, skillName, targetLanguage, attempts, ask})
  → inspectTranslation({source, translation})    // 硬规则，不是提示词里的愿望
  → persistTranslation({...})                     // 返回布尔
```

- `TRANSLATION_MAX_TOKENS = 8192`、`TRANSLATION_ATTEMPTS_PER_CHUNK = 2`。
- 模型来自 `webCtx.get('llm')` 与 `webCtx.get('agentDefaultModel')?.currentSelection?.()`；`model` 字段是 `` `${provider}/${model}` ``。
- 调用方式用官方「不污染会话」的写法（`createUserMessage` → `llm.stream` → `BlockAssembler`），provider-neutral；用户配置的模型 provider 是**唯一**收到定义正文的第三方。

### 7.2 分段与保护

| 符号 | 作用 |
|---|---|
| `extractProtected(markdown)` | 抽出保护目标：`{fences, fenceCount, headingLevels, inline, urls, paths, frontmatterKeys}` |
| `maskProtected` | 翻译前把围栏代码、行内代码、URL、路径、frontmatter 键替换成占位符 |
| `restoreProtected` | 译后还原 |
| `PLACEHOLDER_OPEN` | 占位符前缀常量（守卫要求存在） |
| `splitChunkSource` | 段太长或回退时切成两半重试（`const halves = splitChunkSource(source)`） |
| `checkChunk` | 单段校验 |
| `reanchorChunk({ source, translation: verdict.translation })` | 段尾空行被 trim、标题粘成一行时的重新锚定 |
| `alignHeadingLevels` | 对齐标题层级 |
| `looksUntranslated(original, translated, targetLanguage)` | 判定「根本没翻」，`rule: 'untranslated'` 直接回退 |
| `runSegmentedTranslation` | 分段编排；守卫要求它 600 字符内必须调 `maskProtected(definitionText)` |

### 7.3 结构校验（`inspectTranslation`）

返回 `{ok, violations, preserved}`。规则名闭集：`code-fence` / `heading` / `inline-code` / `url` / `file-path` / `frontmatter`；违规上限 20。**动了围栏或改了 URL 的译文被丢弃，而不是附一条警告展示** —— 把一份改坏结构的文档当成「中文预览」交给用户，比返回失败更糟。

段级失败不整体失败：`chunkCount`、`fallbackChunks`、`fallbackReasons`（只报规则名：`heading` / `placeholder` / `empty` / `untranslated` 等）一起回给界面，界面按 `TRANSLATION_RULE_TEXT` 把规则名翻成人话。**用户看到一段英文而界面声称「已翻译」，比看到「翻译失败」更糟。**

### 7.4 落盘

| 项 | 值 |
|---|---|
| 路径 | `<dataRoot>/translations/<sha256(key)>.json` |
| 键 | `skillName` + `sourceSha256` + `targetLanguage`，由 `translationStoreKey()` 用 `\u0000` 连接；**不含 `sessionId`** |
| 目录权限 | `0700` |
| 文件权限 | `0600` |
| 写原子性 | 先写临时文件再 `rename`（照抄 `src/storage/receipt-store.mjs`） |
| 删除 | `DELETE /skill-trace/translation`，精确到三个字段 |
| 版本清理 | 写成功后异步 `pruneVersions({keepPerSkill: 2})` |
| 禁止字段 | `FORBIDDEN_RECORD_FIELDS` = `sessionId`、`sessionID`、`messages`、`conversation`、`args`、`result`、`toolArguments`、`toolResult`；命中即抛错 |

**因为键里带内容哈希，改正文即自然失效**：旧文件留在盘上（编辑回退可恢复），但绝不当作当前版本提供；新哈希下 `GET /skill-trace/translation` 报 `null`，界面回原文并提供重译入口。

**界面文案只由 `saved` 布尔驱动**：`persistTranslation()` 任何抛出都返回 `false` 并记日志；「✓ 中文阅读版已保存」只在真正的 `translationStore.write()` 之后说。发起请求不等于保存成功，存不下不影响这次阅读（译文已经在响应里），但不能假装存上了。

守卫 `TRANSLATION_PERSISTENCE_OK` 钉的是**哪些东西不许落盘**：`translationStoreKey` 的实现体里不得出现 `session`，`persistTranslation({…})` 头 600 字符里不得出现 `sessionId`，`src/core/skill-translation.mjs` 一个字都不许落盘（`receipt` / `localStorage` / `sessionStorage` / `writeFile` / `receiptStore` 全部禁用）。

### 7.5 内存缓存

`src/core/translation-cache.mjs`（48 行）是一个模块级 `Map`，`LIMIT = 8`，键是 `translationCacheKey(sessionId, skillName, sha)`。

- 键里**有** `sessionId`，磁盘键里**没有** —— 这是故意的：内存缓存是「这次页面会话的快速回读」，磁盘资产是「跨会话可复用的资产」。
- 模块无 node 依赖（不碰 `node:fs` / `localStorage`），所以能安全内联进客户端 bundle。

---

## 8. 复刻 Skill 的写入路径

### 8.1 四条约束

1. **不用 `ctx.fs`。** 沙箱文件系统没有 `mkdir` / delete / move，且 `writeText` 被围栏在 workspace root，够不到 `<dshHome>/skills` 或 `<agentsHome>/skills`。`src/storage/skill-clone-writer.mjs` 直接用 `node:fs/promises`，只允许 read / copy / write / verify，**没有 `spawn` / `exec`**。
2. **不覆盖是文件系统属性，不是一次检查。** `writeClone()` 调 `mkdir(directory)` **不带 `recursive`**，已存在即 `EEXIST` → `target-exists`；整条路径**没有 delete-then-write**。同名校验在写入前另做一次（整个 catalog + 两种磁盘形状探测），但那只是提前给出好文案。
3. **半个 Skill 比失败的复刻更糟。** 任何拷贝失败（缺声明引用、权限、中途超限）都**删掉自己创建的那个目录**并报 `write-failed`。没拷到的东西诚实上报：超 `CLONE_MAX_BYTES` 置 `truncated`，界面说「完整 Skill 没有拷全（已复制 N 个文件，M 个超过单次复刻上限）」。walk **不进入** `.git` 与 `node_modules`，也不把它们算作「跳过」。
4. **声称成功前必须回读。** `readBackClone()` 重新解析副本的 frontmatter 并比对请求的名字，不一致就删目录并失败；通过之后响应才带 `verified: true`。随后还重读**源**并比对 `readSkillSourceSha256()` —— 「源 Skill 未被修改」是**测量**而非保证；比对不上时 `sourceUnchanged: false` 且 `limitations` 加 `source-reread-did-not-match`。

另外两条：

- **响应永不返回绝对路径**：只给 `pathKind`（`project-dsh` / `user-dsh` / `user-agents`）与一句范围说明。
- **轮询 registry** 最多 6 次、间隔 250 ms（文件系统 provider 的 chokidar watcher 需要自己的写入稳定窗口）。看不到就照实说：

  > Skill 已写入 Skill 目录，目录刷新状态待确认。

### 8.2 入参与校验顺序（`handleClone`）

| 顺序 | 检查 | 失败 |
|---|---|---|
| 1 | `isCloneSkillName(sourceSkillName)` / `(targetSkillName)`：小写 kebab-case（比 §3.3 那条宽规则**更严**） | 400 `invalid-request` — `Skill 名只能用小写字母、数字和连字符，并以字母或数字开头（例如 my-skill-custom）。请修改后重试。` |
| 2 | `targetSkillName !== sourceSkillName` | 400 — `目标名称不能与来源相同，请换一个名称。` |
| 3 | `targetScope ∈ CLONE_SCOPES = ['project','user']` | 400 — `保存范围必须是「当前项目」或「我的 Skill」。` |
| 4 | `cloneMode ∈ CLONE_MODES = ['bundle','skill-md']` | 400 — `复刻内容必须是「完整 Skill」或「仅 SKILL.md」。` |
| 5 | `sourceSha256` 形状 | 400 — `缺少来源版本指纹，请刷新页面后重试。` |
| 6 | `requiredSessionId(body.sessionId)` | 400（catch-all） |
| 7 | registry 存在 | 500 `write-failed` — `复刻失败：当前宿主没有挂载 Skill 注册表，无法读写 Skill 目录。请重启 DSH 后重试。` |
| 8 | registry 能解析来源名 | 422 `definition-unavailable` — `找不到 Skill「<name>」的原始定义，无法复刻。` |
| 9 | `definition.content.sha256 === sourceSha256` | 409 `source-changed` — `来源 Skill 已经变化，请重新打开详情页再复刻。`（带 `{currentSha256}`） |
| 10 | `planCloneSource({sourceName, definitionName: raw.name, definitionAvailable: true, resourceBasePath: raw.resourceBase?.path ?? null})` 能给出目录 | 422 `bundle-unreadable` — `当前无法确认完整资源目录，因此无法复刻完整 Skill。可以改选「仅 SKILL.md」。`（带 `{availableMode:'skill-md'}`） |
| 11 | `readSkillSource(...)` 成功 | 422 — `读取来源 Skill 的文件失败，因此无法复刻。请稍后重试。`（带 `{reason}`） |
| 12 | 读源期间源没变 | 409 `source-changed` — `来源 Skill 在复刻过程中发生了变化，请重新打开详情页再复刻。` |
| 13 | 有可写目标根 | 500 — `找不到可以写入的 Skill 目录，无法复刻。请确认 DSH_HOME 或项目目录可用后重试。` |
| 14 | 目标名未被占用 | 409 `target-exists` — `Skill 名称已存在，请更换名称。`（带 `{where: taken.where}`） |
| 15 | `rewriteSkillName`（frontmatter `name:` 改写） | 422 — `来源 Skill 的 frontmatter 无法改写，因此无法复刻。`（带 `{reason}`） |
| 16 | `writeClone` 写入 | 失败逐类映射；`target-exists` → 409；其余 → 500 — `写入 Skill 目录失败，没有产生任何副本。请检查磁盘空间与目录权限后重试。` |
| 17 | `readBackClone` 回读 | 500 `write-failed` — `副本写入后没有通过回读校验，已回滚。请稍后重试。`（带 `{reason}`） |
| — | 任何未捕获异常 | 500 `write-failed` — `复刻失败，没有产生任何副本。请稍后重试；若持续失败，请检查 Skill 目录权限。`（**兜底文案里不能出现任何路径**：异常消息可能带着绝对路径） |

**错误码闭集**（`src/core/skill-clone.mjs` 的 `CLONE_ERROR`）：

```
invalid-request · skill-not-found · source-changed · target-exists ·
definition-unavailable · bundle-unreadable · write-failed
```

**有界常量**：`CLONE_MAX_FILES = 512`、`CLONE_MAX_BYTES = 16 * 1024 * 1024`、`CLONE_SKIPPED_DIRECTORIES = ['.git','node_modules']`、`CLONE_NAME_SUFFIX = '-custom'`。

**纯函数部分的 reason 词表**：`planCloneSource` → `invalid-source-name` / `definition-unavailable` / `definition-name-mismatch` / `resource-base-is-not-the-skill-directory` / `resource-base-has-no-path`，成功 `{ok:true, mode:'bundle', directory, reason:'directory-bundle'}`；`splitFrontmatter` → `empty-file` / `missing-frontmatter` / `unterminated-frontmatter`；`rewriteSkillName` → `invalid-target-name` / `missing-name-field`；`selectCloneEntries` 的跳过 reason → `unsafe-path` / `excluded-directory` / `symlink` / `not-a-file` / `over-limit`。

### 8.3 目标根怎么选（`src/core/skill-clone-path.mjs`）

`resolveCloneRoot({scope, projectRoot, dshHome, agentsHome, existing, populated})` 是**纯函数**：`existing` / `populated` 由调用方从文件系统读出来后传进来。两级判定：

1. 先选**已经有 Skill 的**现存根（`populated-dsh-user-root` / `populated-agents-user-root`）；
2. 否则按 DSH rank 选现存根（`user-dsh` 400 在 `user-agents` 500 之前，`existing-dsh-user-root` / `existing-agents-user-root`）；
3. 都不存在时用默认 `<dshHome>/skills`（`default-dsh-user-root`）。

`probePopulatedRoots()` 与 `looksLikeSkillRoot()` **靠目录内容判定**（匹配 Skill 名语法且含 `SKILL.md` 的子目录，或 `<name>.md` 子文件），**绝不靠路径拼写**。本机实测：`~/.dsh/skills` 存在但为空，`~/.agents/skills` 才是真实用户 Skill 所在 —— 这正是「优先选已有的那个根」的存在理由。

`skillRootFor(kind, …)` 的三个映射：`project-dsh` → `join(projectRoot,'.dsh','skills')`、`user-dsh` → `join(dshHome,'skills')`、`user-agents` → `join(agentsHome,'skills')`。

### 8.4 成功响应

```json
{
  "ok": true, "skillName": "<目标名>", "sourceSkillName": "<来源名>",
  "scope": "project|user", "pathKind": "project-dsh|user-dsh|user-agents",
  "mode": "bundle|skill-md", "verified": true,
  "discovered": true, "discoveryAttempts": 1, "sourceUnchanged": true,
  "fileCount": 12, "skippedCount": 0, "truncated": false,
  "invocation": "/<目标名>", "summary": "…", "limitations": ["…"]
}
```

`limitations` 的元素是稳定标识：`absolute-paths-withheld`、`clone-is-not-attached-to-this-session` 恒在；再加 `catalog-refresh-observed` 或 `catalog-refresh-not-observed`；`source-reread-did-not-match`；`bundle-declared-resources-not-copied`（仅 `skill-md` 模式）；`bundle-truncated-by-limit` 或 `bundle-partially-skipped`。

响应还带一句 `invocation: '/<targetName>'` 与一句人话 `summary`（`describeCloneResult`）——复刻出来的 Skill 是「可以 `/name` 调用的」，但**它不会自动挂载到这次会话**。

---

## 9. 模块清单

行数为 `wc -l` 实测。`55f092c` 只动了 `src/dsh/client/client.js`（2343 → 2348）与 `src/dsh/host/index.js`（1110 → 1143）；V0.8 三个 Phase 又动了客户端（2348 → 2735）、宿主（1143 → 1292），并给 `src/core/` 加了 `skill-lineage.mjs`（174）与 `skill-diff.mjs`（527）、给 `src/storage/` 加了 `skill-lineage-store.mjs`（139）。

**V0.9.0「Skill 验收」增量（已随 `0.9.2` 发布，§18）**：`src/core/` 加 `skill-profiles.mjs`（590）与 `skill-validation.mjs`（1025）⇒ 26 → **28** 个文件（8049 → **9671** 行）；`skill-view-model.mjs` 348 → **355**（多一行 `validation` 透传）、`src/storage/skill-clone-writer.mjs` 348 → **369**（多一个 `readSkillFile`）；宿主 1292 → **1407**、客户端 2735 → **2910**；`dist/client.js` 142672 → **150750 字节**。下表各行的数字已按工作树重跑。

**V0.9.1「Skill Modify」增量（已随 `0.9.2` 发布，§19）**：`src/core/` 加 `skill-modification.mjs`（592）、`src/storage/` 加 `modification-snapshot-store.mjs`（157）⇒ **29 个文件 / 10263 行** 与 **6 个文件 / 1062 行**；宿主 1407 → **1590**（多了 `handleModify()`，路由 **11 → 恰好 12 条**）、客户端 2910 → **3356**（多了 `SkillModifyDialog` 与 `SkillModificationPanel`）；`dist/client.js` 150750 → **167506 字节**（source hash `b391ec909986207a`）。**`src/core/` 与 `src/storage/` 的落盘面没有新增任何东西** —— 快照只在内存里（§9.3、§11.2）。

**V0.9.2「已安装列表排序」增量（已随 `0.9.2` 发布，§20）**：`src/core/installed-view.mjs` 72 → **151**（排序、`addedAt` / `lineage` 投影与三个新限制码）；`src/storage/skill-clone-writer.mjs` 369 → **424**（新增两个只读导出 `skillAddedAtByName()` / `skillRootCandidates()`）⇒ `src/core/` **29 个文件 / 10353 行** 与 `src/storage/` **6 个文件 / 1117 行**（模块数不变，长的是上面这两个文件）；宿主 1590 → **1625**（`/catalog` 多读两处盘、多一个 `lineageByTargetName()`，**不新增路由**）、客户端 3356 → **3448**（`formatAddedAt()` / `InstalledOrderNote` / 卡片上两条分开的事实；2026-10-03 又按用户要求把日期收到 `MM-DD`、默认成立的标签不再写，行数净增 17）；`dist/client.js` 167506 → **170324 字节**（source hash `66dd0b76118e7b85`）。

**V0.10.0「Skill 实例验收」增量（已随 `0.10.0` 发布，§21）**：`src/core/` 加 `skill-instance-test.mjs`（**571 行、零依赖、零 `import`**；导出 `INSTANCE_TEST_SOURCES` / `INSTANCE_TEST_SCOPE_ROLES` / 三个卡面抬头常量与别名 `buildInstanceTest`，生成器接了 `intent` / `framework` 两个新输入并回 `trace`）⇒ **30 个文件 / 10924 行**（`src/storage/` 仍是 **6 个文件 / 1117 行**，本版**不新增任何落盘**）；**宿主一行未动**（仍 **1625 行**、**12 条路由**）；客户端 3448 → **3625**（`SkillModificationPanel` 里多出 `data-role="mod-instance"` 一整段 + 第 8 支 `require` + 该段 CSS，含「验证目标」/「测试 Prompt」两块抬头与 `mod-instance-trace`）；`dist/client.js` 170324 → **189256 字节**（source hash **`faed5e9cef7db24c`**）。

**V1.0「Skill 评测」增量（已随 `1.0.0` 发布，§22）**：`src/core/` 加 `skill-evaluation.mjs`（**565 行，唯一 import 是单行 `./skill-instance-test.mjs`**）与 `run-conditions.mjs`（**零时钟纯函数**：`readRunConditions` / `readRunCursor` / `summarizeToolActivity` / `readLoadEvidence` / `pickObservedFingerprint`）⇒ **32 个文件 / 11657 行**；`src/storage/` 加 `evaluation-store.mjs` ⇒ **7 个文件 / 1411 行**；宿主 **1844 行 / 13 条路由**（新增 `POST /skill-trace/evaluation`）；客户端 **4284 行 / 第 9 支 `require`**（`skill-evaluation.mjs`）与详情页「Skill 评测」卡；`dist/client.js` **228715 字节**（source hash **`54bee3888d0299d8`**）；测试 **636 项**（52 个文件）、守卫 **30 组**（第 30 组 `SKILL_EVALUATION_OK`）。

### 9.1 `src/dsh/`（3 个文件）

| 路径 | 行数 | 职责 |
|---|---|---|
| `src/dsh/host/index.js` | 1844 | 宿主半边：13 条路由、事件订阅与归约编排、收据/偏好/译文/血缘/评测五个 store、复刻的校验与回读、**`validationFor()`（两条路由共用，§18）**、**`handleModify()`（`begin` 记内存快照 + `followup()` 代发，`compare` 出对比并释放快照，§19）**、**`lineageByTargetName()` 与 `/catalog` 的两处只读读盘（§20）**、**`handleEvaluation()`（V1.0 第 13 条路由：八个动作、`caseId` 由宿主算、`run-capture` 由宿主从会话日志与收据取条件与事实，§22.7）**、loopback 门禁 |
| `src/dsh/client/client.js` | 4284 | 整个客户端（一个工厂闭包）：两个一级页面 + 一个详情页 + 复刻对话框 + 「Skill 演进」卡 + 「Skill 差异」面板 + 「Skill 验收」卡（§18）+ 「修改 Skill」对话框与「本次修改对比」块（§19）+ 该块里的**实例验收**段（§21，`data-role="mod-instance"`，只有存在本次修改时才随它出现；含「验证目标」/「测试 Prompt」两块抬头与 `mod-instance-trace`）+ 已安装列表头 `InstalledOrderNote` 与卡片上的「加入本机 / 复刻自」两条事实（§20）+ 详情页「Skill 评测」卡（§22，V1.0，`data-role="eval-card"`，30 个 `eval-*` data-role）+ 整份样式表 |
| `src/dsh/client/package.json` | — | 把该目录标记为 `commonjs`（包根是 `type: module`），不依赖打包器的猜测 |

构建产物 `dist/client.js` 为 **228715 字节**（`1.0.0` 发布 source hash **`54bee3888d0299d8`**；`0.10.0` 发布为 189256 字节 / `faed5e9cef7db24c`，V0.10.0 早期工作树为 184471 字节 / `2d202a05030a1d58`，V0.9.2 工作树时为 170324 字节 / `66dd0b76118e7b85`，V0.9.1 工作树时为 167506 字节 / `b391ec909986207a`，V0.9.0 工作树时为 150750 字节 / `808afdc7cca990cb`，V0.8.0 发布时为 142672 字节 / `f53a7ac5965b38b0`），提交进仓库。

### 9.2 `src/core/`（32 个文件、11657 行）

| 路径 | 行数 | 职责 |
|---|---|---|
| `src/core/trace-reducer.mjs` | 1150 | 会话事件 → 收据：`reduceSessionEvent` / `emptyReceipt` / `migrateReceipt` / `rebuildReceipt` / `buildViewModels` / `carriesSkillEvidence` / `setRuntimeLineage` / `setSourceSnapshots` / `setTraceRuntimeIdentity` |
| `src/core/skill-translation.mjs` | 643 | 中文阅读版：分段、保护、校验、回退、指纹比对；**不落盘** |
| `src/core/runtime-events.mjs` | 590 | 运行事件模型：规范化、能力分类、重试派生、invocation 聚合 |
| `src/core/skill-framework.mjs` | 579 | 从正文确定性解析八角色框架、缺席角色、渐进披露 |
| `src/core/runtime-alignment.mjs` | 541 | 声明步骤抽取 + 与运行证据对齐；`scored: false` |
| `src/core/skill-runtime-scope.mjs` | 497 | 运行证据对「这个 Skill」的归属范围与边界 |
| `src/core/skill-view-model.mjs` | 355 | 列表/详情模型；`attachEvidenceToFlow`（运行时只能标注）；`buildSkillDetail` 原样透传 `lineage` / `validation`（**键永远存在**，没有时是 `null`） |
| `src/core/runtime-graph.mjs` | 308 | 关联图谱：节点/边、优先级、丢弃计数；读时派生，不持久化 |
| `src/core/skill-definition.mjs` | 264 | 现读定义视图 + `compareDefinitionToRun` |
| `src/core/skill-flow.mjs` | 259 | 声明流程抽取（heading / ordered-list 两通道） |
| `src/core/repository-resolver.mjs` | 258 | 仓库来源解析（frontmatter / git origin / 用户配置），三态 |
| `src/core/skill-clone.mjs` | 213 | 复刻的纯逻辑：计划、frontmatter 改名、条目筛选、错误码 |
| `src/core/skill-diff.mjs` | 527 | 差异的三层比较：结构 / 内容 / 资源；只用可观察事实，绝不给出好坏判断 |
| `src/core/skill-lineage.mjs` | 174 | 血缘：从复刻记录还原「这个副本来自哪一版来源」与来源指纹三态 |
| `src/core/session-log.mjs` | 216 | 会话日志读取：找文件、多 frame zstd 解压、上限与路径穿越防护 |
| `src/core/definition-outline.mjs` | 202 | frontmatter 解析、标题规范化、outline 与锚点 |
| `src/core/runtime-evidence.mjs` | 195 | 唯一读取工具参数的接缝：命令/文件目标分类 |
| `src/core/source-snapshot.mjs` | 186 | catalog 快照与来源快照（名字、描述、白名单投影） |
| `src/core/markdown-table.mjs` | 129 | GFM 表格识别与结构签名 |
| `src/core/flow-evidence.mjs` | 126 | 证据词表五值、禁用词、标签（中文/英文） |
| `src/core/runtime-fingerprint.mjs` | 110 | §31 的**保留结构**：slot 全为 `null`，不派生 |
| `src/core/step-kind.mjs` | 88 | 步骤类型归类（inspect / edit / execute / delegate / consult / produce / plan / other） |
| `src/core/installed-view.mjs` | 151 | 已安装列表投影与排序（V0.9.2，§20）：**不读收据**，白名单 `{name, description, provider, invocation}` 之外只加 `addedAt`（`number` 或 `null`）与 `lineage`（`{sourceSkillName, createdAt}` 或 `null`）；导出 `INSTALLED_ORDERING_RULE = 'added-desc-then-name'` / `projectInstalledSkill()` / `matchesInstalledQuery()` / `buildInstalledView()`；`ordering: {rule, addedAtKnown, addedAtUnknown}` 按**整个目录**计数；三个限制码 `added-at-unavailable` / `added-at-partial` / `lineage-unavailable`；**零 import**（客户端要 `require` 它） |
| `src/core/skill-clone-path.mjs` | 70 | 复刻目标根决议（纯函数）+ 三种 `pathKind` 映射 |
| `src/core/translation-cache.mjs` | 48 | 内存译文缓存：模块级 `Map`、`LIMIT = 8`、键含 `sessionId` |
| `src/core/skill-runtime-logic.mjs` | 256 | 本次运行逻辑五段：阶段 ID、事实、limitations |
| `src/core/skill-profiles.mjs`（新） | 590 | **V0.9.0 规则表**：5 个 Profile、32 条规则（`{id, profile, severity, title, fact, source}`）、数字常量与 `resolveSkillProfiles`。纯常量 + 纯函数，零依赖 |
| `src/core/skill-modification.mjs`（新） | 592 | **V0.9.1 修改契约与差异模型**：`MODIFICATION_SCOPE_OPTIONS`（6 个范围 id，顺序固定）、`MODIFICATION_CONTRACT_RULES`（12 条）、`buildModificationMessageText`（代发那一条消息的正文）、`diffSkillModification`（三态 + 行级 / 小节级 / 资源级 + 超出授权范围的变化）、`modificationSnapshotKey`。**纯函数**：零 IO、零模型调用、零时钟、零随机 |
| `src/core/skill-validation.mjs`（新） | 1025 | **V0.9.0 验收器**：自带 frontmatter 扫描器、Markdown 围栏/引用扫描、凭据与外传模式扫描；`buildSkillValidation` 出三态结论与逐规则状态。唯一 import 是 `./skill-profiles.mjs` |
| `src/core/skill-instance-test.mjs`（新） | 571 | **V0.10.0 实例验收生成器**（§21）：`SKILL_INSTANCE_TEST_SCHEMA_VERSION = 1`、`INSTANCE_TEST_INTENTS`（`core` / `boundary` / `regression`，只是内部清单，界面只有一个按钮）、`INSTANCE_TEST_SOURCES = ['intent','scopeIds','comparison','description','framework','validation']`（六项输入的固定顺序，`trace.sources` 按它筛出**这次真的在场**的项）、`INSTANCE_TEST_SCOPE_FOCUS`（六个范围各自的观察重点）、`INSTANCE_TEST_SCOPE_IDS`、`INSTANCE_TEST_SCOPE_ROLES`（六个范围 id → 框架角色：`skill-md-rules`→`rules`、`skill-md-workflow`→`workflow`、`skill-md-description`→`trigger`、`references`/`scripts`/`assets`→`resources`）、`INSTANCE_TEST_PRIMARY_SCOPE_ORDER`、`INSTANCE_TEST_PROMPT_BLOCKS = ['任务','工作目标','输出要求','注意']`、`INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS`、`INSTANCE_TEST_RELATIVE_TIME_WORDS`、`INSTANCE_TEST_UNAVAILABLE_REASONS` / `INSTANCE_TEST_UNAVAILABLE_MESSAGES`（四种「生成不出来」各自的实话）、`INSTANCE_TEST_HEADLINE` / `INSTANCE_TEST_OBSERVATION_TITLE` / `INSTANCE_TEST_OBSERVATION_NOTE` / `INSTANCE_TEST_GOAL_TITLE = '验证目标'` / `INSTANCE_TEST_GOAL_TEXT = '验证本次修改是否改变了这个 Skill 的实际行为。'` / `INSTANCE_TEST_PROMPT_TITLE = '测试 Prompt'` / `INSTANCE_TEST_LIMITATION_NOTE`，以及 `buildSkillInstanceTest(input)`（签名收 `{skillName, intent, comparison, definitionText, description, framework, validation}`，回 `trace = {sources, frameworkAvailable, validationStatus, validationUnknownCount, hintedScopeId}`）与**别名** `buildInstanceTest`（规格 §15 建议的名字；实现保留原名是因为测试与守卫在用它）。**零 `import`、零依赖、零 IO、零时钟、零随机、零模型调用** —— 同一份输入永远得到同一份结果 |
| `src/core/skill-evaluation.mjs`（新） | 565 | **V1.0 评测纯函数层**（§22.3–§22.6，已落地）：`caseHashInput()`（六行定序的哈希输入，**哈希本身由宿主算**）、`buildEvaluationCase()`（把 V0.10 那次实例验收升级成带身份的可重复 Case，生成不出来时沿用 V0.10 的 reason 与人话）、`normalizeEvaluationRun()`（`FR-EVAL-006` 字段表的**唯一入口**，缺项一律 `unavailable`）、`buildEvaluationAssertions()`（**只回 `{rows, unavailable}`，没有任何聚合字段**）、`compareEvaluationRuns()` + `comparisonWordOf()`（同一 Case 的两条轴与那张三态真值表）、`buildRuntimeEvidence()`（四段证据 + 三条不等式）。**零 `Date.now` / `Math.random` / `new Date(`**（测试用正则钉住），不调模型、不读盘、不判分 |
| `src/core/run-conditions.mjs`（新） | 168 | **V1.0 运行条件（零时钟纯函数）**（§22）：`readRunConditions` / `readRunCursor` / `summarizeToolActivity` / `readLoadEvidence` / `pickObservedFingerprint`；不读时钟、不读盘、不调模型 |

### 9.3 `src/storage/`（7 个文件、1411 行）

| 路径 | 行数 | 职责 |
|---|---|---|
| `src/storage/skill-clone-writer.mjs` | 424 | 复刻落盘：探测、`mkdir`（不带 `recursive`）、拷贝、回读、回滚、写血缘记录；另有 `readSkillFile`（**整份文件，含 frontmatter**，只给验收用，见 §18.4）与 `readSkillBody`（只有正文，口径同 registry）；**V0.9.2 新增两个只读导出**：`skillAddedAtByName({names, roots})`（取候选根下 Skill **目录**的 `birthtimeMs`，拼路径前先过 `isSkillName`，同名取第一个命中的根，读不到就不放进结果）与 `skillRootCandidates({cwd})`（四个候选根的固定 rank 顺序，与复刻写入同一份顺序，见 §20.1）；用 `node:fs/promises` 而不用 `ctx.fs` |
| `src/storage/skill-lineage-store.mjs` | 139 | 血缘记录落盘：`0700`/`0600`、原子 `rename`，只记来源名与来源指纹，不记绝对路径 |
| `src/storage/translation-store.mjs` | 208 | 译文落盘：`0700`/`0600`、原子 `rename`、只增不覆盖的版本清理、禁止字段 |
| `src/storage/receipt-store.mjs` | 115 | 收据落盘：默认根 `~/.dsh/skill-trace/receipts`，文件名 `sha256(sessionId)`；`prune` 与原子写 |
| `src/storage/preference-store.mjs` | 74 | 机器级偏好：`PREFERENCES_VERSION = 3`、`DEFAULT_VIEWS = ['current','installed']`、回落语义 |
| `src/storage/modification-snapshot-store.mjs`（新） | 157 | **V0.9.1 修改前的快照**：`createModificationSnapshotStore({ttlMs, now, max})`，只在**宿主内存**里保存一次修改事务的「改前」（正文 + 目录清单 + 修改范围 + 验收目标 + 来源指纹），TTL **30 分钟**、上限 **32 份**、键 = `modificationSnapshotKey({sessionId, skillName})`。**不碰磁盘**：不认 `dataRoot`、没有任何写文件调用，重启即消失 |
| `src/storage/evaluation-store.mjs`（新） | 294 | **V1.0 评测的 Case 与 Run**（§22.7）：`createEvaluationStore(root)`，`cases/<caseId 去掉 sha256: 前缀>.json` + `runs/<同一个 hex>/<runId>.json`，目录 `0700` / 文件 `0600`、tmp + 原子 `rename`、写前深层扫描禁字段（`sessionId` / 工具参数与结果 / `score` / `rate` / `variance` / `ranking` / `trend`…），上限 200 个 Case / 每 Case 50 次运行，删 Case 级联删 runs |

---

## 10. 客户端组件树与 hooks 合同

### 10.1 组件树

```
Workbench                       一级页面切换 + 宿主偏好
├── TraceState {kind, message, onRetry}        取不到东西时渲染它
├── Icon
├── CurrentSkillPage            ← GET /skill-trace/skills · GET /skill-trace/skill
│   └── SkillCard {name, description, meta, onOpen}
├── InstalledSkillsPage         ← GET /skill-trace/catalog
│   ├── InstalledOrderNote      列表头一句话：按什么排、有几个读不到加入时间（无 ordering 时返回 null，什么都不说）
│   └── InstalledSkillGrid      每个 Skill 一个 button.st-installed-card（整张卡是目标）
└── SkillDetailPage             ← GET /definition · POST /translate · GET /translation
    ├── sidePanel               事实列 + 唯一对象级动作「复刻 Skill」
    ├── SkillFramework          文档之上的组成
    │   ├── FrameworkStructure  八角色 + 其它章节 + 缺席角色
    │   ├── DeclaredWorkflow    流程子模块（不是框架本身）
    │   └── ProgressiveDisclosure 声明 vs 已读取资源（带 Tier）
    ├── RuntimeLogic            五段可观察阶段
    ├── StepEvidence            detail.flow.steps[].evidence
    ├── renderSkillMarkdown     原文与阅读版唯一调用点
    ├── SkillModificationPanel  「本次修改对比」卡（§19；`phase: 'idle'` 时整块返回 null）
    │   └── 实例验收段（§21）      `data-role="mod-instance"` —— **不是新组件**，只是这张卡内部的一整段；只有存在本次修改时才随它出现
    └── SkillCloneDialog        560px，仅在打开时渲染，POST /clone
```

客户端**只调那 13 条存活路由**；它不持有收据本体、不持有图、没有草稿缓冲、没有备份状态。取不到东西时渲染 `TraceState`，而不是渲染一个空列表。

### 10.2 hooks 顺序是渲染合同

`conversation.view` 是**没有错误边界**的 React slot：组件一抛错，整个标签页空白。两条规则与两次真实事故对应：

1. **同一个组件里，`React.use*` 不得排在第一个提前 `return` 之后。** 第一帧少调一个 hook、第二帧多调一个 → React #310 → 白屏。
   - 两道守卫：`HOOK_ORDER_OK`（按缩进切分组件体、比较行号，认单行 `if (…) return …` 与 `if (…) {` + 下一行 `return` 两种形式）与 `test/client-hook-order.test.mjs` 导出的 `scanHookOrder(source)`。
   - 组件测试抓不到它：`test/client-render-smoke.test.mjs` 桩住 `useState`，只渲染「数据已经到了」的那一帧。**#310 是在运行中的真实 DSH 里用 CDP 抓到的。**
2. **接口字段缺失必须降级成可见的错误态**，不许在 `undefined` 上取属性；「读不到」与「没有」是两句不同的话。
   - 反面教材的形状：`payload.coverage` 里的 `payload` 是 `undefined` → `Cannot read properties of undefined (reading 'coverage')`。

### 10.3 客户端只能 require 这几支 core 模块

客户端是**手写 CJS + esbuild 打包**，`require('../../core/x.mjs')` 在构建时被内联。`test/client-render-smoke.test.mjs` 用一个极小的降级器把 core 模块的 ESM 转成 CJS，它**只认三种写法**：

```js
export function foo(…) {}       // ✓
export const BAR = …            // ✓
import { a, b } from './y.mjs'  // ✓（单行具名；会被改写成 require）
export default …                // ✗ 降级器直接抛错
export { a, b }                 // ✗ 直接抛错
```

**新 core 模块要么无依赖，要么只用单行具名 import** —— 能不能被客户端读，不该取决于它恰好有几个依赖。

当前客户端 `require` 的 **9** 支（V0.10.0 起由七支变八支，V1.0 起由八支变九支，`AGENTS.md` §6.6 的白名单因此也是九支；`SKILL_INSTANCE_TEST_OK` 直接数 `require('../../core/…')` 的条数，必须**恰为 9**）：

| core 模块 | 用到的导出 |
|---|---|
| `flow-evidence.mjs` | `FLOW_DECLARATION_NOTE, FLOW_EMPTY_TEXT, FLOW_TRUNCATED_TEXT, FLOW_UNAVAILABLE_TEXT, STEP_EVIDENCE_HEADINGS, STEP_EVIDENCE_NOTE, flowEvidenceLabel, flowEvidenceState, flowKindLabel` |
| `skill-framework.mjs` | `DISCLOSURE_NOTE, FRAMEWORK_NOTE, FRAMEWORK_ROLE_LABELS, FRAMEWORK_ROLE_HINTS, FRAMEWORK_UNCLASSIFIED_LABEL` |
| `skill-runtime-logic.mjs` | `RUNTIME_LOGIC_NOTE` |
| `markdown-table.mjs` | `parseTableAt` |
| `installed-view.mjs` | `matchesInstalledQuery`（**V0.9.2 起仍只 `require` 这一支**；排序规则名随响应的 `ordering.rule` 下发，客户端不写死，见 §20.4） |
| `translation-cache.mjs` | `readCachedTranslation, translationCacheKey, writeCachedTranslation` |
| `skill-clone.mjs` | `CLONE_MAX_BYTES, CLONE_MODES, CLONE_SCOPES, cloneTargetName, isSkillName` |
| `skill-instance-test.mjs` | `INSTANCE_TEST_GOAL_TEXT, INSTANCE_TEST_GOAL_TITLE, INSTANCE_TEST_HEADLINE, INSTANCE_TEST_LIMITATION_NOTE, INSTANCE_TEST_OBSERVATION_NOTE, INSTANCE_TEST_OBSERVATION_TITLE, INSTANCE_TEST_PROMPT_TITLE, INSTANCE_TEST_SCOPE_FOCUS, INSTANCE_TEST_UNAVAILABLE_MESSAGES, buildSkillInstanceTest`（**V0.10.0 的第 8 支**；零依赖纯函数，见 §21） |
| `skill-evaluation.mjs` | `EVALUATION_UNAVAILABLE_TEXT, EVALUATION_VERDICT_IDS, EVALUATION_VERDICT_LABELS, EVALUATION_SOURCE_IDS, EVALUATION_SOURCE_LABELS, EVALUATION_RUN_FIELD_LABELS, EVALUATION_FORBIDDEN_OUTPUTS, buildEvaluationCase, buildEvaluationAssertions, compareEvaluationRuns, buildRuntimeEvidence`（**V1.0 的第 9 支**，见 §22） |

### 10.4 文案与本地化

- 跟随 DSH 的 locale 服务（`ctx.locale`），**不是**浏览器语言；命名空间 `dsh-skill-trace`。
- 静态键进 `zh`/`en` 字典；动态模板走显式 locale 分支。字典块的切分点是好几条守卫的基础（见 §13.1 的 `CLIENT_COPY_LIVE_OK`）。
- **只翻译插件自有界面文案**：收据证据、Skill 名与声明、工作区名、遗留的 output references / learning notes / validation results 都是本地源数据，永不翻译、不上传、不重写。
- 未知 locale 走 DSH 的英文回退；缺字典键时**保留源键可见**（宁可吵，不静默改写证据）。

---

## 11. 存储、隐私与禁止字段

### 11.1 落盘面

| 位置 | 内容 | 权限 | 命名 |
|---|---|---|---|
| `<dataRoot>/receipts/` | 会话收据 | 默认 | `sha256(sessionId)` |
| `<dataRoot>/preferences…` | 机器级偏好（版本 3） | 默认 | 固定文件 |
| `<dataRoot>/translations/` | 中文阅读版 | 目录 `0700`、文件 `0600` | `sha256(skillName\0sourceSha256\0targetLanguage)` |
| `<dataRoot>/lineage/` | **Skill 复刻血缘**（V0.8，一个目标 Skill 一条记录） | 目录 `0700`、文件 `0600` | `sha256(targetSkillName)` |
| `<dataRoot>/evaluation/` | **评测的 Case 与 Run**（V1.0，§22.7） | 目录 `0700`、文件 `0600` | `cases/<caseId 去掉 sha256: 前缀>.json`、`runs/<同上>/<runId>.json` |

`dataRoot` 来自 `config.dataRoot`；`receipt-store.mjs` 的默认根是 `~/.dsh/skill-trace/receipts`。译文写盘一律「临时文件 + `rename`」。**评测用同一套原子写**（`mkdir({recursive:true,mode:0o700})` → `.tmp` → `writeFile(...,{mode:0o600})` → `rename`），并且在写之前**深层扫描禁字段**（`sessionId` / 工具参数与结果 / `score` / `rate` / `variance` / `ranking` / `trend` …）：命中就拒绝写入，而不是悄悄丢掉。**血缘用同一套原子写**（`mkdir({recursive:true,mode:0o700})` → 带 pid 与随机后缀的 `.tmp` → `writeFile(...,{mode:0o600})` → `rename`），并且**不复用 translation store**：两者的键、生命周期与拒绝字段都不同（`FR-EVO-007`）。

### 11.2 明确不落盘 / 不外发的东西

1. **`SKILL.md` 定义正文**：现读现返，永不落盘（`docs/PRIVACY.md`）。
2. **工具参数与结果内容**：从不读取（§5.2）。
3. **绝对路径**：不外发。已安装投影只允许 `{name, description, provider, invocation:{modelInvocable,userInvocable}}`，**V0.9.2 起再加 `addedAt`（毫秒数或 `null`）与 `lineage: {sourceSkillName, createdAt}`**（来源名在 core 只做形状检查、在宿主还经 `safeSkillName` 一道，见 §20.3）—— 两个新字段都不带路径：一个是从目录 birthtime 取来的数、一个是来源名与时间戳；复刻响应只给 `pathKind`。`skill-clone-path.mjs` 内部拿到绝对路径，但**绝对路径不出宿主**。
4. **`sessionId` 不进译文键、不进内存缓存之外的任何持久结构**；`translationStoreKey` 的实现体里连 `session` 这个词都不许出现。
5. **`learningNotes[]` / `validationResults[]` 是遗留数据**：只读、不迁移、不派生状态 —— 当前产品没有任何写入入口（既没有笔记路由，也没有验证结果路由，也没有编辑组件）。
6. **「改前」的修改快照**（V0.9.1，§19）：只在**宿主内存**里活 30 分钟（上限 32 份）。不落盘、不进收据、不进会话日志、不上传；进程一重启就消失，这时界面只说「本次修改前状态不可用，暂时无法比较本次修改的内容。」。
8. **评测的落盘内容**（V1.0，§22.7）：这是本插件**第一处把用户自己的话写进磁盘**的地方 —— Case 里存的是**生成出来的任务 Prompt**（由定义正文经确定性函数派生，用户不手打）、观察项与回归约束；Run 里存的是**用户自己的判定**（或 Agent 自报）、运行条件元数据、以及运行时活动的**汇总**（工具名 + 次数）。两者都不含 `sessionId`、会话正文、工具参数或结果、绝对路径、token，也不含任何聚合量 —— 聚合量在落盘层是禁字段，深层扫描拒绝写入。上限（200 个 Case、每个 Case 50 次运行）超出按最旧删；界面上的「删掉这个 Case」会连它的运行一起删。
7. **实例验收的生成结果与用户意图**（V0.10.0，§21）：`prompt.text`、`promptText`、观察项、回归约束、`unavailable`、`limitations`，以及用户写的那句修改意图（页面 state `lastIntent`）**只活在详情页的前端状态里**（与本次修改、本次 diff、静态验收同级），不落盘、不进收据、不进会话日志、不上传、不新增任何持久结构；页面刷新后重新生成（同一份输入必然得到同一份结果）。**观察项一个字都不进 Prompt** —— 这两样东西在载荷里就是两个字段（`prompt.text` / `observations`），不是同一段文本的两半。

唯一离开本机的东西，是用户在详情页主动点「中文阅读版」时**发给用户自己配置的模型 provider**的定义正文。V0.9.1 的「交给 Agent」另有一条出边，但口径不同：那条代发的消息里只有**用户自己写的意图**、结构化后的修改范围与验收目标（**不含 `SKILL.md` 正文**），而它进入会话这件事本身就是用户点那个按钮的动作。

### 11.3 命名偏差的历史遗留

`GET /skill-trace/catalog` 的注释仍说它「暂用 `/installed`」（D2）。源码字面已经收口到 `/catalog`。读到那条注释时以路由表为准。

---

## 12. 布局合同与视觉不变量

### 12.1 高度必须量，不能按视口

```
Browser viewport ≠ DSH content area ≠ plugin content area
```

链（每一层都要 `height:100%` 或 `flex:1` **并且**带 `min-height:0`）：

```css
[data-plugin="dsh-skill-trace"] { height: var(--st-host-h, 100%); }
.st-shell  { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.st-layout { flex: 1; min-height: 0; display: grid; }
/* page root（列表页或 .st-detail） */ { min-height: 0; }
```

- 高度是**量出来的**：向上找最近的定高祖先，把「本根顶部到该祖先底部」的距离发布成 `--st-host-h`；量不到时降级为 `100%`。
- **链条里不许出现 `100vh` / `100dvh` / `calc(100dvh - Npx)`。**
- 少了 `min-height:0`，flex 项不肯收缩，整条链会悄悄退回内容高度 —— 测试可能全绿而视口下高度全错。
- `test/layout-contract.test.mjs` 守着四件事：根规则必须在**花括号深度 0**（一个多删的 `}` 曾把整条根规则关进 `@media(max-width:1050px)`）、必须带排版与布局基座、高度链不许用视口单位、花括号必须平衡。

### 12.2 视觉 token 与三条数值守卫

- **颜色只能来自 token。** `--st-*` 优先映射宿主 `--dsw-alias-*`（白名单 18 个），实现值只作回退。样式里出现字面色值会被 `VISUAL_TOKENS_OK` 拒绝 —— 那样暗色主题跟着坏。
  - 白名单：`--dsw-alias-bg-base`、`bg-layer-1`、`bg-layer-2`、`bg-layer-3`、`border-l1`、`border-l2`、`border-l3`、`interactive-bg-hover`、`interactive-bg-hover-accent`、`label-primary`、`label-secondary`、`label-tertiary`、`link`、`markdown-code-block`、`state-business-primary`、`state-error-primary`、`state-success-primary`、`state-warn-primary`。
  - **未知 alias 直接失败**：`--dsw-alias-border-strong` 与 `--dsw-alias-warning` 根本不存在；`--dsw-alias-brand-primary` 存在但语义是主按钮对比色，配 `color:white` 会白底白字。
- **§26 字号带**：所有 `font-size:Npx` 必须 `10.5 ≤ N ≤ 18`；页面标题 ≤18px，辅助文字 ≥10.5px，小节标题 14–16px，卡片标题 13–15px。
- **§27 圆角 / 分隔比**：`border-radius` 声明数 ÷ `border-bottom:1px solid` 声明数 ≤ **5.5**，且分隔线 ≥ 3。**结构靠分隔线，圆角是例外。** 新写的列表块若每个都是带圆角的卡片，这个比值会立刻冲红 —— 正确做法是把它改成带 `border-bottom:1px solid` 的分隔行，而不是调比值或加分隔线凑数。
- 明确禁止：`backdrop-filter`（玻璃拟态）、`text-shadow`（发光）、`border-radius:14–19px+`（大圆角卡片）、emoji 当图标。

### 12.3 按字面匹配的几个数值

| 规则 | 值 |
|---|---|
| §22 顶栏 | `.st-topbar { … min-height:48px … }`，**既不画自己的底色、也不画自己的分隔线**（不得含 `background:` 与 `border-bottom`） |
| §8.2 详情事实列 | `grid-template-columns:280px minmax(0,1fr)` |
| §9.3 文档目录 | `grid-template-columns:170px minmax(0,1fr)` |
| 卡片描述 | `.st-installed-card-desc` / `.st-skill-card-desc` 必须带 `-webkit-line-clamp:4` 与 `overflow:hidden` |
| 元信息行钉左下 | `-meta` 必须 `margin-top:auto`；`.st-skill-card-meta` 还须 `padding-top:10px` |
| 两个一级列表同起点 | `.st-installed` 与 `.st-page` 的 padding 必须逐字相同：`10px 24px 28px` |
| 小节 / 卡片标题 | `.st-audit-doc h2.st-audit-doc-heading` → `14–16px`；`.st-detail-card h3` → `13–15px` |

---

## 13. 契约守卫（30 组）

`npm run verify` 跑 `scripts/verify-project.mjs`。这些断言全部是**源码文本层**的：它们钉住路由字面、必须出现在界面里的句子、不许出现的词、CSS 的数值区间、组件的顺序。**每一条红都对应一次真实事故。**（该文件的行数不在本文里写死，见 §0.1 D9。）

### 13.1 守卫表

| # | marker | 钉住什么 |
|---|---|---|
| 1 | `PROJECT_STRUCTURE_OK` | 必需文件存在、对 8 个文件跑 `node --check`、包名 `dsh-skill-trace`、`dsh.client.inject` 必含 `…ui-conversation` 与 `…locale` |
| 2 | `CLIENT_CONTRACT_OK` | 客户端必含约 49 条文案/结构字面（`st-skill-card`、`st-installed-grid`、`st-detail-doc`、`st-trace-state`、`工作区未连接`、`返回 Skill 列表`、`指令指纹比对` …）；禁 `Promise.all([buildReceipt`、`generateImage`、`window.confirm(`、对 `methods/events/learningCards/traceEvents/validationResults/outputs` 做 `.slice(0,N)`、旧词表 |
| 3 | `CLIENT_COPY_LIVE_OK` | **英文字典里的每个键都必须在去掉注释后的源码里被读到**，否则报 `client dictionary keys no code reads (comments are not consumers)` |
| 4 | `SOURCE_PRIVACY_FIELDS_OK` | `reduceRuntimeCall` 的函数体（到 `function reduceRuntimeResult` 之前）不得含 `arguments` / `content`；必须有 `runtimeEventOverflow: receipt.runtimeEventOverflow + dropped` |
| 5 | `LEGACY_LEARNING_FIELDS_OK` | 收据仍保留 `learningNotes` / `validationResults` / `buildLearningCards` / `setValidationResult`，且它们是只读遗留字段 |
| 6 | `SESSION_FORMAT_TOOL_RESULT_CONTRACT_OK` | reducer 同时认 V3 的 `block?.type === 'tool-result'` 与 V4 的 `?? message` 两种形状 |
| 7 | `OBSERVATION_SURFACE_OK` | 观测面必须含 `'user/message'`、`'turn/start'`、`carriesSkillEvidence(event)`、`runtimeEventOverflow`、`skillEvidenceSignature`；写盘门禁字面 `event.type === 'turn/end' \|\| skillEvidenceGained` |
| 8 | `RUNTIME_MODEL_OK` | 运行事件模型：`classifyCapability` / `aggregateInvocations` / `deriveRetryEvent` / `RETRY_RULE` / `RUNTIME_EVENT_SOURCES = ['dsh','derived']` / `unresolved-request` / `orphan-result`；reducer 必须 `from './runtime-events.mjs'`；**禁** `getTime()` 与 `Date.now() -`（不许用时间戳排序） |
| 9 | `CORRELATION_PROVENANCE_OK` | 精确字面 `EDGE_TYPES = ['contains', 'spawns', 'retries', 'follows']` 与 `NODE_TYPES = ['session','turn','skill','tool','cli','mcp','subagent']`；`Graph completeness < Graph truthfulness`；图模型剥注释后不得含 `viewport` / `zoom` / `position:` / 坐标；catalog 的 `label` 不许被读 |
| 10 | `ALIGNMENT_NO_SCORE_OK` | 精确 `ALIGNMENT_RELATIONSHIPS = ['runtime-supported','intent-supported','partial','insufficient','unknown']`、`STEP_EXTRACTION_CHANNELS = ['heading','ordered-list']`、`scored: false`；禁 `not-observed` / `skipped` / `not-done`；禁 `complianceRate` / `percent` / `ranking` |
| 11 | `SESSION_LOG_RECOVERY_OK` | 日志恢复导出齐全（`readSessionEvents` / `findSessionLogFile` / `decompressZstdFrames` / `findZstdFrameStarts` / `SESSION_LOG_MAX_BYTES` / `ZSTD_MAGIC`）；多 frame 切片 `const end = starts[index + 1] ?? buffer.length`；`sessionId.includes('/')` 拒绝路径穿越 |
| 12 | `CLIENT_BUNDLE_CONTRACT_OK` | `CLIENT_SEED_MODULES` 含四个 React 入口；`exports['./client'] === './dist/client.js'`；`files` 含 `dist`；有 `scripts.build` / `scripts.pretest`；`shippedBundleIsFresh()`；bundle 含 `__ModuleLoader__.load({` 与 `id: …`；`externalRequiresOf(bundle)` ⊆ seed |
| 13 | `RECEIPT_SECTIONS_OK` | 收据投影仍含 `methodCount:` / `eventCount:` / `methods,` / `events,` / `turnDetails,` / `summary,` / `: 'mixed'`；宿主必含 `list: buildSessionSkillList(`，客户端必含 `body?.list ?? null` |
| 14 | `VISUAL_TOKENS_OK` | 禁止 glassmorphism / glow / 大圆角 / emoji 图标；字号带；顶栏 48px 且无底色无分隔线；描述 4 行；meta `margin-top:auto`；两个一级列表 padding 一致；280px / 170px 两处 `grid-template-columns`；圆角/分隔比 ≤5.5 且分隔线 ≥3；颜色只能来自 token；alias 白名单 |
| 15 | `HOOK_ORDER_OK` | 同一组件体内最后一个 `React.use*` 不得排在第一个提前 `return` 之后，失败信息 `a hook must never follow an early return in the same component — React #310 unmounts the whole conversation.view slot` |
| 16 | `PREFERENCE_VERSION_OK` | `preference-store.mjs` 的 `PREFERENCES_VERSION` 必须等于客户端的 `PREFERENCE_VERSION` |
| 17 | `TRANSLATION_PERSISTENCE_OK` | translate 路由切片内禁 `store.write` / `syncReceipt` / `preferenceStore.write` / `.append(`；必须 `saved: await persistTranslation(`；`skill-translation.mjs` 不得落盘；store 必须 `0o700` / `0o600` / `rename(` / `FORBIDDEN_RECORD_FIELDS` / `translationStoreKey`；键函数体内不得匹配 `/session/i`；`persistTranslation({` 后 600 字符不得含 `sessionId` |
| 18 | `TRANSLATION_SEGMENTED_OK` | 分段与保护函数齐全；`runSegmentedTranslation` 后 600 字符内必须 `maskProtected(definitionText)`；必须 `reanchorChunk({ source, translation: verdict.translation })`；路由必须报 `chunkCount` / `fallbackChunks` / `fallbackReasons`；客户端必须含 `TRANSLATION_RULE_TEXT = {`、`fallbackReasonSuffix` 与内存缓存调用 |
| 19 | `SKILL_FIRST_DETAIL_OK` | 必须定义 `SkillCard` / `CurrentSkillPage` / `SkillDetailPage`；不得有 `SkillWorkbench` 或 `st-skill-item`；`SkillDetailPage` 体内禁 `localStorage`/`sessionStorage`/`indexedDB`/`sendBeacon`，必须含 `setTranslation(`；不得写死返回目标 |
| 20 | `SKILL_FRAMEWORK_OK` | 证据词表的**解析后标签**不得含禁用词；`intent-supported.zh !== partial.zh`；`SkillFramework` 体必须含 `flow?.steps`，不得含 `runs`/`invocations`/`observedNodeIds`/`evidenceIds`/`runtimeEvidence`；四层顺序字面；`renderSkillMarkdown(` 调用点恰为 1；表格渲染与 `markdown-table.mjs`；禁用重型 Markdown/画布依赖 |
| 21 | `RELEASE_ASSETS_IN_SYNC_OK` | README 的「当前公开版为 `x`」等于 `package.json` 版本；README 的 `github:` 安装示例 `#v…` 锚点等于同一版本 |
| 22 | `FINGERPRINT_RESERVED_OK` | 六 个 Pattern 逐字按序；两张表与之一一对应；给一个**有内容的图**之后仍必须 `derived: false` / `status: 'reserved'` / 每个 slot `value === null` 且 `status === 'not-yet-derived'`；`sources` 非空；`note` 必须含「尚未派生」；`evidenceAvailable` 如实报数 |
| 23 | `GUARD_MARKERS_ARE_BACKED_OK` | 扫 `scripts/verify-project.mjs` 自己：每个 `console.log('…_OK')` 所在的那一段（段界是**顶格的 `}`**）里必须出现过 `throw new Error`；且带断言的 marker 少于 15 条也报错（防止这条守卫自己退化成永远为真的空循环） |
| 24 | `SKILL_LINEAGE_OK` | **血缘的 schema 与落盘面**（V0.8）：记录字段是闭集，禁 `content` / `body` / `sessionId` / 绝对路径；`skill-lineage-store.mjs` 必须含 `0o700` / `0o600` / `rename(` / 键函数 / 拒绝字段清单；`src/core/skill-lineage.mjs` 与 store **都不得出现 `receipt` / `localStorage` / `sessionStorage`**；宿主里 `writeLineage(` 的调用点**必须排在 `readBackClone(` 之后**（顺序断言，挡住「没回读就写血缘」）；收据的 `publicReceipt` 字段表**不得新增键**（复刻血缘永不进收据） |
| 25 | `SKILL_DIFF_NO_JUDGEMENT_OK`（**两个半都已落地**：宿主那半 Phase 2、客户端那半 Phase 3） | **差异的判断边界**（V0.8）：`/skill-trace/diff` 这个字面必须进宿主的 `requiredText`（否则新路由**没有任何守卫**）；`src/core/skill-diff.mjs` 必须导出 `DIFF_WORDS` / `DIFF_SOURCE_WORDS` / `DIFF_UNAVAILABLE_MESSAGE` / `DIFF_CHANGE_KINDS` / `DIFF_SHAPE_FIELDS`；五个事实词（`新增` `删除` `修改` `保持不变` `无法比较`）必须逐字在；`来源内容已发生变化` 与 `当前无法读取来源 Skill，无法完成差异比较。` 必须逐字在；去注释后的模型里**不得出现** 12 个判断词（`更优秀` `更完整` `更合理` `质量提升` `质量下降` `优化成功` `改进成功` `推荐保留` `建议删除` `建议采用` `最佳` `落后`）；宿主必须注册 `'/skill-trace/diff'`、必须调用 `buildSkillDiff(`、必须有 `DIFF_ERROR.NO_LINEAGE`；`handleDiff` 的函数体**不得出现 409**（源动过是事实，不是失败请求），且必须含 `sourceOriginalSha256`。**客户端那半**（Phase 3 补齐）跑在**去掉英文字典之后**的源码上：`查看差异` 与三句来源状态（`来源内容已发生变化` / `来源内容未发生变化` / `无法读取来源`）必须逐字在；那句读不到时的完整话必须逐字在；`diff-unavailable` 与 `diff-error` **两处各自**都要有 `role="alert"`（只查一次的话，删掉一个另一处还在，断言照样为真）；界面词表的键名必须正好是 `added,modified,removed,unavailable,unchanged` 五个；从 `const DIFF_TABS` 到 `SkillDetailPage` 的**v0.8 界面切片**（去注释后）里一个判断词都不许有；没有血缘时**不许**去问差异路由 |
| 26 | `SKILL_VALIDATION_OK` | **验收的规范边界与接线**（V0.9.0，§18）：三态恰好 `pass` / `needs-fix` / `unknown`、三档恰好 `error` / `warning` / `info`、中文逐字「通过 / 需要修正 / 无法判断」；两个新模块**去注释后**不得出现 11 个评分词（`score` `rank` `quality` `percent` `rating` `grade` `weight` `评分` `分数` `等级` `优秀` `最佳` `推荐度`）；平台差异三条字面（`MS-DIR-001` = microsoft/**error**、`OA-DIR-001` = openai/**warning**、`CORE-BODY-001` = common/**warning**）且 **DSH 规则块里不得出现任何目录名规则**；验收器必须**恰好一支 import**（`./skill-profiles.mjs`）、禁 `skills.register` / `registerProvider` / `fetch(` / `process.env` / `readFile` / `writeFile` / `React.`；宿主必须调 `buildSkillValidation({`、必须有 `readSkillFile({ skillFile })` + `content: readable ? facts.text : ''`、必须有 `buildSkillDetail({ … validation })` 且 `skill-view-model.mjs` 里有 `validation: options.validation ?? null`；**客户端**：`SkillValidationPanel` 排在 `SkillDiffPanel` 之前、必需 `data-role` 字面齐全、三态分支**逐字整行**（`if (status === 'needs-fix') return localized('需要修正'`——写成 `if (false && …)` 仍含该片段，第一版断言就是这样被骗过去的）、**prop 接线逐字**（`function SkillValidationPanel({ validation, validationFieldMissing })` 与 `h(SkillValidationPanel, { validation, validationFieldMissing })`）、**不许把双语对象当 children**（`raw(profile.label ?? profile.id)` 必须不存在，`profile.label?.zh` 必须存在）、发现行必须带规则标题、验收块里不得出现 12 个「已经发生」的词与评分词 |

| 27 | `SKILL_MODIFICATION_OK` | **修改的边界与代发接线**（V0.9.1，§19）：`MODIFICATION_SOURCE_KIND` 必须是字面常量 `'skill-intelligence-modify'`（不许拼出来），代发的消息必须带自己的 source kind，**且消息里必须有一句「动手之前：先说明你打算怎么改……有拿不准的地方就用提问工具问用户」，顺序必须是 12 条协议 → 动手之前 → 做完之后**（`FR-MOD-003` 只提这个要求、不代办也不解析，但不提就等于 Agent 直接动手）；`MODIFICATION_CONTRACT_RULES` **恰好 12 条**，其中 read-back、第 12 条「不得自动改会话标题」、以及**协议里不许写 `/name`**（DSH 只有 `/rename`，那是会话标题）逐条断言；6 个范围 id 与 `scripts` / `assets` 两项锁死（**界面锁死的两项必须就是核心模块锁死的那两项**，且锁死项画出来但不可点）；三态恰好 `unchanged` / `changed` / `unavailable`，没有快照时必须给 `available: false` + `snapshot-missing` + `unavailable`（既不许抛错，也不许空口比较），快照丢了的固定句逐字在；来源指纹不同时的说法逐字是「来源 Skill 在本次修改期间发生变化」；快照 TTL 30 分钟、坏输入返回 `null` 而不抛；宿主必须注册 `POST /skill-trace/modify`、必须用**当前会话**的 `followup()` 代发（不许另起 Agent、不许开第二套会话）、代发失败**必须先释放刚存下的快照**；**客户端**：四个组件齐（演进卡 / 修改对话框 / 本次修改对比 / 差异面板）且顺序为 演进卡 → 修改对话框 → 本次修改对比 → 差异面板，有血缘与没有血缘**两个分支都要有「修改 Skill」入口**（按钮定义一次、两个分支各用一次），「交给 Agent」与「对比本次修改」都必须真的打 `/skill-trace/modify`，没有修改事务时整块**不渲染**，详情页主列顺序为 验收 → 本次修改对比 → 框架 → 运行逻辑 → 步骤证据 → `SKILL.md`，界面 `data-role` 集合与核心模块的锁死项对账 |

| 28 | `INSTALLED_ORDERING_OK` | **已安装列表排序的边界与接线**（V0.9.2，§20）：`src/core/installed-view.mjs` **不得有 `import`**（客户端要 `require` 它）；三个限制码 `added-at-unavailable` / `added-at-partial` / `lineage-unavailable` 逐字在；宿主必须含 `roots: await skillRootCandidates({ cwd })`、`lineageByName: await lineageByTargetName(),`、血缘读失败那句 `console.error('[dsh-skill-trace] lineage read failed', error)` 与投影字面 `{ sourceSkillName: source, createdAt: record.createdAt }`；**客户端切片**（`function formatAddedAt(` 到 `function Workbench(`）里必须含 `'data-role': 'installed-order'`、`if (!ordering \|\| typeof ordering !== 'object') return null`、`formatAddedAt(skill.addedAt) ? h('span'` 与 `` `复刻自 ${skill.lineage.sourceSkillName}` ``，且**不得出现 `.sort(`**（客户端只念不排）、**整份客户端不得出现 `added-desc-then-name`**（规则名不写死）、切片里不得出现「今天 / 昨天 / 刚刚 / 几分钟前」（时间戳只能是绝对值） |
| 29 | `SKILL_INSTANCE_TEST_OK` | **实例验收的生成边界与接线**（V0.10.0，§21）：生成器**代码级零依赖**（去注释后不许出现 `import ` / `require(` / `Math.random` / `Date.now` / `new Date` / `navigator` / `fetch(` / `setTimeout`）；四块结构 `【任务】【工作目标】【输出要求】【注意】` **顺序固定**，且 Prompt 必须逐字含「请直接完成任务，不需要解释你为什么选择某个 Skill。」；**Prompt 里不许出现范围 id**（`skill-md-workflow` / `skill-md-rules` / `skill-md-description` / `references/` / `assets/` / `scripts/`）与元信息 / 禁用词（`本次修改` / `这次修改` / `刚才的修改` …）；观察项**必须是疑问句**、**一条都不许进 Prompt**（两样东西必须是两个字段）；同一份输入两次调用逐字节一致；结果里不许出现结论性词汇（`成功率` / `通过率` / `评分` / `得分` / `优秀` / `合格` / `成功` / `失败` / `已执行` …）；三种不可用如实说（`no-comparison` / `no-changed-scope` / `no-definition`；第四种 `comparison-unavailable` 由测试文件覆盖），且**绝不退回一个什么都能用的通用任务**；**「6b」段（本轮新增）**：意图点名了某个**确实被 diff 改动过**的范围时，主范围跟着用户说的话走（`trace.hintedScopeId` 命中；点到了没改过的范围则不作数）、回归约束**按框架产出**且不含被碰过的角色（fixture 里「运行逻辑」被碰过、「输出」没碰过）、`regression.source === 'framework'`、**意图原文不出现在结果的 `JSON.stringify` 里**、`trace.sources.join(' ') === 'intent scopeIds comparison description framework'`（不在场的不出现）、diff 自己的变更小节标题（fixture 里是「步骤 4」）不许出现在 `prompt.text`、源码里必须有 `export const buildInstanceTest = buildSkillInstanceTest`；**客户端**：第 8 支 `require('../../core/skill-instance-test.mjs')` 在，且 `require('../../core/…')` 总数**恰为 9**（V1.0 起客户端共九支，这条断言随之从 8 改成 9，见 §22.9 第 9 支），`mod-instance-generate` / `-copy` / `-prompt` / `-observation` / `-regression` / `-unavailable` 六个 `data-role`（这一屏一共 **14** 个 `mod-instance*` data-role，新增的 `mod-instance-trace` 已进 `guardedRoles` 白名单）与那句弱提示逐字在，另加 5 条 needle（`INSTANCE_TEST_GOAL_TITLE` / `INSTANCE_TEST_PROMPT_TITLE` / `'data-role': 'mod-instance-trace'` / `intent: lastIntent || null` / `framework: detail?.framework ?? null`）；界面与模块里不许出现被禁用的产品名（`Skill Run` / `Skill Execute` / `Skill Benchmark` / `Skill Evaluation` / `测试中心`） |
| 30 | `SKILL_EVALUATION_OK` | **评测的边界与接线**（V1.0，§22.9）：① 核心模块的固定面（生成器版本 `1.0.0`、四段 id 顺序 `trigger load use outcome`、三条不等式逐字、条件表恰好四项 `model provider reasoningEffort contextWindow`、判定 `pass fail unknown`、来源 `protocol user agent`）；② **卡片区**（从 `client.indexOf('V1.0「Skill 评测」卡')` 到 `client.indexOf('function SkillDiffPanel(')`）必须含 30 个 `eval-*` data-role 与 `.inequalities` / `.inequalitiesNote` / `这一版刻意不出现的东西`，且**不得含** `EVALUATION_FORBIDDEN_OUTPUTS` 里任何一个词；③ 客户端全文含 `buildEvaluationCase` / `onGenerate: generateEvaluationCase` / `onCapture: captureEvaluationRun`；④ 宿主含 `'/skill-trace/evaluation'` / `function handleEvaluation` 与动作名断言，`docs/PRIVACY.md` 含 `evaluation/cases` 与 `evaluation/runs` |

> **诚实记录（D5，2026-10-02 修）**：这份文件此前有**两个没有断言的 marker**。`FIVE_LAYER_MODEL_OK` 守的模块在 v0.6 删运行图谱画布时一起删掉了，marker 却留在输出里继续宣布契约成立 —— 正是同一份守卫文件在 `572-578` 行自己写下的那个反模式。处理方式分两种：**守的东西已经不存在 → 删掉 marker**；**守的东西还在 → 补上真断言**（`FINGERPRINT_RESERVED_OK`）。另外新增 `GUARD_MARKERS_ARE_BACKED_OK` 把这整类事故变成不可能的：它每次运行都会重新扫一遍本文件，任何「只有 `console.log` 没有断言」的 marker 都会让它红。组数仍是 **23**（删一、补一）。

### 13.2 守卫的写法纪律

1. **客户端文案断言跑在「去掉英文字典之后」的源码上。** 切分点是 `client.indexOf('  const EN = {')` 到 `client.indexOf('\n  }', dictStart) + 4`，`clientCode = client.slice(0, dictStart) + client.slice(dictEnd)`。**一句只活在 `const EN = { … }` 里的文案不算存在。** 曾有一批断言因为文案留在字典里而长期空转。
2. **不要断言一个已经不存在的页面。** 客户端契约**反向**钉住已删路由与已删函数（`buildRuntimeGraph` / `computeRuntimeLayout` / `buildCatalogView` 等）：**删掉的东西不许悄悄回来。**
3. **改守卫时问一句：这条断言失败过吗？把它写成 `true` 会怎样？** 「测试通过」不等于「测到了」。
4. **一个 marker 必须由同一段里的断言撑着。** 删断言块时，**在同一次改动里删掉它的 marker**；守的东西还在就补断言。这条纪律由 `GUARD_MARKERS_ARE_BACKED_OK` 自己执行，不靠记性。

守卫 `PROJECT_STRUCTURE_OK` 与 `CLIENT_CONTRACT_OK` 之间的分工也与这条纪律有关：前者管文件与包元数据，后者管界面真的写了什么。

---

## 14. 测试策略

### 14.1 规模与纪律

- `npm test` = `node --test`，**636 项全绿**（V1.0 `1.0.0` 发布口径；`0.10.0` 发布口径是 **590** 项；V1.0 新增 4 个评测测试文件（共 **45** 项，见下一条）并给 `test/client-render-smoke.test.mjs` 加了 1 条评测卡渲染烟测（26 → **27** 项），合计 590 → **636**（+46）；`0.9.2` 发布口径是 **561** 项，含 V0.9.0 的 36 项与 V0.9.2 的排序 / 加入时间 / 血缘用例；V0.10.0 早期工作树时为 **584 项**，V0.9.1 工作树时为 **553** 项，`0.8.0` 发布时是 **474** 项，`0.7.1` 发版时 431；V0.8 新增 4 个测试文件，另给 `test/client-render-smoke.test.mjs` 加了 8 条烟测）；`pretest` 会先重建 `dist/client.js`，因此「跑测试」也顺带保证产物不 stale。
- `test/` 下 **52** 个 `*.test.mjs`（V1.0 `1.0.0` 发布口径；`0.10.0` 发布口径是 **48** 个，V1.0 新加 4 个文件：`test/skill-evaluation.test.mjs`（**17 项**）、`test/evaluation-route.test.mjs`（**10 项**）、`test/evaluation-store.test.mjs`（**9 项**）、`test/run-conditions.test.mjs`（**9 项**），另给 `test/client-render-smoke.test.mjs` 加了 **1** 条评测卡渲染烟测（该文件现 **27** 项）；`0.9.2` 发布口径是 47 个，`0.8.0` 发布时 41，`ls test | wc -l` 还会多算一个非测试条目 `helpers/`）。**V0.10.0 新增 1 个文件**：`test/skill-instance-test.test.mjs`（**27 项**，实例验收的生成边界与纯函数纪律，见 §21.6），另在 `test/client-render-smoke.test.mjs` 原有的实例验收渲染用例里补断言（该文件仍 **26** 项）。**V0.9.1 新增 3 个文件**：`test/skill-modification.test.mjs`（22 项，修改契约 / 范围解析 / 差异三态与三层）、`test/modification-snapshot-store.test.mjs`（9 项，TTL / 上限 / 释放 / 坏输入）、`test/skill-modification-route.test.mjs`（9 项，路由的两个动作与五条失败路径，含**代发失败必须先释放快照**），另给 `test/client-render-smoke.test.mjs` 加了 **2 条烟测**（V0.9.1 落地时为 24 项）。**V0.9.0 新增 3 个文件**：`test/skill-profiles.test.mjs`（9 项，规则表的机械守卫）、`test/skill-validation.test.mjs`（21 项，纯函数行为 + 假指控回归）、`test/skill-validation-route.test.mjs`（6 项，真机式路由驱动：假 registry **刻意只给正文**，与真 provider 一致）。**V0.8 设计的 4 个新文件已全部落地**（Phase 1：`test/phase19-skill-lineage.test.mjs` / `test/phase19-lineage-store.test.mjs`；Phase 2：`test/phase19-skill-diff.test.mjs` / `test/phase19-diff-routes.test.mjs`）。**宿主侧的血缘落线证据不单开文件**，加在 `test/phase18-clone-routes.test.mjs` 里 —— 血缘就是复刻路由的产物，它的端到端证据该跟复刻路由放在一起。**V0.9.2 不新增文件**：用例补在 `test/installed-view.test.mjs`（该文件现 **17** 项：倒序与两种兜底、加入时间三态、`addedAt` / `lineage` 的形状校验）与 `test/client-render-smoke.test.mjs`（该文件现 **26** 项：有 `ordering` 时列表头渲染、没有时不渲染、读不到时间时文案含「读不到加入本机的时间」；V0.10.0 再加一条实例验收渲染测试，见 §21.6）。
- 纯函数优先：`src/core/` 的模块都是可单独测的纯函数或纯数据模块，测试不需要起宿主。

### 14.2 测试文件分工

| 文件 | 管什么 |
|---|---|
| `test/layout-contract.test.mjs` | 样式表：根规则深度 0、高度链、无视口单位、花括号平衡 |
| `test/client-style-lifecycle.test.mjs` | 用**构建产物** `dist/client.js` + 假 document 验样式生命周期（插入、替换、移除） |
| `test/client-render-smoke.test.mjs` | 真实元素树 + 降级器；抓渲染期抛错与「界面真的写了什么」。`55f092c` 起还守着**请求体的两半**：从宿主源码读出它真的读哪些 `payload.*` 字段，要求客户端发出去的请求体覆盖它们；以及**组件解构出来、又没有兜底的 prop，渲染处必须真的传**。V0.8 起另守三条：没有血缘时**不许猜一个来源**、也不许出现「查看差异」；来源状态的三句话**必须互斥**（「变了」/「没变」/「没有可比的指纹」塌成两句就是从这一行开始的）；读不到来源时**不许渲染成一张空表**（空表读起来就是「没有变化」，而这一屏最坏的失败方式恰恰是看起来最正常）。V0.9.1 起另加两条：没有修改事务时「本次修改对比」**整块不渲染**；「交给 Agent」与「对比本次修改」都必须真的打 `/skill-trace/modify`。V0.9.2 起另加一条：列表头只在 `ordering` 真的来了才说话 —— 没有 `ordering` 时 `InstalledOrderNote` 返回 `null`，一个字的顺序都不宣称。V0.10.0 起另加一条：实例验收那一屏**交出去的是任务，不是结论** —— 生成的 Prompt 里一条观察项都不许有，拿不到东西时如实说出来、而不是退回一个什么都能用的通用任务（该文件现 **26** 项，见 §21.6） |
| `test/client-hook-order.test.mjs` | `scanHookOrder(source)` 零违规 |
| `test/client-bundle.test.mjs` | bundle 契约（seed、externals、注册包装） |
| `test/phase15-skill-first-ia.test.mjs` | Skill-first IA 的 A1–A12（含锚点必须指向真实 outline entry） |
| `test/phase16-skill-framework.test.mjs` | 框架与运行逻辑的纯函数行为 + 禁用词 + 客户端必须真的引用每条 limitation |
| `test/phase17-skill-clone.test.mjs` / `phase18-clone-routes.test.mjs` / `phase18-skill-clone-writer.test.mjs` | 复刻：纯逻辑、路由契约、写入器（`mkdir` 不带 `recursive`、回滚、回读） |
| `test/translation-store.test.mjs` / `translation-cache.test.mjs` / `translation-segmentation.test.mjs` / `skill-translation.test.mjs` | 译文落盘、内存缓存、分段与结构校验 |
| `test/session-format-v4-contract.test.mjs` | V3 / V4 两种会话格式，**由真实捕获的 V4 事件构造** |
| `test/receipt-store.test.mjs` / `preference-store.test.mjs` / `source-snapshot.test.mjs` / `installed-view.test.mjs` / `markdown-table.test.mjs` / `flow-evidence.test.mjs` | 各纯模块（`installed-view.test.mjs` 现 **17** 项，含 V0.9.2 的排序 / 加入时间 / 血缘用例） |
| `test/trace-reducer.test.mjs` / `phase0-*` / `phase1-runtime-model` / `phase2-*` / `phase3-alignment` / `phase8-fingerprint-and-thresholds` / `phase9-skill-runtime-scope` / `phase12-evidence-promotion` / `phase13-skill-run-audit` / `phase14-definition-view` / `phase25-v06-acceptance` | 证据模型、关联、对齐、范围、验收 |
| `test/host-policy.test.mjs` / `host-write-policy.test.mjs` / `host-session-log-contract.test.mjs` | 宿主策略：写盘门禁、隐私边界、日志恢复契约 |
| `test/phase19-skill-lineage.test.mjs`（V0.8） | 血缘纯逻辑与 schema：字段闭集、拒绝多余与禁止字段、`sourceRepository` 只在被确认时才有、`catalogObservation` 两态、**手动复制 / 内容相似不产生血缘** |
| `test/phase19-lineage-store.test.mjs`（V0.8） | 血缘落盘：`0700` / `0600`、原子写、**一个目标一条记录**（同名再复刻是覆盖而不是追加）、`delete`、坏 JSON 不算记录、**绝不读收据** |
| `test/phase19-skill-diff.test.mjs`（V0.8） | 三层差异纯函数：结构（新增 / 删除 / 改变小节）、内容（按 Markdown 结构组织的行级差异）、资源（新增 / 删除 / 变化）；`unchanged` / `changed` / `unavailable` 三态；`skill-md` 模式的资源解释；词表闭集 |
| `test/phase19-diff-routes.test.mjs`（V0.8） | `/skill-trace/diff` 的路由契约：缺 `sessionId` / `skillName` 的报文必须是**人话**；来源读不到 → `unavailable` 且**不许谎报「无变化」**；响应**不含绝对路径**；**复刻成功才写血缘**（回读失败 ⇒ 无血缘） |
| `test/skill-modification.test.mjs` / `test/modification-snapshot-store.test.mjs` / `test/skill-modification-route.test.mjs`（V0.9.1） | 修改契约（12 条 + 6 个范围 id + `scripts` / `assets` 锁死）、代发消息的正文、差异三态与三层变化、来源三态措辞；快照库的 TTL / 上限 / 释放 / 坏输入；路由的两个动作与各条失败路径（`invalid-request` / `missing-intent` / `unknown-skill` / `session-not-live` / `skill-file-unreadable` / `registry-unavailable` / `snapshot-failed` / `dispatch-failed`），含**代发失败必须先释放快照**（留着它，界面会以为任务已经发出去了） |
| `test/skill-instance-test.test.mjs`（V0.10.0，**27 项**） | 实例验收纯函数（§21）：四块结构与顺序、范围 id / 元信息 / 禁用词不许进 Prompt、观察项只给用户且必须是疑问句、六个范围各自决定任务形状且互不相同、主范围优先级、意图点名**且改过**的范围决定主范围、`trace.sources` 按固定顺序只列在场项、意图原文不进结果、回归约束按框架产出且不含被碰过的角色（`regression.source` 三态）、四种「生成不出来」各说各话且都不抛异常、缺框架 / 缺 validation 只加 limitation 不进 `unavailable`、坏输入只降级、同一份输入同一份结果、零依赖（不 `import` / 不读时间 / 不掷骰子）、别名导出、结果里没有判断词 / 分数 / 相对时间 |
| `scripts/verify-project.mjs` | 30 组源码文本守卫（§13；`0.10.0` 发布口径是 29 组，`0.9.2` 发布口径是 28 组、V0.9.1 工作树时为 27 组） |

### 14.3 验证边界（诚实声明）

**单测与守卫全绿，不等于真机端到端通过。** 至少四类东西它们测不到：

1. **两帧才出现的错误。** 渲染烟测桩住 `useState`，只渲染数据已到达的那一帧；React #310 是在真实 DSH 里用 CDP 抓到的。
2. **CSSOM 层的效果。** 根规则是否真的生效、字号与高度是否真的对，只有读浏览器算出来的样式才知道（历史上的根规则嵌进 `@media` 事故就是测试全绿而桌面全错的典型）。
3. **宿主缓存造成的假通过。** 不重启打的接口答的是旧代码，而且答得很正常。
4. **真实 registry 与 watcher 的行为。** 目标根选择、写入稳定窗口、catalog 刷新，都依赖运行中的 DSH 环境。

**这一类缝补上了一条，但教训是通用的。** `0.7.0` 起「复刻 Skill」按钮一次都没成功过，而 429 项测试全绿——因为宿主那一半的测试**自己把客户端漏掉的字段填了进去**，客户端那一半的测试**从没看过真正发出去的 JSON**。`55f092c` 把它变成一条会红的断言（见 §3.3 的「请求体是双边的合同」）。**推论：凡是两个组件各写一半的东西（请求体、回调参数、props、事件名），都要有一条断言横跨那条缝——「两边各自都有测试」不构成覆盖。**

因此，界面的改动还需要一层真机验收：用**复杂 Skill**（`ui-craft`：342 行 / 11 小节 / 39 个引用）而不是四步示例，逐条过 `AGENTS.md` §9.2 的清单。**「测试通过」不等于「测到了」，「渲染台通过」也不等于「用户看到」。**

---

## 15. 兼容边界与升级行为

### 15.1 DSH 事件 schema 会演进

任何升级前必须重查五件事：`skill(name)` 的调用/结果配对、会话持久化、重启恢复、空态、宿主是否受干扰。

已经落地一次变更：**V3 → V4** 退役了 `tool-result` 包装，把工具结果提升为一等 `tool` message。只匹配 V3 会让迁移后的会话被记录成「没有可读结果的 load」—— 指令指纹、候选步骤、版本漂移检测全空，而收据仍然写 `loaded`。现在的做法是 `src/core/trace-reducer.mjs` 同时认两种形状，并由 `test/session-format-v4-contract.test.mjs` 用真实捕获的事件钉住。

**钉事件形状时优先用真实捕获的事件，而不是手写 fixture。**

### 15.2 插件自身的升级行为

| 场景 | 行为 |
|---|---|
| 换了 `dist/client.js` | 必须重启宿主，否则界面静默消失（§2.3 附录 B 行为） |
| 改了 `src/core/*.mjs` 或宿主 | 必须重启宿主 |
| 只改客户端 | 硬刷新浏览器 |
| 收据来自旧版结构 | `migrateReceipt` 升级到当前 `schemaVersion`；遗留的 `learningNotes` / `validationResults` 原样保留但只读 |
| 偏好文件是旧版本号 | 一律读作「从未表达偏好」，回落 `current` |
| 译文对应的正文变了 | 旧文件留在盘上但不提供；`GET /skill-trace/translation` 报 `null`，界面回原文并提供重译 |

### 15.3 缺字段与空态

- 会话不在内存里 → `workspaceLabel` 是 `'工作区未连接'`，不是空串、不是 `null`。
- registry 不存在 → 列表仍返回，只是失去描述（`definitionStatus` 变成状态而不是抛错）。
- 定义读不到 → `available: false` + 原因，界面渲染成可见的不可用态。
- **一律不显示裸错误码，也不沉默。**

---

## 16. 已知取舍与非目标

### 16.1 取舍

| 取舍 | 理由 |
|---|---|
| 不画运行图谱（无 `elkjs` / `@xyflow/react` / `mermaid`） | 框架画的是角色与小节，不是图；画布库同时会带进布局计算与视口坐标（`CORRELATION_PROVENANCE_OK` 明确禁止图模型里出现坐标）。信息架构已经收敛，图没有对应的界面位置 |
| 不做遵循度评分 | 证据 ≠ 正确性。没有 compliance rate、score、ranking、百分比；`scored: false` 挂在每个模型上 |
| 不发明 `runId` | DSH 没有原生 `runId`；用宿主给的事件 id 作 `runKey`，**不发明字段** |
| 不读工具参数与结果内容 | 隐私边界（`runtime-evidence.mjs` 是唯一接缝，只做分类） |
| 译文按内容键落盘而不按会话 | 它是资产而不是某次会话的产物；键带会话既无法复用，也暗示错误的生命周期 |
| 复刻不挂载、不执行 Skill 内任何东西 | 复刻是「复制一份声明」，不是「运行它」；副本是否可用由 DSH 自己决定 |
| 声明抽取宁可精确不要召回 | 把约束误判成步骤，会让界面显示一个用户从未声明的流程 |
| 客户端 `require` 依赖规则影响模块边界 | 降级器只认单行具名 import —— 这是「能不能被客户端读」的**已知非设计性限制**，记在这里以免被误当成架构约束 |
| 指纹保留结构（`runtime-fingerprint.mjs`）先留着不派生 | §31 预留；当前 slot 全 `null`，没有消费者 |

### 16.2 非目标（当前版本明确不做）

1. 不新增一级 / 二级页面；一级 IA 冻结在两个页面 + 一个详情页。
2. 不替用户选 Skill、不发现远端 Skill、不挂载 Skill、不评判模型输出。
3. 不用模型来「总结」Skill 的框架或流程。
4. 不让界面说出「已执行 / 已完成 / 已加载 / 已读取」。
5. 不把运行证据反推成声明。
6. 不引入运行时依赖（`dependencies` 保持为空）。
7. 不按视口高度布局。
8. 不在 CSS 模板字符串（`installStyles()`）里写反引号 —— 一个中文说明里的 `` `data-active` `` 会让 `node --check` 报 `SyntaxError: Unexpected identifier 'data'`；改完 CSS 先跑 `node --check src/dsh/client/client.js`。
9. 不写 `exports['./client']` 指向 `src/dsh/client/client.js` —— 浏览器跑的是 `dist/client.js`。
10. **V0.8 不做**（见 §17）：不做相似度推断血缘、不做 Git 历史系统、不做版本实体（没有 `v1` / `v2`，不要求 Skill 有 `version:` 字段）、不做质量评分 / 排名 / 优劣判断、不做自动改写 / 自动优化 / 一键合并 / 一键同步来源、不做自动回归测试或行为评测、不做时间线大页面。差异**只回答「哪里变了」**。
11. **V0.9.1 不做**（见 §19）：不做第二套 Agent Runtime、不做专属会话、不做结构化 Proposal RPC、不做版本实体 / 历史时间线、不替用户决定 Skill 应该变成什么、不自动跑 `scripts/`、不自动 git、不自动改会话标题。**插件永不改文件。**
12. **V0.9.2 不做**（见 §20.7）：不做历史版本对比 / 时间线（「加入本机的时间」只有一个数，不是版本史）、不做用户自定义排序（没有排序键选择器，也不记忆排序偏好）、**不动既有的按名称 A–Z 兜底**（读不到时间就按名称，这条一直都在）、不把文件级 birthtime 或 mtime / ctime 当「加入时间」、**不新增路由也不新增依赖**、不在客户端重排也不写死规则名、不把「读不到」写成「没复刻过」。
13. **V0.10.0 不做**（见 §21.7）：不做 Test History / Test Runs / Evaluation Database / Benchmark Dataset、不自动运行、不自动成功判断、不打分、不建「测试中心」、不新增页面 / 导航 / Route / 第二套 Agent Runtime；Skill Evaluation（Baseline / With Skill 对比、多任务多条件）属于 V1.0。

### 16.3 未解决 / 待确认

- ~~§13.1 第 22、23 条 marker 没有断言（D5）~~ **已修**：`FIVE_LAYER_MODEL_OK` 删除、`FINGERPRINT_RESERVED_OK` 补断言、新增 `GUARD_MARKERS_ARE_BACKED_OK` 反向检查。
- ~~`src/dsh/host/index.js` 两条过期注释（D1、D2）与 `docs/ARCHITECTURE.md` 的「seven routes」（D3）~~ **已修**，连同 `AGENTS.md` §6.6 的六支 core 模块（D6）。
- `0.8.0` **已发布**（V0.8「Skill 演进」+「Skill 洞察」短显示名 + 复刻请求体缺陷修复）：tag `v0.8.0`，GitHub Release 为 `Latest`，npm 的 `beta` / `latest` 都指向它；测试 474、守卫 25、宿主路由 11 条。发布提交与实测结果见 `docs/RELEASE.md` §6.0.3。
- `0.7.1` **已发布**（品牌迁移：Skill Trace → DSH Skill Intelligence）：tag `v0.7.1` → 发布提交 `74a161d`，GitHub Release 为 `Latest`，npm 的 `beta` / `latest` 都指向它；功能逻辑与 `0.7.0` 逐字一致。
- `0.7.0` **已发布**：tag `v0.7.0` → 发布提交 `5fac5d9`，GitHub Release 为 `Latest`，npm 的 `beta` / `latest` 都指向它。
- **V0.9.1（Skill Modify）已随 `0.9.2` 发布**（§0.1 D11）：`src/core/skill-modification.mjs`（592）与 `src/storage/modification-snapshot-store.mjs`（157）已存在；宿主新增 `POST /skill-trace/modify`（**11 → 恰好 12 条路由**），它只把「改前」写进宿主**内存**、用当前会话的 Agent 代发一条消息、**不写任何文件**；详情页新增「修改 Skill」对话框与「本次修改对比」块；守卫 **27 组**、`npm test` **553 项**。**已随 `0.9.2` 发布**（2026-10-03，GitHub Release + npm；发布说明即 CHANGELOG 的 `## 0.9.2`），**真机验收已于 2026-10-03 通过**（宿主重启后 `POST /skill-trace/modify` 在跑的进程里、`/skill-trace/catalog` 原生返回 `ordering`；同一天也跑通过一次真实的「代发 → Agent 改文件 → 回读」，见 CHANGELOG 的 `## 0.9.2`）。设计、「不做」清单与验收证据见 §19。
- **V0.9.2（已安装列表排序）已随 `0.9.2` 发布**（§0.1 D12）：规则名 `INSTALLED_ORDERING_RULE = 'added-desc-then-name'`，时间取候选根下 Skill **目录**的 `birthtimeMs`（不是文件级 —— §20.1）；`GET /skill-trace/catalog` 多两处**只读**读盘（都不抛错），**不新增路由**（仍 12 条）；守卫 **28 组**、`npm test` **561 项**。**已随 `0.9.2` 发布**（2026-10-03，GitHub Release + npm；发布说明即 CHANGELOG 的 `## 0.9.2`），**真机验收已于 2026-10-03 通过**（宿主原生返回 `ordering`；真机载荷 73 个 / 34 有 / 39 无，排序四条不变式逐条成立）。设计、「不做」清单与验收证据见 §20。
- **V0.10.0（Skill 实例验收）已随 `0.10.0` 发布**（2026-10-05，GitHub Release + npm，tag `v0.10.0`；§0.1 D13）：新增 `src/core/skill-instance-test.mjs`（**571 行、零依赖、零 `import`**，导出 `INSTANCE_TEST_SOURCES` / `INSTANCE_TEST_SCOPE_ROLES` / 三个卡面抬头常量与别名 `buildInstanceTest`）；生成器收 `{skillName, intent, comparison, definitionText, description, framework, validation}` 并回 `trace`（六项输入的在场情况、`hintedScopeId`、`validationUnknownCount`），**用户意图原文一个字节都不进结果**；回归约束改为**按框架产出**（`regression.source = 'framework' | 'definition' | null`）；客户端新增**第 8 支 `require`** 与 `SkillModificationPanel` 里 `data-role="mod-instance"` 一整段（本屏共 **14** 个 `mod-instance*` data-role，含 `mod-instance-trace`；新加「验证目标」/「测试 Prompt」两块抬头；意图只活在页面 state `lastIntent` 里，刷新即失）⇒ 客户端 3448 → **3625 行**、`dist/client.js` 170324 → **189256 字节**（source hash `faed5e9cef7db24c`）；`src/core/` 29 → **30 个模块 10924 行**、`src/storage/` **6 个 1117 行不变**；**宿主一行未动**（1625 行、**仍 12 条路由**，`POST /skill-trace/instance-test` 已取消）；守卫 **29 组**、`npm test` **590 项**（V0.10.0 早期工作树为 584 项 / 3569 行 / 184471 字节 / `2d202a05030a1d58`）。设计、「不做」清单与验证证据见 §21。
- 本文件的 §9 模块清单行数与 §14 测试文件数都是**写死的实测值**，`AGENTS.md` §9.1 要求发版时用 `wc -l` 重跑；改代码时容易漏改这里。
- **V0.8（Skill 演进）的 Phase 1（血缘）、Phase 2（差异）与 Phase 3（界面）都已落地**（§0.1 D8）：三个新模块 `src/core/skill-lineage.mjs` / `src/storage/skill-lineage-store.mjs` / `src/core/skill-diff.mjs` 都已存在；`handleClone` 在回读通过之后写血缘（fail-soft）；`/skill-trace/skill` 随详情回 `lineage` 字段；宿主新增 `GET /skill-trace/diff`（**10 → 11 条路由**）；守卫 24 `SKILL_LINEAGE_OK` 与 25 `SKILL_DIFF_NO_JUDGEMENT_OK` 的**两个半**都已落地；客户端 `SkillEvolution` / `SkillDiffPanel` 已接进详情页并有 5 条渲染烟测。**已随 `0.8.0` 发布**（2026-10-02：GitHub Release + npm）。落地顺序见 §17.7。

---

## 17. Skill 血缘与差异（v0.8）

> **本节已经是现状，不再是设计。** 血缘（§17.1–§17.4）、差异（§17.5）与界面（§17.6）的模块、宿主路由与客户端组件都已落地（Phase 1 血缘、Phase 2 差异、Phase 3 界面，2026-10-02：三个模块 + `handleClone` 挂钩 + `GET /skill-trace/diff` + 详情页「Skill 演进」卡与差异面板 + 守卫 24/25 的两个半 + 5 条渲染烟测）。`§0.1 D8` 登记了这条边界；**已随 `0.8.0` 发布**（2026-10-02）。需求侧对立的是 `spec/PRD.md` §5.7 的 `FR-EVO-*`。

V0.8 只回答一个问题：**我把一个 Skill 复刻成自己的版本以后，能不能清楚知道「我从谁来、我改了什么、来源现在变了吗」。** 三个能力：血缘（Lineage）、差异（Diff）、演进视图（Evolution）。它**不是** Skill Creator / Forge / Marketplace / IDE，也**不做**行为评测与自动优化（那些归 V0.9+）。

### 17.1 血缘只有一个数据源：本插件自己成功执行过的复刻

这是本节最重要的一条。**血缘不是「我认为 B 来自 A」，而是「本插件执行过一次 A → B 的复刻」。** 因此下面这些一律**不建立血缘**（`FR-EVO-001`）：

| 情况 | 为什么不算 |
|---|---|
| A 与 B 内容很像 | 相似不是来历；插件看不出「复制」与「各自独立写成」的区别 |
| A 与 B 名字很像 | 命名习惯不是证据 |
| A、B 都来自同一个 GitHub 仓库 | 同仓库不等于同一条复刻链 |
| 用户在 Finder / Terminal 里手动复制 | **插件没有执行过那次复刻**，它观察不到 |
| 用户自己新建了一个 Skill | 没有来源 |

这不是保守，是这条产品线的底线：**观察不到证据，就推不出关系**——与运行时那套「声明不等于执行」是同一条纪律。

### 17.2 血缘记录：字段闭集

```js
{
  schemaVersion,                                  // SKILL_LINEAGE_VERSION = 1
  lineageId,                                      // sha256(targetSkillName)
  sourceSkillName, sourceSourceSha256,            // 复刻当时校验过的来源正文指纹
  targetSkillName, cloneMode, targetScope,        // 'bundle' | 'skill-md' · 'project' | 'user'
  catalogObservation,                             // 'observed' | 'pending'
  sourceRepository,                               // 可选；只在 frontmatter / git origin 确认过时才有
  createdAt, updatedAt
}
```

**不得出现**：任何 Skill 正文或资源文件内容、会话标识、会话日志、Tool 参数或结果、Token / Cookie、未脱敏绝对路径（`FR-EVO-002`）。

命名说明：`sourceSourceSha256` 这个名字是 `spec/PRD.md` 的 `FR-EVO-002` 与本文共同固定的，读起来别扭是**故意的**——它强调这是「**来源** Skill 的**来源**指纹」（复刻当时那一版），与「来源**现在**的指纹」是两个东西，后者来自实时读取，**不进记录**。

`sourceRepository` 复用既有的 `src/core/repository-resolver.mjs`，**不重新猜**：frontmatter → `git origin` → 用户配置，只记能确认的（`FR-EVO-003`）。今天 `repositoryOverride` 这条用户配置通道**是死代码**（声明了、零读取），所以实际只有前两条。

### 17.3 落盘：`<dataRoot>/lineage/`，一个目标一条记录

- 目录 `0700`、文件 `0600`、原子写（`mkdir` → 带 pid 与随机后缀的 `.tmp` → `writeFile({mode:0o600})` → `rename`）；
- **文件名 = `sha256(targetSkillName)`**，即**一个目标 Skill 只可能有条记录**（`FR-EVO-004`）。用户改了目标 Skill 的 `SKILL.md` / `references/` / `scripts/` **不产生新记录**——那些变化归 Diff。同一个目标名再次被复刻时**覆盖**（当前目录的来历 = 最近一次由本插件执行的复刻）。
- **不复用 translation store**：键不同、拒绝字段不同、生命周期不同（`FR-EVO-007`）。
- **不写进 Skill 目录**（写进去会污染该 Skill 的 bundle，并被后续的完整复刻一起拷走）；**不进收据、不进会话日志**。收据里那个 `lineage` 是**会话血统**，两者无关（§3.3 的警告）。

### 17.4 挂钩点：`readBackClone` 之后，且 fail-soft

`handleClone`（§8.2）的既有顺序是 `writeClone` → `readBackClone` → 回滚或继续 → registry 观察 → 组装成功响应。血缘写在**观察之后、`return` 之前**：

```text
读源 → 校验 sourceSha256 → 写副本 → read-back → catalog 观察 → success → 写血缘
```

两条纪律：

1. **回读失败 ⇒ 不写血缘。** 那条路径本来就 `removeClone` 回滚并以 500 失败，副本根本不在磁盘上。守卫 `SKILL_LINEAGE_OK` 用**源码顺序断言**（`writeLineage(` 必须排在 `readBackClone(` 之后）把这件事钉住，不靠记性。
2. **写血缘失败 ⇒ fail-soft。** 照 `persistTranslation` 的形状返回布尔、绝不抛：副本已经在磁盘上，把这次失败报成「复刻失败，没有产生任何副本」是**撒谎**。失败只在 `limitations` 里加 `lineage-not-recorded`，复刻结果与回滚都不动（`FR-EVO-006`）。
3. **目录刷新观察不到不是失败。** 既有响应里的 `discovered` 布尔直接映射成 `catalogObservation: 'observed' | 'pending'`（§8.4）。

### 17.5 `/skill-trace/diff`：比较基准与三层差异

**比较基准永远是「当前目标」与「当前来源」两侧的实时事实**（`FR-EVO-013`）。三层全部确定性、无模型参与（`FR-EVO-012`）：

| 层 | 输入 | 输出 |
|---|---|---|
| 结构 | 两侧各自 `buildDefinitionOutline()` + `buildSkillFramework()` | 新增 / 删除 / 改变的小节与角色；声明流程与渐进披露的差异 |
| 内容 | 两侧 `SKILL.md` 正文，按 Markdown 结构分段后在段内做行级差异 | 新增 / 删除 / 修改的行，带行号以便跳转锚点 |
| 资源 | 两侧 Skill 目录的文件清单（遍历 `SKILL.md` / `references/` / `scripts/` / `assets/` 等） | 新增 / 删除 / 变化的相对路径 |

三个实现坑，都是读源码得出的、**不写下来一定会踩**：

1. **两侧必须各传自己的 `summary`（或都传 `null`）。** `buildSkillFramework` 会在「没有任何正文节被判为 trigger」时**凭空合成一个 trigger 节**，内容来自 registry 的 `summary.whenToUse || summary.description`。两侧喂不同的 summary ⇒ 界面出现一条**根本不存在的结构差异**。
2. **两侧都要自己 `buildDefinitionOutline(side.content.text)`。** `buildSkillFramework` **只消费 outline，不建 outline**（§6.2）；不建就得到空 `sections`。
3. **不要用 `renderSkillMarkdown(` 渲染差异。** 守卫 `SKILL_FRAMEWORK_OK` 钉住整个客户端**只有一处** `renderSkillMarkdown(` 调用点。差异的每一行就是纯文本行，按「结构 Diff 用分隔线行、内容 Diff 用 `+/−/␣` 前缀行、资源 Diff 用一行一路径」渲染。

### 17.6 三条诚实边界（V0.8 的成败就在这里）

**① 来源变了，差异就不全是「你改的」。**

插件**不保存**复刻当时的正文快照（`FR-EVO-002` 禁止），所以「我改了什么」**只在来源没动过的时候**才等价于两侧差异：

| 来源状态 | 差异的含义 | 界面必须说 |
|---|---|---|
| `currentSha256 === sourceSourceSha256` | 两侧差异**就是**用户改的 | 「来源内容未发生变化」 |
| 两侧指纹不同 | 差异**可能来自来源一侧** | 「来源内容已发生变化」+ 一句「下列差异里有一部分可能来自来源 Skill 自身的更新」 |

这也是**为什么「来源内容未发生变化」是整个 V0.8 最值得看清的一行**：只有它成立时，差异才是干净的「我的改动」。**不要**用「过期 / 落后 / 版本升级」来描述第二种情况——那些词已经带判断（`FR-EVO-010`）。

**② `skill-md` 复刻出来的副本，本来就没有来源的那些资源。**

`cloneMode === 'skill-md'` 时 `writeClone` 只写 `SKILL.md`。于是资源差异会把来源的全部资源显示成「本地没有」——**那不是用户删的，是复刻方式决定的**。响应里带 `resources.mode`，界面必须按它解释（`FR-EVO-016`）。同理，`bundle` 模式也可能因为 `CLONE_MAX_BYTES` / 跳过规则而**没拷全**（`truncated` / `skippedCount`），界面不许把「没拷到」说成「被删掉」。

**③ 名字不是身份。**

血缘存的是 `sourceSkillName`。如果那个名字后来被**另一个** Skill 占用，插件**无法识别**「名字还是那个名字，但已经不是同一个 Skill 了」（`FR-EVO-022`）。V0.8 不深挖（那要先给来源建立身份），只在血缘里如实带上可确认的 `sourceRepository`，让用户自己看得见来源对不对。**不许声称已经识别。**

### 17.7 分层与落地顺序

| 层 | 新增 / 修改 | 职责 |
|---|---|---|
| `src/core/skill-lineage.mjs`（新） | 纯函数：schema、校验、归一化、键 | 不含 fs、不含时间戳来源之外的状态 |
| `src/core/skill-diff.mjs`（新） | 纯函数：结构 / 内容 / 资源三层差异 + 三态 | 输入是两侧已读到的正文、outline、文件清单；**不碰 fs** |
| `src/storage/skill-lineage-store.mjs`（新） | `read` / `write` / `list` / `findBySource` / `findByTarget` / `delete` | 唯一落盘处；照 `translation-store.mjs` 的形状 |
| `src/dsh/host/index.js`（改） | `handleDiff` + 复刻成功路径里的血缘写入 + `/skill` 里嵌 `lineage` | 路由 11 条 |
| `src/dsh/client/client.js`（改） | 左栏「Skill 演进」卡 + 差异面板（标准模态） | **纯展示**：不 `require` 任何新模块，不自己算差异（`FR-EVO-021`） |

三阶段，**每阶段结束时 `npm test` + `npm run verify` 必须全绿**：

1. **Phase 1 — 血缘**：三个模块里的 `skill-lineage.mjs` + `skill-lineage-store.mjs`、复刻路径挂钩、`/skill` 里嵌 `lineage`、`SKILL_LINEAGE_OK` 守卫；✅ **已落地（2026-10-02）**；
2. **Phase 2 — 差异**：`skill-diff.mjs` + `handleDiff` + `/skill-trace/diff` 进 `requiredText`、`SKILL_DIFF_NO_JUDGEMENT_OK` 守卫（宿主那半）；✅ **已落地（2026-10-02）**；
3. **Phase 3 — 界面**：演进卡 + 差异面板 + `design.md` §7 组件合同行 + §24 修订记录 + **真实渲染冒烟测试**（`design.md` §13 的设计变更 Gate 要求，不可省），并补上守卫 25 的客户端那半。✅ **已落地（2026-10-02）**：`SkillEvolution` / `SkillDiffPanel` 接进详情页左栏（`sidePanel` 四项：`sideIdentity` / `sideEvolution` / `sideDefinition` / `sideRepository`），`test/client-render-smoke.test.mjs` 加 8 条烟测（`npm test` 474 项），守卫 25 的客户端那半跑在去英文字典的源码上。

**三个 Phase 都已随 `0.8.0` 发布**（2026-10-02：tag `v0.8.0`，GitHub Release + npm）。落地期间最该记住的一条：**差异界面最坏的失败方式是看起来最正常** —— 读不到来源时渲染成三张空表，用户读到的就是「没有变化」，所以那一屏必须是 `role="alert"` 的完整句子，而且 `npm test` 里有一条烟测专门数 `.st-diff-row` 为 0。

---

## 18. Skill 验收（V0.9.0，已随 0.9.2 发布）

> **状态**：实现、测试、守卫与真实渲染台核对都已完成，并已随 **`0.9.2`** 发布（2026-10-03，GitHub Release + npm；发布说明即 CHANGELOG 的 `## 0.9.2`）。与 §17 的区别只在发布的批次：§17 是 `0.8.0` 的演进卡与差异面板，本节是 `0.9.2` 新加的验收卡。

一句话：**验收回答「这个 Skill 当前符不符合规范」，不回答「改完以后行为有没有变好」。** 后者要先有基线、行为差与回归，属 V1.0+（`FR-VAL-019`）。

### 18.1 为什么只做确定性那一半

验收分两层：**硬规则（格式、字段、路径、结构事实）由代码判定；软规则（规范解释、资源组织、可维护性建议）留给 Agent。** 本版**只实现硬规则那一层**：

- **不评分**：结论是三态而不是分数。理由是评分会把「建议」伪装成「标准」，而四家来源里绝大多数条款是祈使建议（"Keep `SKILL.md` under 500 lines"），不是装载必需。
- **不做最终决策**：warning 不阻止任何人保存，只有 error 进 `needs-fix`。
- **不注册 Skill**：「Skill 验收」这个概念没有被实现成 `ctx.skills.register(...)`。注册进的是 DSH 的 Skill Registry，等于替用户装了一个 Skill——与本插件「只读观察者」的身份直接冲突。它是 `src/core/` 里的一个纯函数模块。

### 18.2 规则表：`src/core/skill-profiles.mjs`（590 行）

纯常量 + 纯函数，零依赖，**只放事实不放判断**。每条规则的形状固定为 `{id, profile, severity, title, fact, source}`：

- `profile` ∈ `common` / `dsh` / `microsoft` / `openai` / `anthropic`；`source` ∈ `agentskills` / `microsoft` / `openai` / `anthropic` / `dsh`。
- `fact` 是「这条规则在断言哪个事实」。**同一个 `fact` 只允许出现在一条规则里**（实测 32 条 → 32 个唯一 id、32 个唯一 fact），Profile 之间靠**引用同一条规则**共享。这条约束的价值是：同一件事不会在两处各写一遍、改一处漏一处。
- **平台差异不许被抹平**是机械可检的：`MS-DIR-001`（`directory-name-match`，microsoft，**error**）与 `OA-DIR-001`（`openai-directory-name`，openai，**warning**）是同一件事的两条规则、两种严重度；而 **DSH Profile 里根本没有目录名规则**——DSH 的装载实现只看 frontmatter 的 `name`（`dsh-skill/lib/index.js` 的 `isSkillName`），不比对目录名，所以「name 与父目录同名」在 DSH 下不成立。

32 条规则分布：`common` 19 条（结构 6、名称 3、description 2、compatibility 1、正文行数 1、围栏 1、引用 3、安全 2）、`dsh` 4 条（名称语法、name/description 必填、旧 invocation 字段、invocation 布尔）、`microsoft` 4 条（目录同名、重复键、字段大小写、metadata 形状）、`openai` 4 条（frontmatter 只许 `name`/`description`、目录名、多余文档文件、`agents/openai.yaml`）、`anthropic` 1 条（`compatibility`）。

**严重度的判据写进了模块注释**：来源用「必须 / Must / 会阻止装载」才是 error；「Keep … under 500 lines」这类祈使建议一律 warning。因此**行数永远只能是 warning**：四家的装载阻断清单里都没有行数（`FR-VAL-007`）。Anthropic Profile 只有一条自己的规则是**有意的实话**——它公开资料里可静态判定的硬规则最少，价值主要落在「修改 → 测试 → 评估」的行为流程上（V0.9 不做）。

`resolveSkillProfiles(selection)` 返回 `{profileIds, unknown}`：**`common` 永远被补上**；空数组与「没传」是同一件事（都回退到产品默认 `['common','dsh']`），因为空集合更像「控件还没加载」而不是「我只想验 Common」；不认识的 id 进 `unknown` 并出现在结论说明里，**不静默丢弃**。

### 18.3 验收器：`src/core/skill-validation.mjs`（1025 行）

**唯一一支 import 是 `./skill-profiles.mjs`**：不碰文件系统、不调模型、不访问会话对象。输入是**纯数据**（`{skillName, available, reason, content, truncated, directoryName, resourcePaths, profileIds, now}`，全部可选），**任何输入都不抛错**。

三件自带的事实读取（这就是它不能复用既有模块的原因）：

1. **`scanFrontmatter(content)`**——`definition-outline.mjs` 的 `parseFrontmatter` 是**给显示用的有损解析**：值被截到 300 字符、空白被折叠、**重复键直接覆盖**。而验收要判的两件事恰好在那里不存在：「`description` 有 1200 字符」和「`name` 写了两次」。自带的扫描器用缩进栈还原嵌套路径，分开记 `entries` / `duplicates` / `unknownLines` / `unsupportedLines` / `casing`。
   - **YAML 列表不算解析失败**：`allowed-tools:` 下面跟 `- Read` / `- Write` 是合法 YAML，只是本工具不解析，归 `unsupportedLines` 并在 `notes` 里说清「没有参与判定」。把它报成 `CORE-FM-003` 会让一份规范 Skill 被误判。
2. **`scanMarkdown(content, bodyStartLine)`**——围栏配平、正文是否为空、引用清单；**围栏内的 `#` 不算标题、链接也不算引用**（否则代码块里的示例会变成「引用的文件不存在」）。
3. **`scanCredentialPatterns` / `scanExfiltrationPatterns`**——凭据、硬编码密钥、危险命令、可疑外传、绕过权限。两条纪律：只报**观测到的字面模式**（不写「这份 Skill 是恶意的」），且**绝不回显匹配到的值**（把真密钥抄进验收结果是二次泄漏）。带占位符的赋值（`api_key: your-api-key-here`）豁免。

**判定表契约**：`EVALUATORS[ruleId](ctx)` 返回 `{details: []}`（判过、没问题）/ `{details: [...]}`（每个元素一条独立发现）/ `{reason}`（现在判不了 → 进 `skipped` 并带理由码，如 `no-directory-listing` / `body-truncated` / `compatibility-absent` / `name-missing` / `definition-unavailable` / `no-evaluator`）。`available === false` 时不调判定函数，全部规则 `definition-unavailable`。

**状态算法**：`!available → unknown`；否则有任一 error → `needs-fix`；否则 `pass`。**`warnings > 0` 永远不会推成 `needs-fix`**（`FR-VAL-002`）。`profiles[]` 每个 Profile 单独汇总 `{status, errors, warnings, info, skipped, checked, total}`：某个 Profile 一条都没判成时它自己是 `unknown`，**不跟着整体躺赢**（`FR-VAL-008`）。

### 18.4 宿主接缝：为什么必须另读一次文件

`src/dsh/host/index.js` 的 `validationFacts()` + `validationFor()`，以及 `src/storage/skill-clone-writer.mjs` 新增的 `readSkillFile()`。

**这条缝来自一个真机 bug**：DSH registry 给的 `SkillDefinition.content` 是 `parsed.body.trim()`——**只有正文，没有 frontmatter**（`@deepseek-ai/dsh-skill-filesystem/lib/index.js`）。详情视图里的 `definition.content.text` 因此也不含 frontmatter（v0.8 的 `readSkillBody()` 刻意与它同口径，因为复刻会改写 frontmatter 的 `name:`，且行号要与详情页锚点对齐）。若验收器拿它判定，**每一份真实 Skill 都会被判「缺少 frontmatter」**——一次覆盖全场的假指控。修法：`readSkillFile({skillFile})` 读**整份文件**（含 frontmatter），只在内存里活到这次验收结束（不落盘、不进收据、不出进程）。

另外三处细节，每处都对应一类失败：

- **目录名取自「装着 `SKILL.md` 的那个目录」**（`dirname(skillFile)`），不取 `resourceBase` 的末段——v0.8 的 `basename(base) === skillName` 过滤会让 `MS-DIR-001`（name 与父目录不同名）**永远判不出来**。
- **清单不可信时给 `null` 而不是 `[]`**：验收器把 `[]` 读成「目录真的是空的，所以引用的文件都不存在」。只有 `SKILL.md` 自己出现在清单里，才证明清单完整（`FR-VAL-011`）。
- **`registry.get` 包 try/catch**：真机上文件可能在这两次调用之间消失，ENOENT 不能把整条路由打成 500；读不到就传 `available: false` ⇒ `unknown`，**一条错误都不判**。

**载体**：`GET /skill-trace/skill` 与 `GET /skill-trace/definition` 两条响应各多一个同级字段 `validation`，由同一个 `validationFor()` 产出（**V0.9.0 没有新增路由**：当时恰好 11 条；V0.9.1 的第 12 条路由把这个 `validationFor()` 又复用到 `compare` 上，见 §19，`FR-VAL-012`）。`/skill` 经 `buildSkillDetail({ …, validation })` 透传，`skill-view-model.mjs` 里 `validation: options.validation ?? null`——**键永远存在**，没有时是 `null`，因为客户端要用 `hasOwnProperty` 区分「宿主没给这个字段」与「这份 Skill 读不到」。

### 18.5 客户端：一张卡、两句不同的话

`SkillValidationPanel`（`src/dsh/client/client.js`，**整个组件没有 hook**，因此不可能违反 hook 顺序合同）。它排在 `SkillDiffPanel` 之前，并被接进详情页**主列的第一位**：**验收 → 本次修改对比（V0.9.1 加在第二位，§19）→ 框架 → 本次运行逻辑 → 步骤证据 → `SKILL.md`**（守卫按字面钉住这个顺序）。排在四层之上是因为它回答的是这一版的主问题，而且它只读**声明层**事实（`SKILL.md` 与目录清单），不构成「用运行证据反推声明」。

- 数据来自 `/skill` 响应的 `body.skill.validation`（详情页读的是 `body.skill`，不是 `/definition`——挂错路由这条缝已经由守卫与路由测试两边钉住）。
- **`validation: null` 与「没有 `validation` 键」是两句不同的话**：前者「现在读不到这个 Skill 的 `SKILL.md`，因此无法判断它是否符合规范。」，后者「这次详情响应里没有验收结果。宿主可能还没换到这一版的代码，重启 DSH 后再试。」（`FR-VAL-016`）。
- 结论 `role="status"`，缺字段/读不到 `role="alert"`。
- **双语标签必须显式选语言**：`profiles[].label` 是 `{zh, en}` 对象，`raw()` 只打「别翻译」的标记、不做字符串化；直接当 children 会抛 **React #31**，而 `conversation.view` 没有错误边界 ⇒ 整页白屏。这条已进守卫（`raw(profile.label ?? profile.id)` 必须不存在）。

### 18.6 三条诚实边界（写进 `SKILL_VALIDATION_LIMITATIONS`，界面上可展开）

1. **静态验收只读 `SKILL.md` 与目录清单，不执行 Skill 里的任何脚本。** 这里没有被指出问题，不等于这份 Skill 的指令一定有效果。
2. **只有 `scripts/` / `references/` / `assets/` 下的引用按资源判定**；正文里提到的其它路径可能是在说宿主工程，不做判定（这条是**修掉 6 条假指控**之后写下的：真机 Skill `cordis-plugin-development` 曾因正文提到 `packages/bundle/*/cordis.patch.yml` 之类的宿主路径，被判 6 条「引用的文件不存在」）。
3. **安全两条只报告观测到的字面模式**，不代表这份 Skill 的意图；`description` 是否准确说明用途需要人来判断，本项不做判定。

### 18.7 验证证据

- **守卫 26 `SKILL_VALIDATION_OK`**（§13.1）：三态/三档词表、评分禁令、平台差异三条、验收器纯度（恰好一支 import、禁 IO）、宿主接缝四处、客户端 mark/接线/词表。
- **变异测试 15 条全部被抓，且各自红在对的那条断言上**，其中与本节直接相关的：`MS-DIR-001` 降级 / DSH 里塞目录名规则 / `CORE-BODY-001` 升级 / 验收器加第二支 import / 状态多一个取值 / 验收器里出现 `skills.register` / 面板少一个 `data-role` / 面板里出现「已完成」/ `needs-fix` 分支被短路 / 详情响应去掉 `validation` / 宿主不调用验收器 / 宿主交正文而不是整份文件 / `buildSkillDetail` 不透传 / 对象当 children / 参数名与调用处不一致。
  - 客户端变异**必须重建 `dist/client.js`，并在这条变异之后把 dist 也还原**：bundle 新鲜度是「源码哈希烙在 bundle 里」，不还原就会让后面每条断言先红在「bundle 过期」上（第一轮变异测试正是这样被骗过去的：11 条看着全红，其实只有 3 条跑到了断言）。
- **真机探针**（`/tmp/probe2.mjs`，走真实目录）：真实宿主 Skill `cordis-plugin-development` 在**五个 Profile 全开**下是干净的 `pass`（唯一 info 是「没有 `agents/openai.yaml`」，OpenAI 把它列为 recommended；两条 `compatibility` 规则因字段不存在而 `skipped`）。**`ui-craft` 的真发现**：`CORE-REF-002`——`SKILL.md` 里有一条 Markdown 链接指向 `../../examples/animation-storyboard.md`，确实逃出了 Skill 根目录。
- **真实渲染台**：`01_重构方案/render-harness/`（`node build.mjs && node capture-cdp.mjs val-detail "act=skill-item"`）截出的详情页里，验收卡排在框架之上，Profile 行显示 `Common Core 需要修正` / `DSH 通过`——**同一份 Skill、两个平台两种结论**的现场。（截图存于 `01_重构方案/render-harness/shots/impl-val-detail.png`，1600×1050：`Common Core 需要修正`、`DSH 通过` 与那条 `CORE-REF-002` 错误都在图上。）

### 18.8 分层与下一步

| 层 | 新增 / 修改 | 职责 |
|---|---|---|
| `src/core/skill-profiles.mjs`（新） | 规则表：5 Profile、32 条规则、数字常量 | **纯常量 + 纯函数**，零依赖，只放事实不放判断 |
| `src/core/skill-validation.mjs`（新） | `buildSkillValidation` + 三个扫描器 | **纯函数**：输入是宿主读好的事实，不碰 fs、不调模型 |
| `src/storage/skill-clone-writer.mjs`（改） | `readSkillFile`（整份文件） | 与 `readSkillBody`（只有正文）并列，注释写明两者口径不同的原因 |
| `src/dsh/host/index.js`（改） | `validationFacts` + `validationFor` | 读事实、包住 ENOENT、两条路由共用；**不新增路由** |
| `src/core/skill-view-model.mjs`（改） | `buildSkillDetail` 透传 `validation` | 键永远存在，`null` 表示「宿主答了、这次没有」 |
| `src/dsh/client/client.js`（改） | 「Skill 验收」卡 | **纯展示**：不 `require` 新模块、不自己算规则 |

**下一步已落地并发布（`0.9.2`，见 §19）**：**V0.9.1 = Skill Modify**。用户点击「修改 Skill」→ 用户输入的自然语言意图 + **只把用户侧的修改范围结构化**（6 个范围 id，其中 `scripts` / `assets` 默认锁死）→ 随 `agent.followup()` 把 Modification Contract 交给当前 DSH Agent → Agent 用 DSH 原生文件工具改 → read-back → **本节的验收器**（复用 `validationFor()`，不重新读文件）→ Modification Diff → 回详情页。三条约束都在 §19 里守住了：**第一版不做结构化 Proposal RPC**（中间过程发生在原生对话里，插件不解析 Agent 的 JSON）；**不采用「自建专属会话」**（LoreFlow 驾驶舱已用真实翻车证明：用户看不见那个会话，`ask_user_question` 弹在看不见的地方）；修改前的快照只活在**内存**里，`❌ 不写磁盘 ❌ 不进收据 ❌ 不进会话日志 ❌ 不上传`，丢了就如实说「本次修改前状态不可用，暂时无法比较本次修改的内容。」。

---

## 19. Skill Modify（V0.9.1，已随 0.9.2 发布）

> **状态**：实现、测试与守卫都已完成，并已随 **`0.9.2`** 发布（2026-10-03，GitHub Release + npm；发布说明即 CHANGELOG 的 `## 0.9.2`）；**真机验收已于 2026-10-03 通过**（宿主重启后 `POST /skill-trace/modify` 与 `/skill-trace/catalog` 都在跑的进程里；同日跑通过一次真实的「代发 → Agent 改文件 → 回读」）。与 §18 的分工：§18 回答「这个 Skill 现在符不符合规范」（不碰 Agent），本节回答「我想让它怎么改，改完到底变了什么」—— 它是这个插件**唯一一处会碰会话 Agent** 的地方。

一句话：**用户写一句意图、勾一次范围，点「交给 Agent」，这次修改就发生在当前会话的原生对话里。** 插件不替用户决定 Skill 应该变成什么，也不碰任何文件：它只做两件事 —— 把「改前」记下来、把任务发出去；改完再对账。

### 19.1 为什么是「代发一条消息」，而不是「插件自己改」

- **插件是只读观察者**（§0 的一句话）。要改 `SKILL.md` 就要有 DSH 原生文件工具与 DSH 的权限与审批，那是 Agent 的能力，不是插件的。
- **不采用「自建专属会话」**：LoreFlow 驾驶舱已经用真实翻车证明过 —— 用户看不见那个会话，`ask_user_question` 会弹在看不见的地方。修改必须发生在**用户正在看的那个会话**里。
- **不做结构化 Proposal RPC**（第一版）：中间过程留在原生对话里，插件**不解析 Agent 的 JSON**，也不发第二条、不轮询、不替 Agent 写方案。
- **用户点「交给 Agent」这个动作本身就是授权。** 插件不代替用户同意任何事，也不在消息里提任何修改方案。

### 19.2 两条动作：`begin` 派发 / `compare` 对账

| 动作 | 时序 | 结果 |
|---|---|---|
| `begin` | 读整份 `SKILL.md`（含 frontmatter）+ 目录清单 + 血缘里的来源指纹 → `modificationStore.begin()` **只写宿主内存** → `buildModificationMessageText()` 拼出那一条消息 → `liveAgent.followup(message)` 代发 | 回 `{ok: true, sessionId, …}`；**消息只发一条**，不发第二条、不轮询、不解析回复 |
| `compare` | `modificationStore.read()` 取「改前」→ 重读现状 → `diffSkillModification({skillName, scopeIds, profileIds, before, after, source})` → `modificationStore.release()` **释放快照** → 同一响应里附上 `validationFor()` 的验收结论 | 回 `{ok, sessionId, skillName, action, released, comparison, validation}`：三态 `unchanged` / `changed` / `unavailable` + 行级 / 小节级 / 资源级变化 + 超出授权范围的变化 + 来源指纹对比 |

两条纪律：

1. **只有 `begin` 成功记下「改前」，消息才会发出去。** 记不下（`snapshot-failed`）就不发 —— 否则界面会以为改完了，而其实没有改前可比。
2. **`compare` 一定会释放快照。** 这份「改前」没有理由比这次修改活得更久；再点一次「对比本次修改」时会落到「快照不在了」这条老实话上，而不是拿现状凑一份假的改前。

### 19.3 内存快照的四条硬边界

`src/storage/modification-snapshot-store.mjs`（157 行）是这份「改前」唯一的容器：`createModificationSnapshotStore({ttlMs, now, max})`，TTL **30 分钟**、上限 **32 份**、键 = `modificationSnapshotKey({sessionId, skillName})`（会话 + Skill 名两段，缺一不可 —— 跨会话复用同一份快照是错的）。

| 边界 | 含义 |
|---|---|
| **不写盘** | 不认识 `dataRoot`，没有任何写文件调用；§11.1 的落盘面表没有新增一行 |
| **不进收据** | 收据的 `publicReceipt` 字段表不许新增键（与血缘同一条纪律，§17.3） |
| **不进会话日志** | 它只活在宿主进程的内存里 |
| **重启即消失** | TTL 过期、进程重启、或上一次 `compare` 已释放 —— 这三种情况下界面只说「本次修改前状态不可用，暂时无法比较本次修改的内容。」 |

**它不是版本。** 本版没有版本实体、没有版本号、没有历史时间线；`compare` 手里只有前后两个 `sha256`。

### 19.4 来源保护：三态与逐字措辞

改前 / 改后比对的是**血缘记录里的 `sourceSourceSha256`**（复刻当时那一版来源的指纹，§17.2），三态由 `sourceStatus()` 给出：

| 三态 | 逐字说法 |
|---|---|
| `unchanged` | 来源 Skill 的内容没有发生变化。 |
| `changed` | **来源 Skill 在本次修改期间发生变化。** |
| `unknown` | 没有拿到来源 Skill 的指纹，来源是否变化无法判断。 |

**永远不许说「Agent 修改了来源」。** 指纹不同只能说明来源变过，不能说明是谁改的 —— 没有直接证据（与 §17.6 的「来源变了，差异就不全是『你改的』」是同一条纪律，只是这里更强：连猜测的余地都不留）。

### 19.5 范围契约与锁死项

`MODIFICATION_SCOPE_OPTIONS` 是**封闭的 6 个 id，顺序固定**：

| id | `target` | `section` | 默认 |
|---|---|---|---|
| `skill-md-rules` | `skill-md` | `rules` | 可勾选 |
| `skill-md-workflow` | `skill-md` | `workflow` | 可勾选 |
| `skill-md-description` | `skill-md` | `description` | 可勾选 |
| `references` | `references` | — | 可勾选 |
| `scripts` | `scripts` | — | **锁死** |
| `assets` | `assets` | — | **锁死** |

- 锁死项由 `MODIFICATION_LOCKED_SCOPE_IDS` 定义（`scripts` / `assets`）：界面上**画出来但不可点** —— 「看不见它」比「画出来按不动」更不诚实。
- 不认识的 id 进 `unknown` 并如实回报；空集合 = **「只讨论，不要改动任何文件。」**（不是「全选」）。
- **验收目标**（`profiles`）复用 V0.9.0 的 `resolveSkillProfiles()`：`common` 永远被补上。
- 代发的消息由三部分组成，缺一不可：**用户的原话**（≤ 2000 字，不许改写、不许总结）、**结构化的范围**（本次唯一被结构化的东西）、**`MODIFICATION_CONTRACT_RULES` 的 12 条协议**（读取当前文件、只改列出的范围、不改 source Skill、不改无关项目文件、改名要用户明确要求、改后必须 read-back、改后必须跑验收、验收失败不得声称完成、不得自动跑 `scripts/`、不得自动 git、不得自动发布、不得自动改会话标题）。协议里**不写 `/name`** —— DSH 只有 `/rename`，那是会话标题。
- 协议前后各还有**一句流程说明**，与那三部分是分开的：协议之后是「**动手之前**：先说明你打算怎么改（哪些文件、哪些小节、为什么）。有拿不准的地方就用提问工具问用户，不要在猜的基础上改文件。」——「提出方案 → 用户确认 → 动手」（`FR-MOD-003`）落在原生对话里，插件**不代办也不解析**，但那句话必须提：不提就等于 Agent 直接动手。最后是「**做完之后**：把改动回读一次……」+「在它给出验收结论之前，不要说改好了。」两行。这里故意写「提问工具」而**不写工具名**：消息不该绑死 DSH 的内部工具标识（对照「协议里不许写 `/name`、只许写 `/rename`」那条教训）；DSH 里只有一支交互提问工具，所以这句在哪个版本下都读得懂。实测（`ui-craft` + 一句 10 字意图 + 只勾 Rules）正文 **29 行 / 564 字**，编号仍恰好 1–12。

### 19.6 客户端：一张入口、一个对话框、一块对比

- 详情页「Skill 演进」卡新增 `[修改 Skill]` 入口，**有血缘与没有血缘两个分支都有**（手写的 Skill 同样可以被改）；按钮定义一次、两个分支各用一次。
- `SkillModifyDialog`（`data-role="modify-dialog"`，仅在打开时渲染）：意图输入 `data-role="modify-intent"`（≤ 2000 字）、范围芯片 `modify-scope`、锁死项 `modify-locked`、验收目标芯片 `modify-profile`（`Common Core` 常驻且 `data-locked="true"`）、`modify-submit` / `modify-cancel`；失败时 `modify-error` 带 `role="alert"`。
- 关掉对话框后，详情页主列出现 `SkillModificationPanel`（`data-role="skill-modification"`，「本次修改对比」卡），四态：**`idle` 时整块返回 `null`**（常驻的一张空卡会被读成一种状态）、waiting、error（`mod-error`，`role="alert"`）、ready（三态结论 + 每行范围状态 `mod-scope`）。
- 主列顺序由守卫按字面钉住：**验收 → 本次修改对比 → 框架 → 本次运行逻辑 → 步骤证据 → `SKILL.md`**（§6.1）。`compare` 回来的 `validation` 同时刷新上面那张验收卡 —— 改完立刻能看到「现在符不符合规范」。

### 19.7 与 V0.9.0 验收的复用关系，以及验证证据

- **`validationFor()` 是共用的**：`begin` / `compare` 不新增验收实现；`compare` 把**刚读到的** definition view 传下去，同一次请求**不读两遍 `SKILL.md`**（§18.4）。
- **`readSkillFile()` 也是共用的**：`begin` 要的是整份文件（含 frontmatter），与 `readSkillBody()` 的口径差异在 §18.4 已经写明。
- 诚实边界写在 `MODIFICATION_DIFF_LIMITATIONS` 里（六条），其中两条最要紧：**行级差异是逐行比对的计数**（空白与换行的变化同样计入；超过 `MODIFICATION_DIFF_LIMITS.lcsLines = 1200` 时退化成「掐掉公共前后缀」的近似值并标注 `exact: false`）；**来源只比对指纹，不比对内容**。资源层上限 200、小节层 60、超范围 20。
- **验证证据**：守卫 27 `SKILL_MODIFICATION_OK`（§13.1）；`test/skill-modification.test.mjs`（22 项）、`test/modification-snapshot-store.test.mjs`（9 项）、`test/skill-modification-route.test.mjs`（9 项），另给 `test/client-render-smoke.test.mjs` 加了 2 条烟测（V0.9.1 落地时为 24 项，V0.9.2 之后是 25 项，见 §20.6）；**V0.9.1 落地时**工作树 `npm test` **553 项**、`npm run verify` **27 组**（V0.9.2 之后是 561 项 / 28 组）。
- **不做**（§16.2 第 11 条）：不做第二套 Agent Runtime、不做专属会话、不做结构化 Proposal RPC、不做版本实体 / 历史时间线、不替用户决定 Skill 应该变成什么、不自动跑 `scripts/`、不自动 git、不自动改会话标题。

---

## 20. 已安装列表排序（V0.9.2，已随 0.9.2 发布）

> **状态**：实现、测试与守卫都已完成，并已随 **`0.9.2`** 发布（2026-10-03，GitHub Release + npm；发布说明即 CHANGELOG 的 `## 0.9.2`）；**真机验收已于 2026-10-03 通过**（宿主原生返回 `ordering`；真机载荷 73 个 / 34 有 / 39 无）。需求侧对着 `spec/PRD.md` 的 `FR-ORD-*`。

一句话：**「已安装 Skill」按「这个 Skill 什么时候来到本机」倒序 —— 最近复刻出来的排在第一排。** 这一版只动排序与它读的那一个时间戳：**不新增路由**（仍 12 条）、不新增依赖、不动搜索、不动卡片样式。

用户原话（2026-10-03）：**「「已安装 Skill」中带 custom 都是我用复刻 Skill 复刻出来的，现在排序又在后面，我觉得可能我们要改一下排序的逻辑，就是最新创建时间可能优先排在最前面」「就是想在第一排就看到我刚才复刻的，这样我方便我找……我得翻好几页看名称看得到。」** 这条需求里有一个容易写错的词：**「创建时间」指的是「它什么时候来到这台机器」，不是「这个文件最后一次被写是什么时候」。** §20.1 就是为这一点写的。

### 20.1 为什么是**目录**的 `birthtime`，而不是 mtime / ctime / 文件级 birthtime

时间取 `<候选根>/<skillName>` 这个**目录**的 `birthtimeMs`。另外三条路都被排除，理由是实测出来的：

| 候选 | 为什么不用 |
|---|---|
| `mtime` / `ctime` | 它们说的是「最后一次被写 / 元数据最后一次变」。改一个字的正文就会让这个 Skill 跳到列表最前面 —— 用户要的「刚才复刻的那个」会被一堆「刚才编辑过的」挤掉 |
| **文件级** `birthtime`（`SKILL.md` 自己） | **在真机上不可靠，实测过**：编辑器改写 `SKILL.md` 是「写临时文件再改名」，所以它每次都变成一个**新文件**，`birthtime` 跳到改动那一刻。2026-10-03 真机修改 `deliver-prd-custom-custom-custom` 之后，`SKILL.md` 的 birthtime 是 **23:29**，而它的**目录**仍是复刻那一刻的 **22:39**。用文件级 birthtime，等于「改过正文的 Skill 就算刚加入」 |
| 目录 `birthtime` | 目录只在「复刻 / 新建一个 Skill」时被创建一次；§17 的复刻写盘（`mkdir` 不带 `recursive`）正好让这个时刻就是「它来到本机」的时刻 |

**候选根的 rank 顺序与复刻写入时用的是同一份**（`skillRootCandidates({ cwd })`，`src/storage/skill-clone-writer.mjs`）；同名在多个根里都存在时取**第一个**命中：

1. `<projectRoot>/.dsh/skills`
2. `<projectRoot>/.agents/skills`
3. `<DSH_HOME 或 ~/.dsh>/skills`
4. `<DSH_AGENTS_HOME 或 ~/.agents>/skills`

拼路径之前先用 `isSkillName`（`src/core/skill-clone.mjs`：`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`、≤128）筛一遍名字 —— 列表里的名字来自 registry，不保证是安全的目录名。`skillAddedAtByName({ names, roots })` 只读、不抛错：`stat` 失败、不是目录、`birthtimeMs` 不是有限正数，这个 Skill 就**不放进结果**（于是它走 §20.2 的「没有时间」那一边），**绝不拿别的时钟顶替**。

### 20.2 排序规则与三态

规则名是一个导出常量，客户端与文档都抄这一句：

```js
export const INSTALLED_ORDERING_RULE = 'added-desc-then-name'
```

`compareInstalledSkills`（`src/core/installed-view.mjs`）的比较只有两条：

1. **两边都读得到时间** → 时间**倒序**（最近的在前）；时间相同按名称。
2. **一边有一边没有** → **有时间的在前**，没时间的排在最后；两个都没有 → 按名称（A–Z）。

第二条是硬规则，**不是**「没时间的排最后」这句口号的自然结果：名称上 `loreflow-copilot` 排在 `ui-craft` 前面，但 `ui-craft` 有真实加入时间，顺序仍然是 `ui-craft` 在前（`test/installed-view.test.mjs` 直接钉住这一条）。

三态写在响应里，客户端照念：

| 态 | `ordering` | 列表顺序 | `limitations` |
|---|---|---|---|
| **全都有** | `addedAtKnown = 全部`、`addedAtUnknown = 0` | 时间倒序 | 无 added-at-* |
| **部分有** | `addedAtKnown > 0` 且 `addedAtUnknown > 0` | 有时间的按时间倒序在前，没有的按名称排在最后 | `added-at-partial` |
| **全都没有** | `addedAtKnown = 0`、`addedAtUnknown = 全部` | 整体按名称 A–Z | `added-at-unavailable` |

计数是**按整个目录**算的，**不是**这次搜索结果：换一个搜索词不该改变「这台机器上有几个说得出来」（`ordering` 与 `query` 无关，`skillCount` 才是过滤后的数）。

### 20.3 两处读盘与失败语义（逐条）

`GET /skill-trace/catalog`（§3.2 第 4 条）这一版多读两处，**都在 `buildInstalledView` 之外、都是只读、都不抛错**：

| 读什么 | 谁读 | 读不到时 |
|---|---|---|
| 目录 birthtime | `skillAddedAtByName({ names, roots })`（`src/storage/skill-clone-writer.mjs`） | 该名字不进 `addedAtByName` → 投影里 `addedAt: null`，计进 `addedAtUnknown` |
| 血缘库 | `lineageByTargetName()`（`src/dsh/host/index.js`，读 `lineageStore.list()`） | 返回 `null`（`catch` 里只说一句 `[dsh-skill-trace] lineage read failed`）→ 投影里 `lineage: null` |

四个限制码，逐条：

| 码 | 什么时候出现 | 界面说什么 |
|---|---|---|
| `catalog-coverage-incomplete` | `coverage.complete === false`（V0.8 起就在，V0.9.2 不动它） | 发现不完整，列表可能不全 |
| `added-at-unavailable` | **目录里至少有一个 Skill，且一个都读不到时间** | 「读不到加入本机的时间，这里按名称排列。」 |
| `added-at-partial` | 只读到一部分 | 「另有 N 个 Skill 读不到加入时间，按名称排在最后。」 |
| `lineage-unavailable` | 宿主没给出可读的血缘（`lineageByName` 不是对象） | 「读不到复刻记录，所以卡片上没有「复刻自」那一行。」 |

两条容易写错的边界：

- **零个 Skill 时两个 added-at-* 码都不给。** 一个空目录没有「加入时间」可说，而「一个 Skill 都没有」与「有 Skill 但读不到时间」必须分得开（`test/installed-view.test.mjs` 的 incomplete-discovery 一例明确断言了这点）。所以 `added-at-unavailable` 的条件是 `skills.length > 0 && addedAtKnown === 0`。
- **`lineage-unavailable` 分的是「没读过」和「没复刻过」。** 没有血缘字段就渲染成「这个 Skill 不是复刻来的」，是把一次读盘失败说成一句事实断言。宿主的血缘投影在 core 的形状检查之外还过一道 `safeSkillName`，所以一个不像 Skill 名的来源名在 core 这一层就被丢掉、渲染成 `null`。

### 20.4 客户端只念不排

- **客户端一个 `.sort(` 都没有**（守卫在切片里钉住这一条）。顺序是宿主给好的，客户端照着渲染 —— 两处各排一次，早晚会排出两个不同的顺序。
- **规则名也不写死**：`added-desc-then-name` 这个字面**不出现在客户端**（守卫钉住）。列表头说的是 `ordering.rule` 描述的那件事，而不是抄一遍常量。
- **没有 `ordering` 就什么都不说**：`InstalledOrderNote({ ordering, limitations })` 在 `ordering` 不是对象时**返回 `null`**。旧版宿主（或一次降级的响应）不该让界面宣称一个它没拿到的顺序。
- 卡片 meta 上是**两条分开的事实**：`MM-DD` +「加入本机」，以及「复刻自 X」。它们**不合成一句**（§20.5）。日期是**绝对的、只到日**：`MM-DD`，**跨年才**带 `YYYY-` 前缀（2026-10-03 用户：「我交互体验将来只需要有月日就行」）；**时:分不进界面**（守卫钉住 `getHours` / `getMinutes` 不许出现）——「谁更新」由列表顺序回答，而界面里也不许有「今天 / 刚刚 / 几分钟前」（守卫钉住）：相对时间会在页面开着的时候悄悄变旧。
- **元信息只说例外**（`FR-ORD-013`）：调用方式的两个开关默认成立时**一个字都不写**（只在 `=== false` 时说「不可由模型调用」/「不能用 `/name` 调用」），`provider` 为默认的 `filesystem` 时也不写。真机实测 69 个 Skill 全是 `{modelInvocable:true, userInvocable:true}`、68 个 `provider: 'filesystem'` —— 恒为真的标签在每张卡上重复一遍，读者会开始以为它在区分什么。判断用严格的 `=== false`：载荷缺字段时 `undefined` **不许**被念成「不成立」。
- 缺时间就**不显示时间**：不是显示一个占位符，也不是拿血缘的 `createdAt` 冒充。

### 20.5 与复刻 / 血缘的关系：为什么不能合成一句「创建时间」

一张卡片上现在有两个不同的时间与来源：`addedAt`（目录 birthtime，§20.1）与 `lineage.createdAt`（§17 那条复刻记录的写入时刻）。**它们不是同一件事，也不该合成一句。**

- 一个 Skill 可以是**手动复制的**、或是用户**自己新建的**：它有 `addedAt`，但**没有血缘**（`lineage: null`）。合成一句「创建时间」会把「本插件没执行过这次复刻」说成「它是被复刻出来的」。
- 反过来，血缘里的 `createdAt` 是**记录写入**的时刻，`addedAt` 是**目录出现**的时刻；两者通常只差几毫秒，但拿哪一个去排序是两套语义 —— 排序问的是「它什么时候来到本机」，所以用 `addedAt`。
- 「复刻自 X」**只给来源名与时间戳**：不给绝对路径、不给正文、不给来源指纹（§11.2 的白名单）。**血缘读不到时那一行不出现**，并由 `lineage-unavailable` 把原因说出来（§20.3）——「看不见它」和「它不存在」必须能分开。

### 20.6 验证证据

- **守卫 28** `INSTALLED_ORDERING_OK`（§13.1）：`installed-view.mjs` 零 import、三个限制码逐字、宿主两处读盘与血缘投影的字面、客户端切片里的 `data-role="installed-order"` / `ordering` 缺失即 `null` / 卡片上的两条事实，以及**三条不许**（不许 `.sort(`、客户端不许出现规则名、不许出现相对时间词）。
- **测试**（`0.9.2` 发布口径：`npm test` **561 项**、`npm run verify` **28 组**）：
  - `test/installed-view.test.mjs`（现 **17** 项）：倒序与两种兜底、计数按整个目录而不是搜索结果、加入时间三态、`addedAt` 为 0 或缺失时是 `null`、血缘来源名的形状校验、`lineage-unavailable` 与「真的没有血缘」的区别。
  - `test/client-render-smoke.test.mjs`（现 **25** 项）：有 `ordering` 时列表头渲染出来、没有 `ordering` 时**不渲染**、读不到时间时文案是「读不到加入本机的时间」。
- **不新增路由**：宿主仍是 **12** 条（`/catalog` 的路径、语义与响应外层都没变，只是多两个只读字段）。

### 20.7 不做清单

- **不做历史版本对比 / 时间线**：`addedAt` 是一个时间戳，不是版本史；没有版本实体、没有前后两版、没有「加入本机 N 天」这类派生。
- **不做用户自定义排序**：不给排序键选择器、不做排序偏好落盘、不加 `preferences` 字段。列表只有一个顺序，且它在宿主算出。
- **不动 A–Z 兜底**：读不到时间就按名称排 —— 这条从 V0.6 起一直在，V0.9.2 只是把它挪到「有时间的那批之后」。
- **不新增路由、不新增依赖、不动搜索与卡片样式**（`dependencies` 保持为空）。
- **不用 mtime / ctime / 文件级 birthtime** 冒充「加入时间」（§20.1）。
- **不在客户端重排、不写死规则名、不说相对时间**（§20.4）。
- **不把「读不到」写成「没复刻过」**（§20.3）。

---

## 21. Skill 实例验收（V0.10.0，已随 `0.10.0` 发布）

> **状态**：实现、测试与守卫都已落地（2026-10-03），并**已随 `0.10.0` 发布**（2026-10-05，GitHub Release + npm，tag `v0.10.0`）。需求侧对应 `spec/PRD.md` §5.12 的 `FR-INST-001`–`020`。与 §18 / §19 的分工：§18 回答「这个 Skill 当前符不符合规范」、§19 回答「我想让它怎么改、改完到底变了什么」，本节回答**「我刚刚改的这个 Skill，在一个真实任务里有没有按预期工作」** —— 而这个问题**由人在一个干净会话里回答**，插件只负责把可核对的任务交出去。

一句话：**把「这次修改」变成一段可以真的拿去跑一遍的真实测试任务与一组观察项，交给用户；插件不运行它、不读结果、不判定。** 它**不新增页面、不新增导航、不新增 Route、不新增第二套 Agent Runtime**；宿主**一行未动**（仍 1625 行、12 条路由）。

### 21.1 为什么是确定性生成，而不是调模型

`src/core/skill-instance-test.mjs`（**571 行、零 `import`、零依赖**）里的 `buildSkillInstanceTest(input)` 是一支**纯函数**：不读盘、不读时间、不掷骰子、不调模型。守卫 `SKILL_INSTANCE_TEST_OK` 在**代码层**钉死这一点（`import ` / `require(` / `Math.random` / `Date.now` / `new Date` / `navigator` / `fetch(` / `setTimeout` 一个都不许出现），测试另外断言「同一份输入两次调用逐字节一致」。模块同时导出规格 §15 建议的别名 `buildInstanceTest`。

理由就是 `FR-INST-020` 的终验判据：**必须能证明「生成出来的 Prompt 真的是针对这次修改的」**。

- 如果生成过程里有模型或随机，那「针对这次修改」就只是一句要人相信的话；现在它是一条**可以断言的等式**：同一份输入 → 同一份 Prompt。这是「同一份输入同一份 Prompt，才可断言这段 Prompt 是针对这次修改的」的唯一实现方式。
- `FR-INST-016` 允许模型参与「生成测试任务」，但当前架构里没有合适的入口（生成发生在客户端详情页的纯前端状态里，宿主不参与）。第一版因此**复用现有能力**（确定性纯函数）而不是新开一个模型入口 —— 这也正是「不新增路由」能成立的原因。
- 生成器接受 `validation`（静态验收结论）作为输入，但**本版只用它说明静态层已经摆在那里，不下任何结论**。

### 21.2 两个物理分离的产物

| 产物 | 给谁 | 形状 | 位置 |
|---|---|---|---|
| `prompt.text`（= `promptText`） | **给 Agent** | `【任务】【工作目标】【输出要求】【注意】` 四块，顺序固定 | `data-role="mod-instance-prompt"`，按钮 `[复制测试 Prompt]` |
| `observations` | **给人** | 每条必是疑问句，顺序固定、最多 6 条（`MAX_OBSERVATIONS = 6`） | `data-role="mod-instance-observations"`，抬头「预期观察点」 |

- 四块结构由 `INSTANCE_TEST_PROMPT_BLOCKS = ['任务','工作目标','输出要求','注意']` 固定；`【注意】` 逐字是：**「请直接完成任务，不需要解释你为什么选择某个 Skill。请按照当前环境中的 Skill 能力完成任务。」**
- **任务句不再整句照搬 `description`（2026-10-03 用户要求修正）**：`description` 大多写成「当用户……时使用。……」——那是给**模型**看的路由信息，不是一件可以交付的工作。现在 `subjectOf()` 先剥掉触发前缀、再截到第一个句读取出「这件事是什么」，`coreLines()` 把它写成一句真实的**指派**：`请完成下面这件真实工作，要真的做出来，不要只讲怎么做：<subject>。`（拿不到描述时退回一句通用的指派「请完成一件这个能力真正要解决的问题，要真的做出来，不要只讲怎么做。」），而不是把 `description` 原样搬进 Prompt。过长的文字走模块内部新增的私有 `clip()`：**按词边界**截断 —— 先在窗口里找最后一个空格，再丢掉 `to` / `of` / `a` 这类过短的尾词，末尾标点一并去掉后补省略号；中文没有词间空格，**找不到空格时才退回按字符截**。因此此前那种 `…to avo.` 的半个单词不会再出现。
- 观察项顺序固定：`used`（它是否实际使用了相关 Skill？）→ `flow`（Skill 中的关键流程是否被执行？）→ 按范围顺序的各范围观察重点 → `modified-behaviour`（本次修改涉及的行为是否体现？）→ `kept`（原有核心能力是否保持？），超出 6 条直接截断。
- **观察项一个字都不进 Prompt。** 这不是排版偏好：把「验收关注点」写进 Prompt，等于在 Prompt 里**重新教 Agent 该怎么做**，于是测的是这段说明而不是 Skill（`FR-INST-005`/`006`）。在载荷里它们就是**两个字段**，守卫要求两边不得互相包含。
- 同理，Prompt 里不许出现：六个**范围 id**（`skill-md-workflow` / `references/` / `assets/` / `scripts/` …）、`SKILL.md` 里的小节标题与步骤名、「本次修改 / 这次修改 / 刚才的修改」这类**元话语**，以及 `INSTANCE_TEST_PROMPT_FORBIDDEN_WORDS` 里的判断词与工具词。
- `usableSourceText()` 是兜底：从 Skill 正文摘出的句子一旦撞上禁用词就**整句丢掉**、退回中性说法 —— 正文是别人写的，插件不能保证它不用「成功 / 评分」这类词。
- 观察项抬头与提示：`INSTANCE_TEST_OBSERVATION_TITLE = '预期观察点'`、`INSTANCE_TEST_OBSERVATION_NOTE = '注意：观察不到痕迹不等于没有被执行；下面只列可以核对的现象。'`

### 21.3 六个输入、`trace`，与四种「生成不出来」

`buildSkillInstanceTest({skillName, intent, comparison, definitionText, description, framework, validation})`：输入由调用方给（客户端 `generateInstanceTest()`，见 `src/dsh/client/client.js`），模块自己不读盘、不请求。`skillName` 与 `definitionText` 决定任务与回归约束，`comparison`（就是 `diffSkillModification()` 的结果）决定改了什么、落在哪个范围，`description` 决定任务的适用场景，`intent`（用户自己写的那句修改意图）**只用于对齐主范围**，`framework`（`skill-framework.mjs` 的解析结果）用于产出回归约束，`validation` 只被记录。

- **`trace` 如实记录这次真的用了哪些输入**：`trace = { sources, frameworkAvailable, validationStatus, validationUnknownCount, hintedScopeId }`。`sources` 按 `INSTANCE_TEST_SOURCES = ['intent','scopeIds','comparison','description','framework','validation']` 的固定顺序，只列出**这次真的在场**的项（不在场的不出现）；`hintedScopeId` 是「用户意图点名了某个**确实被 diff 改动过**的范围」时选中的那个范围，它决定 `primaryScopeId`（否则按 `INSTANCE_TEST_PRIMARY_SCOPE_ORDER` 取第一个改过的范围）。界面「这个任务是怎么来的」里那两行（`data-role="mod-instance-trace"`）念的就是 `sources` 与 `primaryScopeId`。
- **意图原文一个字节都不进结果**（规格 §17.1 / §20.2）：意图只用于（a）对齐主范围、（b）在 `trace.sources` 里记一笔。理由是硬的：把「你刚才改了什么」写进 Prompt，等于在 Prompt 里把 Skill 该怎么做**重新教一遍**，于是测的是这段说明而不是 Skill。守卫因此断言 `JSON.stringify(结果)` 里不含意图原文。
- **缺框架 / 缺 validation 不进入 `unavailable`**：生成照样能出，只是 `limitations` 多一条诚实的、无判断的说明 —— 拿不到框架 → 「这次没有拿到这个 Skill 的框架结构，回归约束只从正文小节里找，可能比框架里声明的少。」；没有静态验收结论 → 「这次生成没有静态验收结论可用，实例验收不据此推断实际行为。」；静态验收里有 `unknown` 结论 → 「静态验收里有判不了的结论，实例验收不据此推断实际行为。」（`validationUnknownCount()` 数 `profiles[].status === 'unknown'`，并与 `validation.status === 'unknown'` 取大）。

| reason | 什么时候 | 界面上的实话（`INSTANCE_TEST_UNAVAILABLE_MESSAGES`） |
|---|---|---|
| `no-comparison` | 还没有「本次修改对比」 | 还没有可用的本次修改对比，因此没有可生成的任务。 |
| `comparison-unavailable` | 对比本身不可用（改前快照丢了） | 本次修改前状态不可用，因此没有可生成的任务。（对比自带 `message` 时用它） |
| `no-changed-scope` | 改动没落在六个可测范围里（含空集合） | 这次改动没有落在可以生成实例验收的范围里，因此没有可生成的任务。 |
| `no-definition` | 正文与描述都读不到 | 读不到这个 Skill 的正文与描述，因此没有可生成的任务。 |

不可用结果里 `prompt: null` —— **一个 Prompt 都不画**，界面渲染 `role="alert"` 的 `data-role="mod-instance-unavailable"`，**绝不退回一个什么都能用的通用任务**（`FR-INST-018`）。坏输入（`null` / 字符串 / 缺字段）只会走成上面四种之一，**不抛异常**。

### 21.4 六个修改范围：各自的观察重点与证据边界

`INSTANCE_TEST_SCOPE_FOCUS` 的六个键与 `src/core/skill-modification.mjs` 的 `MODIFICATION_SCOPE_IDS` **逐字一致**（测试与守卫都断言）——它刻意**不 import** 那个模块，为的是保住「零依赖」这张入场券。

| 范围 id | 界面标签 | 框架角色（`INSTANCE_TEST_SCOPE_ROLES`） | 观察重点（疑问句） |
|---|---|---|---|
| `skill-md-rules` | Rules | `rules` | 它声明的约束在产出里是否被遵守？ |
| `skill-md-workflow` | Workflow | `workflow` | 产出的形成顺序与步骤要求是否体现？ |
| `skill-md-description` | Description | `trigger` | 这次任务的描述是否落在它声明的适用场景里？ |
| `references` | references | `resources` | 它自己的资料是否在任务中被实际用到？ |
| `scripts` | scripts | `resources` | 它涉及的脚本能力是否被触发并体现在产出里？ |
| `assets` | assets | `resources` | 它涉及的资源是否真的被用上，而不是只出现在产出旁边？ |

- **主范围优先级**：`INSTANCE_TEST_PRIMARY_SCOPE_ORDER = ['skill-md-workflow','skill-md-rules','skill-md-description','references','assets','scripts']` —— 流程与规则排在最前，因为它们是「任务本身要不要变形」；资源三类只改文件，任务形状通常不变。六个范围各得到**不同**的 Prompt（测试断言六份互不相同）；三个内部意图 `core` / `boundary` / `regression` **只是内部清单**，界面第一版只有一个按钮、只生成一个综合 Prompt（`intent: 'core+boundary+regression'`，`FR-INST-008`）。
- **证据边界（`FR-INST-011`）**：三个资源类范围**只看得到文件的增删改，看不到文件内容** ⇒ 任务按范围写、不按文件内容写；命中的话 `limitations` 多一条说明。**声明存在不等于运行时用了它**：插件不自动执行 `scripts/`、不判定脚本是否成功、不因为声明了某个资源就推断它被用上。`references` / `scripts` / `assets` 只能作为**观察项**摆出来，**不许**用来推断运行时行为。
- **「没有观察到证据，不代表没有执行」** —— 这句话直接印在观察项抬头下面（`INSTANCE_TEST_OBSERVATION_NOTE`），也是本版全部判定的边界。
- **回归约束按框架产出，且只能来自没被这次改动触及的声明能力**（`FR-INST-009`）：`regressionOf({ definitionText, framework, changedTitles, changedScopeIds })` 先看 `framework.sections[]`，排除「标题被 diff 碰过」与「角色映射到改过的范围」（`INSTANCE_TEST_SCOPE_ROLES`）的小节，产出 `这次改动不应影响原有「X」的要求：…`（句子经禁用词过滤并截到 48 字，最多 3 条）；框架里一条都拿不到才退回**正文二级小节**，并如实报 `regression.source = 'framework' | 'definition' | null`。取不到时**如实**进 `unavailable`，**绝不**写「确保原有核心能力没有受到影响」这种泛化句。

### 21.5 界面：位置、出现条件与「做什么、不做什么」

- **位置固定**：`Skill Evolution → 本次修改 → 本次修改对比 → 实例验收`。它是 `SkillModificationPanel`（`data-role="skill-modification"`，「本次修改对比」卡）**内部的一整段**（`data-role="mod-instance"`），**不是新组件**；`phase === 'idle'` 时整块返回 `null`，实例验收随之消失 —— 没有修改事务时连这一段都不出现（`FR-INST-003`/`017`）。**不建「测试中心」，不新增页面、导航或 Route，不新增第二套 Agent Runtime。**
- **两种状态**：
  - 生成入口 `[生成实例验收]`（`data-role="mod-instance-generate"`）：调 `onGenerateInstanceTest` → 上面那支纯函数。**无网络调用、无模型、无第二次读盘。**
  - 生成之后摆出 Prompt（`mod-instance-prompt`）与 `[复制测试 Prompt]`（`data-role="mod-instance-copy"`）：只写剪贴板（复制成功就地显示「已复制」），**绝不注入输入框、绝不发消息、绝不触发 Agent**；旁边一句**弱提示**：「建议在新的 DSH 会话中运行，以避免当前修改对话中的上下文影响测试结果。」
- 这一屏一共 **14 个 `mod-instance*` data-role**：`mod-instance` / `-hint` / `-unavailable` / `-scope` / `-prompt` / `-copy` / `-run-hint` / `-observations` / `-observation` / `-regression` / `-regression-unavailable` / `-limitations` / `-generate` / `-trace`（新增，已进守卫的 `guardedRoles` 白名单）。抬头是 `INSTANCE_TEST_HEADLINE = '针对你刚才修改的 Skill，这个任务可以直接验证修改是否生效。'`；卡里另有「验证目标」块（`INSTANCE_TEST_GOAL_TITLE = '验证目标'` / `INSTANCE_TEST_GOAL_TEXT = '验证本次修改是否改变了这个 Skill 的实际行为。'`）与「测试 Prompt」块抬头（`INSTANCE_TEST_PROMPT_TITLE = '测试 Prompt'`）；限制折叠是 `INSTANCE_TEST_LIMITATION_NOTE = '这个任务是怎么来的'`。
- **`mod-instance-trace` 那两行**（画在 `data-role="mod-instance-limitations"` 那个折叠里，排在 `limitations` 各条之前）：`这个任务用了这些输入：<sources 的人话标签，` · ` 分隔>。`（六个 id → 人话：`intent` 用户修改意图 / `scopeIds` 修改范围 / `comparison` 修改前后对比 / `description` Skill 描述 / `framework` 框架结构 / `validation` 静态验收结论）与 `任务形状由主范围决定：<范围标签>（你这次的意图点名了它）。`（只有 `trace.hintedScopeId` 真的命中才追加括号里那半句）。
- **意图只活在页面状态里**：详情页 `const [lastIntent, setLastIntent] = React.useState('')` 留住用户写的那句话，`SkillModifyDialog` 的 `.then((body) => onDispatched(body, intent))` 与详情页的 `onDispatched(body, dispatchedIntent)` 为它改了签名；生成时传 `intent: lastIntent || null` 与 `framework: detail?.framework ?? null`（此前 `intent` / `framework` 根本没接、`validation` 收了不用）。**宿主从头到尾不知道它**：不落盘、不进 receipt、不进 session log；页面刷新即失，那时 `trace.sources` 少一项（`intent` 不再出现）。
- 结果**只活在详情页前端状态**里（与本次修改、本次 diff、静态验收同级），刷新后重新生成；本版**不保存测试历史**（`FR-INST-014`）。它**不落盘、不进收据、不进会话日志、不上传**，也不新增任何持久结构（同 §11.2 第 7 条）。
- **它不替用户运行。** 复制走之后发生的一切都在插件之外：插件不知道那个会话里发生了什么，也不去问。

### 21.6 守卫与测试证据

- **守卫 29** `SKILL_INSTANCE_TEST_OK`（§13.1）：生成器零依赖（代码级）、四块结构顺序、Prompt 禁范围 id / 元信息 / 禁用词、观察项必须疑问句且不进 Prompt、同输入同输出、结果禁结论词、三种不可用如实说、客户端第 8 支 `require`（`require('../../core/…')` 总数恰为 8）与 `mod-instance-*` 六个关键 data-role（本屏共 **14** 个、`mod-instance-trace` 已进 `guardedRoles`）、禁用产品名；**「6b」段（本轮新增）**：意图点名**且真的改过**的范围决定主范围、回归约束按框架产出且不含被碰过的角色（fixture 里「运行逻辑」被碰过、「输出」没碰过）、`regression.source === 'framework'`、意图原文不出现在 `JSON.stringify(结果)` 里、`trace.sources.join(' ') === 'intent scopeIds comparison description framework'`、diff 自己的变更小节标题（fixture 里是「步骤 4」）不许出现在 `prompt.text`、源码里必须有 `export const buildInstanceTest = buildSkillInstanceTest`，另加 5 条客户端 needle（`INSTANCE_TEST_GOAL_TITLE` / `INSTANCE_TEST_PROMPT_TITLE` / `'data-role': 'mod-instance-trace'` / `intent: lastIntent || null` / `framework: detail?.framework ?? null`）。
- **`test/skill-instance-test.test.mjs`（27 项）**：上表逐条的行为断言，外加「六个范围六种不同 Prompt」「主范围跟着意图点名过的范围走、点到没改过的不算」「`trace.sources` 只列在场项且顺序固定」「意图原文不进结果」「回归约束不含被改小节名 / 被碰过的角色」「缺框架 / 缺 validation 只多一条 limitation、不进 `unavailable`」「坏输入只降级不抛」「结果里没有判断词 / 分数 / 相对时间」「范围清单与 `MODIFICATION_SCOPE_IDS` 逐字一致」「资源类限制 2 → 3 条」「源码零 `import`、不读时间、不掷骰子」「别名导出存在」，以及本轮新增的第 27 例 —— **「任务句按词边界截断：英文描述不会切在半个单词上」（省略号前停在一个完整的词上，且不长的描述不出现省略号）**。
- **`test/client-render-smoke.test.mjs`（该文件仍 26 项）**：在它原有的实例验收用例里补了断言 —— 「验证目标」与「测试 Prompt」两块抬头真的渲染、`data-role="mod-instance-trace"` 的行存在且至少一行、那两行含有「这个任务用了这些输入」与「任务形状由主范围决定」，并且 `trace.sources` 的**内部 id 不许出现在界面文案里**（界面念的是人话标签）。用例的其余部分仍是「拿到的是一份**任务**而不是一个**结论**」：ready 时 Prompt 与观察项各自渲染且互不包含，idle 时只给入口、连 Prompt 都不画，点 `[生成实例验收]` 真的调到回调，不可用时 `role="alert"` 且不画 Prompt，没有修改事务时整段长度为 0。
- 发布口径（`0.10.0`）：`npm test` **590 项**全绿、`npm run verify` **29 组** `_OK`。
- **source hash 的口径**：`clientSourceHash()` 只哈希 `src/dsh/client/` 下的文件（见 `scripts/build-client.mjs`）。本轮只改 `src/core/skill-instance-test.mjs`，因此 `dist/client.js` 变成 **189256 字节**（bundle 变长，见 §9.1）而 source hash 仍是 **`faed5e9cef7db24c`** —— 改 `src/core/` 不影响这个值，别拿它当「这一版动了什么」的指纹。

### 21.7 本版不做什么

- **不自动运行**：不自动建会话、不自动发 Prompt、不等待 Agent、不读回结果、不判定（`FR-INST-013`）。用户点「复制测试 Prompt」之后发生的一切都在插件之外。
- **不判定成功**：没有成功率、通过率、评分、得分、优秀、合格、有效、无效；输出平面字符串里出现这些词就是失败（守卫按字面钉死）。最多说「已生成实例验收任务」。
- **不做 Test History / Test Runs / Evaluation Database / Benchmark Dataset**（`FR-INST-014`/`019`）。
- **不做三按钮 / 测试任务列表**：内部支持 `core` / `boundary` / `regression` 三种意图，界面第一版**只有一个按钮、只生成一个综合 Prompt**（`FR-INST-008`）。
- **不做「对任意已安装 Skill 生成泛化测试」**：只针对**本次修改**，必须有修改事务（`FR-INST-003`）。
- **不新增页面 / 导航 / Route / 第二套 Agent Runtime**（`FR-INST-015`）；原计划的 `POST /skill-trace/instance-test` **已取消**，宿主因此一行未动。
- **不把实例验收接回 Skill Detail 的判定链路**：不做 Baseline / With Skill 对比、不做多轮自动回归、不做 Evaluation Dashboard —— 那是 **V1.0 的 Skill Evaluation**（`FR-INST-019`）。
- **不新增依赖、不新增落盘。**


---

## 22. Skill 评测（V1.0）

> **状态**：**全部落地**。§22.3–§22.6 是纯函数层（`src/core/skill-evaluation.mjs`，565 行）；§22.7 的落盘（`src/storage/evaluation-store.mjs`，294 行）与第 13 条路由（`handleEvaluation`，`src/dsh/host/index.js:784`）已实现；§22.8 的界面（客户端 `data-role="eval-card"`，30 个 `eval-*`）已实现；§22.9 的第 30 组守卫 `SKILL_EVALUATION_OK` 已落地。`npm test` 636 项 0 失败，`npm run verify` 全绿。需求依据是 `spec/PRD.md` §5.13 的 `FR-EVAL-001`–`018`；用户 2026-10-05 已授权新增本机落盘与一条 `POST` 路由（`FR-EVAL-016`）。

### 22.1 为什么是「可重复的实验记录」，而不是评分器

V0.10.0 的实例验收是一次性的：生成一份 Prompt，跑一遍，看过就过去了。**评测要回答的是另一个问题**：同一个任务，改前发生了什么、改后发生了什么？这个问题只有在**同一个 Case 被反复跑**并且**每次实验条件都被记下来**的时候才成立。

**永久禁令（`spec/PRD.md` §2.3）**：不产出任何聚合指标（通过率、稳定性百分比、平均分、方差），不做 benchmark 排名，不给「Skill Score」。理由不是清高，是外部证据：`SWE-Skills-Bench`（arXiv 2603.15401）实测 49 个公开 SWE Skill 里 **39 个零增益、平均 +1.2%、3 个负增益最多 −10%、token 开销最高 +451%** —— 一个聚合分数会把「看不出差别」伪装成一个结论，而 39/49 的真相恰恰是「看不出差别」。

### 22.2 四个模块与落地顺序

**落地顺序：Case → Run → Comparison → Runtime Evidence**（`FR-EVAL-002`）。证据是**解释层**，最后做：先把「同一个 Case 跑两次的条件并排摆出来」做对，再谈「运行时看到了什么」。**界面顺序与之相反**：Case → Before/After 条件 → 四段证据 → 断言与对照。

### 22.3 Case：身份、哈希由谁算、为什么是纯函数

`buildEvaluationCase(input)` 的输入与 `buildSkillInstanceTest` 同一份（`skillName` / `intent` / `comparison` / `definitionText` / `description` / `framework` / `validation` / `scopeIds`），外加 `skillFingerprint = {instructionSha256, match}` 与可选 `caseId`。产物：

```
{schemaVersion, generatorVersion, caseId, skillName, skillFingerprint,
 scopeIds, changedScopeIds, primaryScopeId,
 taskPrompt{task,goal,output,note,text}, observations[], regressions[],
 regressionUnavailable, limitations[], source:{kind:'instance-test'}}
```

- **任务 Prompt 与观察点逐字来自 V0.10**（`FR-EVAL-005`）：一个字的第二套措辞都不写，否则「可重复」随即失效。
- **`caseId = sha256(caseHashInput(...))`，哈希在宿主层算**（`FR-EVAL-003`）：生成器要保持 `FR-INST-021` 的**零 `import`**（客户端要 `require` 它），而 `node:crypto` 会破坏这一条。这一层只产出**定序的哈希输入六行**：`dsh-skill-evaluation-case@1` / `generator:1.0.0` / `skill:<名>` / `fingerprint:<sha256|unavailable>` / `scopes:<逗号连接>` / `prompt:<任务 Prompt 全文>`。
- **`EVALUATION_CASE_GENERATOR_VERSION = '1.0.0'` 是身份的第四个输入**（`FR-EVAL-003`）：生成器改了措辞而版本没升，`caseId` 会**静默复用**一个已经不对应的身份 —— 测试把版本行钉成常量，改代码忘升版号会红。
- **输入里不许有时间、随机数、会话 id**（`FR-EVAL-003`）：测试用 `/Date\.now|Math\.random|new Date\(/` 直接扫源码。
- **Case 绑定生成它的那一版 Skill，不说「过期」**（`FR-EVAL-004`）：`skillFingerprint` 记的是那一版；Skill 再改一次，旧 Case 仍然是**另一个** Case，不是它的替代品。

### 22.4 Run：字段表与缺项语义

`normalizeEvaluationRun(input)` 是 `FR-EVAL-006` 那张字段表的**唯一入口**，任何别的模块都不许自己拼 Run。字段：`runId` / `caseId` / `startedAt` / `turn` / `step` / `provider` / `model` / `reasoningEffort` / `contextWindow` / `dshVersion` / `pluginVersion` / `observedInstructionSha256` / `currentInstructionSha256` / `match` / `load{status,seq}` / `trigger{catalogPublished,offerCount}` / `runtimeEvents{activities[{name,count}],total}` / `outcome{source,text}` / `judgements{observationId:verdict}`。

- **缺项一律 `'unavailable'`，不猜、不省略**（`FR-EVAL-006`）：`startedAt` / `turn` / `step` / `contextWindow` 缺了是 `null`，其余是 `'unavailable'`。
- **字段名沿用源码**：`observedInstructionSha256` / `currentInstructionSha256` / `match` 就是 `src/core/source-snapshot.mjs:179-181` 的名字（`FR-EVAL-006` 的脚注）。
- **`match` 只有三态**：`match` / `mismatch` / `unavailable`；`load.status` 只有 `loaded` / `offered-only` / `unavailable`；`outcome.source` 只有 `user` / `agent`。
- **模型与 Provider 只读元数据**（`FR-EVAL-007`）：`request/context` 的 `{provider, model, contextWindow}` 与 `request/header.header.config` 的 `LlmCallConfig{provider, model, reasoningEffort}`。**不读 prompt 正文、不读工具参数与结果**。模型 provider（`dsh-llm`）与 Skill 来源 provider（`filesystem`）**不得混用同一种说法**。
- **DSH 版本还没有已验证的读取方式**（`FR-EVAL-008`）：真机实测 `createRequire(插件文件)('@deepseek-ai/dsh/package.json')` → `MODULE_NOT_FOUND`（符号链接路径与真实路径都试过）。候选两条：读运行 profile 的 `package.json` / 其 `node_modules/@deepseek-ai/dsh/package.json`，或由宿主注入常量。**读不到就写 `unavailable`**，不许拿插件版本冒充。
- **时间优先取事件信封的 `time`**（epoch ms），`Date.now()` 只兜底；**`turn` / `step` 是日志顺序游标**，不得说成时间、也不得说成「第几轮」（`FR-EVAL-009`）。

### 22.5 四段证据与三条不等式

`buildRuntimeEvidence({case, run})` 出四段，**顺序固定**：`trigger` → `load` → `use` → `outcome`（`FR-EVAL-010`）。每段 `{id, label, status, source, facts[], reach}`，`status ∈ observed / not-observed / unavailable`：

| 段 | 能说什么 | 这一段够不着什么（`reach`，界面上逐字显示） |
|---|---|---|
| 触发 `trigger` | 本次会话向模型提供过这个 Skill（`catalogPublished`，事实） | 「提供 ≠ 使用」 |
| 加载 `load` | 在 seq N 拿到了指令正文 + `sha256` + `match` 三态（协议级） | 只证明「这些字节进入了模型可见的对话」，**不证明模型采用了它** |
| 使用 `use` | 工具活动**只报元数据**（次数与工具名）+ 用户 / Agent 的陈述 | 有工具活动 ≠ 用了这条指令；没有工具活动也 ≠ 没用 |
| 结果 `outcome` | **只能来自用户判定或 Agent 自报**（插件不判定） | 结果好 ≠ 是这个 Skill 造成的；结果好 + 没有加载证据 ⇒ 不能归因 |

**三条不等式做成界面上的固定说明句**（`FR-EVAL-011`）：`加载 ≠ 使用` / `使用 ≠ 结果` / `结果 ≠ 这个 Skill 造成的`。`EVALUATION_INEQUALITIES` 与 `EVALUATION_INEQUALITY_NOTE` 是常量，界面逐字渲染，不许改写成「可能未必」之类的软化说法。

### 22.6 Comparison：两条轴、条件表、事实词

`compareEvaluationRuns({case, before, after})` 的**唯一合法性前提是「同一个 Case」**（`FR-EVAL-013`）：`caseId` 两侧相等且非 `null`，否则 `axis = null`、一句对照都不给，理由是「这两次运行不是同一个 Case，因此不做对照。」**禁止拿两个不同任务并排**。

- **两条轴**：`before-after`（同一个 Case、两版 Skill：指令指纹不同）/ `baseline-with`（同一版 Skill、两侧指纹都读得到且相同，只有「有没有提供过」不同）。
- **实验条件表只有四项**：`model` / `provider` / `reasoningEffort` / `contextWindow`（`EVALUATION_CONDITION_FIELDS`）。**`observedInstructionSha256` 故意不在表里** —— 它是**被对照的东西**，当条件会让每一次「改前 vs 改后」都变成「不可对照」（这一条是被测试抓出来后改的，注释就写在常量上方）。
- **条件不同 ⇒ 不生成对照结论，但仍然并排摆放**，理由里点名哪几项不同（例：「有 1 项实验条件不同（模型），因此不做对照 —— 差异无法归因。」）。每行的对照列写 `EVALUATION_COMPARISON_WORDS.notComparable`。
- **对照列只用事实词**（`FR-EVAL-012`）：两次都通过 / 改前未通过 → 改后通过 / 改前通过 → 改后未通过 / 回归信号 / 两次都无法判断 / 不做对照。**不折算成分数、不排序**；`无法判断` 永远不会被折成「未通过」（缺数据不能证明失败）。
- **断言每条只有三样东西**：陈述 + 结论（`通过` / `未通过` / `无法判断`）+ 来源（`协议事实` / `用户判定` / `Agent 自报`）。`buildEvaluationAssertions()` **只返回 `{rows, unavailable}`，没有任何聚合字段**（测试逐条扫 `rate` / `score` / `count` / `total` / `average` / `variance` 都不许出现）。协议事实三条固定在前：`load-evidence`（看不到加载证据 → `无法判断`，理由里有「看不到不等于没发生」）、`fingerprint-match`（缺一侧 → `无法判断`，理由里有「不写成『不一致』」）、`references-used`（只在 `scopeIds` 含 `references` 时出现，永远 `无法判断`：工具活动只有元数据）。其后是 Case 的每条观察点，`verdict` 取 `run.judgements[id]`，没人给判定就是 `无法判断` + 「这一条只能由人来给（插件不判定）」。

### 22.7 落盘与第 13 条路由（已实现）

- **存储模块**：`src/storage/evaluation-store.mjs`（294 行，`createEvaluationStore(root)`），与 `translation-store.mjs` / `receipt-store.mjs` 同一套约定 —— 目录 `0700`、文件 `0600`、写盘 tmp + **原子 `rename`**。
- **目录**：`<dataRoot>/evaluation/cases/<caseId 去掉 sha256: 前缀>.json` 与 `<dataRoot>/evaluation/runs/<同一个 hex>/<runId>.json`（`evaluationCaseFile()` / `evaluationRunFile()`）。**删 Case 连它的 runs 一起删**，不留孤儿。
- **文件名只由 `caseId` / `runId` 决定，不含 `sessionId`**（`FR-EVAL-016`）：跨会话复用靠这两个 id，不靠会话。
- **上限与清理**（`FR-EVAL-017`）：200 个 Case、每个 Case 50 条 Run，到顶先丢最旧的；删一个 Case 会**连它的 Run 一起删**（`deleteCase()` 先删 `runs/<hex>/` 再删那条 Case），所以磁盘上不会留下没有 Case 的孤儿 Run。**V1.0 刻意不做「按 Skill 批量清理」这个动作**：一个 Skill 的多个 Case 逐个删，理由是这个版本的 Case 数量有上限（200）、按 Skill 删一次就可能连带删掉用户还没看过的对照记录，而「删掉什么就少什么、删不回来」这件事在界面上只由用户点一次决定（`FR-EVAL-017` 要求的是**策略定下来**，不是每个维度都做一个按钮）；V1.1 做多 Case 套件时再谈批量清理。"删完之后残留什么"：只剩空目录本身，没有墓碑、没有回收站、没有二次读取。
- **禁字段闭集**：`sessionId`、绝对路径、工具参数与结果、模型回复正文、任何聚合（`score` / `passes` / `rate` / `variance` / `stddev` / `ranking` / `trend` 在任意深度都是**拒收报错**，不是静默裁掉）。**Case 的任务 Prompt 正文与用户的判定文本是刻意落盘的**（否则 Case 无法复现），这一条写在 `docs/PRIVACY.md:55-65`。
- **第 13 条路由**：`POST /skill-trace/evaluation` → `handleEvaluation(body)`（`src/dsh/host/index.js:784`，注册点 `:1812`），`action ∈ ['case-save','case-list','case-read','case-delete','run-save','run-capture','run-list','run-read']`（八个）。**全部需要 `sessionId`**（只用于确认这次请求属于哪个会话，**不落盘、不回传**）；响应里 `caseId` / `runId` / 列表项不带会话信息，错误消息是完整句子（§3.3）。
- **身份由宿主算**：`case-save` 收下客户端送来的六行 `hashInput` 与整条 `case`，**`caseId` 由宿主对 `hashInput` 做 sha256 得出**；送来的 `caseId` 与算出来的不一致就**拒绝保存**（页面上的内容和身份已经不是一回事了）。`runId` 由宿主生成。`run-capture` 由宿主**自己**取条件、指纹、加载证据与工具活动，客户端只送 `judgements` 与 `outcome`。
- 落盘失败**不影响** Case 的生成与展示：读取端把「读不到」当空态说人话（§15.3）。**「没有 Case」不是错误**，客户端回落空态、不弹红字。
- 测试：`test/evaluation-store.test.mjs`（172 行）+ `test/evaluation-route.test.mjs`（303 行）。

### 22.8 界面（已实现）

- **位置**：详情页「本次修改对比」（`skillModification`）之后、框架（`framework`）之前新增一块 `data-role="eval-card"`。**不新增页面、不新增一级导航**（`spec/PRD.md` §4.1）。
- **出现条件**：本机有这次修改事务、或已保存过这个 Skill 的 Case。**没有 Case 不是错误** —— 整卡仍然在场，给空态那句「这个 Skill 还没有评测 Case。生成一个 —— 它把这次修改固化成能反复用的用例。」+「生成评测 Case」按钮（`eval-generate`）。有 Case 之后按钮文案变成「按当前内容重新生成」（`FR-EVAL-004`：Skill 又改一次，就该测新那一版）。
- **七段（`data-role` 前缀 `eval-`，共 30 个）**：① `eval-case` 身份 / 绑定指纹 / 来源 / `eval-scope` 范围 chips / `eval-prompt` 四块任务 Prompt / `eval-observations` 观察点 / `eval-regression` 回归约束 / `eval-save`；② `eval-capture` 逐条 `eval-judgement` 三个按钮（`通过` / `未通过` / `无法判断`）+ `eval-outcome` 结果文本与来源按钮（`用户判定` / `Agent 自报`）+「这一条算哪一版」+ `eval-run` + `eval-run-hint`；③ `eval-runs` 运行记录（每条可改标 `eval-run-role`）；④ `eval-conditions` 两栏条件表（`eval-condition`，带 `data-equal`）+ `eval-comparison` / `eval-comparison-unavailable`；⑤ `eval-evidence` 四段阶梯（`eval-stage` × `data-stage`）+ `eval-inequalities`；⑥ `eval-assertions` 断言与对照表（`eval-assertion`）；⑦ `eval-forbidden`「这一版刻意不出现的东西」。
- **界面自己一个字都不判定、不聚合**：判定与结果都由人给，原样上行。**再点同一个判定按钮 = 删掉这条判定**（不是判成失败）；来源只认 `用户判定` / `Agent 自报`（`protocol` 不由人填）。三条不等式与「刻意不出现」的清单是**从核心模块的常量念出来的**（`EVALUATION_INEQUALITIES` / `EVALUATION_INEQUALITY_NOTE` / `EVALUATION_FORBIDDEN_OUTPUTS`），界面不另抄一套字面量 —— 否则两处措辞会各自漂移。
- **「哪条算改前 / 改后」先看事实**：用户标过就听用户的（`runRoles[runId]`）；没标过就按指纹事实分 —— `match === 'mismatch'` 的算改前、`match === 'match'` 的算改后；两边都分不出来就**不给答案**，把两条都摆出来让人点。点「记录这一次运行」前先记住「这一条算哪一版」，响应回来给该 run 打标记，并把默认角色翻到另一版。
- **缺项照实说**：没有运行记录时，条件区与证据区各给一句「还没有运行记录，所以…」，不拿空表冒充对照；时间戳解析不了就原样显示（不猜、不用「现在」补）。
- **文案禁用**：`Skill Score` / `通过率` / `方差` / `标准差` / `排名` / `趋势图` / `平均分` 一个都不许出现 —— 由 §22.9 的第 30 组守卫扫。
- **不做什么**：不调模型、不自动跑（不建会话、不发 Prompt、不重跑 n 次、不读回模型回复）、不给分、不给趋势图、不做排名（`FR-EVAL-014` / `FR-EVAL-015`）。

### 22.9 守卫与测试（已实现）

- **第 30 组 `SKILL_EVALUATION_OK`**（`scripts/verify-project.mjs:2040` 打标）钉四类东西：① 核心模块的固定面（生成器版本 `1.0.0`、四段 id 顺序 `trigger load use outcome`、三条不等式逐字、条件表恰好四项 `model provider reasoningEffort contextWindow`、判定 `pass fail unknown`、来源 `protocol user agent`）；② **卡片区**（从 `client.indexOf('V1.0「Skill 评测」卡')` 到 `client.indexOf('function SkillDiffPanel(')`）必须含 30 个 `eval-*` data-role 与 `.inequalities` / `.inequalitiesNote` / `这一版刻意不出现的东西`，且**不得含** `EVALUATION_FORBIDDEN_OUTPUTS` 里任何一个词；③ 客户端全文含 `buildEvaluationCase` / `onGenerate: generateEvaluationCase` / `onCapture: captureEvaluationRun`；④ 宿主含 `'/skill-trace/evaluation'` / `function handleEvaluation` / 三个代表性动作名（`'case-save'` / `'case-read'` / `'run-capture'`，八个动作里抽这三个），`docs/PRIVACY.md` 含 `evaluation/cases` 与 `evaluation/runs`。
- **这道守卫红得起来吗：验过。** 往卡片标题里注入 `Skill Score` 再重建，`npm run verify` 直接停在第 30 组：`评测卡里不许出现聚合口径「Skill Score」：这一页只摆事实，不下结论`；还原重建后恢复全绿。**禁用词只扫卡片区**，因为 `src/dsh/client/client.js:1949` 那句 v0.9.0 的注释里本来就有「没有分数、没有排名、没有「优秀」」。
- **三处既有守卫同时改**：① 数客户端 `require('../../core/…')` 的那一处（`scripts/verify-project.mjs:1913`）**恰好 8 支 → 9 支**（第 9 支是 `src/core/skill-evaluation.mjs`）；② `:1915` 的禁用名清单去掉 **`'Skill Evaluation'`**（`Skill Run` / `Skill Execute` / `Skill Benchmark` / `测试中心` 保留）；③ 两处渲染顺序守卫（`:910` 与 `:1691`）允许评测卡插在 `skillModification` 与 `framework` 之间，文案改成「验收 → 本次修改对比 → 评测 → 框架 → 运行逻辑 → 步骤证据 → SKILL.md」。
- **测试**：`test/skill-evaluation.test.mjs`（421 行）、`test/evaluation-store.test.mjs`（172 行）、`test/evaluation-route.test.mjs`（303 行）、`test/run-conditions.test.mjs`（176 行）全绿；`npm test` 由 590 → **636 项，0 失败**；`npm run verify` 全绿，尾部 `SKILL_INSTANCE_TEST_OK` → `SKILL_EVALUATION_OK` → `INSTALLED_ORDERING_OK` → `GUARD_MARKERS_ARE_BACKED_OK`。
- **界面证据**：`01_重构方案/render-harness/` 用真 payload 驱动真 bundle 截了四张图 —— `shots/impl-eval-empty.png`（空态 + 生成按钮）、`impl-eval-case.png`（Case 四块 Prompt / 观察点 / 保存）、`impl-eval-capture.png`（逐条判定 + 结果 + 哪一版）、`impl-eval-card.png`（四段证据 + 断言对照 + 刻意不出现的清单）。DOM 自查：30 个 `eval-*` data-role 全部出现。

### 22.10 本版不做什么，以及和后面几版的边界

- **不做的**：评分器与任何聚合（`FR-EVAL-012` / `FR-EVAL-014`）、benchmark 排名、自动重跑 n 次、读回模型回复、把结果归因给 Skill。
- **V1.1** Regression / Variance：只说「哪些事实一致、哪些不一致」，**不给方差数值、不给稳定性分数**；**V1.2** Trigger Evaluation（`should-trigger` / `should-not-trigger`，该不该触发由用户判定）；**V1.3+** Evolution Evaluation（Skill v1/v2/v3 各自的 Evaluation）。
- **不做「用一个模型给 Skill 打分」**：那个赛道已经有人做了，而且正是上面那条外部证据指向的失败方向。
