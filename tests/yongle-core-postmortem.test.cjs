/**
 * 复盘草稿管线测试:事件素材提取 → LLM 蒸馏(mock)→ 草稿 → 确认归档
 * 全程离线:注入假 LLM,不调用真实 API。
 */
'use strict';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

let tmp, userDir, projDir;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-pm-'));
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

/** 构造最小会话事件序列(与 dsh-session 形状一致) */
function fakeEvents() {
  return [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'text', text: 'PowerShell 输出中文乱码,怎么修?' }] } } },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"chcp 936"}' } },
    { type: 'tool/result', data: { turn: 1, step: 1, callId: 'c1', message: { role: 'user', content: [{ type: 'tool-result', isError: true, text: 'still garbled' }] } } },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c2', name: 'bash', arguments: '{"command":"[Console]::OutputEncoding=[Text.Encoding]::UTF8"}' } },
    { type: 'tool/result', data: { turn: 1, step: 1, callId: 'c2', message: { role: 'user', content: [{ type: 'tool-result', isError: false, text: 'ok' }] } } },
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '解决:显式设置 OutputEncoding 为 UTF-8' }] } } },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'complete' } } },
  ];
}

/** 注入假 LLM:返回固定蒸馏 JSON */
function fakeLlm() {
  return async () => JSON.stringify({
    title: 'PowerShell 中文乱码修复',
    bug_phenomenon: 'PowerShell 输出中文显示为乱码',
    root_cause: '控制台输出编码未显式设置为 UTF-8',
    solution: '设置 [Console]::OutputEncoding 为 UTF-8',
    resolution_type: 'config-fix',
    tags: ['powershell', 'encoding'],
  });
}

test('extractMaterial:提取用户请求/失败工具/最终方案', () => {
  const pm = require('../scripts/core/postmortem.js');
  const m = pm.extractMaterial(fakeEvents());
  assert.equal(m.turns, 1);
  assert.equal(m.steps, 1);
  assert.equal(m.failures, 1);
  assert.equal(m.successTools, 1);
  assert.equal(m.userRequests.length, 1);
  assert.ok(m.userRequests[0].includes('乱码'));
  assert.equal(m.failedTools.length, 1);
  assert.equal(m.failedTools[0].name, 'bash');
  assert.equal(m.failedTools[0].ok, false);
  assert.ok(m.assistantText.includes('UTF-8'));
  assert.equal(m.hasSolved, true);
});

test('distill:LLM 返回合法 JSON → 草稿字段齐全;返回 solved:false → 拒绝', async () => {
  const pm = require('../scripts/core/postmortem.js');
  const m = pm.extractMaterial(fakeEvents());
  const ok = await pm.distill({ material: m, llm: fakeLlm() });
  assert.equal(ok.ok, true);
  assert.equal(ok.draft.resolution_type, 'config-fix');
  assert.deepEqual(ok.draft.tags, ['powershell', 'encoding']);

  const no = await pm.distill({ material: m, llm: async () => JSON.stringify({ solved: false }) });
  assert.equal(no.ok, false);
  assert.equal(no.error, 'not solved');

  const bad = await pm.distill({ material: m, llm: async () => 'not json at all' });
  assert.equal(bad.ok, false);
});

test('createPostmortemDraft → 草稿文件(draft 标记 + 六字段 frontmatter)', async () => {
  const yongle = require('../scripts/core/index.js');
  const r = await yongle.createPostmortemDraft({
    level: 'user',
    events: fakeEvents(),
    llm: fakeLlm(),
    cwd: projDir,
  });
  assert.equal(r.ok, true);
  assert.equal(r.level, 'user');
  assert.ok(fs.existsSync(r.draftPath));
  const content = fs.readFileSync(r.draftPath, 'utf8');
  assert.match(content, /^draft:\s*true$/m, 'draft marker present');
  assert.match(content, /^id: "/m);
  assert.match(content, /^resolution_type: "config-fix"$/m);
  assert.match(content, /^cause_summary: "/m);
  assert.ok(r.draftPath.includes('drafts'), 'draft stored under <root>/drafts');
  yongle.close();
});

test('confirmDraft → 移入 memory、去 draft 标记、可检索', async () => {
  const yongle = require('../scripts/core/index.js');
  const r = await yongle.createPostmortemDraft({
    level: 'user',
    events: fakeEvents(),
    llm: fakeLlm(),
    cwd: projDir,
  });
  const c = yongle.confirmDraft({ level: 'user', draftPath: r.draftPath, cwd: projDir, embed: false });
  assert.equal(c.ok, true);
  assert.ok(fs.existsSync(c.filepath), 'archived into memory dir');
  assert.ok(!fs.existsSync(r.draftPath), 'draft file removed');
  const content = fs.readFileSync(c.filepath, 'utf8');
  assert.ok(!/^draft:\s*true$/m.test(content), 'draft marker stripped');

  // 归档后可检索
  const hits = await yongle.hybridSearch('乱码', { level: 'user', cwd: projDir });
  assert.ok(hits.hits.some((h) => h.title.includes('乱码')), 'archived entry searchable');
  yongle.close();
});

test('parseFrontmatter 回归:frontmatter 后的正文必须完整提取(曾因单捕获组读 m[2] 恒为空)', () => {
  const yongle = require('../scripts/core/index.js');
  const { parseFrontmatter } = yongle.db;
  const md = [
    '---',
    'id: "reg-test"',
    'cause_summary: "摘要"',
    '---',
    '',
    '# 正文标题',
    '',
    '## 原始问题',
    '',
    'node 报 ERR_MODULE_NOT_FOUND: Cannot find package @deepseek-ai/cordis',
    '',
  ].join('\n');
  const pf = parseFrontmatter(md);
  assert.equal(pf.meta.id, 'reg-test');
  assert.ok(pf.body.includes('原始问题'), 'body contains the full content');
  assert.ok(pf.body.includes('cordis'), 'body contains solution keywords');
  assert.ok(pf.body.length > 40, `body is not truncated (${pf.body.length})`);
  yongle.close();
});

test('confirmDraft:草稿不存在 → 明确报错', () => {
  const yongle = require('../scripts/core/index.js');
  const r = yongle.confirmDraft({ level: 'user', draftPath: path.join(tmp, 'nope.md'), cwd: projDir, embed: false });
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
  yongle.close();
});
