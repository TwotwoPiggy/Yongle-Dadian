/**
 * db.js — 永乐大典核心引擎:进程内 SQLite 存储
 * 基于 node:sqlite(DatabaseSync),替代逐次 spawn sqlite3 子进程的方案:
 *  - WAL 模式 + synchronous=NORMAL:读性能与写吞吐兼顾
 *  - FTS5 trigram 虚拟表:中文短语/英文子串毫秒级全文检索(≥3 字符)
 *  - <3 字符查询(如 2 字中文)自动回退进程内 LIKE 扫描
 *  - 增量索引:scanMemoryDir() 按 mtime 扫描 memory 目录,只 upsert 变更
 *  - 兼容旧库:打开旧 entries 表自动补建 FTS 并回填
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** @type {Map<string, import('node:sqlite').DatabaseSync>} 按 db 路径缓存连接 */
const _dbs = new Map();
/** 当前活动连接(open 时切换;所有查询作用于它) */
let _db = null;
let _dbPath = null;

/**
 * 打开(或复用)指定数据库并设为活动连接,自动迁移 schema
 * 多级别知识库各自独立 db 文件,连接全部缓存,open 切换当前活动连接
 */
function open(dbPath) {
  if (_dbs.has(dbPath)) {
    _db = _dbs.get(dbPath);
    _dbPath = dbPath;
    return _db;
  }
  const { DatabaseSync } = require('node:sqlite');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  // 使用回滚日志而非 WAL:单进程同步访问无需 WAL 的并发收益,
  // 且规避混合 SQLite 构建(如旧 32 位 sqlite3 CLI)遗留 WAL 导致的损坏
  db.exec('PRAGMA journal_mode = DELETE;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  _dbs.set(dbPath, db);
  _db = db;
  _dbPath = dbPath;
  return db;
}

/** 获取当前打开的数据库(未打开则抛错) */
function get() {
  if (!_db) throw new Error('yongle core db not opened. Call open(dbPath) first.');
  return _db;
}

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    date TEXT,
    resolution_type TEXT,
    cause_summary TEXT,
    tags TEXT,
    filepath TEXT,
    source TEXT,
    body_index TEXT DEFAULT '',
    last_indexed DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  // schema v2:旧库补 body_index 列(正文索引,提升蒸馏知识的召回)
  const cols = db.prepare("PRAGMA table_info(entries)").all().map((c) => c.name);
  if (!cols.includes('body_index')) {
    db.exec("ALTER TABLE entries ADD COLUMN body_index TEXT DEFAULT ''");
  }
  db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    id, cause_summary, tags, body_index,
    content='entries', content_rowid='rowid',
    tokenize='trigram'
  );`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, id, cause_summary, tags, body_index)
    VALUES (new.rowid, new.id, new.cause_summary, new.tags, new.body_index); END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, id, cause_summary, tags, body_index)
    VALUES ('delete', old.rowid, old.id, old.cause_summary, old.tags, old.body_index); END;`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, id, cause_summary, tags, body_index)
    VALUES ('delete', old.rowid, old.id, old.cause_summary, old.tags, old.body_index);
    INSERT INTO entries_fts(rowid, id, cause_summary, tags, body_index)
    VALUES (new.rowid, new.id, new.cause_summary, new.tags, new.body_index); END;`);
  // schema 版本管理:v2 = 4 列 FTS(含 body_index);旧 3 列索引需重建
  const ver = db.prepare("SELECT v FROM meta WHERE k = 'schema_version'").get();
  const version = ver ? parseInt(ver.v, 10) : 1;
  if (version < 2) {
    db.exec('DROP TRIGGER IF EXISTS entries_ai');
    db.exec('DROP TRIGGER IF EXISTS entries_ad');
    db.exec('DROP TRIGGER IF EXISTS entries_au');
    db.exec('DROP TABLE IF EXISTS entries_fts');
    db.exec(`CREATE VIRTUAL TABLE entries_fts USING fts5(
      id, cause_summary, tags, body_index,
      content='entries', content_rowid='rowid',
      tokenize='trigram'
    );`);
    db.exec(`CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, id, cause_summary, tags, body_index)
      VALUES (new.rowid, new.id, new.cause_summary, new.tags, new.body_index); END;`);
    db.exec(`CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, id, cause_summary, tags, body_index)
      VALUES ('delete', old.rowid, old.id, old.cause_summary, old.tags, old.body_index); END;`);
    db.exec(`CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, id, cause_summary, tags, body_index)
      VALUES ('delete', old.rowid, old.id, old.cause_summary, old.tags, old.body_index);
      INSERT INTO entries_fts(rowid, id, cause_summary, tags, body_index)
      VALUES (new.rowid, new.id, new.cause_summary, new.tags, new.body_index); END;`);
    db.prepare("INSERT INTO meta (k, v) VALUES ('schema_version', '2') ON CONFLICT(k) DO UPDATE SET v = excluded.v").run();
  }
  // 回填:索引行数少于 entries 时重建(外部内容表必须用 'delete-all',不能用 DELETE)
  const c1 = db.prepare('SELECT COUNT(*) c FROM entries').get().c;
  let c2 = 0;
  try { c2 = db.prepare('SELECT COUNT(*) c FROM entries_fts_data').get().c; } catch { c2 = 0; }
  if (c1 > 0 && c2 < c1) {
    db.exec("INSERT INTO entries_fts(entries_fts) VALUES('delete-all')");
    db.prepare('INSERT INTO entries_fts(rowid, id, cause_summary, tags, body_index) SELECT rowid, id, cause_summary, tags, body_index FROM entries').run();
  }
}

/**
 * 修复 FTS 索引:删除并重建 entries_fts 与触发器,再从 entries 回填
 * (用于索引被破坏的场景,如旧版本误用 DELETE 导致的校验失败)
 */
function repairFts() {
  const db = get();
  db.exec('DROP TRIGGER IF EXISTS entries_ai');
  db.exec('DROP TRIGGER IF EXISTS entries_ad');
  db.exec('DROP TRIGGER IF EXISTS entries_au');
  db.exec('DROP TABLE IF EXISTS entries_fts');
  migrate(db);
  return { ok: true };
}

/** 解析 Markdown frontmatter(返回 { meta, body }) */
function parseFrontmatter(content) {
  // 注意:正则必须有两个捕获组 —— 组1 = frontmatter,组2 = 正文
  // 旧实现只有 1 个组却读 m[2],导致带 frontmatter 的文件正文永远为空
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content };
  const meta = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const raw = kv[2].trim().replace(/^["']|["']$/g, '');
      if (raw.startsWith('[') && raw.endsWith(']')) {
        meta[key] = raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        meta[key] = raw;
      }
    } else if (key && /^\s+-/.test(line)) {
      const item = line.replace(/^\s+-\s*/, '').trim().replace(/^["']|["']$/g, '');
      if (!Array.isArray(meta[key])) meta[key] = [];
      meta[key].push(item);
    }
  }
  return { meta, body: m[2] || '' };
}

/**
 * 从 Markdown 文件提取条目字段
 * @param {string} filepath
 * @param {string} [scope]
 * @returns {{id:string, date:string, resolution_type:string, cause_summary:string, tags:string, filepath:string, mtimeMs:number, hash:string}|null}
 */
function extractEntry(filepath, scope) {
  let content;
  try {
    content = fs.readFileSync(filepath, 'utf8');
  } catch {
    return null;
  }
  const { meta, body } = parseFrontmatter(content);
  if (!meta.id && !body.trim()) return null;
  const id = String(meta.id || path.basename(filepath, '.md'));
  const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []);
  const cause = String(meta.cause_summary || body.replace(/\s+/g, ' ').trim().slice(0, 200));
  const st = fs.statSync(filepath);
  return {
    id,
    date: String(meta.date || ''),
    resolution_type: String(meta.resolution_type || 'other'),
    cause_summary: cause,
    tags: tags.join(','),
    filepath: path.resolve(filepath),
    body_index: body.replace(/\s+/g, ' ').trim().slice(0, 3000), // 正文入索引,提升召回
    mtimeMs: st.mtimeMs,
    hash: crypto.createHash('sha1').update(id + '|' + st.mtimeMs + '|' + st.size).digest('hex').slice(0, 16),
  };
}

/**
 * upsert 一条条目(同时经触发器维护 FTS)
 * @param {{id:string, date?:string, resolution_type?:string, cause_summary?:string, tags?:string, filepath?:string, source?:string, body_index?:string}} e
 */
function upsertEntry(e) {
  const db = get();
  db.prepare(`INSERT INTO entries (id, date, resolution_type, cause_summary, tags, filepath, source, body_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date=excluded.date, resolution_type=excluded.resolution_type,
      cause_summary=excluded.cause_summary, tags=excluded.tags,
      filepath=excluded.filepath, source=excluded.source,
      body_index=excluded.body_index,
      last_indexed=CURRENT_TIMESTAMP`)
    .run(e.id, e.date || '', e.resolution_type || 'other', e.cause_summary || '', e.tags || '', e.filepath || '', e.source || '', e.body_index || '');
}

/** 按 id 删除条目(触发器同步删 FTS) */
function removeEntry(id) {
  get().prepare('DELETE FROM entries WHERE id = ?').run(id);
}

/** 判断某条目是否存在 */
function hasEntry(id) {
  return get().prepare('SELECT 1 c FROM entries WHERE id = ?').get(id) !== undefined;
}

/**
 * 关键词检索:FTS5 trigram(≥3 字符)→ LIKE 兜底(<3 字符或 FTS 失败)
 * @param {string} query
 * @param {number} [limit]
 * @returns {Array<{id:string, cause_summary:string, tags:string, filepath:string, resolution_type:string, source:string, snippet:string}>}
 */
function keywordSearch(query, limit = 10) {
  const q = String(query || '').trim();
  if (!q) return [];
  const db = get();
  let rows = [];
  if (q.length >= 3) {
    const match = buildMatchQuery(q);
    try {
      rows = db.prepare(
        `SELECT e.rowid, e.id, e.cause_summary, e.tags, e.filepath, e.resolution_type, e.source,
                snippet(entries_fts, 1, '', '', '...', 24) AS snippet
         FROM entries_fts JOIN entries e ON e.rowid = entries_fts.rowid
         WHERE entries_fts MATCH ?
         ORDER BY bm25(entries_fts) LIMIT ?`
      ).all(match, limit);
    } catch {
      rows = [];
    }
  }
  if (rows.length === 0) {
    // LIKE 兜底:短查询(<3 字符,如 2 字中文)或 FTS 语法失败
    // 多词查询逐词 OR,保证 "乱码 提交 端口" 这类输入能命中任一关键词
    const words = q.split(/\s+/).filter(Boolean);
    const conds = [];
    const params = [];
    for (const w of words) {
      const like = `%${w}%`;
      conds.push('(id LIKE ? OR cause_summary LIKE ? OR tags LIKE ? OR body_index LIKE ?)');
      params.push(like, like, like, like);
    }
    if (conds.length > 0) {
      params.push(limit);
      rows = db.prepare(
        `SELECT id, cause_summary, tags, filepath, resolution_type, source
         FROM entries WHERE ${conds.join(' OR ')}
         LIMIT ?`
      ).all(...params);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    cause_summary: r.cause_summary,
    tags: r.tags,
    filepath: r.filepath,
    resolution_type: r.resolution_type,
    source: r.source,
    snippet: r.snippet || r.cause_summary,
  }));
}

/**
 * 构造 FTS5 MATCH 表达式:
 *  - 空格分隔的多词 → OR 组合的短语(命中任一词)
 *  - 单个短语 → 整体短语匹配(中文子串/英文子串)
 */
function buildMatchQuery(q) {
  const words = q.split(/\s+/).filter(Boolean);
  const quote = (w) => '"' + w.replace(/"/g, '""') + '"';
  if (words.length > 1) return words.map(quote).join(' OR ');
  return quote(words[0]);
}

/**
 * 增量扫描知识目录:按 mtime 只 upsert 变更/新增,删除已消失条目
 * 维护 meta 表 scan_state:scope|dirs → 逐条目 hash 快照
 * @param {string[]} dirs 待扫描目录(global 通常 [root, root/memory];local 通常 [root/memory])
 * @param {string} [source] global|local
 * @returns {{upserted:number, removed:number, scanned:number}}
 */
function scanMemoryDir(dirs, source = 'global') {
  const db = get();
  db.exec('CREATE TABLE IF NOT EXISTS scan_state (scope TEXT PRIMARY KEY, state TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const dirList = (Array.isArray(dirs) ? dirs : [dirs]).filter(Boolean);
  const scopeKey = source + '|' + dirList.join('|');
  const prev = db.prepare('SELECT state FROM scan_state WHERE scope = ?').get(scopeKey);
  const prevMap = prev ? JSON.parse(prev.state) : {};
  const nowMap = {};
  let scanned = 0;
  let upserted = 0;
  let removed = 0;
  const seen = new Set();
  for (const dir of dirList) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      if (f === 'INDEX.md') continue; // 索引文件不是条目
      const fp = path.join(dir, f);
      const entry = extractEntry(fp, source);
      if (!entry) continue;
      scanned++;
      seen.add(entry.id);
      nowMap[entry.id] = entry.hash;
      if (prevMap[entry.id] !== entry.hash) {
        upsertEntry({ ...entry, source });
        upserted++;
      }
    }
  }
  for (const id of Object.keys(prevMap)) {
    if (!seen.has(id)) {
      removeEntry(id);
      removed++;
    }
  }
  db.prepare('INSERT INTO scan_state (scope, state) VALUES (?, ?) ON CONFLICT(scope) DO UPDATE SET state=excluded.state, updated_at=CURRENT_TIMESTAMP')
    .run(scopeKey, JSON.stringify(nowMap));
  return { upserted, removed, scanned };
}

/** 统计 */
function stats() {
  const db = get();
  const entries = db.prepare('SELECT COUNT(*) c FROM entries').get().c;
  const fts = db.prepare('SELECT COUNT(*) c FROM entries_fts').get().c;
  return { entries, fts };
}

/** 关闭所有数据库连接 */
function close() {
  for (const db of _dbs.values()) {
    try { db.close(); } catch { /* ignore */ }
  }
  _dbs.clear();
  _db = null;
}

module.exports = { open, get, migrate, repairFts, parseFrontmatter, extractEntry, upsertEntry, removeEntry, hasEntry, keywordSearch, scanMemoryDir, stats, close };
