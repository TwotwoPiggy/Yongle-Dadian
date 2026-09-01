/**
 * 记录知识 CLI — 手动记录一条知识(支持三级知识库)
 * 用法:
 *   node scripts/yongle-record.js <project|user|global> --title "标题" [--summary "摘要"] [--tags a,b] [--content "正文"]
 * 示例:
 *   node scripts/yongle-record.js project --title "PowerShell 乱码修复" --summary "用 UTF-8 显式编码" --tags powershell,encoding
 */
'use strict';

const yongle = require('./core/index.js');

function parseArgs(argv) {
  const args = { level: null, title: null, summary: null, tags: null, content: null };
  args.level = argv[2];
  const rest = argv.slice(3).join(' ');
  const grab = (flag) => {
    const m = rest.match(new RegExp(`--${flag}\\s+("(?:[^"\\\\]|\\\\.)*"|[^\\s]+)`));
    if (!m) return null;
    const v = m[1];
    return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v;
  };
  args.title = grab('title');
  args.summary = grab('summary');
  args.tags = grab('tags');
  args.content = grab('content');
  return args;
}

async function main() {
  const a = parseArgs(process.argv);
  if (!a.level || !a.title) {
    console.error('Usage: node yongle-record.js <project|user|global> --title "..." [--summary "..."] [--tags a,b] [--content "..."]');
    process.exit(1);
  }
  const result = await yongle.record({
    level: a.level,
    title: a.title,
    summary: a.summary || '',
    tags: a.tags ? a.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    content: a.content || '',
    embed: true,
  });
  console.log(`✅ Recorded [${result.level}] ${result.id}`);
  console.log(`   ${result.filepath}`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
