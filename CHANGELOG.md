# Changelog

## 0.4.0-beta.63 — 2026-09-29 · Layout Contract 根因修复（已实测验证）

**根因是一个被删掉的花括号。**

### 真正的根因

插件根规则（承载 `font-size` / `line-height` / `height` / `overflow` / `color` / `background`）
**被嵌套在 `@media(max-width:1050px)` 内部**——所以在任何桌面宽度下都不生效。

原因是一处**括号删除**：

```css
.st-dependency:nth-child(5){border-top:1px solid var(--st-border-soft)}}
                                                                       ↑ 第二个 } 关闭 @media(max-width:1050px)
```

上一轮我误以为这个 `}}` 里有一个多余的 `}`，删掉了第二个 ——
**媒体查询从此不再闭合，把根规则及其后所有内容全部吞了进去。**

### 为什么 333 项测试都没发现

**没有任何测试把样式表当 CSS 解析。** 于是以下变化全部静默通过：

| 属性 | 缺陷下的实际值 | 应为 |
|---|---|---|
| `font-size` | **16px**（继承 DSH 宿主） | 13px |
| `line-height` | `normal` | 18.85px |
| `overflow` | `visible` | `hidden` |
| `background` | `rgba(0,0,0,0)`（漏底） | `rgb(246,247,249)` |
| `height` | 内容高度（410px，不随窗口变化） | 宿主高度 |

**`font-size` 回退到宿主的 16px —— 这就是"整个 UI 看起来大了一号"的确切原因**
（Tab / Filter / Button / My Skill 列表全部一起变大）。
**`height` 塌成内容高度 —— 这就是 Runtime Graph 只占顶部一小块的原因。**

两个截图症状，同一个根因。

### 定位方式

不是读源码，而是**读浏览器真实 CSSOM**：

```
root#0                          [data-plugin=…]   fs='-' of='-' h='-'        ← 仅 token
root>(max-width: 1050px)@290#4  [data-plugin=…]   fs=13px of=hidden h=var(…)  ← 被困在这里
```

`element.matches('[data-plugin="dsh-skill-trace"]')` 返回 **true** ——
**选择器是匹配的，是规则的作用域错了。**

### 修复

恢复那个闭合花括号。**仅此一处。**

### 实测验证（渲染台）

| 属性 | 修复前 | 修复后 |
|---|---|---|
| `font-size` | 16px | **13px** |
| `line-height` | normal | **18.85px** |
| `overflow` | visible | **hidden** |
| `background` | 透明 | **rgb(246,247,249)** |

**高度链（修复后，root 精确等于窗口高）：**

| 窗口 | root | layout | main | flow | 画布 |
|---|---|---|---|---|---|
| 1600×1000 | **1000** | 928 | 928 | 928 | **841** |
| 1600×1400 | **1400** | 1328 | 1328 | 1328 | **1241** |
| 1200×760 | **760** | 688 | 688 | 688 | **601** |
| 900×1000 | **1000** | 898 | 898 | 898 | **812** |

**画布跟随宿主高度自适应，不再固定。**

### 新增 Layout Contract Guard（+4，333 → 337）

`test/phase11-layout-contract.test.mjs`：

1. **根规则不得位于任何块内**（brace depth 必须为 0）← **守卫的正是这个缺陷**
2. 根规则必须携带 `font-size:13px` / `line-height:1.45` / `overflow:hidden` / `height:var(--st-host-h,100%)`
3. 高度链上不得使用视口单位（`vh` / `dvh` / `svh` / `lvh`）
4. 样式表花括号必须配平（**顶层不得出现多余的 `}`**）

**已验证守卫有效**：重新引入缺陷 → 2/4 失败；恢复 → 4/4 通过。

### 未验证

- **真实 DSH Desktop 未运行** —— 验证全部在渲染台完成
- Dark Mode、Typography 的完整层级、Scope Highlight 不在本轮范围

## 0.4.0-beta.62 — 2026-09-29 · 插件高度改为**测量宿主**（机制已实现，未验证）

**beta.61 的问题**：它移除了视口高度，却没有给链提供**确定高度**。
链一旦拿不到高度，画布就落到 `min-height:240px`——**这正是"顶上一直有那么一点点"。**

### 改成测量宿主

插件的高度**不能**来自浏览器视口，链本身也不可靠
（宿主 slot 与本根之间的每一层都可能是内容高度，于是 `height:100%` 塌成 `auto`）。
所以改为**测量**：

1. 向上找**最近一个有确定高度的祖先**（宿主给的）
2. 取 `该祖先的 bottom − 本根的 top`
3. 发布为 `--st-host-h`，根高度为 `height:var(--st-host-h, 100%)`

**没有硬编码，没有视口单位，随宿主缩放自动跟随。**
祖先**只解析一次**，且只在**值真的变化时**才 setState。

同时把 `min-height:240px` 改为 `0`——那 240px 就是可见的那一条。

### ⚠️ 过程中发现并修复了一个会挂死页面的缺陷

第一版实现里，我**观察了每一个祖先**，同时又给根设置高度——
**ResizeObserver 把自己的写入反馈回了自己的输入**，页面永不稳定，
headless 截图**卡死超时**（我不得不 kill 掉后台任务）。

第二版：祖先只解析一次、只观察宿主祖先与本根两个元素、值不变则不 setState。

**这个循环缺陷在真实 DSH 中同样会发生**，只是表现为持续重排而非报错。

### 实测结果（渲染台，1600x1000）

```
--st-host-h = 1000px   ← 测量生效
root = 1159px          ← 但高度没有应用
画布 = 1000px
```

**测量成功，高度未生效。** 变量确实写到了根元素上（实测 1000px），
CSS 也是 `height:var(--st-host-h,100%)`，但根的实测高度仍是 1159px。
**我未能定位原因就耗尽了本轮上下文。**

### ⚠️ 未验证（明确声明）

| 项 | 状态 |
|---|---|
| **测量机制在真实 DSH 中的效果** | ❌ **未验证** |
| 变量为何未作用于高度 | ❌ **未定位** |
| >1050px 溢出是否闭合 | ❌ 未知 |
| Typography / Density | ❌ 未做 |
| CSS override 合并 | ❌ 未做 |
| Layout Regression Guard | ❌ 未做 |
| 真实 Desktop | ❌ 未跑 |

**机制已实现、测试通过，但效果未经任何真实或渲染台测量确认。**
在测量确认之前，**不得声称高度问题已解决**。

### 验证

- **333 项测试通过**，**24 项契约检查通过**（未新增测试）

## 0.4.0-beta.61 — 2026-09-29 · Layout Regression：高度链修复（**部分修复，未完成**）

**真实 Desktop 截图报告的 UI 漂移。本轮找到并修复了主因，但未完全收口。**

### 根因

`@media(max-width:1000px)` 里有：

```css
.st-shell{{height:auto;min-height:100dvh}}
.st-layout{{display:block}}
```

这段是为**独立网页的窄窗口**写的。但 **DSH 里插件内容区本来就常常窄于 1000px**
（宿主有侧栏，插件坐在一个内容列里），于是：

