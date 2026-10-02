# DSH Skill Intelligence（DSH Skill 智能实验室）项目执行规则（Agent 入口）

> 本文件是 Agent 进入本项目的**第一读物**：只说「怎么在这个项目里干活」和「哪些不能动」。
> 产品需求 `spec/PRD.md` · 技术设计 `spec/SDD.md` · 视觉与组件规格 `design.md`
> · 实现细节 `docs/ARCHITECTURE.md` · 发布步骤 `docs/RELEASE.md` · 历史规格 `docs/archive/`
> **最后更新：2026-10-05**（知识库治理：根目录只留入口，`spec/` 收拢当前版 PRD 与 SDD；§1 的数字与它同步）
>
> **产品名：DSH Skill 智能实验室（DSH Skill Intelligence）。** npm 包名与插件标识仍是 `dsh-skill-trace`
> （已发布，不改）；`/skill-trace/*` 路由、模块名、`[data-plugin="dsh-skill-trace"]` 与 storage 结构属于
> 技术层 **Skill Trace**，同样不随品牌改名。

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
| 插件包版本 | **`0.7.0`**（`package.json`）· tag `v0.7.0` · 2026-10-02 · **GitHub Release 与 npm 都已发布** · 发布提交 `5fac5d9`；上一版 `0.6.1`（发布提交 `b3bc500`） |
| 上游仓库 | `https://github.com/PolinniZhong/dsh-skill-intelligence`（分支 `main`；2026-10-02 由 `dsh-skill-trace` 改名，旧地址自动重定向） |
| npm | **`beta` 与 `latest` 都指向 `0.7.1`**。npm 包名仍是 `dsh-skill-trace`（品牌迁移不改包名）。`0.5.0` 与 `0.6.0` **只在 GitHub**，因此 npm 的版本号是从 `0.4.0-beta.66` 直接跳到 `0.6.1`，再到 `0.7.0`、`0.7.1` |
| 测试 | **429 项全绿**（`npm test`，`pretest` 会先重建 `dist/client.js`） |
| 静态守卫 | **23 组**（`npm run verify`，见 §6.3） |
| 客户端 | `src/dsh/client/client.js` **2339 行**，bundle `dist/client.js` **129315 字节** |
| 宿主机面 | **10 条路由**，全在 `src/dsh/host/index.js`，由守卫按字面钉住（`docs/ARCHITECTURE.md` §Host surface） |
| 运行时依赖 | **`dependencies` 为空**；`devDependencies` 只有 `esbuild`；`peerDependencies` 只有可选的 `@deepseek-ai/dsh-llm`（翻译用） |
| 当前信息架构 | **SDD v0.6**：一级页面收敛为「本次 Skill」「已安装 Skill」，运行流程 / 运行图谱 / 收据页 / 上下文检查器 / 学习工作台 / 备份导出**已删除**（删除记录见 `docs/ARCHITECTURE.md` 末节）。v0.7 **没有新增一级 / 二级页面** |
| 详情页四层 | 框架（结构 + 声明流程 + 渐进披露）→ 本次运行逻辑 → 步骤证据 → `SKILL.md`，顺序由守卫按字面匹配 |
| v0.7 新能力 | 已安装卡片可点进详情 · 中文阅读版落盘（`GET`/`DELETE /skill-trace/translation`） · 复刻 Skill（`POST /skill-trace/clone`） |

---

## 2. 现在在做什么

**维护阶段：不再加页面，只把已发布的那几层做对。**

v0.6 之后的三轮改动都有一条同样的判据：**界面上说的每一句话，要么来自 `SKILL.md` 的声明，要么来自本次会话确实观察到的事实**，两者不许互相推导。

