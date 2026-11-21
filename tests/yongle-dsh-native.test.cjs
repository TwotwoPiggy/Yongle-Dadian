/**
 * tests/yongle-dsh-native.test.cjs
 * 验证永乐大典深度利用 DSH 原生机制的 5 项功能:
 * 1. exec.signal 取消信号透传与中断
 * 2. ctx.effect 插件生命周期资源清理
 * 3. ctx.jobs 后台任务调度与降级
 * 4. tools/post-execute waterfall 即时知识注入(防无效重试)
 * 5. session/event 自定义持久化事件广播
 */
'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

let tmpDir, userDir, projDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-dsh-test-'));
  userDir = path.join(tmpDir, 'user');
  projDir = path.join(tmpDir, 'proj');
  fs.mkdirSync(path.join(projDir, '.planning', 'yongle'), { recursive: true });
  process.env.YONGLE_HOME = userDir;
});

afterEach(() => {
  delete process.env.YONGLE_HOME;
  delete process.env.YONGLE_GLOBAL_HOME;
  const yongle = require('../scripts/core/index.js');
  try { yongle.close(); } catch {}
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
});

// Mock DSH Context
function createMockContext() {
  const listeners = new Map();
  const tools = new Map();
  const commands = new Map();
  const effects = [];
  const emittedEvents = [];
  const startedJobs = [];

  const ctx = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    emit(event, ...args) {
      emittedEvents.push({ event, args });
      const handlers = listeners.get(event) || [];
      for (const h of handlers) {
        try { h(...args); } catch {}
      }
    },
    effect(fn) {
      effects.push(fn());
    },
    tools: {
      register(spec) {
        tools.set(spec.name, spec);
      },
    },
    commands: {
      register(spec) {
        commands.set(spec.name, spec);
      },
    },
    jobs: {
      start(spec) {
        startedJobs.push(spec);
        return { jobId: 'job-123' };
      },
    },
    get(service) {
      if (service === 'jobs') return this.jobs;
      if (service === 'tools') return this.tools;
      if (service === 'commands') return this.commands;
      return null;
    },
    // Helper for testing
    _listeners: listeners,
    _tools: tools,
    _commands: commands,
    _effects: effects,
    _emittedEvents: emittedEvents,
    _startedJobs: startedJobs,
  };
  return ctx;
}

test('1. exec.signal 取消信号: 已 abort 的 signal 立即中止检索且不抛未捕获异常', async () => {
  const yongle = require('../scripts/core/index.js');
  const controller = new AbortController();
  controller.abort(); // 提前中止

  const res = await yongle.hybridSearch('PowerShell 乱码', {
    cwd: projDir,
    signal: controller.signal,
  });

  assert.ok(res);
  assert.ok(Array.isArray(res.hits));
});

test('2. ctx.effect: 插件加载时注册 effect，卸载时触发 yongle.close()', () => {
  const { apply } = require('../dsh/src/index.js');
  const ctx = createMockContext();

  apply(ctx, { maxResults: 5, autoPostmortem: true });

  assert.equal(ctx._effects.length, 1, 'ctx.effect should be registered');
  const teardown = ctx._effects[0];
  assert.equal(typeof teardown, 'function', 'effect teardown should be a function');

  // 调用清理函数应成功无异常
  assert.doesNotThrow(() => teardown());
});

