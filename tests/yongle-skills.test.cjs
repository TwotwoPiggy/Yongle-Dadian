'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');

const EXPECTED_SKILLS = [
  'yongle-postmortem',
  'yongle-confirm',
  'yongle-search',
  'yongle-recall',
  'yongle-tag',
  'yongle-reindex',
  'yongle-sync',
  'yongle-update',
];

describe('yongle skills structure', () => {
  it('should have all expected skill directories', () => {
    for (const skill of EXPECTED_SKILLS) {
      const skillDir = path.join(SKILLS_DIR, skill);
      assert.ok(fs.existsSync(skillDir), `Missing skill directory: ${skill}`);
    }
  });

  it('every skill should have a SKILL.md', () => {
    for (const skill of EXPECTED_SKILLS) {
      const skillMd = path.join(SKILLS_DIR, skill, 'SKILL.md');
      assert.ok(fs.existsSync(skillMd), `Missing SKILL.md in ${skill}`);
    }
  });

  it('every SKILL.md should have valid frontmatter', () => {
    for (const skill of EXPECTED_SKILLS) {
      const content = fs.readFileSync(
        path.join(SKILLS_DIR, skill, 'SKILL.md'),
        'utf8'
      );
      // Check frontmatter markers
      assert.ok(content.startsWith('---'), `${skill}/SKILL.md missing frontmatter start`);
      const secondDash = content.indexOf('---', 3);
      assert.ok(secondDash > 3, `${skill}/SKILL.md missing frontmatter end`);
      
      // Check required fields
      const frontmatter = content.substring(0, secondDash);
      assert.ok(frontmatter.includes('name:'), `${skill}/SKILL.md missing 'name' field`);
      assert.ok(frontmatter.includes('description:'), `${skill}/SKILL.md missing 'description' field`);
    }
  });

  it('skills should contain {{YONGLE_INSTALL_DIR}} template or a resolved path', () => {
    for (const skill of EXPECTED_SKILLS) {
      const content = fs.readFileSync(
        path.join(SKILLS_DIR, skill, 'SKILL.md'),
        'utf8'
      );
      // Source skills should still have the template variable
      assert.ok(
        content.includes('{{YONGLE_INSTALL_DIR}}') || content.includes('workflows/'),
        `${skill}/SKILL.md should reference workflow location`
      );
    }
  });

  it('no skill should reference GSD-specific paths', () => {
    for (const skill of EXPECTED_SKILLS) {
      const content = fs.readFileSync(
        path.join(SKILLS_DIR, skill, 'SKILL.md'),
        'utf8'
      );
      assert.ok(
        !content.includes('get-shit-done/workflows/'),
        `${skill}/SKILL.md should NOT reference GSD workflow paths`
      );
      assert.ok(
        !content.includes('@~/.gemini/antigravity/get-shit-done'),
        `${skill}/SKILL.md should NOT reference hardcoded GSD install paths`
      );
    }
  });
});
