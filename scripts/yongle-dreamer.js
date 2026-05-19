/**
 * 永乐大典：梦境守护者 (Yongle Dreamer)
 * 核心逻辑：监听静默状态并触发“快速梦”与“长梦”。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAgentCompletion } = require('./yongle-agent-api.js');

// 配置 (可从 .yongle.json 读取，此处为默认值)
const CONFIG = {
  QUICK_IDLE_MS: 5 * 60 * 1000, // 5 分钟
  LONG_IDLE_MS: 30 * 60 * 1000,  // 30 分钟
  BUFFER_FILE: '.planning/yongle/dream_buffer.jsonl',
  WATCH_TARGETS: ['.git/index', '.planning/STATE.md'],
};

function getFileSilenceTime() {
  let minDiff = Infinity;
  for (const target of CONFIG.WATCH_TARGETS) {
    try {
      if (fs.existsSync(target)) {
        const stats = fs.statSync(target);
        const diff = Date.now() - stats.mtimeMs;
        if (diff < minDiff) minDiff = diff;
      }
    } catch (e) {}
  }
  return minDiff;
}

/**
 * 模拟系统空闲检查 (Windows)
 * 注意：由于无法直接加载 C# Add-Type，此处暂以“双倍模型静默时间”作为启发式替代，
 * 或在未来版本中引入专用原生二进制包。
 */
function getSystemIdleTime() {
  // 启发式：如果文件静默时间足够长，且没有任何正在运行的 agent 进程。
  return getFileSilenceTime(); 
}

async function runDream(type) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🏮 正在进入${type === 'quick' ? '快速梦' : '长梦'}...`);
  
  // 1. 读取潜在的上下文数据
  let contextText = '';
  
  // A. 读取 WATCHING.md (优先)
  const watchingPath = '.planning/yongle/WATCHING.md';
  if (fs.existsSync(watchingPath)) {
    try {
      contextText += `=== Active Watch Timeline ===\n${fs.readFileSync(watchingPath, 'utf8')}\n\n`;
    } catch (e) {}
  }
  
  // B. 读取 STATE.md
  const statePath = '.planning/STATE.md';
  if (fs.existsSync(statePath)) {
    try {
      contextText += `=== Project State ===\n${fs.readFileSync(statePath, 'utf8')}\n\n`;
    } catch (e) {}
  }
  
  // C. 如果没有任何上下文，写入默认
  if (!contextText) {
    contextText = '未检测到活跃的过程探针或项目状态。系统处于平稳静默期。';
  }

  // 2. 调用 Agent 生成总结 / 沉淀意见
  let summary = '';
  try {
    const prompt = `你是一个在后台守护的"梦境思考者"（Dreamer）。以下是项目当前的最近开发过程记录和项目状态：\n\n${contextText}\n\n根据以上内容，请生成一个关于该静默期的“${type === 'quick' ? '开发片段沉淀与洞察' : '长周期静默开发反思'}”。要求：\n1. 提炼核心工作进度；\n2. 提出1-2条潜在的技术优化、风险防范或可提炼的经验条目设想。\n3. 字数控制在200-300字以内，采用极其专业、简洁的中文开发者口吻。`;
    
    summary = await getAgentCompletion(prompt, '你是一个专门在静默期整理开发记忆的后台梦境守护者（Yongle Dreamer）。');
    if (summary === '') {
      console.log(`[${timestamp}] 💡 梦境生成跳过 (Agent API 在配置中已被停用)`);
      return;
    }
  } catch (err) {
    console.error(`[${timestamp}] ⚠ 梦境调用 Agent 失败: ${err.message}`);
    summary = `Failed to invoke Agent: ${err.message}`;
  }

  // 3. 写入缓冲区 (追加模式)
  const logEntry = {
    timestamp,
    type,
    summary: summary.trim(),
    status: 'summarized'
  };
  
  fs.appendFileSync(CONFIG.BUFFER_FILE, JSON.stringify(logEntry) + '\n');
  
  // 4. 将梦境沉淀写入一个正式的梦境记录 Markdown 中以供用户审阅！
  try {
    const dreamsDir = '.planning/yongle/dreams';
    if (!fs.existsSync(dreamsDir)) fs.mkdirSync(dreamsDir, { recursive: true });
    
    const dreamFile = path.join(dreamsDir, `dream-${timestamp.replace(/[:.]/g, '-')}.md`);
    const dreamContent = `---
type: ${type}
date: ${timestamp.split('T')[0]}
time: ${timestamp}
---

# 💤 永乐梦境沉淀 (${type === 'quick' ? '快速梦' : '长梦'})

在静默期，永乐大典的大模型代理对活跃探针及项目状态进行了深度回溯整理，梦境沉淀如下：

${summary.trim()}

---
*本记录由永乐大典后台梦境守护者 (Yongle Dreamer) 自动生成。*
`;
    fs.writeFileSync(dreamFile, dreamContent, 'utf8');
    console.log(`[${timestamp}] 💤 梦境沉淀已落盘: ${dreamFile}`);
  } catch (e) {
    console.error(`[${timestamp}] ⚠ 写入梦境文件失败: ${e.message}`);
  }
  
  console.log(`[${timestamp}] ✅ ${type === 'quick' ? '梦境片段已缓存' : '梦境合并已排期'}`);
}

let lastQuickDream = 0;
let lastLongDream = 0;

function main() {
  console.log('永乐大典：梦境守护者已启动... 💤');
  
  setInterval(() => {
    const fileSilence = getFileSilenceTime();
    
    // 触发快速梦
    if (fileSilence >= CONFIG.QUICK_IDLE_MS && (Date.now() - lastQuickDream > CONFIG.QUICK_IDLE_MS)) {
      runDream('quick');
      lastQuickDream = Date.now();
    }
    
    // 触发长梦
    if (fileSilence >= CONFIG.LONG_IDLE_MS && (Date.now() - lastLongDream > CONFIG.LONG_IDLE_MS)) {
      runDream('long');
      lastLongDream = Date.now();
    }
  }, 60000); // 每分钟检查一次
}

// 确保目录存在
const dir = path.dirname(CONFIG.BUFFER_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

main();
