import { apiContracts } from "@/src/domain";
import { proxyJson, runtimePath } from "../../../../../_lib/runtime-proxy";
type Context = {params:Promise<{id:string;page:string}>};
export async function PATCH(request:Request,{params}:Context){const c=apiContracts.geometrySetup;return proxyJson(request,runtimePath(c.path,await params),c);}
export async function POST(request:Request,{params}:Context){const c=apiContracts.geometryReextract;return proxyJson(request,runtimePath(c.path,await params),c);}
