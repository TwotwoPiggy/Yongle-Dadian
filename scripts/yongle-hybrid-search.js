const fs = require('fs');
const path = require('path');
const os = require('os');
const { runSql } = require('./yongle-db.js');
const { getEmbedding } = require('./yongle-embed.js');
const { loadMergedConfig } = require('./yongle-config.js');

/**
 * 获取 Embedding 本地查询缓存文件的绝对路径
 * @returns {string} 缓存文件路径
 */
function getQueryCachePath() {
  return path.join(os.homedir(), '.yongle_knowledge', 'query_cache.json');
}

/**
 * 从本地缓存中查找已经生成的特征向量，防止重复请求 API 产生资费与延迟
 * @param {string} keyword - 检索关键词
 * @param {string} provider - 向量提供商名
 * @param {string} model - 模型名
 * @returns {number[]|null} 命中则返回特征向量数组，否则返回 null
 */
function getCachedEmbedding(keyword, provider, model) {
  const cachePath = getQueryCachePath();
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const key = `${provider}:${model}:${keyword}`;
    return cache[key] || null;
  } catch (e) {
    return null;
  }
}

/**
 * 保存特征向量到本地缓存，并对缓存项执行 FIFO 淘汰限制 (最多 200 项)
 * @param {string} keyword - 检索关键词
 * @param {string} provider - 向量提供商名
 * @param {string} model - 模型名
 * @param {number[]} vector - 获得的向量数组
 * @returns {void}
 */
function saveCachedEmbedding(keyword, provider, model, vector) {
  const cachePath = getQueryCachePath();
  let cache = {};
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {
      cache = {};
    }
  }
  const key = `${provider}:${model}:${keyword}`;
  cache[key] = vector;

  // Evict old entries if cache grows past 200 items
  const keys = Object.keys(cache);
  if (keys.length > 200) {
    delete cache[keys[0]];
  }

  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    // Ignore write failures gracefully
  }
}

/**
 * 格式化输出单条搜索结果，添加彩色样式与前置图标说明 (FTS/语义)
 * @param {any} item - 单个检索数据条目
 * @param {boolean} [isSemantic] - 是否为语义召回
 * @returns {string} 格式化后的控制台打印行
 */
function formatResult(item, isSemantic = false) {
  let tagsStr = '';
  if (item.tags && Array.isArray(item.tags)) tagsStr = item.tags.length ? `[${item.tags.join(', ')}]` : '';
  else if (item.tags && typeof item.tags === 'string') tagsStr = `[${item.tags}]`;

  // Provide a clean snippet, truncated to ~80 chars.
  let rawSnippet = item.content || item.cause_summary || '';
  let snippet = rawSnippet.replace(/\s+/g, ' ').trim();
  if (snippet.length > 80) snippet = snippet.substring(0, 77) + '...';

  const typeIcon = isSemantic ? '🧠' : '🔍';
  return `${typeIcon} \x1b[36m${item.id}\x1b[0m ${tagsStr}\n   \x1b[90mSnippet: ${snippet}\x1b[0m`;
}

/**
 * 打印一组检索结果，返回输出所占用的终端行数，以支持流式动态覆写 UI
 * @param {string} title - 结果段落标题
 * @param {any[]} results - 待打印条目数组
 * @returns {number} 打印在控制台上的行数
 */
function printResults(title, results) {
  console.log(`\n\x1b[1m=== ${title} ===\x1b[0m`);
  if (results.length === 0) {
    console.log("   \x1b[90mNo results found.\x1b[0m");
    return 2; // Lines printed
  }

  let lines = 1;
  results.forEach(r => {
    console.log(formatResult(r, r._isSemantic));
    lines += 2;
  });
  return lines;
}

/**
 * 混合检索脚本主入口：提取 SQLite 纯文本匹配，并行提取 Query 语义特征向量，在 LanceDB 检索后执行 RRF 混合重排并动态渲染
 * @returns {Promise<void>}
 */