- `039e275`：GFM 表格真渲染 + 翻译表格结构校验。
- `0.6.0`（已发布）：**「Skill 框架」不再等于那条 `01 → 02 → 03 → 04`** —— 框架改由 `src/core/skill-framework.mjs` 从正文**确定性**解析出组成结构；`detail.flow` 降级成它的子模块；新增「渐进披露」（声明资源 ≠ 已读取资源）、「本次运行逻辑」（五段只列可观察事实）、「步骤证据」（`detail.flow.steps[].evidence` 第一次被显示）。
- **`0.7.0`（已发布：GitHub Release + npm，发布提交 `5fac5d9`）**：三条新能力——已安装卡片整张可点进详情、中文阅读版**落盘为本机资产**（键不含会话）、**复刻 Skill**（详情页唯一的对象级动作）。真机 17 步验收已过（`CHANGELOG.md` `### 九`）。
- **`0.7.0` 之后的五轮纯界面收口**（`CHANGELOG.md` `### 十`–`### 十三`）：顶栏 68 → 48px 且不画底色与分隔线、状态行只在有话要说时出现、搜索框搬进顶栏、分段控件选中态只留字色与字重、卡片描述统一截到 4 行、元信息行钉在卡片左下角、两个一级列表从同一个位置开始。**信息架构一次没动。**

**下次动手前的判据**：如果一个新的展示元素需要模型调用来「总结」Skill 的结构，**就不要做**（§6.8）。如果它需要在界面上说「已执行 / 已完成 / 已加载 / 已读取」，**就不要做**（§6.7）。

---

## 3. 每次任务的必读顺序

1. **本文件**
2. `spec/PRD.md` —— **产品语义的唯一权威**：目标、业务对象、状态语义、范围与验收标准
3. `spec/SDD.md` —— **当前架构的唯一权威**：分层、10 条路由、数据流、存储与隐私、模块清单
4. `README.md` §「当前状态」 —— 对外口径的现状（发版后必须同步，见 §9.1）
5. `docs/ARCHITECTURE.md` —— 运行时那条链的深读：事件 → 收据 → 定义视图，以及布局合同
6. `CHANGELOG.md` 顶部那一段 —— 这一版到底改了什么、为什么
7. 按任务类型再读一份：
   - 改界面 → `design.md`（视觉规格与组件表）+ `spec/PRD.md` 的 `FR-UI-*`
   - 改证据 / 对齐 → `docs/ARCHITECTURE.md` §Evidence model、§Correlation and provenance
   - 查历史规格 → `docs/archive/`（**是历史，不是权威**）
   - 要发版 → `docs/RELEASE.md`（**照做，不要凭记忆**）

> 只改代码的话，最少读 **1 → 3**。改之前先 `npm test`（**429 项**，必须全绿）。

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

- `01_重构方案/` 是**本地过程目录，被 `.gitignore` 排除、不随仓库发布**（`01_重构方案/README.md` 自己写着）。里面的 SDD / 设计 / 原型 / 渲染台是历史材料，**不要拿它当当前实现**。
- **`docs/archive/` 是历史，三份原文都已冻结、不再回写**：`requirements-v0.7-full.md`（v0.7 及以前的全量 PRD，含 §6 历史范围与 §18 修订记录）、`technical-design-v0.1-v0.5.md`（V0.1–V0.5 的技术设计，只有 §0 作时效性说明）、`product-thesis.md`（产品命题初稿）。**改产品措辞要改 `spec/PRD.md`，不要回改这三份。** 它们之间以及它们对根目录的链接已失效，这是归档的代价，不是待修的缺陷。
- **所有日期都可能比机器时钟靠前**：`date` 与 `git log` 报的是同一天，而文档里写的是后一两天（例如逐条修订记录上的 `2026-10-05`，而当天是 `10-02`）。发版时以 **`git log` 的时间戳**为准，别照抄规格里的日期。
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

`npm run verify` 的 23 组断言全是**源码文本层**的：它们钉住路由字面、必须出现在界面里的句子、不许出现的词、CSS 的数值区间、组件的顺序。**改文案或挪组件都可能让守卫红**，这是设计而不是阻碍——每一条红都对应一次真实事故。

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
- **§22 顶栏高度固定 48px，且既不画自己的底色、也不画自己的分隔线**（2026-10-05 由 68px 收到 48px；见 `design.md` §6.1），**§8.2 详情事实列 280px**，**§9.3 文档目录 170px**：`grid-template-columns` 是按字面匹配的。

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

