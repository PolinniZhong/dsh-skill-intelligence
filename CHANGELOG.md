# Changelog

## 0.4.0-beta.36 — 2026-09-28 · 批次 E：并排对照图 + 修正我自己改错的地方

### 补上缺失的交付物：preview vs 实现并排对照图

`01_重构方案/render-harness/shots/compare/对照-{flow,receipt,graph}.png` —— 上 preview、下实现，同一状态、同一工具、同一尺寸。

**它第一次让"差异"变成可看的东西，也立刻抓出两个问题。**

### 修正：图例位置我上一轮改反了

上一轮我把图例从右上移到左下，理由是"preview 在左下"。**对照图证明 preview 在右上。** 已改回右上。

这正是为什么需要并排对照：单看实现截图，我没有依据判断哪个位置对。

### 修正：节点面板用了连线的话术

选中一个**节点**时，面板里写的是「**这条线**为什么存在」——连线的措辞用在了节点上。按类型分开：

- 节点：「它为什么在这里」
- 连线：「这条线为什么存在」

### 对照图暴露的**尚未处理**的差异

| 差异 | 说明 |
|---|---|
| **画布缩放** | 实现 40 节点的布局 1650px 宽，`fitView` 缩到约 60%，文字不可读；preview 11 节点在 100% 下清晰 |
| **画布工具栏** | preview 是左上**横排**并显示 `100%`；实现是**竖排**（React Flow 默认），无百分比 |
| **Inspector 未选择态** | preview 默认就有完整面板（运行摘要 / Runtime 关联 / 当前说明）；实现的未选择态只有一行提示 |
| **Inspector 选中态** | 实现有内容，但信息层级比 preview 薄（preview 有 label/value 的运行摘要与带状态标签的 Runtime 关联表） |

### 渲染台改进

节点点击改为**真实鼠标事件序列**（pointerdown → mousedown → pointerup → mouseup → click）——React Flow 的节点点击走 React 合成事件，只派发原生 `click` 不触发。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.35 — 2026-09-28 · 批次 D：骨架与页头对齐 preview

审计里影响最大的一项（S1–S4）。

### 页头改成 preview 的模式

| | 改前 | 改后（= preview） |
|---|---|---|
| 标题 | 「本次 Skill 使用记录」 | **「本次运行」**（preview 的措辞）+ 一行上下文 |
| 中段 | 「我的 Skill」按钮 + 分隔线 + 「当前会话」标签 + 视图切换混在一行 | **只有分段视图控件**（Skill 收据 / 运行流程 / 运行图谱） |
| 右段 | 只有刷新 | **页级动作**（显示全部 / 适配画布 / 回放）+ 我的 Skill + 刷新，`margin-left:auto` 靠右 |
| 「当前会话」 | 一个可见标签 | 移除——上下文由 h1 + 副标题承担（§5.1：它不该是按钮） |
| 「我的 Skill」 | 与三个阅读模式并列 | **移到右侧动作区**（跨会话入口与阅读模式不是同级关系） |

### 图例位置

从右上移到**左下角**（对齐 preview）；右上留给画布控件。

### 一处需要说明的观察

流程图布局在 40 节点下是 **1650×921px**，宽于 preview 的 930px，所以 React Flow 的 `fitView` 会缩到约 62%，节点上的 10.5px 文字随之不可读。

**这不是渲染缺陷**——探针确认 DOM 正常（40 个节点、`opacity=1`、`background:#fff`、宽 190px）。它说明的是：**流程图的宽度仍大于阅读所需的宽度**，用户需要「适配画布」或横向平移。preview 只有 11 个节点，所以它的 1360px 舞台在 100% 下刚好放得下。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.34 — 2026-09-28 · 批次 C：画布收尾 + 还清 beta.31 的遗留缺陷

### 画布（审计 C5/C6/C8）

