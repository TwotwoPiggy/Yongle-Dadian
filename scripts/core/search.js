/**
 * search.js — 永乐大典核心引擎:混合检索(关键词 + 语义向量 + RRF 融合)
 * 性能设计:
 *  - 关键词检索:进程内 FTS5,同步毫秒级
 *  - 语义检索:embedding + LanceDB 查询并行执行,整体超时保护
 *  - 结果缓存:同 (scope, query, 选项) 秒回,输出字节级稳定(DeepSeek 前缀缓存友好)
 *  - 优雅降级:embedding 禁用/失败 → fts-only;向量表缺失 → fts-only
 */
'use strict';

const { resolveLevel, autoLevel, normalizeLevel } = require('./paths');
const db = require('./db');
const lance = require('./lance');
const embed = require('./embed');
const { LruCache } = require('./cache');

/** 结果缓存:TTL 10 分钟,容量 256 */
const resultCache = new LruCache(256, 10 * 60 * 1000);

/** 混合检索默认选项 */
const DEFAULTS = {
  limit: 5,
  semanticOnly: false,
  timeoutMs: 8000,
  cwd: null,
};

/** id 归一化:旧 embedding 脚本可能产生 `"docid"_chunk_N` 格式(带引号+分块后缀),先剥 _chunk_N 再剥引号 */
const normalizeId = (x) => String(x || '').replace(/_chunk_\d+$/, '').replace(/^"+|"+$/g, '');

/**
 * 执行混合检索(单级别)
 * @param {string} query
 * @param {{level?:string, limit?:number, semanticOnly?:boolean,
 *          timeoutMs?:number, cwd?:string|null, config?:object, useCache?:boolean}} [options]
 * @returns {Promise<{hits:Array<object>, mode:'hybrid'|'fts-only', timings:object, cache:'result'|null}>}
 */
