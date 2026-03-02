import fs from 'fs';
import { createLogger } from '../logger.js';
const log = createLogger('skill-injector');
/**
 * Finds relevant skills for a message + agent combination
 * and formats them for injection into the agent's system prompt.
 */
export class SkillInjector {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Find relevant skills for a message + agent combination */
    getRelevantSkills(message, agent) {
        const allSkills = this.db.all('SELECT * FROM skills WHERE enabled = 1');
        const messageLower = message.toLowerCase();
        const scored = [];
        for (const row of allSkills) {
            const triggers = row.trigger_patterns ? JSON.parse(row.trigger_patterns) : { keywords: [], patterns: [] };
            const requiredTools = row.required_tools ? JSON.parse(row.required_tools) : [];
            // Filter: skill can't require tools the agent doesn't have
            if (requiredTools.length > 0 && agent.allowedTools.length > 0) {
                const hasAllTools = requiredTools.every(tool => agent.allowedTools.some(at => at.includes(tool) || tool.includes(at)));
                if (!hasAllTools)
                    continue;
            }
            // If agent has no tools, skip skills that require tools
            if (agent.allowedTools.length === 0 && requiredTools.length > 0)
                continue;
            let score = 0;
            // Keyword matching
            for (const keyword of triggers.keywords) {
                if (messageLower.includes(keyword.toLowerCase())) {
                    score += 1;
                }
            }
            // Pattern matching
            for (const pattern of triggers.patterns) {
                try {
                    if (new RegExp(pattern, 'i').test(message)) {
                        score += 2;
                    }
                }
                catch {
                    // Invalid regex, skip
                }
            }
            if (score > 0) {
                scored.push({
                    skill: this.hydrateSkill(row),
                    score,
                });
            }
        }
        // Return top 3 most relevant
        scored.sort((a, b) => b.score - a.score);
        const result = scored.slice(0, 3).map(s => s.skill);
        if (result.length > 0) {
            log.debug({ skills: result.map(s => s.slug), agentSlug: agent.slug }, 'Relevant skills found');
        }
        return result;
    }
    /** Format skills for injection into system prompt */
    formatForPrompt(skills) {
        if (skills.length === 0)
            return '';
        const parts = ['ACTIVE SKILLS:'];
        for (const skill of skills) {
            parts.push(`\n--- ${skill.name} ---`);
            parts.push(skill.content);
        }
        return parts.join('\n');
    }
    hydrateSkill(row) {
        const triggers = row.trigger_patterns
            ? JSON.parse(row.trigger_patterns)
            : { keywords: [], patterns: [] };
        // Load content from file
        let content = '';
        try {
            if (row.file_path && fs.existsSync(row.file_path)) {
                content = fs.readFileSync(row.file_path, 'utf-8');
            }
        }
        catch {
            log.warn({ filePath: row.file_path }, 'Failed to read skill file');
        }
        return {
            id: row.id,
            slug: row.slug,
            name: row.name,
            description: row.description,
            filePath: row.file_path,
            triggerPatterns: triggers,
            requiredTools: row.required_tools ? JSON.parse(row.required_tools) : [],
            category: row.category,
            enabled: row.enabled === 1,
            version: row.version,
            content,
        };
    }
}
//# sourceMappingURL=skill-injector.js.map