- **补图例**：左下角 `Skill / Tool / MCP / CLI`，色点与节点类型色同源（C5 关闭）
- **移除 MiniMap**：preview 没有这个元素；改为默认不画（C6 关闭）。需要时仍可用 `showMiniMap` 打开
- **点阵底纹**：保留为**功能网格**（按你的裁定豁免 §25.2），但把颜色从 `#e2e8f0` 降到 `#dfe4ea`、间距 18→20，保持低对比（C8 关闭）
- **画布控件移到左上**：preview 的工具栏在左上，原先在右上

### 还清 beta.31 的遗留缺陷

beta.31 我移除了收据里包住 `Aside` 的**外层包装**，但 `Aside` 组件**自身**仍渲染「我的理解与迭代」——所以学习表单**一直在收据里**。

这次真正移除了 `Aside` 的渲染块（3730 字符），并用渲染台确认：收据底部已从「我的理解与迭代」变成「继续方式判断」。

### 顺带修正一个名不符实的标题

收据最后一节的标题写着「学习与验证」，**实际渲染的是「继续使用指南」**。改为「**继续方式**」，注解改成它真正的内容（「候选步骤与人工判断；不是对开发者的反馈」）。

### 本批**未**完成

- **骨架与页头**（S1–S4）——影响最大的一项，仍未开始
- **连线语义**（E1：灰/蓝/红/虚线四类）
- **收据结构**（R1–R5：4 步箭头活动条、Skill 卡、5 列空栅格、外框卡片）
- **回放条**（P1/P2：常驻 → 仅回放时出现）
- **hover / active / focus / 过渡**
- 渲染台交互态（聚焦 / 回放 / 筛选 / Loading / Error）

`Aside` 里还留有已不再使用的学习状态与处理器（死代码），待后续清理。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.33 — 2026-09-28 · 批次 B：节点视觉对齐 preview

按 `06-视觉差异审计.md` 的清单，处理**节点视觉**（C2–C6）与连带发现的排序缺陷。

### 节点重做为 preview 的结构

| | 改前 | 改后（= preview） |
|---|---|---|
| 结构 | 左侧色条 + 标题 + 元信息两行 | **顶部类型色条 → 图标 + 标题 + 类型 → 正文 → 页脚** |
| 图标 | 无 | **28px 圆角方块**，类型名首字符，底色是该类型的 12% 混色 |
| 圆角 | 6px | **11px** |
| 阴影 | `0 1px 2px` | **`0 4px 12px rgba(23,33,48,.045)`**，hover 加深为 `0 7px 18px` |
| 宽度 | 按类型 176–300px 不一 | **统一 190px** |
| 页脚 | 无边框 | **上边框 + 状态点 + 右侧计数** |

宿主侧 `KIND_SIZES` 同步为统一 190×115；`ROW_HEIGHT` 30→115、`MAX_ROWS_PER_COLUMN` 26→7 —— 节点变高后行距必须跟着走，否则节点互相重叠、画布超长（这一条是测试先抓到的）。

### 修掉一个渲染才暴露的排序缺陷

Turn 区间按 **id 字符串**排序，于是 `turnrange:12-14` 排到了 `turnrange:5-8` 前面——读者看到的是乱序的 `1-4, 12-14, 15-18, …, 5-8, 9-11`。改为按**起始 Turn 号**数值排序。

改后列读为：`Turn 1–4 → 5–8 → 9–11 → … → 22–24` / `25–27 → … → 39–39`。

### 本批**未**完成

审计清单里的其余项仍未开始：**骨架与页头**（S1–S4）、**图例**（C5）、**底纹**（C8）、**MiniMap 移除**（C6）、**连线语义**（E1）、**收据结构**（R1–R5）、**剥离学习表单**（beta.31 遗留缺陷）、**回放条**（P1/P2）、**hover/active/focus/过渡**。

渲染台的交互态（聚焦 / 回放 / 筛选 / Loading / Error）也未补齐。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.32 — 2026-09-28 · 批次 A：渲染台 + 画布阅读密度

