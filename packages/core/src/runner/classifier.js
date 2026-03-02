const FULL_PATTERNS = [
    /\b(create|build|make|write|implement|add|fix|bug|refactor|deploy|push|commit)\b/i,
    /\b(edit|modify|update|change|delete|remove|move|rename)\b/i,
    /\b(install|setup|configure|connect|integrate)\b/i,
    /\b(check|scan|monitor|analyze|audit|review|test)\b/i,
    /\b(file|folder|directory|code|script|component|module)\b/i,
];
const FAST_PATTERNS = [
    /^(what|how|why|when|where|who|can you|do you|is |are |will )/i,
    /\b(explain|tell me|describe|summarize|status|help)\b/i,
    /^.{0,100}$/,
];
/**
 * Classifies whether a message needs full CLI execution (with tools)
 * or can be handled by the fast API mode (no tools, quick response).
 */
export function classifyComplexity(message, agent, hasApiAccount) {
    // If agent has no tools configured -> always fast
    if (!agent.allowedTools?.length)
        return 'fast';
    // If API key not configured -> always full (CLI only)
    if (!hasApiAccount)
        return 'full';
    // Check patterns
    if (FULL_PATTERNS.some(p => p.test(message)))
        return 'full';
    if (FAST_PATTERNS.some(p => p.test(message)))
        return 'fast';
    return 'full'; // Default to full (safer)
}
//# sourceMappingURL=classifier.js.map