async function hybridSearch(query, options = {}) {
  const q = String(query || '').trim();
  const opts = { ...DEFAULTS, ...options };
  const started = Date.now();
  const config = opts.config || {};
  const cwd = opts.cwd || null;
  // 规范化级别(local→project、旧 global→user),auto 按 cwd 判定
  const level = normalizeLevel(opts.level === 'auto' || !opts.level ? autoLevel(cwd) : opts.level);
  const limit = Math.max(1, Math.min(20, Math.floor(opts.limit || DEFAULTS.limit)));

  const cacheKey = `L:${level}|${q}|${limit}|${opts.semanticOnly ? 's' : 'h'}`;
  if (opts.useCache !== false) {
    const cached = resultCache.get(cacheKey);
    if (cached) return { ...cached, cache: 'result', timings: { ...cached.timings, totalMs: Date.now() - started } };
  }

  const p = resolveLevel(level, cwd, config);
  if (!p.enabled) {
    const result = { hits: [], mode: 'fts-only', timings: { ftsMs: 0, totalMs: Date.now() - started } };
    return { ...result, cache: null };
  }
  db.open(p.db);

  const timings = {};
  const t0 = Date.now();

  // 1) 关键词检索(同步,毫秒级)
  let sqliteHits = [];
  if (!opts.semanticOnly) {
    sqliteHits = db.keywordSearch(q, Math.max(limit * 2, 10)).map((r) => ({
      id: r.id,
      title: r.id,
      cause_summary: r.cause_summary,
      tags: (r.tags || '').split(',').filter(Boolean),
      filepath: r.filepath,
      resolution_type: r.resolution_type,
      source: r.source,
      status: r.status || 'active',
      superseded_by: r.superseded_by || '',
      supersedes: r.supersedes || '',
      updated_at: r.updated_at || '',
      wikilinks: r.wikilinks || '',
      snippet: r.snippet || r.cause_summary,
      _source: 'sqlite',
    }));
  }
  timings.ftsMs = Date.now() - t0;

  // 2) 语义检索(embedding + 向量查询,并行 + 超时)
  const embeddingEnabled = !(config.embedding && config.embedding.enabled === false);
  let vectorHits = [];
  if (embeddingEnabled && !opts.signal?.aborted) {
    try {
      const t1 = Date.now();
      const embedConfig = config.embedding || { provider: 'ollama', model: 'nomic-embed-text' };
      const vector = await embed.getEmbeddingCached(q, embedConfig, { signal: opts.signal });
      timings.embedMs = Date.now() - t1;
      if (vector && !opts.signal?.aborted) {
        const t2 = Date.now();
        const vh = await withTimeout(
          lance.queryVectors(level, vector, Math.max(limit * 2, 10), cwd),
          opts.timeoutMs,
          opts.signal
        );
        timings.vectorMs = Date.now() - t2;
        vectorHits = vh.map((r) => ({
          id: r.id,
          content: r.content,
          tags: Array.isArray(r.tags) ? r.tags : [],
          _distance: r._distance,
          _source: 'vector',
        }));
      }
    } catch {
      timings.embedMs = timings.embedMs || -1;
      timings.vectorMs = timings.vectorMs || -1;
    }
  }

  // 3) RRF 融合(1.5x FTS 提权,与旧实现一致)
  const mode = vectorHits.length ? 'hybrid' : 'fts-only';
  const map = new Map();
  sqliteHits.forEach((r, idx) => {
    const score = 1.5 * (1 / (60 + idx + 1));
    map.set(normalizeId(r.id), { ...r, score, _isSemantic: false });
  });
  vectorHits.forEach((r, idx) => {
    const score = 1 / (60 + idx + 1);
    const key = normalizeId(r.id);
    if (map.has(key)) {
      const ex = map.get(key);
      ex.score += score;
      // 摘要优先保留更短更精炼的 cause_summary(省 token);无摘要时用 chunk 内容
      if (!ex.snippet || ex.snippet === ex.cause_summary) {
        if (r.content && r.content.length > 0 && !ex.cause_summary) ex.snippet = r.content;
      }
    } else {
      const entry = db.findEntry(key);
      map.set(key, {
        id: key,
        title: key,
        cause_summary: entry ? entry.cause_summary : '',
        tags: entry && entry.tags ? entry.tags.split(',').filter(Boolean) : (r.tags || []),
        filepath: entry ? entry.filepath : '',
        resolution_type: entry ? entry.resolution_type : '',
        source: 'vector',
        status: entry ? (entry.status || 'active') : 'active',
        superseded_by: entry ? (entry.superseded_by || '') : '',
        supersedes: entry ? (entry.supersedes || '') : '',
        updated_at: entry ? (entry.updated_at || '') : '',
        wikilinks: entry ? (entry.wikilinks || '') : '',
        snippet: r.content || (entry ? entry.cause_summary : ''),
        score,
        _isSemantic: true,
      });
    }
  });

  // 演进策略：已废弃条目给予 0.5x 得分惩罚，确保最新方案优先排在前面
  for (const item of map.values()) {
    if (item.status === 'deprecated') {
      item.score *= 0.5;
    }
  }

  const combined = Array.from(map.values())
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id))) // 确定性排序
    .slice(0, limit)
    .map((h) => {
      const isDeprecated = h.status === 'deprecated';
      let snippet = (h.snippet || h.cause_summary || '').replace(/\s+/g, ' ').trim();
      if (isDeprecated) {
        const replaceTip = h.superseded_by ? ` (已废弃，最新替代方案: ${h.superseded_by})` : ' (已废弃)';
        snippet = `[已废弃] ${snippet}${replaceTip}`;
      }
      return {
        id: h.id,
        title: isDeprecated ? `${h.id} [已废弃]` : h.id,
        entryType: h.resolution_type || 'other',
        tags: h.tags,
        path: h.filepath || '',
        snippet,
        score: Number(h.score.toFixed(6)),
        source: h._source === 'vector' ? 'semantic' : 'keyword',
        level,
        status: h.status || 'active',
        deprecated: isDeprecated,
        superseded_by: h.superseded_by || '',
        supersedes: h.supersedes || '',
        updated_at: h.updated_at || '',
        wikilinks: h.wikilinks || '',
      };
    });

  // 4) 1-Hop 因果拓扑扩散检索 (Wikilinks 1-Hop Expansion)
  const causalContext = [];
  if (opts.expandWikilinks !== false) {
    const hitIds = new Set(combined.map((h) => h.id));
    const maxCausal = Math.min(2, Math.max(1, opts.maxCausal || 2)); // 防扩散泛滥约束: 最大 2 条

    for (const h of combined) {
      if (causalContext.length >= maxCausal) break;
      const targetLinks = String(h.wikilinks || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const targetId of targetLinks) {
        if (causalContext.length >= maxCausal) break;
        if (hitIds.has(targetId)) continue;

        const targetEntry = db.findEntry(targetId);
        if (targetEntry) {
          hitIds.add(targetId);
          const isDep = targetEntry.status === 'deprecated';
          let cSnippet = (targetEntry.cause_summary || targetEntry.body_index || '').replace(/\s+/g, ' ').trim();
          if (isDep) cSnippet = `[已废弃] ${cSnippet}`;

          causalContext.push({
            id: targetEntry.id,
            title: `${targetEntry.id} [因果关联延伸]`,
            entryType: targetEntry.resolution_type || 'other',
            tags: (targetEntry.tags || '').split(',').filter(Boolean),
            path: targetEntry.filepath || '',
            snippet: `[因果关联延伸 - 关联自 ${h.id}] ${cSnippet}`,
            score: Number((h.score * 0.75).toFixed(6)),
            source: 'causal-wikilink',
            level,
            status: targetEntry.status || 'active',
            deprecated: isDep,
            superseded_by: targetEntry.superseded_by || '',
            supersedes: targetEntry.supersedes || '',
            updated_at: targetEntry.updated_at || '',
            wikilinks: targetEntry.wikilinks || '',
            isCausalContext: true,
            causalSource: h.id,
          });
        }
      }
    }
  }

  timings.totalMs = Date.now() - started;
  const result = { hits: [...combined, ...causalContext], causalContext, mode, timings };
  resultCache.set(cacheKey, result);
  return { ...result, cache: null };
}

