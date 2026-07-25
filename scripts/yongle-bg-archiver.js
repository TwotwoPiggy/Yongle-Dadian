const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAgentCompletion } = require('./yongle-agent-api.js');
const os = require('os');

// 获取日志路径
const transcriptPath = process.argv[2];
if (!transcriptPath || !fs.existsSync(transcriptPath)) {
  process.exit(0);
}

// 帮助函数：非阻塞休眠
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  try {
    // 1. 读取并提取上下文 (最近 40 条记录)
    const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n').slice(-40);
    let context = '';
    for (const line of lines) {
      if (!line) continue;
      try {
        const step = JSON.parse(line);
        if (step.type === 'USER_INPUT' || step.type === 'PLANNER_RESPONSE' || step.type === 'RUN_COMMAND') {
           const role = step.source === 'USER_EXPLICIT' ? 'USER' : 'AGENT';
           let content = step.content || '';
           if (content.length > 500) content = content.substring(0, 500) + '...[truncated]';
           context += `[${role}] (${step.type}): ${content}\n\n`;
        }
      } catch (e) {}
    }

    if (!context.trim()) process.exit(0);

    const prompt = `你是一个代码审查与归档专家。请分析以下开发日志的结尾部分，判断 Agent 是否**刚刚成功解决**了一个技术问题或 Bug。
如果是闲聊、正在进行中、或者失败了，请返回 JSON: {"solved": false}
如果成功解决了，请提取经验并返回严格的 JSON 格式（不要有多余的 markdown 代码块包裹）：
{
  "solved": true,
  "title": "简短的总结标题",
  "bug_phenomenon": "问题现象描述",
  "root_cause": "根本原因",
  "solution": "具体解决方案或代码修改"
}

日志内容如下：
${context}`;

    let resultJsonStr = '';

    // 2. 双引擎判定
    const isAntigravity = process.env.YONGLE_RUNTIME === 'antigravity';
    let usedAgentApi = false;

    if (isAntigravity) {
      try {
        // 尝试调用 agentapi (Antigravity 独占)
        const output = execSync(`agentapi new-conversation --model=flash "${prompt.replace(/(["$])/g, '\\$1')}"`, { encoding: 'utf8' });
        const parsed = JSON.parse(output);
        const convId = parsed.response.newConversation.conversationId;
        
        if (convId) {
          usedAgentApi = true;
          const subTranscriptPath = path.join(os.homedir(), '.gemini', 'antigravity', 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl');
          
          // 轮询子代日志 (最多等 60 秒)
          let retries = 60;
          while (retries > 0) {
            await sleep(1000);
            if (fs.existsSync(subTranscriptPath)) {
              const subLines = fs.readFileSync(subTranscriptPath, 'utf8').trim().split('\n');
              for (let i = subLines.length - 1; i >= 0; i--) {
                const step = JSON.parse(subLines[i]);
                if (step.source === 'MODEL' && step.type === 'PLANNER_RESPONSE' && step.status === 'DONE') {
                  resultJsonStr = step.content;
                  break;
                }
              }
            }
            if (resultJsonStr) break;
            retries--;
          }
        }
      } catch (e) {
        // agentapi 调用失败，无缝降级
        usedAgentApi = false;
      }
    }

    // 降级使用 yongle-agent-api.js (外部大模型 API)
    if (!resultJsonStr) {
      resultJsonStr = await getAgentCompletion(prompt, '你是一个专门用来提取 JSON 格式的技术经验复盘专家。请只输出 JSON。');
    }

    if (!resultJsonStr) process.exit(0);

    // 3. 解析与归档
    // 清理 markdown codeblock 标记
    const cleanJsonStr = resultJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanJsonStr);

    if (data.solved === true && data.title) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dateStr = new Date().toISOString().split('T')[0];
      const safeTitle = data.title.replace(/[\/\\?%*:|"<>]/g, '-').substring(0, 30);
      
      const markdownContent = `---
type: auto-postmortem
date: ${dateStr}
id: auto-${timestamp}
---

# ${data.title}

## 问题现象
${data.bug_phenomenon}

## 根本原因
${data.root_cause}

## 解决方案
${data.solution}

---
*本记录由永乐大典 (Yongle Zero-Latency Archiver) 后台静默抓取并自动生成。*
`;
      
      // 保存至 dreams 目录
      const dreamsDir = path.join(process.cwd(), '.planning', 'yongle', 'dreams');
      if (!fs.existsSync(dreamsDir)) fs.mkdirSync(dreamsDir, { recursive: true });
      
      const filePath = path.join(dreamsDir, `auto-dream-${timestamp}.md`);
      fs.writeFileSync(filePath, markdownContent, 'utf8');
      
      // 调用 yongle-embed-all.js 入库
      const embedScript = path.join(__dirname, 'yongle-embed-all.js');
      try {
        if (fs.existsSync(embedScript)) {
          execSync(`node "${embedScript}"`);
        }
      } catch (e) {}
    }

  } catch (error) {
    // 任何异常都静默吞掉，绝不影响主线程
  }
}

main();
