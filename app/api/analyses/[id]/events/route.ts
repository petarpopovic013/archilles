import { apiContracts } from "@/src/domain";
import { errorResponse, proxyStream, runtimePath } from "../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };

/** Stored agent events as SSE; `after` or Last-Event-ID resumes. Closing the client closes upstream. */
export async function GET(request: Request, { params }: Context) {
  const after = new URL(request.url).searchParams.get("after") ?? "0";
  if (!/^\d+$/.test(after)) {
    return errorResponse(422, { code: "INVALID_INPUT", message: "`after` must be a non-negative integer", retryable: false });
  }
  const lastEventId = request.headers.get("last-event-id");
  const path = `${runtimePath(apiContracts.streamEvents.path, await params)}?after=${after}`;
  return proxyStream(request, path, {
    headers: lastEventId && /^\d+$/.test(lastEventId) ? { "last-event-id": lastEventId } : {},
  });
}
