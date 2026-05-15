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
    assert.ok(fs.existsSync(path.join(skillsDir, 'yongle-update', 'SKILL.md')),
      'yongle-update SKILL.md should exist');

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
});
