import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { startAnalysis } = apiContracts;

export async function POST(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(startAnalysis.path, await params), startAnalysis);
}
