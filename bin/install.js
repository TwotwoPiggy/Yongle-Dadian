#!/usr/bin/env node

/**
 * 永乐大典 (Yongle Dadian) — 独立安装器
 * 
 * 用法:
 *   npx yongle-dadian --global --antigravity
 *   npx yongle-dadian --global --copilot
 *   node bin/install.js --global --antigravity
 *   node bin/install.js --local --copilot
 *   node bin/install.js --local --claude
 *   node bin/install.js --uninstall --antigravity --global
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Colors ─────────────────────────────────────────────
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// ─── Version ────────────────────────────────────────────
const pkg = require('../package.json');

// ─── Banner ─────────────────────────────────────────────
const banner = '\n' +
  cyan + '  ╔═══════════════════════════════════════╗\n' +
  '  ║     永 乐 大 典  Yongle Dadian        ║\n' +
  '  ╚═══════════════════════════════════════╝' + reset + '\n' +
  '\n' +
  '  知识就是力量 ' + dim + 'v' + pkg.version + reset + '\n' +
  '  AI 开发经验知识库引擎\n';

// ─── Parse Args ─────────────────────────────────────────
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');
const hasUninstall = args.includes('--uninstall') || args.includes('-u');
const hasHelp = args.includes('--help') || args.includes('-h');
const hasStatus = args.includes('--status') || args.includes('-s');

if (hasStatus) {
  require('../scripts/yongle-status.js');
  process.exit(0);
}

// Runtime flags
const runtimeFlags = {
  antigravity: args.includes('--antigravity'),
  gemini: args.includes('--gemini'),
  claude: args.includes('--claude'),
  copilot: args.includes('--copilot') || args.includes('--vscode-copilot') || args.includes('--vscode'),
  opencode: args.includes('--opencode'),
  kilo: args.includes('--kilo'),
  cursor: args.includes('--cursor'),
  windsurf: args.includes('--windsurf'),
  trae: args.includes('--trae'),
  catpawai: args.includes('--catpawai'),
  'trae-cn': args.includes('--trae-cn'),
  qoder: args.includes('--qoder'),
};
const hasAll = args.includes('--all');

let selectedRuntimes = [];
if (hasAll) {
  selectedRuntimes = Object.keys(runtimeFlags);
} else {
  for (const [rt, selected] of Object.entries(runtimeFlags)) {
    if (selected) selectedRuntimes.push(rt);
  }
}

// ─── Help ───────────────────────────────────────────────
if (hasHelp) {
  console.log(banner);
  console.log(`  ${yellow}Usage:${reset} npx yongle-dadian [options]\n`);
  console.log(`  ${yellow}Options:${reset}`);
  console.log(`    ${cyan}-g, --global${reset}        Install globally (to runtime config directory)`);
  console.log(`    ${cyan}-l, --local${reset}         Install locally (to current project directory)`);
  console.log(`    ${cyan}--antigravity${reset}       Target Antigravity runtime`);
  console.log(`    ${cyan}--gemini${reset}            Target Gemini CLI runtime`);
  console.log(`    ${cyan}--claude${reset}            Target Claude Code runtime`);
  console.log(`    ${cyan}--copilot${reset}           Target VS Code Copilot runtime (aliases: --vscode-copilot, --vscode)`);
  console.log(`    ${cyan}--opencode${reset}          Target OpenCode runtime`);
  console.log(`    ${cyan}--kilo${reset}              Target Kilo runtime`);
  console.log(`    ${cyan}--cursor${reset}            Target Cursor runtime`);
  console.log(`    ${cyan}--windsurf${reset}          Target Windsurf runtime`);
  console.log(`    ${cyan}--trae${reset}              Target Trae runtime`);
  console.log(`    ${cyan}--catpawai${reset}          Target CatpawAI runtime`);
  console.log(`    ${cyan}--trae-cn${reset}           Target Trae (CN) runtime`);
  console.log(`    ${cyan}--qoder${reset}             Target Qoder runtime`);
  console.log(`    ${cyan}--all${reset}               Install for all supported runtimes`);
  console.log(`    ${cyan}-u, --uninstall${reset}     Remove yongle files from target`);
  console.log(`    ${cyan}-s, --status${reset}        Show auto-features health dashboard`);
  console.log(`    ${cyan}-h, --help${reset}          Show this help\n`);
  console.log(`  ${yellow}Examples:${reset}`);
  console.log(`    ${dim}# Install for Antigravity globally${reset}`);
  console.log(`    npx yongle-dadian --antigravity --global\n`);
  console.log(`    ${dim}# Install for VS Code Copilot globally${reset}`);
  console.log(`    npx yongle-dadian --copilot --global\n`);
  console.log(`    ${dim}# Install locally for VS Code Copilot (.github/)${reset}`);
  console.log(`    npx yongle-dadian --copilot --local\n`);
  console.log(`    ${dim}# Install locally for Claude Code${reset}`);
  console.log(`    npx yongle-dadian --claude --local\n`);
  console.log(`    ${dim}# Uninstall from Antigravity${reset}`);
  console.log(`    npx yongle-dadian --antigravity --global --uninstall\n`);
  process.exit(0);
}

console.log(banner);

// ─── Validation ─────────────────────────────────────────
if (!hasGlobal && !hasLocal) {
  console.error(`  ${red}✗${reset} Please specify --global or --local\n`);
  process.exit(1);
}
if (selectedRuntimes.length === 0) {
  console.error(`  ${red}✗${reset} Please specify a runtime (e.g. --antigravity, --copilot, --gemini, --claude)\n`);
  process.exit(1);
}

// ─── Path Resolution ────────────────────────────────────
function getGlobalDir(runtime) {
  const home = os.homedir();
  const dirs = {
    antigravity: path.join(home, '.gemini', 'antigravity'),
    gemini: path.join(home, '.gemini'),
    claude: path.join(home, '.claude'),
    copilot: path.join(home, '.copilot'),
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

function getLocalDir(runtime) {
  const dirs = {
    antigravity: '.agent',
    gemini: '.gemini',
    claude: '.claude',
    copilot: '.github',
    opencode: '.opencode',
    kilo: '.kilo',
    cursor: '.cursor',
    windsurf: '.windsurf',
    trae: '.trae',
    catpawai: '.catpawai',
    'trae-cn': '.trae-cn',
    qoder: '.qoder',
  };
  return path.join(process.cwd(), dirs[runtime] || '.' + runtime);
}

// ─── Source paths (relative to this script) ─────────────
const packageRoot = path.resolve(__dirname, '..');
const srcSkills = path.join(packageRoot, 'skills');
const srcWorkflows = path.join(packageRoot, 'workflows');
const srcScripts = path.join(packageRoot, 'scripts');
const srcCommands = path.join(packageRoot, 'commands');

// ─── Install / Uninstall ────────────────────────────────
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += removeDir(p);
      fs.rmdirSync(p);
    } else {
      fs.unlinkSync(p);
      count++;
    }
  }
  // Remove the directory itself if empty
  try { fs.rmdirSync(dir); } catch {}
  return count;
}

/**
 * Get the skills target directory for a runtime
 */
