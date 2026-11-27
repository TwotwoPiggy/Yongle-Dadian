'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { logAutoFeature } = require('./yongle-logger');

const USER_PROMPT_KEYWORDS = [
  '报错', 'bug', '问题', '失败', '异常', 'error', 'exception', 'fail',
  '解决', '怎么', '如何', '踩坑', '修复', 'crash', 'timeout', '乱码', '崩溃',
];

const TOOL_ERROR_KEYWORDS = [
  'error', 'exception', 'traceback', 'failed with exit code', 'command failed',
  'enoent', 'enametoolong', 'econnrefused', 'syntaxerror', 'typeerror',
  'referenceerror', 'exited with code',
];

const READONLY_TOOL_PATTERN = /^(read|view|list|find|grep|glob|search|get_file|file_search|grep_search|semantic_search|list_dir)/i;

const SELF_SCRIPT_PATTERN = /yongle-(hybrid-search|auto-search-hook|auto-archive-hook|bg-archiver|lint|status|db|dreamer|confirm)/i;

const YONGLE_INJECTED_MARKER = 'Yongle Dadian 自动检索了知识库中的相关经验';

const YONGLE_AUTO_SYSTEM_SKIP_PATTERNS = [
  /Yongle Dadian 自动检索了知识库中的相关经验/,
  /永乐大典\s*\(Yongle Dadian\)\s*自动检索到以下历史相关经验/,
  /=== Hybrid Search Results:/,
  /Reminder:\s*work efficiently/i,
  /\[Notice\]\s*All your subagents and background tasks have been stopped/i,
];

const NON_ERROR_GENERIC_OUTPUT_PATTERNS = [
  /(?:^|\n)Showing lines \d+-\d+ of \d+/m,
  /(?:^|\n)Partial read \(lines \d+-\d+ of \d+\)/m,
  /(?:^|\n)Showing binary file of type /m,
  /(?:^|\n)Command exited with code 0\./m,
  /(?:^|\n)Made \d+ replacements? in /m,
  /(?:^|\n)Created file\./m,
  /(?:^|\n)Tool is running as a background task with task id:/m,
  /(?:^|\n)Created the following subagent:/m,
  /(?:^|\n)The search for .* returned the following summary:/m,
];

const COMMAND_NONZERO_EXIT_PATTERN = /(?:^|\n)Command exited with code [1-9]\d*\./m;
const STEP_EXECUTION_ERROR_PATTERN = /Encountered error in step execution:|encountered an error and has either stopped or failed to start execution/i;

function getRuntimeArg(argv = process.argv) {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--runtime=')) return arg.slice('--runtime='.length).toLowerCase();
    if (arg === '--runtime' && argv[i + 1]) return String(argv[i + 1]).toLowerCase();
  }
  return '';
}

function normalizeCopilotEvent(eventName) {
  const e = String(eventName || '').trim();
  if (e === 'UserPromptSubmit' || e === 'userPromptSubmitted') return 'UserPromptSubmit';
  if (e === 'PostToolUse' || e === 'postToolUse') return 'PostToolUse';
  return '';
}

function stringifyValue(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch (e) {
    return String(val);
  }
}

/**
 * 从 Antigravity USER_INPUT 原始文本中剥离 XML 包装与系统元数据标签，仅保留真实用户请求。
 */
function extractUserRequestText(rawContent) {
  const text = String(rawContent || '');
  if (!text.trim()) return '';

  const userReqMatch = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  if (userReqMatch) {
    return userReqMatch[1].trim();
  }

  return text
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
    .replace(/<SYSTEM_MESSAGE>[\s\S]*?<\/SYSTEM_MESSAGE>/gi, '')
    .trim();
}

/**
 * 清理 Antigravity 工具/系统报错输出中的时间戳与外层包装，保留核心报错内容。
 */
function cleanAntigravityToolOutput(rawContent) {
  return String(rawContent || '')
    .replace(/^The following is a <SYSTEM_MESSAGE>[\s\S]*?<SYSTEM_MESSAGE>\s*/i, '')
    .replace(/<\/SYSTEM_MESSAGE>\s*$/i, '')
    .replace(/^(?:Created At|Completed At):\s*[^\r\n]*[\r\n]+/gm, '')
    .trim();
}

