/**
 * postmortem.js — 永乐大典核心引擎:复盘草稿(从 DSH 会话事件日志蒸馏知识)
 *
 * 数据流:
 *  1. extractMaterial(events):从 SessionEvent[] 提取结构化素材
 *     (用户请求 / 失败工具链 / 最终助手方案 / 轮次统计)
 *  2. 固定系统模板 + 紧凑素材 → LLM 蒸馏(模板恒定 → DeepSeek 前缀缓存友好)
 *  3. 生成带 draft 标记的 Markdown 草稿(与既有 frontmatter 六字段规范一致)
 *  4. /yongle-confirm 确认 → 移除 draft 标记 → 正式目录 → 索引 → 后台向量化
 *
 * Token 优化:只喂"最后用户请求 + 失败工具 + 最终方案",总量默认 < 2K 字符;
 * 系统提示词字节级固定,每次复盘调用的前缀可命中 DeepSeek 缓存。
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** 固定系统模板(单阶段蒸馏，字节级稳定 → 前缀缓存命中) */
const SYSTEM_TEMPLATE = [
  'You are the Yongle Dadian knowledge distiller. Extract one distilled developer-experience entry from the structured session material below.',
  'Respond with STRICT JSON only (no markdown fences), exactly this shape:',
  '{"title":"<kebab-case or short title>","bug_phenomenon":"<one sentence>","root_cause":"<root cause, one or two sentences>","solution":"<final working solution>","resolution_type":"<bug-fix|config-fix|api-change|env-issue|logic-error|other>","tags":["<tag>"]}',
  'Rules:',
  '- Only distill when a problem was actually SOLVED; otherwise return {"solved":false}.',
  '- root_cause must state WHY it failed, not what was tried.',
  '- solution must be actionable and specific.',
  '- cause_summary style: one line, <= 40 words.',
  '- tags: 2-5 lowercase technical tags.',
].join('\n');

/** Stage 1: 纯归因与试错分析模板 (Reasoning Pass) - 释放因果推理能力 */
const STAGE1_REASONING_TEMPLATE = [
  'You are the Yongle Dadian Root-Cause Analyst (Stage 1: Pure Reasoning Pass).',
  'Analyze the debug session material below to identify the exact technical facts.',
  'Do NOT format into final JSON yet. Focus on deep reasoning and deduction:',
  '1. Trigger Boundary: Exact command, environment, or code trigger that produced the failure.',
  '2. Failed Hypotheses: What attempts were made that failed or were dead-ends (crucial for future pitfall avoidance).',
  '3. Root Cause: The precise underlying mechanism that caused the failure (WHY it failed, not merely WHAT failed).',
  '4. Effective Resolution: The definitive fix that made it work, including exact parameters/code if present.',
  'If the issue was not solved, state explicitly: "STATUS: UNSOLVED".',
].join('\n');

/** Stage 2: 结构化编译与元数据对齐模板 (Compilation Pass) - 接收事实输出严格结构 */
const STAGE2_COMPILATION_TEMPLATE = [
  'You are the Yongle Dadian Knowledge Compiler (Stage 2: Structured Compilation Pass).',
  'Convert the verified reasoning facts from Stage 1 into a high-density, structured knowledge JSON.',
  'Respond with STRICT JSON only (no markdown fences, no conversational prose), exactly this shape:',
  '{"title":"<kebab-case or concise title>","bug_phenomenon":"<one clear sentence describing the bug>","root_cause":"<one or two sentences explaining why>","solution":"<precise actionable steps or code snippet>","resolution_type":"<bug-fix|config-fix|api-change|env-issue|logic-error|other>","tags":["<2-5 lowercase technical tags>"]}',
  'Rules:',
  '- Only distill when the problem was solved; if Stage 1 indicates unsolved, return {"solved":false}.',
  '- root_cause must be factual and specific, directly compiled from Stage 1.',
  '- solution must be actionable and concise.',
].join('\n');

/** 提取素材上限(默认,控制 token) */
const LIMITS = {
  userChars: 600,
  toolArgsChars: 200,
  toolResultChars: 300,
  assistantChars: 800,
  maxFailedTools: 6,
  maxUserRequests: 3,
};

/**
 * 从会话事件日志提取复盘素材(纯函数,可单测)
 * @param {Array<object>} events SessionEvent[](agent.session.events)
 * @param {object} [limits]
 * @returns {{userRequests:string[], failedTools:Array<object>, successTools:number,
 *            assistantText:string, turns:number, steps:number, failures:number, hasSolved:boolean}}
 */
