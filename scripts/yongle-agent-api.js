const { loadMergedConfig } = require('./yongle-config');
const yongleRequest = require('./yongle-request');

/**
 * 核心大模型交互 API：支持单独的 "agent" 配置，或在缺失时智能继承自 "embedding" 的 provider 与 apiKey。
 *
 * @param {string} prompt 用户提示词
 * @param {string} systemInstruction 系统角色或指令（可选）
 * @param {object} options 自定义覆盖选项，支持单独指定 provider, model, apiKey, baseUrl 等
 * @returns {Promise<string>} AI 生成的文本结果
 */
async function getAgentCompletion(prompt, systemInstruction = '', options = {}) {
  const config = loadMergedConfig();
  
  // 获取已合并的配置
  const embedConfig = config.embedding || { provider: 'ollama' };
  const agentConfig = config.agent || {};

  // 1. 智能继承配置：优先使用 option 传入 -> 其次使用 agent 特定配置 -> 最后继承自 embedding 配置 -> 回退至 ollama
  const provider = options.provider || agentConfig.provider || embedConfig.provider || 'ollama';
  const apiKey = options.apiKey || agentConfig.apiKey || embedConfig.apiKey;
  const baseUrl = options.baseUrl || agentConfig.baseUrl || embedConfig.baseUrl;

  // 2. 解析默认模型：根据 provider 提供最佳轻量模型
  let model = options.model || agentConfig.model;
  if (!model) {
    if (provider === 'gemini') {
      model = 'gemini-1.5-flash';
    } else if (provider === 'deepseek') {
      model = 'deepseek-chat';
    } else if (provider === 'openai') {
      model = 'gpt-4o-mini';
    } else if (provider === 'ollama') {
      model = 'llama3';
    } else {
      model = 'default';
    }
  }

  // 3. 执行不同 API Provider 的调用
  if (provider === 'ollama') {
    const url = baseUrl || 'http://localhost:11434';
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await yongleRequest.yongleFetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false
      })
    });
    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.message.content;

  } else if (provider === 'openai') {
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await yongleRequest.yongleFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText} - ${errText}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;

  } else if (provider === 'gemini') {
    if (!apiKey) {
      throw new Error('Gemini API requires an "apiKey" in config or options.');
    }
    // 使用 v1beta generateContent REST API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const res = await yongleRequest.yongleFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API error: ${res.status} ${res.statusText} - ${errText}`);
    }
    const data = await res.json();
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      throw new Error(`Gemini returned empty or unexpected response: ${JSON.stringify(data)}`);
    }
    return data.candidates[0].content.parts[0].text;

  } else if (provider === 'deepseek') {
    if (!apiKey) {
      throw new Error('DeepSeek API requires an "apiKey" in config or options.');
    }
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await yongleRequest.yongleFetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek API error: ${res.status} ${res.statusText} - ${errText}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;

  } else if (provider === 'openai-compatible') {
    if (!baseUrl) {
      throw new Error('openai-compatible provider requires a "baseUrl" in config or options.');
    }
    const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await yongleRequest.yongleFetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: model,
        messages: messages
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI-Compatible API error: ${res.status} ${res.statusText} - ${errText}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;

  } else {
    throw new Error(`Unsupported agent provider: "${provider}". Supported: ollama, openai, gemini, deepseek, openai-compatible`);
  }
}

module.exports = { getAgentCompletion };
