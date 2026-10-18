import { z } from "zod";
import { RunActionRequest,RunResponse } from "@/contracts/business";
import { api,jsonInput,noStore } from "@/server/runs/api";
import { actOnRun } from "@/server/runs/service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{runId:string}>}){return api(request,true,async()=>{const {runId}=await context.params;const action=RunActionRequest.parse(await jsonInput(request));const run=await actOnRun(z.uuid().parse(runId),action);return Response.json(RunResponse.parse({run}),{status:action.action==="revise"?200:202,headers:noStore});});}