function extractMaterial(events, limits = LIMITS) {
  const L = { ...LIMITS, ...limits };
  const out = {
    userRequests: [],
    failedTools: [],
    successTools: 0,
    assistantText: '',
    turns: 0,
    steps: 0,
    failures: 0,
    hasSolved: false,
  };
  if (!Array.isArray(events)) return out;

  const turnSeen = new Set();
  const stepSeen = new Set();
  const clip = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  const textOf = (blocks) => {
    if (!Array.isArray(blocks)) return '';
    return blocks
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join(' ')
      .trim();
  };

  for (const ev of events) {
    const d = ev?.data || ev;
    const type = ev?.type || d?.type;
    if (!type) continue;
    switch (type) {
      case 'turn/start':
        turnSeen.add(d.turn);
        break;
      case 'step/start':
        stepSeen.add(`${d.turn}:${d.step}`);
        break;
      case 'user/message': {
        const text = textOf(d.message?.content);
        if (text) out.userRequests.push(clip(text, L.userChars));
        break;
      }
      case 'assistant/message': {
        const text = textOf(d.message?.content);
        if (text) out.assistantText = clip(text, L.assistantChars);
        if (d.message?.content?.some((b) => b?.type === 'tool-call')) out.hasSolved = true;
        break;
      }
      case 'tool/call': {
        const args = clip(String(d.arguments || ''), L.toolArgsChars);
        out.failedTools.push({ name: d.name, args, ok: true, error: null });
        break;
      }
      case 'tool/result': {
        const isError = d.message?.content?.[0]?.isError === true || Boolean(d.error);
        if (isError) {
          out.failures += 1;
          const rec = out.failedTools.find((t) => t.ok === true && t.name === d.message?.content?.[0]?.name);
          const target = rec || out.failedTools[out.failedTools.length - 1];
          if (target) {
            target.ok = false;
            target.error = d.error ? `${d.error.name}:${d.error.code}` : clip(textOf(d.message?.content), L.toolResultChars);
          }
        } else {
          out.successTools += 1;
        }
        break;
      }
      default:
        break;
    }
  }

  out.turns = turnSeen.size;
  out.steps = stepSeen.size;
  out.userRequests = out.userRequests.slice(-L.maxUserRequests);
  // 只保留失败工具(按出现顺序,限量)
  out.failedTools = out.failedTools.filter((t) => !t.ok).slice(0, L.maxFailedTools);
  // "已解决"判定:有成功工具结果,或失败后又出现 assistant 消息
  out.hasSolved = out.hasSolved || (out.successTools > 0 && out.failures > 0);
  return out;
}

/** 构造用户消息(紧凑素材) */
function buildPrompt(material, extraContext = '') {
  const lines = [];
  lines.push(`## User requests (last ${material.userRequests.length})`);
  material.userRequests.forEach((u, i) => lines.push(`U${i + 1}: ${u}`));
  if (material.failedTools.length) {
    lines.push(`## Failed tool calls (${material.failures})`);
    material.failedTools.forEach((t, i) => {
      lines.push(`F${i + 1}: ${t.name} ${t.args ? `args=${t.args}` : ''}${t.error ? ` error=${t.error}` : ''}`);
    });
  } else {
    lines.push('## Failed tool calls: none');
  }
  lines.push(`## Final assistant output`);
  lines.push(material.assistantText || '(none)');
  lines.push(`## Turn/step stats: turns=${material.turns} steps=${material.steps} failures=${material.failures}`);
  if (extraContext) lines.push(`## Extra context\n${extraContext}`);
  return lines.join('\n');
}

/**
 * 双阶段思维链复盘流水线 (Two-Step CoT Postmortem)
 * Stage 1 (Reasoning Pass): 纯归因、试错与边界推理
 * Stage 2 (Compilation Pass): 结构化编译与元数据对齐
 * @param {{material:object, config?:object, llm?:Function, extraContext?:string}} [options]
 * @returns {Promise<{ok:boolean, draft?:object, reasoning?:string, error?:string}>}
 */
