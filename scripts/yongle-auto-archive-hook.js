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

    // 无论是何种 Hook 事件，无条件触发梦境守护者 (Dreamer) 静默检查
    const dreamerScript = path.join(__dirname, 'yongle-dreamer.js');
    if (fs.existsSync(dreamerScript)) {
      const dreamerChild = spawn('node', [dreamerScript, '--once'], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, YONGLE_RUNTIME: 'antigravity', ANTIGRAVITY_AGENT: '1', NODE_PATH: combinedNodePath }
      });
      dreamerChild.unref();
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

    // 只要能推导出存在的 transcriptPath 且未显式指定 fullyIdle 为 false，即触发归档检查
    if (transcriptPath && fs.existsSync(transcriptPath) && payload.fullyIdle !== false) {
      const archiverScript = path.join(__dirname, 'yongle-bg-archiver.js');
      
      // 以 Detached (脱机) 模式启动后台归档进程，并切断 stdio 防止阻塞当前进程
      const child = spawn('node', [archiverScript, transcriptPath], {
        detached: true,
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
    
    // Stop 钩子一般不需要返回任何操作（直接输出空或原样放行）
    console.log(JSON.stringify({ decision: "continue" }));
  } catch (error) {
    // 静默失败，绝对不能阻塞主线
    console.log(JSON.stringify({ decision: "continue" }));
  }
});
