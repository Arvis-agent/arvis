/** Simple token estimator: ~3.5 chars per token for English text */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
