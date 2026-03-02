import { ToolExecutor } from '../tools/tool-executor.js';
import { createLogger } from '../logger.js';

const log = createLogger('tool-loop');
const toolExecutor = new ToolExecutor();

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface ParsedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ParsedResponse {
  text: string;
  toolCalls: ParsedToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  /** Raw assistant turn (opaque — passed back to appendTurns) */
  raw: unknown;
}

/**
 * Provider adapter interface.
 * Each provider implements this to plug into the shared tool loop.
 * The adapter owns its mutable message state internally (closure).
 */
export interface ProviderAdapter {
  /** Make one API call and return the raw response */
  callApi(): Promise<unknown>;
  /** Extract text, tool calls, usage from the raw response */
  parseResponse(resp: unknown): ParsedResponse;
  /** Append assistant turn + tool results to the message history */
  appendTurns(rawAssistant: unknown, toolResults: { id: string; name: string; result: string }[]): void;
}

export interface ToolLoopResult {
  content: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  finalModel: string;
}

// ─── Shared tool-calling loop ─────────────────────────────────────────────────

/**
 * Drives the multi-turn tool-calling loop for any provider.
 * The adapter supplies provider-specific API calls and message formatting.
 * Zero duplication — adding a new provider = one new adapter file.
 */
export async function executeToolLoop(
  adapter: ProviderAdapter,
  initialModel: string,
  maxTurns: number,
): Promise<ToolLoopResult> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalContent = '';
  let finalModel = initialModel;

  for (let turn = 0; turn <= maxTurns; turn++) {
    const resp = await adapter.callApi();
    const parsed = adapter.parseResponse(resp);

    totalInputTokens += parsed.usage.inputTokens;
    totalOutputTokens += parsed.usage.outputTokens;
    if (parsed.model) finalModel = parsed.model;

    // No tool calls (or turn limit reached) — we're done
    if (!parsed.toolCalls.length || turn >= maxTurns) {
      finalContent = parsed.text;
      break;
    }

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      parsed.toolCalls.map(async (tc) => {
        const result = await toolExecutor.execute(tc.name, tc.input);
        log.debug({ tool: tc.name, resultLength: result.length }, 'Tool executed');
        return { id: tc.id, name: tc.name, result };
      }),
    );

    // Append assistant turn + results to message history
    adapter.appendTurns(parsed.raw, toolResults);
  }

  return { content: finalContent, totalInputTokens, totalOutputTokens, finalModel };
}