### 建起了「能看见真实插件」的渲染台（本批最重要的产出）

此前所有「视觉对不对」的判断都只能靠人眼看真实界面——插件跑在 DSH Desktop 里，无头浏览器打不开那个 URL。现在有了 `01_重构方案/render-harness/`：

- 加载**真实的 `dist/client.js`**（与宿主给浏览器的是同一个文件）
- 走**真实的注册路径** `__ModuleLoader__ → factory(require) → apply(ctx)`
- 喂**从运行中宿主抓下来的真 payload**（无一处手写示例）
- 与 preview 用**同一个 headless shell** 截图，可比

审计结果见 `01_重构方案/06-视觉差异审计.md`。**结论：真实插件与 preview 是结构性差距，不是打磨差距。**

### 画布阅读密度（§20.1/§21）

审计发现最严重的一项：一个真实会话（39 Turns / 644 Steps）在运行流程里渲染 **195 个节点**，铺成一面线条墙。

| | 节点 | 关系 | 高度 |
|---|---|---|---|
| 改前 | **195** | 297 | 1036px |
| **改后** | **40** | 45 | **580px** |

- `FLOW_NODE_LIMIT = 40`（运行流程按**阅读密度**定预算，不再用硬上限）
- `FLOW_TURN_LIMIT = 12`（Turn 列按区间折叠；39 个 Turn 若不折叠仍是一根 34 行竖条）
- `turnNodeLimit` 成为 `computeRuntimeLayout` 的可配项
- 运行图谱保持 400 预算 → **§21 的两种密度现在是真的**：Flow 40 节点一屏读完，Graph 195 节点供底层排查

改后 Flow 的分层为 `0:1 / 1:12 / 2:13 / 3:14`，读起来是 `会话 → Turn 区间 → 能力 → 调用`。

### 本批**未**完成（诚实交代）

第 (2) 步「按 preview 对齐实现」只做了**画布阅读密度**这一项。审计列出的其余项——骨架与页头、节点尺寸/圆角/边框/阴影/图标、图例、底纹、连线语义、收据结构、剥离学习表单、回放条、hover/active/focus/过渡——**尚未开始**。

渲染台的交互态（聚焦 / 回放 / 筛选 / Loading / Error）也未补齐。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.31 — 2026-09-28 · 批次 I1：回改三处偏离与统一 Token

按 §47.5 执行，三项冲突均选 A。

- **§15 Skill 的 Inspector Tab 归位**：`[运行证据][关联关系][声明 ↔ 实际]` → **`[运行证据][声明 ↔ 实际][学习验证]`**。「关联关系」是侧栏时代的遗留，§38 把学习定为二级任务，它需要一个自己的位置。
- **§15/§38 学习表单移入 Inspector Tab**：不再出现在收据流里（冲突②选 A），并且**默认收起**。新建 `LearningPanel`。
  - 它去掉了原侧栏的「选择哪个 Skill」下拉——Inspector 本来就针对当前选中的 Skill，这正是 Contextual 的意义。
  - 切换 Skill 时重新装载该 Skill 已保存的内容，不把上一个的草稿带过来。
- **§25.3 配色 Token 统一**：9 个 `--st-*` 回退值（底色、层级色、两级边框、三级文字、品牌、错误）＋ 5 个类型色（skill/tool/mcp/cli/error）对齐 `preview.html` 的值。宿主 Token 仍优先，改的是回退值。
  - 例：`skill #7c3aed → #7057df`、`brand #3567d6 → #2f6fed`、`border rgba(22,27,36,.14) → #e4e7ec`。
- **一处记录更正**：§47.5 曾把「布局」列为偏离，**该记录有误**。`.st-flow` 一直是 `1fr 330px`（§26 的 300–340 带内），`RuntimeInspector` 始终渲染且已有未选择态；我改的单列只作用于收据页，那里本就不需要 Inspector。**布局无需回改。**
- **测试**：`LearningPanel` 加入真实渲染冒烟测试（四种形态），并验证该层有效——让它渲染期抛异常，冒烟测试确实失败。两个旧断言按治理要求更新（Skill Tab、学习位置）。
- **293 项测试通过**，**23 项契约检查通过**。

