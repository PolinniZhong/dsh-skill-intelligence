# DSH Skill Intelligence（DSH Skill 智能实验室）项目执行规则（Agent 入口）

> 本文件是 Agent 进入本项目的**第一读物**：只说「怎么在这个项目里干活」和「哪些不能动」。
> 产品需求 `spec/PRD.md` · 技术设计 `spec/SDD.md` · 视觉与组件规格 `design.md`
> · 实现细节 `docs/ARCHITECTURE.md` · 发布步骤 `docs/RELEASE.md` · 历史规格 `docs/archive/`
> **最后更新：2026-10-12**。日期一律用**该改动真实落地那天**（git 提交日 / 实测会话日），见 §5；知识库治理：根目录只留入口，`spec/` 收拢当前版 PRD 与 SDD，§1 的数字与它同步（发版后改哪八处见 §9.1）。
> **版本沿革**：当前公开版 `1.4.0`（V1.4「Skill Trigger Evaluation」，2026-10-12 发布）。**逐版做了什么见 `CHANGELOG.md`（顶部即当前版），发布实录见 `docs/RELEASE.md` §6.0.x —— 本文件不再复述**（`AGENTS.md` 有字节预算：生效上限 65536 B，历史叙述一律外置）。
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
| 插件包版本 | **`1.4.0`（`package.json`，**2026-10-12 已发布**：GitHub Release 与 npm 是同一份构建，tag `v1.4.0`，npm 的 `beta` 与 `latest` 都指向它；V1.4「Skill Trigger Evaluation」）**；上一版 **`1.3.0`（`package.json`，**2026-10-11 已发布**：GitHub Release 与 npm 是同一份构建，tag `v1.3.0`，npm 的 `beta` 与 `latest` 都指向它，`README.md` 的安装示例已锚 `v1.3.0`；V1.3「Agent-native Skill Review」）**；上一版 **`1.2.0`**（tag `v1.2.0` · 2026-10-07 · **GitHub Release 与 npm 都已发布**）；再上一版 **`1.1.0`**（tag `v1.1.0` · 2026-10-06 · **GitHub Release 与 npm 都已发布**，实测值见 `docs/RELEASE.md` §6.0.2）；上一版 **`1.0.0`**（tag `v1.0.0` · 2026-10-05 · **GitHub Release 与 npm 都已发布**，发布提交 / 注释对象 / npm `gitHead` 的实测值见 `docs/RELEASE.md` §6.0.3）；上一版 `0.10.0`（V0.10.0「Skill 实例验收」），再上一版 `0.9.2`（发布提交 `1811d98`，注释对象 `b5f1e0c`，见 `docs/RELEASE.md` §6.0.5），再上一版 `0.8.0`（发布提交 `9a61387`，注释对象 `783c4b2`，见 §6.0.6），再上一版 `0.7.1`（发布提交 `74a161d`），再上一版 `0.7.0`（发布提交 `5fac5d9`）。**`1.2.0` = V1.2「Skill 证据模型（Skill Evidence Model）+ Skill 框架重构」一版**（`FR-EVIDENCE-*`；第一件事不新增路由 / 页面 / 落盘 / 依赖，**同一版的第四件事（桌面端导出）当天加过第 14 条路由 `POST /skill-trace/evidence-export` 与 `src/storage/evidence-export-writer.mjs`，随后整条撤回**；客户端 `require` 九支 → 十支；同一版里还把详情页「Skill 框架」这一维重组成「蓝图 / 结构地图 / 细节预览 + 声明流程 + 渐进披露」五块，**只动客户端**，核心层一字未改），逐条登记在 `CHANGELOG.md` 的 `## 1.2.0`（含 `### D. 框架重构`）；**`1.1.0` = V1.1「详情级导航 + Agent Skills 开放标准」一版**（不新增路由、不新增页面、不新增落盘），逐条登记在 `CHANGELOG.md` 的 `## 1.1.0`；`1.0.0` = V1.0「Skill 评测」一版（新增第 13 条路由、一张详情页卡、一处本机落盘），见 `## 1.0.0`；`0.10.0` = V0.10.0「Skill 实例验收」（不新增路由 / 页面、不调模型、不落盘），见 `## 0.10.0`；`1.2.0` 这一轮的八处状态文字已按 §9.1 同步为**发布口径**（`package.json` 写死 `1.2.0`、`README.md` 的版本声明与两条安装示例锚点都已改成 `1.2.0`）。上一轮（`1.1.0`）八处状态文字已按 §9.1 同步为发布口径（`package.json`、本 §1、`README.md` 的版本声明与安装示例锚点；`spec/PRD.md` 头部、`spec/SDD.md` §0.1 的 `D15`、`docs/ARCHITECTURE.md` 的 `## V1.1` 段与 `design.md` 的实现入口行都已去掉「工作树」括注）；`docs/RELEASE.md` 与 §9.1 第 8 条按惯例在发版成功后才回填（§6.0 记录本次实测结果） |
| 上游仓库 | `https://github.com/PolinniZhong/dsh-skill-intelligence`（分支 `main`；2026-10-02 由 `dsh-skill-trace` 改名，旧地址自动重定向） |
| npm | **`beta` 与 `latest` 都指向 `1.4.0`**（发布后核对见 `docs/RELEASE.md` §6.0）。npm 包名仍是 `dsh-skill-trace`（品牌迁移不改包名）。`0.5.0` 与 `0.6.0` **只在 GitHub**，因此 npm 的版本号是从 `0.4.0-beta.66` 直接跳到 `0.6.1`，再到 `0.7.0`、`0.7.1`、`0.8.0`、`0.9.2`、`0.10.0`、`1.0.0`、`1.1.0`、`1.2.0`、`1.3.0`、`1.4.0` |
| 测试 | **740 项全绿**（**`1.4.0` 发布口径**；`npm test`，`pretest` 会先重建 `dist/client.js`）；`1.3.0` 是 690 项，`1.2.0` 发布口径是 662 项，`1.1.0` 是 643 项，`1.0.0` 是 636 项，`0.10.0` 是 590 项，`0.9.2` 是 561 项，`0.8.0` 是 474 项 |
| 静态守卫 | **40 组**（`npm run verify`；第 40 组 `SKILL_TRIGGER_EVALUATION_OK` 是 V1.4 新增的：钉住触发评测纯函数层的确定性与零依赖、读取层的覆盖读数、落盘闭集拒收，以及两条反向缝 —— 宿主不许读 `payload.observation`、客户端不许提交 `observation:`）。**组的增删逐版见 `scripts/verify-project.mjs` 与 `CHANGELOG.md`**，本表只留当前组数 |
| 客户端 | **`src/dsh/client/client.js` 5906 行**（+506，V1.4 的触发边界模式与模式条）· bundle `dist/client.js` **325620 字节**（source hash `c272c34814bced72`）· `src/core/` **35 个模块 14634 行** · `src/storage/` **8 个 1704 行** · 客户端 `require` **11 支**。逐版增量与历史口径见 `CHANGELOG.md` |
| 各版内容 | **不在本表复述**：逐条见 `CHANGELOG.md` 的对应小节（`## 1.4.0` / `## 1.3.0` … / `## 0.10.0`），发布实录见 `docs/RELEASE.md` §6.0.x。**本表只保留当前事实。**
| 宿主机面 | **13 条路由**，`src/dsh/host/index.js` **2135 行**（V1.4 新增五个 `trigger-*` 动作、**路由一字未增**（全部挂在既有的第 13 条 `POST /skill-trace/evaluation` 上）；`1.3.0` 口径是 2002 行，由 V1.3 新增只读工具 `skill_review` 的 `ctx.inject(['tools'], …)` 注册、并为每个 agent 装一条 `context:skill-review` 系统提示节，与路由可用性解耦，**路由一字未增**；`1.2.0` 口径是 1844 行。第 13 条是 V1.0 的 `POST /skill-trace/evaluation`，第 12 条是 v0.9.1 的 `POST /skill-trace/modify`；`0.10.0` 口径是 12 条 / 1625 行，`0.8.0` 口径是 11 条 / 1292 行）。全部由守卫按字面钉住（`docs/ARCHITECTURE.md` §Host surface） |
| 运行时依赖 | **`dependencies` 为空**；`devDependencies` 只有 `esbuild`；`peerDependencies` 只有可选的 `@deepseek-ai/dsh-llm`（翻译用） |
| 当前信息架构 | **SDD v0.6**：一级页面收敛为「本次 Skill」「已安装 Skill」，运行流程 / 运行图谱 / 收据页 / 上下文检查器 / 学习工作台 / 备份导出**已删除**（删除记录见 `docs/ARCHITECTURE.md` 末节）。v0.7 **没有新增一级 / 二级页面** |
| 详情页结构 | **V1.1 起详情页是「左侧详情导航 + 右侧当前模块」**，不再是一条纵向长页面。九个模块（守卫按 `MODULE_CONTENT` 的**映射**逐项钉住，不再钉纵向顺序）：**`Skill 框架`（默认打开）** / **`Skill 证据`（V1.2 新增，id 是 `evidence-model`，紧跟框架之后）** / `Skill 验收` / `Skill 评测` / `步骤证据` / `本次运行逻辑` / `本次修改对比` / `Definition`（事实列：身份 + 定义 + repository）/ `SKILL.md`。默认入口只是默认值：点「Skill 验收」立即显示验收，点「SKILL.md」立即显示原始文档。`Skill 框架` = **五个区域各自独立成卡**（`st-fw-region`；结构地图与细节预览并排成对 `st-fw-pair`、**两列等高**）：**蓝图（阅读路径：五站 WHY → WHEN → HOW → WITH → RESULT，每站一句「它回答什么」，缺站写「未声明」）/ 结构地图（**八格**，只画真的命中的角色；认不出角色的章节不占格、改在末尾走一行一节的轻列表，选中格是组件内 state）/ 细节预览（只渲染选中那一格的小节，默认前三节 + 按钮上那句「还有 N 个章节」）** + 声明流程（步骤只被标注、不被构造；没有声明流程时直说「不制造运行流程图」）+ 渐进披露（六段各带序号与一句说明；声明引用默认只列 6 条、可展开；分层取自核心层 `tiers`；读数块「有读取证据 / 声明引用」）——**全部来自 `SKILL.md` 的结构化解析，不是 Runtime Flow**；「Skill 评测」承载 Evaluation Case / Run / Comparison / Runtime Evidence，**同一个 Case、条件逐项提出、逐条对照、不给分、不排序、不画趋势**。「Skill 证据」是 V1.2 的只读证据视图（三态 / 四段链 / 三条边界 / 五类对象的证据状态表 / 漂移三态 / 可复核的 Evidence JSON 导出，**不给分、不排名、不聚合、不调模型**）。V1.2 第三件事起，**其余详情模块也各自成卡**（`Skill 验收` 三张 / `Skill 证据` 六张 / `Skill 评测` 抬头 + 七张 / `本次修改对比` 五张），**选中态一律中性底色**（亮色淡灰、暗色浅黑，不借强调色与警告色）。`MODULE_CONTENT` 定义在 `const DETAIL_MODULES = [` 与 `function DetailNav(` 之间 |
| 已安装列表顺序 | v0.9.2：按**加入本机的时间**（Skill 目录的 birthtime）倒序，读不到时间的按名称排在最后；规则名 `added-desc-then-name` 随 `ordering.rule` 下发，客户端只念不排。卡片上**只说例外**：日期只到 `MM-DD`（跨年才带年份、不显示时:分），有血缘才多一行 `复刻自 X`，默认成立的调用方式与 `filesystem` **一个字都不写**（`FR-ORD-*`，例外规则见 `FR-ORD-013`） |
| v0.7 新能力 | 已安装卡片可点进详情 · 中文阅读版落盘（`GET`/`DELETE /skill-trace/translation`） · 复刻 Skill（`POST /skill-trace/clone`） |

