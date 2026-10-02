# 发布清单

> 这份文件是**可执行的**，不是说明性文档。发布会话按顺序照做即可。
> 每条都写清了「为什么」——凡是出过事故的步骤，都有一次真实的代价在后面。

**当前待发布版本：`0.7.1`（品牌迁移：Skill Trace → DSH Skill Intelligence / DSH Skill 智能实验室）。** 上一版 `0.7.0`（Skill 理解与复用）已于 2026-10-02 发布到 GitHub Release 与 npm（发布提交 `5fac5d9`）。发布前 `package.json`、`README.md`、`CHANGELOG.md` 三者必须已经一致——`RELEASE_ASSETS_IN_SYNC_OK` 会钉住前两者。

**这一版为什么是 patch：** `0.7.1` 只改产品名、用户可见措辞与仓库元信息（`CHANGELOG.md` 顶部 `## 0.7.1`），功能逻辑一个字没改。GitHub 仓库已改名为 `PolinniZhong/dsh-skill-intelligence`（旧地址自动重定向，本地 `origin` 已同步）。npm 包名 `dsh-skill-trace`、`/skill-trace/*` 路由、`[data-plugin="dsh-skill-trace"]` 与存储结构**一个字都没改**，因此这次**不需要 npm 迁移**：照常发布一个版本即可，发布时 npm 包页的 README 会自动换成新品牌口径。**验证点：客户端 2332 → 2339 行、bundle 129280 → 129315 字节，测试 429 与守卫 23 都不变——数字变了就不是纯品牌迁移。**

---

## 本次发布的起点（2026-10-02 实测，发布会话照此核对）

| 项 | 值 |
|---|---|
| 本地 `HEAD` | `8ec062f docs: 发布清单记下未发布的品牌迁移与「不需要 npm 迁移」的结论`（= `origin/main`；品牌迁移提交 `176dbcf` 在它之前） |
| `origin/main` | `8ec062f80dea12e6fe6505a1b0fdbe9bec769f9a` —— 与本地 `main` **0 领先 / 0 落后** |
| 远端最新 tag | `v0.7.0`（`refs/tags/v0.7.0^{}` → `5fac5d9`） |
| npm | `beta` 与 `latest` **都指向 `0.7.0`**（`npm view dsh-skill-trace dist-tags`）；`0.5.0` 与 `0.6.0` 只在 GitHub |
| 工作区 | 干净（`git status --porcelain` 无输出）——本次版本号编辑从这里开始 |

**第一个要决定的事是版本号 —— 这次是 `0.7.1`。** 上一版 `0.7.0` 加了三条宿主路由、四个新模块与一个对象级动作，是 minor；这一版**一个功能都没加**：产品名、用户可见措辞、仓库元信息是全部改动，按语义是 patch。落点必须逐字相同：`package.json`、`README.md` 的「当前公开版为」与 `github:` 安装示例的 `#v…` 锚点、`CHANGELOG.md` 标题、tag 五处。**注意 `0.6.0` 与文档里通行的 `SDD v0.6`（信息架构规格自身的版本）撞名**——说规格时写「SDD v0.6」，说版本时一律带 `v`。

**第二个要决定的事是 npm —— 这一版发 npm。** npm 上现在是 `0.7.0`，`beta` 与 `latest` 都指向它，所以补上是发布**一个**版本，不是补十个。`0.5.0` 与 `0.6.0` 仍然只在 GitHub，这一点在 `README.md` 里已写明。npm 包名**不因为品牌迁移而改**——已发布，改名会让安装命令与 `github:` 锚点全部失效。

**第三个要决定的事是「什么都不改」的边界。** 品牌迁移只碰用户理解层：UI 文案、README 与文档抬头、`package.json` 的 description / keywords / URL。**`src/` 的功能逻辑一行不动**——`/skill-trace/*` 路由、模块名、`[data-plugin="dsh-skill-trace"]`、storage 结构与 `dsh-skill-trace` 命名空间都属于技术层，保持原样。守卫按字面钉住那 10 条路由与 15 条已删路由：发布前如果 `PROJECT_STRUCTURE_OK` 或 `CLIENT_CONTRACT_OK` 报出多出来的路由或页面，那不是要更新守卫，是要先问一句它是不是把一个被删掉的界面带回来了。