## 需求修订轮（无代码变更，2026-09-28）

对照 `01_重构方案/preview.html`（Runtime Flow 视觉与交互基准）复核 `dsh-skill-trace-Design-Refactor-Governance.md`，修订其缺失、冲突与过时项；按 §3/§32 边界修订 preview。详见该文档 **§47 需求修订**。

**对 beta.15–beta.30 记录的修正**：此前把这一轮记为「开发完成并通过验收」，该表述不准确。三点更正：

1. **验收只覆盖功能与数据层**，不包含视觉工艺。视觉观感（布局 / 配色 / 密度 / 字体层次）经人工查看后评价为「一般」，尚未达到 §43 的最终视觉目标。
2. **实现与治理文档存在三处偏离**，此前未记录：
   - 布局：实现改为**单列、无固定 Inspector**；§6.2/§14 要求**画布 + 固定 340px Inspector**（未选择时显示「当前运行说明」）。
   - Skill 的 Inspector Tab：实现为 `[运行证据][声明 ↔ 实际][关联关系]`；§15 要求 `[运行证据][声明 ↔ 实际][学习验证]`。
   - 学习表单位置：实现放进**收据流**；§15/§38 要求是 **Skill Inspector 的 Tab**（默认收起）。
3. **配色未按统一 Token 实现**：实现使用 `skill:#7c3aed`、`tool:#047857`、`mcp:#b45309`、`cli:#475569`、`error:#b91c1c`，而 §25.3（自 preview 补齐）规定 `#7057df` / `#258b63` / `#d67b2d` / `#5b6573` / `#c9444f`。

**本轮不改代码。** 待 §47.4 的三项冲突确认后再进入开发。

## 0.4.0-beta.30 — 2026-09-28 · Design Refactor（本轮治理收尾，§45）

本轮把 `dsh-skill-trace` 从「数据管理式界面」治理为「开发者 Runtime Explorer」，覆盖 `01_重构方案/dsh-skill-trace-Design-Refactor-Governance.md` 的全部实施范围。该治理文档已标记 **implemented**，稳定规则已合并回 **`design.md` v2.0**。

**主视觉的变化**：从 Skill 收据数据块转移到 **Runtime Flow（运行流程）**。收据仍存在，但降为同一批证据的另一种阅读方式。

### 分阶段交付（15 个版本，逐批发布并验收）

| 阶段 | 内容 |
|---|---|
| P0 前置 | 历史会话运行证据恢复——会话不在内存时从会话日志重建运行事件（多帧 zstd 解码） |
| P1 | React Flow + ELK.js 可行性验证 → 客户端构建产物 → 信息架构 → Runtime Flow 画布 → 宿主侧 ELK 层内排序 |
| P2 | Contextual Inspector（随选择变化）+「声明 ↔ 实际」（复用 runtime-alignment，无评分） |
| P3 | 运行回放：逐节点步进，非自动播放动画；纯读操作 |
| P4 | Skill 收据治理：去编号圆、章节化可折叠、学习与验证移入收据流并默认收起 |
| P5 | 运行图谱治理：类型筛选 + 主路径 + 失败/重试；统一到单一渲染器（两种密度） |
| P6 | My Skills 减重：去营销化外壳、标题回到页面尺度 |
| P7 | 视觉 Token 统一：字号带、去毛玻璃、圆角上限、分隔线优先 |
| 收尾 A | §38 学习区默认收起、§13 回放同时给图谱、§22 显式「显示全部事件」 |
| 收尾 B | **§8/§35 五层模型**：新增 Capability / Result / Error 节点类型；Capability 与 Tool 分离 |
| 收尾 C | **§31 Runtime Fingerprint 预留结构**：六个 Pattern 位置已定，全部标注「尚未派生」 |
| 收尾 D | **§36 聚合阈值对齐**（Node>30 / Edge>50），并与 §20.1 的逐 Turn 折叠分离 |