1. `height:auto` → shell 变成**内容高度**
2. `min-height:100dvh` → 又要求至少**一个浏览器视口高**
3. `.st-layout{display:block}` → **整条 flex/grid 高度链断掉**
4. `.st-flow-canvas{height:calc(100dvh - 210px)}` → 画布拿一个**与宿主无关的固定高度**

**实测复现（窗口高 1000px，宽 900px）**：

```
修复前  root h=1188   ← 插件比视口高 188px → 滚动 + 下方大片空白
        .st-layout display:block   ← 链断
```

### 修复（去除视口高度，让链自己决定）

| 位置 | 改前 | 改后 |
|---|---|---|
| `[data-plugin]`（窄屏） | `height:auto;min-height:100%` | **`height:100%;min-height:0`** |
| `.st-shell`（窄屏） | `height:auto;min-height:100dvh` | **`height:100%;min-height:0`** |
| `.st-layout`（窄屏） | `display:block` | **`grid-template-columns:minmax(0,1fr)`**（保持栅格，不断链） |
| `.st-flow-canvas` 基础规则 | `height:calc(100dvh - 210px);min-height:420px` | **`flex:1;min-height:0`** |
| `.st-flow-canvas`（窄屏） | `height:60dvh` | `min-height:240px` |
| `.st-flow-side` | `max-height:calc(100dvh - 190px)` | `max-height:100%` |
| `.st-main,.st-aside`（窄屏） | `overflow:visible` | `overflow:auto` |

**移除的视口魔法值：`calc(100dvh - 210px)`、`min-height:100dvh`、`height:60dvh`。**

### 验证结果（渲染台实测，窗口高 1000px）

| 窗口宽 | root 高 | 画布高 | 结论 |
|---|---|---|---|
| **1000px** | **1000** | 812 | ✅ **精确等于窗口高** |
| **820px** | **1000** | 783 | ✅ **精确等于窗口高** |
| **1600px** | ~~1159~~ | 1000 | ❌ **仍溢出 159px** |

### ⚠️ 未完成（明确声明）

**宽于 1050px 时画布算出 1000px，shell 溢出 159px，本轮未闭合。**

画布在失去定高后 `flex:1` 向上要高度，而 `.st-layout` 的栅格行未能约束它——
`#root` 有定高（`height:100vh;overflow:hidden`），链内却仍在溢出。
**我没有定位到确切的那一层，因此不声称"高度链已修复"。**

### 其他未做

| 项 | 状态 |
|---|---|
| **Typography / Density 恢复** | ❌ **未做**（字体偏大、节点稀疏未处理） |
| **CSS override 合并** | ❌ 未做（`.st-flow-canvas` 仍有 3 处定义） |
| **Layout Regression Guard** | ❌ **未做**（你要求的自动化守卫） |
| 真实 Desktop 验证 | ❌ 未做 |
| 窄屏空白是否在真实 DSH 中消失 | ❌ 未验证——**只验证了渲染台** |

### 验证

- **333 项测试通过**，**24 项契约检查通过**（测试数未变，**未新增守卫**）
- `npm pack --dry-run`：26 文件 / 1.7 MB

## 0.4.0-beta.60 — 2026-09-29 · Dark Mode：Token 化主题适配

**代码机制已实现；真实 DSH Desktop 尚未验证。**

### 根因：`--st-*` 从未引用过宿主 Token

design.md 一直写着「宿主 Token 是第一选择，回退值只用于异常环境」——
**实测该约定从未实现**：`--st-*` 的 16 个 token **全部是写死的绝对浅色值**，
没有任何一个引用 DSH 宿主 token。**这就是 Dark Mode 不生效的确切原因。**

### 架构

```
DSH Theme → DSH Alias / Semantic Token → --st-* → Skill Trace UI
```

实测 DSH 当前提供 **52 个 `--dsw-alias-*` token**（`bg-base`、`bg-layer-1..4`、
`border-l1..l4`、`label-primary/secondary/tertiary`、`brand-primary`、
`state-success/warn/error-primary` 等）。插件**引用它们**，
DSH 按主题重定义 alias 时插件随之自动变化。

**已映射 14 个 token**（详见 design.md 的 Dark Mode 章节表格）。
另加 `color-scheme: light dark`，让表单控件与滚动条跟随主题。

**没有第二套 CSS，没有 `isDark` 状态，没有新增 Theme State。**

### 清理的主题硬编码

| 位置 | 改前 | 改后 |
|---|---|---|
| `.st-tag[data-tone="warn"]` | `#9a6712` / `#fff6df` | `var(--st-warning)` / `color-mix(… 12%, var(--st-layer))` |
| `.st-tag[data-tone="error"]` | `#a8343d` / `#fff0f2` | `var(--st-error)` / 同上 |

原先的浅色底在 Dark Mode 下会**漏白底**。

### Capability Color

`skill / tool / mcp / cli` **无 DSH alias 对应**——它们是**语义类型标记**，不是主题表面。
因此保留色相，在**使用处**与 `--st-layer` 混合，从而在两个主题下都可读，**且不改变语义**。

### ⚠️ 未验证（明确声明）

| 项 | 状态 |
|---|---|
| **真实 DSH Desktop 的 Light / Dark 观感** | ❌ **未验证** |
| 真实截图（Dark Runtime Graph / Dark Inspector） | ❌ **未截** |
| Scope Highlight 在画布上出现 | ❌ **仍未验证**（beta.59 遗留） |
| Case D/E/F | ❌ 未做 |
| Runtime Truth E2E | ❌ 未做 |

**在该验证完成前，不得声称 Dark Mode「已适配」。**

### 又一次反引号事故

我在 CSS 的**模板字符串**注释里写了 `` `isDark` ``，反引号**截断了字符串**，
`node --check` 报 `Unexpected identifier 'isDark'`。
**与上轮 `:active` 完全相同的错误**——这类注释在模板字符串里必须避免反引号。

### 验证

- **333 项测试通过**，**24 项契约检查通过**（测试数未变）
- 未新增测试

## 0.4.0-beta.59 — 2026-09-29 · Runtime Graph Hardening + Code Simplification

**不加新能力。** 让 beta.58 从"功能完成但缺乏回归守卫"变成"有守卫、有真实验证、代码更简洁"。

baseline：`321` 项测试 / `24` 项契约检查。

### 一、测试：+12（Case I / J / K / M / N）

`test/phase10-runtime-graph-hardening.test.mjs`。**321 → 333。**

- **Case M**：`observedEvents → inScopeNodeIds → data-in-scope` 一一对应；并单独验证
  **adjacency / nearest / same-turn / time-proximity 都不能把范围外事件拉进 Scope**
- **Case N**：同一 receipt 建两次，`graph / layout / scope / runtimeEvents` **逐字节相同**——
  证明 **payload 不依赖 Inspector 状态**；并断言 Scope 结构里**不含任何 UI 字段**
- **Case K**：投影**不携带 edges**、不改动传入的 layout、词汇表里无因果边类型
- **Case J**：Scope 给出明确的成员集合；聚焦是**降权不是过滤**（节点总数 = 内 + 外）；
  **无可靠 Scope 时不构造**
