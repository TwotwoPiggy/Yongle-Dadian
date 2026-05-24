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

  // 2. Pull with rebase
  let pullSuccess = false;
  let stashed = false;
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
    console.error(`\n⚠ 知识库同步失败: Error during git pull --rebase.`);
    try {
      execSync('git rebase --abort', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
      console.log('Rebase aborted to preserve local state.');
    } catch (abortErr) {
      // ignore abort error if it wasn't a rebase in progress
    }
    return;
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
  if (!pullOnly) {
    console.log('Pushing to remote...');
    try {
      execSync('git push', { cwd: KNOWLEDGE_DIR, stdio: 'inherit' });
      console.log('Knowledge synchronization complete.');
    } catch (err) {
      console.error(`\n⚠ 知识库同步失败: Failed to push to remote.`, err.message);
    }
  } else {
    console.log('Knowledge pull complete. (push skipped due to pullOnly flag)');
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
