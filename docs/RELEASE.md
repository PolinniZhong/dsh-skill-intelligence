# 发布清单

> 这份文件是**可执行的**，不是说明性文档。发布会话按顺序照做即可。
> 每条都写清了「为什么」——凡是出过事故的步骤，都有一次真实的代价在后面。

当前待发布版本：**`0.5.0`**（首个正式版）。发布前 `package.json`、`README.md`、`CHANGELOG.md` 三者必须已经一致。

---

## 本次发布的起点（2026-10-01 实测，发布会话照此核对）

| 项 | 值 |
|---|---|
| 本地 `HEAD` | `e3f4924` — `docs: the release notes said beta.69 was out, and it never was` |
| `origin/main` | `23de65f release: v0.4.0-beta.66` —— **落后 22 个提交**（beta.67 / .68 / .69 三版都在里面，一个都没公开过） |
| 远端最新 tag | `v0.4.0-beta.66`；本地也没有 `.67` / `.68` / `.69` 的 tag |
| npm | `beta` 与 `latest` **都还是 `0.4.0-beta.66`**（`npm view dsh-skill-trace dist-tags`）——本次**不发布 npm** |
| 工作区 | 干净 |

**`0.5.0` 是第一个正式版，不是预发布版**：版本号不带 `-beta`，§4 的 `gh release create` **不带 `--prerelease`**，README 的措辞也从「当前公开预发布版为」改成「当前公开版为」。

**tag 打在 §2 的发布提交上**（也就是推送时 `main` 的顶端）。历史上踩过一次：`bc78e53 release: v0.4.0-beta.69 …` 落在当时的 `HEAD` 之前 9 个提交处，照 commit message 找 tag 位置就会漏掉之后 9 个提交的修复。规则很简单——**tag 名与 `package.json` 的版本逐字相同（带 `v` 前缀），打在当时 `main` 的顶端**。

`CHANGELOG.md` 的 `0.5.0` 段已经把发布范围（只发 GitHub）、跳过 npm 的原因与文档资产改动都写进去了，GitHub Release 的 notes 直接取它，**不要另写一份**。

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
**落后 49 个版本**。注意 npm 安装示例**不在**这条守卫里：`0.5.0` 没有发布到 npm，那一行锚定的是 npm 上
真实存在的版本（`0.4.0-beta.66`）。

---

## 1. 版本一致性（发布会话若需改版本号，只改这三处）

| 文件 | 位置 |
|---|---|
| `package.json` | `"version"` |
| `README.md` | 「当前公开版为 \`x\`」 + `github:` 安装示例（锚定 `#vx`）+ npm 安装示例（锚定 npm 上真实存在的版本）+ 「完整历史见 CHANGELOG……（当前已到 \`x\`）」 |
| `CHANGELOG.md` | 版本标题「## x — YYYY-MM-DD · 一句话主题」，并在正文写明测试数量变化 |

改完重跑第 0 步的 `verify`。**README 是发布资产，不是随手笔记。**

---

## 2. 提交 + 打 tag

```bash
git add -A
git commit -m "release: v0.5.0 — 首个正式版：合并从未公开的 .67 / .68 / .69"
git tag -a v0.5.0 -m "v0.5.0"
```

tag 名必须与 `package.json` 的版本**逐字相同**（带 `v` 前缀，因为 README 的安装示例用的是 `#v…`）。

---

## 3. 推送

```bash
git push origin main
git push origin v0.5.0
```

推送曾经失败过一次——`fatal: unable to access '…': Error in the HTTP2 framing layer`。当时可用的做法是
降级协议并指定实测可达的 GitHub 地址：

```bash
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:140.82.121.4 push origin main
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:140.82.121.4 push origin v0.5.0
```

推完必须回读核对：`git rev-parse origin/main` 与 `git ls-remote origin refs/tags/v0.5.0`。

---

## 4. GitHub Release

```bash
gh release create v0.5.0 \
  --title "v0.5.0 — 首个正式版：Skill-first 两级信息架构（合并 .67 / .68 / .69）" \
  --notes-file <(sed -n '/^## 0.5.0/,/^## 0.4.0-beta.69/p' CHANGELOG.md | sed '$d')
```

正文直接从 CHANGELOG 取该版本段落，**不要另写一份**——两份说明一定会漂移。
**正式版不带 `--prerelease`**；只有 `0.4.0-beta.x` 那种预发布版才带。

---

## 5. npm 发布

**本次跳过**：`0.5.0` 只发布到 GitHub。npm 上的 `dsh-skill-trace` 停在 `0.4.0-beta.66`，`beta` 与
`latest` 两个标签都指向它——README 已经照实这么写，所以「npm 落后一版」是**已知状态**，不是漂移。

将来要补发这一版时：

```bash
npm publish --tag latest                        # 该版本从未发布过时
npm dist-tag add dsh-skill-trace@0.5.0 latest   # 版本已发布、只想挪标签时
```

**不要连着写 `npm publish --tag beta` 再 `npm publish --tag latest`**（旧版清单就是这么写的，而它从未
被执行到）：同一个版本第二次 publish 会被注册表拒绝，实测返回：

```
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/dsh-skill-trace - You cannot publish over the previously published versions: 0.4.0-beta.66.
```

正确做法是 `npm dist-tag add`（`beta.66` 发布时就是这么做的）。
`prepack` 会自动重建 `dist`，所以发布产物里的客户端 bundle 一定是最新源码构建的。

---

## 6. 发布后必做（缺一不可）

> 以下六步来自 `0.4.0-beta.7` → `0.4.0-beta.13` 的一次真实事故：
> 连续四个阶段的验收全部落空，用户连续多轮「看不到任何变化」。
> **`dsh plugin --profile X install` 成功，不等于 `X` 就是正在运行的那个 profile。**

### 6.1 从运行中的进程反查它加载了什么

```bash
lsof -p "$(cat ~/.dsh/.harness.pid)" | grep -o '\.dsh/profiles/[a-z0-9-]*' | sort -u
```

（备选：`ps -p "$(cat ~/.dsh/.harness.pid)" -o command= | tr ' ' '\n' | grep -A1 profile`。
注意 `tr` 会把 `--profile` 和它的值拆到相邻两行，**第一次排查时用了 `| tail -1` 取错行，
拿到的是端口号 `3080`**，差点又错过根因。）

### 6.2 往**上一步查到的** profile 安装

```bash
# 0.5.0 不在 npm 上，所以用 github: 写法（与 README 的安装示例一致）
dsh plugin --profile <上一步的输出> add "github:PolinniZhong/dsh-skill-trace#v0.5.0&path:/"
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