- **Case I**：Inspector 默认值是**视图常量**，没有任何数据路径读它

**过程中我写了一条同义反复的断言**（`assert.deepEqual(x, x)`）——正是本项目反复出现的
"测试自己"。已删除并换成有区分力的断言。

### 二、分层修正：投影从 Host 移入 Core

`projectScopes` 原本写在 `src/dsh/host/index.js` 里，**无法测试**。
移到 `src/core/skill-runtime-scope.mjs` 成为纯函数 `projectScopesOntoLayout(built, layout)`：

- **Core 持有 Runtime Truth 与 Scope 模型**（纯函数、可测）
- **Host 只做装配**（自身减少 45 行）
- **Client 只做呈现**（不重新推断 Scope）

这既是可测性的前提，也更符合分层要求。

### 三、行为不变的清理（3 项，每项都确认过）

| 项 | 确认依据 |
|---|---|
| `skill-runtime-scope.mjs` 未使用的 `aggregateInvocations` import | 只在注释里出现，**从不调用** |
| `indexByTurn` 返回但从不被解构的 `unturned` | 调用点只取 `byTurn`；改为返回 Map |
| `client.js` 中被**完全覆盖**的 `.st-flow{…330px…}` | 与生效规则同在 `installStyles()` 内，后者在后且同优先级 → **死规则** |

**清理后 333 项测试全过**，证明行为不变。

### 四、明确保留（附理由）

| 代码 | 为什么保留 |
|---|---|
| `runtime-alignment.mjs` 的 4 个 import | **全部在用**（各出现 ≥2 次）——"未使用 import"的猜测**不成立** |
| `.st-flow` 的另外 2 处定义 | 一处是**画布生效规则**，一处是**窄屏媒体查询**——都是活的 |
| `skill-runtime-scope.mjs` 注释里那句 `aggregateInvocations(receipt?.runtimeEvents)` | 它**记录了被修掉的缺陷**，删掉注释等于删掉历史 |
| `design.md` 里 2 处「单列」 | 指的是 **`<460px` 表单**与**窄窗行为**——**仍然成立**，不是过期表述 |

### 五、真实数据验证

用渲染台（真实客户端 + 真实会话数据）+ headless shell 实测：

| 检查 | 结果 |
|---|---|
| Graph 默认 Inspector | **collapsed** ✓ |
| Flow 默认 Inspector | **expanded** ✓ |
| Inspector 宽度 | Graph **26px** / Flow **340px** ✓ |
| Rail 存在 | 1 ✓ |
| **Handle 可见数** | **0 / 382**（Graph）、**0 / 44**（Flow）✓ |
| 选中 Skill 后自动展开 | ✓ |

载荷已重算并带 `scopes`：flow `inScopeNodeIds [1,1]`、graph `[3,3]`。

**⚠️ 未验证：Scope 高亮在画布上真实出现（`inScope` 仍为 0）。**
我未能定位原因，因此**这一项不声称通过**。

### 六、文档同步

`design.md`：矛盾段改写为 **Contextual Inspector（Expanded / Collapsed / Rail）**，
新增**视图职责**（Flow = Semantic Runtime Summary / Graph = Detailed Runtime Evidence）
与 **Runtime Scope V1 = Same-turn Structural Scope** 的界定，并写明
**Missing Evidence ≠ Evidence of Absence** 与**不支持跨 Turn 推断**。

### 七、npm pack --dry-run

**26 个文件 / 1.7 MB**，正常。

### 八、剩余技术债

1. **Scope 高亮未通过真实验证**（`inScope: 0`）——本轮最大遗留
2. `data-in-scope` 的**点击/状态半**没有自动化测试（受限于冒烟测试不建 DOM）
3. Case I 的**宽度半**同样只有渲染台实测，没有 `node:test`

## 0.4.0-beta.58 — 2026-09-29 · P0：Contextual Inspector + Graph 空间释放 + Scope 画布表达

基线 `0.4.0-beta.57`，**321 项测试 / 24 项契约检查全过**。

### Inspector 改为 Contextual（P0-1/2/3）

`.st-flow` 的列宽此前是**写死的 `340px`**。改为由 `data-inspector` 驱动：

| 视图 | 默认 | 画布宽 | Inspector 宽 |
|---|---|---|---|
| Runtime Flow | `expanded` | 1560px | 340px |
| **Runtime Graph** | **`collapsed`** | **1874px** | **26px（窄 Rail）** |

**画布释放 +314px**（1900px 窗口实测）。折叠时 **Inspector 保持挂载**，只改列宽——
避免重复取数，也确保**不改变任何 Graph 数据**。

选中 Node/Skill 时自动展开；收起用显式按钮（不做「再次点击同一节点收起」，
那会与"重新读取该节点"冲突）。

**顺带满足 §27**：收起按钮原设计成圆角药丸，verify 的 `§27: too many rounded cards (71)` 拦住——
守卫是对的，改为无边框文字按钮，既过守卫也更符合「quiet」。

### Scope 的画布表达（P0-5）

`/runtime` 此前**不含 scope**。host 新增 `projectScopes()`：

```
Runtime Event → Runtime Scope → Runtime View Model → Canvas Highlight
```

它**只做投影**：把 `skill-runtime-scope.mjs` 已经建好的 Scope 的 `invocationId`
翻译成布局节点 id（沿用布局已有的成员归属）。**客户端不重新推断 Scope。**

画布用 `data-in-scope` 表达，样式是**淡边框 + 极淡底纹**：
**不画包围盒、不画连线**——否则读起来就是 BPMN 的「Skill 工作流框」。
只有 observed / correlated 会被投影进来，candidate / unlinked 不参与。

### Focus 两套语义（P0-4）

按选中对象分派，**不合并**：

- 选中 **Skill 且有可靠 Scope** → Scope Focus（范围外降权，**节点全部保留**）
- 选中**其他节点** → 沿用既有 Neighbourhood Focus
- **Skill 没有可靠 Scope → 回退邻接，不强行构造**

### Handle 弱化（P1-6）

`.st-flow-handle` 的 `opacity` 置 0、`pointer-events` 置 none。
**Handle 保留在 DOM 中**——删掉它 React Flow 就画不出边。纯 CSS，零行为风险。

### 又抓到一次 TDZ

我把 `scopeNodeIds` 的 useMemo 插在了它引用的 `selectedIdOfInspect` **声明之前**，
报 `Cannot access 'selectedIdOfInspect' before initialization`——
**与 beta.31 白屏事故同一类**。渲染冒烟测试当场抓到（那层测试正是 beta.31 之后加的）。

另有一次 `runtime is not defined`：视图拿的是 `data` 不是 `runtime`。**同样被冒烟测试抓到。**

### 未完成（如实记录）

| 项 | 状态 |
|---|---|
| **Case M E2E**（observedEvents ↔ data-in-scope 一一对应） | ❌ **未做** |
| Case D/E/F 补充测试 | ❌ 未做 |
| `design.md` 第 81/179/182/405 行同步 | ❌ **未做**（仍写着「单列、无固定 Inspector」） |
| Native Correlation ID 文档记录 | ❌ 未做 |

