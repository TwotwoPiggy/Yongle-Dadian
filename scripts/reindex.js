#!/usr/bin/env node

/**
 * 永乐大典 (Yongle Dadian) — 索引重建引擎
 * 
 * 用法:
 *   node scripts/reindex.js [global|local]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ARGS = process.argv.slice(2);
const SCOPE = ARGS[0] || 'global';

// Resolve database & knowledge directory paths
const HOME = process.env.YONGLE_HOME || process.env.HOME || process.env.USERPROFILE;
const GLOBAL_DIR = path.join(HOME, '.yongle_knowledge');
const LOCAL_DIR = path.join(process.cwd(), '.planning', 'knowledge');

const TARGET_DIR = SCOPE === 'local' ? LOCAL_DIR : GLOBAL_DIR;
const DB_SCRIPT = path.join(__dirname, 'yongle-db.js');

console.log(`\n  🏮 正在为 [${SCOPE}] 知识库重建索引...`);
console.log(`  📂 目标目录: ${TARGET_DIR}\n`);

if (!fs.existsSync(TARGET_DIR)) {
  console.log(`  ⚠ 目标目录不存在: ${TARGET_DIR}`);
  process.exit(0);
}

// Helper to recursively find all markdown files
/**
 * 递归检索指定目录下的所有 Markdown 格式知识条目（自动忽略 INDEX.md / WATCHING.md 及草稿）
 * @param {string} dir - 扫描的目标目录
 * @returns {string[]} 包含所有目标 MD 文件的绝对路径数组
 */
function findMarkdownFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findMarkdownFiles(filePath));
    } else if (file.endsWith('.md') && file !== 'INDEX.md' && file !== 'WATCHING.md' && !file.includes('.draft.md')) {
      results.push(filePath);
    }
  }
  return results;
}

// Simple YAML frontmatter parser
/**
 * 简易的前置 Yaml Frontmatter 元数据解析器
 * @param {string} content - Markdown 文件内容
 * @returns {Record<string, any>|null} 包含解析后键值对的元数据对象，若解析失败返回 null
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);
  if (!match) return null;
  
  const yamlText = match[1];
  const metadata = {};
  const lines = yamlText.split('\n');
  
  let currentKey = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check if it's a list item
    if (trimmed.startsWith('-') && currentKey) {
      if (!Array.isArray(metadata[currentKey])) {
        metadata[currentKey] = [];
      }
      const val = trimmed.substring(1).trim().replace(/^['"]|['"]$/g, '');
      metadata[currentKey].push(val);
      continue;
    }
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.substring(0, colonIndex).trim();
      const val = trimmed.substring(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      
      if (val === '') {
        currentKey = key;
        metadata[key] = [];
      } else {
        currentKey = null;
        metadata[key] = val;
      }
    }
  }
  
  return metadata;
}

const mdFiles = findMarkdownFiles(TARGET_DIR);
console.log(`  Found ${mdFiles.length} markdown entries.\n`);

// Initialize DB first
spawnSync(process.execPath, [DB_SCRIPT, 'init', SCOPE], { stdio: 'inherit' });

let successCount = 0;

for (const file of mdFiles) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const meta = parseFrontmatter(content);
    if (!meta || !meta.id) {
      console.log(`  ⏩ 跳过无 Frontmatter 属性的文件: ${path.basename(file)}`);
      continue;
    }
    
    // Ensure tags is array
    if (typeof meta.tags === 'string') {
      meta.tags = meta.tags.split(',').map(t => t.trim());
    } else if (!meta.tags) {
      meta.tags = [];
    }
    
    // Populate file path
    meta.filepath = file;
    
    // Upsert using the robust JSON string passing
    const result = spawnSync(process.execPath, [DB_SCRIPT, 'upsert', SCOPE, JSON.stringify(meta)], {
      encoding: 'utf8'
    });
    
    if (result.status === 0) {
      console.log(`  ✅ 已重建索引: ${meta.id} (类型: ${meta.resolution_type || 'other'})`);
      successCount++;
    } else {
      console.error(`  ❌ 写入索引失败: ${meta.id}`, result.stderr);
    }
  } catch (err) {
    console.error(`  ❌ 处理文件时出错 ${file}:`, err.message);
  }
}

console.log(`\n  🎉 重建完成！共成功索引 ${successCount} 个知识条目。\n`);
