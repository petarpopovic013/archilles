import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { getAnalysis } = apiContracts;

export async function GET(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(getAnalysis.path, await params), getAnalysis);
}