### 实测

- **293 项自动化测试**，**23 项宿主契约检查**；
- 45 个真实会话：37 个进入聚合，**最大渲染 200 节点**，**画布高度 ≤1036px**，五层（0–4）全部出现；
- ELK 覆盖 39/56 会话，中位 10ms；
- 已装副本与已发布 commit 逐个 sha256 一致。

### 与治理文档的偏离（已获批准）

§34 建议 React Flow + ELK 均在客户端；实际为 **React Flow 在客户端、ELK 在宿主侧**。实测 ELK 自带坐标在真实 1095 节点会话上产出 4804×4937 的竖条，与 §20/§36 的意图相反；因此 ELK 只负责层内交叉最小化，几何由宿主侧换行放置器保证。

### 未实施

§40「本轮明确不做」的全部项目；§33 `src/ui/` 组件化（文档允许渐进）。

### 一个值得记下的教训

这批工作里有 274 项测试通过、21 项契约检查通过，**而插件面板是空白的**：一个 `useMemo` 引用了同函数更下方声明的变量，每次渲染都在暂时性死区抛异常，React 没有错误边界，整棵树卸载。源码字符串断言**看不见渲染期异常**。已补上真实渲染冒烟测试（`test/client-render-smoke.test.mjs`），并验证它确实能抓到该缺陷。

## 0.4.0-beta.29 — 2026-09-28

收尾批次 C + D：**§31 Runtime Fingerprint 预留结构**与**§36 聚合阈值**。

- **§31 六个 Pattern 的位置已定，且明确「尚未派生」。** 新增 `src/core/runtime-fingerprint.mjs`：Runtime / Tool / MCP / CLI / Failure / Recovery 六个 Pattern 各有位置、来源与标签，**每个值都是显式的 `null`**，`derived: false`。
  - **这是刻意的克制，不是没做。** §31 要求的是「预留结构」，不是现在就产出指纹；而指纹是关于「一次运行如何工作」的断言，§32 禁止界面自行推断关系。所以这里只发布形状与语汇，不派生任何值。
  - **「没派生」不会被显示成「没有模式」。** 收据新增「运行指纹（预留结构）」章节，逐条写「尚未派生」，并明说：**空不代表「没有模式」，只代表还没做**。守卫强制这句话不能被删。
  - 附带的是**证据数量**（各能力的调用计数），并注明「这是证据的数量，不是指纹本身」。
- **§36 聚合阈值对齐文档**：新增 `AGGREGATE_NODE_THRESHOLD = 30` / `AGGREGATE_EDGE_THRESHOLD = 50`，替换此前「硬上限的 60%」这一自定比例。
- **§20.1 的逐 Turn 折叠与 §36 的全局阈值分离。** §20.1 说的是「聚合重复的工具事件（grep × 8、web_search × 11）」——那是关于**一个 Turn** 的，不是关于整张图的。此前它挂在全局阈值上，导致「小图里一个很忙的 Turn」不折叠。现在两个触发条件各自独立。
- **`mode` 改为描述实际行为**：`grouped` 表示**确实折叠了东西**，而不是「某一个触发条件成立」。一个很大但每个 Turn 都很小的图会进入聚合模式却无可折叠，此时报 `expanded` 才是实话。
- 实测 45 个真实会话：**37 个进入聚合**，**最大渲染 200 节点**，**最大高度仍 1036px**，**五层（0–4）全部出现过**。
- 新增 7 项测试（**293 项通过**）与 2 组 verify 守卫，均已实测（预留位塞入评分、谎称已派生 → 构建失败）。
- 另确证 **§23.2**：右栏的「实际运行记录」即 Runtime History，「学习与验证时间线」即 Learning / Validation，Fingerprint 在声明区——此前的英文关键词检查有误，**这一项一直是满足的**。

