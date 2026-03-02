import { createLogger } from '../logger.js';
const log = createLogger('conversation');
/** Simple token estimator: ~3.5 chars per token for English text */
function estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
}
/**
 * Tracks all conversations, stores messages, manages context window,
 * handles compaction and FTS5 search.
 */
export class ConversationManager {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Get or create a conversation for this agent + channel + user combo */
    getOrCreate(agentId, platform, channelId, userId, userName) {
        const existing = this.db.get(`SELECT * FROM conversations
       WHERE agent_id = ? AND platform = ? AND channel_id = ? AND status = 'active'
       ORDER BY last_message_at DESC LIMIT 1`, agentId, platform, channelId);
        if (existing)
            return this.hydrateConversation(existing);
        const result = this.db.run(`INSERT INTO conversations (agent_id, platform, channel_id, user_id, user_name)
       VALUES (?, ?, ?, ?, ?)`, agentId, platform, channelId, userId ?? null, userName ?? null);
        const id = Number(result.lastInsertRowid);
        log.debug({ agentId, channelId, id }, 'Conversation created');
        return this.getById(id);
    }
    /** Store a message in a conversation */
    addMessage(conversationId, role, content, metadata) {
        const tokens = estimateTokens(content);
        const result = this.db.run(`INSERT INTO messages (conversation_id, role, content, token_estimate, metadata)
       VALUES (?, ?, ?, ?, ?)`, conversationId, role, content, tokens, metadata ? JSON.stringify(metadata) : null);
        // Update conversation stats
        this.db.run(`UPDATE conversations
       SET total_tokens_estimate = total_tokens_estimate + ?,
           message_count = message_count + 1,
           last_message_at = datetime('now')
       WHERE id = ?`, tokens, conversationId);
        const id = Number(result.lastInsertRowid);
        return this.getMessageById(id);
    }
    /** Get conversation history, optionally limited */
    getHistory(conversationId, options) {
        let sql = 'SELECT * FROM messages WHERE conversation_id = ?';
        const params = [conversationId];
        if (options?.since) {
            sql += ' AND created_at >= ?';
            params.push(options.since.toISOString());
        }
        sql += ' ORDER BY created_at ASC';
        if (options?.limit) {
            sql += ' LIMIT ?';
            params.push(options.limit);
        }
        let messages = this.db.all(sql, ...params).map(r => this.hydrateMessage(r));
        // Apply token budget if specified
        if (options?.maxTokens) {
            const filtered = [];
            let totalTokens = 0;
            // Work backwards from newest messages
            for (let i = messages.length - 1; i >= 0; i--) {
                if (totalTokens + messages[i].tokenEstimate > options.maxTokens)
                    break;
                totalTokens += messages[i].tokenEstimate;
                filtered.unshift(messages[i]);
            }
            messages = filtered;
        }
        return messages;
    }
    /** Get token estimate for a conversation */
    getTokenEstimate(conversationId) {
        const row = this.db.get('SELECT total_tokens_estimate FROM conversations WHERE id = ?', conversationId);
        return row?.total_tokens_estimate ?? 0;
    }
    /**
     * Check if a conversation should be compacted.
     * Uses model-aware threshold: 75% of context window (default ~150k tokens for Sonnet).
     * The modelContextTokens param should be set from the agent's model capacity.
     */
    shouldCompact(conversationId, maxTokens = 150_000) {
        return this.getTokenEstimate(conversationId) > maxTokens;
    }
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
    async compact(conversationId, summarize, keepCount = 10, extractMemory) {
        const allMessages = this.db.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', conversationId);
        if (allMessages.length <= keepCount) {
            return { summary: '', messagesBefore: allMessages.length, messagesAfter: allMessages.length, tokensSaved: 0 };
        }
        const toCompact = allMessages.slice(0, allMessages.length - keepCount);
        const toKeep = allMessages.slice(allMessages.length - keepCount);
        // Build text to summarize
        const compactText = toCompact
            .map(m => `[${m.role}]: ${m.content}`)
            .join('\n');
        // Phase 1: Pre-compaction memory flush
        // Extract key facts/decisions before they're lost to compaction
        let extractedFacts = null;
        if (extractMemory) {
            try {
                extractedFacts = await extractMemory(compactText);
                log.debug({ conversationId, extractedLength: extractedFacts.length }, 'Pre-compaction memory flush');
            }
            catch (err) {
                log.warn({ err, conversationId }, 'Pre-compaction memory extraction failed, continuing with compaction');
            }
        }
        // Phase 2: Summarize and compact
        const summary = await summarize(compactText);
        const conversation = this.getById(conversationId);
        const tokensBefore = toCompact.reduce((sum, m) => sum + m.token_estimate, 0);
        const summaryTokens = estimateTokens(summary);
        this.db.transaction(() => {
            // Delete old messages
            for (const msg of toCompact) {
                this.db.run('DELETE FROM messages WHERE id = ?', msg.id);
            }
            // Store compaction record (summary lives here, NOT as a system message)
            this.db.run(`INSERT INTO compactions (conversation_id, agent_id, summary, messages_before, messages_after, tokens_saved)
         VALUES (?, ?, ?, ?, ?, ?)`, conversationId, conversation.agentId, summary, allMessages.length, toKeep.length, tokensBefore - summaryTokens);
            // Update conversation tokens
            const newTotal = toKeep.reduce((sum, m) => sum + m.token_estimate, 0);
            this.db.run('UPDATE conversations SET total_tokens_estimate = ?, message_count = ? WHERE id = ?', newTotal, toKeep.length, conversationId);
        });
        const tokensSaved = tokensBefore - summaryTokens;
        log.info({ conversationId, tokensSaved, messagesBefore: allMessages.length, messagesAfter: toKeep.length, hadMemoryFlush: !!extractedFacts }, 'Conversation compacted');
        return {
            summary,
            extractedFacts,
            messagesBefore: allMessages.length,
            messagesAfter: toKeep.length,
            tokensSaved,
        };
    }
    /** Search messages using FTS5 */
    searchMessages(agentId, query, limit = 20) {
        const rows = this.db.all(`SELECT m.*, fts.rank FROM messages m
       JOIN messages_fts fts ON fts.rowid = m.id
       JOIN conversations c ON c.id = m.conversation_id
       WHERE fts.content MATCH ? AND c.agent_id = ?
       ORDER BY fts.rank
       LIMIT ?`, query, agentId, limit);
        return rows.map(r => ({
            messageId: r.id,
            conversationId: r.conversation_id,
            content: r.content,
            role: r.role,
            createdAt: r.created_at,
            rank: r.rank,
        }));
    }
    /** Get recent compaction summaries for a conversation */
    getRecentSummaries(conversationId, limit = 3) {
        return this.db.all('SELECT * FROM compactions WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?', conversationId, limit).map(r => ({ summary: r.summary, createdAt: r.created_at }));
    }
    /** Get a conversation by ID */
    getById(id) {
        const row = this.db.get('SELECT * FROM conversations WHERE id = ?', id);
        return row ? this.hydrateConversation(row) : undefined;
    }
    getMessageById(id) {
        const row = this.db.get('SELECT * FROM messages WHERE id = ?', id);
        return row ? this.hydrateMessage(row) : undefined;
    }
    hydrateConversation(row) {
        return {
            id: row.id,
            agentId: row.agent_id,
            platform: row.platform,
            channelId: row.channel_id,
            userId: row.user_id,
            userName: row.user_name,
            status: row.status,
            totalTokensEstimate: row.total_tokens_estimate,
            messageCount: row.message_count,
            startedAt: row.started_at,
            lastMessageAt: row.last_message_at,
        };
    }
    hydrateMessage(row) {
        return {
            id: row.id,
            conversationId: row.conversation_id,
            role: row.role,
            content: row.content,
            tokenEstimate: row.token_estimate,
            metadata: row.metadata ? JSON.parse(row.metadata) : null,
            createdAt: row.created_at,
        };
    }
}
//# sourceMappingURL=conversation-manager.js.map