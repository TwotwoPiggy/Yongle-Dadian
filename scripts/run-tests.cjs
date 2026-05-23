#!/usr/bin/env node
/**
 * @file 永乐大典 — 跨平台单元测试运行器。加载 tests/ 下的全部以 `.test.cjs` 结尾的文件并使用 Node.js 原生测试运行器并发运行。
 */
'use strict';

const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const testDir = join(__dirname, '..', 'tests');
const files = readdirSync(testDir)
  .filter(f => f.endsWith('.test.cjs'))
  .sort()
  .map(f => join('tests', f));

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

const concurrency = process.env.TEST_CONCURRENCY
  ? `--test-concurrency=${process.env.TEST_CONCURRENCY}`
  : '--test-concurrency=4';

try {
  execFileSync(process.execPath, ['--test', concurrency, ...files], {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: join(__dirname, '..'),
  });
} catch (err) {
  process.exit(err.status || 1);
}
