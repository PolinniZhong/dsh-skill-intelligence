# Changelog

## 0.8.0 — 2026-10-02 · Skill 演进：复刻出来的东西，现在能倒着看回去

**这一版是 minor：V0.8「Skill 演进」是主题，另外两件搭同一班车。** 三件互不相干的改动一起发：

1. **V0.8「Skill 演进」**（主线）：`0.7.0` 把「复刻」做出来之后留下的那半——复刻出来的副本与它的来源
   **现在可以比对了**。三个 Phase 都已落地，见下面的 `### Added`。
2. **短显示名**（`3a1bf0a`）：命名体系调整，**不是功能改动**。产品品牌仍是 **DSH Skill 智能实验室 /
   DSH Skill Intelligence**，技术层 **Skill Trace** 与 npm 包名 `dsh-skill-trace` 一个字没动。变的只有
   DSH 会话里那个高频入口的短名：工作栏标签（`conversation.view` slot 的 `label`）从长品牌名改为
   **Skill 洞察 / Skill Insight**，面板的 `aria-label` 同步；README 首屏与命名分层表把三层名字写清楚。
3. **「复刻 Skill」的请求体缺陷**（`55f092c`）：`0.7.0` 起那个按钮**一次都没成功过**。这是一个功能
   可用性缺陷，不是文案改动——见下面的 `### Fixed`。

发布范围：**GitHub Release 与 npm 同时发布**（`0.5.0` 与 `0.6.0` 只在 GitHub，`0.6.1` 起每一版都是两边）。
一个版本号 `0.8.0` 把三件一起带上，不拆成「先发一个补丁版、再发一个特性版」。npm 包名仍是
`dsh-skill-trace`——已发布，改名会让安装命令与 `github:` 锚点全部失效。

### Added — V0.8「Skill 演进」：复刻出来的东西，现在能倒着看回去

`0.7.0` 的复刻只回答了「怎么造一个副本」。它没有回答制造者自己的问题：**这个副本是从哪一版来源
复刻出来的，现在还是不是那一版？两者到底哪里不一样？** V0.8 就是这三问，一次加一条路由、一张卡、
一个面板，**没有新增一级或二级页面**。

判据和前面每一版一样：**界面上说的每一句话，要么来自 `SKILL.md` 的声明，要么来自两侧文件确实读到
的事实。** 这一版把它推到最容易破的地方——「比较两个 Skill」天然会引诱你去总结、去打分、去说
「这个版本更好」：

- **只输出事实词，不输出判断词。** 差异的每一行只有 `新增 / 删除 / 修改 / 保持不变 / 无法比较`，
  界面里不许出现「更合理 / 更完整 / 建议 / 应该 / 有问题 / 更好」这类词。守卫 25 的客户端那半
  把那段界面切片抽出来扫一遍禁用词——**而且先去注释再扫**，因为用户读得到的是字符串，不是注释。
- **读不到来源时，绝不说「没有变化」。** 来源不可读、指纹不可得、比较被截断，这三种情况面板
  直说「当前无法读取来源 Skill，无法完成差异比较。」并**不渲染任何列表**。一张空表会被读成
  「两边一样」，这是这个功能最坏的失败方式。
- **说不清就说说不清。** 来源指纹三态（变了 / 没变 / 说不清）逐字写在卡上，比较本身也有
  `section-list-truncated`、`section-too-large-to-compare-line-by-line`、`diff-lines-truncated`、
  `resource-list-truncated` 这些 limitation，逐条翻译成人话，不显示裸代码。

三个 Phase：

- **Phase 1 · 血缘**：复刻成功时把「来源名 + 来源指纹 + 复刻当时的模式」记进
  `src/storage/skill-lineage-store.mjs`（`0700`/`0600`、原子 `rename`、**不记绝对路径**）。
  血缘**不另外开路由**——它随 `GET /skill-trace/skill` 的详情响应一起回（`lineage` 字段）。纯逻辑在 `src/core/skill-lineage.mjs`。
- **Phase 2 · 差异**：新增 `src/core/skill-diff.mjs` 与 `GET /skill-trace/diff`，三层比较
  **结构 / 内容 / 资源**。资源那层刻意不把 `SKILL.md` 算进去（它属于内容层），并且如实说出
  「整包复刻没覆盖到的资源，两边都会有差异」——差异的来源是**截断**，不是内容变了。
- **Phase 3 · 界面**：详情页左栏新增「Skill 演进」卡（只对由本插件复刻出来的 Skill 显示；不是复刻
  来的就逐字说「这个 Skill 不是由本插件复刻出来的。」），它打开一个 720px 的「Skill 差异」面板，
  三个 Tab —— 结构 / 内容 / 资源。面板自己带焦点陷阱（`Tab` 在首尾之间循环、`Esc` 关闭且
  `stopPropagation`）与「焦点进入 / 关闭后回到『查看差异』」两段焦点行为。读取失败的两种状态
  （路由错误 / 来源不可读）都带 `role="alert"`，因为「读不到来源」是要被辅助技术说出来的，
  不是画一行灰字。
- **Phase 3 · 「读不到」与「没有」分开说**（`AGENTS.md` §6.11）：宿主把插件读进内存之后不会自动换代码，
  所以「客户端已经是 v0.8、宿主还是 v0.7」是插件升级的正常路径（§6.2 / 附录 B）。那时详情响应里
  **根本没有 `lineage` 这个键**，而「确实没复刻过」是 `lineage: null`——两者都被 `detail?.lineage ?? null`
  合并成了同一句话，对着一个真的复刻过的 Skill 说「不是由本插件复刻出来的」。现在用
  `hasOwnProperty.call(detail, 'lineage')` 分开：键不在就说「这次详情响应里没有血缘字段。宿主可能
  还没换到这一版的代码，重启 DSH 后再试。」。**这条是探测运行中的老宿主时发现的，不是测试发现的**
  ——§8.8 的老话：渲染台通过 ≠ 用户看到。
- **Phase 3 · 「还没问」也不是「读不到」**：详情页要先去读 `/skill` 拿血缘、再拿 `lineageId` 去问
  `/diff`，中间那段往返里 `comparison.source` 还不存在。演进卡原先只拿到 `source`，于是那个 `null`
  被 `diffSourceState` 落进第一格——**每一次**打开副本详情页都会先蹦出一句「无法读取来源」，再眼看着
  它自己改口。同一个 `null` 有两种成因，所以卡现在也拿到 `diffPhase`：`loading` 说「正在读取来源…」
  （`data-changed="pending"`，颜色 `--st-faint`，视觉上也不像一个答案）、`error` 说「读取来源失败」、
  只有 `ready` 才把宿主的观测原样说出来。**这是这一版里第二处「读不到」与「没有」分不清的地方
  （第一处见上一条），而它同样不是测试发现的——是拿着用户真实的复刻（`deliver-prd-custom-custom`）
  走查时，顺着「卡上那句话到底对不对」这个问题读代码读出来的。**
  写这条守卫时又空转了一次：断言最初写成 `clientCode.includes('evolutionSourceState(source, diffPhase)')`，
  而这个子串在**函数签名**里就有一份，把调用点换回 `diffSourceState(source)` 照样为真。改成整行
  调用点才红——**断言必须落在调用点，不能落在函数名上**（§8.10 的第四次）。

工程数字：客户端 `src/dsh/client/client.js` **2348 → 2735 行**，宿主 `src/dsh/host/index.js`
**1143 → 1292 行**，bundle `dist/client.js` **129293 → 142672 字节**（source hash
`6ada68530c1fdcc2` → `f53a7ac5965b38b0`）；测试 **431 → 474 项**（V0.8 新增 4 个测试文件，
另给 `test/client-render-smoke.test.mjs` 加了 8 条），静态守卫 **23 → 25 组**；`src/core/` **24 → 26 个模块 / 7342 → 8049 行**
（新增 `skill-lineage.mjs` 174 行、`skill-diff.mjs` 527 行），`src/storage/` **4 → 5 个模块 /
694 → 884 行**（新增 `skill-lineage-store.mjs` 139 行，`skill-clone-writer.mjs` 297 → 348 行，
多了写血缘那一段）。§27 的圆角/分隔比仍是 3.10（上限 5.5），一个 14px 以上的圆角都没加。

**守卫 25 是这一版新增的第二组，两个半都落地了。** 宿主那半（Phase 2）钉住限制码与「不许把
`unavailable` 说成 `match`」；客户端那半（Phase 3）钉住「结构 / 内容 / 资源」三个 Tab 文案、
四句来源状态人话、`if (!lineage)` 不许去问差异路由、两处 `role="alert"`、界面词表必须**正好**是
那五个事实词。写这两半的时候连着踩了三次空转——`role="alert"` 只查一次会被错误态顶掉、判断词
切片的起点选在组件函数上会漏掉定义在它前面的词表、守卫把自己注释里的「更合理」当成违规。
三次都靠**负例**抓出来：每条断言都真的注入过一次、真的红过、红在它该红的那条上。

### Changed

- Shortened the DSH session display name to Skill 洞察 / Skill Insight; the product brand stays DSH Skill 智能实验室 / DSH Skill Intelligence.
- Panel accessibility names and the README naming table now use the same three layers: brand, session display name, technical module names.

| 层 | 名称 | 说明 |
|---|---|---|
| 产品品牌 | **DSH Skill 智能实验室** / **DSH Skill Intelligence** | README 首屏、仓库描述、文档抬头 |
| DSH 会话短显示名 | **Skill 洞察** / **Skill Insight** | 侧边栏 / 工作栏标签 / 面板 `aria-label` |
| npm 包名 | `dsh-skill-trace` | **不改**：已发布，改名会让安装命令与 `github:` 锚点失效 |
| 技术层 | **Skill Trace** | **保留**：`/skill-trace/*` 路由、命名空间、`[data-plugin]` 与 storage 结构 |

### Fixed — 「复刻 Skill」从 v0.7.0 起每一次都失败

**从 `0.7.0` 起，界面上那个「复刻 Skill」按钮一次都没有成功过。** 每一次点下去，用户拿到的都是
一句 `sessionId 必填`。原因不在复刻逻辑里，而在一次双边的请求体约定上：

- 宿主 `handleClone` 用 `payload.sessionId` 解析 Skill registry 与会话 `cwd`，**这个字段是必需的**；
- 客户端 `SkillCloneDialog` 组请求体时**压根没有放它**，详情页渲染这个弹窗时也没有把 `sessionId` 传下去。

于是 `sendJson` 忠实地把校验器的原话送回了界面 —— 也就顺带违反了「所有『读不到』都必须说人话」
（§7）与「不显示裸错误码」。这条责任在宿主的 400/500 分流上：它靠正则去猜消息里有没有「必填」，
等于逼着校验消息写成字段名。

修的部分：

- 客户端把 `sessionId` 放进复刻请求体，详情页把它传进弹窗。
- 宿主新增 `RequestError`（带 `status`），把「必填 / 无效」这类裸字段名换成完整的句子；
  400/500 的分流改看这个类的 `status`，那条猜词正则只留给还没有改的旧错误，并注明**不要再往里加词**。
- 两条回归测试。**它们真的会红**：去掉请求体里的 `sessionId` → 红；详情页忘了往下传 → 红；
  弹窗新解构一个没人传的 prop → 红。

为什么 429 项测试全绿而缺陷照样出厂：请求体有**两半**，而没有任何东西盯着中间那条缝。

- `test/phase18-clone-routes.test.mjs` 验的是宿主，它**自己把 `sessionId` 填进 body** —— 补上了客户端漏掉的那一格。
- 渲染烟测验的是外观，只看渲染出来的文案，从不看**真正发出去的 JSON**；它的 fetch 桩对什么都返回 `{}`，
  所以 `submit()` → `api('/clone', …)` 这条路径从来没被走到过。
- v0.7 的真机探针脚本也是直接打路由的，同样绕开了客户端。

这次的教训写进了 `spec/SDD.md` §3，守卫改成从**宿主源码**里读出它真的读哪些 `payload.*` 字段，
再要求客户端发出去的请求体覆盖它们 —— 单边测试补不出这条缝。

### Verified — V0.8 真机验收：12 个检查点，用一份真实的复刻副本走完

**宿主必须重启，客户端硬刷新即可**（§6.2、附录 B）。这次两半是分开验的：

- 重启**前**，`GET /skill-trace/diff` 答的是 `{"ok":false,"error":"not found"}` —— 那条路由在跑着的进程里**根本不存在**；
- 重启**后**，同一个请求答的是真实业务消息
  `{"ok":false,"code":"no-lineage","error":"这个 Skill 不是由本插件复刻出来的，没有可以比较的来源。"}`。
  一句 `not found` 和一条业务规则是两件事，**这就是「宿主到底换了代码没有」的判据**（§8.11）。
- 客户端那一半在服务端上已经是新的（`plugins/??dsh-skill-trace/client.js` 里含有「宿主可能还没换到这一版的代码」这句，
  证明服务端发出去的是这一版），但**浏览器要硬刷新才会取新的 rev**。

**验收用的是一份真实的复刻，不是夹具**：`~/.agents/skills/deliver-prd-custom-custom`（来源
`~/.agents/skills/deliver-prd-custom`，两侧各 5 个文件）。这台机器在此之前 `~/.dsh/skill-trace/lineage/`
**目录根本不存在** —— 这是第一条真的被写下来的血缘记录，`catalogObservation: "observed"`
（回读与 registry 观察都过了，不是「待确认」）。

拿这两份真实目录喂真实的差异引擎（`buildSkillDiff`，不是烟测里的夹具），结果与界面应当说的话一致：

| 层 | 新增 | 删除 | 修改 | 保持不变 |
|---|---|---|---|---|
| 结构 | 0 | 0 | 0 | 7 |
| 内容 | 0 | 0 | 0 | 7（每节 `lines: []`） |
| 资源 | 0 | 0 | 0 | 4 |

`comparison.status: "unchanged"`、`source.changed: false`、`limitations: []`。资源那四条是 `HISTORY.md` /
`evals/trigger-fixtures.json` / `references/EXAMPLE.md` / `references/TEMPLATE.md`，**`SKILL.md` 正确地不在资源层**
（它在结构 / 内容两层里）。

**「一个字没改的复刻」必须被说成「没改」。** 这里有一条容易忽略的前提：指纹算的是**正文**
（frontmatter 之后的 `.trim()`），**不是整份文件**。复刻必须把副本 frontmatter 里的 `name:` 改写成目标名，
如果拿整份文件去比，**每一次复刻都会永远报「来源变了」**。两份 `SKILL.md` 只差第 2 行那一处 `name:`，
而记录里的 `sourceSourceSha256` 与当前来源指纹逐字相同。这条理由写在 `src/storage/skill-clone-writer.mjs:283-284`。

**这一轮的两个缺陷都是真机 / 走查发现的，不是测试发现的**（§8.8）：老宿主没有 `lineage` 键时被说成
「不是复刻来的」，以及「还没问」被说成「读不到」。474 项测试在这两处全绿。

