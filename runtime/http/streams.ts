import type http from "node:http";
import type { RuntimeContext } from "../context";
import { listSessionEvents } from "../participants/observer";
import { MAX_UPLOAD_BYTES } from "../services/drawings";
import { ApiFailure } from "./errors";

const HEARTBEAT_MS = 15_000;
/** The file limit plus room for multipart boundaries and small text fields. */
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

/**
 * Ordered SSE stream of persisted agent events: replays everything after `after`
 * (or Last-Event-ID), then follows live events. `id:` is the per-session sequence.
 * Heartbeats are comments and never appear as agent activity.
 */
export function streamSessionEvents(
  ctx: RuntimeContext,
  sessionId: string,
  after: number,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  let last = after;
  const send = (event: { sequence: number }) => {
    if (event.sequence <= last) return;
    last = event.sequence;
    res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  // Replay and subscribe run synchronously, so no event can fall between them.
  for (const event of listSessionEvents(ctx.db, sessionId, after)) send(event);
  const unsubscribe = ctx.hub.subscribe(sessionId, send);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), HEARTBEAT_MS);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

/** Parses multipart/form-data with Node's WHATWG Request, refusing bodies over the upload limit. */
export async function readMultipart(req: http.IncomingMessage): Promise<FormData> {
  const type = req.headers["content-type"] ?? "";
  if (!type.startsWith("multipart/form-data")) {
    throw new ApiFailure(415, "UNSUPPORTED_MEDIA_TYPE", "Expected multipart/form-data");
  }
  if (Number(req.headers["content-length"] ?? 0) > MAX_MULTIPART_BYTES) {
    throw new ApiFailure(413, "FILE_TOO_LARGE", "Drawings are limited to 20 MiB");
  }
  let size = 0;
  let tooLarge = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of req) {
          size += (chunk as Buffer).length;
          if (size > MAX_MULTIPART_BYTES) {
            tooLarge = true;
            throw new Error("too large");
          }
          controller.enqueue(new Uint8Array(chunk as Buffer));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  try {
    return await new Request("http://runtime.local/upload", {
      method: "POST",
      headers: { "content-type": type },
      body,
      duplex: "half",
    } as RequestInit).formData();
  } catch {
    if (tooLarge) throw new ApiFailure(413, "FILE_TOO_LARGE", "Drawings are limited to 20 MiB");
    throw new ApiFailure(422, "INVALID_MULTIPART", "The upload body could not be read");
  }
}