所以**新的 core 模块要么无依赖，要么只用单行具名 import**。当前客户端 require 的是**七支**：
`installed-view.mjs` / `translation-cache.mjs` / `markdown-table.mjs` / `skill-clone.mjs` /
`flow-evidence.mjs` / `skill-framework.mjs` / `skill-runtime-logic.mjs`。
（`skill-clone.mjs` 是 v0.7 加的第七支，本文此前一直写着六支。）
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
- **新路由**：宿主只有 **10** 条，由守卫按字面钉住；15 条已删路由同样被反向钉住。
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
cd "/Users/zhongwentuo/DeepSeek Harness Native/10_DSH_Skill_Trace"

node --check src/dsh/client/client.js   # 改过 CSS/客户端源码先过这一关
npm test                                # 必须 429 全绿（pretest 会重建 dist）
npm run verify                          # 必须 23 组 OK
```

改界面的，再加一层：`01_重构方案/render-harness/`（本地，不发布）用**真实客户端 bundle + 真实会话载荷**截图核对。

### 9.1 发版后别忘了更新「知识库入口」

**本文件 §1 + `README.md` §「当前状态」是知识库入口** —— 给外人 / 新会话交代「这是什么、现在到哪一步」。

**每次发版后顺手改六处（五分钟）**：

1. 本文件 §1 的**版本 / 测试数 / bundle 字节 / 客户端行数**；
2. `README.md` §「当前状态」的「当前公开版为 `x`」+ 版本史里那一条 `- **Unreleased**` 换成版本号；
3. `CHANGELOG.md` 的 `## Unreleased` 标题换成 `## x — YYYY-MM-DD · 一句话`；
4. `docs/RELEASE.md` 的「当前待发布版本」与「本次发布的起点」表；
5. **`spec/PRD.md`** 头部版本号 + 它里面写死的测试数 / 行数 / 字节数；
6. **`spec/SDD.md`** 头部版本号 + §模块清单的行数表（`wc -l` 重跑，行数变了就要改）。

> **判据：凡是「状态类」的字**（版本号、测试数、❌/✅、「还没做」）**，改完动作就要回头改它。**
> `RELEASE_ASSETS_IN_SYNC_OK` 只钉住 README 的版本行与 `github:` 安装示例的 `#v…` 锚点，
> **它管不到上面这几处**——第 5、6 条尤其容易漏，因为 `spec/` 里的数字是写死在正文里的。

### 9.2 真机验收清单（改完界面至少过一遍）

用**复杂 Skill**（`ui-craft`：342 行 / 11 小节 / 39 个引用），不要用四步的示例：