用户于 **2026-10-06** 确认真机走查通过（12 个检查点）。被点名确认的四件事是：卡上说「来源内容未发生变化」；
结构 / 内容两层没有任何一行显示成「修改」；资源层恰好四个文件且没有 `SKILL.md`；刷新后第一帧是
「正在读取来源…」而不是「无法读取来源」。完整清单在 `01_重构方案/v0.8-真机验收清单.md`（本地过程目录，不发布）。

### 发布范围与实测

- **版本号是 minor**：新增 1 条宿主路由（`GET /skill-trace/diff`，共 **11 条**）与 3 个模块
  （`src/core/skill-lineage.mjs` / `src/storage/skill-lineage-store.mjs` / `src/core/skill-diff.mjs`），
  外加详情页的两块新界面（「Skill 演进」卡与「Skill 差异」面板）。另外两件本身是 patch 级的，
  合在这一版里一起走。
- **发布平台**：GitHub Release（tag `v0.8.0`）与 npm（`beta` 与 `latest` 都指向 `0.8.0`），
  **同一份构建**。npm 包名仍是 `dsh-skill-trace`，不改名。
- **实测数字**（`npm test` / `npm run verify` / `wc -l` / `wc -c`）：测试 **474 项**全绿 · 守卫 **25 组**
  全 OK · 客户端 `src/dsh/client/client.js` **2735 行** · bundle `dist/client.js` **142672 字节**
  （source hash `f53a7ac5965b38b0`）· 宿主 `src/dsh/host/index.js` **1292 行 / 11 条路由** ·
  `src/core/` 26 个模块 8049 行 · `src/storage/` 5 个模块 884 行 · `dependencies` 仍为空。
- **发布后的实测结果**（发布提交 / tag 对象 / npm shasum / 净室安装 / 注册表传播）写在
  `docs/RELEASE.md` §6.0。

## 0.7.1 — 2026-10-02 · 品牌迁移：Skill Trace → DSH Skill Intelligence（DSH Skill 智能实验室）

**这是一次品牌迁移，不是功能重写。** 核心功能逻辑一个字没改：Skill Runtime 分析、Framework Parser、
Translation Store、Clone 机制、Host API（仍是 10 条路由）与 Storage 结构全部保持原样；改的是产品名、
用户可见措辞与仓库元信息。能力链没变，只是换了说法：
Discovery → Understanding → Framework Analysis → Markdown Reading → Translation → Clone → Evolution。

### Changed

- Renamed product positioning from Skill Trace to DSH Skill Intelligence.
- Updated user-facing terminology from runtime tracing to Skill understanding and evolution.
- Introduced DSH Skill 智能实验室 brand identity.

### Product Positioning

DSH Skill Intelligence helps users understand, reproduce and evolve Agent Skills.

**命名分层（改什么、不改什么）**

| 层 | 名称 | 说明 |
|---|---|---|
| 产品名 | **DSH Skill 智能实验室** / **DSH Skill Intelligence** | README 首屏、DSH 工作栏标签、包描述、文档抬头 |
| 一句话 | 探索优秀 Agent Skill 的结构与方法，将成熟 AI 工作流转化为个人能力和企业业务能力。 | 所有对外介绍统一用这句 |
| npm 包名 | `dsh-skill-trace` | **不改**：已发布，改名会让安装命令与 `github:` 锚点全部失效 |
| 技术层 | **Skill Trace** | **保留**：`/skill-trace/*` 路由、`dsh-skill-trace` 命名空间、`[data-plugin="dsh-skill-trace"]`、storage 结构 |
| 仓库 | `PolinniZhong/dsh-skill-intelligence` | GitHub 仓库改名，旧地址自动重定向 |

### 发布范围与实测

- **GitHub Release 与 npm 同时发布**：tag 打在发布提交上，npm 的 `beta` 与 `latest` 都指向 `0.7.1`。
  npm 包名仍是 `dsh-skill-trace`，**不需要 npm 迁移**——路由、模块与存储结构一个字没动。
- **只改用户理解层**：`src/` 的功能逻辑一行未改；改动集中在客户端文案、README 与文档抬头、
  `package.json` 的 description / keywords / URL，以及 GitHub 仓库元信息。
- **实测**：客户端 `src/dsh/client/client.js` 2332 → **2339 行**，bundle `dist/client.js`
  129280 → **129315 字节**（source hash `58ed0ec27f941c3f`），测试 **429 项**与守卫 **23 组**
  都不变——数字不变正是「纯品牌迁移」的证据。
- **GitHub 仓库改名**：`PolinniZhong/dsh-skill-trace` → `PolinniZhong/dsh-skill-intelligence`
  （旧地址自动重定向），description / homepage / topics 同步（`skill-tracing` 换成 `skill-intelligence`）。
- **npm 发布实测**：口径提交（`README` 折成「已发布」的那一次，也就是发布提交 `74a161d`）**先推**，
  `npm publish --tag latest --cache=/tmp/npm-cache-dsh` → 37 个文件 / 包体 348.0 kB / 解包 1.1 MB /
  shasum `2379892b6fe5a61ba5d00502545a707982e8fb13`；`npm dist-tag add dsh-skill-trace@0.7.1 beta`
  之后 `beta` 与 `latest` 都指向 `0.7.1`。注册表传播有延迟，`gitHead` 回读即 `74a161d`。

## 0.7.0 — 2026-10-02 · Skill 理解与复用：读得懂、存得住、复刻得走

**一次功能版。** 信息架构一个字没动：一级页面仍是「本次 Skill」「已安装 Skill」，二级页面仍是唯一的 Skill 详情，四层顺序仍是 框架 → 本次运行逻辑 → 步骤证据 → `SKILL.md`。这一版把产品从「观察 Skill → 理解 Skill」推进到「观察 → 理解 → **阅读** → **复刻** → 让当前 DSH Agent 继续使用」。

### 一、已安装 Skill 的卡片整张可点

此前「已安装 Skill」列表里的卡片是一个 `<article>`，**没有任何进入详情的入口**——详情页只对「本次 Skill」可达。现在卡片本身就是按钮：`hover` 轻微边框强调，`click` / `Enter` / `Space` 进入**同一个** `SkillDetailPage`（没有第二套详情页），返回沿用来源感知：从「本次 Skill」进的回本次 Skill，从「已安装 Skill」进的回已安装 Skill。

卡片里**没有**再加一个「查看详情」按钮——两个入口指向同一个动作，其中一个必然显得多余。渲染烟测里有一条断言直接钉住这件事：这个页面的 `button` 总数恰好等于卡片数。

### 二、中文阅读版：从「临时」变成「资产」

`0.6` 之前译文只活在页面内存里，退出 DSH 即消失。现在三层取用：

```text
页面内存（进程内 Map，按 sessionId）
      ↓ miss
本机译文库 <dataRoot>/translations/<sha256(key)>.json
      ↓ miss
调用宿主模型翻译 → 写回本机译文库 → 写回内存
```

- **持久化键是 `skillName + sourceSha256 + targetLanguage`，不含 `sessionId`。** 中文阅读版是资产，不是这次会话的产物——跨会话、跨 DSH 重启复用。
- **`sourceSha256` 变化即失配。** 换了版本的旧译文**不显示**，界面退回原文并允许重新翻译；旧文件按 `keepPerSkill: 2` 修剪，但**界面只展示与当前指纹一致的那一份**。
- **保存态必须来自一次真的写入。** `/translate` 的响应里多了一个 `saved` 布尔，界面据它说「✓ 中文阅读版已保存（本地保存）」或「中文阅读版没有保存到本机，下次打开需要重新翻译。」——发起请求、返回 200 都不等于保存成功。
- 目录权限 `0700`、文件 `0600`、临时文件 + `rename` 原子落盘，写法与既有的收据 / 偏好存储一致。**不写** sessionId、工具参数、工具结果、对话正文、绝对路径。

新增两条路由：`GET /skill-trace/translation`（只返回与当前指纹一致的那一份）与 `DELETE`（精确到三个字段的删除，不做模糊删除）。**这两条路由刻意不接受 `sessionId`**——要求它就等于暗示这份资产属于某次会话。

### 三、复刻 Skill：从一个现有 Skill 创建独立副本

详情页左栏对象区多了一个按钮，**是详情页唯一的对象级动作**（没有并排的 编辑 / 创建 / 优化 / 收藏 / 学习）。点开是一个 560px 的紧凑 Dialog：目标名称、保存范围（当前项目 / 我的 Skill）、复刻内容（完整 Skill / 仅 SKILL.md）、来源与当前指纹。

四条硬规则：

1. **源 Skill 永不修改。** 只读源、只写新目录。`mkdir` **不带 `recursive`**，EEXIST 即冲突——不存在「先删再写」这条路，所以「不覆盖」是文件系统的性质，不是一段记得住的判断。
2. **`sourceSha256` 必须随请求提交，宿主重新读源再校验。** 前端把读过的旧正文直接交给宿主写入是被禁止的。不一致 → `409 source-changed`，界面说「来源 Skill 已经变化，请重新打开详情页再复刻。」
3. **目标已存在时不覆盖**，提示「Skill 名称已存在，请更换名称。」，由用户改名；不自动编号，也没有绕过保护的覆盖确认。
4. **只做 `read` / `copy` / `write` / `verify`。** 不执行 Skill 里的 `scripts/`，不跑 bash / Python，不触发 Skill，不触发 Agent，不动 workspace 里的其它文件。

副本的 frontmatter `name:` 会被改写成目标名。这不是可选步骤：DSH 认的是 frontmatter 而不是目录名（`parseSkillFile`），不改这一行，副本会以源名字注册，两个同名 Skill 在 registry 里打架；`SkillRegistry.get` 甚至会在加载到的名字与候选名不符时直接返回 `undefined`。

**完成后必须 read-back 再报成功。** 顺序是 `write → read-back → registry 校验 → success`，点击成功、Toast、200 响应都不算。成功面板给的是：写到哪个范围、文件数、目录刷新状态、来源是否被改动（**重新读源比对哈希**，不靠断言）、`limitations`、以及 `调用方式 /<name>` + 一个只写剪贴板的复制按钮。目录刷新是**观察**出来的——插件拿不到 provider 的 `invalidate`，只能轮询 registry；观察不到就写「Skill 已写入 Skill 目录，目录刷新状态待确认。重启 DeepSeek Harness 后一定可见。」**不返回、不显示任何本地绝对路径。**

新增 `POST /skill-trace/clone`，错误码按状态分档：`400` 参数 / 名字不合法、`404` 源不存在、`409` 指纹不一致或目标已存在、`422` 定义读不出或 bundle 不可靠、`500` 写入失败。**每一条错误都写清发生了什么、怎么恢复**，没有一句 `Clone failed`。

### 四、复刻落到哪个目录：读出来的，不是假定的

目录体系直接对齐 `@deepseek-ai/dsh-skill-filesystem` 的真实实现顺序：`<projectRoot>/.dsh/skills`（100）→ `<projectRoot>/.agents/skills`（200）→ `customSkillDirs`（300）→ `<dshHome>/skills`（400，`skipSystem`）→ `<agentsHome>/skills`（500）→ bundled（600）。`projectRoot` 是最近的含 `.git` 的祖先，不是 cwd。

- **项目级**写 `<projectRoot>/.dsh/skills`。
- **用户级优先写用户已经在用的那个根**：本机 `~/.agents/skills` 里有真实的用户 Skill 而 `~/.dsh/skills` 是空的，所以用户级复刻落在 `~/.agents/skills` 旁边，而不是另起一个没人看的目录。两个都不存在时用 `<dshHome>/skills`。
- **扁平文件形态必须识破。** Skill 可以是 `<root>/<name>.md`，此时 `resourceBase.path` 指的是 **skills 根目录本身**——把它当成 bundle 会把别的 Skill 一起复制走。判据是 `basename(resourceBase.path) === <skill name>` 且该目录下有 `SKILL.md`；不成立时选「完整 Skill」会被拒，并明确说「当前无法确认完整资源目录，因此无法复刻完整 Skill。可以改选「仅 SKILL.md」。」
- **符号链接不跟进副本**，被跳过并在 `limitations` 里记录原因。

### 五、为什么不用 `ctx.fs` 写

`ctx.fs` 的抽象面上**没有 `mkdir`**，而且 `workspace-write` 只允许写 `workspaceRoot` / `/tmp` / `tmpdir()` 之下——用户级 Skill 目录在它之外。所以复刻写入用的是 `node:fs/promises`，与仓库里既有的收据 / 偏好存储同一条路。

### 六、工程数字

| 项 | 值 |
|---|---|
| 测试 | **429 项全绿**（原 397，+32） |
| 静态守卫 | **23 组**（数量不变；`TRANSLATION_MEMORY_ONLY_OK` 改写成 `TRANSLATION_PERSISTENCE_OK`） |
| 宿主路由 | **7 → 10 条**（新增 `GET`/`DELETE /skill-trace/translation`、`POST /skill-trace/clone`） |
| 客户端源码 | `src/dsh/client/client.js` **1970 → 2332 行** |
| 宿主源码 | `src/dsh/host/index.js` **775 → 1106 行** |
| bundle | `dist/client.js` **108839 → 129280 字节** |
| 新增模块 | `src/storage/translation-store.mjs` 208 行 · `src/core/skill-clone.mjs` 213 行 · `src/core/skill-clone-path.mjs` 70 行 · `src/storage/skill-clone-writer.mjs` 297 行 |
| 运行时依赖 | **仍然为空** |

### 七、守卫改名而不是删除

`TRANSLATION_MEMORY_ONLY_OK` 原本钉住「译文落盘即违规」。这一版**故意推翻了那条规则**，所以守卫必须跟着改写——但改的是**它守什么**，不是把它删掉。新的 `TRANSLATION_PERSISTENCE_OK` 允许写，钉住的是**哪些东西不许写进去**：

- `translationStoreKey` 的实现体里不得出现 `session`；
- `persistTranslation({…})` 的头 600 字符里不得出现 `sessionId`；
- 持久化模块里必须有 `0o700` / `0o600` / `rename(` / `FORBIDDEN_RECORD_FIELDS`；
- `/skill-trace/translate` 的响应路径上必须真的出现 `saved: await persistTranslation(`；
- 而 `src/core/skill-translation.mjs` **一个字都不许落盘**（`receipt` / `localStorage` / `sessionStorage` / `writeFile` / `receiptStore` 依旧禁用）。

守卫数量保持在 23 —— 删掉一条守卫等于删掉一次真实事故的教训。

### 八、真机验收推翻的三件事

单元测试全绿并不能证明复刻在真实 Skill 上说得对。拿**真实目录**里的 `character-asset-kit`（473 个文件 / 23 MB，自己带一个 `.git`）走一遍完整复刻，29 项检查里有 3 项暴露了「测试测不到、只有真数据才会出现」的缺陷：

