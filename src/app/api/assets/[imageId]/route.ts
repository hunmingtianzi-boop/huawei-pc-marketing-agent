import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataRoot, latestReport } from "@/server/runs/probe-store";
import { localRequest } from "@/server/runs/local-access";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ imageId: string }> }) {
  if (!localRequest(request)) return new Response(null, { status: 403 });
  const { imageId } = await context.params;
  if (!z.uuid().safeParse(imageId).success) return new Response(null, { status: 404 });
  const report = await latestReport();
  if (!report?.image || report.image.imageId !== imageId || report.image.availability !== "verified" || report.mode !== "live") return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(path.join(dataRoot(), "probes", report.reportId, "image.bin"));
    if (createHash("sha256").update(bytes).digest("hex") !== report.image.contentDigest) return new Response(null, { status: 410 });
    return new Response(bytes, { headers: { "Content-Type": report.image.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
