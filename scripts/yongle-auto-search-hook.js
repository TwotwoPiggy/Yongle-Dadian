const fs = require('fs');
const { spawnSync } = require('child_process');
const { logAutoFeature } = require('./yongle-logger');

let inputData = '';
process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(inputData);
    
    if (!payload.transcriptPath) {
      console.log(JSON.stringify({}));
      process.exit(0);
    }
    const startTime = Date.now();
    
    // 读取 transcript
    const transcript = fs.readFileSync(payload.transcriptPath, 'utf8');
    const lines = transcript.trim().split('\n');
    
    // 寻找最近的一条重要交互（用户输入 或 工具报错）
    // 限制往前回溯的步数，比如最后 3 步，避免跨越太早的历史
    let querySource = null;
    let queryContext = '';
    
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
      try {
        const step = JSON.parse(lines[i]);
        if (!step.content || typeof step.content !== 'string') continue;
        
        // 如果是用户输入，判断是否包含问题/报错意图
        if (step.type === 'USER_INPUT') {
          const keywords = ['报错', 'bug', '问题', '失败', '异常', 'error', 'exception', 'fail', '解决', '怎么', '如何'];
          const lowerMsg = step.content.toLowerCase();
          if (keywords.some(kw => lowerMsg.includes(kw))) {
             querySource = step.content;
             queryContext = 'USER_INPUT';
          }
          break; // 遇到用户输入就停止往前找，这标志着一个全新回合
        } 
        
        // 如果是工具执行结果（如终端命令输出），检查是否包含明显的报错特征
        // 包括大写和小写的常见错误标识
        if (step.type === 'TOOL_RESPONSE' || step.type === 'SYSTEM' || step.type === 'tool_response' || step.type === 'RUN_COMMAND') {
           const lowerContent = step.content.toLowerCase();
           if (lowerContent.includes('error') || lowerContent.includes('exception') || lowerContent.includes('traceback') || lowerContent.includes('failed with exit code') || lowerContent.includes('command failed')) {
             querySource = step.content;
             queryContext = 'TOOL_ERROR';
             break;
           }
        }
      } catch(e) {}
    }
    
    if (!querySource) {
      console.log(JSON.stringify({}));
      process.exit(0);
    }
    
    // 调用 yongle-hybrid-search.js
    const scriptPath = 'D:\\Computers\\AIDevelop\\Tools\\Skills\\yongle-dadian\\scripts\\yongle-hybrid-search.js';
    
    // 使用 spawnSync 安全传递长字符串
    // 若错误日志过长，取开头和结尾的关键信息（防超出字数且保留堆栈底部错误）
    let query = querySource.replace(/[\r\n\t]+/g, ' ');
    if (query.length > 500) {
      query = query.substring(0, 250) + ' ... ' + query.substring(query.length - 250);
    }
    
    const child = spawnSync('node', [scriptPath, 'global', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const output = child.stdout || '';
    
    // 清洗 ANSI 色彩字符
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
    
    // 如果找到了结果（通过判定是否包含结果专属的 emoji 前缀）
    if (cleanOutput && (cleanOutput.includes('🧠') || cleanOutput.includes('🔍')) && !cleanOutput.includes('Semantic Error')) {
      const durationMs = Date.now() - startTime;
      logAutoFeature({
        feature: 'auto-search',
        status: 'HIT',
        durationMs,
        details: `匹配到关联经验 (${queryContext})`
      });
      console.log(JSON.stringify({
        injectSteps: [
          {
            ephemeralMessage: `Yongle Dadian 自动检索了知识库中的相关经验：\n${cleanOutput}\n请优先参考上述经验来分析当前问题。`
          }
        ]
      }));
      process.exit(0);
    }
    
    logAutoFeature({
      feature: 'auto-search',
      status: 'MISS',
      durationMs: Date.now() - startTime,
      details: `未匹配到明显相关排错经验 (${queryContext || 'NoQuery'})`
    });

    console.log(JSON.stringify({}));
    process.exit(0);
  } catch (err) {
    logAutoFeature({
      feature: 'auto-search',
      status: 'ERROR',
      durationMs: 0,
      error: err.message
    });
    console.log(JSON.stringify({}));
    process.exit(0);
  }
});
