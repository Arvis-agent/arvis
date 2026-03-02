export interface Conversation {
    id: number;
    agentId: number;
    platform: string;
    channelId: string;
    userId: string | null;
    userName: string | null;
    status: 'active' | 'compacted' | 'archived';
    totalTokensEstimate: number;
    messageCount: number;
    startedAt: string;
    lastMessageAt: string;
}
export interface Message {
    id: number;
    conversationId: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokenEstimate: number;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}
export interface CompactionResult {
    summary: string;
    extractedFacts?: string | null;
    messagesBefore: number;
    messagesAfter: number;
    tokensSaved: number;
}
//# sourceMappingURL=types.d.ts.map