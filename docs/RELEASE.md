# 发布清单

> 这份文件是**可执行的**，不是说明性文档。发布会话按顺序照做即可。
> 每条都写清了「为什么」——凡是出过事故的步骤，都有一次真实的代价在后面。

**`0.9.2`（V0.9.0「Skill 验收」+ V0.9.1「Skill Modify」+ V0.9.2「已安装列表排序」三批改动）已于 2026-10-03 发布到 GitHub Release 与 npm**（结果见 §6.0）。**当前没有待发布版本**：发布提交之后工作区干净，`package.json`、`README.md`、`CHANGELOG.md`、`spec/PRD.md`、`spec/SDD.md` 与 `AGENTS.md` §1 六处都已是 `0.9.2` 口径。下一版的版本号按 `AGENTS.md` §2 仍**由用户定**，不要自己开。发布提交之后工作区必须干净——这条要求不是洁癖，见 §0；发布资产必须版本一致——`RELEASE_ASSETS_IN_SYNC_OK` 会钉住 README 的版本声明与安装示例锚点。

> **`0.9.2` 的发布扫描（2026-10-03）**：`package.json` / `README.md` / `CHANGELOG.md` / `spec/PRD.md` /
> `spec/SDD.md` / `AGENTS.md` §1 六处都已改成 `0.9.2` 口径；本文件、`docs/ARCHITECTURE.md` 与 `design.md`
> 里的实测数字（客户端 3448 行 / bundle 170324 字节 / 测试 561 项 / 守卫 28 组 / 宿主 12 条路由）与
> `wc -l`、`wc -c`、`npm test`、`npm run verify` 的实跑结果一致。
> 下面 §6.0.1 表里的 2735 行 / 142672 字节 / 474 项 / 25 组是 `0.8.0` **发布当时**的实测值，只作历史参照。

**这一版为什么是 minor：** `0.9.2` 加了一条宿主路由（`POST /skill-trace/modify`，11 → 12 条）、三个 core 模块（`src/core/skill-validation.mjs` / `src/core/skill-modification.mjs` / `src/core/skill-profiles.mjs`）与一个 storage 模块（`src/storage/modification-snapshot-store.mjs`），并加了两块界面（详情页「Skill 验收」卡与「本次修改对比」），按语义是 minor。已安装列表排序（规则名 `added-desc-then-name`）只是同一条读取路径上的呈现规则，patch 级，搭同一班车。npm 包名 `dsh-skill-trace`、`/skill-trace/*` 路由、`[data-plugin="dsh-skill-trace"]` 与存储结构**一个字都没改**，因此**不需要 npm 迁移**。**验证点：客户端 2735 → 3448 行、宿主 1292 → 1625 行、bundle 142672 → 170324 字节、测试 474 → 561、守卫 25 → 28 组、宿主路由 11 → 12 条。**

---

## 本次发布的起点（`0.9.2` 发布后实测 2026-10-03）

| 项 | 值 |
|---|---|
| 本地 `HEAD` | `0.9.2` 的发布提交（`package.json` `0.9.2`）= `origin/main`，见 §6.0 |
| `origin/main` | 与本地 `main` **0 领先 / 0 落后** |
| 远端最新 tag | `v0.9.2`（打在发布提交上） |
| npm | `beta` 与 `latest` **都指向 `0.9.2`**（`npm view dsh-skill-trace dist-tags`）；`0.5.0` 与 `0.6.0` 只在 GitHub |
| 工作区 | 干净（`git status --porcelain` 无输出） |

**版本号：下一版仍由用户定，不要自己开**（`AGENTS.md` §2 的规矩；`0.9.2` 这个号就是用户定的）。发版那天要做的是把 README 的「待发布」口径换成已发布口径、把 CHANGELOG 的 `## Unreleased` 换成版本标题——`0.9.2` 这次两件事都是这么做的（见 `CHANGELOG.md` 的 `## 0.9.2`）。

