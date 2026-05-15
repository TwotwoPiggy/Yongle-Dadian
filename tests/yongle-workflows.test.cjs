'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOWS_DIR = path.join(ROOT, 'workflows');
const COMMANDS_DIR = path.join(ROOT, 'commands');

const EXPECTED_WORKFLOWS = [
  'yongle-postmortem.md',
  'yongle-confirm.md',
  'yongle-search.md',
  'yongle-recall.md',
  'yongle-tag.md',
  'yongle-reindex.md',
  'yongle-check-dream.md',
];

const EXPECTED_COMMANDS = [
  'postmortem.md',
  'confirm.md',
  'search.md',
  'recall.md',
  'tag.md',
  'reindex.md',
  'sync.md',
];

describe('yongle workflows', () => {
  it('should have all expected workflow files', () => {
    for (const wf of EXPECTED_WORKFLOWS) {
      const wfPath = path.join(WORKFLOWS_DIR, wf);
      assert.ok(fs.existsSync(wfPath), `Missing workflow: ${wf}`);
    }
  });

  it('workflow files should not be empty', () => {
    for (const wf of EXPECTED_WORKFLOWS) {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, wf), 'utf8');
      assert.ok(content.trim().length > 50, `Workflow ${wf} appears to be empty or too short`);
    }
  });

  it('workflows should contain <process> or step markers', () => {
    for (const wf of EXPECTED_WORKFLOWS) {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, wf), 'utf8');
      const hasProcess = content.includes('<process>') || content.includes('**Step') || content.includes('## ');
      assert.ok(hasProcess, `Workflow ${wf} should contain process, step, or heading markers`);
    }
  });
});

describe('yongle commands', () => {
  it('should have all expected command files', () => {
    for (const cmd of EXPECTED_COMMANDS) {
      const cmdPath = path.join(COMMANDS_DIR, cmd);
      assert.ok(fs.existsSync(cmdPath), `Missing command: ${cmd}`);
    }
  });

  it('command files should have frontmatter', () => {
    for (const cmd of EXPECTED_COMMANDS) {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, cmd), 'utf8');
      assert.ok(content.startsWith('---'), `Command ${cmd} missing frontmatter`);
    }
  });

  it('command files should have description in frontmatter', () => {
    for (const cmd of EXPECTED_COMMANDS) {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, cmd), 'utf8');
      assert.ok(content.includes('description:'), `Command ${cmd} missing description`);
    }
  });
});

describe('yongle scripts', () => {
  it('should have yongle-db.js', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'scripts', 'yongle-db.js')),
      'yongle-db.js should exist'
    );
  });

  it('should have yongle-dreamer.js', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'scripts', 'yongle-dreamer.js')),
      'yongle-dreamer.js should exist'
    );
  });

  it('yongle-db.js should export init/upsert/query commands', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'scripts', 'yongle-db.js'),
      'utf8'
    );
    assert.ok(content.includes("case 'init'"), 'Should handle init command');
    assert.ok(content.includes("case 'upsert'"), 'Should handle upsert command');
    assert.ok(content.includes("case 'query'"), 'Should handle query command');
  });
});

describe('package.json', () => {
  const pkg = require(path.join(ROOT, 'package.json'));

  it('should have name yongle-dadian', () => {
    assert.equal(pkg.name, 'yongle-dadian');
  });

  it('should have bin entry', () => {
    assert.ok(pkg.bin, 'Should have bin field');
    assert.ok(pkg.bin['yongle-dadian'], 'Should have yongle-dadian bin entry');
  });

  it('should have test script', () => {
    assert.ok(pkg.scripts.test, 'Should have test script');
  });

  it('should NOT reference get-shit-done in name or description', () => {
    assert.ok(!pkg.name.includes('get-shit-done'), 'Name should not contain GSD');
    assert.ok(!pkg.description.includes('get-shit-done'), 'Description should not contain GSD');
  });
});
