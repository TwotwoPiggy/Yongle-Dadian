#!/usr/bin/env node

/**
 * 永乐大典 (Yongle Dadian) — 自动化功能运行状态与健康看板
 */

const { getRecentLogs } = require('./yongle-logger.js');

// ─── ANSI 颜色常量 ─────────────────────────────────────────
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

/**
 * 将时间戳转换为人性化的相对时间描述（如 "12秒前"）
 * @param {string} isoString
 * @returns {string}
 */
function formatTimeAgo(isoString) {
  if (!isoString) return '未曾触发';
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (isNaN(diffMs) || diffMs < 0) return '刚才';
  
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

/**
 * 格式化状态标签色彩
 * @param {string} status
 * @returns {string}
 */
function formatStatus(status) {
  switch (status) {
    case 'HIT':
      return `${green}${bold}🎯 匹配命中${reset}`;
    case 'SUCCESS':
      return `${green}${bold}✓ 成功完成${reset}`;
    case 'RUNNING':
      return `${cyan}${bold}🔄 后台运行中${reset}`;
    case 'MISS':
      return `${dim}💬 未触发/放行${reset}`;
    case 'SKIPPED':
      return `${green}🔍 审查完成 (无新Bug)${reset}`;
    case 'ERROR':
      return `${red}${bold}✗ 执行报错${reset}`;
    default:
      return `${dim}⚪ 未开启/未知${reset}`;
  }
}

/**
 * 主绘制函数
 */
function main() {
  const logs = getRecentLogs(200);

  // 找三大功能的最新日志
  const latestMap = {
    'auto-search': null,
    'auto-archive': null,
    'dreamer': null
  };

  for (let i = logs.length - 1; i >= 0; i--) {
    const entry = logs[i];
    if (entry && entry.feature && !latestMap[entry.feature]) {
      latestMap[entry.feature] = entry;
    }
  }

  const features = [
    {
      id: 'auto-search',
      name: '1. 前置静默搜索 (Auto-Search)',
      data: latestMap['auto-search']
    },
    {
      id: 'auto-archive',
      name: '2. 会话停止自动归档 (Auto-Archive)',
      data: latestMap['auto-archive']
    },
    {
      id: 'dreamer',
      name: '3. 梦境守护与整理 (Dreamer)',
      data: latestMap['dreamer']
    }
  ];

  console.log('\n' +
    cyan + '  ╔════════════════════════════════════════════════════════════════════════╗\n' +
    '  ║         永 乐 大 典  ·  自 动 化 功能 运行 状 态 看 板                ║\n' +
    '  ╚════════════════════════════════════════════════════════════════════════╝' + reset + '\n'
  );

  features.forEach((item, index) => {
    const d = item.data;
    const timeAgo = d ? formatTimeAgo(d.timestamp) : `${dim}未曾触发${reset}`;
    const statusText = d ? formatStatus(d.status) : `${dim}无纪录${reset}`;
    const durationText = d && d.duration_ms ? `${d.duration_ms}ms` : '-';
    const detailText = d ? (d.error ? `${red}${d.error}${reset}` : d.details) : `${dim}系统运行正常，等待事件触发${reset}`;

    console.log(`  ${bold}${item.name}${reset}`);
    console.log(`    ▸ 状态/结果 : ${statusText}`);
    console.log(`    ▸ 上次触发 : ${dim}${timeAgo}${reset} ${d ? `(${new Date(d.timestamp).toLocaleString()})` : ''}`);
    console.log(`    ▸ 执行耗时 : ${dim}${durationText}${reset}`);
    console.log(`    ▸ 最新详情 : ${detailText}`);
    if (index < features.length - 1) console.log('  ────────────────────────────────────────────────────────────────────────');
  });

  console.log('\n' + dim + '  提示: 日志保存在 ~/.yongle_knowledge/logs/auto-features.jsonl (满1000条自动归档850条前历史纪录)。' + reset + '\n');
}

main();
