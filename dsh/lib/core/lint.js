/**
 * lint.js — 永乐大典核心引擎:健康巡检与自愈系统
 * 吸收 LLM Wiki 闭环体检哲学:
 *  - Layer 1: 确定性结构检查(Frontmatter 格式、孤儿条目、幽灵记录、[[wikilinks]] 死链、滞留草稿)
 *  - Layer 2: 语义冗余审计(--deep: 相似度过高未关联条目、废弃但未指定替代方案条目)
 *  - autoFix: 自动化自愈修复(补齐缺失元数据、清理幽灵、重新挂载孤儿)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const db = require('./db');
const lance = require('./lance');
const search = require('./search');
const { loadMergedConfig } = require('../yongle-config.js');

/**
 * 辅助函数:安全更新 Markdown 文件的 Frontmatter 键值对
 */
function updateFrontmatter(content, fields) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    // 若原文件完全无 frontmatter，补齐围栏
    const fmLines = Object.entries(fields).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map((item) => `  - ${item}`).join('\n')}`;
      return `${k}: "${String(v).replace(/"/g, '\\"')}"`;
    });
    return `---\n${fmLines.join('\n')}\n---\n\n${content.trim()}\n`;
  }

  const fmLines = m[1].split(/\r?\n/);
  const body = m[2] || '';
  const remainingKeys = new Set(Object.keys(fields));
  const newFmLines = [];

  for (const line of fmLines) {
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (kv && kv[1] in fields) {
      const val = fields[kv[1]];
      remainingKeys.delete(kv[1]);
      if (val !== undefined && val !== null && val !== '') {
        if (typeof val === 'boolean' || typeof val === 'number') {
          newFmLines.push(`${kv[1]}: ${val}`);
        } else if (Array.isArray(val)) {
          newFmLines.push(`${kv[1]}:\n${val.map((v) => `  - ${v}`).join('\n')}`);
        } else {
          newFmLines.push(`${kv[1]}: "${String(val).replace(/"/g, '\\"')}"`);
        }
      }
    } else {
      newFmLines.push(line);
    }
  }

  for (const k of remainingKeys) {
    const val = fields[k];
    if (val !== undefined && val !== null && val !== '') {
      if (typeof val === 'boolean' || typeof val === 'number') {
        newFmLines.push(`${k}: ${val}`);
      } else if (Array.isArray(val)) {
        newFmLines.push(`${k}:\n${val.map((v) => `  - ${v}`).join('\n')}`);
      } else {
        newFmLines.push(`${k}: "${String(val).replace(/"/g, '\\"')}"`);
      }
    }
  }

  return `---\n${newFmLines.filter(Boolean).join('\n')}\n---\n\n${body.replace(/^\r?\n+/, '')}`;
}

/**
 * 提取正文中的关联链接目标 (包括 [[wikilinks]] 和 markdown 链接)
 * @param {string} body
 * @returns {string[]}
 */
function extractLinks(body) {
  const links = new Set();
  if (!body) return [];

  // 1) 匹配 [[KI-xxxx]] 或 [[KI-xxxx: 描述]]
  const wikiRegex = /\[\[([A-Za-z0-9_\-\.\u4e00-\u9fa5]+)(?::[^\]]+)?\]\]/g;
  let match;
  while ((match = wikiRegex.exec(body)) !== null) {
    links.add(match[1].trim());
  }

  // 2) 匹配 [text](./xxxx.md) 或 [text](xxxx.md)
  const mdLinkRegex = /\[[^\]]*\]\((?:\.\/)?([^)]+?)\.md\)/g;
  while ((match = mdLinkRegex.exec(body)) !== null) {
    links.add(path.basename(match[1].trim()));
  }

  return Array.from(links);
}

/**
 * Layer 1: 确定性结构检查 (Fast Rule-based)
 * @param {{level?:string, cwd?:string, config?:object}} [options]
 * @returns {{level:string, issues:Array<object>, stats:object}}
 */
