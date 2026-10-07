# DSH Skill Intelligence（DSH Skill 智能实验室）项目执行规则（Agent 入口）

> 本文件是 Agent 进入本项目的**第一读物**：只说「怎么在这个项目里干活」和「哪些不能动」。
> 产品需求 `spec/PRD.md` · 技术设计 `spec/SDD.md` · 视觉与组件规格 `design.md`
> · 实现细节 `docs/ARCHITECTURE.md` · 发布步骤 `docs/RELEASE.md` · 历史规格 `docs/archive/`
> **最后更新：2026-10-05**（同日按证据把全部日期修准：**每条日期 = 该改动真实落地那天**（git 提交日 / 实测会话日），此前手写的 `2026-10-04` / `2026-10-05` / `2026-10-06` 已逐行改对，见 §5。知识库治理：根目录只留入口，`spec/` 收拢当前版 PRD 与 SDD；§1 的数字与它同步。**2026-10-05 知识管理总对账（V1.1 开工前）**：全仓的「现状措辞」已对齐 `1.0.0` 已发布口径，逐处核过 §1 / §2 / §5 / §6.12 / §9.1 / §10 与 `README.md` / `spec/PRD.md` / `spec/SDD.md` / `docs/RELEASE.md` / `docs/ARCHITECTURE.md` / `design.md`；**§9.1 的发版清单这次从六处扩到八处**（补上 `docs/ARCHITECTURE.md` 与 `design.md` 的版本口径段、`docs/RELEASE.md` §6.0 的发布后回填与 §6.0.x 下移）。
> **2026-10-07 追记（V1.2 已发布）**：**V1.2「Skill 证据模型（Skill Evidence Model）」已随 `1.2.0` 发布**（2026-10-07，GitHub Release 与 npm 是同一份构建，tag `v1.2.0`）—— `package.json` 写的是 `1.2.0`，npm 的 `beta` 与 `latest` 都指向 `1.2.0`，`README.md` 的安装示例已锚 `v1.2.0`。§1 的版本 / npm / 测试 / 守卫 / 客户端 / 本版内容各行已按**发布口径**同步，`1.1.0` 降为上一版，`CHANGELOG.md` 顶部的 `## 1.2.0` 已补上日期（2026-10-07）并已回填 `docs/RELEASE.md` §6.0。**不新增路由 / 页面 / 落盘 / 依赖**，宿主一字未改；客户端 `require` 九支 → 十支。路线图同步：证据模型占 **V1.2**，原先登记在这一格的 Skill Trigger Evaluation 顺延到 **V1.3+**。
> **2026-10-06 追记**：**V1.1「详情级导航 + Agent Skills 开放标准」已随 `1.1.0` 发布**（GitHub Release 与 npm 是同一份构建，tag `v1.1.0`）；§1 的版本 / npm / 测试 / 守卫 / 客户端各行已按**发布口径**同步，`1.0.0` 降为上一版，`CHANGELOG.md` 的 `## Unreleased` 已归位成 `## 1.1.0`。**不新增路由 / 页面 / 落盘 / 依赖**，宿主一字未改（改了 `src/core/*`，真机验收仍要按 §6.2 重启 DSH）。
> **2026-10-05 追记**：**V0.10.0「Skill 实例验收」已随 `0.10.0` 发布**（GitHub Release 与 npm 是同一份构建，tag `v0.10.0`）；§1 的测试 / 守卫 / 客户端 / 本版内容各行已按**发布口径**同步，`0.9.2` 降为上一版，`CHANGELOG.md` 的 `## Unreleased` 已归位成 `## 0.10.0`。同日再追记：**V1.0「Skill Evaluation」已随 `1.0.0` 发布**（2026-10-05，tag `v1.0.0`；`spec/PRD.md` §5.13 的 `FR-EVAL-*`）；§1 各行原写的「工作树口径」已改成**发布口径**，`0.10.0` 降为上一版，`CHANGELOG.md` 的 `## Unreleased` 已归位成 `## 1.0.0`。
> 同日追记（2026-10-03）：复刻 Skill 的请求体缺陷已修（`55f092c`），**已随 `0.8.0` 发布**；当时攒下的三件改动（短显示名 + 复刻缺陷 + V0.8「Skill 演进」）见 §1「本版内容」行。
> 2026-10-02 追记：V0.8「Skill 演进」三个 Phase 全部落地，**真机验收已过**（12 个检查点，见
> `01_重构方案/v0.8-真机验收清单.md`）——**已随 `0.8.0` 发布到 GitHub Release 与 npm**，见 §1 与
> `docs/RELEASE.md` §6.0.3）
>
> **命名分三层。** ① **产品品牌**：DSH Skill 智能实验室（英文 DSH Skill Intelligence）—— README 首屏、
> 仓库描述、文档抬头用这一层；② **DSH 会话里的短显示名**：**Skill 洞察**（英文 **Skill Insight**）——
> 侧边栏 / 工作栏标签（`conversation.view` slot 的 `label`）与面板 `aria-label` 这类高频入口用这一层；
> ③ **技术层**：**Skill Trace** —— npm 包名 `dsh-skill-trace`（已发布，不改）、`/skill-trace/*` 路由、
> 模块名、`[data-plugin="dsh-skill-trace"]` 与 storage 结构，都不随命名调整而改。

---

## 0. 一句话

**把「这次对话加载了哪些 Skill」「这台机器上有哪些 Skill」变成两个可读页面**，点进唯一的详情页，看这个 Skill **声明了什么**，以及本次会话**观察到了什么**。

- 仓库根**就是**插件包：`main` → `src/dsh/host/index.js`，`exports['./client']` → `dist/client.js`。
- 一级页面只有两个：**本次 Skill** / **已安装 Skill**；二级页面只有一个：**Skill 详情**。
- 它是**只读观察者**：不替用户选 Skill、不发现远端 Skill、不挂载 Skill、不评判模型输出。

---

## 1. 当前状态