function isYongleInjectedStep(step) {
  if (!step || typeof step.content !== 'string') return false;
  const upperType = String(step.type || '').toUpperCase();
  if (upperType !== 'SYSTEM_MESSAGE' && upperType !== 'EPHEMERAL_MESSAGE' && upperType !== 'SYSTEM') {
    return false;
  }
  return (
    step.content.includes(YONGLE_INJECTED_MARKER) ||
    step.content.includes('永乐大典 (Yongle Dadian) 自动检索到以下历史相关经验')
  );
}

function resolveHybridSearchScript() {
  const localScript = path.join(__dirname, 'yongle-hybrid-search.js');
  if (fs.existsSync(localScript)) return localScript;

  if (process.env.YONGLE_INSTALL_DIR) {
    const envScript = path.join(process.env.YONGLE_INSTALL_DIR, 'scripts', 'yongle-hybrid-search.js');
    if (fs.existsSync(envScript)) return envScript;
  }

  const manifestCandidates = [
    path.join(__dirname, '..', 'install-manifest.json'),
    path.join(__dirname, '..', 'yongle', 'install-manifest.json'),
  ];
  for (const manifestPath of manifestCandidates) {
    try {
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.source) {
          const srcScript = path.join(manifest.source, 'scripts', 'yongle-hybrid-search.js');
          if (fs.existsSync(srcScript)) return srcScript;
        }
      }
    } catch (e) {}
  }
  return null;
}

function extractQueryFromAntigravityTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { querySource: null, queryContext: '' };
  }

  const transcript = fs.readFileSync(transcriptPath, 'utf8');
  const lines = transcript.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    return { querySource: null, queryContext: '' };
  }

  const startIdx = Math.max(0, lines.length - 15);
  for (let i = lines.length - 1; i >= startIdx; i--) {
    let step;
    try {
      step = JSON.parse(lines[i]);
    } catch (e) {
      continue;
    }
    if (!step || typeof step !== 'object') continue;

    const upperType = String(step.type || '').toUpperCase();

    // 防重入：本阶段（最新 PLANNER_RESPONSE 之后）已注入过永乐大典检索结果时直接跳过
    if (isYongleInjectedStep(step)) {
      return { querySource: null, queryContext: 'ALREADY_INJECTED_SKIP' };
    }

    // 回合步骤边界：遇到模型已产出的 PLANNER_RESPONSE 时立即停止回溯，
    // 防止同回合内后续每次模型调用重复命中同一条 USER_INPUT 或旧工具报错
    if (upperType === 'PLANNER_RESPONSE') {
      break;
    }

    if (upperType === 'USER_INPUT') {
      const cleanUserText = extractUserRequestText(step.content);
      if (!cleanUserText) {
        break;
      }
      if (/^\/yongle[-_a-z0-9]*/i.test(cleanUserText)) {
        return { querySource: null, queryContext: 'YONGLE_CMD_SKIP' };
      }
      const lowerMsg = cleanUserText.toLowerCase();
      if (USER_PROMPT_KEYWORDS.some(kw => lowerMsg.includes(kw))) {
        return { querySource: cleanUserText, queryContext: 'USER_INPUT' };
      }
      break;
    }

    const isToolLikeStep = (
      upperType === 'GENERIC' ||
      upperType === 'TOOL_RESPONSE' ||
      upperType === 'RUN_COMMAND' ||
      upperType === 'SYSTEM' ||
      upperType === 'SYSTEM_MESSAGE'
    );
    if (!isToolLikeStep) continue;

    const rawContent = typeof step.content === 'string' ? step.content : '';
    const rawError = typeof step.error === 'string' ? step.error : '';
    const combinedRaw = [rawError, rawContent].filter(Boolean).join('\n');
    if (!combinedRaw.trim()) continue;

    // 跳过永乐自身脚本与系统通用提醒，防止自递归或噪音误报
    if (
      SELF_SCRIPT_PATTERN.test(combinedRaw) ||
      YONGLE_AUTO_SYSTEM_SKIP_PATTERNS.some(re => re.test(combinedRaw))
    ) {
      continue;
    }

    const isExplicitErrorStatus = String(step.status || '').toUpperCase() === 'ERROR';

    // 非显式 ERROR 状态下，过滤掉只读文件读取、退出码 0 命令、网页搜索摘要等常规成功输出
    if (!isExplicitErrorStatus && NON_ERROR_GENERIC_OUTPUT_PATTERNS.some(re => re.test(rawContent))) {
      continue;
    }

    // 对于 SYSTEM_MESSAGE，仅当明确为非 0 退出码或执行失败通知时才视为工具报错
    if (upperType === 'SYSTEM_MESSAGE' && !isExplicitErrorStatus) {
      const isRealSystemError = (
        COMMAND_NONZERO_EXIT_PATTERN.test(rawContent) ||
        STEP_EXECUTION_ERROR_PATTERN.test(rawContent)
      );
      if (!isRealSystemError) {
        continue;
      }
    }

    const mergedToolRaw = rawError && !rawContent.includes(rawError)
      ? `${rawError}\n${rawContent}`
      : (rawContent || rawError);
    const cleanToolText = cleanAntigravityToolOutput(mergedToolRaw);
    if (!cleanToolText) continue;

    const lowerTool = cleanToolText.toLowerCase();
    const hasErrorSignal = (
      isExplicitErrorStatus ||
      COMMAND_NONZERO_EXIT_PATTERN.test(rawContent) ||
      STEP_EXECUTION_ERROR_PATTERN.test(rawContent) ||
      TOOL_ERROR_KEYWORDS.some(kw => lowerTool.includes(kw))
    );

    if (hasErrorSignal) {
      return { querySource: cleanToolText, queryContext: 'TOOL_ERROR' };
    }
  }

  return { querySource: null, queryContext: '' };
}