- **`.git` 内部被当成了「被跳过的内容」。** `walkBundle` 会走进 `.git`，387 个条目逐个被记成 `excluded-directory`，`skippedCount` 一路传到界面——一个正常的 git 仓库里的 Skill 会显示「跳过 431 个条目」。修法是在遍历的第一行就 `if (CLONE_SKIPPED_DIRECTORIES.includes(child.name)) continue`：`.git` / `node_modules` **不进也不记**，它们不是这个 Skill 的内容，不该出现在「跳过了多少」这句话里。`selectCloneEntries` 自己的 `excluded-directory` 判据保留，因为调用方仍可能递进来一份原始清单。
- **没拷全的整包被说成了完整整包。** 16 MB 上限砍掉了 44 个文件，而界面写的是「复刻内容：完整 Skill（42 个文件）」，`bundle-truncated-by-limit` 只在小字 `limitations` 里。现在这一行由 `truncated` 决定，截断时改说「完整 Skill 没有拷全（已复制 N 个文件，M 个超过单次复刻上限）」——**一句「完整」在文件没拷全的时候是假话**。
- **同一段小字里在给用户看裸错误码。** `limitations` 之前是直接把 `bundle-truncated-by-limit` 这类字符串渲染出来的，违反「不许显示裸错误码」。四个复刻相关的 code 补进了 `SKILL_LIMITATION_TEXT`；另有一组 `CLONE_LIMITATION_RESTATED`（`absolute-paths-withheld` / `catalog-refresh-observed` / `catalog-refresh-not-observed` / `source-reread-did-not-match`）被过滤掉，因为上面正文已经把它们说成人话了——同一件事说两遍会把一句话读成两句话。

顺带修掉一个只在**这台机器**上才暴露的选择错误：`resolveCloneRoot` 原本只按 DSH 的排名挑**存在**的根，而 `~/.dsh/skills` 存在但是空的、`~/.agents/skills` 里躺着二十多个真 Skill，于是用户级复刻落进了那个空目录——DSH 能发现它，但不在用户 Skill 待的地方。现在分两级：**先挑真的有 Skill 的根**（`populated-dsh-user-root` / `populated-agents-user-root`），再退到「存在但空」（`existing-…`），最后才用默认路径。判据由新增的 `looksLikeSkillRoot()` / `probePopulatedRoots()` 从目录内容实测出来，不是按路径名猜的。

这一节修完：测试 428 项全绿，守卫 23 组不变，真机脚本 29/29。

### 九、重启 DSH 之后的十七步真机验收

上面那轮是拿真实数据喂**真宿主模块**；这一轮是打**真在跑的进程**（`http://127.0.0.1:3080`），不 mock、不打桩。宿主缓存的是模块不是版本，所以重启前 `/skill-trace/translation` 与 `/skill-trace/clone` 都是 404——**重启是这一步的前置条件，不是可选项**。

源用 `~/.agents/skills/character-asset-kit`（473 个文件、自带 `.git`），落在 user scope，跑完自己清掉。结果：

- **三道新门都开了**：`GET /skill-trace/translation` 200、`POST /skill-trace/clone` 对空体回 400（`GET /clone` 仍 404——它是 POST-only，这是对的）。
- **参数校验四连全是 400 而不是 500**：大写名字 / 目标名等于源名 / 非法 `targetScope` / 非法 `sourceSha256`。
- **指纹过期 → 409**，响应带 `currentSha256`，消息是「来源 Skill 已经变化，请重新打开详情页再复刻。」——说清了发生什么和怎么恢复。
- **真实复刻一次成功**：`verified:true`（来自回读，不是来自点击）、`fileCount` 是真实数字、`pathKind` 是 `user-agents`（两级根规则在真机上确实挑中了真有 Skill 的那个根）、`invocation` 是 `/character-asset-kit-probe`、`sourceUnchanged:true`、响应里**没有任何绝对路径**。
- **落盘核对**：副本 `SKILL.md` 真的在、frontmatter 的 `name:` 已改成目标名、**正文与源逐字一致**、`references/` 跟过来了、`.git` 没被拷进来。
- **源 473 个文件逐个哈希比对，一个都没变**。
- **同名第二次 → 409**「Skill 名称已存在，请更换名称。」，原副本**一个字节都没变**（没有先删后写），目标只存在一次。
- **目录发现**：复刻后 `catalog` 里真的出现了新名字，且源的定义指纹没变；`/skill-trace/skills` 没被新路由打破。
- **中文阅读版走了一遍完整往返**（用 454 字节的 `lark-vc`，一次真实模型调用，7.3 秒）：翻译前 GET → `null`；`POST /translate` → `saved:true`；GET 读回同一份译文；落盘目录自动创建且权限 `0700`、文件 `0600`；**换个指纹读回 `null`**（旧译文绝不当作当前译文）；换语言删是 `deleted:false` 而 zh-CN 不动；精确三字段删 → `deleted:true`，删完再读 → `null`。
- **落盘记录的键恰好是** `schemaVersion, skillName, sourceSha256, targetLanguage, translation, chunkCount, fallbackChunks, fallbackReasons, model, truncated, createdAt, updatedAt`——**没有 `sessionId`、没有源正文、没有 `args`/`result`/`messages`/`conversation`**。这是「键里不含会话」那句话在磁盘上的样子。

两个当场没过的断言，复查后都是**验收脚本自己写窄了**，不是产品缺陷：其一把 409 消息的匹配正则限定成「指纹 / 版本 / 不一致」，而实际文案是「来源 Skill 已经变化……」（更好的那句话）；其二无条件去 `stat` 译文目录，而它只在第一次真实写入时才创建——`DATA_ROOT` 本身（`~/.dsh/skill-trace`）一直是 `0700`。两条都已按实际情况改判。

一个操作层面的教训：真机复刻留下的副本位于**工作区之外**的用户 Skill 目录，沙箱会拒绝删除它（`EPERM`），必须单独放行才能清掉——而只要它还在，它就会出现在真实的 Skill 列表里。验收脚本一定要显式清理，并且清理本身要被验证。

### 十、顶栏收薄：去掉底板与分隔线，高度 68px → 48px

用户看真机截图时指着「本次 Skill / 已安装 Skill」那一行说：「这个背景占用太多高度，去掉这个背景后下方数据上移，这样就能多一些垂直空间出来。」随后在同一轮里又补了四件事，其中一件是「本次 Skill 跟已安装 Skill 下方那条横线，我觉得也不需要了」。

那句话里有两件事，第二件才是重点：**顶栏原来是一块自己画底色的横条**（`background:var(--st-layer)`），底色的边界让这一行读起来像一块独立的板子；而它真正占的高度（68px）里，分段控件只用了 36px，**剩下 32px 是纯空白**。

改法是两件一起做：去掉 `background`，高度由 68px 收到 **48px**（36px 控件 + 上下各 6px），水平内边距按 `design.md` §6.1 从 18px 回到 16px。同一轮里连 `border-bottom` 也去掉了——**顶栏现在就是一行浮在页面上的内容，既没有底板也没有分隔线**。它上面是宿主的标签条、下面是页面自己的内容，两边本来就有边界，这条线是多余的。

守卫跟着改了两条、加了一条，加的那两条都是**反向**的：

- `§22: the top bar is 48px` —— 原来钉 68px。这个数字的历史本身就是教训：它更早被钉成 72px（两份文档都没有的数字），后来才对齐到 v0.6 设计文档的 68px。
- `§22: the top bar must not paint its own background` —— 守的是「那块底板不许回来」。
- `§22: the top bar must not draw its own separator` —— 守的是「那条线也不许回来」。用户的要求是去掉，那么「有没有」就该由守卫说，而不是靠下次改动时的自觉。

**同一轮里的另外四件事：**

- **搜索图标移到搜索框右侧、框内。** 输入框改成 `padding:0 34px 0 11px` 把右侧让出来，图标用绝对定位放进 `.st-search-icon`，并加了 `pointer-events:none` —— 一个只做标记的图标不该抢走点击。
- **状态行只在有话要说时出现。** 已安装列表**在一切正常时整格留空**（连状态点一起）：删掉的「可发现 N 个 Skill」和下面的卡片说的是同一件事，再报一次是把列表读成统计。但**失败与不确定一句都没删**——「正在读取当前环境…」「已安装 Skill 读取失败 · 宿主可能仍在运行旧版本」「当前目录无法确认 · 只显示已确认的部分」「目录可能不完整 · 已发现 N 个 Skill」全部保留。**「一切正常」是唯一可以静默的情况，因为那时没有信息可加。**
- **刷新按钮保留，但只留图标。** 目录是带缓存的，装完 / 删完 Skill 需要一个手动重取的入口，所以按钮不能删；删的是它自己画的底板。这里牵出一个真问题：**`.st-icon-button` 此前一条 CSS 规则都没有**——它只出现在 JSX 的 `className` 里，整套外观都来自宿主对 `button` 的默认样式。现在补齐了宽高、居中、透明底、悬停与禁用态。
- **分段控件不再有容器底色与描边，只有选中项有底。** 容器的灰底会把两个选项一起压灰，去掉之后 `--st-accent-soft` 的选中态才亮得起来。这里有一处**不改就会立刻坏**的连带：选中态原本用 `--st-layer`，而它映射到宿主 `--dsw-alias-bg-layer-1`，**与页面底色是同一个颜色**——容器底板一去掉，原来的选中块就彻底看不见了。

**守卫红了一条，改的是代码不是守卫。** `npm run verify` 报 `Error: client contract missing (outside the dictionary): 工作区未连接`：契约钉住的那句话只活在刚被删掉的那一行里。**没有删断言，而是把兜底挪到活下来的那一行** —— 顺带修掉一个潜伏的缺陷：`sessionStatus` 一直在没有兜底地插值 `data.workspaceLabel`，字段缺失时会渲染出 `undefined · N 个 Skill · M 次加载`。

`design.md` §6.1 的「最小高度 58px」随之修订为 **48px**，并新增一条「**状态行只在有话要说时出现**」把上面四句不可省的状态写死；「与下方内容的分界是一条 `1px` 分隔线」那句旧描述已被本轮推翻。`AGENTS.md` §6.5 的那条数值约束同步为「顶栏高度固定 48px，且既不画自己的底色、也不画自己的分隔线」。

工程数字：客户端 `src/dsh/client/client.js` **2261 → 2284 行**，bundle `dist/client.js` **124506 → 125485 字节**；测试 428 项、守卫 23 组不变。

### 十一、搜索进顶栏，选中态只留字

用户接着提了两条：「**搜索框移动到本次 Skill 跟已安装 Skill 同一行，靠近刷新那个 Icon，那搜索框宽度可以再缩小一点，不需要这么长**」「**本次 Skill 跟已安装 Skill 选中的时候不用背景框，没必要，只要那个字体高亮就行，这样整个就鲜亮一点**」。

**搜索框从正文第一行搬进顶栏右侧**，位置在刷新按钮左边。查询状态本来就在 `Workbench` 里（`installedQuery`），所以这次只搬了输入框、没有搬状态：`InstalledSkillsPage` 的签名去掉 `onQueryChange`，它不再渲染搜索框，但 `query` 仍然驱动页面里的过滤——**过滤留在页面里，输入框只负责把字符串交上去**。

它**只在已安装列表出现**（`view === 'installed' && !openSkill && catalogMeta && !catalogMeta.error`）：详情页收起，目录读不到时也不出现。理由与上一轮删状态行是同一条——**一个过滤不了任何东西的输入框，会把一次失效伪装成一个功能**。

宽度 `520px → 220px`，高度对齐同一行的两个 `30px` 控件：搜索是「名称或描述的几个词」的窄输入，横跨半屏只会把那一行读成一张表单。窄屏（`≤760px`）再让位到 `140px`——这一行里只有它可以让，让不动的话被裁掉的是刷新按钮，而刷新是那一行最后一个动作。

**选中态从色块改成纯字色 + 字重**：`--st-accent-soft` 底板换成 `--st-brand` + `font-weight:600`。这一行里已经有两层底色在互相抵消（顶栏与页面），给选中态再加一块色会让两个入口看起来像一排标签而不是一句话；去掉之后选中项自己亮得起来。

**顺带修掉一个潜伏的崩溃。** 新写的渲染测试传了一份没有 `invocation` 的载荷，`InstalledSkillGrid` 直接在 `undefined` 上取属性抛 `TypeError: Cannot read properties of undefined (reading 'modelInvocable')`。宿主投影（`installed-view.mjs`）总会把 `invocation` 归一化成对象，所以**任何真载荷都碰不到它**——但这个组件是纯 props 的，而 `conversation.view` **没有错误边界**，一次抛错就是整个标签页空白（`AGENTS.md` §6.11）。改成 `skill.invocation?.modelInvocable` / `skill.invocation?.userInvocable`。

**新增一条反向测试**（`test/client-render-smoke.test.mjs`）：断言搜索框只有一个输入框、`st-search-icon` 只有一个且在输入框**之后**、`onChange` 把值原样交给 `onQueryChange`；并断言 `InstalledSkillsPage` 渲染出的输入框数为 **0**。最后这条是这条测试真正的价值——搬走之后如果原地还留着一份，界面上会有两个搜索框（一个能用、一个不能），而源码里两处 `className` 完全同名，**任何字符串断言都看不出来**。

工程数字：客户端 `src/dsh/client/client.js` **2284 → 2314 行**，bundle `dist/client.js` **125485 → 126947 字节**；测试 **428 → 429**，守卫 23 组不变；§27 圆角/分隔比 3.10。

### 十二、卡片描述截到 4 行

用户第四条：「**Skill 列表描述这里，最多显示 4 行。统一，最多显示 4 行。描述介绍，现在有些是多的，十行八行都有，这没必要显示那么多，用户可以点进去，进行一看，查看详情**」。

`.st-installed-card-desc` 与 `.st-skill-card-desc` 一起拿到同一个四行上限（`display:-webkit-box` + `-webkit-box-orient:vertical` + `-webkit-line-clamp:4` + `line-clamp:4` + `overflow:hidden`）。**两个列表都截**，因为用户说的判据是「统一」——只截一个，同一份描述在两页里会有两种长度，读者会以为是两份不同的描述。

这条截断**不丢信息，也不是「少显示」**，理由是它截的位置：

- **描述是预览，不是内容。** 有的 Skill 描述十行八行，卡片被它撑成一整个段落，一屏放不下几张卡；而**整张卡片就是详情页的入口**，完整描述点进去一眼可看。截断没有藏起任何读者过不去的地方。
- **它是纯视觉的。** `-webkit-line-clamp` 只影响绘制，DOM 里的文本一个字不少——读屏软件读到的仍是完整描述，卡片的可访问名也不受影响。这是它和「渲染前把描述切成 200 字」的根本区别：后者是真的丢字。
- **只截描述。** 卡片标题（Skill 名）与元信息行不截——名称被切掉一半，读者会以为那个 Skill 就叫这个名字。

**新增守卫**（`scripts/verify-project.mjs`，紧跟在顶栏分隔线那条反向守卫之后）：对两个类名各自断言规则存在、`-webkit-line-clamp:4` 存在、`overflow:hidden` 存在，三句错误分别是「missing the … rule」「must clamp the description to 4 lines」「clamps to 4 lines but does not hide the overflow」。不写成一条正则，是因为**「截到 4 行」和「截了但溢出还露在外面」是两种坏法**，分开报才能一眼看出是哪种。守卫组数不变（23 组，加在既有组内）。

