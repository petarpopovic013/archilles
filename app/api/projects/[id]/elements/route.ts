import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { updateElements } = apiContracts;

/** Confirm several elements' type/subtype at once; creates one new project revision. */
export async function PATCH(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(updateElements.path, await params), updateElements);
}

export async function POST(request: Request, { params }: Context) { const c=apiContracts.createElement; return proxyJson(request, runtimePath(c.path, await params), c); }