**测试仍是 321 项（未新增）。** 本轮只做到"能跑通、门禁绿"，**没有补上新测试**——
这是本轮最大的缺口，因为它意味着这些改动**没有回归守卫**。

## 0.4.0-beta.57 — 2026-09-29 · 批次 Y：把产品与设计文档纳入公开仓库

**代码无改动。** 公开范围的一次调整。

### 起因

V0.5 之后核对文档，发现 PRD / SDD 都**不完整**（从未提到对齐的匹配范围）。更新完才发现：
`.gitignore` 的 `/[0-9][0-9]-*.md` **把四份顶层设计文档一起忽略了**——
**public repo 里只有代码和 README，没有需求、没有技术设计。**

### 判断依据（先查，再决定）

发布前扫描了四份文档：

| 检查 | 结果 |
|---|---|
| 绝对路径 / 用户名 | **0** |
| 凭据样式匹配 | 4 处，**全部是禁止清单**（「禁止字段：Prompt、Token、Cookie…」）——方向相反 |
| 会话 id / 个人证据 | **0** |
| 失效链接 | 三份均为 **0** |

**内容本身可以公开。**

### 决定：三份公开，一份保持本地

| 文档 | 处理 | 理由 |
|---|---|---|
| `02-product-thesis.md` | **公开** | 产品主张——这是产品资产 |
| `04-product-requirements.md` | **公开** | 需求（含新增的 `FR-SCOPE-001…012`） |
| `05-technical-design.md` | **公开** | 技术设计（含 §11.1 那条缺陷记录） |
| `07-adversarial-review.md` | **保持本地** | 它引用 `.audit/` 下的截图，而 `.audit/` 不公开——**发布它就是发布死链** |

`.gitignore` 的注释也一并改写，说明为什么编号文档要豁免、为什么 07 例外。
**过程目录（`00_` / `01_` / `99_` / `specs/` / `.audit/`）保持忽略**——那些是过程稿，不是产品资产。

### 一个我差点误报的事

提交 V0.5 文档时我看到暂存列表里没有 PRD / SDD，一度以为漏提交。
查下来是 `.gitignore` 有意为之。**我没有当场改它**——那是你的决定；
直到你这次说"如果需要发布，你就发布一下"，我才动。

**321 项测试通过**，**24 项契约检查通过**（代码未变）。

## 0.4.0-beta.56 — 2026-09-29 · 批次 X：PRD / SDD 同步 V0.5

**代码无改动，只更新需求与技术设计文档。**

核对后发现两份文档**都不是"被推翻"，而是"不完整"**——它们从未提到对齐的匹配范围。

### PRD（`04-product-requirements.md`）

- **§6.4 新增 V0.5 已确认范围**：Skill Runtime Scope。路线图此前停在 V0.4。
- **§7.7 新增 12 条功能需求 `FR-SCOPE-001…012`**，其中把设计原则写成了可验收的条目：
  - `FR-SCOPE-003`：**显式拒绝**「相邻事件」「最近事件」「时间距离最短」「最后一个 Tool」
    「Skill 之后的所有事件」作为归属依据
  - `FR-SCOPE-005`：无法归属时必须返回 `unlinked` **并保留事件**，不得为凑齐 Scope 而猜
  - `FR-SCOPE-006`：**同一 Turn 内两次 Skill 加载，两者都必须判为 `unlinked`**
  - `FR-SCOPE-010`：不得计算或呈现遵循率、百分比、评分、排名
  - `FR-SCOPE-012`：**不得**在 Runtime Flow 中画 Skill → Tool 因果连线

### SDD（`05-technical-design.md`）

- **§2.1 模块职责**新增 `skill-runtime-scope.mjs` 行（含「明确不做」）
- **§11.1 记录了一个从未登记在技术债里的缺陷**——见下
- **§11.2 V0.5 之后仍存在的限制**（Subagent 谱系 / 跨 Turn / 工具词表 / candidate 未启用）
- **§11.3 测试策略补充为三层**（Core Unit / Contract / Real Render），并要求每条守卫
  都验证「回退被测代码时它会失败」

### 一个值得单独说的发现

SDD 的「已知技术债」有 6 条，**没有一条是 Session 级匹配**。

**它不是"已知并接受"的限制，而是从未被登记。** 于是它既没被发现、也没被记录，
而是一直在产生错误的归属。

**教训是清单本身**：一条既不在范围文档、也不在技术债里的行为，等于无人负责。

### 顺带修正重构 SDD 的接口

`01_重构方案/02-SDD-Runtime-Flow-Reconstruction.md` §12 原写「V0.6 才实现」，
实际 V0.5 已落地，且**原 `AlignmentItem` 接口没有表达匹配范围**——这正是实现里
`aggregateInvocations(receipt.runtimeEvents)` 吃全量事件的原因之一。
已补 `AlignmentScope` 接口定义与边界规则。

**321 项测试通过**，**24 项契约检查通过**（代码未变）。

## 0.4.0-beta.55 — 2026-09-29 · V0.5：Skill Runtime Scope

**核心能力，不是视觉改动。** 详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的 V0.5 章节。

### 修掉的缺陷

`buildAlignment` 此前是：

```js
const invocations = aggregateInvocations(receipt?.runtimeEvents ?? [])
```

**整个 Session**。于是「Turn 1 read / Turn 2 加载 Skill A / Turn 3 test」会让 Skill A 的
「Inspect → Test」同时匹配 Turn 1 与 Turn 3。**事件是真的，归属是编的。**

现在对齐只读 **Skill Runtime Scope** 内的事件。Scope 建不起来时范围内为空，
所有声明步骤落进 `insufficient`——**"Runtime 说不出来"不等于"没有做"。**

### 新增 `src/core/skill-runtime-scope.mjs`

| 状态 | 含义 |
|---|---|
| `observed` | 这次加载自身（Scope 锚点） |
| `correlated` | 与加载同一 Turn。**Runtime 声明了包含，没有声明 Skill 导致了调用。** |
| `candidate` | 一条具名、很窄、可测的规则 |
| `unlinked` | Runtime 放不进去——**事件保留，不归属** |

**边界用 Turn，不用时间相邻。** 实测 `turn` 在真实会话 **1343/1343** 个事件上存在，
`Session → Turn → Invocation` 是 Runtime 自己声明的包含。明确拒绝「相邻事件」「最近事件」
「Skill 之后的所有事件」——它们产出证据不支持、却读起来像关系的归属。

**实测收敛**：1343 个事件 → 68 个（5.1%），构成与 Turn 完全吻合。

### 七个情况全部覆盖

A 单 Skill 单 Turn / B 两 Skill 不相交 / C 同 Turn 多调用 / D 用户 `/skill` /
E Scope 为空 / F 无法唯一匹配 / **G 同 Turn 两 Skill → 两者都 `unlinked`（分不开就不分）**

### 测试：19 项，且验证过「能抓到缺陷」

`test/phase9-skill-runtime-scope.test.mjs`。**回退 alignment 到 Session 级匹配 → 2 项失败；
恢复 → 19/19 通过。**

