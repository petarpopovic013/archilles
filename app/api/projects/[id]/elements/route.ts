import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { updateElements } = apiContracts;

/** Confirm several elements' type/subtype at once; creates one new project revision. */
export async function PATCH(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(updateElements.path, await params), updateElements);
}
