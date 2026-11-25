'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const INSTALL_SCRIPT = path.join(ROOT, 'bin', 'install.js');

describe('yongle-dadian installer', () => {
  const tmpDir = path.join(ROOT, 'tests', '.tmp-install-test-' + Date.now());

  // Clean up before/after
  function cleanup() {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it('should show help without error', () => {
    const result = execFileSync(process.execPath, [INSTALL_SCRIPT, '--help'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(result.includes('Yongle') || result.includes('永乐'), 'Banner should contain project name');
    assert.ok(result.includes('--antigravity'), 'Help should mention runtimes');
    assert.ok(result.includes('--copilot'), 'Help should mention --copilot runtime');
    assert.ok(result.includes('--global'), 'Help should mention --global');
  });

  it('should fail without --global or --local', () => {
    assert.throws(() => {
      execFileSync(process.execPath, [INSTALL_SCRIPT, '--antigravity'], {
        encoding: 'utf8',
        timeout: 10000,
      });
    }, /Please specify --global or --local/i);
  });

  it('should fail without runtime flag', () => {
    assert.throws(() => {
      execFileSync(process.execPath, [INSTALL_SCRIPT, '--global'], {
        encoding: 'utf8',
        timeout: 10000,
      });
    }, /Please specify a runtime/i);
  });

  it('should install skills to a target directory', () => {
    cleanup();
    fs.mkdirSync(tmpDir, { recursive: true });

    // Use env to override home dir for testing
    const env = { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir };
    execFileSync(process.execPath, [INSTALL_SCRIPT, '--global', '--antigravity'], {
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const skillsDir = path.join(tmpDir, '.gemini', 'antigravity', 'skills');
    
    // Check that skills were installed
    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-postmortem', 'SKILL.md')), 
      'yongle-postmortem SKILL.md should exist');
    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-search', 'SKILL.md')),
      'yongle-search SKILL.md should exist');
    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-manage', 'SKILL.md')),
      'yongle-manage SKILL.md should exist');

    // Check manifest
    const manifestPath = path.join(tmpDir, '.gemini', 'antigravity', 'yongle', 'install-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'Install manifest should exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.runtime, 'antigravity');
    assert.equal(manifest.scope, 'global');

    cleanup();
  });

  it('should uninstall cleanly', () => {
    cleanup();
    fs.mkdirSync(tmpDir, { recursive: true });

    const env = { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir };
    
    // Install first
    execFileSync(process.execPath, [INSTALL_SCRIPT, '--global', '--antigravity'], {
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const skillsDir = path.join(tmpDir, '.gemini', 'antigravity', 'skills');
    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-postmortem', 'SKILL.md')));

    // Uninstall
    execFileSync(process.execPath, [INSTALL_SCRIPT, '--global', '--antigravity', '--uninstall'], {
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    assert.ok(!fs.existsSync(path.join(skillsDir, 'yongle-postmortem', 'SKILL.md')),
      'SKILL.md should be removed after uninstall');

    cleanup();
  });

  it('should resolve {{YONGLE_INSTALL_DIR}} in SKILL.md during install', () => {
    cleanup();
    fs.mkdirSync(tmpDir, { recursive: true });

    const env = { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir };
    execFileSync(process.execPath, [INSTALL_SCRIPT, '--global', '--antigravity'], {
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const skillMd = fs.readFileSync(
      path.join(tmpDir, '.gemini', 'antigravity', 'skills', 'yongle-postmortem', 'SKILL.md'),
      'utf8'
    );
    assert.ok(!skillMd.includes('{{YONGLE_INSTALL_DIR}}'),
      'Template variables should be resolved');
    assert.ok(skillMd.includes('workflows/yongle-postmortem.md'),
      'Should reference workflow file');

    cleanup();
  });

  it('should install skills, hooks and instructions globally for VS Code Copilot (--copilot)', () => {
    cleanup();
    fs.mkdirSync(tmpDir, { recursive: true });

    const env = { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir };
    execFileSync(process.execPath, [INSTALL_SCRIPT, '--global', '--copilot'], {
      encoding: 'utf8',
      timeout: 15000,
      env,
    });

    const copilotRoot = path.join(tmpDir, '.copilot');
    const skillsDir = path.join(copilotRoot, 'skills');

    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-search', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-postmortem', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-manage', 'SKILL.md')));

    const searchSkill = fs.readFileSync(path.join(skillsDir, 'yongle-search', 'SKILL.md'), 'utf8');
    assert.ok(!searchSkill.includes('{{YONGLE_INSTALL_DIR}}'), 'Template vars should be resolved for Copilot');

    const hooksPath = path.join(copilotRoot, 'hooks', 'yongle.json');
    assert.ok(fs.existsSync(hooksPath), 'Copilot hooks/yongle.json should be created');
    const hooksConfig = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.ok(Array.isArray(hooksConfig.hooks?.UserPromptSubmit), 'Should register UserPromptSubmit hook');
    assert.ok(Array.isArray(hooksConfig.hooks?.PostToolUse), 'Should register PostToolUse hook');
    assert.ok(Array.isArray(hooksConfig.hooks?.Stop), 'Should register Stop hook');
    assert.ok(hooksConfig.hooks.UserPromptSubmit[0].command.includes('--runtime=copilot'));
    assert.ok(hooksConfig.hooks.Stop[0].command.includes('yongle-auto-archive-hook.js'));

    const instructionsPath = path.join(copilotRoot, 'instructions', 'yongle.instructions.md');
    assert.ok(fs.existsSync(instructionsPath), 'Copilot instructions file should be created');
    const instructionsContent = fs.readFileSync(instructionsPath, 'utf8');
    assert.ok(instructionsContent.includes("applyTo: '**'"), 'Instructions should specify global applyTo');

    const manifestPath = path.join(copilotRoot, 'yongle', 'install-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'Install manifest should exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.runtime, 'copilot');
    assert.equal(manifest.scope, 'global');
    assert.deepEqual(manifest.hooks, ['hooks/yongle.json']);
    assert.deepEqual(manifest.instructions, ['instructions/yongle.instructions.md']);

    cleanup();
  });

  it('should install locally for VS Code Copilot (.github/) via --vscode-copilot and uninstall safely', () => {
    cleanup();
    const projectDir = path.join(tmpDir, 'sample-repo');
    fs.mkdirSync(path.join(projectDir, '.github', 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.github', 'hooks'), { recursive: true });

    // Pre-existing unrelated files inside .github/ must be preserved
    const ciPath = path.join(projectDir, '.github', 'workflows', 'ci.yml');
    const otherHookPath = path.join(projectDir, '.github', 'hooks', 'custom.json');
    fs.writeFileSync(ciPath, 'name: CI\n', 'utf8');
    fs.writeFileSync(otherHookPath, '{"hooks":{}}\n', 'utf8');

    execFileSync(process.execPath, [INSTALL_SCRIPT, '--local', '--vscode-copilot'], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 15000,
    });

    const ghRoot = path.join(projectDir, '.github');
    assert.ok(fs.existsSync(path.join(ghRoot, 'skills', 'yongle-search', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(ghRoot, 'hooks', 'yongle.json')));
    assert.ok(fs.existsSync(path.join(ghRoot, 'instructions', 'yongle.instructions.md')));
    const manifest = JSON.parse(fs.readFileSync(path.join(ghRoot, 'yongle', 'install-manifest.json'), 'utf8'));
    assert.equal(manifest.runtime, 'copilot');
    assert.equal(manifest.scope, 'local');

    // Uninstall using --vscode alias
    execFileSync(process.execPath, [INSTALL_SCRIPT, '--local', '--vscode', '--uninstall'], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 15000,
    });

    assert.ok(!fs.existsSync(path.join(ghRoot, 'skills', 'yongle-search', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(ghRoot, 'hooks', 'yongle.json')));
    assert.ok(!fs.existsSync(path.join(ghRoot, 'instructions', 'yongle.instructions.md')));
    assert.ok(!fs.existsSync(path.join(ghRoot, 'yongle', 'install-manifest.json')));

    // Unrelated user files must remain untouched
    assert.ok(fs.existsSync(ciPath), 'Pre-existing .github/workflows/ci.yml must not be deleted');
    assert.ok(fs.existsSync(otherHookPath), 'Pre-existing .github/hooks/custom.json must not be deleted');

    cleanup();
  });
});
