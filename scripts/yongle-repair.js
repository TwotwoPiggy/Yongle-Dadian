/**
 * 向量库修复 CLI — 检测并修复旧格式/过时向量 chunk
 * 用法:
 *   node scripts/yongle-repair.js <project|user|global> [--dry-run] [--run]
 *   --dry-run(默认):只报告受影响文档与行数,不调用 embedding API
 *   --run:删除旧行并重新嵌入(会产生 embedding API 调用)
 */
'use strict';

const yongle = require('./core/index.js');

async function main() {
  const level = process.argv[2] || 'user';
  const dryRun = !process.argv.includes('--run');
  console.log(`[yongle-repair] level=${level} mode=${dryRun ? 'dry-run' : 'repair'}`);
  const t0 = Date.now();
  const r = await yongle.repairVectors({ level, dryRun });
  console.log(JSON.stringify({ ...r, elapsedMs: Date.now() - t0 }));
  if (dryRun && r.staleRows > 0) {
    console.log(`💡 ${r.staleRows} 行旧格式向量待修复;执行 node scripts/yongle-repair.js ${level} --run 开始修复(将调用 embedding API)。`);
  } else if (r.staleRows === 0) {
    console.log('✅ 向量库干净,无需修复。');
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
