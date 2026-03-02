import type { Agent } from '../agents/agent.js';
/**
 * Classifies whether a message needs full CLI execution (with tools)
 * or can be handled by the fast API mode (no tools, quick response).
 */
export declare function classifyComplexity(message: string, agent: Agent, hasApiAccount: boolean): 'fast' | 'full';
//# sourceMappingURL=classifier.d.ts.map