**第二个要决定的事是 npm —— 从 `0.6.1` 起每一版都是 GitHub + npm 两边一起发。** `0.5.0` 与 `0.6.0` 仍然只在 GitHub，这一点在 `README.md` 里已写明。npm 包名**不因为品牌迁移而改**——已发布，改名会让安装命令与 `github:` 锚点全部失效。

**第三个要决定的事是「什么都不改」的边界。** 技术层（`/skill-trace/*` 路由、模块名、`[data-plugin="dsh-skill-trace"]`、storage 结构与 `dsh-skill-trace` 命名空间）与用户理解层是两层；改用户可见措辞时，不要顺手改技术层。守卫按字面钉住那 12 条路由与 15 条已删路由：发布前如果 `PROJECT_STRUCTURE_OK` 或 `CLIENT_CONTRACT_OK` 报出多出来的路由或页面，那不是要更新守卫，是要先问一句它是不是把一个被删掉的界面带回来了。

**tag 打在 §2 的发布提交上**（也就是推送时 `main` 的顶端）。历史上踩过一次：`bc78e53 release: v0.4.0-beta.69 …` 落在当时的 `HEAD` 之前 9 个提交处，照 commit message 找 tag 位置就会漏掉之后 9 个提交的修复。规则很简单——**tag 名与 `package.json` 的版本逐字相同（带 `v` 前缀），打在当时 `main` 的顶端**。

`CHANGELOG.md` 的新版本段已经把症状、改法、实测数字与发布范围都写进去了，GitHub Release 的 notes 直接取它，**不要另写一份**；发布时把标题里的内容原样带过去即可。

---

## 0. 前置检查（在仓库根目录）

```bash
cd "$(git rev-parse --show-toplevel)"   # 仓库根（本仓库根就是插件包根）
git status --porcelain          # 必须为空
node scripts/build-client.mjs   # 重建 dist（prepack 也会跑，但这里先跑一次让 diff 可见）
node --test 2>&1 | tail -8      # 必须 0 fail
node scripts/verify-project.mjs # 必须全部 OK，尤其是 RELEASE_ASSETS_IN_SYNC_OK
```

**`git status --porcelain` 为空不是洁癖。** `package.json` 的 `files` 里有 `src`，所以**本地 `npm publish`
打的是工作区现状**——任何未跟踪或被改动的 `src/**` 都会被装进 tarball。2026-10-02 实测：工作区里多出两个
未跟踪的新模块时，`npm pack --dry-run --ignore-scripts` 从 40 个文件 / 391.7 kB 变成 **42 个 / 406.2 kB**。
发布前用同一条命令对一眼 `total files` 与 `package size`（`--ignore-scripts` 是为了不触发 `prepack` 重建
`dist/`），或者干脆只从干净的 checkout 发布——CI 那条路（§5.2）看得见的只有已提交的内容。

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

> 后两处是 2026-10-02 加进来的：`spec/` 收拢了当前版 PRD 与 SDD，而它们把版本号和几项实测数字**写死在正文里**。
> `RELEASE_ASSETS_IN_SYNC_OK` 管不到它们——那条守卫只看 `README.md`。漏改的症状是「规格文档说 0.7.0、包说 0.8.0」。

> **这张表和 `AGENTS.md` §9.1 的「六处」不是同一张表，别对着数。** 这里列的是**发布资产里版本字符串必须逐字相同**的文件（发布前用）；§9.1 列的是**发版后需要顺手更新的状态类文字**（发布后用），因此多出 `AGENTS.md` §1 自己的版本行与 `docs/RELEASE.md` 的「本次发布的起点」表。
>
> 两张表的**唯一缺口**在本表这一侧：`AGENTS.md` §1 的版本号也必须等于 `package.json`，而它不在这五个「发布资产」里。所以**发布前请配合 §9.1 第 1 条一起看**，别只照本表改。

---

## 2. 提交 + 打 tag

