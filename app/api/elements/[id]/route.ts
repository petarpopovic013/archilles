import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { updateElement } = apiContracts;

/** Confirm or correct an element's type/subtype; creates a new project revision. */
export async function PATCH(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(updateElement.path, await params), updateElement);
}

export async function DELETE(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(apiContracts.retireElement.path, await params), apiContracts.retireElement);
}
