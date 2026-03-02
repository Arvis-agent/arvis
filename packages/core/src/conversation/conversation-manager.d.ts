import type { ArvisDatabase } from '../db/database.js';
import type { Conversation, Message, CompactionResult } from './types.js';
import type { SearchResult } from '../memory/types.js';
/**
 * Tracks all conversations, stores messages, manages context window,
 * handles compaction and FTS5 search.
 */
export declare class ConversationManager {
    private db;
    constructor(db: ArvisDatabase);
    /** Get or create a conversation for this agent + channel + user combo */
    getOrCreate(agentId: number, platform: string, channelId: string, userId?: string, userName?: string): Conversation;
    /** Store a message in a conversation */
    addMessage(conversationId: number, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, unknown>): Message;
    /** Get conversation history, optionally limited */
    getHistory(conversationId: number, options?: {
        limit?: number;
        maxTokens?: number;
        since?: Date;
    }): Message[];
    /** Get token estimate for a conversation */
    getTokenEstimate(conversationId: number): number;
    /**
     * Check if a conversation should be compacted.
     * Uses model-aware threshold: 75% of context window (default ~150k tokens for Sonnet).
     * The modelContextTokens param should be set from the agent's model capacity.
     */
    shouldCompact(conversationId: number, maxTokens?: number): boolean;
    /**
     * Compact a conversation by summarizing old messages.
     * Keeps the last `keepCount` messages and replaces older ones with a summary.
     *
     * Two-phase compaction:
     * 1. Pre-compaction memory flush — extract key facts from messages about to be deleted
     * 2. Summarize and delete old messages, store compaction record
     *
     * @param summarize Function to generate summary (injected to avoid runner dependency)
     * @param extractMemory Optional function to extract key facts before compaction
     */
    compact(conversationId: number, summarize: (messages: string) => Promise<string>, keepCount?: number, extractMemory?: (messages: string) => Promise<string>): Promise<CompactionResult>;
    /** Search messages using FTS5 */
    searchMessages(agentId: number, query: string, limit?: number): SearchResult[];
    /** Get recent compaction summaries for a conversation */
    getRecentSummaries(conversationId: number, limit?: number): {
        summary: string;
        createdAt: string;
    }[];
    /** Get a conversation by ID */
    getById(id: number): Conversation | undefined;
    private getMessageById;
    private hydrateConversation;
    private hydrateMessage;
}
//# sourceMappingURL=conversation-manager.d.ts.map