import type { ArvisDatabase } from '../db/database.js';
import type { MemoryFact, KVPair, SavedMemory } from './types.js';
/**
 * Stores and retrieves long-term knowledge for each agent.
 * Handles facts, KV state, search, decay, deduplication, and parsing agent output.
 */
export declare class MemoryManager {
    private db;
    constructor(db: ArvisDatabase);
    /** Store a fact for an agent */
    saveFact(agentId: number, fact: {
        category: MemoryFact['category'];
        content: string;
        confidence?: number;
        conversationId?: number;
    }): MemoryFact;
    /** Get facts for an agent, optionally filtered */
    getFacts(agentId: number, options?: {
        category?: string;
        limit?: number;
        minConfidence?: number;
    }): MemoryFact[];
    /** Set a KV state pair for an agent */
    setState(agentId: number, key: string, value: string): void;
    /** Get state for an agent. If key provided, returns single KVPair or undefined. If no key, returns all. */
    getState(agentId: number, key?: string): KVPair | KVPair[] | undefined;
    /** Delete a state key */
    deleteState(agentId: number, key: string): void;
    /** Search facts using FTS5 */
    searchFacts(agentId: number, query: string, limit?: number): MemoryFact[];
    /** Reduce confidence of facts not accessed recently */
    decayFacts(agentId: number, maxAgeDays: number): number;
    /** Deduplicate similar facts (exact match + fuzzy similarity) */
    deduplicateFacts(agentId: number): number;
    /**
     * Parse agent output for [MEMORY:category] and [STATE:key] tags.
     * Saves extracted data and returns what was saved.
     */
    parseAndSave(agentId: number, agentResponse: string, conversationId: number): SavedMemory[];
    /** Strip [MEMORY:*] and [STATE:*] tags from agent output before showing to user */
    stripTags(text: string): string;
    private getFactById;
    /** Get sticky facts for an agent (always included in system prompt) */
    getStickyFacts(agentId: number): MemoryFact[];
    private hydrateFact;
}
//# sourceMappingURL=memory-manager.d.ts.map