**tag 打在 §2 的发布提交上**（也就是推送时 `main` 的顶端）。历史上踩过一次：`bc78e53 release: v0.4.0-beta.69 …` 落在当时的 `HEAD` 之前 9 个提交处，照 commit message 找 tag 位置就会漏掉之后 9 个提交的修复。规则很简单——**tag 名与 `package.json` 的版本逐字相同（带 `v` 前缀），打在当时 `main` 的顶端**。

`CHANGELOG.md` 的新版本段已经把症状、改法、实测数字与发布范围都写进去了，GitHub Release 的 notes 直接取它，**不要另写一份**；发布时把标题里的内容原样带过去即可。

---

## 0. 前置检查（在仓库根目录）

```bash
cd "/Users/zhongwentuo/DeepSeek Harness Native/10_DSH_Skill_Trace"
git status --porcelain          # 必须为空
node scripts/build-client.mjs   # 重建 dist（prepack 也会跑，但这里先跑一次让 diff 可见）
node --test 2>&1 | tail -8      # 必须 0 fail
node scripts/verify-project.mjs # 必须全部 OK，尤其是 RELEASE_ASSETS_IN_SYNC_OK
```

`RELEASE_ASSETS_IN_SYNC_OK` 会钉住两处**会被人照抄**的内容：README 的「当前公开版为 `x`」（旧措辞
「当前公开预发布版为」也接受）必须等于 `package.json` 的 version，README 的 `github:` 安装示例必须
`#v<version>` 锚定。这条规则来自一次真实漂移——`package.json` 已到 `beta.52`，README 还写着 `beta.3`，
**落后 49 个版本**。注意 npm 安装示例**不在**这条守卫里：`0.5.0` 与 `0.6.0` 都没有发布到 npm，那一行锚定的是 npm 上
真实存在的版本（`0.4.0-beta.66`）。

---

## 1. 版本一致性（版本号必须逐字相同的五处）

| 文件 | 位置 |
|---|---|
| `package.json` | `"version"` |
| `README.md` | 「当前公开版为 \`x\`」 + `github:` 安装示例（锚定 `#vx`）+ npm 安装示例（锚定 npm 上真实存在的版本）+ 「完整历史见 CHANGELOG……（当前已到 \`x\`）」 |
| `CHANGELOG.md` | 版本标题「## x — YYYY-MM-DD · 一句话主题」，并在正文写明测试数量变化 |
| `spec/PRD.md` | 头部版本号 + 正文里写死的测试数 / 客户端行数 / bundle 字节 |
| `spec/SDD.md` | 头部版本号 + §模块清单的行数表（`wc -l` 重跑，行数变了就要改） |

改完重跑第 0 步的 `verify`。**README 是发布资产，不是随手笔记。**

> 后两处是 2026-10-05 加进来的：`spec/` 收拢了当前版 PRD 与 SDD，而它们把版本号和几项实测数字**写死在正文里**。
> `RELEASE_ASSETS_IN_SYNC_OK` 管不到它们——那条守卫只看 `README.md`。漏改的症状是「规格文档说 0.7.0、包说 0.8.0」。

> **这张表和 `AGENTS.md` §9.1 的「六处」不是同一张表，别对着数。** 这里列的是**发布资产里版本字符串必须逐字相同**的文件（发布前用）；§9.1 列的是**发版后需要顺手更新的状态类文字**（发布后用），因此多出 `AGENTS.md` §1 自己的版本行与 `docs/RELEASE.md` 的「本次发布的起点」表。
>
> 两张表的**唯一缺口**在本表这一侧：`AGENTS.md` §1 的版本号也必须等于 `package.json`，而它不在这五个「发布资产」里。所以**发布前请配合 §9.1 第 1 条一起看**，别只照本表改。

---

## 2. 提交 + 打 tag

```bash
git add -A
git commit -m "release: v0.7.1 — 品牌迁移：DSH Skill 智能实验室"
git tag -a v0.7.1 -m "v0.7.1"
```

tag 名必须与 `package.json` 的版本**逐字相同**（带 `v` 前缀，因为 README 的安装示例用的是 `#v…`）。