| 项目项 | 当前值 |
|---|---|
| 插件包版本 | **`1.2.0`（`package.json`，**2026-10-07 已发布**：GitHub Release 与 npm 是同一份构建，tag `v1.2.0`）**；上一版 **`1.1.0`**（tag `v1.1.0` · 2026-10-06 · **GitHub Release 与 npm 都已发布**，实测值见 `docs/RELEASE.md` §6.0）；上一版 **`1.0.0`**（tag `v1.0.0` · 2026-10-05 · **GitHub Release 与 npm 都已发布**，发布提交 / 注释对象 / npm `gitHead` 的实测值见 `docs/RELEASE.md` §6.0.1）；上一版 `0.10.0`（V0.10.0「Skill 实例验收」），再上一版 `0.9.2`（发布提交 `1811d98`，注释对象 `b5f1e0c`，见 `docs/RELEASE.md` §6.0.3），再上一版 `0.8.0`（发布提交 `9a61387`，注释对象 `783c4b2`，见 §6.0.4），再上一版 `0.7.1`（发布提交 `74a161d`），再上一版 `0.7.0`（发布提交 `5fac5d9`）。**`1.2.0` = V1.2「Skill 证据模型（Skill Evidence Model）+ Skill 框架重构」一版**（`FR-EVIDENCE-*`；第一件事不新增路由 / 页面 / 落盘 / 依赖，**同一版的第四件事（桌面端导出）当天加过第 14 条路由 `POST /skill-trace/evidence-export` 与 `src/storage/evidence-export-writer.mjs`，随后整条撤回**；客户端 `require` 九支 → 十支；同一版里还把详情页「Skill 框架」这一维重组成「蓝图 / 结构地图 / 细节预览 + 声明流程 + 渐进披露」五块，**只动客户端**，核心层一字未改），逐条登记在 `CHANGELOG.md` 的 `## 1.2.0`（含 `### D. 框架重构`）；**`1.1.0` = V1.1「详情级导航 + Agent Skills 开放标准」一版**（不新增路由、不新增页面、不新增落盘），逐条登记在 `CHANGELOG.md` 的 `## 1.1.0`；`1.0.0` = V1.0「Skill 评测」一版（新增第 13 条路由、一张详情页卡、一处本机落盘），见 `## 1.0.0`；`0.10.0` = V0.10.0「Skill 实例验收」（不新增路由 / 页面、不调模型、不落盘），见 `## 0.10.0`；`1.2.0` 这一轮的八处状态文字已按 §9.1 同步为**发布口径**（`package.json` 写死 `1.2.0`、`README.md` 的版本声明与两条安装示例锚点都已改成 `1.2.0`）。上一轮（`1.1.0`）八处状态文字已按 §9.1 同步为发布口径（`package.json`、本 §1、`README.md` 的版本声明与安装示例锚点；`spec/PRD.md` 头部、`spec/SDD.md` §0.1 的 `D15`、`docs/ARCHITECTURE.md` 的 `## V1.1` 段与 `design.md` 的实现入口行都已去掉「工作树」括注）；`docs/RELEASE.md` 与 §9.1 第 8 条按惯例在发版成功后才回填（§6.0 记录本次实测结果） |
| 上游仓库 | `https://github.com/PolinniZhong/dsh-skill-intelligence`（分支 `main`；2026-10-02 由 `dsh-skill-trace` 改名，旧地址自动重定向） |
| npm | **`beta` 与 `latest` 都指向 `1.2.0`**（发布后核对见 `docs/RELEASE.md` §6.0）。npm 包名仍是 `dsh-skill-trace`（品牌迁移不改包名）。`0.5.0` 与 `0.6.0` **只在 GitHub**，因此 npm 的版本号是从 `0.4.0-beta.66` 直接跳到 `0.6.1`，再到 `0.7.0`、`0.7.1`、`0.8.0`、`0.9.2`、`0.10.0`、`1.0.0`、`1.1.0`、`1.2.0` |
| 测试 | **662 项全绿**（**`1.2.0` 发布口径**；`npm test`，`pretest` 会先重建 `dist/client.js`）；`1.1.0` 发布口径是 643 项，`1.0.0` 是 636 项，`0.10.0` 是 590 项，`0.9.2` 是 561 项，`0.8.0` 是 474 项 |
| 静态守卫 | **38 组**（**`1.2.0` 发布口径**；**第 32–38 组是 V1.2 新增的 7 条 `SKILL_EVIDENCE_*`**（`MODEL_OK` / `BINDING_OK` / `CARD_OK` / `NO_CAUSATION_OK` / `EXPORT_OK` / `UNAVAILABLE_OK` / `PRIVACY_OK`），**第 31 组 `SKILL_STANDARD_ALIGNMENT_OK`**（V1.1 新增：钉住「标准合规 / 平台兼容」的语义隔离与 Rule Provenance），第 30 组 `SKILL_EVALUATION_OK`、第 29 组 `SKILL_INSTANCE_TEST_OK`；**第 20 组 `SKILL_FRAMEWORK_OK` 在 V1.2 的框架重构里加了 2b + 2c + 2d 三段断言**（2b：蓝图五站逐字与五个 kicker、结构地图按 `FRAMEWORK_ROLES` 生成、细节预览的 `framework-detail`、缺席写「未声明」、声明流程空态「不制造运行流程图」、资源默认 6 条 + 分层取自 `tiers` + 读数块，并反向钉住旧的角色网格 `st-fw-module`；2c：蓝图每站一句 `st-fw-stop-hint`、渐进披露每段带序号与 `st-fw-chain-hint`、认不出角色的章节改走 `other-sections` 轻行、细节预览 `DETAIL_SECTION_LIMIT = 3` + `detail-toggle`、地图与蓝图共用 `declaredOf(entry.id)` 与「N 个引用」；2d：五个区域各自成卡（`className: 'st-fw-region'`、`'st-fw-region st-fw-other'`）、结构地图与细节预览并排成对（`className: 'st-fw-pair'`）、**两列等高**（`.st-fw-pair` 不带 `align-items:start`、`.st-fw-detail` 是 `display:flex;flex-direction:column`、`.st-fw-detail-rows{flex:1;min-height:0;…}`）且各带块标题 `st-fw-region-head`，并反向钉住 `.st-fw-sub{` 与 `className: 'st-fw-block'` 不许回来），**组数不变**；同一轮（V1.2 第三件事）还给第 26 组 `SKILL_VALIDATION_OK` / 第 27 组 `SKILL_MODIFICATION_OK` / 第 29 组 `SKILL_EVALUATION_OK` / 第 32 组 `SKILL_EVIDENCE_CARD_OK` 各追加了 needle（钉住各自模块的区域卡与它们退休掉的旧类），**组数仍是 38**）；`1.1.0` 发布口径是 31 组，`1.0.0` 是 30 组，`0.10.0` 是 29 组，`0.9.2` 是 28 组（第 26 组 `SKILL_VALIDATION_OK`、第 27 组 `SKILL_MODIFICATION_OK`、第 28 组 `INSTALLED_ORDERING_OK`），`0.8.0` 是 25 组 |
| 客户端 | **`src/dsh/client/client.js` 5400 行，bundle `dist/client.js` 293246 字节**（source hash `9ec62e37d7dbfa2e`，**`1.2.0` 发布口径**；框架重构 +387 行），`src/core/` **33 个模块 12854 行**（新增 `skill-evidence.mjs` 909 行；框架重构**未动核心层**），`src/storage/` **7 个 1411 行**；`1.1.0` 发布口径是 4495 行 / 234965 字节（source hash `71125cf37d020c7c`）/ core 32 个模块 11945 行 / storage 7 个 1411 行；`1.0.0` 发布口径是 4284 行 / 228715 字节（source hash `54bee3888d0299d8`）/ core 32 个模块 11657 行 / storage 7 个 1411 行；`0.10.0` 发布口径是 3625 行 / 189256 字节（source hash `faed5e9cef7db24c`）/ core 30 个模块 10924 行 / storage 6 个 1117 行；`0.9.2` 是 3448 行 / 170324 字节（`66dd0b76118e7b85`），`0.8.0` 是 2735 行 / 142672 字节（`f53a7ac5965b38b0`） |
| 本版内容（`1.2.0`） | **V1.2「Skill 证据模型（Skill Evidence Model）」**（`spec/PRD.md` §5.14 的 `FR-EVIDENCE-001`–`012`；**已随 `1.2.0` 发布，2026-10-07**）：把「这一次会话对这个 Skill 到底观察到了什么」整理成一组有身份、有性质、有边界的证据事实 —— 纯函数层 `src/core/skill-evidence.mjs`（**909 行、零 import**，客户端**第十支 `require`**）＋ 详情页第九个模块「**Skill 证据**」（id `evidence-model`，紧跟 `Skill 框架` 之后，**只读投影**）。要点：**三态** `declared` / `observed` / `unavailable`（**没有 `inferred`**；认不出的值一律归一成 `unavailable`，缺就是缺）；**四段证据链** Definition → Load → Use → Outcome（**与 V1.0 评测那套 `trigger/load/use/outcome` 不是同一套 id**）；**五类对象 × 五列的证据状态表**（Skill 名称 / Skill 加载 / Skill 使用迹象 / DSH 版本 / Skill 造成结果 × 对象 / 状态 / 当前事实 / 证据来源 / 限制 —— 因果那一行永远 `unavailable`）；**三条边界** `load-evidence` / `use-evidence` / `causal-claim`（第三块的定论永远是「不声明」）；**漂移三态** `current` / `historical` / `no-matching-evidence`（**没有「过期」这一档**：历史证据仍然有效，只是绑在另一份 fingerprint 上）；**限制是封闭词表**（9 条，界面按 id 取文案、不许自己写）；**id 可重放**（`evidence:<对象>@<绑定>`，域前缀 `dsh-skill-evidence`，无 `Date.now` / `Math.random` / UUID）；**Evidence JSON 导出**逐字节稳定，只含身份 / 条件 / 观察 / 限制 / 来源，禁止键（工具参数 / 工具结果 / 会话 id / 绝对路径 / 分数）命中即失败，导出**只走剪贴板**（「复制 JSON」；写文件那条路 2026-10-06 已整条撤回，见 `CHANGELOG.md` `### G`）。**不给分、不排名、不聚合、不调模型、不读工具参数与结果、不显示绝对路径**；**证据模型这件事不新增路由 / 页面 / 落盘 / 依赖**，**同一版里短暂存在过的第 14 条路由与那处落盘（桌面端导出，见 `CHANGELOG.md` `### G`）已经撤回，现状仍是 13 条路由 / 1844 行与 7 个 1411 行**。**同一版的第二件事是详情页「Skill 框架」这一维的界面重构**（`spec/PRD.md` `FR-UI-054` / `spec/SDD.md` §9）：把「按八个角色铺成一屏网格」换成 **Skill Blueprint（五站阅读路径 WHY 定位 → WHEN 触发 → HOW 规则 → WITH 资源 → RESULT 输出，缺的那一站写「未声明」而不是消失）→ Structure Map（**八格**，格子按核心层 `FRAMEWORK_ROLES` 生成，每格写它回答什么问题与最多三个小节标题；认不出角色的章节不占格、改在框架末尾走一行一节的轻列表 `other-sections`，选中格是组件内的 state，不是路由也不是新页面；资源格与蓝图共用 `declaredOf()`，写的是「N 个引用」）→ Detail Preview（只渲染选中那一格的小节，默认只铺前三节，其余折成按钮上那句「还有 N 个章节」；带「为什么这样显示」；没有任何小节时直说「当前没有独立结构块」，不编解释）**；声明流程的步骤列表与点击定位一字未改、空态补上「因此这里不制造一条运行流程图」与「不构造」；渐进披露的 `DISCLOSURE_CHAIN` 六段不变，**每段带序号与一句说明**（按段 id 兜底，没写说明的 id 就不显示说明、不许现编），声明引用**默认只列 6 条**（`rows.slice(0, 6)`，多于 6 条才出现 `展开全部 N 个` / `收起资源` 开关），分层标题只取自核心层的 `tiers`，新增读数块 `有读取证据 / 声明引用` 把「声明几条」与「有几条读取证据」并排摆出来。**五个区域各自独立成卡**（`st-fw-region`：蓝图 / 结构地图 / 细节预览 / 声明流程 / 渐进披露，其它章节按需出现），结构地图与细节预览并排成对（`st-fw-pair`）且**两列等高**（右列不跟着内容伸缩，多余高度留在卡内、末句落在卡底）——此前它们共用一个边框、只靠一条分隔线分层，读者分不清「上一段的继续」和「另一件事」；**`src/core/skill-framework.mjs` 的解析结果、`GET /definition` 的数据、宿主与路由一个字都没动**；旧的「角色网格」与旧的 `.st-fw-sub` / `.st-fw-block` 合并写法由守卫反向钉住不许回来（`className: 'st-fw-module'` 出现即失败）。守卫 31 → **38 组**（7 条 `SKILL_EVIDENCE_*`，第 20 组在框架重构中加了 2b + 2c + 2d 三段断言但**组数不变**），测试 643 → **662** 项。**同一版的第三件事（用户界面反馈）**：把「一个区域 = 一张卡」推广到其余详情模块（`Skill 验收` 三张 / `Skill 证据` 六张 / `Skill 评测` 抬头 + 七张 / `本次修改对比` 五张；`Definition` / `SKILL.md` / `步骤证据` / `本次运行逻辑` 不动），并把选中态统一成中性底色 `--st-selected`（亮色淡灰、暗色比卡面亮一档的浅黑，不再借强调色与警告色） |
| 上一版内容（`1.1.0`） | **V1.1「详情级导航 + Agent Skills 开放标准」**（`spec/PRD.md` / `spec/SDD.md` 的 V1.1 段）：**A. Skill Detail 信息架构重构** —— 详情页从「一个纵向长页面」改成「左侧详情导航 + 右侧当前模块」，八个模块 `Skill 框架`（默认）/ `Skill 验收` / `Skill 评测` / `步骤证据` / `本次运行逻辑` / `本次修改对比` / `Definition` / `SKILL.md`，**信息不减少、能力不删除**，只是把纵向堆叠提取成可按认知维度直达的一屏。**B. Agent Skills 开放标准对齐** —— `SKILL_PROFILE_IDS` 由 5 个变 6 个，在 `common` 与各平台之后插入 **`standard`（Agent Skills Open Standard）**，并与 DSH / OpenAI / Anthropic / Microsoft 四个**平台 Profile 分离**：新增 `skillProfileKind()`（`standard` / `platform`）、`SKILL_PROFILE_KIND_LABELS`、`SKILL_RULE_SOURCES`（5 条静态 provenance，**不在线拉标准文档**）；新增 4 条标准规则 `CORE-DIR-001`（`name` 必须与父目录同名，error）、`CORE-LIC-001` / `CORE-META-001` / `CORE-TOOLS-001`（`license` / `metadata` / `allowed-tools` 形状校验，**缺失一律 skipped 而不是错**；`allowed-tools` 属 experimental，severity 是 `info`）；每条 finding 带 `来源：<sourceLabel> · 标准合规|平台兼容`。**不新增路由 / 页面 / 落盘 / 依赖**，宿主 `src/dsh/host/index.js` 一字未改 |
| 更早版本（`1.0.0`） | **V1.0「Skill Evaluation」**（`FR-EVAL-*`，`spec/PRD.md` §5.13 / `spec/SDD.md` §22）：把 V0.10 临时生成的实例验收任务固化成**可重复的 Evaluation Case**（`src/core/skill-evaluation.mjs`，确定性纯函数）→ 记录每次运行的**条件**（模型 / Provider / 推理档位 / 上下文窗口 / 插件版本 / 日志游标；DSH 版本今天读不到，如实写 `unavailable`）与**四段证据**（触发 / 加载 / 使用 / 结果，每段写明够不着什么，并固定陈述三条不等式）→ 同一个 Case 的两侧对照（改前·改后 / 基线·加上 Skill，条件不同就不给对照）→ 用户判定与 Agent 自报。落盘在 `<dataRoot>/evaluation/`（`cases/<hex>.json`、`runs/<hex>/<runId>.json`，`0700`/`0600`，上限 200 个 Case / 每 Case 50 次运行），由第 13 条路由 `POST /skill-trace/evaluation` 读写；详情页多一张「Skill 评测」卡（**不新增页面**）。**不给分、不排名、不做 benchmark、不自动跑**。发布提交 / 注释对象 / npm `gitHead` 的实测值见 `docs/RELEASE.md` §6.0 |
| 更早版本（`0.10.0` 及以前） | **V0.10.0「Skill 实例验收」**（`FR-INST-*`，`spec/PRD.md` §5.12 / `spec/SDD.md` §21）：在详情页「本次修改对比」卡里按这次改动生成一份**确定性**的实例验收任务（`src/core/skill-instance-test.mjs`，零依赖纯函数，客户端第 8 支 `require`），Prompt 与观察项**物理分离**、**不新增路由**、不自动运行、不判定成功。真机验收 2026-10-05 通过（28 个检查点）。全部记在 `CHANGELOG.md` 的 `## 0.10.0`。`0.9.2` 是三批一起发（V0.9.0 验收 / V0.9.1 Modify / V0.9.2 列表排序），见 `## 0.9.2` |
| 宿主机面 | **13 条路由**，`src/dsh/host/index.js` **1844 行**（第 13 条是 V1.0 的 `POST /skill-trace/evaluation`，第 12 条是 v0.9.1 的 `POST /skill-trace/modify`；`0.10.0` 口径是 12 条 / 1625 行，`0.8.0` 口径是 11 条 / 1292 行）。全部由守卫按字面钉住（`docs/ARCHITECTURE.md` §Host surface） |
| 运行时依赖 | **`dependencies` 为空**；`devDependencies` 只有 `esbuild`；`peerDependencies` 只有可选的 `@deepseek-ai/dsh-llm`（翻译用） |
| 当前信息架构 | **SDD v0.6**：一级页面收敛为「本次 Skill」「已安装 Skill」，运行流程 / 运行图谱 / 收据页 / 上下文检查器 / 学习工作台 / 备份导出**已删除**（删除记录见 `docs/ARCHITECTURE.md` 末节）。v0.7 **没有新增一级 / 二级页面** |
| 详情页结构 | **V1.1 起详情页是「左侧详情导航 + 右侧当前模块」**，不再是一条纵向长页面。九个模块（守卫按 `MODULE_CONTENT` 的**映射**逐项钉住，不再钉纵向顺序）：**`Skill 框架`（默认打开）** / **`Skill 证据`（V1.2 新增，id 是 `evidence-model`，紧跟框架之后）** / `Skill 验收` / `Skill 评测` / `步骤证据` / `本次运行逻辑` / `本次修改对比` / `Definition`（事实列：身份 + 定义 + repository）/ `SKILL.md`。默认入口只是默认值：点「Skill 验收」立即显示验收，点「SKILL.md」立即显示原始文档。`Skill 框架` = **五个区域各自独立成卡**（`st-fw-region`；结构地图与细节预览并排成对 `st-fw-pair`、**两列等高**）：**蓝图（阅读路径：五站 WHY → WHEN → HOW → WITH → RESULT，每站一句「它回答什么」，缺站写「未声明」）/ 结构地图（**八格**，只画真的命中的角色；认不出角色的章节不占格、改在末尾走一行一节的轻列表，选中格是组件内 state）/ 细节预览（只渲染选中那一格的小节，默认前三节 + 按钮上那句「还有 N 个章节」）** + 声明流程（步骤只被标注、不被构造；没有声明流程时直说「不制造运行流程图」）+ 渐进披露（六段各带序号与一句说明；声明引用默认只列 6 条、可展开；分层取自核心层 `tiers`；读数块「有读取证据 / 声明引用」）——**全部来自 `SKILL.md` 的结构化解析，不是 Runtime Flow**；「Skill 评测」承载 Evaluation Case / Run / Comparison / Runtime Evidence，**同一个 Case、条件逐项提出、逐条对照、不给分、不排序、不画趋势**。「Skill 证据」是 V1.2 的只读证据视图（三态 / 四段链 / 三条边界 / 五类对象的证据状态表 / 漂移三态 / 可复核的 Evidence JSON 导出，**不给分、不排名、不聚合、不调模型**）。V1.2 第三件事起，**其余详情模块也各自成卡**（`Skill 验收` 三张 / `Skill 证据` 六张 / `Skill 评测` 抬头 + 七张 / `本次修改对比` 五张），**选中态一律中性底色**（亮色淡灰、暗色浅黑，不借强调色与警告色）。`MODULE_CONTENT` 定义在 `const DETAIL_MODULES = [` 与 `function DetailNav(` 之间 |
| 已安装列表顺序 | v0.9.2：按**加入本机的时间**（Skill 目录的 birthtime）倒序，读不到时间的按名称排在最后；规则名 `added-desc-then-name` 随 `ordering.rule` 下发，客户端只念不排。卡片上**只说例外**：日期只到 `MM-DD`（跨年才带年份、不显示时:分），有血缘才多一行 `复刻自 X`，默认成立的调用方式与 `filesystem` **一个字都不写**（`FR-ORD-*`，例外规则见 `FR-ORD-013`） |
| v0.7 新能力 | 已安装卡片可点进详情 · 中文阅读版落盘（`GET`/`DELETE /skill-trace/translation`） · 复刻 Skill（`POST /skill-trace/clone`） |