test('3. ctx.jobs 后台任务: /yongle-confirm 与 /yongle-repair 在存在 jobs 时派发后台任务', async () => {
  const { registerCommands } = require('../dsh/src/commands.js');
  const yongle = require('../scripts/core/index.js');
  const ctx = createMockContext();

  registerCommands(ctx, { maxResults: 5 });

  // 1) 先记录一条知识建立基础
  await yongle.record({
    level: 'project',
    title: 'Test Draft Entry',
    summary: 'Testing DSH jobs',
    cwd: projDir,
    embed: false,
  });

  // 2) 创建一个待确认的草稿
  const draftDir = path.join(projDir, '.planning', 'yongle', 'drafts');
  fs.mkdirSync(draftDir, { recursive: true });
  const draftFile = path.join(draftDir, '20260815-test-draft.md');
  fs.writeFileSync(draftFile, [
    '---',
    'id: "20260815-test-draft"',
    'draft: true',
    'cause_summary: "Testing background job"',
    '---',
    '## Content',
  ].join('\n'));

  // 3) 执行 /yongle-confirm
  const confirmCmd = ctx._commands.get('yongle-confirm');
  assert.ok(confirmCmd, 'yongle-confirm should be registered');

  const invocation = {
    rawInput: `${draftFile} --level project`,
    agent: { session: { meta: { cwd: projDir } } },
  };

  const confirmRes = confirmCmd.handler(invocation);
  assert.equal(confirmRes.kind, 'success');
  assert.ok(confirmRes.text.includes('background job started'));
  assert.equal(ctx._startedJobs.length, 1);
  assert.equal(ctx._startedJobs[0].kind, 'yongle-embed');

  // 4) 执行 /yongle-repair --run
  const repairCmd = ctx._commands.get('yongle-repair');
  assert.ok(repairCmd);
  const repairInvocation = {
    rawInput: '--run --level project',
    agent: { session: { meta: { cwd: projDir } } },
  };
  const repairRes = await repairCmd.handler(repairInvocation);
  assert.equal(repairRes.kind, 'success');
  assert.ok(repairRes.text.includes('started as a background job'));
  assert.equal(ctx._startedJobs.length, 2);
  assert.equal(ctx._startedJobs[1].kind, 'yongle-repair');
});

test('4. tools/post-execute waterfall 机制: 工具报错时即时注入知识库提示', async () => {
  const { registerHook } = require('../dsh/src/hooks.js');
  const yongle = require('../scripts/core/index.js');
  const ctx = createMockContext();

  // 准备一条已知经验
  await yongle.record({
    level: 'project',
    title: 'PowerShell Encoding Error',
    summary: 'Set OutputEncoding to UTF-8 to fix garbled output',
    cwd: projDir,
    embed: false,
  });

  registerHook(ctx, { autoPostmortem: true });

  const postExecuteHandlers = ctx._listeners.get('tools/post-execute') || [];
  assert.equal(postExecuteHandlers.length, 1, 'tools/post-execute hook should be registered');

  const handler = postExecuteHandlers[0];

  // 模拟工具执行失败
  const fakeExec = {
    name: 'bash',
    agent: { session: { meta: { cwd: projDir } } },
    signal: new AbortController().signal,
  };
  const fakeResult = {
    isError: true,
    content: [{ type: 'text', text: 'Error: PowerShell Encoding Error occurred' }],
  };

  const next = async () => ({
    isError: true,
    content: [{ type: 'text', text: 'Error: PowerShell Encoding Error occurred' }],
  });

  const modifiedResult = await handler(fakeExec, fakeResult, next);

  assert.ok(modifiedResult);
  assert.ok(Array.isArray(modifiedResult.content));
  const hasHint = modifiedResult.content.some((b) => b.text && b.text.includes('[yongle hint]'));
  assert.ok(hasHint, 'Should contain [yongle hint] for failed tool call');
});

test('5. session/event 持久化事件: 记录与归档时正确广播 session/event', async () => {
  const { registerCommands } = require('../dsh/src/commands.js');
  const ctx = createMockContext();

  registerCommands(ctx, { maxResults: 5 });

  const recordCmd = ctx._commands.get('yongle-record');
  const fakeSession = { meta: { cwd: projDir } };
  const invocation = {
    rawInput: 'Git Lock Fix --level project --summary "Remove index.lock"',
    agent: { session: fakeSession },
  };

  const res = await recordCmd.handler(invocation);
  assert.equal(res.kind, 'success');

  // 检查是否广播了 session/event
  const events = ctx._emittedEvents.filter((e) => e.event === 'session/event');
  assert.ok(events.length >= 1, 'Should emit session/event on record');
  const recordedEvent = events.find((e) => e.args[1]?.type === 'yongle/recorded');
  assert.ok(recordedEvent, 'Should find yongle/recorded event');
  assert.equal(recordedEvent.args[1].data.level, 'project');
});

