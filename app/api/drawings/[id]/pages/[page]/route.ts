import { apiContracts } from "@/src/domain";
import { proxyStream, runtimePath } from "../../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string; page: string }> };

/** The prepared page raster; its pixels are the source coordinate frame for overlays. */
export async function GET(request: Request, { params }: Context) {
  return proxyStream(request, runtimePath(apiContracts.getDrawingPage.path, await params), {
    passHeaders: ["x-source-width", "x-source-height"],
  });
}
