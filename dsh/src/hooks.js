/**
 * hooks.js — 永乐大典 DSH 插件:钩子(默认关闭,配置 autoPostmortem 启用)
 *
 * 机制(全部使用已验证的公开事件):
 *  - tools/result:观察工具结果,按 agent 记录失败次数(只观测,不修改)
 *  - agent/turn-stopping:轮次关闭前,若本回合存在失败工具且开启自动复盘,
 *    通过 agent.inject() 向模型追加一条持久提醒(不唤醒空闲 agent)
 *
 * 注意:inject 追加的内容会进入会话日志,属于"上下文中部插入"——
 * 为保护 DeepSeek 前缀缓存,提醒文本保持极短且只在该回合确有失败时发送。
 */

import { searchKnowledge, agentCwd } from './util.js';

/** WeakMap<agent, { failed: number }> 回合内失败统计 */
const turnFailures = new WeakMap();

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
export function registerHook(ctx, config) {
  if (!config.autoPostmortem) return;

  // 1. tools/post-execute: waterfall 拦截中间件
  // 当工具报错时，即时在工具返回内容中追加极短的知识库匹配提示(模型在下一个 step 立刻看到，避免在同一轮次中盲目重试)
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const downstream = typeof next === 'function' ? await next() : result;
    if (!config.autoPostmortem || !result?.isError || !exec?.agent) {
      return downstream;
    }

    try {
      const errText = extractErrorText(result);
      if (errText && errText.length >= 4) {
        const cwd = agentCwd(exec.agent);
        const hints = await searchKnowledge(errText, {
          level: 'auto',
          limit: 1,
          cwd,
          config,
          signal: exec.signal,
        });
        if (hints?.hits && hints.hits.length > 0) {
          const top = hints.hits[0];
          const hintMsg = `\n[yongle hint] Known fix for similar issue: "${top.title}" — ${top.snippet || top.cause_summary || ''}`;
          if (Array.isArray(downstream?.content)) {
            downstream.content.push({ type: 'text', text: hintMsg });
          }
        }
      }
    } catch {
      // 检索异常不影响正常工具返回
    }
    return downstream;
  });

  // 2. 观察工具结果(只读;exec.agent 可能为 undefined,需防御)
  ctx.on('tools/result', (exec, result) => {
    if (!exec?.agent) return;
    if (!result?.isError) return;
    const rec = turnFailures.get(exec.agent) || { failed: 0 };
    rec.failed += 1;
    turnFailures.set(exec.agent, rec);
  });

  // 3. 轮次停止边界:串行事件,payload = { agent, turn, signal }
  ctx.on('agent/turn-stopping', async ({ agent }) => {
    const rec = turnFailures.get(agent);
    turnFailures.delete(agent); // 消费后清空,避免跨回合残留
    if (!rec || rec.failed === 0) return;
    try {
      // 极短提醒:告诉模型如果问题已解决，建议执行 /yongle-postmortem 蒸馏
      const text = `[yongle] ${rec.failed} tool call(s) failed this turn. If this problem is now SOLVED, suggest /yongle-postmortem to distill it.`;
      agent.inject({
        content: [{ type: 'text', text }],
        source: { kind: 'plugin', plugin: 'yongle-dadian-dsh' },
      });
    } catch {
      // 注入失败不影响轮次本身
    }
  });
}

function extractErrorText(result) {
  try {
    const text = (result.content || []).map((b) => (b?.type === 'text' ? b.text : '')).join(' ').trim();
    return text.slice(0, 120);
  } catch {
    return null;
  }
}
