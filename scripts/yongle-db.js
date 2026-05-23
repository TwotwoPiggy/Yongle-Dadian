const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ARGS = process.argv.slice(2);
const COMMAND = ARGS[0]; // init | upsert | query
const SCOPE = ARGS[1]; // global | local

const HOME = process.env.YONGLE_HOME || process.env.HOME || process.env.USERPROFILE;
const GLOBAL_DB_PATH = path.join(HOME, '.yongle_knowledge', 'yongle.db');
const LOCAL_DB_PATH = path.join(process.cwd(), '.planning', 'yongle', 'yongle.db');

// Allow explicitly setting the DB path for testing
const DB_PATH = process.env.YONGLE_DB_PATH || (SCOPE === 'local' ? LOCAL_DB_PATH : GLOBAL_DB_PATH);

/**
 * 在 SQLite3 数据库上执行 SQL 查询或命令（通过 stdin 管道输入以解决 Windows 参数乱码问题）
 * @param {string} sql - 要执行的 SQL 语句
 * @returns {string} 数据库标准输出内容
 */
function runSql(sql) {
    try {
        const { spawnSync } = require('child_process');
        const result = spawnSync('sqlite3', [DB_PATH], { 
            input: sql,
            encoding: 'utf8',
            windowsHide: true
        });
        if (result.error) throw result.error;
        if (result.status !== 0) {
            throw new Error(`sqlite3 exited with code ${result.status}: ${result.stderr}`);
        }
        return result.stdout.trim();
    } catch (e) {
        console.error(`SQL Error: ${e.message}`);
        console.error(`Executed SQL: ${sql}`);
        process.exit(1);
    }
}

/**
 * 初始化数据库表结构。如果对应的父文件夹不存在，则自动创建。
 * @returns {void}
 */
function init() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const schema = "CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, date TEXT, resolution_type TEXT, cause_summary TEXT, tags TEXT, filepath TEXT, source TEXT, last_indexed DATETIME DEFAULT CURRENT_TIMESTAMP);";
    runSql(schema);
    console.log(`Database initialized at ${DB_PATH}`);
}

/**
 * 插入或更新一条知识条目记录到 entries 数据库表中。
 * 会根据命令行参数 ARGS[2] 解析 JSON 数据并自动识别其作用域。
 * @returns {void}
 */
function upsert() {
    const dataJson = ARGS[2];
    if (!dataJson) {
        console.error('Missing data JSON for upsert');
        process.exit(1);
    }
    const data = JSON.parse(dataJson);
    
    // Normalize path
    let filepath = data.filepath;
    if (SCOPE === 'local') {
        filepath = path.relative(process.cwd(), filepath);
    } else {
        filepath = path.resolve(filepath);
    }

    const sql = `
        INSERT INTO entries (id, date, resolution_type, cause_summary, tags, filepath, source)
        VALUES (
            '${data.id.replace(/'/g, "''")}',
            '${data.date.replace(/'/g, "''")}',
            '${data.resolution_type.replace(/'/g, "''")}',
            '${data.cause_summary.replace(/'/g, "''")}',
            '${(data.tags || []).join(',').replace(/'/g, "''")}',
            '${filepath.replace(/'/g, "''")}',
            '${SCOPE}'
        )
        ON CONFLICT(id) DO UPDATE SET
            date=excluded.date,
            resolution_type=excluded.resolution_type,
            cause_summary=excluded.cause_summary,
            tags=excluded.tags,
            filepath=excluded.filepath,
            source=excluded.source,
            last_indexed=CURRENT_TIMESTAMP;
    `;
    runSql(sql);
    console.log(`Upserted entry: ${data.id}`);
}

/**
 * 执行通用 SQL 查询，并将查询结果打印输出到标准输出。
 * @returns {void}
 */
function query() {
    const sql = ARGS[2];
    if (!sql) {
        console.error('Missing SQL for query');
        process.exit(1);
    }
    const result = runSql(sql);
    console.log(result);
}

switch (COMMAND) {
    case 'init': init(); break;
    case 'upsert': upsert(); break;
    case 'query': query(); break;
    default:
        // When required as a module, COMMAND might be undefined, so we don't exit if we have exports
        if (require.main === module) {
            console.error(`Unknown command: ${COMMAND}`);
            process.exit(1);
        }
}

module.exports = { runSql, init, upsert, query };
