import http from "node:http";
import type { z } from "zod";
import { ApiFailure, invalidInput } from "./errors";

const MAX_JSON_BYTES = 1024 * 1024;

export interface RouteRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  raw: http.IncomingMessage;
  /** Parses and validates a JSON body; a schema failure becomes 422 INVALID_INPUT. */
  json<S extends z.ZodType>(schema: S): Promise<z.output<S>>;
}

/** A route returns a JSON-serializable value, or takes over the response itself (SSE, binary). */
export type RouteHandler = (request: RouteRequest, response: http.ServerResponse) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  status: number;
  handler: RouteHandler;
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler, status = 200): this {
    const keys: string[] = [];
    const source = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      keys.push(key);
      return "([^/]+)";
    });
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), keys, status, handler });
    return this;
  }

  async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://runtime.local");
      const matches = this.routes.filter((route) => route.pattern.test(url.pathname));
      if (matches.length === 0) throw new ApiFailure(404, "NOT_FOUND", "Route not found");
      const route = matches.find((candidate) => candidate.method === req.method);
      if (!route) throw new ApiFailure(405, "METHOD_NOT_ALLOWED", "Method not allowed");

      const values = route.pattern.exec(url.pathname)!.slice(1);
      const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(values[index])]));
      const result = await route.handler({
        params,
        query: url.searchParams,
        headers: req.headers,
        raw: req,
        json: (schema) => readJson(req, schema),
      }, res);
      if (!res.headersSent) sendJson(res, route.status, result);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const failure = error instanceof ApiFailure
        ? error
        : new ApiFailure(500, "INTERNAL_ERROR", "Unexpected runtime error", true);
      if (!(error instanceof ApiFailure)) {
        console.error(`[runtime] ${req.method} ${new URL(req.url ?? "/", "http://runtime.local").pathname} failed: ${error instanceof Error ? error.name : "unknown"}`);
      }
      sendJson(res, failure.status, failure.toBody());
    }
  }
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body ?? null);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJson<S extends z.ZodType>(req: http.IncomingMessage, schema: S): Promise<z.output<S>> {
  if (!req.headers["content-type"]?.includes("application/json")) {
    throw new ApiFailure(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_JSON_BYTES) throw new ApiFailure(413, "PAYLOAD_TOO_LARGE", "JSON body too large");
    chunks.push(chunk as Buffer);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiFailure(422, "INVALID_JSON", "Body is not valid JSON");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidInput(parsed.error);
  return parsed.data;
}

export function createHttpServer(router: Router): http.Server {
  return http.createServer((req, res) => {
    void router.handle(req, res);
  });
}
