/**
 * Anthropic first-party list prices in USD per million tokens (claude-api reference, cached
 * 2026-10-06). Used only for the local cost ledger; re-check before relying on totals.
 * Haiku 5.5 is priced for prompts up to 100K tokens, which covers every request we send.
 */
const pricesPerMillion: Readonly<Record<string, { input: number; output: number }>> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function isPricedModel(model: string): boolean {
  return Object.hasOwn(pricesPerMillion, model);
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = pricesPerMillion[model];
  if (!price) throw new Error(`UNPRICED_MODEL:${model}`);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