---

## 3. 推送

```bash
git push origin main
git push origin v0.7.1
```

推送曾经失败过一次——`fatal: unable to access '…': Error in the HTTP2 framing layer`。当时可用的做法是
降级协议并指定实测可达的 GitHub 地址：

```bash
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:140.82.121.4 push origin main
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:140.82.121.4 push origin v0.7.1
```

推完必须回读核对：`git rev-parse origin/main` 与 `git ls-remote origin refs/tags/v0.7.1`。
`git ls-remote` **也要带同样的两个 `-c`**（HTTP/2 那条路同样会被打断）。

---

## 4. GitHub Release

```bash
gh release create v0.7.1 \
  --title "v0.7.1 — 品牌迁移：DSH Skill 智能实验室" \
  --notes-file <(sed -n '/^## 0.7.1/,/^## 0.7.0/p' CHANGELOG.md | sed '$d')
```

正文直接从 CHANGELOG 取该版本段落，**不要另写一份**——两份说明一定会漂移。
**正式版不带 `--prerelease`**；只有 `0.4.0-beta.x` 那种预发布版才带。

---

## 5. npm 发布

`0.7.1` 这次**发布到了 npm**（`0.5.0` 与 `0.6.0` 只在 GitHub，`0.6.1` 起每一版都是 GitHub + npm）。
两条命令，顺序不能换：

```bash
npm publish --tag latest --cache=/tmp/npm-cache-dsh                     # 这个版本第一次发布
npm dist-tag add dsh-skill-trace@0.7.1 beta --cache=/tmp/npm-cache-dsh  # 第二个标签只能这样加
```

**不要连着写 `npm publish --tag beta` 再 `npm publish --tag latest`**（旧版清单就是这么写的，而它从未
被执行到）：同一个版本第二次 publish 会被注册表拒绝，实测返回：

```
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/dsh-skill-trace - You cannot publish over the previously published versions: 0.4.0-beta.66.
```

正确做法是 `npm dist-tag add`（`beta.66` 与 `0.6.1` 都是这么做的）。
`prepack` 会自动重建 `dist`，所以发布产物里的客户端 bundle 一定是最新源码构建的。

两条本机与顺序上的硬约束：

1. **顺序**：`npm publish` 从本地 `git HEAD` 读 `gitHead`——**先推成功、确认本地与远端对齐，最后才
   publish**，否则 package 页上的 commit 链接永远 404（见附录 A）。
2. **本机 `~/.npm` 不可写**（DSH 沙箱所致，**不是**属主问题——不要跑 npm 建议的
   `sudo chown -R 501:20 ~/.npm`）：所有 npm 命令都带 `--cache=/tmp/npm-cache-dsh`。注册表**读**会滞后
   几十秒到几分钟，核对时用新 cache 目录加 `--prefer-online`。

---

## 6. 发布后必做（缺一不可）

> 以下六步来自 `0.4.0-beta.7` → `0.4.0-beta.13` 的一次真实事故：
> 连续四个阶段的验收全部落空，用户连续多轮「看不到任何变化」。
> **`dsh plugin --profile X install` 成功，不等于 `X` 就是正在运行的那个 profile。**

### 6.0 本次 `v0.7.0` 的实际结果（2026-10-02 已执行）

| 项 | 结果 |
|---|---|
| 发布提交 | `5fac5d9 release: v0.7.0 — Skill 理解与复用：读得懂、存得住、复刻得走`（`package.json` `0.7.0`） |
| `origin/main` | `5fac5d961fa7b01e91ef02f81c76c85a1dcee431` —— 与本地 `main` **0 领先 / 0 落后** |
| tag | `v0.7.0` → 注释对象 `9ceb019ba63039a8e56635d43ca00298b92a830b`，解引用到 `5fac5d9`（打在发布提交上，符合规则） |
| GitHub Release | <https://github.com/PolinniZhong/dsh-skill-trace/releases/tag/v0.7.0>（`Latest`，`prerelease=false`、`draft=false`），正文取 `CHANGELOG.md` 的 266 行 `## 0.7.0` 段 |
| npm | **`beta` 与 `latest` 都指向 `0.7.0`**（§5 本次已执行）：口径提交 `9800098` **先推**，`gitHead` 就是它；37 个文件 / 346.6 kB / 解包 1070413 字节 / shasum `015bbf75aee07c5dd921fdc093727e2795c1d155`；约 3.5 分钟后注册表才对上；空目录安装验证通过 |
| 本地门槛 | **429 项测试全绿**；**23 组守卫全 OK**（含 `GUARD_MARKERS_ARE_BACKED_OK` 与 `RELEASE_ASSETS_IN_SYNC_OK`）；`node scripts/build-client.mjs` → `dist/client.js` **129280 字节**（source hash `31d39c71f13aeeb8`），重建后 `git status` 无 `dist` 差异 |

