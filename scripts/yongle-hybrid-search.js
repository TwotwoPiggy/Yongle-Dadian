/**
 * 混合检索 CLI — 基于进程内核心引擎(scripts/core),支持三级知识库
 * 用法: node scripts/yongle-hybrid-search.js <level> <keyword> [--semantic-only] [--limit N]
 *   level: project(项目级) | user(用户级) | global(全局级) | auto(多级合并)
 *   兼容旧值: local → project;旧 global → user
 */
'use strict';

const yongle = require('./core/index.js');

function formatResult(item) {
  let tagsStr = '';
  if (Array.isArray(item.tags) && item.tags.length) tagsStr = `[${item.tags.join(', ')}]`;
  const icon = item.source === 'semantic' ? '🧠' : '🔍';
  const lv = item.level ? ` \x1b[33m(${item.level})\x1b[0m` : '';
  return `${icon} \x1b[36m${item.title}\x1b[0m${lv} ${tagsStr}\n   \x1b[90m${item.snippet}\x1b[0m`;
}

function printResults(title, results) {
  console.log(`\n\x1b[1m=== ${title} ===\x1b[0m`);
  if (!results || results.length === 0) {
    console.log('   \x1b[90mNo results found.\x1b[0m');
    return;
  }
  results.forEach((r) => console.log(formatResult(r)));
}

async function main() {
  const levelArg = (process.argv[2] || 'auto').toLowerCase();
  const rawArgs = process.argv.slice(3).join(' ');
  const semanticOnly = rawArgs.includes('--semantic-only');
  const limitMatch = rawArgs.match(/--limit\s+(\d+)/);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : 5;
  const keyword = rawArgs
    .replace('--semantic-only', '')
    .replace(/--limit\s+\d+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!keyword) {
    console.error('Usage: node yongle-hybrid-search.js <project|user|global|auto> <keyword> [--semantic-only] [--limit N]');
    process.exit(1);
  }

  const started = Date.now();
  const opts = { limit, semanticOnly };
  if (levelArg === 'auto') {
    const result = await yongle.searchAll(keyword, opts);
    printResults(`Merged Search (${Object.keys(result.modes).join('+')}): "${keyword}"`, result.hits);
    const t = result.timings || {};
    console.log(`\n\x1b[90m⏱ ${Date.now() - started}ms total | modes ${JSON.stringify(result.modes)}\x1b[0m`);
    return;
  }
  // 旧习惯兼容:位置参数 'global'(旧=家目录)在团队库未配置时回退 user
  let target = levelArg;
  if (levelArg === 'global' && !yongle.paths.globalHome()) {
    target = 'user';
    console.log('\x1b[90mℹ️  global(团队共享库)未配置,回退 user(用户级)检索。\x1b[0m');
  }
  const result = await yongle.hybridSearch(keyword, { ...opts, level: target });
  if (result.mode === 'hybrid') {
    printResults(`Hybrid Search Results: "${keyword}"`, result.hits);
  } else {
    printResults(`Keyword Match (${result.cache === 'result' ? 'Cached, ' : ''}Semantic Unavailable): "${keyword}"`, result.hits);
    console.log('\n\x1b[90m💡 Note: Semantic search is disabled or unavailable (fts-only mode).\x1b[0m');
  }
  const t = result.timings || {};
  console.log(`\n\x1b[90m⏱ ${Date.now() - started}ms total` +
    (t.ftsMs !== undefined ? ` | fts ${t.ftsMs}ms` : '') +
    (t.embedMs !== undefined ? ` | embed ${t.embedMs}ms` : '') +
    (t.vectorMs !== undefined ? ` | vector ${t.vectorMs}ms` : '') +
    (result.cache === 'result' ? ' | result-cache hit' : '') +
    ` | mode ${result.mode} | level ${result.hits[0]?.level || levelArg}\x1b[0m`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