**踩回一个已经写进 `AGENTS.md` §6.4 的坑。** 第一版 CSS 注释里为了说明机制，把属性名放进了反引号（「`` `-webkit-line-clamp` `` 只影响绘制」）。`installStyles()` 是模板字面量，**那个反引号直接把整份样式表提前结束了**，后面的中文被当成 JavaScript 解析，运行时抛 `ReferenceError: webkit is not defined at installStyles`，**13 个测试同时红**（整族 `client-render-smoke`）。`node --check` **没有**拦住它——那份源码是语法合法的 JavaScript，错的是字符串的边界。修法是把注释里的反引号去掉。§6.4 早就写着这一条，这次是「知道规则但没把规则当成改注释时也要执行的动作」。

工程数字：客户端 `src/dsh/client/client.js` **2314 → 2321 行**，bundle `dist/client.js` **126947 → 127888 字节**；测试 **429**，守卫 23 组不变；§27 圆角/分隔比仍为 3.10。

### 十三、卡片元信息行钉底，列表贴近顶栏

用户第五条：「**下方 Skill 列表向上移，距离搜索框跟搜索顶框高度一致就可以了**」「**模型可调用这块变成固定在左下，没必要根据描述向上响应**」。

**① 列表与顶栏之间不再留第二条空白带。** 顶栏自己是 `48px` 高、里面放一个 `30px` 的控件，上下各余 `9px`。列表再隔 `22px` 才开始，两者之间就出现一条**谁都不认领的空白**——它既不属于顶栏，也不属于内容，只是把整页往下推。已安装列表的顶部内边距 `22px → 10px`（左右与底部没动：那三面没有参考物可比）。

**② 元信息行（模型可调用 / 可用 /name 调用 / filesystem）钉在卡片左下角。** 网格默认把同一行的卡片拉到等高，元信息行原来只跟着描述走，于是它停在描述下面、离卡片底边还差一大截：**描述短的卡片看上去像没写完，而且同一行两张卡的「模型可调用」还不在同一条水平线上**——读者扫一列卡片时找不到可以对齐的东西。`margin-top:auto` 吃掉的正是那段空白。

两个列表都改（判据同上一轮的「统一」）。本次 Skill 列表那张卡多一处细节：它的正文列**没有 `gap`**，而 `auto` 外边距在**没有多余空间时会解析成 0**，只写 `margin-top:auto` 会让元信息行贴到描述上，所以同时给了 `padding-top:10px`——间距不能只靠一个「有富余时才生效」的值撑着。

**③ 新增三条守卫**（`scripts/verify-project.mjs`，紧随描述截断那组之后）：两个元信息行各有 `margin-top:auto`，本次 Skill 那张另有 `padding-top:10px`；外加一条钉住列表顶部内边距的 `padding:10px 24px 28px`。**守卫守的是「旧行为不许回来」**——后两条守的都是这次修正本身，防止下一次改样式时把「描述多长就离多远」改回去。

**④ 两个一级列表从此从同一个位置开始。** 用户接着指出：「**本次 Skill 列表跟已安装 Skill 列表应该是平行的，也就是本次 skill 现在太低了，要参考已安装 Skill 列表的高度向上移一点**」。上一轮只把已安装列表收到 `10px`，本次 Skill 那一页还是旧的 `padding:20px 22px 28px` —— 两个入口共用同一条顶栏，来回点时第一张卡片却横竖各跳一下（纵向 10px、横向 2px）。现在 `.st-page` 与 `.st-installed` 的内边距**逐字相同**（`10px 24px 28px`），并新增第四条守卫钉住这个相等关系：**「两页对齐」不是两个各自合适的值碰巧相等，而是一条要守的合同**——只改一页就会红。

工程数字：客户端 `src/dsh/client/client.js` **2321 → 2332 行**，bundle `dist/client.js` **127888 → 129280 字节**；测试 **429**，守卫 23 组（加在既有组内）；§27 圆角/分隔比仍为 3.10。

### 十四、知识库对齐（**没有产品改动**）

`0.7.0` 收口时做了一遍知识与实现对账。**这一节记录的不是功能，而是「文档说的」与「代码做的」之间被抹平的差距**——列在这里是为了让后来的人知道 `README.md` / `04-product-requirements.md` / `docs/ARCHITECTURE.md` / `05-technical-design.md` 在这一天被动过，以及**为什么动它不算改需求**。测试数、守卫数、bundle 字节、行数与上一节完全相同。

**① 四处「现在有多大」还停在上一个数量级。** 状态类数字最容易被漏掉，因为它们散在正文里而不是标题旁边：

| 位置 | 原值 | 现值 |
|---|---|---|
| `README.md:173` | 客户端源码 2233 行，bundle 123123 字节 | **2332 行 / 129280 字节** |
| `README.md:270`（`0.7.0` 版本史） | 客户端 1970 → 2233 行 | **1970 → 2332 行** |
| `docs/ARCHITECTURE.md:277` | about 2233 lines… about 123 KB | **about 2332 lines… about 126 KB** |
| `docs/ARCHITECTURE.md:609` | 约 2233 行、约 123 KB | **约 2332 行、约 126 KB** |

`04-product-requirements.md` §12.3 的「客户端预算」还停在 `**当前 1962 行**，bundle 421 KB → **106 KB**`、`397 项自动化测试`——它是**预算**却写着两版以前的实测值，等于没有基准，已同步为 **2332 行 / 129280 字节（约 126 KB）/ 429 项**。

**② 「译文只在内存」在五处仍然读起来像现行规则。** v0.7 把中文阅读版从临时结果改成落盘资产（`FR-UI-047` → `FR-UI-060`），但这条旧规则的本体还活在别的地方。**做法是加日期标记、不重写历史句**：`FR-UI-033`（唯一的落盘例外）、§8.2 中文预览段、V0.2 流程图注、§17.1（「禁止任何形式的暂存或落盘」——这一条已被推翻，不是被放宽），以及 `05-technical-design.md:219`。`05-technical-design.md` 按 `AGENTS.md` §5 的约定是**历史各节不回写**，只加「（v0.7 已取代本节这一条）」，并说明 `translation-cache.mjs` 降级成页面内的第一层缓存。

> 判据：**被取代的规则要留下痕迹，不能消失。** 直接删掉它，后来的人就看不出「这里曾经立过一条相反的规矩、又被什么推翻了」——那正是 `FR-UI-047` 标题里那句「v0.7 部分取代」想保住的信息。

**③ `AGENTS.md` 的「现在在做什么」补到四段。** 原来只有 `039e275` 与 `0.6.0` 两条，`0.7.0` 的五轮界面收口只在 `CHANGELOG.md` 里，入口文件读起来像这个版本没发生过事。头部「最后更新」由 `2026-10-01` 改为 `2026-10-05`，§1 的数字（`0.7.0` / 429 项 / 23 组 / 2332 行 / 129280 字节 / 10 条路由）**本来就对，没有改**。

**故意没动的地方**：`04-product-requirements.md` §18 的 `0.20`–`0.26` 修订行、`docs/RELEASE.md` 的 `0.6.1` 发布表、`README.md` 里 `beta.69` / `0.6.0` / `0.6.1` 的版本史——**它们是各自那一轮的准确记录，改掉才是错。**

### 十五、知识库治理：根目录只留入口，`spec/` 收拢当前版（**没有产品改动**）

`0.7.0` 验收通过后做的一遍仓库治理。**产品一行没改**：没碰客户端源码，没碰 `dist/`，测试 `429` 项、守卫 `23` 组、客户端 `2332` 行、bundle `129280` 字节都与上一节相同。唯一的源码改动是 `src/dsh/host/index.js` 里**两条注释**（见第 ⑤ 条），它因此从 **1106 行变成 1110 行**——注释也是源码，行数照样要对。这一节记录的是**文档被搬到哪里、以及顺带修掉的一个真缺陷**。

**① 根目录从 12 个文件收到 9 个。** 三份编号文档移进新目录 `docs/archive/`（`git mv`，可追溯）：

| 原路径 | 现路径 |
|---|---|
| `04-product-requirements.md`（v0.7 及以前的全量 PRD，1095 行） | `docs/archive/requirements-v0.7-full.md` |
| `05-technical-design.md`（V0.1–V0.5 技术设计） | `docs/archive/technical-design-v0.1-v0.5.md` |
| `02-product-thesis.md`（产品命题初稿） | `docs/archive/product-thesis.md` |

三份都加了**归档横幅**（YAML front-matter 与 H1 之间）：写明它原是哪个路径、何日为何移入、**只用于追溯不再回写**、当前权威是 `spec/`，以及「本文内部及其对根目录的链接已部分失效，**这是归档的代价，不是待修的缺陷**」。同时把能修的链接都修了（`02-product-thesis.md` → `product-thesis.md`、`design.md` → `../../design.md` 等）；故意留下的只有 `git log -p -- 02-product-thesis.md` 这类恢复命令——它按定义必须写历史路径。

**② 新增 `spec/`：当前版的 PRD 与 SDD，各只有一份。** 目录名不是 `specs/`——`.gitignore` 里 `specs/` 是排除项，放进去会被静默忽略。

- `spec/PRD.md`（692 行）：从 `docs/archive/requirements-v0.7-full.md` 重写成**只描述 0.7.0 为真的事实**，**不含任何修订记录**。80 个 `FR-*` 编号原样保留（编号是承重的：`FR-UI-047` 被 `FR-UI-060` 部分取代这类关系只能靠编号表达），已作废的编号登记成「ID 保留、内容作废、不得复用」而不是删掉。
- `spec/SDD.md`（969 行）：从 `docs/ARCHITECTURE.md` 重写成当前架构的唯一权威——10 条路由逐条、数据流、证据模型、模块清单（含 `wc -l` 实测行数）、23 组守卫逐条、测试策略、已知取舍。

**③ `.gitignore` 退役了编号约定。** `/[0-9][0-9]-*.md` 连它下面三条 `!` 例外一起删掉，并在原位留注释说明原因：这套约定同时带来「哪些文档要提交」的歧义，而**一个编号文档悄悄没被提交，正是它当年造成的那类事故**。`specs/` 保持排除，让退役的名字回不来。

**④ 顺带修掉的真缺陷：两个没有断言的守卫。** 这一轮唯一触及行为的问题。`scripts/verify-project.mjs` 末尾的 `FIVE_LAYER_MODEL_OK` 与 `FINGERPRINT_RESERVED_OK` **只是两句 `console.log`**——它们会在输出里宣布契约成立，而之前没有任何检查。同一份文件在 `572-578` 行早就把这个反模式写了下来，正是这条纪律当年抓出 `CANVAS_BOUNDED_OK` 那一批事故的原因。

`FIVE_LAYER_MODEL_OK` 是**遗产**：`git log -S` 显示它只来自 `835bdac`（`v0.4.0-beta.28`），守的是 `src/core/runtime-layout.mjs` 与 `src/dsh/client/runtime-flow.js`；这两个模块连同 `runtime-replay.mjs` 在 v0.6 删运行图谱画布时**一起被删了**，断言块跟着消失，marker 留了下来。处理分两种：

- **守的东西已经不存在 → 删掉 marker。** `FIVE_LAYER_MODEL_OK` 直接删除。今天「五层」的活代码是 `src/core/skill-runtime-logic.mjs:25` 的 `RUNTIME_STAGE_IDS = ['catalog','load','instructions','capability','evidence']`，由 `SKILL_FRAMEWORK_OK` 覆盖。
- **守的东西还在 → 补上真断言。** `FINGERPRINT_RESERVED_OK` 现在真的 import `src/core/runtime-fingerprint.mjs`，并**给一个有内容的图**（4 节点、2 次 `tool` 调用、1 条边）之后仍然要求 `derived: false` / `status: 'reserved'` / 每个 slot `value === null`。这条断言的重点是**在有东西可推的时候也必须成立**——§31 只是预留槽位，§32 禁止界面自己推断关系；一个在空图上通过的断言证明不了这一条。

新增的 `GUARD_MARKERS_ARE_BACKED_OK` 把这类事故变成不可能的：它每次运行都重扫本文件，要求每个 `console.log('…_OK')` 所在的那一段（段界是**顶格的 `}`**）里出现过 `throw new Error`，且带断言的 marker 少于 15 条也报错（防止它自己退化成永远为真的空循环）。**验证这条守卫本身会失败**：临时追加一句 `console.log('TOTALLY_FAKE_OK')`，`npm run verify` 立刻红在 `这些 marker 前面没有任何断言，输出会声称契约成立而其实没人检查过：TOTALLY_FAKE_OK`。组数仍是 **23**（删一、补一）。

**⑤ 六处文档漂移，以源码为准修掉。** 都是「注释/文档说的是上一版的行为」，运行时没错，错的是读它的人：

| 位置 | 过期说法 | 现说法 |
|---|---|---|
| `src/dsh/host/index.js` translate 注释 | 「刻意**不**落盘……只存在页面运行时内存里」 | v0.7 起落盘为本机资产，键不含会话（`FR-UI-060`） |
| `src/dsh/host/index.js` catalog 注释 | 「名字暂用 `/installed`」 | 字面一直是 `/skill-trace/catalog`；「我的 Skill」工作台 `0.5.0` 已删 |
| `docs/ARCHITECTURE.md:243` | the seven routes | **the ten routes** |
| `AGENTS.md` §6.6 | 客户端 `require` 六支 core 模块 | **七支**（多 `skill-clone.mjs`） |
| `package.json` `description` | 含已删对象的措辞 | 只描述今天的产品 |
| `README.md:146` | 指纹三态写作「已改变」 | **「文件已改变」**（与 `client.js:1736` 一致） |

**⑥ README 的 npm 口径改成实话。** 原文写「`0.7.0` 已发布，`beta` 与 `latest` 都指向它」——**这是假的**：npm 上两个 tag 都还在 `0.6.1`，`v0.7.0` 连 tag 都没推。现在安装小节明写「`0.7.0` 发版前这条命令取不到东西」，版本化命令标明「发版之后才可用」，`AGENTS.md` 附录 A 同步记下这条规矩：**npm 安装示例必须锚定 npm 上真实存在的版本；发版前 README 必须明说还没发布。**

**⑦ 一处「漂移」是复核的人看错了，撤下并留下记录。** `spec/PRD.md` 的来源冲突表曾把 `design.md` §6.1 的顶栏高度列为「尚未回写」，复核发现 `design.md:223` 写的就是「最小高度 48px，水平内边距 16px」，与代码一致——58px 只出现在 `design.md:225-227` 的修订说明里（「因此 58px → 48px」）。**判断错了也要留痕**，所以那一行改成了「核对后撤下的一条」而不是悄悄删掉。

**故意没动的地方**：`CHANGELOG.md` 里各轮提到旧文件名的句子（那是各自那一轮的准确记录）、`docs/archive/` 三份正文（冻结）、`docs/archive/technical-design-v0.1-v0.5.md` §0 的过期数字（归档只作追溯）。

