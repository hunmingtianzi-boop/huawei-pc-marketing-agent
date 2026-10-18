import { CONTRACT_VERSION } from "@/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ status: "ok", phase: "foundation", contractVersion: CONTRACT_VERSION }, { headers: { "Cache-Control": "no-store" } });
}