### 6.0.1 本次 `v0.6.1` 的实际结果（2026-10-01 已执行）

| 项 | 结果 |
|---|---|
| 发布提交 | `b3bc500 release: v0.6.1 — SKILL.md 面板不再被框架层压成 2px`（`package.json` `0.6.1`） |
| `origin/main` | `b3bc500744dc1ced6365c31fe87f1bc19f8c000d` —— 与本地 `main` **0 领先 / 0 落后** |
| tag | `v0.6.1` → 注释对象 `dee6a27926abab3fc1deb91dcc263893c9a3fd63`，解引用到 `b3bc500`（打在发布提交上，符合规则） |
| GitHub Release | <https://github.com/PolinniZhong/dsh-skill-trace/releases/tag/v0.6.1>（`Latest`，`prerelease=false`、`draft=false`），正文取 `CHANGELOG.md` 的 29 行 `## 0.6.1` 段 |
| npm | **`beta` 与 `latest` 都指向 `0.6.1`**（§5 本次已执行）：33 个文件 / 293.8 kB，shasum `bc30888…`，`gitHead` `c27da14`；`npm publish` 返回 **202**，注册表 `latest` 约 **6 分钟**后才对上；净室安装验证通过 |
| 本地门槛 | 397 项测试全绿；全部守卫 OK（含 `RELEASE_ASSETS_IN_SYNC_OK`——它先抓到了 README 安装示例还写着 `#v0.6.0`）；重建后 `dist/client.js` 108839 字节（source hash `88295843d1d2553e`） |
| 活体验证 | 运行中的宿主在 `http://127.0.0.1:3080/plugins/?…dsh-skill-trace/client.js…` 返回的合并 bundle（200、5.59 MB）里 grep 到 `flex:0 0 auto;height:min(72vh,640px)`——**这一版是纯客户端改动，这条规则就是它的指纹**。注意客户端 bundle 由 DSH 插件加载器读取，插件自己**不**暴露 client 路由：`/skill-trace/client.js` 与 `/plugins/dsh-skill-trace/client.js` 都是 404，别拿它们当探针；宿主路由 `/skill-trace/context` 与 `/skill-trace/catalog` 都是 200 |
| 渲染台实测 | `.st-detail-doc` 高度 **2px → 640px**，内部滚动区 clientHeight **24 → 539** / scrollHeight 4233；主内容区 scrollHeight 3399 |
| README 五张截图 | 用 Chrome for Testing 以真实 1600×1050 视口重拍后转 jpg：`skill-list.jpg` 69384B / `installed-skills.jpg` 334705B / `skill-detail.jpg` 266250B / `skill-detail-table.jpg` 289567B / `skill-detail-zh.jpg` 335350B |

### 6.0.2 上一版 `v0.6.0` 的实际结果（2026-10-01）