---

## 2. 现在在做什么

**维护阶段：不再加页面，只把已发布的那几层做对。**

v0.6 之后的三轮改动都有一条同样的判据：**界面上说的每一句话，要么来自 `SKILL.md` 的声明，要么来自本次会话确实观察到的事实**，两者不许互相推导。

- `039e275`：GFM 表格真渲染 + 翻译表格结构校验。
- `0.6.0`（已发布）：**「Skill 框架」不再等于那条 `01 → 02 → 03 → 04`** —— 框架改由 `src/core/skill-framework.mjs` 从正文**确定性**解析出组成结构；`detail.flow` 降级成它的子模块；新增「渐进披露」（声明资源 ≠ 已读取资源）、「本次运行逻辑」（五段只列可观察事实）、「步骤证据」（`detail.flow.steps[].evidence` 第一次被显示）。
- **`0.7.0`（已发布：GitHub Release + npm，发布提交 `5fac5d9`）**：三条新能力——已安装卡片整张可点进详情、中文阅读版**落盘为本机资产**（键不含会话）、**复刻 Skill**（详情页唯一的对象级动作）。真机 17 步验收已过（`CHANGELOG.md` `### 九`）。
- **`1.0.0` 已发布（2026-10-05，GitHub Release + npm）。** 下一版（**V1.1**）的**范围与版本号都由用户给**——开工前先按 §9.1 把版本口径对齐，再确认三条老纪律没变：**不新增一级页面**、**不新增运行时依赖**、**界面上的每句话只能是「`SKILL.md` 的声明」或「本次会话观测到的事实」**（§11）。这一版已发布的全部内容见 §1「本版内容」行与 `CHANGELOG.md` 的 `## 1.0.0`。
- **`1.2.0` 已发布（2026-10-07，GitHub Release 与 npm 是同一份构建，tag `v1.2.0`）。** 这一版是 **V1.2「Skill 证据模型（Skill Evidence Model）」**（`spec/PRD.md` §5.14 的 `FR-EVIDENCE-*`）：详情页第九个模块「Skill 证据」＋ `src/core/skill-evidence.mjs`（909 行、零 import、客户端第十支 `require`）。**证据模型这件事不新增路由 / 页面 / 落盘 / 依赖**；**第四件事（桌面端导出）当天加过的第 14 条路由 `POST /skill-trace/evidence-export` 与 `src/storage/evidence-export-writer.mjs` 已经撤回**（原因与经过见 `CHANGELOG.md` `### G`：桌面 App 没有下载接收端，而这份 JSON 的读者是 Agent 与排障，不值得为它新增路由与落盘）。原先登记在 V1.2 那一格的 **Skill Trigger Evaluation 顺延到 V1.3+**。发版照 `docs/RELEASE.md` 做；**下一版的版本号仍然由用户给**。
- **`0.7.0` 之后的五轮纯界面收口**（`CHANGELOG.md` `### 十`–`### 十三`）：顶栏 68 → 48px 且不画底色与分隔线、状态行只在有话要说时出现、搜索框搬进顶栏、分段控件选中态只留字色与字重、卡片描述统一截到 4 行、元信息行钉在卡片左下角、两个一级列表从同一个位置开始。**信息架构一次没动。**
- **`55f092c`（已随 `0.8.0` 发布）：「复刻 Skill」的请求体缺陷。** 用户真机点「复刻 Skill」拿到一句 `sessionId 必填`——**从 `0.7.0` 起这个按钮一次都没成功过**：宿主 `handleClone` 必需那个字段，而客户端压根没发、详情页也没往下传。修的时候顺手治了成因——宿主的 400/500 分流此前靠正则猜消息，等于逼着校验消息写成裸字段名，现在改由 `RequestError` 自带 `status`。两条新守卫守着这条缝：**宿主读哪些 `payload.*`，客户端就得发哪些**；**组件解构出来又没兜底的 prop，渲染处必须真的传**。教训见 §8.10 —— **请求体有两半，单边测试补不出这条缝。**

