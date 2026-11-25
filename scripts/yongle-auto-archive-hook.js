'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function getRuntimeArg(argv = process.argv) {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--runtime=')) return arg.slice('--runtime='.length).toLowerCase();
    if (arg === '--runtime' && argv[i + 1]) return String(argv[i + 1]).toLowerCase();
  }
  return '';
}

function resolvePackageRoot() {
  if (process.env.YONGLE_INSTALL_DIR && fs.existsSync(process.env.YONGLE_INSTALL_DIR)) {
    return process.env.YONGLE_INSTALL_DIR;
  }
  if (fs.existsSync(path.join(__dirname, '..', 'package.json'))) {
    return path.resolve(__dirname, '..');
  }
  const manifestCandidates = [
    path.join(__dirname, '..', 'install-manifest.json'),
    path.join(__dirname, '..', 'yongle', 'install-manifest.json'),
  ];
  for (const manifestPath of manifestCandidates) {
    try {
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.source && fs.existsSync(manifest.source)) {
          return manifest.source;
        }
      }
    } catch (e) {}
  }
  return path.resolve(__dirname, '..');
}

function resolveScript(scriptName, packageRoot) {
  const pkgScript = path.join(packageRoot, 'scripts', scriptName);
  if (fs.existsSync(pkgScript)) return pkgScript;
  const localScript = path.join(__dirname, scriptName);
  if (fs.existsSync(localScript)) return localScript;
  return null;
}

function getLatestAntigravityTranscriptPath() {
  try {
    const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    if (!fs.existsSync(brainDir)) return null;
    const sessions = fs.readdirSync(brainDir);
    let latestPath = null;
    let latestMtime = 0;
    for (const sid of sessions) {
      const logFile = path.join(brainDir, sid, '.system_generated', 'logs', 'transcript.jsonl');
      if (fs.existsSync(logFile)) {
        const mtime = fs.statSync(logFile).mtimeMs;
        if (mtime > latestMtime) {
          latestMtime = mtime;
          latestPath = logFile;
        }
      }
    }
    return latestPath;
  } catch (e) {
    return null;
  }
}

function handleArchiveHook(payload, options = {}) {
  const runtimeArg = options.runtimeArg !== undefined ? options.runtimeArg : getRuntimeArg(process.argv);
  const eventName = payload.hookEventName || payload.hook_event_name || '';
  const isStop = eventName === 'Stop' || eventName === 'agentStop' || eventName === 'stop';
  const isCopilot = runtimeArg === 'copilot' || Boolean(payload.hook_event_name) || eventName === 'agentStop';

  // VS Code Copilot Stop hook 防重入守卫：若已在强制继续循环中，直接放行
  if (isCopilot && payload.stop_hook_active === true) {
    return {};
  }

  const packageRoot = resolvePackageRoot();
  const repoModulesDir = path.join(packageRoot, 'node_modules');
  const localModulesDir = path.join(__dirname, '..', 'node_modules');
  const combinedNodePath = [localModulesDir, repoModulesDir, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  const workDir = payload.cwd && fs.existsSync(payload.cwd) ? payload.cwd : process.cwd();
  const spawnFn = options.spawn || spawn;

  const childEnv = {
    ...process.env,
    YONGLE_RUNTIME: isCopilot ? 'copilot' : 'antigravity',
    NODE_PATH: combinedNodePath,
  };
  if (isCopilot) {
    delete childEnv.ANTIGRAVITY_AGENT;
  } else {
    childEnv.ANTIGRAVITY_AGENT = '1';
  }

  // 仅在回合结束 (Stop) 时触发后台梦境检查与归档
  if (isStop && !options.skipSpawn) {
    const dreamerScript = resolveScript('yongle-dreamer.js', packageRoot);
    if (dreamerScript) {
      const dreamerChild = spawnFn(process.execPath, [dreamerScript, '--once'], {
        cwd: workDir,
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
        env: childEnv,
      });
      if (dreamerChild && typeof dreamerChild.unref === 'function') dreamerChild.unref();
    }
  }

  // Copilot 仅使用 payload 提供的 transcript_path，避免误扫 Antigravity 日志目录
  const transcriptPath = isCopilot
    ? (payload.transcript_path || payload.transcriptPath || null)
    : (payload.transcript_path
      || payload.transcriptPath
      || (payload.session_id ? path.join(os.homedir(), '.gemini', 'antigravity', 'brain', payload.session_id, '.system_generated', 'logs', 'transcript.jsonl') : null)
      || getLatestAntigravityTranscriptPath());

  if (isStop && transcriptPath && fs.existsSync(transcriptPath) && payload.fullyIdle !== false && !options.skipSpawn) {
    const archiverScript = resolveScript('yongle-bg-archiver.js', packageRoot);
    if (archiverScript) {
      const child = spawnFn(process.execPath, [archiverScript, transcriptPath], {
        cwd: workDir,
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
        env: childEnv,
      });
      if (child && typeof child.unref === 'function') child.unref();

      const logFn = options.logAutoFeature || require('./yongle-logger').logAutoFeature;
      logFn({
        feature: 'auto-archive',
        status: 'RUNNING',
        details: `已触发脱机后台归档进程 (${isCopilot ? 'copilot' : 'antigravity'})`,
      });
    }
  }

  // Copilot Stop hook 返回空对象 {} 表示允许正常停止；Antigravity 保持 { decision: 'allow' }
  if (isCopilot) {
    return {};
  }
  return isStop ? { decision: 'allow' } : {};
}

if (require.main === module) {
  let inputData = '';
  process.stdin.on('data', chunk => {
    inputData += chunk;
  });

  process.stdin.on('end', () => {
    try {
      try {
        const logDir = path.join(os.homedir(), '.yongle_knowledge', 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, 'hook_debug.log'), `${new Date().toISOString()} Input: ${inputData}\n`);
      } catch (e) {}

      let payload = {};
      try {
        if (inputData.trim()) payload = JSON.parse(inputData);
      } catch (e) {}

      const out = handleArchiveHook(payload);
      console.log(JSON.stringify(out));
    } catch (error) {
      // 静默失败，绝对不能阻塞主线
      console.log(JSON.stringify({}));
    }
  });
}

module.exports = {
  getRuntimeArg,
  resolvePackageRoot,
  handleArchiveHook,
};
