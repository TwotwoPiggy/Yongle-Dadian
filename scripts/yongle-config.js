const fs = require('fs');
const path = require('path');
const os = require('os');

const homedir = os.homedir();
const globalConfigPath = path.join(homedir, '.yongle_knowledge', 'config.json');

/**
 * @typedef {Object} SearchConfig
 * @property {number} [default_limit] - 检索默认返回条目数
 */

/**
 * @typedef {Object} EmbeddingConfig
 * @property {boolean} [enabled] - 是否启用向量检索
 * @property {'gemini'|'ollama'|'openai'|'deepseek'} provider - 向量抽取服务提供商
 * @property {string} model - 向量提取模型名称
 * @property {string} [apiKey] - 接口密钥
 * @property {string} [baseUrl] - 接口服务基准 URL
 */

/**
 * @typedef {Object} AgentConfig
 * @property {boolean} [enabled] - 是否启用 Agent
 * @property {'gemini'|'ollama'|'openai'|'deepseek'} provider - 对话 Agent 提供商
 * @property {string} model - 对话模型名称
 * @property {string} [apiKey] - 接口密钥
 * @property {string} [baseUrl] - 接口服务基准 URL
 * @property {string} [systemInstruction] - 系统级设定提示词
 */

/**
 * @typedef {Object} YongleSettings
 * @property {SearchConfig} [search] - 搜索选项
 * @property {string} [proxy] - 网络代理端口/URL
 * @property {boolean} [proxyEnabled] - 是否开启网络代理
 */

/**
 * @typedef {Object} YongleConfig
 * @property {YongleSettings} [yongle] - 永乐核心全局/检索设置
 * @property {EmbeddingConfig} [embedding] - 向量化配置
 * @property {AgentConfig} [agent] - 大模型 Agent 对话配置
 */

/**
 * 深度合并两个配置对象（深层复制）
 * @param {Record<string, any>} target - 目标对象
 * @param {Record<string, any>} source - 源对象
 * @returns {Record<string, any>} 合并后的对象
 */
function deepMerge(target, source) {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return target;
  
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' && 
      source[key] !== null && 
      typeof target[key] === 'object' && 
      target[key] !== null
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 向上回溯查找包含指定文件/夹的最近父目录
 * @param {string} filename - 目标文件名或相对路径
 * @param {string} [startDir] - 开始查找的起点目录，默认为 process.cwd()
 * @returns {string|null} 找到的绝对路径，未找到返回 null
 */
function findNearestFile(filename, startDir = process.cwd()) {
  let currentDir = startDir;
  while (true) {
    const checkPath = path.join(currentDir, filename);
    if (fs.existsSync(checkPath)) {
      return checkPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // 根目录
    currentDir = parentDir;
  }
  return null;
}

/**
 * 加载合并后的配置对象 (Global config + Project planning config)
 * @returns {YongleConfig} 合并后的完整配置对象
 */
function loadMergedConfig() {
  let mergedConfig = {};

  // 1. 加载全局配置
  if (fs.existsSync(globalConfigPath)) {
    try {
      const globalContent = fs.readFileSync(globalConfigPath, 'utf8');
      mergedConfig = JSON.parse(globalContent);
    } catch (e) {
      console.warn(`[Yongle Config] 警告: 无法解析全局配置文件: ${e.message}`);
    }
  }

  // 2. 加载项目级配置
  const projectConfigPath = findNearestFile(path.join('.planning', 'config.json'));
  if (projectConfigPath) {
    try {
      const projectContent = fs.readFileSync(projectConfigPath, 'utf8');
      const projectConfig = JSON.parse(projectContent);
      mergedConfig = deepMerge(mergedConfig, projectConfig);
    } catch (e) {
      console.warn(`[Yongle Config] 警告: 无法解析项目级配置文件于 ${projectConfigPath}: ${e.message}`);
    }
  }

  return /** @type {YongleConfig} */ (mergedConfig);
}

module.exports = {
  loadMergedConfig,
  globalConfigPath,
  deepMerge,
  findNearestFile
};