## 0.4.0-beta.28 — 2026-09-28

收尾批次 B：**§8/§35 五层模型**，本版最大的结构缺口。

- **层数从四层改为 §35 的五层**：`0 Task·Session / 1 Turn·Agent / 2 Capability / 3 Tool·MCP·CLI / 4 Result·Error`。此前 invocation 挤在第 2 层，既没有 Capability 也没有 Result/Error 层。
- **§35「Agent」并入第 1 层。** 委派的子会话是 Agent，与 Turn 同层——此前它在第 3 层，与工具调用混在一起。
- **§8 新增三种节点类型**：
  - **Capability（第 2 层）**：把一个 Turn 内同一能力的多次调用收拢为一个节点。**只在它真的收拢了东西时才画**（≥2 次调用）——单次调用不需要一个父节点夹在它与 Turn 之间。
  - **Result（第 4 层）**：一个能力组里成功调用的结果。
  - **Error（第 4 层）**：每个失败的调用一个节点——那正是读者要找的东西。
- **§32：投影只画证据自身的包含关系。** 新增的每条边都是事件已经带着的 `turn` / `capabilityId` / `invocationId` / 结果 `status` 的包含，**不引用任何关联规则**（`rule: null`），守卫强制（实测：让投影边引用关联规则 → 构建失败）。
- **§36：投影与图共用同一个硬上限**，不是叠在上面。预算用尽时**明确报告跳过了多少个层级**（`skippedLevelCount`），不静默丢弃。实测 56 个真实会话，**最大渲染节点数 200**，canvas 高度仍 ≤1036px。
- 修正一处连带问题：回放的时间轴此前会把「列出成员」的节点都当成折叠节点。改为**只有折叠节点才代表成员**——能力节点虽然列出它收拢的调用，但那些调用是画出来的，回放步进必须落在调用上。
- 新增 10 项契约测试（286 项通过）与 4 类 verify 守卫，均已实测。

## 0.4.0-beta.27 — 2026-09-28

收尾批次 A：补上审计发现的三个小缺口。

- **§38 学习与验证默认收起。** 上一批把它从侧栏移进收据流，但用的是普通 `div`——所以它默认展开，把证据往下推。现在是一个 `<details>`，**默认收起**，与 §38「Runtime Trace 是主任务，Learning 是二级任务」一致。
- **§13 回放同时提供给运行图谱。** 此前只有运行流程能回放。§13 讲的是画布能力，两个密度共用同一个 `ReplayControls`，不是一个能走一遍运行、另一个不能。
- **§22 补「显示全部事件」显式控制。** 文档把 `[仅显示主路径] [显示失败/重试] [显示全部事件]` 并列为三个控制；此前"显示全部"只能靠**取消**主路径，没有显式入口。现在是一键清空筛选并显示全部。
- 新增 3 项守卫，**三者的回归实测都会让构建失败**：学习面板默认展开、运行图谱去掉回放、去掉显式全部事件控制。
- **276 项测试通过**，21 项契约检查全过。

## 0.4.0-beta.26 — 2026-09-28

- **修掉一个让插件整个面板空白的崩溃。** `FlowCanvas` 里一个 `useMemo` 引用了 `layout`，而 `layout` 在同函数更下方才声明——每次渲染都在暂时性死区里读它，抛 `ReferenceError`。React 没有错误边界，于是整棵树卸载，用户在界面上看到的是**空的**，而不是任何错误提示。
- **为什么此前测不出来**：这一批之前，客户端的所有测试都是**字符串断言**（"源码里含有某段文本"）。字符串断言看不见"组件渲染时抛异常"。这个缺陷通过了全部 274 项测试、21 项契约检查。
- **补上缺失的验证层：真实渲染冒烟测试。** 新增 `test/client-render-smoke.test.mjs`：把客户端当一个模块加载，用一个会真正调用函数组件、递归遍历元素树的最小 React，把**每个视图**用真实载荷渲染一遍。任何在渲染期抛出的异常都会失败。
- **这个测试自证有效**：把缺陷改回去，测试**确实失败**（`Cannot access 'layout' before initialization`）。第一版冒烟测试**没抓到**——因为挂载路径先渲染 loading 状态，根本走不到 `FlowCanvas`；所以补了 `module.exports.__views` 接缝，让测试能直接渲染每个视图。一个抓不到已知缺陷的测试比没有测试更糟。
- 新增 2 项测试（276 项通过），21 项契约检查全过。

