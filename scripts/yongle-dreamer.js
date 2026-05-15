/**
 * 永乐大典：梦境守护者 (Yongle Dreamer)
 * 核心逻辑：监听静默状态并触发“快速梦”与“长梦”。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function runDream(type) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🏮 正在进入${type === 'quick' ? '快速梦' : '长梦'}...`);
  
  // 写入缓冲区 (追加模式)
  const logEntry = {
    timestamp,
    type,
    summary: `Detected ${type} idle threshold met.`,
    status: 'pending_summarization'
  };
  
  fs.appendFileSync(CONFIG.BUFFER_FILE, JSON.stringify(logEntry) + '\n');
  
  // TODO: 调用宿主 Agent 执行具体总结指令 (通常在下一次用户唤醒时处理，或此处尝试 spawn 任务)
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