- **V0.9.0「Skill 验收」+ V0.9.1「Skill Modify」+ V0.9.2「已安装列表排序」（已随 `0.9.2` 发布）**：先把「这个 Skill 现在符不符合规范」做成一屏确定性事实（`src/core/skill-profiles.mjs` + `src/core/skill-validation.mjs`，五个 Profile、三态结论，**不新增路由**），再把「我想让它怎么改」接上——详情页「Skill 演进」卡多了 `[修改 Skill]`，用户写一句意图、勾修改范围与验收目标，点 `[交给 Agent]` 之后由**当前会话**的 Agent 在原生对话里改（代发的消息里明确要求它**动手之前先说明打算怎么改、拿不准就用提问工具问用户**——「提出方案 → 用户确认 → 动手」留在原生对话里，插件只提要求，不代办也不解析）；`POST /skill-trace/modify` 只做两件事：把「改前」存进**宿主内存**、用 `agent.followup()` 代发一条 `source.kind='skill-intelligence-modify'` 的消息，**它自己不写任何文件**。改完点「对比本次修改」才产生「本次修改对比」，并把新的验收结论顺手带回详情页。两条纪律：**快照只在内存里**（不落盘、不进 receipt、不进 session log、重启即消失，丢了就说「本次修改前状态不可用」而不许造假）；**来源指纹变了只说「来源 Skill 在本次修改期间发生变化」，不许说「Agent 修改了来源」**（没有直接证据）。V0.9.0 验收不碰 Agent / followup / 会话编排，V0.9.1 才碰。**三版（V0.9.0 / V0.9.1 / V0.9.2）都已通过真机验收（2026-10-03 用户逐项确认）**：宿主重启后 `/skill-trace/catalog` 原生返回 `ordering`、`POST /skill-trace/modify` 在跑的进程里，四条已删路由仍 404。

**下次动手前的判据**：如果一个新的展示元素需要模型调用来「总结」Skill 的结构，**就不要做**（§6.8）。如果它需要在界面上说「已执行 / 已完成 / 已加载 / 已读取」，**就不要做**（§6.7）。

> **`0.10.0` 已发布（GitHub Release + npm，2026-10-05）。** 这一版就是 **V0.10.0「Skill 实例验收」**（`FR-INST-*`）（§1、§2）。上一版 `0.9.2` 把三批改动一起发出去：V0.9.0「Skill 验收」（`FR-VAL-*`）、V0.9.1「Skill Modify」（`FR-MOD-*`）与 V0.9.2「已安装列表排序」（`FR-ORD-*`）；再上一版 `0.8.0` 是 V0.8「Skill 演进」（血缘 / 差异 / 界面）+「Skill 洞察」短显示名 +「复刻 Skill」请求体缺陷修复。**V1.0「Skill Evaluation」已随 `1.0.0` 发布**（`spec/PRD.md` §5.13；与 §1 的「本版内容」行一致）。**下一版的版本号由用户定，不要自己开**。开新版本之前先确认：`package.json`、`README.md`、`CHANGELOG.md` 的版本口径是否一致（§9.1 的八处）。
>
> **发布凭证（2026-10-02 实测，已换凭证）**：`~/.npmrc` 原来那张长期 token 是 npm 条款里的
> **2FA-bypass GAT**（账户级操作已被它失去：`npm profile get` → `E403`；**直接 publish 也将在 2027 年
> 1 月左右失去**）。2026-10-02 已按 `docs/RELEASE.md` §5.1 换成 `npm login --auth-type=web` 的 2FA
> 会话凭证：`npm whoami` → `polinni`、`npm profile get` → **exit 0**（`two-factor auth: auth-and-writes`，
> 发布时会要 OTP），旧 token 备份在 `~/.npmrc.bak-*`（**前缀与 token 清单见 §5.1，不要贴整串**）。
> 仓库侧已备 `.github/workflows/publish-npm.yml`（OIDC trusted publishing，推 `v*` tag 即发布）；
> npm 侧的四项 Trusted Publisher 配置与 Allowed actions 两个复选框（`Allow npm publish` +
> `Allow npm dist-tag`，**都默认不勾**）**只有维护者能在浏览器里点**，
> 配好之前就在本地按 `docs/RELEASE.md` §5.1 发布。**产品内容、包名与版本号都不动**；条款时间线与
> 备选方案（staged publishing）见 `docs/RELEASE.md` §5.2–§5.4。
>
> **npm 侧已于 2026-10-03 配好并验证**：用已发布版本号触发的功能探针这次红在 **`EPUBLISHCONFLICT`**
> （`cannot publish over the previously published versions`）而不是 `ENEEDAUTH` —— 说明 OIDC 兑换成功、
> trusted publisher 已生效（同一天更早的那次还是 `ENEEDAUTH`；那两条红 run 已在当天从 Actions 删除，
> 这条 workflow 现在只剩一条绿色 run，经过见 `docs/RELEASE.md` §5.2b / §6.0.3）。
> **以后发版 = 改版本号 + 提交 + 打 tag + 推 tag**，workflow 自己跑闸门、发布、
> 并把 `beta` 指到同一版；本地不再需要任何 npm 凭证。dist-tag 权限（`Allow npm dist-tag`）**只能在网页上勾**：
> `npm trust github` 只有 `--allow-publish` / `--allow-stage-publish` 两个开关，建出来就没有它，而字段建好不能改。
> **2026-10-03 起版本已在 npm 上时不再红**：workflow 会跳过 publish 与 dist-tag，改成一条黄色通知（run 绿）；
> 要专门验 OIDC 就用 `-f probe=true`（拿已发布过的版本号故意发一次请求，「版本已存在」的拒绝即判通过）。
> 判据表见 `docs/RELEASE.md` §5.2b。
>
> **2026-10-03 实测更正：那张 web-login token 已经失效**（`https://registry.npmjs.org/-/whoami` → **401**），
> `0.9.2` 最后是用**备份里的旧 GAT** 发布的（`~/.npmrc.bak-before-2fa-login-20261002-2137`：`whoami` → 200，
> 账户级 `/-/npm/v1/user` → 403）——它到 2027-01 前仍能直接 publish。使用时把 token 写进临时 userconfig
> （`--userconfig=<600 的临时文件>`），**不要覆盖 `~/.npmrc`**。**每次发布前先 `npm whoami`，401 就重新
> `npm login --auth-type=web`**（§5.1）。完整经过见 `docs/RELEASE.md` §6.0.3。

---

## 3. 每次任务的必读顺序

1. **本文件**
2. `spec/PRD.md` —— **产品语义的唯一权威**：目标、业务对象、状态语义、范围与验收标准
3. `spec/SDD.md` —— **当前架构的唯一权威**：分层、13 条路由、数据流、存储与隐私、模块清单
4. `README.md` §「当前状态」 —— 对外口径的现状（发版后必须同步，见 §9.1）
5. `docs/ARCHITECTURE.md` —— 运行时那条链的深读：事件 → 收据 → 定义视图，以及布局合同
6. `CHANGELOG.md` 顶部那一段 —— 这一版到底改了什么、为什么
7. 按任务类型再读一份：
   - 改界面 → `design.md`（视觉规格与组件表）+ `spec/PRD.md` 的 `FR-UI-*`
   - 改证据 / 对齐 → `docs/ARCHITECTURE.md` §Evidence model、§Correlation and provenance
   - 查历史规格 → `docs/archive/`（**是历史，不是权威**）
   - 要发版 → `docs/RELEASE.md`（**照做，不要凭记忆**）

> 只改代码的话，最少读 **1 → 3**。改之前先 `npm test`（**`1.2.0` 发布口径 662 项**；`1.1.0` 是 643 项，`1.0.0` 是 636 项。必须全绿）。

---

## 4. 权威分工

| 问题类型 | 权威文件 |
|---|---|
| **现在这个仓库是什么状态** | 本文件 §1 + `README.md` §当前状态 |
| 做什么 / 不做什么 | `spec/PRD.md` |
| 为什么是这个产品 | `spec/PRD.md` §1 |
| 数据怎么流、模块谁负责谁、路由几条 | `spec/SDD.md` |
| 界面长什么样、组件叫什么 | `design.md` |
| 运行时那条链的边界与证据模型 | `docs/ARCHITECTURE.md` |
| 这一版改了什么 | `CHANGELOG.md`（顶部那段是当前版） |
| 怎么发版、发完核对什么 | `docs/RELEASE.md` |
| 隐私边界 | `docs/PRIVACY.md` |
| **当前事实状态**（版本 / 测试数 / 路由数） | 本文件 §1 |
| v0.7 以前的产品与技术原文 | `docs/archive/`（**只用于追溯，冲突时以 `spec/` + 源码为准**） |