### 十六、发布：GitHub Release 与 npm（全平台）

`0.7.0` 是**全平台**发布：GitHub Release 与 npm 上是同一份构建，npm 的 `beta` 与 `latest` 都指向它。顺序上有一条硬规矩——**先把 README 改成「已发布」口径的那次提交推上去，然后才 `npm publish`**：npm 包页渲染的 README 是发布当时那份快照，反过来做的代价是包页带着一句「尚未发布」活到下一版。

- 发布提交 `5fac5d9 release: v0.7.0 — Skill 理解与复用：读得懂、存得住、复刻得走`；注释 tag `v0.7.0` → `9ceb019ba63039a8e56635d43ca00298b92a830b`，解引用到 `5fac5d9`（打在发布提交上）。
- GitHub Release：<https://github.com/PolinniZhong/dsh-skill-trace/releases/tag/v0.7.0>，`Latest` 且非预发布，正文**直接取本节所属的 `CHANGELOG` 0.7.0 段**（266 行 / 38718 字节），没有第二份说明。
- 口径提交 `9800098 docs: 0.7.0 已发到 npm —— 安装口径、状态表与发布清单同步`（`README.md` / `AGENTS.md` / `spec/PRD.md` / `spec/SDD.md` / `docs/RELEASE.md`）**先推**，npm 记录到的 `gitHead` 就是它——先发后推会留下永远 404 的 commit 链接。
- npm：`npm publish --tag latest --cache=/tmp/npm-cache-dsh` → `dsh-skill-trace@0.7.0`（37 个文件 / 346.6 kB / 解包 1070413 字节 / shasum `015bbf75aee07c5dd921fdc093727e2795c1d155`），再用 `npm dist-tag add dsh-skill-trace@0.7.0 beta` 补第二个标签（同一个版本不能发布两次）。
- **注册表约 3.5 分钟后才对上**：写操作返回的是「being processed」，`23:25:17` 才读到 `{ beta: '0.7.0', latest: '0.7.0' }`。读的是注册表 packument（带时间戳破缓存），不是 `npm view`。
- 净室验证：空目录 `npm i dsh-skill-trace@0.7.0` → 版本 `0.7.0`、包内 `dist/client.js` 带 `min(72vh,640px)`、包内 README 写着 `dsh-skill-trace@0.7.0`、宿主入口可 import（`apply` / `createSessionMutationQueue` / `name` / `sessionEventLog` / `shouldPersistReceipt` / `skillEvidenceSignature`）。包页 README（21586 字符）含安装命令与「当前公开版为 `0.7.0`」，**不含**「尚未发布」。

**发布日期的更正。** 这一节的初稿把发布日期写成 `2026-10-01`，与本版标题一致；实际 `v0.7.0` 的发布提交 `5fac5d9` 的提交时间是 **2026-10-02 07:21 +0800**（`git log -1 --format=%ad v0.7.0`）。按 `AGENTS.md` §5 那条「发版时以 `git log` 的时间戳为准」，`CHANGELOG.md` 标题、`AGENTS.md` §1、`spec/PRD.md` 头部与 `docs/RELEASE.md` 三处都已改为 **`2026-10-02`**。

参照系是既有的四条：`v0.6.1` / `v0.6.0` / `v0.5.0` / `v0.4.0-beta.66` 的 tag 分别落在 `2026-10-01` / `2026-10-01` / `2026-10-01` / `2026-09-30`，`CHANGELOG` 标题与它们逐字一致——**版本标题的日期就是这个版本 tag 的提交日期**，不是「这天开始做」也不是「这天写完」。`0.7.0` 是唯一一条跨过午夜的：功能提交 `a9a6959` 在 `10-02 07:06`，发布提交在 `07:21`。

## 0.6.1 — 2026-10-01 · `SKILL.md` 面板不再被框架层压成 2px

**一次客户端补丁。** 信息架构、宿主接口、路由数量都没动：一级页面仍是「本次 Skill」「已安装 Skill」，二级页面仍是唯一的 Skill 详情，四层顺序仍是 框架 → 本次运行逻辑 → 步骤证据 → `SKILL.md`。发布范围与 `0.5.0` / `0.6.0` 不同：**GitHub 与 npm 同时发布**，npm 的 `beta` 与 `latest` 都指向 `0.6.1`。中间那两版只在 GitHub，所以 npm 的版本号是从 `0.4.0-beta.66` 直接跳过来的。

### 一、症状：文档面板在常规窗口里等于不存在

`0.6.0` 把「Skill 框架」重做成八角色模块之后，框架层在 `ui-craft` 这类能力包上会长到 **1811px**；详情页主内容区 `.st-detail-main` 是一个 `overflow:auto` 的 flex 列，而 `SKILL.md` 面板用的是 `flex:1;min-height:0`。子项总高超过容器高度时自由空间为负，`flex:1` 的基准是 0——**面板被压成 2px**。渲染台量到的四层高度：框架 1811 / 运行逻辑 560 / 步骤证据 351 / 文档面板 **2**。

后果不是「样式不好看」：**表格、原文、中文预览在 1600×1050 这种常规窗口里没有任何可读高度**，`.st-detail-doc-scroll` 的 clientHeight 只有 24px；视口加到 1600×1400 也一样。发现它靠的是给 README 重新截图时两张图**逐字节相同**——原文与中文预览的区别全在这块 2px 里。

### 二、改法：面板自己带高度，内部各自滚动

`src/dsh/client/client.js` 里那一条规则从 `flex:1;min-height:0` 改成 `flex:0 0 auto;height:min(72vh,640px)`。面板不再与框架层抢剩余空间，而是固定占视口 72%（上限 640px），`SKILL.md` 正文继续在面板内部滚动。改后实测：面板高度 **640px**（原 2px），内部滚动区 clientHeight 539 / scrollHeight 4233，主内容区 scrollHeight 3399。

### 三、README 的五张截图重新生成

截图仍来自真实 `dist/client.js` 与真实会话数据。因为一屏现在只讲一件事，图的分工也改了：`skill-detail.jpg` 改成**框架层**（八个角色模块），`skill-detail-table.jpg` 与 `skill-detail-zh.jpg` 继续讲 `SKILL.md` 面板里的表格与中文预览。

### 四、工程数字

| 项 | 值 |
|---|---|
| 测试 | **397 项全绿**（未变） |
| 静态守卫 | **23 组**（未变，含四层顺序与证据词表两条字面守卫） |
| 客户端源码 | `src/dsh/client/client.js` **1970 行**（+3，全是那条 CSS 的注释） |
| bundle | `dist/client.js` **108839 字节**（+371） |

### 五、npm 发布结果

这一版**同时发布到了 npm**（`0.5.0` 与 `0.6.0` 当时只在 GitHub，所以 npm 的版本号是从 `0.4.0-beta.66` 直接跳过来的）：

| 项 | 值 |
|---|---|
| 发布产物 | `dsh-skill-trace@0.6.1`，33 个文件，293.8 kB（解包 912.3 kB） |
| shasum | `bc3088886d1cd9f6e83bd34d28ca715a62cd2b4b`（与本地 `npm pack` 的产物逐字节一致） |
| `gitHead` | `c27da14a04f2564d530c85f0a1ba0f57753533bf`（发布前先推成功并核对本地 == 远端，避免 package 页上的 commit 链接 404） |
| dist-tags | `beta` 与 `latest` **都指向 `0.6.1`**；第二个标签只能用 `npm dist-tag add` 加 |
| npm 版本表 | `0.4.0-beta.64` → `0.4.0-beta.66` → **`0.6.1`**（中间两版不在 npm 上） |
| 净室安装 | `npm i dsh-skill-trace@0.6.1` 后，产物里的 `dist/client.js` 能 grep 到 `min(72vh,640px)`，宿主入口导出 `apply` / `name`；包内 README 就是这一版的 README |
| 注册表时延 | `npm publish` 返回 **202**（"being processed"），`latest` 真正指向 `0.6.1` 大约晚了 **6 分钟**——`npm view` 在这段时间里一直报旧版本 |

---

## 0.6.0 — 2026-10-01 · Skill 详情拆成四层：框架 / 运行逻辑 / 步骤证据 / 表格

**这一版没有动信息架构。** 一级页面仍是「本次 Skill」与「已安装 Skill」，二级页面仍是唯一的 Skill 详情；运行流程 / 运行图谱 / 运行检查器 / 回放 / 学习验证都没有回来。改动只发生在 Skill 详情**内部**。

**版本号选了 `0.6.0`，这是一个显式决策，不是默认。** 另一个候选是 `0.5.1`：改动全部落在详情页内部，按「有没有加页面」算，它更像修订版。但这一版新增了两支核心模块与一层新的展示模型（框架 / 运行逻辑），并把「Skill 框架」的含义整个换掉——按语义该进 minor。代价是 `0.6.0` 与文档里通行的 **SDD v0.6**（信息架构规格自身的版本）只差一个 `0.`，两者同时出现在一句话里会互相吞掉。因此本仓库的写法是：说规格时一律写「SDD v0.6」并带前后文，说版本时一律带 `v`。

发布范围与 `0.5.0` 相同：**只发 GitHub，npm 仍停在 `0.4.0-beta.66`**。

### 一、Skill 框架不再等于声明流程

上一版把「Skill 框架」做成了 `01 → 02 → 03 → 04` 的竖排链条。**它是错的，而且错在模型上，不在视觉上。**

链条的内容来自 `extractDeclaredFlow()`：它在定义正文里找一个小节（`## Workflow`、`流程`、`Steps`），把那个小节的有序列表抽出来。这对一份「四步做完一件事」的小 Skill 恰好成立；对 `ui-craft` 就只剩四条：`01 Project Analysis / 02 Ask the User / 03 Apply Decisions / 04 Craft Read`。于是一个 342 行、11 个小节、39 个外部资源的能力包，在界面上被说明成四步。**声明流程是一份 Skill 的一部分，不是这份 Skill 的形状。**

现在「Skill 框架」回答的是「这个 Skill 由什么组成」，由 `src/core/skill-framework.mjs`（579 行，无依赖）从同一份正文里**确定性**地解析出来——不调模型，不猜：

- 按标题层级切出小节（`buildDefinitionOutline()` 已经做过的活），前导段落合成一节（`framework:preamble`），文档大标题单独留作 `titleEntry`；
- 每个小节按标题词归入八个角色之一：`identity` / `trigger` / `rules` / `controls` / `workflow` / `resources` / `output` / `verification`。归类只走 `classifySection()` 的关键词表，不看内容像不像；
- 归不进任何角色的小节**不丢**：进 `unclassified`，界面上以「其它章节」显示，并记一条 `section-heading-does-not-match-a-known-framework-role`；
- 一层兜底：角色分组与 `unclassified` 都没覆盖到的小节，仍然会被推回「其它章节」渲染。少显示一节，读者会以为 `SKILL.md` 里本来就没有它；
- 没有某个角色的 Skill，界面在 `coverage.absent` 里**直说**缺什么（`ui-craft` 缺 `verification`），而不是替它补一节。**「没有」是要显示的事实，不是要填补的空**；
- 触发条件如果正文没写、`summary.description` 写了，就用描述合成一节，并标上 `source: 'summary'`——界面因此写「来自 Skill 描述」而不是「（无标题）」。「来自描述」说的是一处**来源**，「无标题」听起来像原文掉了个标题。

`detail.flow` 一个字没删。它只是从「框架本身」降级成框架里的一个子模块（「声明流程 · Declared Workflow」），因为它能表达的就只有「SKILL.md 明确写出的那几步」。

`detail.anchors` 因此从「步骤 id → 章节 id」变成一张**共用的**映射：声明步骤与框架小节写进同一张表，因为有锚点的小节渲染成按钮、没有锚点的渲染成不可点的行。**一个点了不动的按钮比一个不可点的元素更糟。** 伪小节（从描述合成的那一节）的 `anchorId` 是 `null`，它在表里干脆不出现。

### 二、渐进披露：声明资源不等于已读取资源

框架的第三个子模块是 `Progressive Disclosure`：`Skill 目录 → 载入 Skill → SKILL.md 全文 → 资源基准路径 → 被引用的资源 → 按需读取`。它不是工作流，是 Skill 的加载与资源组织方式。

同一份 `skill-framework.mjs` 从正文里抽出被引用的资源（`references/*.md` 这类路径），按 `### Tier 1 — Required` 这样的子标题分层，并把每行后面那句解释一起带上。对 `ui-craft` 是 **39 个声明引用 / 0 个已读取**。

**`0 个已读取` 不是没做完，是这一版要说的话。** 收据里没有任何来源证据能证明某个 `references/tokens.md` 被读过，所以 `resources.loaded` 永远是空数组，模块的 `note` 逐字写着「声明资源不等于已读取资源」。这条界线还有一个副作用：同一个路径先后出现在两个小节里（`ui-craft` 的 `references/brief.md` 先在路由表、后在资源清单），记录只有一条——`line` 留在第一次出现的位置，`declaredIn` / `group` / `when` 取资源小节的版本，`alsoDeclaredAt` 记下第二次的行号。**一个路径就是一个资源，提及多少次都是一条。**

### 三、本次运行逻辑：本次会话能观察到什么

详情页多了第二块：「本次运行逻辑」，由 `src/core/skill-runtime-logic.mjs`（256 行）从**当前会话的收据**推出五段：`目录 → 载入 → 指令 → 运行能力 → 证据`。

它不是运行图，也没有新的数据源——每一段只用已有字段，把「看得到什么」和「看不到什么」一起写出来：这一段取五个状态词里的一个，`facts[]` 列出当前会话确实观察到的事实（条目数、摘要、调用类型、指令指纹是否一致……），`limitations[]` 在观察不到时说明为什么。没有可关联的运行事件时，五段**全是最保守的那一档**，不是「没有运行」——空输入得不出否定结论。这一点和步骤证据共用同一组禁用词，词表在 `FLOW_EVIDENCE_FORBIDDEN` 之上又加了 `已加载 / 已读取 / 已注入 / 已生效`。

阶段之间没有因果顺序，界面上写明了；`runtime-alignment.mjs` 的保守规则一条没动，`Skill Load` 之后 100ms 的一次工具调用**不会**被画成 `Skill → Tool`。

### 四、步骤证据：状态词旁边给出依据

`detail.flow.steps[].evidence` 自 v0.6 起就算好了（关系、命中类型、观察到的节点、证据 id、有没有模型意图、匹配数），**客户端一次都没读过**。现在每一步下面直接列出这些依据，外加那句最容易被跳过的注：「「暂无足够证据」表示本次会话没有观察到可以对应的运行证据，不代表这一步没有执行。」

### 五、GFM 表格：101 行竖线终于变成了表

`renderSkillMarkdown()` 之前认标题、段落、有序/无序列表、代码围栏与行内标记，**不认表格**。`ui-craft/SKILL.md` 里有 101 行以 `|` 开头——路由表、Knob 表——全部退化成一行行竖线串。