function getSkillsDir(configDir) {
  return path.join(configDir, 'skills');
}

/**
 * Get the workflows target directory
 * For Antigravity/Gemini, workflows go under get-shit-done/workflows/
 * For Claude, they go under the config dir directly
 */
function getWorkflowsDir(configDir, runtime) {
  // Workflows are placed alongside GSD workflows if GSD is installed,
  // or in a yongle-specific directory
  const gsdWorkflowDir = path.join(configDir, 'get-shit-done', 'workflows');
  if (fs.existsSync(path.dirname(gsdWorkflowDir))) {
    return gsdWorkflowDir;
  }
  // Fallback: create yongle's own workflow directory
  return path.join(configDir, 'yongle', 'workflows');
}

function getScriptsDir(configDir) {
  // Scripts go alongside GSD scripts if present
  const gsdScriptsDir = path.join(configDir, 'scripts');
  if (fs.existsSync(gsdScriptsDir)) {
    return gsdScriptsDir;
  }
  return path.join(configDir, 'yongle', 'scripts');
}

// Yongle skill names
const YONGLE_SKILLS = [
  'yongle-search',
  'yongle-postmortem',
  'yongle-manage',
];

const LEGACY_SKILLS = [
  'yongle-confirm',
  'yongle-recall',
  'yongle-tag',
  'yongle-reindex',
  'yongle-sync',
  'yongle-sync-config',
  'yongle-update',
  'yongle-config-export',
  'yongle-config-import',
  'yongle-status',
  'yongle-lint',
];

const YONGLE_WORKFLOWS = [
  'yongle-postmortem.md',
  'yongle-confirm.md',
  'yongle-search.md',
  'yongle-recall.md',
  'yongle-tag.md',
  'yongle-reindex.md',
  'yongle-check-dream.md',
  'yongle-lint.md',
];

