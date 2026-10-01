# DSH Skill Trace · 软件设计文档（SDD）

> **当前版本**：`dsh-skill-trace@0.7.0`（`package.json`）
> **这份文件是什么**：本插件**唯一一份描述当前实现**的技术设计 —— 分层、运行架构、宿主接口面、数据流、存储与隐私、模块清单、契约守卫、验证边界。
> **目录定位**：
> - **`spec/SDD.md`（本文件）= 当前架构的唯一权威。** 分层、10 条路由、数据流、存储与隐私、模块清单都以此为准。
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
| D1 | `src/dsh/host/index.js` translate 路由的注释 | 原文写「这里刻意**不**落盘……§12.4 要求译文只存在页面运行时内存里」 | 同文件 `saved: await persistTranslation({...})`，v0.7 起译文落盘 | **已修（2026-10-05）**：注释改成 v0.7 的事实——落盘为本机资产、键不含会话，同时保留不写 receipt / 不动偏好 / 不读正文三条 |
| D2 | `src/dsh/host/index.js` catalog 路由的注释 | 「名字暂用 `/installed` 而不是 SDD §16 写的 `/catalog`」 | 路由字面早就是 `/skill-trace/catalog`，「我的 Skill」工作台也已在 `0.5.0` 删除 | **已修（2026-10-05）**：那段「等改名收口」的注释删掉了，它会让后来的人以为还欠一次改名 |
| D3 | `docs/ARCHITECTURE.md` 模块表 | 写「the seven routes」 | 宿主有 **10** 条路由 | **已修（2026-10-05）**：改成「the ten routes」 |
| D4 | `docs/archive/technical-design-v0.1-v0.5.md` §0 | 宿主只注册 **7 条**路由、客户端约 1500 行 / 约 62 KB、`src/core/` 20 个模块约 6164 行 | 10 条 / 2332 行 / 129280 字节 / 24 个模块 7342 行 | 归档只作追溯，本文件不复用这些数字 |
| D5 | `scripts/verify-project.mjs` 末尾 | `console.log('FIVE_LAYER_MODEL_OK')` / `console.log('FINGERPRINT_RESERVED_OK')` 两句声称两条契约成立 | 两句之前**没有任何断言**。`FIVE_LAYER_MODEL_OK` 守的模块（`src/core/runtime-layout.mjs`、`src/dsh/client/runtime-flow.js`、`test/phase8-five-layer-model.test.mjs`）在 v0.6 删运行图谱画布时一起删了，marker 却留了下来 | **已修（2026-10-05）**：`FIVE_LAYER_MODEL_OK` 删掉（它守的界面不存在了）；`FINGERPRINT_RESERVED_OK` 补上真断言；新增 `GUARD_MARKERS_ARE_BACKED_OK` 反向检查每一个 marker 之前是否有断言。见 §13.1 |
| D6 | `AGENTS.md` §6.6 | 客户端 `require` 的 core 模块列举了 6 支 | 实际 `require` **7** 支（多一支 `skill-clone.mjs`，见 §10.3） | **已修（2026-10-05）**：本文改成七支并列出全部七个 |
| D7 | `spec/PRD.md` | `AGENTS.md` §4 把它列为产品语义权威 | 写本文件时 `PRD.md` 尚未落盘 | **已消解**：`spec/PRD.md` 已落盘（692 行），本文件与它互为产品/技术两侧 |

---

## 1. 技术结论与分层

### 1.1 一句话架构

一个 DSH 插件包，含**两半**：

- **宿主半边**（`src/dsh/host/index.js`，1110 行）：订阅会话事件、归约出本地收据、把收据与「现读的 Skill 定义」投影成 **10 条 `GET`/`POST`/`DELETE` 路由**（全部挂在 `/skill-trace` 前缀下）。
- **客户端半边**（`src/dsh/client/client.js`，2332 行，构建产物 `dist/client.js` 129280 字节）：一个 React 工厂闭包，注册进 DSH 的 `conversation.view` slot，只调那 10 条路由，不持有收据本体。