**冲突时以本文件 §1 + 源码 + 测试为准**，不以任何规格文档为准——规格写的是意图，源码写的是事实。

---

## 5. 已知的文档漂移

- `01_重构方案/` 是**本地过程目录，被 `.gitignore` 排除、不随仓库发布**（**逐文件用途与「哪份还在用」看它的 `README.md`**——2026-10-03 重新与磁盘对过账）。里面的 SDD / 设计 / 原型 / 渲染台是历史材料，**不要拿它当当前实现**。**2026-10-05 对完账后的状态**：还活着的只有 **`v1.0-真机验收清单.md`（43 条，等用户真机走查）**；`v1.0-发版清单.md` **已执行完毕**（顶部写着当天的实测结论：发布提交 `3cca1ae` / tag 对象 `c5272f4d…` / npm `gitHead` / CI run `37335200103`），转为历史；`v1.0-路线评审.md` 转为历史（V1.0 已随 `1.0.0` 发布）；`v0.10-真机验收清单.md` 随 `0.10.0` 验收完毕，也是历史。**V1.1 目前没有任何清单文件**——新版本开工时再建，不要拿旧清单顶替。
- **`docs/archive/` 是历史，三份原文都已冻结、不再回写**：`requirements-v0.7-full.md`（v0.7 及以前的全量 PRD，含 §6 历史范围与 §18 修订记录）、`technical-design-v0.1-v0.5.md`（V0.1–V0.5 的技术设计，只有 §0 作时效性说明）、`product-thesis.md`（产品命题初稿）。**改产品措辞要改 `spec/PRD.md`，不要回改这三份。** 它们之间以及它们对根目录的链接已失效，这是归档的代价，不是待修的缺陷。
- **日期一律用真实日期，且 = 该改动真实落地那天**（git 提交日 / 实测会话日），不许写未来日期。2026-10-03 用户纠正：此前「文档里的日期比机器时钟靠前两三天」那条惯例**作废**——那是我自己手写出来的漂移（机器时间一直是对的，漂移从 +1 长到 +4）。仓库里的日期已按证据逐行改准：**原 `2026-10-02` / `2026-10-03` / `2026-10-04` 的修订标签 → `2026-10-01`（v0.6 期）或 `2026-10-02`（v0.7 期）**，**原 `2026-10-05` / `2026-10-06` → `2026-10-02`**；`docs/archive/` 三份冻结原文一并改准，`docs/RELEASE.md` 里 npm token 的过期日不动。**只有本文件头部那行与本条仍故意引用那几个错误日期**（它们本身就是纠错记录）。发版时仍以 **`git log` 的时间戳**为准，别照抄规格里的日期。
- **`CHANGELOG` 版本标题的日期 = 这个版本 tag 的提交日期**（`git log -1 --format=%ad vX.Y.Z`），不是「这天开始做」也不是「这天写完」。`v0.6.1` / `v0.6.0` / `v0.5.0` / `v0.4.0-beta.66` 四条都守这条；`0.7.0` 发版时标题先写成 `2026-10-01` 而 tag 落在 `2026-10-02`，是这条规矩把它抓回来改的（见 `CHANGELOG.md` `### 十六`）。
- **`0.6.0` 与 `SDD v0.6` 是两样东西，撞名是已知的。** `SDD v0.6` 是**信息架构规格自身的版本号**（一级两页那次收敛），`0.6.0` 是**插件包版本**（详情页四层）。两者同时出现在一句话里会互相吞掉，所以约定：说规格时写「SDD v0.6」并带上下文中提到「规格」，说版本时一律带 `v`。发布时显式选了 `0.6.0` 而不是 `0.5.1`（理由见 `CHANGELOG.md` 这一版第二段与 `docs/RELEASE.md` 的起点表）。

---

## 6. 硬性技术约束

违反这些会让插件直接坏掉，或者让界面说出它证明不了的话。**都不是风格问题。**

### 6.1 浏览器跑的是 `dist/client.js`，不是 `src/dsh/client/client.js`

`npm test` 的 `pretest` 会自动重建，但**守卫用的是构建产物**：

```bash
node scripts/build-client.mjs   # 每次改完客户端源码都要跑
```

守卫会检查 `dist/client.js` 是否比源码旧，旧了就报
`dist/client.js is stale or missing — run \`npm run build:client\` and commit the result`。
`dist/` **是提交进仓库的发布产物**，不是构建缓存。

### 6.2 宿主半边改了必须重启 DSH

宿主把代码读进内存后**不会自动换**。`src/core/*.mjs` 与 `src/dsh/host/index.js` 的改动，
不重启打接口得到的是**旧答案**——而且它答得很正常，不会报错。

```bash
# 探针：这个端点真的在跑的进程里吗
curl -s "http://127.0.0.1:3080/skill-trace/catalog?sessionId=probe"
```

客户端半边（`src/dsh/client/client.js`）**硬刷新浏览器**即可，不必重启。

### 6.3 守卫是合同，不是文档

`npm run verify` 的 38 组断言全是**源码文本层**的：它们钉住路由字面、必须出现在界面里的句子、不许出现的词、CSS 的数值区间、组件的顺序。**改文案或挪组件都可能让守卫红**，这是设计而不是阻碍——每一条红都对应一次真实事故。

守卫的写法有两条纪律，改守卫时同样适用：

1. **客户端文案断言跑在「去掉英文字典之后」的源码上。** 一句只活在 `const EN = { … }` 里的文案**不算存在**——`verify-project.mjs` 会把字典块切掉再查。曾经有 45 条断言因此长期空转。
2. **不要断言一个已经不存在的页面。** v0.6 删掉 3536 行里的 22 个组件时，客户端契约里有 45 条断言在描述已删界面，多数因为文案还留在字典里而「通过」。现在契约**反向**钉住那 15 条已删路由与 `buildRuntimeGraph` / `computeRuntimeLayout` / `buildCatalogView`：**删掉的东西不许悄悄回来。**

### 6.4 `installStyles()` 是模板字符串：里面不许出现反引号

`src/dsh/client/client.js` 的整份样式表是一个反引号模板字面量。**在 CSS（包括 CSS 注释的中文说明里）写一个反引号就会提前结束字符串**，`node --check` 会报 `SyntaxError: Unexpected identifier`。

```bash
node --check src/dsh/client/client.js   # 改完 CSS 第一件事
```

要引用类名就写中文（「选中态」），不要写 `` `data-active` ``。

### 6.5 视觉 token 与三条数值守卫

- **颜色只能来自 token。** `--st-*` 变量优先映射宿主 `--dsw-alias-*`，实现值只作回退。样式里出现字面色值（`#fff8d8`、`rgba(…)`）会被 `VISUAL_TOKENS_OK` 拒绝 —— 那样暗色主题就跟着坏。
- **§26 字号带**：页面标题 ≤ 18px，辅助文字 ≥ 10.5px，小节标题 14–16px，卡片标题 13–15px。
- **§27 圆角/分隔比**：`border-radius` 声明数 ÷ `border-bottom:1px solid` 声明数 ≤ **5.5**，且分隔线 ≥ 3。**结构靠分隔线，圆角是例外。** 曾经把上限用满到 70 条而比值仍是 1.8 —— 守卫量的是**比例**。
- **§22 顶栏高度固定 48px，且既不画自己的底色、也不画自己的分隔线**（2026-10-02 由 68px 收到 48px；见 `design.md` §6.1），**§8.2 详情事实列 280px**，**§9.3 文档目录 170px**：`grid-template-columns` 是按字面匹配的。

### 6.6 客户端只能 `require` 这几支 core 模块

客户端是**手写 CJS 风格 + esbuild 打包**，`require('../../core/x.mjs')` 在构建时被内联。
`test/client-render-smoke.test.mjs` 用一个极小的降级器把 core 模块的 ESM 转成 CJS，它**只认两种写法**：

```js
export function foo(…) {}     // ✓
export const BAR = …          // ✓
import { a, b } from './y.mjs' // ✓（单行具名，会被改写成 require）
export default …               // ✗ 降级器直接抛错
export { a, b }                // ✗
```

所以**新的 core 模块要么无依赖，要么只用单行具名 import**。当前客户端 require 的是**十支**：
`installed-view.mjs` / `translation-cache.mjs` / `markdown-table.mjs` / `skill-clone.mjs` /
`flow-evidence.mjs` / `skill-framework.mjs` / `skill-runtime-logic.mjs` / `skill-instance-test.mjs` /
`skill-evaluation.mjs` /
`skill-evidence.mjs`。
（`skill-clone.mjs` 是 v0.7 加的第七支；`skill-instance-test.mjs` 是 V0.10.0 加的第八支；`skill-evaluation.mjs` 是 V1.0 加的**第九支**（`1.0.0` 起）——它唯一的一行 `import` 是 `./skill-instance-test.mjs`，同样**零依赖纯函数**。`skill-evidence.mjs` 是 V1.2 加的**第十支**（`1.2.0` 起，零依赖纯函数）——证据模型必须能被客户端读，而它恰好零 import。守卫会数 `require('../../core/…')` 的总数必须恰好是 **10**。本文此前写过「六支」「七支」「八支」。）
**能不能被客户端读，不该取决于它恰好有几个依赖。**

### 6.7 证据词表：禁用词只能来自模块常量

界面上说「这一步拿到了什么证据」的词表是**封闭五值**：

| 值 | 界面中文 |
|---|---|
| `runtime-supported` | 有相关运行证据 |
| `partial` | 部分相关证据 |
| `intent-supported` | 仅有模型意图 |
| `insufficient` | 暂无足够证据 |
| `unknown` | 无法判断 |