---

## 2. 现在在做什么

**维护阶段：不再加页面，只把已发布的那几层做对。**

v0.6 之后的三轮改动都有一条同样的判据：**界面上说的每一句话，要么来自 `SKILL.md` 的声明，要么来自本次会话确实观察到的事实**，两者不许互相推导。

- **逐版内容不在本文件复述**：`0.6.0` → `1.4.0` 每一版做了什么，见 `CHANGELOG.md` 的对应小节；发布实录（发布提交 / tag 对象 / npm `gitHead` / CI run）见 `docs/RELEASE.md` §6.0.x。**下面只留还生效的判据。**

**下次动手前的判据**：如果一个新的展示元素需要模型调用来「总结」Skill 的结构，**就不要做**（§6.8）。如果它需要在界面上说「已执行 / 已完成 / 已加载 / 已读取」，**就不要做**（§6.7）。

> **发布通道（现行口径）**：推 `v*` tag 触发 `.github/workflows/publish-npm.yml`（OIDC trusted publishing），workflow 自己跑闸门、发布、并把 `beta` 指到同一版 —— **本地不需要任何 npm 凭证**。
> 凭证台账、token 失效经过、dist-tag 权限只能网页勾、用 `-f probe=true` 验 OIDC 的判据表 —— **全在 `docs/RELEASE.md` §5.1 / §5.2b / §6.0.x**，本文件不再复述。
> **每次发布前先 `npm whoami`**：回 401 就按 `docs/RELEASE.md` §5.1 重新 `npm login --auth-type=web`。

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