新增 `src/core/markdown-table.mjs`（129 行，无依赖）：表头行 + 分隔行同时成立才算一张表（所以 setext 标题的 `---` 不会被误认为单列表格），支持左/中/右对齐、单元格内的行内代码与链接、`\|` 还原成字面竖线。渲染成真正的 `<table>`，窄的时候整张横滚而不是把列压到读不出来。

**一个解析器，两个读者。** 渲染器与翻译校验都调 `parseTableAt` / `tableSignature`，否则「画得出来」与「校验得过」会在「什么算一张表」上分家。翻译侧因此多了一条规则 `table`：表格的行数、列数、每行格数与分隔行结构必须逐字保持，形状变了就进重试/回退，横幅写「表格的行列结构被改动」。单元格里的自然语言照常翻译——「表格结构不能被翻译逻辑破坏」与「单元格内容应当被翻译」是两件事。

原文与中文预览共用**同一个** `renderSkillMarkdown` 调用点。守卫数的就是调用点数量：两个调用点意味着两套行为，而两套行为里必有一套没人测。

### 六、四层的顺序也是产品的一部分

主内容区从上到下是：**框架 → 本次运行逻辑 → 步骤证据 → SKILL.md**。守卫按这个字面顺序匹配渲染调用（`h('div', { className: 'st-detail-main' }, framework, runtimeLogic, stepEvidence, docPanel)`），错了就报 `the detail body must read 框架 → 运行逻辑 → 步骤证据 → SKILL.md, in that order`。

位置反过来就是另一种产品：先读文档、再猜结构。把运行逻辑排到框架前面，则是把「声明」读成「观察到」。

### 七、工程数字

测试 **377 → 397**（新增 `test/phase16-skill-framework.test.mjs` 16 项、冒烟渲染 5 项），静态契约守卫维持 23 组——`SKILL_FRAMEWORK_OK` 扩了新断言，而 §26 的辅助字号下限（10px → 10.5px）、§27 的圆角/分隔比（6.2 → 3.38）、详情页四层顺序三条守卫都拦下过这一版的实现。客户端 `src/dsh/client/client.js` 1500 → **1967 行**，`dist/client.js` 62 → **106 KB**（108468 字节）。新增核心模块 `src/core/skill-framework.mjs`（579 行）与 `src/core/skill-runtime-logic.mjs`（256 行）。

以上没有一条是「新增页面」——这一版一个插件页面都没加；四层全都长在已有的 Skill 详情里。

## 0.5.0 — 2026-10-01 · 首个正式版：把从未公开的 .67 / .68 / .69 合并成一次发布

**`0.5.0` 是第一个不带 `-beta` 的版本。** `0.4.0-beta.66` 之后，`main` 上又落了三个版本——`beta.67`（Skill-first 信息架构）、`beta.68`（两个只在真实应用里出现的升级缺陷）、`beta.69`（SDD v0.6 收敛 + 中文预览）——**一个都没推送到 GitHub，也都没发布到 npm**。这一版把它们合并发布：插件代码与 `0.4.0-beta.69` 逐字节相同，改动只在版本号与发布资产。

### 一、为什么在这里划正式版的线

不是时间到了，也不是测试数够了，而是 **v0.6 把产品收回到两个问题上**：这次对话加载过什么（本次 Skill），这台机器上有什么（已安装 Skill）。为此删掉了 22 个组件、四个一级视图里的三个、上下文检查器与整个跨会话学习工作台，客户端源码 3536 → 1345 行，bundle 421 → 52 KB，宿主路由 22 → 7 条。

`0.4.0-beta.66` 之后的每一版都在做**删减之后的收口**：`beta.67` 换第一屏，`beta.68` 修的是只有真实应用才会出现的白屏与旧缺省视图，`beta.69` 把中文预览做成只读且只存内存。到 `beta.69` 为止，界面已经不再试图回答「这次运行对不对」——那是产品从一开始就拒绝回答的问题。三版的逐条细节见下方各自的段。

### 二、发布范围：只有 GitHub

| 渠道 | 状态 |
|---|---|
| GitHub Release | `v0.5.0`（本次发布，**正式版，不带 `--prerelease`**） |
| git tag | `v0.5.0`，打在发布提交上 |
| npm | **未发布**：`beta` 与 `latest` 都仍指向 `0.4.0-beta.66` |
| 远端 tag | `v0.4.0-beta.66` 照旧；`.67` / `.68` / `.69` 始终没有 tag |

README 因此改成按渠道说实话：`github:` 安装示例锚定 `v0.5.0`，npm 安装示例锚定 npm 上真实存在的 `0.4.0-beta.66`，并在「当前状态」里直接写明 npm 落后一版。

同一轮还修掉发布清单里**一条一直写错、只是从没被执行到的命令**：`docs/RELEASE.md` §5 让发布者先 `npm publish --tag beta` 再 `npm publish --tag latest`，而同一个版本第二次 publish 会被注册表拒绝——

```
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/dsh-skill-trace - You cannot publish over the previously published versions: 0.4.0-beta.66.
```

`beta.66` 发布时实际用的是 `npm dist-tag add dsh-skill-trace@0.4.0-beta.66 latest`。清单已经换成这条，并注明本次跳过 npm。

### 三、文档资产一致性（发布前 `verify` 全绿）

| 文件 | 改动 |
|---|---|
| `package.json` | `0.4.0-beta.69` → `0.5.0` |
| `README.md` | 「当前公开预发布版为」→「当前公开版为」；两段安装示例按实际渠道分别锚定；逐版主线补 `0.5.0` 一条 |
| `docs/RELEASE.md` | 起点表按实测重写；§2 / §3 / §4 的命令换成 `v0.5.0`；§4 去掉 `--prerelease`；§5 改为「本次跳过」并修正命令 |
| `scripts/verify-project.mjs` | `RELEASE_ASSETS_IN_SYNC_OK` 的正则同时接受「当前公开版为」与旧措辞 |
| `04-product-requirements.md` | 头部「工程发布候选……尚未发布」改为「工程发布版……已发布到 GitHub，npm 未同步」 |

测试与守卫数量不变（**357 / 22**）：这一版没有插件代码改动。

## 0.4.0-beta.69 — 2026-10-01 · SDD v0.6：两个一级页面，以及被它们排掉的 22 个组件

**这一版按 SDD v0.6 收敛信息架构：一级页面只剩「本次 Skill」与「已安装 Skill」，两者共用一个二级页「Skill 详情」。** 测试 440 → 357；静态合同守卫 **26 → 22**——这一版新增了 `TRANSLATION_MEMORY_ONLY_OK` 与 `SKILL_FIRST_DETAIL_OK`，又删掉了 8 个**早已没有断言撑着、只是名字还印在输出里**的旧标记（见下）；客户端 3536 → 1345 行，bundle 421 → 52 KB，宿主路由 22 → 7 条。

### 一、一级页面回答两个问题，不再罗列四个视图

v0.5 的一级导航是四个平级的「会话视图」：`skills` / `map` / `runtime` / `receipt`。它们描述的是**同一次会话的不同画法**，只对已经知道自己要找什么的人成立。v0.6 换成两个页面，各自回答一个用户真会问的问题：

- **本次 Skill** —— 这次对话加载过什么。每张卡片是一个 Skill：描述、调用方式（`model` / `/name`）、加载过几次、定义现在读不读得到。
- **已安装 Skill** —— 这台机器上有什么。只打 `GET /skill-trace/catalog`，由注册表快照投影而来，**不读收据**：这台机器上装着什么，与这次会话发生过什么无关。
- **Skill 详情**（唯一二级页）—— 点任意一张卡片进入，返回键写明是从哪个列表进来的（`backLabel` 由来源决定，源码里禁止写死返回目标）。

偏好版本抬到 3：`skills` / `map` / `receipt` 这些 v0.5 词汇在读取时一概归零为「未表达偏好」，落到「本次 Skill」。这不是迁移失败——`map` 在 v0.6 里已经不是一页，尊重一个无法兑现的选择才是错的。

#### 一之一、顶栏：导航在最左，正文不再重复自己

用户看完第一版实现截图后说了三句话：把「本次 Skill / 已安装 Skill」**移到左边**；把状态行（`DSH_Skill_Trace · 1 个 Skill · 1 次加载`）**移到它后面**；正文那个「本次加载的 Skill」**删掉**。

顶栏因此固定成三格：**导航 → 这一页的数据 →（最右）刷新**。中间那格的内容随层级变——两个一级页面放状态行，进了详情页换成「← 返回 Skill 列表（本次 Skill）」。

返回键**刻意待在导航后面而不是前面**：上一版它在顶栏最前，进详情页时两个按钮会整体右跳；位置不动、内容随层级换更稳。

删掉正文段头之后，两个一级页面只留一个给读屏软件的 `h2`（`.st-sr`，视觉上不可见），页面身份由顶栏承担。字阶里 **16px 那一档随之消失** —— `design.md` 只规定上限 18px、下限 10.5px，没有「必须存在页面标题」这一条。守卫也跟着换了主语：它原本钉 `.st-page-head h2`，而这一层被删了两次，留着只会逼被删的元素复活；现在钉 SKILL.md 文档的 H2（`.st-audit-doc-heading`，14–16px）。

### 二、新增：中文预览（只读、只存内存）

`SKILL.md` 原文旁边多了一个「中文预览」分段。它的约束比功能本身重要：

- **只读**：围栏、URL、文件路径、行内代码、frontmatter 一律逐字保留，只翻译正文；译文**不写回** `SKILL.md`，也**不追加**进这次对话。
- **只存内存**：不落收据、不落备份、不进 `localStorage` / `sessionStorage`、不写文件系统；按 `sourceSha256` 绑定，定义在翻译期间变了就作废（`definition-changed`）。**寿命由用户定**：在插件里从一个 Skill 切到另一个再切回来，译文还在（`src/core/translation-cache.mjs`，进程内的 Map，最多 8 条）；退出 DeepSeek Harness 才清掉 —— 没有清理代码，插件卸载时模块一起消失。
- **失败要说出来**：翻译失败时分段控件退回「原文」（显示的＝选中的），但**错误横幅留在屏幕上**——一次静默失败比摆在明面上的失败糟得多。
- `inspectTranslation()` 另有一层守卫：把译文里的围栏数、标题层级、行内代码、URL 与路径与原文逐一比对，不一致就报违规，最多记 20 条。标题**层级**不与原文一致时不再判违规，而是按原文的顺序把 `#` 的个数钉回去（`alignHeadingLevels()`）——层级本来不是模型的活，为一个 `#` 丢掉整段不合算；层级**数量**对不上才判失败。

#### 二之一、中文预览在用户手里连败四次，四个原因各不相同

这一节留在这里，是因为**四次失败里有三次是这一层的判定逻辑本身，而不是模型**。前三次的形态都是同一句
「这份翻译改动了文档结构，已丢弃。可以重试。」——一句话盖住了三个不同的原因。

1. **整篇一次翻完 + 判定全有或全无**。31174 字符、336 行、28 个标题，模型 28 秒返回，
   被 `inspectTranslation` 以 `["heading","inline-code","file-path"]` 丢掉。§12.4 的「不得修改结构」
   被实现成了「整篇必须完美」，而这条策略整块长在宿主里、必须连真模型才能跑——所以它在 341 个
   全绿的测试里完全看不出来。
2. **单次调用 `maxTokens: 4096` 装不下一篇中文**。译文被截断，后半篇标题全丢，报出来的症状还是
   `heading`。上限抬到 8192，并把翻译改成**先掩码、再按标题切段、逐段翻译**：围栏、URL、路径、
   行内代码根本不进入请求，模型只看见 27415 个字符的自然语言；每段独立重试、独立回退原文，
   一段坏掉不再毁掉整篇。策略同时从宿主搬进 `src/core/skill-translation.mjs`，用**注入的假模型**
   测试——「模型毁了第 3 段」现在是一个毫秒级用例。
3. **接头会吞掉标题**。段与段之间的空行在切段时算作上一段的尾随空白，而模型几乎总会 trim 掉它；
   八段拼起来时上一段的正文与下一段的 `## 标题` 粘成一行，`^#{1,6}\s` 不再匹配，**28 个标题变 21 个**，
   整篇校验又一次报 `heading`——而每一段单看都是对的。修法是 `reanchorChunk()`：每段译文的
   首尾空白按原文还原。回归用例故意用一个「每段都 trim」的模型，去掉这个函数它就红。
4. **失败不说原因**。界面以前只说「有 N 段没有翻译成功」，用户只能猜。现在段级校验的规则名
   （`heading` / `placeholder` / `untranslated` / `empty`）会跟着回退段一起回到界面，写成
   「有 2 段没有翻译成功（模型把原文原样返回了），那几段显示的是原文」。

#### 二之二、第五次：界面说"成功"，用户看到满屏英文

前四次修完，用户第五次反馈的原话是「**宏观你那是提示成功，但是我没有看到**」。这一次不是策略
没修好，是**判定根本不看语言**：`checkChunk()` 只查结构，所以模型把 3302 字符**原样返回英文**
时，占位符在、标题数对、围栏在——它拿了满分。于是横幅说「其余已翻译」，正文里躺着的是英文。

三个改动：

- **判定要看语言**（`looksUntranslated()`）：输出与输入逐字相同、或目标语言是中文而输出里
  一个汉字都没有，且字母数 ≥24 —— 判 `untranslated`，不许算成功。旧测试里有一条断言
  `checkChunk({source, translation: source}).ok === true`，那正是这个 bug 的画像，已删掉。
- **修得了就修，别丢**（`alignHeadingLevels()`）：模型看到 `##` 直接跳 `####` 会当成笔误改成
  `###`——那是善意的。数量对得上就把层级钉回原文，数量对不上才失败。
- **坏的一段先劈开再试**（`splitChunkSource()` + 递归 `translateLeaf()`，最多 2 层）：一次真实
  故障里，一个 `####` 让 3302 字符（全文 79%）整段退回英文，而它旁边那段 610 字符是好的。
  现在失败的那半继续劈、好的那半把译文留住，用户看到的是「有几处还是英文」，不是「整篇没翻」。
  重试时还会告诉模型上次错在哪（「不要把原文原样返回」）。

仿真证据：拿真实 `roadmap-narrative/SKILL.md`（4156 字符）配一个「对 >500 字符的输入原样返回
英文」的假模型跑一遍 —— 修复前是**零个汉字、还被报成成功**；修复后模型被调 18 次、文档结构仍然
完好、译文里有 **65 个汉字**，横幅诚实地说有 2 段没翻成。失败从「静默全英文」变成「部分译文 +
说得清楚的失败」。

教训写在测试里而不是注释里：**围栏与路径不能靠请求模型"别改"，要靠它们根本不进请求**；
**跨段的结构完整性，段级校验看不见**；**"结构没坏"不等于"翻译发生了"**。

### 三、删除：不是整理，是重构的另一半

§4.4 的顺序是 UI → 视图消费者 → 宿主路由 → 撑住路由的模块，四步都走完才算删干净。