```bash
git add -A
git commit -m "release: v0.9.2 — Skill 验收 / Skill Modify / 已安装列表排序"
git tag -a v0.9.2 -m "v0.9.2"
```

tag 名必须与 `package.json` 的版本**逐字相同**（带 `v` 前缀，因为 README 的安装示例用的是 `#v…`）。

---

## 3. 推送

```bash
git push origin main
git push origin v0.9.2
```

推送失败过两次：`fatal: unable to access '…': Error in the HTTP2 framing layer`，以及
`Empty reply from server` / `Failed to connect to github.com port 443 after 75001 ms`。当时可用的做法是
降级协议并指定**实测可达**的 GitHub 地址——**可达 IP 会变，推之前先探一次**：

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" --max-time 8 --resolve github.com:443:140.82.113.4 https://github.com/
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:20.27.177.113 push origin main
git -c http.version=HTTP/1.1 -c http.curloptResolve=github.com:443:20.27.177.113 push origin v0.9.2
```

`2026-10-02` 实测：`140.82.121.4` 与 `140.82.112.3` 都超时（8.0s / `000`），
`140.82.113.4`（1.88s / `200`）与 `20.27.177.113`（0.79s / `200`）可用；`2026-10-03` 实测只剩
`20.27.177.113` 可用（1.37s / `200`），其余三个都超时（8.0s / `000`）——**同一天里可达的地址会换人**。

推完必须回读核对：`git rev-parse origin/main` 与 `git ls-remote origin refs/tags/v0.9.2`。
`git ls-remote` **也要带同样的两个 `-c`**（HTTP/2 那条路同样会被打断）。

---

## 4. GitHub Release

```bash
gh release create v0.9.2 \
  --title "v0.9.2 — Skill 验收 / Skill Modify / 已安装列表排序" \
  --notes-file <(sed -n '/^## 0.9.2/,/^## 0.8.0/p' CHANGELOG.md | sed '$d')
```

正文直接从 CHANGELOG 取该版本段落，**不要另写一份**——两份说明一定会漂移。
**正式版不带 `--prerelease`**；只有 `0.4.0-beta.x` 那种预发布版才带。

---

## 5. npm 发布

`0.8.0` 这次**发布到了 npm**（`0.5.0` 与 `0.6.0` 只在 GitHub，`0.6.1` 起每一版都是 GitHub + npm）。

> **发布凭证有两条硬约束，动手前先读 §5.1–§5.4。** 2026-10-02 之前 `~/.npmrc` 里那张长期 token 是 npm
> 条款里的 **2FA-bypass GAT**：账户级操作**已经**被它失去（实测 `npm profile get` → `E403`），
> **直接 publish 也将在 2027 年 1 月左右失去**（条款目标时间）。**本机已按 §5.1 换成交互式 2FA 会话凭证**
> （`npm profile get` → exit 0），迁移目标仍是 §5.2 的 **trusted publishing（OIDC）**。

### 5.1 现在怎么发（交互式 2FA，止血）

发布前先自检手里的凭证是不是那个被限制的 bypass token：

```bash
npm whoami                        # 期望 polinni
npm profile get                   # 若回 E403 + /-/npm/v1/user ⇒ 你正拿着 bypass-2FA 的旧 token
```

`npm profile get` 回 403，就先换一张**让 2FA 真正参与**的凭证——**不要再新建 bypass-2FA 的 token**：

```bash
npm login --auth-type=web         # 浏览器授权，真正过 2FA；会覆盖 ~/.npmrc 里的旧 token
```

旧 token 备份在 `~/.npmrc.bak-*`（**不要**提交、不要贴进文档或对话）。
条款限制的是「**绕过 2FA** 的凭证」，让 2FA 真正参与的交互式发布会话不受 2027 年 1 月那条影响。

**2026-10-02 已在本机执行过一次**（记录证据，便于下次判断手里的是什么）：

- `npm login --auth-type=web` 在后台跑到退出码 0，先把
  `https://www.npmjs.com/login?next=/login/cli/<uuid>` 打印出来，浏览器授权后写回 `~/.npmrc`。
