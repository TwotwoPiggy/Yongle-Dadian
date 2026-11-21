const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let inputData = '';
process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    try {
      const logDir = 'C:/Users/Lemony/.yongle_knowledge/logs';
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'hook_debug.log'), `${new Date().toISOString()} Input: ${inputData}\n`);
    } catch (e) {}

    let payload = {};
    try { payload = JSON.parse(inputData); } catch (e) {}
    
    const repoModulesDir = 'D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/node_modules';
    const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
    const combinedNodePath = [nodeModulesDir, repoModulesDir, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);

    // 仅在回合结束 (Stop) 时触发后台梦境检查与归档，避免 PostInvocation 每次工具调用都派生子进程
    if (payload.hookEventName === 'Stop') {
      const dreamerScript = path.join(__dirname, 'yongle-dreamer.js');
      if (fs.existsSync(dreamerScript)) {
        const dreamerChild = spawn('node', [dreamerScript, '--once'], {
          detached: true,
          windowsHide: true,
          stdio: 'ignore',
          env: { ...process.env, YONGLE_RUNTIME: 'antigravity', ANTIGRAVITY_AGENT: '1', NODE_PATH: combinedNodePath }
        });
        dreamerChild.unref();
      }
    }

    function getLatestTranscriptPath() {
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
      } catch (e) { return null; }
    }

    // 兼容 transcript_path (蛇形), transcriptPath (驼峰), session_id 推导, 以及自动扫描最新日志保底
    const transcriptPath = payload.transcript_path 
      || payload.transcriptPath 
      || (payload.session_id ? path.join(os.homedir(), '.gemini', 'antigravity', 'brain', payload.session_id, '.system_generated', 'logs', 'transcript.jsonl') : null)
      || getLatestTranscriptPath();

    // 仅在 Stop 事件且 fullyIdle !== false 时触发后台归档进程
    if (payload.hookEventName === 'Stop' && transcriptPath && fs.existsSync(transcriptPath) && payload.fullyIdle !== false) {
      const archiverScript = path.join(__dirname, 'yongle-bg-archiver.js');
      
      // 以 Detached (脱机) + windowsHide 模式启动后台归档进程，防止 Windows 弹出黑框窗口
      const child = spawn('node', [archiverScript, transcriptPath], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
        env: { ...process.env, YONGLE_RUNTIME: 'antigravity', NODE_PATH: combinedNodePath }
      });
      
      child.unref(); // 让当前 Hook 脚本可以立刻退出

      const { logAutoFeature } = require('./yongle-logger');
      logAutoFeature({
        feature: 'auto-archive',
        status: 'RUNNING',
        details: '已触发脱机后台归档进程'
      });
    }
    
    // Stop 钩子中 "continue" 表示阻止停止并重入循环，"allow" 表示正常允许结束；其他钩子返回空对象 {}
    const out = payload && payload.hookEventName === 'Stop' ? { decision: 'allow' } : {};
    console.log(JSON.stringify(out));
  } catch (error) {
    // 静默失败，绝对不能阻塞主线
    console.log(JSON.stringify({}));
  }
});
