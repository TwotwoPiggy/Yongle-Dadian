/**
 * yongle-evolution.test.cjs — Phase 1 查重预警与原地演进机制(In-place Evolution)测试套件
 */
'use strict';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('node:child_process');

let tmp, userDir, projDir;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-evo-'));
  userDir = path.join(tmp, 'user-kb');
  projDir = path.join(tmp, 'proj');
  fs.mkdirSync(path.join(projDir, '.planning', 'yongle'), { recursive: true });
  process.env.YONGLE_HOME = userDir;
});

after(() => {
  delete process.env.YONGLE_HOME;
  delete process.env.YONGLE_GLOBAL_HOME;
  if (tmp) {
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* ignore */ }
  }
});

/** 注入假 LLM:返回固定蒸馏 JSON */
function fakeLlm(overrides = {}) {
  return async () => JSON.stringify({
    title: 'PowerShell 中文乱码修复',
    bug_phenomenon: 'PowerShell 输出中文显示为乱码',
    root_cause: '控制台输出编码未显式设置为 UTF-8',
    solution: '设置 [Console]::OutputEncoding 为 UTF-8',
    resolution_type: 'config-fix',
    tags: ['powershell', 'encoding'],
    ...overrides,
  });
}

function fakeEvents() {
  return [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'PowerShell 乱码怎么修?' }] } } },
    { type: 'tool/call', data: { turn: 1, name: 'powershell', arguments: 'chcp 936' } },
    { type: 'tool/result', data: { turn: 1, error: { name: 'EncodeError', code: 'E_FAIL' } } },
    { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '修复完成' }] } } },
  ];
}

test('sniffDuplicates:已有条目存在时能准确嗅探并推荐 supplement', async () => {
  const yongle = require('../scripts/core/index.js');
  // 先记录一条已有知识
  const rec = await yongle.record({
    level: 'user',
    title: 'PowerShell 控制台输出乱码',
    summary: '控制台输出编码未显式设置为 UTF-8',
    tags: ['powershell', 'encoding'],
    content: '## 解决方案\n\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    embed: false,
  });
  assert.ok(rec.id);

  // 针对相似问题执行嗅探
  const sniff = await yongle.postmortem.sniffDuplicates({
    query: 'PowerShell 控制台 乱码',
    cwd: projDir,
  });

  assert.equal(sniff.isDuplicateSuspect, true);
  assert.ok(sniff.candidates.length > 0);
  assert.equal(sniff.targetKi, rec.id);
  assert.equal(sniff.suggestedStrategy, 'supplement');
  yongle.close();
});

test('createPostmortemDraft:检测到重复项时自动注入演进控制字段', async () => {
  const yongle = require('../scripts/core/index.js');
  // 预置知识
  const rec = await yongle.record({
    level: 'user',
    title: 'PowerShell 输出乱码',
    summary: '控制台输出编码未显式设置为 UTF-8',
    tags: ['powershell', 'encoding'],
    content: '## 解决方案\n\n设置 UTF-8',
    embed: false,
  });

  const r = await yongle.createPostmortemDraft({
    level: 'user',
    events: fakeEvents(),
    llm: fakeLlm(),
    cwd: projDir,
  });

  assert.equal(r.ok, true);
  assert.equal(r.isDuplicateSuspect, true);
  assert.equal(r.suggestedStrategy, 'supplement');
  assert.equal(r.targetKi, rec.id);

  // 检查生成的草稿文件
  const content = fs.readFileSync(r.draftPath, 'utf8');
  assert.match(content, /^evolution_strategy:\s*"supplement"/m);
  assert.match(content, new RegExp(`target_ki:\\s*"${rec.id}"`, 'm'));
  assert.match(content, /原地演进预警/);
  yongle.close();
});

