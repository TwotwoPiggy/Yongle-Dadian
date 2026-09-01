/**
 * yongle-dadian-dsh — 永乐大典 × DeepSeek Harness 原生插件入口
 *
 * 一个插件行注册全部能力(工具 + 人类命令 + 钩子):
 *  - 工具:yongle_search / yongle_recall / yongle_status(自动进入模型提示词)
 *  - 命令:/yongle-search / /yongle-reindex / /yongle-status(人类侧,不进模型消息)
 *  - 钩子:autoPostmortem 开启后,回合内工具失败时向模型注入极短检索提醒
 *
 * 设计约束:
 *  - 运行时零 @deepseek-ai/cordis 依赖(不扩展 Service 基类 → 无双包陷阱)
 *  - 唯一运行时依赖:@deepseek-ai/schemastery(纯校验,Standard Schema 鸭子类型兼容)
 *  - 检索引擎复用永乐大典 scripts/core(进程内 SQLite FTS5 + LanceDB 连接复用)
 */
import Schema from '@deepseek-ai/schemastery';
import { registerTools } from './tools.js';
import { registerCommands } from './commands.js';
import { registerHook } from './hooks.js';
import { yongle } from './util.js';

export const name = 'yongle-dadian-dsh';

/** 依赖:tools 与 commands 服务(dsh-base 提供,web/headless 组合均存在) */
export const inject = ['tools', 'commands'];

export const Config = Schema.object({
  // 检索输出(Token 优化)
  maxResults: Schema.number().default(5).description('tool 默认返回条数(1-10)'),
  snippetChars: Schema.number().default(140).description('摘要最大字符数(约 70-140 token)'),
  withScore: Schema.boolean().default(false).description('是否在渲染中显示相似度分数'),
  // 结果缓存:相同查询在 TTL 内返回字节级一致的结果(前缀缓存友好 + 免重复 embedding)
  resultCacheTtlMs: Schema.number().default(600000).description('结果缓存 TTL(毫秒)'),
  // 自动复盘钩子(默认关闭)
  autoPostmortem: Schema.boolean().default(false).description('回合内工具失败时自动注入检索提醒'),
  // 三级知识库存储位置(可选;缺省继承 ~/.yongle_knowledge/config.json)
  storage: Schema.object({
    user_path: Schema.string().description('用户级知识库根目录(缺省 ~/.yongle_knowledge)'),
    global_path: Schema.string().description('全局级(团队共享)知识库根目录;未配置则 global 级别禁用'),
  }),
  // 知识库配置(可选;未填字段继承 ~/.yongle_knowledge/config.json)
  embedding: Schema.object({
    enabled: Schema.boolean().default(true),
    provider: Schema.string().default('ollama'),
    model: Schema.string().default('nomic-embed-text'),
    apiKey: Schema.string().description('embedding API 密钥;推荐用 !!js process.env.X 注入'),
    baseUrl: Schema.string(),
  }),
  agent: Schema.object({
    enabled: Schema.boolean().default(true),
    provider: Schema.string().default('ollama'),
    model: Schema.string().default('llama3'),
    apiKey: Schema.string(),
    baseUrl: Schema.string(),
  }),
});

export function apply(ctx, config) {
  registerTools(ctx, config);
  registerCommands(ctx, config);
  registerHook(ctx, config);

  // 可逆副作用:插件卸载 / HMR 热重载时安全释放 SQLite 与 LanceDB 连接
  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => {
      return () => {
        try {
          yongle.close();
        } catch {
          // ignore
        }
      };
    });
  }

  // 状态 API 路由: 供前端 conversation.composer.dock 挂件拉取知识库实时数据
  if (typeof ctx?.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: '/yongle/stats',
        async handler(req, res) {
          if (req.method === 'GET') {
            try {
              const all = yongle.statsAll({ config });
              const embedding = config.embedding?.enabled === false ? 'disabled (fts-only)' : (config.embedding?.provider || 'default');
              const data = {
                ok: true,
                stats: all,
                embedding: {
                  provider: embedding,
                  model: config.embedding?.model || 'default',
                },
                autoPostmortem: !!config.autoPostmortem,
              };
              res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
              });
              res.end(JSON.stringify(data));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
            }
            return;
          }
          res.writeHead(405, { Allow: 'GET' });
          res.end();
        },
      }), 'yongle: stats route');
    });
  }

  ctx.logger?.info?.('[yongle] plugin loaded: tools + commands + hooks + web routes registered');
}