纯函数逻辑放在 `src/core/`（24 个模块，7342 行），落盘放在 `src/storage/`（4 个模块，694 行）。**`src/core/` 与 `src/storage/` 都不认识 DSH 会话对象**——它们只吃普通数据结构。

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
- 客户端注册 `conversation.view` slot 与 locale 命名空间 `dsh-skill-trace`（静态键走 `zh`/`en` 字典，动态模板走显式 locale 分支）。

### 2.3 修改后必须做什么（两条硬约束）

| 改了哪一侧 | 生效条件 | 原因 |
|---|---|---|
| `src/dsh/host/index.js` 或任何 `src/core/*.mjs` | **必须重启 DSH** | 宿主把模块读进内存后不会自动换；不重启打接口得到的是**旧答案**，而且它答得很正常、不报错。探针：`curl -s "http://127.0.0.1:3080/skill-trace/catalog?sessionId=probe"` |
| `src/dsh/client/client.js` | **硬刷新浏览器** | 浏览器跑 `dist/client.js`，插件本身不缓存 |

另外，宿主启动时只解析 `package.json` 的 `exports['./client']` 记下**路径字符串**，浏览器请求时才读该路径当时的内容 ⇒ 插件在宿主运行期间换版后必须立即重启，否则插件界面会静默消失（外壳发出一个没人注册的模块）。

---

## 3. 宿主接口面（10 条路由）

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

**会话作用域的三条判据**（v0.7 新增路由为什么这样定）：

1. `GET`/`DELETE /skill-trace/translation` **刻意不带 `sessionId`**：中文阅读版是按内容键的资产，不是某次会话的产物；把会话放进请求里既让缓存无法复用，又暗示了错误的生命周期。
2. `/skill-trace/catalog` 虽然要 `sessionId`，但只用它解析 registry（`registryContext`），与「本次会话发生过什么」无关。
3. `/skill-trace/clone` 的 `sessionId` 只用于解析 registry 与 `cwd`，复刻本身**不挂到这次会话**（响应里 `clone-is-not-attached-to-this-session`）。

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

**4. `GET /skill-trace/catalog`** —— `registry && liveAgent ? await buildCatalogSnapshot(registry, cwd, liveAgent) : null`，再 `installed: buildInstalledView({catalogSnapshot, query})`。**不读收据**，也不把学习状态带回来。发现不完整是**事实**：`buildCatalogSnapshot` 把 registry 抛错与并发改动收敛成 status，`buildInstalledView` 再把它写成 `coverage`（`complete` / `incomplete` / `unknown`）。`query` 经 `optionalSearchQuery`（≤500 且无控制字符，否则 `'searchQuery 无效'`）。

**5. `GET /skill-trace/skills`** —— `buildSkillListLookup(registry, receipt, cwd, liveAgent)` → `{ok, sessionId, workspaceLabel, list: buildSessionSkillList(receipt, {lookup})}`。registry 只对**收据里已出现过的名字**查询（registry 能发现但本次会话没加载的 Skill 不会漏进列表），次数上界 `SKILL_LIST_LOOKUP_LIMIT = 50`，失败降级为状态 —— 「丢掉了描述的列表仍然是一个诚实的列表」。列表**必须嵌在 `list` 字段**里，客户端对应地用 `body?.list ?? null` 解包；这一对字面由守卫成对钉住。

**6. `GET /skill-trace/skill`** —— 和 `definition` 一样现读正文，并 `list.skills.find((entry) => entry.name === skillName) ?? null` 取 `listEntry`：

```js
// → { ok, sessionId, workspaceLabel, list, skill: buildSkillDetail({ receipt, view: definition, skillName, listEntry }) }
```

`list` 随详情一起返回，是为了让返回键知道「用户是从哪个列表进来的」。

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

### 3.3 请求与响应的公共约定

- 响应头由 `sendJson` 统一写：`content-type: application/json; charset=utf-8`、`content-length`、`cache-control: no-store`、`x-content-type-options: nosniff`。
- 请求体由 `readBody(req, maxBytes = 32 * 1024)` 读；超限 `'请求体过大'`，非 JSON `'请求体不是合法 JSON'`。
- 校验器（全部返回规范化后的值，或抛中文错误）：
  - `requiredSessionId`：非空字符串且 ≤ 240 字符，否则 `'sessionId 必填'`；
  - `requiredSkillName`：`/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/`，否则 `'skillName 无效'`；
  - `requiredSourceSha256`：`/^sha256:[a-f0-9]{64}$/`，否则 `'sourceSha256 无效'`；
  - `optionalTargetLanguage`：空 → `DEFAULT_TRANSLATION_LANGUAGE`，否则 `.slice(0,40)`；
  - `optionalEntryId`：`null`/`''` → `''`，否则 ≤512 且无控制字符，错误 `'entryId 无效'`；
  - `optionalSearchQuery`：≤ 500 且无控制字符，错误 `'searchQuery 无效'`。
