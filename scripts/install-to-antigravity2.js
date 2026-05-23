const fs = require('fs');
const path = require('path');
const os = require('os');

const packageRoot = path.resolve(__dirname, '..');
const srcSkills = path.join(packageRoot, 'skills');
const targetPluginDir = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'yongle-plugin');
const targetSkillsDir = path.join(targetPluginDir, 'skills');

console.log('Installing Yongle Dadian to Antigravity 2.0...');
console.log('Source package root:', packageRoot);
console.log('Target plugin directory:', targetPluginDir);

// 1. Create plugin directories
fs.mkdirSync(targetSkillsDir, { recursive: true });

// 2. Write plugin.json
const pluginJson = {
  name: "yongle-plugin",
  version: "1.38.3",
  description: "Yongle Dadian - Long-term Memory & Hybrid Search Engine Plugin for Antigravity 2.0",
  author: {
    name: "Lemony"
  },
  license: "MIT"
};
fs.writeFileSync(
  path.join(targetPluginDir, 'plugin.json'),
  JSON.stringify(pluginJson, null, 2) + '\n'
);
console.log('✓ Created plugin.json');

// 3. Install skills and resolve paths
const YONGLE_SKILLS = [
  'yongle-postmortem',
  'yongle-confirm',
  'yongle-search',
  'yongle-recall',
  'yongle-tag',
  'yongle-reindex',
  'yongle-sync',
  'yongle-update',
];

const normalizedPackageRoot = packageRoot.replace(/\\/g, '/');

let installedSkillsCount = 0;
for (const skillName of YONGLE_SKILLS) {
  const skillSrcDir = path.join(srcSkills, skillName);
  const skillDestDir = path.join(targetSkillsDir, skillName);
  const skillMdSrc = path.join(skillSrcDir, 'SKILL.md');

  if (fs.existsSync(skillMdSrc)) {
    fs.mkdirSync(skillDestDir, { recursive: true });
    let content = fs.readFileSync(skillMdSrc, 'utf8');
    // Replace placeholder with normalized absolute path
    content = content.replace(/\{\{YONGLE_INSTALL_DIR\}\}/g, normalizedPackageRoot);
    fs.writeFileSync(path.join(skillDestDir, 'SKILL.md'), content);
    console.log(`✓ Installed skill: ${skillName}`);
    installedSkillsCount++;
  } else {
    console.warn(`⚠ Skill source not found for: ${skillName}`);
  }
}

console.log(`\nSuccess! Installed ${installedSkillsCount} skills to Antigravity 2.0 plugin.`);
console.log('Please restart your AI agent to apply the new skills.');