**过程中抓到我自己两个会把测试变成空转的错误**：

1. **fixture 把声明放错字段**。声明来自 `trace.continuityCandidate.steps`，而我放在
   `skillInstructions`——**没有任何代码读它**。于是 `items` 为空，
   `assert.notEqual(undefined, 'observed')` **永远通过**。测试对着"缺陷原封不动"的代码全绿。
   已加反空转断言（先断言步骤确实被提取）。
2. **工具名不在分类器词表里**。`edit_file` 会归类为 `other`，于是匹配不上、测试因错误的原因通过。

### 限制（如实记录）

- **Subagent 谱系不可用**：`childId` 在 1343 个事件里出现 **0** 次，且 `subagent.spawn` 不指名
  是哪个 Invocation 创建的 → **Subagent 派生无法进入可靠边界**
- **跨 Turn 的 Skill 工作不在 Scope 内**——刻意如此
- **工具词表固定**：`read_image`/`job_output` 等真实工具名不在其中，归为 `other`（不强行归类）

### 未做（按你的要求）

不改 Runtime Flow / Graph 架构、不换 React Flow、不做工作流编排、不加因果连线、
不碰 Learning / Catalog / Backup / Locale。Inspector 只新增了 **运行范围** 的显示。

## 0.4.0-beta.54 — 2026-09-29 · 批次 W：面向读者的文档全量核对

上一轮修的是版本号。这一轮按"**所有会被读者照着做或照着信的陈述**"逐条核对。

### 找到并修掉的三处

| 位置 | 问题 |
|---|---|
| `docs/images/skill-receipt.jpg` | **08-27 的截图，展示的界面已不存在** |
| README 图注 | 写着"截图来自本轮 DSH Desktop"——**而新图来自渲染台**，不改就是虚假陈述 |
| README 第 179 行 | 「当前包含 **274** 组自动化测试」——**实际 302** |

**那张旧截图最值得说**：它显示**编号圆 ①②③**——而 §17.2 明令禁止「无编号圆」；
还有 4 步箭头活动条（beta.33 已移除）与 5 列依赖栅格（已改为 label/value 行）。
**README 里的截图在展示一个被治理规则禁止的界面。**

### ⚠️ 一处我主动放弃的替换

我同时重截了「我的 Skill」目录页，但**截图实际是「运行流程」**（页头写着"运行流程 · 40 节点"）。

**一张错标的图比一张过期的图更糟**——所以我 `git checkout` 回退了那张，只保留验证过正确的那张。
目录页的复核留待下一轮（渲染台的 `catalog` 动作没切换成功）。

### 顺带发现的一个工具事实

`chrome-headless-shell --screenshot` 加 `--virtual-time-budget` 会把**带异步数据的视图截成空白**——
虚拟时钟被快进过头，截图发生在数据渲染之前。去掉该标志、改用固定等待即可。

### 留给你确认的一项

README 第 20 行写「当前运行基线：DSH Desktop `0.11.3` / runtime `0.1.5-rc.2`」。
本机是「Omi DSH 0.1.2」，**命名体系不同，我无法核实**，因此**不改我不确定的东西**。

**302 项测试通过**，**24 项契约检查通过**。

## 0.4.0-beta.53 — 2026-09-29 · 批次 V：把 README 当作发布资产核对

**用户指出的文档漂移**：`package.json` 已是 `0.4.0-beta.52`，而 **README 还写着「当前公开预发布版为
`0.4.0-beta.3`」、安装示例是 `v0.4.0-beta.4`——落后 49 个版本**。

实测漂移范围比预想的大：

| 位置 | 原值 | 说明 |
|---|---|---|
| 「当前公开预发布版为」 | `0.4.0-beta.3` | 落后 49 版 |
| 安装示例 | `v0.4.0-beta.4` | **这行会被人直接复制** |
| 版本历史 | 止于 `beta.13` | 缺 39 个版本 |
| FAQ | 绑死 `0.4.0-beta.3` | 改为不绑版本 |

### 修复

1. 当前版本与安装示例改为 `0.4.0-beta.52`
2. 版本历史补 `beta.14`–`beta.52` 的**主线**，并指向 `CHANGELOG.md` 作为完整历史
   （README 不该变成流水账；逐版记录由 CHANGELOG 负责）
3. FAQ 去掉绑死的旧版本号
4. `04-product-requirements.md` / `05-technical-design.md` 里的 `beta.3` **保留**——
   那是历史章节标题（「17.1 本地数据安全闭环（0.4.0-beta.3 候选）」），**改掉反而是篡改历史**

### 根治：加一道校验

光改一次不能防止再漂移。`scripts/verify-project.mjs` 新增 `RELEASE_ASSETS_IN_SYNC_OK`：

- README 的「当前公开预发布版为」必须等于 `package.json` 的版本
- README 的安装示例 pin 的 tag 必须等于 `package.json` 的版本

**只钉"会被人照抄的两处"**，不要求 README 同步逐版历史——否则每次发版都要改 README，规则会被绕过。

**有效性已验证**：把 README 改回 `beta.3` → 校验失败并给出可读原因；恢复 → 通过。

> **教训**：`README` 是**发布资产**，不是随手笔记。它的版本声明会被人复制粘贴，
> 因此必须和 `package.json` 一起被机器校验，而不是靠我记得改。

## 0.4.0-beta.52 — 2026-09-29 · 批次 U：更正一条错误的根因

**代码无改动，只改文档。**

白屏结案：用户确认那是 **DSH 自身版本的 bug**，更新 DSH 后消失，**与插件无关**。

而我在 beta.51 的文档里写的是"最可能是 shell 在启动时缓存了插件记录，重启 DSH 即可"——**这是错的**。

值得记下来的不是"我猜错了"，而是**猜错的方式**：

我给出的三条证据都是真的——

- `dist/client.js` 与 src 一致，不是陈旧的
- 可作为经典脚本解析
- 渲染台用线上真实载荷渲染无错误

**但这三条只能证明"插件侧没问题"，不能推出"原因在 shell 缓存"。**
我把"排除了一个方向"说成了"最可能是另一个方向"。

**教训**：当证据只能排除时，结论要写成 **"已排除 X"**，而不是 **"最可能是 Y"**。

这是本项目第六次由我做出、并被后续事实推翻的推断（前五次：五次旧证据误判、两次"先写逻辑没查字段"
中的若干次重叠计入）。

## 0.4.0-beta.51 — 2026-09-29 · 批次 T：补齐项目知识管理

**代码与 beta.50 相同，本版只补文档。**

### 一个持续了五轮的静默失败

准备发布时核对 `CHANGELOG.md`，发现**顶部停在 beta.45**，`beta.46`–`beta.50` **五条全部缺失**——
而我在这五个 commit 里都跑过写入脚本、都报告了"已写入"。

根因：**这个文件的第一行就是 `## 0.4.0-beta.45`，没有 `# Changelog` 标题**，
而我的锚点是 `"# Changelog\n\n## 0.4.0-beta.45…"`。
`str.replace()` 找不到锚点时**不报错、原样返回**——于是五次写入全是空操作。