- 收据**永不出宿主**：`publicReceipt(receipt)` 是白名单投影，字段闭集为

```
schemaVersion, receiptId, sessionId, createdAt, updatedAt, coverage, activity,
traceEvents[…], sourceSnapshots, runtimeEvents, runtimeEventOverflow,
catalogPublished, catalogPublicationCount, lineage, outputReferences,
learningNotes, validationResults, continuity
```

`traceEvents[]` 的投影再收一层：`eventId, sessionId, turn, step, skillName, status, invocationType, callId, callSeq, resultSeq, requestedAt, resolvedAt, consumer, consumerIdentity, coverage, errorCode, evidenceFingerprint, continuityCandidate, runtimeIdentity`。

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
React.createElement('div', { className: 'st-detail-main' }, framework, runtimeLogic, stepEvidence, docPanel)
```

守卫按字面匹配这四段的顺序，失败信息是：

```
the detail body must read 框架 → 运行逻辑 → 步骤证据 → SKILL.md, in that order
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

行数为 `wc -l` 实测（v0.7.0）。

### 9.1 `src/dsh/`（3 个文件）

| 路径 | 行数 | 职责 |
|---|---|---|
| `src/dsh/host/index.js` | 1110 | 宿主半边：10 条路由、事件订阅与归约编排、收据/偏好/译文三个 store、复刻的校验与回读、loopback 门禁 |
| `src/dsh/client/client.js` | 2332 | 整个客户端（一个工厂闭包）：两个一级页面 + 一个详情页 + 复刻对话框 + 整份样式表 |
| `src/dsh/client/package.json` | — | 把该目录标记为 `commonjs`（包根是 `type: module`），不依赖打包器的猜测 |

构建产物 `dist/client.js` 为 **129280 字节**，提交进仓库。

### 9.2 `src/core/`（24 个文件、7342 行）

| 路径 | 行数 | 职责 |
|---|---|---|
| `src/core/trace-reducer.mjs` | 1150 | 会话事件 → 收据：`reduceSessionEvent` / `emptyReceipt` / `migrateReceipt` / `rebuildReceipt` / `buildViewModels` / `carriesSkillEvidence` / `setRuntimeLineage` / `setSourceSnapshots` / `setTraceRuntimeIdentity` |
| `src/core/skill-translation.mjs` | 643 | 中文阅读版：分段、保护、校验、回退、指纹比对；**不落盘** |
| `src/core/runtime-events.mjs` | 590 | 运行事件模型：规范化、能力分类、重试派生、invocation 聚合 |
| `src/core/skill-framework.mjs` | 579 | 从正文确定性解析八角色框架、缺席角色、渐进披露 |
| `src/core/runtime-alignment.mjs` | 541 | 声明步骤抽取 + 与运行证据对齐；`scored: false` |
| `src/core/skill-runtime-scope.mjs` | 497 | 运行证据对「这个 Skill」的归属范围与边界 |
| `src/core/skill-view-model.mjs` | 342 | 列表/详情模型；`attachEvidenceToFlow`（运行时只能标注） |
| `src/core/runtime-graph.mjs` | 308 | 关联图谱：节点/边、优先级、丢弃计数；读时派生，不持久化 |
| `src/core/skill-definition.mjs` | 264 | 现读定义视图 + `compareDefinitionToRun` |
| `src/core/skill-flow.mjs` | 259 | 声明流程抽取（heading / ordered-list 两通道） |
| `src/core/repository-resolver.mjs` | 258 | 仓库来源解析（frontmatter / git origin / 用户配置），三态 |
| `src/core/skill-clone.mjs` | 213 | 复刻的纯逻辑：计划、frontmatter 改名、条目筛选、错误码 |
| `src/core/session-log.mjs` | 216 | 会话日志读取：找文件、多 frame zstd 解压、上限与路径穿越防护 |
| `src/core/definition-outline.mjs` | 202 | frontmatter 解析、标题规范化、outline 与锚点 |
| `src/core/runtime-evidence.mjs` | 195 | 唯一读取工具参数的接缝：命令/文件目标分类 |
| `src/core/source-snapshot.mjs` | 186 | catalog 快照与来源快照（名字、描述、白名单投影） |
| `src/core/markdown-table.mjs` | 129 | GFM 表格识别与结构签名 |
| `src/core/flow-evidence.mjs` | 126 | 证据词表五值、禁用词、标签（中文/英文） |
| `src/core/runtime-fingerprint.mjs` | 110 | §31 的**保留结构**：slot 全为 `null`，不派生 |
| `src/core/step-kind.mjs` | 88 | 步骤类型归类（inspect / edit / execute / delegate / consult / produce / plan / other） |
| `src/core/installed-view.mjs` | 72 | 已安装列表投影：**不读收据**，白名单 `{name, description, provider, invocation}` |
| `src/core/skill-clone-path.mjs` | 70 | 复刻目标根决议（纯函数）+ 三种 `pathKind` 映射 |
| `src/core/translation-cache.mjs` | 48 | 内存译文缓存：模块级 `Map`、`LIMIT = 8`、键含 `sessionId` |
| `src/core/skill-runtime-logic.mjs` | 256 | 本次运行逻辑五段：阶段 ID、事实、limitations |

