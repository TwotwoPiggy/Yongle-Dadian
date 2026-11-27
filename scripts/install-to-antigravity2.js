'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const YONGLE_SKILLS = [
  'yongle-search',
  'yongle-postmortem',
  'yongle-manage',
];

const YONGLE_AGENTS = [
  'yongle-researcher',
];

const LEGACY_PLUGIN_FILES = [
  path.join('rules', 'yongle-autonomous-search.md.disabled'),
  path.join('rules', 'yongle-autonomous-search.md'),
  path.join('scripts', 'auto-search-hook.js'),
];

const CLEANABLE_EMPTY_DIRS = [
  'rules',
  'scripts',
];

function removeIfEmptyDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  try {
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      fs.rmdirSync(dirPath);
      return true;
    }
  } catch {}
  return false;
}

function installAntigravity2Plugin(options = {}) {
  const packageRoot = options.packageRoot || path.resolve(__dirname, '..');
  const pkg = options.pkg || require(path.join(packageRoot, 'package.json'));
  const srcSkills = path.join(packageRoot, 'skills');
  const srcAgents = path.join(packageRoot, 'agents');
  const targetPluginDir = options.targetPluginDir
    || path.join(os.homedir(), '.gemini', 'config', 'plugins', 'yongle-plugin');
  const targetSkillsDir = path.join(targetPluginDir, 'skills');
  const targetAgentsDir = path.join(targetPluginDir, 'agents');
  const silent = Boolean(options.silent);
  const log = (...args) => { if (!silent) console.log(...args); };
  const warn = (...args) => { if (!silent) console.warn(...args); };

  log('Installing Yongle Dadian to Antigravity 2.0...');
  log('Source package root:', packageRoot);
  log('Target plugin directory:', targetPluginDir);

  // 1. Create plugin directories
  fs.mkdirSync(targetSkillsDir, { recursive: true });
  fs.mkdirSync(targetAgentsDir, { recursive: true });

  // 2. Write plugin.json (version synced from package.json)
  const pluginJson = {
    name: 'yongle-plugin',
    version: pkg.version,
    description: 'Yongle Dadian - Long-term Memory & Hybrid Search Engine Plugin for Antigravity 2.0',
    author: {
      name: typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name || 'Lemony'),
    },
    license: pkg.license || 'MIT',
  };
  fs.writeFileSync(
    path.join(targetPluginDir, 'plugin.json'),
    JSON.stringify(pluginJson, null, 2) + '\n',
    'utf8'
  );
  log(`✓ Created plugin.json (v${pluginJson.version})`);

  // 3. Clean up deprecated skills and install current skills
  if (fs.existsSync(targetSkillsDir)) {
    for (const entry of fs.readdirSync(targetSkillsDir)) {
      if (!YONGLE_SKILLS.includes(entry)) {
        fs.rmSync(path.join(targetSkillsDir, entry), { recursive: true, force: true });
        log(`- Removed deprecated skill: ${entry}`);
      }
    }
  }

  const normalizedPackageRoot = packageRoot.replace(/\\/g, '/');

  let installedSkillsCount = 0;
  for (const skillName of YONGLE_SKILLS) {
    const skillSrcDir = path.join(srcSkills, skillName);
    const skillDestDir = path.join(targetSkillsDir, skillName);
    const skillMdSrc = path.join(skillSrcDir, 'SKILL.md');

    if (fs.existsSync(skillMdSrc)) {
      fs.mkdirSync(skillDestDir, { recursive: true });
      let content = fs.readFileSync(skillMdSrc, 'utf8');
      content = content.replace(/\{\{YONGLE_INSTALL_DIR\}\}/g, normalizedPackageRoot);
      fs.writeFileSync(path.join(skillDestDir, 'SKILL.md'), content, 'utf8');
      log(`✓ Installed skill: ${skillName}`);
      installedSkillsCount++;
    } else {
      warn(`⚠ Skill source not found for: ${skillName}`);
    }
  }

  // 4. Clean up deprecated agents and install managed subagents
  if (fs.existsSync(targetAgentsDir)) {
    for (const entry of fs.readdirSync(targetAgentsDir)) {
      if (!YONGLE_AGENTS.includes(entry)) {
        fs.rmSync(path.join(targetAgentsDir, entry), { recursive: true, force: true });
        log(`- Removed deprecated agent: ${entry}`);
      }
    }
  }

  let installedAgentsCount = 0;
  for (const agentName of YONGLE_AGENTS) {
    const agentSrcDir = path.join(srcAgents, agentName);
    const agentDestDir = path.join(targetAgentsDir, agentName);
    const agentMdSrc = path.join(agentSrcDir, 'AGENT.md');

    if (fs.existsSync(agentMdSrc)) {
      fs.mkdirSync(agentDestDir, { recursive: true });
      let content = fs.readFileSync(agentMdSrc, 'utf8');
      content = content.replace(/\{\{YONGLE_INSTALL_DIR\}\}/g, normalizedPackageRoot);
      fs.writeFileSync(path.join(agentDestDir, 'AGENT.md'), content, 'utf8');
      log(`✓ Installed agent: ${agentName}`);
      installedAgentsCount++;
    } else {
      warn(`⚠ Agent source not found for: ${agentName}`);
    }
  }

  // 5. Clean up legacy experimental plugin leftovers (disabled rules / obsolete hook scripts)
  const removedLegacyFiles = [];
  for (const relPath of LEGACY_PLUGIN_FILES) {
    const fullPath = path.join(targetPluginDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removedLegacyFiles.push(relPath.replace(/\\/g, '/'));
      log(`- Removed legacy plugin artifact: ${relPath.replace(/\\/g, '/')}`);
    }
  }
  for (const dirName of CLEANABLE_EMPTY_DIRS) {
    if (removeIfEmptyDir(path.join(targetPluginDir, dirName))) {
      log(`- Removed empty legacy directory: ${dirName}/`);
    }
  }

  log(`\nSuccess! Installed ${installedSkillsCount} skills and ${installedAgentsCount} agents to Antigravity 2.0 plugin.`);
  log('Please restart your AI agent to apply the updates.');

  return {
    targetPluginDir,
    version: pluginJson.version,
    installedSkillsCount,
    installedAgentsCount,
    removedLegacyFiles,
  };
}

if (require.main === module) {
  installAntigravity2Plugin();
}

module.exports = {
  YONGLE_SKILLS,
  YONGLE_AGENTS,
  LEGACY_PLUGIN_FILES,
  installAntigravity2Plugin,
};
