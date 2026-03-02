import type { ArvisDatabase } from '../db/database.js';
import type { Skill } from './types.js';
/**
 * Discovers and parses skill files from the skills directory.
 * Skills are markdown files with YAML frontmatter.
 */
export declare class SkillLoader {
    private skillsDir;
    private db;
    constructor(skillsDir: string, db: ArvisDatabase);
    /** Scan skills directory and register all skills in DB */
    loadAll(): Skill[];
    /** Parse a single skill file */
    parseSkill(filePath: string): Skill;
    private registerSkill;
}
//# sourceMappingURL=skill-loader.d.ts.map