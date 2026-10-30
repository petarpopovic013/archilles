import { UploadDrawingResponseSchema, apiContracts } from "@/src/domain";
import { errorResponse, proxyStream, runtimePath } from "../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const MAX_BODY_BYTES = 20 * 1024 * 1024 + 64 * 1024;

/** Streams the multipart upload to the runtime, which validates the file signature and bytes. */
export async function POST(request: Request, { params }: Context) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) {
    return errorResponse(415, { code: "UNSUPPORTED_MEDIA_TYPE", message: "Expected multipart/form-data", retryable: false });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return errorResponse(413, { code: "FILE_TOO_LARGE", message: "Drawings are limited to 20 MiB", retryable: false });
  }
  const upstream = await proxyStream(request, runtimePath(apiContracts.uploadDrawing.path, await params), {
    body: request.body,
    headers: { "content-type": type },
  });
  if (!upstream.ok) return upstream;
  const parsed = UploadDrawingResponseSchema.safeParse(await upstream.json());
  if (!parsed.success) {
    return errorResponse(502, { code: "RUNTIME_CONTRACT_MISMATCH", message: "Runtime response violated the API contract", retryable: false });
  }
  return Response.json(parsed.data, { status: upstream.status, headers: { "cache-control": "no-store" } });
}
