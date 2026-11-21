/**
 * index.js — 永乐大典核心引擎:公共门面
 * 供三类调用方使用:
 *  1. 既有 CLI 脚本(require 本模块,行为向后兼容)
 *  2. DSH 插件(yongle-dadian-dsh 进程内调用)
 *  3. 单元测试
 *
 * 三级知识库:project(项目级) / user(用户级) / global(全局级,需配置)
 * 用法:
 *  const yongle = require('./core');
 *  await yongle.hybridSearch('乱码', { level: 'user', config });
 *  await yongle.searchAll('乱码', { levels: ['project','user','global'], config }); // 多级合并
 *  yongle.reindex({ level: 'project', cwd });
 *  await yongle.record({ level: 'user', title, summary, tags, content, config }); // 记录知识(区分级别)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const db = require('./db');
const lance = require('./lance');
const embed = require('./embed');
const search = require('./search');
const render = require('./render');
const postmortem = require('./postmortem');
const lint = require('./lint');
const { loadMergedConfig } = require('../yongle-config.js');

/**
 * 初始化核心(可选:传入显式配置覆盖 ~/.yongle_knowledge/config.json)
 * @param {object} [config]
 */
function init(config) {
  return config || loadMergedConfig();
}

/** 解析级别(兼容 scope 别名);禁用级别抛错 */
function resolveLevel(level, options = {}) {
  const lv = paths.normalizeLevel(level || 'user');
  if (!lv) throw new Error(`Unknown level: ${level}. Use 'project' | 'user' | 'global'.`);
  const p = paths.resolveLevel(lv, options.cwd || null, init(options.config));
  if (!p.enabled) {
    throw new Error(`Yongle level '${lv}' is not configured. Set yongle.storage.global_path or YONGLE_GLOBAL_HOME to enable it.`);
  }
  return p;
}

/**
 * 混合检索(单级别;level 缺省 auto:项目存在则 project,否则 user)
 * @param {string} query
 * @param {{level?:string, scope?:string, limit?:number, semanticOnly?:boolean, cwd?:string, config?:object}} [options]
 */
async function hybridSearch(query, options = {}) {
  const config = init(options.config);
  const level = options.level || options.scope || 'auto';
  return search.hybridSearch(query, { ...options, level, config });
}

/**
 * 多级别合并检索(auto:project + user + global,自动跳过未配置级别)
 * @param {string} query
 * @param {{levels?:string[], limit?:number, semanticOnly?:boolean, cwd?:string, config?:object}} [options]
 */
async function searchAll(query, options = {}) {
  const config = init(options.config);
  return search.searchAll(query, { ...options, config });
}

/**
 * 增量重建某级别的 SQLite 索引(扫描知识目录)
 * project/user 扫描 [root, root/memory];global 同 project 规则
 * @param {{level?:string, scope?:string, cwd?:string, config?:object}} [options]
 */
function reindex(options = {}) {
  const p = resolveLevel(options.level || options.scope || 'user', options);
  db.open(p.db);
  const dirs = [p.root, p.memoryDir];
  const r = db.scanMemoryDir(dirs, p.level);
  search.invalidateScope();
  return { ...r, level: p.level };
}

/**
 * 确保某级别的索引已初始化(首次调用自动增量扫描,之后空操作)
 * @param {{level?:string, scope?:string, cwd?:string, config?:object}} [options]
 */
function ensureIndexed(options = {}) {
  const p = resolveLevel(options.level || options.scope || 'user', options);
  db.open(p.db);
  const has = db.prepare('SELECT 1 c FROM scan_state LIMIT 1').get();
  if (has) return { ...db.stats(), level: p.level, initialized: true, scanned: 0 };
  const r = db.scanMemoryDir([p.root, p.memoryDir], p.level);
  search.invalidateScope();
  return { ...r, level: p.level, initialized: false };
}

/**
 * 修复某级别的 FTS 索引(重建 entries_fts 并回填)
 * @param {{level?:string, scope?:string, cwd?:string, config?:object}} [options]
 */