## 0.4.0-beta.25 — 2026-09-28

UI 治理第九批（收尾）：**视觉 Token 统一（§25/§26/§27）**。

- **§25.2 去掉毛玻璃。**「我的 Skill」左栏的吸顶工具条用了 `backdrop-filter:blur(8px)` + 半透明底色——§25.2 明确禁止 glassmorphism。改为不透明底色。
- **§26 字号回到规范band。** 实测两处越界：收据标题 `22px`、Skill 标题 `24px`，而 §26 规定页面标题 **16–18px** → 均改为 `18px`。辅助文字有 **32 处**低于 §26 的下限 `10.5px`（9px ×3、9.5px ×8、10px ×29）→ 全部提到 `10.5px`。
- **实测结果**：样式表字号取值收敛为 `10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 14 / 15 / 16 / 17 / 18`，**无 >18px、无 <10.5px**；`backdrop-filter` 归零；无 ≥14px 圆角；无渐变（仅保留画布的功能性网格底纹）。
- **§26 结构尺寸复核**：顶部导航 `58px` ✓（58–60）；页面标题 `16px` ✓；区块标题 `13px` ✓；检查器列 `330px` ✓（300–340）；画布 `min-width:1000px` ✓。
- **§27 Card 治理**：无 ≥14px 的大圆角卡片；结构以 `border-bottom` 分隔为主（守卫要求分隔线不少于 8 处、圆角声明不多于 60 处，防止"每一块都套一个 Card"回潮）。
- 新增 1 组（4 类）verify 守卫：毛玻璃、超界字号、大圆角、Emoji 图标，**四类回归实测都会让构建失败**。
- **274 项测试通过**，**21 项契约检查通过**。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

## 0.4.0-beta.24 — 2026-09-28

UI 治理第八批：**My Skills 减重（§23/§24）**。

- **§24 去掉引导的营销化外壳。** 未选择 Skill 时的引导本身是允许的（§24 原文：「作为未选择 Skill 的引导是可以的」），但它带着一套**编号步骤圆 + 竖连线**——和 §17.2 从收据里删掉的是同一个向导式处理，同样让"这是第几步"的权重高于它描述的内容。编号圆与连线一并移除，步骤改为安静的文字列表。
- **§24/§26 标题回到页面尺度**：`25px` 的宣传级标题降为 `17px`（§26 规定页面标题 16–18px）。§24 明确禁止"大号宣传标题"。
- **§23.1 侧栏减重**：列表栏右边框从 `--st-border` 降为 `--st-border-soft`，减少大面积边框感。左栏的搜索、状态过滤与列表结构保持不变（§23 认为该结构合理）。
- 引导保留其证据边界说明：「这里只记录可观察证据，不判断是否有效，也不上传或翻译个人内容」——守卫强制它不能被删掉。
- 新增 3 项 verify 守卫：编号圆回归、宣传级标题、结论式文案，三者都会让构建失败（均已实测）。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

## 0.4.0-beta.23 — 2026-09-28

UI 治理第七批：**运行图谱治理（§20/§21/§22）**。

