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
import { yongle, yongleConfig } from './util.js';

export const name = 'yongle-dadian-dsh';


/** 依赖:tools, commands, webServer 服务 */
export const inject = ['tools', 'commands', 'webServer'];

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

  // 状态与可视化管理 API 路由: 供前端设置面板与底栏挂件拉取及更新知识库配置与状态
  if (typeof ctx?.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      function sendJson(res, statusCode, data) {
        const body = JSON.stringify(data);
        res.writeHead(statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
      }

      function readJsonBody(req) {
        return new Promise((resolve, reject) => {
          let raw = '';
          let settled = false;
          const cleanup = () => {
            req.removeListener('data', onData);
            req.removeListener('end', onEnd);
            req.removeListener('error', onError);
          };
          const onData = (chunk) => {
            if (settled) return;
            raw += chunk;
            if (raw.length > 1024 * 1024) {
              settled = true;
              cleanup();
              if (typeof req.destroy === 'function') req.destroy();
              reject(new Error('Payload too large'));
            }
          };
          const onEnd = () => {
            if (settled) return;
            settled = true;
            cleanup();
            try {
              resolve(raw ? JSON.parse(raw) : {});
            } catch (err) {
              reject(new Error('Invalid JSON body: ' + err.message));
            }
          };
          const onError = (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
          };
          req.on('data', onData);
          req.on('end', onEnd);
          req.on('error', onError);
        });
      }

      async function routeHandler(req, res) {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          });
          res.end();
          return;
        }

        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const cleanPath = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '');

        // 1. 全景状态看板 API (/yongle/stats)
        if (cleanPath === '/yongle/stats') {
          if (req.method === 'GET') {
            try {
              const all = yongle.statsAll({ config });
              const currentCfg = yongleConfig.loadMergedConfig();
              const embedding = config.embedding?.enabled === false ? 'disabled (fts-only)' : (config.embedding?.provider || currentCfg.embedding?.provider || 'ollama');
              const model = config.embedding?.model || currentCfg.embedding?.model || 'nomic-embed-text';
              const data = {
                ok: true,
                stats: all,
                embedding: {
                  provider: embedding,
                  model,
                  enabled: config.embedding?.enabled !== false,
                },
                config: currentCfg,
                autoPostmortem: !!config.autoPostmortem,
                globalConfigPath: yongleConfig.globalConfigPath,
              };
              sendJson(res, 200, data);
            } catch (err) {
              sendJson(res, 500, { ok: false, error: String(err?.message || err) });
            }
            return;
          }
          sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
          return;
        }

        // 2. 配置读取与保存 API (/yongle/config)
        if (cleanPath === '/yongle/config') {
          if (req.method === 'GET') {
            try {
              const currentCfg = yongleConfig.loadMergedConfig();
              sendJson(res, 200, {
                ok: true,
                config: currentCfg,
                globalConfigPath: yongleConfig.globalConfigPath,
              });
            } catch (err) {
              sendJson(res, 500, { ok: false, error: String(err?.message || err) });
            }
            return;
          }
          if (req.method === 'POST') {
            try {
              const body = await readJsonBody(req);
              const targetConfig = body.config || body;
              const saved = yongleConfig.saveGlobalConfig(targetConfig);
              sendJson(res, 200, {
                ok: true,
                message: '全局配置已成功保存至 ' + yongleConfig.globalConfigPath,
                config: saved,
              });
            } catch (err) {
              sendJson(res, 400, { ok: false, error: String(err?.message || err) });
            }
            return;
          }
          sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
          return;
        }

        // 3. 一键全量索引重建 API (/yongle/reindex)
        if (cleanPath === '/yongle/reindex') {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
            return;
          }
          try {
            const userReindex = yongle.reindex({ level: 'user' });
            let projReindex = null;
            try {
              projReindex = yongle.reindex({ level: 'project' });
            } catch {}
            const updatedStats = yongle.statsAll({ config });
            sendJson(res, 200, {
              ok: true,
              message: '知识库索引重建成功！',
              user: userReindex,
              project: projReindex,
              stats: updatedStats,
            });
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String(err?.message || err) });
          }
          return;
        }

        // 4. 知识库自愈巡检 API (/yongle/repair)
        if (cleanPath === '/yongle/repair') {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
            return;
          }
          try {
            const lintResults = await yongle.lintAll({ fix: true, config });
            const updatedStats = yongle.statsAll({ config });
            sendJson(res, 200, {
              ok: true,
              message: '知识库健康巡检与格式自愈完成！',
              results: lintResults,
              stats: updatedStats,
            });
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String(err?.message || err) });
          }
          return;
        }

        sendJson(res, 404, { ok: false, error: 'Not Found' });
      }

      // 同时注册 /yongle 与 /api/yongle 两个前缀路由
      webCtx.effect(() => {
        const d1 = webCtx.webServer.register({
          kind: 'prefix',
          path: '/yongle',
          handler: routeHandler,
        });
        const d2 = webCtx.webServer.register({
          kind: 'prefix',
          path: '/api/yongle',
          handler: routeHandler,
        });
        return () => {
          d1();
          d2();
        };
      }, 'yongle: webServer routes');
    });
  }


  ctx.logger?.info?.('[yongle] plugin loaded: tools + commands + hooks + web routes registered');
}

