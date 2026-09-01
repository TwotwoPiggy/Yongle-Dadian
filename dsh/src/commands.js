/**
 * commands.js — 永乐大典 DSH 插件:人类命令(以 / 开头,不进入模型消息)
 * 注册 API 与 dsh-command-goal 一致:
 *   ctx.commands.register({ name, description, input: { hint }, handler: (invocation) => ({kind, text}) })
 *
 * 三级知识库:--level project|user|global(缺省 auto=合并检索)
 */
import { yongle, agentCwd, searchKnowledge, recordKnowledge, emitSessionEvent } from './util.js';

function parseFlags(raw, flags) {
  const out = {};
  for (const f of flags) {
    if (f === 'semantic-only') { out[f] = raw.includes('--semantic-only'); continue; }
    if (f === 'global') { out[f] = raw.includes('--global'); continue; }
    const m = raw.match(new RegExp(`--${f}\\s+("(?:[^"\\\\]|\\\\.)*"|[^\\s]+)`));
    if (m) {
      const v = m[1];
      out[f] = v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v;
    }
  }
  return out;
}

/** 去掉已解析的 flag 片段,得到剩余正文 */
function stripFlags(raw, flags) {
  let s = raw;
  for (const f of flags) {
    if (f === 'semantic-only') { s = s.replace('--semantic-only', ' '); continue; }
    if (f === 'global') { s = s.replace('--global', ' '); continue; }
    s = s.replace(new RegExp(`--${f}\\s+("(?:[^"\\\\]|\\\\.)*"|[^\\s]+)`), ' ');
  }
  return s.trim();
}