**这正是我在本项目里犯过两次的同一个错误**（beta.16 的 `<span>`、beta.27 的 `cli` 节点），
而且我明确写过"每次替换都要断言"。这一轮我把断言加在了别处，**偏偏没加在 CHANGELOG 上**。

已补回五条，并补回 `# Changelog` 标题。

### 治理文档

`01_重构方案/dsh-skill-trace-Design-Refactor-Governance.md` 新增 **§48.6 批次 beta.32–beta.50**：
渲染台能力、17 项视觉差异关闭、**四个「功能写了、产品里没有」的缺陷**及其共同根因
（折叠分组与调用节点的 id 空间错位）、关于测试的结论、用户直接发现的缺陷、遗留项。

`01_重构方案/06-视觉差异审计.md` 补**最终关闭清单**：17 项已关闭 / 2 项无法对照（preview 无异步状态）
/ **6 项不在原清单里、由截图与真实数据发现的缺陷**。

### 遗留（如实记录）

- **白屏观察（已结案）**：用户报告 Skill 追踪标签空白。**实测为 DSH 自身版本的 bug，
  与插件无关，DSH 更新后已消失。**
  我当时的推断是"shell 在启动时缓存了插件记录"，**这是错的**——虽然我给出的证据
  （`dist/client.js` 最新、可解析、渲染台用线上真实载荷渲染无错误）是真的，
  **但"证据为真"不等于"结论为真"**：那三条只能说明插件侧没问题，不能推出原因在 shell 缓存。
  **这是本项目里第六次由我做出的、被后续事实推翻的推断。**
- **seam 测试缺口**：`phase8-collapsed-group-seam` 覆盖 core 侧，**不覆盖客户端自身的查找**；
  缺口已写在测试文件里，`__pure` 接缝已留好

## 0.4.0-beta.50 — 2026-09-29 · 批次 S：完成评审指出的 4 项未完成

- **preview 侧聚焦/回放/筛选对照图**补齐（3 张）。**Loading / Error 无法对照**——实测
  `preview.html` 里 `loading` 出现 **0** 次、`error` 全是 CSS 变量 `var(--error)`：
  **preview 是静态基线，没有异步状态。**
- **`:active` 按下态**：实测 preview 与实现**都是 0 条**；objective 明确要求，故补上。
- **回放条核实**：代码是对的，`replayActive` 时才渲染。此前的"矛盾"来自**我早先的截图是旧构建**。
  但实测抓出真问题：回放中「退出回放」出现**两次**，已修。
- **core-017 安装版本**有了确切答案：link 到工作树，版本 `0.4.0-beta.49`，与 tag
  `v0.4.0-beta.49`（`e96c4fc9f69c`）逐字节一致。

## 0.4.0-beta.49 — 2026-09-29 · 批次 R：节点字重复与错误图标

**用户发现**：「我看节点运行发在重复」。实测节点文本确实重复——会话节点标题与类型同为「会话」；
折叠分组图标取自"折叠分组"而非能力。

图标改取能力（S/T/M/C）、标题与类型相同时不渲染类型、折叠分组类型行改为能力名。
**修后 Skill 节点带紫色条 + `S` + `Skill`，一眼可辨。**
过程中我先写了图标逻辑却**没检查 `capabilityId` 有没有传进节点 data**，那次修复是空的。

## 0.4.0-beta.48 — 2026-09-29 · 批次 Q：折叠分组这条缝一次查干净

主动列出**所有按节点 id 查找的位置**逐个判定，结论：**这条缝只有一处**（beta.47 已修）。

新增 3 项 seam 测试。**并抓到我自己的一个坏测试**：它在测试里复刻了客户端的匹配逻辑，
**回退产品代码它照样通过**——它测的是它自己。改成调用产品代码时遇到 `client.js` 需要
`__ModuleLoader__` 桩，遂**收窄范围并把缺口写进测试文件**。

## 0.4.0-beta.47 — 2026-09-29 · 批次 P：折叠分组的数据缝

`skillLoads` 记的是**调用节点** id，与分组 id `group:11:skill` 永远匹配不上——**选中 Skill
节点却被提示"先选 Skill"**。改为分组可经 `memberIds` 解析到成员。

**修复同时引出了 `[object Object]`**：`load.skillName` 是本地化对象，三处用 `raw()` 渲染。
**若没截图，我只会看到测试全绿、然后报告"修好了"。**

## 0.4.0-beta.46 — 2026-09-29 · 批次 O：截图又找出两处

- **Error 态页头与正文矛盾**：页头写「正在读取当前会话…」，正文写「暂时无法读取…」。
  根因是 `!data` 不区分"正在读"与"读失败"。
- **「学习验证」Tab 无标签**：`INSPECTOR_TAB_LABELS` 缺 `learning` 键，`raw(undefined)` 渲染成空。
- 顺带暴露第三处（beta.47 修）：选中 Skill 节点时学习面板仍提示"先选 Skill"。

## 0.4.0-beta.45 — 2026-09-28 · 批次 N：把「字段可达性」钉成契约测试

beta.43 / beta.44 连着两个缺陷是**同一类**：**功能写了、测试绿了、产品里没有**。

- beta.43：边界循环把 Skill 类型标签吞了 → 阅读视图看不到 Skill
- beta.44：inspect 的折叠节点没带 `capabilityId` → Skill 三个 Tab 从未可达

两个都不是"组件写错了"，而是"**组件对，但产品到不了**"。组件测试看不见这一类。

### 做法：从客户端源码反推宿主契约

新增 `test/phase8-inspector-payload-contract.test.mjs`。它**不写死字段名**，而是：

1. 用正则从 `client.js` 里**扫出客户端实际读取的 `node.*` / `data.edge.*` 字段**
2. 把字段按节点形态分组（`collapsed` / `memberCount` 只在折叠分支里读）
3. 要求 `inspectRuntimeNode` / `inspectRuntimeEdge` **必须发送**这些字段

**新增一个客户端分支、而宿主没给字段，这个测试就会失败。**

### 扫描的两个必要修正（都暴露了我第一版的粗糙）

- `node.closest(...)` 是 **DOM API**，被正则误当成字段 → 加 DOM 成员排除表
- 第一版要求**所有**字段都存在 → 但 `collapsed` / `memberCount` 只在该分支里读，
  强制要求等于逼宿主发 `collapsed: false`（什么也没说）

### 另一个发现：我的 fixture 一开始不真实

第一版把折叠分组也放进了 `graph.nodes`，于是走了**普通路径**而不是折叠路径——
**恰好绕开了我要守的那个缺陷**。真实的折叠分组是**布局层合成**的，图谱里没有。

### 有效性已验证

移除 `capabilityId` → **2 项失败**；恢复 → **3 项全过**。

### 核对结果

| 路径 | 字段 |
|---|---|
| inspect 折叠节点 | 修好后齐备（beta.44） |
| inspect 普通节点 | **本来就齐备** |
| inspect 连线 | 客户端用的 5 个字段**全部齐备** |

所以这一缺陷是**折叠路径特有**的，不是系统性问题。

