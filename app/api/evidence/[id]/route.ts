import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../_lib/runtime-proxy";

type Context = { params: Promise<{ id: string }> };
const { getEvidence } = apiContracts;

/** One evidence record (drawing location, label text, or user note) cited by a finding. */
export async function GET(request: Request, { params }: Context) {
  return proxyJson(request, runtimePath(getEvidence.path, await params), getEvidence);
}