function lintStructure(options = {}) {
  const cfg = options.config || loadMergedConfig();
  const cwd = options.cwd || null;
  const targetLevel = paths.normalizeLevel(options.level || 'user');
  const p = paths.resolveLevel(targetLevel, cwd, cfg);

  if (!p.enabled) {
    return { level: targetLevel, issues: [], stats: { scannedFiles: 0, dbEntries: 0, errorCount: 0, warnCount: 0, infoCount: 0 } };
  }

  db.open(p.db);
  const dbRows = db.get().prepare('SELECT id, filepath, status, superseded_by, supersedes FROM entries').all();
  const dbEntryMap = new Map(dbRows.map((r) => [r.id, r]));
  const seenFilepaths = new Set();

  const issues = [];
  const dirs = [p.memoryDir, p.root].filter((d, idx, arr) => d && fs.existsSync(d) && arr.indexOf(d) === idx);

  let scannedFiles = 0;

  // 1. 扫描物理 Markdown 文件
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      if (f === 'INDEX.md') continue;
      const fp = path.resolve(path.join(dir, f));
      if (seenFilepaths.has(fp)) continue;
      seenFilepaths.add(fp);
      scannedFiles++;

      let content;
      try {
        content = fs.readFileSync(fp, 'utf8');
      } catch (err) {
        issues.push({
          type: 'unreadable_file',
          severity: 'error',
          filepath: fp,
          message: `无法读取文件: ${err.message}`,
        });
        continue;
      }

      // 检查 A: Frontmatter 损坏或缺失
      const fmM = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!fmM) {
        issues.push({
          type: 'frontmatter_corrupt',
          severity: 'error',
          filepath: fp,
          id: path.basename(fp, '.md'),
          message: '缺少标准的 YAML Frontmatter 围栏 (---)',
        });
        continue;
      }

      const { meta, body } = db.parseFrontmatter(content);
      const id = String(meta.id || path.basename(fp, '.md'));

      // 检查 B: 核心字段缺失
      const missing = [];
      if (!meta.id) missing.push('id');
      if (!meta.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.date))) missing.push('date (需为 YYYY-MM-DD)');
      if (!meta.resolution_type && !meta.type) missing.push('resolution_type');
      if (!meta.cause_summary && !body.trim()) missing.push('cause_summary');
      if (!meta.tags || (Array.isArray(meta.tags) && meta.tags.length === 0)) missing.push('tags');

      if (missing.length > 0) {
        issues.push({
          type: 'missing_fields',
          severity: 'warning',
          filepath: fp,
          id,
          missingFields: missing,
          message: `缺少核心 Frontmatter 字段: ${missing.join(', ')}`,
        });
      }

      // 检查 C: 未入索引的孤儿条目 (未标记 draft: true 却未入 entries 表)
      if (!meta.draft && !dbEntryMap.has(id)) {
        issues.push({
          type: 'orphan_entry',
          severity: 'warning',
          filepath: fp,
          id,
          message: `条目未在 SQLite 索引表中挂载: ${id}`,
        });
      }

      // 检查 D: 死链检测
      const outgoingLinks = extractLinks(body);
      for (const linkTarget of outgoingLinks) {
        if (!dbEntryMap.has(linkTarget)) {
          const directTarget = path.join(p.memoryDir, `${linkTarget}.md`);
          if (!fs.existsSync(directTarget)) {
            issues.push({
              type: 'broken_link',
              severity: 'warning',
              filepath: fp,
              sourceId: id,
              target: linkTarget,
              message: `正文引用了不存在的条目: [[${linkTarget}]]`,
            });
          }
        }
      }
    }
  }

  // 2. 检查 SQLite 中的幽灵记录 (数据库有但磁盘文件已失踪)
  for (const row of dbRows) {
    if (!row.filepath || !fs.existsSync(row.filepath)) {
      issues.push({
        type: 'ghost_record',
        severity: 'error',
        id: row.id,
        filepath: row.filepath || '',
        message: `数据库记录对应的物理文件已丢失: ${row.id}`,
      });
    }
  }

  // 3. 检查滞留草稿 (超过 14 天未处理)
  const draftDir = path.join(p.root, 'drafts');
  if (fs.existsSync(draftDir)) {
    const now = Date.now();
    for (const f of fs.readdirSync(draftDir)) {
      if (!f.endsWith('.md')) continue;
      const dfp = path.join(draftDir, f);
      try {
        const st = fs.statSync(dfp);
        const ageDays = Math.floor((now - st.mtimeMs) / (24 * 3600 * 1000));
        if (ageDays >= 14) {
          issues.push({
            type: 'stale_draft',
            severity: 'info',
            filepath: dfp,
            id: path.basename(f, '.md'),
            ageDays,
            message: `滞留草稿已存放 ${ageDays} 天未确认归档: ${f}`,
          });
        }
      } catch { /* ignore */ }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    level: targetLevel,
    issues,
    stats: {
      scannedFiles,
      dbEntries: dbRows.length,
      errorCount,
      warnCount,
      infoCount,
    },
  };
}

