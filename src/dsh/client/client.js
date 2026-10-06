// DSH Skill Intelligence（中文名：DSH Skill 智能实验室）— conversation view client.
//
// 命名分层（2026-10-02 品牌迁移；2026-10-02 短显示名）：**产品品牌**是 DSH Skill 智能实验室 /
// DSH Skill Intelligence —— README 首屏、仓库描述、文档抬头用这一层；**DSH 会话里的短显示名**
// 是 Skill 洞察 / Skill Insight —— 侧边栏、工作栏标签这类高频入口用这一层（见文件末尾
// `conversation.view` 的 slot label）；**npm 包名**仍是 `dsh-skill-trace`（已发布，不能改）；
// **技术概念** Skill Trace（本地加载证据）保留 —— 路由 `/skill-trace/*`、命名空间
// `dsh-skill-trace`、`[data-plugin="dsh-skill-trace"]`、storage 结构都不随命名调整而改。
//
// This file is the *implementation*: a plain CommonJS module. It is bundled by
// `scripts/build-client.mjs` into `dist/client.js`, which wraps it in the
// `window.__ModuleLoader__.load({ id, factory })` registration the DSH web shell
// expects. The bundle inlines every dependency that is not a platform seed word,
// because the module table resolves only those (see docs/ARCHITECTURE.md).
//
// Never point `exports['./client']` at this file: the shell reads the client entry
// verbatim and does not bundle it.
  const React = require('react')
// 纯函数、无 node 内置依赖，所以能被内联进客户端。搜索必须和宿主用同一个谓词，
// 否则「搜得到」会随请求发往哪一端而变化。
const { matchesInstalledQuery } = require('../../core/installed-view.mjs')
// 译文的寿命定在核心层：它是纯数据、没有 I/O，所以能单独测 —— 而不是埋在组件里，
// 只能靠人眼在真实应用里切来切去地试。
const { readCachedTranslation, translationCacheKey, writeCachedTranslation } = require('../../core/translation-cache.mjs')
// 表格的解析规则只有一份：翻译校验拿它判「形状有没有被改坏」，渲染器拿它画 HTML 表格。
// 两边各扫一遍行的话，迟早会在「什么算一张表」上分家，而分家时两道防线会同时失效。
const { parseTableAt } = require('../../core/markdown-table.mjs')
// 复刻的名字规则必须和宿主**同一条**：DSH 取 Skill 身份取的是 frontmatter 里的 `name`，
// 前端先放行一个宿主会拒的名字，等于让用户填完表单才被退回来（v0.7 §十四）。
const { CLONE_MAX_BYTES, CLONE_MODES, CLONE_SCOPES, cloneTargetName, isSkillName } = require('../../core/skill-clone.mjs')
// 声明流程的状态词表来自核心层：它和 runtime-alignment 的五个关系一一对应，写在这里
// 是为了让「界面说的」和「模型算的」是同一套词。
const {
  FLOW_DECLARATION_NOTE, FLOW_EMPTY_TEXT, FLOW_TRUNCATED_TEXT, FLOW_UNAVAILABLE_TEXT,
  STEP_EVIDENCE_HEADINGS, STEP_EVIDENCE_NOTE,
  flowEvidenceLabel, flowEvidenceState, flowKindLabel,
} = require('../../core/flow-evidence.mjs')
// 框架与运行逻辑的说法同样来自核心层：它们是纯数据，能在没有浏览器的情况下断言，
// 也就不会随某一次界面改动悄悄变形。
const {
  DISCLOSURE_NOTE, FRAMEWORK_NOTE, FRAMEWORK_ROLE_LABELS, FRAMEWORK_ROLE_HINTS, FRAMEWORK_UNCLASSIFIED_LABEL,
} = require('../../core/skill-framework.mjs')
const { RUNTIME_LOGIC_NOTE } = require('../../core/skill-runtime-logic.mjs')
// 实例验收（V0.10.0）：把「这次修改」变成一段能拿去真跑的真实任务。它零依赖、不读时间、
// 不掷骰子 —— 同一份输入永远得到同一份 Prompt，规格里「必须能证明生成出来的 Prompt 真的是
// 针对这次修改的」那条终验判据，只有在这种形态下才是可断言、可复核的。
const {
  INSTANCE_TEST_GOAL_TEXT, INSTANCE_TEST_GOAL_TITLE, INSTANCE_TEST_HEADLINE, INSTANCE_TEST_LIMITATION_NOTE,
  INSTANCE_TEST_OBSERVATION_NOTE, INSTANCE_TEST_OBSERVATION_TITLE, INSTANCE_TEST_PROMPT_TITLE,
  INSTANCE_TEST_SCOPE_FOCUS, INSTANCE_TEST_UNAVAILABLE_MESSAGES, buildSkillInstanceTest,
} = require('../../core/skill-instance-test.mjs')

// 评测（V1.0）：把 V0.10 那份一次性任务升级成**可重复的 Case**，并把「这一次运行看到了什么」
// 摆成四段证据。它同样是零依赖纯函数（只 import 实例验收那一支），客户端只负责画：
// 判定由人点出来或 Agent 自报，条件与指纹由宿主取 —— 界面自己一个字都不判定、不聚合。
const {
  EVALUATION_UNAVAILABLE_TEXT, EVALUATION_VERDICT_IDS, EVALUATION_VERDICT_LABELS,
  EVALUATION_SOURCE_IDS, EVALUATION_SOURCE_LABELS, EVALUATION_RUN_FIELD_LABELS,
  EVALUATION_FORBIDDEN_OUTPUTS, buildEvaluationCase, buildEvaluationAssertions,
  compareEvaluationRuns, buildRuntimeEvidence,
} = require('../../core/skill-evaluation.mjs')
// 证据（V1.2）：把上面这些已经取好的事实收进**同一套三态语义**（Declared / Observed /
// Unavailable），再交给界面画。这样做不是因为界面需要多一个工具，而是因为「这句话是 Skill
// 自己说的，还是系统观察到的」这个问题必须在**一个**地方回答 —— 散在每个卡片里各写一套状态词，
// 迟早会出现两张卡对同一件事给出两种说法。它同样是零依赖纯函数，`evidenceId` 由规范输入串
// 决定（不用时间、不用随机数），所以同一份事实每次都得到同一个 id。
const {
  EVIDENCE_UNAVAILABLE_TEXT, EVIDENCE_STATUS_IDS, EVIDENCE_STATUS_LABELS,
  EVIDENCE_TABLE_COLUMNS, buildSkillEvidence, buildEvidenceExport, evidenceRows,
} = require('../../core/skill-evidence.mjs')
  const NS = 'dsh-skill-trace'
  // Keep display copy in the client. Receipt facts, Skill definitions and
  // user-authored notes stay untouched; only our own UI wording is localized.
  const EN = {
    '当前会话': 'Current session',
    '本次 Skill 使用记录': 'Skill usage this session',
    'Skill 洞察': 'Skill Insight', '刷新': 'Refresh',
    '工作区未连接': 'No workspace connected', '正在读取当前会话…': 'Reading current session…',
    '当前目录无法确认': 'Current catalog cannot be confirmed', '目录可能不完整': 'Catalog may be incomplete',
    '返回 Skill 列表': 'Back to Skill list', 'Skill 列表': 'Skill list',
    '搜索 Skill': 'Search Skills', '重试': 'Retry',
    '保存': 'Save',
    '当前对话暂未加载任何 Skill。': 'No Skill has been loaded in this conversation yet.', '正在读取当前对话的 Skill 使用情况…': 'Reading Skill usage in this conversation…',
    '当前视图没有可用的会话 ID': 'No session ID is available for this view.', '本次 Skill': 'Skills in this run',
    '本次加载的 Skill': 'Skills loaded in this run',
    '定义可用': 'Definition available',
    '未找到定义': 'No definition found', '注册表不可用': 'Registry unavailable',
    '定义状态未知': 'Definition status unknown', '指令指纹比对': 'Instruction fingerprint',
    '无法比对': 'Cannot be compared', '一致': 'Match',
    '文件已改变': 'The file has changed', '没有找到 git work tree，无法确定仓库来源。': 'No git work tree was found, so the repository source cannot be established.',
    '这份 Skill 的定义当前读不到，所以无法抽取声明流程。': 'The definition cannot be read right now, so no declared flow could be extracted.', '本次会话没有记录到该 Skill 的成功加载。': 'This session recorded no successful load of this Skill.',
    'Skill 注册表不可用，所以缺少描述与定义状态。': 'The Skill registry is unavailable, so descriptions and definition status are missing.', '部分声明步骤因内容可疑而被省略。': 'Some declared steps were withheld by the sanitiser.',
    '定义正文被截断，声明流程可能不完整。': 'The definition body was truncated, so the flow may be incomplete.', '资源基准路径已省略。': 'The resource base path is withheld.'
  }
  const ZH = Object.fromEntries(Object.keys(EN).map((key) => [key, key]))
  let translate = (key) => key
  const RAW = Symbol('dsh-skill-trace.raw')
  const raw = (value) => ({ [RAW]: true, value })
  const t = (key) => translate(key)
  const isEnglish = () => (localeService?.getSnapshot().active || 'en') !== 'zh'
  const localized = (zh, en) => isEnglish() ? en : zh
  const localize = (value) => {
    if (value && value[RAW]) return value.value
    if (Array.isArray(value)) return value.map(localize)
    return typeof value === 'string' ? t(value) : value
  }
  const h = (type, props, ...children) => {
    const nextProps = props ? { ...props } : props
    for (const key of ['aria-label', 'title', 'placeholder']) {
      if (typeof nextProps?.[key] === 'string') nextProps[key] = t(nextProps[key])
    }
    return React.createElement(type, nextProps, ...children.map(localize))
  }
  const STYLE_ID = 'dsh-skill-trace-style'
  const API_ROOT = '/skill-trace'
  const VIEW_KEY = 'dsh-skill-trace.default-view'
  // 宿主偏好文件里的 IA 版本号，与 `src/storage/preference-store.mjs` 的 `PREFERENCES_VERSION` 成对
  // （`scripts/verify-project.mjs` 的 PREFERENCE_VERSION_OK 钉住两处一致）。
  // 为什么要看版本：旧版第一屏是「运行流程」，而它把这个缺省值当成"用户选择"写进了文件，于是升级后
  // 插件仍然开在运行地图上——正好是这次重构要换掉的那一屏。文件里没有字段能区分"选择"和"旧缺省"，
  // 所以**没有版本号的偏好一律视为"从未表达过"**，回落到 query / localStorage / 新的第一屏。
  // 这样旧宿主（还不带 version）与新宿主（带 version）都能得到正确结果，不必等宿主重启。
  const PREFERENCE_VERSION = 3
  // 草稿缓冲随「我的 Skill」工作台一起退役：写草稿的编辑器（人工理解 / 验证结果 / 学习卡片）
  // 已经不在一级 IA 里（§4.2），所以 beforeunload 保护也就没有东西可保护了。顺带这是客户端
  // 最后一处 `sessionStorage` —— 现在整份插件只读宿主的接口，不在浏览器里留任何键。

  function Icon({ name, size = 16 }) {
    const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }
    const paths = {
      receipt: [h('path', { key: 1, d: 'M6 3h12v18l-3-2-3 2-3-2-3 2Z' }), h('path', { key: 2, d: 'M9 8h6M9 12h6M9 16h3' })],
      map: [h('circle', { key: 1, cx: 6, cy: 6, r: 2 }), h('circle', { key: 2, cx: 18, cy: 8, r: 2 }), h('circle', { key: 3, cx: 10, cy: 18, r: 2 }), h('path', { key: 4, d: 'm7.8 7 8.3.9M7 7.8l2.2 8.4M16.8 9.7l-5.5 6.7' })],
      graph: [h('rect', { key: 1, x: 2.5, y: 9, width: 5, height: 6, rx: 1.2 }), h('rect', { key: 2, x: 9.5, y: 3, width: 5, height: 6, rx: 1.2 }), h('rect', { key: 3, x: 9.5, y: 15, width: 5, height: 6, rx: 1.2 }), h('rect', { key: 4, x: 16.5, y: 9, width: 5, height: 6, rx: 1.2 }), h('path', { key: 5, d: 'M7.5 11h2M14.5 9V6h2M14.5 15v3h2' })],
      skill: [h('path', { key: 1, d: 'M8 3h8v4a3 3 0 1 1 0 6v8H8v-4a3 3 0 1 0 0-6Z' })],
      check: [h('path', { key: 1, d: 'm5 12 4 4L19 6' })],
      alert: [h('path', { key: 1, d: 'M12 3 2.8 19h18.4L12 3Z' }), h('path', { key: 2, d: 'M12 9v4M12 17h.01' })],
      link: [h('path', { key: 1, d: 'M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1 1' }), h('path', { key: 2, d: 'M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1-1' })],
      refresh: [h('path', { key: 1, d: 'M20 12a8 8 0 1 1-2.34-5.66' }), h('path', { key: 2, d: 'M20 4v6h-6' })],
      trash: [h('path', { key: 1, d: 'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13' })],
      arrow: [h('path', { key: 1, d: 'M5 12h14M14 7l5 5-5 5' })],
      info: [h('circle', { key: 1, cx: 12, cy: 12, r: 9 }), h('path', { key: 2, d: 'M12 11v5M12 8h.01' })],
      book: [h('path', { key: 1, d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z' }), h('path', { key: 2, d: 'M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z' })],
      copy: [h('rect', { key: 1, x: 8, y: 8, width: 11, height: 11, rx: 2 }), h('path', { key: 2, d: 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3' })],
      download: [h('path', { key: 1, d: 'M12 3v12M7 10l5 5 5-5' }), h('path', { key: 2, d: 'M4 19h16' })],
      edit: [h('path', { key: 1, d: 'M12 20h9' }), h('path', { key: 2, d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z' })],
      list: [h('path', { key: 1, d: 'M9 6h11M9 12h11M9 18h11' }), h('circle', { key: 2, cx: 4, cy: 6, r: 1 }), h('circle', { key: 3, cx: 4, cy: 12, r: 1 }), h('circle', { key: 4, cx: 4, cy: 18, r: 1 })],
      search: [h('circle', { key: 1, cx: 11, cy: 11, r: 7 }), h('path', { key: 2, d: 'm20 20-4-4' })],
      chevron: [h('path', { key: 1, d: 'm9 18 6-6-6-6' })],
    }
    return h('svg', props, ...(paths[name] || paths.info))
  }

  // 回退原因的词表很小，而且是**我自己的**分类，不是模型的自我描述。未知规则不加括号，
// 宁可少说也不猜。
function fallbackReasonSuffix(rules) {
  const words = [...new Set((Array.isArray(rules) ? rules : []).map((rule) => TRANSLATION_RULE_TEXT[rule]).filter(Boolean))]
  return words.length ? `（${words.join('、')}）` : ''
}

function fallbackReasonSuffixEn(rules) {
  const words = [...new Set((Array.isArray(rules) ? rules : []).map((rule) => TRANSLATION_RULE_TEXT_EN[rule]).filter(Boolean))]
  return words.length ? ` (${words.join(', ')})` : ''
}

/** 段级校验的规则名到人话。 */
const TRANSLATION_RULE_TEXT = {
  heading: '标题层级被改动',
  placeholder: '受保护的片段被改动',
  untranslated: '模型把原文原样返回了',
  table: '表格的行列结构被改动',
  empty: '模型没有返回内容',
}

const TRANSLATION_RULE_TEXT_EN = {
  heading: 'a heading level changed',
  placeholder: 'a protected span changed',
  untranslated: 'the model returned the source unchanged',
  table: 'the table structure changed',
  empty: 'the model returned nothing',
}

function installStyles() {
    const previous = document.getElementById(STYLE_ID)
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      [data-plugin="dsh-skill-trace"]{
      /* DSH Theme → DSH Alias → --st-* → DSH Skill Intelligence UI
       *
       * Every neutral, status and brand token resolves to a **DSH alias token** first; the
       * literal is only the fallback for the abnormal case where the host token is absent.
       * That is what makes Light/Dark work without a second stylesheet and without any
       * isDark state: DSH redefines its aliases per theme and this follows automatically.
       *
       * Capability colours (skill/tool/mcp/cli) have no DSH alias equivalent — they are
       * semantic *type* markers, not theme surfaces — so they keep their hue. Blending them
       * against --st-layer happens at the usage site, which keeps them readable on either
       * theme without changing what they mean.
       */
      color-scheme: light dark;
      /* v0.6 semantic layer — design §5.1 的落地版。
       *
       * design 里用来兜底的 17 个 --dsw-alias-* 名字在 DSH 中全部不存在
       * （-bg / -surface / -text / -border / -accent / -success / -code-bg …），
       * 照抄会让每一个 fallback 永远生效、插件永远跟不动宿主主题。这里按真实 alias 重写。
       *
       * 两个语义陷阱：
       *   - --dsw-alias-brand-primary 是 #0f1115 的「主按钮对比色」，不是蓝色强调色。
       *     蓝色强调色是 --dsw-alias-link（deepseek-500，暗色 deepseek-400）。
       *     早先这里把它当 accent 用，暗色下 background + color:white 会白底白字。
       *   - --dsw-alias-markdown-code-block 是浅底，不是原型里的 #0e1116 深底。
       *     代码块跟随宿主 token，否则亮色模式里会突兀地出现一块黑。
       *
       * 暗色不写任何覆盖，也不写 prefers-color-scheme 媒体查询：DSH 用
       * body[data-ds-dark-theme] 重定义整套 alias，消费 alias 就自动跟随；
       * 自建媒体查询会在「系统暗色 + 用户显式选亮色」时与宿主相反。
       * 软色一律用 color-mix 从强调色与当前 surface 派生，避免再造一套固定色值。
       */
      --st-bg:var(--dsw-alias-bg-base,#f5f7fa);
      --st-surface:var(--dsw-alias-bg-layer-1,#fff);
      --st-surface-subtle:var(--dsw-alias-bg-layer-2,#f0f3f7);
      --st-surface-raised:var(--dsw-alias-bg-layer-3,#fff);
      --st-text:var(--dsw-alias-label-primary,#17191d);
      --st-text-secondary:var(--dsw-alias-label-secondary,#6f7682);
      --st-text-tertiary:var(--dsw-alias-label-tertiary,#9aa1ad);
      --st-border:var(--dsw-alias-border-l2,#e6e9ee);
      --st-border-soft:var(--dsw-alias-border-l1,#edf0f3);
      --st-border-strong:var(--dsw-alias-border-l3,#cfd6e0);
      --st-accent:var(--dsw-alias-link,#1f6feb);
      --st-accent-soft:color-mix(in srgb,var(--st-accent) 12%,var(--st-surface));
      --st-success:var(--dsw-alias-state-success-primary,#18864b);
      --st-warning:var(--dsw-alias-state-warn-primary,#9a6700);
      --st-danger:var(--dsw-alias-state-error-primary,#c73a3a);
      --st-success-soft:color-mix(in srgb,var(--st-success) 12%,var(--st-surface));
      --st-warning-soft:color-mix(in srgb,var(--st-warning) 12%,var(--st-surface));
      --st-danger-soft:color-mix(in srgb,var(--st-danger) 12%,var(--st-surface));
      --st-code-bg:var(--dsw-alias-markdown-code-block,#f3f5f8);
      --st-code-text:var(--st-text);
      /* §11.9: the "jump to this section" highlight must not be a literal colour. Mixing the
       * warning hue into whatever the current surface is keeps it legible on either theme, so the
       * audit view needs no body[data-ds-dark-theme] override of its own. */
      --st-highlight:color-mix(in srgb,var(--st-warning) 22%,var(--st-surface));
      /* v0.5 遗留名字，暂时作为别名保留，随 Runtime 视图一起删除。 */
      --st-brand:var(--st-accent);
      --st-brand-soft:var(--st-accent-soft);
      --st-layer:var(--st-surface);
      --st-layer-2:var(--st-surface-subtle);
      --st-muted:var(--st-text-secondary);
      --st-faint:var(--st-text-tertiary);
      --st-error:var(--st-danger);
    }
      [data-plugin="dsh-skill-trace"].st-host{height:calc(var(--st-host-h,100%) - var(--st-host-composer-h,0px));max-height:calc(var(--st-host-h,100%) - var(--st-host-composer-h,0px))}
      [data-plugin="dsh-skill-trace"] *{box-sizing:border-box}[data-plugin="dsh-skill-trace"] button,[data-plugin="dsh-skill-trace"] input{font:inherit}
      .st-shell{height:100%;min-height:0;display:flex;flex-direction:column}.st-header-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
      /* v0.6 §22 顶栏：两个一级页面入口 + 这一页的状态 + 刷新。
        2026-10-02（用户：「这个背景占用太多高度，去掉后下方数据上移」）：顶栏不再是一块
        有底色的横条，高度收到贴着内容的 48px —— 分段控件本身就 36px，原来的 68px 里有
        32px 是纯空白。它现在靠一条分隔线与下面的内容分开，而不是靠一块和页面不同色的
        底板；省下的 20px 全给了下方列表。 */
      .st-topbar{min-height:48px;padding:0 16px;display:flex;align-items:center;gap:14px;flex:none}
      /* 顶栏现在的读法是「导航 → 这一页的状态」：两个一级入口在最左，紧跟着一行说明
         当前这一页的数据是什么，右侧只留刷新。状态行会截断而不是把布局挤宽。 */
      .st-context{min-width:0;flex:1;display:flex;align-items:center;gap:7px;color:var(--st-muted);font-size:12px}
      .st-context-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-live{width:6px;height:6px;border-radius:50%;background:var(--st-success);flex:none}.st-live[data-state="unknown"]{background:var(--st-faint)}
      /* 段头删掉之后页面就没有标题元素了。视觉上按用户的要求去掉，语义上补一个
         只给读屏软件的 h2 —— 「这一页叫什么」不该因为排版调整而消失。 */
      .st-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
      .st-view-switch{display:inline-flex;gap:2px;align-items:center}
      .st-view-button{min-height:30px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:5px;background:transparent;color:var(--st-muted);cursor:pointer}.st-view-button:hover{color:var(--st-text)}
      /* 2026-10-02 第三轮（用户：「选中的时候不用背景框，没必要，只要那个字体高亮就行」）：
         选中态从一块 --st-accent-soft 底板改成**纯字色 + 字重**。理由和上一轮去掉容器底板是同一条：
         这一行里已经有两层底色在互相抵消，把选中态也做成色块，三个选项看起来像三块标签而不是一句话。 */
      .st-view-button[aria-pressed="true"]{color:var(--st-brand);font-weight:600}
      .st-empty-page,.st-trace-state{height:100%;display:grid;place-items:center;padding:32px;color:var(--st-muted)}.st-empty-page-inner{width:min(100%,420px)}.st-empty-page p{margin:0}.st-trace-state-line{display:inline-flex;align-items:center;gap:9px;font-size:13px}.st-trace-state-dot{width:7px;height:7px;border-radius:50%;background:var(--st-faint)}.st-trace-state[data-kind="loading"] .st-trace-state-dot{background:var(--st-brand);animation:st-pulse 1.2s ease-in-out infinite}@keyframes st-pulse{50%{opacity:.35}}
      [data-plugin="dsh-skill-trace"]{overflow:hidden;max-height:none;height:var(--st-host-h,100%);min-height:0;color:var(--st-text);background:var(--st-bg);font-size:13px;line-height:1.45}
      @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.st-trace-state-dot{animation:none!important}}

      /* 键盘可达（§13）：preview 用 outline，实现沿用同一做法。 */
      /* 按下态：preview 自己没有 :active，但 objective 明确要求 hover/active/focus。
         按下时轻微下沉，读成"点到了"而不是"没反应"。 */
      /* 过渡：objective 明确要求。preview 没有过渡，但状态切换（hover / 聚焦降权 / 回放）
         若瞬变会读成"画面闪了一下"；160ms 足以让它读成一次状态变化。 */
      .st-view-button{height:32px;padding:0 11px}
      /* 插件住在对话面板里，宽度可以窄到 500px 上下：这时导航（约 214px）+ 搜索 + 刷新
         会挤不下。搜索框是这一行里唯一可以收缩的东西，所以让它在窄屏先让位，而不是
         把整行顶出去（顶出去的表现是刷新按钮被裁掉，而它恰恰是那一行最后一个动作）。 */
      @media(max-width:760px){.st-installed-search{flex:0 1 140px}}





      /* ── Skill Definition Viewer（§11）───────────────────────────────────────
       *
       * 三栏是 §11 的规格：286px 定义目录 / 1fr 声明流程 / 410px 定义与证据。
       * 它必须画在插件自托管容器**内部**——宿主 Layout 的 sidebar 与 rightbar 都是
       * single 槽且已被 ui-sidebar / ui-sidebar-right 占用，外壳上不存在第四条栏位。
       * 这是「一个页面内的三栏」，不是宿主外壳的三栏。
       */
      .st-audit-empty{margin:0;color:var(--st-faint);font-size:11.5px;line-height:1.5}
      .st-audit-doc{padding:4px 16px 16px;font-size:12.5px;line-height:1.65;color:var(--st-text)}
      .st-audit-doc-heading{margin:16px 0 6px;font-weight:650;scroll-margin-top:12px;border-radius:6px;transition:background-color .18s ease}
      .st-audit-doc-heading[data-flash="true"]{background:var(--st-highlight)}
      .st-audit-doc h2.st-audit-doc-heading{font-size:15px}
      .st-audit-doc h3.st-audit-doc-heading{font-size:13.5px}
      .st-audit-doc h4.st-audit-doc-heading,.st-audit-doc h5.st-audit-doc-heading,.st-audit-doc h6.st-audit-doc-heading{font-size:12.5px;color:var(--st-muted)}
      .st-audit-doc-p{margin:8px 0}
      .st-audit-doc-list{margin:8px 0;padding-left:22px;display:flex;flex-direction:column;gap:3px}
      .st-audit-code,.st-audit-pre code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
      .st-audit-code{padding:1px 5px;border-radius:5px;background:var(--st-layer-2);border:1px solid var(--st-border-soft);font-size:11.5px}
      .st-audit-pre{margin:10px 0;border-radius:8px;border:1px solid var(--st-border-soft);background:var(--st-layer-2);overflow:auto;font-size:11.5px;line-height:1.55}
      .st-audit-pre{padding:10px 11px}
      .st-audit-link{color:var(--st-brand)}
      /* §10b Skill 工作台：左栏 Skill 清单 / 中栏声明流程 / 右栏定义与证据。
       * 三栏沿用上面的 .st-audit 栅格，这里只补清单条目与 Advanced 下拉。 */
      /* 声明流程的语义容器：布局仍由 .st-audit-canvas 承担，这里只留一个稳定的样式钩子，
         Phase 3 之后的调整不必再去猜流程到底挂在哪个复用类上。 */
      /* v0.6 §7「已安装 Skill」：搜索 + 两列卡片。卡片上只有名称、描述、调用方式与来源 ——
       * 没有学习状态、验证状态或 review queue，那些是 v0.5 的学习工作台，按 §4 从主模型消失。 */
      /* 2026-10-02：顶部内边距 22px → 10px。顶栏自己是 48px 高、里面放一个 30px 的控件，
         上下各留 9px —— 列表再隔 22px 才开始，顶栏与内容之间就出现了一条谁都不认领的空白带。
         改成 10px 之后两者读起来是同一块面。（左右与底部不变：那三面没有参考物。） */
      .st-installed{padding:10px 24px 28px;display:flex;flex-direction:column;gap:16px;min-height:0;overflow:auto}
      /* 2026-10-02 第二轮（用户：「搜索框移动到本次 Skill 跟已安装 Skill 同一行，靠近刷新那个 Icon，
         那搜索框宽度可以再缩小一点」）：搜索框从正文的独立一行挪进顶栏右侧、紧挨刷新按钮。
         它因此降了一档：高度对齐同一行的两个 30px 控件，宽度从 520px 收到 220px ——
         搜索是窄输入（名称或描述的几个词），横跨半屏的输入框只会把那一行读成表单。 */
      .st-installed-search{position:relative;display:flex;align-items:center;flex:0 1 220px;min-width:0}
      .st-installed-search input{width:100%;height:30px;padding:0 30px 0 10px;border:1px solid var(--st-border);border-radius:7px;background:var(--st-surface);color:var(--st-text);font:inherit;font-size:12.5px}
      .st-installed-search input:focus-visible{outline:2px solid var(--st-accent);outline-offset:1px}
      /* 2026-10-02（用户：「搜索框搜索 Icon 迁移到搜索框的右侧」）：图标从输入框左边挪到框内右端，
         并且 pointer-events:none —— 它只是个标记，不该抢走点击落点。 */
      .st-search-icon{position:absolute;right:9px;top:50%;transform:translateY(-50%);display:flex;color:var(--st-text-tertiary);pointer-events:none}
      /* 刷新按钮此前**一条样式都没有** —— .st-icon-button 只在 JSX 里出现过，样式全来自宿主默认的
         button，所以它带着一块谁也说不清来历的底板。用户：「如果有必要存在，那块背景就不要了，
         只要 Icon 就行」。保留它是因为目录是缓存过的，新装 / 删掉 Skill 之后需要一次手动重取；
         但它的样子现在只有图标本身。 */
      .st-icon-button{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:var(--st-muted);cursor:pointer}
      .st-icon-button:hover{background:var(--st-surface-subtle);color:var(--st-text)}
      .st-icon-button:disabled{background:transparent;color:var(--st-faint);cursor:default}
      /* v0.9.2：列表头那句「按什么排的」。顺序变了而界面不说，读者只会以为列表坏了 ——
         所以这句话是列表的一部分，不是装饰。字色与空态同一档，不与卡片抢注意力。 */
      .st-installed-order{margin:0 0 14px;color:var(--st-faint);font-size:11.5px;line-height:1.5}
      .st-installed-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:start}
      .st-installed-card{display:flex;flex-direction:column;gap:7px;width:100%;text-align:left;padding:15px 16px;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);color:inherit;font:inherit;cursor:pointer;transition:border-color .16s ease}
      .st-installed-card:hover{border-color:var(--st-border-strong)}
      .st-installed-card:focus-visible{outline:2px solid var(--st-accent);outline-offset:1px}
      .st-installed-card-name{font-size:14.5px;font-weight:600;color:var(--st-text)}
      /* 2026-10-02（用户：「Skill 列表描述这里，最多显示 4 行。统一，最多显示 4 行……用户
         可以点进去查看详情」）：两个列表的描述都截到 4 行。
         描述是**预览**而不是内容本身 —— 有的 Skill 描述十行八行，卡片被它撑成一个段落，
         一屏放不下几张。整张卡片就是入口，完整描述在详情页一眼可看，所以这里截断不丢信息。
         截断是**纯视觉**的：line-clamp 只影响绘制，DOM 文本一字不少，
         读屏软件仍然读得到完整描述，卡片的可访问名也不受影响。
         两个列表用同一个上限，免得同一份描述在两页里有两种长度。 */
      .st-installed-card-desc{margin:0;font-size:12.5px;line-height:1.6;color:var(--st-text-secondary);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;line-clamp:4;overflow:hidden}
      /* 元信息行钉在卡片左下角。网格默认把同一行的卡片拉到等高，如果元信息行只跟着描述走，
         它会停在描述下面、离卡片底边还差一大截 —— 卡片看上去像没写完。
         margin-top:auto 吃掉的正是那段空白；卡片本身已经给了 7px 的间距，所以不靠这个 margin 撑开。 */
      .st-installed-card-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--st-text-tertiary);margin-top:auto}
      @media(max-width:980px){.st-installed-grid{grid-template-columns:minmax(0,1fr)}}
      /* ── Skill-first 列表与详情（v0.6 §6 / §7 / §8 / §9）──────────────────────
       *
       * 圆角在这里刻意比原型小：原型的卡片是 18px（--radius），而本仓库的 §25.2 守卫禁止
       * 14px 以上的卡片圆角，理由是「圆角是例外，结构主要靠分隔线」。两边的取值都写进过
       * 文档，冲突时以仓库里**有牙的那条**为准（scripts/verify-project.mjs 会真的失败），
       * 并把分歧记在评审文档里，而不是偷偷选一个。
       */
      /* 2026-10-02：两个一级列表必须从**同一个位置**开始。它们共用一条顶栏，读者在这两个
         入口之间来回点时，第一张卡片的左上角应当原地不动 —— 否则每次切换页面，内容都会
         横竖各跳一下。所以这一页的 padding 与 .st-installed 逐字相同（10px 24px 28px）。 */
      .st-page{height:100%;min-height:0;overflow:auto;padding:10px 24px 28px}
      .st-skill-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:start}
      .st-skill-card{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:15px 16px;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);color:inherit;cursor:pointer;transition:border-color .16s ease,transform .16s ease}
      .st-skill-card:hover{transform:translateY(-1px);border-color:var(--st-border-strong)}
      .st-skill-card-icon{width:34px;height:34px;border-radius:9px;background:var(--st-accent-soft);color:var(--st-accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex:0 0 auto}
      .st-skill-card-body{min-width:0;flex:1;display:flex;flex-direction:column}
      .st-skill-card-name{font-weight:700;font-size:14px}
      .st-skill-card-desc{margin:4px 0 0;color:var(--st-muted);font-size:12px;line-height:1.55;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;line-clamp:4;overflow:hidden}
      /* 同上一条：钉在卡片左下角。这里多一个 padding-top —— 这张卡的正文列没有 gap，
         auto 外边距在「本来就没有多余空间」时会解析成 0，只用 margin 会让元信息行贴到描述上。 */
      .st-skill-card-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:10px}
      .st-skill-card-go{color:var(--st-faint);font-size:14px;flex:0 0 auto}
      .st-pill{border:1px solid var(--st-border);border-radius:999px;padding:3px 8px;font-size:11px;color:var(--st-muted);background:var(--st-surface-subtle)}
      .st-pill[data-tone="accent"]{border-color:var(--st-accent);background:var(--st-accent-soft);color:var(--st-accent);font-weight:600}
      .st-detail{height:100%;min-height:0;display:flex;flex-direction:column}
      .st-detail-back{align-self:center;border:0;background:transparent;color:var(--st-muted);font-size:12px;padding:4px 0;cursor:pointer;white-space:nowrap}
      .st-detail-back:hover{color:var(--st-text)}
      .st-detail-body{flex:1;min-height:0;display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;padding:12px 22px 18px}
      /* 主内容列：只承载**当前那一个**详情模块（v1.1）。
       *
       * V1.0 这一列把验收 / 修改对比 / 评测 / 框架 / 运行逻辑 / 步骤证据 / SKILL.md 纵向堆在
       * 一起，靠整列滚动去找模块 —— 找「Skill 评测」要往下滚过三块。V1.1 由左列导航决定这一列
       * 显示什么，所以它不再需要自己滚：滚动交给更里层真正会超高的那一块。
       *
       * 唯一例外是 SKILL.md：它是一份要逐字读几百行的定义，整块必须填满可用高度、由文档区
       * 自己滚（见下面的 document 模块选择器），压成一条缝就没法读了。 */
      .st-detail-main{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
      .st-detail-module{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:auto}
      .st-detail-module[data-module="document"]{overflow:hidden}
      /* 文档模块里让文档卡吃掉整个高度：那条 min(72vh,640px) 固定高度在 V1.0 是对的
         （上面还有三块内容），现在它是这一列唯一的东西，固定高度反而会留出一块空白。 */
      .st-detail-module[data-module="document"] > .st-detail-doc{height:auto;flex:1;min-height:0}
      .st-framework{flex:0 0 auto;min-width:0;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);padding:12px 14px}
      .st-framework-title-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
      .st-framework-title-row h3{margin:0;font-size:13px}
      .st-framework-count{color:var(--st-faint);font-size:11px;white-space:nowrap}
      .st-framework-sub{margin:2px 0 0;color:var(--st-muted);font-size:11.5px}
      /* 这句是这一整块的免责声明，不是脚注：它必须和流程图同时进入视野，所以紧贴标题、
         用左侧竖线标出边界，而不是塞进折叠区或 tooltip。 */
      .st-framework-note{margin:8px 0 0;padding:6px 9px;border-left:2px solid var(--st-border-strong);border-radius:0 6px 6px 0;background:var(--st-layer-2);color:var(--st-muted);font-size:11px;line-height:1.5}
      .st-framework-empty{margin:10px 0 0;color:var(--st-muted);font-size:12px}
      /* 12 步的上限仍然可能比半屏高，所以给一个上限再滚：摘要不该长成一张画布。 */
      .st-framework-steps{list-style:none;margin:10px 0 0;padding:0;max-height:238px;overflow:auto;display:flex;flex-direction:column}
      .st-framework-item{display:flex;flex-direction:column;min-width:0}
      .st-framework-step{display:grid;grid-template-columns:26px minmax(0,1fr) auto auto;align-items:center;gap:8px;width:100%;margin:0;padding:6px 9px;border:1px solid var(--st-border-soft);border-radius:8px;background:var(--st-layer);color:var(--st-text);text-align:left;font:inherit;cursor:pointer;transition:border-color .16s ease,background-color .16s ease}
      .st-framework-step:hover{border-color:var(--st-border-strong)}
      .st-framework-step[data-static="true"]{cursor:default}
      .st-framework-step[data-static="true"]:hover{border-color:var(--st-border-soft)}
      .st-framework-step[data-active="true"]{border-color:var(--st-accent);background:var(--st-highlight)}
      .st-framework-num{color:var(--st-faint);font-size:11px;font-variant-numeric:tabular-nums;letter-spacing:.04em}
      .st-framework-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
      .st-framework-kind{padding:1px 7px;border:1px solid var(--st-border-soft);border-radius:999px;color:var(--st-faint);font-size:10.5px;white-space:nowrap}
      .st-framework-state{font-size:11px;white-space:nowrap}
      /* 颜色只是旁证：句子本身已经说清"观察到了什么"。删掉样式表也不会让界面说谎。 */
      .st-framework-step[data-state="observed"] .st-framework-state{color:var(--st-success)}
      .st-framework-step[data-state="partial"] .st-framework-state{color:var(--st-warning)}
      .st-framework-step[data-state="intent"] .st-framework-state{color:var(--st-warning)}
      .st-framework-step[data-state="none"] .st-framework-state{color:var(--st-muted)}
      .st-framework-step[data-state="unknown"] .st-framework-state{color:var(--st-faint)}
      .st-framework-arrow{padding:2px 0 2px 12px;color:var(--st-faint);font-size:11px;line-height:1}
      .st-framework-truncated{margin:8px 0 0;color:var(--st-warning);font-size:11px}
      /* ── Skill 框架（v0.6 §13）：结构 · 声明流程 · 渐进披露 ─────────────────────
       *
       * 模块网格用 auto-fit 而不是固定列数：一个 Skill 可能只认出 3 个角色，也可能有 8 个，
       * 固定列数必然让其中一种排得很难看。左边框只有一种颜色 —— 它标的是「这一组的边界」，
       * 不编码任何状态；角色靠标题区分，不靠颜色。
       */
      .st-fw-structure{display:grid;grid-template-columns:repeat(auto-fit,minmax(232px,1fr));gap:10px;margin-top:10px;align-items:start}
      .st-fw-module{min-width:0;border:1px solid var(--st-border-soft);border-left:2px solid var(--st-border-strong);border-radius:8px;background:var(--st-layer);padding:9px 10px}
      .st-fw-module-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
      .st-fw-module-label{font-size:12px;font-weight:650;color:var(--st-text)}
      .st-fw-module-count{color:var(--st-faint);font-size:10.5px;font-variant-numeric:tabular-nums}
      .st-fw-module-hint{margin:2px 0 0;color:var(--st-muted);font-size:10.5px;line-height:1.45}
      .st-fw-sections{display:flex;flex-direction:column;gap:0;margin-top:6px}
      /* 小节是模块**内部**的一行，不是又一张卡：模块已经有边框和圆角了，再套一层圆角盒子
         正是 §27 说的「卡片套卡片」。所以这里用分隔线，选中态用 inset 阴影画左边框，
         既不占位、也不需要圆角。 */
      .st-fw-section{display:flex;flex-direction:column;gap:4px;width:100%;margin:0;padding:6px 4px;border:0;border-bottom:1px solid var(--st-border-soft);background:transparent;color:var(--st-text);text-align:left;font:inherit;cursor:pointer;transition:background-color .16s ease}
      .st-fw-section:last-child{border-bottom:0}
      .st-fw-section:hover{background:var(--st-layer-2)}
      .st-fw-section[data-static="true"]{cursor:default}
      .st-fw-section[data-static="true"]:hover{background:transparent}
      .st-fw-section[data-active="true"]{background:var(--st-highlight);box-shadow:inset 2px 0 0 var(--st-accent)}
      .st-fw-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
      .st-fw-section-title{min-width:0;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-fw-section-meta{color:var(--st-faint);font-size:10.5px;white-space:nowrap}
      .st-fw-opening{margin:0;color:var(--st-muted);font-size:11px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .st-fw-items{margin:0;padding-left:14px;color:var(--st-muted);font-size:10.5px;line-height:1.5;display:flex;flex-direction:column;gap:2px}
      .st-fw-items li{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-fw-more{list-style:none;margin-left:-14px;color:var(--st-faint)}
      .st-fw-absent{grid-column:1/-1;margin:8px 0 0;color:var(--st-faint);font-size:11px;line-height:1.5}
      /* 分节：声明流程与渐进披露是框架的**子模块**，所以只给一条上分隔线，不再套一张卡 ——
         套卡会让它们看起来和「框架」平级，那正是这次要改掉的层级错位。 */
      .st-fw-sub{margin-top:12px;padding-top:10px;border-top:1px solid var(--st-border-soft)}
      .st-fw-sub-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .st-fw-sub-head h4{margin:0;font-size:12.5px}
      .st-fw-sub-note{color:var(--st-faint);font-size:10.5px}
      /* 渐进披露的链条是一条**机制**的顺序（全文先到、资源按需再读），不是运行顺序，也不是
         六个并列的选项 —— 所以它是六个标签夹着箭头，而不是六张胶囊卡片。 */
      .st-fw-chain{list-style:none;display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:9px 0 0;padding:0}
      .st-fw-chain-item{display:flex;align-items:center;gap:4px}
      .st-fw-chain-label{color:var(--st-text-secondary);font-size:10.5px;font-weight:600;white-space:nowrap}
      .st-fw-chain-arrow{color:var(--st-faint);font-size:10.5px}
      .st-fw-base{margin:8px 0 0;color:var(--st-faint);font-size:10.5px}
      .st-fw-tier{margin-top:8px}
      .st-fw-tier-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
      .st-fw-tier-title{font-size:11.5px;font-weight:600}
      .st-fw-tier-count{color:var(--st-faint);font-size:10.5px}
      .st-fw-resources{display:flex;flex-direction:column;gap:0;margin-top:5px;max-height:168px;overflow:auto}
      /* 资源也是行不是卡：一个 tier 里可能列十几个文件，卡片会把这栏变成一摞盒子。 */
      .st-fw-resource{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:8px;width:100%;margin:0;padding:4px 2px;border:0;border-bottom:1px solid var(--st-border-soft);background:transparent;color:var(--st-text);text-align:left;font:inherit;cursor:pointer}
      .st-fw-resource:last-child{border-bottom:0}
      .st-fw-resource:hover{background:var(--st-layer-2)}
      .st-fw-resource[data-static="true"]{cursor:default}
      .st-fw-resource[data-static="true"]:hover{background:transparent}
      .st-fw-resource-path{font-size:10.5px;color:var(--st-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-fw-resource-when{min-width:0;color:var(--st-muted);font-size:10.5px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      /* ── 本次运行逻辑：五段固定的生命周期，不是时间线上的事件序列 ─────────────── */
      .st-runtime{flex:0 0 auto;min-width:0;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);padding:12px 14px}
      .st-runtime-stages{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(258px,1fr));gap:10px;margin:10px 0 0;padding:0;align-items:start}
      .st-runtime-stage{min-width:0;border:1px solid var(--st-border-soft);border-left:2px solid var(--st-border-strong);border-radius:8px;background:var(--st-layer);padding:9px 10px}
      .st-runtime-stage-head{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
      .st-runtime-order{color:var(--st-faint);font-size:10.5px;font-variant-numeric:tabular-nums}
      .st-runtime-label{font-size:12px;font-weight:650;min-width:0;flex:1}
      .st-runtime-state{font-size:11px;white-space:nowrap}
      .st-runtime-hint{margin:3px 0 0;color:var(--st-faint);font-size:10.5px;line-height:1.45}
      .st-runtime-statement{margin:6px 0 0;color:var(--st-text);font-size:11.5px;line-height:1.5}
      .st-runtime-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;margin:7px 0 0;font-size:10.5px}
      .st-runtime-facts dt{color:var(--st-muted);white-space:nowrap}
      .st-runtime-facts dd{margin:0;min-width:0;color:var(--st-text);overflow-wrap:anywhere}
      .st-runtime-limitation{margin:6px 0 0;color:var(--st-faint);font-size:10.5px;line-height:1.45}
      /* 颜色只是旁证：句子本身已经说清"观察到了什么"。删掉样式表也不会让界面说谎。 */
      .st-runtime-stage[data-state="observed"]{border-left-color:var(--st-success)}
      .st-runtime-stage[data-state="partial"]{border-left-color:var(--st-warning)}
      .st-runtime-stage[data-state="intent"]{border-left-color:var(--st-warning)}
      .st-runtime-stage[data-state="observed"] .st-runtime-state{color:var(--st-success)}
      .st-runtime-stage[data-state="partial"] .st-runtime-state{color:var(--st-warning)}
      .st-runtime-stage[data-state="intent"] .st-runtime-state{color:var(--st-warning)}
      .st-runtime-stage[data-state="none"] .st-runtime-state{color:var(--st-muted)}
      .st-runtime-stage[data-state="unknown"] .st-runtime-state{color:var(--st-faint)}
      /* ── 步骤证据：状态词后面必须跟着「凭什么这么说」 ───────────────────────── */
      .st-steps{flex:0 0 auto;min-width:0;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);padding:12px 14px}
      .st-steps-list{list-style:none;display:flex;flex-direction:column;gap:0;margin:10px 0 0;padding:0;max-height:260px;overflow:auto}
      /* 步骤是行不是卡：左侧那条 2px 色带才是状态，一行一条分隔线比摞一排盒子更省地方。 */
      .st-steps-item{display:flex;flex-direction:column;gap:4px;padding:7px 2px 7px 8px;border:0;border-bottom:1px solid var(--st-border-soft);border-left:2px solid var(--st-border-strong);background:transparent}
      .st-steps-item:last-child{border-bottom:0}
      .st-steps-head{display:grid;grid-template-columns:26px minmax(0,1fr) auto auto;align-items:center;gap:8px}
      .st-steps-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
      .st-steps-rows{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;margin:0;font-size:10.5px}
      .st-steps-rows dt{color:var(--st-muted);white-space:nowrap}
      .st-steps-rows dd{margin:0;min-width:0;color:var(--st-text);overflow-wrap:anywhere}
      .st-steps-none{margin:2px 0 0;font-size:10.5px;color:var(--st-faint)}
      .st-steps-item[data-state="observed"]{border-left-color:var(--st-success)}
      .st-steps-item[data-state="partial"]{border-left-color:var(--st-warning)}
      .st-steps-item[data-state="intent"]{border-left-color:var(--st-warning)}
      .st-steps-item[data-state="observed"] .st-framework-state{color:var(--st-success)}
      .st-steps-item[data-state="partial"] .st-framework-state{color:var(--st-warning)}
      .st-steps-item[data-state="intent"] .st-framework-state{color:var(--st-warning)}
      .st-steps-item[data-state="none"] .st-framework-state{color:var(--st-muted)}
      .st-steps-item[data-state="unknown"] .st-framework-state{color:var(--st-faint)}
      /* 表格：Skill 定义里最常被读错的一类内容，退化成竖线串就等于没渲染。窄的时候整张表
         横滚，而不是把列压到读不出来。 */
      .st-audit-table-scroll{margin:10px 0;overflow-x:auto}
      .st-audit-table{border-collapse:collapse;width:100%;font-size:11.5px}
      .st-audit-table th,.st-audit-table td{padding:5px 9px;border:1px solid var(--st-border-soft);text-align:left;vertical-align:top}
      .st-audit-table th{background:var(--st-layer-2);color:var(--st-text);font-weight:650}
      .st-audit-table td{color:var(--st-text)}
      .st-detail-side{min-width:0;display:flex;flex-direction:column;gap:12px;overflow:auto}
      .st-detail-card{border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);padding:14px}
      .st-detail-card h3{margin:0 0 8px;font-size:13px}
      .st-detail-side-desc{margin:0 0 8px;color:var(--st-muted);font-size:12px;line-height:1.55}
      .st-detail-side-note{margin:8px 0 0;color:var(--st-faint);font-size:11px;line-height:1.5}
      .st-detail-fact{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--st-border-soft);font-size:12px}
      .st-detail-fact span{color:var(--st-muted)}
      .st-detail-fact code{font-size:11.5px;color:var(--st-text)}
      .st-detail-repo-link{display:inline-block;margin-top:2px;color:var(--st-accent);font-size:12px;font-weight:600}
      /* v1.1 详情级导航（第二层导航）。
       *
       * 它替换了 V1.0 左列的 Definition / Repository / 血缘三张卡 —— 那三张卡搬进 Definition
       * 模块，一条信息都没有少，少的是「在主列里往下滚过三块才找到评测」的那几百像素。
       *
       * 一级导航仍然是「本次 Skill / 已安装 Skill」两个入口，这里只回答「我想从哪个维度理解
       * 这个 Skill」。没有为它新增路由，也没有新增一级导航。
       *
       * 选中态用背景 + 颜色 + aria-current 三处一起表达：只靠颜色的话，高对比度模式下这个
       * 区别会消失。 */
      .st-detail-nav{border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);padding:12px 10px}
      .st-detail-nav-title{margin:0 0 8px;padding:0 6px;color:var(--st-faint);font-size:11px}
      .st-detail-nav-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
      .st-detail-nav-item{display:block;width:100%;text-align:left;border:0;border-radius:6px;background:transparent;color:var(--st-muted);font-family:inherit;font-size:12.5px;line-height:1.4;padding:6px 8px;cursor:pointer}
      .st-detail-nav-item:hover{background:var(--st-surface-subtle);color:var(--st-text)}
      .st-detail-nav-item[data-active="true"]{background:var(--st-accent-soft);color:var(--st-accent);font-weight:600}
      /* v0.9.0「Skill 验收」。整块只用 token 上色：通过 / 需要修正 / 无法判断三态各自一个色，
       * 但**颜色不承担语义** —— 状态词本身就在旁边写着（role=status 会被辅助技术读出来）。
       * 结构靠分隔线（§27），所以发现列表用 border-bottom 而不是一张张圆角卡片。 */
      .st-validation{display:flex;flex-direction:column;gap:8px}
      .st-validation-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .st-validation-top h3{margin:0}
      .st-validation-badge{flex:none;padding:2px 8px;border-radius:6px;font-size:11.5px;font-weight:600;background:var(--st-surface-subtle);color:var(--st-muted)}
      .st-validation-badge[data-status="pass"]{background:var(--st-success-soft);color:var(--st-success)}
      .st-validation-badge[data-status="needs-fix"]{background:var(--st-danger-soft);color:var(--st-danger)}
      .st-validation-badge[data-status="unknown"]{background:var(--st-warning-soft);color:var(--st-warning)}
      .st-validation-counts{margin:0;color:var(--st-muted);font-size:11.5px}
      .st-validation-note{margin:0;color:var(--st-danger);font-size:11.5px;line-height:1.55}
      .st-validation-profiles{list-style:none;margin:0;padding:0}
      .st-validation-profile{display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--st-border-soft);font-size:11.5px}
      .st-validation-profile code{color:var(--st-text);font-size:11.5px}
      .st-validation-profile[data-status="pass"] .st-validation-profile-state{color:var(--st-success)}
      .st-validation-profile[data-status="needs-fix"] .st-validation-profile-state{color:var(--st-danger)}
      .st-validation-profile[data-status="unknown"] .st-validation-profile-state{color:var(--st-warning)}
      .st-validation-profile-state{font-weight:600}
      .st-validation-profile-counts{margin-left:auto;color:var(--st-faint)}
      /* v1.1：Profile 汇总分成「标准合规」与「平台兼容」两层。
       * 分组标题比 profile 本身更轻 —— 它是标题不是数据，不该跟 profile 行抢注意力。 */
      .st-validation-kind{list-style:none;margin:0;padding:6px 0 3px;color:var(--st-faint);font-size:10.5px;font-weight:600}
      .st-validation-kind:first-child{padding-top:0}
      /* Rule Provenance：来源与说明各占一行，都压到最小字号 ——
       * 它是「这条结论是谁说的」，要能查到，但不该盖过结论本身。 */
      .st-validation-provenance{margin:3px 0 0;color:var(--st-faint);font-size:10.5px}
      .st-validation-rule-note{margin:2px 0 0;color:var(--st-muted);font-size:11px;line-height:1.5}
      .st-validation-findings{list-style:none;margin:0;padding:0}
      .st-validation-finding{padding:6px 0;border-bottom:1px solid var(--st-border-soft)}
      .st-validation-finding-head{display:flex;align-items:baseline;gap:8px}
      .st-validation-finding-head code{font-size:11.5px;color:var(--st-text)}
      .st-validation-finding-title{font-size:12px;font-weight:600;color:var(--st-text-secondary);min-width:0;flex:1}
      .st-validation-severity{font-size:11px;font-weight:600;color:var(--st-muted)}
      .st-validation-finding[data-severity="error"] .st-validation-severity{color:var(--st-danger)}
      .st-validation-finding[data-severity="warning"] .st-validation-severity{color:var(--st-warning)}
      .st-validation-detail{margin:3px 0 0;color:var(--st-muted);font-size:11.5px;line-height:1.55}
      .st-validation-skipped h4{margin:6px 0 4px;font-size:11.5px;color:var(--st-muted)}
      .st-validation-skipped ul{list-style:none;margin:0;padding:0}
      .st-validation-skipped li{padding:4px 0;border-bottom:1px solid var(--st-border-soft);color:var(--st-faint);font-size:11px;line-height:1.5}
      .st-validation-skipped code{color:var(--st-muted);font-size:11px}
      .st-validation-notes{list-style:none;margin:0;padding:0;color:var(--st-faint);font-size:11px;line-height:1.5}
      .st-validation-limits{margin-top:2px}
      .st-validation-limits summary{cursor:pointer;color:var(--st-muted);font-size:11.5px}
      .st-validation-limits ul{margin:6px 0 0;padding-left:16px;color:var(--st-faint);font-size:11px;line-height:1.5}
      /* V1.2「Skill 证据」。
       * 这一屏的重点是**证据关系**，不是数据量：三条状态色只做辅助，状态词一定写在旁边；
       * 结构与分隔仍然靠边框（§27），不靠色块，也不出现图表、指标墙或进度感的东西。 */
      .st-evidence{display:flex;flex-direction:column;gap:12px}
      .st-evidence-top{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px}
      .st-evidence-heading{min-width:0;flex:1 1 320px}
      .st-evidence-heading h3{margin:0}
      .st-evidence-sub{margin:4px 0 0;color:var(--st-muted);font-size:11.5px;line-height:1.5}
      .st-evidence-actions{display:flex;flex-wrap:wrap;gap:6px}
      .st-evidence-action{border:1px solid var(--st-border);border-radius:6px;background:var(--st-surface-subtle);color:var(--st-text);font-family:inherit;font-size:11.5px;padding:4px 9px;cursor:pointer}
      .st-evidence-action:hover{border-color:var(--st-border-strong);color:var(--st-accent)}
      .st-evidence-export-note{flex:1 0 100%;margin:0;color:var(--st-muted);font-size:11px;line-height:1.5}
      .st-evidence-hero{border:1px solid var(--st-border-soft);border-radius:8px;background:var(--st-surface-subtle);padding:10px 12px}
      .st-evidence-hero-title{margin:0;font-size:12.5px;font-weight:650;color:var(--st-text)}
      .st-evidence-hero-note{margin:5px 0 0;color:var(--st-muted);font-size:11.5px;line-height:1.55}
      .st-evidence-hero-foot{margin:6px 0 0;color:var(--st-faint);font-size:11px}
      .st-evidence-legend{list-style:none;display:flex;flex-wrap:wrap;gap:14px;margin:8px 0 0;padding:0}
      .st-evidence-legend-item{display:flex;align-items:baseline;gap:6px;font-size:11.5px}
      .st-evidence-legend-count{color:var(--st-faint);font-size:11px}
      .st-evidence-status{padding:1px 7px;border-radius:5px;font-size:11px;font-weight:600;background:var(--st-surface-subtle);color:var(--st-muted)}
      .st-evidence-status[data-status="declared"]{background:var(--st-accent-soft);color:var(--st-accent)}
      .st-evidence-status[data-status="observed"]{background:var(--st-success-soft);color:var(--st-success)}
      .st-evidence-status[data-status="unavailable"]{background:var(--st-warning-soft);color:var(--st-warning)}
      .st-evidence-block{border-top:1px solid var(--st-border-soft);padding-top:10px}
      .st-evidence-block h4{margin:0 0 8px;font-size:12px;color:var(--st-text-secondary)}
      .st-evidence-note{margin:6px 0 0;color:var(--st-faint);font-size:11px;line-height:1.55}
      .st-evidence-identity{display:grid;grid-template-columns:minmax(140px,auto) 1fr;gap:4px 12px;margin:0}
      .st-evidence-identity-key{margin:0;color:var(--st-muted);font-size:11.5px}
      .st-evidence-identity-value{margin:0;min-width:0;font-size:11.5px;color:var(--st-text);word-break:break-all}
      .st-evidence-identity-value code{font-size:11px}
      .st-evidence-identity-value[data-status="unavailable"]{color:var(--st-warning)}
      .st-evidence-chain{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
      .st-evidence-stage{padding:9px 0;border-bottom:1px solid var(--st-border-soft)}
      .st-evidence-stage-head{display:flex;align-items:baseline;gap:8px}
      .st-evidence-stage-order{color:var(--st-faint);font-size:11px;font-variant-numeric:tabular-nums}
      .st-evidence-stage-label{font-size:12px;color:var(--st-text);flex:1;min-width:0}
      .st-evidence-stage-hint{margin:3px 0 0;color:var(--st-faint);font-size:11px}
      .st-evidence-facts{list-style:none;margin:6px 0 0;padding:0}
      .st-evidence-fact{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:11.5px;border-bottom:1px solid var(--st-border-soft)}
      .st-evidence-fact-label{color:var(--st-muted)}
      .st-evidence-fact code{font-size:11px;color:var(--st-text);word-break:break-all}
      .st-evidence-count{color:var(--st-text)}
      .st-evidence-source{margin:5px 0 0;color:var(--st-faint);font-size:11px;word-break:break-all}
      .st-evidence-limitations{list-style:none;margin:4px 0 0;padding:0}
      .st-evidence-limitations li{margin:2px 0 0;color:var(--st-warning);font-size:11px;line-height:1.5}
      .st-evidence-inequalities{margin:8px 0 0;color:var(--st-muted);font-size:11px}
      .st-evidence-limits{margin-top:12px;border-top:1px solid var(--st-border-soft);padding-top:10px}
      .st-evidence-limits h4{margin:0 0 8px;font-size:12px;color:var(--st-text-secondary)}
      .st-evidence-boundary{padding:8px 0;border-bottom:1px solid var(--st-border-soft)}
      .st-evidence-boundary-head{display:flex;align-items:baseline;gap:8px}
      .st-evidence-boundary-head strong{font-size:11.5px;color:var(--st-text);flex:1}
      .st-evidence-boundary-state{font-size:11px;font-weight:600;color:var(--st-muted)}
      .st-evidence-boundary[data-status="observed"] .st-evidence-boundary-state{color:var(--st-success)}
      .st-evidence-boundary[data-status="unavailable"] .st-evidence-boundary-state{color:var(--st-warning)}
      .st-evidence-boundary-claim{margin:3px 0 0;color:var(--st-text-secondary);font-size:11.5px;line-height:1.5}
      .st-evidence-boundary-source{margin:3px 0 0;color:var(--st-faint);font-size:11px}
      .st-evidence-rows{display:flex;flex-direction:column}
      .st-evidence-row{display:grid;grid-template-columns:minmax(96px,1.1fr) minmax(76px,0.8fr) minmax(120px,1.4fr) minmax(96px,1fr) minmax(120px,1.6fr);gap:8px;align-items:start;padding:6px 0;border-bottom:1px solid var(--st-border-soft)}
      .st-evidence-row-head{color:var(--st-faint);font-size:10.5px;font-weight:600}
      .st-evidence-cell{min-width:0;font-size:11.5px;color:var(--st-text-secondary);line-height:1.5}
      .st-evidence-cell-limitation{color:var(--st-warning)}
      .st-evidence-drift{display:flex;flex-wrap:wrap;gap:12px}
      .st-evidence-drift-col{min-width:0;flex:1 1 240px}
      .st-evidence-drift-label{display:block;color:var(--st-muted);font-size:11px}
      .st-evidence-drift-col code{font-size:11px;color:var(--st-text);word-break:break-all}
      .st-evidence-drift-claim{margin:8px 0 0;font-size:12px;color:var(--st-text);font-weight:600}
      .st-evidence-block[data-state="historical"] .st-evidence-drift-claim{color:var(--st-warning)}
      .st-evidence-condition-list{list-style:none;margin:0;padding:0}
      .st-evidence-condition{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid var(--st-border-soft);font-size:11.5px}
      .st-evidence-condition-label{color:var(--st-muted)}
      .st-evidence-condition code{font-size:11px;color:var(--st-text);word-break:break-all}
      .st-evidence-runs{list-style:none;margin:0;padding:0}
      .st-evidence-run{padding:6px 0;border-bottom:1px solid var(--st-border-soft)}
      .st-evidence-run-id{display:block;font-size:11.5px;color:var(--st-text);word-break:break-all}
      .st-evidence-run-note{display:block;margin-top:2px;color:var(--st-faint);font-size:11px;word-break:break-all}
      .st-evidence-comparison-claim{margin:0;font-size:11.5px;line-height:1.55;color:var(--st-text-secondary)}
      .st-evidence-comparison[data-status="unavailable"] .st-evidence-comparison-claim{color:var(--st-warning)}
      .st-evidence-blockers{list-style:none;margin:6px 0 0;padding:0;color:var(--st-muted);font-size:11px}
      @media (max-width: 900px){.st-evidence-row{grid-template-columns:1fr 1fr}.st-evidence-row-head{display:none}}
      /* v0.6.1：文档面板不再用 flex:1 去抢"剩余高度"。框架层长到 1811px 之后剩余高度是负数，
       * 面板被压成 2px —— 中文预览、GFM 表格都在这个面板里，等于整层看不到。
       * 改成面板自己留高度（视口内取 72vh，封顶 640px），内部的目录与正文各自滚动。 */
      .st-detail-doc{min-width:0;flex:0 0 auto;height:min(72vh,640px);display:flex;flex-direction:column;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);overflow:hidden}
      .st-detail-doc-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--st-border)}
      .st-detail-doc-title{min-width:0;flex:1}
      .st-detail-doc-title strong{font-size:13px}
      .st-detail-doc-title p{margin:3px 0 0;color:var(--st-muted);font-size:11.5px}
      .st-seg{display:flex;gap:2px;background:var(--st-surface-subtle);border-radius:9px;padding:3px}
      .st-seg button{border:0;background:transparent;color:var(--st-muted);border-radius:7px;padding:5px 10px;font-size:12px;cursor:pointer}
      .st-seg button[data-active="true"]{background:var(--st-surface);color:var(--st-text);font-weight:600}
      .st-translate{border:1px solid var(--st-accent);background:var(--st-accent-soft);color:var(--st-accent);border-radius:9px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer}
      .st-translate[disabled]{opacity:.55;cursor:default}
      .st-translate-notice{margin:0;padding:9px 16px;border-bottom:1px solid var(--st-border-soft);background:var(--st-surface-subtle);color:var(--st-muted);font-size:11.5px}
      .st-translate-error{margin:0;padding:9px 16px;border-bottom:1px solid var(--st-border-soft);color:var(--st-warning);font-size:11.5px}
      .st-translate-saved{margin:0;padding:8px 16px;border-bottom:1px solid var(--st-border-soft);color:var(--st-muted);font-size:11.5px}
      .st-translate-saved[data-saved="no"]{color:var(--st-warning)}
      /* v0.7 §九–§十：复刻对话框。紧凑、无大圆角、无营销标题、单一主动作。
         遮罩用 position:fixed + inset:0 —— 布局合同禁止视口高度单位，这里也不需要。 */
      .st-clone-open{width:100%;margin-top:10px;padding:7px 12px;border:1px solid var(--st-accent);border-radius:9px;background:var(--st-accent-soft);color:var(--st-accent);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
      .st-clone-open[disabled]{opacity:.55;cursor:default}
      .st-clone-overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:center;padding:72px 20px;background:color-mix(in srgb,var(--st-text) 34%,transparent)}
      .st-clone-dialog{width:560px;max-width:100%;max-height:100%;overflow:auto;border:1px solid var(--st-border-strong);border-radius:12px;background:var(--st-surface);box-shadow:0 12px 32px color-mix(in srgb,var(--st-text) 18%,transparent)}
      .st-clone-head{padding:14px 18px;border-bottom:1px solid var(--st-border-soft)}
      .st-clone-head h2{margin:0;font-size:14px;font-weight:650}
      .st-clone-sub{margin:4px 0 0;color:var(--st-muted);font-size:11.5px}
      .st-clone-body{padding:14px 18px 0}
      .st-clone-field{margin:0 0 14px}
      .st-clone-label{display:block;margin-bottom:5px;color:var(--st-muted);font-size:11px}
      .st-clone-input{width:100%;box-sizing:border-box;padding:6px 9px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-surface-subtle);color:var(--st-text);font:inherit;font-size:12px}
      .st-clone-input:focus-visible{outline:2px solid var(--st-accent);outline-offset:1px}
      .st-clone-radios{display:flex;gap:16px;flex-wrap:wrap}
      .st-clone-radio{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
      .st-clone-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 12px;margin:0 0 14px;padding:9px 0;border-top:1px solid var(--st-border-soft);border-bottom:1px solid var(--st-border-soft);font-size:11.5px}
      .st-clone-facts dt{margin:0;color:var(--st-muted)}
      .st-clone-facts dd{margin:0;min-width:0;overflow-wrap:anywhere;color:var(--st-text)}
      .st-clone-error{margin:0 0 12px;color:var(--st-warning);font-size:11.5px;line-height:1.5}
      .st-clone-actions{display:flex;justify-content:flex-end;gap:8px;padding:11px 0;border-top:1px solid var(--st-border-soft)}
      .st-clone-cancel{padding:6px 12px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface-subtle);color:var(--st-text);font:inherit;font-size:12px;cursor:pointer}
      .st-clone-cancel:hover{border-color:var(--st-border-strong)}
      .st-clone-submit{min-width:104px}
      .st-clone-done{margin:0 0 6px;color:var(--st-text);font-size:12.5px;font-weight:650}
      .st-clone-name{margin:0 0 10px;font-size:12.5px}
      .st-clone-note{margin:0 0 6px;color:var(--st-muted);font-size:11.5px;line-height:1.55}
      .st-clone-limits{margin:0 0 12px;padding-left:16px;color:var(--st-faint);font-size:11px;line-height:1.6}
      .st-clone-invoke{display:flex;align-items:center;gap:8px}
      .st-clone-invoke code{font-size:12px;color:var(--st-text)}
      .st-clone-copy{padding:4px 10px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-surface-subtle);color:var(--st-muted);font:inherit;font-size:11px;cursor:pointer}
      .st-clone-copy:hover{border-color:var(--st-border-strong);color:var(--st-text)}
      .st-evo-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 10px;margin:0;font-size:11px}
      .st-evo-facts dt{margin:0;color:var(--st-muted)}
      .st-evo-facts dd{margin:0;min-width:0;overflow-wrap:anywhere}
      .st-evo-facts code{font-size:11px;color:var(--st-text)}
      .st-evo-state{margin:8px 0 0;padding-top:8px;border-top:1px solid var(--st-border-soft);color:var(--st-text);font-size:11.5px;line-height:1.5}
      .st-evo-state[data-changed="yes"]{color:var(--st-warning)}
      .st-evo-state[data-changed="pending"]{color:var(--st-faint)}
      .st-evo-note{margin:0;color:var(--st-faint);font-size:11px;line-height:1.5}
      .st-evo-open{width:100%;margin-top:10px;padding:6px 12px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface-subtle);color:var(--st-text);font:inherit;font-size:12px;cursor:pointer}
      .st-evo-open:hover{border-color:var(--st-border-strong)}
      .st-evo-actions{display:flex;gap:8px;margin-top:10px}
      .st-evo-actions .st-evo-open{flex:1;margin-top:0}
      .st-evo-modify{border-color:var(--st-border-strong)}
      .st-mod{display:flex;flex-direction:column;gap:10px}
      .st-mod-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .st-mod-top h3{margin:0;font-size:14px;font-weight:650}
      .st-mod-wait{margin:0;color:var(--st-muted);font-size:11.5px;line-height:1.55}
      .st-mod-lines{margin:0;color:var(--st-text);font-size:12px}
      .st-mod-scopes{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 10px;margin:0;padding:0;font-size:11.5px}
      .st-mod-scopes dt{min-width:0;padding:5px 0;border-bottom:1px solid var(--st-border-soft);color:var(--st-text-secondary);overflow-wrap:anywhere}
      .st-mod-scopes dd{margin:0;padding:5px 0;border-bottom:1px solid var(--st-border-soft);color:var(--st-text);text-align:right}
      .st-mod-scopes dd[data-state="changed"]{color:var(--st-warning);font-weight:600}
      .st-mod-scopes dd[data-state="unknown"]{color:var(--st-faint)}
      .st-mod-sections p{margin:4px 0;color:var(--st-text-secondary);font-size:11.5px;overflow-wrap:anywhere}
      .st-mod-sections p[data-kind="added"]{color:var(--st-accent)}
      .st-mod-sections p[data-kind="removed"]{color:var(--st-warning)}
      .st-mod-resources{padding-top:8px;border-top:1px solid var(--st-border-soft)}
      .st-mod-res-line{margin:4px 0;color:var(--st-text-secondary);font-size:11.5px;line-height:1.55;overflow-wrap:anywhere}
      .st-mod-res-line code{margin-left:6px;font-size:11px;color:var(--st-text)}
      .st-mod-out{padding-top:8px;border-top:1px solid var(--st-border-soft)}
      .st-mod-out h4{margin:0 0 4px;font-size:12px;font-weight:600;color:var(--st-warning)}
      .st-mod-out p{margin:4px 0;color:var(--st-text-secondary);font-size:11.5px;line-height:1.55}
      .st-mod-state{margin:0;padding-top:8px;border-top:1px solid var(--st-border-soft);color:var(--st-text-secondary);font-size:11.5px;line-height:1.55}
      .st-mod-state[data-state="changed"]{color:var(--st-warning)}
      .st-mod-state[data-state="unknown"]{color:var(--st-faint)}
      .st-mod-notes{margin:0;padding-left:16px;color:var(--st-muted);font-size:11.5px;line-height:1.55}
      .st-mod-note{margin:0;color:var(--st-faint);font-size:11px;line-height:1.5}
      .st-mod-limits{font-size:11.5px;color:var(--st-muted)}
      .st-mod-limits summary{cursor:pointer;color:var(--st-text-secondary)}
      .st-mod-limits ul{margin:6px 0 0;padding-left:16px;line-height:1.55}
      .st-mod-actions{display:flex;flex-wrap:wrap;gap:8px}
      .st-mod-instance{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--st-border-soft)}
      .st-mod-instance h4{margin:0;font-size:12px;font-weight:600}
      .st-mod-instance h5{margin:0;font-size:11.5px;font-weight:600;color:var(--st-text-secondary)}
      .st-mod-instance-hint{margin:0;color:var(--st-text-secondary);font-size:11.5px;line-height:1.55}
      .st-mod-instance-body{display:flex;flex-direction:column;gap:8px}
      .st-mod-instance-scope{margin:0;color:var(--st-muted);font-size:11px;line-height:1.5}
      .st-mod-instance-prompt{margin:0;max-height:240px;overflow:auto;padding:10px 12px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface-subtle);color:var(--st-text);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
      .st-mod-instance-actions{display:flex;flex-wrap:wrap;gap:8px}
      .st-mod-instance-note{margin:0;color:var(--st-faint);font-size:11px;line-height:1.5}
      .st-mod-instance-goal,.st-mod-instance-prompt-block,.st-mod-instance-observations,.st-mod-instance-regression{display:flex;flex-direction:column;gap:4px}
      .st-mod-instance-observations ul,.st-mod-instance-regression ul{margin:0;padding-left:16px;color:var(--st-text-secondary);font-size:11.5px;line-height:1.55}
      .st-mod-cancel,.st-mod-submit{padding:6px 12px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface-subtle);color:var(--st-text);font:inherit;font-size:12px;cursor:pointer}
      .st-mod-submit{border-color:var(--st-border-strong);background:var(--st-accent-soft);font-weight:600}
      .st-mod-cancel:hover,.st-mod-submit:hover{border-color:var(--st-border-strong)}
      .st-mod-submit:disabled{opacity:.6;cursor:default}
      .st-mod-overlay{position:fixed;inset:0;z-index:42;display:flex;align-items:flex-start;justify-content:center;padding:56px 20px;background:color-mix(in srgb,var(--st-text) 34%,transparent)}
      .st-mod-dialog{width:560px;max-width:100%;max-height:100%;display:flex;flex-direction:column;gap:10px;overflow:auto;padding:16px 18px;border:1px solid var(--st-border-strong);border-radius:12px;background:var(--st-surface);box-shadow:0 12px 32px color-mix(in srgb,var(--st-text) 18%,transparent)}
      .st-mod-head h2{margin:0;font-size:14px;font-weight:650}
      .st-mod-sub{margin:4px 0 0;color:var(--st-muted);font-size:11.5px}
      .st-mod-label{margin:0;color:var(--st-text-secondary);font-size:11.5px;font-weight:600}
      .st-mod-intent{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface-subtle);color:var(--st-text);font:inherit;font-size:12px;line-height:1.55;resize:vertical}
      .st-mod-chips{display:flex;flex-wrap:wrap;gap:6px}
      .st-mod-chip{padding:4px 10px;border:1px solid var(--st-border);border-radius:999px;background:var(--st-surface-subtle);color:var(--st-muted);font:inherit;font-size:11.5px;cursor:pointer}
      .st-mod-chip[data-on="true"]{border-color:var(--st-accent);background:var(--st-accent-soft);color:var(--st-accent);font-weight:600}
      .st-mod-chip[data-locked="true"]{border-style:dashed;color:var(--st-faint);cursor:default}
      .st-mod-hint{margin:0;color:var(--st-faint);font-size:11px;line-height:1.5}
      .st-mod-alert{margin:0;padding:8px 10px;border-left:2px solid var(--st-danger);color:var(--st-text);font-size:11.5px;line-height:1.55}
      .st-mod-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;border-top:1px solid var(--st-border-soft)}
      .st-diff-overlay{position:fixed;inset:0;z-index:41;display:flex;align-items:flex-start;justify-content:center;padding:56px 20px;background:color-mix(in srgb,var(--st-text) 34%,transparent)}
      .st-diff-dialog{width:720px;max-width:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--st-border-strong);border-radius:12px;background:var(--st-surface);box-shadow:0 12px 32px color-mix(in srgb,var(--st-text) 18%,transparent)}
      .st-diff-head{padding:13px 18px;border-bottom:1px solid var(--st-border-soft)}
      .st-diff-head h2{margin:0;font-size:14px;font-weight:650}
      .st-diff-sub{margin:4px 0 0;color:var(--st-muted);font-size:11.5px;line-height:1.5}
      .st-diff-tabs{display:flex;gap:4px;margin-top:10px}
      .st-diff-tab{padding:5px 11px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--st-muted);font:inherit;font-size:12px;cursor:pointer}
      .st-diff-tab[data-active="true"]{border-color:var(--st-border);background:var(--st-surface-subtle);color:var(--st-text);font-weight:600}
      .st-diff-body{flex:1;min-height:0;overflow:auto;padding:0 18px}
      .st-diff-alert{margin:12px 0;padding:9px 11px;border-left:2px solid var(--st-warning);color:var(--st-text);font-size:11.5px;line-height:1.55}
      .st-diff-empty{margin:12px 0;color:var(--st-muted);font-size:11.5px;line-height:1.55}
      .st-diff-counts{display:flex;gap:12px;margin:11px 0 0;color:var(--st-faint);font-size:11px}
      .st-diff-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--st-border-soft)}
      .st-diff-row-title{min-width:0;overflow-wrap:anywhere;font-size:12px;color:var(--st-text)}
      .st-diff-kind{color:var(--st-faint);font-size:11px}
      .st-diff-kind[data-kind="added"]{color:var(--st-accent)}
      .st-diff-kind[data-kind="removed"]{color:var(--st-warning)}
      .st-diff-lines{margin:0 0 6px;padding:0;list-style:none;font-size:11px;line-height:1.6}
      .st-diff-lines li{display:grid;grid-template-columns:14px minmax(0,1fr);gap:6px;white-space:pre-wrap;overflow-wrap:anywhere}
      .st-diff-lines li[data-kind="added"]{color:var(--st-accent)}
      .st-diff-lines li[data-kind="removed"]{color:var(--st-warning)}
      .st-diff-lines code{font-size:11px;color:inherit}
      .st-diff-path{min-width:0;overflow-wrap:anywhere;font-size:11.5px;color:var(--st-text)}
      .st-diff-foot{display:flex;justify-content:flex-end;gap:8px;padding:11px 18px;border-top:1px solid var(--st-border-soft)}
      .st-diff-close{padding:6px 12px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface-subtle);color:var(--st-text);font:inherit;font-size:12px;cursor:pointer}
      .st-diff-close:hover{border-color:var(--st-border-strong)}
      .st-detail-doc-body{flex:1;min-height:0;display:grid;grid-template-columns:170px minmax(0,1fr)}
      .st-detail-outline{border-right:1px solid var(--st-border-soft);padding:12px 8px;overflow:auto}
      .st-detail-outline-item{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--st-muted);font-size:12px;padding:4px 6px;border-radius:6px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-detail-outline-item[data-level="2"]{padding-left:14px}
      .st-detail-outline-item[data-level="3"]{padding-left:24px;font-size:11.5px}
      .st-detail-outline-item:hover{background:var(--st-surface-subtle);color:var(--st-text)}
      .st-detail-outline-item[data-active="true"]{background:var(--st-accent-soft);color:var(--st-accent);font-weight:600}
      .st-detail-doc-scroll{min-width:0;overflow:auto}
      .st-detail-doc-inner{padding:8px 18px 24px}
      @media(max-width:1180px){.st-detail-body{grid-template-columns:230px minmax(0,1fr)}}
      @media(max-width:980px){.st-skill-grid{grid-template-columns:minmax(0,1fr)}.st-detail-body{grid-template-columns:minmax(0,1fr)}.st-detail-doc-body{grid-template-columns:minmax(0,1fr)}.st-detail-outline{display:none}}
      /* §12 V1.0 评测卡（st-eval-*）：颜色一律走 token，高度链每层都留 min-height:0。
       * 这一块自己不做任何汇总：没有图表、没有分数、没有进度条 —— 只有一条一条摆出来的事实。 */
      .st-eval-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:12px 18px 0}
      .st-eval-top h3{margin:0;font-size:13px;color:var(--st-text)}
      .st-eval-section{padding:10px 18px 14px;border-top:1px solid var(--st-border-soft)}
      .st-eval-section h4{margin:0 0 6px;font-size:12.5px;color:var(--st-text)}
      .st-eval-section h5{margin:0 0 4px;font-size:12px;color:var(--st-text-secondary)}
      .st-eval-block{margin:0 0 10px}
      .st-eval-block:last-child{margin-bottom:0}
      .st-eval-hint{margin:4px 0 0;font-size:11.5px;line-height:1.55;color:var(--st-muted);overflow-wrap:anywhere}
      .st-eval-alert{margin:6px 0 0;font-size:11.5px;line-height:1.55;color:var(--st-danger)}
      .st-eval-empty{margin:6px 0 0;font-size:12px;color:var(--st-muted)}
      .st-eval-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
      .st-eval-button{padding:5px 10px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-surface-subtle);color:var(--st-text);font:inherit;font-size:11.5px;cursor:pointer}
      .st-eval-button:hover:not(:disabled){border-color:var(--st-border-strong)}
      .st-eval-button:disabled{opacity:.55;cursor:default}
      .st-eval-button[data-on="true"]{border-color:var(--st-accent);background:var(--st-accent-soft);color:var(--st-accent);font-weight:600}
      .st-eval-primary{border-color:var(--st-accent);background:var(--st-accent-soft);color:var(--st-accent);font-weight:600}
      .st-eval-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
      .st-eval-chip{padding:2px 8px;border:1px solid var(--st-border-soft);border-radius:999px;background:var(--st-surface-subtle);color:var(--st-text-secondary);font-size:11px}
      .st-eval-prompt{margin:6px 0 0;max-height:300px;overflow:auto;padding:10px 12px;border:1px solid var(--st-border-soft);border-radius:9px;background:var(--st-code-bg);color:var(--st-code-text);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
      .st-eval-list{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
      .st-eval-list li{font-size:11.5px;line-height:1.6;color:var(--st-text-secondary);overflow-wrap:anywhere}
      .st-eval-grid{display:grid;grid-template-columns:minmax(88px,max-content) minmax(0,1fr);gap:2px 10px;margin:4px 0 0}
      .st-eval-grid dt{font-size:11px;color:var(--st-faint)}
      .st-eval-grid dd{margin:0;font-size:11.5px;color:var(--st-text);overflow-wrap:anywhere}
      .st-eval-columns{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
      .st-eval-column{flex:1 1 280px;min-width:0;padding:9px 11px;border:1px solid var(--st-border-soft);border-radius:9px;background:var(--st-surface-subtle)}
      .st-eval-conditions{margin-top:4px}
      .st-eval-condition{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;padding:5px 0;border-top:1px solid var(--st-border-soft)}
      .st-eval-condition:first-child{border-top:0}
      .st-eval-condition-name{flex:1 1 120px;min-width:0;font-size:11.5px;color:var(--st-text-secondary);overflow-wrap:anywhere}
      .st-eval-condition-value{flex:0 0 auto;min-width:56px;font-size:11.5px;color:var(--st-text);overflow-wrap:anywhere}
      .st-eval-condition[data-equal="false"] .st-eval-condition-value{color:var(--st-warning)}
      .st-eval-tag{padding:1px 7px;border:1px solid var(--st-border-soft);border-radius:999px;font-size:10.5px;color:var(--st-muted);white-space:nowrap}
      .st-eval-tag[data-status="observed"]{border-color:var(--st-success);color:var(--st-success)}
      .st-eval-tag[data-status="not-observed"]{border-color:var(--st-warning);color:var(--st-warning)}
      .st-eval-tag[data-status="unavailable"]{border-color:var(--st-border);color:var(--st-faint)}
      .st-eval-stage{padding:8px 0;border-top:1px solid var(--st-border-soft)}
      .st-eval-stage:first-child{border-top:0}
      .st-eval-stage-head{display:flex;align-items:baseline;gap:8px}
      .st-eval-stage-name{font-size:12px;color:var(--st-text)}
      .st-eval-reach{margin:4px 0 0;padding-left:8px;border-left:2px solid var(--st-border-soft);font-size:11px;line-height:1.55;color:var(--st-muted);overflow-wrap:anywhere}
      .st-eval-inequalities{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .st-eval-inequality{padding:2px 9px;border:1px dashed var(--st-border);border-radius:999px;font-size:11px;color:var(--st-text-secondary)}
      .st-eval-assertions{margin-top:4px}
      .st-eval-assertion{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--st-border-soft)}
      .st-eval-assertion:first-child{border-top:0}
      .st-eval-assertion-text{flex:1 1 220px;min-width:0;font-size:12px;color:var(--st-text);overflow-wrap:anywhere}
      .st-eval-assertion-cell{flex:0 0 auto;min-width:58px;font-size:11.5px;color:var(--st-text-secondary)}
      .st-eval-judge{padding:7px 0;border-top:1px solid var(--st-border-soft)}
      .st-eval-judge:first-child{border-top:0}
      .st-eval-judge-text{margin:0;font-size:12px;line-height:1.5;color:var(--st-text);overflow-wrap:anywhere}
      .st-eval-textarea{width:100%;min-height:56px;margin-top:4px;padding:7px 9px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface);color:var(--st-text);font:inherit;font-size:11.5px;line-height:1.6;resize:vertical}
      .st-eval-run{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--st-border-soft)}
      .st-eval-run:first-child{border-top:0}
      .st-eval-run-id{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;color:var(--st-text)}
      .st-eval-forbidden{margin-top:4px}
      .st-eval-forbidden-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
      .st-eval-forbidden-item{padding:3px 9px;border:1px dashed var(--st-border);border-radius:999px;font-size:11px;color:var(--st-faint);text-decoration:line-through}
      /* §11 断点：1180 收窄左右栏，980 收起证据栏（与 Demo 一致）。
       * 再窄时连定义目录一起收起，只留声明流程——总比三栏互相压成一列可读性更差要强。 */
    `
    if (previous) previous.replaceWith(style)
    else document.head.appendChild(style)
    return () => {
      if (document.getElementById(STYLE_ID) === style) style.remove()
    }
  }

  // 样式表是**整份文档级**的东西，但它的生命周期一直挂在插件上下文上：上下文被拆掉（宿主重启、
  // HMR 重连、配置热载）而这一屏还挂在屏幕上时，样式会跟着上下文一起消失，留下一屏「有 DOM、
  // 没样式」的界面 —— 2026-10-05 用户报障的那一屏正是这个形状（「已安装的 Skill」大标题可见、
  // 搜索框被挤到下一行、卡片退回普通按钮）。所以让**界面自己**也确认一次：每次渲染只看一眼，
  // 一张都没有就补一张（幂等；正常路径下这一次 getElementById 就是全部代价）。
  // 它不碰上面那套归属规则：谁最后装谁拥有、谁装谁摘，界面只负责「一张都没有」这一种情况。
  function ensureStylesheet() {
    if (!document.getElementById(STYLE_ID)) installStyles()
  }

  /**
   * Install React Flow's own stylesheet.
   *
   * It travels inside the bundle as text (`.css` is loaded as text at build time)
   * because the client ships as a single script and cannot fetch a second file. It
   * lives under its own style id so the two stylesheets have independent lifetimes.
   */
  async function api(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } })
    const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
    if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`)
    return body
  }

  function shortHash(value) {
    return typeof value === 'string' && value.startsWith('sha256:') ? `${value.slice(0, 19)}…` : ''
  }

  /**
   * §31 Runtime Fingerprint — the reserved structure.
   *
   * Every pattern renders as "not yet derived", in words. Six empty boxes without that
   * sentence would read as "this run has no patterns", which is a different claim from
   * "nobody has derived them" — and this project does not let those two look alike.
   */
  function TraceState({ kind, message, onRetry }) {
    return h('div', { className: kind === 'error' ? 'st-empty-page' : 'st-trace-state', 'data-kind': kind, role: kind === 'error' ? 'alert' : 'status', 'aria-live': 'polite' }, h('div', { className: kind === 'error' ? 'st-empty-page-inner' : 'st-trace-state-line' }, kind === 'error' ? null : h('span', { className: 'st-trace-state-dot', 'aria-hidden': 'true' }), kind === 'error' ? h('p', null, message) : message, kind === 'error' && onRetry ? h('button', { className: 'st-button', type: 'button', style: { marginTop: 14 }, onClick: onRetry }, '重试') : null))
  }

  const DOC_FLASH_MS = 700
  // 「当时的目录候选」一次最多列这么多条。多的部分只报总数——这份清单是旁证，不是主视图。
  function slugifyHeading(text) {
    const slug = String(text ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    return slug || 'section'
  }

  // 行内标记：先当作纯文本，再只认三种构造。文档正文里的一切都必须经 `raw()`，
  // 否则 `h()` 会把文档句子当成 locale key 去查表。
  const AUDIT_INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g

  function renderInlineMarkup(text) {
    const nodes = []
    const source = String(text ?? '')
    let last = 0
    let match
    AUDIT_INLINE.lastIndex = 0
    while ((match = AUDIT_INLINE.exec(source)) !== null) {
      if (match.index > last) nodes.push(raw(source.slice(last, match.index)))
      const token = match[0]
      if (token.startsWith('`')) nodes.push(h('code', { key: `c${match.index}`, className: 'st-audit-code' }, raw(token.slice(1, -1))))
      else if (token.startsWith('**')) nodes.push(h('strong', { key: `b${match.index}` }, raw(token.slice(2, -2))))
      else {
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
        // 只把 http(s) 渲染成可点。其它协议退化成文本，避免把 `javascript:` 之类的构造
        // 从一份第三方 Skill 文档里带进界面。
        if (link && /^https?:\/\//i.test(link[2])) nodes.push(h('a', { key: `a${match.index}`, className: 'st-audit-link', href: link[2], target: '_blank', rel: 'noreferrer noopener' }, raw(link[1])))
        else nodes.push(raw(token))
      }
      last = match.index + token.length
    }
    if (last < source.length) nodes.push(raw(source.slice(last)))
    return nodes
  }

  /**
   * 一个足够小、且**以转义为先**的 Markdown 渲染器。
   *
   * 它只产出 React 元素，从不使用 `dangerouslySetInnerHTML`，所以 Skill 正文里的任何标记都
   * 只是文本。标题的 `id` 取自服务端 outline 的行号映射（`anchorStepsToOutline` 用的是同一
   * 套行号），因此「点步骤 → 定位段落」不会因为前端二次 slug 规则不同而锚错。
   */
  function renderSkillMarkdown(text, outline, flashId, onHeadingClick) {
    const lines = String(text ?? '').split(/\r?\n/)
    const idByLine = new Map((Array.isArray(outline) ? outline : []).map((entry) => [entry.line, entry.id]))
    const blocks = []
    let index = 0
    let key = 0
    const blockStart = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|```|~~~)/
    while (index < lines.length) {
      const line = lines[index]
      const lineNumber = index + 1
      const fence = /^\s*(```+|~~~+)\s*([A-Za-z0-9+-]*)\s*$/.exec(line)
      if (fence) {
        const marker = fence[1][0]
        const closing = new RegExp(`^\\s*${marker}{3,}\\s*$`)
        const code = []
        index += 1
        while (index < lines.length) {
          if (closing.test(lines[index])) { index += 1; break }
          code.push(lines[index])
          index += 1
        }
        blocks.push(h('pre', { key: `pre${key++}`, className: 'st-audit-pre', 'data-lang': fence[2] || undefined }, h('code', null, raw(code.join('\n')))))
        continue
      }
      if (!line.trim()) { index += 1; continue }
      // 表格必须在段落之前认出来：`| 参数 | 类型 |` 与它下面那行 `| --- |` 都长得像普通正文，
      // 认晚了整张表会被当作一个段落，读成一串竖线 —— 这正是补上表格渲染之前的现象。
      const table = parseTableAt(lines, index)
      if (table) {
        const alignOf = (column) => (table.align[column] ? { textAlign: table.align[column] } : undefined)
        // 列数一律以表头为准：某一行多写一格就丢掉多的那格，少写一格就空着。渲染层**不修正**
        // 文档，只是不因为一行写坏而让整张表变形 —— 结构对不对由翻译校验和作者负责。
        blocks.push(h('div', { key: `tw${key++}`, className: 'st-audit-table-scroll' },
          h('table', { className: 'st-audit-table' },
            h('thead', null, h('tr', null, ...table.header.map((value, column) => h('th', {
              key: column, style: alignOf(column),
            }, ...renderInlineMarkup(value))))),
            h('tbody', null, ...table.rows.map((row, rowIndex) => h('tr', { key: rowIndex },
              ...table.header.map((_, column) => h('td', {
                key: column, style: alignOf(column),
              }, ...renderInlineMarkup(row[column] ?? '')))))))))
        index = table.end
        continue
      }
      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
      if (heading) {
        // 面板自身已有层级，正文档降一级，避免出现第二个 `<h1>`。
        const level = Math.min(heading[1].length + 1, 6)
        const id = idByLine.get(lineNumber) ?? slugifyHeading(heading[2])
        blocks.push(h(`h${level}`, {
          key: `h${key++}`,
          id: `st-audit-doc-${id}`,
          className: 'st-audit-doc-heading',
          'data-flash': flashId === id ? 'true' : undefined,
          onClick: onHeadingClick ? () => onHeadingClick(id) : undefined,
        }, ...renderInlineMarkup(heading[2])))
        index += 1
        continue
      }
      const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
      const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
      if (ordered || bullet) {
        const pattern = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/
        const items = []
        while (index < lines.length) {
          const item = pattern.exec(lines[index])
          if (!item) break
          items.push(item[1])
          index += 1
        }
        blocks.push(h(ordered ? 'ol' : 'ul', { key: `l${key++}`, className: 'st-audit-doc-list' },
          ...items.map((item, position) => h('li', { key: position }, ...renderInlineMarkup(item)))))
        continue
      }
      const paragraph = [line.trim()]
      index += 1
      while (index < lines.length && lines[index].trim() && !blockStart.test(lines[index]) && !parseTableAt(lines, index)) {
        paragraph.push(lines[index].trim())
        index += 1
      }
      blocks.push(h('p', { key: `p${key++}`, className: 'st-audit-doc-p' }, ...renderInlineMarkup(paragraph.join(' '))))
    }
    return blocks
  }

  function runSourceLabel(invocationType) {
    if (invocationType === 'user-explicit') return '/name'
    if (invocationType === 'model-invoked') return 'model'
    return localized('未知来源', 'unknown source')
  }

  /**
   * v0.6 §6.3「调用方式」这一个字段的**唯一**措辞来源（卡片、左栏、页头都用它）。
   *
   * 它和 `runSourceLabel` 分开是因为两者回答的问题不同：那个问「这次加载是怎么发起的」，
   * 未知时只能说「未知来源」；这个问「这个 Skill 是怎么被调用的」，没有加载记录时正确的
   * 说法是「未使用」——把「没有记录」写成「未知」会让人以为发生过一次查不清的调用。
   */
  function invocationLabel(invocationType) {
    if (invocationType === 'user-explicit') return '/name'
    if (invocationType === 'model-invoked') return 'model'
    if (invocationType && typeof invocationType === 'object') {
      if (invocationType.modelInvocable && invocationType.userInvocable) return 'model / /name'
      if (invocationType.userInvocable) return '/name'
      if (invocationType.modelInvocable) return 'model'
      return localized('不可调用', 'not invocable')
    }
    return localized('未使用', 'not used')
  }

  const SKILL_LIMITATION_TEXT = {
    'definition-unavailable-so-no-declared-flow-could-be-extracted': ['这份 Skill 的定义当前读不到，所以无法抽取声明流程。', 'The definition cannot be read right now, so no declared flow could be extracted.'],
    'this-session-recorded-no-successful-load-of-this-skill': ['本次会话没有记录到该 Skill 的成功加载。', 'This session recorded no successful load of this Skill.'],
    'registry-unavailable-so-descriptions-and-definition-status-are-missing': ['Skill 注册表不可用，所以缺少描述与定义状态。', 'The Skill registry is unavailable, so descriptions and definition status are missing.'],
    'flow-steps-withheld-by-sanitiser': ['部分声明步骤因内容可疑而被省略。', 'Some declared steps were withheld by the sanitiser.'],
    'definition-truncated-so-the-flow-may-be-incomplete': ['定义正文被截断，声明流程可能不完整。', 'The definition body was truncated, so the flow may be incomplete.'],
    'resource-base-omitted': ['资源基准路径已省略。', 'The resource base path was omitted.'],
    'no-git-work-tree-found': ['没有找到 git work tree，无法确定仓库来源。', 'No git work tree was found, so the repository source cannot be established.'],
    'git-work-tree-has-no-origin-remote': ['这个 git work tree 没有 origin 远端，所以没有可打开的仓库。', 'This git work tree has no origin remote, so there is no repository to open.'],
    'no-local-directory-to-inspect': ['资源基准不是本地目录，无法向上寻找仓库。', 'The resource base is not a local directory, so no repository could be looked up.'],
    'resource-base-path-withheld': ['资源基准的绝对路径已扣留。', 'The absolute resource base path was withheld.'],
    'rendered-envelope-not-reproducible-outside-the-harness': ['渲染后的信封无法在 Harness 之外重现。', 'The rendered envelope cannot be reproduced outside the harness.'],
    'section-heading-does-not-match-a-known-framework-role': ['有小节的标题没有匹配到已知的框架角色，按原标题列出。', 'Some section headings matched no known framework role and keep their own titles.'],
    'definition-truncated-so-the-framework-may-be-incomplete': ['定义正文被截断，框架可能不完整。', 'The definition body was truncated, so the framework may be incomplete.'],
    'definition-has-no-headings-so-only-the-preamble-could-be-read': ['这份定义没有小节标题，所以只读到了开头一段。', 'This definition has no section headings, so only its opening paragraph could be read.'],
    'declared-resources-are-not-loaded-resources': ['声明资源不等于已读取资源：这里只显示 SKILL.md 写到的引用。', 'Declared resources are not loaded resources: only the references SKILL.md writes down are shown here.'],
    'runtime-facts-come-only-from-what-this-session-observed': ['运行事实只来自当前会话观察到的内容。', 'Runtime facts come only from what this session observed.'],
    'runtime-evidence-is-categorical-and-carries-no-argument-text': ['运行证据只有类别与计数，不保留命令、路径或查询原文。', 'Runtime evidence is categorical and keeps no command, path or query text.'],
    'runtime-events-could-not-be-linked-to-this-skill': ['运行时事件无法与这个 Skill 关联，所以能力与证据保持为空。', 'Runtime events could not be linked to this Skill, so capability and evidence stay empty.'],
    // v0.7 复刻：宿主返回的 limitations 是**代码**，界面必须说人话（§7）。
    'clone-is-not-attached-to-this-session': ['副本不会自动接到这次对话，需要时在对话里用它的名字调用。', 'The copy is not attached to this conversation; invoke it by name when you need it.'],
    'bundle-declared-resources-not-copied': ['只复制了 SKILL.md，Skill 声明的资源目录没有一起复制。', 'Only SKILL.md was copied; the resource directories the Skill declares were not.'],
    'bundle-truncated-by-limit': ['有文件超过了单次复刻的上限，没有被复制。', 'Some files exceeded the per-clone limit and were not copied.'],
    'bundle-partially-skipped': ['有文件被跳过（例如符号链接或不安全的路径）。', 'Some files were skipped, such as symlinks or unsafe paths.'],
    // v0.8 差异：同样是**代码**，同样必须说人话（§7）。差异这一层尤其不能把
    // 「读不到」与「没有变化」混成一句话 —— 这两件事的差别就是这一层的全部意义。
    'source-unavailable': ['当前无法读取来源 Skill，无法完成差异比较。', 'The source Skill cannot be read right now, so it cannot be compared.'],
    'target-unavailable': ['当前无法读取这个 Skill 的正文，无法完成差异比较。', 'This Skill\u2019s body cannot be read right now, so it cannot be compared.'],
    'section-list-truncated': ['小节太多，只列出了前面一部分。', 'There are more sections than fit here; only the first ones are listed.'],
    'section-too-large-to-compare-line-by-line': ['有小节太大，没有逐行比较。', 'Some sections are too large to be compared line by line.'],
    'diff-lines-truncated': ['差异行太多，只显示了前面一部分。', 'There are more differing lines than fit here; only the first ones are shown.'],
    'resource-list-truncated': ['资源文件太多，只列出了前面一部分。', 'There are more resource files than fit here; only the first ones are listed.'],
    'resources-not-copied-by-skill-md-clone': ['这份副本只复刻了 SKILL.md，来源的其它资源本来就不在本地。', 'This copy cloned SKILL.md only, so the source\u2019s other resources were never local.'],
    'resource-differences-may-come-from-a-truncated-clone': ['复刻时有文件超过上限没有被复制，资源差异可能来自那里。', 'Files over the per-clone limit were not copied, so some resource differences may come from that.'],
    'clone-mode-unknown-for-this-comparison': ['这次比较的对象不是当初复刻的来源，资源差异无法按复刻方式解释。', 'This comparison is not against the Skill it was cloned from, so the clone mode cannot explain the resource differences.'],
  }

  // 这几条在成功面板里**已经有一句话说过了**（目录刷新、源是否被改动），或者纯粹是
  // 宿主自己的策略（不外发绝对路径）。在限制列表里再列一遍等于把同一件事说两次，
  // 而且「限制：绝对路径未提供」读起来像是缺了什么 —— 它不是缺陷，是承诺。
  const CLONE_LIMITATION_RESTATED = Object.freeze([
    'absolute-paths-withheld',
    'catalog-refresh-observed',
    'catalog-refresh-not-observed',
    'source-reread-did-not-match',
  ])

  // 复合码（`git-remote-unrecognised-remote`、`frontmatter-repository-empty-remote`）是
  // 「哪条来源 + 哪种拒绝」拼出来的。逐个枚举会随来源增加而漂移，所以按结尾判断。
  const LIMITATION_SUFFIX_RULES = [
    ['credential-bearing-remote', ['远端地址里带着凭据，已整条拒绝。', 'The remote carries credentials, so it was refused outright.']],
    ['unrecognised-remote', ['这个地址不像可识别的仓库远端。', 'This value does not look like a recognisable repository remote.']],
    ['empty-remote', ['远端地址是空的。', 'The remote value is empty.']],
  ]

  function limitationLabel(code) {
    if (code === null || code === undefined) return ''
    let text = String(code)
    // `repository:<code>`：前缀只说这条限制属于哪一块，本身不含信息，去掉再查表。
    if (text.startsWith('repository:')) text = text.slice('repository:'.length)
    const known = SKILL_LIMITATION_TEXT[text]
    if (known) return localized(known[0], known[1])
    for (const [suffix, sentence] of LIMITATION_SUFFIX_RULES) {
      if (text.endsWith(suffix)) return localized(sentence[0], sentence[1])
    }
    // 已经是句子（有空白或非 ASCII）就照原样显示，只有裸代码才加前缀。
    if (/\s/.test(text) || /[^\x00-\x7F]/.test(text)) return text
    return localized(`限制：${text}`, `Limitation: ${text}`)
  }

  function definitionStatusText(status) {
    if (status === 'available') return localized('定义可用', 'Definition available')
    if (status === 'unknown-skill') return localized('未找到定义', 'No definition found')
    if (status === 'registry-unavailable') return localized('注册表不可用', 'Registry unavailable')
    return localized('定义状态未知', 'Definition status unknown')
  }

  /**
   * 第一屏的空态 / 错误态判定。
   *
   * 抽成纯函数是因为这里是**唯一**知道「宿主拉不到列表」和「宿主说列表是空的」是两件事的
   * 地方。前者在升级窗口里必然出现：新的客户端先落地，旧的宿主进程还在跑，`/skills` 直接
   * 404；如果它和「暂未加载」共用一句话，页头（计数来自收据）和正文就会在同一屏上互相
   * 打脸。纯函数还能直接测——组件里的 useEffect 在冒烟测试里根本不执行。
   */
  function resolveSkillListState({ hasSkills, hasDetail, loading, listError, loadedSkillCount = 0 }) {
    if (hasSkills || hasDetail) return null
    if (loading) return { kind: 'loading', message: localized('正在读取当前对话的 Skill 使用情况…', 'Reading how this conversation used Skills…') }
    if (listError) {
      return {
        kind: 'error',
        message: loadedSkillCount
          ? localized(`本次对话记录了 ${loadedSkillCount} 个 Skill 的加载，但宿主暂时无法列出它们。宿主可能仍在运行旧版本，重启 DSH 后再试。`, `This conversation recorded ${loadedSkillCount} Skill load(s), but the host cannot list them right now. The host may still be running an older build; restart DSH and try again.`)
          : localized('暂时无法从宿主读取 Skill 列表。宿主可能仍在运行旧版本，重启 DSH 后再试。', 'The Skill list cannot be read from the host right now. The host may still be running an older build; restart DSH and try again.'),
      }
    }
    return { kind: 'empty', message: localized('当前对话暂未加载任何 Skill。', 'No Skill was loaded in this conversation.') }
  }

  /**
   * v0.6 §10.2 的锚点对齐：把译文里的标题按**顺序**对回原文 outline 的 id。
   *
   * 为什么顺序对齐是成立的：`buildTranslationMessages` 的硬规则 2/3 要求「不增加、不删除、
   * 不合并、不拆分任何段落」「不改变任何标题的层级与数量」，`inspectTranslation` 也会逐条
   * 检查标题数量与层级。所以译文第 i 个标题就是原文第 i 个标题，这是被上游保证过的对应关系，
   * 不是猜的。
   *
   * 但对应关系一旦不成立（数量或层级对不上），这里**必须返回空数组**：宁可让目录点不动，
   * 也不能把 id 错位地挂到别的段落上 —— 那会让用户点「Workflow」跳到「Examples」。
   */
  function alignOutlineToTranslation(text, outline) {
    const entries = Array.isArray(outline) ? outline : []
    if (!entries.length) return []
    const lines = String(text ?? '').split(/\r?\n/)
    const seen = []
    let open = null
    for (const line of lines) {
      const fence = /^\s*(```+|~~~+)(.*)$/.exec(line)
      if (open) {
        const closes = fence && fence[1][0] === open[0] && fence[1].length >= open.length && fence[2].trim() === ''
        if (closes) open = null
        continue
      }
      if (fence) { open = fence[1]; continue }
      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
      if (heading) seen.push(heading[1].length)
    }
    if (seen.length !== entries.length) return []
    const levels = entries.map((entry) => Number(entry?.level) || 0)
    // 层级也要一一对应：`##` 变成 `###` 说明结构被改过，此时顺序相同也不可信。
    if (levels.some((level, index) => level && level !== seen[index])) return []
    return entries.map((entry) => ({ id: entry.id, level: entry.level, line: entry.line, title: entry.title }))
  }

  /** CSS.escape 不存在时的保守替代：只转义选择器里有特殊含义的字符。 */
  function escapeSelector(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(value))
    return String(value).replace(/["\\#.:[\]]/g, '\\$&')
  }

  /**
   * v0.6 §6/§7 的 Skill Card，两个列表页共用。
   *
   * §6.3：主体只说四件事 —— 名称、描述、已加载次数、调用方式。SHA、来源、定义状态这类辅助
   * 事实进 pill；Runtime 节点、MCP、CLI 链路**不进卡片主体**（§6.3 末句）。
   * 卡片整体是一个 `<button>`：§6.4 要求点它就直接进 Skill Detail，不进入任何 Runtime 画布。
   */
  function SkillCard({ name, description, meta = [], onOpen }) {
    return h('button', {
      type: 'button',
      className: 'st-skill-card',
      'data-skill': name,
      onClick: onOpen,
    },
    h('span', { className: 'st-skill-card-icon', 'aria-hidden': 'true' }, 'S'),
    h('span', { className: 'st-skill-card-body' },
      h('span', { className: 'st-skill-card-name' }, raw(name)),
      description ? h('span', { className: 'st-skill-card-desc' }, raw(description)) : null,
      meta.length
        ? h('span', { className: 'st-skill-card-meta' }, ...meta.map((pill, position) => h('span', {
          key: `${position}:${pill.label}`,
          className: 'st-pill',
          'data-tone': pill.tone || 'muted',
        }, raw(pill.label))))
        : null),
    h('span', { className: 'st-skill-card-go', 'aria-hidden': 'true' }, '›'))
  }

  /**
   * v0.6 §6「本次 Skill」：第一屏是**这次对话真的加载过的 Skill 卡片**。
   *
   * 它不是运行视图：没有画布、没有节点/边计数，空的时候也不显示 Runtime 图谱占位（§6.5）。
   * `list` 是渲染冒烟测试的注入口（那个测试的 react stub 不跑 useEffect，fetch 永远不会发生，
   * 于是卡片、`resolveSkillListState` 的每一条分支都执行不到），平时由这里的 fetch 填。
   */
  function CurrentSkillPage({ sessionId, onOpen, loadedSkillCount = 0, onMeta, onRetry, reloadSignal, list: suppliedList }) {
    const [fetchedList, setFetchedList] = React.useState(null)
    const [loading, setLoading] = React.useState(!suppliedList)
    const [listError, setListError] = React.useState('')

    React.useEffect(() => {
      if (suppliedList) return undefined
      let cancelled = false
      setLoading(true)
      setListError('')
      api(`/skills?sessionId=${encodeURIComponent(sessionId)}`)
        .then((body) => { if (!cancelled) { setFetchedList(body?.list ?? null); setLoading(false) } })
        .catch((reason) => { if (!cancelled) { setListError(String(reason?.message || 'unavailable')); setLoading(false) } })
      return () => { cancelled = true }
    }, [sessionId, suppliedList, reloadSignal])

    const list = suppliedList ?? fetchedList
    const skills = React.useMemo(() => (Array.isArray(list?.skills) ? list.skills : []), [list])
    const state = resolveSkillListState({ hasSkills: skills.length > 0, hasDetail: false, loading, listError, loadedSkillCount })

    // 页头必须和正文说同一件事：正文说"读不到"的时候，页头不能还在说"正在读取"。
    // 「读不到」和「没有」是两种相反的事实，所以这里报的是错误，不是 0 个 Skill。
    React.useEffect(() => {
      onMeta?.({ error: Boolean(listError && !skills.length), skillCount: skills.length })
    }, [listError, skills.length, onMeta])

    // 这一页在正文里不再有标题：2026-10-01 用户指出「本次加载的 Skill」是多余的，
    // 页面名由顶栏那两个入口用 `aria-pressed` 说着，状态行也搬回了顶栏。
    // 视觉上删掉，语义上补一个只给读屏软件的 h2。
    const title = h('h2', { className: 'st-sr' }, localized('本次加载的 Skill', 'Skills loaded in this run'))

    if (state) {
      return h('div', { className: 'st-page' }, title,
        h(TraceState, { kind: state.kind, message: state.message, onRetry: state.kind === 'error' ? onRetry : undefined }))
    }

    return h('div', { className: 'st-page' },
      title,
      h('div', { className: 'st-skill-grid' }, ...skills.map((entry) => h(SkillCard, {
        key: entry.name,
        name: entry.name,
        description: entry.description,
        meta: [
          { label: localized(`已加载 ${entry.runCount ?? 0} 次`, `Loaded ${entry.runCount ?? 0}×`), tone: 'accent' },
          { label: invocationLabel(entry.lastInvocationType) },
          { label: definitionStatusText(entry.definitionStatus) },
        ],
        onOpen: () => onOpen(entry.name, 'current'),
      }))))
  }

  /**
   * v0.6 §8 Skill Detail —— 插件里**唯一的二级页面**。
   *
   * §9.1：SKILL.md 是这一页的主体，**不是**某个证据面板里的一个 Tab。所以右栏整块是文档，
   * 切换轴只有「原文 / 中文预览」一条（§12），左栏只回答「这是哪个 Skill、它的定义是什么、
   * 它从哪来」（§8.2 / §10.2）——左栏不是第二个导航系统。
   *
   * §8.4：返回的是**进入前的那个列表**，所以 `onBack` 由调用方给，这里不写死任何一个。
   *
   * §12.4：译文只活在内存里 —— 不写 localStorage、不写 sessionStorage、不进会话、不落盘。
   * 定义指纹变了就换一份（`alignOutlineToTranslation` 的注释说明为什么「结构没被破坏」是
   * 上游保证的）；指纹没变、只是切到别的 Skill 再切回来，则从模块级缓存里取回，不再重译。
   */
  /**
   * 二级页的返回键。它现在住在顶栏里 —— 顶栏原先那行「本次 Skill / DSH_Skill_Trace · …」
   * 和正文的标题说的是同一件事，删掉之后那个位置正好归返回键（用户截图指出）。
   *
   * 返回目标来自**进入时的那张列表**（§8.4），所以这里只接一个算好的标签，
   * 不写死任何目标。
   */
  function DetailBackButton({ backLabel, onBack }) {
    return h('button', { type: 'button', className: 'st-detail-back', onClick: onBack },
      raw(`← ${localized('返回 Skill 列表', 'Back to the Skill list')}${backLabel ? localized(`（${backLabel}）`, ` (${backLabel})`) : ''}`))
  }

  /** 小节卡片的元信息：行号 · 条目数 · 表格数 · 子小节数。全是定义里数得出来的事实。 */
  function sectionMeta(section) {
    const meta = []
    if (Number.isSafeInteger(section?.line)) meta.push(`L${section.line}`)
    if (section?.itemCount > 0) meta.push(localized(`${section.itemCount} 项`, `${section.itemCount} items`))
    if (section?.tables > 0) meta.push(localized(`${section.tables} 张表`, `${section.tables} tables`))
    if (section?.childCount > 0) meta.push(localized(`${section.childCount} 小节`, `${section.childCount} subsections`))
    return meta.join(' · ')
  }

  /**
   * 框架里的一个小节。
   *
   * 可点是因为锚点来自**同一份** `definition.outline`；没有锚点的（比如从 description 合成出来的
   * Trigger）渲染成 `div` —— 一个点了没反应的按钮，比一个不可点的元素更糟。
   *
   * 合成出来的小节标题写成「（来自 Skill 描述）」而不是「（无标题）」：前者说的是一处**来源**，
   * 后者听起来像原文掉了个标题 —— 而原文本来就没有这一节。
   */
  function FrameworkSection({ section, anchors, flash, onAnchorClick }) {
    const anchorId = typeof anchors?.[section?.id] === 'string' ? anchors[section.id] : ''
    const meta = sectionMeta(section)
    const items = Array.isArray(section?.items) ? section.items : []
    const title = section?.title
      || (section?.source === 'summary'
        ? localized('来自 Skill 描述', 'From the skill description')
        : localized('（无标题）', '(untitled)'))
    const props = {
      className: 'st-fw-section',
      'data-static': anchorId ? undefined : 'true',
      'data-active': anchorId && flash === anchorId ? 'true' : undefined,
    }
    const body = [
      h('span', { key: 'h', className: 'st-fw-section-head' },
        h('span', { className: 'st-fw-section-title' }, raw(title)),
        meta ? h('span', { className: 'st-fw-section-meta' }, raw(meta)) : null),
      section?.opening ? h('span', { key: 'o', className: 'st-fw-opening' }, raw(section.opening)) : null,
      items.length
        ? h('ul', { key: 'i', className: 'st-fw-items' },
          ...items.slice(0, 3).map((item, index) => h('li', { key: index }, raw(item))),
          section.itemCount > 3 || section.itemsTruncated
            ? h('li', { key: 'more', className: 'st-fw-more' }, raw(localized(`…共 ${section.itemCount} 项`, `${section.itemCount} in total`)))
            : null)
        : null,
    ]
    return anchorId
      ? h('button', { ...props, type: 'button', onClick: () => onAnchorClick(anchorId) }, ...body)
      : h('div', props, ...body)
  }

  /**
   * Framework / Structure —— 这个 Skill 由什么组成。
   *
   * 这里显示的是 SKILL.md **自己的**章节结构，不是把整个 Skill 压成几个步骤。所以角色是
   * 「命中的标签」而不是「唯一的分类」：认得出角色的章节归到角色下，认不出的按原标题单列
   * （`其它章节`）—— 一个复杂的 Skill 不该因为标题不常见就被吞掉。
   *
   * 没有对应章节的角色只在末尾列一句「SKILL.md 里没有可识别的模块」，不补空卡片：
   * 缺一个模块是事实，画一个空盒子会让人以为这里本来该有东西。
   */
  function FrameworkStructure({ framework, anchors, flash, onAnchorClick }) {
    const sections = Array.isArray(framework?.sections) ? framework.sections : []
    const byId = new Map(sections.map((section) => [section.id, section]))

    const groups = []
    for (const role of framework?.roles ?? []) {
      const label = FRAMEWORK_ROLE_LABELS[role.role]
      const hint = FRAMEWORK_ROLE_HINTS[role.role]
      groups.push({
        key: role.role,
        label: label ? localized(label.zh, label.en) : role.role,
        hint: hint ? localized(hint.zh, hint.en) : null,
        sections: (role.sections ?? []).map((id) => byId.get(id)).filter(Boolean),
      })
    }
    const others = (framework?.unclassified ?? []).map((id) => byId.get(id)).filter(Boolean)
    // 兜底：任何没有被角色分到、也没被标成 unclassified 的小节，仍然要出现。角色列表以后
    // 多一个字段、少一次赋值，都不该让一个小节从界面上安静地消失 —— 少显示一节，读者会以为
    // SKILL.md 里本来就没有它。
    const covered = new Set([...groups.flatMap((group) => group.sections.map((section) => section.id)), ...others.map((section) => section.id)])
    for (const section of sections) {
      if (!covered.has(section.id)) others.push(section)
    }
    if (others.length) {
      groups.push({
        key: 'other',
        label: localized(FRAMEWORK_UNCLASSIFIED_LABEL.zh, FRAMEWORK_UNCLASSIFIED_LABEL.en),
        hint: localized('没有匹配到已知的框架角色，按原标题列出。', 'These headings matched no known framework role, so they keep their own titles.'),
        sections: others,
      })
    }

    const absent = (framework?.coverage?.absent ?? []).map((role) => {
      const label = FRAMEWORK_ROLE_LABELS[role]
      return label ? localized(label.zh, label.en) : role
    })

    if (groups.length === 0) {
      return h('p', { className: 'st-framework-empty' }, raw(localized(
        '这份 SKILL.md 没有可用的小节结构。',
        'This SKILL.md has no usable section structure.')))
    }

    return h('div', { className: 'st-fw-structure' },
      ...groups.map((group) => h('section', { key: group.key, className: 'st-fw-module', 'data-role': group.key },
        h('div', { className: 'st-fw-module-head' },
          h('span', { className: 'st-fw-module-label' }, raw(group.label)),
          h('span', { className: 'st-fw-module-count' }, raw(`${group.sections.length}`))),
        group.hint ? h('p', { className: 'st-fw-module-hint' }, raw(group.hint)) : null,
        h('div', { className: 'st-fw-sections' },
          ...group.sections.map((section) => h(FrameworkSection, {
            key: section.id, section, anchors, flash, onAnchorClick,
          }))))),
      absent.length
        ? h('p', { className: 'st-fw-absent' }, raw(localized(
          `SKILL.md 里没有可识别的模块：${absent.join(' / ')}`,
          `No recognisable module in SKILL.md for: ${absent.join(' / ')}`)))
        : null)
  }

  /**
   * Declared Workflow —— `detail.flow.steps[]`，也就是 SKILL.md **明确写出**的那段流程。
   *
   * 它从「整个 Skill 的框架」降级成框架里的一个模块，这是这次调整的要点：ui-craft 的
   * Discovery Phase 只有 4 步，而它整个 Skill 有 11 个小节。把 4 步当成框架，是把
   * 「Skill 声明了什么过程」误读成「Skill 是什么」。
   *
   * 步骤只来自定义正文。证据能做的唯一一件事，是给已经存在的步骤标一个状态；它不能新增、
   * 删除、改名或重排步骤。
   */
  function DeclaredWorkflow({ flow, anchors, flash, onStepClick }) {
    const language = isEnglish() ? 'en' : 'zh'
    const steps = Array.isArray(flow?.steps) ? flow.steps : []
    const mapping = anchors && typeof anchors === 'object' ? anchors : {}

    // 每一步的四个格子：序号 · 标题 · 类型 · 观察状态。类型与状态是两件事，所以永远
    // 分成两列 —— 合成一句"运行：有证据"会让"声明成运行"读成"运行过"。
    const cellsOf = (step) => {
      const relationship = step?.evidence?.relationship
      const limitation = typeof step?.evidence?.limitation === 'string' ? step.evidence.limitation : ''
      return [
        h('span', { key: 'n', className: 'st-framework-num' }, raw(String(step?.order ?? '').padStart(2, '0'))),
        h('span', { key: 't', className: 'st-framework-title' }, raw(step?.title ?? '')),
        h('span', { key: 'k', className: 'st-framework-kind' }, raw(flowKindLabel(step?.kind, language))),
        // 状态的 title 用核心层那句限制原文：它是"为什么只能这么说"的完整解释，
        // 悬停才展开，不占版面。
        h('span', {
          key: 's', className: 'st-framework-state', title: limitation || undefined,
        }, raw(flowEvidenceLabel(relationship, language))),
      ]
    }

    const body = steps.length === 0
      ? h('p', { className: 'st-framework-empty' }, raw(localized(FLOW_EMPTY_TEXT.zh, FLOW_EMPTY_TEXT.en)))
      : h('ol', { className: 'st-framework-steps' },
        ...steps.map((step, position) => {
          const anchorId = typeof mapping[step?.id] === 'string' ? mapping[step.id] : ''
          const props = {
            className: 'st-framework-step',
            'data-state': flowEvidenceState(step?.evidence?.relationship).tone,
            'data-active': anchorId && flash === anchorId ? 'true' : undefined,
          }
          return h('li', { key: step?.id ?? position, className: 'st-framework-item' },
            anchorId
              ? h('button', { ...props, type: 'button', onClick: () => onStepClick(anchorId) }, ...cellsOf(step))
              : h('div', { ...props, 'data-static': 'true' }, ...cellsOf(step)),
            position < steps.length - 1
              ? h('span', { key: 'a', className: 'st-framework-arrow', 'aria-hidden': 'true' }, raw('↓'))
              : null)
        }))

    return h('section', { className: 'st-fw-sub' },
      h('div', { className: 'st-fw-sub-head' },
        h('h4', null, localized('声明流程 · Declared Workflow', 'Declared workflow')),
        h('span', { className: 'st-fw-sub-note' }, raw(localized(
          `SKILL.md 明确写出的流程${steps.length ? `，共 ${steps.length} 步` : ''}`,
          `The flow SKILL.md explicitly writes out${steps.length ? `, ${steps.length} steps` : ''}`)))),
      body,
      flow?.truncated && steps.length
        ? h('p', { className: 'st-framework-truncated' }, raw(localized(FLOW_TRUNCATED_TEXT.zh, FLOW_TRUNCATED_TEXT.en)))
        : null)
  }

  /**
   * Progressive Disclosure —— Skill 怎么按需展开自己的资源。
   *
   * 这条链是 Skill 的**加载与资源组织机制**，不是工作流：它讲的是 SKILL.md 全文先到、
   * 被引用的资源按需再读。
   *
   * 「声明资源」和「已读取资源」在这里被刻意分成两件事。收据里没有任何来源证据能证明
   * `references/tokens.md` 被读过，所以界面只说「声明」；`loaded` 永远是空的，
   * 它空着本身就是要说的事实。
   */
  function ProgressiveDisclosure({ framework, onAnchorClick }) {
    const chain = Array.isArray(framework?.chain) ? framework.chain : []
    const resources = framework?.resources ?? null
    const declared = Array.isArray(resources?.declared) ? resources.declared : []
    const tiers = Array.isArray(resources?.tiers) ? resources.tiers : []
    const byPath = new Map(declared.map((item) => [item.path, item]))

    const resourceRow = (path, owner) => {
      const item = byPath.get(path) ?? { path, anchorId: '' }
      const anchorId = typeof item.anchorId === 'string' ? item.anchorId : ''
      const props = { key: path, className: 'st-fw-resource', 'data-static': anchorId ? undefined : 'true' }
      const body = [
        h('code', { key: 'p', className: 'st-fw-resource-path' }, raw(path)),
        item.when ? h('span', { key: 'w', className: 'st-fw-resource-when' }, raw(item.when)) : null,
      ]
      return anchorId
        ? h('button', { ...props, type: 'button', onClick: () => onAnchorClick(anchorId) }, ...body)
        : h('div', props, ...body)
    }

    const list = tiers.length
      ? tiers.map((tier) => h('div', { key: tier.line ?? tier.title, className: 'st-fw-tier' },
        h('div', { className: 'st-fw-tier-head' },
          h('span', { className: 'st-fw-tier-title' }, raw(tier.title || localized('未分组', 'Ungrouped'))),
          h('span', { className: 'st-fw-tier-count' }, raw(localized(`${tier.count} 个引用`, `${tier.count} references`)))),
        h('div', { className: 'st-fw-resources' },
          ...(tier.resourcePaths ?? []).map((path) => resourceRow(path, tier)))))
      : declared.length
        ? h('div', { className: 'st-fw-resources' }, ...declared.map((item) => resourceRow(item.path, null)))
        : h('p', { className: 'st-framework-empty' }, raw(localized(
          'SKILL.md 没有声明任何外部资源。',
          'SKILL.md declares no external resource.')))

    const base = resources?.base ?? null

    return h('section', { className: 'st-fw-sub' },
      h('div', { className: 'st-fw-sub-head' },
        h('h4', null, localized('渐进披露 · Progressive Disclosure', 'Progressive disclosure')),
        h('span', { className: 'st-fw-sub-note' }, raw(localized(
          `声明引用 ${resources?.declaredCount ?? 0} 个 · 已读取 ${resources?.loadedCount ?? 0} 个`,
          `${resources?.declaredCount ?? 0} declared · ${resources?.loadedCount ?? 0} read`)))),
      h('ol', { className: 'st-fw-chain' },
        ...chain.map((stage, index) => h('li', { key: stage.id, className: 'st-fw-chain-item' },
          h('span', { className: 'st-fw-chain-label' }, raw(localized(stage.label.zh, stage.label.en))),
          index < chain.length - 1
            ? h('span', { key: 'a', className: 'st-fw-chain-arrow', 'aria-hidden': 'true' }, raw('→'))
            : null))),
      base
        ? h('p', { className: 'st-fw-base' }, raw(localized(
          `资源基准：${base.kind ?? 'unknown'}${base.pathOmitted ? '（路径已省略）' : ''}`,
          `Resource base: ${base.kind ?? 'unknown'}${base.pathOmitted ? ' (path withheld)' : ''}`)))
        : null,
      list,
      h('p', { className: 'st-framework-note' }, raw(localized(DISCLOSURE_NOTE.zh, DISCLOSURE_NOTE.en))))
  }

  /**
   * Skill 框架 = Structure + Declared Workflow + Progressive Disclosure。
   *
   * 三者放在一张卡里、彼此有分节，是因为它们回答的是同一个问题的三个面：「这个 Skill 是什么」。
   * 运行过程不在这里 —— 那是下一张卡（`RuntimeLogic`），两者的边界必须一眼看得出来。
   */
  function SkillFramework({ framework, flow, anchors, definitionAvailable, flash, onStepClick, onAnchorClick }) {
    const sectionCount = Number.isSafeInteger(framework?.sectionCount) ? framework.sectionCount : 0
    const stepCount = Array.isArray(flow?.steps) ? flow.steps.length : 0
    const body = !definitionAvailable
      ? h('p', { className: 'st-framework-empty' }, raw(localized(FLOW_UNAVAILABLE_TEXT.zh, FLOW_UNAVAILABLE_TEXT.en)))
      : h('div', null,
        h(FrameworkStructure, { framework, anchors, flash, onAnchorClick }),
        h(DeclaredWorkflow, { flow, anchors, flash, onStepClick }),
        h(ProgressiveDisclosure, { framework, onAnchorClick }))

    return h('section', { className: 'st-framework' },
      h('div', { className: 'st-framework-head' },
        h('div', { className: 'st-framework-title-row' },
          h('h3', null, localized('Skill 框架', 'Skill Framework')),
          definitionAvailable && sectionCount
            ? h('span', { className: 'st-framework-count' }, raw(localized(
              `${sectionCount} 个小节 · ${stepCount} 步声明流程`,
              `${sectionCount} sections · ${stepCount} declared steps`)))
            : null),
        h('p', { className: 'st-framework-sub' }, localized(
          '这个 Skill 由什么组成：结构、声明流程、渐进披露',
          'What this Skill is made of: structure, declared flow, progressive disclosure')),
        h('p', { className: 'st-framework-note' }, raw(localized(FRAMEWORK_NOTE.zh, FRAMEWORK_NOTE.en)))),
      body,
      h('p', { className: 'st-framework-note' }, raw(localized(FLOW_DECLARATION_NOTE.zh, FLOW_DECLARATION_NOTE.en))))
  }

  /**
   * 本次运行逻辑 —— 这个 Skill 在**这一次会话**里走过哪几个阶段，哪些阶段观察不到。
   *
   * 它不是运行图：阶段是固定的五段生命周期，不是按时间排序的事件序列。每个阶段显示的核心
   * 是「能观察到的事实」和「这句判断为什么只能这么说」，看不到的地方就写着看不到。
   */
  function RuntimeLogic({ runtimeLogic }) {
    const language = isEnglish() ? 'en' : 'zh'
    const stages = Array.isArray(runtimeLogic?.stages) ? runtimeLogic.stages : []

    const factValue = (fact) => {
      const value = fact?.value
      switch (fact?.kind) {
        case 'count': return raw(String(value))
        case 'code': return h('code', null, raw(String(value)))
        case 'flag': return raw(value === true
          ? localized('是', 'Yes')
          : value === false ? localized('否', 'No') : localized('未知', 'Unknown'))
        case 'names': return raw(Array.isArray(value) ? value.join(' · ') : String(value ?? ''))
        case 'step-kinds': return raw(Array.isArray(value) ? value.map((kind) => flowKindLabel(kind, language)).join(' · ') : '')
        case 'pairs': return raw(Array.isArray(value) ? value.map((pair) => `${pair.label} × ${pair.value}`).join(' · ') : '')
        case 'evidence-states': return raw(Array.isArray(value)
          ? value.map((pair) => `${flowEvidenceLabel(pair.label, language)} × ${pair.value}`).join(' · ')
          : '')
        default: return raw(value === null || value === undefined ? '—' : String(value))
      }
    }

    if (stages.length === 0) {
      return h('section', { className: 'st-runtime' },
        h('div', { className: 'st-framework-head' },
          h('h3', null, localized('本次运行逻辑', 'Runtime logic this session'))),
        h('p', { className: 'st-framework-empty' }, raw(localized('没有可显示的运行观察。', 'No runtime observation to show.'))))
    }

    return h('section', { className: 'st-runtime' },
      h('div', { className: 'st-framework-head' },
        h('div', { className: 'st-framework-title-row' },
          h('h3', null, localized('本次运行逻辑', 'Runtime logic this session')),
          h('span', { className: 'st-framework-count' }, raw(localized(
            `观察到 ${runtimeLogic.observedCount} / ${runtimeLogic.stageCount} 段`,
            `${runtimeLogic.observedCount} of ${runtimeLogic.stageCount} stages observed`)))),
        h('p', { className: 'st-framework-sub' }, localized(
          '当前会话能观察到的 Skill 生命周期',
          'The Skill lifecycle this session could observe')),
        h('p', { className: 'st-framework-note' }, raw(localized(RUNTIME_LOGIC_NOTE.zh, RUNTIME_LOGIC_NOTE.en)))),
      h('ol', { className: 'st-runtime-stages' },
        ...stages.map((stage) => h('li', { key: stage.id, className: 'st-runtime-stage', 'data-state': stage.tone },
          h('div', { className: 'st-runtime-stage-head' },
            h('span', { className: 'st-runtime-order' }, raw(String(stage.order).padStart(2, '0'))),
            h('span', { className: 'st-runtime-label' }, raw(localized(stage.label.zh, stage.label.en))),
            h('span', { className: 'st-runtime-state' }, raw(flowEvidenceLabel(stage.state, language)))),
          h('p', { className: 'st-runtime-hint' }, raw(localized(stage.hint.zh, stage.hint.en))),
          stage.statement ? h('p', { className: 'st-runtime-statement' }, raw(localized(stage.statement.zh, stage.statement.en))) : null,
          stage.facts.length
            ? h('dl', { className: 'st-runtime-facts' },
              ...stage.facts.map((item) => [
                h('dt', { key: `${item.id}-t` }, raw(localized(item.label.zh, item.label.en))),
                h('dd', { key: `${item.id}-d` }, factValue(item)),
              ]).flat())
            : null,
          stage.limitations.length
            ? h('p', { className: 'st-runtime-limitation' }, raw(stage.limitations.map((item) => limitationLabel(item)).join(' · ')))
            : null))))
  }

  /**
   * 步骤证据 —— `detail.flow.steps[].evidence` 摆到台面上。
   *
   * 这一段存在的理由只有一个：状态词（「暂无足够证据」）很容易被读成结论（「没做」）。
   * 所以每一行都不只给状态，还把后端已经算好的引用数、类别、命中类型一起给出来 ——
   * 让用户能自己看出「这里确实没有东西可对齐」，而不是只能相信一个词。
   */
  function StepEvidence({ flow }) {
    const language = isEnglish() ? 'en' : 'zh'
    const steps = Array.isArray(flow?.steps) ? flow.steps : []
    const heading = (key) => localized(STEP_EVIDENCE_HEADINGS[key].zh, STEP_EVIDENCE_HEADINGS[key].en)

    if (steps.length === 0) {
      return h('section', { className: 'st-steps' },
        h('div', { className: 'st-framework-head' },
          h('h3', null, localized('步骤证据', 'Step evidence')),
          h('p', { className: 'st-framework-note' }, raw(localized(STEP_EVIDENCE_NOTE.zh, STEP_EVIDENCE_NOTE.en)))),
        h('p', { className: 'st-framework-empty' }, raw(localized('没有声明步骤，也就没有步骤证据。', 'No declared steps, so no step evidence.'))))
    }

    return h('section', { className: 'st-steps' },
      h('div', { className: 'st-framework-head' },
        h('div', { className: 'st-framework-title-row' },
          h('h3', null, localized('步骤证据', 'Step evidence')),
          h('span', { className: 'st-framework-count' }, raw(localized(`${steps.length} 步`, `${steps.length} steps`)))),
        h('p', { className: 'st-framework-note' }, raw(localized(STEP_EVIDENCE_NOTE.zh, STEP_EVIDENCE_NOTE.en)))),
      h('ol', { className: 'st-steps-list' },
        ...steps.map((step) => {
          const item = step?.evidence ?? {}
          const references = Array.isArray(item.runtimeEvidence) ? item.runtimeEvidence : []
          const nodes = Array.isArray(item.observedNodeIds) ? item.observedNodeIds.length : 0
          const evidenceIds = Array.isArray(item.evidenceIds) ? item.evidenceIds.length : 0
          const capabilities = Array.isArray(item.matchedCapabilities) ? item.matchedCapabilities : []
          const hasAny = references.length + nodes + evidenceIds + capabilities.length > 0
          const rows = [
            references.length ? [heading('runtimeEvidence'), references.map((entry) => [entry?.type, entry?.category].filter(Boolean).join(' · ')).join('，')] : null,
            nodes ? [heading('observedNodes'), String(nodes)] : null,
            evidenceIds ? [heading('evidenceIds'), String(evidenceIds)] : null,
            capabilities.length ? [heading('matchedCapabilities'), capabilities.map((kind) => flowKindLabel(kind, language)).join(' · ')] : null,
            [heading('modelIntent'), item.modelIntent?.present === true ? heading('present') : heading('absent')],
            [heading('matchCount'), String(item.matchCount ?? 0)],
          ].filter(Boolean)
          return h('li', {
            key: step?.id,
            className: 'st-steps-item',
            'data-state': flowEvidenceState(item.relationship).tone,
          },
            h('div', { className: 'st-steps-head' },
              h('span', { className: 'st-framework-num' }, raw(String(step?.order ?? '').padStart(2, '0'))),
              h('span', { className: 'st-steps-title' }, raw(step?.title ?? '')),
              h('span', { className: 'st-framework-kind' }, raw(flowKindLabel(step?.kind, language))),
              h('span', { className: 'st-framework-state' }, raw(flowEvidenceLabel(item.relationship, language)))),
            // 没有东西可展示时不再写「相关运行证据：没有可展示的证据引用」—— 那等于先立一个
            // 名头再当场收回，读起来像这一行出了故障。空就是一句话。
            hasAny
              ? h('dl', { className: 'st-steps-rows' },
                ...rows.map(([label, value]) => [
                  h('dt', { key: `${label}-t` }, raw(label)),
                  h('dd', { key: `${label}-d` }, raw(value)),
                ]).flat())
              : h('p', { className: 'st-steps-none' }, raw(heading('none'))))
        })))
  }

  /**
   * v0.7 §七–§二十：复刻 Skill。
   *
   * 这是详情页**唯一**的对象级动作 —— 不是编辑、不是创建、不是优化。产品目标是
   * 「从一个现有 Skill 生成一个独立副本」，所以动词只能是「复刻」。
   *
   * 三条不许破的纪律：
   *   1. 源 Skill 一个字节都不动（宿主复刻完还会重新读一遍源文件回证）。
   *   2. 目标名冲突默认拒绝 —— 没有"覆盖确认"这条捷径。
   *   3. 成功态来自宿主的回执（写入 + 回读 + 目录发现），不是"按钮点下去了"。
   */
  function SkillCloneDialog({ sessionId, skillName, sourceSha256, definitionAvailable, onClose, clone: suppliedResult, targetName: suppliedTargetName }) {
    // `clone` / `targetName` 是与 `InstalledSkillsPage` 的 `installed`、`CurrentSkillPage` 的
    // `list` 同一种注入缝：渲染烟测的 React 桩不会执行 `useEffect`、也不会更新 `useState`，
    // 所以"名字不合法"与"宿主回执之后"这两条分支只有注得进去才渲染得出来。
    //
    // `sessionId` 是**宿主必需**的字段（`handleClone` 用它解析 registry 与 cwd）。
    // 它此前没有被传进来，于是这个按钮从 v0.7 起每一次都只换回一句 `sessionId 必填`。
    const [openTarget, setOpenTarget] = React.useState(() => suppliedTargetName ?? cloneTargetName(skillName))
    const [scope, setScope] = React.useState('project')
    const [mode, setMode] = React.useState('bundle')
    const [phase, setPhase] = React.useState(suppliedResult ? 'done' : 'form')
    const [result, setResult] = React.useState(suppliedResult ?? null)
    const [failure, setFailure] = React.useState(null)
    const [copied, setCopied] = React.useState(false)

    const nameProblem = !openTarget
      ? localized('请填写 Skill 名称。', 'Enter a Skill name.')
      : !isSkillName(openTarget)
        ? localized('名称只能用小写字母、数字和连字符，且以字母或数字开头。', 'Use lowercase letters, digits and hyphens only, starting with a letter or digit.')
        : openTarget === skillName
          ? localized('目标名称与源 Skill 相同，请换一个。', 'The target name is the same as the source; pick another.')
          : ''
    const canSubmit = !nameProblem && definitionAvailable && !!sourceSha256

    const submit = () => {
      if (!canSubmit || phase === 'saving') return
      setPhase('saving')
      setFailure(null)
      api('/clone', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          sourceSkillName: skillName,
          sourceSha256,
          targetSkillName: openTarget,
          targetScope: scope,
          cloneMode: mode,
        }),
      })
        .then((body) => { setResult(body); setPhase('done') })
        .catch((reason) => { setFailure(String(reason?.message || 'clone-failed')); setPhase('form') })
    }

    const copyInvocation = () => {
      const text = `/${result?.skillName || openTarget}`
      const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600) }
      // 只复制文本：绝不往输入框注入命令、绝不发消息、绝不触发 Agent（§十九）。
      if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {})
    }

    const field = (label, body) => h('div', { className: 'st-clone-field' }, h('span', { className: 'st-clone-label' }, raw(label)), body)

    const radio = (group, value, label, checked, onPick) => h('label', { className: 'st-clone-radio', 'data-group': group, 'data-value': value },
      h('input', { type: 'radio', name: group, value, checked, onChange: () => onPick(value) }),
      h('span', null, raw(label)))

    const header = h('header', { className: 'st-clone-head' },
      h('h2', null, localized('复刻 Skill', 'Clone Skill')),
      h('p', { className: 'st-clone-sub' }, raw(phase === 'done'
        ? localized(`已从 ${skillName} 复刻出一个新 Skill。`, `A new Skill was cloned from ${skillName}.`)
        : localized(`从 ${skillName} 创建一个新的 Skill`, `Create a new Skill from ${skillName}`))))

    const form = h('div', { className: 'st-clone-body' },
      field(localized('Skill 名称', 'Skill name'),
        h('input', {
          className: 'st-clone-input',
          type: 'text',
          value: openTarget,
          spellCheck: false,
          'data-role': 'clone-target-name',
          onChange: (event) => setOpenTarget(String(event.target.value || '').trim().toLowerCase()),
        })),
      field(localized('保存范围', 'Where to save'),
        h('div', { className: 'st-clone-radios' },
          radio('scope', 'project', localized('当前项目', 'This project'), scope === 'project', setScope),
          radio('scope', 'user', localized('我的 Skill', 'My Skills'), scope === 'user', setScope))),
      field(localized('复刻内容', 'What to copy'),
        h('div', { className: 'st-clone-radios' },
          radio('mode', 'bundle', localized('完整 Skill', 'The whole Skill'), mode === 'bundle', setMode),
          radio('mode', 'skill-md', localized('仅 SKILL.md', 'SKILL.md only'), mode === 'skill-md', setMode))),
      h('dl', { className: 'st-clone-facts' },
        h('dt', null, localized('来源', 'Source')), h('dd', null, raw(skillName)),
        h('dt', null, localized('当前版本', 'Current version')), h('dd', null, h('code', null, raw(shortHash(sourceSha256) || localized('不可用', 'unavailable'))))),
      // 名字不合法就**当场**说，而不是让用户点下去再被宿主退回（§十四）。
      nameProblem ? h('p', { className: 'st-clone-error', 'data-role': 'clone-name-error' }, raw(nameProblem)) : null,
      failure ? h('p', { className: 'st-clone-error', 'data-role': 'clone-error' }, raw(failure)) : null,
      h('div', { className: 'st-clone-actions' },
        h('button', { className: 'st-clone-cancel', type: 'button', onClick: onClose }, localized('取消', 'Cancel')),
        h('button', {
          className: 'st-translate st-clone-submit',
          type: 'button',
          disabled: !canSubmit || phase === 'saving',
          onClick: submit,
        }, raw(phase === 'saving' ? localized('正在复刻…', 'Cloning…') : localized('复刻 Skill', 'Clone Skill')))))

    const limitations = (Array.isArray(result?.limitations) ? result.limitations : [])
      .filter((item) => !CLONE_LIMITATION_RESTATED.includes(item))
    const cloneFileCount = Number(result?.fileCount) || 0
    const cloneSkipped = Number(result?.skippedCount) || 0
    // 「完整 Skill（42 个文件）」在一个 473 个文件的 Skill 上是一句假话 —— 用户要的是
    // 完整的，我们只拷进去了一部分，就必须在同一行里说出来，而不是塞进下面的小字列表。
    const copiedLine = result?.mode !== 'bundle'
      ? localized('复刻内容：仅 SKILL.md', 'Copied: SKILL.md only')
      : result?.truncated === true
        ? localized(
          `复刻内容：完整 Skill 没有拷全（已复制 ${cloneFileCount} 个文件，${cloneSkipped} 个超过单次复刻上限）`,
          `Copied: the whole Skill, but not in full (${cloneFileCount} file(s) copied, ${cloneSkipped} over the per-clone limit)`,
        )
        : localized(`复刻内容：完整 Skill（${cloneFileCount} 个文件）`, `Copied: the whole Skill (${cloneFileCount} file(s))`)
    // 目录有没有刷新是**观察到的事实**，不是承诺：轮询到就说发现，没轮询到就直说待确认（§十八）。
    const discoveryLine = result?.discovered === true
      ? localized('✓ Skill 目录已更新，当前 Agent 可以使用该 Skill。', '✓ The Skill catalog is updated; the current Agent can use this Skill.')
      : localized('Skill 已写入 Skill 目录，目录刷新状态待确认。重启 DeepSeek Harness 后一定可见。', 'The Skill is written to the Skills directory; whether the catalog has refreshed is not confirmed. It will be visible after restarting DeepSeek Harness.')

    const done = h('div', { className: 'st-clone-body' },
      h('p', { className: 'st-clone-done', 'data-role': 'clone-done' }, raw(localized('✓ Skill 已创建', '✓ Skill created'))),
      h('p', { className: 'st-clone-name' }, h('code', null, raw(result?.skillName ?? openTarget))),
      h('p', { className: 'st-clone-note' }, raw(result?.scope === 'user'
        ? localized('已写入我的 Skill', 'Written to My Skills')
        : localized('已写入当前项目 Skill', 'Written to this project\u2019s Skills'))),
      h('p', { className: 'st-clone-note', 'data-role': 'clone-copied', 'data-truncated': result?.truncated === true ? 'yes' : 'no' }, raw(copiedLine)),
      h('p', { className: 'st-clone-note' }, raw(discoveryLine)),
      result?.sourceUnchanged === true
        ? h('p', { className: 'st-clone-note' }, raw(localized('源 Skill 未被修改。', 'The source Skill was not modified.')))
        : h('p', { className: 'st-clone-error' }, raw(localized('无法确认源 Skill 是否被改动，请自行核对。', 'Could not confirm whether the source Skill changed; please check it yourself.'))),
      limitations.length
        ? h('ul', { className: 'st-clone-limits' }, ...limitations.map((item) => h('li', { key: item }, raw(limitationLabel(item)))))
        : null,
      field(localized('调用方式', 'Invocation'),
        h('div', { className: 'st-clone-invoke' },
          h('code', null, raw(result?.invocation || `/${openTarget}`)),
          h('button', { className: 'st-clone-copy', type: 'button', 'data-role': 'clone-copy', onClick: copyInvocation },
            raw(copied ? localized('已复制', 'Copied') : localized('复制', 'Copy'))))),
      h('div', { className: 'st-clone-actions' },
        h('button', { className: 'st-clone-cancel', type: 'button', onClick: onClose }, localized('关闭', 'Close'))))

    return h('div', { className: 'st-clone-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': localized('复刻 Skill', 'Clone Skill') },
      h('div', { className: 'st-clone-dialog', 'data-phase': phase }, header, phase === 'done' ? done : form))
  }

  const DIFF_TABS = Object.freeze([
    ['structure', '结构', 'Structure'],
    ['content', '内容', 'Content'],
    ['resources', '资源', 'Resources'],
  ])

  // 差异只许说事实（FR-EVO-014）。这四加一个是**闭集**：宿主回的 `status` 一定在这几个里，
  // 界面不许自己再发明一个「已优化」「更合理」之类的说法。
  const DIFF_WORD_TEXT = Object.freeze({
    added: ['新增', 'Added'],
    removed: ['删除', 'Removed'],
    modified: ['修改', 'Modified'],
    unchanged: ['保持不变', 'Unchanged'],
    unavailable: ['无法比较', 'Cannot be compared'],
  })

  function diffWord(kind) {
    const known = DIFF_WORD_TEXT[kind]
    return known ? localized(known[0], known[1]) : localized('无法比较', 'Cannot be compared')
  }

  /**
   * 「来源现在变了吗」只有三句话，全部来自响应里的事实（`FR-EVO-010`）。
   *
   * 三态是这一层的全部意义：`changed === true` 是「变了」，`false` 是「没变」，
   * `null` 是「没有可比的原始指纹」—— 后者既不是变了也不是没变，说成任何一个是编造。
   */
  function diffSourceState(source) {
    if (!source || source.available !== true) {
      return { text: localized('无法读取来源', 'The source cannot be read'), mark: 'unknown' }
    }
    if (source.changed === true) {
      return { text: localized('来源内容已发生变化', 'The source content has changed'), mark: 'yes' }
    }
    if (source.changed === false) {
      return { text: localized('来源内容未发生变化', 'The source content has not changed'), mark: 'no' }
    }
    return { text: localized('无法比较', 'Cannot be compared'), mark: 'unknown' }
  }

  /**
   * 演进卡那一行只许有四种来源，而第四种最容易被漏掉：**还没听到回音**。
   *
   * 详情页要先读 `/skill` 拿到血缘，再拿血缘里的 `lineageId` 去问 `/diff` —— 中间那一段
   * `comparison.source` 还不存在。`!source` 落进 `diffSourceState` 的第一格，于是卡片会在
   * **每一次**打开副本详情页时先说一句「无法读取来源」，再自己改口。那不是装饰性闪烁：
   * 「读不到」是宿主观测到的事实，「还没问」是客户端自己的状态，把后者渲染成前者，等于
   * 替宿主宣布了一个它从没说过的话（§6.11 —— 这条规则在本文件里的第四次出现）。
   *
   * 失败也另算一格：请求失败时我们确实没读到来源，但那句人话得说成「读取失败」，
   * 而不是「无法读取来源」——后者听起来像宿主检查过了。
   */
  function evolutionSourceState(source, diffPhase) {
    if (diffPhase === 'error') {
      return { text: localized('读取来源失败', 'Reading the source failed'), mark: 'unknown' }
    }
    if (diffPhase !== 'ready') {
      return { text: localized('正在读取来源…', 'Reading the source…'), mark: 'pending' }
    }
    return diffSourceState(source)
  }

  /**
   * v0.8 详情页左栏的「Skill 演进」块。
   *
   * 一行事实，不是时间线（`design.md` §24.4）：我是谁 / 我从谁来 / 来源现在变了吗。
   * 没有血缘就直说没有血缘 —— 手动复制与用户自建在事实上是同一件事：
   * **本插件没有执行过这次复刻**（`FR-EVO-001`）。所以这里既不猜，也不给一个禁用的按钮。
   *
   * 但「没有血缘」有两种成因，`null` 与「读不到」必须分开说（§6.11）：宿主把插件读进内存之后
   * 不会自动换代码，所以「客户端已经是新版、宿主还是 v0.7」是插件升级的正常路径（§6.2 / 附录 B）。
   * 那时详情响应里**根本没有 `lineage` 这个键**——把这种情况渲染成「不是由本插件复刻出来的」，
   * 等于对着一个真的复刻过的 Skill 说假话。
   */
  function SkillEvolution({ skillName, lineage, source, diffPhase, onOpenDiff, openRef, onOpenModify, modifyOpenRef, lineageFieldMissing }) {
    const head = h('h3', null, localized('Skill 演进', 'Skill Evolution'))
    // v0.9.1：「修改 Skill」与「查看差异」并排。两个分支都要有它 —— 没有血缘的 Skill
    // （自己手写的、手动拷进来的）同样可以被修改，血缘只决定「有没有来源可比」。
    const modifyButton = h('button', {
      className: 'st-evo-open st-evo-modify',
      type: 'button',
      ref: modifyOpenRef,
      'data-role': 'modify-open',
      onClick: onOpenModify,
    }, raw(localized('修改 Skill', 'Modify this Skill')))
    if (!lineage) {
      return h('section', { className: 'st-detail-card', 'data-role': 'skill-evolution' },
        head,
        h('p', { className: 'st-evo-note', 'data-role': 'evolution-note' }, raw(lineageFieldMissing
          ? localized(
            '这次详情响应里没有血缘字段。宿主可能还没换到这一版的代码，重启 DSH 后再试。',
            'This detail response has no lineage field. The host may still be running an older version — restart DSH and try again.',
          )
          : localized(
            '这个 Skill 不是由本插件复刻出来的。',
            'This Skill was not cloned by this plugin.',
          ))),
        h('div', { className: 'st-evo-actions' }, modifyButton))
    }
    const sourceState = evolutionSourceState(source, diffPhase)
    return h('section', { className: 'st-detail-card', 'data-role': 'skill-evolution' },
      head,
      h('dl', { className: 'st-evo-facts' },
        h('dt', null, localized('当前 Skill', 'Current Skill')),
        h('dd', null, h('code', null, raw(skillName))),
        h('dt', null, localized('来源 Skill', 'Source Skill')),
        h('dd', null, h('code', null, raw(lineage.sourceSkillName))),
        h('dt', null, localized('复刻来源指纹', 'Cloned from fingerprint')),
        h('dd', null, h('code', null, raw(shortHash(lineage.sourceSourceSha256) || '—'))),
        h('dt', null, localized('当前来源指纹', 'Source fingerprint now')),
        h('dd', null, h('code', null, raw(shortHash(source?.currentSha256) || '—')))),
      h('p', { className: 'st-evo-state', 'data-role': 'evolution-source-state', 'data-changed': sourceState.mark }, raw(sourceState.text)),
      h('div', { className: 'st-evo-actions' },
        h('button', {
          className: 'st-evo-open',
          type: 'button',
          ref: openRef,
          'data-role': 'diff-open',
          onClick: onOpenDiff,
        }, raw(localized('查看差异', 'View differences'))),
        modifyButton))
  }

  /**
   * v0.9.0 的三态说法。逐字给常量，不拼接 —— 这一层不许自己长出新词（没有分数、没有「优秀」）。
   */
  const validationStatusText = (status) => {
    if (status === 'pass') return localized('通过', 'Pass')
    if (status === 'needs-fix') return localized('需要修正', 'Needs fixes')
    return localized('无法判断', 'Not determinable')
  }
  const validationSeverityText = (severity) => {
    if (severity === 'error') return localized('错误', 'Error')
    if (severity === 'warning') return localized('警告', 'Warning')
    if (severity === 'info') return localized('信息', 'Info')
    return severity
  }
  /**
   * 「这条规则这次为什么没有判定」的人话。
   *
   * 理由码由 `src/core/skill-validation.mjs` 给出，界面只负责翻译。这一层存在的全部理由是：
   * **「这次没查」不许渲染成「通过」**。「拿不到目录清单」和「引用的文件都在」在屏幕上必须是
   * 两句不同的话，否则用户会把一次没做的检查读成一次通过的检查。
   */
  const validationSkipText = (reason) => {
    if (reason === 'no-directory-listing') return localized('拿不到这个 Skill 的目录清单，无法判断引用的文件在不在。', 'The Skill directory listing is not available, so referenced files cannot be checked.')
    if (reason === 'no-directory-name') return localized('没能定位到这个 Skill 的目录。', 'The Skill directory could not be located.')
    if (reason === 'body-truncated') return localized('正文太长，这次只读了一部分。', 'The body was too long and only part of it was read.')
    if (reason === 'compatibility-absent') return localized('这份 SKILL.md 没有 compatibility 字段。', 'This SKILL.md has no compatibility field.')
    if (reason === 'optional-field-absent') return localized('标准把这个字段列为可选，这份 SKILL.md 没有写它。', 'The standard marks this field optional and this SKILL.md omits it.')
    if (reason === 'name-missing') return localized('没有读到 name 字段。', 'No name field was read.')
    if (reason === 'definition-unavailable') return localized('现在读不到这个 Skill 的 SKILL.md。', 'The SKILL.md could not be read now.')
    if (reason === 'no-evaluator') return localized('这条规则还没有判定函数。', 'This rule has no evaluator yet.')
    return reason
  }

  /**
   * v0.9.0 详情页的「Skill 验收」块。
   *
   * 它回答的是一组**可以机械判定的事实**：有没有 name 和 description、name 符不符合目标平台的
   * 命名规则、正文引用的文件在不在、有没有观测到凭据模式。它不回答「这份 Skill 好不好」——
   * 没有分数、没有排名、没有「优秀」。
   *
   * 三态只有一个来源：`status` 由宿主的确定性验收器算好（只有违反 error 规则才是 needs-fix，
   * `warnings > 0` 不算）。界面**不重新判断**，也不把「判不了」画成「通过」：没判定的规则单独
   * 列出来并写明理由。`role="status"` 给状态，错误态给 `role="alert"`。
   */
  function SkillValidationPanel({ validation, validationFieldMissing }) {
    const head = h('h3', null, localized('Skill 验收', 'Skill validation'))
    if (!validation) {
      return h('section', { className: 'st-detail-card', 'data-role': 'skill-validation' },
        head,
        h('p', { className: 'st-validation-note', role: 'alert', 'data-role': 'validation-unavailable' }, raw(
          validationFieldMissing
            ? localized(
              '这次详情响应里没有验收结果。宿主可能还没换到这一版的代码，重启 DSH 后再试。',
              'This detail response has no validation result. The host may still be running an older version — restart DSH and try again.',
            )
            : localized(
              '现在读不到这个 Skill 的 SKILL.md，因此无法判断它是否符合规范。',
              'The SKILL.md could not be read now, so it cannot be checked against the specification.',
            ),
        )))
    }

    const summary = validation.summary ?? {}
    const profiles = Array.isArray(validation.profiles) ? validation.profiles : []
    const findings = Array.isArray(validation.findings) ? validation.findings : []
    const rules = Array.isArray(validation.rules) ? validation.rules : []
    const skipped = Array.isArray(validation.skipped) ? validation.skipped : []
    const notes = Array.isArray(validation.notes) ? validation.notes : []
    const limitations = Array.isArray(validation.limitations) ? validation.limitations : []
    const ruleTitle = (id) => rules.find((rule) => rule.id === id)?.title ?? id

    return h('section', { className: 'st-detail-card st-validation', 'data-role': 'skill-validation' },
      h('div', { className: 'st-validation-top' }, head,
        h('span', {
          className: 'st-validation-badge',
          role: 'status',
          'data-role': 'validation-status',
          'data-status': validation.status ?? 'unknown',
        }, raw(validationStatusText(validation.status)))),
      h('p', { className: 'st-validation-counts', 'data-role': 'validation-summary' }, raw(localized(
        `错误 ${summary.errors ?? 0} · 警告 ${summary.warnings ?? 0} · 信息 ${summary.info ?? 0} · 未判定 ${summary.skipped ?? 0}`,
        `${summary.errors ?? 0} errors · ${summary.warnings ?? 0} warnings · ${summary.info ?? 0} info · ${summary.skipped ?? 0} not checked`,
      ))),
      h('ul', { className: 'st-validation-profiles', 'data-role': 'validation-profiles' },
        // v1.1：Profile 汇总按**两层**渲染 —— 标准合规与平台兼容。
        //
        // 这不是排版问题。`common` / `standard` 说的是「开放标准本身要求什么」；
        // `dsh` / `openai` / `anthropic` / `microsoft` 说的是「这一家能不能装载、好不好用」。
        // 把两者混在一列里，会让「OpenAI 只读两个字段」读起来像是标准违规，
        // 也会让「DSH 能加载」看起来像是标准通过了（§五、§六）。
        ...VALIDATION_PROFILE_KINDS.flatMap(([kind, zhKind, enKind]) => {
          const mine = profiles.filter((profile) => (profile.kind ?? 'platform') === kind)
          if (mine.length === 0) return []
          return [
            h('li', {
              key: `kind-${kind}`,
              className: 'st-validation-kind',
              'data-role': `validation-kind-${kind}`,
              'data-kind': kind,
            }, raw(localized(zhKind, enKind))),
            ...mine.map((profile) => h('li', {
              key: profile.id,
              className: 'st-validation-profile',
              'data-role': `validation-profile-${profile.id}`,
              'data-kind': profile.kind ?? 'platform',
              'data-status': profile.status,
            },
            // `profile.label` 是核心模块给的双语对象（`{zh, en}`），不是字符串：
            // 直接当 children 交给 React 会抛 #31（Objects are not valid as a React child），
            // 而 `conversation.view` 没有错误边界，整页会白屏 —— 这一步必须显式选语言。
            h('code', null, raw(localized(profile.label?.zh ?? profile.id, profile.label?.en ?? profile.id))),
            h('span', { className: 'st-validation-profile-state' }, raw(validationStatusText(profile.status))),
            h('span', { className: 'st-validation-profile-counts' }, raw(localized(
              `错误 ${profile.errors ?? 0} · 警告 ${profile.warnings ?? 0} · 信息 ${profile.info ?? 0}`,
              `${profile.errors ?? 0} errors · ${profile.warnings ?? 0} warnings · ${profile.info ?? 0} info`,
            ))))),
          ]
        })),
      findings.length > 0
        ? h('ul', { className: 'st-validation-findings', 'data-role': 'validation-findings' },
          ...findings.map((finding, index) => h('li', {
            key: `${finding.id}-${index}`,
            className: 'st-validation-finding',
            'data-role': 'validation-finding',
            'data-severity': finding.severity,
            // v1.1 §七：每条结论都要能追到出处。`standard` / `platform` 分开，
            // 这样「这条是开放标准说的」和「这条是某家平台说的」在 DOM 里就能分辨。
            'data-source': finding.source ?? '',
            'data-source-kind': finding.sourceKind ?? 'platform',
          },
          h('div', { className: 'st-validation-finding-head' },
            h('code', null, raw(finding.id)),
            h('span', { className: 'st-validation-finding-title' }, raw(ruleTitle(finding.id))),
            h('span', { className: 'st-validation-severity' }, raw(validationSeverityText(finding.severity)))),
          h('p', { className: 'st-validation-detail' }, raw(finding.detail)),
          // Rule Provenance：规则 id 在上面，这里是「来源」与「说明」。
          // 来源是静态 metadata（agentskills.io 规范 / DSH 装载源码 / 三家平台文档），
          // 运行时不联网读取标准文档。
          h('p', {
            className: 'st-validation-provenance',
            'data-role': 'validation-provenance',
            title: finding.sourceReference || undefined,
          }, raw(localized(
            `来源：${finding.sourceLabel || finding.source || '—'} · ${finding.sourceKind === 'standard' ? '标准合规' : '平台兼容'}`,
            `Source: ${finding.sourceLabel || finding.source || '—'} · ${finding.sourceKind === 'standard' ? 'standard compliance' : 'platform compatibility'}`,
          ))),
          finding.note
            ? h('p', { className: 'st-validation-rule-note', 'data-role': 'validation-rule-note' }, raw(finding.note))
            : null)))
        : null,
      skipped.length > 0
        ? h('div', { className: 'st-validation-skipped', 'data-role': 'validation-skipped' },
          h('h4', null, localized('这次没有判定', 'Not checked this time')),
          h('ul', null, ...skipped.map((entry, index) => h('li', {
            key: `${entry.id}-${index}`,
            'data-role': 'validation-skipped-rule',
          },
          h('code', null, raw(entry.id)),
          h('span', null, raw(` ${ruleTitle(entry.id)} —— ${validationSkipText(entry.reason)}`))))))
        : null,
      notes.length > 0
        ? h('ul', { className: 'st-validation-notes', 'data-role': 'validation-notes' },
          ...notes.map((note, index) => h('li', { key: `note-${index}` }, raw(note))))
        : null,
      limitations.length > 0
        ? h('details', { className: 'st-validation-limits', 'data-role': 'validation-limitations' },
          h('summary', null, localized('这次验收查了什么、没查什么', 'What this check covers and what it does not')),
          h('ul', null, ...limitations.map((line, index) => h('li', { key: `limit-${index}` }, raw(line)))))
        : null)
  }

  /**
   * v0.9.1 的修改范围与验收目标。
   *
   * 这两张表**不能**从 `src/core/skill-modification.mjs` import 进来：§6.6 只允许客户端 require
   * 七支 core 模块，而界面这一层要的本来就只是 id 与文案。风险是两边漂移，所以由守卫
   * `SKILL_MODIFICATION_OK` 拿核心模块的 `MODIFICATION_SCOPE_IDS` / `MODIFICATION_LOCKED_SCOPE_IDS`
   * / `SKILL_PROFILE_IDS` 逐字对账：界面少一项、把锁死的那两项放开，都会红。
   *
   * 锁死的两项**画出来但不可点**（`data-locked="true"`）：用户看得见「这里有 scripts/，
   * 但这一版不让我改」，比看不见它更诚实。
   */
  const MODIFY_SCOPES = [
    ['skill-md-rules', 'SKILL.md / Rules', 'SKILL.md / Rules'],
    ['skill-md-workflow', 'SKILL.md / Workflow', 'SKILL.md / Workflow'],
    ['skill-md-description', 'SKILL.md / Description', 'SKILL.md / Description'],
    ['references', 'references', 'references'],
  ]
  const MODIFY_LOCKED_SCOPES = [
    ['scripts', 'scripts', 'scripts'],
    ['assets', 'assets', 'assets'],
  ]
  const MODIFY_PROFILES = [
    // v1.1：开放标准层排在平台之前。它是「这份 SKILL.md 符不符合 Agent Skills 开放标准」，
    // 与某一家平台能不能装载是两回事，所以它自己坐一格，不是四家平台的合集。
    ['standard', 'Agent Skills Standard', 'Agent Skills Standard'],
    ['dsh', 'DSH', 'DSH'],
    ['microsoft', 'Microsoft', 'Microsoft'],
    ['openai', 'OpenAI', 'OpenAI'],
    ['anthropic', 'Anthropic', 'Anthropic'],
  ]

  /**
   * 两层 Profile：标准合规 / 平台兼容。
   *
   * 这两行**必须**与 `src/core/skill-profiles.mjs` 的 `SKILL_PROFILE_KIND_LABELS` 一致，
   * 客户端不能 import 那一支（§6.6 只放行九支 core 模块），所以由守卫
   * `SKILL_STANDARD_ALIGNMENT_OK` 逐字对账 —— 少一行、把平台那行说成标准，都会红。
   *
   * 它存在的理由不是排版：`platform` 那一组里的每一条都是「某家平台说」，界面不能把
   * 「OpenAI 不读这个字段」讲成「开放标准被违反了」。
   */
  const VALIDATION_PROFILE_KINDS = [
    ['standard', '标准合规', 'Standard compliance'],
    ['platform', '平台兼容', 'Platform compatibility'],
  ]

  /**
   * v1.1 详情级导航：Skill Detail 的第二层导航。
   *
   * 它承担的是「我想从哪个维度理解这个 Skill」，与一级导航（本次 Skill / 已安装 Skill，
   * 承担「我要看哪个 Skill」）不是一回事。**没有新增页面、没有新增一级导航、没有新增路由**：
   * 这八项全是 V1.0 已经渲染在同一个长页面里的块，这里只是把它们改成按需切换。
   *
   * 顺序即界面顺序。`framework` 是默认项 —— 理解一个 Skill 从「它由什么组成」开始。
   * `hint` 是按钮的 `title`，也是这一项的口径声明。
   */
  const DETAIL_MODULES = [
    ['framework', 'Skill 框架', 'Skill framework', '这个 Skill 由什么组成：Purpose / Trigger / Rules / Output，以及声明流程。它来自 SKILL.md 的结构化解析，不是运行流程。'],
    ['evidence-model', 'Skill 证据', 'Skill evidence', 'V1.2：每个结论的性质、对象、版本、条件与限制。Declared / Observed / Unavailable 三态，外加 Definition → Load → Use → Outcome 四段证据链与证据边界。'],
    ['validation', 'Skill 验收', 'Skill validation', '静态合规判定：标准合规（Agent Skills Open Standard）与平台兼容（DSH / OpenAI / Anthropic / Microsoft）分开列出，只报事实，不给分。'],
    ['evaluation', 'Skill 评测', 'Skill evaluation', '同一个 Case、条件逐项提出、逐条对照：不给分、不排序、不画趋势。'],
    ['evidence', '步骤证据', 'Step evidence', '每个声明步骤各自观察到了什么。Loading ≠ Use，Use ≠ Outcome，Outcome ≠ Skill 导致的。'],
    ['runtime', '本次运行逻辑', 'Runtime logic this run', '这次会话里观察到的运行逻辑与对齐结论。'],
    ['modification', '本次修改对比', 'This change', '本次修改范围、对比与实例验收。没有修改事务时这一维不出现。'],
    ['definition', 'Definition', 'Definition', '文件、当前指纹、本次使用、定义来源、repository 与血缘。'],
    ['document', 'SKILL.md', 'SKILL.md', '原始文档与中文阅读版。只读展示，原文不会被修改。'],
  ]

  /**
   * v1.1 详情级导航本体。
   *
   * 它只做一件事：把「当前在看哪个维度」告诉用户，并在点击时切换右侧内容。
   * 点击后**不滚动**、不锚跳 —— 右侧直接换成那一块（§三：不应该要求用户向下滚几百像素）。
   *
   * `aria-current` 而不是只有 `data-active`：这排按钮在语义上就是当前位置，屏幕阅读器
   * 需要能读出来；只看颜色的话，高对比度模式下这个区别会消失。
   *
   * `modules` 允许调用方收窄可选维度。今天只有一维会缺席：**没有修改事务时，「本次修改对比」
   * 整块不渲染**（§9.2 —— 常驻的空卡会被读成一种状态），既然那一屏没有内容，导航里也不该
   * 留一格点进去看空。默认仍然是全部维度。
   */
  function DetailNav({ active, onSelect, modules }) {
    const items = Array.isArray(modules) && modules.length > 0 ? modules : DETAIL_MODULES
    return h('nav', {
      className: 'st-detail-nav',
      'data-role': 'detail-nav',
      'aria-label': localized('Skill 详情导航', 'Skill detail navigation'),
    },
    h('h3', { className: 'st-detail-nav-title' }, localized('详情', 'Detail')),
    h('ul', { className: 'st-detail-nav-list' },
      ...items.map(([id, zh, en, hint]) => h('li', { key: id },
        h('button', {
          key: id,
          type: 'button',
          className: 'st-detail-nav-item',
          'data-role': `detail-nav-${id}`,
          'data-module': id,
          'data-active': active === id ? 'true' : 'false',
          // `page` 而不是 `true`：这一项代表的就是**当前这一屏**，`page` 是它的准确说法；
          // 只说 `true` 的话，读屏软件会念成「当前项」，但不会说清当前项就是这一页。
          'aria-current': active === id ? 'page' : undefined,
          title: hint,
          onClick: () => onSelect(id),
        }, raw(localized(zh, en)))))))
  }

  /** 范围 id → 界面上的说法。认不出来就原样显示，不猜。 */
  const modifyScopeText = (id) => {
    const entry = [...MODIFY_SCOPES, ...MODIFY_LOCKED_SCOPES].find(([scopeId]) => scopeId === id)
    return entry ? localized(entry[1], entry[2]) : String(id ?? '')
  }

  /**
   * 实例验收的六个输入 → 界面上那句人话（规格 §18.1 的逐项）。
   *
   * 它存在的理由是那条最核心的验收标准：**生成的 Prompt 与这次修改之间的对应关系要能被看见**。
   * 所以这一段说的是「这个任务用了哪几样输入」，而不是「这个任务好不好」。
   */
  const INSTANCE_SOURCE_TEXT = {
    intent: ['用户修改意图', 'what you asked for'],
    scopeIds: ['修改范围', 'the declared scopes'],
    comparison: ['修改前后对比', 'the before/after comparison'],
    description: ['Skill 描述', 'the Skill description'],
    framework: ['框架结构', 'the parsed framework'],
    validation: ['静态验收结论', 'the static validation'],
  }
  const instanceSourceText = (id, language) => {
    const entry = INSTANCE_SOURCE_TEXT[id]
    if (!entry) return String(id ?? '')
    return language === 'en' ? entry[1] : entry[0]
  }

  /** 这一次「改前 → 改后」的三态说法。与验收一样：没有分数、没有「优秀」。 */
  const modifyDiffText = (status) => {
    if (status === 'changed') return localized('有变化', 'Changed')
    if (status === 'unchanged') return localized('没有变化', 'No change')
    return localized('无法比较', 'Not comparable')
  }

  const modifyScopeStateText = (state) => {
    if (state === 'changed') return localized('有变化', 'Changed')
    if (state === 'unchanged') return localized('没有变化', 'No change')
    return localized('无法判断', 'Not determinable')
  }

  /**
   * v0.9.1 的「修改 Skill」对话框（`FR-MOD-*`）。
   *
   * 它只做三件事：让用户写一句意图、勾一个修改范围、按一次「交给 Agent」。
   * 它**不**编辑 Markdown、不预览 diff、不解析 Agent 的方案、也**不碰任何文件** ——
   * 写文件是当前会话里的 Agent 用 DSH 原生工具做的事（见核心模块的十二条协议）。
   *
   * 「交给 Agent」这个点击**本身就是授权**：插件拿当前会话的 Agent 代发一条带协议的
   * 修改任务，而不是用户手打。焦点行为与差异面板一致（打开进面板、Tab 循环、Esc 关闭、
   * 关闭后焦点回到打开它的按钮）。
   */
  function SkillModifyDialog({ sessionId, skillName, onClose, onDispatched }) {
    // 注入缝：渲染烟测的 React 桩不跑 `useEffect`，所以对话框的默认那一帧（空意图 +
    // 默认范围）必须本身就渲染得出来，不依赖任何异步结果 —— 它是这个组件的正事。
    const [intent, setIntent] = React.useState('')
    const [scopes, setScopes] = React.useState(() => MODIFY_SCOPES.map((entry) => entry[0]))
    const [profiles, setProfiles] = React.useState(['dsh'])
    const [state, setState] = React.useState({ phase: 'idle', error: '' })
    const dialogRef = React.useRef(null)
    const intentRef = React.useRef(null)

    React.useEffect(() => {
      const target = intentRef.current
      if (target && typeof target.focus === 'function') target.focus()
    }, [])

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = dialogRef.current
      if (!root || typeof root.querySelectorAll !== 'function') return
      const nodes = root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = typeof document === 'undefined' ? null : document.activeElement
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }

    const toggle = (list, setList, id) => {
      setList(list.includes(id) ? list.filter((value) => value !== id) : [...list, id])
    }

    const submit = () => {
      if (state.phase === 'sending') return
      setState({ phase: 'sending', error: '' })
      api('/modify', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          skillName,
          action: 'begin',
          intent,
          scopes,
          // `common` 永远在里面：它是共同规范层，不是可选项（V0.9.0 的 `resolveSkillProfiles` 也是这么补的）。
          profiles: ['common', ...profiles],
        }),
      })
        .then((body) => { onDispatched(body, intent) })
        .catch((reason) => { setState({ phase: 'error', error: String(reason?.message || 'unavailable') }) })
    }

    const scopeChip = ([id, zh, en], locked) => h('button', {
      key: id,
      className: 'st-mod-chip',
      type: 'button',
      'data-role': locked ? 'modify-locked' : 'modify-scope',
      'data-scope': id,
      'data-on': !locked && scopes.includes(id) ? 'true' : 'false',
      'data-locked': locked ? 'true' : 'false',
      disabled: locked === true,
      'aria-pressed': locked ? undefined : (scopes.includes(id) ? 'true' : 'false'),
      onClick: locked ? undefined : () => toggle(scopes, setScopes, id),
    }, raw(localized(zh, en)))

    const profileChip = ([id, zh, en]) => h('button', {
      key: id,
      className: 'st-mod-chip',
      type: 'button',
      'data-role': 'modify-profile',
      'data-profile': id,
      'data-on': profiles.includes(id) ? 'true' : 'false',
      'aria-pressed': profiles.includes(id) ? 'true' : 'false',
      onClick: () => toggle(profiles, setProfiles, id),
    }, raw(localized(zh, en)))

    return h('div', {
      className: 'st-mod-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': localized('修改 Skill', 'Modify Skill'),
      onKeyDown,
    }, h('div', { className: 'st-mod-dialog', ref: dialogRef, 'data-role': 'modify-dialog' },
      h('header', { className: 'st-mod-head' },
        h('h2', null, localized('修改 Skill', 'Modify Skill')),
        h('p', { className: 'st-mod-sub', 'data-role': 'modify-subject' }, h('code', null, raw(skillName)))),
      h('label', { className: 'st-mod-label', htmlFor: 'st-modify-intent' }, raw(localized('你希望这个 Skill 怎么改？', 'How should this Skill change?'))),
      h('textarea', {
        id: 'st-modify-intent',
        className: 'st-mod-intent',
        ref: intentRef,
        rows: 4,
        'data-role': 'modify-intent',
        maxLength: 2000,
        placeholder: localized('例如：增加一条规则，要求所有渐变都在 tokens 里说明用途。', 'For example: add a rule that every gradient must be justified in tokens.'),
        value: intent,
        onChange: (event) => setIntent(String(event.target.value ?? '')),
      }),
      h('p', { className: 'st-mod-label' }, raw(localized('修改范围（会被结构化，随消息一起交给 Agent）', 'Scope (structured, sent with the message)'))),
      h('div', { className: 'st-mod-chips' },
        ...MODIFY_SCOPES.map((entry) => scopeChip(entry, false)),
        ...MODIFY_LOCKED_SCOPES.map((entry) => scopeChip(entry, true))),
      h('p', { className: 'st-mod-hint' }, raw(localized(
        '勾选的范围就是授权；没勾的就算变了也会被如实报出来。锁着的两项这一版不能授权。',
        'Checked items are what is authorised; anything else that changes is reported. The locked two cannot be authorised in this version.',
      ))),
      h('p', { className: 'st-mod-label' }, raw(localized('这次验收的目标', 'Validation targets'))),
      h('div', { className: 'st-mod-chips' },
        h('span', { className: 'st-mod-chip', 'data-role': 'modify-profile', 'data-profile': 'common', 'data-on': 'true', 'data-locked': 'true' }, raw(localized('Common Core', 'Common Core'))),
        ...MODIFY_PROFILES.map(profileChip)),
      state.phase === 'error'
        ? h('p', { className: 'st-mod-alert', role: 'alert', 'data-role': 'modify-error' }, raw(state.error))
        : null,
      h('footer', { className: 'st-mod-foot' },
        h('p', { className: 'st-mod-note' }, raw(localized('插件不会直接改文件，也不会运行 Skill 里的脚本。', 'The plugin does not edit files and does not run the Skill scripts.'))),
        h('div', { className: 'st-mod-actions' },
          h('button', { className: 'st-mod-cancel', type: 'button', 'data-role': 'modify-cancel', onClick: onClose }, raw(localized('取消', 'Cancel'))),
          h('button', {
            className: 'st-mod-submit',
            type: 'button',
            'data-role': 'modify-submit',
            disabled: state.phase === 'sending',
            onClick: submit,
          }, raw(state.phase === 'sending'
            ? localized('正在交给 Agent…', 'Handing over…')
            : localized('交给 Agent', 'Hand to the agent')))))))
  }

  /**
   * v0.9.1 的「本次修改对比」块（`FR-MOD-*`）。
   *
   * 它只说这一件事：**这次修改前后，文件里有什么不一样**。快照只活在宿主内存里，
   * 对比完就释放 —— 所以这一屏没有「历史版本」、没有时间线、也没有版本选择器。
   * 拿不到「改前」时它说「无法比较」，绝不显示一份看起来像「没有变化」的空结果。
   */
  function SkillModificationPanel({ modification, instanceTest, onCompare, onGenerateInstanceTest, onOpenModify }) {
    // hook 必须落在下面那句 idle 早退之前：早退之后再挂 hook，React 的调用顺序就会错位。
    const [instancePromptCopied, setInstancePromptCopied] = React.useState(false)
    const phase = modification?.phase ?? 'idle'
    if (phase === 'idle') return null
    const head = h('div', { className: 'st-mod-top' },
      h('h3', null, localized('本次修改对比', 'This modification')),
      phase === 'ready' && modification.comparison
        ? h('span', {
          className: 'st-validation-badge',
          role: 'status',
          'data-role': 'mod-status',
          'data-status': modification.comparison.available === false ? 'unavailable' : modification.comparison.status,
        }, raw(modifyDiffText(modification.comparison.available === false ? 'unavailable' : modification.comparison.status)))
        : null)

    if (phase === 'waiting' || phase === 'loading') {
      return h('section', { className: 'st-detail-card st-mod', 'data-role': 'skill-modification' },
        head,
        h('p', { className: 'st-mod-wait', 'data-role': 'mod-waiting' }, raw(localized(
          '修改任务已经发给当前会话的 Agent。它改完之后，点下面这个按钮对比这次修改。',
          'The task has been sent to the agent in this conversation. Once it has finished, compare this modification below.',
        ))),
        h('div', { className: 'st-mod-actions' },
          h('button', {
            className: 'st-mod-submit',
            type: 'button',
            'data-role': 'mod-compare',
            disabled: phase === 'loading',
            onClick: onCompare,
          }, raw(phase === 'loading'
            ? localized('正在读这次修改…', 'Reading this modification…')
            : localized('对比本次修改', 'Compare this modification'))),
          h('button', { className: 'st-mod-cancel', type: 'button', 'data-role': 'mod-again', onClick: onOpenModify }, raw(localized('再改一次', 'Modify again')))))
    }

    if (phase === 'error') {
      return h('section', { className: 'st-detail-card st-mod', 'data-role': 'skill-modification' },
        head,
        h('p', { className: 'st-mod-alert', role: 'alert', 'data-role': 'mod-error' }, raw(modification.error || localized('对比失败。', 'Comparison failed.'))),
        h('div', { className: 'st-mod-actions' },
          h('button', { className: 'st-mod-cancel', type: 'button', 'data-role': 'mod-again', onClick: onOpenModify }, raw(localized('再改一次', 'Modify again')))))
    }

    const comparison = modification.comparison
    if (!comparison) return null
    if (comparison.available === false) {
      return h('section', { className: 'st-detail-card st-mod', 'data-role': 'skill-modification' },
        head,
        h('p', { className: 'st-mod-alert', role: 'alert', 'data-role': 'mod-unavailable' }, raw(comparison.message || localized('本次修改前状态不可用，暂时无法比较本次修改的内容。', 'The pre-modification state is unavailable, so this modification cannot be compared.'))),
        h('ul', { className: 'st-mod-notes' },
          h('li', null, raw(localized(
            `来源 Skill：${comparison.source?.message ?? ''}`,
            `Source Skill: ${comparison.source?.message ?? ''}`,
          )))),
        h('div', { className: 'st-mod-actions' },
          h('button', { className: 'st-mod-cancel', type: 'button', 'data-role': 'mod-again', onClick: onOpenModify }, raw(localized('再改一次', 'Modify again')))))
    }

    const scopes = Array.isArray(comparison.scopes) ? comparison.scopes : []
    const outOfScope = Array.isArray(comparison.outOfScope) ? comparison.outOfScope : []
    const notes = Array.isArray(comparison.notes) ? comparison.notes : []
    const limitations = Array.isArray(comparison.limitations) ? comparison.limitations : []
    const resources = comparison.resources ?? { available: false, added: [], removed: [], modified: [] }
    const lines = comparison.lines ?? { added: 0, removed: 0, exact: true }
    const sections = comparison.sections ?? { added: [], removed: [] }

    const resourceList = (kind, paths) => (Array.isArray(paths) && paths.length
      ? h('p', { className: 'st-mod-res-line', 'data-role': 'mod-resource', 'data-kind': kind },
        raw(`${kind === 'added' ? localized('新增', 'Added') : kind === 'removed' ? localized('删除', 'Removed') : localized('修改', 'Modified')}：`),
        ...paths.map((path) => h('code', { key: path }, raw(path))))
      : null)

    // ── 实例验收（V0.10.0，`FR-INST-*`） ────────────────────────────────
    // 它只做一件事：把这次修改变成一段可以拿去真跑的真实任务。**不运行、不判定、不打分** ——
    // 规格里「没有观察到证据，不代表没有执行」那句话，就是这一屏不许多说一个字的原因。
    // 生成的 Prompt 与看结果的观察项是**两样东西**：观察项一个字都不进 Prompt（否则等于在
    // Prompt 里重新教 Agent 该做什么，测试就被我们自己污染了）。
    const instancePhase = instanceTest?.phase ?? 'idle'
    const instance = instanceTest?.test ?? null
    const language = isEnglish() ? 'en' : 'zh'
    const changedScopeLabels = scopes.filter((scope) => scope.changed).map((scope) => modifyScopeText(scope.id))
    // 「这个任务是怎么来的」：把六样输入与主范围摆在明面上 —— 规格 §21 那条最核心的验收标准
    // （Prompt 与这次修改之间的对应关系可追溯）靠的就是这一段，而不是靠一句「已针对本次修改」。
    const traceLines = []
    if (Array.isArray(instance?.trace?.sources) && instance.trace.sources.length > 0) {
      traceLines.push(localized(
        `这个任务用了这些输入：${instance.trace.sources.map((id) => instanceSourceText(id, language)).join(' · ')}。`,
        `Built from: ${instance.trace.sources.map((id) => instanceSourceText(id, 'en')).join(' · ')}.`,
      ))
    }
    if (instance?.primaryScopeId && INSTANCE_TEST_SCOPE_FOCUS[instance.primaryScopeId]) {
      traceLines.push(localized(
        `任务形状由主范围决定：${modifyScopeText(instance.primaryScopeId)}${instance.trace?.hintedScopeId ? '（你这次的意图点名了它）' : ''}。`,
        `The task shape follows the primary scope: ${modifyScopeText(instance.primaryScopeId)}.`,
      ))
    }
    const copyInstancePrompt = () => {
      const text = instance?.prompt?.text
      if (!text) return
      const done = () => { setInstancePromptCopied(true); setTimeout(() => setInstancePromptCopied(false), 1600) }
      // 只复制文本：绝不往输入框注入命令、绝不发消息、绝不触发 Agent（§十九）。
      // 实例验收把这条纪律推到最前面：V0.10.0 的第一条边界就是「不自动运行」。
      if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {})
    }
    const instanceBlock = h('div', { className: 'st-mod-instance', 'data-role': 'mod-instance' },
      h('h4', null, raw(localized('实例验收', 'Skill instance test'))),
      h('p', { className: 'st-mod-instance-hint', 'data-role': 'mod-instance-hint' }, raw(localized(
        INSTANCE_TEST_HEADLINE,
        'A task built from this specific modification, to run in a new conversation.',
      ))),
      instancePhase === 'unavailable'
        ? h('p', { className: 'st-mod-alert', role: 'alert', 'data-role': 'mod-instance-unavailable' }, raw(
          instanceTest?.message
            || localized(INSTANCE_TEST_UNAVAILABLE_MESSAGES['no-changed-scope'], 'This change did not name a scope, so there is nothing specific to verify.'),
        ))
        : instancePhase === 'ready' && instance?.available
          ? h('div', { className: 'st-mod-instance-body' },
            h('div', { className: 'st-mod-instance-goal' },
              h('h5', null, raw(localized(INSTANCE_TEST_GOAL_TITLE, 'What this verifies'))),
              h('p', { className: 'st-mod-instance-hint' }, raw(localized(
                INSTANCE_TEST_GOAL_TEXT,
                'Whether this modification changed how the Skill behaves in a real task.',
              )))),
            h('p', { className: 'st-mod-instance-scope', 'data-role': 'mod-instance-scope' }, raw(localized(
              `本次修改：${changedScopeLabels.join(' / ') || '没有点名范围'}`,
              `This modification: ${changedScopeLabels.join(' / ') || 'no declared scope'}`,
            ))),
            h('div', { className: 'st-mod-instance-prompt-block' },
              h('h5', null, raw(localized(INSTANCE_TEST_PROMPT_TITLE, 'Test prompt'))),
              h('pre', { className: 'st-mod-instance-prompt', 'data-role': 'mod-instance-prompt' }, raw(instance.prompt.text))),
            h('div', { className: 'st-mod-instance-actions' },
              h('button', {
                className: 'st-mod-submit',
                type: 'button',
                'data-role': 'mod-instance-copy',
                onClick: copyInstancePrompt,
              }, raw(instancePromptCopied
                ? localized('已复制', 'Copied')
                : localized('复制测试 Prompt', 'Copy the test prompt')))),
            h('p', { className: 'st-mod-instance-note', 'data-role': 'mod-instance-run-hint' }, raw(localized(
              '建议在新的 DSH 会话中运行，以避免当前修改对话中的上下文影响测试结果。',
              'Run it in a new DSH conversation, so this conversation does not colour the result.',
            ))),
            h('div', { className: 'st-mod-instance-observations', 'data-role': 'mod-instance-observations' },
              h('h5', null, raw(localized(INSTANCE_TEST_OBSERVATION_TITLE, 'What to look at'))),
              h('p', { className: 'st-mod-instance-note' }, raw(localized(
                INSTANCE_TEST_OBSERVATION_NOTE,
                'Not seeing it happen is not proof that it did not happen.',
              ))),
              h('ul', null, ...instance.observations.map((entry) => h('li', {
                key: entry.id,
                'data-role': 'mod-instance-observation',
                'data-id': entry.id,
              }, raw(entry.text))))),
            h('div', { className: 'st-mod-instance-regression', 'data-role': 'mod-instance-regression' },
              h('h5', null, raw(localized('回归约束', 'Regression constraints'))),
              instance.regression.available
                ? h('ul', null, ...instance.regression.constraints.map((line) => h('li', { key: line }, raw(line))))
                : h('p', { className: 'st-mod-instance-note', 'data-role': 'mod-instance-regression-unavailable' }, raw(instance.regression.unavailable.join(' ')))),
            (instance.limitations.length || traceLines.length)
              ? h('details', { className: 'st-mod-limits', 'data-role': 'mod-instance-limitations' },
                h('summary', null, raw(localized(INSTANCE_TEST_LIMITATION_NOTE, 'How this task was produced, and what it does not do'))),
                h('ul', null,
                  ...traceLines.map((line) => h('li', { key: line, 'data-role': 'mod-instance-trace' }, raw(line))),
                  ...instance.limitations.map((line) => h('li', { key: line }, raw(line)))))
              : null)
          : h('div', { className: 'st-mod-instance-actions' },
            h('button', {
              className: 'st-mod-submit',
              type: 'button',
              'data-role': 'mod-instance-generate',
              disabled: instancePhase === 'loading',
              onClick: onGenerateInstanceTest,
            }, raw(instancePhase === 'loading'
              ? localized('正在生成实例验收…', 'Generating the instance test…')
              : localized('生成实例验收', 'Generate an instance test')))))

    return h('section', { className: 'st-detail-card st-mod', 'data-role': 'skill-modification' },
      head,
      h('p', { className: 'st-mod-lines', 'data-role': 'mod-lines' }, raw(localized(
        `${lines.exact === false ? '约 ' : ''}新增 ${Number(lines.added) || 0} 行 · 删除 ${Number(lines.removed) || 0} 行`,
        `${lines.exact === false ? 'about ' : ''}+${Number(lines.added) || 0} · −${Number(lines.removed) || 0} lines`,
      ))),
      scopes.length
        ? h('dl', { className: 'st-mod-scopes', 'data-role': 'mod-scopes' },
          ...scopes.flatMap((scope) => [
            h('dt', { key: `${scope.id}:k` }, raw(modifyScopeText(scope.id))),
            h('dd', { key: `${scope.id}:v`, 'data-role': 'mod-scope', 'data-scope': scope.id, 'data-state': scope.state }, raw(modifyScopeStateText(scope.state))),
          ]))
        : null,
      (sections.added.length || sections.removed.length)
        ? h('div', { className: 'st-mod-sections', 'data-role': 'mod-sections' },
          ...sections.added.map((title) => h('p', { key: `a:${title}`, 'data-kind': 'added' }, raw(localized(`新增小节：${title}`, `New section: ${title}`)))),
          ...sections.removed.map((title) => h('p', { key: `r:${title}`, 'data-kind': 'removed' }, raw(localized(`删除小节：${title}`, `Removed section: ${title}`)))))
        : null,
      resources.available
        ? h('div', { className: 'st-mod-resources', 'data-role': 'mod-resources' },
          resourceList('added', resources.added),
          resourceList('removed', resources.removed),
          resourceList('modified', resources.modified),
          (!resources.added.length && !resources.removed.length && !resources.modified.length)
            ? h('p', { className: 'st-mod-res-line' }, raw(localized('资源文件没有变化。', 'No resource files changed.')))
            : null)
        : h('p', { className: 'st-mod-res-line', 'data-role': 'mod-resources' }, raw(localized('拿不到这个 Skill 的目录清单，资源层没有参与对比。', 'The directory listing is not available, so resources were not compared.'))),
      outOfScope.length
        ? h('div', { className: 'st-mod-out', 'data-role': 'mod-out-of-scope' },
          h('h4', null, localized('超出修改范围', 'Outside the declared scope')),
          ...outOfScope.map((entry) => h('p', { key: entry.id, 'data-role': 'mod-out-of-scope-item', 'data-id': entry.id }, raw(entry.detail))))
        : null,
      h('p', { className: 'st-mod-state', 'data-role': 'mod-source', 'data-state': comparison.source?.state ?? 'unknown' }, raw(comparison.source?.message ?? '')),
      h('p', { className: 'st-mod-state', 'data-role': 'mod-identity', 'data-state': comparison.identity?.state ?? 'unknown' }, raw(comparison.identity?.state === 'changed'
        ? localized('SKILL.md 的 name 字段变了。协议要求保留名称，除非你明确要求改名。', 'The name field changed. The contract keeps the name unless you asked to rename it.')
        : localized('name 字段没有变。', 'The name field did not change.'))),
      notes.length ? h('ul', { className: 'st-mod-notes', 'data-role': 'mod-notes' }, ...notes.map((note) => h('li', { key: note }, raw(note)))) : null,
      modification.released
        ? h('p', { className: 'st-mod-note', 'data-role': 'mod-released' }, raw(localized(
          '改前快照只活在宿主内存里，现在已经释放。再想对比，就先再改一次。',
          'The pre-modification snapshot lived in host memory only and has been released. Modify again to compare another change.',
        )))
        : null,
      limitations.length
        ? h('details', { className: 'st-mod-limits', 'data-role': 'mod-limitations' },
          h('summary', null, raw(localized('这次对比算了什么、没算什么', 'What this comparison does and does not cover'))),
          h('ul', null, ...limitations.map((item) => h('li', { key: item }, raw(item)))))
        : null,
      instanceBlock,
      h('div', { className: 'st-mod-actions' },
        h('button', { className: 'st-mod-cancel', type: 'button', 'data-role': 'mod-again', onClick: onOpenModify }, raw(localized('再改一次', 'Modify again')))))
  }

  /**
   * v0.8 差异面板：标准模态（`FR-EVO-018`）。
   *
   * 它**只读**：没有编辑、没有合并、没有「采用来源的写法」。它也不评价哪一版更好 ——
   * 三个 Tab 说的是同一件事的三层：结构变了哪些小节、内容变了哪些行、资源多了少了哪些文件。
   *
   * 焦点行为不是装饰：打开后焦点进入面板、Tab 在面板内循环、Esc 关闭、关闭后焦点回到
   * 打开它的那个按钮。少任何一条，键盘用户都会被留在一个已经关闭的浮层后面。
   * 错误态用 `role="alert"`，因为「读不到来源」必须被辅助技术立刻听到。
   */
  /**
   * 评测卡的初始状态。放在组件外面：几次请求回来时都要拿它当底座，
   * 每处各写一份字面量迟早会出现两处不一样。
   */
  const EVALUATION_INITIAL_STATE = {
    phase: 'idle',
    caseRecord: null,
    caseId: '',
    hashInput: null,
    runs: [],
    judgements: {},
    outcome: { source: 'user', text: '' },
    runRole: 'after',
    // 哪一条算「改前 / 改后」由人标：键是 runId，值是 'before' | 'after'。
    // 空对象不是错误 —— 卡片会先按指纹事实猜一次（`mismatch` 算改前、`match` 算改后）。
    runRoles: {},
    saved: false,
    warningCount: 0,
    message: '',
    error: '',
  }

  /**
   * Run 的字段与取值：键的**名字与顺序**跟着核心模块的 `EVALUATION_RUN_FIELD_LABELS` 走，
   * 界面这一层只把值翻译成一句人看得懂的话（不再自己起一套字段名 —— 两套名字迟早会漂开）。
   */
  const EVALUATION_RUN_FIELDS = [
    'startedAt', 'turn', 'model', 'provider', 'reasoningEffort', 'dshVersion', 'pluginVersion',
    'observedInstructionSha256', 'currentInstructionSha256', 'match', 'load', 'runtimeEvents', 'outcome',
  ]

  /**
   * 运行时间：只把宿主给的时间戳摆出来。解析不了就照原样显示 ——
   * 不猜、更不用「现在」补一个上去（那会让两次运行看起来比实际更近）。
   */
  function formatRunTime(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return EVALUATION_UNAVAILABLE_TEXT
    const time = new Date(value)
    if (Number.isNaN(time.getTime())) return String(value) || EVALUATION_UNAVAILABLE_TEXT
    const pad = (number) => String(number).padStart(2, '0')
    return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`
  }

  /**
   * V1.0「Skill 评测」卡（`FR-EVAL-003` / `006` / `010`–`015`，`spec/SDD.md` §22.8）。
   *
   * 这张卡只做三件事：把这次修改固化成一个能反复用的 Case、把「这一次运行看到了什么」摆成四段
   * 证据、把两次运行逐条对照。判定由人点出来或 Agent 自报，插件一个都不判；界面不产出任何汇总
   * 口径（`FR-EVAL-012` / `014`）—— 一条一条列，列完为止。
   */
  function SkillEvaluationCard({ evaluation, canGenerate, onGenerate, onSave, onCapture, onJudge, onOutcome, onRole }) {
    const phase = evaluation?.phase ?? 'idle'
    const busy = phase === 'loading' || phase === 'saving' || phase === 'capturing'
    const record = evaluation?.caseRecord ?? null
    const error = typeof evaluation?.error === 'string' ? evaluation.error : ''
    const message = typeof evaluation?.message === 'string' ? evaluation.message : ''
    const unavailable = EVALUATION_UNAVAILABLE_TEXT
    const runs = Array.isArray(evaluation?.runs) ? evaluation.runs : []
    const judgements = evaluation?.judgements && typeof evaluation.judgements === 'object' ? evaluation.judgements : {}
    const outcome = evaluation?.outcome && typeof evaluation.outcome === 'object' ? evaluation.outcome : { source: 'user', text: '' }
    const runRoles = evaluation?.runRoles && typeof evaluation.runRoles === 'object' ? evaluation.runRoles : {}
    const nextRole = evaluation?.runRole === 'before' ? 'before' : 'after'
    const saved = typeof evaluation?.caseId === 'string' && Boolean(evaluation.caseId)
    const observations = Array.isArray(record?.observations) ? record.observations : []
    const verdictLabel = (id) => EVALUATION_VERDICT_LABELS[id] ?? unavailable
    const sourceLabel = (id) => EVALUATION_SOURCE_LABELS[id] ?? unavailable
    const statusTag = (status) => h('span', { className: 'st-eval-tag', 'data-status': status }, raw(status === 'observed'
      ? localized('有观察', 'Observed')
      : (status === 'not-observed' ? localized('没有观察到', 'Not observed') : unavailable)))

    // 哪一条算改前、哪一条算改后：**先看事实** —— 运行时指纹与当前文件一致的那一条就是改后
    // （`match === 'match'`），不一致的那一条是改前；用户在页面上标过的优先。事实也分不出来时
    // **不给答案**：把两条都摆出来让人点，替用户挑一条等于让这一页看起来比实际更确定。
    const roleOf = (run) => {
      const tagged = run && typeof run.runId === 'string' ? runRoles[run.runId] : null
      return tagged === 'before' || tagged === 'after' ? tagged : null
    }
    let beforeRun = runs.filter((run) => roleOf(run) === 'before')[0] ?? null
    let afterRun = runs.filter((run) => roleOf(run) === 'after')[0] ?? null
    if (!beforeRun && !afterRun) {
      beforeRun = runs.filter((run) => run?.match === 'mismatch')[0] ?? null
      afterRun = runs.filter((run) => run?.match === 'match')[0] ?? null
    }
    const paired = Boolean(beforeRun && afterRun && beforeRun !== afterRun)
    const comparison = paired ? compareEvaluationRuns({ case: record, before: beforeRun, after: afterRun }) : null
    const focusedRun = afterRun ?? beforeRun ?? runs[0] ?? null
    const evidence = focusedRun ? buildRuntimeEvidence({ run: focusedRun }) : null
    const singleAssertions = !comparison && focusedRun && record ? buildEvaluationAssertions({ case: record, run: focusedRun }) : null

    const runValue = (run, key) => {
      if (key === 'startedAt') return formatRunTime(run?.startedAt)
      if (key === 'turn') return `turn ${run?.turn ?? unavailable} / step ${run?.step ?? unavailable}`
      if (key === 'load') {
        const seq = run?.load?.seq
        return String(run?.load?.status ?? unavailable) + (seq === null || seq === undefined ? '' : ` · seq ${seq}`)
      }
      if (key === 'runtimeEvents') {
        if (run?.runtimeEvents?.available === false) return unavailable
        return `${run?.runtimeEvents?.total ?? 0} · ${localized('次工具活动', 'tool activities')}`
      }
      if (key === 'outcome') {
        return run?.outcome?.source === 'unavailable' || !run?.outcome?.source
          ? unavailable
          : `${sourceLabel(run.outcome.source)}：${String(run.outcome.text ?? unavailable)}`
      }
      return String(run?.[key] ?? unavailable)
    }

    // ── ① Case ───────────────────────────────────────────────────────────────
    const caseSection = h('div', { className: 'st-eval-section', 'data-role': 'eval-case' },
      h('h4', null, raw(localized('① Evaluation Case', '① Evaluation Case'))),
      h('dl', { className: 'st-eval-grid' },
        h('dt', { key: 'id:k' }, raw(localized('Case 身份', 'Case identity'))),
        h('dd', { key: 'id:v', 'data-role': 'eval-identity' }, raw(saved
          ? evaluation.caseId
          : localized('还没保存到本机', 'Not saved on this machine yet'))),
        h('dt', { key: 'fp:k' }, raw(localized('绑定指纹', 'Bound fingerprint'))),
        h('dd', { key: 'fp:v', 'data-role': 'eval-fingerprint' }, raw(String(record?.skillFingerprint?.instructionSha256 ?? unavailable))),
        h('dt', { key: 'src:k' }, raw(localized('来源', 'Source'))),
        h('dd', { key: 'src:v' }, raw(localized('来自这次修改，生成器版本 ', 'From this modification, generator version ')
          + String(record?.generatorVersion ?? unavailable)))),
      h('div', { className: 'st-eval-chips', 'data-role': 'eval-scope' },
        ...(Array.isArray(record?.scopeIds) ? record.scopeIds : []).map((id) => h('span', { key: id, className: 'st-eval-chip', 'data-scope': id }, raw(modifyScopeText(id))))),
      h('pre', { className: 'st-eval-prompt', 'data-role': 'eval-prompt' }, raw(String(record?.taskPrompt?.text ?? ''))),
      h('div', { className: 'st-eval-block', 'data-role': 'eval-observations' },
        h('h5', null, raw(localized('预期观察点', 'Expected observations'))),
        h('ul', { className: 'st-eval-list' }, ...observations.map((observation) => h('li', {
          key: observation.id,
          'data-role': 'eval-observation',
          'data-observation': observation.id,
        }, raw(String(observation.text ?? '')))))),
      h('div', { className: 'st-eval-block', 'data-role': 'eval-regression' },
        h('h5', null, raw(localized('回归约束', 'Regression constraints'))),
        record?.regressionUnavailable
          ? h('p', { className: 'st-eval-hint' }, raw(localized('这一版没有抽到回归约束 —— 没有就是没有，不为了好看补一句。', 'This version extracted no regression constraint — none is none, and nothing is invented to fill the gap.')))
          : h('ul', { className: 'st-eval-list' }, ...(Array.isArray(record?.regressions) ? record.regressions : []).map((line, index) => h('li', { key: String(index) }, raw(String(line)))))),
      h('div', { className: 'st-eval-actions' },
        h('button', {
          className: 'st-eval-button',
          type: 'button',
          'data-role': 'eval-save',
          disabled: busy,
          onClick: onSave,
        }, raw(localized('保存到本机', 'Save on this machine'))),
        // 「生成」在两个状态里都在：已经有 Case 时它是**重新生成** —— 又改了一次 Skill 之后，
        // 要测的是新那一版，而旧 Case 绑的是旧指纹（`FR-EVAL-004`：旧 Case 不会被改写）。
        canGenerate
          ? h('button', {
            className: 'st-eval-button',
            type: 'button',
            'data-role': 'eval-generate',
            disabled: busy,
            onClick: onGenerate,
          }, raw(localized('按当前内容重新生成', 'Regenerate from the current content')))
          : null),
      h('p', { className: 'st-eval-hint' }, raw(saved
        ? localized('这个 Case 已经在本机上了。它绑的是上面那个指纹 —— 文件再改一次，这个 Case 不会跟着变。', 'This case is on this machine. It is bound to the fingerprint above — a later edit will not move it.')
        : localized('本机还没有它的副本。「Case 身份」由宿主在保存时按内容算出来，客户端算不了。', 'There is no copy on this machine yet. The host derives the case identity from the content when saving; the client cannot.'))))

    // ── ② 运行记录：判定 + 结果 + 记一次 ───────────────────────────────────────
    const runHint = !saved
      ? localized('先把 Case 保存到本机，再记运行 —— 运行记录要挂在一个有身份的 Case 上。', 'Save the case on this machine first, then record a run: a run hangs off a case that has an identity.')
      : (busy
        ? localized('正在记……条件、指纹、加载证据与工具活动都由宿主从会话日志与收据里取。', 'Recording… conditions, fingerprints, load evidence and tool activity all come from the host, out of the session log and receipts.')
        : localized('条件与指纹由宿主取；判定和结果由你给。这条记录会落成一份本机文件。', 'The host takes the conditions and fingerprints; you give the verdicts and the outcome. This run is written to a file on this machine.'))

    // 判定按钮：每一条观察点三个值，再点一次同一个按钮就是撤掉这条判定。
    const judgementRows = observations.map((observation) => h('div', {
      key: observation.id,
      className: 'st-eval-judge',
      'data-role': 'eval-judgement',
      'data-observation': observation.id,
    },
    h('p', { className: 'st-eval-judge-text' }, raw(String(observation.text ?? ''))),
    h('div', { className: 'st-eval-actions' }, ...EVALUATION_VERDICT_IDS.map((id) => h('button', {
      key: id,
      className: 'st-eval-button',
      type: 'button',
      'data-verdict': id,
      'data-on': judgements[observation.id] === id ? 'true' : 'false',
      disabled: busy,
      onClick: () => onJudge(observation.id, judgements[observation.id] === id ? '' : id),
    }, raw(verdictLabel(id)))))))

    // 结果那一栏：文本是自由输入，来源只认 `user` / `agent`（`protocol` 由宿主从日志里读，不由人填）。
    const sourceButtons = EVALUATION_SOURCE_IDS
      .filter((id) => id !== 'protocol')
      .map((id) => h('button', {
        key: id,
        className: 'st-eval-button',
        type: 'button',
        'data-source': id,
        'data-on': outcome.source === id ? 'true' : 'false',
        disabled: busy,
        onClick: () => onOutcome({ source: id }),
      }, raw(sourceLabel(id))))
    const outcomeBlock = h('div', { className: 'st-eval-block', 'data-role': 'eval-outcome' },
      h('h5', null, raw(localized('结果', 'Outcome'))),
      h('textarea', {
        className: 'st-eval-textarea',
        rows: 2,
        value: String(outcome.text ?? ''),
        placeholder: localized('这一次的产出是什么样。留空就是「还没给」。', 'What the output looked like this time. Blank means “not given yet”.'),
        disabled: busy,
        onChange: (event) => onOutcome({ text: event.target.value }),
      }),
      h('div', { className: 'st-eval-actions' }, ...sourceButtons))

    // 「这一条算哪一版」：默认值会跟着上一条记录翻面，所以它得能改。
    const roleButtons = ['after', 'before'].map((id) => h('button', {
      key: id,
      className: 'st-eval-button',
      type: 'button',
      'data-role': 'eval-run-role',
      'data-role-of': id,
      'data-on': nextRole === id ? 'true' : 'false',
      disabled: busy,
      onClick: () => onRole(id),
    }, raw(id === 'after' ? localized('改后', 'After the change') : localized('改前', 'Before the change'))))
    const roleBlock = h('div', { className: 'st-eval-block' },
      h('h5', null, raw(localized('这一条算哪一版', 'Which version this run counts as'))),
      h('div', { className: 'st-eval-actions' }, ...roleButtons))

    // 运行记录要挂在有身份的 Case 上（`caseId` 是宿主算的）：没保存就点它，只会换回一句
    //「本机没有这一份 Case」。`disabled` 只在这种真的不该点的时候为真。
    const runActions = h('div', { className: 'st-eval-actions' },
      h('button', {
        className: 'st-eval-button st-eval-primary',
        type: 'button',
        'data-role': 'eval-run',
        disabled: busy || !saved,
        onClick: onCapture,
      }, raw(localized('记录这一次运行', 'Record this run'))))

    const captureSection = h('div', { className: 'st-eval-section', 'data-role': 'eval-capture' },
      h('h4', null, raw(localized('② 记录这一次运行', '② Record this run'))),
      h('p', { className: 'st-eval-hint' }, raw(localized('逐条给判定。没给的那条会写成「无法判断」—— 沉默不折算成「未通过」。', 'Judge them one by one. Anything you leave alone reads as “cannot tell” — silence is never folded into “did not pass”.'))),
      ...judgementRows,
      outcomeBlock,
      roleBlock,
      runActions,
      h('p', { className: 'st-eval-hint', 'data-role': 'eval-run-hint' }, raw(runHint)))

    // ── ③ 运行记录列表（也是「哪一条算改前/改后」的改口处）─────────────────────
    const runsSection = runs.length ? h('div', { className: 'st-eval-section', 'data-role': 'eval-runs' },
      h('h4', null, raw(localized('③ 已经记下来的运行', '③ Runs recorded so far'))),
      h('p', { className: 'st-eval-hint' }, raw(localized('每一条都是「跑一次、记一次」。默认按事实分：运行时指纹与当前文件一致的那条算改后，不一致的算改前 —— 不对就在这里自己标。', 'Each entry is one run, recorded once. They are paired by fact: the run whose fingerprint matches the current file counts as “after”, the one that does not counts as “before”. Change it here if that is wrong.'))),
      h('ul', { className: 'st-eval-list' }, ...runs.map((run) => h('li', { key: String(run?.runId ?? ''), className: 'st-eval-run' },
        h('span', { className: 'st-eval-run-id' }, raw(String(run?.runId ?? unavailable))),
        h('span', { className: 'st-eval-hint' }, raw(formatRunTime(run?.startedAt) + ' · ' + String(run?.model ?? unavailable))),
        h('div', { className: 'st-eval-actions' }, ['before', 'after'].map((id) => h('button', {
          key: id,
          className: 'st-eval-button',
          type: 'button',
          'data-role': 'eval-run-role',
          'data-run': String(run?.runId ?? ''),
          'data-role-of': id,
          'data-on': roleOf(run) === id ? 'true' : 'false',
          disabled: busy,
          onClick: () => onRole(id, String(run?.runId ?? '')),
        }, raw(id === 'before' ? localized('算改前', 'Count as before') : localized('算改后', 'Count as after'))))))))
    ) : null

    // ── ④ 条件 Before / After ────────────────────────────────────────────────
    const runColumn = (title, run) => h('div', { className: 'st-eval-column' },
      h('h5', null, raw(title)),
      run
        ? h('dl', { className: 'st-eval-grid' }, ...EVALUATION_RUN_FIELDS.flatMap((key) => [
          h('dt', { key: `${key}:k` }, raw(String(EVALUATION_RUN_FIELD_LABELS[key] ?? key))),
          h('dd', { key: `${key}:v` }, raw(runValue(run, key))),
        ]))
        : h('p', { className: 'st-eval-hint' }, raw(localized('还没有这一版的运行记录。', 'There is no run for this version yet.'))))

    const conditionRows = comparison ? comparison.conditions.map((condition) => h('div', {
      key: condition.key,
      className: 'st-eval-condition',
      'data-role': 'eval-condition',
      'data-condition': condition.key,
      'data-equal': condition.equal ? 'true' : 'false',
    },
    h('span', { className: 'st-eval-condition-name' }, raw(String(condition.label ?? condition.key))),
    h('span', { className: 'st-eval-condition-value' }, raw(String(condition.before ?? unavailable))),
    h('span', { className: 'st-eval-condition-value' }, raw(String(condition.after ?? unavailable))),
    h('span', { className: 'st-eval-tag', 'data-status': condition.equal ? 'observed' : 'not-observed' }, raw(condition.equal
      ? localized('相同', 'Same')
      : localized('不同', 'Different'))))) : []

    const conditionSection = h('div', { className: 'st-eval-section', 'data-role': 'eval-conditions' },
      h('h4', null, raw(localized('④ 两次运行的条件', '④ Conditions of the two runs'))),
      h('p', { className: 'st-eval-hint' }, raw(localized('条件对不上就不做对照 —— 差异说不清是谁带来的，这一页就不说。', 'When the conditions do not match, nothing is compared: the difference cannot be attributed, so this page will not claim it.'))),
      h('div', { className: 'st-eval-columns' },
        runColumn(localized('改前 · 那一条', 'Before · that run'), beforeRun),
        runColumn(localized('改后 · 这一条', 'After · this run'), afterRun)),
      conditionRows.length
        ? h('div', { className: 'st-eval-conditions' }, ...conditionRows)
        : null,
      comparison
        ? h('p', {
          className: 'st-eval-hint',
          'data-role': comparison.comparable ? 'eval-comparison' : 'eval-comparison-unavailable',
          'data-axis': String(comparison.axis ?? unavailable),
        }, raw(String(comparison.axisLabel ?? '') + ' · ' + String(comparison.reason ?? '')))
        : h('p', { className: 'st-eval-hint', 'data-role': 'eval-comparison-unavailable' }, raw(runs.length
          ? localized('要对照得先有两条记录：这一页现在只认出其中一边，或者两边都还没标。', 'A comparison needs two recorded runs: this page can only identify one side so far, or neither is tagged yet.')
          : localized('还没有运行记录，所以没有条件可摆。', 'There are no runs yet, so there are no conditions to lay out.'))))

    // ── ⑤ 运行时证据：四段各看见了什么 ────────────────────────────────────────
    const evidenceSection = h('div', { className: 'st-eval-section', 'data-role': 'eval-evidence' },
      h('h4', null, raw(localized('⑤ 运行时证据', '⑤ Runtime evidence'))),
      h('p', { className: 'st-eval-hint' }, raw(localized('同一个 Case、这一次运行里，四段各自看见了什么。每一段都写着它够不着什么。', 'For this run of the same case: what each of the four stages did and did not see. Every stage says what it cannot reach.'))),
      evidence
        ? h('div', null, ...evidence.stages.map((stage) => h('div', {
          key: stage.id,
          className: 'st-eval-stage',
          'data-role': 'eval-stage',
          'data-stage': stage.id,
        },
        h('div', { className: 'st-eval-stage-head' },
          h('span', { className: 'st-eval-stage-name' }, raw(String(stage.label ?? stage.id))),
          statusTag(stage.status),
          h('span', { className: 'st-eval-hint' }, raw(sourceLabel(stage.source)))),
        h('ul', { className: 'st-eval-list' }, ...(Array.isArray(stage.facts) ? stage.facts : []).map((fact, index) => h('li', { key: String(index) }, raw(String(fact))))),
        h('p', { className: 'st-eval-reach' }, raw(String(stage.reach ?? ''))))),
        h('div', { className: 'st-eval-inequalities', 'data-role': 'eval-inequalities' },
          ...(Array.isArray(evidence.inequalities) ? evidence.inequalities : []).map((line) => h('span', { key: String(line), className: 'st-eval-inequality' }, raw(String(line)))),
          h('p', { className: 'st-eval-hint' }, raw(String(evidence.inequalitiesNote ?? '')))))
        : h('p', { className: 'st-eval-hint' }, raw(localized('还没有运行记录，所以这里没有证据可摆。', 'There is no run yet, so there is no evidence to lay out.'))))

    // ── ⑥ 断言与对照：一条一条列，列完为止 ────────────────────────────────────
    const assertionRows = comparison
      ? comparison.rows.map((row) => h('div', { key: row.id, className: 'st-eval-assertion', 'data-role': 'eval-assertion', 'data-assertion': row.id },
        h('span', { className: 'st-eval-assertion-text' }, raw(String(row.text ?? ''))),
        h('span', { className: 'st-eval-assertion-cell' }, raw(verdictLabel(row.before))),
        h('span', { className: 'st-eval-assertion-cell' }, raw(verdictLabel(row.after))),
        h('span', { className: 'st-eval-assertion-cell' }, raw(String(row.comparison ?? unavailable))),
        h('span', { className: 'st-eval-hint' }, raw(sourceLabel(row.source)))))
      : (singleAssertions
        ? singleAssertions.rows.map((row) => h('div', { key: row.id, className: 'st-eval-assertion', 'data-role': 'eval-assertion', 'data-assertion': row.id },
          h('span', { className: 'st-eval-assertion-text' }, raw(String(row.text ?? ''))),
          h('span', { className: 'st-eval-assertion-cell' }, raw(verdictLabel(row.verdict))),
          h('span', { className: 'st-eval-hint' }, raw(sourceLabel(row.source))),
          h('span', { className: 'st-eval-hint' }, raw(String(row.why ?? '')))))
        : [])

    const assertionSection = h('div', { className: 'st-eval-section', 'data-role': 'eval-assertions' },
      h('h4', null, raw(localized('⑥ 断言与对照', '⑥ Assertions and comparison'))),
      h('p', { className: 'st-eval-hint' }, raw(localized('每条三样东西：陈述、结论、来源。对照那一列只说事实上的差别（两次都一样 / 改前未通过 → 改后通过 / 两次都无法判断），不折成别的说法。', 'Each row carries three things: the statement, the verdict, the source. The comparison column states only the factual difference (same both times / did not pass before → passes after / cannot tell either time), and is never folded into anything else.'))),
      assertionRows.length
        ? h('div', { className: 'st-eval-assertions' }, ...assertionRows)
        : h('p', { className: 'st-eval-hint' }, raw(localized('还没有可列的断言：先记一条运行。', 'There is nothing to list yet: record a run first.'))))

    // ── ⑦ 这一版刻意不出现的东西 ──────────────────────────────────────────────
    const forbiddenSection = h('div', { className: 'st-eval-section st-eval-forbidden', 'data-role': 'eval-forbidden' },
      h('h4', null, raw(localized('⑦ 这一版刻意不出现的东西', '⑦ What this version deliberately leaves out'))),
      h('p', { className: 'st-eval-hint' }, raw(localized('不是「还没做」，是永久不做。理由不是不想做，而是外部证据不支持批量结论：49 个公开 SWE Skill 里 39 个一点增益都没有、均值 +1.2%、3 个把表现拖低最多 10%、token 开销最高 +451%（arXiv 2603.15401）。所以这里只有证据，没有结论分。', 'Not “not yet” but “not ever”. The reason is not reluctance but evidence: of 49 public SWE skills, 39 showed no gain at all, the mean was +1.2%, three dragged performance down by up to 10%, and token cost rose by as much as +451% (arXiv 2603.15401). So this page holds evidence, never a total.'))),
      h('div', { className: 'st-eval-forbidden-grid' }, ...EVALUATION_FORBIDDEN_OUTPUTS.map((label) => h('span', { key: String(label), className: 'st-eval-forbidden-item' }, raw(String(label))))))

    const body = record
      ? [caseSection, captureSection, runsSection, conditionSection, evidenceSection, assertionSection, forbiddenSection].filter(Boolean)
      : [h('div', { className: 'st-eval-section st-eval-empty', 'data-role': 'eval-unavailable' },
        h('p', { className: 'st-eval-hint' }, raw(canGenerate
          ? localized('这个 Skill 还没有评测 Case。生成一个 —— 它把这次修改固化成能反复用的用例。', 'This skill has no evaluation case yet. Generate one: it freezes this modification into a reusable case.')
          : localized('这个 Skill 还没有评测 Case。它从这里来：先在「Skill 演进」里改一次 Skill，并让插件按那次改动生成对比。', 'This skill has no evaluation case yet. It starts with a modification: change the skill in “Skill evolution”, and let the plugin compare that change.'))),
        h('div', { className: 'st-eval-actions' }, canGenerate
          ? h('button', {
            className: 'st-eval-button st-eval-primary',
            type: 'button',
            'data-role': 'eval-generate',
            disabled: busy,
            onClick: onGenerate,
          }, raw(localized('生成评测 Case', 'Generate the evaluation case')))
          : null))]

    return h('section', { className: 'st-detail-card st-eval', 'data-role': 'eval-card' },
      h('div', { className: 'st-eval-top' }, h('h3', null, raw(localized('Skill 评测', 'Skill evaluation')))),
      h('p', { className: 'st-eval-hint', 'data-role': 'eval-hint' }, raw(localized('同一个 Case 跑两次，条件逐项摆出来，逐条对照 —— 不给分、不排序、不画走势。', 'Run the same case twice, lay the conditions out item by item, compare assertion by assertion — no scores, no ordering, no trend line.'))),
      error ? h('p', { className: 'st-eval-alert', role: 'alert', 'data-role': 'eval-error' }, raw(error)) : null,
      message ? h('p', { className: 'st-eval-hint' }, raw(message)) : null,
      ...body)
  }

  function SkillDiffPanel({ sessionId, skillName, diff: suppliedDiff, tab: suppliedTab = 'structure', onClose }) {
    // `diff` 是和 `SkillCloneDialog` 的 `clone` 同一种注入缝：渲染烟测的 React 桩不跑
    // `useEffect`，所以「已经拿到差异」的那一帧只有注得进去才渲染得出来。
    // `tab` 是同一条理由的另一半：`useState` 的更新函数也是空操作，不注入就永远只看得见
    // 第一个 Tab，另外两层渲染得对不对没有任何东西盯着。
    const [state, setState] = React.useState(() => (suppliedDiff
      ? { phase: 'ready', diff: suppliedDiff, error: '' }
      : { phase: 'loading', diff: null, error: '' }))
    const [tab, setTab] = React.useState(suppliedTab)
    const dialogRef = React.useRef(null)
    const closeRef = React.useRef(null)

    React.useEffect(() => {
      if (suppliedDiff) return undefined
      let cancelled = false
      api(`/diff?sessionId=${encodeURIComponent(sessionId)}&skillName=${encodeURIComponent(skillName)}`)
        .then((body) => { if (!cancelled) setState({ phase: 'ready', diff: body, error: '' }) })
        .catch((reason) => { if (!cancelled) setState({ phase: 'error', diff: null, error: String(reason?.message || 'unavailable') }) })
      return () => { cancelled = true }
    }, [sessionId, skillName, suppliedDiff])

    React.useEffect(() => {
      const target = closeRef.current
      if (target && typeof target.focus === 'function') target.focus()
    }, [])

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = dialogRef.current
      if (!root || typeof root.querySelectorAll !== 'function') return
      const nodes = root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = typeof document === 'undefined' ? null : document.activeElement
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }

    const header = h('header', { className: 'st-diff-head' },
      h('h2', null, localized('Skill 差异', 'Skill differences')),
      h('p', { className: 'st-diff-sub', 'data-role': 'diff-subject' }, raw(localized(
        `${skillName} 与来源 Skill 的比较`,
        `${skillName} compared with its source Skill`,
      ))),
      h('div', { className: 'st-diff-tabs', role: 'tablist' }, ...DIFF_TABS.map(([key, zh, en]) => h('button', {
        key,
        className: 'st-diff-tab',
        type: 'button',
        role: 'tab',
        'data-tab': key,
        'data-active': tab === key ? 'true' : 'false',
        'aria-selected': tab === key ? 'true' : 'false',
        onClick: () => setTab(key),
      }, raw(localized(zh, en))))))

    const closeButton = h('button', {
      className: 'st-diff-close',
      type: 'button',
      ref: closeRef,
      'data-role': 'diff-close',
      onClick: onClose,
    }, raw(localized('关闭', 'Close')))

    const footer = h('div', { className: 'st-diff-foot' }, closeButton)
    const shell = (children) => h('div', {
      className: 'st-diff-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': localized('Skill 差异', 'Skill differences'),
      onKeyDown,
    }, h('div', { className: 'st-diff-dialog', ref: dialogRef }, header, children, footer))

    if (state.phase === 'loading') {
      return shell(h('div', { className: 'st-diff-body' },
        h('p', { className: 'st-diff-empty' }, raw(localized('正在计算差异…', 'Comparing…')))))
    }
    if (state.phase === 'error') {
      return shell(h('div', { className: 'st-diff-body' },
        h('p', { className: 'st-diff-alert', role: 'alert', 'data-role': 'diff-error' }, raw(state.error))))
    }

    const diff = state.diff ?? null
    const comparison = diff?.comparison ?? null
    const sourceState = diffSourceState(comparison?.source)
    const limitations = Array.isArray(comparison?.limitations) ? comparison.limitations : []
    // 任一侧读不到时三层都是 `unavailable`，但那不是「没有变化」。所以这一屏的正事就是
    // 把那句话说清楚，而不是显示一条空列表让人以为两边一样（`FR-EVO-015`）。
    const unavailable = comparison?.status === 'unavailable'
    const subject = h('div', null,
      h('p', { className: 'st-diff-sub', 'data-role': 'diff-source-state', 'data-changed': sourceState.mark }, raw(sourceState.text)),
      h('p', { className: 'st-diff-sub' }, raw(localized(
        `复刻来源指纹 ${shortHash(comparison?.source?.originalSha256) || '—'} · 当前来源指纹 ${shortHash(comparison?.source?.currentSha256) || '—'}`,
        `Cloned from ${shortHash(comparison?.source?.originalSha256) || '—'} · source now ${shortHash(comparison?.source?.currentSha256) || '—'}`,
      ))))

    const countsLine = (layer) => h('p', { className: 'st-diff-counts' },
      ...['added', 'removed', 'modified', 'unchanged'].map((kind) => h('span', { key: kind, 'data-kind': kind },
        raw(`${diffWord(kind)} ${Number(layer?.counts?.[kind]) || 0}`))))

    const structureBody = h('div', null,
      countsLine(diff?.structure),
      ...(Array.isArray(diff?.structure?.sections) ? diff.structure.sections : []).map((section) => h('div', {
        key: `${section.anchorId ?? section.title}:${section.sourceLine ?? section.targetLine}`,
        className: 'st-diff-row',
        'data-status': section.status,
      },
      h('div', { className: 'st-diff-row-title' }, raw(section.title ?? '—')),
      h('span', { className: 'st-diff-kind', 'data-kind': section.status }, raw(diffWord(section.status))))))

    const contentBody = h('div', null,
      countsLine(diff?.content),
      ...(Array.isArray(diff?.content?.sections) ? diff.content.sections : []).map((section) => h('div', {
        key: `${section.anchorId ?? section.title}:${section.sourceLine ?? section.targetLine}`,
        className: 'st-diff-row',
        'data-status': section.status,
      },
      h('div', { className: 'st-diff-row-title' },
        h('div', null, raw(section.title ?? '—')),
        Array.isArray(section.lines) && section.lines.length
          ? h('ul', { className: 'st-diff-lines' }, ...section.lines.map((line, index) => h('li', {
            key: `${line.kind}:${line.sourceLine ?? 'x'}:${line.targetLine ?? 'x'}:${index}`,
            'data-kind': line.kind,
          },
          h('span', { className: 'st-diff-kind', 'data-kind': line.kind }, raw(line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' ')),
          h('code', null, raw(line.text)))))
          : null),
      h('span', { className: 'st-diff-kind', 'data-kind': section.status }, raw(diffWord(section.status))))))

    const resourcesBody = h('div', null,
      countsLine(diff?.resources),
      ...(Array.isArray(diff?.resources?.entries) ? diff.resources.entries : []).map((entry) => h('div', {
        key: entry.path,
        className: 'st-diff-row',
        'data-status': entry.status,
      },
      h('span', { className: 'st-diff-path' }, h('code', null, raw(entry.path))),
      h('span', { className: 'st-diff-kind', 'data-kind': entry.status }, raw(diffWord(entry.status))))))

    const body = tab === 'content' ? contentBody : tab === 'resources' ? resourcesBody : structureBody

    return shell(h('div', { className: 'st-diff-body' },
      unavailable
        ? h('p', { className: 'st-diff-alert', role: 'alert', 'data-role': 'diff-unavailable' }, raw(localized(
          '当前无法读取来源 Skill，无法完成差异比较。',
          'The source Skill cannot be read right now, so it cannot be compared.',
        )))
        : null,
      subject,
      unavailable ? null : body,
      limitations.length
        ? h('ul', { className: 'st-clone-limits' }, ...limitations.map((item) => h('li', { key: item }, raw(limitationLabel(item)))))
        : null))
  }

  /**
   * V1.2「Skill 证据」卡（`FR-EVIDENCE-001` … `011`，`spec/PRD.md` §5.14）。
   *
   * 这一屏回答的不是「这个 Skill 好不好」，而是「我现在看到的结论到底是什么性质的事实」：
   * 谁声明的、绑的是哪一份 fingerprint、哪一次观察、能证明什么、不能证明什么。
   * 三态只有三个 —— Declared / Observed / Unavailable，**没有**推断；取不到就写「无法取得」，
   * 不写「没有发生」。
   *
   * 取数一律走 `buildSkillEvidence()`（核心层纯函数），导出走 `buildEvidenceExport()`：
   * 界面这一层只负责画，自己一个字都不判定、不聚合、不补全 —— 否则同一份证据会在两个地方
   * 长出两套说法。导出的 JSON 里不含 session、绝对路径、工具参数与工具结果。
   */
  function SkillEvidenceCard({ detail, evaluation, onOpenEvaluation }) {
    const [evaluationTab, setEvaluationTab] = React.useState('current')
    const [exportMessage, setExportMessage] = React.useState('')
    const runs = Array.isArray(evaluation?.runs) ? evaluation.runs : []
    const record = evaluation?.caseRecord ?? null
    const runRoles = evaluation?.runRoles && typeof evaluation.runRoles === 'object' ? evaluation.runRoles : {}
    // 哪一条算「改前 / 改后」：与「Skill 评测」卡**同一条规则**（人标过的优先；没人标就按指纹
    // 事实分：`mismatch` 算改前、`match` 算改后；分不出来就不替用户挑，两条都摆着）。
    const roleOf = (run) => {
      const tagged = run && typeof run.runId === 'string' ? runRoles[run.runId] : null
      return tagged === 'before' || tagged === 'after' ? tagged : null
    }
    let beforeRun = runs.filter((run) => roleOf(run) === 'before')[0] ?? null
    let afterRun = runs.filter((run) => roleOf(run) === 'after')[0] ?? null
    if (!beforeRun && !afterRun) {
      beforeRun = runs.filter((run) => run?.match === 'mismatch')[0] ?? null
      afterRun = runs.filter((run) => run?.match === 'match')[0] ?? null
    }
    const paired = Boolean(beforeRun && afterRun && beforeRun !== afterRun)
    const comparison = paired ? compareEvaluationRuns({ case: record, before: beforeRun, after: afterRun }) : null

    const model = buildSkillEvidence({
      skillName: detail?.skillName,
      summary: detail?.summary,
      definition: detail?.definition,
      framework: detail?.framework,
      flow: detail?.flow,
      runs: detail?.runs,
      evidence: detail?.evidence,
      runtimeLogic: detail?.runtimeLogic,
      observation: detail?.observation,
      validation: detail?.validation,
      evaluation: {
        cases: record ? [record] : [],
        runs,
        comparison,
        selectedCaseId: typeof evaluation?.caseId === 'string' ? evaluation.caseId : '',
      },
    })
    const identity = model.identity
    const pairedText = (pair) => localized(pair?.zh ?? '', pair?.en ?? '')
    const statusTag = (status) => h('span', {
      className: 'st-evidence-status',
      'data-status': status,
    }, raw(localized(EVIDENCE_STATUS_LABELS[status].zh, EVIDENCE_STATUS_LABELS[status].en)))
    const limitationList = (items) => (Array.isArray(items) && items.length > 0
      ? h('ul', { className: 'st-evidence-limitations' },
        ...items.map((item, index) => h('li', {
          key: `${item?.code ?? 'limitation'}-${index}`,
          'data-code': item?.code ?? undefined,
        }, raw(pairedText(item)))))
      : null)
    const factValue = (item) => {
      if (item?.kind === 'count') return h('strong', { className: 'st-evidence-count' }, String(item.value))
      if (item?.kind === 'value' || item?.kind === 'code') return h('code', null, String(item.value))
      return h('span', null, raw(String(item.value)))
    }

    // 导出的最短路径：浏览器能下载就下载（Blob + 一个临时 <a>），不能就退回剪贴板，
    // 都不行就如实说不行 —— 不为它新建导出服务，也不让按钮点了没反应。
    const exportEvidence = () => {
      const text = JSON.stringify(buildEvidenceExport(model), null, 2)
      try {
        const BlobCtor = globalThis?.Blob
        const urlApi = globalThis?.URL
        if (typeof document !== 'undefined' && typeof BlobCtor === 'function' && typeof urlApi?.createObjectURL === 'function') {
          const url = urlApi.createObjectURL(new BlobCtor([text], { type: 'application/json' }))
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = `${model.skillName}-evidence.json`
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          urlApi.revokeObjectURL(url)
          setExportMessage(localized('证据快照已交给浏览器下载。', 'The evidence snapshot was handed to the browser for download.'))
          return
        }
      } catch (reason) {
        // 落到剪贴板分支：导出失败不该让这一屏报错，但也绝不假装成功。
      }
      const clipboard = globalThis?.navigator?.clipboard
      if (clipboard && typeof clipboard.writeText === 'function') {
        Promise.resolve(clipboard.writeText(text))
          .then(() => setExportMessage(localized('浏览器不让下载，证据快照已放进剪贴板。', 'Downloading is not available here; the snapshot went to the clipboard.')))
          .catch(() => setExportMessage(localized('当前环境既不能下载也不能写剪贴板。', 'This environment allows neither download nor clipboard access.')))
        return
      }
      setExportMessage(localized('当前环境不支持导出。', 'This environment does not support export.'))
    }

    const head = h('div', { className: 'st-evidence-top' },
      h('div', { className: 'st-evidence-heading' },
        h('h3', null, raw(localized('Skill 证据 · V1.2', 'Skill evidence · V1.2'))),
        h('p', { className: 'st-evidence-sub' }, raw(localized(
          '让每个结论都能回到对应的对象、版本、条件与证据',
          'Every conclusion points back to its object, version, conditions and evidence',
        )))),
      h('div', { className: 'st-evidence-actions' },
        h('button', {
          type: 'button',
          className: 'st-evidence-action',
          'data-role': 'evidence-export',
          title: localized('导出当前 Skill 的证据快照 JSON', 'Export the evidence snapshot as JSON'),
          onClick: exportEvidence,
        }, raw(localized('导出 Evidence JSON', 'Export evidence JSON'))),
        h('button', {
          type: 'button',
          className: 'st-evidence-action',
          'data-role': 'evidence-open-evaluation',
          title: localized('切到「Skill 评测」看这次的 Run', 'Switch to the evaluation module'),
          onClick: typeof onOpenEvaluation === 'function' ? onOpenEvaluation : undefined,
        }, raw(localized('查看当前评测', 'Open the evaluation')))),
      exportMessage
        ? h('p', { className: 'st-evidence-export-note', role: 'status', 'data-role': 'evidence-export-note' }, raw(exportMessage))
        : null)

    // ① Hero：当前证据状态 + 三态图例。没有 Success / Failure / Score 这类词 ——
    // 这一屏讲的是证据的性质，不是结果的好坏。
    const hero = h('div', { className: 'st-evidence-hero', 'data-role': 'evidence-hero' },
      h('p', { className: 'st-evidence-hero-title' }, raw(localized(
        `${model.skillName} 的当前证据状态`,
        `Current evidence state of ${model.skillName}`,
      ))),
      h('p', { className: 'st-evidence-hero-note' }, raw(pairedText(model.notes.scope))),
      h('ul', { className: 'st-evidence-legend', 'data-role': 'evidence-legend' },
        ...EVIDENCE_STATUS_IDS.map((id) => h('li', {
          key: id,
          className: 'st-evidence-legend-item',
          'data-status': id,
        }, statusTag(id), h('span', { className: 'st-evidence-legend-count' },
          `${model.statusCounts[id]} ${localized('条', 'items')}`)))),
      h('p', { className: 'st-evidence-hero-foot' }, raw(pairedText(model.notes.noScore))))

    // ② Evidence Identity：这一屏每个结论都绑在同一个身份上；取不到的写「无法取得」。
    const identityRows = [
      ['evidence-skill-fingerprint', 'Skill fingerprint', identity.skillFingerprint.status, identity.skillFingerprint.value],
      ['evidence-source-identity', 'Source identity',
        identity.sourceIdentity.status,
        `${identity.sourceIdentity.provider} / ${identity.sourceIdentity.kind}`],
      ['evidence-instruction-fingerprint', 'Instruction Fingerprint',
        identity.instructionFingerprint.status,
        identity.instructionFingerprint.current],
      ['evidence-case', 'Case', identity.caseId === EVIDENCE_UNAVAILABLE_TEXT ? 'unavailable' : 'observed', identity.caseId],
      ['evidence-run', 'Run', identity.runId === EVIDENCE_UNAVAILABLE_TEXT ? 'unavailable' : 'observed', identity.runId],
    ]
    const identityBlock = h('section', { className: 'st-evidence-block', 'data-role': 'evidence-identity' },
      h('h4', null, raw(localized('Evidence Identity', 'Evidence identity'))),
      h('dl', { className: 'st-evidence-identity' },
        ...identityRows.flatMap(([key, label, status, value]) => [
          h('dt', { key: `${key}-k`, className: 'st-evidence-identity-key' }, label),
          h('dd', { key: `${key}-v`, className: 'st-evidence-identity-value', 'data-status': status },
            status === 'unavailable' ? raw(localized('无法取得', 'Unavailable')) : h('code', null, String(value))),
        ])),
      h('p', { className: 'st-evidence-note' }, raw(localized(
        '这里只列系统已有的身份；读不到的写「无法取得」，不推导、不补全。',
        'Only identities the system already holds appear here; what cannot be read stays unavailable.',
      ))))

    // ③ 证据链 Definition → Load → Use → Outcome，右侧是这三条边界。
    const chain = h('section', { className: 'st-evidence-block', 'data-role': 'evidence-chain' },
      h('h4', null, raw(localized('证据链', 'Evidence chain'))),
      h('ol', { className: 'st-evidence-chain' },
        ...model.chain.map((stage) => h('li', {
          key: stage.id,
          className: 'st-evidence-stage',
          'data-stage': stage.id,
          'data-status': stage.status,
          'data-evidence-id': stage.evidenceId,
        },
        h('div', { className: 'st-evidence-stage-head' },
          h('span', { className: 'st-evidence-stage-order' }, String(stage.order).padStart(2, '0')),
          h('strong', { className: 'st-evidence-stage-label' }, raw(pairedText(stage.label))),
          statusTag(stage.status)),
        h('p', { className: 'st-evidence-stage-hint' }, raw(pairedText(stage.hint))),
        h('ul', { className: 'st-evidence-facts' },
          ...stage.facts.map((item) => h('li', { key: item.id, className: 'st-evidence-fact', 'data-fact': item.id },
            h('span', { className: 'st-evidence-fact-label' }, raw(pairedText(item.label))),
            factValue(item)))),
        h('p', { className: 'st-evidence-source' }, raw(localized(
          `来源：${stage.source.zh} · ${stage.reference}`,
          `Source: ${stage.source.en} · ${stage.reference}`,
        ))),
        limitationList(stage.limitations))),
      h('p', { className: 'st-evidence-inequalities' },
        raw(model.inequalities.join(' · ')))),
      h('div', { className: 'st-evidence-limits', 'data-role': 'evidence-limits' },
        h('h4', null, raw(localized('Evidence Limits · 证据边界', 'Evidence limits'))),
        ...model.boundaries.map((entry) => h('article', {
          key: entry.id,
          className: 'st-evidence-boundary',
          'data-boundary': entry.id,
          'data-status': entry.status,
        },
        h('div', { className: 'st-evidence-boundary-head' },
          h('strong', null, raw(pairedText(entry.label))),
          h('span', { className: 'st-evidence-boundary-state' }, raw(entry.id === 'causal-claim'
            ? localized('不声明', 'Not claimed')
            : localized('已确认', 'Confirmed')))),
        h('p', { className: 'st-evidence-boundary-claim' }, raw(pairedText(entry.claim))),
        h('p', { className: 'st-evidence-boundary-source' }, raw(localized(
          `来源：${entry.source.zh}`,
          `Source: ${entry.source.en}`,
        ))),
        limitationList([entry.limitation])))))

    // ④ 证据状态语义表：五类对象，逐行给出状态 / 当前事实 / 来源 / 限制。
    const table = h('section', { className: 'st-evidence-block', 'data-role': 'evidence-table' },
      h('h4', null, raw(localized('证据状态语义', 'Evidence status semantics'))),
      h('div', { className: 'st-evidence-rows', role: 'table' },
        h('div', { className: 'st-evidence-row st-evidence-row-head', role: 'row' },
          ...EVIDENCE_TABLE_COLUMNS.map((column) => h('span', {
            key: column.id,
            role: 'columnheader',
            className: `st-evidence-cell st-evidence-cell-${column.id}`,
          }, raw(localized(column.zh, column.en))))),
        ...evidenceRows(model).map((row) => h('div', {
          key: row.evidenceId,
          className: 'st-evidence-row',
          role: 'row',
          'data-subject': row.subjectId,
          'data-status': row.status,
          'data-evidence-id': row.evidenceId,
        },
        h('span', { role: 'cell', className: 'st-evidence-cell st-evidence-cell-subject' }, raw(pairedText(row.subject))),
        h('span', { role: 'cell', className: 'st-evidence-cell st-evidence-cell-status' }, statusTag(row.status)),
        h('span', { role: 'cell', className: 'st-evidence-cell st-evidence-cell-fact' }, raw(pairedText(row.fact))),
        h('span', { role: 'cell', className: 'st-evidence-cell st-evidence-cell-source' }, raw(pairedText(row.source))),
        h('span', { role: 'cell', className: 'st-evidence-cell st-evidence-cell-limitation' }, raw(pairedText(row.limitation)))))))

    // ⑤ 证据新鲜度 / Drift：只报「这份证据绑的是哪一份 fingerprint」，不判新鲜或过期。
    const drift = h('section', {
      className: 'st-evidence-block',
      'data-role': 'evidence-drift',
      'data-state': model.drift.state,
    },
    h('h4', null, raw(localized('证据新鲜度 · Skill Drift', 'Evidence freshness · Skill drift'))),
    h('div', { className: 'st-evidence-drift' },
      h('div', { className: 'st-evidence-drift-col' },
        h('span', { className: 'st-evidence-drift-label' }, raw(localized('当前 Skill 的 fingerprint', 'Fingerprint of the current Skill'))),
        h('code', null, model.drift.currentFingerprint)),
      h('div', { className: 'st-evidence-drift-col' },
        h('span', { className: 'st-evidence-drift-label' }, raw(localized('证据绑定的 fingerprint', 'Fingerprint the evidence is bound to'))),
        h('code', null, model.drift.latestEvidenceFingerprint))),
    h('p', { className: 'st-evidence-drift-claim' }, raw(pairedText(model.drift.claim))),
    h('p', { className: 'st-evidence-note' }, raw(localized(
      `本次可用的 Case ${model.drift.caseCount} 个 · Run ${model.drift.runCount} 条。${pairedText(model.drift.note)}`,
      `${model.drift.caseCount} case(s) and ${model.drift.runCount} run(s) are available. ${pairedText(model.drift.note)}`,
    ))),
    limitationList(model.drift.limitations))

    // ⑥ Evaluation → Evidence：条件逐项列出，拿不到就写 unavailable；对照只在条件一致时才成立。
    const evaluationTabs = [
      ['current', '本次 Run', 'Current run'],
      ['history', '历史 Run', 'Run history'],
      ['comparison', '对照', 'Comparison'],
    ]
    const conditions = model.evaluation.conditions
    const comparability = model.evaluation.comparability
    const evaluationBody = evaluationTab === 'history'
      ? (runs.length > 0
        ? h('ul', { className: 'st-evidence-runs' }, ...runs.map((run, index) => h('li', {
          key: run?.runId ?? `run-${index}`,
          className: 'st-evidence-run',
          'data-run': String(run?.runId ?? ''),
        },
        h('span', { className: 'st-evidence-run-id' }, String(run?.runId ?? EVIDENCE_UNAVAILABLE_TEXT)),
        h('span', { className: 'st-evidence-run-note' }, raw(localized(
          `指纹 ${run?.observedInstructionSha256 ?? EVIDENCE_UNAVAILABLE_TEXT} · 与当前文件 ${run?.match ?? EVIDENCE_UNAVAILABLE_TEXT}`,
          `Fingerprint ${run?.observedInstructionSha256 ?? EVIDENCE_UNAVAILABLE_TEXT} · against the file ${run?.match ?? EVIDENCE_UNAVAILABLE_TEXT}`,
        ))))))
        : h('p', { className: 'st-evidence-note' }, raw(localized('当前没有可展示的 Run。', 'There is no run to show yet.'))))
      : evaluationTab === 'comparison'
        ? h('div', { className: 'st-evidence-comparison', 'data-status': comparability.status },
          h('p', { className: 'st-evidence-comparison-claim' }, raw(comparability.comparable
            ? localized('同一个 Case、条件逐项一致：允许把两次运行摆在一起看差异。', 'Same case and matching conditions: the two runs can be shown side by side.')
            : localized('阻断结论 · Not Comparable：条件不一致时只摆差异，不生成「提升 / 下降」这类结论。',
              'Blocked · not comparable: conditions differ, so differences are shown without any improvement claim.'))),
          comparability.blockers.length > 0
            ? h('ul', { className: 'st-evidence-blockers' }, ...comparability.blockers.map((blocker, index) => h('li', {
              key: `${blocker.id}-${index}`,
              'data-blocker': blocker.id,
            }, raw(`${blocker.label.zh || blocker.label.en || blocker.id}：${blocker.before} → ${blocker.after}`))))
            : null)
        : h('div', { className: 'st-evidence-conditions' },
          h('ul', { className: 'st-evidence-condition-list' },
            ...conditions.map((entry) => h('li', {
              key: entry.id,
              className: 'st-evidence-condition',
              'data-condition': entry.id,
              'data-value': entry.value,
            },
            h('span', { className: 'st-evidence-condition-label' }, raw(pairedText(entry.label))),
            h('code', null, String(entry.value))))),
          h('p', { className: 'st-evidence-note' }, raw(localized(
            `判断来源：${model.evaluation.outcome.status === 'observed' ? model.evaluation.outcome.source : '当前没有判断记录'}`,
            `Judgement source: ${model.evaluation.outcome.status === 'observed' ? model.evaluation.outcome.source : 'none recorded yet'}`,
          ))))

    const evaluationBlock = h('section', { className: 'st-evidence-block', 'data-role': 'evidence-evaluation' },
      h('h4', null, raw(localized('Evaluation → Evidence', 'Evaluation → evidence'))),
      h('div', { className: 'st-seg', 'data-role': 'evidence-evaluation-tabs' },
        ...evaluationTabs.map(([id, zh, en]) => h('button', {
          key: id,
          type: 'button',
          className: 'st-seg-item',
          'data-active': evaluationTab === id ? 'true' : 'false',
          'data-role': `evidence-tab-${id}`,
          'aria-current': evaluationTab === id ? 'true' : undefined,
          onClick: () => setEvaluationTab(id),
        }, raw(localized(zh, en))))),
      evaluationBody)

    return h('section', { className: 'st-detail-card st-evidence', 'data-role': 'skill-evidence' },
      head, hero, identityBlock, chain, table, drift, evaluationBlock)
  }

  function SkillDetailPage({ sessionId, skillName, skill: suppliedSkill, modification: suppliedModification, instanceTest: suppliedInstanceTest, evaluation: suppliedEvaluation, initialModule }) {
    const [fetched, setFetched] = React.useState(null)
    const [loading, setLoading] = React.useState(!suppliedSkill)
    const [error, setError] = React.useState('')
    const [tab, setTab] = React.useState('original')
    // v1.1：详情级导航当前停在哪个模块。
    //
    // 默认 `'framework'`（Skill 框架）—— 它是理解一个 Skill 的第一入口。这只是默认值：
    // 点「Skill 验收」就立刻显示验收，点「SKILL.md」就立刻显示原始文档，中间没有任何过渡页。
    //
    // 这个 state 与 `tab` 是两件事：`tab` 是 SKILL.md 模块**内部**的原文/译文切换，
    // 而这里是模块之间的切换。合在一起会让「切到验收」变成「顺便改了文档显示方式」。
    //
    // 它必须排在第一个提前 return 之前：hooks 顺序是渲染合同（§6.11，HOOK_ORDER_OK）。
    //
    // `initialModule` 是第五条注入缝，与上面四个 `supplied*` 同一种用法：渲染烟测的 React 桩
    // 里 `useState` 不会重渲染，所以「用户点了某一维之后那一屏长什么样」只能靠**指定初始值**来
    // 渲染。不传就是 `'framework'`，也就是真实用户进来看到的第一屏。
    const [detailModule, setDetailModule] = React.useState(initialModule ?? 'framework')
    const [translation, setTranslation] = React.useState({ state: 'idle', text: '', sha: '', error: '' })
    const [flash, setFlash] = React.useState('')
    const [activeHeading, setActiveHeading] = React.useState('')
    const [cloneOpen, setCloneOpen] = React.useState(false)
    // v0.8：差异面板与它的数据。`status` 只要一侧 `comparison.source` 就够演进卡那一行用；
    // 面板打开时复用同一份响应，不为了一句话再打一次路由。
    const [diffOpen, setDiffOpen] = React.useState(false)
    const [diffState, setDiffState] = React.useState({ phase: 'idle', diff: null, error: '' })
    const diffOpenRef = React.useRef(null)
    // v0.9.1：一次「修改 Skill」事务的界面状态。`modification` 是和 `skill` / `diff` 同一种注入缝
    // —— 渲染烟测的 React 桩不跑 `useEffect`，所以这一帧必须能由 props 直接给出来。
    const [modifyOpen, setModifyOpen] = React.useState(false)
    const [modifyState, setModifyState] = React.useState(() => suppliedModification ?? { phase: 'idle' })
    // v0.10.0：实例验收与 `modification` 同一种注入缝（React 桩不跑 `useEffect`）。
    // 它只是前端状态：刷新页面就没了，重新生成一次即可 —— 这里不存测试历史（§十二）。
    const [instanceTest, setInstanceTest] = React.useState(() => suppliedInstanceTest ?? { phase: 'idle' })
    // v1.0：评测。它也只活在页面上 —— Case 的**身份由宿主算**（客户端不许自己 sha256），
    // 要落到本机得用户点一次「保存到本机」；`runs` 是这一次页面会话里记下来的运行。
    const [evaluation, setEvaluation] = React.useState(() => suppliedEvaluation ?? ({ ...EVALUATION_INITIAL_STATE }))
    // 用户这次说的修改意图。它是实例验收的六样输入之一，但**只活在页面上**：宿主不回传它，
    // 插件也不落盘 —— 页面一刷新就没了，那时生成器照样能跑（只少一样来源，trace 里如实少一项）。
    const [lastIntent, setLastIntent] = React.useState('')
    const modifyOpenRef = React.useRef(null)
    const docRef = React.useRef(null)
    const scrollRef = React.useRef(null)
    const flashTimer = React.useRef(null)

    React.useEffect(() => {
      if (suppliedSkill) return undefined
      let cancelled = false
      setLoading(true)
      setError('')
      setTab('original')
      api(`/skill?sessionId=${encodeURIComponent(sessionId)}&skillName=${encodeURIComponent(skillName)}`)
        .then((body) => { if (!cancelled) { setFetched(body?.skill ?? null); setLoading(false) } })
        .catch((reason) => { if (!cancelled) { setError(String(reason?.message || 'unavailable')); setLoading(false) } })
      return () => { cancelled = true }
    }, [sessionId, skillName, suppliedSkill])

    const detail = suppliedSkill ?? fetched
    const definition = detail?.definition ?? null
    const outline = React.useMemo(() => (Array.isArray(definition?.outline) ? definition.outline : []), [definition])
    const content = definition?.content ?? null
    const translatedOutline = React.useMemo(
      () => (tab === 'translated' ? alignOutlineToTranslation(translation.text, outline) : null),
      [tab, translation.text, outline],
    )
    const summary = detail?.summary ?? null
    const repository = detail?.repository ?? definition?.repository ?? null
    // v0.8：血缘是宿主给出的**事实**，客户端不推断、不比对、不问相似度。`null` 就是
    // 「本插件没有执行过这次复刻」——手动复制与用户自建都落在这一格（`FR-EVO-001`）。
    const lineage = detail?.lineage ?? null
    // v0.8：老宿主（内存里还是 v0.7 那一代代码）的详情响应里**没有** `lineage` 这个键，
    // 而「确实没有复刻过」是 `lineage: null`。两者不能都渲染成同一句话（§6.11）。
    const lineageFieldMissing = Boolean(detail) && !Object.prototype.hasOwnProperty.call(detail, 'lineage')
    // v0.9.0：验收结果是宿主在同一份详情响应里给的**规范事实**（不是分数、不是判断）。
    // 同一条纪律：老宿主（内存里还是 v0.8 那一代代码）根本没有 `validation` 这个键，
    // 「字段缺失」与「这份 Skill 读不到」必须说成两句不同的话（§6.11）。
    const validation = detail?.validation ?? null
    const validationFieldMissing = Boolean(detail) && !Object.prototype.hasOwnProperty.call(detail, 'validation')
    const runs = Array.isArray(detail?.runs) ? detail.runs : []
    const observation = detail?.observation ?? null
    const definitionUnavailable = Boolean(definition) && definition.available !== true
    const definitionReason = definition?.reason ?? 'unknown'
    const snapshot = runs[0]?.definitionSnapshot ?? null
    const observedHash = snapshot?.observedInstructionSha256 ?? observation?.observedInstructionSha256 ?? null
    const currentHash = snapshot?.currentInstructionSha256 ?? observation?.currentInstructionSha256 ?? null
    // 三个状态里 `unavailable` 是第一等公民：缺一半哈希就是「无法比对」，既不能写成 mismatch，
    // 也不能写成「Skill 已失效」——那是从缺失推出的结论（§10）。
    const matchState = snapshot?.match || observation?.match || 'unavailable'
    const sha = content?.sha256 ?? ''

    // 只有真的复刻过的 Skill 才去问差异。没有血缘时**不发这个请求**：那个 Skill 没有
    // 可比的对象，问一次只会换回一句「没有来源」，还要让用户在页面上等它。
    //
    // 拿整份响应而不是只拿 `source`：这一句状态与面板要的是同一次计算，
    // 打两次会把「同一个问题有两个答案」变成可能（两次读盘之间来源可能被改）。
    React.useEffect(() => {
      if (!lineage) { setDiffState({ phase: 'idle', diff: null, error: '' }); return undefined }
      let cancelled = false
      setDiffState({ phase: 'loading', diff: null, error: '' })
      api(`/diff?sessionId=${encodeURIComponent(sessionId)}&skillName=${encodeURIComponent(skillName)}`)
        .then((body) => { if (!cancelled) setDiffState({ phase: 'ready', diff: body, error: '' }) })
        .catch((reason) => { if (!cancelled) setDiffState({ phase: 'error', diff: null, error: String(reason?.message || 'unavailable') }) })
      return () => { cancelled = true }
    }, [sessionId, skillName, lineage ? lineage.lineageId : null])

    // ── v1.0 评测：三个请求，全部落在同一条路由上（宿主按 `action` 分派）。
    //    `caseId` 由宿主从 `hashInput` 算；条件与指纹由宿主从会话日志与收据里取。
    //    客户端只回传它才有的两样东西：人点出来的判定、人写下的结论。
    const evalPost = (action, payload) => api('/evaluation', {
      method: 'POST',
      body: JSON.stringify({ sessionId, action, ...payload }),
    })

    // 打开页面时问一次本机有没有这个 Skill 的评测 Case：`case-list` 只给身份摘要，
    // 挑出最近更新的那一份再 `case-read`（它一次把 runs 也带回来）。**没有 Case 不是错误** ——
    // 空态自己会说「还没有」，这里绝不弹红字（§6.11：缺和错不能长成同一张脸）。
    React.useEffect(() => {
      let cancelled = false
      setEvaluation((previous) => (previous.caseRecord ? previous : { ...previous, phase: 'loading', message: '', error: '' }))
      evalPost('case-list', { skillName })
        .then((body) => {
          const rows = Array.isArray(body?.cases) ? body.cases : []
          // 宿主已经按 `updatedAt` 倒序回过（`listCases()`），这里只挑第一条**有身份**的。
          // 再排一次会变成 `String(毫秒数).localeCompare(...)` —— 把数字当字符串比，不保险。
          const row = rows.find((entry) => entry && typeof entry.caseId === 'string' && entry.caseId) ?? null
          if (!row) {
            if (!cancelled) setEvaluation((previous) => (previous.caseRecord ? previous : { ...EVALUATION_INITIAL_STATE }))
            return null
          }
          return evalPost('case-read', { caseId: row.caseId })
        })
        .then((body) => {
          if (cancelled || !body) return
          const record = body.case && typeof body.case === 'object' ? body.case : null
          if (!record) return
          setEvaluation({
            ...EVALUATION_INITIAL_STATE,
            phase: 'ready',
            caseRecord: record,
            caseId: typeof record.caseId === 'string' ? record.caseId : '',
            runs: Array.isArray(body.runs) ? body.runs : [],
            saved: true,
            warningCount: Number(body.warningCount) || 0,
          })
        })
        .catch((reason) => {
          if (!cancelled) setEvaluation((previous) => ({ ...previous, phase: 'error', error: String(reason?.message || 'unavailable') }))
        })
      return () => { cancelled = true }
    }, [sessionId, skillName])

    // 定义换了（重新加载、切 Skill）就换一份译文：一份对不上屏幕正文的译文比没有译文更糟。
    // 依赖是 `skillName` + 指纹，不是 `detail` 对象 —— 同一个定义的两次读取不该清掉译文。
    // 先看内存里有没有：翻译要跑一到三分钟，切走再切回来重跑一遍是浪费用户的等待。
    React.useEffect(() => {
      const cached = sha ? readCachedTranslation(translationCacheKey(sessionId, skillName, sha)) : null
      if (cached) {
        // 回到一个已经翻好的 Skill，直接把中文摆出来 —— 用户切回来想看的正是它。
        setTranslation(cached)
        setTab('translated')
        return undefined
      }
      setTranslation({ state: 'idle', text: '', sha: '', error: '' })
      setTab('original')
      // 内存里没有就问本机。中文阅读版是**跨会话**资产：退出 DSH 再进来应该还在，
      // 否则用户每开一次 DSH 都要等一到三分钟重新翻同一份文档（v0.7 §6）。
      // 指纹对不上的旧译文宿主不会返回 —— 界面因此不可能把上一版的中文配给这一版的原文。
      if (!sha) return undefined
      let cancelled = false
      api(`/translation?skillName=${encodeURIComponent(skillName)}&sourceSha256=${encodeURIComponent(sha)}&targetLanguage=zh-CN`)
        .then((body) => {
          if (cancelled) return
          const record = body?.translation
          const text = typeof record?.translation === 'string' ? record.translation : ''
          if (!text) return
          const stored = {
            state: 'ready',
            text,
            sha,
            error: '',
            saved: true,
            chunkCount: Number(record.chunkCount) || 0,
            fallbackChunks: Number(record.fallbackChunks) || 0,
            fallbackReasons: Array.isArray(record.fallbackReasons) ? record.fallbackReasons : [],
          }
          // 顺手放进内存缓存：同一次会话里再切回来不必再问一次宿主。
          writeCachedTranslation(translationCacheKey(sessionId, skillName, sha), stored)
          setTranslation(stored)
          setTab('translated')
        })
        .catch(() => {
          // 读不到就是没有中文：不弹错误、不阻塞渲染。对用户来说「没存过」与
          // 「存过但这次读不出来」是同一件事 —— 现在没有中文，点翻译即可。
        })
      return () => { cancelled = true }
    }, [sessionId, skillName, sha])

    const flashAnchor = React.useCallback((anchorId) => {
      if (!anchorId) return
      if (flashTimer.current) clearTimeout(flashTimer.current)
      setFlash(anchorId)
      flashTimer.current = setTimeout(() => setFlash(''), DOC_FLASH_MS)
      // `scrollIntoView` 要等这一轮渲染落下节点，所以放到下一帧。
      requestAnimationFrame(() => {
        const node = docRef.current?.querySelector(`#st-audit-doc-${escapeSelector(anchorId)}`)
        node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    }, [])

    const runTranslation = React.useCallback(() => {
      if (!sessionId || !skillName || !sha) return
      setTranslation({ state: 'loading', text: '', sha, error: '' })
      api('/translate', {
        method: 'POST',
        body: JSON.stringify({ sessionId, skillName, sourceSha256: sha, targetLanguage: 'zh-CN' }),
      })
        .then((body) => {
          // 宿主的线格式是 `{translation: string, sourceSha256: string}` —— 译文是字符串，
          // 指纹在顶层，不在译文对象里。这里按实测形状读，别按想象读。
          const text = typeof body?.translation === 'string' ? body.translation : ''
          // 宿主在翻译期间复查过指纹；它说变了就是变了，这份译文作废（§10 / §12.4）。
          // 失败时把分段控件退回「原文」：屏幕上显示的是原文，控件就该说原文。留一个亮着的
          // 「中文预览」配一段英文正文，是同一屏上两个互相矛盾的说法 —— 错误提示已经说明
          // 发生了什么，重新点「中文预览」就会重试。
          if (!text) {
            setTranslation({ state: 'error', text: '', sha, error: 'empty-translation' })
            setTab('original')
            return
          }
          if (body?.sourceSha256 && body.sourceSha256 !== sha) {
            setTranslation({ state: 'error', text: '', sha, error: 'definition-changed' })
            setTab('original')
            return
          }
          // 宿主逐段翻译，有段落回退到原文时**必须说出来**：界面若声称「已翻译」
          // 而正文里躺着一段英文，那是在无声地骗用户。
          const settled = {
            state: 'ready',
            text,
            sha,
            error: '',
            // 宿主只有在**真的写进本机存储之后**才回 `saved: true`。界面靠这个布尔值
            // 决定说不说「已保存」—— 凭"我发起了写入"来说，就是 design.md §8.5 里
            // 那条「点击不等于完成」的错误。
            saved: body?.saved === true,
            chunkCount: Number(body?.chunkCount) || 0,
            fallbackChunks: Number(body?.fallbackChunks) || 0,
            fallbackReasons: Array.isArray(body?.fallbackReasons) ? body.fallbackReasons : [],
          }
          writeCachedTranslation(translationCacheKey(sessionId, skillName, sha), settled)
          setTranslation(settled)
        })
        .catch((reason) => {
          setTranslation({ state: 'error', text: '', sha, error: String(reason?.message || 'translation-failed') })
          setTab('original')
        })
    }, [sessionId, skillName, sha])

    // §9.3：目录要「当前章节高亮」。用滚动位置算，而不是用事件监听器猜。
    const handleDocScroll = React.useCallback(() => {
      const node = scrollRef.current
      if (!node) return
      const top = node.scrollTop + 24
      let active = ''
      for (const entry of outline) {
        const element = node.querySelector(`#st-audit-doc-${escapeSelector(entry.id)}`)
        if (element && element.offsetTop - node.offsetTop <= top) active = entry.id
      }
      setActiveHeading(active)
    }, [outline])

    React.useEffect(() => {
      const node = scrollRef.current
      if (!node) return undefined
      node.addEventListener('scroll', handleDocScroll, { passive: true })
      handleDocScroll()
      return () => node.removeEventListener('scroll', handleDocScroll)
    }, [handleDocScroll, tab])

    if (loading && !detail) return h(TraceState, { kind: 'loading', message: '正在读取这个 Skill 的定义…' })
    if (error && !detail) return h(TraceState, { kind: 'error', message: '暂时无法读取这个 Skill 的定义。', onRetry: () => setError('') })

    const translated = tab === 'translated'
    const documentText = translated && translation.state === 'ready' ? translation.text : content?.text
    const documentOutline = translated && translatedOutline ? translatedOutline : outline
    const matchLabel = matchState === 'match' ? localized('一致', 'Match')
      : matchState === 'mismatch' ? localized('文件已改变', 'The file has changed')
        : localized('无法比对', 'Cannot be compared')

    const sideIdentity = h('section', { className: 'st-detail-card' },
      h('h3', null, raw(skillName)),
      summary?.description
        ? h('p', { className: 'st-detail-side-desc' }, raw(summary.description))
        : null,
      h('div', { className: 'st-detail-fact' },
        h('span', null, localized('调用方式', 'Invocation')),
        h('code', null, raw(invocationLabel(runs[0]?.invocationType)))),
      // v0.7 §八：详情页上**唯一**的对象级动作。没有编辑、没有创建、没有优化 —— 多摆一个
      // 竞争动作，用户就得先猜这两个按钮有什么区别，而答案往往是"没有"。
      h('button', {
        className: 'st-clone-open',
        type: 'button',
        disabled: !sha,
        title: sha ? undefined : localized('定义读不到指纹，无法复刻。', 'The definition has no fingerprint, so it cannot be cloned.'),
        onClick: () => setCloneOpen(true),
      }, raw(localized('复刻 Skill', 'Clone Skill'))))

    const sideDefinition = h('section', { className: 'st-detail-card' },
      h('h3', null, localized('Definition', 'Definition')),
      h('div', { className: 'st-detail-fact' }, h('span', null, localized('文件', 'File')), h('code', null, 'SKILL.md')),
      h('div', { className: 'st-detail-fact' },
        h('span', null, localized('当前指纹', 'Current fingerprint')),
        h('code', null, raw(sha ? shortHash(sha) : localized('读不到', 'unavailable')))),
      h('div', { className: 'st-detail-fact' },
        h('span', null, localized('本次使用', 'Used in this run')),
        h('code', null, raw(`${runs.length}`))),
      h('div', { className: 'st-detail-fact' },
        h('span', null, localized('定义来源', 'Definition source')),
        h('code', null, raw(`${summary?.source ?? '—'} · ${summary?.provider ?? '—'}`))),
      h('div', { className: 'st-detail-fact' },
        h('span', null, localized('指令指纹比对', 'Instruction fingerprint')),
        h('code', null, raw(matchLabel))),
      h('p', { className: 'st-detail-side-note' }, raw(definitionUnavailable
        ? localized('这份 Skill 的定义当前读不到，所以下面只有它的来源事实。', 'The definition cannot be read right now, so only its provenance facts are shown.')
        : `observed ${shortHash(observedHash) || '—'} · current ${shortHash(currentHash) || '—'}`)),
      definitionUnavailable && definitionReason === 'definition-changed'
        ? h('p', { className: 'st-detail-side-note' }, localized('定义在本次运行之后被改动过。', 'The definition changed after this run.'))
        : null)

    // 未解析就只留结论与理由：不放链接、不放按钮、也不放一个点不动的占位 ——「查不到」本身
    // 就是这条信息，给它配一个禁用的控件只会让人以为还能点。
    const repositoryLimitation = Array.isArray(repository?.limitations) && repository.limitations.length
      ? limitationLabel(repository.limitations[0])
      : ''
    const repositoryResolved = repository?.status === 'resolved' && Boolean(repository.label)
    const sideRepository = h('section', { className: 'st-detail-card' },
      h('h3', null, localized('Repository', 'Repository')),
      repositoryResolved
        ? h('div', null,
          h('p', { className: 'st-detail-side-desc' }, raw(repository.label)),
          repository.relativePath ? h('p', { className: 'st-detail-side-note' }, raw(repository.relativePath)) : null,
          repository.cloneCommand
            ? h('a', { className: 'st-detail-repo-link', href: repository.cloneCommand, target: '_blank', rel: 'noreferrer noopener' }, localized('打开仓库 ↗', 'Open repository ↗'))
            : null)
        : h('div', null,
          h('p', { className: 'st-detail-side-desc' }, localized('未解析', 'Not available')),
          h('p', { className: 'st-detail-side-note' }, raw(repositoryLimitation
            || localized('没有找到 git work tree，无法确定仓库来源。', 'No git work tree was found, so the repository source cannot be established.')))))

    const sideEvolution = h(SkillEvolution, {
      skillName,
      lineage,
      lineageFieldMissing,
      source: diffState.diff?.comparison?.source ?? null,
      // 相位要一起传：`source` 为 `null` 有「还没问」和「问到了但读不到」两种成因，
      // 卡片自己分不出来（`evolutionSourceState`）。
      diffPhase: diffState.phase,
      onOpenDiff: () => setDiffOpen(true),
      openRef: diffOpenRef,
      onOpenModify: () => setModifyOpen(true),
      modifyOpenRef,
    })

    // v1.1：左列 = **定位**（这是哪个 Skill、能对它做什么、要看哪个维度）；
    // 右列 = **阅读 / 分析**（当前那一个模块）。
    //
    // V1.0 的左列摆的是 Definition / Repository / 血缘三张事实卡，主列把六个模块纵向堆成一条
    // 长页面，找「Skill 评测」要往下滚过框架、运行逻辑和步骤证据。V1.1 把三张事实卡搬进
    // Definition 模块，把左列让给导航 —— 信息一条没少，少的是滚动。
    //
    // 详情级导航是**第二层**导航：一级导航（本次 Skill / 已安装 Skill）回答「我要看哪个
    // Skill」，它回答「我想从哪个维度理解这个 Skill」。没有新增路由、没有新增一级导航。
    //
    // 没有修改事务时「本次修改对比」整块不存在（§9.2：常驻的空卡会被读成一种状态），
    // 所以导航里也不留那一格。判据直接沿用 V1.0 那一版自己的分支 ——
    // `SkillModificationPanel` 在 `phase === 'idle'` 时返回 `null`。
    const hasModification = Boolean(modifyState) && modifyState.phase !== 'idle'
    const availableModules = DETAIL_MODULES.filter(([id]) => id !== 'modification' || hasModification)
    const sidePanel = h('aside', { className: 'st-detail-side' },
      sideIdentity,
      h(DetailNav, { active: detailModule, onSelect: setDetailModule, modules: availableModules }))

    const segControl = h('div', { className: 'st-seg', role: 'group', 'aria-label': 'SKILL.md 显示方式' },
      h('button', { type: 'button', 'data-active': !translated, onClick: () => setTab('original') }, localized('原文', 'Original')),
      h('button', {
        type: 'button',
        'data-active': translated,
        onClick: () => { setTab('translated'); if (translation.state !== 'ready') runTranslation() },
      }, localized('中文阅读版', 'Chinese reading version')))

    const translateButton = h('button', {
      type: 'button',
      className: 'st-translate',
      disabled: translation.state === 'loading' || definitionUnavailable || !sha,
      onClick: runTranslation,
    }, translation.state === 'loading' ? localized('翻译中…', 'Translating…')
      : translation.state === 'ready' || translation.state === 'error' ? localized('重新翻译', 'Translate again')
        : localized('翻译', 'Translate'))

    const docHeader = h('header', { className: 'st-detail-doc-head' },
      h('div', { className: 'st-detail-doc-title' },
        h('strong', null, 'SKILL.md'),
        h('p', null, localized('只读展示 · 原文不会被修改', 'Read-only · the original file is never modified'))),
      segControl,
      translateButton)

    const docNotice = h('p', { className: 'st-translate-notice' }, raw(translated
      ? localized('中文阅读版只用于当前页面阅读，不会写回 SKILL.md，也不会进入这次对话。它保存在本机，退出 DeepSeek Harness 后再打开同一个 Skill 仍然在。', 'This reading version is shown on this page only: it is never written back to SKILL.md and never added to the conversation. It is kept on this machine, so it is still there the next time you open the same Skill.')
      : localized('原文逐字来自 Skill 定义文件；这里不做任何改写。', 'The original text comes from the Skill definition file verbatim; nothing here rewrites it.')))

    const translationState = translation.state === 'loading'
      // 分段翻译后这是一次**多段**调用，比原来的单次调用慢。等待时若不说清楚，用户会
      // 以为界面卡死了 —— 而"以为卡死"的下一个动作通常是刷新，那会把进度全丢掉。
      ? h('p', { className: 'st-translate-error' }, raw(localized('正在逐段翻译…整份文档会分成若干段依次翻译，可能需要一到三分钟。翻译完成后会保存在本机。', 'Translating segment by segment — a long definition is split into several parts and translated in order, which can take one to three minutes. The result is saved on this machine.')))
      : translation.state === 'error'
        ? h('p', { className: 'st-translate-error' }, raw(localized('翻译没有完成。可以重试，原文不受影响。', 'Translation did not finish. You can retry; the original is unaffected.')))
        : translation.state === 'ready' && translation.fallbackChunks > 0
          // 部分成功也要说清楚，并给出段数：用户能自己数出哪几段还是英文。
          // 2026-10-01 起还要说**为什么** —— 上一次真实故障只报「有几段没成功」，
          // 原因只能靠事后跑探针才看出来，那是把诊断成本推给了用户。
          ? h('p', { className: 'st-translate-error' }, raw(localized(
            `有 ${translation.fallbackChunks} 段没有翻译成功${fallbackReasonSuffix(translation.fallbackReasons)}，那几段显示的是原文。其余已翻译。`,
            `${translation.fallbackChunks} section(s) could not be translated${fallbackReasonSuffixEn(translation.fallbackReasons)} and are shown in the original language; the rest is translated.`,
          )))
          : null

    // 成功态只在**宿主确认写进去了**之后出现。没存上就说没存上，而不是干脆不提 ——
    // 下次进来发现中文没了，用户需要知道那次是"没保存"还是"被删了"。
    const translationSaved = translation.state === 'ready'
      ? h('p', { className: 'st-translate-saved', 'data-saved': translation.saved === true ? 'yes' : 'no' }, raw(translation.saved === true
        ? localized('✓ 中文阅读版已保存（本地保存）', '✓ Chinese reading version saved (locally)')
        : localized('中文阅读版没有保存到本机，下次打开需要重新翻译。', 'The reading version was not saved on this machine; you will need to translate again next time.')))
      : null

    // §9.3：Outline 只做文档导航，不再表达"执行流程"。
    const outlineNav = outline.length
      ? h('nav', { className: 'st-detail-outline', 'aria-label': localized('文档目录', 'Document contents') },
        ...outline.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          className: 'st-detail-outline-item',
          'data-level': entry.level,
          'data-active': activeHeading === entry.id || flash === entry.id ? 'true' : undefined,
          onClick: () => flashAnchor(entry.id),
        }, raw(entry.title))))
      : null

    const documentBlocks = documentText
      ? renderSkillMarkdown(documentText, documentOutline, flash, null)
      : [h('p', { key: 'empty', className: 'st-audit-empty' }, raw(definitionUnavailable
        ? localized('这份 Skill 的定义当前读不到，所以没有正文可以显示。', 'The definition cannot be read right now, so there is no document to show.')
        : localized('这份 Skill 没有可显示的正文。', 'This Skill has no document to show.')))]

    const documentScroll = h('div', { className: 'st-detail-doc-scroll', ref: scrollRef },
      h('div', { className: 'st-audit-doc st-detail-doc-inner', ref: docRef }, ...documentBlocks))

    const docPanel = h('section', { className: 'st-detail-doc' },
      docHeader,
      docNotice,
      // 失败后分段控件会退回「原文」，但**错误本身必须留在屏幕上**：一次静默失败比一次
      // 摆在明面上的失败糟得多 —— 用户点过「中文预览」，他就得知道那一下没成。
      translationState,
      translationSaved,
      h('div', { className: 'st-detail-doc-body' }, outlineNav, documentScroll))

    // 四层分开摆：框架（这个 Skill 由什么组成）→ 运行逻辑（这次会话观察到什么）→ 步骤证据
    // （声明步骤各自有什么）→ SKILL.md 原文。它们以前挤在一张「流程图」里，于是 ui-craft
    // 那样 11 个小节的 Skill 只显示成 4 步；分层之后，一张卡只说一件事。
    const framework = h(SkillFramework, {
      framework: detail?.framework ?? null,
      flow: detail?.flow ?? null,
      anchors: detail?.anchors ?? null,
      definitionAvailable: Boolean(definition) && definition.available === true,
      flash,
      onStepClick: flashAnchor,
      onAnchorClick: flashAnchor,
    })

    const runtimeLogic = h(RuntimeLogic, { runtimeLogic: detail?.runtimeLogic ?? null })
    const stepEvidence = h(StepEvidence, { flow: detail?.flow ?? null })

    // 关闭后焦点回到打开它的那个按钮（`FR-EVO-018`）。浮层是**局部 UI 状态**：
    // 按 Esc 不该等于后退，也不该把用户送回列表页 —— 他只是关掉一个面板。
    const closeDiff = () => {
      setDiffOpen(false)
      const target = diffOpenRef.current
      if (target && typeof target.focus === 'function') target.focus()
    }

    // v0.9.1：同一条纪律 —— 关闭对话框后焦点回到「修改 Skill」。
    const closeModify = () => {
      setModifyOpen(false)
      const target = modifyOpenRef.current
      if (target && typeof target.focus === 'function') target.focus()
    }

    // 「交给 Agent」成功 = 一条带协议的修改任务已经发到**当前会话**，接下来是 Agent 在
    // 原生对话里读文件、提方案、问一次、再改。界面从这一刻起不轮询、不假装知道对方什么时候
    // 收工，只把「对比本次修改」摆在那里，由用户决定什么时候看结果。
    const onDispatched = (body, dispatchedIntent) => {
      setModifyOpen(false)
      // 这次说的话要留下来：实例验收要按「用户想怎么改」对齐任务形状（规格 §18.1）。
      setLastIntent(typeof dispatchedIntent === 'string' ? dispatchedIntent : '')
      setModifyState({ phase: 'waiting' })
    }

    const compareModification = () => {
      setModifyState({ phase: 'loading' })
      api('/modify', {
        method: 'POST',
        body: JSON.stringify({ sessionId, skillName, action: 'compare' }),
      })
        .then((body) => {
          setModifyState({
            phase: 'ready',
            comparison: body?.comparison ?? null,
            released: body?.released === true,
          })
          // 这一次响应顺带带回了最新的验收结果，直接换掉，不必再打一次 `/skill`：
          // 两次读盘之间文件可能又变了，同一份事实只该有一个来源。
          if (body && Object.prototype.hasOwnProperty.call(body, 'validation')) {
            setFetched((previous) => (previous ? { ...previous, validation: body.validation } : previous))
          }
        })
        .catch((reason) => {
          setModifyState({ phase: 'error', error: String(reason?.message || 'unavailable') })
        })
    }

    // 实例验收的生成入口。它是一支纯函数：喂进去的是规格 §18.1 的那六样 —— 用户这次的修改意图、
    // 修改范围、改动前后的对比、Skill 自己的正文与描述、宿主解析好的框架结构、静态验收结论。
    // 出来一段 Prompt；没有任何网络调用、没有模型、没有第二次读盘，所以「生成」永远不可能
    // 悄悄改变别的状态。（意图只用于对齐任务形状与记录来源，**一个字都不进 Prompt** ——
    // 把「你刚才改了什么」写进 Prompt，等于在 Prompt 里把 Skill 该怎么做重新教一遍。）
    const generateInstanceTest = () => {
      const built = buildSkillInstanceTest({
        skillName,
        intent: lastIntent || null,
        comparison: modifyState?.comparison ?? null,
        definitionText: content?.text ?? null,
        description: summary?.description ?? null,
        framework: detail?.framework ?? null,
        validation: validation ?? null,
      })
      setInstanceTest(built.available
        ? { phase: 'ready', test: built }
        : { phase: 'unavailable', test: built, message: built.message })
    }

    // v1.0：评测 Case 的生成入口。和实例验收同一份输入 —— 它不重算 V0.10 已经算过的东西，
    // 只是把「这一次修改」固化成能反复用的用例。Case 绑的是**当前文件**那一版指纹：
    // `currentHash` 与 `content.sha256` 都是它，都拿不到就交给纯函数降级成 `unavailable`
    // （不许从观察到的那几版里随便挑一个，那会让这个字段看起来比实际更确定）。
    const generateEvaluationCase = () => {
      const boundFingerprint = (typeof currentHash === 'string' && currentHash) || sha || null
      const built = buildEvaluationCase({
        skillName,
        intent: lastIntent || null,
        comparison: modifyState?.comparison ?? null,
        definitionText: content?.text ?? null,
        description: summary?.description ?? null,
        framework: detail?.framework ?? null,
        validation: validation ?? null,
        skillFingerprint: { instructionSha256: boundFingerprint, match: matchState },
      })
      setEvaluation((previous) => (built.available
        ? {
          ...previous,
          phase: 'ready',
          // 刚生成的 Case 在本机上**还没有身份**：`caseId` 要宿主从 `hashInput` 算出来，
          // 客户端不许自己 sha256。`caseId: ''` 就是「还没保存」，不是「身份是空字符串」。
          caseRecord: { ...built.case, caseId: '' },
          caseId: '',
          hashInput: built.hashInput,
          // 身份还没落盘，之前那些运行记录属于**另一份身份**，不能顺手贴到这一份上。
          runs: [],
          // 角色标记跟着 runs 一起清：`runRoles` 的键是 runId，留着别人的标记只会张冠李戴。
          runRoles: {},
          runRole: 'after',
          saved: false,
          message: '',
          error: '',
        }
        : { ...previous, phase: 'unavailable', caseRecord: null, caseId: '', hashInput: null, runs: [], runRoles: {}, runRole: 'after', saved: false, message: built.message, error: '' }))
    }

    const saveEvaluationCase = () => {
      const record = evaluation.caseRecord
      const hashInput = evaluation.hashInput
      if (!record || typeof hashInput !== 'string' || !hashInput) return
      setEvaluation((previous) => ({ ...previous, phase: 'saving', message: '', error: '' }))
      // 已经保存过的那一份会把 `caseId` 一起回传：宿主拿它和按内容重算的结果对一对，
      // 对不上就拒收 —— 那条 400 正是「页面上的内容已经变了」的检测器。所以重算过 Case
      // 之后必须把旧的 `caseId` 丢掉（上面生成时就是这么做的），否则这条检测器会误报。
      evalPost('case-save', { case: { ...record, skillName }, hashInput })
        .then((body) => {
          const caseId = typeof body?.caseId === 'string' ? body.caseId : ''
          setEvaluation((previous) => ({
            ...previous,
            phase: 'ready',
            caseId,
            caseRecord: { ...previous.caseRecord, caseId },
            saved: true,
            message: localized('这个 Case 已经保存到本机。', 'This case is saved on this machine.'),
            error: '',
          }))
        })
        .catch((reason) => {
          setEvaluation((previous) => ({ ...previous, phase: 'error', error: String(reason?.message || 'unavailable') }))
        })
    }

    const captureEvaluationRun = () => {
      if (typeof evaluation.caseId !== 'string' || !evaluation.caseId) return
      // 这一条算哪一版：请求发出去之前先记住，响应回来时界面上的默认值可能已经翻了面。
      const role = evaluation.runRole === 'before' ? 'before' : 'after'
      setEvaluation((previous) => ({ ...previous, phase: 'capturing', message: '', error: '' }))
      // 条件和指纹由宿主取（它会去读会话日志与收据）；这里只提交 `judgements` 与 `outcome`。
      // 结果那栏留空时提交的 `text` 是空字符串，宿主按 `FR-EVAL-015` 记成 `unavailable` ——
      // 「还没判」与「判成失败」在界面上永远不是同一句话。
      evalPost('run-capture', {
        caseId: evaluation.caseId,
        outcome: evaluation.outcome,
        judgements: evaluation.judgements,
      })
        .then((body) => {
          const run = body?.run && typeof body.run === 'object' ? body.run : null
          const runId = run && typeof run.runId === 'string' ? run.runId : ''
          setEvaluation((previous) => ({
            ...previous,
            phase: 'ready',
            runs: run ? [run, ...previous.runs] : previous.runs,
            runRoles: runId ? { ...previous.runRoles, [runId]: role } : previous.runRoles,
            // 记完一条就把默认翻到另一版：要对照就得两版各有一条，而不是同一条点两次。
            runRole: role === 'after' ? 'before' : 'after',
            message: localized('这一次运行已经记下来了。', 'This run has been recorded.'),
            error: '',
          }))
        })
        .catch((reason) => {
          setEvaluation((previous) => ({ ...previous, phase: 'error', error: String(reason?.message || 'unavailable') }))
        })
    }

    // 判定按钮：`pass` / `fail` / `unknown` 由人点，插件一个都不判。再点一次同一个按钮
    // 就是撤掉这条判定（回到「还没判」）—— 所以传进来的空值是**删除**，不是「判成失败」。
    const judgeEvaluationObservation = (observationId, verdict) => {
      if (typeof observationId !== 'string' || !observationId) return
      if (verdict && !EVALUATION_VERDICT_IDS.includes(verdict)) return
      setEvaluation((previous) => {
        const judgements = { ...previous.judgements }
        if (verdict) judgements[observationId] = verdict
        else delete judgements[observationId]
        return { ...previous, phase: 'ready', message: '', error: '', judgements }
      })
    }

    // 结果那一栏：文本与来源都只由人给。来源只认 `user` / `agent`（`protocol` 不由人填，
    // 那是宿主从会话日志里读出来的东西）。
    const changeEvaluationOutcome = (patch) => {
      if (!patch || typeof patch !== 'object') return
      setEvaluation((previous) => {
        const next = { ...previous.outcome, ...patch }
        const source = EVALUATION_SOURCE_IDS.includes(next.source) && next.source !== 'protocol' ? next.source : 'user'
        return {
          ...previous,
          phase: 'ready',
          message: '',
          error: '',
          outcome: { source, text: typeof next.text === 'string' ? next.text : '' },
        }
      })
    }

    // 哪一条算改前 / 改后。`runId` 给了就改这一条的标记，没给就是改「下一条记哪一版」的默认值。
    const tagEvaluationRun = (role, runId) => {
      if (role !== 'before' && role !== 'after') return
      setEvaluation((previous) => (typeof runId === 'string' && runId
        ? { ...previous, phase: 'ready', message: '', error: '', runRoles: { ...previous.runRoles, [runId]: role } }
        : { ...previous, phase: 'ready', message: '', error: '', runRole: role }))
    }

    // v0.9.1：这一块只在一次修改事务里出现（`phase: 'idle'` 时它自己返回 `null`），
    // 排在验收卡后面 —— 那两句回答的是同一个问题：「这次改完，现在是什么样」。
    // 它必须写在两个处理器之后：`const` 是暂时性死区，往前挪一格就会在渲染那一帧抛
    // 「Cannot access 'compareModification' before initialization」，而那是整页白屏。
    const skillModification = h(SkillModificationPanel, {
      modification: modifyState,
      instanceTest,
      onCompare: compareModification,
      onGenerateInstanceTest: generateInstanceTest,
      onOpenModify: () => setModifyOpen(true),
    })

    // v1.0：评测卡排在「本次修改对比 / 实例验收」之后 —— 那两块说的是「这次改了什么」，
    // 它说的是「改完以后拿同一个 Case 跑两次看到了什么」。没有修改事务时它显示空态并说明
    // Case 从哪里来，不催用户去点一个注定失败的东西。
    const skillEvaluation = h(SkillEvaluationCard, {
      evaluation,
      canGenerate: Boolean(modifyState?.comparison),
      onGenerate: generateEvaluationCase,
      onSave: saveEvaluationCase,
      onCapture: captureEvaluationRun,
      onJudge: judgeEvaluationObservation,
      onOutcome: changeEvaluationOutcome,
      onRole: tagEvaluationRun,
    })

    // V1.2：证据模块复用**同一个** evaluation state（不另开一次请求，也不复制一份状态）——
    // 证据链里的 Case / Run / 条件应该和评测模块看到的是同一份事实。
    // 「查看当前评测」只切模块，不新开 session、不新开页面。
    const skillEvidence = h(SkillEvidenceCard, {
      detail,
      evaluation,
      onOpenEvaluation: () => setDetailModule('evaluation'),
    })

    // v1.1：右列只渲染**当前**这一个模块。各维度的 element 都在上面构造好了，
    // `h(Component, props)` 只是建元素、不调用组件 —— 所以没被选中的那几个这一帧是空转，
    // 比 V1.0 一次把六个块全部渲染出来更省，而不是更贵。
    //
    // 每一项都包一层 `[data-role="detail-module-<id>"]`：测试与守卫靠它确认「点哪个显示哪个」，
    // 不靠界面文案（文案会改，合同不该跟着改）。
    // 哪些维度这一帧真的存在，已在上面算好（`availableModules`）—— 判定与导航用的是同一个值，
    // 不会出现「导航里有这一格、点进去是空的」。
    const MODULE_CONTENT = {
      framework: [framework],
      'evidence-model': [skillEvidence],
      validation: [h(SkillValidationPanel, { validation, validationFieldMissing })],
      evaluation: [skillEvaluation],
      evidence: [stepEvidence],
      runtime: [runtimeLogic],
      modification: hasModification ? [skillModification] : [],
      // Definition 是**基础定义信息**，不是新的一级导航：文件、指纹、本次使用、定义来源、
      // repository 与血缘这三张卡一直是详情页上的事实，V1.1 只是把它们从左边挪进模块。
      // 数据模型没有重设计，渲染代码就是原来那三张卡。
      definition: [sideDefinition, sideRepository, sideEvolution],
      document: [docPanel],
    }

    const activeModule = availableModules.some(([id]) => id === detailModule) ? detailModule : 'framework'
    const moduleContent = h('div', {
      className: 'st-detail-module',
      'data-role': `detail-module-${activeModule}`,
      'data-module': activeModule,
    }, ...(MODULE_CONTENT[activeModule] ?? [framework]))

    return h('div', { className: 'st-detail' },
      h('div', { className: 'st-detail-body' }, sidePanel,
        h('div', { className: 'st-detail-main' }, moduleContent)),
      cloneOpen
        ? h(SkillCloneDialog, {
          sessionId,
          skillName,
          sourceSha256: sha,
          definitionAvailable: Boolean(definition) && definition.available === true,
          onClose: () => setCloneOpen(false),
        })
        : null,
      diffOpen
        ? h(SkillDiffPanel, {
          sessionId,
          skillName,
          // 已经在卡片那一步算好的就复用；没算好（还在读、或者上一次失败了）就由面板自己问一次 ——
          // 那正好也是一次重试。
          diff: diffState.phase === 'ready' ? diffState.diff : null,
          onClose: closeDiff,
        })
        : null,
      modifyOpen
        ? h(SkillModifyDialog, {
          sessionId,
          skillName,
          onClose: closeModify,
          onDispatched,
        })
        : null)
  }

  /**
   * v0.6 §7「已安装 Skill」。
   *
   * 它回答的是「当前 DSH 环境里能发现哪些 Skill」，所以**不读收据** —— 卡片上没有学习状态、
   * 验证状态、历史理解或 review queue。那些是 v0.5 的学习工作台，按 §4 从主模型消失。
   *
   * 端点缺席时必须说成**错误**，不能写成"没有 Skill"：宿主只在启动时装载一次插件，所以
   * "客户端已经更新、宿主进程还是旧版"会让这个页面读不到数据 —— 那是两种相反的事实
   * （同类事故见 resolveSkillListState 的注释）。整页崩溃更糟：一个页面拿到坏输入就把
   * conversation.view 整个卸载，用户看到的是白屏。
   */
  /**
   * 「加入本机」的时间戳：`MM-DD`，**只有跨年**才带年份。
   *
   * 2026-10-03（用户：「我交互体验将来只需要有月日就行」）：只到**日**，不再报时:分。
   * 丢掉的不是信息 —— 「谁更新」由**列表顺序**回答（同一份载荷里同一天的三条，卡片上的字
   * 一模一样，但顺序仍然是谁新谁在前），而卡片上那串时:分除了一闪而过的精确感之外没有
   * 任何可操作价值。跨年仍然带年份：`06-13` 与 `2025-06-13` 是两个不同的断言。
   *
   * 不写「今天 / 昨天」：那是相对**此时此刻**的说法，同一份载荷在不同时刻会读出不同的字，
   * 而这个页面要能被渲染测试逐字断言。绝对日期在任何时刻都是同一句话。
   */
  function formatAddedAt(value, now = Date.now()) {
    if (!Number.isFinite(value) || value <= 0) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (part) => String(part).padStart(2, '0')
    const stamp = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    return date.getFullYear() === new Date(now).getFullYear() ? stamp : `${date.getFullYear()}-${stamp}`
  }

  /**
   * v0.9.2 §7：已安装列表头那句「按什么排的」。
   *
   * 拆成纯 props 组件有两个理由，都不是审美：①页面组件的正文由 `useState` 决定，
   * 渲染冒烟测试的 React 桩不跑 `useEffect`；②顺序规则与「有多少个排不出来」都是**宿主
   * 算好的事实**（`installed.ordering`），客户端只负责把它念出来 —— 从看到的第一行倒推
   * 顺序、或者在客户端再排一次，都会让界面和宿主各说各话。
   *
   * 宿主给不出 `ordering`（旧宿主、或载荷被削过）时**什么都不说**：宁可少一句，也不能
   * 顺口宣称一个没人证实的顺序。
   */
  function InstalledOrderNote({ ordering, limitations }) {
    if (!ordering || typeof ordering !== 'object') return null
    const known = Number.isFinite(ordering.addedAtKnown) ? ordering.addedAtKnown : 0
    const unknown = Number.isFinite(ordering.addedAtUnknown) ? ordering.addedAtUnknown : 0
    const sentences = []
    if (known > 0) {
      sentences.push(localized(
        '按加入本机的时间倒序：最近加入的排在最前。',
        'Newest first: sorted by when each Skill was added to this machine.',
      ))
      if (unknown > 0) {
        sentences.push(localized(
          `另有 ${unknown} 个 Skill 读不到加入时间，按名称排在最后。`,
          `${unknown} more have no readable add time and are listed last, in name order.`,
        ))
      }
    } else {
      sentences.push(localized(
        '读不到加入本机的时间，这里按名称排列。',
        'No add time is readable on this machine, so this list is in name order.',
      ))
    }
    // 血缘读不到时单独说一句：卡片上少了「复刻自」那一行，不能让读者以为是「没复刻过」。
    if (Array.isArray(limitations) && limitations.includes('lineage-unavailable')) {
      sentences.push(localized(
        '读不到复刻记录，所以卡片上没有「复刻自」那一行。',
        'The clone records could not be read, so no card shows where it came from.',
      ))
    }
    return h('p', { className: 'st-installed-order', 'data-role': 'installed-order' }, sentences.join(' '))
  }

  function InstalledSkillsPage({ sessionId, query, reloadSignal, onMeta, onRetry, onOpen, installed: suppliedInstalled }) {
    const [state, setState] = React.useState({ loading: !suppliedInstalled, error: '', installed: suppliedInstalled ?? null })
    React.useEffect(() => {
      if (suppliedInstalled) return undefined
      let cancelled = false
      setState((current) => ({ ...current, loading: true, error: '' }))
      api(`/catalog?sessionId=${encodeURIComponent(sessionId)}`)
        .then((body) => {
          if (cancelled) return
          const installed = body?.installed ?? null
          setState({ loading: false, error: '', installed })
          onMeta?.(installed)
        })
        .catch((reason) => {
          if (cancelled) return
          setState({ loading: false, error: String(reason?.message || 'unavailable'), installed: null })
          // 页头也要知道「读不到」：只报 null 的话，正文说读取失败、页头还在说"正在读取"，
          // 同一屏上两句话互相打脸（这就是 sessionStatus 注释里那条规矩的由来）。
          onMeta?.({ error: true })
        })
      return () => { cancelled = true }
    }, [sessionId, reloadSignal, onMeta])

    // 同上：正文里没有标题了，页面名由顶栏的入口和状态行走着，这里只留语义。
    // 它在**每一个**分支里都渲染 ——「这一页是什么」不该由请求成不成功决定。
    const title = h('h2', { className: 'st-sr' }, localized('已安装的 Skill', 'Installed Skills'))

    if (state.error) {
      return h('div', { className: 'st-installed' }, title, h(TraceState, {
        kind: 'error',
        message: '暂时无法读取已安装 Skill。宿主可能仍在运行旧版本，重启 DSH 后再试。',
        onRetry: onRetry,
      }))
    }
    if (state.loading && !state.installed) {
      return h('div', { className: 'st-installed' }, title,
        h(TraceState, { kind: 'loading', message: '正在读取当前环境的 Skill 目录…' }))
    }

    const skills = state.installed?.skills ?? []
    const needle = String(query || '').trim()
    const visible = needle ? skills.filter((skill) => matchesInstalledQuery(skill, needle)) : skills

    return h('div', { className: 'st-installed' },
      title,
      // 顺序说明放在网格**外面**：过滤到零个结果时它也要在 —— 「为什么是空的」与
      // 「这张表按什么排的」是两件事。
      h(InstalledOrderNote, { ordering: state.installed?.ordering, limitations: state.installed?.limitations }),
      h(InstalledSkillGrid, { skills: visible, needle, onOpen }))
  }

  /**
   * 已安装列表的搜索框。2026-10-02 之前它长在正文的第一行；用户要求把它挪到
   * 「本次 Skill / 已安装 Skill」同一行、靠近刷新按钮，于是它从页面正文搬进顶栏。
   *
   * 搬走之后**过滤仍然发生在 InstalledSkillsPage 里**（`matchesInstalledQuery` 是宿主共用的
   * 那一个谓词，不许在这里另起一套匹配规则）—— 这里只管输入，`query` 由上层持有。
   */
  function InstalledSearchBox({ query, onQueryChange }) {
    return h('div', { className: 'st-installed-search' },
      h('input', {
        type: 'search',
        value: query || '',
        placeholder: localized('按名称或描述搜索 Skill', 'Search Skills by name or description'),
        'aria-label': localized('搜索已安装 Skill', 'Search installed Skills'),
        onChange: (event) => onQueryChange(event.target.value),
      }),
      h('span', { className: 'st-search-icon', 'aria-hidden': 'true' }, h(Icon, { name: 'search', size: 15 })))
  }

  /**
   * v0.7 §4「已安装 Skill → Skill 详情」的卡片网格。
   *
   * 从 InstalledSkillsPage 里拆出来只有一个理由：那个组件的正文由 `useState` 决定，
   * 而渲染冒烟测试的 React 桩不跑 `useEffect`、状态永不更新，于是网格永远渲染不到。
   * 拆成纯 props 组件之后，测试可以用真实载荷直接渲染它，断言的是「界面真的写了什么」，
   * 而不是「源码里有这几个字」。两列栅格、搜索谓词与调用方式文案都沿用 v0.6 §7。
   */
  function InstalledSkillGrid({ skills, needle, onOpen }) {
    if (!skills.length) {
      return h('p', { className: 'st-audit-empty' }, needle
        ? localized('没有匹配的 Skill。', 'No Skill matches.')
        : localized('当前环境暂未发现可用的 Skill。', 'No Skill is discoverable in this environment.'))
    }
    return h('div', { className: 'st-installed-grid' }, skills.map((skill) => h('button', {
      key: skill.name,
      type: 'button',
      className: 'st-installed-card',
      'data-skill': skill.name,
      // v0.7 §4：整张卡片就是一个入口，复用第一个列表页那个 <button> 卡片的做法。
      // 卡片里**不再**放一个「查看详情」重复按钮 —— 同一个入口出现两次，读者会以为它们不一样。
      onClick: () => onOpen?.(skill.name, 'installed'),
    },
    h('div', { className: 'st-installed-card-name' }, skill.name),
    skill.description ? h('p', { className: 'st-installed-card-desc' }, skill.description) : null,
    h('div', { className: 'st-installed-card-meta' },
      // 2026-10-03（用户：「模型可调用、可用 /name 调用，这两个是不是重复？」）：不是重复
      // —— DSH 的两个开关彼此独立，四种组合都合法 —— 但**在这一份目录上它们一个都不区分**：
      // 实测 69 个 Skill 全是 `{modelInvocable:true, userInvocable:true}`，于是每张卡都一字
      // 不差地重复同一句恒为真的话。恒为真的标签不是信息，是噪点（同一个道理见 §4 状态行：
      // 「一切正常」是唯一可以静默的情况）。所以改成**只在例外时说**：不成立才出字。
      // 比较用 `=== false` 而不是取反：这个组件是纯 props 的，载荷里少一个字段时
      // `undefined` 不许被念成「不成立」——那是编出来的断言（conversation.view 没有错误
      // 边界，所以可选链在这里既是防御也是措辞纪律，§6.11）。
      skill.invocation?.modelInvocable === false
        ? h('span', null, localized('不可由模型调用', 'Not model-invocable'))
        : null,
      skill.invocation?.userInvocable === false
        ? h('span', null, localized('不能用 /name 调用', 'Not invocable with /name'))
        : null,
      // v0.9.2：两件**不同**的事实分开写。「加入本机」是它什么时候来到这台机器（目录
      // birthtime，改正文不会变），「复刻自」是它从哪来（v0.8 血缘）。合成一句含糊的
      // 「创建时间」就等于把两件事都说不清楚。
      formatAddedAt(skill.addedAt) ? h('span', null, localized(
        `${formatAddedAt(skill.addedAt)} 加入本机`,
        `Added ${formatAddedAt(skill.addedAt)}`,
      )) : null,
      skill.lineage?.sourceSkillName ? h('span', null, localized(
        `复刻自 ${skill.lineage.sourceSkillName}`,
        `Cloned from ${skill.lineage.sourceSkillName}`,
      )) : null,
      // provider 同理**只在不是默认值时**说：`filesystem` 是内部词，69 张卡里出现 68 次
      // 等于没有信息；但换成插件提供时（实测有 1 个 `dsh-tauri-pet`）读者需要知道它不是
      // 盘上那个目录里的文件。这也是同一个原则：说例外，不说默认。
      skill.provider && skill.provider !== 'filesystem'
        ? h('span', null, skill.provider)
        : null))))
  }

  function Workbench(props) {
    React.useSyncExternalStore(
      (listener) => localeService.subscribe(listener),
      () => localeService.getSnapshot().revision,
    )
    const sessionId = props?.sessionId
    // v0.6 §7：一级页面只有两个 —— 「本次 Skill」（这次对话加载过哪些）与「已安装 Skill」
    // （当前 DSH 环境能发现哪些）。运行流程、运行图谱、Skill 收据已经不是页面了（§4），
    // 所以它们不在白名单里，也不再有任何入口。
    //
    // 视图白名单只有三处：query、localStorage、host preference（第四处是 __views 的导出）。
    const PAGES = ['current', 'installed']
    // 旧键必须落到**新的**第一屏，而不是白屏：`skills`/`audit`/`map`/`runtime`/`receipt`
    // 都是 v0.5 的会话视图，`catalog` 是旧的「我的 Skill」工作台。老书签与老存储值都会
    // 经过这里，所以「被删掉的页面」永远不会以空白的形式复活。
    const LEGACY_VIEWS = { skills: 'current', audit: 'current', map: 'current', runtime: 'current', receipt: 'current', catalog: 'installed' }
    const normalizeView = (value) => (PAGES.includes(value) ? value : LEGACY_VIEWS[value] ?? null)
    let queryView = null
    try {
      queryView = normalizeView(new URLSearchParams(window.location.search).get('view'))
    } catch (_) {}
    const initialView = (() => {
      if (queryView) return queryView
      try {
        return normalizeView(localStorage.getItem(VIEW_KEY)) ?? 'current'
      } catch { return 'current' }
    })()
    const [view, setView] = React.useState(initialView)
    const [data, setData] = React.useState(null)
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState('')
    // §7.2 的搜索框是**这一页**的输入，不是宿主状态（它不是过滤条件，也不写回任何地方）。
    const [installedQuery, setInstalledQuery] = React.useState('')
    const [catalogMeta, setCatalogMeta] = React.useState(null)
    const [catalogReload, setCatalogReload] = React.useState(0)
    const [currentMeta, setCurrentMeta] = React.useState(null)
    const [sessionReload, setSessionReload] = React.useState(0)
    // §8.4：Detail 必须记得自己是从哪个列表进来的，返回时回到那个列表。**不能固定返回
    // 某一个列表页** —— 所以来源跟着这次导航走，而不是当成一个全局状态。
    const [openSkill, setOpenSkill] = React.useState(null)
    const preferenceSession = React.useRef(null)
    const rootRef = React.useRef(null)
    const [hostComposerHeight, setHostComposerHeight] = React.useState(0)

    React.useLayoutEffect(() => {
      const node = rootRef.current
      if (!node || !node.closest('[data-slot="conversation.view"]')) {
        setHostComposerHeight(0)
        return
      }
      const measure = () => {
        const slot = document.querySelector('[data-slot="conversation.composer"]')
        let top = Infinity
        let bottom = -Infinity
        const elements = [slot, ...(slot?.querySelectorAll('*') || [])]
        for (const child of elements) {
          const rect = child.getBoundingClientRect()
          if (rect.height <= 0 || rect.width <= 0) continue
          top = Math.min(top, rect.top)
          bottom = Math.max(bottom, rect.bottom)
        }
        if (!Number.isFinite(top) || bottom <= top) return
        let hostNode = node.parentElement
        let hostRect = hostNode?.getBoundingClientRect()
        while (hostNode && (!hostRect || hostRect.height <= 0)) {
          hostNode = hostNode.parentElement
          hostRect = hostNode.getBoundingClientRect()
        }
        const overlay = hostRect?.height
          ? Math.ceil(hostRect.bottom - top)
          : Math.ceil(bottom - top)
        setHostComposerHeight(Math.max(0, Math.min(240, overlay)))
      }
      measure()
      const slot = document.querySelector('[data-slot="conversation.composer"]')
      const observer = new ResizeObserver(measure)
      const observed = [slot, ...(slot?.querySelectorAll('*') || [])]
      for (const child of observed) observer.observe(child)
      window.addEventListener('resize', measure)
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', measure)
      }
    }, [view])

    // §Layout Contract: this plugin is **embedded**, so its height must come from the host's
    // content area, never from the browser viewport. Every wrapper between the host slot and
    // this root may be content-height, which collapses height:100% to auto and leaves the
    // canvas at its minimum — a thin strip at the top of the page.
    //
    // The host ancestor is therefore resolved **once**, and only it and this root are observed.
    // An earlier version observed every ancestor while also setting a height on the root, which
    // fed the observer's own writes back into its input and hung the page; the value is also
    // compared before being stored, so an unchanged measurement cannot trigger a render.
    const [hostHeight, setHostHeight] = React.useState(0)
    const hostAncestorRef = React.useRef(null)
    React.useLayoutEffect(() => {
      const node = rootRef.current
      if (!node) return undefined
      // Nearest ancestor the host has given a definite height — resolved once, not per resize.
      let host = null
      for (let el = node.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        const style = getComputedStyle(el)
        if (style.display === 'inline' || style.height === 'auto') continue
        host = el
        break
      }
      if (!host) return undefined
      hostAncestorRef.current = host
      const measure = () => {
        const available = Math.floor(host.getBoundingClientRect().bottom - node.getBoundingClientRect().top)
        // Bounded: an embedded view never needs to claim more than the host offers, and a
        // negative result means the root is outside its host, which CSS should handle instead.
        setHostHeight((prev) => {
          const next = available > 0 ? available : 0
          return prev === next ? prev : next
        })
      }
      measure()
      // Deliberately no ResizeObserver here. Observing the host while also writing a height
      // onto this root fed the observer's own output back into its input and made the page
      // take minutes to settle. Measuring on mount and on window resize covers the cases that
      // matter (host shown, host resized) at no layout cost.
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }, [view])

    const load = React.useCallback(async () => {
      if (!sessionId) { setError('当前视图没有可用的会话 ID'); setLoading(false); return }
      setLoading(true); setError('')
      try {
        const next = await api(`/context?sessionId=${encodeURIComponent(sessionId)}`)
        if (preferenceSession.current !== sessionId) {
          if (!queryView) {
            // 只认带当前版本号的偏好：没有版本号说明它来自旧 IA，那里的 `map` 是缺省而不是选择。
            const stated = next.preferences?.version === PREFERENCE_VERSION ? normalizeView(next.preferences?.defaultView) : null
            // `stated` 已经被 normalizeView 限死在 PAGES 里了，所以再拿旧词汇问一遍
            // （`stated === 'skills' || stated === 'map'`）只会把**两个合法页面全部丢掉**：
            // 用户把「已安装 Skill」设为默认页，每次打开还是落在「本次 Skill」。
            const preferred = stated ?? initialView
            setView(preferred)
          }
          preferenceSession.current = sessionId
        }
        setData(next)
      } catch (reason) { setError(reason.message) } finally { setLoading(false) }
    }, [sessionId])

    React.useEffect(() => {
      setData(null); setInstalledQuery(''); setCatalogMeta(null)
      setOpenSkill(null); preferenceSession.current = null; load()
    }, [load])

    function chooseView(next) {
      setView(next); setError(''); setOpenSkill(null)
      try { localStorage.setItem(VIEW_KEY, next) } catch (_) {}
      // §7：两个一级页面都可以成为用户的默认页，所以两者都写回宿主偏好。
      api('/preferences', { method: 'POST', body: JSON.stringify({ defaultView: next }) })
        .then((body) => { setError(''); setData((current) => current ? { ...current, preferences: body.preferences } : current) })
        .catch(() => setError('默认页面已切换，但暂时无法保存到下次启动。'))
    }

    // 页头那颗状态点只说**当前这一页**的数据可不可信：已安装列表要么目录完整、要么只是
    // 已确认的部分；本次 Skill 要么读到了、要么没读到。它不再引用收据的 coverage —— 收据
    // 已经不是页面，用它的状态去点亮一个页面标题会让两件事看起来是同一件。
    const liveState = view === 'installed'
      ? (!catalogMeta ? 'unknown' : catalogMeta.error || catalogMeta.coverage !== 'complete' ? 'unknown' : 'active')
      : (currentMeta?.error ? 'unknown' : currentMeta ? 'active' : 'unknown')
    // 页头的 `skills` 副标题只数 Skill 加载：Turn / Node / Edge 计数属于运行视图，
    // 放在第一屏会把「本次用了哪些 Skill」重新变成「本次运行了多少东西」。
    const loadedTraces = (data?.receipt?.traceEvents ?? []).filter((trace) => trace?.status === 'loaded')
    const loadedSkillCount = new Set(loadedTraces.map((trace) => trace?.skillName).filter(Boolean)).size
    // v0.6 §4：Runtime 视图（运行流程 / 运行图谱 / Runtime Inspector / Runtime Replay）已经不是
    // 页面，也不再有任何入口。这里只留下「本次 Skill」这一条正文路径 —— 少掉的分支不是被藏起来，
    // 而是没有消费者的 UI（组件本身要等客户端不再引用后才删，见 §4 的清理顺序）。
    // 段头必须和正文说同一件事。此前 `!data` 一律显示"正在读取"，于是 Error 态下
    // 段头写"正在读取"、正文写"暂时无法读取"——**同一屏上两句话互相矛盾**（截图发现）。
    // 这两行从 2026-10-01 起渲染在各自页面的段头里，不再渲染在顶栏。
    const sessionStatus = currentMeta?.error
      ? localized('本次 Skill 读取失败 · 宿主可能仍在运行旧版本', 'Could not read this run’s Skills · the Host may be running an older build')
      : !data
        ? (error ? localized('当前会话读取失败', 'Could not read this session') : localized('正在读取当前会话…', 'Reading this session…'))
        : localized(`${data.workspaceLabel || '工作区未连接'} · ${loadedSkillCount} 个 Skill · ${loadedTraces.length} 次加载`, `${data.workspaceLabel || 'No workspace connected'} · ${loadedSkillCount} Skill(s) · ${loadedTraces.length} load(s)`)
    // 已安装列表的页头只说「这次发现是否完整」与「发现了多少个」。它不引用 receipt，
    // 也不显示学习/验证历史 —— 页头和正文必须说同一件事（见 sessionStatus 的注释）。
    //
    // 2026-10-02（用户圈出「DSH_Skill_Trace · 可发现 70 个 Skill」说「需要删除」）：
    // **一切正常时这一行不再说话**。列表本身就摆着那些卡片，再报一次数字是把列表读成统计。
    // 但下面四条一句都不能少：它们说的都是**列表说不出的事** —— 正在读、读不到、
    // 目录不全、目录无法确认。「一切正常」是唯一可以静默的情况，因为那时没有信息可加。
    const catalogStatus = !catalogMeta
      ? localized('正在读取当前环境…', 'Reading this environment…')
      : catalogMeta.error
        ? localized('已安装 Skill 读取失败 · 宿主可能仍在运行旧版本', 'Could not read the installed Skills · the Host may be running an older build')
      : catalogMeta.coverage === 'unknown'
        ? localized('当前目录无法确认 · 只显示已确认的部分', 'Catalog cannot be confirmed · Showing only what was confirmed')
        : catalogMeta.coverage === 'incomplete'
          ? localized(`目录可能不完整 · 已发现 ${catalogMeta.totalCount ?? 0} 个 Skill`, `Catalog may be incomplete · ${catalogMeta.totalCount ?? 0} Skill(s) found`)
          : null

    // 顶栏那一格读的是哪个状态行。已安装页在一切正常时为 null（整格留空），
    // 本次 Skill 页仍然报它自己的工作区与计数 —— 只有被圈出来的那一句被删掉。
    const headerStatus = view === 'installed' ? catalogStatus : sessionStatus

    // §6：第一屏是这次对话加载过的 Skill 卡片。它自己读 `/skills`，因为「哪些 Skill 被加载过」
    // 与「这次会话的收据里有什么」是两个问题，前者不该等后者的四路投影（context/runtime/…）。
    const sessionContent = h(CurrentSkillPage, {
      sessionId,
      loadedSkillCount,
      reloadSignal: sessionReload,
      onMeta: setCurrentMeta,
      onRetry: () => setSessionReload((value) => value + 1),
      onOpen: (name, from) => setOpenSkill({ name, from }),
    })

    // 两个一级页面各自拥有自己的分栏（Skill 工作台是三栏、已安装列表是网格），所以它们
    // 直接成为正文，不再套一层单列内边距的包装。
    // §8：Skill Detail 是唯一的二级页面，两个列表共用它。返回目标来自进入时的列表（§8.4）。
    const detailContent = openSkill
      ? h(SkillDetailPage, {
        sessionId,
        skillName: openSkill.name,
        backLabel: openSkill.from === 'installed' ? localized('已安装 Skill', 'Installed Skills') : localized('本次 Skill', 'Skills in this run'),
        onBack: () => setOpenSkill(null),
      })
      : null
    const listContent = view === 'installed'
      ? h(InstalledSkillsPage, {
        sessionId,
        query: installedQuery,
        reloadSignal: catalogReload,
        onMeta: setCatalogMeta,
        onRetry: () => setCatalogReload((value) => value + 1),
        onOpen: (name, from) => setOpenSkill({ name, from }),
      })
      : sessionContent
    const content = detailContent ?? listContent

    // 界面要挂上去了：先确认样式表在（§见 ensureStylesheet 的说明）。
    ensureStylesheet()
    return h('section', { ref: rootRef, 'data-plugin': 'dsh-skill-trace', 'data-conversation-composer-overlay': '', className: hostComposerHeight ? 'st-host' : undefined, style: {
      // --st-host-composer-h keeps this panel clear of the host composer; --st-host-h is the
      // height measured from the host's own content area (§Layout Contract). Both are plain
      // custom properties, so an absent measurement simply falls back in CSS.
      ...(hostComposerHeight ? { '--st-host-composer-h': `${hostComposerHeight}px` } : null),
      ...(hostHeight ? { '--st-host-h': `${hostHeight}px` } : null),
    }, 'aria-label': view === 'installed' ? 'Skill 洞察 已安装 Skill' : 'Skill 洞察 本次 Skill 使用记录' }, h('div', { className: 'st-shell' },
      h('header', { className: 'st-topbar' },
        // §7：一级导航**只有两个**，而且是顶栏里最左的东西 —— 顶栏的读法固定成
        // 「导航 → 这一页的状态 →（右侧）搜索 → 刷新」。运行流程 / 运行图谱 / Skill 收据在
        // v0.6 里不是页面（§4），所以这里既没有「高级」菜单，也没有 Runtime 画布操作。
        // 搜索只属于已安装列表：它过滤的是目录，在详情页里没有东西可过滤，所以点进详情后收起。
        h('div', { className: 'st-view-switch', role: 'group', 'aria-label': 'Skill 页面' },
          h('button', { className: 'st-view-button', type: 'button', 'aria-pressed': view === 'current', onClick: () => chooseView('current') }, h(Icon, { name: 'skill', size: 15 }), localized('本次 Skill', 'Skills in this run')),
          h('button', { className: 'st-view-button', type: 'button', 'aria-pressed': view === 'installed', onClick: () => chooseView('installed') }, h(Icon, { name: 'list', size: 15 }), localized('已安装 Skill', 'Installed Skills'))),
        // 导航后面这一格说的是「你正在看的这堆数据是什么」。在两个列表页上它是状态行
        // （workspace 标签、计数，以及「宿主可能仍在运行旧版本」这类警告）；进了二级页
        // 它就换成返回键 —— 位置固定，内容跟着层级走。
        h('div', { className: 'st-context' },
          openSkill
            ? h(DetailBackButton, {
              backLabel: openSkill.from === 'installed' ? localized('已安装 Skill', 'Installed Skills') : localized('本次 Skill', 'Skills in this run'),
              onBack: () => setOpenSkill(null),
            })
            // 状态行为 null 时整格留空（连状态点一起）—— 一个孤零零的绿点没有主语，
            // 读者只会猜它在说什么。寂静只在「一切正常」时发生，见 catalogStatus 的注释。
            : (headerStatus
              ? h(React.Fragment, null,
                h('span', { className: 'st-live', 'data-state': liveState }),
                h('span', { className: 'st-context-text' }, raw(headerStatus)))
              : null)),
        h('div', { className: 'st-header-actions' },
          // 搜索框只在「已安装列表真的读到了」的时候出现：目录读失败时摆一个搜不出东西的输入框，
          // 等于把一次失败伪装成一个可用功能。
          view === 'installed' && !openSkill && catalogMeta && !catalogMeta.error
            ? h(InstalledSearchBox, { query: installedQuery, onQueryChange: setInstalledQuery })
            : null,
          h('button', { className: 'st-icon-button', type: 'button', onClick: view === 'installed' ? () => setCatalogReload((value) => value + 1) : load, disabled: view === 'current' && loading, title: '刷新', 'aria-label': view === 'installed' ? '刷新已安装 Skill' : '刷新本次 Skill' }, h(Icon, { name: 'refresh', size: 15 })))),
      content))
  }

  let localeService
  module.exports.inject = ['slots', 'locale', 'workspaces']
  module.exports.apply = (ctx) => {
    localeService = ctx.locale
    translate = ctx.locale.bind(NS)
    ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-skill-trace: locale dictionaries')
    ctx.effect(() => installStyles(), 'dsh-skill-trace: stylesheet')
    // 工作栏标签就是**插件显示名**，也是本项目唯一的「DSH 会话内短显示名」：命名调整后这里读
    // **Skill 洞察 / Skill Insight**（产品品牌 DSH Skill 智能实验室 / DSH Skill Intelligence
    // 是文档层与包描述层的事，不进这个高频入口）。`id: 'skill-trace'` 与 `locale: NS` 是技术
    // 标识，不随命名调整而改。
    ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'skill-trace', order: 70, label: () => t('Skill 洞察'), locale: NS }, (props) => h(Workbench, props)))
  }

  // Test seam. The shell reads only `inject` and `apply`; exposing the views lets the
  // render smoke test execute each one against a real payload. Source assertions cannot
  // see a component that throws while rendering — a hook reading a binding declared below
  // it passes every string check and still leaves the user with a blank panel.
  // `renderSkillMarkdown` 也放进来：它是**唯一**的 Markdown 渲染入口（原文与中文预览
  // 共用同一次调用），而"表格有没有被画成表格"只有渲染出节点才验得了 —— 源码断言只能
  // 证明函数名出现过。
  module.exports.__pure = { resolveSkillListState, alignOutlineToTranslation, invocationLabel, renderSkillMarkdown }
  module.exports.__views = {
    Workbench, CurrentSkillPage, SkillDetailPage, SkillFramework, DetailBackButton, InstalledSkillsPage, InstalledSkillGrid, InstalledSearchBox, SkillCard, TraceState,
    // 框架与运行逻辑各自成组件，就能在**没有浏览器**的情况下把它们渲染一遍：措辞风险只有
    // 渲染出来才看得见，而"未执行"这类词在源码里根本搜不到 —— 它是一条不存在的分支。
    FrameworkStructure, DeclaredWorkflow, ProgressiveDisclosure, RuntimeLogic, StepEvidence,
    // v0.7：复刻对话框与它的成功态也要能在无浏览器的情况下渲染一遍 —— 「✓ 已创建」这句话
    // 只该出现在宿主的回执之后，而那条分支只有把组件真的渲染出来才会被执行。
    SkillCloneDialog,
    // v0.8：演进卡与差异面板同样要能离线渲染。理由与上面那条一样，而且这次更硬 ——
    // 「读不到来源」那一屏是**错误态**，它一旦渲染成空列表，用户看到的就是「没有变化」。
    SkillEvolution, SkillDiffPanel,
    // v0.9.1：修改对话框与「本次修改对比」块也要能离线渲染。「无法比较」那一屏尤其要 ——
    // 它一旦渲染成一份空结果，用户读到的就会是「这次修改什么都没变」。
    SkillModifyDialog, SkillModificationPanel,
    // v1.1：详情级导航本身也要能离线渲染一遍。它是这一版新加的**唯一**入口控件，而它
    // 不渲染任何 Skill 内容 —— 「点哪一项就选中哪一维」这条接线只有把按钮真的渲染出来、
    // 再调一次它的 onClick 才验得了（源码断言只能证明那行字符串出现过）。
    DetailNav,
    // V1.2：证据卡也要能离线渲染一遍。它整屏都是**措辞**（三态词、四条限制、三条边界、
    // 「不声明」这一格），而这些词在源码里搜不到 —— 它们由 core 的词表拼出来，且「没看到证据」
    // 与「没有发生」在源码层面长得一样（都走同一个 unavailable 分支）。只有把这张卡渲染出来，
    // 才看得见实际落到屏幕上的那句话。
    SkillEvidenceCard,
  }
