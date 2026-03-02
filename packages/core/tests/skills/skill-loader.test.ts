import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillLoader } from '../../src/skills/skill-loader.js';
import { SkillInjector } from '../../src/skills/skill-injector.js';
import { AgentRegistry } from '../../src/agents/agent-registry.js';
import { setupTestDb, cleanupTestDb, createTestAgent } from '../helpers.js';
import type { ArvisDatabase } from '../../src/db/database.js';
import type { ArvisConfig } from '../../src/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SkillLoader', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;
  let skillsDir: string;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
    skillsDir = path.join(os.tmpdir(), `arvis-skills-${Date.now()}`);
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTestDb(db, config);
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  it('parses skill from markdown file', () => {
    const skillFile = path.join(skillsDir, 'test-skill.md');
    fs.writeFileSync(skillFile, `---
name: Test Skill
slug: test-skill
description: A test skill
triggers:
  - keywords: [react, typescript, frontend]
  - patterns: ["build.*component"]
required_tools:
  - Read
  - Write
category: development
---

# Test Skill

Instructions for this skill.
- Do thing A
- Do thing B
`);

    const loader = new SkillLoader(skillsDir, db);
    const skill = loader.parseSkill(skillFile);

    expect(skill.name).toBe('Test Skill');
    expect(skill.slug).toBe('test-skill');
    expect(skill.description).toBe('A test skill');
    expect(skill.triggerPatterns.keywords).toContain('react');
    expect(skill.triggerPatterns.keywords).toContain('typescript');
    expect(skill.triggerPatterns.patterns).toContain('build.*component');
    expect(skill.requiredTools).toContain('Read');
    expect(skill.content).toContain('Instructions for this skill');
  });

  it('loads all skills from directory', () => {
    fs.writeFileSync(path.join(skillsDir, 'a.md'), `---
name: Skill A
slug: skill-a
---

Content A
`);
    fs.writeFileSync(path.join(skillsDir, 'b.md'), `---
name: Skill B
slug: skill-b
---

Content B
`);

    const loader = new SkillLoader(skillsDir, db);
    const skills = loader.loadAll();
    expect(skills).toHaveLength(2);
  });

  it('handles missing skills directory', () => {
    const loader = new SkillLoader('/nonexistent', db);
    const skills = loader.loadAll();
    expect(skills).toHaveLength(0);
  });

  it('registers skills in database', () => {
    fs.writeFileSync(path.join(skillsDir, 'db-skill.md'), `---
name: DB Skill
slug: db-skill
---

Content
`);

    const loader = new SkillLoader(skillsDir, db);
    loader.loadAll();

    const row = db.get<{ name: string }>('SELECT name FROM skills WHERE slug = ?', 'db-skill');
    expect(row!.name).toBe('DB Skill');
  });
});

describe('SkillInjector', () => {
  let db: ArvisDatabase;
  let config: ArvisConfig;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    config = setup.config;
  });

  afterEach(() => cleanupTestDb(db, config));

  it('matches skills by keyword', () => {
    // Insert skill directly
    db.run(
      `INSERT INTO skills (slug, name, file_path, trigger_patterns, required_tools, enabled)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'web', 'Web Dev', '/fake/path.md',
      JSON.stringify({ keywords: ['react', 'css', 'frontend'], patterns: [] }),
      JSON.stringify(['Read', 'Write']),
    );

    const registry = new AgentRegistry(db);
    const agent = registry.create({ slug: 'web-dev', name: 'Web Dev', role: 'developer', allowedTools: ['Read', 'Write'] });

    const injector = new SkillInjector(db);
    const skills = injector.getRelevantSkills('help me with react component', agent);

    expect(skills).toHaveLength(1);
    expect(skills[0].slug).toBe('web');
  });

  it('matches skills by pattern', () => {
    db.run(
      `INSERT INTO skills (slug, name, file_path, trigger_patterns, required_tools, enabled)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'builder', 'Builder', '/fake/path.md',
      JSON.stringify({ keywords: [], patterns: ['build.*website', 'create.*page'] }),
      JSON.stringify([]),
    );

    const registry = new AgentRegistry(db);
    const agent = createTestAgent(registry);

    const injector = new SkillInjector(db);
    const skills = injector.getRelevantSkills('build a new website for the client', agent);

    expect(skills).toHaveLength(1);
  });

  it('filters skills requiring tools agent does not have', () => {
    db.run(
      `INSERT INTO skills (slug, name, file_path, trigger_patterns, required_tools, enabled)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'ops', 'Ops Skill', '/fake/path.md',
      JSON.stringify({ keywords: ['deploy'], patterns: [] }),
      JSON.stringify(['Bash(*)']),
    );

    const registry = new AgentRegistry(db);
    // Agent with no tools
    const agent = registry.create({ slug: 'no-tools', name: 'No Tools', role: 'custom' });

    const injector = new SkillInjector(db);
    const skills = injector.getRelevantSkills('deploy the app', agent);

    expect(skills).toHaveLength(0);
  });

  it('formats skills for prompt', () => {
    const injector = new SkillInjector(db);
    const formatted = injector.formatForPrompt([
      {
        id: 1, slug: 'test', name: 'Test Skill', description: null,
        filePath: '', triggerPatterns: { keywords: [], patterns: [] },
        requiredTools: [], category: null, enabled: true, version: '1.0.0',
        content: 'Do these things:\n- A\n- B',
      },
    ]);

    expect(formatted).toContain('ACTIVE SKILLS:');
    expect(formatted).toContain('Test Skill');
    expect(formatted).toContain('Do these things:');
  });

  it('returns empty string for no skills', () => {
    const injector = new SkillInjector(db);
    expect(injector.formatForPrompt([])).toBe('');
  });
});
