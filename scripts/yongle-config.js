const fs = require('fs');
const path = require('path');
const os = require('os');

const homedir = os.homedir();
const globalConfigPath = path.join(homedir, '.yongle_knowledge', 'config.json');

/**
 * 深度合并两个配置对象（深层复制）
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

  return mergedConfig;
}

module.exports = {
  loadMergedConfig,
  globalConfigPath,
  deepMerge,
  findNearestFile
};
