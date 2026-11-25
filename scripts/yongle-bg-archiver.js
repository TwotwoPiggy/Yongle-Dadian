'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getAgentCompletion } = require('./yongle-agent-api.js');
const { loadMergedConfig } = require('./yongle-config.js');
const { logAutoFeature } = require('./yongle-logger.js');
const os = require('os');

// 帮助函数：非阻塞休眠
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function truncateText(text, maxLen = 500) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length > maxLen ? s.substring(0, maxLen) + '...[truncated]' : s;
}

function extractText(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val
      .map(item => extractText(item))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof val === 'object') {
    if (typeof val.text === 'string') return val.text;
    if (typeof val.value === 'string') return val.value;
    if (val.content !== undefined) return extractText(val.content);
    if (val.message !== undefined) return extractText(val.message);
  }
  return '';
}

function formatGenericRecord(record) {
  if (!record || typeof record !== 'object') return '';

  // 1. Antigravity JSONL 格式
  if (record.type === 'USER_INPUT' || record.type === 'PLANNER_RESPONSE' || record.type === 'RUN_COMMAND') {
    const role = record.source === 'USER_EXPLICIT' ? 'USER' : 'AGENT';
    const content = truncateText(extractText(record.content));
    return content ? `[${role}] (${record.type}): ${content}\n\n` : '';
  }

  // 2. VS Code Copilot / Claude / OpenAI 通用消息格式 ({ role, content } 或 { message: { role, content } })
  const msgObj = record.message && typeof record.message === 'object' && record.message.role
    ? record.message
    : record;
  const rawRole = String(msgObj.role || record.type || '').toLowerCase();
  if (rawRole === 'user' || rawRole === 'human' || rawRole === 'assistant' || rawRole === 'model' || rawRole === 'ai' || rawRole === 'tool' || rawRole === 'tool_result') {
    const role = (rawRole === 'user' || rawRole === 'human') ? 'USER' : (rawRole.startsWith('tool') ? 'TOOL' : 'AGENT');
    const content = truncateText(extractText(msgObj.content !== undefined ? msgObj.content : (record.text || record.prompt || record.response)));
    return content ? `[${role}] (${rawRole}): ${content}\n\n` : '';
  }

  // 3. 简单 prompt/response 对象
  if (record.prompt || record.response) {
    let chunk = '';
    if (record.prompt) chunk += `[USER] (prompt): ${truncateText(extractText(record.prompt))}\n\n`;
    if (record.response) chunk += `[AGENT] (response): ${truncateText(extractText(record.response))}\n\n`;
    return chunk;
  }

  return '';
}

function extractTranscriptContext(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  const raw = fs.readFileSync(transcriptPath, 'utf8').trim();
  if (!raw) return '';

  // 尝试作为完整 JSON 文档解析（如 VS Code Copilot Chat session JSON: { requests: [...] } 或 { messages: [...] }）
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.requests)) {
        let context = '';
        for (const req of parsed.requests.slice(-20)) {
          const userText = truncateText(extractText(req.message));
          const agentText = truncateText(extractText(req.response));
          if (userText) context += `[USER] (request): ${userText}\n\n`;
          if (agentText) context += `[AGENT] (response): ${agentText}\n\n`;
        }
        return context;
      }
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.messages) ? parsed.messages : null);
      if (list) {
        let context = '';
        for (const item of list.slice(-40)) {
          context += formatGenericRecord(item);
        }
        return context;
      }
    } catch (e) {
      // 不是单个 JSON 文档，继续按 JSONL 逐行解析
    }
  }

  // 按 JSONL 逐行解析（最近 40 条）
  const lines = raw.split('\n').slice(-40);
  let context = '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const step = JSON.parse(line);
      context += formatGenericRecord(step);
    } catch (e) {}
  }
  return context;
}

async function main() {
  // 获取日志路径
  const transcriptPath = process.argv[2];
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  const startTime = Date.now();
  try {
    // 1. 读取并提取上下文 (兼容 Antigravity JSONL 与 VS Code Copilot JSON/JSONL)
    const context = extractTranscriptContext(transcriptPath);
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
        const config = loadMergedConfig();
        const agModel = config.agent?.antigravityModel || 'flash';
        // 尝试调用 agentapi (使用 execFileSync 传递数组参数，防 Windows 命令行转义异常与弹窗)
        const output = execFileSync('agentapi', ['new-conversation', `--model=${agModel}`, prompt], { encoding: 'utf8', windowsHide: true });
        const parsed = JSON.parse(output);
        const convId = parsed.response?.newConversation?.conversationId;

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
      try {
        resultJsonStr = await getAgentCompletion(prompt, '你是一个专门用来提取 JSON 格式的技术经验复盘专家。请只输出 JSON。');
      } catch (e) {}
    }

    if (!resultJsonStr) {
      logAutoFeature({
        feature: 'auto-archive',
        status: 'SKIPPED',
        durationMs: Date.now() - startTime,
        details: '会话审查结束，模型未返回有效评估结果',
      });
      return;
    }

    // 3. 解析与归档
    const cleanJsonStr = resultJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
    let data = {};
    try {
      data = JSON.parse(cleanJsonStr);
    } catch (e) {}

    if (data.solved === true && data.title) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dateStr = new Date().toISOString().split('T')[0];

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

      // 仅对当前新增归档文件执行单文件向量化入库，并使用 execFileSync + windowsHide 防止弹出 cmd 窗口
      const embedSingleScript = path.join(__dirname, 'yongle-embed.js');
      try {
        if (fs.existsSync(embedSingleScript)) {
          execFileSync(process.execPath, [embedSingleScript, 'local', filePath], {
            windowsHide: true,
            stdio: 'ignore',
          });
        }
      } catch (e) {}

      logAutoFeature({
        feature: 'auto-archive',
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
        details: `归档生成经验: "${data.title}" (${usedAgentApi ? 'Native AgentAPI' : 'External LLM API'})`,
      });
    } else {
      logAutoFeature({
        feature: 'auto-archive',
        status: 'SKIPPED',
        durationMs: Date.now() - startTime,
        details: '会话审查完毕，未发现需归档的新 Bug 解决经验',
      });
    }
  } catch (error) {
    logAutoFeature({
      feature: 'auto-archive',
      status: 'ERROR',
      durationMs: Date.now() - startTime,
      error: error.message,
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractText,
  formatGenericRecord,
  extractTranscriptContext,
};
