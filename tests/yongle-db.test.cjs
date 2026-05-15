'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DB_SCRIPT = path.join(ROOT, 'scripts', 'yongle-db.js');

describe('yongle-db.js', () => {
  const tmpDir = path.join(ROOT, 'tests', '.tmp-db-test-' + Date.now());
  const dbPath = path.join(tmpDir, 'test-yongle.db');

  function cleanup() {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it('should show error for unknown command', () => {
    assert.throws(() => {
      execFileSync(process.execPath, [DB_SCRIPT, 'badcmd', 'global'], {
        encoding: 'utf8',
        timeout: 10000,
      });
    });
  });

  // sqlite3 may not be available in CI, so these tests are guarded
  it('should attempt to init a database', () => {
    cleanup();
    fs.mkdirSync(tmpDir, { recursive: true });
    
    const env = { ...process.env, YONGLE_DB_PATH: dbPath };
    
    try {
      execFileSync(process.execPath, [DB_SCRIPT, 'init', 'global'], {
        encoding: 'utf8',
        timeout: 10000,
        env,
      });
      assert.ok(fs.existsSync(dbPath), 'Database file should be created');
    } catch (e) {
      // sqlite3 CLI not available — skip gracefully
      if (e.message && e.message.includes('sqlite3')) {
        console.log('    ⚠ sqlite3 CLI not found, skipping DB init test');
      } else {
        throw e;
      }
    }

    cleanup();
  });

  it('should require data JSON for upsert', () => {
    assert.throws(() => {
      execFileSync(process.execPath, [DB_SCRIPT, 'upsert', 'global'], {
        encoding: 'utf8',
        timeout: 10000,
      });
    }, /Missing data JSON/);
  });

  it('should require SQL for query', () => {
    assert.throws(() => {
      execFileSync(process.execPath, [DB_SCRIPT, 'query', 'global'], {
        encoding: 'utf8',
        timeout: 10000,
      });
    }, /Missing SQL/);
  });
});
