'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { deepMerge } = require('../scripts/yongle-config.js');
const { getAgentCompletion } = require('../scripts/yongle-agent-api.js');

describe('yongle agent provider configuration and usage', () => {
  it('should deeply merge two configuration objects', () => {
    const target = {
      yongle: { search: { default_limit: 1 } },
      embedding: { provider: 'gemini', apiKey: 'abc' }
    };
    const source = {
      yongle: { search: { default_limit: 5 } },
      agent: { provider: 'deepseek', apiKey: 'xyz' }
    };
    
    const merged = deepMerge(target, source);
    assert.deepEqual(merged, {
      yongle: { search: { default_limit: 5 } },
      embedding: { provider: 'gemini', apiKey: 'abc' },
      agent: { provider: 'deepseek', apiKey: 'xyz' }
    });
  });
  
  describe('API calls and smart inheritance', () => {
    let originalFetch;
    let lastUrl = null;
    let lastBody = null;
    let lastHeaders = null;
    
    before(() => {
      originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        lastUrl = url;
        lastBody = options.body ? JSON.parse(options.body) : null;
        lastHeaders = options.headers;
        
        // 返回模拟响应数据
        if (url.includes('api.openai.com')) {
          return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'Mock OpenAI response' } }] })
          };
        } else if (url.includes('generativelanguage.googleapis.com')) {
          return {
            ok: true,
            json: async () => ({ candidates: [{ content: { parts: [{ text: 'Mock Gemini response' }] } }] })
          };
        } else if (url.includes('11434')) {
          return {
            ok: true,
            json: async () => ({ message: { content: 'Mock Ollama response' } })
          };
        }
        return { ok: false, statusText: 'Bad Request' };
      };
    });
    
    after(() => {
      globalThis.fetch = originalFetch;
    });
    
    it('should correctly call gemini provider and send system instruction', async () => {
      const response = await getAgentCompletion(
        'Test prompt',
        'Test system instruction',
        { provider: 'gemini', apiKey: 'mock-gemini-key' }
      );
      
      assert.equal(response, 'Mock Gemini response');
      assert.ok(lastUrl.includes('mock-gemini-key'), 'URL should contain apiKey');
      assert.equal(lastBody.contents[0].parts[0].text, 'Test prompt');
      assert.equal(lastBody.systemInstruction.parts[0].text, 'Test system instruction');
    });

    it('should correctly call openai provider', async () => {
      const response = await getAgentCompletion(
        'Test prompt',
        'Test system instruction',
        { provider: 'openai', apiKey: 'mock-openai-key' }
      );
      
      assert.equal(response, 'Mock OpenAI response');
      assert.equal(lastHeaders['Authorization'], 'Bearer mock-openai-key');
      assert.equal(lastBody.messages[0].role, 'system');
      assert.equal(lastBody.messages[0].content, 'Test system instruction');
      assert.equal(lastBody.messages[1].content, 'Test prompt');
    });

    it('should correctly call ollama provider', async () => {
      const response = await getAgentCompletion(
        'Test prompt',
        'Test system',
        { provider: 'ollama', model: 'llama3-mock' }
      );
      
      assert.equal(response, 'Mock Ollama response');
      assert.equal(lastBody.model, 'llama3-mock');
      assert.equal(lastBody.messages[1].content, 'Test prompt');
    });
  });
});
