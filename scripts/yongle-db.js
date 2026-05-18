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

function init() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const schema = "CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, date TEXT, resolution_type TEXT, cause_summary TEXT, tags TEXT, filepath TEXT, source TEXT, last_indexed DATETIME DEFAULT CURRENT_TIMESTAMP);";
    runSql(schema);
    console.log(`Database initialized at ${DB_PATH}`);
}

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
