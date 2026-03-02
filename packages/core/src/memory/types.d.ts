export interface MemoryFact {
    id: number;
    agentId: number;
    category: 'user_preference' | 'project_context' | 'learned_pattern' | 'important_event' | 'sticky';
    content: string;
    confidence: number;
    sourceConversationId: number | null;
    createdAt: string;
    lastAccessed: string;
    accessCount: number;
}
export interface KVPair {
    key: string;
    value: string;
    updatedAt: string;
}
export interface SavedMemory {
    type: 'fact' | 'state';
    category?: string;
    key?: string;
    content: string;
}
export interface SearchResult {
    messageId: number;
    conversationId: number;
    content: string;
    role: string;
    createdAt: string;
    rank: number;
}
//# sourceMappingURL=types.d.ts.map