/**
 * 多级别合并检索:project → user → global 依次检索并 RRF 融合
 * 每级别保留各自 RRF 得分,命中带 level 标记;总结果按 score 降序确定性排序。
 * @param {string} query
 * @param {{levels?:string[], limit?:number, semanticOnly?:boolean, timeoutMs?:number,
 *          cwd?:string|null, config?:object, useCache?:boolean}} [options]
 * @returns {Promise<{hits:Array<object>, modes:object, timings:object}>}
 */
async function searchAll(query, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const config = opts.config || {};
  const cwd = opts.cwd || null;
  const requested = opts.levels && opts.levels.length
    ? opts.levels.map(normalizeLevel).filter(Boolean)
    : ['project', 'user', 'global'];
  // 过滤禁用级别(global 未配置时跳过)
  const levels = requested.filter((lv) => resolveLevel(lv, cwd, config).enabled);
  if (levels.length === 0) return { hits: [], modes: {}, timings: { totalMs: 0 } };

  const started = Date.now();
  const perLevel = await Promise.all(
    levels.map((lv) => hybridSearch(query, { ...opts, level: lv, useCache: opts.useCache !== false, signal: opts.signal }))
  );
  // 合并:级别间不做提权,纯 RRF 融合;确定性排序
  const combined = perLevel
    .flatMap((r) => r.hits)
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)) || String(a.level).localeCompare(String(b.level)))
    .slice(0, Math.max(1, Math.min(20, opts.limit || 5)));
  const modes = {};
  perLevel.forEach((r, i) => { modes[levels[i]] = r.mode; });
  return {
    hits: combined,
    modes,
    timings: { totalMs: Date.now() - started, levels: perLevel.map((r) => r.timings) },
  };
}

/** 带超时的 Promise(超时返回空结果,不抛错;支持 AbortSignal 取消) */
function withTimeout(promise, ms, signal) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve([]), ms);
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          resolve([]);
        } else {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve([]);
          }, { once: true });
        }
      }
    }),
  ]);
}

/** 使结果缓存失效(归档/重建后调用) */
function invalidateScope() {
  resultCache.clear(); // 简单起见:全清(容量小,代价可忽略)
}

module.exports = { hybridSearch, searchAll, invalidateScope, resultCache };
