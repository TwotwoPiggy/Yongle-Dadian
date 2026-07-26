const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let inputData = '';
process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(inputData);
    
    // 只要包含 transcriptPath 且未显式指定 fullyIdle 为 false，即触发归档检查
    if (payload.transcriptPath && payload.fullyIdle !== false) {
      const archiverScript = path.join(__dirname, 'yongle-bg-archiver.js');
      const repoModulesDir = 'D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/node_modules';
      const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
      const combinedNodePath = [nodeModulesDir, repoModulesDir, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
      
      // 以 Detached (脱机) 模式启动后台归档进程，并切断 stdio 防止阻塞当前进程
      const child = spawn('node', [archiverScript, payload.transcriptPath], {
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