/** 统一包装命令 handler，捕获同步与异步异常 */
function wrapHandler(name, fn) {
  return (invocation) => {
    try {
      const res = fn(invocation);
      if (res && typeof res.then === 'function') {
        return res.catch((err) => ({
          kind: 'error',
          text: `Yongle ${name} failed: ${err?.message || String(err)}`,
        }));
      }
      return res;
    } catch (err) {
      return { kind: 'error', text: `Yongle ${name} failed: ${err?.message || String(err)}` };
    }
  };
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
export function registerCommands(ctx, config) {
  ctx.commands.register({
    name: 'yongle-search',
    description: 'search the Yongle Dadian knowledge base (levels: project/user/global/auto)',
    input: { hint: '<query> [--level auto|project|user|global] [--semantic-only] [--limit <n>]' },
    handler: wrapHandler('search', async (invocation) => {
      const raw = String(invocation.rawInput || '').trim();
      const flags = parseFlags(raw, ['level', 'global', 'semantic-only', 'limit']);
      const query = stripFlags(raw, ['level', 'global', 'semantic-only', 'limit']);
      if (!query) {
        return { kind: 'error', text: 'Usage: /yongle-search <query> [--level auto|project|user|global] [--semantic-only] [--limit <n>]' };
      }
      const cwd = agentCwd(invocation.agent);
      const level = flags.global ? 'user' : (flags.level || 'auto'); // --global 兼容旧习惯(用户级)
      const result = await searchKnowledge(query, {
        level,
        limit: flags.limit ? parseInt(flags.limit, 10) : config.maxResults,
        semanticOnly: flags['semantic-only'] || false,
        cwd,
        config,
      });
      return { kind: 'success', text: renderCommandHits(result) };
    }),
  });

  ctx.commands.register({
    name: 'yongle-record',
    description: 'record a knowledge entry into the Yongle Dadian knowledge base with an explicit level',
    input: { hint: '<title> --level project|user|global [--summary "..."] [--tags a,b]' },
    handler: wrapHandler('record', async (invocation) => {
      const raw = String(invocation.rawInput || '').trim();
      const flags = parseFlags(raw, ['level', 'summary', 'tags']);
      const title = stripFlags(raw, ['level', 'summary', 'tags']);
      if (!flags.level || !title) {
        return { kind: 'error', text: 'Usage: /yongle-record <title> --level project|user|global [--summary "..."] [--tags a,b]' };
      }
      const cwd = agentCwd(invocation.agent);
      const r = await recordKnowledge({
        level: flags.level,
        title,
        summary: flags.summary || title,
        tags: flags.tags ? flags.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        cwd,
        config,
      });
      emitSessionEvent(ctx, invocation.agent, {
        type: 'yongle/recorded',
        data: { level: r.level, id: r.id, filepath: r.filepath },
      });
      return { kind: 'success', text: `Recorded [${r.level}] ${r.id}\n${r.filepath}` };
    }),
  });

  ctx.commands.register({
    name: 'yongle-postmortem',
    description: 'distill the current session into a Yongle Dadian knowledge draft (LLM summary, two-stage confirm)',
    input: { hint: '[--level project|user|global]' },
    handler: wrapHandler('postmortem', async (invocation) => {
      const raw = String(invocation.rawInput || '').trim();
      const flags = parseFlags(raw, ['level', 'global']);
      const cwd = agentCwd(invocation.agent);
      const level = flags.global ? 'user' : (flags.level || yongle.paths.autoLevel(cwd));
      const events = invocation.agent?.session?.events || [];
      if (!events.length) {
        return { kind: 'error', text: 'No session events available for postmortem.' };
      }
      const r = await yongle.createPostmortemDraft({
        level,
        events,
        cwd,
        config,
      });
      if (!r.ok) {
        return { kind: 'success', text: `Yongle postmortem: nothing to distill (${r.error || 'no solved problem detected'}).` };
      }
      emitSessionEvent(ctx, invocation.agent, {
        type: 'yongle/draft_created',
        data: {
          level: r.level,
          draftPath: r.draftPath,
          title: r.draft?.title,
          root_cause: r.draft?.root_cause,
          command: `/yongle-confirm "${r.draftPath}" --level ${r.level}`,
        },
      });
      return {
        kind: 'success',
        text: yongle.render.renderDraftCard({
          level: r.level,
          draftPath: r.draftPath,
          title: r.draft?.title,
          root_cause: r.draft?.root_cause,
        }),
      };
    }),
  });

  ctx.commands.register({
    name: 'yongle-confirm',
    description: 'confirm a Yongle Dadian draft: archive into the knowledge base and index it',
    input: { hint: '<draft-path> [--level project|user|global]' },
    handler: wrapHandler('confirm', (invocation) => {
      const raw = String(invocation.rawInput || '').trim();
      const flags = parseFlags(raw, ['level', 'global']);
      const draftPath = stripFlags(raw, ['level', 'global']);
      if (!draftPath) {
        return { kind: 'error', text: 'Usage: /yongle-confirm <draft-path> [--level project|user|global]' };
      }
      const cwd = agentCwd(invocation.agent);
      const level = flags.global ? 'user' : (flags.level || yongle.paths.autoLevel(cwd));
      const jobs = ctx.get?.('jobs') || ctx.jobs;
      // 若有 jobs 服务，则异步后台向量化，避免阻塞确认响应
      const r = yongle.confirmDraft({ level, draftPath, cwd, config, embed: !jobs });
      if (!r.ok) return { kind: 'error', text: `Yongle confirm failed: ${r.error}` };

      emitSessionEvent(ctx, invocation.agent, {
        type: 'yongle/archived',
        data: { level: r.level, id: r.id, filepath: r.filepath },
      });

      if (jobs && typeof jobs.start === 'function' && r.filepath) {
        try {
          jobs.start({
            kind: 'yongle-embed',
            label: `Yongle Vectorize: ${r.id}`,
            owner: invocation.agent,
            async run(signal) {
              await yongle.embedDocument(r.filepath, { level: r.level, cwd, config, signal });
            },
          });
          return { kind: 'success', text: `Archived [${r.level}] ${r.id}\n${r.filepath}\nIndexed; background job started for vectorization.` };
        } catch {
          // 后台任务启动失败则兜底普通异步执行
          yongle.embedDocument(r.filepath, { level: r.level, cwd, config }).catch(() => {});
        }
      }
      return { kind: 'success', text: `Archived [${r.level}] ${r.id}\n${r.filepath}\nIndexed; embedding in background.` };
    }),
  });

  ctx.commands.register({
    name: 'yongle-repair',
    description: 'detect and repair stale/legacy vector chunks in the Yongle vector store (--run to re-embed)',
    input: { hint: '[--level project|user|global] [--run]' },
    handler: wrapHandler('repair', async (invocation) => {
      const raw = String(invocation.rawInput || '').trim();
      const flags = parseFlags(raw, ['level', 'global']);
      const run = raw.includes('--run');
      const cwd = agentCwd(invocation.agent);
      const level = flags.global ? 'user' : (flags.level || yongle.paths.autoLevel(cwd));
      const jobs = ctx.get?.('jobs') || ctx.jobs;
      if (run && jobs && typeof jobs.start === 'function') {
        jobs.start({
          kind: 'yongle-repair',
          label: `Yongle Vector Repair [${level}]`,
          owner: invocation.agent,
          async run(signal) {
            await yongle.repairVectors({ level, cwd, config, dryRun: false, signal });
          },
        });
        return { kind: 'success', text: `Yongle vector repair [${level}] started as a background job.` };
      }

      const r = await yongle.repairVectors({ level, cwd, config, dryRun: !run });
      const lines = [
        `Yongle vector repair [${r.level}] mode=${r.dryRun ? 'dry-run' : 'repair'}`,
        `  scanned=${r.scanned} affected=${r.affected} staleRows=${r.staleRows}`,
      ];
      if (!r.dryRun) lines.push(`  reembedded=${r.reembedded} deleted=${r.deleted}`);
      if (r.dryRun && r.staleRows > 0) lines.push('  Run /yongle-repair --run to re-embed (calls embedding API).');
      if (r.staleRows === 0) lines.push('  Vector store is clean.');
      return { kind: 'success', text: lines.join('\n') };
    }),
  });

  ctx.commands.register({
    name: 'yongle-reindex',
    description: 'rescan knowledge directories and rebuild the SQLite index',
    input: { hint: '[--level project|user|global]' },
    handler: wrapHandler('reindex', (invocation) => {
      const raw = String(invocation.rawInput || '').trim();
      const flags = parseFlags(raw, ['level', 'global']);
      const cwd = agentCwd(invocation.agent);
      const level = flags.global ? 'user' : (flags.level || yongle.paths.autoLevel(cwd));
      const r = yongle.reindex({ level, cwd });
      return {
        kind: 'success',
        text: `Yongle reindex done: level=${r.level} scanned=${r.scanned} upserted=${r.upserted} removed=${r.removed}`,
      };
    }),
  });

  ctx.commands.register({
    name: 'yongle-status',
    description: 'show Yongle Dadian knowledge base status (all levels)',
    handler: wrapHandler('status', (invocation) => {
      const cwd = agentCwd(invocation.agent);
      const all = yongle.statsAll({ cwd, config });
      return {
        kind: 'success',
        text: yongle.render.renderStatusDashboard(all, { config, cwd }),
      };
    }),
  });
}

/** 命令输出渲染(复用核心 renderHits,Token 友好) */
function renderCommandHits(result) {
  const head = result.modes
    ? `=== Yongle merged (${Object.keys(result.modes).join('+')}) ===`
    : `=== Yongle (${result.mode}) ===`;
  if (!result.hits || result.hits.length === 0) return `${head}\nNo matching knowledge entries.`;
  return `${head}\n${yongle.render.renderHits(result.hits, { withLevel: true, withScore: false })}`;
}
