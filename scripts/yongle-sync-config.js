const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { stripApiKeysFromFile } = require('./yongle-config-sanitizer');
const { globalConfigPath } = require('./yongle-config');

const globalDir = path.dirname(globalConfigPath);

function isGitRepo() {
  try {
    if (!fs.existsSync(globalDir)) return false;
    execSync('git rev-parse --is-inside-work-tree', { cwd: globalDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function pushConfig() {
  console.log('Pushing config to remote...');
  
  if (!fs.existsSync(globalConfigPath)) {
    console.log('No local config.json found to push.');
    return;
  }

  const originalConfigContent = fs.readFileSync(globalConfigPath, 'utf8');
  
  try {
    const sanitizedConfig = stripApiKeysFromFile(globalConfigPath);
    fs.writeFileSync(globalConfigPath, JSON.stringify(sanitizedConfig, null, 2), 'utf8');
    
    execSync('git add config.json', { cwd: globalDir, stdio: 'inherit' });
    
    try {
      execSync('git diff --cached --quiet', { cwd: globalDir, stdio: 'ignore' });
      console.log('No changes to push.');
    } catch {
      execSync('git commit -m "chore(config): sync config.json"', { cwd: globalDir, stdio: 'inherit' });
      execSync('git push', { cwd: globalDir, stdio: 'inherit' });
      console.log('Push complete.');
    }
  } catch (err) {
    console.error('Failed to push:', err.message);
  } finally {
    fs.writeFileSync(globalConfigPath, originalConfigContent, 'utf8');
  }
}

function pullConfig() {
  console.log('Pulling config from remote...');
  try {
    execSync('git fetch', { cwd: globalDir, stdio: 'inherit' });
    
    let remoteContent = '';
    try {
      remoteContent = execSync('git show @{u}:config.json', { cwd: globalDir, encoding: 'utf8' });
    } catch {
      try {
        remoteContent = execSync('git show origin/main:config.json', { cwd: globalDir, encoding: 'utf8' });
      } catch {
        remoteContent = execSync('git show origin/master:config.json', { cwd: globalDir, encoding: 'utf8' });
      }
    }
    
    const remoteFile = path.join(globalDir, 'config.remote.json');
    fs.writeFileSync(remoteFile, remoteContent, 'utf8');
    
    console.log('Triggering interactive merge...\n');
    try {
      execSync(`node "${path.join(__dirname, 'yongle-config-import.js')}" "${remoteFile}"`, { stdio: 'inherit' });
    } finally {
      if (fs.existsSync(remoteFile)) {
        fs.unlinkSync(remoteFile);
      }
    }
  } catch (err) {
    console.error('Failed to pull:', err.message);
  }
}

function syncConfig() {
  if (!isGitRepo()) {
    console.error(`Error: The global config directory (${globalDir}) is not a git repository.`);
    console.error('Please initialize it and set up a remote before syncing.');
    process.exit(1);
  }

  const isPull = process.argv.includes('--pull');
  
  if (isPull) {
    pullConfig();
  } else {
    pushConfig();
  }
}

if (require.main === module) {
  syncConfig();
}
