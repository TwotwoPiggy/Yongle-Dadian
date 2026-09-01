/**
 * paths.js — 永乐大典核心引擎:路径与级别解析
 *
 * 知识库三级体系:
 *  - project(项目级): <cwd>/.planning/yongle —— 随项目走,可随项目 git 分享
 *  - user(用户级):    ~/.yongle_knowledge —— 用户跨项目个人知识库
 *                     (env YONGLE_HOME 或 config yongle.storage.user_path 可覆盖)
 *  - global(全局级):  团队/机器共享知识库 —— env YONGLE_GLOBAL_HOME 或
 *                     config yongle.storage.global_path 指定;未配置 = 禁用
 *
 * 兼容别名: 'local' → project;旧 'global' 语义(家目录) → user
 */
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

/** 规范化级别名:接受别名,返回标准名 project|user|global */
function normalizeLevel(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'local' || l === 'project') return 'project';
  if (l === 'user') return 'user';
  if (l === 'global') return 'global';
  return null;
}

/** 用户级知识库根目录(env YONGLE_HOME > config > 默认家目录) */
function userHome(config) {
  const cfgPath = config?.yongle?.storage?.user_path;
  return process.env.YONGLE_HOME || (cfgPath && String(cfgPath)) || path.join(os.homedir(), '.yongle_knowledge');
}

/** 全局级(共享)知识库根目录;未配置返回 null(该级别禁用) */
function globalHome(config) {
  const cfgPath = config?.yongle?.storage?.global_path;
  if (process.env.YONGLE_GLOBAL_HOME) return process.env.YONGLE_GLOBAL_HOME;
  if (cfgPath && String(cfgPath).trim()) return String(cfgPath).trim();
  return null;
}

/**
 * 解析一个级别的全部路径
 * @param {string} level project|user|global(或别名 local/旧 global)
 * @param {string} [cwd] project 级别的项目根(默认 process.cwd())
 * @param {object} [config] 合并后的配置(读取 storage.user_path/global_path)
 * @returns {{level:string, root:string, db:string, memoryDir:string, lanceDir:string, enabled:boolean}}
 */
function resolveLevel(level, cwd, config) {
  const lv = normalizeLevel(level);
  if (!lv) throw new Error(`Unknown level: ${level}. Use 'project' | 'user' | 'global'.`);
  if (lv === 'project') {
    const root = path.join(cwd || process.cwd(), '.planning', 'yongle');
    return {
      level: lv,
      root,
      db: path.join(root, 'yongle.db'),
      memoryDir: path.join(root, 'memory'),
      lanceDir: path.join(root, 'vector_store.lance'),
      enabled: true,
    };
  }
  if (lv === 'user') {
    const root = userHome(config);
    return {
      level: lv,
      root,
      db: path.join(root, 'yongle.db'),
      memoryDir: path.join(root, 'memory'),
      lanceDir: path.join(root, 'vector_store.lance'),
      enabled: true,
    };
  }
  // global(共享)
  const root = globalHome(config);
  if (!root) {
    return { level: lv, root: null, db: null, memoryDir: null, lanceDir: null, enabled: false };
  }
  return {
    level: lv,
    root,
    db: path.join(root, 'yongle.db'),
    memoryDir: path.join(root, 'memory'),
    lanceDir: path.join(root, 'vector_store.lance'),
    enabled: true,
  };
}


/**
 * auto 级别判定:项目知识库存在 → project,否则 user
 * @param {string} [cwd]
 * @returns {'project'|'user'}
 */
function autoLevel(cwd) {
  const base = path.join(cwd || process.cwd(), '.planning', 'yongle');
  if (fs.existsSync(path.join(base, 'yongle.db')) || fs.existsSync(path.join(base, 'memory'))) {
    return 'project';
  }
  return 'user';
}

/**
 * 可用级别列表(按优先级:project → user → global)
 * @param {string} [cwd]
 * @param {object} [config]
 * @returns {Array<{level:string, enabled:boolean, root:string|null}>}
 */
function listLevels(cwd, config) {
  return ['project', 'user', 'global'].map((lv) => {
    const p = resolveLevel(lv, cwd, config);
    return { level: lv, enabled: p.enabled, root: p.root };
  });
}

module.exports = { yongleHome: userHome, globalHome, normalizeLevel, resolveLevel, autoLevel, listLevels };
