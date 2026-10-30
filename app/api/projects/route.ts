import { apiContracts } from "@/src/domain";
import { proxyJson } from "../_lib/runtime-proxy";

const { createProject } = apiContracts;

export async function POST(request: Request) {
  return proxyJson(request, createProject.path, createProject);
}
