import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { getProject, updateProject } = apiContracts;

export async function GET(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(getProject.path, await params), getProject);
}

export async function PATCH(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(updateProject.path, await params), updateProject);
}
