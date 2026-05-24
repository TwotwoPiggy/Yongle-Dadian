const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const KNOWLEDGE_DIR = path.join(os.homedir(), '.yongle_knowledge');
const SCRIPTS_DIR = __dirname;

function isGitRepo() {
  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) return false;
    execSync('git rev-parse --is-inside-work-tree', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureGitIgnore() {
  const ignorePath = path.join(KNOWLEDGE_DIR, '.gitignore');
  const ignoreContent = `yongle.db
yongle.db-shm
yongle.db-wal
vector_store.lance/
INDEX.md
query_cache.json
failed_embeddings.log
`;
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, ignoreContent, 'utf8');
    console.log('Created .gitignore in knowledge directory.');
  }
}

function syncKnowledge(options = {}) {
  const { pullOnly = false } = options;
  
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`Error: The knowledge directory (${KNOWLEDGE_DIR}) does not exist.`);
    return;
  }

  ensureGitIgnore();

  if (!isGitRepo()) {
    console.error(`Error: The knowledge directory (${KNOWLEDGE_DIR}) is not a git repository.`);
    console.error('Please initialize it and set up a remote before syncing.');
    return;
  }

  console.log('Synchronizing knowledge base...');

  // 1. Commit local uncommitted .md files
  try {
    // Stage markdown files and the newly created .gitignore
    execSync('git add "*.md" .gitignore', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
    
    // Check if there are changes to commit
    try {
      execSync('git diff --cached --quiet', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
    } catch {
      execSync('git commit -m "docs: local knowledge snapshot"', { cwd: KNOWLEDGE_DIR, stdio: 'inherit' });
    }
  } catch (err) {
    console.error('Failed to commit local knowledge snapshot:', err.message);
  }

  let pullSuccess = false;
  let stashed = false;
  let syncStatus = 'Success';
  let conflictFiles = [];

  try {
    // Check if there are unstaged changes
    try {
      execSync('git diff --quiet && git diff --cached --quiet', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
    } catch {
      console.log('Stashing unstaged changes before pull...');
      execSync('git stash push -m "gsd-sync-knowledge"', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
      stashed = true;
    }

    console.log('Pulling from remote...');
    execSync('git pull --rebase', { cwd: KNOWLEDGE_DIR, stdio: 'inherit' });
    pullSuccess = true;
  } catch (err) {
    // Rebase conflict or other error
    try {
      execSync('git rebase --abort', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
    } catch (abortErr) {}

    console.log('Attempting auto-merge and conflict preservation...');
    try {
      execSync('git merge FETCH_HEAD --no-commit', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
      execSync('git commit -m "chore: auto-resolved knowledge sync"', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
      pullSuccess = true;
    } catch (mergeErr) {
      try {
        const unmerged = execSync('git ls-files -u', { cwd: KNOWLEDGE_DIR, encoding: 'utf8' });
        const lines = unmerged.trim().split('\n').filter(Boolean);
        const files = [...new Set(lines.map(line => line.split('\t')[1]))];
        
        for (const file of files) {
          const conflictFile = file + '.conflict.md';
          try {
            execSync(`git show :2:"${file}" > "${conflictFile}"`, { cwd: KNOWLEDGE_DIR });
          } catch(e) {}
          execSync(`git checkout --theirs "${file}"`, { cwd: KNOWLEDGE_DIR });
          execSync(`git add "${file}"`, { cwd: KNOWLEDGE_DIR });
          conflictFiles.push(conflictFile);
        }
        
        execSync('git commit -m "chore: auto-resolved conflicts and backed up local to .conflict.md"', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
        pullSuccess = true;
        syncStatus = 'Conflict';
        console.warn(`\n\x1b[33m⚠ 同步冲突警告\x1b[0m\n检测到冲突，已使用远程版本覆盖。\n你的本地修改已备份到以下文件，请手动检视：\n${conflictFiles.join('\n')}\n`);
      } catch (resolveErr) {
        syncStatus = 'Error';
        console.error(`\n⚠ 知识库同步失败: 自动解决冲突出错。`, resolveErr.message);
        try { execSync('git merge --abort', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' }); } catch(e){}
      }
    }
  } finally {
    if (stashed) {
      console.log('Restoring stashed changes...');
      try {
        execSync('git stash pop', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
      } catch (popErr) {
        console.error('⚠ 知识库同步失败: Failed to restore stashed changes. Please check `git stash list` and resolve manually.');
      }
    }
  }

  if (pullSuccess) {
    // 3. Rebuild indexes
    console.log('Rebuilding SQLite index...');
    try {
      execSync(`node "${path.join(SCRIPTS_DIR, 'reindex.js')}" global`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`\n⚠ 知识库同步失败: Failed to rebuild SQLite index.`, err.message);
    }

    console.log('Rebuilding vector embeddings...');
    try {
      execSync(`node "${path.join(SCRIPTS_DIR, 'yongle-embed-all.js')}" global`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`\n⚠ 知识库同步失败: Failed to generate embeddings.`, err.message);
    }
  }

  // 4. Push if not pullOnly
  if (!pullOnly && pullSuccess) {
    console.log('Pushing to remote...');
    try {
      execSync('git push', { cwd: KNOWLEDGE_DIR, stdio: 'inherit' });
      console.log('Knowledge synchronization complete.');
    } catch (err) {
      syncStatus = 'Error';
      console.error(`\n⚠ 知识库同步失败: Failed to push to remote.`, err.message);
    }
  } else if (pullOnly) {
    console.log('Knowledge pull complete. (push skipped due to pullOnly flag)');
  }

  // 5. Write sync status
  writeSyncStatus(syncStatus, conflictFiles);
}

function writeSyncStatus(status, conflictFiles) {
  try {
    const planningDir = path.join(process.cwd(), '.planning');
    if (!fs.existsSync(planningDir)) return;

    let pendingPushes = '0';
    try {
      pendingPushes = execSync('git rev-list HEAD...@{u} --count', { cwd: KNOWLEDGE_DIR, encoding: 'utf8' }).trim();
    } catch (e) {}

    const statusContent = `# Sync Status
**Last Sync:** ${new Date().toISOString()}
**Status:** ${status}
**Pending Pushes:** ${pendingPushes}
${conflictFiles.length > 0 ? '\n**Conflicts Generated:**\n' + conflictFiles.map(f => '- ' + f).join('\n') : ''}
`;
    fs.writeFileSync(path.join(planningDir, 'SYNC-STATUS.md'), statusContent, 'utf8');
  } catch (err) {
    // ignore status write errors
  }
}

module.exports = {
  syncKnowledge
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const pullOnly = args.includes('--pull-only');
  syncKnowledge({ pullOnly });
}
