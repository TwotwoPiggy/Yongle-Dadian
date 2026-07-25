#!/usr/bin/env node

/**
 * 永乐大典 (Yongle Dadian) — 自动更新脚本
 * 
 * 作用:
 *   1. 检测当前版本与远程版本（支持 Git 分支与 npm 注册表检测）
 *   2. 执行升级流程（git pull 或 npm install）
 *   3. 检查依赖项变化并智能更新（npm install）
 *   4. 自动重新注入技能到所有检测到的 AI 运行时
 *   5. 失败时支持 Git 自动回滚
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ─── ANSI 颜色常量 ─────────────────────────────────────────
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// ─── 路径解析 ──────────────────────────────────────────────
const packageRoot = path.resolve(__dirname, '..');
const pkg = require(path.join(packageRoot, 'package.json'));

// ─── 永乐大典 Banner ────────────────────────────────────────
const banner = '\n' +
  cyan + '  ╔═══════════════════════════════════════╗\n' +
  '  ║     永 乐 大 典  Yongle Dadian        ║\n' +
  '  ╚═══════════════════════════════════════╝' + reset + '\n' +
  '\n' +
  '  正在运行更新向导 ' + dim + 'v' + pkg.version + reset + '\n';

// ─── 获取运行时的主目录路径 ──────────────────────────────────
function getGlobalDir(runtime) {
  const home = os.homedir();
  const dirs = {
    antigravity: path.join(home, '.gemini', 'antigravity'),
    gemini: path.join(home, '.gemini'),
    claude: path.join(home, '.claude'),
    opencode: path.join(home, '.config', 'opencode'),
    kilo: path.join(home, '.config', 'kilo'),
    cursor: path.join(home, '.cursor'),
    windsurf: path.join(home, '.codeium', 'windsurf'),
    trae: path.join(home, '.trae'),
    catpawai: path.join(home, '.catpawai'),
    'trae-cn': path.join(home, '.trae-cn'),
    qoder: path.join(home, '.qoder'),
  };
  return dirs[runtime] || path.join(home, '.' + runtime);
}

// ─── 计算文件的 MD5 值 ──────────────────────────────────────
function getFileMd5(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (err) {
    return '';
  }
}

// ─── 检查 Git 工作区是否有未提交的修改 ─────────────────────────
function checkGitDirty() {
  try {
    const status = execSync('git status --porcelain -uno', { cwd: packageRoot, encoding: 'utf8' }).trim();
    if (status) {
      console.error(`\n  ${red}✗ 错误: 检测到本地核心代码有未提交的修改，为了避免冲突，请清理或提交修改后再执行更新。${reset}\n`);
      process.exit(1);
    }
  } catch (err) {
    // 忽略异常，继续流程
  }
}

// ─── 解析并获取目标 Commit ───────────────────────────────────
function resolveTargetCommit(target) {
  try {
    return execSync(`git rev-parse --verify origin/${target}`, { cwd: packageRoot, encoding: 'utf8' }).trim();
  } catch (e) {}
  try {
    return execSync(`git rev-parse --verify ${target}`, { cwd: packageRoot, encoding: 'utf8' }).trim();
  } catch (e) {}
  return null;
}

// ─── 主更新函数 ─────────────────────────────────────────────
function main() {
  console.log(banner);

  let targetVersion = process.argv[2];

  const isGit = fs.existsSync(path.join(packageRoot, '.git'));
  console.log(`  安装模式检测: ${bold}${isGit ? 'Git 仓库开发模式' : 'npm 全局包模式'}${reset}\n`);

  let originalCommit = '';
  if (isGit) {
    checkGitDirty();
    try {
      originalCommit = execSync('git rev-parse HEAD', { cwd: packageRoot, encoding: 'utf8' }).trim();
    } catch (err) {
      console.warn(`  ${yellow}⚠ 警告: 无法记录当前 Commit Hash 用于回滚。${reset}`);
    }
  }

  // ──────────────────────────────────────────────────────────
  // [1/4] 检测更新中...
  // ──────────────────────────────────────────────────────────
  console.log(`  ${cyan}[1/4]${reset} ${bold}正在检测可用更新...${reset}`);
  let hasUpdate = false;
  let latestInfo = '';

  try {
    if (isGit) {
      console.log(`      ${cyan}▸${reset} 执行 git fetch 拉取远程状态...`);
      execSync('git fetch origin', { cwd: packageRoot, stdio: 'ignore' });
      
      if (targetVersion) {
        const targetCommit = resolveTargetCommit(targetVersion);
        if (!targetCommit) {
          console.error(`    ${red}✗${reset} 错误: 找不到目标版本 "${targetVersion}" (本地和远程均不存在该分支或标签)\n`);
          process.exit(1);
        }
        
        const currentCommit = execSync('git rev-parse HEAD', { cwd: packageRoot, encoding: 'utf8' }).trim();
        if (currentCommit === targetCommit) {
          hasUpdate = false;
          console.log(`    ${green}✓${reset} 当前已处于目标版本 "${targetVersion}" (${targetCommit.slice(0, 7)})，无需更新。\n`);
        } else {
          hasUpdate = true;
          latestInfo = `目标版本: "${targetVersion}" (${targetCommit.slice(0, 7)}) (当前 Commit: ${currentCommit.slice(0, 7)})`;
        }
      } else {
        console.log(`      ${cyan}▸${reset} 执行 git fetch --tags 拉取远程标签状态...`);
        execSync('git fetch --tags origin', { cwd: packageRoot, stdio: 'ignore' });
        
        let latestTag = '';
        try {
          const latestCommit = execSync('git rev-list --tags --max-count=1', { cwd: packageRoot, encoding: 'utf8' }).trim();
          if (latestCommit) {
            latestTag = execSync(`git describe --tags ${latestCommit}`, { cwd: packageRoot, encoding: 'utf8' }).trim();
          }
        } catch (e) {}

        if (latestTag) {
          const targetCommit = resolveTargetCommit(latestTag);
          const currentCommit = execSync('git rev-parse HEAD', { cwd: packageRoot, encoding: 'utf8' }).trim();
          
          if (targetCommit && currentCommit !== targetCommit) {
            hasUpdate = true;
            latestInfo = `发现最新稳定版标签: "${latestTag}"`;
            targetVersion = latestTag; // 劫持 targetVersion，让后续 [2/4] 阶段自动执行 checkout 逻辑
          } else if (targetCommit) {
            hasUpdate = false;
            console.log(`    ${green}✓${reset} 当前已处于最新稳定版本 "${latestTag}"，无需更新。\n`);
          }
        } else {
          // Fallback: 如果一个 tag 都没有，回退到追踪分支
          let branch = 'master';
          try {
            branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: packageRoot, encoding: 'utf8' }).trim();
          } catch (e) {}

          let count = 0;
          try {
            count = parseInt(execSync(`git rev-list HEAD..origin/${branch} --count`, { cwd: packageRoot, encoding: 'utf8' }).trim(), 10);
          } catch (err) {
            try {
              count = parseInt(execSync('git rev-list HEAD..origin/master --count', { cwd: packageRoot, encoding: 'utf8' }).trim(), 10);
            } catch (e) {
              count = 0;
            }
          }

          if (count > 0) {
            hasUpdate = true;
            latestInfo = `落后远程分支 ${count} 个 commit`;
          }
        }
      }
    } else {
      console.log(`      ${cyan}▸${reset} 查询 npm 仓库中的最新版本...`);
      const localVersion = pkg.version;
      
      if (targetVersion) {
        try {
          const resolvedVersion = execSync(`npm view yongle-dadian@${targetVersion} version`, { encoding: 'utf8' }).trim();
          if (localVersion !== resolvedVersion) {
            hasUpdate = true;
            latestInfo = `目标版本: v${resolvedVersion} (当前版本: v${localVersion})`;
          } else {
            console.log(`    ${green}✓${reset} 当前已处于目标版本 v${resolvedVersion}，无需更新。\n`);
          }
        } catch (err) {
          console.error(`    ${red}✗${reset} 错误: npm 仓库中不存在版本/标签 "${targetVersion}"。\n`);
          process.exit(1);
        }
      } else {
        const latestVersion = execSync('npm view yongle-dadian version', { encoding: 'utf8' }).trim();
        if (localVersion !== latestVersion) {
          hasUpdate = true;
          latestInfo = `最新版本: v${latestVersion} (当前版本: v${localVersion})`;
        }
      }
    }

    if (hasUpdate) {
      console.log(`    ${yellow}▸${reset} 检测到可更新/切换目标: ${latestInfo}\n`);
    } else if (!targetVersion) {
      console.log(`    ${green}✓${reset} 已经是最新版本，无需更新。\n`);
    }
  } catch (err) {
    console.error(`    ${red}✗${reset} 检测版本失败: ${err.message}\n`);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────
  // [2/4] 拉取更新中...
  // ──────────────────────────────────────────────────────────
  console.log(`  ${cyan}[2/4]${reset} ${bold}正在拉取/安装更新包...${reset}`);
  const packageLockPath = path.join(packageRoot, 'package-lock.json');
  let oldLockHash = getFileMd5(packageLockPath);

  try {
    if (isGit) {
      if (targetVersion) {
        console.log(`      ${cyan}▸${reset} 正在切换到目标版本 "${targetVersion}"...`);
        execSync(`git checkout ${targetVersion}`, { cwd: packageRoot, stdio: 'inherit' });
        
        let isBranch = false;
        try {
          const branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: packageRoot, encoding: 'utf8' }).trim();
          if (branchName !== 'HEAD') {
            isBranch = true;
          }
        } catch (e) {}

        if (isBranch) {
          console.log(`      ${cyan}▸${reset} 当前在分支上，执行 git pull origin ${targetVersion} 拉取最新代码...`);
          try {
            execSync(`git pull origin ${targetVersion}`, { cwd: packageRoot, stdio: 'inherit' });
          } catch (err) {
            execSync('git pull', { cwd: packageRoot, stdio: 'inherit' });
          }
        }
      } else {
        let branch = 'master';
        try {
          branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: packageRoot, encoding: 'utf8' }).trim();
        } catch (e) {}

        console.log(`      ${cyan}▸${reset} 执行 git pull 拉取最新代码...`);
        try {
          execSync(`git pull origin ${branch}`, { cwd: packageRoot, stdio: 'inherit' });
        } catch (err) {
          execSync('git pull', { cwd: packageRoot, stdio: 'inherit' });
        }
      }
    } else {
      if (targetVersion) {
        console.log(`      ${cyan}▸${reset} 执行 npm install -g yongle-dadian@${targetVersion}...`);
        execSync(`npm install -g yongle-dadian@${targetVersion}`, { stdio: 'inherit' });
      } else {
        console.log(`      ${cyan}▸${reset} 执行 npm install -g yongle-dadian@latest...`);
        execSync('npm install -g yongle-dadian@latest', { stdio: 'inherit' });
      }
    }
    console.log(`    ${green}✓${reset} 更新代码成功。\n`);
  } catch (err) {
    console.error(`    ${red}✗${reset} 更新代码失败: ${err.message}`);
    rollback(originalCommit, isGit);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────
  // [3/4] 检查依赖变化中...
  // ──────────────────────────────────────────────────────────
  console.log(`  ${cyan}[3/4]${reset} ${bold}正在检查本地依赖变化...${reset}`);
  let newLockHash = getFileMd5(packageLockPath);

  if (isGit && oldLockHash !== newLockHash && newLockHash !== '') {
    console.log(`      ${cyan}▸${reset} 检测到 package-lock.json 发生变化，正在执行 npm install...`);
    try {
      execSync('npm install', { cwd: packageRoot, stdio: 'inherit' });
      console.log(`    ${green}✓${reset} 依赖更新成功。\n`);
    } catch (err) {
      console.error(`    ${red}✗${reset} 依赖更新失败: ${err.message}`);
      rollback(originalCommit, isGit);
      process.exit(1);
    }
  } else {
    console.log(`    ${green}✓${reset} 依赖未发生变化，跳过 npm install。\n`);
  }

  // ──────────────────────────────────────────────────────────
  // [4/4] 重新注入技能中...
  // ──────────────────────────────────────────────────────────
  console.log(`  ${cyan}[4/4]${reset} ${bold}正在为运行中的 AI 代理重新注入技能...${reset}`);
  
  const runtimes = ['antigravity', 'gemini', 'claude', 'opencode', 'kilo', 'cursor', 'windsurf', 'trae', 'catpawai', 'trae-cn', 'qoder'];
  let recheckCount = 0;
  
  for (const rt of runtimes) {
    const globalDir = getGlobalDir(rt);
    const manifestPath = path.join(globalDir, 'yongle', 'install-manifest.json');
    
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const scope = manifest.scope || 'global';
        const scopeFlag = scope === 'local' ? '--local' : '--global';
        
        console.log(`      ${cyan}▸${reset} 检测到已安装运行时: ${bold}${rt}${reset} (${scope})`);
        console.log(`        正在执行: node bin/install.js ${scopeFlag} --${rt}`);
        
        execSync(`node bin/install.js ${scopeFlag} --${rt}`, { cwd: packageRoot, stdio: 'inherit' });
        recheckCount++;
      } catch (err) {
        console.error(`      ${red}✗${reset} 重新注入运行时 ${rt} 失败: ${err.message}`);
        console.log(`        ${yellow}▸ 提示: 请尝试手动运行: node bin/install.js --global --${rt}${reset}`);
      }
    }
  }

  if (recheckCount === 0) {
    console.log(`      ${cyan}▸${reset} 未检测到已存在的安装凭证。将默认重新注入全局 Antigravity...`);
    try {
      execSync('node bin/install.js --global --antigravity', { cwd: packageRoot, stdio: 'inherit' });
      recheckCount++;
    } catch (err) {
      console.error(`      ${red}✗${reset} 默认注入失败: ${err.message}`);
    }
  }

  console.log(`    ${green}✓${reset} 技能注入流程已完成（共重新注入 ${recheckCount} 个配置）。\n`);

  // ─── 升级成功 Banner 提示 ────────────────────────────────────
  // 重新加载 package.json 看看是否有版本号变动
  let newPkg = pkg;
  try {
    delete require.cache[require.resolve(path.join(packageRoot, 'package.json'))];
    newPkg = require(path.join(packageRoot, 'package.json'));
  } catch (e) {}

  console.log(cyan + '  ╔═══════════════════════════════════════╗');
  console.log(`  ║    ${green}✓ 更新成功！${cyan} 永乐大典已升级到最新版  ║`);
  console.log('  ╚═══════════════════════════════════════╝' + reset);
  console.log(`\n  当前版本: ${green}v${newPkg.version}${reset}`);
  console.log(`  ${yellow}▸ 提示: 请重启您的 AI Agent (如 Antigravity 或 Claude) 以完成升级。${reset}\n`);
}

// ─── 回滚函数 ───────────────────────────────────────────────
function rollback(commitHash, isGit) {
  if (!isGit || !commitHash) {
    return;
  }
  console.log(`\n  ${red}✗ 错误: 更新过程中发生故障，准备自动回滚到初始状态...${reset}`);
  try {
    execSync(`git reset --hard ${commitHash}`, { cwd: packageRoot, stdio: 'inherit' });
    console.log(`  ${green}✓${reset} 成功回退到 Commit: ${commitHash}`);
  } catch (err) {
    console.error(`  ${red}✗ 回退失败: ${err.message}. 请手动检查工作树状态 (git status)。`);
  }
}

if (require.main === module) {
  main();
}