- 换完实测：`npm whoami` → `polinni`；`npm profile get` → **exit 0**（`two-factor auth: auth-and-writes`
  ⇒ 写操作会要 OTP）；`npm dist-tag ls dsh-skill-trace` → `beta: 0.8.0` / `latest: 0.8.0`。
- 新凭证前缀 `npm_bjUA…`（**只记前缀**）；旧的那张备份在
  `~/.npmrc.bak-before-2fa-login-20261002-2137`。**这个 web 会话凭证不出现在 `npm token list` 里**
  ——那张表列的是网站上的 granular access token，别因为看不到就以为没换成功。

**账户里现在有哪些 token**（2026-10-02 用注册表 API 实测，只列前缀、名称与 `bypass_2fa`）：

| 前缀 | 名称 | `bypass_2fa` | 到期 |
|---|---|---|---|
| `npm_UJBD…` | `DSH_Skill_Trace` | **false** | 2026-12-28 |
| `npm_DSFd…` | `ci-publish` | **true** | 2026-12-25 |
| `npm_iFm2…` | `sh-session-workbench@1.0.0` | **true** | 2026-11-28 |
| `npm_gXNZ…` | `dsh-publish` | **false** | 2026-11-28 |
| `npm_vjm4…` | `dsh-personal-center` | false | 2026-09-05（**已过期**，且只对该包可写） |
| `npm_2Ahf…` | `dsh-session-kb` | **true** | 2026-08-28（**已过期**） |

三张 `bypass_2fa: true` 的正是条款要淘汰的那批（2027-01 之后连 publish 都做不了）：**别再新建**，
可撤销或让它自然过期；`npm_UJBD…`（`DSH_Skill_Trace`，非 bypass，12-28 到期）是现成的包写权限 token，
做 CI 备选时要配 `--otp`。

之后的发布照旧，两条命令，顺序不能换：

```bash
npm publish --tag latest --cache=/tmp/npm-cache-dsh                     # 这个版本第一次发布
npm dist-tag add dsh-skill-trace@0.8.0 beta --cache=/tmp/npm-cache-dsh  # 第二个标签只能这样加
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

临时给 OTP 也可以：`npm publish --otp=<6 位码> --tag latest --cache=/tmp/npm-cache-dsh`。

### 5.2 目标方式：trusted publishing（OIDC）——仓库侧已就绪，等 npm 侧开关

仓库里已经有 `.github/workflows/publish-npm.yml`：推 `v*` tag（或手动 `workflow_dispatch` 填版本号）即触发，
`permissions.id-token: write`，先跑本地闸门（`node --check` / `npm test` / `npm run verify`）再发布；
最后一步把 `beta` 也指到同一版。**trusted publishing 会自动附带 provenance，不需要 `--provenance`。**
它要求 npm CLI ≥ 11.5.1，而 runner 自带的 npm 是 10.x，所以 workflow 里先 `npm install -g 'npm@^11.5.1'`。

**npm 侧四项配置只有维护者能在浏览器里点**（npmjs.com → 包 `dsh-skill-trace` → Settings → Trusted Publisher）：

| 字段 | 值 |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `PolinniZhong` |
| Repository | `dsh-skill-intelligence` |
| Workflow filename | `publish-npm.yml`（**必须与文件名逐字一致**） |
| Environment | 留空 |

同一页底部 **Allowed actions** 是**两个复选框**（页面上写着 `npm stage publish` 恒允许），**两个都要勾**：

- **`Allow npm publish`** —— 不勾的话 workflow 里那句 `npm publish` 会被拒；
- **`Allow npm dist-tag`**（2026-09-30 新增，新旧配置**都默认关**）—— 不勾的话能发布，但最后那步把
  `beta` 指到同一版会失败。

**别改用 CLI 建这个连接（2026-10-02 实测）**：`npm trust github <pkg> --file <workflow> --repo <owner/repo>
--allow-publish --allow-stage-publish -y` 确实存在，但 npm 11.17.0 的 `lib/trust-cmd.js` 只认两个权限常量
（`createPackage` / `createStagedPackage`，即 `allow-publish` / `allow-stage-publish`）——**没有 `Allow npm dist-tag`
对应的开关**。而 dist-tag 权限对新旧配置都默认关、字段建好又不能改，用 CLI 建等于先把「最后一步改 `beta`」
焊死。**只能在网页上勾。** 反过来 `npm trust list <pkg>` 是可以读配置的，但它按写操作要 OTP
（实测 `EOTP`：不给 `--otp` 时它会打印一个 `https://www.npmjs.com/auth/cli/…` 授权 URL）。

