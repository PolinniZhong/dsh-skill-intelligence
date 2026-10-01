import { join, resolve } from 'node:path'

/**
 * 复刻要写到哪个目录（v0.7 §十一）。
 *
 * 目录不是猜的，是**从 DSH 自己的根目录体系里挑的**：`dsh-skill-filesystem` 的
 * `roots(cwd)` 按优先级列出六个根，这里只用其中与"用户显式指定范围"对应的三个 ——
 * 项目级 `<projectRoot>/.dsh/skills`，用户级 `<dshHome>/skills` 与 `<agentsHome>/skills`。
 * 项目根与 `findProjectRoot` 同义：从会话 cwd 向上找最近的、含 `.git` 的祖先。
 *
 * 用户级有两个候选，选择顺序是**两级**的：
 *
 * 1. **里面已经有 Skill 的那个根** —— 用户已有的 Skill 在哪，新的就写到哪，不另起一处。
 *    这台机器上 `~/.dsh/skills` 与 `~/.agents/skills` 都存在，但只有后者装着用户的
 *    二十多个 Skill；只看"目录在不在"会把复刻写进那个空目录。
 * 2. 都没有 Skill 时，按 DSH 的 rank 走（`user-dsh` 400 在 `user-agents` 500 之前），
 *    再都没有就用 DSH 原生根 `<dshHome>/skills`，不去替用户发明 `.agents`。
 *
 * 选中的是哪一个会作为 `pathKind` 返回（`project-dsh` / `user-dsh` / `user-agents`），
 * 但**绝对路径不出宿主**（§八.5）。界面只需要知道"写进了项目级还是用户级"。
 */

export const CLONE_PATH_KINDS = Object.freeze({
  PROJECT_DSH: 'project-dsh',
  USER_DSH: 'user-dsh',
  USER_AGENTS: 'user-agents',
})

export function skillRootFor(kind, { projectRoot, dshHome, agentsHome }) {
  if (kind === CLONE_PATH_KINDS.PROJECT_DSH) return projectRoot ? join(projectRoot, '.dsh', 'skills') : null
  if (kind === CLONE_PATH_KINDS.USER_DSH) return dshHome ? join(dshHome, 'skills') : null
  if (kind === CLONE_PATH_KINDS.USER_AGENTS) return agentsHome ? join(agentsHome, 'skills') : null
  return null
}

/**
 * `existing` 是"当前真的存在"的路径清单，`populated` 是它里面"真的已经有 Skill"的那些 ——
 * 两者都由调用方从文件系统读出后传进来，这一层因此仍然是纯函数。
 */
export function resolveCloneRoot({ scope, projectRoot, dshHome, agentsHome, existing = [], populated = [] }) {
  const present = new Set(existing.map((value) => resolve(String(value))))
  const holds = new Set(populated.map((value) => resolve(String(value))))
  if (scope === 'user') {
    const dshRoot = skillRootFor(CLONE_PATH_KINDS.USER_DSH, { dshHome })
    const agentsRoot = skillRootFor(CLONE_PATH_KINDS.USER_AGENTS, { agentsHome })
    // 先问"用户已经在哪儿用 Skill"，再问 DSH 的 rank。两个都在用才轮到 rank 说话。
    if (dshRoot && holds.has(resolve(dshRoot))) return { kind: CLONE_PATH_KINDS.USER_DSH, path: dshRoot, reason: 'populated-dsh-user-root' }
    if (agentsRoot && holds.has(resolve(agentsRoot))) return { kind: CLONE_PATH_KINDS.USER_AGENTS, path: agentsRoot, reason: 'populated-agents-user-root' }
    if (dshRoot && present.has(resolve(dshRoot))) return { kind: CLONE_PATH_KINDS.USER_DSH, path: dshRoot, reason: 'existing-dsh-user-root' }
    if (agentsRoot && present.has(resolve(agentsRoot))) return { kind: CLONE_PATH_KINDS.USER_AGENTS, path: agentsRoot, reason: 'existing-agents-user-root' }
    if (!dshRoot && !agentsRoot) return { kind: null, path: null, reason: 'no-user-skill-root' }
    return { kind: CLONE_PATH_KINDS.USER_DSH, path: dshRoot ?? agentsRoot, reason: 'default-dsh-user-root' }
  }
  const projectSkillRoot = skillRootFor(CLONE_PATH_KINDS.PROJECT_DSH, { projectRoot })
  if (!projectSkillRoot) return { kind: null, path: null, reason: 'no-project-root' }
  return {
    kind: CLONE_PATH_KINDS.PROJECT_DSH,
    path: projectSkillRoot,
    reason: present.has(resolve(projectSkillRoot)) ? 'existing-project-root' : 'project-root-to-create',
  }
}

/** 目标 Skill 在根目录下的两种落点：目录 bundle 与扁平文件。两种都算冲突。 */
export function cloneTargetPaths(root, targetName) {
  return {
    directory: join(root, targetName),
    skillFile: join(root, targetName, 'SKILL.md'),
    flatFile: join(root, `${targetName}.md`),
  }
}
