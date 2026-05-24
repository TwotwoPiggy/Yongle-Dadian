/**
 * 永乐大典：梦境守护者 (Yongle Dreamer)
 * 核心逻辑：监听静默状态并触发“快速梦”与“长梦”。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAgentCompletion } = require('./yongle-agent-api.js');
const { loadMergedConfig } = require('./yongle-config');

// 配置 (可从 config.json 读取，此处为默认值)
const CONFIG = {
  QUICK_IDLE_MS: 5 * 60 * 1000, // 5 分钟
  LONG_IDLE_MS: 30 * 60 * 1000,  // 30 分钟
  BUFFER_FILE: '.planning/yongle/dream_buffer.jsonl',
  WATCH_TARGETS: ['.git/index', '.planning/STATE.md'],
};

// 载入合并配置并覆盖默认参数
const config = loadMergedConfig();
const schedulerConfig = (config.yongle && config.yongle.scheduler) || {};

if (schedulerConfig.dreamer) {
  if (schedulerConfig.dreamer.quick_idle_ms) {
    CONFIG.QUICK_IDLE_MS = parseInt(schedulerConfig.dreamer.quick_idle_ms, 10);
  }
  if (schedulerConfig.dreamer.long_idle_ms) {
    CONFIG.LONG_IDLE_MS = parseInt(schedulerConfig.dreamer.long_idle_ms, 10);
  }
}

/**
 * 获取监控文件的最大静默时长（自最近修改时间以来的毫秒数）
 * @returns {number} 静默毫秒数
 */
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
/**
 * 启发式评估系统空闲时长（自最近修改时间以来的毫秒数）
 * @returns {number} 空闲毫秒数
 */
function getSystemIdleTime() {
  // 启发式：如果文件静默时间足够长，且没有任何正在运行的 agent 进程。
  return getFileSilenceTime(); 
}

/**
 * 触发梦境整理流程，读取监控到的探针上下文，并调用后台 Agent 提取生成阶段性沉淀至 dreams/ 目录中
 * @param {'quick'|'long'} type - 梦境整理类型（快速整理片段或长周期深层反思）
 * @returns {Promise<void>}
 */
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

    // 允许为 dreamer 梦境守护任务指定专属的大模型配置，以便与常规对话模型分离（例如使用更便宜的模型）
    const dreamerOptions = {};
    if (schedulerConfig.dreamer) {
      if (schedulerConfig.dreamer.provider) dreamerOptions.provider = schedulerConfig.dreamer.provider;
      if (schedulerConfig.dreamer.model) dreamerOptions.model = schedulerConfig.dreamer.model;
      if (schedulerConfig.dreamer.apiKey) dreamerOptions.apiKey = schedulerConfig.dreamer.apiKey;
      if (schedulerConfig.dreamer.baseUrl) dreamerOptions.baseUrl = schedulerConfig.dreamer.baseUrl;
    }

    summary = await getAgentCompletion(
      prompt, 
      '你是一个专门在静默期整理开发记忆的后台梦境守护者（Yongle Dreamer）。',
      dreamerOptions
    );
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

const STATE_FILE = '.planning/yongle/dream_state.json';

function loadDreamState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { lastQuickDream: 0, lastLongDream: 0 };
}

function saveDreamState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * 运行单次梦境检查
 */
async function runOnce() {
  const state = loadDreamState();
  const fileSilence = getFileSilenceTime();
  let stateChanged = false;
  
  // 触发快速梦
  if (fileSilence >= CONFIG.QUICK_IDLE_MS && (Date.now() - state.lastQuickDream > CONFIG.QUICK_IDLE_MS)) {
    await runDream('quick');
    state.lastQuickDream = Date.now();
    stateChanged = true;
  }
  
  // 触发长梦
  if (fileSilence >= CONFIG.LONG_IDLE_MS && (Date.now() - state.lastLongDream > CONFIG.LONG_IDLE_MS)) {
    await runDream('long');
    state.lastLongDream = Date.now();
    stateChanged = true;
  }
  
  if (stateChanged) {
    saveDreamState(state);
  } else {
    const minToQuick = Math.max(0, Math.ceil((CONFIG.QUICK_IDLE_MS - fileSilence) / (60 * 1000)));
    const minToLong = Math.max(0, Math.ceil((CONFIG.LONG_IDLE_MS - fileSilence) / (60 * 1000)));
    console.log(`当前项目静默时长: ${Math.round(fileSilence / 1000)}s。暂未达到梦境触发阈值（距离快速梦还需 ${minToQuick}m，距离长梦还需 ${minToLong}m）。`);
  }
}

/**
 * 梦境守护者监听主循环
 * @returns {void}
 */
async function main() {
  const args = process.argv.slice(2);
  const isOnce = args.includes('--once');
  
  // 如果用户显式禁用了梦境守护任务，则不建立调度
  if (schedulerConfig.dreamer && schedulerConfig.dreamer.enabled === false) {
    console.log('永乐大典：梦境守护计划任务已被用户配置禁用。');
    return;
  }
  
  if (process.env.ANTIGRAVITY_AGENT === '1') {
    if (isOnce) {
      // 在 Agent 计划任务中单次运行
      await runOnce();
    } else {
      // 读取自定义 Cron 表达式，默认 */15 * * * *
      const dreamerCron = (schedulerConfig.dreamer && schedulerConfig.dreamer.cron) || "*/15 * * * *";
      // 首次加载或非 once 运行，输出指令引导 Agent 调用 default_api:schedule
      console.log(`
=========================================
[ANTIGRAVITY_AGENT_DIRECTIVE]
检测到当前处于 Antigravity 运行环境。
为了避免多个活动会话并发导致任务重复创建，请先执行 \`manage_task(Action='list')\` 检查当前系统是否已有相同任务：
* 检查目标：正在运行的后台任务中是否已存在 Prompt 包含 "执行永乐大典梦境守护" 的任务。

如果已经存在，请直接忽略此提示，【切勿重复创建】。
如果不存在，请立即调用您的系统计划任务工具以建立梦境守护任务：
- Tool: default_api:schedule
- Arguments:
  {
    "CronExpression": "${dreamerCron}",
    "Prompt": "执行永乐大典梦境守护: node scripts/yongle-dreamer.js --once",
    "toolAction": "Checking yongle dreamer",
    "toolSummary": "Run yongle dreamer once"
  }
=========================================
`);
      // 顺便执行一次单次检查
      await runOnce();
    }
  } else {
    if (isOnce) {
      await runOnce();
    } else {
      console.log('永乐大典：梦境守护者已启动... 💤 (常驻后台监听模式)');
      const state = loadDreamState();
      
      setInterval(async () => {
        const fileSilence = getFileSilenceTime();
        let stateChanged = false;
        
        // 触发快速梦
        if (fileSilence >= CONFIG.QUICK_IDLE_MS && (Date.now() - state.lastQuickDream > CONFIG.QUICK_IDLE_MS)) {
          await runDream('quick');
          state.lastQuickDream = Date.now();
          stateChanged = true;
        }
        
        // 触发长梦
        if (fileSilence >= CONFIG.LONG_IDLE_MS && (Date.now() - state.lastLongDream > CONFIG.LONG_IDLE_MS)) {
          await runDream('long');
          state.lastLongDream = Date.now();
          stateChanged = true;
        }
        
        if (stateChanged) {
          saveDreamState(state);
        }
      }, 60000); // 每分钟检查一次
    }
  }
}

// 确保目录存在
const dir = path.dirname(CONFIG.BUFFER_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

main();
