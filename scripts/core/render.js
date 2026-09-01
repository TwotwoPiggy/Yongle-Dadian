/**
 * render.js — 永乐大典核心引擎:Token 优化渲染器与可视化看板
 * 目标:
 *  1. 以最少的 token 输出最多的有效信息,同时保证字节级确定性输出(DeepSeek 前缀缓存友好)。
 *  2. 为 DSH Web UI 及人类命令提供视觉友好的结构化看板(Clean Card & Dashboard)。
 *
 * 设计原则:
 *  - 默认紧凑模式:标题 + 类型 + 单行摘要 + 路径,无冗余装饰
 *  - 摘要有长度上限(默认 140 字符,约 70~140 token)
 *  - 命中数默认 5,可配置
 *  - `detail` 模式才输出完整条目内容(给需要全文的场景)
 *  - 适配 DSH Web UI 与终端，长路径独立成行，避免表格折行碎裂
 */
'use strict';

const LEVEL_ICONS = {
  project: '📦',
  user: '👤',
  global: '🌐',
};

const LEVEL_NAMES = {
  project: '项目级知识库 (project)',
  user: '用户级知识库 (user)',
  global: '全局共享库 (global)',
};

/**
 * 渲染命中列表为紧凑纯文本
 * @param {Array<{id:string, title:string, entryType:string, tags:string[], path:string, snippet:string, score:number}>} hits
 * @param {{maxSnippetChars?:number, withPath?:boolean, withScore?:boolean, withLevel?:boolean}} [opts]
 * @returns {string}
 */
function renderHits(hits, opts = {}) {
  const maxSnippet = opts.maxSnippetChars ?? 140;
  const withPath = opts.withPath !== false;
  const withScore = opts.withScore === true;
  const withLevel = opts.withLevel === true;
  if (!hits || hits.length === 0) return '(yongle: no matching knowledge entries)';
  const lines = [];
  hits.forEach((h, i) => {
    const type = h.entryType && h.entryType !== 'other' ? `[${h.entryType}] ` : '';
    const score = withScore ? ` (${h.score})` : '';
    const level = withLevel && h.level ? ` <${h.level}>` : '';
    lines.push(`${i + 1}. ${type}${h.title}${level}${score}`);
    const snippet = clip(h.snippet || '', maxSnippet);
    if (snippet) lines.push(`   ${snippet}`);
    if (withPath && h.path) lines.push(`   ${h.path}`);
  });
  return lines.join('\n');
}

/**
 * 渲染单条完整条目(detail 模式)
 * @param {{id:string, snippet:string, path:string}} entry
 * @param {{maxChars?:number}} [opts]
 */
function renderEntryDetail(entry, opts = {}) {
  const max = opts.maxChars ?? 4000;
  const body = clip(entry.snippet || '', max);
  return `# ${entry.id}\n\n${body}\n\n(source: ${entry.path || '(unknown)'})`;
}

/**
 * 渲染知识库全景状态看板 (适配 DSH Web UI 与终端，防止长路径表格折行)
 * @param {Array<{level:string, enabled:boolean, root?:string, entries:number, fts:number, drafts?:number}>} allStats
 * @param {{config?:object, cwd?:string}} [options]
 * @returns {string}
 */
function renderStatusDashboard(allStats = [], options = {}) {
  const config = options.config || {};
  const embeddingConfig = config.embedding || {};
  const embeddingStatus = embeddingConfig.enabled === false
    ? '已停用 (仅关键词 FTS 检索)'
    : `${embeddingConfig.provider || 'ollama'} (模型: ${embeddingConfig.model || 'default'})`;

  let totalEntries = 0;
  let totalDrafts = 0;
  for (const s of allStats) {
    if (s.enabled) {
      totalEntries += s.entries || 0;
      totalDrafts += s.drafts || 0;
    }
  }

  const lines = [
    `🏛️ 永乐大典 (Yongle Dadian) · 知识库状态看板 [共 ${totalEntries} 条知识]`,
    '──────────────────────────────────────────────────────────',
  ];

  for (const s of allStats) {
    const icon = LEVEL_ICONS[s.level] || '📁';
    const name = LEVEL_NAMES[s.level] || `${s.level} 级别`;
    if (s.enabled) {
      const draftAlert = s.drafts > 0 ? ` | ⚠️ 待审草稿: ${s.drafts} 篇` : '';
      lines.push(`${icon} ${name}`);
      lines.push(`   • 状态: 🟢 已启用 (${s.entries} 条目 / FTS: ${s.fts}${draftAlert})`);
      lines.push(`   • 路径: ${s.root || '(未识别)'}`);
    } else {
      lines.push(`${icon} ${name}`);
      lines.push(`   • 状态: ⚪ 未配置 (未指定 global_path 存储路径)`);
    }
    lines.push('');
  }

  lines.push('──────────────────────────────────────────────────────────');
  lines.push('⚙️ 引擎配置与待办:');
  lines.push(`   • 向量模型: ${embeddingStatus}`);
  lines.push(`   • 自动复盘: ${config.autoPostmortem ? '🟢 已启用 (工具失败自动提示)' : '⚪ 未开启'}`);
  if (totalDrafts > 0) {
    lines.push(`   • 待审草稿: ⚠️ 发现 ${totalDrafts} 篇待确认草稿 (请运行 /yongle-confirm 归档)`);
  } else {
    lines.push(`   • 待审草稿: 0 篇`);
  }
  lines.push('──────────────────────────────────────────────────────────');

  return lines.join('\n');
}

/**
 * 渲染复盘草稿创建卡片 (清晰对齐，无折行，提供一键复制命令)
 * @param {{level:string, draftPath:string, title?:string, root_cause?:string}} draft
 * @returns {string}
 */
function renderDraftCard(draft) {
  const lines = [
    `📝 Yongle 复盘草稿已生成 [${draft.level}]`,
    '──────────────────────────────────────────────────────────',
    `• 标题: ${draft.title || '(未命名)'}`,
    `• 诱因: ${draft.root_cause || '(未提取)'}`,
    `• 路径: ${draft.draftPath}`,
    '──────────────────────────────────────────────────────────',
    '👉 审核与一键归档指令:',
    `   /yongle-confirm "${draft.draftPath}" --level ${draft.level}`,
    '',
    '*(执行确认后将自动移除 draft 标记、建立 FTS 索引并派发后台向量化)*',
  ];
  return lines.join('\n');
}

/** 裁剪文本(保留语义完整边界:按空格/换行处截断) */
function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  let cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return cut + '…';
}

module.exports = { renderHits, renderEntryDetail, renderStatusDashboard, renderDraftCard, clip };
