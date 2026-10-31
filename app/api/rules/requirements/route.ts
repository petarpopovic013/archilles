import { apiContracts } from "@/src/domain";
import { proxyJson } from "../../_lib/runtime-proxy";

const { ruleRequirements } = apiContracts;

/** Subtypes, measurements, and classifications the rule registry references. */
export async function GET(request: Request) {
  return proxyJson(request, ruleRequirements.path, ruleRequirements);
}
