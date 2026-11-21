/**
 * yongle-wikilinks.test.cjs — Phase 3 双链因果拓扑与 1-Hop 扩散检索测试套件
 */
'use strict';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

let tmp, userDir, projDir;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-wiki-'));
  userDir = path.join(tmp, 'user-kb');
  projDir = path.join(tmp, 'proj');
  fs.mkdirSync(path.join(userDir, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(projDir, '.planning', 'yongle', 'memory'), { recursive: true });
  process.env.YONGLE_HOME = userDir;
});

after(() => {
  delete process.env.YONGLE_HOME;
  delete process.env.YONGLE_GLOBAL_HOME;
  if (tmp) {
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* ignore */ }
  }
});

test('extractWikilinks:能够准确提取 [[wikilinks]]、带描述双链与 markdown 相对链接', () => {
  const yongle = require('../scripts/core/index.js');
  const body = [
    '## 问题背景',
    '在调试过程中，前置依赖于 [[KI-2026-04-0015: Windows命令行字符超长导致子进程挂起]]。',
    '此外还关联了 [[KI-2026-03-0008]] 以及 [Vite启动配置](./20260210-vite-port.md)。',
  ].join('\n');

  const meta = {
    id: 'current-ki',
    related: ['KI-EXTRA-0001', 'KI-EXTRA-0002'],
  };

  const db = yongle.db;
  const dummyFile = path.join(userDir, 'memory', 'test-extract.md');
  fs.writeFileSync(dummyFile, `---\nid: "current-ki"\nrelated: ["KI-EXTRA-0001"]\n---\n\n${body}`, 'utf8');

  const entry = db.extractEntry(dummyFile, 'user');
  assert.ok(entry);
  const links = entry.wikilinks.split(',').filter(Boolean);

  assert.ok(links.includes('KI-2026-04-0015'), '应成功提取带描述的双链 ID');
  assert.ok(links.includes('KI-2026-03-0008'), '应成功提取纯双链 ID');
  assert.ok(links.includes('20260210-vite-port'), '应成功提取 markdown 相对链接目标');
  assert.ok(links.includes('KI-EXTRA-0001'), '应成功提取 related 字段中的条目');
  assert.ok(!links.includes('current-ki'), '不应包含自身的 ID');

  yongle.close();
});

test('hybridSearch 1-Hop 扩散检索:命中深层报错时自动带出前置根因条目', async () => {
  const yongle = require('../scripts/core/index.js');

  // 1. 记录前置根因条目 A: Windows 命令行字符截断
  const recA = await yongle.record({
    level: 'user',
    title: 'Windows 命令行参数长度超过 8191 字符导致子进程挂起',
    summary: 'Windows CMD.exe 限制命令行最大 8191 字符，参数溢出时静默挂起',
    tags: ['windows', 'cmd', 'process'],
    content: '## 根本原因\n\nWindows CMD.exe 命令行总长度限制为 8191 字符。\n\n## 解决方案\n\n使用响应参数文件 (response file) 传递过长参数。',
    embed: false,
  });

  // 2. 记录深层表面现象条目 B: 前端构建静默卡死，并通过 [[wikilinks]] 链接到 A
  const recB = await yongle.record({
    level: 'user',
    title: '前端打包工具在 Windows 下构建静默超时卡死',
    summary: '构建脚本运行数分钟无响应且无报错输出',
    tags: ['frontend', 'build', 'timeout'],
    content: `## 根本原因\n\n打包工具生成内嵌 sourcemap 时传入了过长的参数。\n底层根因参见: [[${recA.id}: 命令行长度超过 8191 限制]]。\n\n## 解决方案\n\n开启打包压缩。`,
    embed: false,
  });

  // 3. 仅针对条目 B 的现象“构建静默超时卡死”进行检索
  const searchRes = await yongle.hybridSearch('构建静默超时卡死', {
    level: 'user',
    cwd: projDir,
    limit: 2,
    expandWikilinks: true,
  });

  assert.ok(searchRes.hits.length >= 2, '命中结果应包含原条目与 1-Hop 扩散因果条目');

  // 原条目 B 应为 Top-1
  const hitB = searchRes.hits[0];
  assert.equal(hitB.id, recB.id);
  assert.equal(hitB.isCausalContext, undefined);

  // 因果扩散条目 A 应在结果中被自动带出
  const hitA = searchRes.hits.find((h) => h.id === recA.id);
  assert.ok(hitA, '因果前置条目 A 应被 1-Hop 扩散带出');
  assert.equal(hitA.isCausalContext, true);
  assert.equal(hitA.causalSource, recB.id);
  assert.ok(hitA.title.includes('[因果关联延伸]'));
  assert.ok(hitA.snippet.includes(`关联自 ${recB.id}`));

  // 验证 searchRes.causalContext 数组也包含该条目
  assert.ok(searchRes.causalContext.some((c) => c.id === recA.id));

  yongle.close();
});

test('防扩散泛滥约束:1-Hop 扩散条目最多只追加 2 条', async () => {
  const yongle = require('../scripts/core/index.js');

  // 创建 3 个根因条目
  const r1 = await yongle.record({ level: 'user', title: '根因条目1', summary: '根因1', tags: ['r1'], embed: false });
  const r2 = await yongle.record({ level: 'user', title: '根因条目2', summary: '根因2', tags: ['r2'], embed: false });
  const r3 = await yongle.record({ level: 'user', title: '根因条目3', summary: '根因3', tags: ['r3'], embed: false });

  // 创建一个同时引用了上述 3 个条目的条目
  const mainEntry = await yongle.record({
    level: 'user',
    title: '复合型综合复杂故障',
    summary: '综合复杂故障',
    tags: ['main'],
    content: `## 引用\n[[${r1.id}]] [[${r2.id}]] [[${r3.id}]]`,
    embed: false,
  });

  const res = await yongle.hybridSearch('复合型综合复杂故障', {
    level: 'user',
    cwd: projDir,
    limit: 1,
    expandWikilinks: true,
  });

  // 扩散条目严格不超过 2 条
  assert.ok(res.causalContext.length <= 2, `扩散条目不应超过 2 条，实际为 ${res.causalContext.length}`);

  yongle.close();
});
