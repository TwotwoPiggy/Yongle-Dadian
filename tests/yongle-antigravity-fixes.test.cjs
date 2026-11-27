'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const { installAntigravity2Plugin } = require('../scripts/install-to-antigravity2.js');
const searchHook = require('../scripts/yongle-auto-search-hook.js');

const INSTALL_SCRIPT = path.join(ROOT, 'bin', 'install.js');
const SEARCH_HOOK_SCRIPT = path.join(ROOT, 'scripts', 'yongle-auto-search-hook.js');

function writeJsonl(filePath, items) {
  fs.writeFileSync(filePath, items.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
}

describe('Antigravity 2.0 plugin agent & cleanup + PreInvocation hook fixes', () => {
  let tmpRoot;
  let fakeHome;
  let kbDir;

  before(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yongle-ag-fixes-'));
    fakeHome = path.join(tmpRoot, 'home');
    kbDir = path.join(fakeHome, '.yongle_knowledge');
    fs.mkdirSync(kbDir, { recursive: true });

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
        cwd: tmpRoot,
        title: 'Antigravity ENAMETOOLONG 工具白名单报错排查',
        summary: 'AGENT.md tools 必须使用原生工具名 read_file 与 run_command，不能写 read 或 skill 名称，避免 ENAMETOOLONG 等异常',
        tags: ['antigravity', 'agent', 'enametoolong'],
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

  it('agents/yongle-researcher/AGENT.md template should use valid Antigravity frontmatter & tools', () => {
    const agentPath = path.join(ROOT, 'agents', 'yongle-researcher', 'AGENT.md');
    assert.ok(fs.existsSync(agentPath), 'agents/yongle-researcher/AGENT.md must exist in repo');

    const content = fs.readFileSync(agentPath, 'utf8');
    assert.ok(content.startsWith('---'), 'AGENT.md must start with YAML frontmatter');
    const secondDash = content.indexOf('---', 3);
    assert.ok(secondDash > 3, 'AGENT.md must close YAML frontmatter');

    const fm = content.slice(0, secondDash);
    assert.match(fm, /^name:\s*yongle-researcher$/m);
    assert.match(fm, /^subagent:\s*true$/m);
    assert.match(fm, /^mainAgent:\s*false$/m);
    assert.ok(fm.includes('"read_file"'), 'tools must include native read_file');
    assert.ok(fm.includes('"run_command"'), 'tools must include native run_command');
    assert.ok(!fm.includes('"read"'), 'tools must NOT include invalid tool name "read"');
    assert.ok(!fm.includes('"yongle-search"'), 'tools must NOT include skill name "yongle-search"');
    assert.ok(!/^model:/m.test(fm), 'frontmatter should omit unsupported model field');
    assert.ok(content.includes('{{YONGLE_INSTALL_DIR}}/scripts/yongle-hybrid-search.js'));
    assert.ok(pkg.files.includes('agents'), 'package.json files array should include agents');
  });

  it('installAntigravity2Plugin should sync version, install yongle-researcher, and purge legacy leftovers', () => {
    const pluginDir = path.join(tmpRoot, 'mock-yongle-plugin');

    // Seed legacy artifacts that caused bugs / stale clutter
    fs.mkdirSync(path.join(pluginDir, 'skills', 'yongle-legacy-old'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'skills', 'yongle-legacy-old', 'SKILL.md'), 'old', 'utf8');
    fs.mkdirSync(path.join(pluginDir, 'agents', 'obsolete-agent'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'agents', 'obsolete-agent', 'AGENT.md'), 'old', 'utf8');
    fs.mkdirSync(path.join(pluginDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'rules', 'yongle-autonomous-search.md.disabled'), 'disabled', 'utf8');
    fs.mkdirSync(path.join(pluginDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'scripts', 'auto-search-hook.js'), 'legacy', 'utf8');

    const res = installAntigravity2Plugin({ targetPluginDir: pluginDir, silent: true });

    assert.equal(res.version, pkg.version);
    assert.equal(res.installedSkillsCount, 3);
    assert.equal(res.installedAgentsCount, 1);
    assert.ok(res.removedLegacyFiles.includes('rules/yongle-autonomous-search.md.disabled'));
    assert.ok(res.removedLegacyFiles.includes('scripts/auto-search-hook.js'));

    const pluginJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
    assert.equal(pluginJson.version, pkg.version);

    const installedAgent = fs.readFileSync(
      path.join(pluginDir, 'agents', 'yongle-researcher', 'AGENT.md'),
      'utf8'
    );
    assert.ok(!installedAgent.includes('{{YONGLE_INSTALL_DIR}}'), 'Template path must be resolved');
    assert.ok(installedAgent.includes('tools: ["read_file", "run_command"]'));

    assert.ok(!fs.existsSync(path.join(pluginDir, 'skills', 'yongle-legacy-old')));
    assert.ok(!fs.existsSync(path.join(pluginDir, 'agents', 'obsolete-agent')));
    assert.ok(!fs.existsSync(path.join(pluginDir, 'rules')));
    assert.ok(!fs.existsSync(path.join(pluginDir, 'scripts')));
  });

  it('bin/install.js --global --antigravity should sync existing Antigravity 2.0 plugin automatically', () => {
    const mockHome = path.join(tmpRoot, 'sync-home');
    const pluginDir = path.join(mockHome, '.gemini', 'config', 'plugins', 'yongle-plugin');
    fs.mkdirSync(path.join(pluginDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'rules', 'yongle-autonomous-search.md.disabled'), 'old', 'utf8');

    const env = { ...process.env, HOME: mockHome, USERPROFILE: mockHome };
    execFileSync(process.execPath, [INSTALL_SCRIPT, '--global', '--antigravity'], {
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const pluginJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
    assert.equal(pluginJson.version, pkg.version);
    assert.ok(fs.existsSync(path.join(pluginDir, 'agents', 'yongle-researcher', 'AGENT.md')));
    assert.ok(!fs.existsSync(path.join(pluginDir, 'rules', 'yongle-autonomous-search.md.disabled')));
  });

  it('extractUserRequestText should strip Antigravity XML wrappers and metadata tags', () => {
    const raw = [
      '<USER_REQUEST>',
      '这个报错是为什么?',
      '</USER_REQUEST>',
      '<ADDITIONAL_METADATA>',
      'The current local time is: 2026-11-28T02:01:49+08:00.',
      '- C:/Users/Lemony/bug_report.png',
      '</ADDITIONAL_METADATA>',
      '<USER_SETTINGS_CHANGE>',
      'The user changed setting `Model Selection` from None to Gemini.',
      '</USER_SETTINGS_CHANGE>',
    ].join('\n');

    assert.equal(searchHook.extractUserRequestText(raw), '这个报错是为什么?');

    const normalWithoutError = [
      '<USER_REQUEST>',
      '帮我优化一下页面配色',
      '</USER_REQUEST>',
      '<ADDITIONAL_METADATA>',
      '- C:/tmp/error_bug_screenshot.png',
      '</ADDITIONAL_METADATA>',
    ].join('\n');

    assert.equal(searchHook.extractUserRequestText(normalWithoutError), '帮我优化一下页面配色');
  });

  it('extractQueryFromAntigravityTranscript should avoid metadata false-positives and /yongle-* recursion', () => {
    const t1 = path.join(tmpRoot, 't-meta-only.jsonl');
    writeJsonl(t1, [
      {
        step_index: 0,
        type: 'USER_INPUT',
        content: '<USER_REQUEST>\n帮我把按钮改成蓝色\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n- C:/tmp/error_bug.png\n</ADDITIONAL_METADATA>',
      },
    ]);
    assert.equal(searchHook.extractQueryFromAntigravityTranscript(t1).querySource, null);

    const t2 = path.join(tmpRoot, 't-yongle-cmd.jsonl');
    writeJsonl(t2, [
      {
        step_index: 0,
        type: 'USER_INPUT',
        content: '<USER_REQUEST>\n/yongle-search 为什么报错\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nnow\n</ADDITIONAL_METADATA>',
      },
    ]);
    const r2 = searchHook.extractQueryFromAntigravityTranscript(t2);
    assert.equal(r2.querySource, null);
    assert.equal(r2.queryContext, 'YONGLE_CMD_SKIP');
  });

  it('extractQueryFromAntigravityTranscript should fire once per user turn and NOT repeat across tool steps', () => {
    const tFile = path.join(tmpRoot, 't-dedup.jsonl');

    // Step 0: fresh USER_INPUT -> should trigger once with clean query
    const userStep = {
      step_index: 0,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      content: '<USER_REQUEST>\n这个报错是为什么?\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-11-28\n</ADDITIONAL_METADATA>',
    };
    writeJsonl(tFile, [userStep]);
    const first = searchHook.extractQueryFromAntigravityTranscript(tFile);
    assert.equal(first.queryContext, 'USER_INPUT');
    assert.equal(first.querySource, '这个报错是为什么?');

    // Step 1: already injected Yongle SYSTEM_MESSAGE -> must skip re-injection
    const injectedStep = {
      step_index: 1,
      source: 'SYSTEM_SDK',
      type: 'SYSTEM_MESSAGE',
      content: 'The following is a <SYSTEM_MESSAGE>...\nYongle Dadian 自动检索了知识库中的相关经验：\n🔍 entry',
    };
    writeJsonl(tFile, [userStep, injectedStep]);
    const afterInject = searchHook.extractQueryFromAntigravityTranscript(tFile);
    assert.equal(afterInject.querySource, null);
    assert.equal(afterInject.queryContext, 'ALREADY_INJECTED_SKIP');

    // Step 2-5: after PLANNER_RESPONSE + normal read_file / code-0 run_command / search_web / edit_file -> must NOT re-trigger USER_INPUT or false-trigger on log/code "error" text
    const plannerStep = {
      step_index: 2,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      tool_calls: [{ name: 'read_file' }, { name: 'run_command' }],
    };
    const readFileStep = {
      step_index: 3,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      content: 'Created At: 2026-11-28\nShowing lines 1-20 of 20\n1: ERROR: logging before google.Init: normal info line',
    };
    const cmdOkStep = {
      step_index: 4,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      content: 'Created At: 2026-11-28\nCompleted At: 2026-11-28\nCommand exited with code 0.\n\nCommand output:\nERROR: logging before google.Init',
    };
    const searchWebStep = {
      step_index: 5,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      content: 'Created At: 2026-11-28\nThe search for "Agent error" returned the following summary:\nError explanation...',
    };
    const editFileStep = {
      step_index: 6,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      content: 'Made 1 replacement in d:/repo/src/error.js starting at line 10 (+1/-0 lines).',
    };
    writeJsonl(tFile, [userStep, injectedStep, plannerStep, readFileStep, cmdOkStep, searchWebStep, editFileStep]);
    const afterTools = searchHook.extractQueryFromAntigravityTranscript(tFile);
    assert.equal(afterTools.querySource, null, 'Must not re-trigger USER_INPUT or false-positive on normal tool outputs');

    // Step 7-8: real command failure (exit code 1) after a new PLANNER_RESPONSE -> should trigger TOOL_ERROR with clean text
    const plannerStep2 = { step_index: 7, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'run_command' }] };
    const failedCmdStep = {
      step_index: 8,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      content: 'Created At: 2026-11-28T02:00:00+08:00\nCompleted At: 2026-11-28T02:00:01+08:00\nCommand exited with code 1.\n\nCommand output:\nError: spawn ENAMETOOLONG',
    };
    writeJsonl(tFile, [userStep, injectedStep, plannerStep, readFileStep, plannerStep2, failedCmdStep]);
    const onCmdError = searchHook.extractQueryFromAntigravityTranscript(tFile);
    assert.equal(onCmdError.queryContext, 'TOOL_ERROR');
    assert.ok(onCmdError.querySource.includes('ENAMETOOLONG'));
    assert.ok(!onCmdError.querySource.includes('Created At:'), 'Timestamps header should be stripped');

    // Step 9-10: subagent startup failure SYSTEM_MESSAGE -> should trigger TOOL_ERROR
    const plannerStep3 = { step_index: 9, source: 'MODEL', type: 'PLANNER_RESPONSE' };
    const subagentErrStep = {
      step_index: 10,
      source: 'SYSTEM',
      type: 'SYSTEM_MESSAGE',
      status: 'DONE',
      content: 'The following is a <SYSTEM_MESSAGE> not actually sent by the user.\n\n<SYSTEM_MESSAGE>\n[Message] content=The subagent Yongle Knowledge Recall (yongle-researcher) encountered an error and has either stopped or failed to start execution: unknown component: tool "read" not found in registry\n</SYSTEM_MESSAGE>',
    };
    writeJsonl(tFile, [userStep, injectedStep, plannerStep3, subagentErrStep]);
    const onSubagentErr = searchHook.extractQueryFromAntigravityTranscript(tFile);
    assert.equal(onSubagentErr.queryContext, 'TOOL_ERROR');
    assert.ok(onSubagentErr.querySource.includes('tool "read" not found in registry'));

    // Step 11: new user turn -> should trigger fresh USER_INPUT once again
    const nextUserStep = {
      step_index: 11,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      content: '<USER_REQUEST>\n这个工具白名单报错如何修复？\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nnow\n</ADDITIONAL_METADATA>',
    };
    writeJsonl(tFile, [userStep, injectedStep, plannerStep3, subagentErrStep, nextUserStep]);
    const nextTurn = searchHook.extractQueryFromAntigravityTranscript(tFile);
    assert.equal(nextTurn.queryContext, 'USER_INPUT');
    assert.equal(nextTurn.querySource, '这个工具白名单报错如何修复？');
  });

  it('auto-search hook CLI in Antigravity mode should pass clean query without XML metadata tags', () => {
    const tFile = path.join(tmpRoot, 't-cli-e2e.jsonl');
    writeJsonl(tFile, [
      {
        step_index: 0,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        content: [
          '<USER_REQUEST>',
          'Antigravity 遇到 ENAMETOOLONG 报错怎么解决',
          '</USER_REQUEST>',
          '<ADDITIONAL_METADATA>',
          'The current local time is: 2026-11-28T02:10:00+08:00.',
          '</ADDITIONAL_METADATA>',
          '<USER_SETTINGS_CHANGE>',
          'The user changed setting `Model Selection` from None to Gemini.',
          '</USER_SETTINGS_CHANGE>',
        ].join('\n'),
      },
    ]);

    const env = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      YONGLE_HOME: kbDir,
      YONGLE_GLOBAL_HOME: '',
    };

    const stdout = execFileSync(process.execPath, [SEARCH_HOOK_SCRIPT], {
      input: JSON.stringify({ transcriptPath: tFile, cwd: tmpRoot }),
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const parsed = JSON.parse(stdout.trim());
    const msg = parsed.injectSteps?.[0]?.ephemeralMessage || '';
    assert.ok(msg.includes('ENAMETOOLONG'), 'Should match KB entry');
    assert.ok(msg.includes('Antigravity 遇到 ENAMETOOLONG 报错怎么解决'), 'Should echo clean user request');
    assert.ok(!msg.includes('<USER_REQUEST>'), 'Query echoed in output must not contain <USER_REQUEST>');
    assert.ok(!msg.includes('<ADDITIONAL_METADATA>'), 'Query echoed in output must not contain <ADDITIONAL_METADATA>');
    assert.ok(!msg.includes('Model Selection'), 'Query echoed in output must not contain settings metadata');
  });
});