**299 项测试通过**（新增 3 项），**23 项契约检查通过**。

## 0.4.0-beta.44 — 2026-09-28 · 批次 M：Skill 的三个 Tab 此前从未出现过

### 发现

为了截「声明 ↔ 实际」与「学习验证」两个 Tab 的对照图，我给渲染台加了「点 Skill 节点 → 切 Tab」。
结果**找不到 Tab**。

追下去发现：`inspectRuntimeNode` 为**折叠节点**手工构造的 `node` 只有
`{id, kind, role, label, status, collapsed, memberCount}`——**没有 `capabilityId`**，
而 `capabilityId` 在 `src/dsh/host/index.js` 里**一次都没出现**。

客户端靠它决定 Tab：

```js
const isSkill = !isEdge && node?.capabilityId === 'skill'
const tabs = isEdge ? ['relation'] : (isSkill ? ['evidence','declaration','learning'] : ['evidence','relations'])
```

**所以 §15 要求的「运行证据 / 声明 ↔ 实际 / 学习验证」三个 Tab，在真实产品里从来没有出现过。**

### 为什么 296 项测试没发现

我在 beta.31「实现」了这三个 Tab，并写了测试——**测试用的是自己构造的载荷**，里面当然有
`capabilityId`。**测试验证的是组件的行为，不是产品能否到达那个行为。**

这与 beta.31 的白屏事故是同一类：**组件对，但它不可达。**

### 修复

折叠节点的 `node` 带上 `capabilityId` / `kindLabel` / `outcome`。7 行，无行为改动。

截图确认：选中 `skill × 1` 后，Inspector 出现 `[运行证据] [声明 ↔ 实际] [学习验证]`，且
「声明 ↔ 实际」能正确显示它的空状态说明。

### 顺带

渲染台新增 `skill-node` / `decl-tab` / `learn-tab` 三个动作，并支持多步 `act=a,b`。

**296 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.43 — 2026-09-28 · 批次 L：修好「运行流程里看不到 Skill」

beta.42 记下的那个未查明缺陷，本批次查明了。

### 定位过程

用**插桩副本**（`/tmp`，不动真实源码）在三个检查点各查一次 `view` 里还有没有 Skill：

| 阶段 | view | Skill 直接 | Skill 在分组里 |
|---|---|---|---|
| Turn 循环后 | 159 | 0 | **2**（`group:11:skill`、`group:14:skill`）✓ |
| Turn 区间折叠后 | 159 | 0 | **2** ✓ |
| **边界循环后** | **49** | 0 | **1**（`overflow:none`）← **在这里被吞** |

**根因**：边界循环把 `group:11:skill` / `group:14:skill` 并进一个 `capabilityId: 'mixed'` 的
`overflow:none`——**类型标签随之丢失**。而 published 的 `memberIds` 又会截到前 24 个，
Skill 常常落在截断之外，**UI 连"它在某个分组里"都无从得知**。

上一轮我猜的「Turn 区间折叠路径」**是错的**：区间折叠前后都是 2，它没碰 Skill。

### 修复

`visibleForBound` 把 **Skill 能力分组排除出边界循环**。能力分组的数量由 `Turn × 能力` 决定，
不是无界的；而它是**唯一**携带"这个能力跑过"这一信号的东西。

| 视图 | 改前 | 改后 |
|---|---|---|
| 运行图谱 | 2 个 `skill × 1` | 2 个 ✓ |
| **运行流程 40** | **0** ✗ | **2** ✓ |
| **运行流程 16** | **0** ✗ | **2** ✓（22 节点） |

### 回归测试

新增 `test/phase8-skill-survives-aggregation.test.mjs`（3 项）：

- §8 三种流程预算下都必须渲染出 `capabilityId: 'skill'` 的节点，且不得落进 `mixed`
- §36 保护 Skill **不能**让尺寸边界失效（真实会话实测 16 → 22，即 `nodeLimit + 6`）
- §32 合并桶不得引用另一个桶的 id（成员链不得断）

**测试有效性已验证**：回退修复 → 2 项失败；恢复 → 3 项全过。

fixture 按真实会话形状构造（每 Turn 14 次调用，让 `collapseTurn` 触发）——**否则复现不出这个
缺陷**：我第一版 fixture 每个 Turn 只有 4 次调用，Skill 是直接调用而非能力分组，测试根本抓不到。

**296 项测试通过**（新增 3 项），**23 项契约检查通过**。

## 0.4.0-beta.42 — 2026-09-28 · 批次 K：修 overflow 分组的断链 + 一个未查明的缺陷

### 已修：溢出分组的成员链断裂

`mergeInto` 记录受害者时用的是它在 view 里的 id。**当一个受害者本身就是分组**（`skill × 1`
这类），记下分组 id 后再把分组删掉——**成员链就断在这里**。

实测一个 39 Turns / 644 Steps 的会话：修复前 14 个 overflow 分组里有 **24 个成员引用指向
已删除的分组**，修复后为 **0**。

溢出分组靠 `memberIds` 说明「我代表了哪些调用」，断链会让 Inspector 报出无法解释的成员。

### ⚠️ 未查明：运行流程里看不到 Skill

**这个缺陷比本批次修的更重要，而且我还没找到它的位置。**

实测（同一会话，2 次 `character-asset-kit` 加载，turn 11 / turn 14）：

| 视图 | 节点 | Skill 直接呈现 | 在分组里 | 在 overflow 成员里 |
|---|---|---|---|---|
| 运行图谱 | 195 | 0 | **2** ✓ | — |
| **运行流程 40** | 40 | 0 | **0** ✗ | **0** ✗ |
| **运行流程 16** | 20 | 0 | **0** ✗ | **0** ✗ |

流程 40 的实际分层：`L0 会话 / L1 12 个 Turn 区间 / L2 4 个 cli + 9 个 mixed / L3 14 个调用`
——**没有任何一层出现 `skill`**。

**已排除**：`turnNodeLimit`、`maxRowsPerColumn`（改它们不影响）；overflow 的断链（修好后仍丢失）；
"聚合逻辑忽略 `skill.invocation`"（那是错的——`runtime-events.mjs:441` 一直在处理它，我一度
加了重复分支并覆盖了正确的 `invocationType`，三个测试立刻失败，**已完整回滚**）。

**未排除**：Turn 区间折叠路径。Skill 所在的 turn 11 / turn 14 落进 `Turn 9–11` 与 `Turn 12–14`
两个区间里，嫌疑在区间折叠时没有把成员的调用 id 带上。

**我没有继续改**：这需要通读区间折叠的完整路径，而当时上下文已不足以支撑"改完还能验证"。
**在上下文将尽时改聚合逻辑，风险是让整个运行流程空白。**

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.41 — 2026-09-28 · 批次 J：让运行流程在 100% 下可读

### 一个被实测纠正的判断错误

上一轮我把「每列行数」从 7 提到 16，理由是"布局变窄、宽度放得下"。**结果是缩放从 61% 掉到 49%**——

**`fitView` 同时适配宽和高。** 我把布局变高，它就缩得更小。方向完全反了。

