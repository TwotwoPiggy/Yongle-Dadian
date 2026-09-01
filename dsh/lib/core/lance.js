/**
 * lance.js — 永乐大典核心引擎:LanceDB 向量存储(连接复用)
 * 旧实现每次查询都 connect + tableNames + openTable(Lance 数据集打开开销 ~100ms+)。
 * 本模块缓存 scope → db 连接与 table 句柄,查询零重复打开开销。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { resolveLevel } = require('./paths');

/** @type {Map<string, Promise<any>>} scope → LanceDB 连接 Promise */
const _conns = new Map();
/** @type {Map<string, Promise<any>>} scope|dim → table 句柄 Promise */
const _tables = new Map();

/** 获取(并缓存)scope 的 LanceDB 连接;级别未配置(禁用)时返回 null */
function connect(scope, cwd) {
  const key = scope + '|' + (cwd || process.cwd());
  if (_conns.has(key)) return _conns.get(key);
  const p = (async () => {
    const pth = resolveLevel(scope, cwd);
    if (!pth.enabled) return null; // global 级别未配置 → 无向量库
    const lancedb = require('vectordb');
    const { lanceDir } = pth;
    if (!fs.existsSync(lanceDir)) fs.mkdirSync(path.dirname(lanceDir), { recursive: true });
    const db = await lancedb.connect(lanceDir);
    return db;
  })();
  // 失败时移除缓存,允许下次重试
  p.catch(() => _conns.delete(key));
  _conns.set(key, p);
  return p;
}

/** 获取(并缓存)dim 对应的表句柄;级别禁用时返回 null */
function table(scope, dim, cwd) {
  const key = `${scope}|${cwd || process.cwd()}|${dim}`;
  if (_tables.has(key)) return _tables.get(key);
  const p = (async () => {
    const db = await connect(scope, cwd);
    if (!db) return null;
    const name = `vectors_${dim}`;
    const names = await db.tableNames();
    if (!names.includes(name)) return null;
    return db.openTable(name);
  })();
  p.catch(() => _tables.delete(key));
  _tables.set(key, p);
  return p;
}

/**
 * KNN 向量检索
 * @param {'global'|'local'} scope
 * @param {number[]} vector
 * @param {number} [limit]
 * @param {string} [cwd]
 * @returns {Promise<Array<{id:string, content:string, tags:string[], _distance:number}>>}
 */
async function queryVectors(scope, vector, limit = 10, cwd) {
  const dim = vector.length;
  const t = await table(scope, dim, cwd);
  if (!t) return [];
  const results = await t.search(vector).limit(limit).execute();
  return results.map((r) => ({
    id: r.id,
    content: r.content,
    tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch { return []; } })(),
    _distance: r._distance,
  }));
}

/**
 * 批量 upsert 向量(按 dim 分组;已存在表先删后插,保证覆盖语义)
 * @param {'global'|'local'} scope
 * @param {Array<{id:string, content:string, tags?:string[], vector:number[]}>} records
 * @param {string} [cwd]
 */
async function upsertVectors(scope, records, cwd) {
  if (!records.length) return { upserted: 0 };
  const byDim = new Map();
  for (const r of records) {
    const dim = r.vector.length;
    if (!byDim.has(dim)) byDim.set(dim, []);
    byDim.get(dim).push(r);
  }
  let upserted = 0;
  for (const [dim, group] of byDim) {
    const db = await connect(scope, cwd);
    if (!db) continue; // 级别禁用 → 跳过向量写入
    const name = `vectors_${dim}`;
    const names = await db.tableNames();
    let t = null;
    if (names.includes(name)) {
      t = await db.openTable(name);
      // 批量删除已有 id(分块避免单条 SQL 过长)
      const ids = group.map((r) => r.id).filter(Boolean);
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200).map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
        if (chunk) await t.delete(`id IN (${chunk})`).catch(() => {});
      }
      await t.add(group.map((r) => ({ id: r.id, content: r.content || '', tags: JSON.stringify(r.tags || []), vector: r.vector })));
    } else {
      t = await db.createTable(name, group.map((r) => ({ id: r.id, content: r.content || '', tags: JSON.stringify(r.tags || []), vector: r.vector })));
    }
    _tables.set(`${scope}|${cwd || process.cwd()}|${dim}`, Promise.resolve(t));
    upserted += group.length;
  }
  return { upserted };
}

/**
 * 在所有 dim 表上统计 id 匹配某文档的行数(用于检测旧格式残留)
 * @param {string} scope
 * @param {string} docId 归一化文档 id(不含引号/后缀)
 * @param {string} [cwd]
 * @returns {Promise<{total:number, perTable:object}>}
 */
async function countMatchingRows(scope, docId, cwd) {
  const db = await connect(scope, cwd);
  if (!db) return { total: 0, perTable: {} };
  const names = await db.tableNames();
  const perTable = {};
  let total = 0;
  const like = `%${docId}%`;
  for (const n of names.filter((x) => x.startsWith('vectors_'))) {
    const t = await db.openTable(n);
    try {
      const c = await t.countRows(`id LIKE '${like.replace(/'/g, "''")}'`);
      perTable[n] = c;
      total += c;
    } catch {
      perTable[n] = -1; // 过滤不支持
    }
  }
  return { total, perTable };
}

/**
 * 删除所有 dim 表上 id 匹配某文档的行(旧引号格式 `"docid"_chunk_N` 与干净格式都删)
 * @param {string} scope
 * @param {string} docId
 * @param {string} [cwd]
 * @returns {Promise<{deleted:number}>}
 */
async function deleteMatchingRows(scope, docId, cwd) {
  const db = await connect(scope, cwd);
  if (!db) return { deleted: 0 };
  const names = await db.tableNames();
  let deleted = 0;
  const like = `%${docId}%`;
  for (const n of names.filter((x) => x.startsWith('vectors_'))) {
    const t = await db.openTable(n);
    try {
      const before = await t.countRows(`id LIKE '${like.replace(/'/g, "''")}'`);
      if (before > 0) {
        await t.delete(`id LIKE '${like.replace(/'/g, "''")}'`);
        deleted += before;
      }
    } catch {
      // 单表失败不阻断其他表
    }
  }
  return { deleted };
}

/** 重置连接缓存(测试/配置变更时使用) */
function reset() {
  _conns.clear();
  _tables.clear();
}

module.exports = { connect, table, queryVectors, upsertVectors, countMatchingRows, deleteMatchingRows, reset };
