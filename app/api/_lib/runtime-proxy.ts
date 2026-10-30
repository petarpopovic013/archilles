import type { z } from "zod";
import { ApiErrorSchema, type ApiError } from "@/src/domain";

/**
 * Same-origin facade over the persistent runtime (Tech.MD ADR-01). Next never opens SQLite or
 * holds secrets; it validates request/response shapes against the shared C0 schemas and forwards.
 */
const runtimeUrl = () => process.env.ARCHILLES_RUNTIME_URL ?? "http://127.0.0.1:4317";

const noStore = { "cache-control": "no-store" };

export function errorResponse(status: number, body: ApiError): Response {
  return Response.json(body, { status, headers: noStore });
}

export function runtimePath(template: string, params: Record<string, string>): string {
  return template.replace(/:([a-zA-Z]+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ""));
}

interface ProxyJsonOptions {
  request?: z.ZodType;
  response: z.ZodType;
}

export async function proxyJson(request: Request, path: string, options: ProxyJsonOptions): Promise<Response> {
  let body: string | undefined;
  if (options.request) {
    body = await request.text();
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      return errorResponse(422, { code: "INVALID_JSON", message: "Body is not valid JSON", retryable: false });
    }
    const parsed = options.request.safeParse(value);
    if (!parsed.success) {
      return errorResponse(422, {
        code: "INVALID_INPUT",
        message: "Request validation failed",
        retryable: false,
        details: { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
      });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(new URL(path, runtimeUrl()), {
      method: request.method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    return errorResponse(503, { code: "RUNTIME_UNAVAILABLE", message: "Analysis runtime is not reachable", retryable: true });
  }

  const payload: unknown = await upstream.json().catch(() => undefined);
  if (!upstream.ok) {
    const error = ApiErrorSchema.safeParse(payload);
    return errorResponse(upstream.status, error.success
      ? error.data
      : { code: "RUNTIME_ERROR", message: "Runtime returned an invalid error", retryable: upstream.status >= 500 });
  }
  const valid = options.response.safeParse(payload);
  if (!valid.success) {
    return errorResponse(502, { code: "RUNTIME_CONTRACT_MISMATCH", message: "Runtime response violated the API contract", retryable: false });
  }
  return Response.json(valid.data, { status: upstream.status, headers: noStore });
}