| 项 | 结果 |
|---|---|
| 发布提交 | `9e9e6b3 release: v0.6.0 — Skill 详情拆成四层：框架 / 运行逻辑 / 步骤证据 / 表格`（`package.json` `0.6.0`） |
| `origin/main` | `9e9e6b3f906ab995e99d078ac0e0be025110a1a3` —— 与本地 `main` **0 领先 / 0 落后** |
| tag | `v0.6.0` → 注释对象 `a0462c21087f00cd76974817224fb73c132fd645`，解引用到 `9e9e6b3`（打在发布提交上，符合规则） |
| GitHub Release | <https://github.com/PolinniZhong/dsh-skill-trace/releases/tag/v0.6.0>（`Latest`），正文取 `CHANGELOG.md` 的 69 行 `## 0.6.0` 段 |
| npm | `beta` 与 `latest` **仍都是 `0.4.0-beta.66`** —— §5 整节按计划跳过，这是**已知状态**不是漂移 |
| 运行中的 profile | `core-020`，`node_modules/dsh-skill-trace` 是 **`link:` 到工作区**的软链（`~/.dsh/profiles/core-020/package.json:15`），所以它**已经**在读 `0.6.0`，**不需要**执行 §6.2 的 GitHub 安装 |
| 宿主探针 | `/skill-trace/context` 200、`/skill-trace/catalog` 200；真实会话 `skills` 列表 `ui-craft` / `available` / `runCount 1` |

> `npm view` 若报 `EPERM … Your cache folder contains root-owned files`，是**本机 `~/.npm` 属主问题**，与发布无关；加 `--cache /tmp/npm-cache-probe` 即可读到 dist-tags。

### 6.1 从运行中的进程反查它加载了什么

```bash
lsof -p "$(cat ~/.dsh/.harness.pid)" | grep -o '\.dsh/profiles/[a-z0-9-]*' | sort -u
```

（备选：`ps -p "$(cat ~/.dsh/.harness.pid)" -o command= | tr ' ' '\n' | grep -A1 profile`。
注意 `tr` 会把 `--profile` 和它的值拆到相邻两行，**第一次排查时用了 `| tail -1` 取错行，
拿到的是端口号 `3080`**，差点又错过根因。）

### 6.2 往**上一步查到的** profile 安装

```bash
# npm 与 github: 两种写法都能用（0.6.1 起两处都有），这里用 github: 写法（与 README 的安装示例一致）
dsh plugin --profile <上一步的输出> add "github:PolinniZhong/dsh-skill-trace#v0.7.0&path:/"
```

### 6.3 版本一致

pin（`~/.dsh/profiles/<p>/package.json` 里的依赖声明） == lockfile ==
`~/.dsh/profiles/<p>/node_modules/dsh-skill-trace/package.json` 的 version == 已发布 commit。

### 6.4 内容一致

已装 `src/` 与已发布 commit 逐文件 sha256 比对。`diff -rq` 无输出即可。

### 6.5 行为探针 —— **这是唯一能真正回答问题的一步**

前四步都只是**必要条件**：它们证明的是「我装的那个目录是对的」，
而不是「用户运行的是我装的那个目录」。

```bash
# 探针：/skill-trace/catalog 是 beta.69 才有的端点，更早的进程对它只会回 404
curl -s "http://127.0.0.1:3080/skill-trace/catalog?sessionId=probe"

# 第二枚探针：beta.69 新增的翻译端点（GET 应当 404/405，POST 才存在）
curl -s -X POST -H 'content-type: application/json' -d '{}' \
  "http://127.0.0.1:3080/skill-trace/translate"

# 对照组：老路由，用来确认探针本身没写错
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3080/skill-trace/context?sessionId=probe"
```

`/skill-trace/catalog` 是这一版区分「新代码在不在跑的进程里」最干净的一枚探针：它在 beta.68 及更早的进程上根本不存在。`sessionId=probe` 不是真会话，Registry 解析不出来，因此 `installed` 会是 `null`——**空数据也是 200**，探针要证明的是「这个端点存在并答得出来」，不是「它有数据」。发布前再拿一个**真实会话 id** 跑一次，确认 `coverage` 为 `complete`、`skills[]` 非空。

期望（2026-10-01 在运行中的宿主上实测）：

```json
{"ok":true,"sessionId":"probe","workspaceLabel":"工作区未连接",
 "list":{"schemaVersion":1,"sessionId":"probe","scope":"session-loaded-skills-only",
         "skills":[],"skillCount":0,
         "limitations":["registry-unavailable-so-descriptions-and-definition-status-are-missing"]}}
```

`sessionId=probe` 不是真会话，所以**空列表也是 200**——探针要证明的是「这个端点存在并答得出来」，
不是「它有数据」。对照组返回 `200`。若探针返回 `404` 或 `{"ok":false,"error":"not found"}`，
说明**新代码不在运行中的进程里**；若返回 `400 {"ok":false,"error":"sessionId 必填"}`，
说明参数没被解析，同样是旧代码。