> 只改代码的话，最少读 **1 → 3**。改之前先 `npm test`（**`1.4.0` 发布口径 740 项**；`1.3.0` 是 690 项，`1.2.0` 是 662 项，`1.1.0` 是 643 项，`1.0.0` 是 636 项。必须全绿）。

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

`npm run verify` 的 **40 组**断言全是**源码文本层**的：它们钉住路由字面、必须出现在界面里的句子、不许出现的词、CSS 的数值区间、组件的顺序。**改文案或挪组件都可能让守卫红**，这是设计而不是阻碍——每一条红都对应一次真实事故。

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

所以**新的 core 模块要么无依赖，要么只用单行具名 import**。当前客户端 require 的是**十一支**：
`installed-view.mjs` / `translation-cache.mjs` / `markdown-table.mjs` / `skill-clone.mjs` /
`flow-evidence.mjs` / `skill-framework.mjs` / `skill-runtime-logic.mjs` / `skill-instance-test.mjs` /
`skill-evaluation.mjs` /
`skill-evidence.mjs` /
`skill-trigger-evaluation.mjs`。
（`skill-clone.mjs` 是 v0.7 加的第七支；`skill-instance-test.mjs` 是 V0.10.0 加的第八支；`skill-evaluation.mjs` 是 V1.0 加的**第九支**（`1.0.0` 起）——它唯一的一行 `import` 是 `./skill-instance-test.mjs`，同样**零依赖纯函数**。`skill-evidence.mjs` 是 V1.2 加的**第十支**（`1.2.0` 起，零依赖纯函数）——证据模型必须能被客户端读，而它恰好零 import。`skill-trigger-evaluation.mjs` 是 V1.4 加的**第十一支**（`1.4.0` 起，零依赖纯函数、零 `import`）——触发三态与对照四态的词表必须有**一个**来源，界面不许自己现写一套。守卫会数 `require('../../core/…')` 的总数必须恰好是 **11**。本文此前写过「六支」「七支」「八支」「十支」。）
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
- **新路由**：宿主现在有 **13** 条（`0.8.0` 时 11 条；v0.9.1 加了 `POST /skill-trace/modify`；**V1.0（已随 `1.0.0` 发布）加了 `POST /skill-trace/evaluation`** —— 它是**第二处真的会写文件**的路由（第一处是复刻），只做四件事：算身份、落盘、读回来、按 `caseId` 精确删除；它**不建会话、不发消息、不调模型**），由守卫按字面钉住；15 条已删路由同样被反向钉住。**V1.2 里那条第 14 条 `POST /skill-trace/evidence-export` 已经撤掉**（桌面 App 没有下载接收端，而这份 JSON 的读者是 Agent 与排障 —— 一条路由加一处落盘不划算；撤回记录见 `CHANGELOG.md` `### G`）。**V1.3 不新增路由**：它新增的是一条**模型可见的只读工具**（`skill_review`，经 `ctx.inject(['tools'], …)` 注册，与上面这 13 条路由的可用性解耦）。v0.9.1 那条是**第一条「不写文件但不是纯读」之外的第二条非纯读路由**（第一条是 `POST /skill-trace/clone`）：它把当前 `SKILL.md` 与来源指纹**只存进宿主内存**、用**当前会话**的 `agent.followup()` 代发一条消息，**不写任何文件**——真正改文件的是 Agent 用 DSH 原生工具。用户点「交给 Agent」这个动作本身就是授权。要再加路由，必须同时改本节与 `spec/SDD.md` §3。
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
npm test                                # 必须 740 全绿（pretest 会重建 dist）
npm run verify                          # 必须 40 组 OK
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
| `test/skill-review.test.mjs` | V1.3 只读审查包：包结构与字段、`render ≤ 6000` 码点与如实降级、禁止键递归断言、三态与不给分（14 项） |
| `test/skill-trigger-evaluation.test.mjs` | V1.4 触发评测纯函数层：身份域与「哈希输入不含指纹」/ 观察三态 / 覆盖三态的合取 / 对照四态与三条降级 / 限制封闭词表 / 证据引用不含会话标识（30 项） |
| `test/trigger-evaluation-route.test.mjs` | V1.4 路由缝：`caseId` 由宿主算、**浏览器提交的观察不算数**、显式调用降级、`not-observed` 的两个前提、落盘无会话标识、动作名不认识（10 项） |
| `test/trigger-evaluation-store.test.mjs` | V1.4 落盘面：`trigger-suites/` 与 `trigger-runs/` 隔离、禁字段深扫、三态与限制闭集拒收、fail-soft、上限、删用例带走观察（7 项） |
| `test/skill-review-tool.test.mjs` | V1.3 工具面：宿主 `ctx.inject(['tools'], …)` 注册、只读边界、失败返回信封、第二条引导通道（`systemPrompt.section` 随工具可见性同生共死）（14 项） |
| `scripts/verify-project.mjs` | **40 组**源码文本守卫（见 §6.3）。V1.4 加第 40 组 `SKILL_TRIGGER_EVALUATION_OK`；V1.3 加第 39 组 `SKILL_REVIEW_TOOL_OK`；V1.2 加第 32–38 组 `SKILL_EVIDENCE_*`；V1.1 加第 31 组 `SKILL_STANDARD_ALIGNMENT_OK`。**逐组含义看源码，本文不复述** |

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
│   └── verify-project.mjs    ← 40 组守卫
├── test/                     ← 740 项
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