/**
 * Layer 2: 语义矛盾与冗余审计 (Semantic Audit)
 * @param {{level?:string, cwd?:string, config?:object}} [options]
 * @returns {Promise<{level:string, issues:Array<object>, stats:object}>}
 */
async function lintSemantic(options = {}) {
  const cfg = options.config || loadMergedConfig();
  const cwd = options.cwd || null;
  const targetLevel = paths.normalizeLevel(options.level || 'user');
  const p = paths.resolveLevel(targetLevel, cwd, cfg);

  if (!p.enabled) {
    return { level: targetLevel, issues: [], stats: { totalAudited: 0, deprecatedCount: 0, duplicateSuspects: 0 } };
  }

  db.open(p.db);
  const rows = db.get().prepare('SELECT id, cause_summary, tags, filepath, status, superseded_by, supersedes FROM entries').all();
  const issues = [];

  let deprecatedCount = 0;

  // 1. 废弃条目审计 (未指定替代方案)
  for (const r of rows) {
    if (r.status === 'deprecated') {
      deprecatedCount++;
      if (!r.superseded_by || !r.superseded_by.trim()) {
        issues.push({
          type: 'deprecated_without_replacement',
          severity: 'warning',
          id: r.id,
          filepath: r.filepath,
          message: `条目已标记为废弃(deprecated)，但未记录替代方案(superseded_by)`,
        });
      }
    }
  }

  // 2. 向量相似度矩阵审计: 扫描距离过近但未建立关联的潜在重复条目
  let duplicateSuspects = 0;
  const embeddingEnabled = !(cfg.embedding && cfg.embedding.enabled === false);

  if (embeddingEnabled && rows.length > 1) {
    try {
      // 遍历条目，对每一条通过 queryVectors 检查前 3 个最邻近
      const checkedPairs = new Set();
      for (const r of rows) {
        if (!r.cause_summary) continue;
        const embedConfig = cfg.embedding || { provider: 'ollama', model: 'nomic-embed-text' };
        const vector = await embed.getEmbeddingCached(r.cause_summary, embedConfig);
        if (!vector) continue;

        const neighbors = await lance.queryVectors(targetLevel, vector, 4, cwd);
        for (const n of neighbors) {
          const neighborId = String(n.id || '').replace(/_chunk_\d+$/, '').replace(/^"+|"+$/g, '');
          if (!neighborId || neighborId === r.id) continue;

          const pairKey = [r.id, neighborId].sort().join('<->');
          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);

          // 距离极小(相似度极高)且未建立 supersedes 关联
          const dist = n._distance !== undefined ? n._distance : 1.0;
          if (dist <= 0.18) { // 强相似度
            const other = rows.find((x) => x.id === neighborId);
            const isLinked = r.supersedes === neighborId || r.superseded_by === neighborId ||
              (other && (other.supersedes === r.id || other.superseded_by === r.id));

            if (!isLinked) {
              duplicateSuspects++;
              issues.push({
                type: 'potential_duplicate',
                severity: 'info',
                pair: [r.id, neighborId],
                distance: Number(dist.toFixed(4)),
                message: `条目 [${r.id}] 与 [${neighborId}] 语义高度相似 (距离: ${dist.toFixed(3)})，疑似重复或存在演进冲突`,
              });
            }
          }
        }
      }
    } catch {
      // 向量库不可用时静默跳过语义矩阵比对
    }
  }

  return {
    level: targetLevel,
    issues,
    stats: {
      totalAudited: rows.length,
      deprecatedCount,
      duplicateSuspects,
    },
  };
}

