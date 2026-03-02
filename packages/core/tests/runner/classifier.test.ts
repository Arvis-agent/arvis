import { describe, it, expect } from 'vitest';
import { classifyComplexity } from '../../src/runner/classifier.js';
import type { Agent } from '../../src/agents/agent.js';

function makeAgent(tools: string[] = ['Read', 'Write', 'Bash(*)']): Agent {
  return {
    id: 1, slug: 'test', name: 'Test', role: 'developer',
    description: null, model: 'claude-sonnet-4-20250514',
    modelPrimary: null, modelFallbacks: [],
    allowedTools: tools, projectPath: null, systemPrompt: null,
    personality: null, config: null, status: 'active',
    createdBy: null, createdAt: '', updatedAt: '', channels: [],
  };
}

describe('classifyComplexity', () => {
  it('returns full for action words', () => {
    expect(classifyComplexity('create a new component', makeAgent(), true)).toBe('full');
    expect(classifyComplexity('fix the login bug', makeAgent(), true)).toBe('full');
    expect(classifyComplexity('deploy to production', makeAgent(), true)).toBe('full');
    expect(classifyComplexity('edit the config file', makeAgent(), true)).toBe('full');
    expect(classifyComplexity('install the dependencies', makeAgent(), true)).toBe('full');
  });

  it('returns fast for question words', () => {
    expect(classifyComplexity('what is TypeScript?', makeAgent(), true)).toBe('fast');
    expect(classifyComplexity('how does React work?', makeAgent(), true)).toBe('fast');
    expect(classifyComplexity('explain promises', makeAgent(), true)).toBe('fast');
  });

  it('returns fast for short messages', () => {
    expect(classifyComplexity('hi', makeAgent(), true)).toBe('fast');
    expect(classifyComplexity('thanks', makeAgent(), true)).toBe('fast');
  });

  it('returns fast when agent has no tools', () => {
    expect(classifyComplexity('create a component', makeAgent([]), true)).toBe('fast');
  });

  it('returns full when no API account available', () => {
    expect(classifyComplexity('what is TypeScript?', makeAgent(), false)).toBe('full');
  });

  it('defaults to full for ambiguous long messages without clear patterns', () => {
    // This message is >100 chars and doesn't match fast patterns
    expect(classifyComplexity('The system needs to be ready for the upcoming release on Friday with all the necessary preparations in place for the transition period', makeAgent(), true)).toBe('full');
  });
});