test('6. UI 卡片与状态看板: 验证 presentResult、草稿卡片与状态看板渲染', async () => {
  const { registerTools } = require('../dsh/src/tools.js');
  const { registerCommands } = require('../dsh/src/commands.js');
  const yongle = require('../scripts/core/index.js');
  const ctx = createMockContext();

  registerTools(ctx, { snippetChars: 140, maxResults: 5 });
  registerCommands(ctx, { maxResults: 5 });

  // 1) 验证 yongle_status 工具的 UI 卡片
  const statusTool = ctx._tools.get('yongle_status');
  assert.ok(statusTool);
  const statusRes = await statusTool.execute({}, { agent: { session: { meta: { cwd: projDir } } } });
  assert.ok(statusRes.text.includes('状态看板'));
  assert.ok(statusRes.text.includes('项目级知识库 (project)'));

  const statusMeta = statusTool.output.presentationMeta({}, statusRes);
  assert.ok(statusMeta.dashboard.includes('状态看板'));
  const statusCard = statusTool.output.presentResult({}, { meta: statusMeta });
  assert.equal(statusCard.card, 'generic');
  assert.ok(statusCard.title.includes('Status'));

  // 2) 验证 yongle_remember 工具的 UI 卡片
  const rememberTool = ctx._tools.get('yongle_remember');
  assert.ok(rememberTool);
  const rememberVal = { level: 'project', id: '20260901-test-entry', path: path.join(projDir, 'test.md') };
  const rememberMeta = rememberTool.output.presentationMeta({ title: 'Test Title', summary: 'Test Summary' }, rememberVal);
  const rememberCard = rememberTool.output.presentResult({}, { meta: rememberMeta });
  assert.equal(rememberCard.card, 'generic');
  assert.ok(rememberCard.title.includes('[project]'));

  // 3) 验证 /yongle-status 人类命令看板输出
  const statusCmd = ctx._commands.get('yongle-status');
  assert.ok(statusCmd);
  const statusCmdRes = statusCmd.handler({ agent: { session: { meta: { cwd: projDir } } } });
  assert.equal(statusCmdRes.kind, 'success');
  assert.ok(statusCmdRes.text.includes('状态看板'));
  assert.ok(statusCmdRes.text.includes('向量模型'));

  // 4) 验证 renderDraftCard 渲染与 /yongle-confirm 指引
  const draftCard = yongle.render.renderDraftCard({
    level: 'project',
    draftPath: path.join(projDir, 'draft.md'),
    title: 'Node OOM Fix',
    root_cause: 'Heap limit exceeded',
  });
  assert.ok(draftCard.includes('Yongle 复盘草稿已生成'));
  assert.ok(draftCard.includes('/yongle-confirm'));
});

test('7. Web API 与可视化管理: 验证 /yongle 与 /api/yongle 路由注册与请求响应', async () => {
  const { apply } = require('../dsh/src/index.js');
  const registeredRoutes = new Map();
  const mockWebCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        registeredRoutes.set(route.path, route);
        return () => {};
      }
    }
  };
  const ctx = createMockContext();
  ctx.inject = (deps, fn) => {
    if (deps.includes('webServer')) fn(mockWebCtx);
  };

  apply(ctx, {});

  assert.ok(registeredRoutes.has('/yongle'), 'Should register /yongle prefix route');
  assert.ok(registeredRoutes.has('/api/yongle'), 'Should register /api/yongle prefix route');

  // 模拟 GET /yongle/config 请求
  const yongleRoute = registeredRoutes.get('/yongle');
  assert.ok(typeof yongleRoute.handler === 'function');

  let statusCode = 0;
  let headers = {};
  let body = '';
  const mockRes = {
    writeHead: (code, h) => { statusCode = code; headers = h; },
    end: (data) => { body = data; }
  };

  await yongleRoute.handler({ method: 'GET', url: '/yongle/config' }, mockRes);
  assert.equal(statusCode, 200);
  const parsed = JSON.parse(body);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.config);
});


