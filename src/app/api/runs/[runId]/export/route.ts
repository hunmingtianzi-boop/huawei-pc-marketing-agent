import { z } from "zod";
import { ExportRequest,ExportResponse } from "@/contracts/business";
import { api,jsonInput,noStore } from "@/server/runs/api";
import { exportRun } from "@/server/runs/service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{runId:string}>}){return api(request,true,async()=>{const {runId}=await context.params;const input=ExportRequest.parse(await jsonInput(request));return Response.json(ExportResponse.parse(await exportRun(z.uuid().parse(runId),input.expectedVersion,input.format)),{headers:noStore});});}
