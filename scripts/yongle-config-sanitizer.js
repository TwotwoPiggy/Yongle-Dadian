const fs = require('fs');
const path = require('path');

/**
 * 递归检查对象是否包含 apiKey 字段
 * @param {Record<string, any>} config - 目标对象
 * @returns {boolean}
 */
function hasApiKeys(config) {
  if (typeof config !== 'object' || config === null) return false;
  if (Array.isArray(config)) {
    return config.some(item => hasApiKeys(item));
  }
  for (const key of Object.keys(config)) {
    if (key === 'apiKey') return true;
    if (hasApiKeys(config[key])) return true;
  }
  return false;
}

/**
 * 递归删除对象中的 apiKey 字段（深克隆返回新对象，不修改原对象）
 * @param {Record<string, any>} config - 目标对象
 * @returns {Record<string, any>}
 */
function stripApiKeys(config) {
  if (typeof config !== 'object' || config === null) return config;
  if (Array.isArray(config)) {
    return config.map(item => stripApiKeys(item));
  }
  
  const result = {};
  for (const key of Object.keys(config)) {
    if (key === 'apiKey') {
      continue; // 跳过 apiKey
    }
    result[key] = stripApiKeys(config[key]);
  }
  return result;
}

/**
 * 从文件读取配置并剥离 apiKey
 * @param {string} configPath - 文件绝对路径
 * @returns {Record<string, any>} 过滤后的配置对象
 */
function stripApiKeysFromFile(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
    return stripApiKeys(parsed);
  } catch (e) {
    throw new Error(`无法读取或解析配置文件 ${configPath}: ${e.message}`);
  }
}

module.exports = {
  hasApiKeys,
  stripApiKeys,
  stripApiKeysFromFile
};