function repairFts(options = {}) {
  const p = resolveLevel(options.level || options.scope || 'user', options);
  db.open(p.db);
  const r = db.repairFts();
  search.invalidateScope();
  return { ...r, level: p.level };
}

/** 统计信息(单级别) */
function stats(options = {}) {
  const p = resolveLevel(options.level || options.scope || 'user', options);
  db.open(p.db);
  return { level: p.level, root: p.root, ...db.stats() };
}

/** 统计信息(全部可用级别) */
function statsAll(options = {}) {
  const config = init(options.config);
  const cwd = options.cwd || null;
  return paths.listLevels(cwd, config).map((l) => {
    if (!l.enabled) return { level: l.level, enabled: false, entries: 0, fts: 0, drafts: 0 };
    const p = paths.resolveLevel(l.level, cwd, config);
    db.open(p.db);
    const s = db.stats();
    let drafts = 0;
    const draftDir = path.join(p.root, 'drafts');
    if (fs.existsSync(draftDir)) {
      try {
        drafts = fs.readdirSync(draftDir).filter((f) => f.endsWith('.md')).length;
      } catch {
        drafts = 0;
      }
    }
    return { level: l.level, enabled: true, root: p.root, entries: s.entries, fts: s.fts, drafts };
  });
}

/**
 * 记录一条知识(核心:写 Markdown → 增量索引 → 后台向量化)
 * 级别由 level 显式指定:project(项目级)/ user(用户级)/ global(全局级)
 * @param {{level:string, title:string, summary?:string, tags?:string[],
 *          content?:string, resolutionType?:string, cwd?:string, config?:object,
 *          embed?:boolean}} [options]
 * @returns {Promise<{level:string, id:string, filepath:string}>}
 */
async function record(options = {}) {
  const p = resolveLevel(options.level || 'user', options);
  const config = init(options.config);
  const title = String(options.title || '').trim();
  if (!title) throw new Error('record requires a non-empty title');
  const summary = String(options.summary || '').trim();
  const tags = Array.isArray(options.tags) ? options.tags.filter(Boolean) : [];
  const resolutionType = String(options.resolutionType || 'decision').trim();
  const content = String(options.content || '').trim();

  // 1) 生成 id 与文件名:YYYYMMDD-HHMMSS-<slug>
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const slug = title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'entry';
  const id = `${stamp}-${slug}`;
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // 2) 写 Markdown(带 frontmatter)
  if (!fs.existsSync(p.memoryDir)) fs.mkdirSync(p.memoryDir, { recursive: true });
  const filepath = path.join(p.memoryDir, `${id}.md`);
  const fm = [
    '---',
    `id: "${id}"`,
    `date: "${dateStr}"`,
    `resolution_type: "${resolutionType}"`,
    tags.length ? `tags:\n${tags.map((t) => `  - ${t}`).join('\n')}` : 'tags: []',
    `cause_summary: "${summary.replace(/"/g, '\\"')}"`,
    '---',
    '',
  ].join('\n');
  const body = content || `## 摘要\n\n${summary || title}`;
  fs.writeFileSync(filepath, `${fm}${body}\n`, 'utf8');

  // 3) 增量索引(仅新文件会 upsert)
  db.open(p.db);
  const r = db.scanMemoryDir([p.root, p.memoryDir], p.level);
  search.invalidateScope();

  // 4) 后台向量化(不阻塞返回;embed 默认开启,失败静默)
  if (options.embed !== false) {
    embedDocument(filepath, { level: p.level, cwd: p.cwd, config }).catch(() => {});
  }
  return { level: p.level, id, filepath, indexed: r.upserted };
}

/**
 * 向量化一条(或多条)Markdown 文档并 upsert 到 LanceDB
 * @param {string} filepath
 * @param {{level?:string, scope?:string, config?:object, concurrency?:number, cwd?:string}} [options]
 */
