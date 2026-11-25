'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SEARCH_HOOK_SCRIPT = path.join(ROOT, 'scripts', 'yongle-auto-search-hook.js');
const ARCHIVE_HOOK_SCRIPT = path.join(ROOT, 'scripts', 'yongle-auto-archive-hook.js');

const searchHook = require('../scripts/yongle-auto-search-hook.js');
const archiveHook = require('../scripts/yongle-auto-archive-hook.js');
const bgArchiver = require('../scripts/yongle-bg-archiver.js');

describe('VS Code Copilot hooks & transcript compatibility', () => {
  let tmpRoot;
  let fakeHome;
  let kbDir;
  let projDir;

  before(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-copilot-test-'));
    fakeHome = path.join(tmpRoot, 'home');
    kbDir = path.join(fakeHome, '.yongle_knowledge');
    projDir = path.join(tmpRoot, 'workspace');
    fs.mkdirSync(kbDir, { recursive: true });
    fs.mkdirSync(projDir, { recursive: true });

    // Disable external embedding calls so FTS search completes deterministically offline
    fs.writeFileSync(
      path.join(kbDir, 'config.json'),
      JSON.stringify({ embedding: { enabled: false }, agent: { enabled: false } }, null, 2),
      'utf8'
    );

    const prevHome = process.env.YONGLE_HOME;
    const prevGlobal = process.env.YONGLE_GLOBAL_HOME;
    process.env.YONGLE_HOME = kbDir;
    delete process.env.YONGLE_GLOBAL_HOME;

    try {
      const yongle = require('../scripts/core/index.js');
      await yongle.record({
        level: 'user',
        cwd: projDir,
        title: 'Windows ENAMETOOLONG 命令行溢出解决方案',
        summary: 'Windows cmd 参数超过 8191 字符触发 ENAMETOOLONG 时改用 stdin 或内存模块化调用',
        tags: ['windows', 'enametoolong', 'node'],
        embed: false,
      });
      yongle.close();
    } finally {
      if (prevHome !== undefined) process.env.YONGLE_HOME = prevHome;
      else delete process.env.YONGLE_HOME;
      if (prevGlobal !== undefined) process.env.YONGLE_GLOBAL_HOME = prevGlobal;
    }
  });

  after(() => {
    if (tmpRoot) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch { /* ignore */ }
    }
  });

  it('extractQueryFromCopilotPayload should classify prompts, tool errors, self-scripts and readonly tools', () => {
    const r1 = searchHook.extractQueryFromCopilotPayload(
      { prompt: '构建报错 ENAMETOOLONG 怎么解决？' },
      'UserPromptSubmit'
    );
    assert.equal(r1.queryContext, 'USER_PROMPT');
    assert.ok(r1.querySource.includes('ENAMETOOLONG'));

    const r2 = searchHook.extractQueryFromCopilotPayload(
      { prompt: '帮我把按钮颜色改成蓝色' },
      'UserPromptSubmit'
    );
    assert.equal(r2.querySource, null);

    const r3 = searchHook.extractQueryFromCopilotPayload(
      { prompt: '/yongle-search ENAMETOOLONG 报错' },
      'UserPromptSubmit'
    );
    assert.equal(r3.querySource, null);
    assert.equal(r3.queryContext, 'YONGLE_CMD_SKIP');

    const r4 = searchHook.extractQueryFromCopilotPayload(
      { tool_name: 'run_in_terminal', tool_input: { command: 'npm run build' }, tool_response: 'Error: spawn ENAMETOOLONG' },
      'PostToolUse'
    );
    assert.equal(r4.queryContext, 'TOOL_ERROR');
    assert.ok(r4.querySource.includes('ENAMETOOLONG'));

    const r5 = searchHook.extractQueryFromCopilotPayload(
      { tool_name: 'read_file', tool_input: { path: 'src/error.js' }, tool_response: 'export class MyError extends Error {}' },
      'PostToolUse'
    );
    assert.equal(r5.querySource, null);
    assert.equal(r5.queryContext, 'READONLY_SKIP');

    const r6 = searchHook.extractQueryFromCopilotPayload(
      { tool_name: 'run_in_terminal', tool_input: { command: 'node scripts/yongle-hybrid-search.js auto error' }, tool_response: 'Error: test' },
      'PostToolUse'
    );
    assert.equal(r6.querySource, null);
    assert.equal(r6.queryContext, 'YONGLE_SELF_SKIP');
  });

  it('auto-search hook should return hookSpecificOutput.additionalContext on UserPromptSubmit hit', () => {
    const env = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      YONGLE_HOME: kbDir,
      YONGLE_GLOBAL_HOME: '',
    };

    const payload = {
      timestamp: new Date().toISOString(),
      cwd: projDir,
      session_id: 'copilot-sess-1',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Windows 遇到 ENAMETOOLONG 报错怎么解决',
    };

    const stdout = execFileSync(process.execPath, [SEARCH_HOOK_SCRIPT, '--runtime=copilot'], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
    assert.ok(
      parsed.hookSpecificOutput?.additionalContext?.includes('ENAMETOOLONG'),
      'additionalContext should include matched Yongle knowledge entry'
    );
  });

  it('auto-search hook should return hookSpecificOutput.additionalContext on PostToolUse error hit', () => {
    const env = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      YONGLE_HOME: kbDir,
      YONGLE_GLOBAL_HOME: '',
    };

    const payload = {
      timestamp: new Date().toISOString(),
      cwd: projDir,
      session_id: 'copilot-sess-2',
      hook_event_name: 'PostToolUse',
      tool_name: 'run_in_terminal',
      tool_input: { command: 'npm run embed' },
      tool_response: 'Error: spawn ENAMETOOLONG failed with exit code 1',
    };

    const stdout = execFileSync(process.execPath, [SEARCH_HOOK_SCRIPT, '--runtime=copilot'], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.hookSpecificOutput?.hookEventName, 'PostToolUse');
    assert.ok(
      parsed.hookSpecificOutput?.additionalContext?.includes('ENAMETOOLONG'),
      'additionalContext should include matched entry on PostToolUse error'
    );
  });

  it('auto-search hook should return empty JSON object for non-error prompt', () => {
    const env = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      YONGLE_HOME: kbDir,
    };

    const stdout = execFileSync(process.execPath, [SEARCH_HOOK_SCRIPT, '--runtime=copilot'], {
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        cwd: projDir,
        prompt: '给 README 添加一个徽章',
      }),
      encoding: 'utf8',
      timeout: 10000,
      env,
    });

    assert.deepEqual(JSON.parse(stdout.trim()), {});
  });

  it('auto-archive hook should obey Copilot Stop contract and stop_hook_active guard', () => {
    const transcriptFile = path.join(tmpRoot, 'copilot-transcript.jsonl');
    fs.writeFileSync(
      transcriptFile,
      JSON.stringify({ role: 'user', content: 'Fix ENAMETOOLONG bug' }) + '\n',
      'utf8'
    );

    const spawned = [];
    const mockSpawn = (cmd, args, opts) => {
      spawned.push({ cmd, args, opts });
      return { unref() {} };
    };

    const out = archiveHook.handleArchiveHook(
      {
        hook_event_name: 'Stop',
        cwd: projDir,
        transcript_path: transcriptFile,
        stop_hook_active: false,
      },
      { runtimeArg: 'copilot', spawn: mockSpawn, logAutoFeature: () => {} }
    );

    assert.deepEqual(out, {}, 'Copilot Stop hook must return {} rather than non-standard decision: allow');
    assert.equal(spawned.length, 2, 'Should spawn dreamer and bg-archiver');
    assert.equal(spawned[0].opts.env.YONGLE_RUNTIME, 'copilot');
    assert.equal(spawned[0].opts.env.ANTIGRAVITY_AGENT, undefined);
    assert.equal(spawned[1].args[1], transcriptFile);

    // stop_hook_active: true must bypass spawning
    const spawnedActive = [];
    const activeOut = archiveHook.handleArchiveHook(
      {
        hook_event_name: 'Stop',
        cwd: projDir,
        transcript_path: transcriptFile,
        stop_hook_active: true,
      },
      {
        runtimeArg: 'copilot',
        spawn: (cmd, args, opts) => {
          spawnedActive.push({ cmd, args, opts });
          return { unref() {} };
        },
      }
    );
    assert.deepEqual(activeOut, {});
    assert.equal(spawnedActive.length, 0, 'Must not spawn when stop_hook_active is true');

    // Antigravity backward compatibility
    const agOut = archiveHook.handleArchiveHook(
      { hookEventName: 'Stop', fullyIdle: false },
      { runtimeArg: 'antigravity', skipSpawn: true }
    );
    assert.deepEqual(agOut, { decision: 'allow' });
  });

  it('auto-archive hook CLI should exit cleanly with {} for Copilot Stop', () => {
    const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
    const stdout = execFileSync(process.execPath, [ARCHIVE_HOOK_SCRIPT, '--runtime=copilot'], {
      input: JSON.stringify({
        hook_event_name: 'Stop',
        cwd: projDir,
        stop_hook_active: true,
      }),
      encoding: 'utf8',
      timeout: 10000,
      env,
    });
    assert.deepEqual(JSON.parse(stdout.trim()), {});
  });

  it('bg-archiver extractTranscriptContext should parse Antigravity JSONL, Copilot JSON and generic JSONL', () => {
    // 1. Antigravity JSONL
    const agFile = path.join(tmpRoot, 'ag.jsonl');
    fs.writeFileSync(
      agFile,
      [
        JSON.stringify({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '修复 SQLite 乱码' }),
        JSON.stringify({ source: 'MODEL', type: 'PLANNER_RESPONSE', content: '改用 stdin 管道传入 UTF-8' }),
      ].join('\n'),
      'utf8'
    );
    const agCtx = bgArchiver.extractTranscriptContext(agFile);
    assert.ok(agCtx.includes('[USER] (USER_INPUT): 修复 SQLite 乱码'));
    assert.ok(agCtx.includes('[AGENT] (PLANNER_RESPONSE): 改用 stdin 管道传入 UTF-8'));

    // 2. VS Code Copilot Chat JSON ({ requests: [...] })
    const copilotJsonFile = path.join(tmpRoot, 'copilot-session.json');
    fs.writeFileSync(
      copilotJsonFile,
      JSON.stringify({
        requests: [
          {
            message: { text: 'TypeError in build step' },
            response: [{ value: 'Added null check before accessing config.proxy.' }],
          },
        ],
      }),
      'utf8'
    );
    const cpJsonCtx = bgArchiver.extractTranscriptContext(copilotJsonFile);
    assert.ok(cpJsonCtx.includes('[USER] (request): TypeError in build step'));
    assert.ok(cpJsonCtx.includes('[AGENT] (response): Added null check before accessing config.proxy.'));

    // 3. Generic / Copilot JSONL ({ role, content })
    const copilotJsonlFile = path.join(tmpRoot, 'copilot-session.jsonl');
    fs.writeFileSync(
      copilotJsonlFile,
      [
        JSON.stringify({ role: 'user', content: 'Fix ESM import error' }),
        JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'Updated extension to .cjs' }] }),
      ].join('\n'),
      'utf8'
    );
    const cpJsonlCtx = bgArchiver.extractTranscriptContext(copilotJsonlFile);
    assert.ok(cpJsonlCtx.includes('[USER] (user): Fix ESM import error'));
    assert.ok(cpJsonlCtx.includes('[AGENT] (assistant): Updated extension to .cjs'));
  });
});
