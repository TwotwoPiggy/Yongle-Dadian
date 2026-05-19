'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { resolveProxyUrl } = require('../scripts/yongle-request.js');

describe('yongle-request proxy configuration', () => {

  describe('resolveProxyUrl', () => {
    const originalEnv = {};

    before(() => {
      // 保存原始环境变量
      originalEnv.HTTPS_PROXY = process.env.HTTPS_PROXY;
      originalEnv.https_proxy = process.env.https_proxy;
      originalEnv.HTTP_PROXY = process.env.HTTP_PROXY;
      originalEnv.http_proxy = process.env.http_proxy;
    });

    after(() => {
      // 恢复原始环境变量
      if (originalEnv.HTTPS_PROXY !== undefined) process.env.HTTPS_PROXY = originalEnv.HTTPS_PROXY;
      else delete process.env.HTTPS_PROXY;
      if (originalEnv.https_proxy !== undefined) process.env.https_proxy = originalEnv.https_proxy;
      else delete process.env.https_proxy;
      if (originalEnv.HTTP_PROXY !== undefined) process.env.HTTP_PROXY = originalEnv.HTTP_PROXY;
      else delete process.env.HTTP_PROXY;
      if (originalEnv.http_proxy !== undefined) process.env.http_proxy = originalEnv.http_proxy;
      else delete process.env.http_proxy;
    });

    it('should return null when no proxy is configured and no env vars set', () => {
      // 清理所有环境变量
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;

      const result = resolveProxyUrl({ yongle: {} });
      assert.equal(result, null);
    });

    it('should use yongle.proxy from config when present', () => {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;

      const config = { yongle: { proxy: 'http://127.0.0.1:7890' } };
      const result = resolveProxyUrl(config);
      assert.equal(result, 'http://127.0.0.1:7890');
    });

    it('should prefer yongle.proxy over environment variables', () => {
      process.env.HTTPS_PROXY = 'http://env-proxy:9999';

      const config = { yongle: { proxy: 'http://config-proxy:7890' } };
      const result = resolveProxyUrl(config);
      assert.equal(result, 'http://config-proxy:7890');

      delete process.env.HTTPS_PROXY;
    });

    it('should fall back to HTTPS_PROXY env var when no config proxy', () => {
      process.env.HTTPS_PROXY = 'http://env-https-proxy:8080';
      delete process.env.HTTP_PROXY;

      const config = { yongle: {} };
      const result = resolveProxyUrl(config);
      assert.equal(result, 'http://env-https-proxy:8080');

      delete process.env.HTTPS_PROXY;
    });

    it('should fall back to HTTP_PROXY env var when HTTPS_PROXY not set', () => {
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      process.env.HTTP_PROXY = 'http://env-http-proxy:3128';

      const config = { yongle: {} };
      const result = resolveProxyUrl(config);
      assert.equal(result, 'http://env-http-proxy:3128');

      delete process.env.HTTP_PROXY;
    });

    it('should return null when config has empty yongle object and no env', () => {
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;

      const result = resolveProxyUrl({});
      assert.equal(result, null);
    });

    it('should return null when proxyEnabled is explicitly false even if proxy URL is set', () => {
      const config = { yongle: { proxy: 'http://127.0.0.1:7890', proxyEnabled: false } };
      const result = resolveProxyUrl(config);
      assert.equal(result, null);
    });

    it('should return null when proxyEnabled is false even if env var is set', () => {
      process.env.HTTPS_PROXY = 'http://env-proxy:9999';

      const config = { yongle: { proxyEnabled: false } };
      const result = resolveProxyUrl(config);
      assert.equal(result, null);

      delete process.env.HTTPS_PROXY;
    });
  });

  describe('yongleFetch integration', () => {
    it('should export yongleFetch as a function', () => {
      const { yongleFetch } = require('../scripts/yongle-request.js');
      assert.equal(typeof yongleFetch, 'function');
    });

    it('should export createProxyClient as a function', () => {
      const { createProxyClient } = require('../scripts/yongle-request.js');
      assert.equal(typeof createProxyClient, 'function');
    });

    it('should create axios client without proxy when proxyUrl is null', () => {
      const { createProxyClient } = require('../scripts/yongle-request.js');
      const client = createProxyClient(null);
      assert.ok(client);
      assert.equal(typeof client.request, 'function');
      // 验证没有挂载代理 Agent
      assert.equal(client.defaults.httpAgent, undefined);
      assert.equal(client.defaults.httpsAgent, undefined);
    });

    it('should create axios client with proxy agent when proxyUrl is provided', () => {
      const { createProxyClient } = require('../scripts/yongle-request.js');
      const client = createProxyClient('http://127.0.0.1:7890');
      assert.ok(client);
      // 验证已挂载代理 Agent
      assert.ok(client.defaults.httpsAgent, 'Should have httpsAgent set');
      assert.ok(client.defaults.httpAgent, 'Should have httpAgent set');
    });

    it('should throw a friendly error on ECONNREFUSED', async () => {
      const { yongleFetch } = require('../scripts/yongle-request.js');
      // 连接一个确定不存在的端口
      try {
        await yongleFetch('http://127.0.0.1:19999/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true }),
          _config: {} // 无代理，直连
        });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(
          err.message.includes('[Yongle Proxy Error]'),
          `Error should contain friendly prefix, got: ${err.message}`
        );
      }
    });
  });

  describe('API enabled flags', () => {
    let originalConfigLoader;
    let mockConfig = {};

    before(() => {
      const configModule = require('../scripts/yongle-config.js');
      originalConfigLoader = configModule.loadMergedConfig;
      configModule.loadMergedConfig = () => mockConfig;
    });

    after(() => {
      const configModule = require('../scripts/yongle-config.js');
      configModule.loadMergedConfig = originalConfigLoader;
    });

    it('should return null when embedding.enabled is false', async () => {
      mockConfig = {
        embedding: {
          enabled: false,
          provider: 'openai'
        }
      };
      const { getEmbedding } = require('../scripts/yongle-embed.js');
      const result = await getEmbedding('test', 'openai', 'model', 'key');
      assert.equal(result, null);
    });

    it('should return warning text when agent.enabled is false', async () => {
      mockConfig = {
        agent: {
          enabled: false,
          provider: 'openai'
        }
      };
      const { getAgentCompletion } = require('../scripts/yongle-agent-api.js');
      const result = await getAgentCompletion('test');
      assert.equal(result, '💡 Agent API is disabled in config.');
    });
  });
});
