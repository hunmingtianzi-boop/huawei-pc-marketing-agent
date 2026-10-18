import { createHash } from "node:crypto";
import type { DraftEditable, ProductEvidence } from "./business";
import type { z } from "zod";
import type { ContentStrategy } from "./index";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function digest(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function contentDigest(draft: DraftEditable) { const { title, lead, bodyBlocks, callToAction, tags, selectedImages } = draft; return digest({ title, lead, bodyBlocks, callToAction, tags, selectedImages }); }
export function evidenceDigest(evidence: Omit<ProductEvidence, "snapshotDigest"> | ProductEvidence) { const { snapshotDigest: _ignored, ...rest } = evidence as ProductEvidence; return digest(rest); }
export function strategyDigest(strategy: z.infer<typeof ContentStrategy>) { return digest(strategy); }
