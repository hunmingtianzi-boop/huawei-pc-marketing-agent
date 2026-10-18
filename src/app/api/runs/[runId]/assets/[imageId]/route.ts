import {z} from "zod";
import {api,noStore} from "@/server/runs/api";
import {getRun} from "@/server/runs/service";
import {readRunAsset} from "@/server/assets/run-assets";
import {dataRoot} from "@/server/runs/probe-store";
import path from "node:path";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{runId:string;imageId:string}>}){return api(request,false,async()=>{const {runId,imageId}=await context.params;z.uuid().parse(runId);z.uuid().parse(imageId);const run=await getRun(runId);const asset=await readRunAsset(path.join(dataRoot(),"runs",runId),run,imageId);return new Response(asset.bytes,{headers:{...noStore,"Content-Type":asset.mimeType,"X-Content-Type-Options":"nosniff"}});});}
