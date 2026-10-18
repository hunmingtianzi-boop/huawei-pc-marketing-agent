import { api,noStore } from "@/server/runs/api";
import { modelConfigurationState } from "@/server/runs/model-config";
import { probeRuntimeModel } from "@/server/runs/model-probe";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){return api(request,false,async()=>Response.json(modelConfigurationState(),{headers:noStore}));}
export async function POST(request:Request){return api(request,true,async()=>Response.json(await probeRuntimeModel(),{headers:noStore}));}
