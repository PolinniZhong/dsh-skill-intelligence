# Changelog

## 0.6.1 — 2026-10-01 · `SKILL.md` 面板不再被框架层压成 2px

**一次客户端补丁。** 信息架构、宿主接口、路由数量都没动：一级页面仍是「本次 Skill」「已安装 Skill」，二级页面仍是唯一的 Skill 详情，四层顺序仍是 框架 → 本次运行逻辑 → 步骤证据 → `SKILL.md`。发布范围与 `0.5.0` / `0.6.0` 相同：**只发 GitHub，npm 仍停在 `0.4.0-beta.66`**。

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