**权威版本是 `docs/RELEASE.md`** —— 这里不再重抄命令：怎么跑闸门、§2–§4 的版本串与 tag/push 配方、§5 的 npm 通道（OIDC / trusted publisher / token 台账）、§6.0 的发布后回填与实测判据，都以它为准。

只留两条最容易出事的：**（1）三处版本号必须逐字相同**（`package.json` / README「当前公开版为」/ `CHANGELOG` 标题），**先跑 `check-version-consistency` 再提交**；**（2）「发布完成」的判据是 tarball 真的能下**（`curl -s -o /dev/null -w '%{http_code}'`），不是 CI 绿。

## 附录 B：客户端路径在启动时解析，文件在请求时读取

| 阶段 | 行为 |
|---|---|
| 宿主启动 | 解析 `package.json` 的 `exports['./client']`，记下**路径字符串** |
| 浏览器请求 | 读该路径**当时的**文件内容 |

插件在宿主运行期间被换版、且新旧版本的 `./client` 指向**不同文件**时，宿主仍记着旧路径，而该文件已被换成不带 `window.__ModuleLoader__.load({...})` 注册包装的普通模块 → 外壳原样发给浏览器 → **它从不注册 → 插件界面静默消失**。

> **安装 / 替换插件后必须立即重启宿主。中间的窗口期插件界面会消失。这不是可选步骤。**
