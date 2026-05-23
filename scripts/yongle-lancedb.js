const fs = require('fs');
const path = require('path');
const os = require('os');
const lancedb = require('vectordb'); // Note: 'vectordb' package as per requirements

/**
 * 获取指定 Scope 下向量数据库文件夹的绝对路径
 * @param {'global'|'local'} scope - 作用域类型
 * @returns {string} 绝对路径
 */
function getDbPath(scope) {
  if (scope === 'global') {
    return path.join(os.homedir(), '.yongle_knowledge', 'vector_store.lance');
  } else if (scope === 'local') {
    return path.join(process.cwd(), '.planning', 'yongle', 'vector_store.lance');
  } else {
    throw new Error(`Unknown scope: ${scope}. Use 'global' or 'local'.`);
  }
}

/**
 * 初始化 LanceDB 数据库链接。如果对应的父文件夹不存在，则自动创建。
 * @param {'global'|'local'} scope - 作用域类型
 * @returns {Promise<any>} 返回连接成功的 db 示例
 */
async function init(scope) {
  const dbPath = getDbPath(scope);
  const dirPath = path.dirname(dbPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  // Initialize db by opening it
  const db = await lancedb.connect(dbPath);
  console.log(JSON.stringify({ status: 'initialized', path: dbPath }));
  return db;
}

/**
 * 插入或更新一条向量记录。
 * 如果存在同 ID 的记录，会先执行删除再写入（实现覆盖）。
 * @param {'global'|'local'} scope - 作用域类型
 * @param {string} dataJson - 要插入的 JSON 字符串，格式包含 id, vector, content, tags 等字段
 * @returns {Promise<void>}
 */
async function upsert(scope, dataJson) {
  const data = JSON.parse(dataJson);
  if (!data.id || !data.vector) {
    throw new Error("dataJson must contain 'id' and 'vector'");
  }

  const dbPath = getDbPath(scope);
  const db = await lancedb.connect(dbPath);

  const dim = data.vector.length;
  const tableName = `vectors_${dim}`;

  const records = [{
    id: data.id,
    content: data.content || '',
    tags: JSON.stringify(data.tags || []),
    vector: data.vector
  }];

  let table;
  const tableNames = await db.tableNames();
  
  if (tableNames.includes(tableName)) {
    table = await db.openTable(tableName);
    // Note: older vectordb uses table.add() or table.overwrite() 
    // LanceDB nodejs sdk supports mergeInsert or just add
    // Since we need to 'upsert', we can use mergeInsert or delete+add
    // Simplified upsert by deleting if exists then adding
    try {
      await table.delete(`id = '${data.id}'`);
    } catch (e) {
      // Ignore if not found
    }
    await table.add(records);
  } else {
    table = await db.createTable(tableName, records);
  }

  console.log(JSON.stringify({ status: 'upserted', id: data.id, table: tableName }));
}

/**
 * 依据查询向量执行最邻近（KNN）语义向量检索
 * @param {'global'|'local'} scope - 作用域类型
 * @param {string} vectorJson - JSON 格式的查询向量数组字符串
 * @param {string} [limitStr] - 返回限制数（字符串形式，如 "5"）
 * @returns {Promise<Array<{id: string, content: string, tags: string[], _distance: number}>>}
 */
async function query(scope, vectorJson, limitStr) {
  const queryVector = JSON.parse(vectorJson);
  const limit = parseInt(limitStr, 10) || 5;

  const dbPath = getDbPath(scope);
  const db = await lancedb.connect(dbPath);

  const dim = queryVector.length;
  const tableName = `vectors_${dim}`;

  const tableNames = await db.tableNames();
  if (!tableNames.includes(tableName)) {
    console.log(JSON.stringify([]));
    return;
  }

  const table = await db.openTable(tableName);
  const results = await table.search(queryVector).limit(limit).execute();

  // The results might contain BigInts or other types that need to be serialized properly
  // Map them to normal objects
  const formattedResults = results.map(r => ({
    id: r.id,
    content: r.content,
    tags: JSON.parse(r.tags || '[]'),
    _distance: r._distance
  }));

  if (require.main === module) {
    console.log(JSON.stringify(formattedResults));
  }
  return formattedResults;
}

async function main() {
  const command = process.argv[2];
  const scope = process.argv[3];

  if (!command || !scope) {
    console.error("Usage: node yongle-lancedb.js <command> <scope> [args]");
    process.exit(1);
  }

  try {
    if (command === 'init') {
      await init(scope);
    } else if (command === 'upsert') {
      const dataJson = process.argv[4];
      if (!dataJson) throw new Error("upsert requires <dataJson>");
      await upsert(scope, dataJson);
    } else if (command === 'query') {
      const vectorJson = process.argv[4];
      const limit = process.argv[5];
      if (!vectorJson) throw new Error("query requires <vectorJson>");
      await query(scope, vectorJson, limit);
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    if (require.main === module) process.exit(1);
    else throw err;
  }
}

if (require.main === module) {
  main();
}

module.exports = { init, upsert, queryLanceDB: query };