async function embedDocument(filepath, options = {}) {
  const p = resolveLevel(options.level || options.scope || 'user', options);
  const config = init(options.config);
  const embedConfig = config.embedding || { provider: 'ollama', model: 'nomic-embed-text' };

  if (!fs.existsSync(filepath)) return { upserted: 0, failed: 1, level: p.level };
  const content = fs.readFileSync(filepath, 'utf8');
  const { meta } = db.parseFrontmatter(content);
  const docId = String(meta.id || path.basename(filepath, '.md'));
  const tags = Array.isArray(meta.tags) ? meta.tags : [];

  const chunksRaw = content.split(/(?=^#+\s|\n#+\s)/);
  const chunks = chunksRaw.map((c) => c.trim()).filter((c) => c.length > 0);
  const records = [];
  let failed = 0;
  const concurrency = options.concurrency || 3;
  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      if (options.signal?.aborted) break;
      const i = cursor++;
      const chunkText = chunks[i];
      try {
        const vector = await embed.getEmbeddingCached(chunkText, embedConfig, { signal: options.signal });
        if (vector) {
          records.push({ id: `${docId}_chunk_${i}`, content: chunkText, tags, vector });
        }
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  const { upserted } = await lance.upsertVectors(p.level, records, options.cwd || null);
  search.invalidateScope();
  return { upserted, failed, level: p.level };
}

/**
 * 从会话事件日志生成复盘草稿(LLM 蒸馏,草稿待确认)
 * @param {{level?:string, events:Array<object>, config?:object, llm?:Function,
 *          extraContext?:string, cwd?:string}} [options]
 * @returns {Promise<{ok:boolean, level:string, draftPath?:string, id?:string, draft?:object, error?:string}>}
 */
/**
 * 辅助函数:安全更新 Markdown 文件的 Frontmatter 键值对
 */
function updateFrontmatter(content, fields) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return content;
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
 * 辅助函数:定位条目物理 Markdown 文件
 */
function locateEntryFile(targetId, p, cwd, config) {
  db.open(p.db);
  const entry = db.findEntry(targetId);
  if (entry && entry.filepath && fs.existsSync(entry.filepath)) {
    return entry.filepath;
  }
  // 检查当前级别的 memory 目录
  const directPath = path.join(p.memoryDir, `${targetId}.md`);
  if (fs.existsSync(directPath)) return directPath;

  // 遍历搜索可用级别
  const allLevels = paths.listLevels(cwd, config).filter((l) => l.enabled);
  for (const l of allLevels) {
    const lp = paths.resolveLevel(l.level, cwd, config);
    db.open(lp.db);
    const le = db.findEntry(targetId);
    if (le && le.filepath && fs.existsSync(le.filepath)) return le.filepath;
    const lDirect = path.join(lp.memoryDir, `${targetId}.md`);
    if (fs.existsSync(lDirect)) return lDirect;
  }
  return null;
}

/**
 * 从会话事件日志生成复盘草稿(LLM 蒸馏,查重嗅探,草稿待确认)
 * @param {{level?:string, events:Array<object>, config?:object, llm?:Function,
 *          extraContext?:string, cwd?:string, sniff?:boolean}} [options]
 * @returns {Promise<{ok:boolean, level:string, draftPath?:string, id?:string, draft?:object,
 *                    isDuplicateSuspect?:boolean, duplicateCandidates?:Array<object>, suggestedStrategy?:string, targetKi?:string, error?:string}>}
 */
async function createPostmortemDraft(options = {}) {
  const p = resolveLevel(options.level || 'user', options);
  const config = init(options.config);
  const material = postmortem.extractMaterial(options.events || []);
  if (!material.userRequests.length && !material.failedTools.length && !material.assistantText) {
    return { ok: false, level: p.level, error: 'no usable session material' };
  }
  const result = await postmortem.distill({
    material,
    config,
    llm: options.llm,
    extraContext: options.extraContext,
    twoStep: options.twoStep,
  });
  if (!result.ok) return { ok: false, level: p.level, error: result.error };

  // 查重嗅探 (默认开启)
  let sniffResult = { isDuplicateSuspect: false, candidates: [], suggestedStrategy: 'create_new', targetKi: '' };
  if (options.sniff !== false) {
    try {
      sniffResult = await postmortem.sniffDuplicates({
        material,
        draft: result.draft,
        cwd: options.cwd || p.cwd,
        config,
      });
    } catch {
      // 嗅探失败不阻断草稿生成
    }
  }

  const { draftPath, id, evolutionStrategy, targetKi, conflictNote } = postmortem.writeDraftFile({
    draftDir: path.join(p.root, 'drafts'),
    draft: result.draft,
    originalQuestion: material.userRequests.join(' | '),
    evolutionStrategy: options.evolutionStrategy || sniffResult.suggestedStrategy,
    targetKi: options.targetKi || sniffResult.targetKi,
    conflictNote: options.conflictNote || '',
  });

  return {
    ok: true,
    level: p.level,
    draftPath,
    id,
    draft: result.draft,
    reasoning: result.reasoning,
    isDuplicateSuspect: sniffResult.isDuplicateSuspect,
    duplicateCandidates: sniffResult.candidates,
    suggestedStrategy: sniffResult.suggestedStrategy,
    targetKi: sniffResult.targetKi,
    evolutionStrategy,
  };
}

/**
 * 确认复盘草稿:支持 create_new(默认新建)、supplement(原地追加更新) 与 supersede(推翻旧案并链接新条目)
 * @param {{level?:string, draftPath:string, strategy?:string, targetKi?:string, conflictNote?:string,
 *          cwd?:string, config?:object, embed?:boolean}} [options]
 * @returns {{ok:boolean, level:string, action?:string, filepath?:string, id?:string, supersededTarget?:string, error?:string}}
 */
function confirmDraft(options = {}) {
  const p = resolveLevel(options.level || 'user', options);
  const cfg = init(options.config);
  const draftPath = String(options.draftPath || '').trim();
  if (!draftPath || !fs.existsSync(draftPath)) {
    return { ok: false, level: p.level, error: `draft not found: ${draftPath}` };
  }
  let content;
  try {
    content = fs.readFileSync(draftPath, 'utf8');
  } catch (e) {
    return { ok: false, level: p.level, error: `cannot read draft: ${e.message}` };
  }

  const { meta, body } = db.parseFrontmatter(content);
  const id = String(meta.id || path.basename(draftPath, '.md'));
  const strategy = String(options.strategy || meta.evolution_strategy || 'create_new').toLowerCase();
  const targetKi = String(options.targetKi || meta.target_ki || '').trim();
  const conflictNote = String(options.conflictNote || meta.conflict_note || '').trim();

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const finalFilename = path.basename(draftPath).replace(/\.draft\.md$/, '.md');

  // 分支 1: 原地补充增量 (supplement)
  if (strategy === 'supplement') {
    if (!targetKi) {
      return { ok: false, level: p.level, error: 'supplement strategy requires target_ki' };
    }
    const targetFile = locateEntryFile(targetKi, p, options.cwd || p.cwd, cfg);
    if (!targetFile || !fs.existsSync(targetFile)) {
      return { ok: false, level: p.level, error: `target KI file not found for id: ${targetKi}` };
    }

    const targetContent = fs.readFileSync(targetFile, 'utf8');
    const updatedTargetFm = updateFrontmatter(targetContent, {
      updated_at: `${dateStr} ${timeStr}`,
    });

    const solMatch = body.match(/## 解决方案\r?\n+([\s\S]*?)(?=\n##|$)/);
    const solContent = solMatch ? solMatch[1].trim() : body.trim();
    const noteText = conflictNote ? `> **演进原因**：${conflictNote}\n` : '';

    const appendix = [
      '',
      `## 补充演进 (${dateStr} ${timeStr})`,
      '',
      '> [!NOTE]',
      `> **更新模式**：原地补充更新 (In-place Supplement)`,
      noteText.trim(),
      '',
      '### 补充方案',
      '',
      solContent,
      '',
    ].filter(Boolean).join('\n');

    fs.writeFileSync(targetFile, updatedTargetFm + appendix, 'utf8');
    try { fs.unlinkSync(draftPath); } catch { /* ignore */ }

    // 原地重新索引
    db.open(p.db);
    db.scanMemoryDir([p.root, p.memoryDir, path.dirname(targetFile)], p.level);
    search.invalidateScope();

    if (options.embed !== false) {
      embedDocument(targetFile, { level: p.level, cwd: p.cwd, config: cfg }).catch(() => {});
    }

    return { ok: true, level: p.level, action: 'supplement', filepath: targetFile, id: targetKi };
  }

  // 分支 2: 推翻废弃旧方案 (supersede)
  if (strategy === 'supersede') {
    if (!targetKi) {
      return { ok: false, level: p.level, error: 'supersede strategy requires target_ki' };
    }
    const targetFile = locateEntryFile(targetKi, p, options.cwd || p.cwd, cfg);
    if (!targetFile || !fs.existsSync(targetFile)) {
      return { ok: false, level: p.level, error: `target KI file not found for id: ${targetKi}` };
    }

    // 1) 标记旧条目废弃
    const targetContent = fs.readFileSync(targetFile, 'utf8');
    let targetUpdatedFm = updateFrontmatter(targetContent, {
      status: 'deprecated',
      superseded_by: id,
      updated_at: `${dateStr} ${timeStr}`,
    });

    const noteText = conflictNote ? `\n> **废弃原因**：${conflictNote}` : '';
    const deprecateCallout = `> [!WARNING]\n> **此方案已废弃（Deprecated）**${noteText}\n> **最新替代方案**：[${id}](./${finalFilename})\n\n`;

    // 插入警告呼出块：安全插入在 frontmatter 之后、正文之前
    const fmMatch = targetUpdatedFm.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/);
    let newTargetContent;
    if (fmMatch) {
      newTargetContent = `${fmMatch[1]}\n${deprecateCallout}${fmMatch[2].replace(/^\r?\n+/, '')}`;
    } else {
      newTargetContent = `${deprecateCallout}${targetUpdatedFm}`;
    }
    fs.writeFileSync(targetFile, newTargetContent, 'utf8');

    // 2) 归档新条目
    let newContent = updateFrontmatter(content, {
      status: 'active',
      supersedes: targetKi,
      conflict_note: conflictNote || undefined,
    });
    newContent = newContent.replace(/^draft:\s*true\s*$/m, '').replace(/^\s*-\s*$/m, '');

    if (!fs.existsSync(p.memoryDir)) fs.mkdirSync(p.memoryDir, { recursive: true });
    const filepath = path.join(p.memoryDir, finalFilename);
    fs.writeFileSync(filepath, newContent, 'utf8');
    try { fs.unlinkSync(draftPath); } catch { /* ignore */ }

    // 3) 索引与向量化
    db.open(p.db);
    db.scanMemoryDir([p.root, p.memoryDir, path.dirname(targetFile)], p.level);
    search.invalidateScope();

    if (options.embed !== false) {
      embedDocument(targetFile, { level: p.level, cwd: p.cwd, config: cfg }).catch(() => {});
      embedDocument(filepath, { level: p.level, cwd: p.cwd, config: cfg }).catch(() => {});
    }

    return { ok: true, level: p.level, action: 'supersede', filepath, id, supersededTarget: targetKi };
  }

  // 分支 3: 默认新建独立条目 (create_new)
  let cleaned = updateFrontmatter(content, {
    status: 'active',
  });
  cleaned = cleaned.replace(/^draft:\s*true\s*$/m, '').replace(/^\s*-\s*$/m, '');

  if (!fs.existsSync(p.memoryDir)) fs.mkdirSync(p.memoryDir, { recursive: true });
  const filepath = path.join(p.memoryDir, finalFilename);
  fs.writeFileSync(filepath, cleaned, 'utf8');
  try {
    fs.unlinkSync(draftPath);
  } catch { /* 草稿可能已手动移动 */ }

  // 增量索引
  db.open(p.db);
  db.scanMemoryDir([p.root, p.memoryDir], p.level);
  search.invalidateScope();

  // 后台向量化
  if (options.embed !== false) {
    embedDocument(filepath, { level: p.level, cwd: p.cwd, config: cfg }).catch(() => {});
  }
  return { ok: true, level: p.level, action: 'create_new', filepath, id };
}

/**
 * 修复某级别的向量库:检测旧格式/过时 chunk,重新嵌入保证与 md 一致
 * @param {{level?:string, cwd?:string, config?:object, dryRun?:boolean, concurrency?:number}} [options]
 * @returns {Promise<{level:string, scanned:number, affected:number, staleRows:number, reembedded:number, deleted:number, dryRun:boolean}>}
 */
async function repairVectors(options = {}) {
  const p = resolveLevel(options.level || 'user', options);
  const config = init(options.config);
  const dryRun = options.dryRun !== false;
  db.open(p.db);
  const rows = db.get().prepare('SELECT id, filepath FROM entries').all();
  let scanned = 0;
  let affected = 0;
  let staleRows = 0;
  let reembedded = 0;
  let deleted = 0;
  for (const r of rows) {
    if (options.signal?.aborted) break;
    if (!r.filepath || !fs.existsSync(r.filepath)) continue;
    scanned++;
    const { total } = await lance.countMatchingRows(p.level, r.id, options.cwd || null);
    if (total > 0) {
      affected++;
      staleRows += total;
    }
    if (dryRun) continue;
    // 实际修复:删旧行 → 重新嵌入(干净 id)
    const del = await lance.deleteMatchingRows(p.level, r.id, options.cwd || null);
    deleted += del.deleted;
    const em = await embedDocument(r.filepath, { level: p.level, cwd: options.cwd || null, config, concurrency: options.concurrency, signal: options.signal });
    reembedded += em.upserted;
  }
  search.invalidateScope();
  return { level: p.level, scanned, affected, staleRows, reembedded, deleted, dryRun };
}

/**
 * 执行结构化巡检 (Layer 1)
 * @param {{level?:string, cwd?:string, config?:object}} [options]
 */
function lintStructure(options = {}) {
  return lint.lintStructure({ ...options, config: init(options.config) });
}

/**
 * 执行语义审计巡检 (Layer 2)
 * @param {{level?:string, cwd?:string, config?:object}} [options]
 */
async function lintSemantic(options = {}) {
  return lint.lintSemantic({ ...options, config: init(options.config) });
}

/**
 * 执行自愈修复 (--fix)
 * @param {Array<object>} issues
 * @param {{level?:string, cwd?:string, config?:object}} [options]
 */
function autoFix(issues, options = {}) {
  return lint.autoFix(issues, { ...options, config: init(options.config) });
}

/**
 * 完整巡检某级别或多级别
 * @param {{level?:string, deep?:boolean, fix?:boolean, cwd?:string, config?:object}} [options]
 */
async function lintAll(options = {}) {
  const cfg = init(options.config);
  const cwd = options.cwd || null;
  const target = options.level || 'auto';
  const levels = target === 'auto'
    ? paths.listLevels(cwd, cfg).filter((l) => l.enabled).map((l) => l.level)
    : [paths.normalizeLevel(target)];

  const results = [];
  for (const lv of levels) {
    const structRes = lint.lintStructure({ level: lv, cwd, config: cfg });
    let semanticRes = null;
    if (options.deep) {
      semanticRes = await lint.lintSemantic({ level: lv, cwd, config: cfg });
    }
    const allIssues = [...structRes.issues, ...(semanticRes ? semanticRes.issues : [])];
    let fixRes = null;
    if (options.fix && allIssues.length > 0) {
      fixRes = lint.autoFix(allIssues, { level: lv, cwd, config: cfg });
    }
    results.push({
      level: lv,
      structure: structRes,
      semantic: semanticRes,
      issues: allIssues,
      fix: fixRes,
    });
  }
  return results;
}

/** 关闭所有资源(进程退出时调用) */
function close() {
  embed.flush();
  db.close();
  lance.reset();
}

module.exports = {
  init,
  hybridSearch,
  searchAll,
  reindex,
  ensureIndexed,
  repairFts,
  repairVectors,
  embedDocument,
  record,
  createPostmortemDraft,
  confirmDraft,
  lintStructure,
  lintSemantic,
  autoFix,
  lintAll,
  stats,
  statsAll,
  close,
  paths,
  db,
  lance,
  embed,
  search,
  render,
  postmortem,
  lint,
};
