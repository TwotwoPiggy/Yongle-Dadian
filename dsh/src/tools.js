/**
 * tools.js — 永乐大典 DSH 插件:面向模型的工具
 *
 * Token 优化设计(利用 DeepSeek 上下文缓存):
 *  1. 知识只经"工具结果"进入上下文 → 位于请求末尾 → 系统提示词与对话历史的
 *     前缀缓存完全不受影响(DeepSeek 前缀缓存命中价格约为未命中的 1/10)
 *  2. 输出紧凑:标题 + 单行摘要 + 路径,默认 5 条,摘要 140 字符
 *  3. 输出字节级确定(排序稳定 + 结果缓存) → 相同查询的重复调用返回完全一致
 *     的文本 → KV/前缀缓存友好
 *  4. 结果缓存(默认 TTL 10 分钟):相同查询秒回,同时省去重复 embedding API 调用
 *  5. 工具描述显式指导模型"上下文已有答案时不要重复调用"
 *  6. detail 模式才返回完整条目(按需取全文,避免常态大输出)
 *
 * 三级知识库:level = project(项目级) | user(用户级) | global(全局级) | auto(合并)
 */
import { yongle, agentCwd, searchKnowledge, recordKnowledge, emitSessionEvent } from './util.js';

/** 命中结构化输出 schema(供 Code Mode / 程序化消费) */
const hitSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    entryType: { type: 'string' },
    snippet: { type: 'string' },
    path: { type: 'string' },
    score: { type: 'number' },
    source: { type: 'string', enum: ['keyword', 'semantic'] },
    level: { type: 'string', enum: ['project', 'user', 'global'] },
  },
};

/** 级别参数 schema(三个工具共用) */
const levelParam = {
  type: 'string',
  enum: ['auto', 'project', 'user', 'global'],
  default: 'auto',
  description: 'project=当前项目知识库;user=个人跨项目知识库;global=团队共享知识库;auto=三级合并检索',
};

/**
 * 注册全部永乐大典工具
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config 插件 Config(原始值,util 层负责与全局配置合并)
 */