`src/core/flow-evidence.mjs` 的 `FLOW_EVIDENCE_FORBIDDEN` 与
`src/core/skill-runtime-logic.mjs` 的 `RUNTIME_LOGIC_FORBIDDEN` 是**唯一来源**，界面中文标签也定义在这两个模块里，
`SKILL_FRAMEWORK_OK` 查的是**解析后的标签**而不是源码文本（源码里当然会写着禁用词——它就在禁用清单里）。

**两条不许破的推论**：

- **「暂无足够证据」不等于「没有执行」。** 缺失的数据永远无法证明 Agent 跳过了某一步；
  词表里刻意没有 `not-observed`。
- **观察不到证据，就不许说任何「已…」**。禁用词包含 已执行 / 未执行 / 已完成 / 未完成 / 执行成功 /
  执行失败 / 已运行 / 未运行，运行逻辑那边另加 已加载 / 已读取 / 已注入 / 已生效。

### 6.8 声明 ← 观测 是单向的

```
SKILL.md → Definition → Framework → 声明流程 → 运行证据只能标注它
```

- **禁止**从运行证据反推出一个「看起来合理」的框架或流程。
- `attachEvidenceToFlow()` **只从 flow 取 `id/order/title/kind/line/evidenceType`**，其余全部放进 `evidence.*`——运行时**只能标注，不能增删改序**。
- **禁止增加模型调用来「总结」Skill 的框架。** `skill-framework.mjs` 是纯函数、无依赖、确定性解析。
- **声明资源 ≠ 已读取资源。** 没有 provenance 时，界面只能说「声明引用 N 个」，`resources.loaded` 永远是 `[]`。

### 6.9 只读边界与隐私字段

- **不写盘的定义正文。** `SKILL.md` 现读现返，永不落盘（`docs/PRIVACY.md`）。
- **译文存本机，但只与它对应的那一版正文绑定。** v0.7 起中文阅读版落盘在 `<dataRoot>/translations/<sha256(key)>.json`（`0700`/`0600` + 原子 rename），键是 `skillName + sourceSha256 + targetLanguage`——**不含 `sessionId`**，因为它是资产而不是这次会话的产物。`sourceSha256` 一变旧译文就不再显示（界面回原文、允许重译）。`TRANSLATION_PERSISTENCE_OK` 钉住的是**哪些东西不许落盘**：`translationStoreKey` 的实现体里不得出现 `session`，`persistTranslation({…})` 头 600 字符里不得出现 `sessionId`，且 `src/core/skill-translation.mjs` **一个字都不许落盘**（`receipt` / `localStorage` / `sessionStorage` / `writeFile` / `receiptStore` 依旧禁用）。界面的 `✓ 中文阅读版已保存` 只能由响应里的 `saved` 布尔驱动——发起请求不等于保存成功。
- **复刻只读源、只写新目录。** `mkdir` 不带 `recursive`（EEXIST 即冲突），没有「先删再写」这条路，目标已存在一律提示改名。副本的 frontmatter `name:` 必须改写成目标名——DSH 认 frontmatter 不认目录名。**不执行** Skill 里的 `scripts/`、不跑 bash / Python、不触发 Agent。完成后必须 read-back + registry 观察，观察不到目录刷新就写「待确认」。
- **不读工具参数与结果内容。** `runtime-evidence.mjs` 是唯一接缝；守卫拒绝任何开始读 `args` / `result` 内容的改动。
- **不外发绝对路径。** 「已安装」投影里只允许 `{name, description, provider, invocation}`。
- **收据里的 `learningNotes[]` / `validationResults[]` 是遗留数据**：只读、不迁移、不派生状态，当前产品没有任何写入入口。

### 6.10 布局合同：嵌入插件不能按视口高度布局

浏览器视口 ≠ DSH 内容区 ≠ 插件内容区。**高度是量出来的**：向上找最近的定高祖先，把距离发布成 `--st-host-h`，根规则读 `height:var(--st-host-h,100%)`。

```
[data-plugin="dsh-skill-trace"]  height: var(--st-host-h, 100%)
  .st-shell                      height:100%; min-height:0; display:flex; column
    .st-layout                   flex:1; min-height:0; display:grid
      page root                  min-height:0
```

每一层都要 **`height:100%` 或 `flex:1` 并且带 `min-height:0`**；少了 `min-height:0`，flex 项不肯收缩，整条链悄悄退回内容高度。**链条里不许出现 `100vh` / `100dvh` / `calc(100dvh - Npx)`。**

`test/layout-contract.test.mjs` 守着：根规则必须在**花括号深度 0**（曾经一个多删的 `}` 把整条根规则关进 `@media(max-width:1050px)`，**333 个测试全绿而字号与高度全错**）。

### 6.11 hooks 顺序是渲染合同

`conversation.view` 是**没有错误边界**的 React slot：组件一抛错，**整个标签页空白**。

**同一个组件里，`React.use*` 不得排在第一个提前 `return` 之后。** 第一帧少调一个 hook、第二帧多调一个 → React #310 → 白屏。两道守卫：`HOOK_ORDER_OK`（比较行号）与 `test/client-hook-order.test.mjs`。

推论：**接口字段缺失必须降级成可见的错误态**，不许在 `undefined` 上取属性；「读不到」与「没有」是两句话。

### 6.12 新依赖 / 新路由 / 新页面

默认答案是**不加**。

- **新依赖**：`dependencies` 必须保持为空。画布类（`elkjs` / `@xyflow/react` / `mermaid`）由守卫直接拒绝——框架画的是角色与小节，不是图。
- **新路由**：宿主现在有 **13** 条（`0.8.0` 时 11 条；v0.9.1 加了 `POST /skill-trace/modify`；**V1.0（已随 `1.0.0` 发布）加了 `POST /skill-trace/evaluation`** —— 它是**第二处真的会写文件**的路由（第一处是复刻），只做四件事：算身份、落盘、读回来、按 `caseId` 精确删除；它**不建会话、不发消息、不调模型**），由守卫按字面钉住；15 条已删路由同样被反向钉住。**V1.2 里那条第 14 条 `POST /skill-trace/evidence-export` 已经撤掉**（桌面 App 没有下载接收端，而这份 JSON 的读者是 Agent 与排障 —— 一条路由加一处落盘不划算；撤回记录见 `CHANGELOG.md` `### G`）。v0.9.1 那条是**第一条「不写文件但不是纯读」之外的第二条非纯读路由**（第一条是 `POST /skill-trace/clone`）：它把当前 `SKILL.md` 与来源指纹**只存进宿主内存**、用**当前会话**的 `agent.followup()` 代发一条消息，**不写任何文件**——真正改文件的是 Agent 用 DSH 原生工具。用户点「交给 Agent」这个动作本身就是授权。要再加路由，必须同时改本节与 `spec/SDD.md` §3。
- **新页面**：一级页面只有两个。要加页面，先改 §4 的权威文件，再改代码。

---

## 7. 产品现状与不能动的纪律

- **一级 IA 是冻结的**：本次 Skill / 已安装 Skill / 一个详情页。
- **证据 ≠ 正确性**：没有 compliance rate、score、ranking、百分比。`scored: false` 挂在每个模型上。
- **Run 不伪造标识**：DSH 没有原生 `runId`，用宿主给的事件 id 作 `runKey`，**不发明字段**。
- **指纹三态**：`match` / `mismatch` / `unavailable`。任一侧哈希缺失是 `unavailable`，**不是 `mismatch`**，也不写成「Skill 已失效」——哈希只证明版本变了，不证明好坏。
- **仓库来源**只能来自 frontmatter / git origin / 用户配置；猜不到就显示「未解析」，**不造链接**。
- **根因**：所有「读不到」都必须说人话，不许显示裸错误码，也不许沉默。

---

## 8. 踩过的坑（不要再踩）

### 8.1 CSS 注释里的反引号会终止整份样式表
`installStyles()` 是模板字面量。一个中文说明里的 `` `data-active` `` 让 `node --check` 报
`SyntaxError: Unexpected identifier 'data'`。改完 CSS **先跑 `node --check`**。

### 8.2 加了一堆圆角卡片，§27 立刻红
新写的列表块如果每个都是带 `border-radius` 的卡片，圆角/分隔比会从 4.4 冲到 6.2。
**正确做法是把它改成 `border-bottom:1px solid` 的分隔行**（这正是 §27 要的），
而不是去调比值或加分隔线凑数。

### 8.3 渲染烟测脚手架不认识新的 import 写法
`test/client-render-smoke.test.mjs` 的降级器最初只处理 `export`，遇到新模块里的
`import { … } from './x.mjs'` 直接抛 `Cannot use import statement outside a module`。
已修成同时降级单行具名 import，并对**其它 import 形式显式抛错**——宁可报清楚，不要悄悄跳过。见 §6.6。

### 8.4 组件测试只渲染「数据已经到了」的那一帧
`useState` 桩永不更新，所以 React #310（需要两帧）和「加载中」的所有分支都测不到。
**#310 是在运行中的真实 DSH 里用 CDP 抓到的。**

### 8.5 `detail.anchors` 是**共用**映射
声明步骤与框架小节都指向 outline entry id，因为**同一个点击处理器服务两者**。
合成小节的 `anchorId` 是 `null`，渲染成**不可点的行**且**不出现在映射里**——
「一个点了不动的按钮比不可点的元素更糟」。改锚点机制时别另起一套。

### 8.6 「暂无足够证据」不能带一个名头再当场收回
某个声明步骤没有证据时，早期写法渲染成 `相关运行证据：没有可展示的证据引用`——
先立一个名头，再用值把它收回，读起来像坏掉的行。现在只输出一句
`没有可展示的证据引用`（`.st-steps-none`），并且**只有真有证据时才出现那个 `dt`**。