const YONGLE_SCRIPTS = [
  'yongle-db.js',
  'yongle-dreamer.js',
  'yongle-auto-search-hook.js',
  'yongle-auto-archive-hook.js',
  'yongle-bg-archiver.js',
  'yongle-logger.js',
  'yongle-status.js',
  'yongle-lint.js',
  'yongle-confirm.js',
];

const COPILOT_HOOK_FILENAME = 'yongle.json';
const COPILOT_INSTRUCTIONS_FILENAME = 'yongle.instructions.md';

function buildCopilotInstructions() {
  return [
    '---',
    "description: '永乐大典 (Yongle Dadian) 长期记忆与排错经验检索协同指引'",
    "applyTo: '**'",
    '---',
    '',
    '# 永乐大典 (Yongle Dadian) 协同指引',
    '',
    '本环境已安装「永乐大典」AI 开发经验知识库技能：',
    '- **遇错先查**：遇到报错、环境异常、构建失败或重复踩坑时，优先调用 `yongle-search` 技能（或运行 `/yongle-search`）检索历史经验与既有方案。',
    '- **排错沉淀**：成功解决非平凡 Bug 或完成关键架构决策后，如用户需要沉淀经验，调用 `yongle-postmortem` 技能（或提示用户使用 `/yongle-postmortem`）归档。',
    '- **运维管理**：查看自动化状态、巡检、重建索引、同步或更新时，调用 `yongle-manage` 技能（`/yongle-manage`）。',
    '',
  ].join('\n');
}

