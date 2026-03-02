import { createLogger } from '../logger.js';
const log = createLogger('context-builder');
/** Simple token estimator: ~3.5 chars per token for English text */
function estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
}
/** Known model context windows (tokens) */
const MODEL_CONTEXT_WINDOWS = {
    'claude-sonnet-4-20250514': 200_000,
    'claude-haiku-4-5-20251001': 200_000,
    'claude-opus-4-6': 200_000,
    'gpt-4o': 128_000,
    'gpt-4o-mini': 128_000,
    'gpt-4.1': 1_000_000,
    'gpt-4.1-mini': 1_000_000,
    'gemini-2.0-flash': 1_000_000,
};
const DEFAULT_CONTEXT_WINDOW = 200_000;
const RESERVE_TOKENS = 20_000; // Headroom for output + prompt overhead
/**
 * Builds the complete context window for each agent turn.
 *
 * Token-based budget derived from the model's actual context window.
 * System prompt is cache-friendly: static content first, dynamic content last.
 * Sticky facts always survive compaction. Compaction summaries come from the
 * compactions table (not injected as system messages).
 */
export class ContextBuilder {
    db;
    memoryManager;
    conversationManager;
    constructor(db, memoryManager, conversationManager) {
        this.db = db;
        this.memoryManager = memoryManager;
        this.conversationManager = conversationManager;
    }
    /**
     * Build the full context for an agent response.
     * Budget is model-aware: contextWindow - reserveTokens.
     */
    build(agent, conversation, currentMessage) {
        const contextWindow = MODEL_CONTEXT_WINDOWS[agent.model] || DEFAULT_CONTEXT_WINDOW;
        const budgetTokens = contextWindow - RESERVE_TOKENS;
        let remainingTokens = budgetTokens;
        // --- Sticky facts (always present, never trimmed) ---
        const stickyFacts = this.memoryManager.getStickyFacts(agent.id);
        const stickyText = stickyFacts.length > 0
            ? stickyFacts.map(f => `- ${f.content}`).join('\n')
            : '';
        remainingTokens -= estimateTokens(stickyText);
        // --- Layer 1: System prompt (static content first for cache friendliness) ---
        const facts = this.memoryManager.getFacts(agent.id, { limit: 20 });
        const state = this.getStateArray(agent.id);
        const systemPrompt = this.buildSystemPrompt(agent, facts, state, stickyFacts);
        remainingTokens -= estimateTokens(systemPrompt);
        // --- Layer 3: Compaction summaries (from compactions table, last 3) ---
        const summaries = this.conversationManager.getRecentSummaries(conversation.id, 3);
        const summaryText = this.formatSummaries(summaries);
        remainingTokens -= estimateTokens(summaryText);
        // --- Layer 5: Facts text (for reference/debugging) ---
        const factsText = this.formatFacts(facts);
        // --- Layer 4: State text (for reference/debugging) ---
        const stateText = this.formatState(state);
        // --- Layer 2: Recent messages (fill remaining token budget) ---
        const maxMessageTokens = Math.max(remainingTokens, 200);
        const messages = this.getMessagesFitting(conversation.id, maxMessageTokens);
        const totalTokens = estimateTokens(systemPrompt) + estimateTokens(summaryText)
            + estimateTokens(stickyText)
            + messages.reduce((sum, m) => sum + m.tokenEstimate, 0);
        log.debug({
            agentSlug: agent.slug,
            contextWindow,
            budgetTokens,
            stickyFacts: stickyFacts.length,
            facts: facts.length,
            stateKeys: state.length,
            summaries: summaries.length,
            messages: messages.length,
            totalTokens,
        }, 'Context built');
        return {
            systemPrompt,
            messages,
            summaryText,
            factsText,
            stateText,
            totalTokens,
            totalChars: totalTokens * 3.5, // backwards compat
        };
    }
    /**
     * Build the system prompt for an agent.
     *
     * Cache-friendly ordering: static content first (identity, rules, tools),
     * dynamic content last (memory, state, timestamps).
     * This allows API prompt caching to cache the static prefix.
     */
    buildSystemPrompt(agent, facts, state, stickyFacts) {
        // Conductor has its own complete system prompt — don't wrap it
        if (agent.role === 'conductor' && agent.systemPrompt) {
            return agent.systemPrompt;
        }
        const parts = [];
        // === STATIC SECTION (cacheable) ===
        // Identity
        parts.push(`You are ${agent.name}, a ${agent.role} agent.`);
        if (agent.description)
            parts.push(agent.description);
        // Personality
        if (agent.personality) {
            parts.push(`\nVoice: ${agent.personality.voice}.`);
            if (agent.personality.quirks?.length) {
                parts.push(`Quirks: ${agent.personality.quirks.join(', ')}.`);
            }
        }
        // Rules (static)
        parts.push('\nRULES:');
        parts.push('- Save important info to memory using [MEMORY:category] tags');
        parts.push('  Categories: user_preference, project_context, learned_pattern, important_event, sticky');
        parts.push('  Use [MEMORY:sticky] for critical constraints that must never be forgotten');
        parts.push('- Save current state using [STATE:key] tags');
        parts.push('- Be concise and helpful');
        // Custom system prompt (agent-specific, relatively static)
        if (agent.systemPrompt) {
            parts.push(`\n${agent.systemPrompt}`);
        }
        // === DYNAMIC SECTION (changes per turn, placed last for cache efficiency) ===
        // Sticky facts (critical constraints — always shown)
        const allSticky = stickyFacts ?? [];
        if (allSticky.length > 0) {
            parts.push('\nCRITICAL CONTEXT (always active):');
            for (const fact of allSticky) {
                parts.push(`- ${fact.content}`);
            }
        }
        // Memory section
        if (facts.length > 0) {
            parts.push('\nMEMORY:');
            for (const fact of facts.slice(0, 15)) {
                parts.push(`- ${fact.content}`);
            }
        }
        // State section
        if (state.length > 0) {
            parts.push('\nSTATE:');
            for (const kv of state) {
                parts.push(`${kv.key}: ${kv.value}`);
            }
        }
        return parts.join('\n');
    }
    /** Get the compaction threshold for a model (75% of context window) */
    getCompactionThreshold(model) {
        const contextWindow = MODEL_CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
        return Math.floor(contextWindow * 0.75);
    }
    getStateArray(agentId) {
        const stateResult = this.memoryManager.getState(agentId);
        return Array.isArray(stateResult) ? stateResult : stateResult ? [stateResult] : [];
    }
    formatFacts(facts) {
        if (facts.length === 0)
            return '';
        return facts.map(f => `- [${f.category}] ${f.content}`).join('\n');
    }
    formatState(state) {
        if (state.length === 0)
            return '';
        return state.map(s => `${s.key}: ${s.value}`).join('\n');
    }
    formatSummaries(summaries) {
        if (summaries.length === 0)
            return '';
        return summaries.map(s => `[Previous context — ${s.createdAt}]\n${s.summary}`).join('\n---\n');
    }
    getMessagesFitting(conversationId, maxTokens) {
        const messages = this.conversationManager.getHistory(conversationId);
        const result = [];
        let totalTokens = 0;
        // Work backwards from newest
        for (let i = messages.length - 1; i >= 0; i--) {
            const msgTokens = messages[i].tokenEstimate;
            if (totalTokens + msgTokens > maxTokens)
                break;
            totalTokens += msgTokens;
            result.unshift(messages[i]);
        }
        return result;
    }
}
//# sourceMappingURL=context-builder.js.map