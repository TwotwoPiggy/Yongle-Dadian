const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { loadMergedConfig } = require('./yongle-config');

const homedir = os.homedir();
const configPath = path.join(homedir, '.yongle_knowledge', 'config.json');
const logPath = path.join(homedir, '.yongle_knowledge', 'failed_embeddings.log');

function logError(message) {
  const logMsg = `[${new Date().toISOString()}] ERROR: ${message}\n`;
  fs.appendFileSync(logPath, logMsg);
}

async function getEmbedding(text, provider, model, apiKey, baseUrl) {
  if (provider === 'ollama') {
    const url = baseUrl || 'http://localhost:11434';
    const res = await fetch(`${url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'nomic-embed-text', prompt: text })
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.statusText}`);
    const data = await res.json();
    return data.embedding;

  } else if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
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
    const res = await fetch(url, {
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
    const res = await fetch('https://api.deepseek.com/v1/embeddings', {
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
    const res = await fetch(url, {
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

async function main() {
  const scope = process.argv[2];
  const filepath = process.argv[3];

  if (!scope || !filepath) {
    logError("Missing scope or filepath arguments.");
    process.exit(1);
  }

  const config = loadMergedConfig();
  const embedConfig = config.embedding || { provider: 'ollama', model: 'nomic-embed-text' };

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
