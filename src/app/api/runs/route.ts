import { CreateRunRequest,RunListResponse,RunResponse } from "@/contracts/business";
import { api,jsonInput,noStore } from "@/server/runs/api";
import { createRun,listRuns } from "@/server/runs/service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){return api(request,false,async()=>Response.json(RunListResponse.parse({runs:await listRuns()}),{headers:noStore}));}
export async function POST(request:Request){return api(request,true,async()=>Response.json(RunResponse.parse({run:await createRun(CreateRunRequest.parse(await jsonInput(request)))}),{status:201,headers:noStore}));}
