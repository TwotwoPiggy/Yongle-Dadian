/**
 * 确认复盘草稿 CLI — 将草稿合流至正式知识库(支持原地演进)
 * 用法:
 *   node scripts/yongle-confirm.js [draft-path] [--strategy create_new|supplement|supersede] [--target <id>] [--note "说明"] [--level project|user|global]
 * 示例:
 *   node scripts/yongle-confirm.js ~/.yongle_knowledge/drafts/20260912-xxx.md
 *   node scripts/yongle-confirm.js .planning/yongle/drafts/xxx.md --strategy supplement --target 20260418-xxx --note "补充 ESM 修复"
 */
'use strict';

const fs = require('fs');
const path = require('path');
const yongle = require('./core/index.js');

function parseArgs(argv) {
  const args = {
    draftPath: null,
    strategy: null,
    targetKi: null,
    conflictNote: null,
    level: null,
  };

  const rawArgs = argv.slice(2);
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--strategy' && i + 1 < rawArgs.length) {
      args.strategy = rawArgs[++i];
    } else if (a === '--target' && i + 1 < rawArgs.length) {
      args.targetKi = rawArgs[++i];
    } else if (a === '--note' && i + 1 < rawArgs.length) {
      args.conflictNote = rawArgs[++i];
    } else if (a === '--level' && i + 1 < rawArgs.length) {
      args.level = rawArgs[++i];
    } else if (!a.startsWith('--')) {
      positional.push(a);
    }
  }

  if (positional.length > 0) {
    args.draftPath = positional[0];
  }

  return args;
}

function findLatestDraft(level) {
  const targetLevel = level || 'user';
  try {
    const p = yongle.paths.resolveLevel(targetLevel, process.cwd(), yongle.init());
    const draftDir = path.join(p.root, 'drafts');
    if (!fs.existsSync(draftDir)) return null;
    const files = fs.readdirSync(draftDir).filter((f) => f.endsWith('.md'));
    if (files.length === 0) return null;
    files.sort((a, b) => {
      const sa = fs.statSync(path.join(draftDir, a)).mtimeMs;
      const sb = fs.statSync(path.join(draftDir, b)).mtimeMs;
      return sb - sa;
    });
    return path.join(draftDir, files[0]);
  } catch {
    return null;
  }
}

async function main() {
  const a = parseArgs(process.argv);
  let draftPath = a.draftPath;

  if (!draftPath) {
    draftPath = findLatestDraft(a.level);
    if (!draftPath) {
      console.error('❌ 未找到待确认的草稿文件。请指定草稿路径:');
      console.error('   node scripts/yongle-confirm.js <draft-path> [--strategy supplement|supersede|create_new]');
      process.exit(1);
    }
    console.log(`ℹ️  未指定草稿路径，自动选择最新草稿: ${draftPath}`);
  }

  const resolvedDraft = path.resolve(draftPath);
  if (!fs.existsSync(resolvedDraft)) {
    console.error(`❌ 草稿文件不存在: ${resolvedDraft}`);
    process.exit(1);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` 永乐大典 ▶ 正在确认归档...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📄 草稿路径: ${resolvedDraft}`);

  // 读取草稿元数据
  const content = fs.readFileSync(resolvedDraft, 'utf8');
  const { meta } = yongle.db.parseFrontmatter(content);
  const strategy = a.strategy || meta.evolution_strategy || 'create_new';
  const targetKi = a.targetKi || meta.target_ki || '';
  const note = a.conflictNote || meta.conflict_note || '';

  console.log(`🔄 演进策略: ${strategy}`);
  if (targetKi) console.log(`🎯 关联目标: ${targetKi}`);
  if (note) console.log(`📝 演进说明: ${note}`);

  // 判断 level
  let level = a.level;
  if (!level) {
    if (resolvedDraft.includes('.planning') || (resolvedDraft.includes('yongle') && !resolvedDraft.includes('.yongle_knowledge'))) {
      level = 'project';
    } else {
      level = 'user';
    }
  }

  const result = yongle.confirmDraft({
    level,
    draftPath: resolvedDraft,
    strategy,
    targetKi,
    conflictNote: note,
    cwd: process.cwd(),
    embed: true,
  });

  if (!result.ok) {
    console.error(`\n❌ 归档失败: ${result.error}`);
    process.exit(1);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` 永乐大典 ▶ 归档完成 ✅`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📚 动作类型: ${result.action}`);
  console.log(`📁 文件路径: ${result.filepath}`);
  console.log(`📋 条目 ID:  ${result.id}`);
  if (result.supersededTarget) {
    console.log(`⚠️ 已标记废弃旧条目: ${result.supersededTarget}`);
  }
}

main().catch((err) => {
  console.error(`\n❌ 执行异常: ${err.message}`);
  process.exit(1);
});
