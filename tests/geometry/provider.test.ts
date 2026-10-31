import assert from 'node:assert/strict';
import test from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { createClaudeVisionRunner } from '../../src/vision/claude';
import { providerFailure } from '../../src/vision/provider-errors';
import { plainRaster } from './raster';

test('provider error classification works across SDK module boundaries without exposing messages', () => {
  assert.deepEqual(providerFailure({ status: 503, message: 'private' }), { code: 'PROVIDER_UNAVAILABLE', retryable: true });
  assert.equal(providerFailure({ status: 401 }).code, 'PROVIDER_AUTH');
  assert.equal(providerFailure({ status: 404 }).code, 'PROVIDER_MODEL_OR_ENDPOINT_NOT_FOUND');
  assert.equal(providerFailure({ status: 429 }).retryable, true);
  assert.equal(providerFailure({ status: '503' }).retryable, false);
});

test('connection failures report safe actionable causes across nested Node fetch errors', () => {
  for (const [code, expected, retryable] of [
    ['ENOTFOUND', 'PROVIDER_DNS_FAILED', false],
    ['EAI_AGAIN', 'PROVIDER_DNS_FAILED', true],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'PROVIDER_TLS_FAILED', false],
    ['CERT_HAS_EXPIRED', 'PROVIDER_TLS_FAILED', false],
    ['ECONNREFUSED', 'PROVIDER_CONNECTION_REFUSED', true],
    ['UND_ERR_CONNECT_TIMEOUT', 'PROVIDER_TIMEOUT', true],
  ] as const) {
    assert.deepEqual(providerFailure({ name: 'APIConnectionError', cause: { cause: { code, message: 'secret' } } }), { code: expected, retryable });
  }
  assert.equal(providerFailure({ name: 'APIConnectionTimeoutError' }).code, 'PROVIDER_TIMEOUT');
  assert.equal(providerFailure({ name: 'APIConnectionError' }).code, 'PROVIDER_UNREACHABLE');
});

test('gateway 503 gets one retry; authentication and model errors do not', async () => {
  for (const [status, expectedCalls, code] of [[503, 2, 'VISION_UNAVAILABLE'], [401, 1, 'PROVIDER_AUTH'], [404, 1, 'PROVIDER_MODEL_OR_ENDPOINT_NOT_FOUND']] as const) {
    let calls = 0;
    const client = { messages: { create: async () => { calls++; throw Object.assign(new Error('private gateway response'), { status }); } } } as unknown as Anthropic;
    await assert.rejects(createClaudeVisionRunner(client, 'configured-model').run(await plainRaster(800, 600), 800, 600), error => error instanceof Error && error.message === code);
    assert.equal(calls, expectedCalls);
  }
});

test('truncation and refusal have explicit codes without blind retries', async () => {
  for (const [reason, code] of [['max_tokens', 'VISION_OUTPUT_TRUNCATED'], ['refusal', 'VISION_REFUSED']] as const) {
    let calls = 0;
    const client = { messages: { create: async () => { calls++; return { stop_reason: reason, usage: { input_tokens: 10, output_tokens: 20 } }; } } } as unknown as Anthropic;
    await assert.rejects(createClaudeVisionRunner(client, 'configured-model').run(await plainRaster(800, 600), 800, 600), new RegExp(code));
    assert.equal(calls, 1);
  }
});

test('billable schema-invalid answers retain token usage and are never retried', async () => {
  let calls = 0;
  const client = { messages: { create: async () => { calls++; return { stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: '{invalid' }] }; } } } as unknown as Anthropic;
  await assert.rejects(createClaudeVisionRunner(client, 'configured-model').run(await plainRaster(800, 600), 800, 600), error => {
    const value = error as { code?: string; usage?: { inputTokens: number; outputTokens: number } };
    return value.code === 'VISION_SCHEMA_INVALID' && value.usage?.inputTokens === 100 && value.usage.outputTokens === 50;
  });
  assert.equal(calls, 1);
});

test('Mozaik unsupported-model 503 is actionable and is not treated as a transient outage', async () => {
  const error = Object.assign(new Error('private gateway response'), {
    status: 503,
    error: { error: { type: 'api_error', message: "claude-opus-5-5 isn't available on Mozaik Cloud yet — pick another model" } },
  });
  assert.deepEqual(providerFailure(error), { code: 'PROVIDER_MODEL_UNAVAILABLE', retryable: false });
  let calls = 0;
  const client = { messages: { create: async () => { calls++; throw error; } } } as unknown as Anthropic;
  await assert.rejects(createClaudeVisionRunner(client, 'unsupported-model').run(await plainRaster(800, 600), 800, 600), /PROVIDER_MODEL_UNAVAILABLE/);
  assert.equal(calls, 1);
});
