import fs from 'fs';
import path from 'path';
import type { ArvisDatabase } from '../db/database.js';
import type { Skill } from './types.js';
import { createLogger } from '../logger.js';

const log = createLogger('skills');

/**
 * Discovers and parses skill files from the skills directory.
 * Skills are markdown files with YAML frontmatter.
 */
export class SkillLoader {
  constructor(
    private skillsDir: string,
    private db: ArvisDatabase,
  ) {}

  /** Scan skills directory and register all skills in DB */
  loadAll(): Skill[] {
    const skills: Skill[] = [];

    if (!fs.existsSync(this.skillsDir)) {
      log.warn({ dir: this.skillsDir }, 'Skills directory not found');
      return skills;
    }

    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          try {
            const skill = this.parseSkill(fullPath);
            this.registerSkill(skill);
            skills.push(skill);
          } catch (err) {
            log.error({ file: fullPath, err }, 'Failed to parse skill');
          }
        }
      }
    };

    scanDir(this.skillsDir);
    log.info({ count: skills.length }, 'Skills loaded');
    return skills;
  }

  /** Parse a single skill file */
  parseSkill(filePath: string): Skill {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, content } = parseFrontmatter(raw);

    const triggerPatterns = {
      keywords: [] as string[],
      patterns: [] as string[],
    };

    if (frontmatter.triggers) {
      const triggers = Array.isArray(frontmatter.triggers) ? frontmatter.triggers : [frontmatter.triggers];
      for (const trigger of triggers) {
        if (trigger.keywords) triggerPatterns.keywords.push(...trigger.keywords);
        if (trigger.patterns) triggerPatterns.patterns.push(...trigger.patterns);
      }
    }

    const requiredTools = (Array.isArray(frontmatter.required_tools) ? frontmatter.required_tools : []) as string[];

    return {
      id: 0, // Set by DB
      slug: (typeof frontmatter.slug === 'string' ? frontmatter.slug : null) || path.basename(filePath, '.md'),
      name: (typeof frontmatter.name === 'string' ? frontmatter.name : null) || path.basename(filePath, '.md'),
      description: typeof frontmatter.description === 'string' ? frontmatter.description : null,
      filePath,
      triggerPatterns,
      requiredTools,
      category: typeof frontmatter.category === 'string' ? frontmatter.category : null,
      enabled: true,
      version: (typeof frontmatter.version === 'string' ? frontmatter.version : null) || '1.0.0',
      content: content.trim(),
    };
  }

  private registerSkill(skill: Skill): void {
    const existing = this.db.get<{ id: number }>('SELECT id FROM skills WHERE slug = ?', skill.slug);

    if (existing) {
      this.db.run(
        `UPDATE skills SET name = ?, description = ?, file_path = ?, trigger_patterns = ?,
         required_tools = ?, category = ?, version = ? WHERE slug = ?`,
        skill.name, skill.description, skill.filePath,
        JSON.stringify(skill.triggerPatterns), JSON.stringify(skill.requiredTools),
        skill.category, skill.version, skill.slug,
      );
      skill.id = existing.id;
    } else {
      const result = this.db.run(
        `INSERT INTO skills (slug, name, description, file_path, trigger_patterns, required_tools, category, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        skill.slug, skill.name, skill.description, skill.filePath,
        JSON.stringify(skill.triggerPatterns), JSON.stringify(skill.requiredTools),
        skill.category, skill.version,
      );
      skill.id = Number(result.lastInsertRowid);
    }
  }
}

/** Parse YAML-like frontmatter from a markdown file */
function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content: raw };

  const yamlText = match[1];
  const content = match[2];

  // Simple YAML-like parser for frontmatter
  const frontmatter: Record<string, unknown> = {};
  let currentKey = '';
  let currentList: unknown[] | null = null;

  for (const line of yamlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // List item
    const listMatch = trimmed.match(/^-\s*(.*)/);
    if (listMatch && currentList) {
      const val = listMatch[1].trim();
      // Check for key-value in list item
      const kvMatch = val.match(/^(\w+):\s*\[([^\]]*)\]$/);
      if (kvMatch) {
        const obj: Record<string, unknown> = {};
        obj[kvMatch[1]] = kvMatch[2].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        currentList.push(obj);
      } else if (val.startsWith('[') && val.endsWith(']')) {
        currentList.push(...val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')));
      } else {
        currentList.push(val.replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    // Key: value
    const kvMatch = trimmed.match(/^(\w[\w_]*):\s*(.*)?$/);
    if (kvMatch) {
      // Save previous list
      if (currentKey && currentList) {
        frontmatter[currentKey] = currentList;
        currentList = null;
      }

      const key = kvMatch[1];
      const value = (kvMatch[2] || '').trim();

      if (!value) {
        // Start of list or nested block
        currentKey = key;
        currentList = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        frontmatter[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        currentKey = '';
      } else {
        frontmatter[key] = value.replace(/^["']|["']$/g, '');
        currentKey = '';
      }
    }
  }

  // Save final list
  if (currentKey && currentList) {
    frontmatter[currentKey] = currentList;
  }

  return { frontmatter, content };
}