### 6.5b 中文预览：证明**这一次的修复**在跑的进程里

`0.4.0-beta.69` 里的中文预览在用户手里连败五次，五次的原因各不相同（见 `CHANGELOG.md` 的 `#### 二之一` / `#### 二之二`）。上面那枚 `/catalog` 探针只能证明「beta.68 之后的代码在」，**证明不了第五次修复在**——所以这一版多一枚探针。

**宿主侧**（要真跑一次翻译，一到三分钟；发布会话本来就要验这一条）：

```bash
SID=$(ls -t ~/.dsh/sessions | head -1)                       # 挑一个真实会话
curl -s "http://127.0.0.1:3080/skill-trace/skill?sessionId=$SID&skillName=ui-craft" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["skill"]["definition"]["content"]["sha256"])'
# 拿上面那个 sha256 去翻译；把输出存文件，别打屏
curl -s -X POST -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SID\",\"skillName\":\"ui-craft\",\"sourceSha256\":\"<上一步的 sha256>\"}" \
  --max-time 900 "http://127.0.0.1:3080/skill-trace/translate" -o /tmp/translate-probe.json
python3 -c 'import json; d=json.load(open("/tmp/translate-probe.json")); print(sorted(d))'
```

| 输出 | 说明 |
|---|---|
| `['chunkCount','fallbackChunks','fallbackReasons',…]` | 分段策略与段级原因在**运行中的宿主**里 —— `10dc8be` 之后的代码 |
| 只有 `['code','error','ok','violations']` | 宿主还是旧的（`violations` 是整篇校验时代的返回形状） |
| `ok: true` 且 `fallbackReasons` 为空 | 这一版翻译成功了 |

**第五次修复本身**（`looksUntranslated` / `alignHeadingLevels` / 拆段重试）**没有独立的探针**：宿主不对外报版本号，而它的表现只在模型犯错时才可见。这一条靠 §6.4 的逐文件 sha256 比对来钉 —— 已安装 `src/` 与已发布 commit 一致，那 `13a68df` 就一定在。**不要为了一个探针去加一条新路由**，那会引入一个只有发布时才被走到的新分支。

**客户端侧**：横幅里出现「**模型把原文原样返回了**」这九个字，说明 `13a68df` 的客户端在跑（这个字符串是那一版才加进 `TRANSLATION_RULE_TEXT` 的）。它是 `dist/client.js` 里的内容，同样由 §6.4 的文件比对覆盖。

### 6.5c 这一版**没有新路由**，所以没有路由探针

四层（框架 / 本次运行逻辑 / 步骤证据 / 表格）全在客户端，它们的视图模型也只在 `buildSkillDetail()` 里
组装（`src/core/skill-view-model.mjs` 新增两支 import，宿主 `src/dsh/host/index.js` 一行没改，路由表
仍是那七条）。所以 §6.5 的两枚探针**能证明宿主是新的，但区分不了这一版的前后** —— 它们在这一版之前
就是 200。

这一版唯一能证明「客户端是新」的静态手段仍是 §6.4 的逐文件 sha256，而**动态手段只有重启后的人眼**。
验收清单见 `01_重构方案/发布会话验收清单.md`；最小的一组是：打开一个详情页（**用 `ui-craft` 这类复杂
Skill，不要用四步的示例**），主内容区从上到下应依次是「Skill 框架」（多个角色模块 + 一个「声明流程」
子模块 + 一个「渐进披露」子模块）、「本次运行逻辑」（五段，每段带状态与事实）、「步骤证据」，
最后才是 `SKILL.md`；框架里每个小节的右侧是**观察**状态或不可点的行，不是「已执行」；把文档滚到
任何一张表，应看到带边框的真表格，而不是一列竖线。