**页面上那句 `Cannot be changed later` 是真的**：`Publisher` 与三个必填字段建好即固定，填错只能删掉重建
——所以上表要逐字对。

**在 npm 侧配好之前，推 `v*` tag 会让这个 job 在 publish 那一步失败（`ENEEDAUTH`）。** 所以这一版之后、
切过去之前的发版仍然按 §5.1 在本地做。切过去之后，§2/§3 不变，只有 §5 从「两条 npm 命令」变成「等 workflow」；
附录 A 的顺序约束**自动满足**——workflow 检出的就是 tag 指向的那个提交，`gitHead` 天然对齐。

### 5.2b 怎么验「npm 侧配好了没」——不需要 OTP

不用登录网页，用一次**不会改动注册表**的 workflow 运行就能问出答案：

```bash
# 用一个**已经发布过的**版本号触发（例如刚发完的 0.8.0）：npm 先认证、再校验版本，
# 于是「认证成没成」与「版本重不重复」在日志里是两个可区分的失败
gh workflow run publish-npm.yml -f version=0.8.0
RID=$(gh run list --workflow publish-npm.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RID" && gh run view "$RID" --log > /tmp/oidc-probe.log
```

判据（只看 publish 那一步的日志）：

| 日志里出现 | 含义 |
|---|---|
| `npm verbose oidc Successfully retrieved and set token`，随后 publish 因 `EPUBLISHCONFLICT`（`cannot publish over the previously published versions`）失败 | **配好了**：OIDC 兑换成功，红只是因为该版本已存在（**预期，注册表没被改动**） |
| `npm http fetch POST 404 …/-/npm/v1/oidc/token/exchange/package/dsh-skill-trace` + `oidc Failed token exchange request with body message: OIDC token exchange error - package not found` + `npm error code ENEEDAUTH` | **还没配好**（npm 故意用 404 表示「没有能匹配这次 OIDC 身份的配置」） |
| `oidc Skipped because incorrect permissions for id-token within GitHub workflow` | workflow 少了 `permissions.id-token: write` |

上面那种 404 只在 `--loglevel=verbose` 下才打得出来；要复现就在临时分支上把 publish 那步改成
`npm publish --tag latest --loglevel=verbose`，run 完把分支删掉（2026-10-02 就是这么查的）。

**2026-10-02 的实测结果：`POST …/oidc/token/exchange/package/dsh-skill-trace` 回 `404` +
`OIDC token exchange error - package not found`，随后 `npm error code ENEEDAUTH`** —— 也就是说，
那天 npm 侧**一条配置都没有**，`/access` 页面上的表单没有保存成功。

同一个 run 还能顺带体检仓库侧：checkout / setup-node / `npm install -g 'npm@^11.5.1'` / 版本号比对 /
`npm ci` / 本地闸门（`node --check` + `npm test` + `npm run verify`）都应当是绿的（2026-10-02 那次就是如此）。
它们全绿、只有 publish 红，说明缺的只是 npm 侧那一下开关，而不是 workflow 有问题。

### 5.3 备选：staged publishing（本地提交 + 人工批准）

