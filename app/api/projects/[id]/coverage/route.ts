import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { coverage } = apiContracts;

export async function GET(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(coverage.path, await params), coverage);
}