**一段话就能判断反了没有**：如果「Skill 框架」还是那条 `01 → 02 → 03 → 04`，说明跑的还是旧 bundle；
如果界面里出现「已执行」「未执行」「已完成」「已加载」「已读取」中的任何一个，那是**旧行为**或
**改错了** —— 这一版刻意只允许说「暂无足够证据」。两组禁用词分别由 `FLOW_EVIDENCE_FORBIDDEN` 与
`RUNTIME_LOGIC_FORBIDDEN` 定义，`SKILL_FRAMEWORK_OK` 逐条查解析后的标签。

### 6.6 重启宿主，然后**重跑 6.5 与 6.5b**

宿主把代码读进内存后不会自动换。不重启就跑 6.5 得到的是旧的答案。

### 6.7 中文预览的寿命（人眼，一分钟）

这一条**没有任何探针能替**，因为它一半在客户端、一半在用户的操作顺序里：

1. 在详情页点「翻译」，等出中文 → 返回列表 → 打开**另一个** Skill → 再切回原来那个 → **中文预览还在**（不该重译）。
2. 完全退出 DeepSeek Harness 再进来 → 那个 Skill 的译文**应该是没有的**（缓存只活在插件进程里，`src/core/translation-cache.mjs`）。

第 2 步失败（退出后译文还在）意味着它落盘了 —— 那是 `FR-UI-047` 违规，比功能没做更严重，必须当事故处理。

---

## 7. 两个必须记住的陷阱

### 7.1 客户端路径在启动时解析，文件在请求时读取

| 阶段 | 行为 |
|---|---|
| 宿主启动 | 解析 `package.json` 的 `exports['./client']`，记下**路径字符串** |
| 浏览器请求 | 读该路径**当时的**文件内容 |

所以插件在宿主运行期间被替换版本、且新旧版本的 `./client` 指向**不同文件**时，
宿主仍记着旧路径，而该文件已被新版换成不带 `window.__ModuleLoader__.load({...})` 注册包装的普通模块
→ 外壳把它原样发给浏览器 → **它从不注册 → 插件界面静默消失**。

> **安装插件后必须立即重启宿主。中间的窗口期插件界面会消失。**
> 这不是可选步骤。

### 7.2 验收有五个层次，缺一层就有盲区

| 层次 | 回答的问题 | 何时覆盖 |
|---|---|---|
| 单元 / 契约测试 | 模型算得对吗 | 每次 |
| `verify-project` 守卫 | 结构约束还在吗 | 每次 |
| **对运行中的宿主打接口** | **这个端点真的在跑的进程里吗** | 6.5 / 6.5b |
| **渲染台截图（近似应用）** | **画面照着真实载荷长得对吗** | 改界面后 |
| **真实应用里复现 + 人眼看** | **用户看到的就是这个吗、可读吗** | 发布前 / 发布后手动 |

前两层全绿**不能**替代第三层。曾经出现过：单元测试、契约测试、verify 全绿，
而折叠节点在界面上把「24 个节点」写错的情况——因为缺陷在「客户端拿哪个数字去显示」，
不在「模型算得对不对」。

**第四层也不等于第五层。** `0.4.0-beta.67` 一度把渲染台当成了终点，结果两个缺陷都只在真实应用里出现：

- 渲染台的 `?view=` 默认值是 `map`，于是它**自带一个视图选择**，把「宿主给的旧偏好要不要被尊重」
  这整条分支短路掉了——所有截图都没走过那条路径。现在渲染台不写默认值，偏好只能靠载荷演示。
- 渲染台只截**最后一帧**。React #310 要两帧才出现（第一帧 loading、第二帧有数据），
  所以截图永远看不到它。抓到它的是用 CDP 连上真实应用、点开那个标签页、读 console。
- 它**不加载宿主主题**。所有 `--dsw-alias-*` 都退回渲染台自己的回退值，所以「暗色下看不看得清」
  在渲染台上永远显示为正常。

最后一行是**至今仍未完全自动化**的一层：布局是否重叠、两个页面在 DSH WebView 里是否真的可读、
标签页会不会整片空白。只有人看过才算数。

---

## 8. 收尾

```bash
git status --porcelain   # 应为空
git log --oneline -1     # 应是 release commit
```

回到 `README.md` 确认「当前公开版为」写的就是刚推的那个版本——
**如果 tag 没推成，这一行就是假话**，而它是这份文件里最容易被别人复制的一行。
