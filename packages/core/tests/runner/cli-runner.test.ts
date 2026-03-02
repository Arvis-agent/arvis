import { describe, it, expect } from 'vitest';
import { CLIRunner } from '../../src/runner/cli-runner.js';
import type { Agent } from '../../src/agents/agent.js';

function makeAgent(): Agent {
  return {
    id: 1, slug: 'test', name: 'Test', role: 'developer',
    description: null, model: 'claude-sonnet-4-20250514',
    modelPrimary: null, modelFallbacks: [],
    allowedTools: ['Read', 'Write', 'Bash(git *)'], projectPath: '/home/user/project',
    systemPrompt: null, personality: null, config: null, status: 'active',
    createdBy: null, createdAt: '', updatedAt: '', channels: [],
  };
}

describe('CLIRunner', () => {
  it('can be instantiated', () => {
    const runner = new CLIRunner();
    expect(runner).toBeDefined();
    expect(runner.execute).toBeInstanceOf(Function);
  });

  it('rejects when CLI is not available', async () => {
    const runner = new CLIRunner();
    // This test verifies error handling when claude CLI isn't available
    // In CI or test environments, the CLI won't be installed
    // We just verify the runner doesn't hang and eventually rejects or resolves
    const agent = makeAgent();
    agent.projectPath = '/nonexistent/path';

    // The execute method should handle errors gracefully
    await expect(runner.execute({
      prompt: 'test',
      agent,
    })).rejects.toBeDefined();
  }, 15_000);
});
