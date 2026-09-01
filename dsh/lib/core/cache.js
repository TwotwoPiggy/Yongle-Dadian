/**
 * cache.js — 永乐大典核心引擎:内存缓存工具
 *  - LruCache:通用 LRU(容量 + TTL)
 *  - 查询向量缓存:内存 LRU(首查后免 API 调用)
 *  - 检索结果缓存:同 scope+query 重复查询秒回(同时保证字节级稳定输出,
 *    使 DSH 会话中重复检索的工具结果完全一致 → DeepSeek 前缀缓存友好)
 */
'use strict';

class LruCache {
  /**
   * @param {number} [capacity]
   * @param {number} [ttlMs] 0 = 不过期
   */
  constructor(capacity = 512, ttlMs = 0) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    /** @type {Map<string, {v:any, at:number}>} */
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.ttlMs > 0 && Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // LRU 触碰:重插到末尾
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.v;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { v: value, at: Date.now() });
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

module.exports = { LruCache };