2026-09-18 新增的 token 类型 **Read and write (stage only)**：本地 `npm stage publish` 提交，维护者在 npm 上
**人工 2FA 批准**后才公开。条款明确它**保留 dist-tag 写权限**（所以两个标签仍然摆得动）。
前置条件：账户有发布权限 + **账户已启用 2FA** + npm CLI ≥ 11.15.0 + Node ≥ 22.14.0（本机 `11.17.0` / `26.5.0` 满足）。

### 5.4 npm v12 的安装期收紧：对本包**不需要任何兼容改动**

npm v12（已 tag `latest`）起，依赖的安装脚本默认不再执行（`allowScripts` 默认关），并且 `--allow-git`
与 `--allow-remote` 默认都是 `none`。对本包的影响是**零**，理由逐条可查：

- `dependencies` 为空；`scripts` 里**没有** `preinstall` / `install` / `postinstall` / `prepare`
  ——只有 `prepack`，那是**我们自己的**脚本，不是依赖的安装脚本。
- `dist/` 是提交进仓库、并随 tarball 发布的（`files` 含 `dist`），消费者装完即可用，
  **不需要 `npm approve-scripts` 放行任何东西**。
- README 推荐的两条安装命令走的是 `dsh plugin add`（DSH 自己的 pnpm 通道），不受 npm 这些默认值管辖。
  只有用 **npm** 直接从 git 装（`npm i github:PolinniZhong/dsh-skill-intelligence#v0.8.0`）才需要
  `--allow-git=all`；因为本包没有安装脚本，仍然不需要审批脚本。
- 本项目自身 `npm ci` 只有一个 devDependency（esbuild），与上面几条无关。

---

## 6. 发布后必做（缺一不可）

> 以下六步来自 `0.4.0-beta.7` → `0.4.0-beta.13` 的一次真实事故：
> 连续四个阶段的验收全部落空，用户连续多轮「看不到任何变化」。
> **`dsh plugin --profile X install` 成功，不等于 `X` 就是正在运行的那个 profile。**

### 6.0 本次 `v0.9.2` 的实际结果（2026-10-03）

| 项 | 结果 |
|---|---|
| 本地门槛 | **561 项测试全绿**；**28 组守卫全 OK**（含 `RELEASE_ASSETS_IN_SYNC_OK` 与 `GUARD_MARKERS_ARE_BACKED_OK`）；`node scripts/build-client.mjs` → `dist/client.js` **170324 字节**（source hash `66dd0b76118e7b85`），重建后 `git status` 无 `dist` 差异 |
| 发布提交 / tag | `1811d98 release: v0.9.2 — Skill 验收 / Skill Modify / 已安装列表排序`（`package.json` `0.9.2`，2026-10-03 10:26:02 +0800，33 个文件 / +7308 −255）= `origin/main`；tag `v0.9.2` → 注释对象 `b5f1e0c414e2e5d6020689b54745ef6ee517d3c3`，解引用到 `1811d986979423d4b03324293851314ad5665d11`（打在发布提交上，符合规则） |
| GitHub Release | <https://github.com/PolinniZhong/dsh-skill-intelligence/releases/tag/v0.9.2>（2026-10-03 02:26:24 UTC，`Latest`、非 prerelease、非 draft），正文取 `CHANGELOG.md` 的 `## 0.9.2` 段（72 行） |
| npm | **`beta` 与 `latest` 都指向 `0.9.2`**（`npm publish` 与 `npm dist-tag add` 都立即返回成功，注册表读侧约 2 分钟内可见）：发布提交**先推**，`gitHead` 就是 `1811d986979423d4b03324293851314ad5665d11`；包名仍是 `dsh-skill-trace`；**44 个文件 / 包体 463.1 kB / 解包 1474857 字节 / shasum `db47bdb987fc2cfb2eaa9c2e8dc4aeb6c6009c02`** |
| 净室安装 | 空目录 `npm i dsh-skill-trace@0.9.2` 通过：版本 `0.9.2`、`dependencies` 为空、`dist/client.js` **170324 字节**、`src/core/` **29 个 `.mjs`**（含新增的 `skill-profiles.mjs` / `skill-validation.mjs` / `skill-modification.mjs`）、`src/storage/modification-snapshot-store.mjs` 在、宿主入口可 `import`（导出 `apply` / `createSessionMutationQueue` / `name` …） |
| 推送 / 凭证 | 2026-10-03 探针：四个地址（`20.27.177.113` / `140.82.113.4` / `140.82.121.4` / `140.82.112.3`）此刻全回 `200`；用 `20.27.177.113` 推送成功（`fc12276..1811d98 main -> main`，tag 为新推）。**凭证踩坑**：`~/.npmrc` 里 2026-10-02 换上的 web-login token 已失效（`https://registry.npmjs.org/-/whoami` 回 **401**），本次改用备份里的旧 GAT（`~/.npmrc.bak-before-2fa-login-20261002-2137`：`whoami` 200 / 账户级 `/-/npm/v1/user` 403）发布 —— 它到 2027-01 前仍能直接 publish；使用时写进 `/tmp/npmrc-dsh-publish`（`600`，不进仓库），`~/.npmrc` 保持原样。**下一版发布前先跑一次 `npm whoami`，401 就重新 `npm login --auth-type=web`**（§5.1） |