async function main() {
  const scope = process.argv[2] || 'global';
  const rawArgs = process.argv.slice(3).join(' ');
  const semanticOnly = rawArgs.includes('--semantic-only');
  const keyword = rawArgs.replace('--semantic-only', '').replace(/\s+/g, ' ').trim();

  if (!keyword) {
    console.error("Usage: node yongle-hybrid-search.js <scope> <keyword> [--semantic-only]");
    process.exit(1);
  }

  let sqliteResults = [];
  if (!semanticOnly) {
    // 1. SQLite FTS (using LIKE as fallback since no FTS5 table setup exists)
    const safeKw = keyword.replace(/'/g, "''");
    const sql = `
      SELECT id, cause_summary, tags, filepath 
      FROM entries 
      WHERE id LIKE '%${safeKw}%' OR cause_summary LIKE '%${safeKw}%' OR tags LIKE '%${safeKw}%'
      LIMIT 10;
    `;
    
    const sqliteRaw = runSql(sql);
    sqliteResults = sqliteRaw.split('\n').filter(l => l.trim().length > 0).map(line => {
      const parts = line.split('|');
      return {
        id: parts[0],
        cause_summary: parts[1],
        tags: parts[2] ? parts[2].split(',') : [],
        filepath: parts[3],
        _source: 'sqlite'
      };
    });
  }

  // Print FTS results immediately (only if FTS was run)
  let linesPrinted = 0;
  if (!semanticOnly) {
    linesPrinted = printResults(`Initial Keyword Match: "${keyword}"`, sqliteResults);
  }
  
  // Print loading spinner
  console.log(`\n\x1b[90m⏳ Searching semantic space...\x1b[0m`);
  linesPrinted += 2;

  try {
    // 2. Fetch Embedding
    const config = loadMergedConfig();
    const embedConfig = config.embedding || { provider: 'ollama', model: 'nomic-embed-text' };

    let vector = null;
    const isEmbeddingEnabled = !(config.embedding && config.embedding.enabled === false);

    if (isEmbeddingEnabled) {
      vector = getCachedEmbedding(keyword, embedConfig.provider, embedConfig.model);
      if (!vector) {
        vector = await getEmbedding(keyword, embedConfig.provider, embedConfig.model, embedConfig.apiKey, embedConfig.baseUrl);
        if (vector) {
          saveCachedEmbedding(keyword, embedConfig.provider, embedConfig.model, vector);
        }
      }
    }

    if (vector === null) {
      if (process.stdout.isTTY && process.stdout.moveCursor) {
        process.stdout.moveCursor(0, -linesPrinted);
        process.stdout.clearScreenDown();
      }
      printResults(`Keyword Match (Semantic Search Disabled): "${keyword}"`, sqliteResults);
      console.log(`\n\x1b[90m💡 Note: Semantic search is disabled in config.\x1b[0m`);
      return;
    }

    // 3. Query LanceDB (Lazy Loaded)
    const { queryLanceDB } = require('./yongle-lancedb.js');
    const vectorResults = await queryLanceDB(scope, JSON.stringify(vector), "10");

    // 4. Merge via RRF with 1.5x FTS Boost
    const map = new Map();
    
    // Process SQLite Results
    sqliteResults.forEach((r, idx) => {
      const rank = idx + 1;
      const score = 1.5 * (1 / (60 + rank));
      r._isSemantic = false;
      r.totalScore = score;
      map.set(r.id, r);
    });

    // Process Vector Results
    if (vectorResults) {
      vectorResults.forEach((r, idx) => {
        const rank = idx + 1;
        const score = 1 / (60 + rank);
        
        if (map.has(r.id)) {
          const existing = map.get(r.id);
          existing.totalScore += score;
          // Prefer vector snippet if it exists because it's the exact chunk
          if (r.content) existing.content = r.content;
        } else {
          r._isSemantic = true;
          r.totalScore = score;
          map.set(r.id, r);
        }
      });
    }

    // Sort combined
    const combined = Array.from(map.values()).sort((a, b) => b.totalScore - a.totalScore);
    const topCombined = combined.slice(0, 10);

    // Clear terminal (Streaming UI update) — only when TTY supports it
    if (process.stdout.isTTY && process.stdout.moveCursor) {
      process.stdout.moveCursor(0, -linesPrinted);
      process.stdout.clearScreenDown();
    }

    // Print Final Results
    printResults(`Hybrid Search Results: "${keyword}"`, topCombined);

  } catch (err) {
    // Clear terminal and show error
    if (process.stdout.isTTY && process.stdout.moveCursor) {
      process.stdout.moveCursor(0, -linesPrinted);
      process.stdout.clearScreenDown();
    }
    printResults(`Initial Keyword Match (Semantic Search Failed): "${keyword}"`, sqliteResults);
    console.log(`\n\x1b[31mSemantic Error: ${err.message}\x1b[0m`);
  }
}

main().catch(console.error);
