#!/usr/bin/env node

/**
 * 永乐大典 (Yongle Dadian) — 知识库健康巡检与自愈 CLI (/yongle-lint)
 *
 * 用法:
 *   node scripts/yongle-lint.js [level] [--deep] [--fix] [--json]
 *   level: project(项目级) | user(用户级) | global(全局级) | auto(全部可用级别，默认)
 *
 * 选项:
 *   --deep   开启 Layer 2 深度语义审计 (利用向量库扫描高相似度未关联条目)
 *   --fix    自动修复确定性问题 (补齐缺失元数据、清理幽灵记录、重新挂载孤儿条目)
 *   --json   输出结构化 JSON 格式 (供 CI/CD 或自动化流水线消费)
 */
'use strict';

const yongle = require('./core/index.js');

// ─── ANSI 颜色常量 ─────────────────────────────────────────
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

function parseCliArgs(argv) {
  const args = {
    level: 'auto',
    deep: false,
    fix: false,
    json: false,
  };

  for (const a of argv.slice(2)) {
    if (a === '--deep') args.deep = true;
    else if (a === '--fix') args.fix = true;
    else if (a === '--json') args.json = true;
    else if (!a.startsWith('--')) args.level = a;
  }
  return args;
}

async function main() {
  const opts = parseCliArgs(process.argv);
  const started = Date.now();

  const results = await yongle.lintAll({
    level: opts.level,
    deep: opts.deep,
    fix: opts.fix,
    cwd: process.cwd(),
  });

  const elapsedMs = Date.now() - started;

  if (opts.json) {
    console.log(JSON.stringify({ elapsedMs, results }, null, 2));
    const totalErrors = results.reduce((sum, r) => sum + r.structure.stats.errorCount, 0);
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  // 终端美化输出
  console.log('\n' +
    cyan + '  ╔════════════════════════════════════════════════════════════════════════╗\n' +
    '  ║         永 乐 大 典  ·  知 识 库 健 康 巡 检 看 板 (/yongle-lint)      ║\n' +
    '  ╚════════════════════════════════════════════════════════════════════════╝' + reset + '\n'
  );

  let totalScanned = 0;
  let totalEntries = 0;
  let totalErrors = 0;
  let totalWarns = 0;
  let totalInfos = 0;
  let totalFixed = 0;

  for (const r of results) {
    const s = r.structure.stats;
    totalScanned += s.scannedFiles;
    totalEntries += s.dbEntries;
    totalErrors += s.errorCount;
    totalWarns += s.warnCount;
    totalInfos += s.infoCount;
    if (r.fix) totalFixed += r.fix.fixedCount;

    console.log(`  ${bold}📦 知识库级别: ${cyan}${r.level.toUpperCase()}${reset}`);
    console.log(`    ▸ 扫描文件 : ${s.scannedFiles} 个 Markdown 文件`);
    console.log(`    ▸ 索引条目 : ${s.dbEntries} 条 SQLite 记录`);

    if (r.issues.length === 0) {
      console.log(`    ▸ 体检结果 : ${green}✓ 完美！未发现任何破损或异常问题${reset}`);
    } else {
      console.log(`    ▸ 发现隐患 : ${r.issues.length} 项 (🔴 错误: ${s.errorCount} | 🟡 警告: ${s.warnCount} | ℹ️ 建议: ${s.infoCount})`);
      console.log('');
      r.issues.forEach((iss, idx) => {
        let badge = `${dim}[INFO]${reset}`;
        if (iss.severity === 'error') badge = `${red}${bold}[ERROR]${reset}`;
        if (iss.severity === 'warning') badge = `${yellow}${bold}[WARN]${reset}`;
        console.log(`      ${badge} ${iss.message}`);
        if (iss.filepath) console.log(`             ${dim}文件: ${iss.filepath}${reset}`);
        if (iss.pair) console.log(`             ${dim}条目对: ${iss.pair.join(' <-> ')}${reset}`);
      });
    }

    if (r.fix && r.fix.actions.length > 0) {
      console.log(`\n    ▸ ${green}${bold}🔧 自愈修复记录:${reset}`);
      r.fix.actions.forEach((act) => {
        console.log(`      ${green}✓${reset} ${act.message}`);
      });
    }

    console.log('  ────────────────────────────────────────────────────────────────────────');
  }

  console.log(`\n  ${bold}📊 巡检总结 (${elapsedMs}ms):${reset}`);
  console.log(`    共审计文件 ${totalScanned} 份 | 数据库条目 ${totalEntries} 条`);
  console.log(`    ${totalErrors > 0 ? red : green}●${reset} 错误: ${totalErrors} 项   ${totalWarns > 0 ? yellow : green}●${reset} 警告: ${totalWarns} 项   ● 建议: ${totalInfos} 项`);

  if (opts.fix) {
    console.log(`    ${green}⚡ 本次已成功自动修复 ${totalFixed} 项确定性隐患！${reset}`);
  } else if (totalErrors > 0 || totalWarns > 0) {
    console.log(`\n  ${yellow}💡 提示: 您可以运行 ${bold}node scripts/yongle-lint.js --fix${reset}${yellow} 自动修复已知的简单格式异常与索引挂载问题。${reset}`);
  }

  if (!opts.deep) {
    console.log(`  ${dim}💡 提示: 追加 --deep 参数可开启向量语义冗余矩阵审计。${reset}\n`);
  } else {
    console.log('');
  }

  yongle.close();
  process.exit(totalErrors > 0 && !opts.fix ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n❌ 巡检执行失败: ${err.message}`);
  process.exit(1);
});