async function distillTwoStep(options = {}) {
  const material = options.material || extractMaterial([]);
  const prompt = buildPrompt(material, options.extraContext || '');
  const cfg = options.config || {};

  const callLlm = async (p, s) => {
    if (typeof options.llm === 'function') {
      return options.llm(p, s);
    }
    const { getAgentCompletion } = require('../yongle-agent-api.js');
    return getAgentCompletion(p, s, cfg.agent || {});
  };

  // Stage 1: 纯归因与试错分析 (Reasoning Pass)
  const reasoningText = await callLlm(prompt, STAGE1_REASONING_TEMPLATE);
  if (!reasoningText || !reasoningText.trim()) {
    return { ok: false, error: 'Stage 1 reasoning pass produced empty output' };
  }
  if (reasoningText.includes('STATUS: UNSOLVED')) {
    return { ok: false, error: 'not solved' };
  }

  // Stage 2: 结构化编译 (Compilation Pass)
  const stage2Prompt = [
    '## Stage 1 Verified Reasoning Facts:',
    reasoningText.trim(),
    '',
    '## Session Summary:',
    `User requests: ${(material.userRequests || []).join(' | ')}`,
  ].join('\n');

  const compiledText = await callLlm(stage2Prompt, STAGE2_COMPILATION_TEMPLATE);
  if (!compiledText || !compiledText.trim()) {
    return { ok: false, error: 'Stage 2 compilation pass produced empty output' };
  }

  // 解析严格 JSON
  let cleaned = compiledText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: 'LLM response is not JSON in Stage 2' };
    try { parsed = JSON.parse(m[0]); } catch { return { ok: false, error: 'LLM response is not JSON in Stage 2' }; }
  }

  if (parsed.solved === false) return { ok: false, error: 'not solved' };
  if (!parsed.title || !parsed.root_cause || !parsed.solution) {
    return { ok: false, error: 'LLM JSON missing required fields in Stage 2' };
  }

  const draft = {
    title: String(parsed.title).trim(),
    bug_phenomenon: String(parsed.bug_phenomenon || '').trim(),
    root_cause: String(parsed.root_cause).trim(),
    solution: String(parsed.solution).trim(),
    resolution_type: String(parsed.resolution_type || 'other').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
  };

  return { ok: true, draft, reasoning: reasoningText.trim() };
}

/**
 * 调用 LLM 蒸馏复盘草稿 (支持单阶段与双阶段两路架构)
 * @param {{material:object, config?:object, llm?:Function, systemTemplate?:string,
 *          extraContext?:string, title?:string, level?:string, twoStep?:boolean}} [options]
 *   llm: (prompt, system) => Promise<string> 可注入(测试用);缺省用 getAgentCompletion
 * @returns {Promise<{ok:boolean, draft?:object, reasoning?:string, error?:string}>}
 *   draft = {title, bug_phenomenon, root_cause, solution, resolution_type, tags}
 */
async function distill(options = {}) {
  if (options.twoStep === true) {
    return distillTwoStep(options);
  }

  const material = options.material || extractMaterial([]);
  const prompt = buildPrompt(material, options.extraContext || '');
  const system = options.systemTemplate || SYSTEM_TEMPLATE;

  let text;
  if (typeof options.llm === 'function') {
    text = await options.llm(prompt, system);
  } else {
    const { getAgentCompletion } = require('../yongle-agent-api.js');
    const cfg = options.config || {};
    text = await getAgentCompletion(prompt, system, cfg.agent || {});
  }
  if (!text || !text.trim()) return { ok: false, error: 'empty LLM response' };

  // 解析严格 JSON(容忍 markdown 围栏包裹)
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: 'LLM response is not JSON' };
    try { parsed = JSON.parse(m[0]); } catch { return { ok: false, error: 'LLM response is not JSON' }; }
  }
  if (parsed.solved === false) return { ok: false, error: 'not solved' };
  if (!parsed.title || !parsed.root_cause || !parsed.solution) {
    return { ok: false, error: 'LLM JSON missing required fields' };
  }
  const draft = {
    title: String(parsed.title).trim(),
    bug_phenomenon: String(parsed.bug_phenomenon || '').trim(),
    root_cause: String(parsed.root_cause).trim(),
    solution: String(parsed.solution).trim(),
    resolution_type: String(parsed.resolution_type || 'other').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
  };
  return { ok: true, draft };
}

/**
 * 查重嗅探:在生成草稿前或草稿生成后,调用混合检索检测是否存在高概率重合条目
 * @param {{material?:object, draft?:object, query?:string, cwd?:string, config?:object, limit?:number, threshold?:number}} [options]
 * @returns {Promise<{isDuplicateSuspect:boolean, candidates:Array<object>, suggestedStrategy:string, targetKi:string, score:number}>}
 */