- **§21 修掉一个我自己造成的问题：同一个图有两个渲染器。** 运行图谱此前用我自研的 SVG 画布，运行流程用 React Flow——这正是 §21 明确禁止的"两个差不多的流程图"。现在**只有一个渲染器**，两个视图靠**密度与可操作性**区分，而不是靠两套代码。
- **§22 筛选栏**：`全部 / session / turn / skill / tool / mcp / cli / subagent` 类型筛选，加 `仅显示主路径` 与 `只看失败/重试`。默认即**主路径**——这正是 §22 说的"避免第一次打开时出现几十条交叉线"。
- **§20/§21 两个视图的分工**：`运行流程` 是安静的高层视图，**默认隐藏候选关系**（虚线，证据最弱的一类）并说明隐藏了多少条、去哪里看；`运行图谱` 是调试视图，允许更密的节点预算（宿主侧 400 vs 默认 200）并交出筛选权。
- **筛选只做减法，且必须报数。** 它只隐藏宿主已经证明存在的东西，绝不新增节点或关系（§32）；隐藏数量始终显示，否则"被筛选过的画布"会被误读成"这次运行本来就这么小"。守卫强制：让筛选能构造节点就让构建失败（实测有效）。
- 顺带删掉约 20 行只服务于旧 SVG 画布的样式与一个已死的路径构造函数。
- 新增 11 项契约测试与 3 项 verify 守卫。**274 项测试通过**，**19 项契约检查通过**。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

## 0.4.0-beta.22 — 2026-09-28

UI 治理第六批：**Skill 收据治理（§17/§18）**。

- **§17.2 去掉 1/2/3/4 蓝色步骤圆。** 它把收据读成一套向导，并且给"第几步"的视觉权重高于里面的证据。编号圆与竖连线一并移除，章节改为普通标题。守卫强制：再出现编号圆就让构建失败（实测有效）。
- **§17.1 顶部一行说清本次运行**：`N Turns · M Steps · K Events · J Skill`，在工作区名之前——先知道发生了什么，再往下读。
- **§17.1 章节改为可折叠**，并用治理文档的语汇：`运行摘要 / Skill 加载证据 / 候选依赖 / Skill 声明 / 学习与验证`。其中「候选依赖」原本是「Skill 加载结果」下的一个脚注，现在独立成节。
- **§14/§38 学习与验证不再是侧栏。** 它从固定在右侧的窄栏改为**收据流内的一节**——这正是 §14 的原始抱怨（不管你在看什么，右边长期固定着"我的理解与迭代"）。布局因此变成单列，证据与个人记录不再争夺注意力。
- 章节折叠用原生 `<details>`：无状态、可键盘操作、无动画。
- 新增 verify 守卫：编号圆回归、学习表单挪回侧栏，两种回归都会让构建失败（均已实测）。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

## 0.4.0-beta.21 — 2026-09-28

UI 治理第五批：**运行回放（§37）**。

- **逐节点步进，不是视频。** 按运行事件顺序高亮节点，配 `回放 / 暂停 / 上一步 / 下一步 / 退出回放`，并显示 `当前：N / M 步` 与整段运行的时间范围。已走过的节点保持正常，未到达的降到 22% 权重，当前步给一圈高亮——§37 要的正是"Step 1 ↓ Step 2 ↓ Step 3"，而不是自动播放动画。
- **时间轴由宿主构建，不由 UI 猜。** 折叠组代表多次调用，而画布按设计**不下发** `memberIds`，因此 UI 根本无法把事件解析到它所属的方块。时间轴因此在宿主侧生成：按 `runtimeEvents` 顺序走，把每个事件解析到**实际被绘制**的节点，连续落在同一节点的事件合并为一步。
- **回放是读操作。** 它只产出节点 id 序列，不改收据、不调接口、不写任何东西——由守卫强制（实测：改用动画循环、去掉折叠组解析、让截断静默，三种回归都会让构建失败）。
- 时间轴上限 400 步，超限**明确报告** `truncated`，而不是静默截断。
- 新增 10 项契约测试与 3 项 verify 守卫。
- 不改动证据语义、收据结构、隐私边界与用户验证语义（§3）。

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
