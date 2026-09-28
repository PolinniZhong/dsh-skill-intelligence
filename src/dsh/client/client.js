window.__ModuleLoader__.load({
  id: 'dsh-skill-trace',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const NS = 'dsh-skill-trace'
    // Keep display copy in the client. Receipt facts, Skill definitions and
    // user-authored notes stay untouched; only our own UI wording is localized.
    const EN = {
      '正在加载': 'Loading', '已加载': 'Loaded', '加载失败': 'Load failed', '状态混合': 'Mixed status', '记录不完整': 'Incomplete record', '结果未知': 'Outcome unknown', '未开始': 'Not started',
      '标准事件已验证': 'Standard events verified', '覆盖未知': 'Coverage unknown', '人工已关联': 'Linked by you', '待人工判断': 'Needs your assessment', '可手工延续': 'Can continue manually', '可部分延续': 'Can continue partially', '当前受阻': 'Currently blocked', '未评估': 'Not assessed',
      '网络': 'Network', '模型': 'Model', '脚本': 'Script', '权限': 'Permission',
      '当前版本一致': 'Current version matches', '当前版本已变化': 'Current version changed', '版本无法比较': 'Version cannot be compared',
      '未取得标准指令指纹': 'No standard instruction fingerprint', '待填写': 'To be filled in', '未观察到明确线索': 'No clear signal observed', '发现候选线索': 'Candidate signal found',
      '本次流程小结': 'This session at a glance', '可见流程': 'Observed flow', '加载结果': 'Load results', '本次产出': 'Outputs',
      '开始处理': 'Start', '执行步骤': 'Steps', '请求加载': 'Load requested', '形成收据': 'Receipt created', '覆盖待确认': 'Coverage needs review',
      '展开加载记录': 'Review load records', '核对依赖条件': 'Check dependencies', '关联本次产出': 'Link this session output',
      '来源未标记': 'Unlabeled source', '当前内容一致': 'Current content matches', '当前内容已变化': 'Current content changed', '内容一致性未知': 'Content match unknown', '当前来源不可用': 'Current source unavailable',
      '未取得指令指纹': 'No instruction fingerprint', '依赖线索': 'Dependency signals', '逐个看懂 Skill': 'Understand each Skill', '你接下来能做什么': 'What you can do next', '继续使用指南': 'How to continue',
      '本次 Skill 收据': 'This Skill receipt', '本次发生了什么': 'What happened this time', 'Skill 加载结果': 'Skill load results',
      '尚未关联本次产出': 'No session output linked yet', '当前会话的 Skill 使用情况': 'Skill usage in this session',
      '流程地图': 'Flow map', '关系说明': 'Relationship notes', '会话': 'Session', '加载事件': 'Load event', '产出': 'Output',
      '当前会话': 'Current session', '我的 Skill': 'My Skills', '本次 Skill 使用记录': 'Skill usage this session', 'Skill 收据': 'Skill receipt', 'Skill 追踪': 'Skill Trace', 'Skill 追踪状态': 'Skill Trace status', '刷新': 'Refresh',
      '工作区未连接': 'No workspace connected', '正在读取当前会话…': 'Reading current session…', '正在读取当前目录…': 'Reading current catalog…',
      '当前目录无法确认': 'Current catalog cannot be confirmed', '仅显示本地历史': 'Showing local history only', '目录可能不完整': 'Catalog may be incomplete', '当前可发现': 'Currently discoverable',
      '返回 Skill 列表': 'Back to Skill list', 'Skill 声明': 'Skill declaration', '实际运行记录': 'Observed run records', '历次会话理解': 'Session understandings',
      'Provider': 'Provider', '安全来源指纹': 'Safe source fingerprint', '当前正文指纹': 'Current body fingerprint', '调用方式': 'Invocation', '未知': 'Unknown',
      '读取中': 'Loading', '收起': 'Collapse', '查看理解': 'View understanding', '查看学习记录': 'View learning record', '查看记录': 'View record',
      '当时我的理解': 'My understanding then', '当时想改进': 'What I wanted to improve', '当时计划验证': 'How I planned to validate',
      '验证结果回执': 'Validation result', '学习与验证时间线': 'Learning and validation timeline', '待回看': 'Pending review', '已记录结果': 'Result recorded',
      '结果状态': 'Result status', '选择结果状态': 'Select a result status', '符合预期': 'Met expectations', '不符合预期': 'Did not meet expectations', '暂不能判断': 'Inconclusive',
      '实际观察': 'What I observed', '下一步动作': 'Next action', '保存验证结果': 'Save validation result', '清除验证结果': 'Clear validation result', '确认清除': 'Confirm clear', '取消': 'Cancel',
      '验证结果保存中': 'Saving validation result', '验证结果已保存到原会话收据。': 'Validation result saved to the original session receipt.', '验证结果已从原会话收据清除。': 'Validation result cleared from the original session receipt.',
      '确认清除这条人工验证结果？个人理解和验证计划会保留。': 'Clear this human validation result? Your understanding and validation plan will remain.',
      '例如：按计划复测后，缺失输入被明确拦截。': 'Example: after retesting, missing input was explicitly blocked.', '例如：补充边界案例后再次验证。': 'Example: add an edge case and validate again.',
      '这是你对本次验证的本地记录，不代表 Skill 的普遍质量，也不会用于评分或推荐。': 'This is your local record of this validation. It does not represent the Skill’s general quality and is not used for scoring or recommendations.',
      '先保存“下次如何验证”，完成后再回来记录结果。': 'Save how you will validate next, then return after completing it to record the result.',
      '当时的验证计划': 'Validation plan then', '当时的人工验证结果': 'Human validation result then', '这张收据尚未记录验证结果。': 'This receipt has no validation result yet.',
      '保留每次会话当时的理解、验证计划与人工结果；不自动合并成当前正确理解。': 'Keep each session’s understanding, validation plan, and human result without combining them into a current correct understanding.',
      '当时实际观察': 'What I observed then', '当时下一步动作': 'Next action then', '还没有保存过该 Skill 的学习或验证记录。': 'No learning or validation record has been saved for this Skill yet.',
      '选择一个 Skill，查看它的声明、真实收据和学习时间线。': 'Select a Skill to view its declaration, verified receipts, and learning timeline.',
      '把一次 Skill 使用，变成可回看的学习记录': 'Turn Skill use into a learning record',
      'Skill Trace 不替你选择或评价 Skill。它把加载证据、方法候选和你的理解放在同一条本地学习路径上。': 'Skill Trace does not choose or judge Skills for you. It brings load evidence, method candidates, and your understanding into one local learning path.',
      '观察加载请求': 'Observe the load request', '只记录可观测事件': 'Observable events only',
      '形成真实收据': 'Create a verified receipt', '区分成功、失败与未知': 'Separate success, failure, and unknown',
      '用地图看顺序': 'Read the sequence on the map', '同一事实，不推断因果': 'Same facts, no causal inference',
      '找到对应 Skill': 'Find the corresponding Skill', '对照声明、收据与历史': 'Compare declarations, receipts, and history',
      '写下个人理解': 'Write your understanding', '记录方法与验证计划': 'Record the method and validation plan',
      '判断如何延续': 'Decide how to continue', '手工、部分或当前受阻': 'Manual, partial, or currently blocked',
      '回来记录结果': 'Return and record the result', '把复测结果留在原会话': 'Keep retest results with the original session',
      '从左侧选择带“真实收据”的 Skill 开始。这里只记录可观察证据，不判断是否有效，也不上传或翻译个人内容。': 'Start with “Verified receipts.” Evidence only—no judgment, upload, or translation of personal content.',
      '使用指南': 'How it works', '打开 Skill Trace 使用指南': 'Open the Skill Trace guide',
      '这张收据没有保存该 Skill 的个人理解。': 'This receipt has no personal understanding saved for this Skill.', '这些内容只保存在本机收据中，不会传给插件开发者；系统不生成“当前正确理解”，也不自动修改、评分或推荐 Skill。': 'These records stay in local receipts and are not sent to the plugin developer. The system does not generate a current correct understanding or modify, score, or recommend Skills.',
      'Skill 列表': 'Skill list', '搜索名称或声明简介': 'Search name or declared summary', '搜索 Skill': 'Search Skills', 'Skill 筛选': 'Filter Skills',
      '全部': 'All', '有真实收据': 'Verified receipts', '有会话理解': 'Session understanding', '暂未观测': 'Not observed', '历史候选': 'Historical candidates', '版本变化': 'Version changed',
      '重试': 'Retry', '删除': 'Delete', '删除中': 'Deleting', '保存': 'Save', '复制清单': 'Copy checklist', '已复制': 'Copied', '复制失败': 'Copy failed',
      '回看工作台': 'Review workspace', '待回看记录': 'Pending review records', '已记录人工结果': 'Human results recorded', '版本变化项': 'Version changes',
      '搜索 Skill 名称、声明和我的记录': 'Search Skill names, declarations, and my records', '排序方式': 'Sort order', '优先待回看': 'Pending review first', '最近记录': 'Most recent', '名称 A–Z': 'Name A–Z',
      '本地数据': 'Local data', '创建本地备份': 'Create local backup', '正在创建': 'Creating', '清空 Skill Trace 数据': 'Clear Skill Trace data',
      '备份历史': 'Backup history', '打开备份文件夹': 'Open backup folder', '正在打开': 'Opening', '恢复缺失收据': 'Restore missing receipts', '恢复缺失数据': 'Restore missing data', '正在检查': 'Checking', '正在恢复': 'Restoring',
      '查看全部备份': 'Show all backups', '仅显示最近三份': 'Show latest three only', '备份不会自动删除；如需整理，请先打开备份文件夹核对文件。': 'Backups are not deleted automatically. To manage them, open the backup folder and review the files first.',
      '还没有本地备份。': 'No local backups yet.', '最近备份': 'Latest backup', '手动创建': 'Manual', '清空前安全备份': 'Safety backup before clear', '删除前安全备份': 'Safety backup before deletion',
      '确认恢复这份备份中的缺失数据？不存在的收据会完整恢复；活动会话已重建证据时，只补回缺失的个人记录，不覆盖当前内容。': 'Restore missing data from this backup? Missing receipts will be restored in full. If an active session has reconstructed its evidence, only missing personal records will be added without replacing current content.',
      '确认清空全部本地收据？系统会先创建并验证安全备份；备份失败时不会清空。个人理解和人工验证结果会从当前收据中删除，未保存草稿也会清除，但不会删除 DSH 对话。': 'Clear all local receipts? A verified safety backup will be created first, and clearing will be aborted if it fails. Personal understanding, human validation results, and unsaved drafts will be removed, but DSH conversations will remain.',
      '备份文件夹已打开。': 'Backup folder opened.', '暂时无法打开备份文件夹。': 'Unable to open the backup folder.', '备份列表读取失败，请重试。': 'Unable to read backup history. Try again.',
      '有损坏或不可读的备份，已跳过。': 'Corrupt or unreadable backups were skipped.',
      '备份包含无效收据': 'The backup contains invalid receipts', '备份格式不受支持': 'Unsupported backup format', '备份版本不受支持': 'Unsupported backup version', '备份收据列表无效': 'Invalid backup receipt list', '备份收据数量超限': 'Backup receipt limit exceeded', '备份收据数量不一致': 'Backup receipt count mismatch', '备份文件大小无效': 'Invalid backup file size', 'backupId 无效': 'Invalid backup ID', '备份包含重复会话': 'The backup contains duplicate sessions',
      '清空本地收据': 'Clear local receipts',
      '确认清空全部收据': 'Clear all receipts', '正在清空': 'Clearing', '本地收据已清空。': 'Local receipts cleared.', '本地备份生成失败，请重试。': 'Unable to create the local backup. Try again.', '清理未执行；安全备份或收据清理失败，请重试。': 'Nothing was cleared because the safety backup or receipt cleanup failed. Try again.', '恢复未完整完成；刷新后可重试，现有同会话收据不会被覆盖。': 'Restore did not complete. Refresh and retry; existing receipts for the same session will not be overwritten.',
      '复制继续行动卡': 'Copy continuation card', '继续行动卡已复制；只整理原收据与用户记录。': 'Continuation card copied; it only organizes the original receipt and user records.',
      '行动卡只包含短指纹、候选步骤、原收据时间和你主动填写的内容；不包含完整 Skill 正文。': 'The card contains only short fingerprints, candidate steps, original receipt time, and what you entered; it excludes the full Skill body.',
      '确认删除当前本地收据？个人理解、验证结果和未保存草稿会一并删除，但不会删除 DSH 原始会话。当前会话加载证据之后可能重新建立。': 'Delete this local receipt? Personal understanding, validation results, and unsaved drafts will also be deleted, but the original DSH session will remain. Load evidence for the current session may be reconstructed later.',
      '确认删除收据': 'Delete receipt',
      '当前会话呈现方式': 'Current session view', '刷新我的 Skill': 'Refresh My Skills', '刷新 Skill 追踪': 'Refresh Skill Trace',
      '本次实际返回指令的 SHA-256；不保存正文': 'SHA-256 of the instruction returned in this session; the body is not saved',
      '查看加载记录': 'View load records', '这只证明加载请求及结果，不证明后续采用或有效。': 'This proves only the load request and outcome, not later adoption or effectiveness.',
      '当前 Skill 内容与本次观察版本不同。先核对版本，再据此修改。': 'The current Skill differs from the observed version. Check the version before editing.',
      '这个 Skill 声明的候选步骤': 'Candidate steps declared by this Skill', '待核对': 'Needs review',
      '证据边界：这些步骤来自 Skill 指令结构，不是本会话已执行步骤。当前未观察到明确依赖线索，不等于完全无依赖。': 'Evidence boundary: these steps come from the Skill instruction structure, not steps executed in this session. No clear signal does not mean there are no dependencies.',
      '证据边界：以上只说明 Skill 加载事件及人工关联的产出。现有事件无法回答 Agent 为什么选择该 Skill，也不能证明 Agent 后续遵循了方法或方法促成了结果。': 'Evidence boundary: this only states Skill load events and outputs linked by you. Existing events cannot answer why the Agent chose a Skill or prove that it followed the method or that the method caused the result.',
      '标准 skill 工具事件已在官方 Consumer 与 SkillFlux 0.2.0 隔离验证；单条事件仍不包含 Consumer 身份。': 'Standard skill-tool events were verified in isolation with the official Consumer and SkillFlux 0.2.0; individual events still do not include Consumer identity.',
      '具体发生了什么': 'What happened', '这里只说明观察到什么；无法从事件得知 Agent 为什么这样安排任务。': 'This only states what was observed; events cannot show why the Agent arranged the task this way.',
      '依赖线索（候选，不等于必需或可用）': 'Dependency signals (candidates, not proof of need or availability)',
      '本次流程地图': 'Flow map for this session', '点击任一节点查看白话说明；节点和连线来自同一份收据，虚线不代表因果。': 'Select any node for a plain-language explanation. Nodes and edges come from the same receipt; dashed lines do not imply causality.',
      '关系图例': 'Relationship legend', '事件顺序': 'Event order', 'Skill 与加载步骤': 'Skill and load step', '人工关联': 'User link', '依赖候选': 'Candidate dependency', '观测到的 Skill': 'Observed Skills', '加载记录': 'Load records',
      '我的理解与迭代': 'My understanding and iteration', '填写后保存在当前会话的本地收据中，回来选择这个 Skill 即可继续查看和编辑；不会上传，也不会写回或发布 Skill。': 'Entries are saved in this session’s local receipt. Return and select this Skill to view or edit them; nothing is uploaded, written back, or published.',
      '当前 Skill': 'Current Skill', '例如：它先确认输入，再按步骤执行，最后复核结果。': 'Example: confirm the input, follow the steps, then review the result.',
      '例如：补充失败分支和不适用场景。': 'Example: add failure branches and inapplicable cases.', '例如：用正常输入和缺失输入各跑一次。': 'Example: run once with normal input and once with missing input.',
      '保存中': 'Saving', '保存到本地': 'Save locally', '复制中': 'Copying', '清单只包含短指纹、候选步骤和你主动填写的内容；不包含完整 Skill 正文。': 'The checklist contains only short fingerprints, candidate steps, and what you entered; it excludes the full Skill body.',
      '继续方式判断': 'Continuation assessment', '候选步骤由确定性规则提取。请选择你是否能按这张卡继续；这不是对开发者的反馈。': 'Candidate steps are extracted by deterministic rules. Select whether you can continue from this card; this is not developer feedback.',
      '继续方式人工判断': 'Your continuation assessment', '恢复为待判断': 'Reset to unassessed', '仅保存在本机当前收据中，不上传、不计入排行榜。': 'Saved only in this local receipt; not uploaded or counted in rankings.',
      '只保存工作区内的相对引用；系统不会自动建立因果关系。': 'Only workspace-relative references are saved; the system never establishes causality automatically.', '例如 docs/report.md': 'Example: docs/report.md', '工作区内相对输出引用': 'Workspace-relative output reference', '确认关联': 'Confirm link', '证据边界': 'Evidence boundary', '覆盖状态不可用': 'Coverage status unavailable', '删除收据': 'Delete receipt',
      '有未保存的修改': 'Unsaved changes', '当前有未保存的修改。要放弃修改并切换 Skill 吗？': 'You have unsaved changes. Discard them and switch Skills?', '放弃修改并切换': 'Discard and switch', '继续编辑': 'Keep editing',
      '已恢复未保存的本地草稿。': 'Recovered your unsaved local draft.', '未保存草稿只暂存在当前 Desktop 运行期间；保存后才会进入本地收据与备份。': 'Unsaved drafts are kept only for the current Desktop run. Save them to include them in local receipts and backups.',
      '有未保存的修改；当前无法暂存，切换页面前请先保存。': 'Unsaved changes could not be buffered locally. Save before switching pages.',
      '关闭或重新加载 Desktop 前，请先保存仍未提交的 Skill Trace 草稿。': 'Save any unsubmitted Skill Trace drafts before closing or reloading Desktop.',
      '继续方式已保存到当前收据。': 'Continuation assessment saved to the current receipt.', '产出引用已保存到当前收据。': 'Output reference saved to the current receipt.', '产出引用已从当前收据移除。': 'Output reference removed from the current receipt.',
      '只保存工作区内的相对引用；系统不会自动建立因果关系，也不会删除真实项目文件。': 'Only workspace-relative references are saved. The system does not infer causality or delete actual project files.', '移除': 'Remove', '只移除这条收据引用，不删除真实项目文件。': 'Remove only this receipt reference; do not delete the actual project file.', '移除中': 'Removing', '确认移除引用': 'Remove reference',
      '当前未发现': 'Not currently discovered', '已确认同源': 'Same source confirmed', '内容相符候选': 'Content-match candidate', '仅名称相同': 'Name-only candidate', '来源冲突': 'Source conflict', '时间未知': 'Time unknown', '目录候选': 'Catalog candidate',
      '该 Skill 没有提供足够清晰的用途说明。': 'This Skill did not provide a sufficiently clear purpose description.', '来源指纹不可用': 'Source fingerprint unavailable', '未按需取得正文指纹': 'Body fingerprint not fetched on demand',
      '来自当前会话作用域 Registry；说明它自称做什么，不代表本次已经运行。': 'From the current session-scope Registry; it states what the Skill claims to do, not that it ran in this session.',
      '只有来源身份完整一致的记录才计为真实收据；旧数据与冲突数据保持候选。': 'Only records with fully matching source identities count as verified receipts; older and conflicting data remain candidates.',
      '暂未找到来源身份完整一致的真实收据。': 'No verified receipt with a fully matching source identity was found.', '可能相关的历史记录（不计入真实收据）：': 'Possibly related history (not counted as a verified receipt):',
      '保留每次会话当时的个人重述，不选择最新一条充当当前综合理解。': 'Keep each session’s personal restatement; do not treat the newest one as the current combined understanding.',
      '还没有保存过该 Skill 的会话理解。': 'No session understanding has been saved for this Skill yet.', '这些内容只保存在本机收据中，不会传给插件开发者；P0 不生成“我的综合理解”，也不自动修改 Skill。': 'These entries stay in local receipts and are never sent to the plugin developer. P0 does not generate a combined understanding or modify Skills automatically.',
      '我的理解': 'My understanding', '我想改进': 'What I want to improve', '下次如何验证': 'How I will validate next time',
      '相对路径': 'Relative path', '添加': 'Add', '本地优先': 'Local-first', '已加载不等于有效': 'Loaded does not mean effective',
      '当前对话暂未加载可追踪的 Skill。': 'No traceable Skill has been loaded in this conversation yet.',
      '暂时无法确认当前对话是否加载了 Skill。': 'Unable to confirm whether this conversation loaded a Skill.',
      '正在读取当前对话的 Skill 使用情况…': 'Reading Skill usage in this conversation…',
      '暂时无法读取当前对话的 Skill 使用情况。': 'Unable to read Skill usage in this conversation.',
      '正在读取当前可发现的 Skill 与本地历史…': 'Reading currently discoverable Skills and local history…',
      '暂时无法读取“我的 Skill”。': 'Unable to read My Skills.',
      '当前工作区与 Agent Preset 暂未发现 Skill。': 'No Skills were found in the current workspace or Agent Preset.',
      '没有符合当前搜索或筛选条件的 Skill。': 'No Skills match the current search or filters.',
      '当前会话未挂载可读取的 Skill Registry，也没有可显示的本地历史。': 'This session has no readable Skill Registry or local history to show.',
      '当前会话目录不可确认；以下只显示本地历史条目。': 'This session catalog cannot be confirmed; only local history is shown below.',
      '当前视图没有可用的会话 ID': 'No session ID is available for this view.',
      'DSH Skill Trace 我的 Skill': 'DSH Skill Trace: My Skills', 'DSH Skill Trace 本次 Skill 使用记录': 'DSH Skill Trace: Skill usage this session',
      '默认视图已切换，但暂时无法保存到下次启动。': 'The default view changed but could not be saved for the next launch.',
      '当前会话不在运行时内存中；只能展示已保存的最小收据。': 'This session is not in runtime memory; only the saved minimal receipt is available.',
      '本地收据不存在': 'Local receipt does not exist', '仅允许本机访问': 'Local access only', '请求体过大': 'Request body is too large', '请求体不是合法 JSON': 'Request body is not valid JSON',
      'sessionId 必填': 'sessionId is required', 'skillName 无效': 'skillName is invalid', 'entryId 无效': 'entryId is invalid', 'defaultView 无效': 'defaultView is invalid',
      '先核对在哪一轮、哪一步请求了哪个 Skill，以及加载结果。': 'First check which turn and step requested each Skill, and its load outcome.',
      '当前没有可安全提取的有序步骤，请按 Skill 说明核对网络、模型、MCP、脚本和权限。': 'No safely extractable ordered steps are available. Check network, model, MCP, scripts, and permissions against the Skill instructions.',
      '如需保存产出关系，请在右侧添加工作区内的相对引用。': 'To save an output relationship, add a workspace-relative reference on the right.',
      '本次返回指令中没有安全可提取的有序步骤；请人工核对 Skill 说明。': 'No safely extractable ordered steps were found in this returned instruction. Check the Skill instructions manually.',
      '已保存个人理解和改进意图；可在右侧继续编辑或复制清单。': 'Your understanding and improvement intent are saved. Continue editing or copy the checklist on the right.',
      '已保存个人理解；可在右侧继续编辑或复制清单。': 'Your understanding is saved. Continue editing or copy the checklist on the right.',
      '依赖只是关键词线索，仍需人工核对。': 'Dependencies are keyword signals only and still need your review.',
      '只展示可验证的 Skill 加载证据': 'Only verifiable Skill-load evidence is shown',
      '关联到会话': 'Linked to session', '尚未关联': 'Not linked', '候选依赖，待核对': 'Candidate dependency; review needed', '未观察到明确依赖线索': 'No clear dependency signal observed', '依赖条件': 'Dependencies',
      '由用户关联到本次会话': 'Linked to this session by you', '不会自动归因': 'No automatic attribution',
      '节点详情': 'Node details', '当前状态': 'Current status', '发生了什么': 'What happened', '这个 Skill 怎么跑（指令候选）': 'How this Skill runs (instruction candidates)',
      '没有安全可提取的结构化步骤，请人工核对 Skill 说明。': 'No safely extractable structured steps are available. Check the Skill instructions manually.',
      '这能说明什么': 'What this can show', '这不能说明什么': 'What this cannot show',
      '当前只能说明依赖尚未评估。': 'This only shows that the dependency has not been assessed.', '只说明用户是否创建了输出引用。': 'This only shows whether you created an output reference.', '只说明系统观察到的 Skill 加载请求及结果。': 'This only shows the Skill-load request and outcome observed by the system.',
      '不能说明 Agent 为什么选择它、是否遵循了方法，也不能证明它促成了结果。': 'It cannot show why the Agent chose it, whether it followed the method, or whether it caused the outcome.',
      '删除当前会话的 Skill Trace 本地收据？这不会删除 DSH 原始会话。': 'Delete this session’s local Skill Trace receipt? This will not delete the original DSH session.',
      '迭代清单已复制；未修改或发布任何 Skill。': 'Checklist copied. No Skill was modified or published.', '暂时无法写入剪贴板，请检查桌面端剪贴板权限。': 'Unable to write to the clipboard. Check Desktop clipboard permission.',
      '当前版本与本次观察版本不同，请先核对版本再迭代。': 'The current version differs from the observed version. Check it before iterating.',
      '打开“Skill 追踪”标签查看同一份完整收据': 'Open the Skill Trace tab to view this same complete receipt.',
      'Agent 可调用': 'Agent-invocable', 'Agent 不可调用': 'Not Agent-invocable', '用户可调用': 'User-invocable', '用户不可调用': 'Not user-invocable',
      '选择一个 Skill，查看它的声明、真实收据和历次会话理解。': 'Select a Skill to view its declaration, verified receipts, and session understandings.',
    }
    const ZH = Object.fromEntries(Object.keys(EN).map((key) => [key, key]))
    let translate = (key) => key
    const RAW = Symbol('dsh-skill-trace.raw')
    const raw = (value) => ({ [RAW]: true, value })
    const t = (key) => translate(key)
    const isEnglish = () => (localeService?.getSnapshot().active || 'en') !== 'zh'
    const localized = (zh, en) => isEnglish() ? en : zh
    const localState = (zh, en) => ({ zh, en })
    const renderLocalState = (value) => value && typeof value === 'object' && !value[RAW] ? localized(value.zh, value.en) : value
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
    const DRAFT_KEY = 'dsh-skill-trace.unsaved-drafts.v1'
    const DRAFT_LIMIT = 24
    const volatileDrafts = new Set()

    function readDraftBuffer() {
      try {
        const parsed = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || '{}')
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch { return {} }
    }

    function writeDraftBuffer(buffer) {
      try {
        if (!Object.keys(buffer).length) window.sessionStorage.removeItem(DRAFT_KEY)
        else window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(buffer))
        return true
      } catch { return false }
    }

    function draftId(kind, sessionId, skillName = '') {
      return `${kind}:${encodeURIComponent(sessionId || '')}:${encodeURIComponent(skillName || '')}`
    }

    function readDraft(id, baseUpdatedAt) {
      const buffer = readDraftBuffer()
      const draft = buffer[id]
      if (!draft) return null
      if ((draft.baseUpdatedAt ?? null) !== (baseUpdatedAt ?? null)) {
        delete buffer[id]
        writeDraftBuffer(buffer)
        return null
      }
      return draft
    }

    function writeDraft(id, values, baseUpdatedAt) {
      const nextValues = Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : '']))
      const buffer = readDraftBuffer()
      buffer[id] = { values: nextValues, baseUpdatedAt: baseUpdatedAt ?? null, updatedAt: Date.now() }
      const bounded = Object.fromEntries(Object.entries(buffer).sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)).slice(0, DRAFT_LIMIT))
      const written = writeDraftBuffer(bounded)
      if (written) volatileDrafts.delete(id)
      else volatileDrafts.add(id)
      return written
    }

    function clearDraft(id) {
      volatileDrafts.delete(id)
      const buffer = readDraftBuffer()
      if (!(id in buffer)) return
      delete buffer[id]
      writeDraftBuffer(buffer)
    }

    function clearSessionDrafts(sessionId) {
      const marker = `:${encodeURIComponent(sessionId || '')}:`
      const buffer = readDraftBuffer()
      let changed = false
      for (const id of Object.keys(buffer)) {
        if (!id.includes(marker)) continue
        delete buffer[id]
        changed = true
      }
      for (const id of [...volatileDrafts]) {
        if (id.includes(marker)) volatileDrafts.delete(id)
      }
      if (changed) writeDraftBuffer(buffer)
    }

    function clearAllDrafts() {
      volatileDrafts.clear()
      writeDraftBuffer({})
    }

    function hasDrafts() {
      return volatileDrafts.size > 0 || Object.keys(readDraftBuffer()).length > 0
    }

    function installDraftBeforeUnload() {
      const handler = (event) => {
        if (!hasDrafts()) return
        event.preventDefault()
        event.returnValue = ''
      }
      window.addEventListener('beforeunload', handler)
      return () => window.removeEventListener('beforeunload', handler)
    }

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
    const VALIDATION_STATUS = {
      met: { label: '符合预期', tone: 'success' },
      'not-met': { label: '不符合预期', tone: 'error' },
      inconclusive: { label: '暂不能判断', tone: 'warning' },
    }
    const DEPENDENCIES = { network: '网络', model: '模型', mcp: 'MCP', script: '脚本', permission: '权限' }

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

    function installStyles() {
      const previous = document.getElementById(STYLE_ID)
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        [data-plugin="dsh-skill-trace"]{--st-brand:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-500,#3567d6));--st-bg:var(--dsw-alias-bg-base,#f7f8fa);--st-layer:var(--dsw-alias-bg-layer-1,#fff);--st-layer-2:var(--dsw-alias-bg-layer-2,#f3f5f7);--st-border:var(--dsw-alias-border-l2,rgba(22,27,36,.14));--st-border-soft:var(--dsw-alias-border-l3,rgba(22,27,36,.09));--st-grid:color-mix(in srgb,var(--st-border-soft) 50%,transparent);--st-text:var(--dsw-alias-label-primary,#17191d);--st-muted:var(--dsw-alias-label-secondary,#626871);--st-faint:var(--dsw-alias-label-tertiary,#8b9098);--st-success:var(--dsw-alias-state-success-primary,#16834b);--st-warning:var(--dsw-alias-state-warn-primary,#b36500);--st-error:var(--dsw-alias-state-error-primary,#c23c45);height:calc(100dvh - 76px);max-height:calc(100dvh - 76px);min-height:0;overflow:hidden;color:var(--st-text);background:var(--st-bg);font-size:13px;line-height:1.45}
        [data-plugin="dsh-skill-trace"] *{box-sizing:border-box}[data-plugin="dsh-skill-trace"] button,[data-plugin="dsh-skill-trace"] input{font:inherit}
        .st-shell{height:100%;min-height:0;display:flex;flex-direction:column}.st-topbar{min-height:58px;padding:9px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--st-border);background:var(--st-layer)}
        .st-heading{min-width:0;flex:1}.st-heading-line{display:flex;align-items:center;gap:9px}.st-heading h1{margin:0;font-size:16px;font-weight:650;letter-spacing:-.01em}.st-workspace{margin-top:2px;color:var(--st-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-live{width:6px;height:6px;border-radius:50%;background:var(--st-success);flex:none}.st-live[data-state="unknown"]{background:var(--st-faint)}
        .st-view-switch{display:inline-flex;padding:3px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer-2)}.st-view-button{min-height:30px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:5px;background:transparent;color:var(--st-muted);cursor:pointer}.st-view-button:hover{color:var(--st-text)}.st-view-button[aria-pressed="true"]{background:var(--st-layer);color:var(--st-brand);box-shadow:0 1px 2px rgba(20,24,32,.08)}
        .st-icon-button,.st-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--st-border);background:var(--st-layer);color:var(--st-text);cursor:pointer}.st-icon-button{width:32px;height:32px;border-radius:7px;overflow:visible}.st-icon-button svg{display:block;overflow:visible}.st-button{min-height:34px;padding:0 12px;border-radius:7px}.st-button:hover,.st-icon-button:hover{background:var(--st-layer-2)}.st-button:focus-visible,.st-icon-button:focus-visible,.st-view-button:focus-visible,.st-node:focus-visible,.st-activity-step:focus-visible,.st-filter:focus-visible,.st-catalog-item:focus-visible,.st-history-action:focus-visible,.st-review-metric:focus-visible,.st-guide-link:focus-visible,.st-input:focus-visible,.st-select:focus-visible,.st-textarea:focus-visible,summary:focus-visible{outline:2px solid var(--st-brand);outline-offset:2px}.st-button-primary{border-color:var(--st-brand);background:var(--st-brand);color:white}.st-button-primary:hover{filter:brightness(.96);background:var(--st-brand)}.st-button-danger{border-color:color-mix(in srgb,var(--st-error) 45%,var(--st-border));color:var(--st-error)}.st-button:disabled{opacity:.5;cursor:default}
        .st-layout{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) 290px}.st-main{min-width:0;overflow:auto;padding:18px}.st-aside{min-width:0;overflow:auto;padding:18px 16px;border-left:1px solid var(--st-border);background:var(--st-layer)}
        .st-receipt{width:min(100%,980px);margin:0 auto;border:1px solid var(--st-border);border-radius:10px;background:var(--st-layer);overflow:hidden}.st-receipt-head{padding:21px 22px 17px;border-bottom:1px solid var(--st-border)}.st-receipt-head h2{margin:0;font-size:22px;line-height:1.25;font-weight:680;letter-spacing:-.025em}.st-receipt-meta{margin-top:6px;color:var(--st-muted);font-size:12px}.st-receipt-section{padding:18px 22px}.st-receipt-section+.st-receipt-section{border-top:1px solid var(--st-border)}.st-section-title{margin:0 0 15px;display:flex;align-items:center;gap:10px;font-size:15px;font-weight:650}.st-section-number{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--st-brand);color:white;font-size:13px;font-variant-numeric:tabular-nums;flex:none}
        .st-activity{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:start}.st-activity-step{position:relative;min-width:0;padding:0 24px 0 0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.st-activity-step:not(:last-child)::after{content:"";position:absolute;right:8px;top:15px;width:10px;height:10px;border-top:1px solid var(--st-faint);border-right:1px solid var(--st-faint);transform:rotate(45deg)}.st-activity-summary{display:grid;grid-template-columns:32px minmax(0,1fr);column-gap:9px;align-items:center}.st-activity-step[aria-expanded="true"] .st-activity-icon{border-color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 7%,var(--st-layer))}.st-activity-icon{grid-row:1/3;width:30px;height:30px;display:grid;place-items:center;border:1px solid var(--st-border);border-radius:50%;color:var(--st-brand)}.st-activity-copy strong{display:block;font-size:12px}.st-activity-copy span{display:block;margin-top:2px;color:var(--st-muted);font-size:11px}.st-activity-expanded{margin-top:12px;padding:11px 13px;border:1px solid var(--st-border-soft);border-radius:7px;background:var(--st-layer-2)}.st-activity-expanded strong{display:block;margin-bottom:7px;font-size:11px}.st-detail-list{margin:0;padding-left:16px;color:var(--st-muted);font-size:10.5px;columns:2;column-gap:30px}.st-detail-list li{break-inside:avoid}.st-detail-list li+li{margin-top:6px}.st-detail-boundary{margin:9px 0 0;color:var(--st-faint);font-size:10px}
        .st-methods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.st-method-card{min-width:0;padding:12px 13px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer)}.st-method-row{display:flex;align-items:center;gap:10px}.st-method-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--st-brand) 10%,transparent);color:var(--st-brand);flex:none}.st-method-main{min-width:0;flex:1}.st-method-name{font-size:13px;font-weight:620;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-method-meta{margin-top:2px;color:var(--st-muted);font-size:11px}.st-evidence-row{margin-top:9px;padding:8px 9px;display:grid;gap:4px;border:1px solid var(--st-border-soft);border-radius:6px;background:var(--st-layer-2);color:var(--st-muted);font-size:10px}.st-evidence-row code{color:var(--st-text);font:inherit;overflow-wrap:anywhere}.st-method-events{margin:10px -2px -2px;padding-top:8px;border-top:1px solid var(--st-border-soft)}.st-method-events summary{color:var(--st-muted);font-size:11px;cursor:pointer}.st-event-list{margin:8px 0 0;padding:0;list-style:none}.st-event-list li{padding:8px 0;color:var(--st-muted);font-size:10.5px}.st-event-list li+li{border-top:1px solid var(--st-border-soft)}.st-event-head{display:flex;align-items:center;gap:8px}.st-event-head strong{min-width:0;flex:1;color:var(--st-text);font-size:11px}.st-event-copy{margin:4px 0 0}.st-event-boundary{margin:3px 0 0;color:var(--st-faint);font-size:10px}.st-status{display:inline-flex;align-items:center;gap:5px;min-height:23px;padding:0 7px;border:1px solid var(--st-border);border-radius:999px;color:var(--st-muted);background:var(--st-layer);font-size:10.5px;white-space:nowrap}.st-status::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}.st-status[data-tone="brand"]{color:var(--st-brand)}.st-status[data-tone="success"]{color:var(--st-success)}.st-status[data-tone="warning"]{color:var(--st-warning)}.st-status[data-tone="error"]{color:var(--st-error)}
        .st-dependency-label{margin:15px 0 7px;color:var(--st-muted);font-size:11px}.st-dependencies{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--st-border);border-radius:8px;overflow:hidden}.st-dependency{padding:10px;min-width:0;text-align:center}.st-dependency+.st-dependency{border-left:1px solid var(--st-border-soft)}.st-dependency strong{display:block;font-size:11px}.st-dependency span{display:block;margin-top:2px;color:var(--st-faint);font-size:10px}
        .st-continuity{border:1px solid var(--st-border);border-radius:8px;overflow:hidden}.st-continuity-head{padding:10px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--st-border-soft)}.st-continuity-head strong{flex:1}.st-continuity-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.st-continuity-step{padding:13px;display:grid;grid-template-columns:24px minmax(0,1fr);column-gap:9px;align-content:start}.st-continuity-step+.st-continuity-step{border-left:1px solid var(--st-border-soft)}.st-mini-number{grid-row:1/3;width:22px;height:22px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--st-brand) 35%,var(--st-border));border-radius:50%;color:var(--st-brand);font-size:11px}.st-continuity-step strong{display:block;font-size:12px}.st-continuity-step p{margin:4px 0 0;color:var(--st-muted);font-size:11px}
        .st-learning-cards{display:grid;gap:11px}.st-learning-card{border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer);overflow:hidden}.st-learning-head{padding:11px 13px;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid var(--st-border-soft)}.st-learning-icon{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--st-border);border-radius:7px;color:var(--st-brand);flex:none}.st-learning-title{min-width:0;flex:1}.st-learning-title strong{display:block;font-size:13px}.st-learning-title span{display:block;margin-top:2px;color:var(--st-muted);font-size:10.5px}.st-learning-body{padding:12px 13px;display:grid;gap:12px}.st-learning-block h4{margin:0 0 7px;font-size:11px}.st-learning-list{margin:0;padding-left:20px;color:var(--st-muted);font-size:11px}.st-learning-list li+li{margin-top:6px}.st-learning-empty{margin:0;color:var(--st-muted);font-size:11px}.st-learning-deps{display:flex;flex-wrap:wrap;gap:6px}.st-learning-dep{padding:4px 7px;border:1px solid var(--st-border-soft);border-radius:999px;color:var(--st-muted);background:var(--st-layer-2);font-size:10px}.st-learning-dep[data-active="true"]{border-color:color-mix(in srgb,var(--st-brand) 28%,var(--st-border));color:var(--st-brand)}.st-learning-note{padding:9px 10px;border-radius:7px;background:var(--st-layer-2);color:var(--st-muted);font-size:10.5px}.st-learning-boundary{padding:9px 10px;border-radius:7px;background:var(--st-layer-2);color:var(--st-faint);font-size:10px}
        .st-summary{border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer)}.st-summary-head{padding:11px 13px;border-bottom:1px solid var(--st-border-soft);display:flex;align-items:center;gap:8px}.st-summary-head h3{margin:0;font-size:13px}.st-summary-body{padding:12px 13px;display:grid;gap:10px}.st-summary-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:10px}.st-summary-row strong{font-size:11px}.st-summary-row p{margin:0;color:var(--st-muted);font-size:11px}.st-summary-boundary{padding:9px 10px;border-radius:7px;background:var(--st-layer-2);color:var(--st-muted);font-size:10.5px}
        .st-panel+.st-panel{margin-top:23px;padding-top:20px;border-top:1px solid var(--st-border)}.st-panel h2{margin:0 0 5px;font-size:14px}.st-panel-note{margin:0 0 12px;color:var(--st-muted);font-size:11px}.st-continuity-review{display:grid;gap:6px}.st-continuity-review .st-button{justify-content:flex-start}.st-continuity-review .st-button[aria-pressed="true"]{border-color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 8%,var(--st-layer));color:var(--st-brand)}.st-reset-link{margin-top:8px;padding:0;border:0;background:transparent;color:var(--st-muted);font:inherit;font-size:10.5px;cursor:pointer}.st-reset-link:hover{color:var(--st-brand)}.st-local-only{margin-top:10px;display:flex;align-items:flex-start;gap:6px;color:var(--st-faint);font-size:10px}.st-local-only svg{flex:none;margin-top:1px}.st-input,.st-select,.st-textarea{width:100%;padding:0 10px;border:1px solid var(--st-border);border-radius:7px;background:var(--st-layer);color:var(--st-text);outline:none}.st-input,.st-select{height:34px}.st-textarea{min-height:72px;padding-block:8px;resize:vertical;line-height:1.45}.st-input:focus,.st-select:focus,.st-textarea:focus{border-color:var(--st-brand)}.st-learning-form,.st-validation-form{display:grid;gap:10px}.st-field-label{display:grid;gap:5px;color:var(--st-muted);font-size:10.5px}.st-field-count{text-align:right;color:var(--st-faint);font-size:9.5px}.st-learning-actions,.st-validation-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.st-learning-actions .st-button,.st-validation-actions .st-button{min-width:0;padding-inline:9px;white-space:nowrap;font-size:12px}.st-copy-state,.st-save-state{margin-top:8px;color:var(--st-success);font-size:10px}.st-validation-block{margin-top:16px;padding-top:15px;border-top:1px solid var(--st-border-soft)}.st-validation-block h3{margin:0 0 5px;font-size:12px}.st-validation-block>.st-panel-note{margin-bottom:10px}.st-validation-summary{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.st-validation-summary span:last-child{color:var(--st-muted);font-size:10px}.st-version-warning{margin-bottom:10px;padding:8px 9px;border:1px solid color-mix(in srgb,var(--st-warning) 35%,var(--st-border));border-radius:7px;color:var(--st-warning);background:color-mix(in srgb,var(--st-warning) 5%,var(--st-layer));font-size:10.5px}.st-output-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.st-output-list{margin:10px 0 0;padding:0;list-style:none}.st-output-list li{padding:8px;border:1px solid var(--st-border);border-radius:7px;color:var(--st-muted);font-size:11px;overflow-wrap:anywhere}.st-output-list li+li{margin-top:6px}.st-output-item{display:flex;align-items:flex-start;gap:8px}.st-output-item span{min-width:0;flex:1}.st-output-item .st-reset-link{flex:none;margin-top:0}.st-notice{padding:9px 10px;border:1px solid var(--st-border);border-radius:7px;color:var(--st-muted);background:var(--st-layer-2);font-size:11px}.st-error{margin-bottom:10px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--st-error) 35%,var(--st-border));border-radius:7px;color:var(--st-error);font-size:11px}
        .st-map-wrap{min-width:0}.st-map-head{margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.st-map-head h2{margin:0;font-size:18px}.st-map-head p{margin:4px 0 0;color:var(--st-muted);font-size:11px}.st-legend{display:flex;flex-wrap:wrap;gap:9px 14px;color:var(--st-muted);font-size:10.5px}.st-legend-item{display:inline-flex;align-items:center;gap:6px}.st-legend-line{width:22px;border-top:2px solid var(--st-brand)}.st-legend-line[data-kind="inferred"]{border-top-style:dashed}.st-legend-line[data-kind="human"]{border-color:var(--st-brand);border-top-style:dashed}.st-legend-line[data-kind="dependency"]{border-color:var(--st-faint);border-top-style:dashed}
        .st-map-scroll{overflow:auto;border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer)}.st-map-canvas{position:relative;width:max(100%,1000px);min-width:1000px;height:660px;background-image:linear-gradient(var(--st-grid) 1px,transparent 1px),linear-gradient(90deg,var(--st-grid) 1px,transparent 1px);background-size:24px 24px}.st-map-stage{position:relative;width:1000px;height:100%;margin-inline:auto}.st-map-lines{position:absolute;inset:0 auto auto 0;width:1000px;height:100%;pointer-events:none}.st-node{position:absolute;padding:10px 11px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer);color:var(--st-text);text-align:left;cursor:pointer;overflow:hidden}.st-node:hover,.st-node[aria-current="true"]{border-color:color-mix(in srgb,var(--st-brand) 65%,var(--st-border));box-shadow:0 0 0 2px color-mix(in srgb,var(--st-brand) 8%,transparent)}.st-node-task{border-color:var(--st-brand)}.st-node-skill,.st-node-step{display:flex;align-items:center;gap:9px}.st-node-step{border-color:color-mix(in srgb,var(--st-brand) 50%,var(--st-border))}.st-node-dependency{padding:8px;text-align:center}.st-node-number{width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:var(--st-brand);color:white;font-size:11px;flex:none}.st-node-title{display:block;font-size:12px;font-weight:620;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-node-sub{display:block;margin-top:2px;color:var(--st-muted);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-node-status{margin-left:auto;color:var(--st-success);flex:none}.st-map-section-label{position:absolute;color:var(--st-muted);font-size:11px;font-weight:620;background:var(--st-layer);padding:0 5px}.st-map-summary{margin-top:12px}
        .st-inspector-title{display:flex;align-items:center;gap:8px}.st-inspector-title h2{margin:0;font-size:14px}.st-inspector-body{margin-top:14px}.st-inspector-block+.st-inspector-block{margin-top:16px;padding-top:14px;border-top:1px solid var(--st-border)}.st-inspector-block h3{margin:0 0 6px;font-size:11px}.st-inspector-block p{margin:0;color:var(--st-muted);font-size:11px}.st-inspector-list{margin:0;padding-left:17px;color:var(--st-muted);font-size:11px}.st-inspector-list li+li{margin-top:6px}.st-inspector-event strong{display:block;color:var(--st-text);font-weight:620}.st-inspector-event span{display:block;margin-top:2px;color:var(--st-muted)}
        .st-empty-page,.st-trace-state{height:100%;display:grid;place-items:center;padding:32px;color:var(--st-muted)}.st-empty-page-inner{width:min(100%,420px)}.st-empty-page p{margin:0}.st-trace-state-line{display:inline-flex;align-items:center;gap:9px;font-size:13px}.st-trace-state-dot{width:7px;height:7px;border-radius:50%;background:var(--st-faint)}.st-trace-state[data-kind="loading"] .st-trace-state-dot{background:var(--st-brand);animation:st-pulse 1.2s ease-in-out infinite}.st-layout[data-simple="true"]{grid-template-columns:minmax(0,1fr)}@keyframes st-pulse{50%{opacity:.35}}
        .st-toolbar-split{width:1px;height:24px;background:var(--st-border);flex:none}.st-toolbar-label{color:var(--st-faint);font-size:10px;white-space:nowrap}.st-library-button[aria-pressed="true"]{border-color:color-mix(in srgb,var(--st-brand) 50%,var(--st-border));color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 6%,var(--st-layer))}
        .st-catalog-page{height:100%;min-height:0;display:grid;grid-template-columns:380px minmax(0,1fr);background:var(--st-layer)}.st-catalog-sidebar{min-width:0;overflow:auto;border-right:1px solid var(--st-border);background:var(--st-bg)}.st-catalog-tools{position:sticky;top:0;z-index:2;padding:14px;border-bottom:1px solid var(--st-border);background:color-mix(in srgb,var(--st-bg) 92%,transparent);backdrop-filter:blur(8px)}.st-catalog-intro-row{margin:0 0 9px;display:flex;align-items:center;gap:10px}.st-catalog-count{min-width:0;flex:1;margin:0;font-size:12px;font-weight:620}.st-guide-link{padding:0;border:0;background:transparent;color:var(--st-brand);font-size:10px;cursor:pointer;white-space:nowrap}.st-guide-link[aria-pressed="true"]{color:var(--st-muted)}.st-review-summary{margin-bottom:10px;padding:9px;border:1px solid var(--st-border);border-radius:8px;background:var(--st-layer)}.st-review-summary h2{margin:0 0 7px;font-size:11px}.st-review-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.st-review-metric{min-width:0;min-height:52px;padding:7px;border:0;border-radius:6px;background:var(--st-layer-2);color:var(--st-muted);text-align:left;cursor:pointer}.st-review-metric strong{display:block;color:var(--st-text);font-size:13px}.st-review-metric span{display:block;margin-top:2px;font-size:9px;line-height:1.3;white-space:normal;overflow-wrap:anywhere}.st-review-metric:hover{background:color-mix(in srgb,var(--st-brand) 7%,var(--st-layer-2))}.st-review-boundary{margin:7px 0 0;color:var(--st-faint);font-size:9px}.st-search-wrap{position:relative}.st-search-wrap svg{position:absolute;left:9px;top:9px;color:var(--st-faint);pointer-events:none}.st-search-wrap .st-input{padding-left:31px}.st-filter-row{margin-top:9px;display:flex;gap:6px;overflow:auto;padding-bottom:2px}.st-filter{min-height:27px;padding:0 8px;border:1px solid var(--st-border);border-radius:999px;background:var(--st-layer);color:var(--st-muted);font-size:10px;white-space:nowrap;cursor:pointer}.st-filter[aria-pressed="true"]{border-color:var(--st-brand);color:var(--st-brand);background:color-mix(in srgb,var(--st-brand) 6%,var(--st-layer))}.st-sort-row{margin-top:9px;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;color:var(--st-muted);font-size:10px}.st-sort-row .st-select{height:30px;font-size:10.5px}.st-data-tools{margin-top:9px;border-top:1px solid var(--st-border-soft);padding-top:8px}.st-data-tools summary{color:var(--st-muted);font-size:10.5px;cursor:pointer}.st-data-actions{margin-top:8px;display:grid;grid-template-columns:1fr;gap:6px}.st-data-actions .st-button{width:100%;min-width:0;padding-inline:10px;font-size:10.5px;white-space:nowrap}.st-data-state{margin-top:7px;color:var(--st-success);font-size:10px}.st-backup-list{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:6px}.st-backup-item{padding:7px 8px;border:1px solid var(--st-border-soft);border-radius:7px;background:var(--st-layer)}.st-backup-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px}.st-backup-meta{margin-top:3px;color:var(--st-faint);font-size:9px}.st-backup-action{margin-top:5px;padding:0;border:0;background:transparent;color:var(--st-brand);font:inherit;font-size:9.5px;cursor:pointer}.st-inline-confirm{margin-top:8px}.st-inline-confirm p{margin:0 0 8px}.st-catalog-warning{margin-top:8px;color:var(--st-warning);font-size:10px}.st-catalog-list{margin:0;padding:6px;list-style:none}.st-catalog-item{width:100%;padding:11px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:inherit;text-align:left;cursor:pointer}.st-catalog-item:hover{background:var(--st-layer)}.st-catalog-item[aria-current="true"]{border-color:var(--st-border);background:var(--st-layer);box-shadow:0 1px 2px rgba(20,24,32,.04)}.st-catalog-item-head{display:flex;align-items:center;gap:8px}.st-catalog-item-head strong{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.st-catalog-item-copy{margin:5px 20px 7px 0;color:var(--st-muted);font-size:10.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.st-catalog-signals{display:flex;flex-wrap:wrap;gap:5px}.st-signal{padding:2px 6px;border:1px solid var(--st-border-soft);border-radius:999px;color:var(--st-muted);background:var(--st-layer-2);font-size:9.5px}.st-signal[data-tone="brand"]{color:var(--st-brand)}.st-signal[data-tone="success"]{color:var(--st-success)}.st-signal[data-tone="warning"]{color:var(--st-warning)}.st-catalog-list-state{padding:28px 16px;color:var(--st-muted);font-size:11px;text-align:center}
        .st-catalog-detail{min-width:0;overflow:auto;padding:24px}.st-catalog-detail-inner{width:min(100%,860px);margin:0 auto}.st-catalog-back{display:none;margin-bottom:12px}.st-catalog-guide{width:min(100%,860px);margin:6px auto 40px;padding:6px 4px}.st-guide-header{max-width:700px;padding-bottom:10px}.st-guide-header h2{margin:0;font-size:25px;line-height:1.22;letter-spacing:-.025em}.st-guide-intro{max-width:650px;margin:9px 0 0;color:var(--st-muted);font-size:12px}.st-guide-path{margin:0;padding:0;list-style:none}.st-guide-step{position:relative;min-height:42px;padding:0 0 4px 40px}.st-guide-step:not(:last-child)::before{content:"";position:absolute;left:13px;top:25px;bottom:0;border-left:1px solid var(--st-border)}.st-guide-number{position:absolute;left:0;top:0;width:27px;height:27px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--st-brand) 40%,var(--st-border));border-radius:50%;background:var(--st-layer);color:var(--st-brand);font-size:11px;font-weight:650;font-variant-numeric:tabular-nums}.st-guide-step strong{display:block;padding-top:1px;font-size:12px}.st-guide-step p{margin:2px 0 0;color:var(--st-muted);font-size:10.5px}.st-guide-note{max-width:700px;margin:2px 0 0;padding-top:6px;border-top:1px solid var(--st-border-soft);color:var(--st-faint);font-size:10px}.st-skill-title{padding-bottom:18px;border-bottom:1px solid var(--st-border)}.st-skill-title h2{margin:0;font-size:24px;line-height:1.2;letter-spacing:-.02em}.st-skill-title p{max-width:720px;margin:8px 0 0;color:var(--st-muted);font-size:12px}.st-skill-meta{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}.st-evidence-stack{margin-top:18px;display:grid;gap:12px}.st-evidence-section{position:relative;padding:16px 17px 16px 48px;border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer)}.st-evidence-section::before{content:"";position:absolute;left:24px;top:42px;bottom:-14px;border-left:1px solid var(--st-border)}.st-evidence-section:last-child::before{display:none}.st-evidence-index{position:absolute;left:13px;top:15px;width:23px;height:23px;display:grid;place-items:center;border:1px solid var(--st-border);border-radius:50%;background:var(--st-layer);color:var(--st-brand);font-size:10px;font-weight:650}.st-evidence-section h3{margin:0;font-size:13px}.st-evidence-kicker{margin:3px 0 11px;color:var(--st-faint);font-size:10px}.st-definition-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.st-definition-cell{padding:9px 10px;border-radius:7px;background:var(--st-layer-2)}.st-definition-cell span{display:block;color:var(--st-faint);font-size:9.5px}.st-definition-cell strong{display:block;margin-top:3px;font-size:11px;overflow-wrap:anywhere}.st-history-list{display:grid;gap:8px}.st-history-card{border:1px solid var(--st-border-soft);border-radius:7px;overflow:hidden}.st-history-head{padding:9px 10px;display:flex;align-items:center;gap:8px;background:var(--st-layer-2)}.st-history-head strong{min-width:0;flex:1;font-size:11px}.st-history-meta{padding:8px 10px;color:var(--st-muted);font-size:10px}.st-history-action{padding:0;border:0;background:transparent;color:var(--st-brand);font-size:10px;cursor:pointer}.st-history-expanded{padding:10px;border-top:1px solid var(--st-border-soft);display:grid;gap:8px}.st-history-card-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.st-note-fields{display:grid;gap:7px}.st-note-field{padding:8px 9px;border-left:2px solid var(--st-brand);background:var(--st-layer-2)}.st-note-field strong{display:block;font-size:10px}.st-note-field p{margin:3px 0 0;color:var(--st-muted);font-size:10.5px}.st-boundary-copy{margin:10px 0 0;color:var(--st-faint);font-size:10px}.st-association-exact{color:var(--st-success)}.st-association-candidate{color:var(--st-warning)}.st-association-conflict{color:var(--st-error)}
        @media(max-width:1050px){.st-layout{grid-template-columns:minmax(0,1fr) 250px}.st-dependencies{grid-template-columns:repeat(3,minmax(0,1fr))}.st-dependency:nth-child(4){border-left:0;border-top:1px solid var(--st-border-soft)}.st-dependency:nth-child(5){border-top:1px solid var(--st-border-soft)}}
        @media(max-width:1000px){[data-plugin="dsh-skill-trace"]{overflow:auto;max-height:none;height:auto;min-height:100%}.st-shell{height:auto;min-height:100dvh}.st-topbar{flex-wrap:wrap}.st-heading{flex-basis:100%}.st-view-switch{flex:1}.st-view-button{flex:1}.st-layout{display:block}.st-main,.st-aside{overflow:visible}.st-aside{border-left:0;border-top:1px solid var(--st-border)}.st-activity{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:12px}.st-continuity-steps{grid-template-columns:1fr}.st-activity-step{padding:0}.st-activity-step:not(:last-child)::after{display:none}.st-detail-list{columns:1}.st-methods{grid-template-columns:1fr}.st-continuity-step+.st-continuity-step{border-left:0;border-top:1px solid var(--st-border-soft)}.st-catalog-page{height:auto;grid-template-columns:1fr}.st-catalog-page[data-selected="true"] .st-catalog-sidebar{display:none}.st-catalog-page:not([data-selected="true"]) .st-catalog-detail{display:none}.st-catalog-sidebar{overflow:visible;border-right:0;border-bottom:1px solid var(--st-border)}.st-catalog-tools{position:static}.st-guide-link{display:none}.st-catalog-detail{overflow:visible}.st-catalog-back{display:inline-flex}.st-toolbar-label{display:none}}
        @media(max-width:460px){.st-main,.st-aside{padding:12px}.st-receipt-head,.st-receipt-section{padding-inline:14px}.st-activity{grid-template-columns:1fr}.st-button,.st-input,.st-select,.st-textarea{min-height:44px;font-size:16px}.st-view-button,.st-filter{min-height:40px}.st-output-form,.st-learning-actions,.st-data-actions{grid-template-columns:1fr}.st-output-form .st-button,.st-learning-actions .st-button,.st-data-actions .st-button{width:100%}.st-dependencies{grid-template-columns:repeat(2,minmax(0,1fr))}.st-dependency:nth-child(3),.st-dependency:nth-child(5){border-left:0}.st-dependency:nth-child(n+3){border-top:1px solid var(--st-border-soft)}.st-summary-row{grid-template-columns:1fr;gap:3px}.st-toolbar-split{display:none}.st-catalog-detail{padding:14px}.st-definition-grid{grid-template-columns:1fr}.st-evidence-section{padding-left:42px}}
        @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.st-trace-state-dot{animation:none!important}}
        .st-session-chip{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,rgba(22,27,36,.14));border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#626871);font-size:11px;white-space:nowrap}.st-session-chip svg{color:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-500,#3567d6))}
        .st-runtime{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px;align-items:start}
        .st-runtime-canvas{min-width:0;overflow:auto;max-height:calc(100dvh - 190px);border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer);padding:10px}
        .st-rt-edge{fill:none;stroke-linecap:round;cursor:pointer}
        .st-rt-edge:hover{stroke-width:2.6}
        .st-rt-edge[data-type="contains"]{stroke:var(--st-border);stroke-width:1.1}
        .st-rt-edge[data-type="spawns"]{stroke:var(--st-warning);stroke-width:1.5}
        .st-rt-edge[data-type="retries"]{stroke:var(--st-error);stroke-width:1.5}
        .st-rt-edge[data-type="follows"]{stroke:var(--st-border-soft);stroke-width:1;stroke-dasharray:3 3}
        .st-rt-edge[data-status="candidate"]{stroke-dasharray:5 3}
        .st-rt-edge[data-selected="true"]{stroke:var(--st-brand);stroke-width:2.8}
        .st-rt-node{cursor:pointer}
        .st-rt-node rect{fill:var(--st-layer);stroke-width:1.2}
        .st-rt-node[data-selected="true"] rect{stroke-width:2.4}
        .st-rt-node text{font-size:11px;fill:var(--st-ink,currentColor);pointer-events:none}
        .st-rt-node .st-rt-sub{font-size:9px;fill:var(--st-faint)}
        .st-rt-node .st-rt-id{font-size:8.5px;fill:var(--st-faint);text-anchor:end}
        .st-rt-bar{stroke-width:4}
        .st-rt-inspector{border:1px solid var(--st-border);border-radius:9px;background:var(--st-layer);padding:13px 14px;position:sticky;top:8px;max-height:calc(100dvh - 190px);overflow:auto}
        .st-rt-inspector h3{margin:0 0 2px;font-size:12.5px}
        .st-rt-kicker{margin:0 0 10px;color:var(--st-faint);font-size:10px}
        .st-rt-field{margin:0 0 9px;padding:8px 9px;border-radius:7px;background:var(--st-layer-2)}
        .st-rt-field span{display:block;color:var(--st-faint);font-size:9.5px;text-transform:uppercase;letter-spacing:.04em}
        .st-rt-field p{margin:3px 0 0;font-size:11px;line-height:1.55}
        .st-rt-field strong{display:block;margin-top:3px;font-size:11.5px}
        .st-rt-why{border-left:2px solid var(--st-brand)}
        .st-rt-limit{border-left:2px solid var(--st-warning);color:var(--st-muted)}
        .st-rt-rel{display:grid;gap:5px;margin:0 0 9px;padding:8px 9px;border:1px solid var(--st-border-soft);border-radius:7px;cursor:pointer;background:transparent;text-align:left;width:100%}
        .st-rt-rel:hover{border-color:var(--st-brand)}
        .st-rt-rel-top{display:flex;align-items:center;gap:6px;font-size:11px}
        .st-rt-rel-top em{font-style:normal;color:var(--st-faint);font-size:10px}
        .st-rt-rel p{margin:0;color:var(--st-muted);font-size:10.5px;line-height:1.5}
        .st-rt-evidence{margin:0;padding:0;list-style:none;display:grid;gap:4px}
        .st-rt-evidence li{display:flex;gap:6px;align-items:baseline;font-size:10.5px;color:var(--st-muted)}
        .st-rt-evidence code{font-size:9.5px;color:var(--st-faint)}
        .st-rt-notes{margin:10px 0 0;padding:9px 10px;border-radius:7px;background:var(--st-layer-2);color:var(--st-faint);font-size:10px;line-height:1.6}
        .st-rt-empty{display:grid;place-items:center;min-height:180px;color:var(--st-muted);font-size:12px}
        @media(max-width:1050px){.st-runtime{grid-template-columns:minmax(0,1fr)}.st-rt-inspector{position:static;max-height:none}}
      `
      if (previous) previous.replaceWith(style)
      else document.head.appendChild(style)
      return () => {
        if (document.getElementById(STYLE_ID) === style) style.remove()
      }
    }

    async function api(path, options = {}) {
      const response = await fetch(`${API_ROOT}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } })
      const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`)
      return body
    }

    async function openHostPath(path) {
      const response = await fetch('/api/host.openPath', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'host.openPath',
          payload: { path },
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.result?.ok) throw new Error(body?.result?.error?.message || `HTTP ${response.status}`)
    }

    function statusBadge(status, label) {
      const meta = STATUS[status] || STATUS.unknown
      return h('span', { className: 'st-status', 'data-tone': meta.tone }, label || meta.label)
    }

    function eventOutcome(event) {
      if (event.status === 'loaded') return localized('系统已把这次加载请求与成功结果配对。', 'The system paired this load request with its successful result.')
      if (event.status === 'failed') return localized(`系统收到明确失败结果${event.errorCode ? `（${event.errorCode}）` : ''}。`, `The system received an explicit failure result${event.errorCode ? ` (${event.errorCode})` : ''}.`)
      if (event.status === 'outcome-unknown') return localized('会话恢复时无法确认工具是否已经执行；不能写成成功或失败。', 'Session recovery cannot confirm whether the tool ran; it is neither success nor failure.')
      if (event.status === 'not-started') return localized('会话恢复时确认该工具尚未开始执行。', 'Session recovery confirmed that this tool had not started.')
      if (event.status === 'unresolved') return localized('记录不完整，尚未找到可配对结果；这不是正常生命周期的目标状态。', 'The record is incomplete: no paired result has been found.')
      return localized('系统已观察到加载请求，但结果尚未确定。', 'The system observed a load request, but its outcome is not known yet.')
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

    async function writeClipboard(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
      const field = document.createElement('textarea')
      field.value = text
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      try {
        field.select()
        if (!document.execCommand('copy')) throw new Error('clipboard unavailable')
      } finally {
        field.remove()
      }
    }

    function continuationCardText(card, note = {}, validationResult = null, continuity = {}, receipt = {}) {
      const version = versionStateCopy(card?.versionState).label
      const hashes = card?.observedHashes?.length ? card.observedHashes.map(shortHash).join('、') : null
      const steps = card?.steps?.length ? card.steps.map((step, index) => `${index + 1}. ${step.title}`).join('\n') : localized('- 未提取到结构化步骤，请先人工核对 Skill 说明。', '- No structured steps were extracted. Check the Skill instructions manually.')
      const dependencies = (card?.dependencies || []).filter((item) => item.required === 'candidate').map((item) => DEPENDENCIES[item.type] || item.type)
      const zhHashes = hashes || '未取得标准指令指纹'
      const enHashes = hashes || t('未取得标准指令指纹')
      const receiptTime = formatLocalTime(receipt.createdAt)
      const continuation = STATUS[continuity?.status]?.label || STATUS.unassessed.label
      const validation = VALIDATION_STATUS[validationResult?.status]?.label || '未记录'
      const zh = [
        `# ${card?.skillName || 'Skill'} 继续行动卡`,
        '',
        `- 来源收据时间：${receiptTime}`,
        `- 本次指令指纹：${zhHashes}`,
        `- 版本状态：${version}`,
        `- 继续方式：${continuation}`,
        `- 人工验证结果：${validation}`,
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
        '## 实际观察',
        validationResult?.observedOutcome || '未记录',
        '',
        '## 下一步动作',
        validationResult?.nextAction || '待填写',
        '',
        '> 证据边界：这张卡只整理原收据中的候选步骤、人工判断和用户填写内容，不证明 Agent 已执行、遵循或因此取得结果，也不会自动修改或发布 Skill。',
      ].join('\n')
      if (!isEnglish()) return zh
      return [
        `# ${card?.skillName || 'Skill'} continuation card`, '',
        `- Source receipt time: ${receiptTime}`, `- Instruction fingerprint: ${enHashes}`, `- Version status: ${t(version)}`, `- Continuation mode: ${t(continuation)}`, `- Human validation result: ${validationResult ? t(validation) : 'Not recorded'}`, `- Candidate dependencies: ${dependencies.length ? dependencies.map(t).join(', ') : t('未观察到明确线索')}`, '',
        '## Candidate steps declared by the Skill', steps, '', '## My understanding', note.understanding || 'To be filled in', '',
        '## What I want to improve', note.improvementIntent || 'To be filled in', '', '## How I will validate next time', note.validationPlan || 'To be filled in', '',
        '## What I observed', validationResult?.observedOutcome || 'Not recorded', '', '## Next action', validationResult?.nextAction || 'To be filled in', '',
        '> Evidence boundary: this card only organizes candidate steps, human assessments, and user-authored content from the original receipt. It does not prove execution, compliance, or causality, and it never modifies or publishes a Skill.',
      ].join('\n')
    }

    function dependencyState(item) {
      return item?.required === 'candidate' ? '发现候选线索' : '未观察到明确线索'
    }

    function eventLocation(event) {
      return localized(`第 ${event.turn ?? '?'} 轮 · 第 ${event.step ?? '?'} 步`, `Turn ${event.turn ?? '?'} · Step ${event.step ?? '?'}`)
    }

    function eventTitle(event) {
      return localized(`${eventLocation(event)}请求加载 ${event.name}`, `${eventLocation(event)} requested ${event.name}`)
    }

    function summaryText(model) {
      const summary = model.summary || {}
      const sequence = summary.eventSkillNames?.length ? summary.eventSkillNames.join(' → ') : localized('没有可显示的 Skill 加载顺序', 'No Skill load sequence to show')
      const repeated = summary.repeatedMethods?.length ? localized(`其中 ${summary.repeatedMethods.map((item) => `${item.name} 重复出现，共 ${item.callCount} 次`).join('、')}。`, `Repeated loads: ${summary.repeatedMethods.map((item) => `${item.name} (${item.callCount})`).join(', ')}.`) : localized('没有重复加载记录。', 'No repeated loads recorded.')
      const output = model.outputs?.length ? localized(`用户已关联 ${model.outputs.length} 个本地产出：${model.outputs.map((item) => item.relativeRef).join('、')}。`, `${model.outputs.length} local output(s) linked: ${model.outputs.map((item) => item.relativeRef).join(', ')}.`) : localized('尚未关联本次产出；系统不会从最终回答或项目文件中自动推断产出关系。', 'No output is linked. The system never infers an output relationship from the final answer or project files.')
      return {
        flow: localized(`按加载事件顺序，系统观测到 ${sequence}。${repeated}`, `In load-event order, the system observed ${sequence}. ${repeated}`),
        result: localized(`共 ${summary.eventCount ?? 0} 次加载：${summary.loadedCount ?? 0} 次成功、${summary.failedCount ?? 0} 次失败、${summary.outcomeUnknownCount ?? 0} 次结果未知、${summary.notStartedCount ?? 0} 次未开始、${summary.unresolvedCount ?? 0} 次记录待定。`, `${summary.eventCount ?? 0} load(s): ${summary.loadedCount ?? 0} succeeded, ${summary.failedCount ?? 0} failed, ${summary.outcomeUnknownCount ?? 0} unknown, ${summary.notStartedCount ?? 0} not started, and ${summary.unresolvedCount ?? 0} pending.`),
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
      if (index === 0) return (model.turnDetails || []).map((turn) => localized(`第 ${turn.turn} 轮发生 ${turn.stepCount} 个步骤；观测到 ${turn.eventCount} 次 Skill 加载${turn.skillNames.length ? `（${turn.skillNames.join('、')}）` : ''}。`, `Turn ${turn.turn} had ${turn.stepCount} step(s) and ${turn.eventCount} observed Skill load(s)${turn.skillNames.length ? ` (${turn.skillNames.join(', ')})` : ''}.`))
      if (index === 1) {
        const loadSteps = new Set((model.events || []).map((event) => `${event.turn}:${event.step}`)).size
        return [...(model.events || []).map((event) => `${eventTitle(event)}; ${eventOutcome(event)}`), localized(`另有 ${Math.max(0, (summary.stepCount || 0) - loadSteps)} 个已观察步骤没有标准 skill 工具事件；这不等于没有使用其他 Consumer。`, `${Math.max(0, (summary.stepCount || 0) - loadSteps)} observed step(s) have no standard skill-tool event; this does not mean another Consumer was not used.`)]
      }
      if (index === 2) return (model.methods || []).map((method) => localized(`${method.name} 共请求 ${method.callCount} 次：${method.loadedCount} 次成功、${method.failedCount} 次失败、${method.outcomeUnknownCount || 0} 次结果未知、${method.notStartedCount || 0} 次未开始、${method.unresolvedCount + method.requestedCount} 次记录待定。`, `${method.name} was requested ${method.callCount} time(s): ${method.loadedCount} succeeded, ${method.failedCount} failed, ${method.outcomeUnknownCount || 0} unknown, ${method.notStartedCount || 0} not started, and ${method.unresolvedCount + method.requestedCount} pending.`))
      return [model.coverage?.note || localized('当前观测范围不可用。', 'Current observation coverage is unavailable.'), localized('收据由确定性规则生成，没有调用模型总结，也没有保存 Prompt、Skill 正文或工具输出。', 'The receipt is generated by deterministic rules. It does not call a model summary or store prompts, Skill bodies, or tool output.')]
    }

    function ReceiptView({ model, workspaceLabel }) {
      const [activeStage, setActiveStage] = React.useState(null)
      const summary = model.summary || {}
      const activity = [
        ['开始处理', localized(`${summary.turnCount || 0} 个 Turn`, `${summary.turnCount || 0} turn(s)`), 'arrow'],
        ['执行步骤', localized(`${summary.stepCount || 0} 个 Step`, `${summary.stepCount || 0} step(s)`), 'arrow'],
        ['请求加载', localized(`${summary.methodCount || 0} 个 Skill · ${summary.loadedCount || 0}/${summary.eventCount || 0} 次成功`, `${summary.methodCount || 0} Skill(s) · ${summary.loadedCount || 0}/${summary.eventCount || 0} succeeded`), 'skill'],
        ['形成收据', model.coverage?.status === 'verified-standard-contract' ? '标准事件已验证' : '覆盖待确认', 'receipt'],
      ]
      const candidateSteps = model.continuity?.steps || []
      const nextSteps = candidateSteps.length
        ? candidateSteps.map((item) => [item.title, localized(`候选步骤来自 ${item.skillName} 本次返回指令的有序列表；尚未证明 Agent 已执行。`, `This candidate step is from the ordered list returned by ${item.skillName}; it does not prove the Agent executed it.`)])
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
          ? `${source.provider || t('来源未标记')}${source.source ? ` · ${source.source}` : ''} · ${source.match === 'match' ? t('当前内容一致') : source.match === 'mismatch' ? t('当前内容已变化') : t('内容一致性未知')}`
          : '当前来源不可用'
        return h('div', { className: 'st-method-card', key: method.id },
        h('div', { className: 'st-method-row' },
          h('div', { className: 'st-method-icon' }, h(Icon, { name: 'skill', size: 18 })),
          h('div', { className: 'st-method-main' },
            h('div', { className: 'st-method-name' }, raw(method.name)),
            h('div', { className: 'st-method-meta' }, localized(`${method.callCount} 次调用 · ${method.loadedCount}/${method.callCount} 次成功 · Consumer 身份不可区分`, `${method.callCount} call(s) · ${method.loadedCount}/${method.callCount} succeeded · Consumer identity unavailable`))),
          statusBadge(method.status, method.status === 'mixed' ? localized(`${method.loadedCount}/${method.callCount} 次成功`, `${method.loadedCount}/${method.callCount} succeeded`) : undefined)),
        h('div', { className: 'st-evidence-row' }, h('span', null, sourceSummary), observedHash ? h('code', { title: '本次实际返回指令的 SHA-256；不保存正文' }, shortHash(observedHash)) : h('span', null, '未取得指令指纹')),
        h('details', { className: 'st-method-events' },
          h('summary', null, localized(`查看 ${method.callCount} 次加载记录`, `View ${method.callCount} load record(s)`)),
          h('ol', { className: 'st-event-list' }, method.events.map((event) => h('li', { key: event.id },
            h('div', { className: 'st-event-head' }, h('strong', null, eventTitle(event)), statusBadge(event.status)),
            h('p', { className: 'st-event-copy' }, eventOutcome(event)),
            event.evidenceFingerprint?.value ? h('p', { className: 'st-event-boundary' }, localized(`本次指令指纹：${shortHash(event.evidenceFingerprint.value)}；只用于比较内容是否相同。`, `This instruction fingerprint: ${shortHash(event.evidenceFingerprint.value)}; used only to compare content identity.`)) : null,
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
            h('div', { className: 'st-learning-title' }, h('strong', null, raw(card.skillName)), h('span', null, localized(`${card.loadedCount} 次成功加载 · ${card.observedHashes.length ? `指纹 ${card.observedHashes.map(shortHash).join('、')}` : '未取得标准指令指纹'}`, `${card.loadedCount} successful load(s) · ${card.observedHashes.length ? `fingerprint ${card.observedHashes.map(shortHash).join(', ')}` : t('未取得标准指令指纹')}`))),
            h('span', { className: 'st-status', 'data-tone': version.tone }, version.label)),
          h('div', { className: 'st-learning-body' },
            card.versionState === 'changed' ? h('div', { className: 'st-version-warning' }, '当前 Skill 内容与本次观察版本不同。先核对版本，再据此修改。') : null,
            h('div', { className: 'st-learning-block' }, h('h4', null, '这个 Skill 声明的候选步骤'),
              card.steps.length
                ? h('ol', { className: 'st-learning-list' }, card.steps.map((step) => h('li', { key: step.title }, raw(step.title))))
                : h('p', { className: 'st-learning-empty' }, '本次返回指令中没有安全可提取的有序步骤；请人工核对 Skill 说明。')),
            h('div', { className: 'st-learning-block' }, h('h4', null, '依赖线索'),
              h('div', { className: 'st-learning-deps' }, card.dependencies.map((item) => h('span', { className: 'st-learning-dep', 'data-active': item.required === 'candidate' ? 'true' : undefined, key: item.type }, `${t(DEPENDENCIES[item.type] || item.type)} · ${item.required === 'candidate' ? localized('待核对', 'Needs review') : t('未知')}`)))),
            card.note ? h('div', { className: 'st-learning-note' }, card.note.improvementIntent ? '已保存个人理解和改进意图；可在右侧继续编辑或复制清单。' : '已保存个人理解；可在右侧继续编辑或复制清单。') : null,
            h('div', { className: 'st-learning-boundary' }, localized(`证据边界：这些步骤来自 Skill 指令结构，不是本会话已执行步骤。${activeDependencies.length ? '依赖只是关键词线索，仍需人工核对。' : '当前未观察到明确线索，不等于完全无依赖。'}`, `Evidence boundary: these steps come from the Skill instruction structure, not steps executed in this session. ${activeDependencies.length ? 'Dependencies are keyword signals only and still need your review.' : 'No clear signal does not mean there are no dependencies.'}`))))
      })
      const nextStepNodes = nextSteps.map(([title, note], index) => h('div', { className: 'st-continuity-step', key: title },
        h('div', { className: 'st-mini-number' }, index + 1),
        h('strong', null, candidateSteps.length ? raw(title) : title),
        h('p', null, note)))
      return h('article', { className: 'st-receipt', 'aria-label': '本次 Skill 收据' },
        h('header', { className: 'st-receipt-head' }, h('h2', null, '本次 Skill 收据'), h('div', { className: 'st-receipt-meta' }, localized(`${workspaceLabel} · 本地优先 · 已加载不等于有效`, `${workspaceLabel} · Local-first · Loaded does not mean effective`))),
        h('section', { className: 'st-receipt-section' },
          h('h3', { className: 'st-section-title' }, h('span', { className: 'st-section-number' }, '1'), '本次发生了什么'),
          h('div', { className: 'st-activity' }, activityNodes),
          activeStage === null ? null : h('div', { className: 'st-activity-expanded' },
            h('strong', null, localized(`${activity[activeStage][0]} · 具体发生了什么`, `${t(activity[activeStage][0])} · ${t('具体发生了什么')}`)),
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
          ? { ...outputs[0], label: raw(outputs[0].label || outputs[0].relativeRef) }
          : { id: 'output:all', type: 'output', label: localized(`${outputs.length} 个已关联产出`, `${outputs.length} linked output(s)`), status: 'human-confirmed', items: outputs }
      const outputY = 24
      const selectedId = selectedNode?.id
      const nodeButton = (node, className, style, ...children) => h('button', { type: 'button', className: `st-node ${className}`, style, key: node.id, 'aria-current': selectedId === node.id ? 'true' : undefined, onClick: () => onSelectNode(node) }, ...children)
      const statusIcon = (status) => status === 'loaded' ? h('span', { className: 'st-node-status' }, h(Icon, { name: 'check', size: 15 })) : ['failed', 'mixed', 'unresolved', 'outcome-unknown'].includes(status) ? h('span', { className: 'st-node-status', style: { color: status === 'failed' ? 'var(--st-error)' : 'var(--st-warning)' } }, h(Icon, { name: 'alert', size: 15 })) : null
      const hasDependencySignals = dependencies.some((item) => item.required === 'candidate')
      return h('div', { className: 'st-map-wrap' },
        h('div', { className: 'st-map-head' }, h('div', null, h('h2', null, '本次流程地图'), h('p', null, '点击任一节点查看白话说明；节点和连线来自同一份收据，虚线不代表因果。')), h('div', { className: 'st-legend', 'aria-label': '关系图例' }, h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line' }), '事件顺序'), h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line', 'data-kind': 'inferred' }), 'Skill 与加载步骤'), h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line', 'data-kind': 'human' }), '人工关联'), h('span', { className: 'st-legend-item' }, h('i', { className: 'st-legend-line', 'data-kind': 'dependency' }), '依赖候选'))),
        h('div', { className: 'st-map-scroll' }, h('div', { className: 'st-map-canvas', style: { height: canvasHeight } }, h('div', { className: 'st-map-stage' },
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
          ...methods.map((method, index) => nodeButton(method, 'st-node-skill', { left: 30, top: methodY(index), width: 250, height: 72 }, h(Icon, { name: 'skill', size: 20 }), h('span', { style: { minWidth: 0, flex: 1 } }, h('span', { className: 'st-node-title' }, raw(method.name)), h('span', { className: 'st-node-sub' }, localized(`${method.callCount} 次调用 · ${method.loadedCount}/${method.callCount} 成功`, `${method.callCount} call(s) · ${method.loadedCount}/${method.callCount} succeeded`))), statusIcon(method.status))),
          ...steps.map((step, index) => nodeButton(step, 'st-node-step', { left: 390, top: stepY(index), width: 290, height: 72 }, h('span', { className: 'st-node-number' }, step.order), h('span', { style: { minWidth: 0, flex: 1 } }, h('span', { className: 'st-node-title' }, eventLocation(step)), h('span', { className: 'st-node-sub' }, localized(`${step.name} · ${STATUS[step.status]?.label || '结果未知'}`, `${step.name} · ${t(STATUS[step.status]?.label || '结果未知')}`))), statusIcon(step.status))),
          nodeButton(output, 'st-node-output', { left: 750, top: outputY, width: 220, height: 72 }, h(Icon, { name: 'link', size: 18 }), h('span', { style: { minWidth: 0, marginLeft: 8 } }, h('span', { className: 'st-node-title' }, output.label), h('span', { className: 'st-node-sub' }, outputs.length ? '由用户关联到本次会话' : '不会自动归因'))),
          ...dependencies.map((dependency, index) => nodeButton({ ...dependency, label: DEPENDENCIES[dependency.type] || dependency.type }, 'st-node-dependency', { left: 20 + index * 190, top: dependencyY, width: 160, height: 58 }, h('span', { className: 'st-node-title' }, DEPENDENCIES[dependency.type] || dependency.type), h('span', { className: 'st-node-sub' }, dependencyState(dependency))))))),
        h(SessionSummary, { model, className: 'st-map-summary' }))
    }

    function Inspector({ node, model }) {
      const current = node || { id: 'task', type: 'task', label: '当前会话的 Skill 使用情况', status: model.coverage?.status, summary: model.summary }
      const status = current.status || 'unknown'
      const source = current.type === 'skill' ? sourceFor(model, current.name) : null
      const learningCard = current.type === 'skill' ? (current.learningCard || learningCardFor(model, current.name)) : null
      const observations = current.type === 'skill'
        ? [
            localized(`共观测到 ${current.callCount || 0} 次标准 skill 工具调用；事件本身不含 Consumer 身份。`, `${current.callCount || 0} standard skill-tool call(s) were observed; the events do not include Consumer identity.`),
            localized(`${current.loadedCount || 0} 次成功、${current.failedCount || 0} 次失败、${current.outcomeUnknownCount || 0} 次结果未知、${current.notStartedCount || 0} 次未开始、${(current.unresolvedCount || 0) + (current.requestedCount || 0)} 次记录待定。`, `${current.loadedCount || 0} succeeded, ${current.failedCount || 0} failed, ${current.outcomeUnknownCount || 0} unknown, ${current.notStartedCount || 0} not started, and ${(current.unresolvedCount || 0) + (current.requestedCount || 0)} pending.`),
            source?.observedInstructionSha256?.length
              ? localized(`本次指令指纹：${source.observedInstructionSha256.map(shortHash).join('、')}。`, `Instruction fingerprint(s): ${source.observedInstructionSha256.map(shortHash).join(', ')}.`)
              : localized('本次没有可显示的标准指令指纹。', 'No standard instruction fingerprint is available for this session.'),
            localized(`版本状态：${versionStateCopy(learningCard?.versionState).label}。`, `Version status: ${t(versionStateCopy(learningCard?.versionState).label)}.`),
          ]
        : current.type === 'step' ? [eventTitle(current), eventOutcome(current)]
          : current.type === 'output' ? [model.outputs?.length ? localized(`用户已明确关联：${(current.items || [current]).map((item) => item.label || item.relativeRef).join('、')}`, `Linked by you: ${(current.items || [current]).map((item) => item.label || item.relativeRef).join(', ')}`) : localized('当前没有用户明确关联的本地产出。', 'No local output has been linked by you.'), localized('这些引用关联到整次会话，不指向某个加载步骤；系统不会自动建立方法与产出的因果关系。', 'These references belong to the whole session, not to one load step; the system never creates a causal relationship.')]
            : current.type === 'dependency' ? [dependencyState(current), localized('该结果来自本次已返回指令中的关键词信号；不是必要性、可用性或离线能力证明。', 'This result comes from keyword signals in the returned instruction; it is not proof of necessity, availability, or offline capability.')]
              : [localized(`共观测到 ${model.summary?.methodCount || 0} 个 Skill、${model.summary?.eventCount || 0} 次加载。`, `${model.summary?.methodCount || 0} Skill(s) and ${model.summary?.eventCount || 0} load(s) were observed.`), model.coverage?.note || '当前覆盖状态不可用。']
      const events = current.type === 'skill' ? current.events || [] : []
      return h('div', null,
        h('div', { className: 'st-inspector-title' }, h(Icon, { name: current.type === 'skill' ? 'skill' : current.type === 'output' ? 'link' : current.type === 'dependency' ? 'info' : 'map' }), h('h2', null, current.label || current.name || '节点详情')),
        h('div', { className: 'st-inspector-body' },
          h('div', { className: 'st-inspector-block' }, h('h3', null, '当前状态'), statusBadge(status)),
          h('div', { className: 'st-inspector-block' }, h('h3', null, '发生了什么'), h('ul', { className: 'st-inspector-list' }, observations.map((item) => h('li', { key: item }, item)))),
          events.length ? h('div', { className: 'st-inspector-block' }, h('h3', null, localized(`相关加载记录（${events.length}）`, `Related load records (${events.length})`)), h('ul', { className: 'st-inspector-list' }, events.map((event) => h('li', { className: 'st-inspector-event', key: event.id }, h('strong', null, eventTitle(event)), h('span', null, eventOutcome(event)))))) : null,
          learningCard ? h('div', { className: 'st-inspector-block' },
            h('h3', null, '这个 Skill 怎么跑（指令候选）'),
            learningCard.steps.length
              ? h('ol', { className: 'st-inspector-list' }, learningCard.steps.map((step) => h('li', { key: step.title }, step.title)))
              : h('p', null, '没有安全可提取的结构化步骤，请人工核对 Skill 说明。'),
            h('p', { style: { marginTop: 8 } }, localized(`依赖线索：${learningCard.dependencies.filter((item) => item.required === 'candidate').map((item) => DEPENDENCIES[item.type] || item.type).join('、') || '未观察到明确线索'}。`, `Dependency signals: ${learningCard.dependencies.filter((item) => item.required === 'candidate').map((item) => t(DEPENDENCIES[item.type] || item.type)).join(', ') || t('未观察到明确线索')}.`))) : null,
          h('div', { className: 'st-inspector-block' }, h('h3', null, '这能说明什么'), h('p', null, current.type === 'dependency' ? '当前只能说明依赖尚未评估。' : current.type === 'output' ? '只说明用户是否创建了输出引用。' : '只说明系统观察到的 Skill 加载请求及结果。')),
          h('div', { className: 'st-inspector-block' }, h('h3', null, '这不能说明什么'), h('p', null, '不能说明 Agent 为什么选择它、是否遵循了方法，也不能证明它促成了结果。'))))
    }

    function ValidationEditor({ sessionId, skillName, initialResult, hasValidationPlan, onSaved }) {
      const [draft, setDraft] = React.useState({ status: '', observedOutcome: '', nextAction: '' })
      const [currentResult, setCurrentResult] = React.useState(initialResult || null)
      const [busy, setBusy] = React.useState('')
      const [confirmingClear, setConfirmingClear] = React.useState(false)
      const [error, setError] = React.useState('')
      const [saveState, setSaveState] = React.useState('')
      const validationDraftId = draftId('validation', sessionId, skillName)

      React.useEffect(() => {
        const savedValues = {
          status: initialResult?.status || '',
          observedOutcome: initialResult?.observedOutcome || '',
          nextAction: initialResult?.nextAction || '',
        }
        const buffered = readDraft(validationDraftId, initialResult?.updatedAt)
        setDraft(buffered?.values || savedValues)
        setCurrentResult(initialResult || null)
        setError(''); setSaveState(buffered ? '已恢复未保存的本地草稿。' : '')
      }, [sessionId, skillName, initialResult?.updatedAt])

      const validationDirty = draft.status !== (currentResult?.status || '')
        || draft.observedOutcome !== (currentResult?.observedOutcome || '')
        || draft.nextAction !== (currentResult?.nextAction || '')

      function updateDraft(field, value) {
        const next = { ...draft, [field]: value }
        const unchanged = next.status === (currentResult?.status || '') && next.observedOutcome === (currentResult?.observedOutcome || '') && next.nextAction === (currentResult?.nextAction || '')
        setDraft(next)
        if (unchanged) {
          clearDraft(validationDraftId)
          setSaveState(currentResult ? localState(`已保存到本地 · ${formatLocalTime(currentResult.updatedAt)}`, `Saved locally · ${formatLocalTime(currentResult.updatedAt)}`) : '')
        } else {
          const protectedLocally = writeDraft(validationDraftId, next, currentResult?.updatedAt)
          setSaveState(protectedLocally ? '有未保存的修改' : '有未保存的修改；当前无法暂存，切换页面前请先保存。')
        }
      }

      async function persist(values, action) {
        setBusy(action); setError(''); setSaveState('')
        try {
          const body = await api('/validation-result', { method: 'POST', body: JSON.stringify({ sessionId, skillName, ...values }) })
          const saved = body.receipt?.validationResults?.find((item) => item.skillName === skillName) || null
          clearDraft(validationDraftId)
          setCurrentResult(saved)
          setDraft({ status: saved?.status || '', observedOutcome: saved?.observedOutcome || '', nextAction: saved?.nextAction || '' })
          setSaveState(saved ? '验证结果已保存到原会话收据。' : '验证结果已从原会话收据清除。')
          onSaved?.(body)
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      function save(event) {
        event.preventDefault()
        persist(draft, 'save')
      }

      function clear() {
        setConfirmingClear(false)
        persist({ status: 'unassessed', observedOutcome: '', nextAction: '' }, 'clear')
      }

      const currentStatus = VALIDATION_STATUS[currentResult?.status]
      return h('div', { className: 'st-validation-block' },
        h('h3', null, '验证结果回执'),
        h('p', { className: 'st-panel-note' }, hasValidationPlan || currentResult ? '这是你对本次验证的本地记录，不代表 Skill 的普遍质量，也不会用于评分或推荐。' : '先保存“下次如何验证”，完成后再回来记录结果。'),
        currentStatus ? h('div', { className: 'st-validation-summary' }, h('span', { className: 'st-status', 'data-tone': currentStatus.tone }, currentStatus.label), h('span', null, formatLocalTime(currentResult.updatedAt))) : null,
        error ? h('div', { className: 'st-error', role: 'alert' }, error) : null,
        h('form', { className: 'st-validation-form', onSubmit: save },
          h('label', { className: 'st-field-label' }, '结果状态', h('select', { className: 'st-select', value: draft.status, required: true, onChange: (event) => updateDraft('status', event.target.value) },
            h('option', { value: '' }, '选择结果状态'),
            ...Object.entries(VALIDATION_STATUS).map(([value, item]) => h('option', { key: value, value }, item.label)))),
          h('label', { className: 'st-field-label' }, '实际观察', h('textarea', { className: 'st-textarea', maxLength: 500, required: true, value: draft.observedOutcome, onChange: (event) => updateDraft('observedOutcome', event.target.value), placeholder: '例如：按计划复测后，缺失输入被明确拦截。' }), h('span', { className: 'st-field-count' }, `${draft.observedOutcome.length}/500`)),
          h('label', { className: 'st-field-label' }, '下一步动作', h('textarea', { className: 'st-textarea', maxLength: 500, value: draft.nextAction, onChange: (event) => updateDraft('nextAction', event.target.value), placeholder: '例如：补充边界案例后再次验证。' }), h('span', { className: 'st-field-count' }, `${draft.nextAction.length}/500`)),
          h('div', { className: 'st-validation-actions' },
            h('button', { className: 'st-button st-button-primary', type: 'submit', disabled: busy || !draft.status || !draft.observedOutcome.trim() }, busy === 'save' ? '验证结果保存中' : '保存验证结果'),
            currentResult ? h('button', { className: 'st-button', type: 'button', disabled: Boolean(busy), onClick: () => setConfirmingClear(true) }, busy === 'clear' ? '验证结果保存中' : '清除验证结果') : h('span', null)),
          currentResult && confirmingClear ? h('div', { className: 'st-notice', role: 'alert' },
            h('p', { style: { margin: '0 0 8px' } }, '确认清除这条人工验证结果？个人理解和验证计划会保留。'),
            h('div', { className: 'st-validation-actions' },
              h('button', { className: 'st-button', type: 'button', disabled: Boolean(busy), onClick: clear }, '确认清除'),
              h('button', { className: 'st-button', type: 'button', disabled: Boolean(busy), onClick: () => setConfirmingClear(false) }, '取消'))) : null),
        saveState ? h('div', { className: validationDirty ? 'st-review-boundary' : 'st-save-state', role: 'status' }, saveState) : null,
        validationDirty ? h('div', { className: 'st-local-only' }, h(Icon, { name: 'info', size: 14 }), '未保存草稿只暂存在当前 Desktop 运行期间；保存后才会进入本地收据与备份。') : null)
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
      const [learningState, setLearningState] = React.useState('')
      const [pendingLearningSkill, setPendingLearningSkill] = React.useState('')
      const [continuityState, setContinuityState] = React.useState('')
      const [outputState, setOutputState] = React.useState('')
      const [copyState, setCopyState] = React.useState('')
      const [confirmingOutputId, setConfirmingOutputId] = React.useState('')
      const [confirmingDelete, setConfirmingDelete] = React.useState(false)

      const activeLearningCard = learningCards.find((card) => card.skillName === learningSkill) || null
      const savedLearningNote = (receipt.learningNotes || []).find((note) => note.skillName === learningSkill) || null
      const savedValidationResult = (receipt.validationResults || []).find((result) => result.skillName === learningSkill) || null
      const learningDraftId = draftId('learning', receipt.sessionId, learningSkill)
      const outputDraftId = draftId('output', receipt.sessionId)

      React.useEffect(() => {
        const savedValues = {
          understanding: savedLearningNote?.understanding || '',
          improvementIntent: savedLearningNote?.improvementIntent || '',
          validationPlan: savedLearningNote?.validationPlan || '',
        }
        const buffered = readDraft(learningDraftId, savedLearningNote?.updatedAt)
        setLearningDraft(buffered?.values || savedValues)
        setLearningState(buffered ? '已恢复未保存的本地草稿。' : savedLearningNote ? localState(`已保存到本地 · ${formatLocalTime(savedLearningNote.updatedAt)}`, `Saved locally · ${formatLocalTime(savedLearningNote.updatedAt)}`) : '')
        setPendingLearningSkill('')
        setCopyState('')
      }, [learningSkill, savedLearningNote?.updatedAt])

      React.useEffect(() => {
        const buffered = readDraft(outputDraftId, null)
        setRelativeRef(buffered?.values?.relativeRef || '')
        if (buffered?.values?.relativeRef) setOutputState('已恢复未保存的本地草稿。')
      }, [outputDraftId])

      const learningDirty = learningDraft.understanding !== (savedLearningNote?.understanding || '')
        || learningDraft.improvementIntent !== (savedLearningNote?.improvementIntent || '')
        || learningDraft.validationPlan !== (savedLearningNote?.validationPlan || '')

      React.useEffect(() => {
        const next = learningCards.some((card) => card.skillName === selectedFromMap) ? selectedFromMap : learningCards.some((card) => card.skillName === learningSkill) ? learningSkill : learningCards[0]?.skillName || ''
        if (next === learningSkill) return
        if (learningDirty) setPendingLearningSkill(next)
        else setLearningSkill(next)
      }, [selectedFromMap, cardNames, learningDirty])

      function updateLearningDraft(field, value) {
        const next = { ...learningDraft, [field]: value }
        const unchanged = next.understanding === (savedLearningNote?.understanding || '') && next.improvementIntent === (savedLearningNote?.improvementIntent || '') && next.validationPlan === (savedLearningNote?.validationPlan || '')
        setLearningDraft(next)
        if (unchanged) {
          clearDraft(learningDraftId)
          setLearningState(savedLearningNote ? localState(`已保存到本地 · ${formatLocalTime(savedLearningNote.updatedAt)}`, `Saved locally · ${formatLocalTime(savedLearningNote.updatedAt)}`) : '')
        } else {
          const protectedLocally = writeDraft(learningDraftId, next, savedLearningNote?.updatedAt)
          setLearningState(protectedLocally ? '有未保存的修改' : '有未保存的修改；当前无法暂存，切换页面前请先保存。')
        }
      }

      function updateOutputDraft(value) {
        setRelativeRef(value)
        if (!value) {
          clearDraft(outputDraftId)
          setOutputState('')
          return
        }
        const protectedLocally = writeDraft(outputDraftId, { relativeRef: value }, null)
        setOutputState(protectedLocally ? '有未保存的修改' : '有未保存的修改；当前无法暂存，切换页面前请先保存。')
      }

      async function addOutput(event) {
        event.preventDefault(); setBusy('output'); setError(''); setOutputState('')
        try {
          const body = await api('/outputs', { method: 'POST', body: JSON.stringify({ sessionId: receipt.sessionId, relativeRef }) })
          clearDraft(outputDraftId); onUpdate(body); setRelativeRef(''); setOutputState('产出引用已保存到当前收据。')
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function removeOutput(outputId) {
        setBusy('output-remove'); setError(''); setOutputState('')
        try {
          const body = await api('/outputs', { method: 'DELETE', body: JSON.stringify({ sessionId: receipt.sessionId, outputId }) })
          setConfirmingOutputId(''); onUpdate(body); setOutputState('产出引用已从当前收据移除。')
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function deleteReceipt() {
        setConfirmingDelete(false)
        setBusy('delete'); setError('')
        try { await api('/receipt', { method: 'DELETE', body: JSON.stringify({ sessionId: receipt.sessionId }) }); clearSessionDrafts(receipt.sessionId); onDeleted() }
        catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function setContinuity(status) {
        setBusy('continuity'); setError(''); setContinuityState('')
        try {
          const body = await api('/continuity', { method: 'POST', body: JSON.stringify({ sessionId: receipt.sessionId, status }) })
          onUpdate(body)
          setContinuityState('继续方式已保存到当前收据。')
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function saveLearningNote(event) {
        event.preventDefault(); setBusy('learning'); setError(''); setCopyState(''); setLearningState('')
        try {
          const body = await api('/learning-note', { method: 'POST', body: JSON.stringify({ sessionId: receipt.sessionId, skillName: learningSkill, ...learningDraft }) })
          clearDraft(learningDraftId)
          onUpdate(body)
          const saved = body.receipt?.learningNotes?.find((item) => item.skillName === learningSkill)
          setLearningState(localState(`已保存到本地 · ${formatLocalTime(saved?.updatedAt)}`, `Saved locally · ${formatLocalTime(saved?.updatedAt)}`))
        } catch (reason) { setError(reason.message) } finally { setBusy('') }
      }

      async function copyLearningChecklist() {
        if (!activeLearningCard) return
        setBusy('copy'); setError(''); setCopyState('')
        const text = continuationCardText(activeLearningCard, learningDraft, savedValidationResult, receipt.continuity, receipt)
        try {
          await writeClipboard(text)
          setCopyState('继续行动卡已复制；只整理原收据与用户记录。')
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
            learningCards.length > 1 ? h('label', { className: 'st-field-label' }, '当前 Skill', h('select', { className: 'st-select', value: learningSkill, onChange: (event) => learningDirty ? setPendingLearningSkill(event.target.value) : setLearningSkill(event.target.value) }, learningCards.map((card) => h('option', { key: card.skillName, value: card.skillName }, raw(card.skillName))))) : h('div', { className: 'st-notice' }, raw(learningSkill)),
            pendingLearningSkill ? h('div', { className: 'st-notice', role: 'alert' },
              h('p', { style: { margin: '0 0 8px' } }, '当前有未保存的修改。要放弃修改并切换 Skill 吗？'),
              h('div', { className: 'st-validation-actions' },
                h('button', { className: 'st-button', type: 'button', onClick: () => { clearDraft(learningDraftId); setLearningSkill(pendingLearningSkill); setPendingLearningSkill('') } }, '放弃修改并切换'),
                h('button', { className: 'st-button', type: 'button', onClick: () => setPendingLearningSkill('') }, '继续编辑'))) : null,
            h('label', { className: 'st-field-label' }, '我的理解', h('textarea', { className: 'st-textarea', maxLength: 500, value: learningDraft.understanding, onChange: (event) => updateLearningDraft('understanding', event.target.value), placeholder: '例如：它先确认输入，再按步骤执行，最后复核结果。' }), h('span', { className: 'st-field-count' }, `${learningDraft.understanding.length}/500`)),
            h('label', { className: 'st-field-label' }, '我想改进', h('textarea', { className: 'st-textarea', maxLength: 500, value: learningDraft.improvementIntent, onChange: (event) => updateLearningDraft('improvementIntent', event.target.value), placeholder: '例如：补充失败分支和不适用场景。' }), h('span', { className: 'st-field-count' }, `${learningDraft.improvementIntent.length}/500`)),
            h('label', { className: 'st-field-label' }, '下次如何验证', h('textarea', { className: 'st-textarea', maxLength: 500, value: learningDraft.validationPlan, onChange: (event) => updateLearningDraft('validationPlan', event.target.value), placeholder: '例如：用正常输入和缺失输入各跑一次。' }), h('span', { className: 'st-field-count' }, `${learningDraft.validationPlan.length}/500`)),
            h('div', { className: 'st-learning-actions' },
              h('button', { className: 'st-button st-button-primary', type: 'submit', disabled: busy === 'learning' }, busy === 'learning' ? '保存中' : '保存到本地'),
              h('button', { className: 'st-button', type: 'button', disabled: busy === 'copy', onClick: copyLearningChecklist }, h(Icon, { name: 'copy', size: 14 }), busy === 'copy' ? '复制中' : '复制继续行动卡'))),
          learningState ? h('div', { className: learningDirty ? 'st-review-boundary' : 'st-save-state', role: 'status' }, renderLocalState(learningState)) : null,
          learningDirty ? h('div', { className: 'st-local-only' }, h(Icon, { name: 'info', size: 14 }), '未保存草稿只暂存在当前 Desktop 运行期间；保存后才会进入本地收据与备份。') : null,
          copyState ? h('div', { className: 'st-copy-state', role: 'status' }, copyState) : null,
          h('div', { className: 'st-local-only' }, h(Icon, { name: 'info', size: 14 }), '行动卡只包含短指纹、候选步骤、原收据时间和你主动填写的内容；不包含完整 Skill 正文。'),
          h(ValidationEditor, { sessionId: receipt.sessionId, skillName: learningSkill, initialResult: savedValidationResult, hasValidationPlan: Boolean(savedLearningNote?.validationPlan), onSaved: onUpdate })) : null,
        h('section', { className: 'st-panel' },
          h('h2', null, '继续方式判断'),
          h('p', { className: 'st-panel-note' }, '候选步骤由确定性规则提取。请选择你是否能按这张卡继续；这不是对开发者的反馈。'),
          h('div', { className: 'st-continuity-review', role: 'group', 'aria-label': '继续方式人工判断' }, continuityChoices.map(([status, label]) => h('button', { className: 'st-button', type: 'button', key: status, 'aria-pressed': continuity.status === status, disabled: busy === 'continuity', onClick: () => setContinuity(status) }, label))),
          continuity.status !== 'unassessed' ? h('button', { className: 'st-reset-link', type: 'button', disabled: busy === 'continuity', onClick: () => setContinuity('unassessed') }, '恢复为待判断') : null,
          continuityState ? h('div', { className: 'st-save-state', role: 'status' }, continuityState) : null,
          h('div', { className: 'st-local-only' }, h(Icon, { name: 'info', size: 14 }), '仅保存在本机当前收据中，不上传、不计入排行榜。')),
        h('section', { className: 'st-panel' }, h('h2', null, '关联本次产出'), h('p', { className: 'st-panel-note' }, '只保存工作区内的相对引用；系统不会自动建立因果关系，也不会删除真实项目文件。'), h('form', { className: 'st-output-form', onSubmit: addOutput }, h('input', { className: 'st-input', maxLength: 500, value: relativeRef, onChange: (event) => updateOutputDraft(event.target.value), placeholder: '例如 docs/report.md', 'aria-label': '工作区内相对输出引用' }), h('button', { className: 'st-button st-button-primary', type: 'submit', disabled: !relativeRef.trim() || busy === 'output' }, busy === 'output' ? '保存中' : '确认关联')), receipt.outputReferences?.length ? h('ul', { className: 'st-output-list' }, receipt.outputReferences.map((item) => h('li', { key: item.outputId },
          h('div', { className: 'st-output-item' }, h('span', null, raw(item.relativeRef)), h('button', { className: 'st-reset-link', type: 'button', onClick: () => setConfirmingOutputId(item.outputId) }, '移除')),
          confirmingOutputId === item.outputId ? h('div', { className: 'st-notice st-inline-confirm', role: 'alert' }, h('p', null, '只移除这条收据引用，不删除真实项目文件。'), h('div', { className: 'st-validation-actions' }, h('button', { className: 'st-button', type: 'button', disabled: busy === 'output-remove', onClick: () => removeOutput(item.outputId) }, busy === 'output-remove' ? '移除中' : '确认移除引用'), h('button', { className: 'st-button', type: 'button', disabled: busy === 'output-remove', onClick: () => setConfirmingOutputId('') }, '取消'))) : null))) : null,
          outputState ? h('div', { className: relativeRef ? 'st-review-boundary' : 'st-save-state', role: 'status' }, outputState) : null),
        h('section', { className: 'st-panel' }, h('h2', null, '证据边界'), h('div', { className: 'st-notice' }, receipt.coverage?.note || '覆盖状态不可用'), h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } }, h('button', { className: 'st-button', type: 'button', onClick: onRefresh }, h(Icon, { name: 'refresh', size: 14 }), '刷新'), h('button', { className: 'st-button st-button-danger', type: 'button', disabled: busy === 'delete', onClick: () => setConfirmingDelete(true) }, h(Icon, { name: 'trash', size: 14 }), '删除收据')),
          confirmingDelete ? h('div', { className: 'st-notice st-inline-confirm', role: 'alert' },
            h('p', null, '确认删除当前本地收据？个人理解、验证结果和未保存草稿会一并删除，但不会删除 DSH 原始会话。当前会话加载证据之后可能重新建立。'),
            h('div', { className: 'st-validation-actions' },
              h('button', { className: 'st-button st-button-danger', type: 'button', disabled: busy === 'delete', onClick: deleteReceipt }, busy === 'delete' ? '删除中' : '确认删除收据'),
              h('button', { className: 'st-button', type: 'button', disabled: busy === 'delete', onClick: () => setConfirmingDelete(false) }, '取消'))) : null))
    }

    function TraceState({ kind, message, onRetry }) {
      return h('div', { className: kind === 'error' ? 'st-empty-page' : 'st-trace-state', 'data-kind': kind, role: kind === 'error' ? 'alert' : 'status', 'aria-live': 'polite' }, h('div', { className: kind === 'error' ? 'st-empty-page-inner' : 'st-trace-state-line' }, kind === 'error' ? null : h('span', { className: 'st-trace-state-dot', 'aria-hidden': 'true' }), kind === 'error' ? h('p', null, message) : message, kind === 'error' && onRetry ? h('button', { className: 'st-button', type: 'button', style: { marginTop: 14 }, onClick: onRetry }, '重试') : null))
    }

    const CATALOG_FILTERS = [
      ['all', '全部'],
      ['receipt', '有真实收据'],
      ['learning', '有会话理解'],
      ['pending', '待回看'],
      ['validated', '已记录结果'],
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
      if (!Number.isFinite(value)) return localized('时间未知', 'Time unknown')
      try { return new Intl.DateTimeFormat(isEnglish() ? 'en-US' : 'zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) } catch { return localized('时间未知', 'Time unknown') }
    }

    function formatBytes(value) {
      const bytes = Number(value) || 0
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    function backupReason(value) {
      if (value === 'before-clear') return t('清空前安全备份')
      if (value === 'before-delete') return t('删除前安全备份')
      return t('手动创建')
    }

    function catalogSignals(entry) {
      const signals = [entry.currentState === 'discovered'
        ? ['当前可发现', 'brand']
        : entry.currentState === 'discovered-partial' ? ['目录候选', 'warning'] : ['当前未发现', 'warning']]
      if (entry.confirmedReceiptCount) signals.push([localized(`${entry.confirmedReceiptCount} 张真实收据`, `${entry.confirmedReceiptCount} verified receipt(s)`), 'brand'])
      else if (entry.possibleReceiptCount) signals.push([localized(`${entry.possibleReceiptCount} 张可能历史`, `${entry.possibleReceiptCount} possible historical record(s)`), 'warning'])
      else signals.push(['暂未观测', 'muted'])
      if (entry.confirmedLearningCount) signals.push([localized(`${entry.confirmedLearningCount} 条会话理解`, `${entry.confirmedLearningCount} session understanding(s)`), 'brand'])
      else if (entry.possibleLearningCount) signals.push([localized(`${entry.possibleLearningCount} 条可能理解`, `${entry.possibleLearningCount} possible understanding(s)`), 'warning'])
      if (entry.confirmedPendingReviewCount) signals.push([localized(`${entry.confirmedPendingReviewCount} 条待回看`, `${entry.confirmedPendingReviewCount} pending review(s)`), 'warning'])
      else if (entry.possiblePendingReviewCount) signals.push([localized(`${entry.possiblePendingReviewCount} 条可能待回看`, `${entry.possiblePendingReviewCount} possible pending review(s)`), 'warning'])
      if (entry.confirmedValidationCount) signals.push([localized(`${entry.confirmedValidationCount} 条人工验证结果`, `${entry.confirmedValidationCount} human validation result(s)`), 'success'])
      else if (entry.possibleValidationCount) signals.push([localized(`${entry.possibleValidationCount} 条可能验证结果`, `${entry.possibleValidationCount} possible validation result(s)`), 'warning'])
      if (entry.versionState === 'changed') signals.push(['版本变化', 'warning'])
      return signals
    }

    function catalogDescription(entry) {
      if (entry.description) return entry.description
      if (entry.currentState === 'current-not-discovered') return localized(`本地历史 · ${formatLocalTime(entry.latestHistoryAt)} · 来源身份不足，未与同名记录合并。`, `Local history · ${formatLocalTime(entry.latestHistoryAt)} · Source identity is insufficient, so it is not merged with same-name records.`)
      return '该 Skill 没有提供足够清晰的用途说明。'
    }

    function HistoricalContinuationAction({ record }) {
      const [state, setState] = React.useState('')
      const [error, setError] = React.useState('')
      const value = record?.record
      if (!value?.learningCard) return null

      async function copy() {
        setState('copying'); setError('')
        try {
          await writeClipboard(continuationCardText(
            value.learningCard,
            value.note || {},
            value.validationResult,
            value.continuity,
            { createdAt: value.createdAt, receiptId: value.receiptId },
          ))
          setState('copied')
        } catch {
          setState(''); setError('暂时无法写入剪贴板，请检查桌面端剪贴板权限。')
        }
      }

      return h('div', null,
        h('div', { className: 'st-history-card-actions' }, h('button', { className: 'st-button', type: 'button', disabled: state === 'copying', onClick: copy }, h(Icon, { name: 'copy', size: 14 }), state === 'copying' ? '复制中' : '复制继续行动卡')),
        state === 'copied' ? h('div', { className: 'st-copy-state', role: 'status' }, '继续行动卡已复制；只整理原收据与用户记录。') : null,
        error ? h('div', { className: 'st-error', role: 'alert' }, error) : null)
    }

    function HistoryCard({ history, expanded, onOpen, onValidationSaved, purpose = 'receipt' }) {
      const association = associationCopy(history.associationLevel)
      const record = expanded?.body
      const note = record?.record?.note
      const summary = record?.record?.summary
      return h('article', { className: 'st-history-card' },
        h('div', { className: 'st-history-head' },
          h('strong', null, localized(`${formatLocalTime(history.sessionAt ?? history.updatedAt)} · ${history.eventCount} 次请求`, `${formatLocalTime(history.sessionAt ?? history.updatedAt)} · ${history.eventCount} request(s)`)),
          h('span', { className: association.className }, association.label),
          h('button', { className: 'st-history-action', type: 'button', onClick: onOpen, disabled: expanded?.loading }, expanded?.loading ? '读取中' : expanded ? '收起' : purpose === 'learning' ? '查看学习记录' : '查看记录')),
        h('div', { className: 'st-history-meta' }, localized(`${history.loadedCount} 次加载成功 · ${history.failedCount} 次失败 · ${history.unresolvedCount} 次待定${history.learningNotePresent ? ' · 已保存会话理解' : ''}${history.pendingReview ? ' · 待回看' : ''}${history.validationResultPresent ? ' · 已记录人工结果' : ''}`, `${history.loadedCount} successful load(s) · ${history.failedCount} failed · ${history.unresolvedCount} pending${history.learningNotePresent ? ' · session understanding saved' : ''}${history.pendingReview ? ' · pending review' : ''}${history.validationResultPresent ? ' · human result recorded' : ''}`)),
        expanded ? h('div', { className: 'st-history-expanded' },
          expanded.error ? h('div', { className: 'st-error', role: 'alert' }, expanded.error) : null,
          summary ? h('div', { className: 'st-notice' }, localized(`该收据记录 ${summary.methodCount} 个 Skill、${summary.eventCount} 次请求；其中 ${summary.loadedCount} 次加载成功。加载不等于 Agent 后续采用或因此产出结果。`, `This receipt records ${summary.methodCount} Skill(s) and ${summary.eventCount} request(s), including ${summary.loadedCount} successful load(s). Loading does not prove later adoption or an outcome.`)) : null,
          purpose === 'learning' && note ? h('div', { className: 'st-note-fields' },
            note.understanding ? h('div', { className: 'st-note-field' }, h('strong', null, '当时我的理解'), h('p', null, raw(note.understanding))) : null,
            note.improvementIntent ? h('div', { className: 'st-note-field' }, h('strong', null, '当时想改进'), h('p', null, raw(note.improvementIntent))) : null,
            note.validationPlan ? h('div', { className: 'st-note-field' }, h('strong', null, '当时计划验证'), h('p', null, raw(note.validationPlan))) : null) : purpose === 'learning' && !expanded.loading && !expanded.error ? h('div', { className: 'st-notice' }, '这张收据没有保存该 Skill 的个人理解。') : null,
          purpose === 'learning' && record?.record ? h(ValidationEditor, { sessionId: history.sessionId, skillName: history.skillName, initialResult: record.record.validationResult, hasValidationPlan: Boolean(note?.validationPlan), onSaved: onValidationSaved }) : null,
          purpose === 'learning' && record?.record ? h(HistoricalContinuationAction, { record }) : null) : null)
    }

    function CatalogGuide() {
      const steps = [
        ['观察加载请求', '只记录可观测事件'],
        ['形成真实收据', '区分成功、失败与未知'],
        ['用地图看顺序', '同一事实，不推断因果'],
        ['找到对应 Skill', '对照声明、收据与历史'],
        ['写下个人理解', '记录方法与验证计划'],
        ['判断如何延续', '手工、部分或当前受阻'],
        ['回来记录结果', '把复测结果留在原会话'],
      ]
      return h('article', { className: 'st-catalog-guide', 'aria-labelledby': 'st-guide-title' },
        h('header', { className: 'st-guide-header' },
          h('h2', { id: 'st-guide-title' }, '把一次 Skill 使用，变成可回看的学习记录'),
          h('p', { className: 'st-guide-intro' }, 'Skill Trace 不替你选择或评价 Skill。它把加载证据、方法候选和你的理解放在同一条本地学习路径上。')),
        h('ol', { className: 'st-guide-path' }, steps.map(([title, description], index) => h('li', { className: 'st-guide-step', key: title },
          h('span', { className: 'st-guide-number', 'aria-hidden': 'true' }, index + 1),
          h('strong', null, title),
          h('p', null, description)))),
        h('p', { className: 'st-guide-note' }, '从左侧选择带“真实收据”的 Skill 开始。这里只记录可观察证据，不判断是否有效，也不上传或翻译个人内容。'))
    }

    function CatalogDetail({ entry, onBack, onChanged }) {
      const [expanded, setExpanded] = React.useState({})
      React.useEffect(() => setExpanded({}), [entry?.id])
      if (!entry) return h(CatalogGuide)

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
      const timeline = entry.histories.filter((item) => item.learningNotePresent || item.validationResultPresent || item.pendingReview)
      const source = entry.sourceFingerprint ? shortHash(entry.sourceFingerprint) : '来源指纹不可用'
      const definitionHash = entry.definition?.currentInstructionSha256 ? shortHash(entry.definition.currentInstructionSha256) : '未按需取得正文指纹'
      return h('div', { className: 'st-catalog-detail-inner' },
        h('button', { className: 'st-button st-catalog-back', type: 'button', onClick: onBack }, '返回 Skill 列表'),
        h('header', { className: 'st-skill-title' },
          h('h2', null, raw(entry.name)),
          h('p', null, entry.description ? raw(entry.description) : catalogDescription(entry)),
          h('div', { className: 'st-skill-meta' }, ...catalogSignals(entry).map(([label, tone]) => h('span', { className: 'st-signal', 'data-tone': tone, key: label }, label)))),
        h('div', { className: 'st-evidence-stack' },
          h('section', { className: 'st-evidence-section' },
            h('span', { className: 'st-evidence-index' }, '1'), h('h3', null, 'Skill 声明'), h('p', { className: 'st-evidence-kicker' }, '来自当前会话作用域 Registry；说明它自称做什么，不代表本次已经运行。'),
            h('div', { className: 'st-definition-grid' },
              h('div', { className: 'st-definition-cell' }, h('span', null, 'Provider'), h('strong', null, raw(entry.provider || t('未知')))),
              h('div', { className: 'st-definition-cell' }, h('span', null, '安全来源指纹'), h('strong', null, source)),
              h('div', { className: 'st-definition-cell' }, h('span', null, '当前正文指纹'), h('strong', null, definitionHash)),
              h('div', { className: 'st-definition-cell' }, h('span', null, '调用方式'), h('strong', null, entry.invocation ? localized(`${entry.invocation.modelInvocable ? 'Agent 可调用' : 'Agent 不可调用'} · ${entry.invocation.userInvocable ? '用户可调用' : '用户不可调用'}`, `${entry.invocation.modelInvocable ? 'Agent invocable' : 'Agent not invocable'} · ${entry.invocation.userInvocable ? 'User invocable' : 'User not invocable'}`) : '未知')))),
          h('section', { className: 'st-evidence-section' },
            h('span', { className: 'st-evidence-index' }, '2'), h('h3', null, '实际运行记录'), h('p', { className: 'st-evidence-kicker' }, '只有来源身份完整一致的记录才计为真实收据；旧数据与冲突数据保持候选。'),
            exact.length ? h('div', { className: 'st-history-list' }, exact.map((history) => h(HistoryCard, { key: `${history.sessionId}:exact`, history, expanded: expanded[`receipt:${history.sessionId}:${history.skillName}`], onOpen: () => toggleHistory(history, 'receipt') }))) : h('div', { className: 'st-notice' }, '暂未找到来源身份完整一致的真实收据。'),
            candidates.length ? h('div', null, h('p', { className: 'st-boundary-copy' }, '可能相关的历史记录（不计入真实收据）：'), h('div', { className: 'st-history-list' }, candidates.map((history) => h(HistoryCard, { key: `${history.sessionId}:candidate`, history, expanded: expanded[`receipt:${history.sessionId}:${history.skillName}`], onOpen: () => toggleHistory(history, 'receipt') })))) : null),
          h('section', { className: 'st-evidence-section' },
            h('span', { className: 'st-evidence-index' }, '3'), h('h3', null, '学习与验证时间线'), h('p', { className: 'st-evidence-kicker' }, '保留每次会话当时的理解、验证计划与人工结果；不自动合并成当前正确理解。'),
            timeline.length ? h('div', { className: 'st-history-list' }, timeline.map((history) => h(HistoryCard, { key: `${history.sessionId}:timeline`, history, purpose: 'learning', expanded: expanded[`learning:${history.sessionId}:${history.skillName}`], onOpen: () => toggleHistory(history, 'learning'), onValidationSaved: () => onChanged?.() }))) : h('div', { className: 'st-notice' }, '还没有保存过该 Skill 的学习或验证记录。'),
            h('p', { className: 'st-boundary-copy' }, '这些内容只保存在本机收据中，不会传给插件开发者；系统不生成“当前正确理解”，也不自动修改、评分或推荐 Skill。'))))
    }

    function CatalogPage({ sessionId, context, onContextChange, reloadSignal, onMeta, onDataCleared }) {
      const [data, setData] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')
      const [dataBusy, setDataBusy] = React.useState('')
      const [dataState, setDataState] = React.useState('')
      const [dataError, setDataError] = React.useState('')
      const [backupData, setBackupData] = React.useState({ backups: [], backupDirectory: '', warningCount: 0 })
      const [showAllBackups, setShowAllBackups] = React.useState(false)
      const [confirmingRestore, setConfirmingRestore] = React.useState(null)
      const [confirmingClear, setConfirmingClear] = React.useState(false)
      const requestRevision = React.useRef(0)

      const load = React.useCallback(async (skillName = '', entryId = '', searchQuery = '') => {
        const revision = requestRevision.current + 1
        requestRevision.current = revision
        setLoading(true); setError('')
        try {
          const suffix = `${skillName ? `&skillName=${encodeURIComponent(skillName)}${entryId ? `&entryId=${encodeURIComponent(entryId)}` : ''}` : ''}${searchQuery ? `&query=${encodeURIComponent(searchQuery)}` : ''}`
          const body = await api(`/catalog?sessionId=${encodeURIComponent(sessionId)}${suffix}`)
          if (requestRevision.current === revision) {
            setData(body)
            onMeta(body.catalog)
          }
        } catch (reason) {
          if (requestRevision.current === revision) setError(reason.message)
        } finally {
          if (requestRevision.current === revision) setLoading(false)
        }
      }, [sessionId, reloadSignal])

      React.useEffect(() => {
        const timer = window.setTimeout(() => load(context.selectedName, context.selectedId, context.query), context.query ? 160 : 0)
        return () => window.clearTimeout(timer)
      }, [load, context.query])

      const loadBackups = React.useCallback(async () => {
        try {
          const body = await api('/backups')
          setBackupData({ backups: body.backups || [], backupDirectory: body.backupDirectory || '', warningCount: body.warningCount || 0 })
        } catch {
          setDataError('备份列表读取失败，请重试。')
        }
      }, [sessionId])

      React.useEffect(() => { loadBackups() }, [loadBackups])

      const entries = data?.catalog?.entries ?? []
      const query = context.query.trim().toLocaleLowerCase()
      const searchMatches = new Set(data?.catalog?.searchMatchEntryIds ?? [])
      const filtered = entries.filter((entry) => {
        const matchesQuery = !query || searchMatches.has(entry.id)
        if (!matchesQuery) return false
        if (context.filter === 'receipt') return entry.confirmedReceiptCount > 0
        if (context.filter === 'learning') return entry.confirmedLearningCount + entry.possibleLearningCount > 0
        if (context.filter === 'pending') return entry.confirmedPendingReviewCount + entry.possiblePendingReviewCount > 0
        if (context.filter === 'validated') return entry.confirmedValidationCount + entry.possibleValidationCount > 0
        if (context.filter === 'unobserved') return entry.currentState !== 'current-not-discovered' && entry.confirmedReceiptCount + entry.possibleReceiptCount === 0
        if (context.filter === 'historical') return entry.currentState === 'current-not-discovered'
        if (context.filter === 'changed') return entry.versionState === 'changed'
        return true
      })
      const visibleEntries = [...filtered].sort((a, b) => {
        if (context.sort === 'name') return a.name.localeCompare(b.name, isEnglish() ? 'en' : 'zh')
        if (context.sort === 'recent') return (b.latestHistoryAt ?? 0) - (a.latestHistoryAt ?? 0) || a.name.localeCompare(b.name, 'en')
        const priority = (entry) => entry.confirmedPendingReviewCount + entry.possiblePendingReviewCount > 0 ? 0 : entry.versionState === 'changed' ? 1 : entry.confirmedValidationCount + entry.possibleValidationCount > 0 ? 2 : 3
        return priority(a) - priority(b) || (b.latestHistoryAt ?? 0) - (a.latestHistoryAt ?? 0) || a.name.localeCompare(b.name, 'en')
      })
      const reviewSummary = entries.reduce((summary, entry) => ({
        pending: summary.pending + entry.confirmedPendingReviewCount + entry.possiblePendingReviewCount,
        validated: summary.validated + entry.confirmedValidationCount + entry.possibleValidationCount,
        changed: summary.changed + (entry.versionState === 'changed' ? 1 : 0),
      }), { pending: 0, validated: 0, changed: 0 })

      async function select(entry) {
        onContextChange({ ...context, selectedName: entry.name, selectedId: entry.id })
        await load(entry.name, entry.id, context.query)
      }

      async function createBackup() {
        setDataBusy('backup'); setDataState(''); setDataError('')
        try {
          const body = await api('/backups', { method: 'POST' })
          setDataState(localState(`已创建 ${body.backup.filename} · ${body.backup.receiptCount} 张收据 · ${formatBytes(body.backup.size)}`, `Created ${body.backup.filename} · ${body.backup.receiptCount} receipt(s) · ${formatBytes(body.backup.size)}`))
          await loadBackups()
        } catch {
          setDataError('本地备份生成失败，请重试。')
        } finally { setDataBusy('') }
      }

      async function openBackupDirectory() {
        if (!backupData.backupDirectory) {
          setDataError('暂时无法打开备份文件夹。')
          return
        }
        setDataBusy('open'); setDataState(''); setDataError('')
        try {
          await openHostPath(backupData.backupDirectory)
          setDataState('备份文件夹已打开。')
        } catch {
          setDataError('暂时无法打开备份文件夹。')
        } finally { setDataBusy('') }
      }

      async function previewRestore(backup) {
        setDataBusy('preview'); setDataState(''); setDataError('')
        try {
          const body = await api(`/backups/preview?id=${encodeURIComponent(backup.id)}`)
          if (!body.summary?.canRestore) throw new Error('备份包含无效收据')
          setConfirmingRestore({ backup: body.backup, summary: body.summary })
        } catch (reason) {
          setDataError(reason.message || t('恢复未完整完成；刷新后可重试，现有同会话收据不会被覆盖。'))
        } finally { setDataBusy('') }
      }

      async function restoreBackup() {
        const backup = confirmingRestore?.backup
        if (!backup) return
        setDataBusy('restore'); setDataState(''); setDataError('')
        try {
          const body = await api('/backups/restore', { method: 'POST', body: JSON.stringify({ backupId: backup.id }) })
          setConfirmingRestore(null)
          setDataState(localState(`完整恢复 ${body.restored} 张收据，补回 ${body.merged ?? 0} 张收据的缺失个人记录，保留 ${body.skipped} 张现有收据。`, `${body.restored} receipt(s) fully restored; missing personal records added to ${body.merged ?? 0}; ${body.skipped} existing receipt(s) kept.`))
          await load('', '', '')
          await loadBackups()
        } catch {
          setDataError('恢复未完整完成；刷新后可重试，现有同会话收据不会被覆盖。')
        } finally { setDataBusy('') }
      }

      async function clearAllReceipts() {
        setDataBusy('clear'); setDataState(''); setDataError('')
        try {
          const body = await api('/receipts', { method: 'DELETE' })
          clearAllDrafts()
          setConfirmingClear(false)
          setDataState(localState(`已清空 ${body.removedCount} 张本地收据；安全备份 ${body.safetyBackup.filename} 已保留，可从下方恢复。`, `${body.removedCount} local receipt(s) cleared. Safety backup ${body.safetyBackup.filename} is available below for restore.`))
          onContextChange({ ...context, query: '', filter: 'all', sort: 'review', selectedName: '', selectedId: '' })
          onDataCleared?.()
          await load('', '', '')
          await loadBackups()
        } catch {
          setDataError('清理未执行；安全备份或收据清理失败，请重试。')
        } finally { setDataBusy('') }
      }

      if (loading && !data) return h(TraceState, { kind: 'loading', message: '正在读取当前可发现的 Skill 与本地历史…' })
      if (error && !data) return h(TraceState, { kind: 'error', message: '暂时无法读取“我的 Skill”。', onRetry: () => load(context.selectedName, context.selectedId, context.query) })
      const catalog = data.catalog
      const coverageUnknown = catalog.coverage.status === 'coverage-unknown'
      const coverageIncomplete = catalog.coverage.status === 'incomplete'
      const completeEmpty = catalog.coverage.complete && catalog.currentDiscoverableCount === 0 && entries.length === 0
      const listBody = completeEmpty
        ? h('div', { className: 'st-catalog-list-state' }, '当前工作区与 Agent Preset 暂未发现 Skill。')
        : visibleEntries.length ? h('ul', { className: 'st-catalog-list' }, visibleEntries.map((entry) => h('li', { key: entry.id }, h('button', { className: 'st-catalog-item', type: 'button', 'aria-current': context.selectedId === entry.id ? 'true' : undefined, onClick: () => select(entry) },
          h('div', { className: 'st-catalog-item-head' }, h('strong', null, raw(entry.name)), h(Icon, { name: 'chevron', size: 14 })),
          h('div', { className: 'st-catalog-item-copy' }, entry.description ? raw(entry.description) : catalogDescription(entry)),
          h('div', { className: 'st-catalog-signals' }, ...catalogSignals(entry).map(([label, tone]) => h('span', { className: 'st-signal', 'data-tone': tone, key: label }, label))))))) : h('div', { className: 'st-catalog-list-state' }, coverageUnknown && entries.length === 0 ? '当前会话未挂载可读取的 Skill Registry，也没有可显示的本地历史。' : '没有符合当前搜索或筛选条件的 Skill。')
      return h('div', { className: 'st-catalog-page', 'data-selected': context.selectedId ? 'true' : undefined, 'aria-busy': loading },
        h('aside', { className: 'st-catalog-sidebar', 'aria-label': 'Skill 列表' },
          h('div', { className: 'st-catalog-tools' },
            h('div', { className: 'st-catalog-intro-row' },
              h('p', { className: 'st-catalog-count' }, coverageUnknown ? '当前目录无法确认' : coverageIncomplete ? localized(`目录可能不完整 · 已发现 ${catalog.observedCandidateCount} 个候选`, `Catalog may be incomplete · ${catalog.observedCandidateCount} candidate(s) found`) : localized(`当前可发现 ${catalog.currentDiscoverableCount} 个 Skill`, `${catalog.currentDiscoverableCount} Skill(s) currently discoverable`)),
              h('button', { className: 'st-guide-link', type: 'button', 'aria-label': '打开 Skill Trace 使用指南', 'aria-pressed': !context.selectedId, onClick: () => onContextChange({ ...context, selectedName: '', selectedId: '' }) }, '使用指南')),
            h('section', { className: 'st-review-summary', 'aria-label': '回看工作台' },
              h('h2', null, '回看工作台'),
              h('div', { className: 'st-review-metrics' },
                h('button', { className: 'st-review-metric', type: 'button', onClick: () => onContextChange({ ...context, filter: 'pending', selectedName: '', selectedId: '' }) }, h('strong', null, reviewSummary.pending), h('span', null, '待回看记录')),
                h('button', { className: 'st-review-metric', type: 'button', onClick: () => onContextChange({ ...context, filter: 'validated', selectedName: '', selectedId: '' }) }, h('strong', null, reviewSummary.validated), h('span', null, '已记录人工结果')),
                h('button', { className: 'st-review-metric', type: 'button', onClick: () => onContextChange({ ...context, filter: 'changed', selectedName: '', selectedId: '' }) }, h('strong', null, reviewSummary.changed), h('span', null, '版本变化项')))),
            h('div', { className: 'st-search-wrap' }, h(Icon, { name: 'search', size: 15 }), h('input', { className: 'st-input', value: context.query, onChange: (event) => onContextChange({ ...context, query: event.target.value, selectedName: '', selectedId: '' }), placeholder: '搜索 Skill 名称、声明和我的记录', 'aria-label': '搜索 Skill' })),
            h('div', { className: 'st-filter-row', role: 'group', 'aria-label': 'Skill 筛选' }, CATALOG_FILTERS.map(([value, label]) => h('button', { className: 'st-filter', key: value, type: 'button', 'aria-pressed': context.filter === value, onClick: () => onContextChange({ ...context, filter: value, selectedName: '', selectedId: '' }) }, label))),
            h('label', { className: 'st-sort-row' }, h('span', null, '排序方式'), h('select', { className: 'st-select', value: context.sort || 'review', onChange: (event) => onContextChange({ ...context, sort: event.target.value, selectedName: '', selectedId: '' }) },
              h('option', { value: 'review' }, '优先待回看'), h('option', { value: 'recent' }, '最近记录'), h('option', { value: 'name' }, '名称 A–Z'))),
            h('details', { className: 'st-data-tools' }, h('summary', null, '本地数据'),
              h('div', { className: 'st-data-actions' },
                h('button', { className: 'st-button', type: 'button', disabled: Boolean(dataBusy), onClick: createBackup }, h(Icon, { name: 'download', size: 14 }), dataBusy === 'backup' ? '正在创建' : '创建本地备份'),
                backupData.backups.length ? h('button', { className: 'st-button', type: 'button', disabled: Boolean(dataBusy), onClick: openBackupDirectory }, h(Icon, { name: 'list', size: 14 }), dataBusy === 'open' ? '正在打开' : '打开备份文件夹') : null,
                h('button', { className: 'st-button st-button-danger', type: 'button', disabled: Boolean(dataBusy), onClick: () => setConfirmingClear(true) }, h(Icon, { name: 'trash', size: 14 }), '清空本地收据')),
              h('p', { className: 'st-review-boundary' }, localized(`最近备份：${backupData.backups[0] ? `${formatLocalTime(backupData.backups[0].createdAt)} · ${backupData.backups[0].receiptCount} 张收据` : '还没有本地备份。'}`, `Latest backup: ${backupData.backups[0] ? `${formatLocalTime(backupData.backups[0].createdAt)} · ${backupData.backups[0].receiptCount} receipt(s)` : 'No local backups yet.'}`)),
              backupData.backups.length ? h('div', null,
                h('div', { className: 'st-review-boundary' }, '备份历史'),
                h('ul', { className: 'st-backup-list' }, (showAllBackups ? backupData.backups : backupData.backups.slice(0, 3)).map((backup) => h('li', { className: 'st-backup-item', key: backup.id },
                  h('strong', { title: backup.filename }, raw(backup.filename)),
                  h('div', { className: 'st-backup-meta' }, localized(`${backupReason(backup.reason)} · ${formatLocalTime(backup.createdAt)} · ${backup.receiptCount} 张 · ${formatBytes(backup.size)}`, `${backupReason(backup.reason)} · ${formatLocalTime(backup.createdAt)} · ${backup.receiptCount} · ${formatBytes(backup.size)}`)),
                  h('button', { className: 'st-backup-action', type: 'button', disabled: Boolean(dataBusy), onClick: () => previewRestore(backup) }, dataBusy === 'preview' ? '正在检查' : '恢复缺失数据')))),
                backupData.backups.length > 3 ? h('button', { className: 'st-reset-link', type: 'button', onClick: () => setShowAllBackups((value) => !value) }, showAllBackups ? '仅显示最近三份' : '查看全部备份') : null,
                h('p', { className: 'st-review-boundary' }, '备份不会自动删除；如需整理，请先打开备份文件夹核对文件。')) : null,
              backupData.warningCount ? h('div', { className: 'st-catalog-warning', role: 'alert' }, localized(`${backupData.warningCount} 份损坏或不可读的备份已跳过。`, `${backupData.warningCount} corrupt or unreadable backup(s) were skipped.`)) : null,
              confirmingRestore ? h('div', { className: 'st-notice st-inline-confirm', role: 'alert' },
                h('p', null, '确认恢复这份备份中的缺失数据？不存在的收据会完整恢复；活动会话已重建证据时，只补回缺失的个人记录，不覆盖当前内容。'),
                h('p', null, raw(localized(`${confirmingRestore.backup.filename} · ${confirmingRestore.summary.receiptCount} 张收据`, `${confirmingRestore.backup.filename} · ${confirmingRestore.summary.receiptCount} receipt(s)`))),
                h('div', { className: 'st-data-actions' },
                  h('button', { className: 'st-button st-button-primary', type: 'button', disabled: dataBusy === 'restore', onClick: restoreBackup }, dataBusy === 'restore' ? '正在恢复' : '恢复缺失数据'),
                  h('button', { className: 'st-button', type: 'button', disabled: dataBusy === 'restore', onClick: () => setConfirmingRestore(null) }, '取消'))) : null,
              confirmingClear ? h('div', { className: 'st-notice st-inline-confirm', role: 'alert' },
                h('p', null, '确认清空全部本地收据？系统会先创建并验证安全备份；备份失败时不会清空。个人理解和人工验证结果会从当前收据中删除，未保存草稿也会清除，但不会删除 DSH 对话。'),
                h('div', { className: 'st-data-actions' },
                  h('button', { className: 'st-button st-button-danger', type: 'button', disabled: dataBusy === 'clear', onClick: clearAllReceipts }, dataBusy === 'clear' ? '正在清空' : '确认清空全部收据'),
                  h('button', { className: 'st-button', type: 'button', disabled: dataBusy === 'clear', onClick: () => setConfirmingClear(false) }, '取消'))) : null,
              dataState ? h('div', { className: 'st-data-state', role: 'status' }, renderLocalState(dataState)) : null,
              dataError ? h('div', { className: 'st-error', role: 'alert' }, dataError) : null),
            catalog.coverage.warningCount ? h('div', { className: 'st-catalog-warning' }, localized(`${catalog.coverage.warningCount} 份本地收据无法读取，已跳过。`, `${catalog.coverage.warningCount} corrupt or unreadable local receipt(s) were skipped.`)) : null),
          coverageUnknown && entries.length ? h('div', { className: 'st-catalog-list-state' }, '当前会话目录不可确认；以下只显示本地历史条目。') : null,
          listBody),
        h('main', { className: 'st-catalog-detail' }, error ? h('div', { className: 'st-error', role: 'alert' }, error) : null, h(CatalogDetail, { entry: context.selectedId ? catalog.selected : null, onBack: () => onContextChange({ ...context, selectedName: '', selectedId: '' }), onChanged: () => load(context.selectedName, context.selectedId, context.query) })))
    }

    function SessionStatus(props) {
      React.useSyncExternalStore(
        (listener) => localeService.subscribe(listener),
        () => localeService.getSnapshot().revision,
      )
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
      const label = localized(`${summary.methodCount} 个 Skill，${summary.loadedCount} 次加载成功，共 ${summary.eventCount} 次`, `${summary.methodCount} Skill(s), ${summary.loadedCount} successful load(s), ${summary.eventCount} total`)
      return h('span', { className: 'st-session-chip', title: '打开“Skill 追踪”标签查看同一份完整收据', 'aria-label': label }, h(Icon, { name: 'skill', size: 14 }), localized(`${summary.methodCount} 个 Skill · ${summary.loadedCount}/${summary.eventCount} 已加载`, `${summary.methodCount} Skill(s) · ${summary.loadedCount}/${summary.eventCount} loaded`))
    }

    // Runtime graph canvas. The layout arrives already positioned and already
    // bounded, so the client never clusters, never measures, and never decides
    // what a relationship means — it draws what the Host proved and asks the Host
    // why a line exists when the user clicks it.
    const RT_CAPABILITY_COLOR = { skill: '#7c3aed', cli: '#0369a1', tool: '#475569', mcp: '#047857', subagent: '#b45309', mixed: '#64748b', 'turn-range': '#334155', unknown: '#94a3b8' }
    const RT_STATUS_COLOR = { observed: '#047857', partial: '#b45309', candidate: '#b45309', insufficient: '#64748b', unknown: '#94a3b8', unlinked: '#b91c1c' }

    function rtEdgePath(edge) {
      const mid = (edge.x1 + edge.x2) / 2
      return `M ${edge.x1} ${edge.y1} C ${mid} ${edge.y1}, ${mid} ${edge.y2}, ${edge.x2} ${edge.y2}`
    }

    function RuntimeInspector({ data, loading, error, onSelectEdge, onClose }) {
      if (loading) return h('aside', { className: 'st-rt-inspector' }, h('p', { className: 'st-rt-kicker' }, '正在读取依据…'))
      if (error) return h('aside', { className: 'st-rt-inspector' }, h('p', { className: 'st-rt-field' }, error))
      if (!data) return h('aside', { className: 'st-rt-inspector' },
        h('h3', null, '检查器'),
        h('p', { className: 'st-rt-kicker' }, '点一个节点或一条线，看它的依据'),
        h('p', { className: 'st-rt-notes' }, '每条关系都必须能说出：依据什么建立、依据哪条规则、有哪些事件支撑，以及它不表示什么。'))
      if (!data.found) return h('aside', { className: 'st-rt-inspector' },
        h('h3', null, '未找到'),
        h('p', { className: 'st-rt-kicker' }, String(data.nodeId ?? data.edgeId ?? '')),
        h('button', { className: 'st-button', type: 'button', onClick: onClose }, '返回'))

      const isEdge = Boolean(data.edge)
      const relations = Array.isArray(data.relations) ? data.relations : []
      const evidence = Array.isArray(data.evidence) ? data.evidence : []
      return h('aside', { className: 'st-rt-inspector' },
        h('h3', null, isEdge ? `关系 · ${data.edge.type}` : (data.node.label || data.node.id)),
        h('p', { className: 'st-rt-kicker' }, isEdge
          ? localized(`${data.edge.derivation} · ${data.edge.status}`, `${data.edge.derivation} · ${data.edge.status}`)
          : localized(`${data.node.kind}${data.node.outcome ? ` · ${data.node.outcome}` : ''} · 证据 ${data.node.status}`, `${data.node.kind}${data.node.outcome ? ` · ${data.node.outcome}` : ''} · evidence ${data.node.status}`)),

        isEdge ? h('div', { className: 'st-rt-field' }, h('span', null, '两端'), h('strong', null, `${data.edge.from.label} → ${data.edge.to.label}`)) : null,
        data.ruleName ? h('div', { className: 'st-rt-field' }, h('span', null, '具名规则'), h('strong', null, data.ruleName)) : null,
        h('div', { className: 'st-rt-field st-rt-why' }, h('span', null, localized('这条线为什么存在', 'Why this exists')), h('p', null, data.meaning)),
        h('div', { className: 'st-rt-field st-rt-limit' }, h('span', null, localized('它不表示什么', 'What it does not claim')), h('p', null, data.limit)),

        data.node?.collapsed ? h('div', { className: 'st-rt-field' },
          h('span', null, '折叠节点'),
          h('p', null, localized(`它代表 ${data.memberIds.length} 个节点：${data.memberIds.slice(0, 4).map((id) => id.replace(/^invocation:/, '').slice(-8)).join('、')}${data.memberIds.length > 4 ? ' …' : ''}`, `Stands for ${data.memberIds.length} nodes`))) : null,

        relations.length ? h('div', null,
          h('p', { className: 'st-rt-kicker' }, localized(`关系 ${relations.length} 条`, `${relations.length} relation(s)`)),
          ...relations.slice(0, 12).map((relation, index) => h('button', {
            key: `${relation.edgeId}:${index}`,
            className: 'st-rt-rel',
            type: 'button',
            onClick: () => onSelectEdge(relation.edgeId),
          },
          h('span', { className: 'st-rt-rel-top' },
            h('strong', null, relation.type),
            h('em', null, relation.direction === 'in' ? '←' : '→'),
            h('span', null, relation.other.label),
            h('em', null, relation.status)),
          h('p', null, relation.meaning),
          h('p', null, relation.limit)))) : null,

        h('div', { className: 'st-rt-field' },
          h('span', null, localized(`支撑事件 ${evidence.length}${data.evidenceIds?.length > evidence.length ? ` / ${data.evidenceIds.length}` : ''}`, `Evidence ${evidence.length}`)),
          evidence.length
            ? h('ul', { className: 'st-rt-evidence' }, ...evidence.slice(0, 14).map((event) => h('li', { key: event.eventId },
              h('span', null, event.type),
              h('code', null, event.eventId.split(':re:')[1] ?? event.eventId.slice(-10)))))
            : h('p', null, localized('没有可展示的事件', 'No events to show'))),

        h('p', { className: 'st-rt-notes' }, data.evidenceBoundary?.note ?? ''),
        h('button', { className: 'st-button', type: 'button', onClick: onClose }, localized('返回概览', 'Back to overview')))
    }

    function RuntimeView({ data, loading, error, onRetry, inspect, inspectLoading, inspectError, onSelect, onCloseInspect }) {
      if (loading && !data) return h('div', { className: 'st-rt-empty' }, '正在重建运行图谱…')
      if (error && !data) return h('div', { className: 'st-rt-empty' }, error)
      if (!data) return h('div', { className: 'st-rt-empty' }, '当前对话暂未产生可重建的运行证据。')

      const layout = data.layout
      const stats = layout.stats
      const hidden = layout.hidden
      const selectedId = inspect?.edge?.id ?? inspect?.nodeId ?? null

      return h('div', { className: 'st-runtime' },
        h('div', { className: 'st-runtime-canvas' },
          h('svg', {
            viewBox: `0 0 ${layout.width} ${layout.height}`,
            width: Math.max(layout.width, 320),
            height: Math.max(layout.height, 160),
            role: 'img',
            'aria-label': 'Agent 运行图谱',
          },
          h('g', null, ...layout.edges.map((edge) => h('path', {
            key: edge.id,
            className: 'st-rt-edge',
            d: rtEdgePath(edge),
            'data-type': edge.type,
            'data-status': edge.status,
            'data-selected': selectedId && (inspect?.edge?.id === edge.id) ? 'true' : undefined,
            onClick: () => onSelect({ edgeId: edge.id }),
          }, h('title', null, `${edge.type} · ${edge.derivation} · ${edge.status}${edge.rule ? ` · ${edge.rule}` : ''}`)))),
          h('g', null, ...layout.nodes.map((node) => {
            const color = node.kind === 'session' ? '#0f172a'
              : node.kind === 'turn' ? '#334155'
                : node.kind === 'child' ? RT_CAPABILITY_COLOR.subagent
                  : (RT_CAPABILITY_COLOR[node.capabilityId] ?? RT_CAPABILITY_COLOR.unknown)
            const dashed = node.status === 'unlinked' || node.status === 'partial'
            const sub = node.collapsed ? `折叠 ${node.memberCount} 项` : (node.sublabel || '')
            return h('g', {
              key: node.id,
              className: 'st-rt-node',
              'data-selected': selectedId === node.id ? 'true' : undefined,
              onClick: () => onSelect({ nodeId: node.id }),
            },
            h('title', null, `${node.label}${sub ? ` — ${sub}` : ''} · ${node.status}`),
            h('rect', { x: node.x, y: node.y, width: node.width, height: node.height, rx: 6, stroke: color, strokeDasharray: dashed ? '3 2' : undefined }),
            h('rect', { className: 'st-rt-bar', x: node.x, y: node.y, width: 4, height: node.height, rx: 2, fill: color, stroke: 'none' }),
            h('text', { x: node.x + 12, y: node.y + 13 }, node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label),
            sub ? h('text', { className: 'st-rt-sub', x: node.x + 12, y: node.y + 24 }, sub.length > 40 ? `${sub.slice(0, 39)}…` : sub) : null,
            node.kind === 'invocation' ? h('text', { className: 'st-rt-id', x: node.x + node.width - 8, y: node.y + 13 }, String(node.graphNodeId ?? '').slice(-6)) : null)
          }))),
          h('title', null, '')),
        h('div', null,
          h('p', { className: 'st-rt-kicker' },
            localized(
              `${layout.mode === 'grouped' ? '分组' : '完整'}视图 · 渲染 ${stats.renderedNodeCount} 节点 / ${stats.renderedEdgeCount} 边 · 原图 ${stats.graphNodeCount} 节点`,
              `${layout.mode === 'grouped' ? 'Grouped' : 'Full'} · ${stats.renderedNodeCount} nodes / ${stats.renderedEdgeCount} edges · graph has ${stats.graphNodeCount}`,
            )),
          hidden.nodeCount ? h('p', { className: 'st-rt-notes' },
            localized(`有 ${hidden.nodeCount} 个节点与 ${hidden.edgeCount + hidden.collapsedInsideCount} 条关系被折叠或收进分组；折叠节点里列出了它代表的节点，所以依据仍然可查。`,
              `${hidden.nodeCount} nodes and ${hidden.edgeCount + hidden.collapsedInsideCount} relations are folded into groups; a folded node names what it stands for.`)) : null,
          stats.unlinkedNodeCount || data.graph.unlinked.length ? h('p', { className: 'st-rt-notes' },
            localized(`无法确定归属的调用 ${data.graph.unlinked.length} 个，已列入 unlinked，不会挂到最近的节点上。`,
              `${data.graph.unlinked.length} call(s) could not be placed and are reported unlinked.`)) : null,
          h('div', { className: 'st-rough-legend' },
            ...Object.entries(RT_CAPABILITY_COLOR).filter(([key]) => ['skill', 'cli', 'tool', 'mcp', 'subagent'].includes(key)).map(([key, color]) => h('span', { key }, h('i', { style: { background: color } }), key))),
          h('button', { className: 'st-button', type: 'button', onClick: onRetry }, h(Icon, { name: 'refresh', size: 14 }), localized('重新读取', 'Reload'))),
        h(RuntimeInspector, { data: inspect, loading: inspectLoading, error: inspectError, onSelectEdge: (edgeId) => onSelect({ edgeId }), onClose: onCloseInspect }))
    }

    function Workbench(props) {
      React.useSyncExternalStore(
        (listener) => localeService.subscribe(listener),
        () => localeService.getSnapshot().revision,
      )
      const sessionId = props?.sessionId
      const initialView = (() => { try { const stored = localStorage.getItem(VIEW_KEY); return ['map', 'runtime'].includes(stored) ? stored : 'receipt' } catch { return 'receipt' } })()
      const [view, setView] = React.useState(initialView)
      const [screen, setScreen] = React.useState('session')
      const [data, setData] = React.useState(null)
      const [selectedNode, setSelectedNode] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')
      const [runtime, setRuntime] = React.useState(null)
      const [runtimeLoading, setRuntimeLoading] = React.useState(false)
      const [runtimeError, setRuntimeError] = React.useState('')
      const [inspect, setInspect] = React.useState(null)
      const [inspectLoading, setInspectLoading] = React.useState(false)
      const [inspectError, setInspectError] = React.useState('')
      const [catalogContext, setCatalogContext] = React.useState({ query: '', filter: 'all', sort: 'review', selectedName: '', selectedId: '' })
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

      // The runtime graph is fetched on demand: the receipt's own payload never
      // carries it, so opening a conversation stays as cheap as it was.
      const loadRuntime = React.useCallback(async () => {
        if (!sessionId) return
        setRuntimeLoading(true); setRuntimeError('')
        try {
          setRuntime(await api(`/runtime?sessionId=${encodeURIComponent(sessionId)}`))
        } catch (reason) { setRuntimeError(reason.message) } finally { setRuntimeLoading(false) }
      }, [sessionId])

      // "Why does this line exist" is answered by the Host, one node or one edge at
      // a time, so the client never has to hold the whole graph to explain it.
      const selectRuntime = React.useCallback(async (target) => {
        if (!sessionId || !target) return
        setInspectLoading(true); setInspectError('')
        try {
          const query = target.edgeId
            ? `edgeId=${encodeURIComponent(target.edgeId)}`
            : `nodeId=${encodeURIComponent(target.nodeId)}`
          setInspect(await api(`/inspect?sessionId=${encodeURIComponent(sessionId)}&${query}`))
        } catch (reason) { setInspectError(reason.message) } finally { setInspectLoading(false) }
      }, [sessionId])

      React.useEffect(() => {
        setData(null); setSelectedNode(null); setRuntime(null); setInspect(null)
        setCatalogContext({ query: '', filter: 'all', sort: 'review', selectedName: '', selectedId: '' })
        setCatalogMeta(null); preferenceSession.current = null; load()
      }, [load])

      React.useEffect(() => { if (view === 'runtime' && !runtime && !runtimeLoading) loadRuntime() }, [view, runtime, runtimeLoading, loadRuntime])

      function chooseView(next) {
        setScreen('session'); setView(next); setError(''); setInspect(null)
        try { localStorage.setItem(VIEW_KEY, next) } catch (_) {}
        // The stored default view stays receipt/map: the runtime canvas is a local
        // viewing choice, not a change to the plugin's stored preferences.
        if (next === 'runtime') return
        api('/preferences', { method: 'POST', body: JSON.stringify({ defaultView: next }) })
          .then((body) => { setError(''); setData((current) => current ? { ...current, preferences: body.preferences } : current) })
          .catch(() => setError('默认视图已切换，但暂时无法保存到下次启动。'))
      }

      const coverageState = data?.receipt?.coverage?.status === 'verified-standard-contract' ? 'active' : 'unknown'
      const activeModel = data?.views?.[view]
      const hasTrace = Boolean(data?.receipt?.traceEvents?.length)
      // The graph covers every capability, not only Skill loads, so it can have
      // something to show in a conversation that loaded no Skill at all.
      const hasRuntimeEvidence = Boolean(data?.receipt?.runtimeEvents?.length)
      const sessionContent = loading && !data ? h(TraceState, { kind: 'loading', message: '正在读取当前对话的 Skill 使用情况…' })
        : error && !data ? h(TraceState, { kind: 'error', message: '暂时无法读取当前对话的 Skill 使用情况。', onRetry: load })
          : view === 'runtime' && hasRuntimeEvidence ? h(RuntimeView, {
            data: runtime,
            loading: runtimeLoading,
            error: runtimeError,
            onRetry: loadRuntime,
            inspect,
            inspectLoading,
            inspectError,
            onSelect: selectRuntime,
            onCloseInspect: () => setInspect(null),
          })
            : data && !hasTrace ? h(TraceState, { kind: 'empty', message: data.receipt.coverage?.status === 'coverage-unknown' ? '暂时无法确认当前对话是否加载了 Skill。' : '当前对话暂未加载可追踪的 Skill。' })
              : view === 'receipt' ? h(ReceiptView, { model: activeModel, workspaceLabel: data.workspaceLabel }) : h(MapView, { model: activeModel, selectedNode, onSelectNode: setSelectedNode })
      const sessionSubtitle = !data ? '正在读取当前会话…'
        : view === 'runtime' ? (runtime ? localized(`运行图谱 · ${runtime.layout.stats.renderedNodeCount} 节点 / ${runtime.layout.stats.renderedEdgeCount} 边 · 原图 ${runtime.layout.stats.graphNodeCount} 节点`, `Runtime graph · ${runtime.layout.stats.renderedNodeCount} nodes / ${runtime.layout.stats.renderedEdgeCount} edges · graph has ${runtime.layout.stats.graphNodeCount}`) : localized(`${data.workspaceLabel} · 正在重建运行图谱…`, `${data.workspaceLabel} · rebuilding the runtime graph…`))
          : hasTrace ? localized(`${data.workspaceLabel} · ${activeModel.methodCount} 个 Skill 请求 · ${activeModel.eventCount} 次加载`, `${data.workspaceLabel} · ${activeModel.methodCount} Skill request(s) · ${activeModel.eventCount} load(s)`) : data.workspaceLabel
      const catalogSubtitle = !catalogMeta ? '正在读取当前目录…' : catalogMeta.coverage.status === 'coverage-unknown' ? localized('当前目录无法确认 · 仅显示本地历史', 'Catalog cannot be confirmed · Showing local history only') : catalogMeta.coverage.status === 'incomplete' ? localized(`目录可能不完整 · 已发现 ${catalogMeta.observedCandidateCount ?? 0} 个候选`, `Catalog may be incomplete · ${catalogMeta.observedCandidateCount ?? 0} candidate(s) found`) : localized(`当前可发现 ${catalogMeta.currentDiscoverableCount ?? 0} 个 Skill · ${data?.workspaceLabel || '工作区未连接'}`, `${catalogMeta.currentDiscoverableCount ?? 0} Skill(s) currently discoverable · ${data?.workspaceLabel || t('工作区未连接')}`)
      const content = screen === 'catalog'
        ? h(CatalogPage, { sessionId, context: catalogContext, onContextChange: setCatalogContext, reloadSignal: catalogReload, onMeta: setCatalogMeta, onDataCleared: () => { setCatalogReload((value) => value + 1); load() } })
        : h('div', { className: 'st-layout', 'data-simple': (!hasTrace && view !== 'runtime') || view === 'runtime' ? 'true' : undefined }, h('main', { className: 'st-main', 'aria-busy': loading }, error && data ? h('div', { className: 'st-error', role: 'alert' }, error) : null, sessionContent), data && hasTrace && view !== 'runtime' ? h('aside', { className: 'st-aside' }, h(Aside, { data: { ...data, activeView: view }, selectedNode, onRefresh: load, onUpdate: (body) => setData((current) => ({ ...current, receipt: body.receipt, views: body.views })), onDeleted: load })) : null)

      return h('section', { 'data-plugin': 'dsh-skill-trace', 'aria-label': screen === 'catalog' ? 'DSH Skill Trace 我的 Skill' : 'DSH Skill Trace 本次 Skill 使用记录' }, h('div', { className: 'st-shell' },
        h('header', { className: 'st-topbar' },
          h('div', { className: 'st-heading' }, h('div', { className: 'st-heading-line' }, h('span', { className: 'st-live', 'data-state': screen === 'catalog' && catalogMeta?.coverage?.status !== 'complete' ? 'unknown' : coverageState }), h('h1', null, screen === 'catalog' ? '我的 Skill' : '本次 Skill 使用记录')), h('div', { className: 'st-workspace' }, screen === 'catalog' ? catalogSubtitle : sessionSubtitle)),
          h('button', { className: 'st-button st-library-button', type: 'button', 'aria-pressed': screen === 'catalog', onClick: () => setScreen('catalog') }, h(Icon, { name: 'list', size: 15 }), '我的 Skill'),
          hasTrace ? h('span', { className: 'st-toolbar-split', 'aria-hidden': 'true' }) : null,
          hasTrace ? h('span', { className: 'st-toolbar-label' }, '当前会话') : null,
          hasTrace || hasRuntimeEvidence ? h('div', { className: 'st-view-switch', role: 'group', 'aria-label': '当前会话呈现方式' },
            hasTrace ? h('button', { className: 'st-view-button', type: 'button', 'aria-pressed': screen === 'session' && view === 'receipt', onClick: () => chooseView('receipt') }, h(Icon, { name: 'receipt', size: 15 }), 'Skill 收据') : null,
            hasTrace ? h('button', { className: 'st-view-button', type: 'button', 'aria-pressed': screen === 'session' && view === 'map', onClick: () => chooseView('map') }, h(Icon, { name: 'map', size: 15 }), '流程地图') : null,
            hasRuntimeEvidence ? h('button', { className: 'st-view-button', type: 'button', 'aria-pressed': screen === 'session' && view === 'runtime', onClick: () => chooseView('runtime') }, h(Icon, { name: 'graph', size: 15 }), '运行图谱') : null) : null,
          h('button', { className: 'st-icon-button', type: 'button', onClick: screen === 'catalog' ? () => setCatalogReload((value) => value + 1) : load, disabled: screen === 'session' && loading, title: '刷新', 'aria-label': screen === 'catalog' ? '刷新我的 Skill' : '刷新 Skill 追踪' }, h(Icon, { name: 'refresh', size: 15 }))),
        content))
    }

    let localeService
    module.exports.inject = ['slots', 'locale', 'workspaces']
    module.exports.apply = (ctx) => {
      localeService = ctx.locale
      translate = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-skill-trace: locale dictionaries')
      ctx.effect(() => installStyles(), 'dsh-skill-trace: stylesheet')
      ctx.effect(() => installDraftBeforeUnload(), 'dsh-skill-trace: protect unsaved local drafts')
      ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'skill-trace', order: 70, label: () => t('Skill 追踪'), locale: NS }, (props) => h(Workbench, props)))
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'skill-trace-status', order: 75, label: () => t('Skill 追踪状态'), locale: NS }, (props) => h(SessionStatus, props)))
    }
    return module.exports
  },
})