/**
 * 执行自愈修复 (--fix)
 * @param {Array<object>} issues 巡检发现的问题列表
 * @param {{level?:string, cwd?:string, config?:object}} [options]
 * @returns {{fixedCount:number, actions:Array<object>}}
 */
function autoFix(issues, options = {}) {
  const cfg = options.config || loadMergedConfig();
  const cwd = options.cwd || null;
  const targetLevel = paths.normalizeLevel(options.level || 'user');
  const p = paths.resolveLevel(targetLevel, cwd, cfg);

  db.open(p.db);
  const actions = [];
  let fixedCount = 0;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  let shouldReindex = false;

  for (const iss of issues) {
    // 修复 1: 幽灵记录 (清理数据库中不存在的文件记录)
    if (iss.type === 'ghost_record' && iss.id) {
      db.removeEntry(iss.id);
      actions.push({ action: 'remove_ghost', id: iss.id, message: `已清理数据库幽灵记录: ${iss.id}` });
      fixedCount++;
    }

    // 修复 2: 缺失 Frontmatter 围栏 (补齐最基础的合法 frontmatter)
    if (iss.type === 'frontmatter_corrupt' && iss.filepath && fs.existsSync(iss.filepath)) {
      try {
        const raw = fs.readFileSync(iss.filepath, 'utf8');
        const id = path.basename(iss.filepath, '.md');
        const fixed = updateFrontmatter(raw, {
          id,
          date: dateStr,
          resolution_type: 'other',
          tags: ['general'],
          cause_summary: id,
          status: 'active',
        });
        fs.writeFileSync(iss.filepath, fixed, 'utf8');
        actions.push({ action: 'fix_frontmatter_corrupt', filepath: iss.filepath, message: `已补齐 Frontmatter 结构: ${id}` });
        fixedCount++;
        shouldReindex = true;
      } catch (err) {
        actions.push({ action: 'failed', filepath: iss.filepath, error: err.message });
      }
    }

    // 修复 3: 缺失关键字段 (补齐缺省值)
    if (iss.type === 'missing_fields' && iss.filepath && fs.existsSync(iss.filepath)) {
      try {
        const raw = fs.readFileSync(iss.filepath, 'utf8');
        const patch = {};
        if (iss.missingFields.some((f) => f.includes('date'))) patch.date = dateStr;
        if (iss.missingFields.includes('resolution_type')) patch.resolution_type = 'other';
        if (iss.missingFields.includes('tags')) patch.tags = ['general'];
        if (iss.missingFields.includes('id')) patch.id = path.basename(iss.filepath, '.md');
        patch.status = 'active';

        const fixed = updateFrontmatter(raw, patch);
        fs.writeFileSync(iss.filepath, fixed, 'utf8');
        actions.push({ action: 'patch_fields', id: iss.id, fields: Object.keys(patch), message: `已补全缺失字段: ${Object.keys(patch).join(', ')}` });
        fixedCount++;
        shouldReindex = true;
      } catch (err) {
        actions.push({ action: 'failed', filepath: iss.filepath, error: err.message });
      }
    }

    // 修复 4: 孤儿条目 (触发增量入库)
    if (iss.type === 'orphan_entry') {
      shouldReindex = true;
    }
  }

  if (shouldReindex) {
    const r = db.scanMemoryDir([p.root, p.memoryDir], p.level);
    search.invalidateScope();
    actions.push({ action: 'reindex', scanned: r.scanned, upserted: r.upserted, removed: r.removed, message: `已执行增量扫描重建索引 (挂载了 ${r.upserted} 条条目)` });
  }

  return { fixedCount, actions };
}

module.exports = { lintStructure, lintSemantic, autoFix };
