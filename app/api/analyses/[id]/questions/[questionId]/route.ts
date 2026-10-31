import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../../../_lib/runtime-proxy";
type Context = { params: Promise<{ id: string; questionId: string }> };
export async function POST(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(apiContracts.answerQuestion.path, await params), apiContracts.answerQuestion);
}