### 6.0.1 本次 `v0.8.0` 的实际结果（2026-10-02）

| 项 | 结果 |
|---|---|
| 本地门槛 | **474 项测试全绿**；**25 组守卫全 OK**（含 `RELEASE_ASSETS_IN_SYNC_OK` 与 `GUARD_MARKERS_ARE_BACKED_OK`）；`node scripts/build-client.mjs` → `dist/client.js` **142672 字节**（source hash `f53a7ac5965b38b0`），重建后 `git status` 无 `dist` 差异 |
| 发布提交 / tag | `9a61387 release: v0.8.0 — Skill 演进：血缘 / 差异 / 界面`（`package.json` `0.8.0`，2026-10-02 20:51:40 +0800）= `origin/main`；tag `v0.8.0` → 注释对象 `783c4b2ffd1f3aa2ad6913df8afd3bbf623fd091`，解引用到 `9a61387`（打在发布提交上，符合规则） |
| GitHub Release | <https://github.com/PolinniZhong/dsh-skill-intelligence/releases/tag/v0.8.0>（2026-10-02 12:52:00 UTC，`Latest`、非 prerelease），正文取 `CHANGELOG.md` 的 `## 0.8.0` 段 |
| npm | **`beta` 与 `latest` 都指向 `0.8.0`**（注册表 `12:54:23 UTC` 生效，传播约 2 分钟；`npm dist-tag ls` 起初仍回 `0.7.1`，以 cache-busted packument 为准）：发布提交**先推**，`gitHead` 就是 `9a61387`；包名仍是 `dsh-skill-trace`；**40 个文件 / 包体 386.1 kB / 解包 1.2 MB / shasum `42a51dca83c74225d5239d34a985f56892e425fe`** |
| 净室安装 | `npm i dsh-skill-trace@0.8.0` 通过：`dist/client.js` **142672 字节**、`src/core/skill-lineage.mjs` / `src/core/skill-diff.mjs` / `src/storage/skill-lineage-store.mjs` 都在、宿主入口可 `require`（导出 `apply` / `createSessionMutationQueue` …）、`dependencies` 为空 |
| 推送 | 2026-10-02 探针：`140.82.121.4` / `140.82.112.3` / `20.27.177.113` / `140.82.113.4` 此刻全回 `200`（前两个在 0.7.1 发版时超时）；用 `20.27.177.113` 推送成功（`3a1bf0a..9a61387`）。**`-c http.curloptResolve` 的写法是 `HOST:PORT:ADDRESS`（冒号分隔）**——写成 `github.com:443,<IP>` 会报 `Couldn't parse CURLOPT_RESOLVE entry 'github.com:443,<IP>'` |

