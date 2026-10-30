import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { correctMeasurement } = apiContracts;

export async function PATCH(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(correctMeasurement.path, await params), correctMeasurement);
}