### 8.7 折叠/分组类代码最容易丢东西
框架的分组是布局层合成的。`FrameworkStructure` 有一层兜底：角色分组与 `unclassified` 都没覆盖到的小节，**推回「其它章节」渲染**。少显示一节，读者会以为 `SKILL.md` 里本来就没有它。
（同源事故：`beta.43`–`beta.48` 的四个缺陷共同根因就是「折叠分组是布局层合成的，而周围代码都按调用节点设计」。）

### 8.8 渲染台通过 ≠ 用户看到
`0.4.0-beta.67` 把渲染台当终点，结果两个缺陷都只在真实应用里出现：渲染台**自带视图选择**（把「宿主偏好要不要被尊重」整条分支短路），且**不加载宿主主题**（暗色永远显示正常）。渲染台只截最后一帧，看不到两帧才出现的错误。

### 8.9 「装对了目录」不等于「跑的是那个目录」
`dsh plugin add` 成功，不代表那个 profile 就是**正在运行**的 profile。必须从运行中的进程反查
（`docs/RELEASE.md` §6.1）——这是 `0.4.0-beta.7`→`.13` 连续四个阶段验收全落空的根因。

### 8.10 「测试通过」不等于「测到了」
守卫必须真的跑到那条分支。曾经有 45 条客户端断言在描述已删界面，只因文案留在英文字典里而通过。改守卫时问一句：**这条断言失败过吗？如果它写成 `true` 会怎样？**

### 8.11 宿主缓存的是模块，不是版本
同一个进程里，改完 `src/core/*` 打接口仍会得到**旧答案**，而且答得完全正常。见 §6.2。

---

## 9. 开发与验收流程

```bash
cd "$(git rev-parse --show-toplevel)"   # 仓库根（本仓库根就是插件包根）

node --check src/dsh/client/client.js   # 改过 CSS/客户端源码先过这一关
npm test                                # 必须 662 全绿（pretest 会重建 dist）
npm run verify                          # 必须 38 组 OK
```

改界面的，再加一层：`01_重构方案/render-harness/`（本地，不发布）用**真实客户端 bundle + 真实会话载荷**截图核对。

### 9.1 发版后别忘了更新「知识库入口」

**本文件 §1 + `README.md` §「当前状态」是知识库入口** —— 给外人 / 新会话交代「这是什么、现在到哪一步」。

**每次发版后顺手改八处（十分钟）**：

1. 本文件 §1 的**版本 / tag / 测试数 / 静态守卫组数 / bundle 字节与 source hash / 客户端行数 / 宿主行数与路由数**；
2. `README.md` §「当前状态」的「当前公开版为 `x`」+ 版本史里那一条 `- **Unreleased**` 占位（若这一版的版本号已经先写死，则是那条 `- **x.y.z**（工作版本，尚未发布）`）换成版本号与日期；**发版的号一改，就要顺手删掉「工作版本为 `x.y.z`（…未发布）」那段**（`RELEASE_ASSETS_IN_SYNC_OK` 的规则：安装示例永远锚**已发布**版本，声明了工作版本时 `package.json` 必须等于工作版本）；
3. `CHANGELOG.md` 顶部的 `## Unreleased`（或开发期就写死了号的 `## x.y.z — 未发布 · 一句话`）标题换成 `## x — YYYY-MM-DD · 一句话`，并把正文里的「工作树实测」/「本地实测」改成「发布实测」、删掉那段「这是工作版本、尚未发布」的引用块；
4. `docs/RELEASE.md` 的「当前待发布版本」与「本次发布的起点」表，**并把 §2 / §3 / §4 命令示例里的版本号换成新号**（这文件历来每次发版都改这几条）；
5. **`spec/PRD.md`** 头部版本号 + 它里面写死的测试数 / 行数 / 字节数；
6. **`spec/SDD.md`** 头部版本号 + §0.1 的 `D` 行 + §模块清单的行数表（`wc -l` 重跑，行数变了就要改）；
7. **`docs/ARCHITECTURE.md`** 的版本口径段（`this section describes the working tree … unreleased` / `Worktree numbers` 这类词）与 **`design.md`** 的版本口径行 —— **这两处没有任何守卫盯着，是历次最容易漏的**；
8. **发布完成后回填 `docs/RELEASE.md` §6.0**（发布提交 / tag 对象 / GitHub Release / npm `gitHead` 与 dist-tags / CI run），并按该文件自己的约定把旧的 §6.0.x **逐级下移一位**、同时改引用它的行（`AGENTS.md` / `CHANGELOG.md` / `design.md` / `spec/PRD.md` / `spec/SDD.md`）。

> **判据：凡是「状态类」的字**（版本号、测试数、❌/✅、「还没做」）**，改完动作就要回头改它。**
> `RELEASE_ASSETS_IN_SYNC_OK` 钉住 README 的版本行、`github:` 安装示例的 `#v…` 锚点与 `dsh-skill-trace@x` 安装示例，并且（`1.2.0` 起）**强制「已定版未发布的工作版本」必须在 README 里显式写着「未发布」** —— 没写就当没声明、`package.json` 必须等于「当前公开版为」那个号，否则守卫红；
> **它管不到上面这几处**——第 5、6、7 条尤其容易漏，因为 `spec/` 与 `docs/` 里的数字和口径都是写死在正文里的，
> 而第 8 条漏了，下一个人就不知道这次发布到底落在了哪个提交上。

### 9.2 真机验收清单（改完界面至少过一遍）

用**复杂 Skill**（`ui-craft`：342 行 / 11 小节 / 39 个引用），不要用四步的示例：

- [ ] 一级页面两个，点进同一个详情页，返回键写明是从哪个列表进来的
- [ ] **一进详情页就是「Skill 框架」，左列有详情导航；点「Skill 验收」「Skill 评测」「SKILL.md」当场换右列，不需要往下滚**；点哪一维就只渲染那一维（右列不会继续纵向累积）
- [ ] **Skill 框架**标题右侧是「N 个小节 · M 步声明流程」，不是「共 4 步」
- [ ] 结构地图只画**真的存在**的角色（八格），缺的走一行「`SKILL.md` 里没有可识别的模块：验证 · Verification」；**「其它章节」不占角色格**，它在框架末尾以一行一节的轻列表出现（标题 + 行号 + 原文开头），不铺正文
- [ ] 蓝图五站**每站都有一句「它回答什么」**；点结构地图任一格，右列**当屏**换成那一格；一个角色超过三节时按钮写「还有 N 个章节」，点开才铺全；框架的每个区域各自是一张独立的卡（蓝图 / 结构地图 / 细节预览 / 声明流程 / 渐进披露 / 其它章节），块与块之间留缝——不许共用一个边框、只靠一条分隔线分层；结构地图与细节预览两列**等高**（右列不跟着内容伸缩，多余高度留在卡内、末句落在卡底）
- [ ] **其余详情模块也各自成卡**：`Skill 验收` 三张（结论 / 这次没有判定 / 这次验收查了什么、没查什么）、`Skill 证据` 六张、`Skill 评测` 抬头 + 七张、`本次修改对比` 五张；每张卡有自己的 `h3`，块与块之间留缝（不是一条分隔线）；**选中态**亮色下是淡灰、暗色下是比卡面亮一档的浅黑，且**不许用强调色或警告色染色**
- [ ] 「声明流程」在**框架内部**，是子模块，不是框架本身
- [ ] 「渐进披露」标题写「声明 N · 读取 **0**」，读数块写 `0 / N`，六段各自带序号与一句说明；资源按 Tier 分层，每行带 `SKILL.md` 自己写的那句「什么时候读」
- [ ] 「本次运行逻辑」五段，每段有状态与**真实事实**（Skill 数 / 载入位置 / 指纹）
- [ ] 「步骤证据」每个声明步骤一行；没有证据的那几行只有一句「没有可展示的证据引用」
- [ ] `SKILL.md` 是左列导航的最后一维，点它右列**当屏**显示原始文档（不是「滚到最下面」）
- [ ] 界面里**任何位置**都没有「已执行 / 已完成 / 执行成功 / 已加载 / 已读取 references/…」
- [ ] 文档里的表是**真表格**（带边框），不是一列竖线
- [ ] 点框架小节 → 滚到 `SKILL.md` 对应章节并高亮；合成小节**不可点**
- [ ] 「Skill 验收」卡把每个发现都落在**规则 id + 标题**上，三态只有 `通过 / 需要修正 / 无法判断`，警告不把结论推向「需要修正」；每条发现带一行来源（`Agent Skills Open Standard` / `DSH` / `OpenAI` / `Anthropic` / `Microsoft`）与 **标准合规 / 平台兼容** 的 kind —— **平台约束不许写成开放标准违反**
- [ ] 没有修改事务时，「本次修改对比」既不出现在左列导航里、也不渲染内容（常驻的空卡、和点进去才空的导航项，都会被读成一种状态）；做过一次修改后它才出现在第 6 位，且「改前快照已释放」这句要真的说出来
- [ ] **Skill 证据**（V1.2，`FR-EVIDENCE-*`）：左列第 2 项就是它；卡里状态只有 `Skill 声明 / 已观察 / 无法取得` 三个词，**没有任何「推断」档**；四段链**逐段**写着自己的限制；表格里「Skill 造成结果」那一行永远 `无法取得`、限制写的是**因果不归属**；三条边界里因果那块写的是「不声明」；漂移只说 `current / historical / no-matching-evidence`（**不许出现「过期」**）；点「复制 JSON」把同一份快照放进剪贴板，成功说「证据快照已复制到剪贴板。」、环境不支持就说「当前环境不支持复制。」；**不再有写文件那条路**（曾经有过「导出 Evidence JSON」，2026-10-06 整条撤回，见 `CHANGELOG.md` `### G`），界面里**不许**再出现「已保存到…」「已请浏览器保存」这类关于文件或下载的说法；内容里**没有**工具参数 / 工具结果 / 绝对路径 / 任何分数与百分比。**这一版改了核心层（新增 `src/core/skill-evidence.mjs`），验收前必须重启 DSH**