function extractQueryFromCopilotPayload(payload, normalizedEvent) {
  // UserPromptSubmit: 检查用户提问是否包含排错/问题/经验检索意图
  if (normalizedEvent === 'UserPromptSubmit' || (!normalizedEvent && (payload.prompt || payload.userPrompt))) {
    const promptText = String(payload.prompt || payload.userPrompt || '').trim();
    if (!promptText) return { querySource: null, queryContext: '', hookEventName: 'UserPromptSubmit' };

    // 若用户已经在显式执行 /yongle-* 斜杠命令，跳过自动搜索避免重复
    if (/^\/yongle[-_a-z0-9]*/i.test(promptText)) {
      return { querySource: null, queryContext: 'YONGLE_CMD_SKIP', hookEventName: 'UserPromptSubmit' };
    }

    const lowerMsg = promptText.toLowerCase();
    if (USER_PROMPT_KEYWORDS.some(kw => lowerMsg.includes(kw))) {
      return { querySource: promptText, queryContext: 'USER_PROMPT', hookEventName: 'UserPromptSubmit' };
    }
    return { querySource: null, queryContext: '', hookEventName: 'UserPromptSubmit' };
  }

  // PostToolUse: 检查工具输出是否包含报错特征
  if (normalizedEvent === 'PostToolUse' || payload.tool_response !== undefined || payload.toolResult !== undefined) {
    const toolName = String(payload.tool_name || payload.toolName || '');
    const toolInputStr = stringifyValue(payload.tool_input !== undefined ? payload.tool_input : payload.toolArgs);

    // 防止永乐大典自身脚本触发递归搜索
    if (SELF_SCRIPT_PATTERN.test(toolInputStr)) {
      return { querySource: null, queryContext: 'YONGLE_SELF_SKIP', hookEventName: 'PostToolUse' };
    }

    const rawResponse = payload.tool_response !== undefined ? payload.tool_response : payload.toolResult;
    const responseText = stringifyValue(rawResponse);
    if (!responseText) return { querySource: null, queryContext: '', hookEventName: 'PostToolUse' };

    const explicitError = Boolean(
      (rawResponse && typeof rawResponse === 'object' && (rawResponse.isError === true || rawResponse.is_error === true || (typeof rawResponse.exitCode === 'number' && rawResponse.exitCode !== 0)))
    );

    // 对纯只读文件浏览/搜索类工具，除非工具明确报错，否则避免因源码含 "error" 字样误触发
    if (READONLY_TOOL_PATTERN.test(toolName) && !explicitError) {
      return { querySource: null, queryContext: 'READONLY_SKIP', hookEventName: 'PostToolUse' };
    }

    const lowerResp = responseText.toLowerCase();
    if (explicitError || TOOL_ERROR_KEYWORDS.some(kw => lowerResp.includes(kw))) {
      return { querySource: responseText, queryContext: 'TOOL_ERROR', hookEventName: 'PostToolUse' };
    }
    return { querySource: null, queryContext: '', hookEventName: 'PostToolUse' };
  }

  return { querySource: null, queryContext: '', hookEventName: '' };
}

function buildCompactQuery(querySource) {
  let query = String(querySource || '').replace(/[\r\n\t]+/g, ' ').trim();
  if (query.length > 500) {
    query = query.substring(0, 250) + ' ... ' + query.substring(query.length - 250);
  }
  return query;
}

