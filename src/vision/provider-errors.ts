/** SDK errors can cross ESM/CJS boundaries; status codes remain stable across class identities. */
export function providerFailure(error: unknown): { code: string; retryable: boolean } {
  const value: { status?: unknown; name?: unknown; constructor?: { name?: unknown } } = error !== null && typeof error === 'object' ? error : {};
  const status = typeof value.status === 'number' && Number.isInteger(value.status) ? value.status : undefined;
  if (status === 401 || status === 403) return { code: 'PROVIDER_AUTH', retryable: false };
  if (status === 404) return { code: 'PROVIDER_MODEL_OR_ENDPOINT_NOT_FOUND', retryable: false };
  if (status === 429) return { code: 'PROVIDER_RATE_LIMITED', retryable: true };
  if (status !== undefined && status >= 500 && status <= 599) return { code: 'PROVIDER_UNAVAILABLE', retryable: true };
  if ([value.name, value.constructor?.name].some(name => name === 'APIConnectionError' || name === 'APIConnectionTimeoutError')) return { code: 'PROVIDER_UNREACHABLE', retryable: true };
  return { code: 'PROVIDER_REJECTED', retryable: false };
}
