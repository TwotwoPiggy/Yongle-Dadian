#!/usr/bin/env node
'use strict';

const { getAgentCompletion } = require('./yongle-agent-api');
const { loadMergedConfig } = require('./yongle-config');

const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';

async function main() {
  console.log(`\n  ${cyan}🏮 永乐大典 — Agent Provider 联调测试${reset}`);
  
  const config = loadMergedConfig();
  const embedConfig = config.embedding || { provider: 'ollama' };
  const agentConfig = config.agent || {};

  const provider = agentConfig.provider || embedConfig.provider || 'ollama';
  const hasKey = !!(agentConfig.apiKey || embedConfig.apiKey);
  let model = agentConfig.model;
  if (!model) {
    if (provider === 'gemini') model = 'gemini-1.5-flash';
    else if (provider === 'deepseek') model = 'deepseek-chat';
    else if (provider === 'openai') model = 'gpt-4o-mini';
    else if (provider === 'ollama') model = 'llama3';
    else model = 'default';
  }

  console.log(`  ${dim}──────────────────────────────────────────────────────${reset}`);
  console.log(`  ${bold}当前活跃配置：${reset}`);
  console.log(`  ▸ Provider: ${green}${provider}${reset}`);
  console.log(`  ▸ Model:    ${green}${model}${reset}`);
  console.log(`  ▸ API Key:  ${green}${hasKey ? '已载入 (智能继承/显式指定)' : '未提供 (可能适用于 Ollama 本地化)'}${reset}`);
  console.log(`  ${dim}──────────────────────────────────────────────────────${reset}\n`);

  const prompt = process.argv.slice(2).join(' ') || '请简短介绍你作为一个AI经验知识库的AI伙伴。不超过两句话。';

  console.log(`  ${yellow}发送提示词：${reset}"${prompt}"`);
  console.log(`  ${dim}等待 AI 响应中...${reset}\n`);

  try {
    const start = Date.now();
    const response = await getAgentCompletion(prompt, '你是由永乐大典知识库托管的智能开发助手。');
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    
    console.log(`  ${green}AI 响应成功 (耗时 ${duration}s)：${reset}`);
    console.log(`  ${bold}======================================================${reset}`);
    console.log(response.trim().split('\n').map(line => '  ' + line).join('\n'));
    console.log(`  ${bold}======================================================${reset}\n`);
    
  } catch (err) {
    console.error(`  ${red}✗ AI 调用失败！${reset}`);
    console.error(`  ${red}错误详情: ${err.message}${reset}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