async function sniffDuplicates(options = {}) {
  const search = require('./search');
  let q = options.query || '';
  if (!q && options.draft) {
    q = `${options.draft.title || ''} ${options.draft.root_cause || ''}`.trim();
  }
  if (!q && options.material) {
    const lastUser = (options.material.userRequests || []).slice(-1)[0] || '';
    const failedText = (options.material.failedTools || []).map((t) => `${t.name} ${t.error || ''}`).join(' ');
    q = `${lastUser} ${failedText}`.trim();
  }
  if (!q) {
    return { isDuplicateSuspect: false, candidates: [], suggestedStrategy: 'create_new', targetKi: '', score: 0 };
  }

  const limit = options.limit || 3;
  const threshold = options.threshold !== undefined ? options.threshold : 0.018; // RRF 经验阈值(Top-1 命中)
  const result = await search.searchAll(q, {
    cwd: options.cwd || null,
    config: options.config,
    limit,
    useCache: false,
  });

  const candidates = result.hits || [];
  if (candidates.length === 0) {
    return { isDuplicateSuspect: false, candidates: [], suggestedStrategy: 'create_new', targetKi: '', score: 0 };
  }

  const top = candidates[0];
  const isDuplicate = top.score >= threshold;
  // 若 Top-1 已经废弃，不建议原地 supplement，建议 supersede 或 create_new；否则默认 supplement
  const suggestedStrategy = isDuplicate
    ? (top.status === 'deprecated' ? 'supersede' : 'supplement')
    : 'create_new';

  return {
    isDuplicateSuspect: isDuplicate,
    candidates,
    suggestedStrategy,
    targetKi: isDuplicate ? top.id : '',
    score: top.score,
  };
}

/**
 * 写入草稿文件(带 draft 标记,六字段 frontmatter 与既有规范一致,支持演进控制字段)
 * @param {{draftDir:string, draft:object, originalQuestion?:string, evolutionStrategy?:string, targetKi?:string, conflictNote?:string}} [options]
 * @returns {{draftPath:string, id:string, evolutionStrategy:string, targetKi:string, conflictNote:string}}
 */
function writeDraftFile(options) {
  const { draftDir, draft } = options;
  if (!fs.existsSync(draftDir)) fs.mkdirSync(draftDir, { recursive: true });
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const slug = draft.title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'draft';
  const id = `${stamp}-${slug}`;
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const strategy = options.evolutionStrategy || draft.evolution_strategy || 'create_new';
  const targetKi = options.targetKi || draft.target_ki || '';
  const conflictNote = options.conflictNote || draft.conflict_note || '';

  const fm = [
    '---',
    `id: "${id}"`,
    `date: "${dateStr}"`,
    `resolution_type: "${draft.resolution_type}"`,
    draft.tags.length ? `tags:\n${draft.tags.map((t) => `  - ${t}`).join('\n')}` : 'tags: []',
    'host_agent: "deepseek-harness"',
    `cause_summary: "${(draft.root_cause || '').replace(/"/g, '\\"')}"`,
    'draft: true',
    `evolution_strategy: "${strategy}"`,
    ...(targetKi ? [`target_ki: "${targetKi}"`] : []),
    ...(conflictNote ? [`conflict_note: "${conflictNote.replace(/"/g, '\\"')}"`] : []),
    '---',
    '',
    `# ${draft.title}`,
    '',
    ...(targetKi
      ? [
          '> [!NOTE]',
          `> **原地演进预警**：检测到与历史知识条目 \`${targetKi}\` 高度相关。预设演进策略为 \`${strategy}\`。`,
          ...(conflictNote ? [`> **演进原因**：${conflictNote}`] : []),
          '',
        ]
      : []),
    // 原始问题入正文 → body_index 可检索,保证按原话复述的查询能命中
    ...(options.originalQuestion ? ['## 原始问题', '', options.originalQuestion, ''] : []),
    '## 问题现象',
    '',
    draft.bug_phenomenon || '(未提供)',
    '',
    '## 根本原因',
    '',
    draft.root_cause,
    '',
    '## 解决方案',
    '',
    draft.solution,
    '',
  ].join('\n');
  const draftPath = path.join(draftDir, `${id}.md`);
  fs.writeFileSync(draftPath, fm, 'utf8');
  return { draftPath, id, evolutionStrategy: strategy, targetKi, conflictNote };
}

module.exports = {
  SYSTEM_TEMPLATE,
  STAGE1_REASONING_TEMPLATE,
  STAGE2_COMPILATION_TEMPLATE,
  LIMITS,
  extractMaterial,
  buildPrompt,
  distill,
  distillTwoStep,
  sniffDuplicates,
  writeDraftFile,
};