- **客户端 22 个组件**：`RuntimeView`、`RuntimeInspector`、`FlowCanvas`、`ReplayControls`、`ReceiptView`、`ReceiptDetails`、`ReceiptRow`、`FingerprintSection`、`MapView`、`Inspector`、`ValidationEditor`、`DeclarationPanel`、`LearningPanel`、`CatalogPage`、`CatalogGuide`、`CatalogDetail`、`HistoryCard`、`HistoricalContinuationAction`、`Aside`、`SessionSummary`、`SessionStatus`，以及 47 个只服务于它们的辅助声明、302 条无消费者的 CSS 规则、147 条只剩历史意义的字典项。
- **宿主 15 条路由**：`/runtime`、`/inspect`、`/catalog`（v0.5 的学习工作台那一条；v0.6 的已安装列表是另一条同名新路由，见上）、`/history-note`、`/history-receipt`、`/export`、`/backups`、`/backups/preview`、`/backups/restore`、`/outputs`、`/continuity`、`/learning-note`、`/validation-result`、`DELETE /receipt`、`DELETE /receipts`。**保留 7 条**：`/context`、`/skills`、`/skill`、`/catalog`、`/definition`、`/translate`、`/preferences`。
- **模块与依赖**：`runtime-layout`、`runtime-layout-elk`、`runtime-inspector`、`runtime-replay`、`catalog-view`、`backup-store`、客户端的 `runtime-flow.js`；依赖里的 `elkjs` 与 `@xyflow/react` 一并移除。
- **刻意保留**：`trace-reducer.mjs`（§4.4 明令不得破坏加载证据 reducer）、`runtime-graph.mjs`、`runtime-alignment.mjs`、`runtime-fingerprint.mjs`——它们仍被 reducer 导入，删掉会让「这次加载发生过」这条证据链断掉。收据失去的是**页面身份**，不是证据。

### 四、守卫：断言今天成立的事实，而不是历史

删完之后 `verify-project.mjs` 的客户端契约里还有 45 条断言在描述已经不存在的界面，其中大多数之所以仍在通过，只是因为那句文案还留在英文字典里（字典项没有消费者，源文本里照样能 `includes` 到）。**一条守卫如果断言一个不存在的页面，它唯一的作用就是拦住删除。** 契约因此重写成 28 条，并且**只在字典之外**成立——`verify-project.mjs` 现在先切掉 `const EN = { … }` 再比对，否则一句死文案就能继续把断言喂饱（实测：`正在读取当前目录…` 早已换成 `正在读取当前环境…`，而断言一直通过，因为死键还在字典里）。同时**反向**钉住那 15 条已删路由与 `buildRuntimeGraph` / `computeRuntimeLayout` / `buildCatalogView`：删掉的东西不该悄悄回来。

**八个标记没有断言撑着，却一直印在输出里。** 底部的 `_OK` 清单是一串裸 `console.log`，第 5 步删断言块时它们留了下来：`CANVAS_BOUNDED_OK`、`ELK_LAYOUT_BOUNDED_OK`、`CONTEXTUAL_INSPECTOR_OK`、`REPLAY_READ_ONLY_OK`、`RUNTIME_FLOW_READONLY_OK`、`GRAPH_FILTERS_OK`、`MY_SKILL_READ_ONLY_CATALOG_OK`、`MY_SKILLS_SLIM_OK` —— 八个名字宣称的契约，对应的界面早就不存在了。**一个没有断言的标记是假的通过**，它比没有标记更糟：`VISUAL_TOKENS_OK` 在 beta.60 就是这样被发现的，同一个坑踩了第二次。八个标记已删除，`CLIENT_DUAL_VIEW_CONTRACT_OK` → `CLIENT_CONTRACT_OK`、`LOCAL_LEARNING_LOOP_OK` → `LEGACY_LEARNING_FIELDS_OK`（它现在断言的是 reducer 仍携带历史字段）。规则写进了文件的注释：**删断言块时，同一次改动里删掉它的标记。**

新增两道守卫：

- `SKILL_FIRST_DETAIL_OK`：三个页面组件必须存在，`SkillWorkbench` 与 `st-skill-item` 必须不存在；详情页切片里禁止任何浏览器存储 API，且必须含 `setTranslation(`。
- `TRANSLATION_MEMORY_ONLY_OK`：`/translate` 的响应路径上不得出现收据、备份、浏览器存储或文件写入。

### 五、三次真实回归，都不是测试先发现的

- **Layout Contract 守卫被误删**：`test/phase11-layout-contract.test.mjs` 是唯一守着「根规则必须在 brace depth 0、高度链禁用视口单位、花括号配平」的测试——beta.63 那个真实事故（根规则被困在 `@media(max-width:1050px)` 里，桌面宽度下 `font-size` 回退宿主 16px、整个 UI 大一号）本身与运行图谱毫无关系。它被删只是因为文件名带 `phase11`。已取回并改名为 `test/layout-contract.test.mjs`，选择器换成 v0.6 的布局层。
- **样式表里的第三块陈旧区域**：`.st-topbar` 被第二条规则覆写成 72px —— 一个 v0.6 设计文档（68px）与 `design.md`（58px 下限）都没有的数字；同一块里还留着 `@xyflow/react` 的两条 `.react-flow__*` 规则、两条没有任何元素使用的 `.st-layout` 规则，以及描述已删画布的注释。顶栏统一为设计文档的 **68px**，守卫也跟着改（原来钉的 72px 是「口口相传」写进代码的）。
- **§25 验收测试抓到两处死重**：`installed-view.mjs` 的 `projectInstalledSkill` 仍在投影 `sourceFingerprint`，客户端零消费者；客户端样式里五个 `--st-*` 定义（`--st-grid` / `--st-edge` / `--st-subagent` / `--st-node-color:#dfe3e9` / `--st-node-width`）活过了第 5 步清扫——那次清的是**死规则**而不是**死值**。其中 `--st-node-color:#dfe3e9` 是硬编码浅色，暗色主题下永远不会跟随，**正是一个没人引用的 token 才没有任何测试能看见它**。新增的守卫遍历所有 `--st-*` 定义，要求每个值要么来自 `--dsw-alias-*`，要么来自另一个语义 token。

## 0.4.0-beta.68 — 2026-10-01 · 两个只在真实应用里出现的升级缺陷：白屏与旧缺省视图

**beta.67 发布后在真实 DSH 里立刻遇到两件事，两件都不是测试能预先抓到的形状。** 测试 407 → 412，静态合同守卫 24 → 26。

### 一、Skill 标签页整片空白：hooks 排在了提前 return 之后

用户报告「对话有加载 skill，但进入 Skill 追踪插件后页面完全是空白，没有任何数据」。用 CDP 连上运行中的真实 DSH 复现：`Trajectory` 标签正常渲染，`Skill Trace` 标签整片空白，console 是 `Minified React error #310` 加上 `slot entry crashed in 'conversation.view'`。

原因在 `src/dsh/client/client.js` 的 `FlowCanvas` 与 `RuntimeView`：`const replay = React.useMemo(...)` 被写在三个提前 return **之后**（`RuntimeView` 的 return 在 2818 行、hook 在 2829 行；`FlowCanvas` 在 2984 / 2994）。第一帧 `loading` 时提前返回、少调一个 hook，数据到达后的第二帧多调一个 hook —— React 抛 #310，slot entry 崩溃卸载，用户看到的就是空白页。

现有两层测试都抓不到它，这也决定了修法：
- `test/client-render-smoke.test.mjs` 的 `useState` 桩永远不会更新，因此只渲染"已经有数据"的那一帧，走不到第二次渲染；
- 渲染台截图同样只截最终帧。

所以除了把 `replay` 上移到提前 return 之前，还补了两道**源码文本层**的守卫——规则本身在文本里可判定，那就别指望运行时：
- `test/client-hook-order.test.mjs` 导出 `scanHookOrder(source)`，两条测试：对真实客户端断言零违规，以及**给扫描本身写反例**（单行 `if (...) return ...` 与花括号换行两种形状都必须被判违规，合规形状必须判 0）；
- `scripts/verify-project.mjs` 的 `HOOK_ORDER_OK` 是同一规则的发布闸门。把 `HEAD` 的客户端放回去，它精确报出 `RuntimeView（提前 return 在第 2818 行，hook 在第 2829 行）; FlowCanvas（提前 return 在第 2984 行，hook 在第 2994 行）`。

修复后在同一台真实应用里复验：console 无 error，正文渲染出运行流程（17 节点 / 13 关系，图里另有 944 个折叠节点）。

### 二、第一屏仍然是运行流程图：旧缺省被当成了用户选择

同一台机器上，插件打开的第一屏是「运行流程」而不是「本次 Skill」。原因是 `~/.dsh/skill-trace/preferences.json` 里存着 `{"defaultView":"map"}` —— 那是 beta.66 的**缺省**第一屏，但写进文件后与"用户主动选择了运行地图"完全无法区分。beta.67 虽然把新装默认改成了 `skills`，却原样尊重了这个历史值，于是升级用户永远看不到新的第一屏（在没有运行证据的会话上，那甚至只是一句居中的灰字）。

意图无法从一个从没记录它的文件里恢复，所以改为**记录**：

- `src/storage/preference-store.mjs` 增加 `PREFERENCES_VERSION = 2`。**读**的时候只有带当前版本号的偏好才算"用户选择"，无版本号的一律归一到 `skills`；**写**的时候一定盖上新版本号，用户当下选的 `map` 照旧保留。`test/preference-store.test.mjs` 里「无版本号的 map 归一到 skills」与「有版本号的 map 是选择且幸存」是一对反例。
- `src/dsh/client/client.js` 增加 `PREFERENCE_VERSION = 2`，只采用宿主给的同版本偏好。这样**旧宿主**（响应里还没有 `version` 字段）与**新宿主**都能得到正确结果，不必等宿主重启——宿主入口只在启动时 import 一次，这一点很关键。
- `scripts/verify-project.mjs` 新增 `PREFERENCE_VERSION_OK`：两处常量必须相等。不一致不会抛错，只会静默地把第一屏换回旧 IA。
- 还有一处更隐蔽的盲点：渲染台在没给 `?view=` 时会**自己往 localStorage 写一个 `map`**（`entry.js` 里的 `params.get('view') || 'map'`），于是历史截图全都自带一个本地选择，把"宿主给的旧偏好要不要被尊重"这条路径整个盖住了。现在不给 `?view=` 就什么都不写，并新增 `?prefVersion=2` 复现"用户在新版里主动选了运行地图"——两种偏好各截一张，行为必须不同。

复验：真实应用 reload 后第一屏是「Skills in this run」三栏——左栏 `ui-craft` / `Run #9` / 仓库未解析，中栏 4 张步骤卡，右栏 SKILL.md 与 Evidence，console 无 error。

### 三、目录改名与知识管理同步（无代码改动）

**目录**：项目目录由 `DSH_Skill_Trace` 改名为 `10_DSH_Skill_Trace`，并在旧名处留一个**相对软链接**，
使已装的插件软链接（`~/.dsh/profiles/*/node_modules/dsh-skill-trace`）与会话历史的路径继续解析。
npm 包名 `dsh-skill-trace` **不变**。`docs/RELEASE.md` 第 0 步的 `cd` 路径随之更新。

**文档**：一次知识管理同步，改掉与现实不符的陈述：

| 文档 | 滞后内容 |
|---|---|
| `docs/RELEASE.md` | 「当前待发布版本」停在 `0.4.0-beta.66`，提交 / tag / push / `gh release` / 安装示例全是那一版；行为探针也还是 beta.66 的 `/skill-trace/definition`（改为 beta.67 才有的 `/skill-trace/skills`，附实测返回） |
| `README.md` | 版本历史只写到 `beta.66`，缺 `beta.67`（Skill-first IA）与 `beta.68` |
| `docs/ARCHITECTURE.md` | 「默认视图」一节仍写「`map` 保留，因为选运行地图是刻意行为」——正是 beta.68 修掉的那条；补上偏好版本表、两个端点的信封契约、hooks 顺序这条渲染合同 |
| `design.md`、`README.md` | 各有一处「完整架构见 `01_重构方案/…`」，而该目录被 `.gitignore` 排除，对读者是死链 |
| `04-product-requirements.md` | 头部「工程发布候选」仍写 `0.4.0-beta.3` 并称「公开试用版仍为 `0.3.0-beta.1`，未执行发布或推送」；`FR-UI-007` 与 `DEC-08` 只提 `receipt` 归一化，漏了无版本号的 `map` |
| `docs/PRIVACY.md` | 从没写清偏好文件里存的是什么（现补：只有 `version` 与 `defaultView` 两个字段，无会话标识） |
| `99_归档/README.md`（本地目录，不随仓库发布） | 「仍在根目录的活文档」表里还列着 `07-adversarial-review.md`，而它自己就躺在这个归档目录里；另补一条维护约定——**公开文档不得把非公开目录写成「见 …」的来源** |
| `docs/RELEASE.md` §7.2 | 验收层次由四层改为五层，并写明渲染台的两个盲点（自带 `?view=` 默认值、只截最后一帧） |

`design.md` 另加 §19 缺陷修订记录：第一屏不得被旧缺省夺回；以及「一个组件崩了，整屏就是白的」——
`conversation.view` 的 slot entry 没有错误边界，所以 §3 的状态 Gate 原则同时是一条渲染合同。

无代码改动，测试与守卫数不变（**412 / 26**）。`0.4.0-beta.68` 因此**仍未发布**：
文档已就位，剩下的是推送、打 tag 与 npm 发布。

## 0.4.0-beta.67 — 2026-10-01 · Skill-first 信息架构：第一屏从运行流程图换成「本次 Skill」

**这是结构性重构，不是加第四个视图。** 测试 382 → 407。

### 一、为什么要把第一屏翻过来

此前打开 Skill 追踪，第一眼是「运行流程图」——一个需要先理解 Turn / Invocation / 节点折叠规则才能读懂的对象。
而用户打开这个插件时真正的问题是：**这次对话到底用了哪些 Skill？它们各自声明了什么、又实际拿到了什么证据？**
流程图回答不了这个问题，它只在你已经知道「在找哪个 Skill」之后才有用。

所以第一屏改成**本次对话加载过的 Skill 列表**，导航收敛成两段：「本次 Skill」与「我的 Skill」。
运行流程、运行图谱、Skill 收据一并收进顶栏的「高级 ▾」——仍然可用，但降级为高级视图，不再与 Skill 平级。
验收标准写死为一句：**如果用户必须先理解运行模型才能理解 Skill，则 Skill-first 尚未完成。**

### 二、Skill 详情的三栏

| 栏 | 内容 |
|---|---|
| 左 | 本次加载的 Skill 列表（名字 + 描述 + `N 次加载 · 时间 · 定义状态`）、该 Skill 的运行记录、仓库来源（解析到就给出相对路径与 clone 命令，解析不到只显示「仓库 · 未解析」） |
| 中 | Skill 头部 + **声明流程**：start pill、连接线、编号步骤卡（步骤标题、声明类别、运行时证据、定义来源、证据徽章）、图例；流程为空时给出解释句而不是空白 |
| 右 | 两个常驻挂载的面板，用 `data-active` 切换：**SKILL.md**（原文渲染 + 目录锚点 + 700ms 高亮）与 **证据**（声明 / 关系 / 运行时证据 / 定义来源 / 指令指纹比对 / 当时目录中的候选） |

