import type { ArvisDatabase } from '../db/database.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { ConversationManager } from './conversation-manager.js';
import type { Agent } from '../agents/agent.js';
import type { Conversation, Message } from './types.js';
import type { MemoryFact, KVPair } from '../memory/types.js';
import type { IncomingMessage } from '../bus/types.js';
export interface BuiltContext {
    systemPrompt: string;
    messages: Message[];
    summaryText: string;
    factsText: string;
    stateText: string;
    totalTokens: number;
    /** @deprecated Use totalTokens instead */
    totalChars: number;
}
/**
 * Builds the complete context window for each agent turn.
 *
 * Token-based budget derived from the model's actual context window.
 * System prompt is cache-friendly: static content first, dynamic content last.
 * Sticky facts always survive compaction. Compaction summaries come from the
 * compactions table (not injected as system messages).
 */
export declare class ContextBuilder {
    private db;
    private memoryManager;
    private conversationManager;
    constructor(db: ArvisDatabase, memoryManager: MemoryManager, conversationManager: ConversationManager);
    /**
     * Build the full context for an agent response.
     * Budget is model-aware: contextWindow - reserveTokens.
     */
    build(agent: Agent, conversation: Conversation, currentMessage: IncomingMessage): BuiltContext;
    /**
     * Build the system prompt for an agent.
     *
     * Cache-friendly ordering: static content first (identity, rules, tools),
     * dynamic content last (memory, state, timestamps).
     * This allows API prompt caching to cache the static prefix.
     */
    buildSystemPrompt(agent: Agent, facts: MemoryFact[], state: KVPair[], stickyFacts?: MemoryFact[]): string;
    /** Get the compaction threshold for a model (75% of context window) */
    getCompactionThreshold(model: string): number;
    private getStateArray;
    private formatFacts;
    private formatState;
    private formatSummaries;
    private getMessagesFitting;
}
//# sourceMappingURL=context-builder.d.ts.map