const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logAutoFeature, getRecentLogs, logFilePath, archiveDir } = require('../scripts/yongle-logger.js');

test('yongle-logger auto-feature status logging & rotation', (t) => {
  // 基础日志写入与读取
  logAutoFeature({
    feature: 'auto-search',
    status: 'HIT',
    durationMs: 45,
    details: 'Matched 2 entries'
  });

  const logs = getRecentLogs(5);
  assert.ok(logs.length > 0);
  const last = logs[logs.length - 1];
  assert.strictEqual(last.feature, 'auto-search');
  assert.strictEqual(last.status, 'HIT');
  assert.strictEqual(last.duration_ms, 45);
});