### 9.3 `src/storage/`（4 个文件、694 行）

| 路径 | 行数 | 职责 |
|---|---|---|
| `src/storage/skill-clone-writer.mjs` | 297 | 复刻落盘：探测、`mkdir`（不带 `recursive`）、拷贝、回读、回滚；用 `node:fs/promises` 而不用 `ctx.fs` |
| `src/storage/translation-store.mjs` | 208 | 译文落盘：`0700`/`0600`、原子 `rename`、只增不覆盖的版本清理、禁止字段 |
| `src/storage/receipt-store.mjs` | 115 | 收据落盘：默认根 `~/.dsh/skill-trace/receipts`，文件名 `sha256(sessionId)`；`prune` 与原子写 |
| `src/storage/preference-store.mjs` | 74 | 机器级偏好：`PREFERENCES_VERSION = 3`、`DEFAULT_VIEWS = ['current','installed']`、回落语义 |

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
    └── SkillCloneDialog        560px，仅在打开时渲染，POST /clone
```

客户端**只调这 10 条存活路由**；它不持有收据本体、不持有图、没有草稿缓冲、没有备份状态。取不到东西时渲染 `TraceState`，而不是渲染一个空列表。

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

当前客户端 `require` 的 **7** 支：

| core 模块 | 用到的导出 |
|---|---|
| `flow-evidence.mjs` | `FLOW_DECLARATION_NOTE, FLOW_EMPTY_TEXT, FLOW_TRUNCATED_TEXT, FLOW_UNAVAILABLE_TEXT, STEP_EVIDENCE_HEADINGS, STEP_EVIDENCE_NOTE, flowEvidenceLabel, flowEvidenceState, flowKindLabel` |
| `skill-framework.mjs` | `DISCLOSURE_NOTE, FRAMEWORK_NOTE, FRAMEWORK_ROLE_LABELS, FRAMEWORK_ROLE_HINTS, FRAMEWORK_UNCLASSIFIED_LABEL` |
| `skill-runtime-logic.mjs` | `RUNTIME_LOGIC_NOTE` |
| `markdown-table.mjs` | `parseTableAt` |
| `installed-view.mjs` | `matchesInstalledQuery` |
| `translation-cache.mjs` | `readCachedTranslation, translationCacheKey, writeCachedTranslation` |
| `skill-clone.mjs` | `CLONE_MAX_BYTES, CLONE_MODES, CLONE_SCOPES, cloneTargetName, isSkillName` |

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

`dataRoot` 来自 `config.dataRoot`；`receipt-store.mjs` 的默认根是 `~/.dsh/skill-trace/receipts`。译文写盘一律「临时文件 + `rename`」。

### 11.2 明确不落盘 / 不外发的东西

1. **`SKILL.md` 定义正文**：现读现返，永不落盘（`docs/PRIVACY.md`）。
2. **工具参数与结果内容**：从不读取（§5.2）。
3. **绝对路径**：不外发。已安装投影只允许 `{name, description, provider, invocation:{modelInvocable,userInvocable}}`；复刻响应只给 `pathKind`。`skill-clone-path.mjs` 内部拿到绝对路径，但**绝对路径不出宿主**。
4. **`sessionId` 不进译文键、不进内存缓存之外的任何持久结构**；`translationStoreKey` 的实现体里连 `session` 这个词都不许出现。
5. **`learningNotes[]` / `validationResults[]` 是遗留数据**：只读、不迁移、不派生状态 —— 当前产品没有任何写入入口（既没有笔记路由，也没有验证结果路由，也没有编辑组件）。

唯一离开本机的东西，是用户在详情页主动点「中文阅读版」时**发给用户自己配置的模型 provider**的定义正文。

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

## 13. 契约守卫（23 组）

`npm run verify` 跑 `scripts/verify-project.mjs`（962 行）。这些断言全部是**源码文本层**的：它们钉住路由字面、必须出现在界面里的句子、不许出现的词、CSS 的数值区间、组件的顺序。**每一条红都对应一次真实事故。**

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

> **诚实记录（D5，2026-10-05 修）**：这份文件此前有**两个没有断言的 marker**。`FIVE_LAYER_MODEL_OK` 守的模块在 v0.6 删运行图谱画布时一起删掉了，marker 却留在输出里继续宣布契约成立 —— 正是同一份守卫文件在 `572-578` 行自己写下的那个反模式。处理方式分两种：**守的东西已经不存在 → 删掉 marker**；**守的东西还在 → 补上真断言**（`FINGERPRINT_RESERVED_OK`）。另外新增 `GUARD_MARKERS_ARE_BACKED_OK` 把这整类事故变成不可能的：它每次运行都会重新扫一遍本文件，任何「只有 `console.log` 没有断言」的 marker 都会让它红。组数仍是 **23**（删一、补一）。

### 13.2 守卫的写法纪律

1. **客户端文案断言跑在「去掉英文字典之后」的源码上。** 切分点是 `client.indexOf('  const EN = {')` 到 `client.indexOf('\n  }', dictStart) + 4`，`clientCode = client.slice(0, dictStart) + client.slice(dictEnd)`。**一句只活在 `const EN = { … }` 里的文案不算存在。** 曾有一批断言因为文案留在字典里而长期空转。
2. **不要断言一个已经不存在的页面。** 客户端契约**反向**钉住已删路由与已删函数（`buildRuntimeGraph` / `computeRuntimeLayout` / `buildCatalogView` 等）：**删掉的东西不许悄悄回来。**
3. **改守卫时问一句：这条断言失败过吗？把它写成 `true` 会怎样？** 「测试通过」不等于「测到了」。
4. **一个 marker 必须由同一段里的断言撑着。** 删断言块时，**在同一次改动里删掉它的 marker**；守的东西还在就补断言。这条纪律由 `GUARD_MARKERS_ARE_BACKED_OK` 自己执行，不靠记性。

守卫 `PROJECT_STRUCTURE_OK` 与 `CLIENT_CONTRACT_OK` 之间的分工也与这条纪律有关：前者管文件与包元数据，后者管界面真的写了什么。

---

## 14. 测试策略

### 14.1 规模与纪律

- `npm test` = `node --test`，**429 项全绿**是改动前的门槛；`pretest` 会先重建 `dist/client.js`，因此「跑测试」也顺带保证产物不 stale。
- `test/` 下 **37** 个 `*.test.mjs`（`ls test | wc -l` 计 38，含一个非测试条目）。
- 纯函数优先：`src/core/` 的模块都是可单独测的纯函数或纯数据模块，测试不需要起宿主。

### 14.2 测试文件分工

| 文件 | 管什么 |
|---|---|
| `test/layout-contract.test.mjs` | 样式表：根规则深度 0、高度链、无视口单位、花括号平衡 |
| `test/client-style-lifecycle.test.mjs` | 用**构建产物** `dist/client.js` + 假 document 验样式生命周期（插入、替换、移除） |
| `test/client-render-smoke.test.mjs` | 真实元素树 + 降级器；抓渲染期抛错与「界面真的写了什么」 |
| `test/client-hook-order.test.mjs` | `scanHookOrder(source)` 零违规 |
| `test/client-bundle.test.mjs` | bundle 契约（seed、externals、注册包装） |
| `test/phase15-skill-first-ia.test.mjs` | Skill-first IA 的 A1–A12（含锚点必须指向真实 outline entry） |
| `test/phase16-skill-framework.test.mjs` | 框架与运行逻辑的纯函数行为 + 禁用词 + 客户端必须真的引用每条 limitation |
| `test/phase17-skill-clone.test.mjs` / `phase18-clone-routes.test.mjs` / `phase18-skill-clone-writer.test.mjs` | 复刻：纯逻辑、路由契约、写入器（`mkdir` 不带 `recursive`、回滚、回读） |
| `test/translation-store.test.mjs` / `translation-cache.test.mjs` / `translation-segmentation.test.mjs` / `skill-translation.test.mjs` | 译文落盘、内存缓存、分段与结构校验 |
| `test/session-format-v4-contract.test.mjs` | V3 / V4 两种会话格式，**由真实捕获的 V4 事件构造** |
| `test/receipt-store.test.mjs` / `preference-store.test.mjs` / `source-snapshot.test.mjs` / `installed-view.test.mjs` / `markdown-table.test.mjs` / `flow-evidence.test.mjs` | 各纯模块 |
| `test/trace-reducer.test.mjs` / `phase0-*` / `phase1-runtime-model` / `phase2-*` / `phase3-alignment` / `phase8-fingerprint-and-thresholds` / `phase9-skill-runtime-scope` / `phase12-evidence-promotion` / `phase13-skill-run-audit` / `phase14-definition-view` / `phase25-v06-acceptance` | 证据模型、关联、对齐、范围、验收 |
| `test/host-policy.test.mjs` / `host-write-policy.test.mjs` / `host-session-log-contract.test.mjs` | 宿主策略：写盘门禁、隐私边界、日志恢复契约 |
| `scripts/verify-project.mjs` | 23 组源码文本守卫（§13） |

### 14.3 验证边界（诚实声明）

**单测与守卫全绿，不等于真机端到端通过。** 至少四类东西它们测不到：

1. **两帧才出现的错误。** 渲染烟测桩住 `useState`，只渲染数据已到达的那一帧；React #310 是在真实 DSH 里用 CDP 抓到的。
2. **CSSOM 层的效果。** 根规则是否真的生效、字号与高度是否真的对，只有读浏览器算出来的样式才知道（历史上的根规则嵌进 `@media` 事故就是测试全绿而桌面全错的典型）。
3. **宿主缓存造成的假通过。** 不重启打的接口答的是旧代码，而且答得很正常。
4. **真实 registry 与 watcher 的行为。** 目标根选择、写入稳定窗口、catalog 刷新，都依赖运行中的 DSH 环境。

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

### 16.3 未解决 / 待确认

- ~~§13.1 第 22、23 条 marker 没有断言（D5）~~ **已修**：`FIVE_LAYER_MODEL_OK` 删除、`FINGERPRINT_RESERVED_OK` 补断言、新增 `GUARD_MARKERS_ARE_BACKED_OK` 反向检查。
- ~~`src/dsh/host/index.js` 两条过期注释（D1、D2）与 `docs/ARCHITECTURE.md` 的「seven routes」（D3）~~ **已修**，连同 `AGENTS.md` §6.6 的六支 core 模块（D6）。
- `0.7.0` **尚未打 tag、尚未推送、尚未发布 npm**。README 的安装小节已经如实写明「发版前这条命令取不到东西」，但版本身份仍是未完成状态：`package.json` 是 `0.7.0`，npm 的 `beta` / `latest` 仍是 `0.6.1`。
- 本文件的 §9 模块清单行数与 §14 测试文件数都是**写死的实测值**，`AGENTS.md` §9.1 要求发版时用 `wc -l` 重跑；改代码时容易漏改这里。