- [ ] 一级页面两个，点进同一个详情页，返回键写明是从哪个列表进来的
- [ ] **Skill 框架**标题右侧是「N 个小节 · M 步声明流程」，不是「共 4 步」
- [ ] 八个角色模块只显示**真的存在**的角色，缺的走一行「`SKILL.md` 里没有可识别的模块：验证 · Verification」
- [ ] 「声明流程」在**框架内部**，是子模块，不是框架本身
- [ ] 「渐进披露」显示「声明引用 N 个 · 已读取 **0** 个」，资源按 Tier 分层，每行带 `SKILL.md` 自己写的那句「什么时候读」
- [ ] 「本次运行逻辑」五段，每段有状态与**真实事实**（Skill 数 / 载入位置 / 指纹）
- [ ] 「步骤证据」每个声明步骤一行；没有证据的那几行只有一句「没有可展示的证据引用」
- [ ] `SKILL.md` 在**最下面**
- [ ] 界面里**任何位置**都没有「已执行 / 已完成 / 执行成功 / 已加载 / 已读取 references/…」
- [ ] 文档里的表是**真表格**（带边框），不是一列竖线
- [ ] 点框架小节 → 滚到 `SKILL.md` 对应章节并高亮；合成小节**不可点**

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
| `scripts/verify-project.mjs` | 23 组源码文本守卫（见 §6.3） |

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
│   └── SDD.md                ← **当前架构的唯一权威**（模块清单 / 10 条路由 / 数据流）
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
│   ├── dsh/host/index.js     ← 宿主半边：10 条路由、事件观察、持久化
│   ├── dsh/client/client.js  ← 整个客户端（一个工厂闭包）
│   └── storage/              ← 收据与偏好
├── dist/client.js            ← 构建产物，**提交进仓库**
├── scripts/
│   ├── build-client.mjs      ← esbuild 打包
│   └── verify-project.mjs    ← 23 组守卫
├── test/                     ← 429 项
└── 01_重构方案/              ← 本地过程目录，**.gitignore 排除，不发布**
```

> 根目录只放**入口**：`AGENTS.md`（怎么干活）、`README.md`（对外口径）、`CHANGELOG.md`（这一版改了什么）、
> `design.md`（界面规格）。规格正文在 `spec/`，实现深读在 `docs/`，历史在 `docs/archive/`。
> **不要再往根目录加 `.md`** —— 2026-10-05 之前那种 `NN-xxx.md` 编号约定已经退役，
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
cd "/Users/zhongwentuo/DeepSeek Harness Native/10_DSH_Skill_Trace"

# 1. 三处版本号必须逐字相同：package.json / README「当前公开版为」/ CHANGELOG 标题
git status --porcelain
node scripts/build-client.mjs
npm test && npm run verify

# 2. tag 名 = package.json 的版本（带 v 前缀），打在 main 顶端
git add -A && git commit -m "release: vX.Y.Z — 一句话主题"
git tag -a vX.Y.Z -m "vX.Y.Z"

# 3. 推送；HTTP2 framing 报错时降级重试，不要换通道
git push origin main && git push origin vX.Y.Z

# 4. 回读核对
git rev-parse origin/main && git ls-remote origin refs/tags/vX.Y.Z
```

- **`RELEASE_ASSETS_IN_SYNC_OK` 会钉住** README 的「当前公开版为 `x`」与 `github:` 安装示例的 `#vx` 锚点。曾经 README 落后 49 个版本。
- **npm 安装示例锚定的是 npm 上真实存在的版本。** 发版前 README 必须**明说还没发布**（`0.7.0` 发版前就是这个状态：`beta` 与 `latest` 都指向 `0.6.1`，`v0.7.0` 的 tag 也没推，安装小节写着「发版前这条命令取不到东西」）。**换成已发布口径的那次提交，必须排在 `npm publish` 之前** —— npm 包页渲染的 README 是发布当时那份快照，反过来做的代价是包页带着一句「尚未发布」活到下一版（`0.4.0-beta.64` 那次就是这样）。发布范围历来不一致：`0.5.0` / `0.6.0` 只在 GitHub，`0.6.1` 与 `0.7.0` 是 GitHub + npm。
- **`npm publish` 从本地 `git HEAD` 读 `gitHead`。** 先发后推、或用 Git-data API 推（会生成不同 sha）会留下**永远 404** 的 commit 链接。**顺序是硬规则：先推成功 → 确认本地/远端对齐 → 最后才 publish。**
- **tag 打在发布提交上**（推送时 `main` 的顶端）。历史上 `bc78e53` 的 tag 落在 `HEAD` 之前 9 个提交处，照 commit message 找位置会漏掉之后 9 个提交。
- GitHub Release 的正文**直接从 CHANGELOG 取**，不要另写一份——两份说明一定会漂移。

## 附录 B：客户端路径在启动时解析，文件在请求时读取

| 阶段 | 行为 |
|---|---|
| 宿主启动 | 解析 `package.json` 的 `exports['./client']`，记下**路径字符串** |
| 浏览器请求 | 读该路径**当时的**文件内容 |

插件在宿主运行期间被换版、且新旧版本的 `./client` 指向**不同文件**时，宿主仍记着旧路径，而该文件已被换成不带 `window.__ModuleLoader__.load({...})` 注册包装的普通模块 → 外壳原样发给浏览器 → **它从不注册 → 插件界面静默消失**。

> **安装 / 替换插件后必须立即重启宿主。中间的窗口期插件界面会消失。这不是可选步骤。**
