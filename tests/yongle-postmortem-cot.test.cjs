/**
 * Phase 4: 双阶段思维链复盘流水线 (Two-Step CoT Postmortem) 单元测试
 * Stage 1 (Reasoning Pass: 纯归因与试错分析)
 * Stage 2 (Compilation Pass: 结构化编译与元数据对齐)
 */
'use strict';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

let tmp, userDir, projDir;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-cot-'));
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

function fakeEvents() {
  return [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'text', text: 'Docker 构建时找不到 package.json，如何解决？' }] } } },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"docker build -t app ."}' } },
    { type: 'tool/result', data: { turn: 1, step: 1, callId: 'c1', message: { role: 'user', content: [{ type: 'tool-result', isError: true, text: 'COPY failed: file not found in build context: package.json' }] } } },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c2', name: 'bash', arguments: '{"command":"cp frontend/package.json . && docker build -t app ."}' } },
    { type: 'tool/result', data: { turn: 1, step: 1, callId: 'c2', message: { role: 'user', content: [{ type: 'tool-result', isError: false, text: 'Successfully built 7a8b9c' }] } } },
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '问题已解决：调整了 Dockerfile 上下文并正确复制了 package.json' }] } } },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'complete' } } },
  ];
}

test('distillTwoStep: 正常流转两阶段，Stage 1 输出推理事实，Stage 2 编译结构化草稿', async () => {
  const pm = require('../scripts/core/postmortem.js');
  const m = pm.extractMaterial(fakeEvents());

  let stageCalls = [];
  const fakeLlm = async (prompt, system) => {
    stageCalls.push({ prompt, system });
    if (system.includes('Compilation Pass')) {
      return JSON.stringify({
        title: 'Docker 多模块构建上下文丢失 package.json 修复',
        bug_phenomenon: 'docker build 时提示 COPY failed: file not found in build context',
        root_cause: 'Docker build context 未对齐子目录路径，导致 COPY package.json 找不到文件',
        solution: '调整 Dockerfile 的 COPY 路径或显式指定 build context 根目录',
        resolution_type: 'config-fix',
        tags: ['docker', 'build', 'monorepo'],
      });
    }

    if (system.includes('Reasoning Pass')) {
      return `
### 1. 现场还原与报错
最初报错: COPY failed: file not found in build context: package.json
发生在 docker build 执行阶段。

### 2. 负面尝试与失败归因
- 尝试 1: 直接在根目录执行 docker build，由于 package.json 位于 frontend/ 子目录，上下文路径未对齐导致失败。

### 3. 底层物理/逻辑根因
Docker build context 默认以当前目录为基准，但在多模块工程中 Dockerfile 指定了根级 COPY，路径不匹配。

### 4. 解决验证与关键动作
将构建上下文指向正确路径，成功构建镜像 7a8b9c。状态验证通过。
STATUS: SOLVED
`;
    }

    throw new Error('Unknown stage system prompt');
  };

  const res = await pm.distillTwoStep({ material: m, llm: fakeLlm });

  assert.equal(res.ok, true);
  assert.equal(stageCalls.length, 2, '必须调用两个阶段');
  assert.ok(res.reasoning.includes('现场还原与报错'));
  assert.ok(res.reasoning.includes('负面尝试与失败归因'));
  assert.equal(res.draft.title, 'Docker 多模块构建上下文丢失 package.json 修复');
  assert.equal(res.draft.resolution_type, 'config-fix');
  assert.deepEqual(res.draft.tags, ['docker', 'build', 'monorepo']);
});

test('distillTwoStep: Stage 1 判定任务未真正解决 (STATUS: UNSOLVED) 时直接拦截，不触发 Stage 2', async () => {
  const pm = require('../scripts/core/postmortem.js');
  const m = pm.extractMaterial(fakeEvents());

  let stage2Invoked = false;
  const fakeLlm = async (prompt, system) => {
    if (system.includes('Compilation Pass')) {
      stage2Invoked = true;
      return '{}';
    }
    if (system.includes('Reasoning Pass')) {
      return `
问题分析：虽然用户尝试了两次，但只是通过写死假数据绕过了报错，核心编译依然失败。
STATUS: UNSOLVED
`;
    }
    return '';
  };

  const res = await pm.distillTwoStep({ material: m, llm: fakeLlm });

  assert.equal(res.ok, false);
  assert.equal(res.error, 'not solved');
  assert.equal(stage2Invoked, false, '未解决时 Stage 2 绝对不能被执行');
});

test('distillTwoStep: 异常处理 (Stage 1 为空 / Stage 2 非有效 JSON)', async () => {
  const pm = require('../scripts/core/postmortem.js');
  const m = pm.extractMaterial(fakeEvents());

  // Stage 1 为空
  const emptyStage1 = await pm.distillTwoStep({
    material: m,
    llm: async () => '   ',
  });
  assert.equal(emptyStage1.ok, false);
  assert.match(emptyStage1.error, /Stage 1 reasoning pass produced empty output/);

  // Stage 2 非 JSON
  const badStage2 = await pm.distillTwoStep({
    material: m,
    llm: async (prompt, system) => {
      if (system.includes('Reasoning Pass')) return 'Reasoning ok... STATUS: SOLVED';
      return 'Sorry, I cannot compile this into JSON';
    },
  });
  assert.equal(badStage2.ok, false);
  assert.match(badStage2.error, /not JSON/);
});

test('端到端: createPostmortemDraft({ twoStep: true }) 支持双阶段并生成草稿文件', async () => {
  const yongle = require('../scripts/core/index.js');

  const fakeLlm = async (prompt, system) => {
    if (system.includes('Compilation Pass')) {
      return JSON.stringify({
        title: 'PowerShell 终端字符编码乱码修复',
        bug_phenomenon: 'PowerShell 输出中文乱码',
        root_cause: '输出流未指定 UTF-8 编码',
        solution: '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
        resolution_type: 'config-fix',
        tags: ['powershell', 'encoding'],
      });
    }
    if (system.includes('Reasoning Pass')) {
      return '### 归因推导\n由于 OutputEncoding 缺失导致乱码。\nSTATUS: SOLVED';
    }
    return '';
  };

  const res = await yongle.createPostmortemDraft({
    level: 'user',
    events: fakeEvents(),
    llm: fakeLlm,
    twoStep: true,
    cwd: projDir,
  });

  assert.equal(res.ok, true);
  assert.ok(res.draftPath);
  assert.ok(fs.existsSync(res.draftPath));
  assert.ok(res.reasoning.includes('由于 OutputEncoding 缺失导致乱码'));
  assert.equal(res.draft.title, 'PowerShell 终端字符编码乱码修复');

  const content = fs.readFileSync(res.draftPath, 'utf8');
  assert.ok(content.includes('draft: true'));
  assert.ok(content.includes('resolution_type: "config-fix"'));
});
