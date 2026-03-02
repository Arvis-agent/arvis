import type { ArvisDatabase } from '../db/database.js';
import type { MemoryManager } from '../memory/memory-manager.js';
import type { ConversationManager } from './conversation-manager.js';
import type { Agent } from '../agents/agent.js';
import type { Conversation, Message } from './types.js';
import type { MemoryFact, KVPair } from '../memory/types.js';
import type { IncomingMessage } from '../bus/types.js';
import { estimateTokens } from '../lib/token-utils.js';
import { createLogger } from '../logger.js';

const log = createLogger('context-builder');

/** Known model context windows (tokens) */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic Claude 4.x
  'claude-opus-4-6':            200_000,
  'claude-sonnet-4-6':          200_000,
  'claude-haiku-4-5-20251001':  200_000,
  'claude-opus-4-5-20251101':   200_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-sonnet-4-20250514':   200_000,
  'claude-opus-4-20250514':     200_000,
  // OpenAI
  'gpt-4.1':      1_000_000,
  'gpt-4.1-mini': 1_000_000,
  'gpt-4.1-nano': 1_000_000,
  'gpt-4o-mini':    128_000,
  'o3':             200_000,
  'o4-mini':        200_000,
  // Google Gemini
  'gemini-2.5-pro':   1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
};

const DEFAULT_CONTEXT_WINDOW = 200_000;
const RESERVE_TOKENS = 20_000; // Headroom for output + prompt overhead

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
export class ContextBuilder {
  constructor(
    private db: ArvisDatabase,
    private memoryManager: MemoryManager,
    private conversationManager: ConversationManager,
  ) {}

  /**
   * Build the full context for an agent response.
   * Budget is model-aware: contextWindow - reserveTokens.
   */
  build(agent: Agent, conversation: Conversation, currentMessage: IncomingMessage): BuiltContext {
    const contextWindow = MODEL_CONTEXT_WINDOWS[agent.model] || DEFAULT_CONTEXT_WINDOW;
    const budgetTokens = contextWindow - RESERVE_TOKENS;
    let remainingTokens = budgetTokens;

    // --- Layer 1: Sticky facts (always present, never trimmed) ---
    const stickyFacts = this.memoryManager.getStickyFacts(agent.id);
    const stickyText = stickyFacts.length > 0
      ? stickyFacts.map(f => `- ${f.content}`).join('\n')
      : '';
    remainingTokens -= estimateTokens(stickyText);

    // --- Layer 2: System prompt (static content first for cache friendliness) ---
    const facts = this.memoryManager.getFacts(agent.id, { limit: 20 });
    const state = this.getStateArray(agent.id);
    const systemPrompt = this.buildSystemPrompt(agent, facts, state, stickyFacts);
    remainingTokens -= estimateTokens(systemPrompt);

    // --- Layer 3: Compaction summaries (from compactions table, last 3) ---
    const summaries = this.conversationManager.getRecentSummaries(conversation.id, 3);
    const summaryText = this.formatSummaries(summaries);
    remainingTokens -= estimateTokens(summaryText);

    // --- Layer 4: Facts text (for reference/debugging) ---
    const factsText = this.formatFacts(facts);

    // --- Layer 5: State text (for reference/debugging) ---
    const stateText = this.formatState(state);

    // --- Layer 6: Recent messages (fill remaining token budget) ---
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
  buildSystemPrompt(agent: Agent, facts: MemoryFact[], state: KVPair[], stickyFacts?: MemoryFact[]): string {
    // Conductor has its own complete system prompt — don't wrap it
    if (agent.role === 'conductor' && agent.systemPrompt) {
      return agent.systemPrompt;
    }

    const parts: string[] = [];

    // === STATIC SECTION (cacheable) ===

    // Identity — explicit override to prevent model's default persona bleeding through
    parts.push(`IDENTITY: You are ${agent.name}, an AI agent running on the Arvis platform.`);
    parts.push(`You are NOT Claude and you do NOT identify as Claude. You are ${agent.name}.`);
    parts.push(`If anyone asks who you are, say you are ${agent.name}. Never say "I'm Claude" or "I'm an AI assistant made by Anthropic".`);
    parts.push(`You ARE connected to the messaging platform this conversation is on — you can send messages, you have full access to tools, and you are fully operational.`);
    if (agent.description) parts.push(`\nPurpose: ${agent.description}`);

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

    // Tool hints — only show if the agent has built-in tools enabled
    const builtInToolNames = ['web_search', 'calculate', 'get_time', 'http_fetch'];
    const agentBuiltInTools = (agent.allowedTools || []).filter(t => builtInToolNames.includes(t));
    if (agentBuiltInTools.length > 0) {
      parts.push(`\nTOOLS AVAILABLE (call via structured function calling): ${agentBuiltInTools.join(', ')}`);
      if (agentBuiltInTools.includes('web_search')) parts.push('- web_search(query): search the web');
      if (agentBuiltInTools.includes('calculate')) parts.push('- calculate(expression): evaluate math');
      if (agentBuiltInTools.includes('get_time')) parts.push('- get_time(): get current date/time');
      if (agentBuiltInTools.includes('http_fetch')) parts.push('- http_fetch(url): fetch a URL');
    }

    // Delegation hint (all non-conductor agents)
    parts.push('\nDELEGATION: To delegate a subtask to another agent, include [DELEGATE:agent-slug] task [/DELEGATE] in your response.');

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
  getCompactionThreshold(model: string): number {
    const contextWindow = MODEL_CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
    return Math.floor(contextWindow * 0.75);
  }

  private getStateArray(agentId: number): KVPair[] {
    const stateResult = this.memoryManager.getState(agentId);
    return Array.isArray(stateResult) ? stateResult : stateResult ? [stateResult] : [];
  }

  private formatFacts(facts: MemoryFact[]): string {
    if (facts.length === 0) return '';
    return facts.map(f => `- [${f.category}] ${f.content}`).join('\n');
  }

  private formatState(state: KVPair[]): string {
    if (state.length === 0) return '';
    return state.map(s => `${s.key}: ${s.value}`).join('\n');
  }

  private formatSummaries(summaries: { summary: string; createdAt: string }[]): string {
    if (summaries.length === 0) return '';
    return summaries.map(s => `[Previous context — ${s.createdAt}]\n${s.summary}`).join('\n---\n');
  }

  private getMessagesFitting(conversationId: number, maxTokens: number): Message[] {
    const messages = this.conversationManager.getHistory(conversationId)
      // Skip corrupted messages: system prompt bleed-through from old CLI runner format
      .filter(m =>
        m.role !== 'system' &&
        !m.content.startsWith('<instructions>') &&
        !m.content.startsWith('[user]:') &&
        !m.content.startsWith('[assistant]:'),
      );
    const result: Message[] = [];
    let totalTokens = 0;

    // Work backwards from newest
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = messages[i].tokenEstimate;
      if (totalTokens + msgTokens > maxTokens) break;
      totalTokens += msgTokens;
      result.unshift(messages[i]);
    }

    return result;
  }
}
