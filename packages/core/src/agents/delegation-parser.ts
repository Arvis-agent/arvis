/**
 * Multi-agent delegation parser.
 *
 * Agents can delegate subtasks by including markers in their response:
 *
 *   [DELEGATE:agent-slug] task description here [/DELEGATE]
 *
 * Delegation is fire-and-forget: the main agent's response is sent
 * immediately; the sub-agent's result arrives later in the same channel.
 *
 * Example:
 *   Let me research that for you.
 *   [DELEGATE:researcher] What is the current USD/EUR exchange rate? [/DELEGATE]
 *   I'll share the findings once the researcher gets back to us.
 */

export interface DelegationRequest {
  agentSlug: string;
  task: string;
}

/** Regex that matches [DELEGATE:slug] ... [/DELEGATE] (multi-line) */
const DELEGATE_RE = /\[DELEGATE:([a-z0-9_-]+)\]([\s\S]*?)\[\/DELEGATE\]/gi;

/** Extract all delegation requests from a response string */
export function parseDelegations(text: string): DelegationRequest[] {
  const results: DelegationRequest[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex before each use (RegExp is stateful)
  DELEGATE_RE.lastIndex = 0;

  while ((match = DELEGATE_RE.exec(text)) !== null) {
    const slug = match[1].trim();
    const task = match[2].trim();
    if (slug && task) {
      results.push({ agentSlug: slug, task });
    }
  }

  return results;
}

/** Remove all delegation markers from a response string */
export function stripDelegations(text: string): string {
  return text
    .replace(/\[DELEGATE:[a-z0-9_-]+\][\s\S]*?\[\/DELEGATE\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')  // Collapse excess blank lines
    .trim();
}
