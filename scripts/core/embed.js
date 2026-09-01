/**
 * embed.js — 永乐大典核心引擎:Embedding 获取与磁盘缓存
 * 缓存顺序:磁盘 JSON 缓存(复用旧 query_cache.json,内存常驻)→ API
 * 磁盘写入防抖(300ms),避免每次查询整文件重写;容量上限淘汰最旧项。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { yongleHome } = require('./paths');

/** 磁盘缓存状态 */
let _fileCache = null;
let _fileCachePath = null;
let _writeTimer = null;
let _dirty = false;
const FILE_CACHE_MAX = 2000;

/** 懒加载磁盘缓存(兼容旧 query_cache.json 格式:{"provider:model:keyword": vector}) */
function fileCache() {
  if (_fileCache) return _fileCache;
  _fileCachePath = path.join(yongleHome(), 'query_cache.json');
  try {
    if (fs.existsSync(_fileCachePath)) {
      _fileCache = JSON.parse(fs.readFileSync(_fileCachePath, 'utf8'));
    }
  } catch {
    _fileCache = {};
  }
  if (!_fileCache || typeof _fileCache !== 'object') _fileCache = {};
  return _fileCache;
}

function scheduleWrite() {
  _dirty = true;
  if (_writeTimer) return;
  _writeTimer = setTimeout(() => {
    _writeTimer = null;
    if (!_dirty) return;
    _dirty = false;
    try {
      fs.mkdirSync(path.dirname(_fileCachePath), { recursive: true });
      fs.writeFileSync(_fileCachePath, JSON.stringify(_fileCache));
    } catch {
      /* 写入失败不影响检索 */
    }
  }, 300);
}

/**
 * 获取(带缓存)文本向量
 * @param {string} text
 * @param {{provider:string, model:string, apiKey?:string, baseUrl?:string}} embedConfig
 * @param {{force?:boolean}} [opts]
 * @returns {Promise<number[]|null>} null = embedding 被禁用或获取失败
 */
async function getEmbeddingCached(text, embedConfig, opts = {}) {
  const provider = embedConfig.provider || 'ollama';
  const model = embedConfig.model || 'nomic-embed-text';
  const key = `${provider}:${model}:${text}`;

  if (!opts.force) {
    const fc = fileCache();
    if (Object.prototype.hasOwnProperty.call(fc, key)) {
      const v = fc[key];
      return v;
    }
  }

  if (opts.signal?.aborted) return null;

  const { getEmbedding } = require('../yongle-embed.js');
  const vector = await getEmbedding(text, provider, model, embedConfig.apiKey, embedConfig.baseUrl, { signal: opts.signal });
  if (vector) {
    const fc = fileCache();
    fc[key] = vector;
    const keys = Object.keys(fc);
    while (keys.length > FILE_CACHE_MAX) {
      delete fc[keys.shift()];
    }
    scheduleWrite();
  }
  return vector;
}

/** 立即落盘(进程退出前调用) */
function flush() {
  if (_writeTimer) {
    clearTimeout(_writeTimer);
    _writeTimer = null;
  }
  if (_dirty && _fileCache) {
    try {
      fs.mkdirSync(path.dirname(_fileCachePath), { recursive: true });
      fs.writeFileSync(_fileCachePath, JSON.stringify(_fileCache));
    } catch { /* ignore */ }
    _dirty = false;
  }
}

module.exports = { getEmbeddingCached, flush };
