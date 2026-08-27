# DSH Skill Trace

> **看清 Agent 在这次会话实际加载了什么 Skill，把运行过程变成可复看、可学习的本地收据。**

DeepSeek Harness 插件 · 本地优先 · MIT · 中文界面名：**Skill 追踪**

当 Agent 自动选择 Skill 时，普通用户常常只看到结果：不知道它加载了什么、按什么步骤工作、依赖什么，或自己是否已经真的学会。DSH Skill Trace 将可观测的加载事件、Skill 声明步骤和你的个人理解放在同一处，帮助你从“看见发生了什么”走到“下次能自己继续”。

> 一次成功的 `skill(name)` 调用只证明 Agent 请求并成功加载了 Skill；**不**证明 Agent 完全遵循其指令，也不证明 Skill 导致了正确结果。插件会明确保留这条证据边界。

![本次 Skill 收据：加载证据、依赖线索与声明步骤](docs/images/skill-receipt.jpg)

*本次 Skill 收据：每个阶段都可展开查看；截图来自本轮 DSH Desktop，已裁去侧栏和个人填写区。*

## 快速概览

| 项目 | 说明 |
| --- | --- |
| 插件名称 | `dsh-skill-trace` |
| 适配平台 | DeepSeek Harness `web` Profile / Desktop（当前已在 DSH Desktop `0.8.3` 与 runtime `0.1.1-rc.2` 基线验证） |
| 解决的问题 | Agent 加载了什么 Skill、何时加载、声明如何运行、我能否手动延续，都缺少用户可读的证据 |
| 核心界面 | **Skill 收据**、**流程地图**、**我的 Skill** |
| 证据范围 | 观测 `skill(name)` 的调用/结果；区分请求、成功、失败、未知与人工判断 |
| 学习闭环 | 查看声明步骤 → 回看真实收据 → 写下个人理解、改进意图、下次验证方式 |
| 隐私 | 本地优先；不保存完整 Prompt、完整 Skill 正文、Token、Cookie、绝对路径或项目内容 |
| 不做什么 | 不发现/安装/同步/路由 Skill；不自动运行脚本；不自动改写、提交或发布 Skill |

## 你会看到什么

### 1. 本次 Skill 收据：先回答“刚刚发生了什么”

按时间顺序展示本次会话中的 Turn、步骤、请求加载、结果和收据状态。多次调用、多个 Skill、加载失败和没有观测到 Skill 的空状态都会分别呈现，而不是把“未观测”写成“未使用”。

### 2. 流程地图：适合有系统结构基础的用户

把同一组事实组织成节点和关系：哪个 Turn 请求了哪个 Skill、成功或失败结果、可见输出关联与依赖候选。它与收据共用同一事实源，只改变阅读方式，不额外制造一套“AI 推断流程”。

### 3. 我的 Skill：不记得 `/` 命令时，也能找到已发现的 Skill

“我的 Skill”是当前 Agent Preset 作用域内的只读学习索引，可按名称或声明简介搜索，并区分真实收据、会话理解、暂未观测、历史候选和版本变化。它不是 Skill 管理器，不会安装、卸载、同步或更新任何 Skill。

![我的 Skill：按可发现状态、真实收据和会话理解筛选](docs/images/my-skills-catalog.jpg)

*我的 Skill：把当前可发现的 Skill、真实收据和本地会话理解放在可搜索的目录中。*

## 工作方式

```mermaid
flowchart LR
    A[Agent 请求 skill(name)] --> B[DSH 工具调用与结果]
    B --> C[Skill 追踪：本地收据]
    C --> D[查看声明步骤与依赖线索]
    D --> E[写下个人理解 / 改进 / 验证]
    E --> F[下次按自己的方式继续]

    B -. 成功加载不等于有效 .-> G[不自动推断遵循、正确性或因果]
```

## 三步开始

### 1. 通过 GitHub 试用版安装

```bash
dsh plugin --profile web add "github:PolinniZhong/dsh-skill-trace#v0.3.0-beta.1&path:/"
```

安装后重启 DeepSeek Harness Desktop，在会话中打开 **Skill 追踪**。

