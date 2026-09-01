/**
 * 核心引擎三级知识库测试(project/user/global)
 * 使用隔离临时目录,不触碰真实知识库。
 */
'use strict';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

let tmp, userDir, globalDir, projDir;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-test-'));
  userDir = path.join(tmp, 'user-kb');
  globalDir = path.join(tmp, 'global-kb');
  projDir = path.join(tmp, 'proj');
  fs.mkdirSync(path.join(projDir, '.planning', 'yongle'), { recursive: true });
  process.env.YONGLE_HOME = userDir;
  process.env.YONGLE_GLOBAL_HOME = globalDir;
});

after(() => {
  delete process.env.YONGLE_HOME;
  delete process.env.YONGLE_GLOBAL_HOME;
  if (tmp) {
    // LanceDB 句柄无 close API,删除目录可能被占用;重试数轮后放弃(OS 临时目录会自动清理)
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch { /* ignore */ }
  }
});

test('记录与检索:三个级别物理隔离', async () => {
  const yongle = require('../scripts/core/index.js');

  const rP = await yongle.record({ level: 'project', cwd: projDir, title: '项目级经验: 端口冲突排查', summary: '项目内 node 端口被占用时的排查路径', tags: ['node', 'port'], embed: false });
  const rU = await yongle.record({ level: 'user', cwd: projDir, title: '用户级经验: PowerShell 中文乱码', summary: 'PowerShell 输出乱码统一用 UTF-8 显式编码', tags: ['powershell', 'encoding'], embed: false });
  const rG = await yongle.record({ level: 'global', cwd: projDir, title: '全局级规范: 提交信息格式', summary: '团队 commit 统一 conventional commits', tags: ['git', 'convention'], embed: false });

  assert.equal(rP.level, 'project');
  assert.equal(rU.level, 'user');
  assert.equal(rG.level, 'global');
  assert.ok(fs.existsSync(rP.filepath), 'project md written');
  assert.ok(fs.existsSync(rU.filepath), 'user md written');
  assert.ok(fs.existsSync(rG.filepath), 'global md written');

  // 单级别检索各中其一
  const hp = await yongle.hybridSearch('端口冲突', { level: 'project', cwd: projDir });
  assert.equal(hp.hits[0]?.level, 'project');
  const hu = await yongle.hybridSearch('乱码', { level: 'user', cwd: projDir });
  assert.equal(hu.hits[0]?.level, 'user');
  const hg = await yongle.hybridSearch('提交信息', { level: 'global', cwd: projDir });
  assert.equal(hg.hits[0]?.level, 'global');

  // 级别索引物理隔离:每级别只有自己那一条
  const stats = yongle.statsAll({ cwd: projDir });
  const byLevel = Object.fromEntries(stats.map((s) => [s.level, s.entries]));
  assert.deepEqual(byLevel, { project: 1, user: 1, global: 1 });

  yongle.close();
});

test('多级合并检索(auto):命中带级别标签,未配置级别自动跳过', async () => {
  const yongle = require('../scripts/core/index.js');
  await yongle.record({ level: 'project', cwd: projDir, title: '项目端口冲突', summary: '端口排查', embed: false });
  await yongle.record({ level: 'user', cwd: projDir, title: '中文乱码', summary: 'UTF-8 编码', embed: false });
  await yongle.record({ level: 'global', cwd: projDir, title: '提交规范', summary: 'conventional commits', embed: false });

  const all = await yongle.searchAll('乱码 提交 端口', { cwd: projDir });
  assert.deepEqual(Object.keys(all.modes).sort(), ['global', 'project', 'user']);
  const levels = all.hits.map((h) => h.level).sort();
  assert.deepEqual(levels, ['global', 'project', 'user'], '三级各命中一条');

  // 未配置 global → 自动跳过
  delete process.env.YONGLE_GLOBAL_HOME;
  const without = await yongle.searchAll('乱码 提交 端口', { cwd: projDir });
  assert.deepEqual(Object.keys(without.modes).sort(), ['project', 'user']);

  yongle.close();
});

test('别名与守卫:local→project;auto 记录被拒绝;未知级别报错', async () => {
  const yongle = require('../scripts/core/index.js');
  await yongle.record({ level: 'project', cwd: projDir, title: '项目经验', summary: '项目内排查', embed: false });
  await yongle.record({ level: 'user', cwd: projDir, title: '用户经验', summary: 'x', embed: false });

  // local 别名 → project
  const alias = await yongle.hybridSearch('项目经验', { scope: 'local', cwd: projDir });
  assert.equal(alias.hits[0]?.level, 'project');
  assert.ok(alias.hits[0]?.title?.includes('项目经验'), 'hit title contains the entry slug');

  await assert.rejects(() => yongle.record({ level: 'auto', title: 'x', cwd: projDir, embed: false }), /Unknown level|explicit level/);
  await assert.rejects(() => yongle.hybridSearch('x', { level: 'bogus' }), /Unknown level/);

  yongle.close();
});
