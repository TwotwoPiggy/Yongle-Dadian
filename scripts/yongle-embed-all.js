const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * 创建子进程执行单文件向量化的 yongle-embed.js 脚本
 * @param {'global'|'local'} scope - 作用域
 * @param {string} filepath - 目标 Markdown 文件的绝对路径
 * @returns {Promise<string>} 子进程标准输出内容
 */
function runEmbedScript(scope, filepath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'yongle-embed.js');
    const child = spawn('node', [scriptPath, scope, filepath]);

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => output += data.toString());
    child.stderr.on('data', (data) => error += data.toString());

    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(error || `Exited with code ${code}`));
    });
  });
}

/**
 * 递归检索目标目录下待抽取 Embedding 的所有 MD 文件
 * @param {string} dir - 目标目录
 * @returns {Promise<string[]>} 所有符合条件的 MD 文件绝对路径
 */
async function findMarkdownFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat && stat.isDirectory()) {
      results = results.concat(await findMarkdownFiles(filepath));
    } else if (file.endsWith('.md') && !file.endsWith('.draft.md') && file !== 'INDEX.md') {
      results.push(filepath);
    }
  }
  return results;
}

/**
 * 批量抽取主入口：高并发（限制并发数 5）调用单文件处理进程处理全部存量文件。
 * @returns {Promise<void>}
 */
async function main() {
  const { loadMergedConfig } = require('./yongle-config');
  const config = loadMergedConfig();
  if (config.embedding && config.embedding.enabled === false) {
    console.log("💡 Info: Embedding API is disabled in config. Skipping batch processing.");
    return;
  }

  const scope = process.argv[2] || 'global';
  let targetDir = '';

  if (scope === 'global') {
    targetDir = path.join(os.homedir(), '.yongle_knowledge');
  } else if (scope === 'local') {
    targetDir = path.join(process.cwd(), '.planning', 'knowledge');
  } else {
    console.error("Unknown scope. Use 'global' or 'local'");
    process.exit(1);
  }

  console.log(`Scanning ${targetDir} for markdown files...`);
  const files = await findMarkdownFiles(targetDir);
  console.log(`Found ${files.length} files. Starting embedding generation...`);

  const concurrencyLimit = 5;
  let activePromises = [];
  let completedCount = 0;
  let failedCount = 0;

  for (const file of files) {
    // Basic backoff could be handled inside yongle-embed.js, but we limit concurrency here
    const p = runEmbedScript(scope, file)
      .then(() => {
        completedCount++;
        process.stdout.write(`\rProgress: ${completedCount + failedCount}/${files.length} (Failed: ${failedCount})`);
      })
      .catch((err) => {
        failedCount++;
        process.stdout.write(`\rProgress: ${completedCount + failedCount}/${files.length} (Failed: ${failedCount})`);
      })
      .finally(() => {
        activePromises = activePromises.filter(prom => prom !== p);
      });

    activePromises.push(p);

    if (activePromises.length >= concurrencyLimit) {
      await Promise.race(activePromises);
    }
  }

  await Promise.all(activePromises);
  console.log('\nEmbedding generation complete.');
  if (failedCount > 0) {
    console.log(`Failed for ${failedCount} files. Check ~/.yongle_knowledge/failed_embeddings.log`);
  }
}

main().catch(err => {
  console.error("Batch processing failed:", err);
});
