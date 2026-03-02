import type { ArvisDatabase } from '../db/database.js';
import type { Agent } from '../agents/agent.js';
import type { Skill } from './types.js';
/**
 * Finds relevant skills for a message + agent combination
 * and formats them for injection into the agent's system prompt.
 */
export declare class SkillInjector {
    private db;
    constructor(db: ArvisDatabase);
    /** Find relevant skills for a message + agent combination */
    getRelevantSkills(message: string, agent: Agent): Skill[];
    /** Format skills for injection into system prompt */
    formatForPrompt(skills: Skill[]): string;
    private hydrateSkill;
}
//# sourceMappingURL=skill-injector.d.ts.map