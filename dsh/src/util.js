/**
 * util.js — 永乐大典 DSH 插件:公共工具
 *  - 核心引擎接入(自包含:内嵌 lib/core,由 scripts/sync-core.mjs 同步)
 *  - 配置合并:插件 Config 覆盖 ~/.yongle_knowledge/config.json
 *  - 三级知识库:project(项目级) / user(用户级) / global(全局级)
 *  - 调用方工作区(cwd)解析 → 级别判定
 *  - 首次检索自动建索引(无感)
 */
import yongle from '../lib/core/index.js';
import yongleConfig from '../lib/yongle-config.js';

export { yongle, yongleConfig };

/**
 * 合并配置:插件配置(来自 cordis.yml)优先于 yongle 全局配置
 * @param {object} pluginConfig 插件 Config(已由 schemastery 校验+填默认值)
 */
export function resolveConfig(pluginConfig) {
  const global = yongle.init();
  const merged = {
    embedding: { ...(global.embedding || {}), ...(pluginConfig?.embedding || {}) },
    agent: { ...(global.agent || {}), ...(pluginConfig?.agent || {}) },
    yongle: { ...(global.yongle || {}), ...(pluginConfig?.yongle || {}) },
  };
  // 存储路径(三级知识库):插件 storage 节优先
  const gs = global.yongle?.storage || {};
  const ps = pluginConfig?.storage || {};
  merged.yongle.storage = {
    user_path: ps.user_path || gs.user_path || undefined,
    global_path: ps.global_path || gs.global_path || undefined,
  };
  // 插件配置显式给出的键优先(如 apiKey 为空字符串则回退全局)
  for (const section of ['embedding', 'agent']) {
    const pc = pluginConfig?.[section];
    if (!pc) continue;
    for (const key of ['enabled', 'provider', 'model', 'apiKey', 'baseUrl']) {
      if (pc[key] !== undefined && pc[key] !== '') merged[section][key] = pc[key];
    }
  }
  return merged;
}

/**
 * 获取调用方工作区目录
 * @param {object|undefined} agent ToolExecution.exec.agent
 * @returns {string|null}
 */
export function agentCwd(agent) {
  try {
    return agent?.session?.meta?.cwd || agent?.session?.header?.cwd || null;
  } catch {
    return null;
  }
}

/** 级别索引状态缓存:避免同级别同目录重复 scan */
const _indexedLevels = new Set();

/**
 * 确保索引就绪(按级别增量扫描)
 * @param {string[]} levels
 * @param {string|null} cwd
 */
export function ensureIndexed(levels, cwd) {
  for (const lv of levels) {
    const key = `${lv}|${cwd || ''}`;
    if (_indexedLevels.has(key)) continue;
    try {
      yongle.ensureIndexed({ level: lv, cwd });
      _indexedLevels.add(key);
    } catch {
      // 未配置级别(如 global)跳过
    }
  }
}

/**
 * 执行检索(插件统一入口:配置合并 + 确保索引 + 缓存 + 取消信号支持)
 * level=auto → 多级合并(project+user+global);否则单级别
 * @param {string} query
 * @param {{level?:string, limit?:number, semanticOnly?:boolean, cwd?:string|null, config?:object, signal?:AbortSignal}} [options]
 */
export async function searchKnowledge(query, options = {}) {
  const level = yongle.paths.normalizeLevel(options.level);
  const config = resolveConfig(options.config || {});
  const cwd = options.cwd || null;
  ensureIndexed(level === 'auto' ? ['project', 'user', 'global'] : [level], cwd);
  if (level === 'auto') {
    return yongle.searchAll(query, {
      ...options,
      cwd,
      config,
    });
  }
  return yongle.hybridSearch(query, {
    ...options,
    level,
    cwd,
    config,
  });
}

/**
 * 记录一条知识(区分级别)
 * @param {{level:string, title:string, summary?:string, tags?:string[], content?:string, cwd?:string|null, config?:object, signal?:AbortSignal}} [options]
 */
export async function recordKnowledge(options = {}) {
  const level = yongle.paths.normalizeLevel(options.level);
  if (level === 'auto') throw new Error('record requires an explicit level: project | user | global');
  const config = resolveConfig(options.config || {});
  return yongle.record({
    ...options,
    level,
    config,
    embed: true,
  });
}

/**
 * 向 DSH 会话日志广播持久化事件(安全包装,不抛错)
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} agentOrSession
 * @param {{type:string, data:object}} event
 */
export function emitSessionEvent(ctx, agentOrSession, event) {
  try {
    const session = agentOrSession?.session || agentOrSession;
    if (!session) return;
    if (typeof ctx?.emit === 'function') {
      ctx.emit('session/event', session, event);
    }
  } catch {
    // 事件发送异常不阻断业务流程
  }
}