test('confirmDraft (supplement):原地追加演进小节并更新时间，删除草稿', async () => {
  const yongle = require('../scripts/core/index.js');
  // 1. 创建基础条目
  const rec = await yongle.record({
    level: 'user',
    title: 'Vite 启动端口冲突',
    summary: '端口 5173 被其他进程占用导致启动中断',
    tags: ['vite', 'network'],
    content: '## 解决方案\n\n修改 vite.config.js 的 server.port 为 5174',
    embed: false,
  });
  const originalContent = fs.readFileSync(rec.filepath, 'utf8');

  // 2. 创建一个针对该问题的草稿，策略为 supplement
  const draftRes = await yongle.createPostmortemDraft({
    level: 'user',
    events: fakeEvents(),
    llm: fakeLlm({
      title: 'Vite 端口占用新解法',
      root_cause: 'Node 22 下端口检测行为改变',
      solution: '添加 strictPort: false 自动向后顺延端口',
      resolution_type: 'config-fix',
      tags: ['vite', 'node22'],
    }),
    cwd: projDir,
  });

  // 3. 执行原地增量合流
  const conf = yongle.confirmDraft({
    level: 'user',
    draftPath: draftRes.draftPath,
    strategy: 'supplement',
    targetKi: rec.id,
    conflictNote: '针对 Node 22 环境补充配置 strictPort',
    cwd: projDir,
    embed: false,
  });

  assert.equal(conf.ok, true);
  assert.equal(conf.action, 'supplement');
  assert.equal(conf.id, rec.id);
  assert.ok(!fs.existsSync(draftRes.draftPath), '草稿文件已被删除');

  // 4. 验证旧文件被原地更新
  const updatedContent = fs.readFileSync(rec.filepath, 'utf8');
  assert.ok(updatedContent.includes('## 补充演进'), '包含补充演进标题');
  assert.ok(updatedContent.includes('strictPort: false'), '包含新增的解决方案内容');
  assert.ok(updatedContent.includes('Node 22 环境补充配置'), '包含演进原因');
  assert.match(updatedContent, /^updated_at:\s*"\d{4}-\d{2}-\d{2}/m, '包含 updated_at 字段');

  // 5. 验证检索能够命中新追加的关键词
  const searchHit = await yongle.hybridSearch('strictPort', { level: 'user', cwd: projDir });
  assert.ok(searchHit.hits.some((h) => h.id === rec.id), '可检索到补充更新的内容');
  yongle.close();
});

test('confirmDraft (supersede):废弃旧方案并建立双向追溯，检索降权且带废弃标识', async () => {
  const yongle = require('../scripts/core/index.js');
  // 1. 创建将被推翻的旧条目
  const oldRec = await yongle.record({
    level: 'user',
    title: 'React 项目编译报错 React is not defined',
    summary: 'React 17 之前未显式 import React 导致编译失败',
    tags: ['react', 'jsx'],
    content: '## 解决方案\n\n在每个 JSX 文件顶部显式添加 import React from "react";',
    embed: false,
  });

  // 2. 生成新草稿，推翻旧做法
  const draftRes = await yongle.createPostmortemDraft({
    level: 'user',
    events: fakeEvents(),
    llm: fakeLlm({
      title: 'React 17+ 采用 JSX 自动运行时',
      root_cause: '手动逐文件 import React 冗余且繁琐',
      solution: '在 tsconfig.json 中配置 "jsx": "react-jsx" 彻底消除冗余 import',
      resolution_type: 'config-fix',
      tags: ['react', 'jsx-transform'],
    }),
    cwd: projDir,
  });

  // 3. 执行推翻废弃合流
  const conf = yongle.confirmDraft({
    level: 'user',
    draftPath: draftRes.draftPath,
    strategy: 'supersede',
    targetKi: oldRec.id,
    conflictNote: 'React 17+ 引入了全新 JSX 转换机制，无需手动 import React',
    cwd: projDir,
    embed: false,
  });

  assert.equal(conf.ok, true);
  assert.equal(conf.action, 'supersede');
  assert.equal(conf.supersededTarget, oldRec.id);
  assert.ok(!fs.existsSync(draftRes.draftPath), '草稿文件已删除');

  // 4. 验证旧文件被标记废弃
  const oldContent = fs.readFileSync(oldRec.filepath, 'utf8');
  assert.match(oldContent, /^status:\s*"deprecated"/m, '旧文件 Frontmatter status 为 deprecated');
  assert.match(oldContent, new RegExp(`superseded_by:\\s*"${conf.id}"`, 'm'));
  assert.ok(oldContent.includes('此方案已废弃（Deprecated）'), '旧文件正文包含废弃警告');
  assert.ok(oldContent.includes(conf.id), '旧文件正文指引新替代条目');

  // 5. 验证新文件建立了反向 supersedes 关联
  const newContent = fs.readFileSync(conf.filepath, 'utf8');
  assert.match(newContent, /^status:\s*"active"/m);
  assert.match(newContent, new RegExp(`supersedes:\\s*"${oldRec.id}"`, 'm'));

  // 6. 验证检索体验：废弃条目被打上 [已废弃] 标识，且被降权排在后面
  const hits = await yongle.hybridSearch('React JSX', { level: 'user', cwd: projDir, limit: 5 });
  const oldHit = hits.hits.find((h) => h.id === oldRec.id);
  const newHit = hits.hits.find((h) => h.id === conf.id);

  assert.ok(oldHit, '旧条目仍然可被检索');
  assert.ok(newHit, '新条目可被检索');
  assert.equal(oldHit.deprecated, true, '旧条目标记为 deprecated: true');
  assert.ok(oldHit.title.includes('[已废弃]'), '旧条目标题包含 [已废弃]');
  assert.ok(oldHit.snippet.includes('[已废弃]'), '旧条目摘要包含 [已废弃]');
  assert.ok(oldHit.snippet.includes(conf.id), '旧条目摘要指引了替代方案');

  // 新条目排在旧条目之前（由于旧条目 0.5x 得分惩罚）
  const newIndex = hits.hits.findIndex((h) => h.id === conf.id);
  const oldIndex = hits.hits.findIndex((h) => h.id === oldRec.id);
  assert.ok(newIndex < oldIndex, '新替代方案优先于已废弃方案排在前面');
  yongle.close();
});

test('CLI scripts/yongle-confirm.js:能够通过命令行完成确认演进', () => {
  const yongle = require('../scripts/core/index.js');
  // 创建一个测试草稿
  const p = yongle.paths.resolveLevel('user', projDir, yongle.init());
  const draftDir = path.join(p.root, 'drafts');
  fs.mkdirSync(draftDir, { recursive: true });
  const draftFile = path.join(draftDir, '20260912-cli-test.md');
  fs.writeFileSync(draftFile, [
    '---',
    'id: "20260912-cli-test"',
    'date: "2026-09-12"',
    'resolution_type: "bug-fix"',
    'tags: ["cli", "test"]',
    'cause_summary: "CLI 测试条目"',
    'draft: true',
    '---',
    '',
    '# CLI 测试条目',
    '',
    '## 解决方案',
    '执行成功',
  ].join('\n'), 'utf8');

  yongle.close();

  const script = path.join(__dirname, '..', 'scripts', 'yongle-confirm.js');
  const res = spawnSync(process.execPath, [script, draftFile, '--level', 'user'], {
    env: { ...process.env, YONGLE_HOME: userDir },
    encoding: 'utf8',
  });

  assert.equal(res.status, 0, `CLI failed: ${res.stderr || res.stdout}`);
  assert.ok(res.stdout.includes('归档完成 ✅'));
  assert.ok(!fs.existsSync(draftFile), '草稿已被删除');
  assert.ok(fs.existsSync(path.join(p.memoryDir, '20260912-cli-test.md')), '正式文件已生成');
});
