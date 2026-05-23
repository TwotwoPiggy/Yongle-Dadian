const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { loadMergedConfig } = require('./yongle-config');
const yongleRequest = require('./yongle-request');

const homedir = os.homedir();
const configPath = path.join(homedir, '.yongle_knowledge', 'config.json');
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
 * @returns {Promise<number[]|null>} 向量数组（通常为 1536 维或 3072 维），若停用返回 null
 */
async function getEmbedding(text, provider, model, apiKey, baseUrl) {
  const config = loadMergedConfig();
  if (config.embedding && config.embedding.enabled === false) {
    return null;
  }

  if (provider === 'ollama') {
    const url = baseUrl || 'http://localhost:11434';
    const res = await yongleRequest.yongleFetch(`${url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'nomic-embed-text', prompt: text })
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
      body: JSON.stringify({ model: model || 'text-embedding-3-small', input: text })
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
      })
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
      body: JSON.stringify({ model: model || 'deepseek-embedding', input: text })
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
      body: JSON.stringify({ model: model || 'default', input: text })
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

/**
 * 脚本主入口：读取指定 Scope 的 MD 文件，执行 Heading 规则切片，调用接口抽取特征并 upsert 至 LanceDB。
 * @returns {Promise<void>}
 */
async function main() {
  const scope = process.argv[2];
  const filepath = process.argv[3];

  if (!scope || !filepath) {
    logError("Missing scope or filepath arguments.");
    process.exit(1);
  }

  const config = loadMergedConfig();
  const embedConfig = config.embedding || { provider: 'ollama', model: 'nomic-embed-text' };

  if (config.embedding && config.embedding.enabled === false) {
    console.log(`💡 Info: Embedding API is disabled in config. Skipping vector generation for ${filepath}.`);
    return;
  }

  if (!fs.existsSync(filepath)) {
    logError(`File not found: ${filepath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filepath, 'utf8');
  
  // Extract document ID and Tags if possible from frontmatter
  let docId = path.basename(filepath, '.md');
  let tags = [];
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const idMatch = fm.match(/id:\s*(.+)/);
    if (idMatch) docId = idMatch[1].trim();
    const tagsMatch = fm.match(/tags:\s*\[(.*?)\]/);
    if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
  }

  // Chunking by Markdown Headings
  // This splits the file at headings but keeps the heading text in the chunk.
  const chunksRaw = content.split(/(?=^#+\s|\n#+\s)/);
  const chunks = chunksRaw.map(c => c.trim()).filter(c => c.length > 0);

  // For each chunk, get embedding and upsert
  const { upsert: lancedbUpsert } = require('./yongle-lancedb.js');
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    try {
      const vector = await getEmbedding(chunkText, embedConfig.provider, embedConfig.model, embedConfig.apiKey, embedConfig.baseUrl);
      
      const chunkId = `${docId}_chunk_${i}`;
      const chunkData = {
        id: chunkId,
        content: chunkText,
        tags: tags,
        vector: vector
      };

      await lancedbUpsert(scope, JSON.stringify(chunkData));
    } catch (e) {
      logError(`Failed to process chunk ${i} of ${filepath}: ${e.message}`);
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    logError(`Unhandled error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { getEmbedding, configPath };
