import type { ArvisDatabase } from '../db/database.js';
import type { MemoryFactRow, MemoryStateRow } from '../db/schema.js';
import type { MemoryFact, KVPair, SavedMemory } from './types.js';
import { createLogger } from '../logger.js';

const log = createLogger('memory');

const MEMORY_TAG_RE = /\[MEMORY:(\w+)\]\s*([\s\S]+?)(?=\[(?:MEMORY|STATE):|$)/g;
const STATE_TAG_RE = /\[STATE:(\w+)\]\s*([\s\S]+?)(?=\[(?:MEMORY|STATE):|$)/g;

/**
 * Stores and retrieves long-term knowledge for each agent.
 * Handles facts, KV state, search, decay, deduplication, and parsing agent output.
 */
export class MemoryManager {
  constructor(private db: ArvisDatabase) {}

  /** Store a fact for an agent */
  saveFact(agentId: number, fact: {
    category: MemoryFact['category'];
    content: string;
    confidence?: number;
    conversationId?: number;
  }): MemoryFact {
    const result = this.db.run(
      `INSERT INTO memory_facts (agent_id, category, content, confidence, source_conversation_id)
       VALUES (?, ?, ?, ?, ?)`,
      agentId,
      fact.category,
      fact.content,
      fact.confidence ?? 1.0,
      fact.conversationId || null,
    );

    const id = Number(result.lastInsertRowid);
    log.debug({ agentId, category: fact.category, id }, 'Fact saved');
    return this.getFactById(id)!;
  }

  /** Get facts for an agent, optionally filtered */
  getFacts(agentId: number, options?: {
    category?: string;
    limit?: number;
    minConfidence?: number;
  }): MemoryFact[] {
    let sql = 'SELECT * FROM memory_facts WHERE agent_id = ?';
    const params: unknown[] = [agentId];

    if (options?.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }
    if (options?.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(options.minConfidence);
    }

    sql += ' ORDER BY confidence DESC, last_accessed DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.all<MemoryFactRow>(sql, ...params);

    // Update last_accessed for returned facts
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      this.db.run(
        `UPDATE memory_facts SET last_accessed = datetime('now'), access_count = access_count + 1
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ...ids,
      );
    }

    return rows.map(r => this.hydrateFact(r));
  }

  /** Set a KV state pair for an agent */
  setState(agentId: number, key: string, value: string): void {
    this.db.run(
      `INSERT OR REPLACE INTO memory_state (agent_id, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      agentId, key, value,
    );
    log.debug({ agentId, key }, 'State set');
  }

  /** Get state for an agent. If key provided, returns single KVPair or undefined. If no key, returns all. */
  getState(agentId: number, key?: string): KVPair | KVPair[] | undefined {
    if (key) {
      const row = this.db.get<MemoryStateRow>(
        'SELECT * FROM memory_state WHERE agent_id = ? AND key = ?',
        agentId, key,
      );
      if (!row) return undefined;
      return { key: row.key, value: row.value, updatedAt: row.updated_at };
    }

    const rows = this.db.all<MemoryStateRow>(
      'SELECT * FROM memory_state WHERE agent_id = ? ORDER BY key',
      agentId,
    );
    return rows.map(r => ({ key: r.key, value: r.value, updatedAt: r.updated_at }));
  }

  /** Delete a state key */
  deleteState(agentId: number, key: string): void {
    this.db.run(
      'DELETE FROM memory_state WHERE agent_id = ? AND key = ?',
      agentId, key,
    );
  }

  /** Search facts using FTS5 */
  searchFacts(agentId: number, query: string, limit = 10): MemoryFact[] {
    const rows = this.db.all<MemoryFactRow>(
      `SELECT mf.* FROM memory_facts mf
       JOIN memory_facts_fts fts ON fts.rowid = mf.id
       WHERE fts.content MATCH ? AND mf.agent_id = ?
       ORDER BY rank
       LIMIT ?`,
      query, agentId, limit,
    );
    return rows.map(r => this.hydrateFact(r));
  }

  /** Reduce confidence of facts not accessed recently */
  decayFacts(agentId: number, maxAgeDays: number): number {
    const result = this.db.run(
      `UPDATE memory_facts
       SET confidence = MAX(0.1, confidence * 0.9)
       WHERE agent_id = ?
         AND julianday('now') - julianday(last_accessed) > ?
         AND confidence > 0.1`,
      agentId, maxAgeDays,
    );
    if (result.changes > 0) {
      log.debug({ agentId, decayed: result.changes }, 'Facts decayed');
    }
    return result.changes;
  }

  /** Deduplicate similar facts (exact match + fuzzy similarity) */
  deduplicateFacts(agentId: number): number {
    // Phase 1: Exact content match dedup
    const dupes = this.db.all<{ content: string; cnt: number; keep_id: number }>(
      `SELECT content, COUNT(*) as cnt, MIN(id) as keep_id
       FROM memory_facts WHERE agent_id = ?
       GROUP BY content HAVING cnt > 1`,
      agentId,
    );

    let removed = 0;
    for (const dupe of dupes) {
      const result = this.db.run(
        'DELETE FROM memory_facts WHERE agent_id = ? AND content = ? AND id != ?',
        agentId, dupe.content, dupe.keep_id,
      );
      removed += result.changes;
    }

    // Phase 2: Fuzzy similarity dedup (normalized string comparison)
    const allFacts = this.db.all<MemoryFactRow>(
      'SELECT * FROM memory_facts WHERE agent_id = ? ORDER BY confidence DESC, id ASC',
      agentId,
    );

    const toDelete = new Set<number>();
    const kept = new Set<number>();

    for (let i = 0; i < allFacts.length; i++) {
      if (toDelete.has(allFacts[i].id)) continue;
      kept.add(allFacts[i].id);
      const normA = normalize(allFacts[i].content);

      for (let j = i + 1; j < allFacts.length; j++) {
        if (toDelete.has(allFacts[j].id)) continue;
        const normB = normalize(allFacts[j].content);

        // If normalized strings match, or Levenshtein distance < 15% of longer string
        if (normA === normB || isSimilar(normA, normB)) {
          toDelete.add(allFacts[j].id);
        }
      }
    }

    for (const id of toDelete) {
      this.db.run('DELETE FROM memory_facts WHERE id = ?', id);
      removed++;
    }

    if (removed > 0) {
      log.debug({ agentId, removed }, 'Duplicate facts removed');
    }
    return removed;
  }

  /**
   * Parse agent output for [MEMORY:category] and [STATE:key] tags.
   * Saves extracted data and returns what was saved.
   */
  parseAndSave(agentId: number, agentResponse: string, conversationId: number): SavedMemory[] {
    const saved: SavedMemory[] = [];

    // Parse [MEMORY:category] content
    let match: RegExpExecArray | null;
    const memRe = new RegExp(MEMORY_TAG_RE.source, MEMORY_TAG_RE.flags);
    while ((match = memRe.exec(agentResponse)) !== null) {
      const category = match[1] as MemoryFact['category'];
      const content = match[2].trim();
      this.saveFact(agentId, { category, content, conversationId });
      saved.push({ type: 'fact', category, content });
    }

    // Parse [STATE:key] value
    const stateRe = new RegExp(STATE_TAG_RE.source, STATE_TAG_RE.flags);
    while ((match = stateRe.exec(agentResponse)) !== null) {
      const key = match[1];
      const value = match[2].trim();
      this.setState(agentId, key, value);
      saved.push({ type: 'state', key, content: value });
    }

    return saved;
  }

  /** Strip [MEMORY:*] and [STATE:*] tags from agent output before showing to user */
  stripTags(text: string): string {
    return text
      .replace(/\[MEMORY:\w+\]\s*[\s\S]+?(?=\[(?:MEMORY|STATE):|$)/g, '')
      .replace(/\[STATE:\w+\]\s*[\s\S]+?(?=\[(?:MEMORY|STATE):|$)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private getFactById(id: number): MemoryFact | undefined {
    const row = this.db.get<MemoryFactRow>('SELECT * FROM memory_facts WHERE id = ?', id);
    return row ? this.hydrateFact(row) : undefined;
  }

  /** Get sticky facts for an agent (always included in system prompt) */
  getStickyFacts(agentId: number): MemoryFact[] {
    const rows = this.db.all<MemoryFactRow>(
      "SELECT * FROM memory_facts WHERE agent_id = ? AND category = 'sticky' ORDER BY confidence DESC",
      agentId,
    );
    return rows.map(r => this.hydrateFact(r));
  }

  private hydrateFact(row: MemoryFactRow): MemoryFact {
    return {
      id: row.id,
      agentId: row.agent_id,
      category: row.category as MemoryFact['category'],
      content: row.content,
      confidence: row.confidence,
      sourceConversationId: row.source_conversation_id,
      createdAt: row.created_at,
      lastAccessed: row.last_accessed,
      accessCount: row.access_count,
    };
  }
}

/** Normalize a string for fuzzy comparison */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Check if two normalized strings are similar (Levenshtein distance < 15% of longer string) */
function isSimilar(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return true;
  // Skip expensive Levenshtein for very different lengths
  if (Math.abs(a.length - b.length) > maxLen * 0.3) return false;
  const dist = levenshteinDistance(a, b);
  return dist / maxLen < 0.15;
}

/** Levenshtein distance — bounded for performance */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Bail out on very long strings to avoid O(n*m) cost
  if (a.length > 500 || b.length > 500) return Math.abs(a.length - b.length);

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = i - 1;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const cur = Math.min(prev[j] + 1, prev[j - 1] + 1, corner + cost);
      corner = prev[j];
      prev[j] = cur;
    }
  }
  return prev[b.length];
}