function installForRuntime(runtime) {
  const configDir = hasGlobal ? getGlobalDir(runtime) : getLocalDir(runtime);
  console.log(`  ${cyan}▸${reset} Installing for ${bold}${runtime}${reset} → ${dim}${configDir}${reset}`);

  let totalFiles = 0;

  // 1. Install skills (and clean up legacy skills)
  const skillsDir = getSkillsDir(configDir);
  for (const legacyName of LEGACY_SKILLS) {
    removeDir(path.join(skillsDir, legacyName));
  }
  for (const skillName of YONGLE_SKILLS) {
    const src = path.join(srcSkills, skillName);
    const dest = path.join(skillsDir, skillName);
    if (fs.existsSync(src)) {
      // Resolve {{YONGLE_INSTALL_DIR}} in SKILL.md
      const skillMdSrc = path.join(src, 'SKILL.md');
      if (fs.existsSync(skillMdSrc)) {
        fs.mkdirSync(dest, { recursive: true });
        let content = fs.readFileSync(skillMdSrc, 'utf8');
        content = content.replace(/\{\{YONGLE_INSTALL_DIR\}\}/g, packageRoot.replace(/\\/g, '/'));
        fs.writeFileSync(path.join(dest, 'SKILL.md'), content);
        totalFiles++;
      }
    }
  }

  // 2. Install workflows
  const workflowsDir = getWorkflowsDir(configDir, runtime);
  fs.mkdirSync(workflowsDir, { recursive: true });
  for (const wf of YONGLE_WORKFLOWS) {
    const src = path.join(srcWorkflows, wf);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(workflowsDir, wf));
      totalFiles++;
    }
  }

  // 3. Install scripts
  const scriptsDir = getScriptsDir(configDir);
  fs.mkdirSync(scriptsDir, { recursive: true });
  for (const sc of YONGLE_SCRIPTS) {
    const src = path.join(srcScripts, sc);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(scriptsDir, sc));
      totalFiles++;
    }
  }

  // 4. Write manifest for future uninstall
  const manifestDir = path.join(configDir, 'yongle');
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    version: pkg.version,
    installed_at: new Date().toISOString(),
    source: packageRoot,
    runtime,
    scope: hasGlobal ? 'global' : 'local',
    skills: YONGLE_SKILLS,
    workflows: YONGLE_WORKFLOWS,
    scripts: YONGLE_SCRIPTS,
  };
  if (runtime === 'copilot') {
    manifest.hooks = [path.posix.join('hooks', COPILOT_HOOK_FILENAME)];
    manifest.instructions = [path.posix.join('instructions', COPILOT_INSTRUCTIONS_FILENAME)];
  }
  fs.writeFileSync(
    path.join(manifestDir, 'install-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  totalFiles++;

  console.log(`    ${green}✓${reset} ${totalFiles} files installed`);

  // 5. Install Hook for Antigravity
  if (runtime === 'antigravity') {
    const hooksDir = hasGlobal ? path.join(os.homedir(), '.gemini', 'config') : path.join(process.cwd(), '.agent');
    const hooksPath = path.join(hooksDir, 'hooks.json');
    let hooksData = {};
    if (fs.existsSync(hooksPath)) {
      try { hooksData = JSON.parse(fs.readFileSync(hooksPath, 'utf8')); } catch(e) {}
    }
    
    // Path to the installed hook scripts
    const searchScriptPath = path.join(scriptsDir, 'yongle-auto-search-hook.js').replace(/\\/g, '/');
    const archiveScriptPath = path.join(scriptsDir, 'yongle-auto-archive-hook.js').replace(/\\/g, '/');
    
    hooksData['yongle-autonomous'] = {
      "PreInvocation": [
        {
          "type": "command",
          "command": `node "${searchScriptPath}"`
        }
      ],
      "PostInvocation": [
        {
          "type": "command",
          "command": `node "${archiveScriptPath}"`
        }
      ],
      "Stop": [
        {
          "type": "command",
          "command": `node "${archiveScriptPath}"`
        }
      ]
    };
    
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2) + '\n', 'utf8');
    console.log(`    ${green}✓${reset} Antigravity PreInvocation hook registered`);

    // 5b. Register to ~/.gemini/settings.json AND ~/.gemini/antigravity/settings.json AfterTool
    const settingsPaths = [
      path.join(os.homedir(), '.gemini', 'settings.json'),
      path.join(os.homedir(), '.gemini', 'antigravity', 'settings.json')
    ];
    for (const agSettingsPath of settingsPaths) {
      if (!fs.existsSync(agSettingsPath)) continue;
      try {
        const agSettings = JSON.parse(fs.readFileSync(agSettingsPath, 'utf8'));
        if (!agSettings.hooks) agSettings.hooks = {};
        if (!agSettings.hooks.AfterTool) agSettings.hooks.AfterTool = [];
        
        const yongleEntry = {
          matcher: "*",
          hooks: [{
            type: "command",
            command: `& "D:/Computers/Environments/Nodejs/node.exe" "${archiveScriptPath}"`,
            timeout: 10
          }]
        };

        // Check if our hook already exists in ANY entry
        const exists = agSettings.hooks.AfterTool.some(entry =>
          entry.hooks && entry.hooks.some(h => h.command && h.command.includes('yongle-auto-archive-hook.js'))
        );
        if (!exists) {
          agSettings.hooks.AfterTool.push(yongleEntry);
          fs.writeFileSync(agSettingsPath, JSON.stringify(agSettings, null, 2) + '\n', 'utf8');
          console.log(`    ${green}✓${reset} ${path.basename(path.dirname(agSettingsPath))}/settings.json AfterTool hook registered`);
        }
      } catch(e) {}
    }

    // 5c. Sync Antigravity 2.0 plugin (~/.gemini/config/plugins/yongle-plugin) if present
    if (hasGlobal) {
      const ag2PluginDir = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'yongle-plugin');
      if (fs.existsSync(ag2PluginDir)) {
        try {
          const { installAntigravity2Plugin } = require(path.join(srcScripts, 'install-to-antigravity2.js'));
          const pluginRes = installAntigravity2Plugin({
            packageRoot,
            pkg,
            targetPluginDir: ag2PluginDir,
            silent: true,
          });
          console.log(`    ${green}✓${reset} Antigravity 2.0 plugin synced (v${pluginRes.version}, ${pluginRes.installedSkillsCount} skills, ${pluginRes.installedAgentsCount} agents)`);
        } catch (e) {
          console.warn(`    ${yellow}⚠${reset} Failed to sync Antigravity 2.0 plugin: ${e.message}`);
        }
      }
    }
  }

  // 6. Install Hooks & Custom Instructions for VS Code Copilot
  if (runtime === 'copilot') {
    const hooksDir = path.join(configDir, 'hooks');
    const hooksPath = path.join(hooksDir, COPILOT_HOOK_FILENAME);
    const searchHookScript = path.join(srcScripts, 'yongle-auto-search-hook.js').replace(/\\/g, '/');
    const archiveHookScript = path.join(srcScripts, 'yongle-auto-archive-hook.js').replace(/\\/g, '/');

    const copilotHooks = {
      hooks: {
        UserPromptSubmit: [
          {
            type: 'command',
            command: `node "${searchHookScript}" --runtime=copilot`,
            timeout: 10,
          },
        ],
        PostToolUse: [
          {
            type: 'command',
            command: `node "${searchHookScript}" --runtime=copilot`,
            timeout: 10,
          },
        ],
        Stop: [
          {
            type: 'command',
            command: `node "${archiveHookScript}" --runtime=copilot`,
            timeout: 10,
          },
        ],
      },
    };

    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(copilotHooks, null, 2) + '\n', 'utf8');
    console.log(`    ${green}✓${reset} VS Code Copilot hooks registered → ${dim}${hooksPath}${reset}`);

    const instructionsDir = path.join(configDir, 'instructions');
    const instructionsPath = path.join(instructionsDir, COPILOT_INSTRUCTIONS_FILENAME);
    fs.mkdirSync(instructionsDir, { recursive: true });
    fs.writeFileSync(instructionsPath, buildCopilotInstructions(), 'utf8');
    console.log(`    ${green}✓${reset} VS Code Copilot instructions installed → ${dim}${instructionsPath}${reset}`);
  }
}

