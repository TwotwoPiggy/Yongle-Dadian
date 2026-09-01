const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadMergedConfig } = require('./yongle-config');
const yongleRequest = require('./yongle-request');

const homedir = os.homedir();
const logPath = path.join(homedir, '.yongle_knowledge', 'failed_embeddings.log');

/**
 * 记录嵌入过程中的错误日志到 ~/.yongle_knowledge/failed_embeddings.log
 * @param {string} message - 错误信息内容
 * @returns {void}
 */
function logError(message) {
  const logMsg = `[${new Date().toISOString()}] ERROR: ${message}\n`;
  fs.appendFileSync(logPath, logMsg);
}

/**
 * 调用指定提供商的 API 获取文本的 Embedding 向量
 * @param {string} text - 目标文本
 * @param {string} provider - 向量提供商（如 gemini, ollama, openai, deepseek 等）
 * @param {string} model - 模型名称
 * @param {string} [apiKey] - API 密钥
 * @param {string} [baseUrl] - 自定义基准接口 URL
 * @param {{signal?:AbortSignal}} [options] - 选项（支持 AbortSignal 取消）
 * @returns {Promise<number[]|null>} 向量数组（通常为 1536 维或 3072 维），若停用返回 null
 */
async function getEmbedding(text, provider, model, apiKey, baseUrl, options = {}) {
  const config = loadMergedConfig();
  if (config.embedding && config.embedding.enabled === false) {
    return null;
  }

  const signal = options?.signal;

  if (provider === 'ollama') {
    const url = baseUrl || 'http://localhost:11434';
    const res = await yongleRequest.yongleFetch(`${url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'nomic-embed-text', prompt: text }),
      signal
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
    const data = await res.json();
    return data.embedding;

  } else if (provider === 'openai') {
    const res = await yongleRequest.yongleFetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: model || 'text-embedding-3-small', input: text }),
      signal
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
    const data = await res.json();
    return data.data[0].embedding;

  } else if (provider === 'gemini') {
    const m = model || 'gemini-embedding-001';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:embedContent`;
    const res = await yongleRequest.yongleFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: `models/${m}`,
        content: { parts: [{ text }] }
      }),
      signal
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini API error: ${res.status} ${res.statusText} - ${errBody}`);
    }
    const data = await res.json();
    return data.embedding.values;

  } else if (provider === 'deepseek') {
    const res = await yongleRequest.yongleFetch('https://api.deepseek.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: model || 'deepseek-embedding', input: text }),
      signal
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`DeepSeek API error: ${res.status} ${res.statusText} - ${errBody}`);
    }
    const data = await res.json();
    return data.data[0].embedding;

  } else if (provider === 'openai-compatible') {
    // 通用 OpenAI 兼容格式 — 支持任何自定义端点 (OpenRouter, vLLM, LiteLLM, opencode 等)
    if (!baseUrl) throw new Error('openai-compatible provider requires "baseUrl" in config (e.g. "http://localhost:8080/v1")');
    const url = baseUrl.replace(/\/+$/, '') + '/embeddings';
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await yongleRequest.yongleFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: model || 'default', input: text }),
      signal
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`OpenAI-Compatible API error: ${res.status} ${res.statusText} - ${errBody}`);
    }
    const data = await res.json();
    return data.data[0].embedding;

  } else {
    throw new Error(`Unsupported provider: "${provider}". Supported: ollama, openai, gemini, deepseek, openai-compatible`);
  }
}

module.exports = { getEmbedding };
