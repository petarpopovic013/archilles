/** SDK errors can cross ESM/CJS boundaries; status codes remain stable across class identities. */
export function providerFailure(error: unknown): { code: string; retryable: boolean } {
  const value: { status?: unknown; name?: unknown; constructor?: { name?: unknown }; error?: unknown } = error !== null && typeof error === 'object' ? error : {};
  const status = typeof value.status === 'number' && Number.isInteger(value.status) ? value.status : undefined;
  const payload = value.error !== null && typeof value.error === 'object' ? value.error as Record<string, unknown> : {};
  const nested = payload.error !== null && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : {};
  const detail = typeof value.error === 'string' ? value.error : typeof nested.message === 'string' ? nested.message : typeof payload.message === 'string' ? payload.message : '';
  // This gateway uses 503 for an unsupported model. Retrying the same model cannot resolve it.
  if (status === 503 && /isn['’]t available on mozaik cloud yet/i.test(detail)) return { code: 'PROVIDER_MODEL_UNAVAILABLE', retryable: false };
  if(status===400&&/grammar is too large|schema is too complex/i.test(detail))return {code:'VISION_SCHEMA_TOO_COMPLEX',retryable:false};
  if (status === 401 || status === 403) return { code: 'PROVIDER_AUTH', retryable: false };
  if (status === 404) return { code: 'PROVIDER_MODEL_OR_ENDPOINT_NOT_FOUND', retryable: false };
  if (status === 429) return { code: 'PROVIDER_RATE_LIMITED', retryable: true };
  if (status !== undefined && status >= 500 && status <= 599) return { code: 'PROVIDER_UNAVAILABLE', retryable: true };
  if ([value.name, value.constructor?.name].some(name => name === 'APIConnectionError' || name === 'APIConnectionTimeoutError')) {
    // Node fetch wraps DNS/TLS/socket failures in one or more causes. Inspect codes only;
    // messages may contain private gateway URLs or credentials.
    let cause: unknown = error;
    const seen = new Set<unknown>();
    while (cause && typeof cause === 'object' && !seen.has(cause)) {
      seen.add(cause);
      const entry = cause as { code?: unknown; cause?: unknown };
      if (entry.code === 'ENOTFOUND' || entry.code === 'EAI_AGAIN') return { code: 'PROVIDER_DNS_FAILED', retryable: entry.code === 'EAI_AGAIN' };
      if (typeof entry.code === 'string' && /CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(entry.code)) return { code: 'PROVIDER_TLS_FAILED', retryable: false };
      if (entry.code === 'ECONNREFUSED') return { code: 'PROVIDER_CONNECTION_REFUSED', retryable: true };
      if (entry.code === 'ETIMEDOUT' || entry.code === 'UND_ERR_CONNECT_TIMEOUT') return { code: 'PROVIDER_TIMEOUT', retryable: true };
      cause = entry.cause;
    }
    if (value.name === 'APIConnectionTimeoutError') return { code: 'PROVIDER_TIMEOUT', retryable: true };
    return { code: 'PROVIDER_UNREACHABLE', retryable: true };
  }
  return { code: 'PROVIDER_REJECTED', retryable: false };
}
