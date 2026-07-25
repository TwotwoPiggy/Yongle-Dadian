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
    
    // 只有当所有后台任务结束且 Agent 完全空闲时才触发归档
    if (payload.fullyIdle && payload.transcriptPath) {
      const archiverScript = path.join(__dirname, 'yongle-bg-archiver.js');
      
      // 以 Detached (脱机) 模式启动后台归档进程，并切断 stdio 防止阻塞当前进程
      const child = spawn('node', [archiverScript, payload.transcriptPath], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, YONGLE_RUNTIME: 'antigravity' }
      });
      
      child.unref(); // 让当前 Hook 脚本可以立刻退出
    }
    
    // Stop 钩子一般不需要返回任何操作（直接输出空或原样放行）
    console.log(JSON.stringify({ decision: "continue" }));
  } catch (error) {
    // 静默失败，绝对不能阻塞主线
    console.log(JSON.stringify({ decision: "continue" }));
  }
});
