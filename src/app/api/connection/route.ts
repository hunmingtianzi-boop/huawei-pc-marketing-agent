import { CONTRACT_VERSION, ProbeInput } from "@/contracts";
import { credentialState } from "@/server/ima/config";
import { runProbe } from "@/server/ima/probe";
import { normalizeError } from "@/server/ima/errors";
import { latestReport } from "@/server/runs/probe-store";
import { localRequest } from "@/server/runs/local-access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
let busy = false;
export async function GET(request: Request) {
  if (!localRequest(request)) return Response.json({ error: { code: "REQUEST_REJECTED" } }, { status: 403, headers });
  return Response.json({ contractVersion: CONTRACT_VERSION, credentials: credentialState(process.env),
    modelConfigured: !!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL),
    report: await latestReport(), scope: "local_single_user" }, { headers });
}
export async function POST(request: Request) {
  if (!localRequest(request, true)) return Response.json({ error: { code: "REQUEST_REJECTED" } }, { status: 403, headers });
  if (busy) return Response.json({ error: { code: "PROBE_BUSY", message: "已有一次连接检查正在执行。" } }, { status: 409, headers });
  if (Number(request.headers.get("content-length")) > 4096) return Response.json({ error: { code: "MISSING_INPUT" } }, { status: 413, headers });
  try {
    const text = await request.text();
    if (text.length > 4096) return Response.json({ error: { code: "MISSING_INPUT" } }, { status: 413, headers });
    const input = ProbeInput.safeParse(JSON.parse(text));
    if (!input.success) return Response.json({ error: { code: "MISSING_INPUT", message: "请输入完整的型号名。" } }, { status: 400, headers });
    busy = true;
    const report = await runProbe(input.data.productName);
    return Response.json({ report }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: { code: "MISSING_INPUT", message: "请求须为 JSON。" } }, { status: 400, headers });
    return Response.json({ error: normalizeError(error).safe() }, { status: 500, headers });
  } finally { busy = false; }
}