三栏仍在插件自托管的容器内（DSH 的左右栏是 single 且已被占用，不能新增第二条侧栏），
断点与设计 demo 一致：1180px 收窄两侧，980px 收起证据栏，再窄则连同定义目录一起收起，只留声明流程。

### 三、方向不可逆

声明流程**只能**来自定义正文：由 `SKILL.md` 的标题层级与有序列表确定性抽取（`src/core/skill-flow.mjs`），
不经过任何模型、Embedding 或检索；运行时证据只往步骤上挂标注，既不增删步骤也不重排步骤。
代码结构把这条方向写死了：`skill-flow.mjs` 不认识任何运行时对象，`skill-view-model.mjs` 只做组合，
客户端只渲染不推理。`scripts/verify-project.mjs` 因此新增一条守卫：`runtime-alignment.mjs` 必须包含
`scanDeclaredSteps`——**收货路径与定义路径共享同一个扫描器，不允许各自留一份「声明步骤」的定义**。

### 四、证据词表收敛为五值，界面只做投影

底层关系仍然是 `runtime-supported` / `intent-supported` / `partial` / `insufficient` / `unknown` 五个值
（`observed` 在 `5d25871` 被刻意移除——它读起来像「运行时观察到了这一步」，而运行时从未这么说）。
界面只做投影：`runtime-supported` →「运行时支持」，`intent-supported` 与 `partial` →「部分支持」，
`insufficient` 与 `unknown` →「证据不足」。徽章少一个值，但每一个都不撒谎。

### 五、三条硬规矩

1. **不伪造 Run 标识**：载荷里刻意不存在 `runId` 字段，Run 由会话内的加载事件标识（`runKey === eventId`）。
2. **指纹三态**：`match` / `mismatch` / `unavailable`。任一侧缺失就是 `unavailable`——**绝不把「无法比对」写成「文件已改变」**，两者对用户的含义完全相反。
3. **仓库来源可解释**：只可能来自 frontmatter、git origin 或用户配置；带凭据的 remote 整条拒绝而不是剥离后展示；猜不到就显示未解析，不造链接。

### 六、顺手修掉的五个真实缺陷（都由真实数据或渲染台截图先发现）

| # | 位置 | 缺陷 | 后果 |
|---|---|---|---|
| 1 | `src/dsh/client/client.js` 的列表请求 | 宿主把列表套在 `list` 里和 `sessionId` / `workspaceLabel` 一起返回，客户端却按顶层读 `list.skills` | **第一屏在真实数据下永远是空的**。单元测试走注入的 `suppliedList`、接口测试只看服务端，双双为绿——是渲染台用真实客户端 bundle + 真实会话载荷截图时暴露的。现已在 `verify-project.mjs` 里加一对断言把两端同时钉住 |
| 2 | `src/core/skill-flow.mjs` 的 `splitOrdinal` | 只认以数字开头的标题 | 真实 Skill 最常见的写法 `### Step 1: …` 整段抽成空。现在同时认 `Step N` / `Phase N` / `Stage N` / `第 N 步`（前缀后必须真跟数字，`Step by step guide` 不会被误判） |
| 3 | 同文件的 level-2 分支 | 用**剥掉编号后**的标题判断这是不是流程节 | `## Phase 2 — Runtime` 被剥成 `Runtime`，「Phase」消失，这一节的子标题全部落空。改为用原始标题判断 |
| 4 | 客户端 limitation 码表 + 工具栏 | 码表写的是 `no-git-work-tree`，宿主实际发 `no-git-work-tree-found`；同时工具栏右侧的状态 chip 在长描述旁被压缩成竖排单字 | 界面直接显示裸代码；「定义可用」被竖着排成四行。已补齐码表（含 `repository:` 前缀与 `…-remote` 后缀族的规则匹配），并给工具栏动作区加 `flex:none` |
| 5 | `src/dsh/client/client.js` 的第一屏状态判定 | 「拉不到列表」和「宿主说列表是空的」被当成同一件事 | 升级窗口里必然出现：新的客户端先落地、旧的宿主进程还在跑，`/skills` 直接 404，于是正文写「当前对话暂未加载可追踪的 Skill」，而同一屏的页头正按收据数着「1 个 Skill · 1 次加载」——**两张嘴在同一屏上互相打脸**。已抽出 `resolveSkillListState()`，拉不到时说明原因（含收据已知的数量）并给出「重启 DSH」的出路与重试按钮；真的空列表才走空态 |

另外，`test/phase3-alignment.test.mjs` 新增 4 个抽取回归测试，锁住 `Step N` / `Phase N` / `第 N 步` / `Step by step` 四种写法。

### 七、验收

- `node --test` → **407 项全绿**（含新增的 Skill 优先信息架构 19 项、定义视图 25 项）。
- `node scripts/verify-project.mjs` → 24 个静态合同 marker 全 OK。
- 渲染台（真实客户端 bundle + 真实会话载荷）逐张核对：首屏、详情、证据面板、步骤锚定、高级下拉。
- **仍未覆盖**：DSH WebView 内的人眼确认。宿主不会热加载 host 入口，`/skill-trace/skills` 与 `/skill-trace/skill` 要等宿主重启后才存在，因此这一步留给发布会话。

## 0.4.0-beta.66 — 2026-09-30 · Skill Definition Viewer：第四个视图 + 证据链路修复

**这是新功能，也是三处静默降级的修复。** 测试 345 → 382。

### 一、证据链路的三处静默降级（此前「测试全绿」也照样发生）

上一版把 `observed` 从对齐词表里移除之后，有 5 个测试红了。红得对——但真正的问题不是那 5 个断言，
而是**它们背后的链路有三处在静默丢数据**，任何一处单独看都「工作正常」：

| # | 位置 | 缺陷 | 后果 |
|---|---|---|---|
| A | `src/core/skill-runtime-scope.mjs` 的 `makeScope()` | 构造 `observedEvents` 时只拷贝 8 个字段，漏掉 `evidenceType` / `evidenceCategory` / `evidenceSpecific` / `modelIntentPresent` | 下游 `scopedRuntimeEvents()` 读这四个字段全是 `undefined`。`npm test` 因此永远落不到 `test` 类，被降级成裸能力 |
| B | 同文件的 `indexByTurn()` | 凡 `!Number.isSafeInteger(event.turn)` 就丢弃事件 | **所有 `tool/result` 的 `turn` 都是 `null`**，于是结果事件永远进不了 Scope，`resolution` 恒为 `unresolved-request`——Scope 从来看不到 `success` / `failure` |
| C | `src/core/runtime-alignment.mjs` 的 `alignStep()` | `matches.length === 0` 时直接返回 `insufficient` | 声明写「Inspect the project structure」（inspect），运行时是 `bash`（execute），kind 不匹配即判证据不足，**「模型确实表达了这一步意图」这个事实根本没机会被汇报** |

**A 与 B 的修法**：A 补齐字段；B 重写为两遍——第一遍收集带 turn 的事件并建立 `invocationId → turn` 映射
（同一 invocationId 落在两个 turn 时记为歧义），第二遍把无 turn 但能**唯一**映射到某 turn 的事件并入该 turn。
这不是「按时间就近补全」：`invocationId` 是宿主自己给出的 request ↔ result join，属于宿主事实。

**C 的修法**：把步骤分类规则抽成独立模块 `src/core/step-kind.mjs`，由声明侧与运行侧**共用同一份规则表**；
`modelIntent` 从「只记一个布尔」改为「布尔 + 步骤类别」。两处文本只在**类别层面**比较，
描述原文永不外泄、永不落盘。`STEP_KIND_RULES` 的 inspect 分支补上 `confirm|check|确认`——
否则「Confirm the working directory」会落到 `other`，intent 通道永远打不通。

修复后实测：同 Turn 内加载 Skill + `bash npm test`，得到
`bash kind=cli resolution=matched status=success category=test specific=true intentKind=inspect`，
此前是 `resolution=unresolved-request status=requested category=null`。

### 二、证据词表收敛为 5 值 + 一张唯一映射表

`observed` 被刻意移除（它读起来像「运行时观察到了这一步」，而运行时从未这么说）。
规范词表是 `runtime-supported` / `intent-supported` / `partial` / `insufficient` / `unknown`。
UI 徽章只做投影：

| 关系 | 徽章 |
|---|---|
| `runtime-supported` | Runtime-supported |
| `intent-supported` | Intent-supported |
| `partial` | Partial |
| `insufficient` / `unknown` | Insufficient |

同时**明确禁止两个读法**：`correlated` 不得升格为 `runtime-supported`（这正是 `beta.65` 修的东西）；
`scored: false` 不得被读成「评分为 0」。客户端此前读的是已被删除的 `alignment.stats.observed` 键，
界面渲染 `observed undefined` 并**静默漏掉两个真实档位**，本版一并修正。

### 三、Skill Definition Viewer（新的第四个视图）

前面几个版本一直在「运行时发生了什么」，这个版本补上「Skill 自己声明了什么」。
三栏结构对齐设计 demo（`grid-template-columns: 286px 1fr 410px`，
断点 1180px → `250px 1fr 350px`、980px → `220px 1fr` 并收起右栏）：

- **左栏**：当前 Skill 卡 → 运行记录（每次加载一条，标 `model` / `/name`）→ SKILL.md 目录（可折叠）→ 仓库来源卡
- **中栏**：声明流程。start pill → 连接线 → 编号步骤卡，每张带证据徽章与声明类别 / 运行时证据标签；底部图例三档
- **右栏**：双 Tab。`SKILL.md` 渲染定义原文（标题降一级避免第二个 `<h1>`；围栏代码块里的 `#` 不当标题）；
  `证据` 面板给出 声明 / 关系 / 运行时证据 / 定义来源 / 说明 / 边界声明。**两个面板常驻 DOM、只由 CSS 切显隐**，
  切 Tab 不再丢失文档滚动位置

交互：点步骤 = 选中 + 切到证据面板 + 在文档里定位并高亮 700ms；点目录项 = 切回文档 + 滚动 + 高亮。

### 四、新增模块与端点

| 模块 | 职责 |
|---|---|
| `src/core/step-kind.mjs` | 步骤类别规则表（声明侧与运行侧共用；避免 `runtime-alignment → runtime-events → runtime-evidence` 循环依赖） |
| `src/core/definition-outline.mjs` | frontmatter 解析 + ATX 标题目录（含行号）+ 步骤→目录锚点（按行号包含关系，不按文本相似度） |
| `src/core/repository-resolver.mjs` | 仓库来源解析：frontmatter → git work tree（有界上溯 12 层，只读 `.git/config` 的 `origin` url）→ 不可用 |
| `src/core/skill-definition.mjs` | Definition 视图组装 + 「本次运行看到的定义」与「现在读到的定义」的指纹比对 |

`GET /skill-trace/definition?sessionId=&skillName=` 返回定义原文、目录、资源基与仓库来源，
以及三态比对结论 `match` / `mismatch` / `unavailable`（只有一侧存在哈希时是 `unavailable`，不是温和版的 `mismatch`）。

**边界（硬约束）**：定义正文**永不落盘、永不进收据**，只在活会话上现读现返；
`resourceBase.path` 是绝对路径，**只暴露 `kind`，不暴露路径**；
凭据型 remote（`https://user:token@…`）**整条拒绝**，不剥离、不半显；
`.git` 找不到时判 `unresolved`，**不用目录名猜**。

`<skill_content>` 外壳**无法在插件内复现**：`src/` 里没有任何 `@deepseek-ai` 运行时 import，
`renderSkillContent()` 拿不到。该层因此显式报告为 `rendered-envelope-not-reproducible-outside-the-harness`，
而不是自己拼一个看起来像的。

### 五、文档高亮改为 Token，并补上颜色守卫

文档高亮最初照抄 demo 的 `#fff8d8`。它是浅色值，暗色主题下浅底浅字不可读，
于是不得不补一条 `body[data-ds-dark-theme]` 覆盖来救它——**那条覆盖本身就是这个 bug 的证据**。
现在改为 `--st-highlight: color-mix(in srgb, var(--st-warning) 22%, var(--st-layer))`，
两种主题各算各的底色，覆盖随之删除。

顺带清掉 7 处既有的硬编码颜色，其中 `.st-tag[data-tone="ok"]` 有重复两行、
后一行把前一行的 token 写法**静默覆盖**成了死代码。

`scripts/verify-project.mjs` 新增扫描：`:root` 的 token 定义之外出现 `#hex` / `rgb(` / `hsl(` 即失败。
**`VISUAL_TOKENS_OK` 这个标记此前是无条件打印的，背后没有任何检查**——这条扫描是它第一次被真正兑现。

### 六、渲染冒烟测试从「数节点」改成「断言内容」

原来的断言是「注入 definition 后多出 200 个以上节点」。它只能证明某分支执行了，**证明不了执行对了**。
现在断言实际内容：标题成为标题元素、围栏代码块里的 `#` 不成为标题、`**bold**` 不留星号、
非 `http(s)` 链接退化成纯文本、目录清单正好停在 40 条、未解析仓库不造链接也不留禁用态占位、双 Tab 面板恰好两个。

改这一处时查出测试桩一个一直没人发现的缺陷：locale 桩返回 `{ lang: 'zh' }`，
而契约是 `active: LocaleId`。客户端读 `active` 读到 `undefined` 就退回 `'en'`——
**这个桩一直在悄悄渲染英文，写法看上去却是在渲染中文。**

### 七、SDD 文档

本地规划文档（`.gitignore` 排除，**已于 2026-10-02 随文档清理删除**）新增 §0.4 实施落地记录与
§0.5 验收收口表，§11.9 的 demo 一致性十二条、§16 的五组验收条目全部通过并勾选。

---

## 更早的版本（0.4.0-beta.64 及以前，共 61 个条目）

这一段历史已经从本文移除：它记录的是 Runtime Flow 方向与 `0.4.0-beta` 时期的过程，那个方向已经在 v0.6 整体删除。要查那段时间的改动，用 git：

```bash
git log --oneline v0.5.0                 # 这一版之前的所有提交
git show <sha>                           # 单个提交的完整改动
git log -p -- CHANGELOG.md               # 本文自身的历史
```

**上面保留的是从 `0.4.0-beta.66` 起**的条目——那是 npm 上公开过的最后一个版本，也是 `v0.5.0` 包含的内容的起点。

> **关于历史条目里的 `01_重构方案/...` 路径**：那批本地规划文档（V5.0 / Skill-First-IA 两版 SDD、Runtime Flow 的 HLD 与 SDD、治理文档、选型验证等）**已于 2026-10-02 随文档清理整体删除**，因为它们描述的对象已经从产品里移除。本文历史条目里对它们的提及是当时的记录，不代表这些文件还在。