> 当前功能已通过本地链接安装的 Desktop 验证。GitHub 源安装命令采用 DSH 的 `github:` 插件源格式；如未来 DSH 更新导致源安装行为变化，可使用下方的克隆安装作为回退方式。

### 2. 跑一次真实任务

让 Agent 自然加载一个 Skill。若本次没有观测到任何 Skill，插件只显示“当前对话暂未使用任何 Skill”的空状态，不会填入示例数据。

### 3. 用收据学习，而不是把加载当作成功

展开“发生了什么”和“加载记录”，再逐项看 Skill 声明的候选步骤。用自己的话填写：

- **我的理解**：这个 Skill 的目标与步骤是什么？
- **我想改进**：我会修改哪些分支、边界或不适用场景？
- **下次如何验证**：我准备怎么验证改动？

这些内容仅保存在本机当前收据中，可在“我的 Skill → Skill 详情 → 历次会话理解”回看；不会上传给项目维护者，也不会写回或发布 Skill。

## 本地开发与回退安装

```bash
git clone https://github.com/PolinniZhong/dsh-skill-trace.git
cd dsh-skill-trace
npm test
npm run verify
dsh plugin --profile web add "link:$(pwd)"
```

移除插件：

```bash
dsh plugin --profile web remove dsh-skill-trace
```

移除插件不会自动删除已有本地收据；删除应始终由用户在产品内明确确认。

## 隐私与边界

- 不实现遥测、云同步、收据上传或远程分析。
- 只保存显示加载证据所需的最小元数据、安全来源标识和用户主动填写的本地笔记。
- 不保存完整 Prompt、完整 Skill 指令、访问 Token、Cookie、凭据、绝对路径、项目文件或生成内容。
- 网络、模型、MCP、脚本、权限只会作为**候选线索**呈现，仍需要人工核对；“可手工延续 / 可部分延续 / 当前受阻”也必须由用户自己判断。

详见 [隐私说明](docs/PRIVACY.md) 与 [架构说明](docs/ARCHITECTURE.md)。

## 当前状态

这是 `0.3.0-beta.1` 工程试用版。已验证：多 Skill 记录、重复调用、成功/失败、零 Skill 空状态、重启恢复、双视图一致性、只读目录、本地理解卡与隐私白名单。

仍待验证：真实用户关闭材料后的即时复述、24 小时复测、超长流程地图导航，以及系统级无障碍审计。请不要把试用版视作“用户已经理解 Skill”或“加载必然带来有效产出”的证明。

## 开发与验证

```bash
npm test
npm run verify
npm pack --dry-run
```

当前包含 40 组自动化测试，覆盖事件归并、来源快照、收据与偏好持久化、目录投影、学习笔记与 Host 隐私策略。以上命令不替代完整的 DSH Desktop 端到端回归。

## FAQ

| 问题 | 回答 |
| --- | --- |
| 为什么显示“已加载”却不显示“有效”？ | 加载结果只能证明工具调用成功，不能证明 Agent 遵循了全部指令、结果正确或由该 Skill 造成。 |
| 一个会话用了多个 Skill，能看到吗？ | 能。收据按实际观测的加载事件记录多个 Skill 和重复加载。 |
| 没有加载 Skill 时会怎样？ | 显示明确空状态；不会用演示内容或历史数据冒充本次运行。 |
| “我的 Skill”会替我安装或更新吗？ | 不会。它仅展示当前作用域下可发现的 Skill 和本地学习证据。 |
| 我写的理解会传回项目方吗？ | 不会。它只保存在你的本机收据中。 |
| 能直接生成或发布改好的 Skill 吗？ | 不能。这一版本只帮助你理解、记录改进意图与准备验证清单。 |

## 相关文档

- [Architecture](docs/ARCHITECTURE.md) — 事件、收据和目录的实现边界
- [Privacy](docs/PRIVACY.md) — 本地数据边界与报告注意事项
- [Changelog](CHANGELOG.md) — 版本变化
- [Security policy](SECURITY.md) — 非敏感问题报告方式

## License

[MIT](LICENSE)
