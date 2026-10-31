import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../runtime/config';
import { providerFailure } from '../src/vision/provider-errors';

const advice: Record<string, string> = {
  PROVIDER_AUTH: 'Check that ANTHROPIC_API_KEY belongs to the configured endpoint. Gateway keys require the gateway ANTHROPIC_BASE_URL.',
  PROVIDER_DNS_FAILED: 'Check ANTHROPIC_BASE_URL spelling and this laptop DNS/VPN connection.',
  PROVIDER_TLS_FAILED: 'Check the laptop clock and trusted certificates. For a corporate proxy, set NODE_EXTRA_CA_CERTS to its trusted CA file. Keep TLS verification enabled.',
  PROVIDER_CONNECTION_REFUSED: 'Check the endpoint, firewall and VPN. A localhost endpoint must have a provider running on this laptop.',
  PROVIDER_TIMEOUT: 'Check network access, VPN and proxy settings for this laptop.',
  PROVIDER_UNREACHABLE: 'Check network access and ANTHROPIC_BASE_URL. If a proxy is required, configure Node proxy support for your installed Node version.',
  PROVIDER_MODEL_OR_ENDPOINT_NOT_FOUND: 'Check ANTHROPIC_BASE_URL and the configured model names.',
  PROVIDER_MODEL_UNAVAILABLE: 'The gateway does not support this model; select a model it supports.',
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.ANTHROPIC_AUTH_TOKEN?.trim()) {
    console.error('PROVIDER_KEY_MISSING: copy .env.example to .env and configure this laptop. Never commit or share keys.');
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  const client = new Anthropic({ maxRetries: 0 });
  const endpoint = new URL(client.baseURL);
  // Deliberately omit URL credentials, query strings and private path segments.
  console.log(JSON.stringify({ node: process.version, providerHost: endpoint.hostname, customEndpoint: !!process.env.ANTHROPIC_BASE_URL }));
  for (const model of new Set([config.visionModel, config.reviewModel])) {
    try {
      await client.messages.create({ model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK.' }] }, { timeout: 15_000, maxRetries: 0 });
      console.log(`${model}: PROVIDER_OK`);
    } catch (error) {
      const { code } = providerFailure(error);
      console.error(`${model}: ${code}. ${advice[code] ?? 'The provider rejected this request; check its service status and account limits.'}`);
      process.exitCode = 1;
    }
  }
}

main().catch(() => {
  console.error('PROVIDER_CONFIG_INVALID: check .env endpoint, model and runtime settings.');
  process.exitCode = 1;
});
