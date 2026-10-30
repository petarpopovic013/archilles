import { AgentEventSchema, type AgentEvent } from "../../domain";

/**
 * Incremental Server-Sent Events parser. Feed it text chunks; it returns complete events and
 * keeps the unfinished tail. Handles `id:`/`data:` lines in any order, multi-line data, CRLF,
 * and ignores comments (`: heartbeat`).
 */
export function createSseParser() {
  let buffer = "";
  return (chunk: string): { id?: string; data: string }[] => {
    buffer += chunk.replace(/\r\n?/g, "\n");
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    const events: { id?: string; data: string }[] = [];
    for (const block of blocks) {
      let id: string | undefined;
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "id") id = value;
        else if (field === "data") data.push(value);
      }
      if (data.length > 0) events.push({ id, data: data.join("\n") });
    }
    return events;
  };
}

export interface EventSubscription {
  onEvent(event: AgentEvent): void;
  onError?(error: Error): void;
  /** Resume after this sequence; defaults to 0 (full replay). */
  after?: number;
}

/**
 * Follows an analysis's stored event stream. Reconnects after a dropped connection, resuming
 * from the last sequence seen, and never delivers a sequence twice. Returns an unsubscribe.
 */
export function followEvents(url: (after: number) => string, fetchFn: typeof fetch, subscription: EventSubscription): () => void {
  const controller = new AbortController();
  let last = subscription.after ?? 0;

  const run = async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetchFn(url(last), { signal: controller.signal, headers: { accept: "text/event-stream" } });
        if (!response.ok || !response.body) throw new Error(`Event stream unavailable (HTTP ${response.status})`);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const parse = createSseParser();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const message of parse(value)) {
            const event = AgentEventSchema.parse(JSON.parse(message.data));
            if (event.sequence <= last) continue;
            last = event.sequence;
            subscription.onEvent(event);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        subscription.onError?.(error instanceof Error ? error : new Error("Event stream failed"));
      }
      if (!controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  };
  void run();
  return () => controller.abort();
}