### 真正的问题：节点太多，不是布局太宽

实测（39 Turns / 644 Steps 的真实会话，视口约 1130×700）：

| 参数 | 结果 | fitView |
|---|---|---|
| 40 节点 / turn 12 / rows 7 | 1650× 921px | 0.68 文字读不了 |
| 21 节点 / turn 6 / rows 6 | 1182× 796px | 0.88 临界 |
| **20 节点 / turn 5 / rows 5** | **1182× 671px** | **0.96 ✓** |

**40 个 115px 高的节点不可能既全部可见又 100% 缩放。** preview 能做到是因为它只有 **11 个节点**（930×760 舞台）。

**所以 preview 的本质不是「一屏看全」，而是「节点在 100% 下可读」**——按后者定预算，而不是按画布大小猜。

`FLOW_NODE_LIMIT` 40 → **16**；`FLOW_TURN_LIMIT` 12 → **5**；新增 `FLOW_ROWS_PER_COLUMN = 5`。运行图谱保持不变。

改后读数 **97%**，20 个节点全部可读。

### 另外：Inspector 的 Runtime 关联改为「能力名 + 状态标签」

preview 每行是 `Read files` + `Observed` 标签；实现此前显示事件类型 + 事件 id。**状态标签才是用户要读的东西**——它区分「观测到的」与「只是候选」。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.40 — 2026-09-28 · 批次 I：Inspector kicker + 键盘可达 + 过渡 + 交互态截图

### Inspector 顶部 kicker

preview 在检查器顶部先说明「现在看的是什么」。补上：

```
当前节点          ← 新增
skill × 1
group · 证据 observed
[运行证据] [关联关系]
```

节点显示「当前节点」，关系显示「当前关系」（§14 Contextual）。

**实现方式刻意选了零括号增量的做法**——只往已有的参数列表里插入一个同级元素。上一轮我停手就是因为不想在上下文将尽时做括号配平；这次找到了不需要配平的写法。

### 键盘可达与过渡

- `.st-flow-node:focus-visible{outline:2px solid var(--st-brand);outline-offset:2px}` —— preview 有，实现此前没有
- 过渡 160ms：preview 自己**没有**过渡，但 objective 明确要求「过渡动画」，且状态瞬变（hover / 聚焦降权 / 回放）会读成「画面闪了一下」

### 补齐五个交互态截图

`focus` / `replay` / `filter` / `loading` / `error` —— 审计清单里此前缺的这一组，现在都有真实截图。

### 关于「是否有别的写入者」

我自查了：文件修改时间与我的写入一致，**没有发现第二个进程**。最可能的解释是**你在两轮之间自己编辑过文件**（`ReceiptRow`、图例 CSS 的现象与此吻合）。

据此我改变了做法：**提交前逐块 review `git diff`，不再直接 `git add -A`**。本轮 diff 确认为 12 行新增、无意外改动。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.39 — 2026-09-28 · 批次 H：画布工具栏对齐

### React Flow 的 `<Controls>` → preview 式的横排工具栏

| | preview | 改前 | 改后 |
|---|---|---|---|
| 形状 | 左上**横排** `− 100% ＋ ⌂` | React Flow **竖排**图标 | 左上横排 `− 61% ＋ ⌂` |
| 缩放读数 | **有** | **没有** | 有 |

**缩放比例不是装饰。** 用户判断"我现在看的是全局还是局部"靠的就是这个数字。上一轮我靠推算得出 `fitView` 把布局缩到约 61%——现在它直接显示在界面上，用户不用猜。

### 又一次被渲染冒烟测试拦住

```
TypeError: useViewport is not a function
  FlowCanvas threw on variant 0
```

`useViewport` 在 `@xyflow/react` 12.12.0 里**确实存在**（我单独验证过）；是**测试的 require 桩**没有它。已补上。

**这是这一层第二次拦住我**（上一次是 `KIND_LABELS`）。两次都是"我以为某个符号可用"，两次都是 `node --check` 通过、字符串断言通过、只有真渲染才抛。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.38 — 2026-09-28 · 批次 G：连线语义对齐

审计 E1——画布上唯一还没对齐的视觉语义。

### 数值整体细了一档

实测两边的线宽与虚线节距：

| | preview | 改前 | 改后 |
|---|---|---|---|
| 默认线 | `#a9b1bd` / **2px** | `#cbd5e1` / 1.2px | `#a9b1bd` / **2px** |
| 失败线 | `var(--error)` / **2.2px** | `#b91c1c` / 1.5px | `var(--st-error)` / **2.2px** |
| 虚线节距 | **6 6** | 5 3 | **6 6** |
| 聚焦高亮 | 2.6px | 2.6px ✓ | 2.6px |

**改前比 preview 细一档，所以画布上的连线读起来像发丝**——尤其在缩放到 60% 之后几乎消失。

### 颜色从硬编码 hex 改为语义变量

`#cbd5e1` / `#b91c1c` 这种硬编码在宿主提供 Token 时**无法被覆盖**。改为：

```
--st-edge      → var(--dsw-alias-border-strong, #a9b1bd)
--st-subagent  → var(--dsw-alias-warning, #c2410c)
--st-error     → var(--dsw-alias-danger, #c9444f)
```

与 §25.3「宿主 Token 优先，实现值为回退」一致。

**293 项测试通过**，**23 项契约检查通过**。

## 0.4.0-beta.37 — 2026-09-28 · 批次 F：Inspector 区块化

对照图里最大的一块（审计 I3）。

### 平铺字段 → preview 的三段结构

| | 改前 | 改后（= preview） |
|---|---|---|
| 结构 | 7 个 `st-rt-field` 平铺，无标题 | **三个 `section > h3`**：`运行摘要` / `RUNTIME 关联` / `当前说明` |
| 运行摘要 | 无 | **label/value 栅格**（节点类型 / 状态 / 角色 / 代表 / 支撑事件） |
| 说明文字 | 与字段混在一起 | 归入`当前说明`，语义/边界/折叠成员各占一段 |

**信息层级靠分组建立，不靠增加字段。** preview 的 Inspector 之所以读起来清楚，是因为它先分组再放内容。

### 顺带的过程记录

改完第一次跑测试，**真实渲染冒烟测试立刻失败**：

```
ReferenceError: KIND_LABELS is not defined
  FlowCanvas threw on variant 0
```

`KIND_LABELS` 定义在 `runtime-flow.js` 里、**没有导出**，我在 `client.js` 里直接用了。已改为本地的 `INSPECT_KIND_LABELS`。

这正是那条约束的价值——**源码字符串断言看不见这个，只有真渲染才会抛。**

### 仍未处理

- Inspector 顶部的 `当前节点` kicker（preview 有；实现没有。**我知道怎么加，但需要精细的括号闭合，不在上下文将尽时做**）
- `Runtime 关联` 的每一行在 preview 里带 `Observed` / `Candidate` 状态标签；实现只显示事件 id
- 画布工具栏仍是 React Flow 的竖排，无百分比
- `fitView` 下的画布缩放

**293 项测试通过**，**23 项契约检查通过**。

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
