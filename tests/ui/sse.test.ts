import assert from "node:assert/strict";
import test from "node:test";
import { createSseParser, followEvents } from "../../src/ui/api/sse";

const event = (sequence: number) => ({
  id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
  sessionId: "00000000-0000-4000-8000-0000000000aa",
  projectRevision: 1,
  sequence,
  type: "analysis.started",
  producerId: "00000000-0000-4000-8000-0000000000bb",
  payload: {},
  occurredAt: "2026-10-30T12:00:00.000Z",
});

test("the SSE parser reads id-first events, split chunks, CRLF, and skips heartbeats", () => {
  const parse = createSseParser();
  assert.deepEqual(parse(": heartbeat\n\nid: 4\r\ndata: {\"a\":"), []);
  assert.deepEqual(parse("1}\r\n\r\nid: 5\ndata: x\ndata: y\n\n"), [{ id: "4", data: "{\"a\":1}" }, { id: "5", data: "x\ny" }]);
});

test("following events resumes after the last sequence and never repeats one", async () => {
  const urls: string[] = [];
  const received: number[] = [];
  let calls = 0;
  const fetchFn = (async (url: string) => {
    urls.push(url);
    calls += 1;
    const body = calls === 1
      ? `id: 1\ndata: ${JSON.stringify(event(1))}\n\nid: 2\ndata: ${JSON.stringify(event(2))}\n\n`
      : `id: 2\ndata: ${JSON.stringify(event(2))}\n\nid: 3\ndata: ${JSON.stringify(event(3))}\n\n`;
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  const stop = followEvents((after) => `/events?after=${after}`, fetchFn, { onEvent: (e) => received.push(e.sequence) });
  while (received.length < 3) await new Promise((resolve) => setTimeout(resolve, 20));
  stop();
  assert.deepEqual(received, [1, 2, 3]);
  assert.deepEqual(urls.slice(0, 2), ["/events?after=0", "/events?after=2"]);
});
