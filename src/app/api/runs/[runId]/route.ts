import { z } from "zod";
import { RunResponse } from "@/contracts/business";
import { api,noStore } from "@/server/runs/api";
import { getRun } from "@/server/runs/service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{runId:string}>}){return api(request,false,async()=>{const {runId}=await context.params;return Response.json(RunResponse.parse({run:await getRun(z.uuid().parse(runId))}),{headers:noStore});});}
