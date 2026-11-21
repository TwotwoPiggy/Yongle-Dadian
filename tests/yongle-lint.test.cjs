/**
 * yongle-lint.test.cjs — Phase 2 自动化健康巡检系统 (/yongle-lint) 测试套件
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-lint-'));
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

test('lintStructure:能够精准发现破损 Frontmatter、缺漏字段、孤儿条目与死链', async () => {
  const yongle = require('../scripts/core/index.js');
  const memDir = path.join(userDir, 'memory');

  // 1. 正常条目 (已建立索引)
  await yongle.record({
    level: 'user',
    title: '正常条目1',
    summary: '这是正常测试条目',
    tags: ['test'],
    content: '## 解决方案\n\n正常内容',
    embed: false,
  });

  // 2. 破损 Frontmatter 文件 (无 --- 围栏)
  fs.writeFileSync(path.join(memDir, 'corrupt.md'), '这是一份完全没有 Frontmatter 的破烂文件', 'utf8');

  // 3. 缺少必填字段的文件 (缺少 date 和 tags)
  fs.writeFileSync(path.join(memDir, 'missing-fields.md'), [
    '---',
    'id: "missing-fields"',
    'resolution_type: "bug-fix"',
    'cause_summary: "缺少关键字段"',
    '---',
    '',
    '## 解决方案',
    '内容',
  ].join('\n'), 'utf8');

  // 4. 包含死链的文件
  fs.writeFileSync(path.join(memDir, 'broken-link.md'), [
    '---',
    'id: "broken-link"',
    'date: "2026-09-12"',
    'resolution_type: "bug-fix"',
    'tags: ["link"]',
    'cause_summary: "包含死链"',
    '---',
    '',
    '## 解决方案',
    '参见前置原因 [[KI-GHOST-9999]] 以及 [旧方案](./non-existent.md)',
  ].join('\n'), 'utf8');

  // 执行巡检
  const res = yongle.lintStructure({ level: 'user' });

  assert.equal(res.level, 'user');
  assert.ok(res.issues.length >= 4, `应至少检测出 4 个隐患，实际检测出 ${res.issues.length}`);

  const types = res.issues.map((i) => i.type);
  assert.ok(types.includes('frontmatter_corrupt'), '应包含 frontmatter_corrupt');
  assert.ok(types.includes('missing_fields'), '应包含 missing_fields');
  assert.ok(types.includes('orphan_entry'), '应包含 orphan_entry');
  assert.ok(types.includes('broken_link'), '应包含 broken_link');

  const brokenLinkIssue = res.issues.find((i) => i.type === 'broken_link');
  assert.ok(brokenLinkIssue.target.includes('KI-GHOST-9999') || brokenLinkIssue.target.includes('non-existent'));

  yongle.close();
});

test('lintStructure:能够检测出数据库中的幽灵记录 (Ghost Records)', async () => {
  const yongle = require('../scripts/core/index.js');

  // 1. 记录一条知识
  const rec = await yongle.record({
    level: 'user',
    title: '即将被删除的文件',
    summary: '物理文件被删后残留的数据库记录',
    tags: ['ghost'],
    embed: false,
  });

  // 2. 模拟外部物理删除文件 (使数据库产生幽灵记录)
  assert.ok(fs.existsSync(rec.filepath));
  fs.unlinkSync(rec.filepath);

  // 3. 执行巡检
  const res = yongle.lintStructure({ level: 'user' });
  const ghost = res.issues.find((i) => i.type === 'ghost_record');
  assert.ok(ghost, '应检测到幽灵记录');
  assert.equal(ghost.id, rec.id);

  yongle.close();
});

test('autoFix:能够自动自愈修复破损、缺漏、幽灵与孤儿问题', async () => {
  const yongle = require('../scripts/core/index.js');
  const memDir = path.join(userDir, 'memory');

  // 制造幽灵记录
  const rec = await yongle.record({
    level: 'user',
    title: '幽灵条目',
    summary: '摘要',
    tags: ['ghost'],
    embed: false,
  });
  fs.unlinkSync(rec.filepath);

  // 制造缺少字段的文件
  const missingFile = path.join(memDir, 'fix-me.md');
  fs.writeFileSync(missingFile, [
    '---',
    'id: "fix-me"',
    'cause_summary: "需要补全字段"',
    '---',
    '',
    '正文内容',
  ].join('\n'), 'utf8');

  // 1. 先体检
  const check1 = yongle.lintStructure({ level: 'user' });
  assert.ok(check1.issues.length > 0);

  // 2. 执行修复
  const fixRes = yongle.autoFix(check1.issues, { level: 'user' });
  assert.ok(fixRes.fixedCount >= 2, `修复数量应 >= 2, 实际为 ${fixRes.fixedCount}`);

  // 3. 验证幽灵已被剔除
  const p = yongle.paths.resolveLevel('user', null, yongle.init());
  yongle.db.open(p.db);
  assert.equal(yongle.db.hasEntry(rec.id), false, '幽灵记录应从数据库中移除');

  // 4. 验证缺少字段的文件已被补全
  const fixedContent = fs.readFileSync(missingFile, 'utf8');
  assert.match(fixedContent, /^date:\s*"\d{4}-\d{2}-\d{2}"/m);
  assert.match(fixedContent, /^tags:/m);
  assert.match(fixedContent, /^resolution_type:\s*"other"/m);

  // 5. 再次体检，确认已无 error 和 warning
  const check2 = yongle.lintStructure({ level: 'user' });
  assert.equal(check2.stats.errorCount, 0, '修复后 error 应为 0');
  assert.equal(check2.stats.warnCount, 0, '修复后 warn 应为 0');

  yongle.close();
});

test('lintSemantic:能够审计出标记为废弃但缺少替代方案的条目', async () => {
  const yongle = require('../scripts/core/index.js');

  // 记录一条废弃但未指定替代方案的条目
  const rec = await yongle.record({
    level: 'user',
    title: '孤立废弃条目',
    summary: '已废弃但没人知道用什么代替',
    tags: ['deprecated'],
    content: '## 解决方案\n\n旧解法',
    embed: false,
  });

  // 修改其 status 为 deprecated，但留空 superseded_by
  const content = fs.readFileSync(rec.filepath, 'utf8');
  const updated = content.replace(/^resolution_type:.*$/m, 'resolution_type: "bug-fix"\nstatus: "deprecated"');
  fs.writeFileSync(rec.filepath, updated, 'utf8');
  yongle.reindex({ level: 'user' });

  const semRes = await yongle.lintSemantic({ level: 'user' });
  assert.ok(semRes.issues.length > 0);
  const depIssue = semRes.issues.find((i) => i.type === 'deprecated_without_replacement');
  assert.ok(depIssue, '应审计出未指定替代者的废弃条目');
  assert.equal(depIssue.id, rec.id);

  yongle.close();
});

test('CLI scripts/yongle-lint.js:支持 --json 格式化输出与终端执行', () => {
  const script = path.join(__dirname, '..', 'scripts', 'yongle-lint.js');
  const res = spawnSync(process.execPath, [script, 'user', '--json'], {
    env: { ...process.env, YONGLE_HOME: userDir },
    encoding: 'utf8',
  });

  assert.equal(res.status, 0, `CLI failed: ${res.stderr || res.stdout}`);
  const parsed = JSON.parse(res.stdout);
  assert.ok(parsed.results, '输出应包含 results 字段');
  assert.ok(parsed.results.length > 0);
  assert.equal(parsed.results[0].level, 'user');
});