export function registerTools(ctx, config) {
  const renderOpts = {
    maxSnippetChars: config.snippetChars ?? 140,
    withScore: config.withScore === true,
    withLevel: true,
  };

  ctx.tools.register({
    name: 'yongle_search',
    description:
      'Search the Yongle Dadian knowledge base for distilled developer experience: bug fixes, root causes, decisions, and known pitfalls. ' +
      'Use the most specific phrasing you can. If relevant knowledge is already in context, do NOT call this tool again. ' +
      'Search is hybrid (keyword + semantic); results are compact, deterministic, and tagged with their level (project/user/global).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language query, e.g. "PowerShell 中文乱码"' },
        level: levelParam,
        limit: { type: 'number', minimum: 1, maximum: 10, default: 5 },
        semanticOnly: { type: 'boolean', default: false, description: 'true: vector search only' },
        detail: { type: 'boolean', default: false, description: 'true: include the full top entry body (rarely needed)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['hybrid', 'fts-only'] },
          modes: { type: 'object' },
          hits: { type: 'array', items: hitSchema },
          detail: hitSchema,
        },
      },
      render: (args, value) => [
        { type: 'text', text: yongle.render.renderHits(value.hits, renderOpts) + (value.detail ? `\n\n${value.detail.title}\n${value.detail.snippet}` : '') },
      ],
      // UI 卡片:search/paths 形态 —— 纯函数 + presentationMeta(持久化)保证回放一致;
      // 无 search 卡能力的 UI 自动回退到渲染文本
      presentationMeta: (args, value) => ({
        paths: (value.hits || []).map((h) => h.path).filter(Boolean),
      }),
      presentResult: (_args, { meta }) => {
        if (!meta || !Array.isArray(meta.paths)) return undefined;
        return {
          card: 'search',
          shape: 'paths',
          title: `Yongle knowledge: ${meta.paths.length} match(es)`,
          paths: meta.paths,
          truncated: false,
          total: meta.paths.length,
        };
      },
    },
    async execute(args, exec) {
      const cwd = agentCwd(exec.agent);
      const result = await searchKnowledge(args.query, {
        level: args.level || 'auto',
        limit: args.limit || config.maxResults,
        semanticOnly: args.semanticOnly || false,
        cwd,
        config,
        signal: exec?.signal,
      });
      let detail = null;
      if (args.detail && result.hits[0]) {
        try {
          const entry = yongle.db.get().prepare(
            'SELECT id, cause_summary, filepath FROM entries WHERE id = ?'
          ).get(result.hits[0].title);
          if (entry) {
            detail = {
              id: entry.id,
              title: entry.id,
              snippet: entry.cause_summary || '',
              path: entry.filepath || '',
            };
          }
        } catch {
          detail = null;
        }
      }
      return {
        mode: result.mode || 'hybrid',
        modes: result.modes || undefined,
        hits: result.hits,
        detail,
      };
    },
  });

  ctx.tools.register({
    name: 'yongle_recall',
    description:
      'Recall project-specific thinking patterns, coding style decisions, and architectural conventions from the Yongle knowledge base. ' +
      'Defaults to project level; use level=user or level=global for personal or team-wide patterns. ' +
      'Prefer this over yongle_search when you need to stay consistent with established decisions.',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'What pattern or decision to recall, e.g. "API 错误处理风格"' },
        level: levelParam,
        limit: { type: 'number', minimum: 1, maximum: 5, default: 3 },
      },
      required: ['intent'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          mode: { type: 'string' },
          hits: { type: 'array', items: hitSchema },
        },
      },
      render: (args, value) => [{ type: 'text', text: yongle.render.renderHits(value.hits, renderOpts) }],
      presentationMeta: (args, value) => ({
        paths: (value.hits || []).map((h) => h.path).filter(Boolean),
      }),
      presentResult: (_args, { meta }) => {
        if (!meta || !Array.isArray(meta.paths)) return undefined;
        return {
          card: 'search',
          shape: 'paths',
          title: `Yongle recall: ${meta.paths.length} pattern(s)`,
          paths: meta.paths,
          truncated: false,
          total: meta.paths.length,
        };
      },
    },
    async execute(args, exec) {
      const cwd = agentCwd(exec.agent);
      const result = await searchKnowledge(args.intent, {
        level: args.level || 'project',
        limit: args.limit || 3,
        cwd,
        config,
        signal: exec?.signal,
      });
      return { mode: result.mode || 'hybrid', hits: result.hits };
    },
  });

  ctx.tools.register({
    name: 'yongle_remember',
    description:
      'Record a distilled knowledge entry into the Yongle Dadian knowledge base with an explicit level. ' +
      'Use project for workspace-specific solutions, user for personal cross-project experience, global for team-wide knowledge. ' +
      'Keep the summary concise (one or two sentences). Record only durable, reusable knowledge — not routine steps.',
    parameters: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['project', 'user', 'global'],
          description: 'project=项目级(随项目分享);user=用户级(个人跨项目);global=全局级(团队共享)',
        },
        title: { type: 'string', description: 'Entry title, e.g. "PowerShell 中文乱码修复"' },
        summary: { type: 'string', description: 'One-line root cause / key takeaway (the searchable essence)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
        content: { type: 'string', description: 'Optional detailed body: problem, failed attempts, final solution' },
      },
      required: ['level', 'title', 'summary'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          level: { type: 'string' },
          id: { type: 'string' },
          path: { type: 'string' },
        },
      },
      render: (args, value) => [{ type: 'text', text: `Recorded [${value.level}] ${value.id}\n${value.path}` }],
      presentationMeta: (args, value) => ({
        level: value.level,
        id: value.id,
        path: value.path,
        title: args.title,
        summary: args.summary,
      }),
      presentResult: (_args, { meta }) => {
        if (!meta) return undefined;
        return {
          card: 'generic',
          title: `📝 Knowledge Recorded [${meta.level}]`,
          description: `${meta.title}\n${meta.summary || ''}`,
          paths: meta.path ? [meta.path] : [],
        };
      },
    },
    async execute(args, exec) {
      const cwd = agentCwd(exec.agent);
      const r = await recordKnowledge({
        level: args.level,
        title: args.title,
        summary: args.summary,
        tags: args.tags || [],
        content: args.content || '',
        cwd,
        config,
        signal: exec?.signal,
      });
      emitSessionEvent(ctx, exec.agent, {
        type: 'yongle/remembered',
        data: { level: r.level, id: r.id, filepath: r.filepath },
      });
      return { level: r.level, id: r.id, path: r.filepath };
    },
  });

  ctx.tools.register({
    name: 'yongle_status',
    description: 'Show Yongle Dadian knowledge base status across all levels: entry counts, search modes, and level configuration.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          stats: { type: 'array' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
      presentationMeta: (_args, value) => ({
        stats: value.stats,
        dashboard: value.text,
      }),
      presentResult: (_args, { meta }) => {
        if (!meta) return undefined;
        return {
          card: 'generic',
          title: '🏛️ Yongle Dadian Knowledge Base Status',
          description: meta.dashboard,
        };
      },
    },
    async execute(_args, exec) {
      const cwd = agentCwd(exec.agent);
      const all = yongle.statsAll({ cwd, config });
      const text = yongle.render.renderStatusDashboard(all, { config, cwd });
      return {
        text,
        stats: all,
      };
    },
  });
}