### 6.0.2 上一版 `v0.7.1` 的实际结果（2026-10-02 已执行）

| 项 | 结果 |
|---|---|
| 发布提交 | `74a161d release: v0.7.1 — 品牌迁移：DSH Skill Intelligence（DSH Skill 智能实验室）`（`package.json` `0.7.1`） |
| `origin/main` | `74a161de0ca1b619a1389a942ddbe88b78fa5f7c` —— 与本地 `main` **0 领先 / 0 落后** |
| tag | `v0.7.1` → 注释对象 `8abbacee672154beae23d72332b29fd76c0c0e63`，解引用到 `74a161d`（打在发布提交上，符合规则） |
| GitHub Release | <https://github.com/PolinniZhong/dsh-skill-intelligence/releases/tag/v0.7.1>（`Latest`，`prerelease=false`、`draft=false`），正文取 `CHANGELOG.md` 的 39 行 `## 0.7.1` 段 |
| npm | **`beta` 与 `latest` 都指向 `0.7.1`**（§5 本次已执行）：发布提交 `74a161d` **先推**，`gitHead` 就是它；37 个文件 / 包体 348.0 kB / 解包 1.1 MB / shasum `2379892b6fe5a61ba5d00502545a707982e8fb13`；注册表传播有延迟 |
| 本地门槛 | **429 项测试全绿**；**23 组守卫全 OK**（含 `RELEASE_ASSETS_IN_SYNC_OK` 与 `GUARD_MARKERS_ARE_BACKED_OK`）；`node scripts/build-client.mjs` → `dist/client.js` **129315 字节**（source hash `58ed0ec27f941c3f`），重建后 `git status` 无 `dist` 差异 |
| 附属产出 | 向 `awesome-dsh-plugin/awesome-dsh-plugin` 投稿：PR [#6351](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6351)，只加 `data/plugins/PolinniZhong__dsh-skill-intelligence.yml`（`category: skill`） |

### 6.0.3 上一版 `v0.7.0` 的实际结果（2026-10-02 已执行）

| 项 | 结果 |
|---|---|
| 发布提交 | `5fac5d9 release: v0.7.0 — Skill 理解与复用：读得懂、存得住、复刻得走`（`package.json` `0.7.0`） |
| `origin/main` | `5fac5d961fa7b01e91ef02f81c76c85a1dcee431` —— 与本地 `main` **0 领先 / 0 落后** |
| tag | `v0.7.0` → 注释对象 `9ceb019ba63039a8e56635d43ca00298b92a830b`，解引用到 `5fac5d9`（打在发布提交上，符合规则） |
| GitHub Release | <https://github.com/PolinniZhong/dsh-skill-trace/releases/tag/v0.7.0>（`Latest`，`prerelease=false`、`draft=false`），正文取 `CHANGELOG.md` 的 266 行 `## 0.7.0` 段 |
| npm | **`beta` 与 `latest` 都指向 `0.7.0`**（§5 本次已执行）：口径提交 `9800098` **先推**，`gitHead` 就是它；37 个文件 / 346.6 kB / 解包 1070413 字节 / shasum `015bbf75aee07c5dd921fdc093727e2795c1d155`；约 3.5 分钟后注册表才对上；空目录安装验证通过 |
| 本地门槛 | **429 项测试全绿**；**23 组守卫全 OK**（含 `GUARD_MARKERS_ARE_BACKED_OK` 与 `RELEASE_ASSETS_IN_SYNC_OK`）；`node scripts/build-client.mjs` → `dist/client.js` **129280 字节**（source hash `31d39c71f13aeeb8`），重建后 `git status` 无 `dist` 差异 |

### 6.0.4 上一版 `v0.6.1` 的实际结果（2026-10-01 已执行）

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

### 6.0.5 上一版 `v0.6.0` 的实际结果（2026-10-01）

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
