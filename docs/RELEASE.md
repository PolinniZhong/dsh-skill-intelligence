# 发布清单

> 这份文件是**可执行的**，不是说明性文档。发布会话按顺序照做即可。
> 每条都写清了「为什么」——凡是出过事故的步骤，都有一次真实的代价在后面。

当前待发布版本：**`0.4.0-beta.66`**。发布前 `package.json`、`README.md`、`CHANGELOG.md` 三者必须已经一致。

---

## 0. 前置检查（在仓库根目录）

```bash
cd "/Users/zhongwentuo/DeepSeek Harness Native/DSH_Skill_Trace"
git status --porcelain          # 必须为空
node scripts/build-client.mjs   # 重建 dist（prepack 也会跑，但这里先跑一次让 diff 可见）
node --test 2>&1 | tail -8      # 必须 0 fail
node scripts/verify-project.mjs # 必须全部 OK，尤其是 RELEASE_ASSETS_IN_SYNC_OK
```

`RELEASE_ASSETS_IN_SYNC_OK` 会钉住两处**会被人照抄**的内容：README 的「当前公开预发布版为 `x`」
必须等于 `package.json` 的 version，README 的安装示例必须 `#v<version>` 锚定。
这条规则来自一次真实漂移——`package.json` 已到 `beta.52`，README 还写着 `beta.3`，**落后 49 个版本**。

---

## 1. 版本一致性（发布会话若需改版本号，只改这三处）

| 文件 | 位置 |
|---|---|
| `package.json` | `"version"` |
| `README.md` | 「当前公开预发布版为 \`x\`」 + npm 安装示例 + `github:` 安装示例 + 「完整历史见 CHANGELOG……（当前已到 \`x\`）」 |
| `CHANGELOG.md` | 版本标题「## x — YYYY-MM-DD · 一句话主题」，并在正文写明测试数量变化 |

改完重跑第 0 步的 `verify`。**README 是发布资产，不是随手笔记。**

---

## 2. 提交 + 打 tag

```bash
git add -A
git commit -m "release: v0.4.0-beta.66 — <一句话>"
git tag -a v0.4.0-beta.66 -m "v0.4.0-beta.66"
```

tag 名必须与 `package.json` 的版本**逐字相同**（带 `v` 前缀，因为 README 的安装示例用的是 `#v…`）。

---

## 3. 推送

```bash
git push origin main
git push origin v0.4.0-beta.66
```

---

## 4. GitHub Release

```bash
gh release create v0.4.0-beta.66 \
  --title "v0.4.0-beta.66 — Skill Definition Viewer" \
  --notes-file <(sed -n '/^## 0.4.0-beta.66/,/^## 0.4.0-beta.65/p' CHANGELOG.md | sed '$d') \
  --prerelease
```

正文直接从 CHANGELOG 取该版本段落，**不要另写一份**——两份说明一定会漂移。
它是预发布版，所以带 `--prerelease`。

---

## 5. npm 发布

```bash
npm publish --tag beta
npm publish --tag latest
```

README 声明 `beta` 与 `latest` **两个标签都指向该版本**；只推 `beta` 会让 README 变成假话。
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
dsh plugin --profile <上一步的输出> add dsh-skill-trace@0.4.0-beta.66
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
# beta.66 的探针：这个端点在本版之前不存在
curl -s "http://127.0.0.1:3080/skill-trace/definition?sessionId=probe&skillName=probe"

# 对照组：老路由，用来确认探针本身没写错
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3080/skill-trace/context?sessionId=probe"
```

期望：探针返回 `{"ok":true,...,"definition":{...,"available":false,"reason":"unknown-skill"}}`，
对照组返回 `200`。若探针返回 `404` 或 `{"ok":false,"error":"not found"}`，说明**新代码不在运行中的进程里**。

### 6.6 重启宿主，然后**重跑 6.5**

宿主把代码读进内存后不会自动换。不重启就跑 6.5 得到的是旧的答案。

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

### 7.2 验收有四个层次，缺一层就有盲区

| 层次 | 回答的问题 | 何时覆盖 |
|---|---|---|
| 单元 / 契约测试 | 模型算得对吗 | 每次 |
| `verify-project` 守卫 | 结构约束还在吗 | 每次 |
| **对运行中的宿主打接口** | **用户真的会看到这个吗** | 6.5 |
| **人眼看渲染结果** | **画面对吗、可读吗** | 发布后手动 |

前两层全绿**不能**替代第三层。曾经出现过：单元测试、契约测试、verify 全绿，
而折叠节点在界面上把「24 个节点」写错的情况——因为缺陷在「客户端拿哪个数字去显示」，
不在「模型算得对不对」。

最后一行是**至今仍未自动化**的一层：布局是否重叠、三栏在 DSH WebView 里是否真的可读。
只有人看过才算数。

---

## 8. 收尾

```bash
git status --porcelain   # 应为空
git log --oneline -1     # 应是 release commit
```

回到 `README.md` 确认「当前公开预发布版为」写的就是刚推的那个版本——
**如果 tag 没推成，这一行就是假话**，而它是这份文件里最容易被别人复制的一行。