function uninstallForRuntime(runtime) {
  const configDir = hasGlobal ? getGlobalDir(runtime) : getLocalDir(runtime);
  console.log(`  ${yellow}▸${reset} Uninstalling from ${bold}${runtime}${reset} → ${dim}${configDir}${reset}`);

  let removed = 0;

  // Remove skills (including any legacy skills)
  const skillsDir = getSkillsDir(configDir);
  for (const skillName of [...YONGLE_SKILLS, ...LEGACY_SKILLS]) {
    const dir = path.join(skillsDir, skillName);
    removed += removeDir(dir);
  }

  // Remove workflows
  const workflowsDir = getWorkflowsDir(configDir, runtime);
  for (const wf of YONGLE_WORKFLOWS) {
    const p = path.join(workflowsDir, wf);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removed++;
    }
  }

  // Remove scripts
  const scriptsDir = getScriptsDir(configDir);
  for (const sc of YONGLE_SCRIPTS) {
    const p = path.join(scriptsDir, sc);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removed++;
    }
  }

  // Remove manifest
  const manifestPath = path.join(configDir, 'yongle', 'install-manifest.json');
  if (fs.existsSync(manifestPath)) {
    fs.unlinkSync(manifestPath);
    removed++;
  }

  console.log(`    ${green}✓${reset} ${removed} files removed`);

  // Remove Hook for Antigravity
  if (runtime === 'antigravity') {
    const hooksDir = hasGlobal ? path.join(os.homedir(), '.gemini', 'config') : path.join(process.cwd(), '.agent');
    const hooksPath = path.join(hooksDir, 'hooks.json');
    if (fs.existsSync(hooksPath)) {
      try {
        let hooksData = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
        if (hooksData['yongle-autonomous']) {
          delete hooksData['yongle-autonomous'];
          fs.writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2) + '\n', 'utf8');
          console.log(`    ${green}✓${reset} Antigravity PreInvocation hook unregistered`);
        }
      } catch(e) {}
    }
  }

  // Remove Hooks & Custom Instructions for VS Code Copilot
  if (runtime === 'copilot') {
    const hooksDir = path.join(configDir, 'hooks');
    const hooksPath = path.join(hooksDir, COPILOT_HOOK_FILENAME);
    if (fs.existsSync(hooksPath)) {
      fs.unlinkSync(hooksPath);
      try { fs.rmdirSync(hooksDir); } catch {}
      console.log(`    ${green}✓${reset} VS Code Copilot hooks removed`);
    }

    const instructionsDir = path.join(configDir, 'instructions');
    const instructionsPath = path.join(instructionsDir, COPILOT_INSTRUCTIONS_FILENAME);
    if (fs.existsSync(instructionsPath)) {
      fs.unlinkSync(instructionsPath);
      try { fs.rmdirSync(instructionsDir); } catch {}
      console.log(`    ${green}✓${reset} VS Code Copilot instructions removed`);
    }
  }
}

// ─── Execute ────────────────────────────────────────────
console.log(`  Mode: ${hasUninstall ? 'Uninstall' : 'Install'} (${hasGlobal ? 'global' : 'local'})\n`);

for (const runtime of selectedRuntimes) {
  if (hasUninstall) {
    uninstallForRuntime(runtime);
  } else {
    installForRuntime(runtime);
  }
}

console.log(`\n  ${green}${bold}Done!${reset}`);
if (!hasUninstall) {
  console.log(`  ${dim}Restart your AI agent to pick up the new skills.${reset}\n`);
}