- [ ] 离开详情页再回来（或切到别的会话再切回来）**回到上次那一页**：同一会话内停在 `SKILL.md` 就还停在 `SKILL.md`；换一个会话则回到列表，不停在上一个会话的那一页；一级页面的默认页仍由宿主偏好决定
> **改「Skill 演进」/「Skill 差异」/「本次修改对比」那一块时**，除了上面这份，还要走 `01_重构方案/v0.8-真机验收清单.md`（12 个检查点：宿主重启的判据、真实复刻副本、三层差异、来源改过 / 读不到、禁用词、焦点与 Esc）。**宿主半边改完必须重启 DSH，客户端半边硬刷新即可**（§6.2、附录 B）。

### 9.3 测试文件分工

| 文件 | 管什么 |
|---|---|
| `test/layout-contract.test.mjs` | 样式表：根规则在深度 0、高度链、无视口单位、花括号平衡 |
| `test/client-style-lifecycle.test.mjs` | 用**构建产物** `dist/client.js` + 假 document 验样式生命周期 |
| `test/client-render-smoke.test.mjs` | 走真实元素树，抓渲染期抛错与「界面真的写了什么」；**降级器只认 §6.6 的写法** |
| `test/client-hook-order.test.mjs` | `scanHookOrder(source)` 零违规 |
| `test/phase15-skill-first-ia.test.mjs` | Skill-first IA 的 A1–A12（含锚点必须指向真实 outline entry） |
| `test/phase16-skill-framework.test.mjs` | 框架与运行逻辑的纯函数行为 + 禁用词 + 客户端必须真的引用每条 limitation |
| `test/phase25-v06-acceptance.test.mjs` | v0.6 验收 |
| `test/phase2-false-relations.test.mjs` / `phase3-alignment` / `phase9-skill-runtime-scope` | 证据与对齐的**不许乱认关系** |
| `test/skill-evidence.test.mjs` | V1.2 证据模型：三态 / 四段链 / 五类对象 / 漂移三态 / 限制词表 / 可重放 id / 导出稳定与禁止键（13 项） |
| `scripts/verify-project.mjs` | 38 组源码文本守卫（见 §6.3；第 31 组 `SKILL_STANDARD_ALIGNMENT_OK` 是 V1.1 加的，第 32–38 组是 V1.2 的 7 条 `SKILL_EVIDENCE_*`） |

---

## 10. 目录结构

```
.
├── AGENTS.md                 ← 本文件
├── README.md                 ← 对外口径 + 当前状态（知识库入口）
├── CHANGELOG.md              ← 顶部那段是当前版
├── design.md                 ← 视觉规格与组件表
├── spec/
│   ├── PRD.md                ← **当前版产品的唯一权威**（旧版见 docs/archive/）
│   └── SDD.md                ← **当前架构的唯一权威**（模块清单 / 13 条路由 / 数据流）
├── docs/
│   ├── ARCHITECTURE.md       ← 模块职责 / 宿主路由 / 证据模型 / 布局合同 / 删除记录
│   ├── PRIVACY.md
│   ├── RELEASE.md            ← 可执行的发布清单
│   └── archive/              ← **历史规格，只用于追溯**（不随产品演进回写）
│       ├── requirements-v0.7-full.md        ← v0.7 及以前的全量 PRD
│       ├── technical-design-v0.1-v0.5.md    ← V0.1–V0.5 的技术设计
│       └── product-thesis.md                ← 产品命题初稿
├── src/
│   ├── core/                 ← 纯函数层（框架、运行逻辑、对齐、表格、翻译…）
│   ├── dsh/host/index.js     ← 宿主半边：13 条路由、事件观察、持久化
│   ├── dsh/client/client.js  ← 整个客户端（一个工厂闭包）
│   └── storage/              ← 收据与偏好
├── dist/client.js            ← 构建产物，**提交进仓库**
├── .github/workflows/
│   └── publish-npm.yml       ← npm 发布（OIDC trusted publishing，见 docs/RELEASE.md §5.2）
├── scripts/
│   ├── build-client.mjs      ← esbuild 打包
│   └── verify-project.mjs    ← 38 组守卫
├── test/                     ← 662 项
└── 01_重构方案/              ← 本地过程目录，**.gitignore 排除，不发布**（入口：其中 `README.md`）
```

> 根目录只放**入口**：`AGENTS.md`（怎么干活）、`README.md`（对外口径）、`CHANGELOG.md`（这一版改了什么）、
> `design.md`（界面规格）。规格正文在 `spec/`，实现深读在 `docs/`，历史在 `docs/archive/`。
> **不要再往根目录加 `.md`** —— 2026-10-02 之前那种 `NN-xxx.md` 编号约定已经退役，
> 它同时带来「哪些文档要提交」的歧义（`.gitignore` 里一度挂着三条 `!` 例外）。

---

## 11. 禁止事项

1. **不要加页面、加一级导航。** 一级 IA 冻结在 v0.6。
2. **不要用模型来总结 Skill 的框架 / 流程。** 见 §6.8。
3. **不要让界面说出「已执行 / 已完成 / 已加载 / 已读取」。** 见 §6.7。
4. **不要把运行证据反推成声明。** 见 §6.8。
5. **不要引入运行时依赖。** `dependencies` 保持为空。
6. **不要按视口高度布局。** 见 §6.10。
7. **不要在 CSS 模板字符串里写反引号。** 见 §6.4。
8. **不要相信 `dist/client.js` 会自动更新。** 见 §6.1。
9. **不要在改完宿主半边后不重启就下结论。** 见 §6.2。
10. **不要照抄规格文档里的日期。** 见 §5。

---

## 附录 A：发布到 GitHub 的完整顺序

`docs/RELEASE.md` 是权威版本，这里只记**顺序**和**踩过的坑**：

```bash
cd "$(git rev-parse --show-toplevel)"   # 仓库根（本仓库根就是插件包根）

# 1. 三处版本号必须逐字相同：package.json / README「当前公开版为」/ CHANGELOG 标题
git status --porcelain
node scripts/build-client.mjs
npm test && npm run verify

# 2. tag 名 = package.json 的版本（带 v 前缀），打在 main 顶端
git add -A && git commit -m "release: vX.Y.Z — 一句话主题"
git tag -a vX.Y.Z -m "vX.Y.Z"

# 3. 推送；HTTP2 framing 报错时降级重试，不要换通道
git push origin main && git push origin vX.Y.Z
#    直连失败（本机 2026-10-05 实测：Failed to connect to github.com port 443）：先挑当天可达的 IP，
#    再用降级配方；IP 会换人，每次发布前重新挑一次。
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:<可达 IP> push origin main
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:<可达 IP> push origin vX.Y.Z

# 4. 回读核对
git rev-parse origin/main && git ls-remote origin refs/tags/vX.Y.Z
```

- **`RELEASE_ASSETS_IN_SYNC_OK` 会钉住** README 的「当前公开版为 `x`」与 `github:` 安装示例的 `#vx` 锚点。曾经 README 落后 49 个版本。
- **npm 安装示例锚定的是 npm 上真实存在的版本。** 发版前 README 必须**明说还没发布**（`0.7.0` 发版前就是这个状态：`beta` 与 `latest` 都指向 `0.6.1`，`v0.7.0` 的 tag 也没推，安装小节写着「发版前这条命令取不到东西」）。**换成已发布口径的那次提交，必须排在 `npm publish` 之前** —— npm 包页渲染的 README 是发布当时那份快照，反过来做的代价是包页带着一句「尚未发布」活到下一版（`0.4.0-beta.64` 那次就是这样）。发布范围历来不一致：`0.5.0` / `0.6.0` 只在 GitHub，`0.6.1` 与 `0.7.0` 是 GitHub + npm。
- **`npm publish` 从本地 `git HEAD` 读 `gitHead`。** 先发后推、或用 Git-data API 推（会生成不同 sha）会留下**永远 404** 的 commit 链接。**顺序是硬规则：先推成功 → 确认本地/远端对齐 → 最后才 publish。**
- **tag 打在发布提交上**（推送时 `main` 的顶端）。历史上 `bc78e53` 的 tag 落在 `HEAD` 之前 9 个提交处，照 commit message 找位置会漏掉之后 9 个提交。
- GitHub Release 的正文**直接从 CHANGELOG 取**，不要另写一份——两份说明一定会漂移。
- **推送失败先排查「哪个 IP 通」，不要换通道。** `git push` 直连会 `Failed to connect to github.com port 443 after 75005 ms`；
  `-c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:<ip>` 能把连接钉到某个 GitHub IP，但**同一个 IP 的推送结果会变**：
  本机 2026-10-05 实测 `140.82.113.4` 第一次 `Recv failure: Operation timed out`、稍后同 IP 一次成功，`140.82.114.4` / `140.82.121.4` 是
  `Empty reply from server`，`140.82.112.3` 是 `SSL connection timeout`。**先用 `git ls-remote`（读操作，比 push 宽容）逐个 IP 试，挑通的那个再 push**；
  `github.com` 的 IP 是 Anycast、会换人，所以**不要把这几个 IP 写死成常驻配置**。`gh`（api.github.com）通常不受影响，可以照常用。

## 附录 B：客户端路径在启动时解析，文件在请求时读取

| 阶段 | 行为 |
|---|---|
| 宿主启动 | 解析 `package.json` 的 `exports['./client']`，记下**路径字符串** |
| 浏览器请求 | 读该路径**当时的**文件内容 |

插件在宿主运行期间被换版、且新旧版本的 `./client` 指向**不同文件**时，宿主仍记着旧路径，而该文件已被换成不带 `window.__ModuleLoader__.load({...})` 注册包装的普通模块 → 外壳原样发给浏览器 → **它从不注册 → 插件界面静默消失**。

> **安装 / 替换插件后必须立即重启宿主。中间的窗口期插件界面会消失。这不是可选步骤。**
