import { z } from "zod";
import { localRequest } from "./local-access";
import { BusinessError } from "./business-error";
import { ImaError } from "../ima/errors";
export const noStore = { "Cache-Control": "no-store" };
export async function jsonInput(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new BusinessError("INVALID_INPUT", "请求须为 JSON。", 400);
  const chunks: Uint8Array[] = []; let count = 0;
  try { while (true) { const {value,done}=await reader.read(); if(done)break; count+=value.length; if(count>65536) throw new BusinessError("INVALID_INPUT", "请求过大。",413); chunks.push(value); } }
  finally { await reader.cancel(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new BusinessError("INVALID_INPUT", "请求须为 JSON。",400); }
}
export async function api(request: Request, mutation: boolean, fn: () => Promise<Response>): Promise<Response> {
  if (!localRequest(request,mutation)) return Response.json({error:{code:"REQUEST_REJECTED",message:"仅允许本机同源访问。"}},{status:403,headers:noStore});
  try { return await fn(); }
  catch (error) {
    if (error instanceof z.ZodError) return Response.json({error:{code:"INVALID_INPUT",message:"输入字段或版本不符合要求。"}},{status:400,headers:noStore});
    if (error instanceof BusinessError) return Response.json({error:{code:error.code,message:error.message}},{status:error.httpStatus,headers:noStore});
    if (error instanceof ImaError) return Response.json({error:error.safe()},{status:503,headers:noStore});
    return Response.json({error:{code:"INTERNAL_ERROR",message:"本机处理失败，请检查私有诊断。"}},{status:500,headers:noStore});
  }
}