function formatHookOutput({ isCopilot, hookEventName, cleanOutput }) {
  if (isCopilot) {
    return {
      hookSpecificOutput: {
        hookEventName: hookEventName || 'UserPromptSubmit',
        additionalContext: `永乐大典 (Yongle Dadian) 自动检索到以下历史相关经验：\n${cleanOutput}\n请优先参考上述历史经验分析与解决当前问题。`,
      },
    };
  }
  return {
    injectSteps: [
      {
        ephemeralMessage: `Yongle Dadian 自动检索了知识库中的相关经验：\n${cleanOutput}\n请优先参考上述经验来分析当前问题。`,
      },
    ],
  };
}

function processHookPayload(payload, options = {}) {
  const startTime = Date.now();
  const runtimeArg = options.runtimeArg !== undefined ? options.runtimeArg : getRuntimeArg(process.argv);
  const rawEvent = payload.hook_event_name || payload.hookEventName || '';
  const normalizedCopilotEvent = normalizeCopilotEvent(rawEvent);
  const isCopilot = runtimeArg === 'copilot' || Boolean(normalizedCopilotEvent);

  let querySource = null;
  let queryContext = '';
  let hookEventName = normalizedCopilotEvent;

  if (isCopilot) {
    const extracted = extractQueryFromCopilotPayload(payload, normalizedCopilotEvent);
    querySource = extracted.querySource;
    queryContext = extracted.queryContext;
    hookEventName = extracted.hookEventName || hookEventName;
  } else {
    const transcriptPath = payload.transcriptPath || payload.transcript_path;
    if (!transcriptPath) {
      return {};
    }
    const extracted = extractQueryFromAntigravityTranscript(transcriptPath);
    querySource = extracted.querySource;
    queryContext = extracted.queryContext;
  }

  if (!querySource) {
    return {};
  }

  const scriptPath = options.searchScriptPath || resolveHybridSearchScript();
  if (!scriptPath) {
    return {};
  }

  const query = buildCompactQuery(querySource);
  if (!query) {
    return {};
  }

  const workDir = payload.cwd && fs.existsSync(payload.cwd) ? payload.cwd : process.cwd();
  const scope = isCopilot && payload.cwd && fs.existsSync(payload.cwd) ? 'auto' : 'global';

  const child = spawnSync(process.execPath, [scriptPath, scope, query], {
    cwd: workDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
    timeout: 7000,
    env: options.env || process.env,
  });
  const output = child.stdout || '';
  const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').trim();

  const hasMatch = Boolean(
    cleanOutput &&
    (cleanOutput.includes('🧠') || cleanOutput.includes('🔍') || cleanOutput.includes('🔗')) &&
    !cleanOutput.includes('Semantic Error') &&
    !cleanOutput.includes('No results found.')
  );

  if (hasMatch) {
    const durationMs = Date.now() - startTime;
    logAutoFeature({
      feature: 'auto-search',
      status: 'HIT',
      durationMs,
      details: `匹配到关联经验 (${isCopilot ? 'copilot:' : ''}${queryContext})`,
    });
    return formatHookOutput({ isCopilot, hookEventName, cleanOutput });
  }

  logAutoFeature({
    feature: 'auto-search',
    status: 'MISS',
    durationMs: Date.now() - startTime,
    details: `未匹配到明显相关排错经验 (${isCopilot ? 'copilot:' : ''}${queryContext || 'NoQuery'})`,
  });

  return {};
}

if (require.main === module) {
  let inputData = '';
  process.stdin.on('data', chunk => {
    inputData += chunk;
  });

  process.stdin.on('end', () => {
    try {
      const payload = inputData.trim() ? JSON.parse(inputData) : {};
      const result = processHookPayload(payload);
      console.log(JSON.stringify(result));
      process.exit(0);
    } catch (err) {
      logAutoFeature({
        feature: 'auto-search',
        status: 'ERROR',
        durationMs: 0,
        error: err.message,
      });
      console.log(JSON.stringify({}));
      process.exit(0);
    }
  });
}

module.exports = {
  getRuntimeArg,
  normalizeCopilotEvent,
  extractUserRequestText,
  cleanAntigravityToolOutput,
  isYongleInjectedStep,
  resolveHybridSearchScript,
  extractQueryFromAntigravityTranscript,
  extractQueryFromCopilotPayload,
  buildCompactQuery,
  formatHookOutput,
  processHookPayload,
};
