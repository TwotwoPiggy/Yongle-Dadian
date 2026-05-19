const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { loadMergedConfig } = require('./yongle-config');

/**
 * 解析代理 URL。
 * 优先级：config.json 中的 yongle.proxy > 环境变量 HTTPS_PROXY > HTTP_PROXY
 *
 * @param {object} [configOverride] - 可选的外部配置对象（用于测试注入）
 * @returns {string|null} 代理 URL 或 null（直连模式）
 */
function resolveProxyUrl(configOverride) {
  const config = configOverride || loadMergedConfig();

  // 0. 开关检查：若 proxyEnabled 显式设为 false，则跳过所有代理解析
  if (config.yongle && config.yongle.proxyEnabled === false) return null;

  // 1. 配置文件中显式声明的代理
  const yongleProxy = config.yongle && config.yongle.proxy;
  if (yongleProxy) return yongleProxy;

  // 2. 环境变量回退
  return process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy
    || null;
}

/**
 * 创建代理感知的 Axios 实例。
 * 若代理 URL 存在，则通过 https-proxy-agent 创建 Agent 并注入 Axios。
 *
 * @param {string|null} proxyUrl - 代理 URL（如 http://127.0.0.1:7890）
 * @returns {import('axios').AxiosInstance}
 */
function createProxyClient(proxyUrl) {
  const axiosConfig = {
    // 禁用 Axios 内置的代理（我们自己管理 Agent）
    proxy: false,
    // 30 秒超时
    timeout: 30000,
  };

  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    axiosConfig.httpAgent = agent;
    axiosConfig.httpsAgent = agent;
  }

  return axios.create(axiosConfig);
}

/**
 * 代理感知的 Fetch 替代函数。
 * 接口与原生 `fetch(url, options)` 保持最大兼容：
 *   - 返回对象包含 `ok`, `status`, `statusText`, `headers`
 *   - 提供 `json()` 和 `text()` 异步方法
 *
 * @param {string} url - 请求 URL
 * @param {object} [options] - 请求选项
 * @param {string} [options.method] - HTTP 方法（默认 GET）
 * @param {object} [options.headers] - 请求头
 * @param {string} [options.body] - 请求体（JSON 字符串）
 * @param {object} [options._config] - 可选：注入自定义配置对象（用于测试）
 * @returns {Promise<{ok: boolean, status: number, statusText: string, headers: object, json: function, text: function}>}
 */
async function yongleFetch(url, options = {}) {
  const proxyUrl = resolveProxyUrl(options._config || null);
  const client = createProxyClient(proxyUrl);

  try {
    const axiosOpts = {
      url,
      method: (options.method || 'GET').toLowerCase(),
      headers: options.headers || {},
      // Axios 默认只把 2xx 视为成功，我们要模拟 fetch 的行为：任何状态码都返回
      validateStatus: () => true,
    };

    // 解析 body
    if (options.body) {
      axiosOpts.data = options.body;
    }

    const response = await client.request(axiosOpts);

    // 将 Axios 响应适配为类似原生 fetch 的 Response 接口
    const responseData = response.data;
    const status = response.status;
    const statusText = response.statusText || '';
    const ok = status >= 200 && status < 300;

    return {
      ok,
      status,
      statusText,
      headers: response.headers,
      json: async () => {
        // Axios 已自动解析 JSON（当 Content-Type 匹配时）
        if (typeof responseData === 'object') return responseData;
        // 回退：手动解析
        return JSON.parse(typeof responseData === 'string' ? responseData : JSON.stringify(responseData));
      },
      text: async () => {
        if (typeof responseData === 'string') return responseData;
        return JSON.stringify(responseData);
      },
    };
  } catch (err) {
    // 捕获网络层面的异常（代理连接失败、DNS 解析失败等），包装为优雅的错误提示
    const proxyHint = proxyUrl ? ` (代理: ${proxyUrl})` : '';

    if (err.code === 'ECONNREFUSED') {
      throw new Error(
        `[Yongle Proxy Error] 连接被拒绝${proxyHint}。请检查代理服务是否运行中。原始错误: ${err.message}`
      );
    }
    if (err.code === 'ECONNRESET') {
      throw new Error(
        `[Yongle Proxy Error] 连接被重置${proxyHint}。代理服务可能不稳定。原始错误: ${err.message}`
      );
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      throw new Error(
        `[Yongle Proxy Error] 连接超时${proxyHint}。请检查网络连接或代理配置。原始错误: ${err.message}`
      );
    }
    if (err.code === 'ENOTFOUND') {
      throw new Error(
        `[Yongle Proxy Error] DNS 解析失败: ${url}${proxyHint}。请检查域名或网络连接。原始错误: ${err.message}`
      );
    }

    // 通用兜底
    throw new Error(
      `[Yongle Proxy Error] 网络请求失败: ${url}${proxyHint}。原始错误: ${err.message}`
    );
  }
}

module.exports = { yongleFetch, resolveProxyUrl, createProxyClient };
