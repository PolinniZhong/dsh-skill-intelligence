window.__ModuleLoader__.load({
  id: 'dsh-skill-trace',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement
    const STYLE_ID = 'dsh-skill-trace-style'
    const API_ROOT = '/skill-trace'
    const VIEW_KEY = 'dsh-skill-trace.default-view'

    const STATUS = {
      requested: { label: '正在加载', tone: 'brand' },
      loaded: { label: '已加载', tone: 'success' },
      failed: { label: '加载失败', tone: 'error' },
      mixed: { label: '状态混合', tone: 'warning' },
      unresolved: { label: '记录不完整', tone: 'warning' },
      'outcome-unknown': { label: '结果未知', tone: 'warning' },
      'not-started': { label: '未开始', tone: 'muted' },
      'verified-standard-contract': { label: '标准事件已验证', tone: 'success' },
      'coverage-unknown': { label: '覆盖未知', tone: 'muted' },
      'human-confirmed': { label: '人工已关联', tone: 'brand' },
      unassessed: { label: '待人工判断', tone: 'muted' },
      manual: { label: '可手工延续', tone: 'success' },
      partial: { label: '可部分延续', tone: 'warning' },
      blocked: { label: '当前受阻', tone: 'error' },
      unknown: { label: '未评估', tone: 'muted' },
    }
    const DEPENDENCIES = { network: '网络', model: '模型', mcp: 'MCP', script: '脚本', permission: '权限' }

    function Icon({ name, size = 16 }) {
      const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }
      const paths = {
        receipt: [h('path', { key: 1, d: 'M6 3h12v18l-3-2-3 2-3-2-3 2Z' }), h('path', { key: 2, d: 'M9 8h6M9 12h6M9 16h3' })],
        map: [h('circle', { key: 1, cx: 6, cy: 6, r: 2 }), h('circle', { key: 2, cx: 18, cy: 8, r: 2 }), h('circle', { key: 3, cx: 10, cy: 18, r: 2 }), h('path', { key: 4, d: 'm7.8 7 8.3.9M7 7.8l2.2 8.4M16.8 9.7l-5.5 6.7' })],
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
        edit: [h('path', { key: 1, d: 'M12 20h9' }), h('path', { key: 2, d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z' })],
        list: [h('path', { key: 1, d: 'M9 6h11M9 12h11M9 18h11' }), h('circle', { key: 2, cx: 4, cy: 6, r: 1 }), h('circle', { key: 3, cx: 4, cy: 12, r: 1 }), h('circle', { key: 4, cx: 4, cy: 18, r: 1 })],
        search: [h('circle', { key: 1, cx: 11, cy: 11, r: 7 }), h('path', { key: 2, d: 'm20 20-4-4' })],
        chevron: [h('path', { key: 1, d: 'm9 18 6-6-6-6' })],
      }
      return h('svg', props, ...(paths[name] || paths.info))
    }

    function installStyles() {
      if (document.getElementById(STYLE_ID)) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        [data-plugin="dsh-skill-trace"]{--st-brand:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-500,#3567d6));--st-bg:var(--dsw-alias-bg-base,#f7f8fa);--st-layer:var(--dsw-alias-bg-layer-1,#fff);--st-layer-2:var(--dsw-alias-bg-layer-2,#f3f5f7);--st-border:var(--dsw-alias-border-l2,rgba(22,27,36,.14));--st-border-soft:var(--dsw-alias-border-l3,rgba(22,27,36,.09));--st-grid:color-mix(in srgb,var(--st-border-soft) 50%,transparent);--st-text:var(--dsw-alias-label-primary,#17191d);--st-muted:var(--dsw-alias-label-secondary,#626871);--st-faint:var(--dsw-alias-label-tertiary,#8b9098);--st-success:var(--dsw-alias-state-success-primary,#16834b);--st-warning:var(--dsw-alias-state-warn-primary,#b36500);--st-error:var(--dsw-alias-state-error-primary,#c23c45);height:calc(100dvh - 76px);max-height:calc(100dvh - 76px);min-height:0;overflow:hidden;color:var(--st-text);background:var(--st-bg);font-size:13px;line-height:1.45}
        [data-plugin="dsh-skill-trace"] *{box-sizing:border-box}[data-plugin="dsh-skill-trace"] button,[data-plugin="dsh-skill-trace"] input{font:inherit}
        .st-shell{height:100%;min-height:0;display:flex;flex-direction:column}.st-topbar{min-height:58px;padding:9px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--st-border);background:var(--st-layer)}
        .st-heading{min-width:0;flex:1}.st-heading-line{display:flex;align-items:center;gap:9px}.st-heading h1{margin:0;font-size:16px;font-weight:650;letter-spacing:-.01em}.st-workspace{margin-top:2px;color:var(--st-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-live{width:6px;height:6px;border-radius:50%;background:var(--st-success);flex:none}.st-live[data-state="unknown"]{background:var(--st-faint)}
        .st-view-switch{display:inline-flex;padding:3px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer-2)}.st-view-button{min-height:30px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:5px;background:transparent;color:var(--st-muted);cursor:pointer}.st-view-button:hover{color:var(--st-text)}.st-view-button[aria-pressed="true"]{background:var(--st-layer);color:var(--st-brand);box-shadow:0 1px 2px rgba(20,24,32,.08)}
        .st-icon-button,.st-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--st-border);background:var(--st-layer);color:var(--st-text);cursor:pointer}.st-icon-button{width:32px;height:32px;border-radius:7px;overflow:visible}.st-icon-button svg{display:block;overflow:visible}.st-button{min-height:34px;padding:0 12px;border-radius:7px}.st-button:hover,.st-icon-button:hover{background:var(--st-layer-2)}.st-button:focus-visible,.st-icon-button:focus-visible,.st-view-button:focus-visible,.st-node:focus-visible,.st-activity-step:focus-visible,.st-filter:focus-visible,.st-catalog-item:focus-visible,.st-history-action:focus-visible,summary:focus-visible{outline:2px solid var(--st-brand);outline-offset:2px}.st-button-primary{border-color:var(--st-brand);background:var(--st-brand);color:white}.st-button-primary:hover{filter:brightness(.96);background:var(--st-brand)}.st-button:disabled{opacity:.5;cursor:default}
        .st-layout{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) 290px}.st-main{min-width:0;overflow:auto;padding:18px}.st-aside{min-width:0;overflow:auto;padding:18px 16px;border-left:1px solid var(--st-border);background:var(--st-layer)}
        .st-receipt{width:min(100%,980px);margin:0 auto;border:1px solid var(--st-border);border-radius:10px;background:var(--st-layer);overflow:hidden}.st-receipt-head{padding:21px 22px 17px;border-bottom:1px solid var(--st-border)}.st-receipt-head h2{margin:0;font-size:22px;line-height:1.25;font-weight:680;letter-spacing:-.025em}.st-receipt-meta{margin-top:6px;color:var(--st-muted);font-size:12px}.st-receipt-section{padding:18px 22px}.st-receipt-section+.st-receipt-section{border-top:1px solid var(--st-border)}.st-section-title{margin:0 0 15px;display:flex;align-items:center;gap:10px;font-size:15px;font-weight:650}.st-section-number{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--st-brand);color:white;font-size:13px;font-variant-numeric:tabular-nums;flex:none}
        .st-activity{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:start}.st-activity-step{position:relative;min-width:0;padding:0 24px 0 0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.st-activity-step:not(:last-child)::after{content:"";position:absolute;right:8px;top:15px;width:10px;height:10px;border-top:1px solid var(--st-faint);border-right:1px solid var(--st-faint);transform:rotate(45deg)}.st-activity-summary{display:grid;grid-template-columns:32px minmax(0,1fr);column-gap:9px;align-items:center}.st-activity-step[aria-expanded="true"] .st-activity-icon{border-color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 7%,var(--st-layer))}.st-activity-icon{grid-row:1/3;width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--st-border);border-radius:50%;color:var(--st-brand)}.st-activity-copy strong{display:block;font-size:12px}.st-activity-copy span{display:block;margin-top:2px;color:var(--st-muted);font-size:11px}.st-activity-expanded{margin-top:12px;padding:11px 13px;border:1px solid var(--st-border-soft);border-radius:7px;background:var(--st-layer-2)}.st-activity-expanded strong{display:block;margin-bottom:7px;font-size:11px}.st-detail-list{margin:0;padding-left:16px;color:var(--st-muted);font-size:10.5px;columns:2;column-gap:30px}.st-detail-list li{break-inside:avoid}.st-detail-list li+li{margin-top:6px}.st-detail-boundary{margin:9px 0 0;color:var(--st-faint);font-size:10px}
        .st-methods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.st-method-card{min-width:0;padding:12px 13px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer)}.st-method-row{display:flex;align-items:center;gap:10px}.st-method-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--st-brand) 10%,transparent);color:var(--st-brand);flex:none}.st-method-main{min-width:0;flex:1}.st-method-name{font-size:13px;font-weight:620;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-method-meta{margin-top:2px;color:var(--st-muted);font-size:11px}.st-evidence-row{margin-top:9px;padding:8px 9px;display:grid;gap:4px;border:1px solid var(--st-border-soft);border-radius:6px;background:var(--st-layer-2);color:var(--st-muted);font-size:10px}.st-evidence-row code{color:var(--st-text);font:inherit;overflow-wrap:anywhere}.st-method-events{margin:10px -2px -2px;padding-top:8px;border-top:1px solid var(--st-border-soft)}.st-method-events summary{color:var(--st-muted);font-size:11px;cursor:pointer}.st-event-list{margin:8px 0 0;padding:0;list-style:none}.st-event-list li{padding:8px 0;color:var(--st-muted);font-size:10.5px}.st-event-list li+li{border-top:1px solid var(--st-border-soft)}.st-event-head{display:flex;align-items:center;gap:8px}.st-event-head strong{min-width:0;flex:1;color:var(--st-text);font-size:11px}.st-event-copy{margin:4px 0 0}.st-event-boundary{margin:3px 0 0;color:var(--st-faint);font-size:10px}.st-status{display:inline-flex;align-items:center;gap:5px;min-height:23px;padding:0 7px;border:1px solid var(--st-border);border-radius:999px;color:var(--st-muted);background:var(--st-layer);font-size:10.5px;white-space:nowrap}.st-status::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}.st-status[data-tone="brand"]{color:var(--st-brand)}.st-status[data-tone="success"]{color:var(--st-success)}.st-status[data-tone="warning"]{color:var(--st-warning)}.st-status[data-tone="error"]{color:var(--st-error)}
        .st-dependency-label{margin:15px 0 7px;color:var(--st-muted);font-size:11px}.st-dependencies{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--st-border);border-radius:8px;overflow:hidden}.st-dependency{padding:10px;min-width:0;text-align:center}.st-dependency+.st-dependency{border-left:1px solid var(--st-border-soft)}.st-dependency strong{display:block;font-size:11px}.st-dependency span{display:block;margin-top:2px;color:var(--st-faint);font-size:10px}
        .st-continuity{border:1px solid var(--st-border);border-radius:8px;overflow:hidden}.st-continuity-head{padding:10px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--st-border-soft)}.st-continuity-head strong{flex:1}.st-continuity-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.st-continuity-step{padding:13px;display:grid;grid-template-columns:24px minmax(0,1fr);column-gap:9px;align-content:start}.st-continuity-step+.st-continuity-step{border-left:1px solid var(--st-border-soft)}.st-mini-number{grid-row:1/3;width:22px;height:22px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--st-brand) 35%,var(--st-border));border-radius:50%;color:var(--st-brand);font-size:11px}.st-continuity-step strong{display:block;font-size:12px}.st-continuity-step p{margin:4px 0 0;color:var(--st-muted);font-size:11px}
        .st-learning-cards{display:grid;gap:11px}.st-learning-card{border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer);overflow:hidden}.st-learning-head{padding:11px 13px;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid var(--st-border-soft)}.st-learning-icon{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--st-border);border-radius:7px;color:var(--st-brand);flex:none}.st-learning-title{min-width:0;flex:1}.st-learning-title strong{display:block;font-size:13px}.st-learning-title span{display:block;margin-top:2px;color:var(--st-muted);font-size:10.5px}.st-learning-body{padding:12px 13px;display:grid;gap:12px}.st-learning-block h4{margin:0 0 7px;font-size:11px}.st-learning-list{margin:0;padding-left:20px;color:var(--st-muted);font-size:11px}.st-learning-list li+li{margin-top:6px}.st-learning-empty{margin:0;color:var(--st-muted);font-size:11px}.st-learning-deps{display:flex;flex-wrap:wrap;gap:6px}.st-learning-dep{padding:4px 7px;border:1px solid var(--st-border-soft);border-radius:999px;color:var(--st-muted);background:var(--st-layer-2);font-size:10px}.st-learning-dep[data-active="true"]{border-color:color-mix(in srgb,var(--st-brand) 28%,var(--st-border));color:var(--st-brand)}.st-learning-note{padding:9px 10px;border-left:2px solid var(--st-brand);background:var(--st-layer-2);color:var(--st-muted);font-size:10.5px}.st-learning-boundary{padding:9px 10px;border-radius:7px;background:var(--st-layer-2);color:var(--st-faint);font-size:10px}
        .st-summary{border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer)}.st-summary-head{padding:11px 13px;border-bottom:1px solid var(--st-border-soft);display:flex;align-items:center;gap:8px}.st-summary-head h3{margin:0;font-size:13px}.st-summary-body{padding:12px 13px;display:grid;gap:10px}.st-summary-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:10px}.st-summary-row strong{font-size:11px}.st-summary-row p{margin:0;color:var(--st-muted);font-size:11px}.st-summary-boundary{padding:9px 10px;border-radius:7px;background:var(--st-layer-2);color:var(--st-muted);font-size:10.5px}
        .st-panel+.st-panel{margin-top:23px;padding-top:20px;border-top:1px solid var(--st-border)}.st-panel h2{margin:0 0 5px;font-size:14px}.st-panel-note{margin:0 0 12px;color:var(--st-muted);font-size:11px}.st-continuity-review{display:grid;gap:6px}.st-continuity-review .st-button{justify-content:flex-start}.st-continuity-review .st-button[aria-pressed="true"]{border-color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 8%,var(--st-layer));color:var(--st-brand)}.st-reset-link{margin-top:8px;padding:0;border:0;background:transparent;color:var(--st-muted);font:inherit;font-size:10.5px;cursor:pointer}.st-reset-link:hover{color:var(--st-brand)}.st-local-only{margin-top:10px;display:flex;align-items:flex-start;gap:6px;color:var(--st-faint);font-size:10px}.st-local-only svg{flex:none;margin-top:1px}.st-input,.st-select,.st-textarea{width:100%;padding:0 10px;border:1px solid var(--st-border);border-radius:7px;background:var(--st-layer);color:var(--st-text);outline:none}.st-input,.st-select{height:34px}.st-textarea{min-height:72px;padding-block:8px;resize:vertical;line-height:1.45}.st-input:focus,.st-select:focus,.st-textarea:focus{border-color:var(--st-brand)}.st-learning-form{display:grid;gap:10px}.st-field-label{display:grid;gap:5px;color:var(--st-muted);font-size:10.5px}.st-field-count{text-align:right;color:var(--st-faint);font-size:9.5px}.st-learning-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.st-learning-actions .st-button{min-width:0;padding-inline:9px;white-space:nowrap;font-size:12px}.st-copy-state{margin-top:8px;color:var(--st-success);font-size:10px}.st-version-warning{margin-bottom:10px;padding:8px 9px;border:1px solid color-mix(in srgb,var(--st-warning) 35%,var(--st-border));border-radius:7px;color:var(--st-warning);background:color-mix(in srgb,var(--st-warning) 5%,var(--st-layer));font-size:10.5px}.st-output-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.st-output-list{margin:10px 0 0;padding:0;list-style:none}.st-output-list li{padding:8px;border:1px solid var(--st-border);border-radius:7px;color:var(--st-muted);font-size:11px;overflow-wrap:anywhere}.st-output-list li+li{margin-top:6px}.st-notice{padding:9px 10px;border:1px solid var(--st-border);border-radius:7px;color:var(--st-muted);background:var(--st-layer-2);font-size:11px}.st-error{margin-bottom:10px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--st-error) 35%,var(--st-border));border-radius:7px;color:var(--st-error);font-size:11px}
        .st-map-wrap{min-width:0}.st-map-head{margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.st-map-head h2{margin:0;font-size:18px}.st-map-head p{margin:4px 0 0;color:var(--st-muted);font-size:11px}.st-legend{display:flex;flex-wrap:wrap;gap:9px 14px;color:var(--st-muted);font-size:10.5px}.st-legend-item{display:inline-flex;align-items:center;gap:6px}.st-legend-line{width:22px;border-top:2px solid var(--st-brand)}.st-legend-line[data-kind="inferred"]{border-top-style:dashed}.st-legend-line[data-kind="human"]{border-color:var(--st-brand);border-top-style:dashed}.st-legend-line[data-kind="dependency"]{border-color:var(--st-faint);border-top-style:dashed}
        .st-map-scroll{overflow:auto;border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer)}.st-map-canvas{position:relative;width:max(100%,1000px);min-width:1000px;height:660px;background-image:linear-gradient(var(--st-grid) 1px,transparent 1px),linear-gradient(90deg,var(--st-grid) 1px,transparent 1px);background-size:24px 24px}.st-map-lines{position:absolute;inset:0 auto auto 0;width:1000px;height:100%;pointer-events:none}.st-node{position:absolute;padding:10px 11px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer);color:var(--st-text);text-align:left;cursor:pointer;overflow:hidden}.st-node:hover,.st-node[aria-current="true"]{border-color:color-mix(in srgb,var(--st-brand) 65%,var(--st-border));box-shadow:0 0 0 2px color-mix(in srgb,var(--st-brand) 8%,transparent)}.st-node-task{border-color:var(--st-brand)}.st-node-skill,.st-node-step{display:flex;align-items:center;gap:9px}.st-node-step{border-color:color-mix(in srgb,var(--st-brand) 50%,var(--st-border))}.st-node-dependency{padding:8px;text-align:center}.st-node-number{width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:var(--st-brand);color:white;font-size:11px;flex:none}.st-node-title{display:block;font-size:12px;font-weight:620;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-node-sub{display:block;margin-top:2px;color:var(--st-muted);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-node-status{margin-left:auto;color:var(--st-success);flex:none}.st-map-section-label{position:absolute;color:var(--st-muted);font-size:11px;font-weight:620;background:var(--st-layer);padding:0 5px}.st-map-summary{margin-top:12px}
        .st-inspector-title{display:flex;align-items:center;gap:8px}.st-inspector-title h2{margin:0;font-size:14px}.st-inspector-body{margin-top:14px}.st-inspector-block+.st-inspector-block{margin-top:16px;padding-top:14px;border-top:1px solid var(--st-border)}.st-inspector-block h3{margin:0 0 6px;font-size:11px}.st-inspector-block p{margin:0;color:var(--st-muted);font-size:11px}.st-inspector-list{margin:0;padding-left:17px;color:var(--st-muted);font-size:11px}.st-inspector-list li+li{margin-top:6px}.st-inspector-event strong{display:block;color:var(--st-text);font-weight:620}.st-inspector-event span{display:block;margin-top:2px;color:var(--st-muted)}
        .st-empty-page,.st-trace-state{height:100%;display:grid;place-items:center;padding:32px;color:var(--st-muted)}.st-empty-page-inner{width:min(100%,420px)}.st-empty-page p{margin:0}.st-trace-state-line{display:inline-flex;align-items:center;gap:9px;font-size:13px}.st-trace-state-dot{width:7px;height:7px;border-radius:50%;background:var(--st-faint)}.st-trace-state[data-kind="loading"] .st-trace-state-dot{background:var(--st-brand);animation:st-pulse 1.2s ease-in-out infinite}.st-layout[data-simple="true"]{grid-template-columns:minmax(0,1fr)}@keyframes st-pulse{50%{opacity:.35}}
        .st-toolbar-split{width:1px;height:24px;background:var(--st-border);flex:none}.st-toolbar-label{color:var(--st-faint);font-size:10px;white-space:nowrap}.st-library-button[aria-pressed="true"]{border-color:color-mix(in srgb,var(--st-brand) 50%,var(--st-border));color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 6%,var(--st-layer))}
        .st-catalog-page{height:100%;min-height:0;display:grid;grid-template-columns:340px minmax(0,1fr);background:var(--st-layer)}.st-catalog-sidebar{min-width:0;overflow:auto;border-right:1px solid var(--st-border);background:var(--st-bg)}.st-catalog-tools{position:sticky;top:0;z-index:2;padding:14px;border-bottom:1px solid var(--st-border);background:color-mix(in srgb,var(--st-bg) 92%,transparent);backdrop-filter:blur(8px)}.st-catalog-count{margin:0 0 9px;font-size:12px;font-weight:620}.st-search-wrap{position:relative}.st-search-wrap svg{position:absolute;left:9px;top:9px;color:var(--st-faint);pointer-events:none}.st-search-wrap .st-input{padding-left:31px}.st-filter-row{margin-top:9px;display:flex;gap:6px;overflow:auto;padding-bottom:2px}.st-filter{min-height:27px;padding:0 8px;border:1px solid var(--st-border);border-radius:999px;background:var(--st-layer);color:var(--st-muted);font-size:10px;white-space:nowrap;cursor:pointer}.st-filter[aria-pressed="true"]{border-color:var(--st-brand);color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 6%,var(--st-layer))}.st-catalog-warning{margin-top:8px;color:var(--st-warning);font-size:10px}.st-catalog-list{margin:0;padding:6px;list-style:none}.st-catalog-item{width:100%;padding:11px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:inherit;text-align:left;cursor:pointer}.st-catalog-item:hover{background:var(--st-layer)}.st-catalog-item[aria-current="true"]{border-color:var(--st-border);background:var(--st-layer);box-shadow:0 1px 2px rgba(20,24,32,.04)}.st-catalog-item-head{display:flex;align-items:center;gap:8px}.st-catalog-item-head strong{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.st-catalog-item-copy{margin:5px 20px 7px 0;color:var(--st-muted);font-size:10.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.st-catalog-signals{display:flex;flex-wrap:wrap;gap:5px}.st-signal{padding:2px 6px;border:1px solid var(--st-border-soft);border-radius:999px;color:var(--st-muted);background:var(--st-layer-2);font-size:9.5px}.st-signal[data-tone="brand"]{color:var(--st-brand)}.st-signal[data-tone="warning"]{color:var(--st-warning)}.st-catalog-list-state{padding:28px 16px;color:var(--st-muted);font-size:11px;text-align:center}
        .st-catalog-detail{min-width:0;overflow:auto;padding:24px}.st-catalog-detail-inner{width:min(100%,860px);margin:0 auto}.st-catalog-back{display:none;margin-bottom:12px}.st-detail-empty{height:100%;display:grid;place-items:center;color:var(--st-muted)}.st-skill-title{padding-bottom:18px;border-bottom:1px solid var(--st-border)}.st-skill-title h2{margin:0;font-size:24px;line-height:1.2;letter-spacing:-.02em}.st-skill-title p{max-width:720px;margin:8px 0 0;color:var(--st-muted);font-size:12px}.st-skill-meta{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}.st-evidence-stack{margin-top:18px;display:grid;gap:12px}.st-evidence-section{position:relative;padding:16px 17px 16px 48px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer)}.st-evidence-section::before{content:"";position:absolute;left:24px;top:42px;bottom:-14px;border-left:1px solid var(--st-border)}.st-evidence-section:last-child::before{display:none}.st-evidence-index{position:absolute;left:13px;top:15px;width:23px;height:23px;display:grid;place-items:center;border:1px solid var(--st-border);border-radius:50%;background:var(--st-layer);color:var(--st-brand);font-size:10px;font-weight:650}.st-evidence-section h3{margin:0;font-size:13px}.st-evidence-kicker{margin:3px 0 11px;color:var(--st-faint);font-size:10px}.st-definition-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.st-definition-cell{padding:9px 10px;border-radius:7px;background:var(--st-layer-2)}.st-definition-cell span{display:block;color:var(--st-faint);font-size:9.5px}.st-definition-cell strong{display:block;margin-top:3px;font-size:11px;overflow-wrap:anywhere}.st-history-list{display:grid;gap:8px}.st-history-card{border:1px solid var(--st-border-soft);border-radius:7px;overflow:hidden}.st-history-head{padding:9px 10px;display:flex;align-items:center;gap:8px;background:var(--st-layer-2)}.st-history-head strong{min-width:0;flex:1;font-size:11px}.st-history-meta{padding:8px 10px;color:var(--st-muted);font-size:10px}.st-history-action{padding:0;border:0;background:transparent;color:var(--st-brand);font-size:10px;cursor:pointer}.st-history-expanded{padding:10px;border-top:1px solid var(--st-border-soft);display:grid;gap:8px}.st-note-fields{display:grid;gap:7px}.st-note-field{padding:8px 9px;border-left:2px solid var(--st-brand);background:var(--st-layer-2)}.st-note-field strong{display:block;font-size:10px}.st-note-field p{margin:3px 0 0;color:var(--st-muted);font-size:10.5px}.st-boundary-copy{margin:10px 0 0;color:var(--st-faint);font-size:10px}.st-association-exact{color:var(--st-success)}.st-association-candidate{color:var(--st-warning)}.st-association-conflict{color:var(--st-error)}
        @media(max-width:1050px){.st-layout{grid-template-columns:minmax(0,1fr) 250px}.st-dependencies{grid-template-columns:repeat(3,minmax(0,1fr))}.st-dependency:nth-child(4){border-left:0;border-top:1px solid var(--st-border-soft)}.st-dependency:nth-child(5){border-top:1px solid var(--st-border-soft)}}
        @media(max-width:1000px){[data-plugin="dsh-skill-trace"]{overflow:auto;max-height:none;height:auto;min-height:100%}.st-shell{height:auto;min-height:100dvh}.st-topbar{flex-wrap:wrap}.st-heading{flex-basis:100%}.st-view-switch{flex:1}.st-view-button{flex:1}.st-layout{display:block}.st-main,.st-aside{overflow:visible}.st-aside{border-left:0;border-top:1px solid var(--st-border)}.st-activity{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:12px}.st-continuity-steps{grid-template-columns:1fr}.st-activity-step{padding:0}.st-activity-step:not(:last-child)::after{display:none}.st-detail-list{columns:1}.st-methods{grid-template-columns:1fr}.st-continuity-step+.st-continuity-step{border-left:0;border-top:1px solid var(--st-border-soft)}.st-catalog-page{height:auto;grid-template-columns:1fr}.st-catalog-page[data-selected="true"] .st-catalog-sidebar{display:none}.st-catalog-page:not([data-selected="true"]) .st-catalog-detail{display:none}.st-catalog-sidebar{overflow:visible;border-right:0;border-bottom:1px solid var(--st-border)}.st-catalog-tools{position:static}.st-catalog-detail{overflow:visible}.st-catalog-back{display:inline-flex}.st-toolbar-label{display:none}}
        @media(max-width:460px){.st-main,.st-aside{padding:12px}.st-receipt-head,.st-receipt-section{padding-inline:14px}.st-activity{grid-template-columns:1fr}.st-button,.st-input,.st-select,.st-textarea{min-height:44px;font-size:16px}.st-view-button,.st-filter{min-height:40px}.st-output-form,.st-learning-actions{grid-template-columns:1fr}.st-output-form .st-button,.st-learning-actions .st-button{width:100%}.st-dependencies{grid-template-columns:repeat(2,minmax(0,1fr))}.st-dependency:nth-child(3),.st-dependency:nth-child(5){border-left:0}.st-dependency:nth-child(n+3){border-top:1px solid var(--st-border-soft)}.st-summary-row{grid-template-columns:1fr;gap:3px}.st-toolbar-split{display:none}.st-catalog-detail{padding:14px}.st-definition-grid{grid-template-columns:1fr}.st-evidence-section{padding-left:42px}}
        @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.st-trace-state-dot{animation:none!important}}
        .st-session-chip{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,rgba(22,27,36,.14));border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#626871);font-size:11px;white-space:nowrap}.st-session-chip svg{color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-500,#3567d6))}
      `
      document.head.appendChild(style)
      return () => style.remove()
    }

    async function api(path, options = {}) {
      const response = await fetch(`${API_ROOT}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } })
      const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`)
      return body
    }

    function statusBadge(status, label) {
      const meta = STATUS[status] || STATUS.unknown
      return h('span', { className: 'st-status', 'data-tone': meta.tone }, label || meta.label)
    }

    function eventOutcome(event) {
      if (event.status === 'loaded') return '系统已把这次加载请求与成功结果配对。'
      if (event.status === 'failed') return `系统收到明确失败结果${event.errorCode ? `（${event.errorCode}）` : ''}。`
      if (event.status === 'outcome-unknown') return '会话恢复时无法确认工具是否已经执行；不能写成成功或失败。'
      if (event.status === 'not-started') return '会话恢复时确认该工具尚未开始执行。'
      if (event.status === 'unresolved') return '记录不完整，尚未找到可配对结果；这不是正常生命周期的目标状态。'
      return '系统已观察到加载请求，但结果尚未确定。'
    }

    function shortHash(value) {
      return typeof value === 'string' && value.startsWith('sha256:') ? `${value.slice(0, 19)}…` : ''
    }

    function sourceFor(model, skillName) {
      return (model.sourceSnapshots || []).find((item) => item.skillName === skillName)
    }

    function learningCardFor(model, skillName) {
      return (model.learningCards || []).find((item) => item.skillName === skillName)
    }

    function versionStateCopy(state) {
      if (state === 'match') return { label: '当前版本一致', tone: 'success' }
      if (state === 'changed') return { label: '当前版本已变化', tone: 'warning' }
      return { label: '版本无法比较', tone: 'muted' }
    }

    function iterationChecklist(card, note = {}) {
      const version = versionStateCopy(card?.versionState).label
      const hashes = card?.observedHashes?.length ? card.observedHashes.map(shortHash).join('、') : '未取得标准指令指纹'
      const steps = card?.steps?.length ? card.steps.map((step, index) => `${index + 1}. ${step.title}`).join('\n') : '- 未提取到结构化步骤，请先人工核对 Skill 说明。'
      const dependencies = (card?.dependencies || []).filter((item) => item.required === 'candidate').map((item) => DEPENDENCIES[item.type] || item.type)
      return [
        `# ${card?.skillName || 'Skill'} 迭代准备清单`,
        '',
        `- 本次指令指纹：${hashes}`,
        `- 版本状态：${version}`,
        `- 依赖候选：${dependencies.length ? dependencies.join('、') : '未观察到明确线索'}`,
        '',
        '## Skill 声明的候选步骤',
        steps,
        '',
        '## 我的理解',
        note.understanding || '待填写',
        '',
        '## 我想改进',
        note.improvementIntent || '待填写',
        '',
        '## 下次如何验证',
        note.validationPlan || '待填写',
        '',
        '> 证据边界：以上候选步骤来自本次返回的 Skill 指令，不证明 Agent 已执行、遵循或因此取得结果。此清单不会自动修改或发布 Skill。',
      ].join('\n')
    }

    function dependencyState(item) {
      return item?.required === 'candidate' ? '发现候选线索' : '未观察到明确线索'
    }

    function eventTitle(event) {
      return `第 ${event.turn ?? '?'} 轮 · 第 ${event.step ?? '?'} 步请求加载 ${event.name}`
    }

    function summaryText(model) {
      const summary = model.summary || {}
      const sequence = summary.eventSkillNames?.length ? summary.eventSkillNames.join(' → ') : '没有可显示的 Skill 加载顺序'
      const repeated = summary.repeatedMethods?.length ? `其中 ${summary.repeatedMethods.map((item) => `${item.name} 重复出现，共 ${item.callCount} 次`).join('、')}。` : '没有重复加载记录。'
      const output = model.outputs?.length ? `用户已关联 ${model.outputs.length} 个本地产出：${model.outputs.map((item) => item.relativeRef).join('、')}。` : '尚未关联本次产出；系统不会从最终回答或项目文件中自动推断产出关系。'
      return {
        flow: `按加载事件顺序，系统观测到 ${sequence}。${repeated}`,
        result: `共 ${summary.eventCount ?? 0} 次加载：${summary.loadedCount ?? 0} 次成功、${summary.failedCount ?? 0} 次失败、${summary.outcomeUnknownCount ?? 0} 次结果未知、${summary.notStartedCount ?? 0} 次未开始、${summary.unresolvedCount ?? 0} 次记录待定。`,
        output,
      }
    }

    function SessionSummary({ model, className = '' }) {
      const copy = summaryText(model)
      return h('section', { className: `st-summary ${className}`.trim(), 'aria-label': '本次流程小结' },
        h('div', { className: 'st-summary-head' }, h(Icon, { name: 'receipt', size: 16 }), h('h3', null, '本次流程小结')),
        h('div', { className: 'st-summary-body' },
          h('div', { className: 'st-summary-row' }, h('strong', null, '可见流程'), h('p', null, copy.flow)),
          h('div', { className: 'st-summary-row' }, h('strong', null, '加载结果'), h('p', null, copy.result)),
          h('div', { className: 'st-summary-row' }, h('strong', null, '本次产出'), h('p', null, copy.output)),
          h('div', { className: 'st-summary-boundary' }, '证据边界：以上只说明 Skill 加载事件及人工关联的产出。现有事件无法回答 Agent 为什么选择该 Skill，也不能证明 Agent 后续遵循了方法或方法促成了结果。')))
    }

    function activityDetails(model, index) {
      const summary = model.summary || {}
      if (index === 0) return (model.turnDetails || []).map((turn) => `第 ${turn.turn} 轮发生 ${turn.stepCount} 个步骤；观测到 ${turn.eventCount} 次 Skill 加载${turn.skillNames.length ? `（${turn.skillNames.join('、')}）` : ''}。`)
      if (index === 1) {
        const loadSteps = new Set((model.events || []).map((event) => `${event.turn}:${event.step}`)).size
        return [...(model.events || []).map((event) => `${eventTitle(event)}；${eventOutcome(event)}`), `另有 ${Math.max(0, (summary.stepCount || 0) - loadSteps)} 个已观察步骤没有标准 skill 工具事件；这不等于没有使用其他 Consumer。`]
      }
      if (index === 2) return (model.methods || []).map((method) => `${method.name} 共请求 ${method.callCount} 次：${method.loadedCount} 次成功、${method.failedCount} 次失败、${method.outcomeUnknownCount || 0} 次结果未知、${method.notStartedCount || 0} 次未开始、${method.unresolvedCount + method.requestedCount} 次记录待定。`)
      return [model.coverage?.note || '当前观测范围不可用。', '收据由确定性规则生成，没有调用模型总结，也没有保存 Prompt、Skill 正文或工具输出。']
    }

    function ReceiptView({ model, workspaceLabel }) {
      const [activeStage, setActiveStage] = React.useState(null)
      const summary = model.summary || {}
      const activity = [
        ['开始处理', `${summary.turnCount || 0} 个 Turn`, 'arrow'],
        ['执行步骤', `${summary.stepCount || 0} 个 Step`, 'arrow'],
        ['请求加载', `${summary.methodCount || 0} 个 Skill · ${summary.loadedCount || 0}/${summary.eventCount || 0} 次成功`, 'skill'],
        ['形成收据', model.coverage?.status === 'verified-standard-contract' ? '标准事件已验证' : '覆盖待确认', 'receipt'],
      ]
      const candidateSteps = model.continuity?.steps || []
      const nextSteps = candidateSteps.length
        ? candidateSteps.map((item) => [item.title, `候选步骤来自 ${item.skillName} 本次返回指令的有序列表；尚未证明 Agent 已执行。`])
        : [
            ['展开加载记录', '先核对在哪一轮、哪一步请求了哪个 Skill，以及加载结果。'],
            ['核对依赖条件', '当前没有可安全提取的有序步骤，请按 Skill 说明核对网络、模型、MCP、脚本和权限。'],
            ['关联本次产出', '如需保存产出关系，请在右侧添加工作区内的相对引用。'],
          ]
      const activityNodes = activity.map(([title, note, icon], index) => h('button', { type: 'button', className: 'st-activity-step', key: title, 'aria-expanded': activeStage === index, onClick: () => setActiveStage(activeStage === index ? null : index) },
        h('span', { className: 'st-activity-summary' },
          h('span', { className: 'st-activity-icon' }, h(Icon, { name: icon, size: 15 })),
          h('span', { className: 'st-activity-copy' }, h('strong', null, title), h('span', null, note)))))
      const methodNodes = (model.methods || []).map((method) => {
        const source = sourceFor(model, method.name)
        const observedHash = source?.observedInstructionSha256?.[0]
        const sourceSummary = source?.definitionAvailable
          ? `${source.provider || '来源未标记'}${source.source ? ` · ${source.source}` : ''} · ${source.match === 'match' ? '当前内容一致' : source.match === 'mismatch' ? '当前内容已变化' : '内容一致性未知'}`
          : '当前来源不可用'
        return h('div', { className: 'st-method-card', key: method.id },
        h('div', { className: 'st-method-row' },
          h('div', { className: 'st-method-icon' }, h(Icon, { name: 'skill', size: 18 })),
          h('div', { className: 'st-method-main' },
            h('div', { className: 'st-method-name' }, method.name),
            h('div', { className: 'st-method-meta' }, `${method.callCount} 次调用 · ${method.loadedCount}/${method.callCount} 次成功 · Consumer 身份不可区分`)),
          statusBadge(method.status, method.status === 'mixed' ? `${method.loadedCount}/${method.callCount} 次成功` : undefined)),
        h('div', { className: 'st-evidence-row' }, h('span', null, sourceSummary), observedHash ? h('code', { title: '本次实际返回指令的 SHA-256；不保存正文' }, shortHash(observedHash)) : h('span', null, '未取得指令指纹')),
        h('details', { className: 'st-method-events' },
          h('summary', null, `查看 ${method.callCount} 次加载记录`),
          h('ol', { className: 'st-event-list' }, method.events.map((event) => h('li', { key: event.id },
            h('div', { className: 'st-event-head' }, h('strong', null, eventTitle(event)), statusBadge(event.status)),
            h('p', { className: 'st-event-copy' }, eventOutcome(event)),
            event.evidenceFingerprint?.value ? h('p', { className: 'st-event-boundary' }, `本次指令指纹：${shortHash(event.evidenceFingerprint.value)}；只用于比较内容是否相同。`) : null,
            h('p', { className: 'st-event-boundary' }, '这只证明加载请求及结果，不证明后续采用或有效。'))))))
      })
      const dependencyNodes = (model.continuity?.dependencies || []).map((item) => h('div', { className: 'st-dependency', key: item.type },
        h('strong', null, DEPENDENCIES[item.type] || item.type),
        h('span', null, dependencyState(item))))
      const learningNodes = (model.learningCards || []).map((card) => {
        const version = versionStateCopy(card.versionState)
        const activeDependencies = card.dependencies.filter((item) => item.required === 'candidate')
        return h('section', { className: 'st-learning-card', key: card.skillName },
          h('div', { className: 'st-learning-head' },
            h('div', { className: 'st-learning-icon' }, h(Icon, { name: 'book', size: 17 })),
            h('div', { className: 'st-learning-title' }, h('strong', null, card.skillName), h('span', null, `${card.loadedCount} 次成功加载 · ${card.observedHashes.length ? `指纹 ${card.observedHashes.map(shortHash).join('、')}` : '未取得标准指令指纹'}`)),
            h('span', { className: 'st-status', 'data-tone': version.tone }, version.label)),
          h('div', { className: 'st-learning-body' },
            card.versionState === 'changed' ? h('div', { className: 'st-version-warning' }, '当前 Skill 内容与本次观察版本不同。先核对版本，再据此修改。') : null,
            h('div', { className: 'st-learning-block' }, h('h4', null, '这个 Skill 声明的候选步骤'),
              card.steps.length
                ? h('ol', { className: 'st-learning-list' }, card.steps.map((step) => h('li', { key: step.title }, step.title)))
                : h('p', { className: 'st-learning-empty' }, '本次返回指令中没有安全可提取的有序步骤；请人工核对 Skill 说明。')),
            h('div', { className: 'st-learning-block' }, h('h4', null, '依赖线索'),
              h('div', { className: 'st-learning-deps' }, card.dependencies.map((item) => h('span', { className: 'st-learning-dep', 'data-active': item.required === 'candidate' ? 'true' : undefined, key: item.type }, `${DEPENDENCIES[item.type] || item.type} · ${item.required === 'candidate' ? '待核对' : '未知'}`)))),
            card.note ? h('div', { className: 'st-learning-note' }, `已保存个人理解${card.note.improvementIntent ? '和改进意图' : ''}；可在右侧继续编辑或复制清单。`) : null,
            h('div', { className: 'st-learning-boundary' }, `证据边界：这些步骤来自 Skill 指令结构，不是本会话已执行步骤。${activeDependencies.length ? '依赖只是关键词线索，仍需人工核对。' : '当前未观察到明确依赖线索，不等于完全无依赖。'}`)))
      })
      const nextStepNodes = nextSteps.map(([title, note], index) => h('div', { className: 'st-continuity-step', key: title },
        h('div', { className: 'st-mini-number' }, index + 1),
        h('strong', null, title),
        h('p', null, note)))
      return h('article', { className: 'st-receipt', 'aria-label': '本次 Skill 收据' },
        h('header', { className: 'st-receipt-head' }, h('h2', null, '本次 Skill 收据'), h('div', { className: 'st-receipt-meta' }, `${workspaceLabel} · 本地优先 · 已加载不等于有效`)),
        h('section', { className: 'st-receipt-section' },
          h('h3', { className: 'st-section-title' }, h('span', { className: 'st-section-number' }, '1'), '本次发生了什么'),
          h('div', { className: 'st-activity' }, activityNodes),
          activeStage === null ? null : h('div', { className: 'st-activity-expanded' },
            h('strong', null, `${activity[activeStage][0]} · 具体发生了什么`),
            h('ul', { className: 'st-detail-list' }, activityDetails(model, activeStage).map((item) => h('li', { key: item }, item))),
            activeStage < 3 ? h('p', { className: 'st-detail-boundary' }, '这里只说明观察到什么；无法从事件得知 Agent 为什么这样安排任务。') : null)),
        h('section', { className: 'st-receipt-section' },
          h('h3', { className: 'st-section-title' }, h('span', { className: 'st-section-number' }, '2'), 'Skill 加载结果'),
          h('div', { className: 'st-methods' }, methodNodes),
          h('div', { className: 'st-dependency-label' }, '依赖线索（候选，不等于必需或可用）'),
          h('div', { className: 'st-dependencies' }, dependencyNodes)),
        h('section', { className: 'st-receipt-section' },
          h('h3', { className: 'st-section-title' }, h('span', { className: 'st-section-number' }, '3'), '逐个看懂 Skill'),
          h('div', { className: 'st-learning-cards' }, learningNodes)),
        h('section', { className: 'st-receipt-section' },
          h('h3', { className: 'st-section-title' }, h('span', { className: 'st-section-number' }, '4'), '你接下来能做什么'),
          h('div', { className: 'st-continuity' },
            h('div', { className: 'st-continuity-head' }, h('strong', null, '继续使用指南'), statusBadge(model.continuity?.status || 'unknown')),
            h('div', { className: 'st-continuity-steps' }, nextStepNodes))),
        h('section', { className: 'st-receipt-section' }, h(SessionSummary, { model })))
    }

    function MapView({ model, selectedNode, onSelectNode }) {
      const methods = model.nodes?.methods || []
      const steps = model.nodes?.steps || []
      const dependencies = model.nodes?.dependencies || []
      const outputs = model.nodes?.outputs || []
      const rowGap = 92
      const contentTop = 135
      const methodIndex = new Map(methods.map((method, index) => [method.id, index]))
      const methodY = (index) => contentTop + index * rowGap
      const stepY = (index) => contentTop + index * rowGap
      const lastStepY = stepY(Math.max(0, steps.length - 1))
      const dependencyY = Math.max(590, contentTop + Math.max(methods.length, steps.length) * rowGap + 90)
      const dependencyBusY = dependencyY - 42
      const canvasHeight = dependencyY + 82
      const output = outputs.length === 0
        ? { id: 'output:pending', type: 'output', label: '尚未关联本次产出', status: 'unknown' }
        : outputs.length === 1
          ? outputs[0]
          : { id: 'output:all', type: 'output', label: `${outputs.length} 个已关联产出`, status: 'human-confirmed', items: outputs }
      const outputY = 24
      const selectedId = selectedNode?.id
      const nodeButton = (node, className, style, ...children) => h('button', { type: 'button', className: `st-node ${className}`, style, key: node.id, 'aria-current': selectedId === node.id ? 'true' : undefined, onClick: () => onSelectNode(node) }, ...children)
      const statusIcon = (status) => status === 'loaded' ? h('span', { className: 'st-node-status' }, h(Icon, { name: 'check', size: 15 })) : ['failed', 'mixed', 'unresolved', 'outcome-unknown'].includes(status) ? h('span', { className: 'st-node-status', style: { color: status === 'failed' ? 'var(--st-error)' : 'var(--st-warning)' } }, h(Icon, { name: 'alert', size: 15 })) : null
      const hasDependencySignals = dependencies.some((item) => item.required === 'candidate')
      return h('div', { className: 'st-map-wrap' },
        h('div', { className: 'st-map-head' }, h('div', null, h('h2', null, '本次流程地图'), h('p', null, '点击任一节点查看白话说明；节点和连线来自同一份收据，虚线不代表因果。')), h('div', { className: 'st-legend', 'aria-label': '关系图例' }, h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line' }), '事件顺序'), h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line', 'data-kind': 'inferred' }), 'Skill 与加载步骤'), h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line', 'data-kind': 'human' }), '人工关联'), h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line', 'data-kind': 'dependency' }), '依赖候选'))),
        h('div', { className: 'st-map-scroll' }, h('div', { className: 'st-map-canvas', style: { height: canvasHeight } },
          h('svg', { className: 'st-map-lines', viewBox: `0 0 1000 ${canvasHeight}`, 'aria-hidden': 'true' },
            h('defs', null, h('marker', { id: 'st-arrow-blue', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--st-brand)' })), h('marker', { id: 'st-arrow-gray', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--st-faint)' }))),
            h('path', { d: 'M520 100 V135', stroke: 'var(--st-brand)', strokeWidth: 1.5, fill: 'none', markerEnd: 'url(#st-arrow-blue)' }),
            ...steps.slice(0, -1).map((_, index) => h('path', { key: `flow-${index}`, d: `M535 ${stepY(index) + 72} V${stepY(index + 1)}`, stroke: 'var(--st-brand)', strokeWidth: 1.5, fill: 'none', markerEnd: 'url(#st-arrow-blue)' })),
            ...steps.map((step, index) => h('path', { key: `skill-${step.id}`, d: `M280 ${methodY(methodIndex.get(step.methodId) ?? 0) + 36} H335 V${stepY(index) + 36} H390`, stroke: 'var(--st-brand)', strokeWidth: 1.4, strokeDasharray: '6 5', fill: 'none', markerEnd: 'url(#st-arrow-blue)' })),
            h('path', { d: 'M660 62 H750', stroke: outputs.length ? 'var(--st-brand)' : 'var(--st-faint)', strokeWidth: 1.4, strokeDasharray: outputs.length ? '0' : '6 5', fill: 'none', markerEnd: outputs.length ? 'url(#st-arrow-blue)' : 'url(#st-arrow-gray)' }),
            h('line', { x1: 100, y1: dependencyBusY, x2: 900, y2: dependencyBusY, stroke: 'var(--st-faint)', strokeWidth: 1.2, strokeDasharray: '5 5' }),
            ...dependencies.map((_, index) => h('line', { key: `dep-${index}`, x1: 100 + index * 190, y1: dependencyY, x2: 100 + index * 190, y2: dependencyBusY, stroke: 'var(--st-faint)', strokeWidth: 1.2, strokeDasharray: '5 5' })),
            h('path', { d: `M520 ${dependencyBusY} V${lastStepY + 72}`, stroke: 'var(--st-faint)', strokeWidth: 1.2, strokeDasharray: '5 5', fill: 'none', markerEnd: 'url(#st-arrow-gray)' }),
            h('text', { x: 680, y: 54, fill: outputs.length ? 'var(--st-muted)' : 'var(--st-faint)', fontSize: 10 }, outputs.length ? '关联到会话' : '尚未关联'), h('text', { x: 445, y: dependencyBusY - 6, fill: 'var(--st-faint)', fontSize: 10 }, hasDependencySignals ? '候选依赖，待核对' : '未观察到明确依赖线索')),
          h('span', { className: 'st-map-section-label', style: { left: 28, top: 120 } }, '观测到的 Skill'), h('span', { className: 'st-map-section-label', style: { left: 388, top: 106 } }, '加载记录'), h('span', { className: 'st-map-section-label', style: { left: 22, top: dependencyBusY + 10 } }, '依赖条件'),
          nodeButton({ id: 'task', type: 'task', label: '当前会话的 Skill 使用情况', status: model.coverage?.status, summary: model.summary }, 'st-node-task', { left: 380, top: 24, width: 280, height: 76 }, h('span', { className: 'st-node-title' }, '当前会话的 Skill 使用情况'), h('span', { className: 'st-node-sub' }, '只展示可验证的 Skill 加载证据')),
          ...methods.map((method, index) => nodeButton(method, 'st-node-skill', { left: 30, top: methodY(index), width: 250, height: 72 }, h(Icon, { name: 'skill', size: 20 }), h('span', { style: { minWidth: 0, flex: 1 } }, h('span', { className: 'st-node-title' }, method.name), h('span', { className: 'st-node-sub' }, `${method.callCount} 次调用 · ${method.loadedCount}/${method.callCount} 成功`)), statusIcon(method.status))),
          ...steps.map((step, index) => nodeButton(step, 'st-node-step', { left: 390, top: stepY(index), width: 290, height: 72 }, h('span', { className: 'st-node-number' }, step.order), h('span', { style: { minWidth: 0, flex: 1 } }, h('span', { className: 'st-node-title' }, step.label), h('span', { className: 'st-node-sub' }, `${step.name} · ${STATUS[step.status]?.label || '结果未知'}`)), statusIcon(step.status))),
          nodeButton(output, 'st-node-output', { left: 750, top: outputY, width: 220, height: 72 }, h(Icon, { name: 'link', size: 18 }), h('span', { style: { minWidth: 0, marginLeft: 8 } }, h('span', { className: 'st-node-title' }, output.label), h('span', { className: 'st-node-sub' }, outputs.length ? '由用户关联到本次会话' : '不会自动归因'))),
          ...dependencies.map((dependency, index) => nodeButton({ ...dependency, label: DEPENDENCIES[dependency.type] || dependency.type }, 'st-node-dependency', { left: 20 + index * 190, top: dependencyY, width: 160, height: 58 }, h('span', { className: 'st-node-title' }, DEPENDENCIES[dependency.type] || dependency.type), h('span', { className: 'st-node-sub' }, dependencyState(dependency)))))),
        h(SessionSummary, { model, className: 'st-map-summary' }))
    }

    function Inspector({ node, model }) {
      const current = node || { id: 'task', type: 'task', label: '当前会话的 Skill 使用情况', status: model.coverage?.status, summary: model.summary }
      const status = current.status || 'unknown'
      const source = current.type === 'skill' ? sourceFor(model, current.name) : null
      const learningCard = current.type === 'skill' ? (current.learningCard || learningCardFor(model, current.name)) : null
      const observations = current.type === 'skill'
        ? [`共观测到 ${current.callCount || 0} 次标准 skill 工具调用；事件本身不含 Consumer 身份。`, `${current.loadedCount || 0} 次成功、${current.failedCount || 0} 次失败、${current.outcomeUnknownCount || 0} 次结果未知、${current.notStartedCount || 0} 次未开始、${(current.unresolvedCount || 0) + (current.requestedCount || 0)} 次记录待定。`, source?.observedInstructionSha256?.length ? `本次指令指纹：${source.observedInstructionSha256.map(shortHash).join('、')}。` : '本次没有可显示的标准指令指纹。', `版本状态：${versionStateCopy(learningCard?.versionState).label}。`]
        : current.type === 'step' ? [eventTitle(current), eventOutcome(current)]
          : current.type === 'output' ? [model.outputs?.length ? `用户已明确关联：${(current.items || [current]).map((item) => item.label || item.relativeRef).join('、')}` : '当前没有用户明确关联的本地产出。', '这些引用关联到整次会话，不指向某个加载步骤；系统不会自动建立方法与产出的因果关系。']
            : current.type === 'dependency' ? [dependencyState(current), '该结果来自本次已返回指令中的关键词信号；不是必要性、可用性或离线能力证明。']
              : [`共观测到 ${model.summary?.methodCount || 0} 个 Skill、${model.summary?.eventCount || 0} 次加载。`, model.coverage?.note || '当前覆盖状态不可用。']
      const events = current.type === 'skill' ? current.events || [] : []
      return h('div', null,
        h('div', { className: 'st-inspector-title' }, h(Icon, { name: current.type === 'skill' ? 'skill' : current.type === 'output' ? 'link' : current.type === 'dependency' ? 'info' : 'map' }), h('h2', null, current.label || current.name || '节点详情')),
        h('div', { className: 'st-inspector-body' },
          h('div', { className: 'st-inspector-block' }, h('h3', null, '当前状态'), statusBadge(status)),
          h('div', { className: 'st-inspector-block' }, h('h3', null, '发生了什么'), h('ul', { className: 'st-inspector-list' }, observations.map((item) => h('li', { key: item }, item)))),
          events.length ? h('div', { className: 'st-inspector-block' }, h('h3', null, `相关加载记录（${events.length}）`), h('ul', { className: 'st-inspector-list' }, events.map((event) => h('li', { className: 'st-inspector-event', key: event.id }, h('strong', null, eventTitle(event)), h('span', null, eventOutcome(event)))))) : null,
          learningCard ? h('div', { className: 'st-inspector-block' },
            h('h3', null, '这个 Skill 怎么跑（指令候选）'),
            learningCard.steps.length
              ? h('ol', { className: 'st-inspector-list' }, learningCard.steps.map((step) => h('li', { key: step.title }, step.title)))
              : h('p', null, '没有安全可提取的结构化步骤，请人工核对 Skill 说明。'),
            h('p', { style: { marginTop: 8 } }, `依赖线索：${learningCard.dependencies.filter((item) => item.required === 'candidate').map((item) => DEPENDENCIES[item.type] || item.type).join('、') || '未观察到明确线索'}。`)) : null,
          h('div', { className: 'st-inspector-block' }, h('h3', null, '这能说明什么'), h('p', null, current.type === 'dependency' ? '当前只能说明依赖尚未评估。' : current.type === 'output' ? '只说明用户是否创建了输出引用。' : '只说明系统观察到的 Skill 加载请求及结果。')),
          h('div', { className: 'st-inspector-block' }, h('h3', null, '这不能说明什么'), h('p', null, '不能说明 Agent 为什么选择它、是否遵循了方法，也不能证明它促成了结果。'))))
    }

    function Aside({ data, selectedNode, onRefresh, onUpdate, onDeleted }) {
      const receipt = data.receipt
      const learningCards = data.views?.receipt?.learningCards || []
      const selectedFromMap = ['skill', 'step'].includes(selectedNode?.type) ? (selectedNode.name || selectedNode.label) : ''
      const cardNames = learningCards.map((card) => card.skillName).join('|')
      const [relativeRef, setRelativeRef] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const [learningSkill, setLearningSkill] = React.useState(selectedFromMap || learningCards[0]?.skillName || '')
      const [learningDraft, setLearningDraft] = React.useState({ understanding: '', improvementIntent: '', validationPlan: '' })
      const [copyState, setCopyState] = React.useState('')

      React.useEffect(() => {
        const next = learningCards.some((card) => card.skillName === selectedFromMap) ? selectedFromMap : learningCards.some((card) => card.skillName === learningSkill) ? learningSkill : learningCards[0]?.skillName || ''
        if (next !== learningSkill) setLearningSkill(next)
      }, [selectedFromMap, cardNames])

      const activeLearningCard = learningCards.find((card) => card.skillName === learningSkill) || null
      const savedLearningNote = (receipt.learningNotes || []).find((note) => note.skillName === learningSkill) || null

      React.useEffect(() => {
        setLearningDraft({
          understanding: savedLearningNote?.understanding || '',
          improvementIntent: savedLearningNote?.improvementIntent || '',
          validationPlan: savedLearningNote?.validationPlan || '',
        })
        setCopyState('')
      }, [learningSkill, savedLearningNote?.updatedAt])

      async function addOutput(event) {
        event.preventDefault(); setBusy('output'); setError('')
        try {
          const body = await api('/outputs', { method: 'POST', body: JSON.stringify({ sessionId: receipt.sessionId, relativeRef }) })
          onUpdate(body); setRelativeRef('')
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function deleteReceipt() {
        if (!window.confirm('删除当前会话的 Skill Trace 本地收据？这不会删除 DSH 原始会话。')) return
        setBusy('delete'); setError('')
        try { await api('/receipt', { method: 'DELETE', body: JSON.stringify({ sessionId: receipt.sessionId }) }); onDeleted() }
        catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function setContinuity(status) {
        setBusy('continuity'); setError('')
        try {
          const body = await api('/continuity', { method: 'POST', body: JSON.stringify({ sessionId: receipt.sessionId, status }) })
          onUpdate(body)
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function saveLearningNote(event) {
        event.preventDefault(); setBusy('learning'); setError(''); setCopyState('')
        try {
          const body = await api('/learning-note', { method: 'POST', body: JSON.stringify({ sessionId: receipt.sessionId, skillName: learningSkill, ...learningDraft }) })
          onUpdate(body)
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function copyLearningChecklist() {
        if (!activeLearningCard) return
        setBusy('copy'); setError(''); setCopyState('')
        const text = iterationChecklist(activeLearningCard, learningDraft)
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
          else {
            const field = document.createElement('textarea')
            field.value = text; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0'
            document.body.appendChild(field)
            try {
              field.select()
              if (!document.execCommand('copy')) throw new Error('clipboard unavailable')
            } finally {
              field.remove()
            }
          }
          setCopyState('迭代清单已复制；未修改或发布任何 Skill。')
        } catch {
          setError('暂时无法写入剪贴板，请检查桌面端剪贴板权限。')
        } finally { setBusy('') }
      }

      const continuity = receipt.continuity || { status: 'unassessed' }
      const continuityChoices = [
        ['manual', '可手工延续'],
        ['partial', '可部分延续'],
        ['blocked', '当前受阻'],
      ]

      return h(React.Fragment, null,
        data.activeView === 'map' ? h(Inspector, { node: selectedNode, model: data.views.map }) : null,
        error ? h('div', { className: 'st-error', role: 'alert' }, error) : null,
        learningCards.length ? h('section', { className: 'st-panel' },
          h('h2', null, '我的理解与迭代'),
          h('p', { className: 'st-panel-note' }, '填写后保存在当前会话的本地收据中，回来选择这个 Skill 即可继续查看和编辑；不会上传，也不会写回或发布 Skill。'),
          activeLearningCard?.versionState === 'changed' ? h('div', { className: 'st-version-warning' }, '当前版本与本次观察版本不同，请先核对版本再迭代。') : null,
          h('form', { className: 'st-learning-form', onSubmit: saveLearningNote },
            learningCards.length > 1 ? h('label', { className: 'st-field-label' }, '当前 Skill', h('select', { className: 'st-select', value: learningSkill, onChange: (event) => setLearningSkill(event.target.value) }, learningCards.map((card) => h('option', { key: card.skillName, value: card.skillName }, card.skillName)))) : h('div', { className: 'st-notice' }, learningSkill),
            h('label', { className: 'st-field-label' }, '我的理解', h('textarea', { className: 'st-textarea', maxLength: 500, value: learningDraft.understanding, onChange: (event) => setLearningDraft((current) => ({ ...current, understanding: event.target.value })), placeholder: '例如：它先确认输入，再按步骤执行，最后复核结果。' }), h('span', { className: 'st-field-count' }, `${learningDraft.understanding.length}/500`)),
            h('label', { className: 'st-field-label' }, '我想改进', h('textarea', { className: 'st-textarea', maxLength: 500, value: learningDraft.improvementIntent, onChange: (event) => setLearningDraft((current) => ({ ...current, improvementIntent: event.target.value })), placeholder: '例如：补充失败分支和不适用场景。' }), h('span', { className: 'st-field-count' }, `${learningDraft.improvementIntent.length}/500`)),
            h('label', { className: 'st-field-label' }, '下次如何验证', h('textarea', { className: 'st-textarea', maxLength: 500, value: learningDraft.validationPlan, onChange: (event) => setLearningDraft((current) => ({ ...current, validationPlan: event.target.value })), placeholder: '例如：用正常输入和缺失输入各跑一次。' }), h('span', { className: 'st-field-count' }, `${learningDraft.validationPlan.length}/500`)),
            h('div', { className: 'st-learning-actions' },
              h('button', { className: 'st-button st-button-primary', type: 'submit', disabled: busy === 'learning' }, busy === 'learning' ? '保存中' : '保存到本地'),
              h('button', { className: 'st-button', type: 'button', disabled: busy === 'copy', onClick: copyLearningChecklist }, h(Icon, { name: 'copy', size: 14 }), busy === 'copy' ? '复制中' : '复制清单'))),
          copyState ? h('div', { className: 'st-copy-state', role: 'status' }, copyState) : null,
          h('div', { className: 'st-local-only' }, h(Icon, { name: 'info', size: 14 }), '清单只包含短指纹、候选步骤和你主动填写的内容；不包含完整 Skill 正文。')) : null,
        h('section', { className: 'st-panel' },
          h('h2', null, '继续方式判断'),
          h('p', { className: 'st-panel-note' }, '候选步骤由确定性规则提取。请选择你是否能按这张卡继续；这不是对开发者的反馈。'),
          h('div', { className: 'st-continuity-review', role: 'group', 'aria-label': '继续方式人工判断' }, continuityChoices.map(([status, label]) => h('button', { className: 'st-button', type: 'button', key: status, 'aria-pressed': continuity.status === status, disabled: busy === 'continuity', onClick: () => setContinuity(status) }, label))),
          continuity.status !== 'unassessed' ? h('button', { className: 'st-reset-link', type: 'button', disabled: busy === 'continuity', onClick: () => setContinuity('unassessed') }, '恢复为待判断') : null,
          h('div', { className: 'st-local-only' }, h(Icon, { name: 'info', size: 14 }), '仅保存在本机当前收据中，不上传、不计入排行榜。')),
        h('section', { className: 'st-panel' }, h('h2', null, '关联本次产出'), h('p', { className: 'st-panel-note' }, '只保存工作区内的相对引用；系统不会自动建立因果关系。'), h('form', { className: 'st-output-form', onSubmit: addOutput }, h('input', { className: 'st-input', value: relativeRef, onChange: (event) => setRelativeRef(event.target.value), placeholder: '例如 docs/report.md', 'aria-label': '工作区内相对输出引用' }), h('button', { className: 'st-button st-button-primary', type: 'submit', disabled: !relativeRef.trim() || busy === 'output' }, busy === 'output' ? '保存中' : '确认关联')), receipt.outputReferences?.length ? h('ul', { className: 'st-output-list' }, receipt.outputReferences.map((item) => h('li', { key: item.outputId }, item.relativeRef))) : null),
        h('section', { className: 'st-panel' }, h('h2', null, '证据边界'), h('div', { className: 'st-notice' }, receipt.coverage?.note || '覆盖状态不可用'), h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } }, h('button', { className: 'st-button', type: 'button', onClick: onRefresh }, h(Icon, { name: 'refresh', size: 14 }), '刷新'), h('button', { className: 'st-button', type: 'button', disabled: busy === 'delete', onClick: deleteReceipt }, h(Icon, { name: 'trash', size: 14 }), '删除收据'))))
    }

    function TraceState({ kind, message, onRetry }) {
      return h('div', { className: kind === 'error' ? 'st-empty-page' : 'st-trace-state', 'data-kind': kind, role: kind === 'error' ? 'alert' : 'status', 'aria-live': 'polite' }, h('div', { className: kind === 'error' ? 'st-empty-page-inner' : 'st-trace-state-line' }, kind === 'error' ? null : h('span', { className: 'st-trace-state-dot', 'aria-hidden': 'true' }), kind === 'error' ? h('p', null, message) : message, kind === 'error' && onRetry ? h('button', { className: 'st-button', type: 'button', style: { marginTop: 14 }, onClick: onRetry }, '重试') : null))
    }

    const CATALOG_FILTERS = [
      ['all', '全部'],
      ['receipt', '有真实收据'],
      ['learning', '有会话理解'],
      ['unobserved', '暂未观测'],
      ['historical', '当前未发现'],
      ['changed', '版本变化'],
    ]

    function associationCopy(level) {
      if (level === 'exact') return { label: '已确认同源', className: 'st-association-exact' }
      if (level === 'content-match-candidate') return { label: '内容相符候选', className: 'st-association-candidate' }
      if (level === 'name-only-candidate') return { label: '仅名称相同', className: 'st-association-candidate' }
      if (level === 'conflict') return { label: '来源冲突', className: 'st-association-conflict' }
      return { label: '当前未发现', className: 'st-association-candidate' }
    }

    function formatLocalTime(value) {
      if (!Number.isFinite(value)) return '时间未知'
      try { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) } catch { return '时间未知' }
    }

    function catalogSignals(entry) {
      const signals = [entry.currentState === 'discovered'
        ? ['当前可发现', 'brand']
        : entry.currentState === 'discovered-partial' ? ['目录候选', 'warning'] : ['当前未发现', 'warning']]
      if (entry.confirmedReceiptCount) signals.push([`${entry.confirmedReceiptCount} 张真实收据`, 'brand'])
      else if (entry.possibleReceiptCount) signals.push([`${entry.possibleReceiptCount} 张可能历史`, 'warning'])
      else signals.push(['暂未观测', 'muted'])
      if (entry.confirmedLearningCount) signals.push([`${entry.confirmedLearningCount} 条会话理解`, 'brand'])
      else if (entry.possibleLearningCount) signals.push([`${entry.possibleLearningCount} 条可能理解`, 'warning'])
      if (entry.versionState === 'changed') signals.push(['版本变化', 'warning'])
      return signals
    }

    function catalogDescription(entry) {
      if (entry.description) return entry.description
      if (entry.currentState === 'current-not-discovered') return `本地历史 · ${formatLocalTime(entry.latestHistoryAt)} · 来源身份不足，未与同名记录合并。`
      return '该 Skill 没有提供足够清晰的用途说明。'
    }

    function HistoryCard({ history, expanded, onOpen, purpose = 'receipt' }) {
      const association = associationCopy(history.associationLevel)
      const record = expanded?.body
      const note = record?.record?.note
      const summary = record?.record?.summary
      return h('article', { className: 'st-history-card' },
        h('div', { className: 'st-history-head' },
          h('strong', null, `${formatLocalTime(history.updatedAt)} · ${history.eventCount} 次请求`),
          h('span', { className: association.className }, association.label),
          h('button', { className: 'st-history-action', type: 'button', onClick: onOpen, disabled: expanded?.loading }, expanded?.loading ? '读取中' : expanded ? '收起' : purpose === 'learning' ? '查看理解' : '查看记录')),
        h('div', { className: 'st-history-meta' }, `${history.loadedCount} 次加载成功 · ${history.failedCount} 次失败 · ${history.unresolvedCount} 次待定${history.learningNotePresent ? ' · 已保存会话理解' : ''}`),
        expanded ? h('div', { className: 'st-history-expanded' },
          expanded.error ? h('div', { className: 'st-error', role: 'alert' }, expanded.error) : null,
          summary ? h('div', { className: 'st-notice' }, `该收据记录 ${summary.methodCount} 个 Skill、${summary.eventCount} 次请求；其中 ${summary.loadedCount} 次加载成功。加载不等于 Agent 后续采用或因此产出结果。`) : null,
          purpose === 'learning' && note ? h('div', { className: 'st-note-fields' },
            note.understanding ? h('div', { className: 'st-note-field' }, h('strong', null, '当时我的理解'), h('p', null, note.understanding)) : null,
            note.improvementIntent ? h('div', { className: 'st-note-field' }, h('strong', null, '当时想改进'), h('p', null, note.improvementIntent)) : null,
            note.validationPlan ? h('div', { className: 'st-note-field' }, h('strong', null, '当时计划验证'), h('p', null, note.validationPlan)) : null) : purpose === 'learning' && !expanded.loading && !expanded.error ? h('div', { className: 'st-notice' }, '这张收据没有保存该 Skill 的个人理解。') : null) : null)
    }

    function CatalogDetail({ entry, onBack }) {
      const [expanded, setExpanded] = React.useState({})
      React.useEffect(() => setExpanded({}), [entry?.id])
      if (!entry) return h('div', { className: 'st-detail-empty' }, '选择一个 Skill，查看它的声明、真实收据和历次会话理解。')

      async function toggleHistory(history, purpose) {
        const key = `${purpose}:${history.sessionId}:${history.skillName}`
        if (expanded[key] && !expanded[key].loading) {
          setExpanded((current) => { const next = { ...current }; delete next[key]; return next })
          return
        }
        setExpanded((current) => ({ ...current, [key]: { loading: true } }))
        try {
          const body = await api(`/history-receipt?sessionId=${encodeURIComponent(history.sessionId)}&skillName=${encodeURIComponent(history.skillName)}`)
          setExpanded((current) => ({ ...current, [key]: { loading: false, body } }))
        } catch (reason) {
          setExpanded((current) => ({ ...current, [key]: { loading: false, error: reason.message } }))
        }
      }

      const exact = entry.histories.filter((item) => item.associationLevel === 'exact')
      const candidates = entry.histories.filter((item) => item.associationLevel !== 'exact')
      const notes = entry.histories.filter((item) => item.learningNotePresent)
      const source = entry.sourceFingerprint ? shortHash(entry.sourceFingerprint) : '来源指纹不可用'
      const definitionHash = entry.definition?.currentInstructionSha256 ? shortHash(entry.definition.currentInstructionSha256) : '未按需取得正文指纹'
      return h('div', { className: 'st-catalog-detail-inner' },
        h('button', { className: 'st-button st-catalog-back', type: 'button', onClick: onBack }, '返回 Skill 列表'),
        h('header', { className: 'st-skill-title' },
          h('h2', null, entry.name),
          h('p', null, catalogDescription(entry)),
          h('div', { className: 'st-skill-meta' }, ...catalogSignals(entry).map(([label, tone]) => h('span', { className: 'st-signal', 'data-tone': tone, key: label }, label)))),
        h('div', { className: 'st-evidence-stack' },
          h('section', { className: 'st-evidence-section' },
            h('span', { className: 'st-evidence-index' }, '1'), h('h3', null, 'Skill 声明'), h('p', { className: 'st-evidence-kicker' }, '来自当前会话作用域 Registry；说明它自称做什么，不代表本次已经运行。'),
            h('div', { className: 'st-definition-grid' },
              h('div', { className: 'st-definition-cell' }, h('span', null, 'Provider'), h('strong', null, entry.provider || '未知')),
              h('div', { className: 'st-definition-cell' }, h('span', null, '安全来源指纹'), h('strong', null, source)),
              h('div', { className: 'st-definition-cell' }, h('span', null, '当前正文指纹'), h('strong', null, definitionHash)),
              h('div', { className: 'st-definition-cell' }, h('span', null, '调用方式'), h('strong', null, entry.invocation ? `${entry.invocation.modelInvocable ? 'Agent 可调用' : 'Agent 不可调用'} · ${entry.invocation.userInvocable ? '用户可调用' : '用户不可调用'}` : '未知')))),
          h('section', { className: 'st-evidence-section' },
            h('span', { className: 'st-evidence-index' }, '2'), h('h3', null, '实际运行记录'), h('p', { className: 'st-evidence-kicker' }, '只有来源身份完整一致的记录才计为真实收据；旧数据与冲突数据保持候选。'),
            exact.length ? h('div', { className: 'st-history-list' }, exact.map((history) => h(HistoryCard, { key: `${history.sessionId}:exact`, history, expanded: expanded[`receipt:${history.sessionId}:${history.skillName}`], onOpen: () => toggleHistory(history, 'receipt') }))) : h('div', { className: 'st-notice' }, '暂未找到来源身份完整一致的真实收据。'),
            candidates.length ? h('div', null, h('p', { className: 'st-boundary-copy' }, '可能相关的历史记录（不计入真实收据）：'), h('div', { className: 'st-history-list' }, candidates.map((history) => h(HistoryCard, { key: `${history.sessionId}:candidate`, history, expanded: expanded[`receipt:${history.sessionId}:${history.skillName}`], onOpen: () => toggleHistory(history, 'receipt') })))) : null),
          h('section', { className: 'st-evidence-section' },
            h('span', { className: 'st-evidence-index' }, '3'), h('h3', null, '历次会话理解'), h('p', { className: 'st-evidence-kicker' }, '保留每次会话当时的个人重述，不选择最新一条充当当前综合理解。'),
            notes.length ? h('div', { className: 'st-history-list' }, notes.map((history) => h(HistoryCard, { key: `${history.sessionId}:note`, history, purpose: 'learning', expanded: expanded[`learning:${history.sessionId}:${history.skillName}`], onOpen: () => toggleHistory(history, 'learning') }))) : h('div', { className: 'st-notice' }, '还没有保存过该 Skill 的会话理解。'),
            h('p', { className: 'st-boundary-copy' }, '这些内容只保存在本机收据中，不会传给插件开发者；P0 不生成“我的综合理解”，也不自动修改 Skill。'))))
    }

    function CatalogPage({ sessionId, context, onContextChange, reloadSignal, onMeta }) {
      const [data, setData] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')

      const load = React.useCallback(async (skillName = context.selectedName, entryId = context.selectedId) => {
        setLoading(true); setError('')
        try {
          const suffix = skillName ? `&skillName=${encodeURIComponent(skillName)}${entryId ? `&entryId=${encodeURIComponent(entryId)}` : ''}` : ''
          const body = await api(`/catalog?sessionId=${encodeURIComponent(sessionId)}${suffix}`)
          setData(body)
          onMeta(body.catalog)
        } catch (reason) { setError(reason.message) } finally { setLoading(false) }
      }, [sessionId, reloadSignal])

      React.useEffect(() => { load() }, [load])

      const entries = data?.catalog?.entries ?? []
      const query = context.query.trim().toLocaleLowerCase()
      const filtered = entries.filter((entry) => {
        const matchesQuery = !query || `${entry.name} ${entry.description}`.toLocaleLowerCase().includes(query)
        if (!matchesQuery) return false
        if (context.filter === 'receipt') return entry.confirmedReceiptCount > 0
        if (context.filter === 'learning') return entry.confirmedLearningCount + entry.possibleLearningCount > 0
        if (context.filter === 'unobserved') return entry.currentState !== 'current-not-discovered' && entry.confirmedReceiptCount + entry.possibleReceiptCount === 0
        if (context.filter === 'historical') return entry.currentState === 'current-not-discovered'
        if (context.filter === 'changed') return entry.versionState === 'changed'
        return true
      })

      async function select(entry) {
        onContextChange({ ...context, selectedName: entry.name, selectedId: entry.id })
        await load(entry.name, entry.id)
      }

      if (loading && !data) return h(TraceState, { kind: 'loading', message: '正在读取当前可发现的 Skill 与本地历史…' })
      if (error && !data) return h(TraceState, { kind: 'error', message: '暂时无法读取“我的 Skill”。', onRetry: () => load() })
      const catalog = data.catalog
      const coverageUnknown = catalog.coverage.status === 'coverage-unknown'
      const coverageIncomplete = catalog.coverage.status === 'incomplete'
      const completeEmpty = catalog.coverage.complete && catalog.currentDiscoverableCount === 0 && entries.length === 0
      const listBody = completeEmpty
        ? h('div', { className: 'st-catalog-list-state' }, '当前工作区与 Agent Preset 暂未发现 Skill。')
        : filtered.length ? h('ul', { className: 'st-catalog-list' }, filtered.map((entry) => h('li', { key: entry.id }, h('button', { className: 'st-catalog-item', type: 'button', 'aria-current': context.selectedId === entry.id ? 'true' : undefined, onClick: () => select(entry) },
          h('div', { className: 'st-catalog-item-head' }, h('strong', null, entry.name), h(Icon, { name: 'chevron', size: 14 })),
          h('div', { className: 'st-catalog-item-copy' }, catalogDescription(entry)),
          h('div', { className: 'st-catalog-signals' }, ...catalogSignals(entry).map(([label, tone]) => h('span', { className: 'st-signal', 'data-tone': tone, key: label }, label))))))) : h('div', { className: 'st-catalog-list-state' }, coverageUnknown && entries.length === 0 ? '当前会话未挂载可读取的 Skill Registry，也没有可显示的本地历史。' : '没有符合当前搜索或筛选条件的 Skill。')
      return h('div', { className: 'st-catalog-page', 'data-selected': context.selectedId ? 'true' : undefined, 'aria-busy': loading },
        h('aside', { className: 'st-catalog-sidebar', 'aria-label': 'Skill 列表' },
          h('div', { className: 'st-catalog-tools' },
            h('p', { className: 'st-catalog-count' }, coverageUnknown ? '当前目录无法确认' : coverageIncomplete ? `目录可能不完整 · 已发现 ${catalog.observedCandidateCount} 个候选` : `当前可发现 ${catalog.currentDiscoverableCount} 个 Skill`),
            h('div', { className: 'st-search-wrap' }, h(Icon, { name: 'search', size: 15 }), h('input', { className: 'st-input', value: context.query, onChange: (event) => onContextChange({ ...context, query: event.target.value, selectedName: '', selectedId: '' }), placeholder: '搜索名称或声明简介', 'aria-label': '搜索 Skill' })),
            h('div', { className: 'st-filter-row', role: 'group', 'aria-label': 'Skill 筛选' }, CATALOG_FILTERS.map(([value, label]) => h('button', { className: 'st-filter', key: value, type: 'button', 'aria-pressed': context.filter === value, onClick: () => onContextChange({ ...context, filter: value, selectedName: '', selectedId: '' }) }, label))),
            catalog.coverage.warningCount ? h('div', { className: 'st-catalog-warning' }, `${catalog.coverage.warningCount} 份本地收据无法读取，已跳过。`) : null),
          coverageUnknown && entries.length ? h('div', { className: 'st-catalog-list-state' }, '当前会话目录不可确认；以下只显示本地历史条目。') : null,
          listBody),
        h('main', { className: 'st-catalog-detail' }, error ? h('div', { className: 'st-error', role: 'alert' }, error) : null, h(CatalogDetail, { entry: context.selectedId ? catalog.selected : null, onBack: () => onContextChange({ ...context, selectedName: '', selectedId: '' }) })))
    }

    function SessionStatus(props) {
      const sessionId = props?.sessionId
      const [summary, setSummary] = React.useState(null)
      React.useEffect(() => {
        if (!sessionId) return undefined
        let active = true
        const load = () => api(`/context?sessionId=${encodeURIComponent(sessionId)}`)
          .then((body) => { if (active) setSummary(body.views?.receipt?.summary || null) })
          .catch(() => { if (active) setSummary(null) })
        load()
        const timer = window.setInterval(load, 15000)
        return () => { active = false; window.clearInterval(timer) }
      }, [sessionId])
      if (!summary?.eventCount) return null
      return h('span', { className: 'st-session-chip', title: '打开“Skill 追踪”标签查看同一份完整收据', 'aria-label': `${summary.methodCount} 个 Skill，${summary.loadedCount} 次加载成功，共 ${summary.eventCount} 次` }, h(Icon, { name: 'skill', size: 14 }), `${summary.methodCount} 个 Skill · ${summary.loadedCount}/${summary.eventCount} 已加载`)
    }

    function Workbench(props) {
      const sessionId = props?.sessionId
      const initialView = (() => { try { return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'receipt' } catch { return 'receipt' } })()
      const [view, setView] = React.useState(initialView)
      const [screen, setScreen] = React.useState('session')
      const [data, setData] = React.useState(null)
      const [selectedNode, setSelectedNode] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')
      const [catalogContext, setCatalogContext] = React.useState({ query: '', filter: 'all', selectedName: '', selectedId: '' })
      const [catalogMeta, setCatalogMeta] = React.useState(null)
      const [catalogReload, setCatalogReload] = React.useState(0)
      const preferenceSession = React.useRef(null)

      const load = React.useCallback(async () => {
        if (!sessionId) { setError('当前视图没有可用的会话 ID'); setLoading(false); return }
        setLoading(true); setError('')
        try {
          const next = await api(`/context?sessionId=${encodeURIComponent(sessionId)}`)
          if (preferenceSession.current !== sessionId) {
            const preferred = ['receipt', 'map'].includes(next.preferences?.defaultView) ? next.preferences.defaultView : initialView
            setView(preferred); preferenceSession.current = sessionId
          }
          setData(next)
        } catch (reason) { setError(reason.message) } finally { setLoading(false) }
      }, [sessionId])

      React.useEffect(() => { setData(null); setSelectedNode(null); setCatalogContext({ query: '', filter: 'all', selectedName: '', selectedId: '' }); setCatalogMeta(null); preferenceSession.current = null; load() }, [load])

      function chooseView(next) {
        setScreen('session'); setView(next); setError('')
        try { localStorage.setItem(VIEW_KEY, next) } catch (_) {}
        api('/preferences', { method: 'POST', body: JSON.stringify({ defaultView: next }) })
          .then((body) => { setError(''); setData((current) => current ? { ...current, preferences: body.preferences } : current) })
          .catch(() => setError('默认视图已切换，但暂时无法保存到下次启动。'))
      }

      const coverageState = data?.receipt?.coverage?.status === 'verified-standard-contract' ? 'active' : 'unknown'
      const activeModel = data?.views?.[view]
      const hasTrace = Boolean(data?.receipt?.traceEvents?.length)
      const sessionContent = loading && !data ? h(TraceState, { kind: 'loading', message: '正在读取当前对话的 Skill 使用情况…' })
        : error && !data ? h(TraceState, { kind: 'error', message: '暂时无法读取当前对话的 Skill 使用情况。', onRetry: load })
          : data && !hasTrace ? h(TraceState, { kind: 'empty', message: data.receipt.coverage?.status === 'coverage-unknown' ? '暂时无法确认当前对话是否加载了 Skill。' : '当前对话暂未加载可追踪的 Skill。' })
            : view === 'receipt' ? h(ReceiptView, { model: activeModel, workspaceLabel: data.workspaceLabel }) : h(MapView, { model: activeModel, selectedNode, onSelectNode: setSelectedNode })
      const sessionSubtitle = !data ? '正在读取当前会话…' : hasTrace ? `${data.workspaceLabel} · ${activeModel.methodCount} 个 Skill 请求 · ${activeModel.eventCount} 次加载` : data.workspaceLabel
      const catalogSubtitle = !catalogMeta ? '正在读取当前目录…' : catalogMeta.coverage.status === 'coverage-unknown' ? '当前目录无法确认 · 仅显示本地历史' : catalogMeta.coverage.status === 'incomplete' ? `目录可能不完整 · 已发现 ${catalogMeta.observedCandidateCount ?? 0} 个候选` : `当前可发现 ${catalogMeta.currentDiscoverableCount ?? 0} 个 Skill · ${data?.workspaceLabel || '工作区未连接'}`
      const content = screen === 'catalog'
        ? h(CatalogPage, { sessionId, context: catalogContext, onContextChange: setCatalogContext, reloadSignal: catalogReload, onMeta: setCatalogMeta })
        : h('div', { className: 'st-layout', 'data-simple': !hasTrace ? 'true' : undefined }, h('main', { className: 'st-main', 'aria-busy': loading }, error && data ? h('div', { className: 'st-error', role: 'alert' }, error) : null, sessionContent), data && hasTrace ? h('aside', { className: 'st-aside' }, h(Aside, { data: { ...data, activeView: view }, selectedNode, onRefresh: load, onUpdate: (body) => setData((current) => ({ ...current, receipt: body.receipt, views: body.views })), onDeleted: load })) : null)

      return h('section', { 'data-plugin': 'dsh-skill-trace', 'aria-label': screen === 'catalog' ? 'DSH Skill Trace 我的 Skill' : 'DSH Skill Trace 本次 Skill 使用记录' }, h('div', { className: 'st-shell' },
        h('header', { className: 'st-topbar' },
          h('div', { className: 'st-heading' }, h('div', { className: 'st-heading-line' }, h('span', { className: 'st-live', 'data-state': screen === 'catalog' && catalogMeta?.coverage?.status !== 'complete' ? 'unknown' : coverageState }), h('h1', null, screen === 'catalog' ? '我的 Skill' : '本次 Skill 使用记录')), h('div', { className: 'st-workspace' }, screen === 'catalog' ? catalogSubtitle : sessionSubtitle)),
          h('button', { className: 'st-button st-library-button', type: 'button', 'aria-pressed': screen === 'catalog', onClick: () => setScreen('catalog') }, h(Icon, { name: 'list', size: 15 }), '我的 Skill'),
          hasTrace ? h('span', { className: 'st-toolbar-split', 'aria-hidden': 'true' }) : null,
          hasTrace ? h('span', { className: 'st-toolbar-label' }, '当前会话') : null,
          hasTrace ? h('div', { className: 'st-view-switch', role: 'group', 'aria-label': '当前会话呈现方式' }, h('button', { className: 'st-view-button', type: 'button', 'aria-pressed': screen === 'session' && view === 'receipt', onClick: () => chooseView('receipt') }, h(Icon, { name: 'receipt', size: 15 }), 'Skill 收据'), h('button', { className: 'st-view-button', type: 'button', 'aria-pressed': screen === 'session' && view === 'map', onClick: () => chooseView('map') }, h(Icon, { name: 'map', size: 15 }), '流程地图')) : null,
          h('button', { className: 'st-icon-button', type: 'button', onClick: screen === 'catalog' ? () => setCatalogReload((value) => value + 1) : load, disabled: screen === 'session' && loading, title: '刷新', 'aria-label': screen === 'catalog' ? '刷新我的 Skill' : '刷新 Skill 追踪' }, h(Icon, { name: 'refresh', size: 15 }))),
        content))
    }

    module.exports.inject = ['slots']
    module.exports.apply = (ctx) => {
      ctx.effect(() => installStyles(), 'dsh-skill-trace: stylesheet')
      ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'skill-trace', order: 70, label: 'Skill 追踪' }, (props) => h(Workbench, props)))
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'skill-trace-status', order: 75, label: 'Skill 追踪状态' }, (props) => h(SessionStatus, props)))
    }
    return module.exports
  },
})
