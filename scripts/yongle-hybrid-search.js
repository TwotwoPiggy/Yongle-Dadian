const fs = require('fs');
const path = require('path');
const { runSql } = require('./yongle-db.js');
const { queryLanceDB } = require('./yongle-lancedb.js');
const { getEmbedding } = require('./yongle-embed.js');
const { loadMergedConfig } = require('./yongle-config.js');

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

    const vector = await getEmbedding(keyword, embedConfig.provider, embedConfig.model, embedConfig.apiKey, embedConfig.baseUrl);

    if (vector === null) {
      if (process.stdout.isTTY && process.stdout.moveCursor) {
        process.stdout.moveCursor(0, -linesPrinted);
        process.stdout.clearScreenDown();
      }
      printResults(`Keyword Match (Semantic Search Disabled): "${keyword}"`, sqliteResults);
      console.log(`\n\x1b[90m💡 Note: Semantic search is disabled in config.\x1b[0m`);
      return;
    }

    // 3. Query LanceDB
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
