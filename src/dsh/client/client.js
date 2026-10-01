// DSH Skill Trace — conversation view client.
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
  const NS = 'dsh-skill-trace'
  // Keep display copy in the client. Receipt facts, Skill definitions and
  // user-authored notes stay untouched; only our own UI wording is localized.
  const EN = {
    '当前会话': 'Current session',
    '本次 Skill 使用记录': 'Skill usage this session',
    'Skill 追踪': 'Skill Trace', '刷新': 'Refresh',
    '工作区未连接': 'No workspace connected', '正在读取当前会话…': 'Reading current session…',
    '当前目录无法确认': 'Current catalog cannot be confirmed', '目录可能不完整': 'Catalog may be incomplete',
    '返回 Skill 列表': 'Back to Skill list', 'Skill 列表': 'Skill list',
    '搜索 Skill': 'Search Skills', '重试': 'Retry',
    '保存': 'Save',
    '当前对话暂未加载可追踪的 Skill。': 'No traceable Skill has been loaded in this conversation yet.', '正在读取当前对话的 Skill 使用情况…': 'Reading Skill usage in this conversation…',
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
      /* DSH Theme → DSH Alias → --st-* → Skill Trace UI
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
      /* v0.6 §22 顶栏：品牌 + 两个一级页面入口 + 刷新。高度取设计文档的 68px，
        高于 design.md §6.1 的 58px 下限。曾经这里有第二条规则把它覆写成 72px ——
        那个数字来自哪个文档都说不清，就成了「样式表里的一句口口相传」。 */
      .st-topbar{min-height:68px;padding:0 18px;display:flex;align-items:center;gap:14px;flex:none;border-bottom:1px solid var(--st-border);background:var(--st-layer)}
      /* 顶栏现在的读法是「导航 → 这一页的状态」：两个一级入口在最左，紧跟着一行说明
         当前这一页的数据是什么，右侧只留刷新。状态行会截断而不是把布局挤宽。 */
      .st-context{min-width:0;flex:1;display:flex;align-items:center;gap:7px;color:var(--st-muted);font-size:12px}
      .st-context-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .st-live{width:6px;height:6px;border-radius:50%;background:var(--st-success);flex:none}.st-live[data-state="unknown"]{background:var(--st-faint)}
      /* 段头删掉之后页面就没有标题元素了。视觉上按用户的要求去掉，语义上补一个
         只给读屏软件的 h2 —— 「这一页叫什么」不该因为排版调整而消失。 */
      .st-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
      .st-view-switch{display:inline-flex;padding:3px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer-2)}.st-view-button{min-height:30px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:5px;background:transparent;color:var(--st-muted);cursor:pointer}.st-view-button:hover{color:var(--st-text)}.st-view-button[aria-pressed="true"]{background:var(--st-layer);color:var(--st-brand);box-shadow:0 1px 2px rgba(20,24,32,.08)}
      .st-empty-page,.st-trace-state{height:100%;display:grid;place-items:center;padding:32px;color:var(--st-muted)}.st-empty-page-inner{width:min(100%,420px)}.st-empty-page p{margin:0}.st-trace-state-line{display:inline-flex;align-items:center;gap:9px;font-size:13px}.st-trace-state-dot{width:7px;height:7px;border-radius:50%;background:var(--st-faint)}.st-trace-state[data-kind="loading"] .st-trace-state-dot{background:var(--st-brand);animation:st-pulse 1.2s ease-in-out infinite}@keyframes st-pulse{50%{opacity:.35}}
      [data-plugin="dsh-skill-trace"]{overflow:hidden;max-height:none;height:var(--st-host-h,100%);min-height:0;color:var(--st-text);background:var(--st-bg);font-size:13px;line-height:1.45}
      @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.st-trace-state-dot{animation:none!important}}

      /* 键盘可达（§13）：preview 用 outline，实现沿用同一做法。 */
      /* 按下态：preview 自己没有 :active，但 objective 明确要求 hover/active/focus。
         按下时轻微下沉，读成"点到了"而不是"没反应"。 */
      /* 过渡：objective 明确要求。preview 没有过渡，但状态切换（hover / 聚焦降权 / 回放）
         若瞬变会读成"画面闪了一下"；160ms 足以让它读成一次状态变化。 */
      .st-view-switch{border-radius:9px}
      .st-view-button{height:32px;padding:0 11px}





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
      .st-installed{padding:22px 24px 28px;display:flex;flex-direction:column;gap:16px;min-height:0;overflow:auto}
      .st-installed-search{display:flex;align-items:center;gap:8px;max-width:520px;color:var(--st-text-tertiary)}
      .st-installed-search input{flex:1;height:34px;padding:0 11px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-surface);color:var(--st-text);font:inherit;font-size:13px}
      .st-installed-search input:focus-visible{outline:2px solid var(--st-accent);outline-offset:1px}
      .st-installed-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:start}
      .st-installed-card{display:flex;flex-direction:column;gap:7px;padding:15px 16px;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface)}
      .st-installed-card-name{font-size:14.5px;font-weight:600;color:var(--st-text)}
      .st-installed-card-desc{margin:0;font-size:12.5px;line-height:1.6;color:var(--st-text-secondary)}
      .st-installed-card-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--st-text-tertiary)}
      @media(max-width:980px){.st-installed-grid{grid-template-columns:minmax(0,1fr)}}
      /* ── Skill-first 列表与详情（v0.6 §6 / §7 / §8 / §9）──────────────────────
       *
       * 圆角在这里刻意比原型小：原型的卡片是 18px（--radius），而本仓库的 §25.2 守卫禁止
       * 14px 以上的卡片圆角，理由是「圆角是例外，结构主要靠分隔线」。两边的取值都写进过
       * 文档，冲突时以仓库里**有牙的那条**为准（scripts/verify-project.mjs 会真的失败），
       * 并把分歧记在评审文档里，而不是偷偷选一个。
       */
      .st-page{height:100%;min-height:0;overflow:auto;padding:20px 22px 28px}
      .st-skill-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-content:start}
      .st-skill-card{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:15px 16px;border:1px solid var(--st-border);border-radius:10px;background:var(--st-surface);color:inherit;cursor:pointer;transition:border-color .16s ease,transform .16s ease}
      .st-skill-card:hover{transform:translateY(-1px);border-color:var(--st-border-strong)}
      .st-skill-card-icon{width:34px;height:34px;border-radius:9px;background:var(--st-accent-soft);color:var(--st-accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex:0 0 auto}
      .st-skill-card-body{min-width:0;flex:1;display:flex;flex-direction:column}
      .st-skill-card-name{font-weight:700;font-size:14px}
      .st-skill-card-desc{margin:4px 0 0;color:var(--st-muted);font-size:12px;line-height:1.55}
      .st-skill-card-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      .st-skill-card-go{color:var(--st-faint);font-size:14px;flex:0 0 auto}
      .st-pill{border:1px solid var(--st-border);border-radius:999px;padding:3px 8px;font-size:11px;color:var(--st-muted);background:var(--st-surface-subtle)}
      .st-pill[data-tone="accent"]{border-color:var(--st-accent);background:var(--st-accent-soft);color:var(--st-accent);font-weight:600}
      .st-detail{height:100%;min-height:0;display:flex;flex-direction:column}
      .st-detail-back{align-self:center;border:0;background:transparent;color:var(--st-muted);font-size:12px;padding:4px 0;cursor:pointer;white-space:nowrap}
      .st-detail-back:hover{color:var(--st-text)}
      .st-detail-body{flex:1;min-height:0;display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;padding:12px 22px 18px}
      /* 主内容列：框架 / 运行逻辑 / 步骤证据 / SKILL.md 四层自上而下，整列自己滚。
       *
       * 以前这一列不滚、只让文档内部滚，前提是顶部只有一张 4 步的流程图。现在三层分析块
       * 加起来的自然高度就可能超过一屏，所以整列接管滚动，而文档卡保留一个最小高度 ——
       * 它仍然是一份要逐字读 300 行的定义，压成一条缝就没法读了。 */
      .st-detail-main{min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:auto}
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
      /* §11 断点：1180 收窄左右栏，980 收起证据栏（与 Demo 一致）。
       * 再窄时连定义目录一起收起，只留声明流程——总比三栏互相压成一列可读性更差要强。 */
    `
    if (previous) previous.replaceWith(style)
    else document.head.appendChild(style)
    return () => {
      if (document.getElementById(STYLE_ID) === style) style.remove()
    }
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
  }

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
    return { kind: 'empty', message: localized('当前对话暂未加载可追踪的 Skill。', 'No traceable Skill was loaded in this conversation.') }
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

  function SkillDetailPage({ sessionId, skillName, skill: suppliedSkill }) {
    const [fetched, setFetched] = React.useState(null)
    const [loading, setLoading] = React.useState(!suppliedSkill)
    const [error, setError] = React.useState('')
    const [tab, setTab] = React.useState('original')
    const [translation, setTranslation] = React.useState({ state: 'idle', text: '', sha: '', error: '' })
    const [flash, setFlash] = React.useState('')
    const [activeHeading, setActiveHeading] = React.useState('')
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

    // 定义换了（重新加载、切 Skill）就换一份译文：一份对不上屏幕正文的译文比没有译文更糟。
    // 依赖是 `skillName` + 指纹，不是 `detail` 对象 —— 同一个定义的两次读取不该清掉译文。
    // 先看内存里有没有：翻译要跑一到三分钟，切走再切回来重跑一遍是浪费用户的等待。
    React.useEffect(() => {
      const cached = sha ? readCachedTranslation(translationCacheKey(sessionId, skillName, sha)) : null
      if (cached) {
        // 回到一个已经翻好的 Skill，直接把中文摆出来 —— 用户切回来想看的正是它。
        setTranslation(cached)
        setTab('translated')
        return
      }
      setTranslation({ state: 'idle', text: '', sha: '', error: '' })
      setTab('original')
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
        h('code', null, raw(invocationLabel(runs[0]?.invocationType)))))

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

    const sidePanel = h('aside', { className: 'st-detail-side' }, sideIdentity, sideDefinition, sideRepository)

    const segControl = h('div', { className: 'st-seg', role: 'group', 'aria-label': 'SKILL.md 显示方式' },
      h('button', { type: 'button', 'data-active': !translated, onClick: () => setTab('original') }, localized('原文', 'Original')),
      h('button', {
        type: 'button',
        'data-active': translated,
        onClick: () => { setTab('translated'); if (translation.state !== 'ready') runTranslation() },
      }, localized('中文预览', 'Chinese preview')))

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
      ? localized('中文预览只用于当前页面阅读，不会写回 SKILL.md，也不会进入这次对话。在插件里切到别的 Skill 再回来，译文还在；退出 DeepSeek Harness 后不保留。', 'This preview is shown on this page only: it is never written back to SKILL.md and never added to the conversation. It stays while you switch between Skills, and is dropped when DeepSeek Harness exits.')
      : localized('原文逐字来自 Skill 定义文件；这里不做任何改写。', 'The original text comes from the Skill definition file verbatim; nothing here rewrites it.')))

    const translationState = translation.state === 'loading'
      // 分段翻译后这是一次**多段**调用，比原来的单次调用慢。等待时若不说清楚，用户会
      // 以为界面卡死了 —— 而"以为卡死"的下一个动作通常是刷新，那会把进度全丢掉。
      ? h('p', { className: 'st-translate-error' }, raw(localized('正在逐段翻译…整份文档会分成若干段依次翻译，可能需要一到三分钟。译文只留在内存里。', 'Translating segment by segment — a long definition is split into several parts and translated in order, which can take one to three minutes. The result is kept in memory only.')))
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

    return h('div', { className: 'st-detail' },
      h('div', { className: 'st-detail-body' }, sidePanel,
        h('div', { className: 'st-detail-main' }, framework, runtimeLogic, stepEvidence, docPanel)))
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
  function InstalledSkillsPage({ sessionId, query, onQueryChange, reloadSignal, onMeta, onRetry }) {
    const [state, setState] = React.useState({ loading: true, error: '', installed: null })
    React.useEffect(() => {
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
      h('div', { className: 'st-installed-search' },
        h(Icon, { name: 'search', size: 15 }),
        h('input', {
          type: 'search',
          value: query || '',
          placeholder: localized('按名称或描述搜索 Skill', 'Search Skills by name or description'),
          'aria-label': localized('搜索已安装 Skill', 'Search installed Skills'),
          onChange: (event) => onQueryChange(event.target.value),
        })),
      visible.length
        ? h('div', { className: 'st-installed-grid' }, visible.map((skill) => h('article', { key: skill.name, className: 'st-installed-card' },
          h('div', { className: 'st-installed-card-name' }, skill.name),
          skill.description ? h('p', { className: 'st-installed-card-desc' }, skill.description) : null,
          h('div', { className: 'st-installed-card-meta' },
            h('span', null, skill.invocation.modelInvocable
              ? localized('模型可调用', 'Model-invocable')
              : localized('不可由模型调用', 'Not model-invocable')),
            skill.invocation.userInvocable ? h('span', null, localized('可用 /name 调用', 'Invocable with /name')) : null,
            skill.provider ? h('span', null, skill.provider) : null))))
        : h('p', { className: 'st-audit-empty' }, needle
          ? localized('没有匹配的 Skill。', 'No Skill matches.')
          : localized('当前环境暂未发现可用的 Skill。', 'No Skill is discoverable in this environment.')))
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
        : localized(`${data.workspaceLabel} · ${loadedSkillCount} 个 Skill · ${loadedTraces.length} 次加载`, `${data.workspaceLabel} · ${loadedSkillCount} Skill(s) · ${loadedTraces.length} load(s)`)
    // 已安装列表的页头只说「这次发现是否完整」与「发现了多少个」。它不引用 receipt，
    // 也不显示学习/验证历史 —— 页头和正文必须说同一件事（见 sessionStatus 的注释）。
    const catalogStatus = !catalogMeta
      ? localized('正在读取当前环境…', 'Reading this environment…')
      : catalogMeta.error
        ? localized('已安装 Skill 读取失败 · 宿主可能仍在运行旧版本', 'Could not read the installed Skills · the Host may be running an older build')
      : catalogMeta.coverage === 'unknown'
        ? localized('当前目录无法确认 · 只显示已确认的部分', 'Catalog cannot be confirmed · Showing only what was confirmed')
        : catalogMeta.coverage === 'incomplete'
          ? localized(`目录可能不完整 · 已发现 ${catalogMeta.totalCount ?? 0} 个 Skill`, `Catalog may be incomplete · ${catalogMeta.totalCount ?? 0} Skill(s) found`)
          : localized(`${data?.workspaceLabel || '工作区未连接'} · 可发现 ${catalogMeta.totalCount ?? 0} 个 Skill`, `${data?.workspaceLabel || 'Workspace not connected'} · ${catalogMeta.totalCount ?? 0} Skill(s) discoverable`)

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
        onQueryChange: setInstalledQuery,
        reloadSignal: catalogReload,
        onMeta: setCatalogMeta,
        onRetry: () => setCatalogReload((value) => value + 1),
      })
      : sessionContent
    const content = detailContent ?? listContent

    return h('section', { ref: rootRef, 'data-plugin': 'dsh-skill-trace', 'data-conversation-composer-overlay': '', className: hostComposerHeight ? 'st-host' : undefined, style: {
      // --st-host-composer-h keeps this panel clear of the host composer; --st-host-h is the
      // height measured from the host's own content area (§Layout Contract). Both are plain
      // custom properties, so an absent measurement simply falls back in CSS.
      ...(hostComposerHeight ? { '--st-host-composer-h': `${hostComposerHeight}px` } : null),
      ...(hostHeight ? { '--st-host-h': `${hostHeight}px` } : null),
    }, 'aria-label': view === 'installed' ? 'DSH Skill Trace 已安装 Skill' : 'DSH Skill Trace 本次 Skill 使用记录' }, h('div', { className: 'st-shell' },
      h('header', { className: 'st-topbar' },
        // §7：一级导航**只有两个**，而且是顶栏里最左的东西 —— 顶栏的读法现在固定成
        // 「导航 → 这一页的状态 →（右侧）刷新」。运行流程 / 运行图谱 / Skill 收据在
        // v0.6 里不是页面（§4），所以这里既没有「高级」菜单，也没有 Runtime 画布操作。
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
            : h(React.Fragment, null,
              h('span', { className: 'st-live', 'data-state': liveState }),
              h('span', { className: 'st-context-text' }, raw(view === 'installed' ? catalogStatus : sessionStatus)))),
        h('div', { className: 'st-header-actions' },
          h('button', { className: 'st-icon-button', type: 'button', onClick: view === 'installed' ? () => setCatalogReload((value) => value + 1) : load, disabled: view === 'current' && loading, title: '刷新', 'aria-label': view === 'installed' ? '刷新已安装 Skill' : '刷新 Skill 追踪' }, h(Icon, { name: 'refresh', size: 15 })))),
      content))
  }

  let localeService
  module.exports.inject = ['slots', 'locale', 'workspaces']
  module.exports.apply = (ctx) => {
    localeService = ctx.locale
    translate = ctx.locale.bind(NS)
    ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-skill-trace: locale dictionaries')
    ctx.effect(() => installStyles(), 'dsh-skill-trace: stylesheet')
    ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'skill-trace', order: 70, label: () => t('Skill 追踪'), locale: NS }, (props) => h(Workbench, props)))
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
    Workbench, CurrentSkillPage, SkillDetailPage, SkillFramework, DetailBackButton, InstalledSkillsPage, SkillCard, TraceState,
    // 框架与运行逻辑各自成组件，就能在**没有浏览器**的情况下把它们渲染一遍：措辞风险只有
    // 渲染出来才看得见，而"未执行"这类词在源码里根本搜不到 —— 它是一条不存在的分支。
    FrameworkStructure, DeclaredWorkflow, ProgressiveDisclosure, RuntimeLogic, StepEvidence,
  }
