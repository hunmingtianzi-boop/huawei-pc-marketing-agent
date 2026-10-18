import { createHash, randomUUID } from "node:crypto";
import { ProductEvidence, type RetrievalRequest, type RetrievalResult, type RetrievalServices, type SourceDocument, type CachedAsset } from "../../contracts/business";
import { evidenceDigest } from "../../contracts/digests";
import type { SourceView } from "../../contracts";
import { ImaAdapter } from "./adapter";
import { TARGET_KB_NAME } from "./config";
import { ImaError } from "./errors";
import { indexedImages } from "./image-index";
import { assertProductDocument } from "./source";
import { extractFacts } from "./facts";
import { syntheticEvidence } from "./synthetic";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const textTypes = new Set(["text/plain", "text/markdown", "text/x-markdown", "application/md", "application/markdown", "application/octet-stream"]);
function decodeText(bytes: Buffer, contentType: string, csv = false) {
  if (!textTypes.has(contentType) && !(csv && ["text/csv", "application/csv"].includes(contentType))) throw new ImaError(csv ? "MEDIA_UNAVAILABLE" : "SOURCE_UNAVAILABLE", true);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new ImaError("SOURCE_UNAVAILABLE"); }
  if (!text.trim() || text.includes("\u0000") || /<(!doctype|html|form)[\s>]/i.test(text)) throw new ImaError("SOURCE_UNAVAILABLE");
  return text;
}
export function productDirectoryName(request: string) {
  // Only this explicit alias has a live-confirmed directory/document mapping.
  const normalized = request.trim().replace(/\s+/g, " ");
  return normalized === "HUAWEI MateBook 14（鸿蒙版）" ? "HUAWEI MateBook 14" : normalized;
}
function source(title: string, locator: string, excerpt: string | null, at: string): SourceView {
  return { citationKey: randomUUID(), sourceTitle: title, locatorLabel: locator, supportingExcerpt: excerpt?.slice(0, 600) ?? null, retrievedAt: at, reviewAccess: "ima_client_required" };
}

/** No credentials, filesystem cache or transport globals: all live I/O is injected. */
export async function retrieveEvidence(request: RetrievalRequest, services: RetrievalServices): Promise<RetrievalResult> {
  if (request.mode === "synthetic") return syntheticEvidence(request, services);
  if (request.mode !== "live" || !request.productRequest.trim()) throw new ImaError("MISSING_INPUT");
  const start = Date.now();
  let calls = 0;
  const adapter = new ImaAdapter(async (method, params) => {
    if (++calls > 60 || Date.now() - start > 180000) throw new ImaError("BUDGET_EXCEEDED", true);
    const raw = await services.callIma(method, params);
    await services.persistPrivate(`response-${calls}-${method}.json`, JSON.stringify(raw));
    return raw;
  });
  const kb = await adapter.resolveKnowledgeBase(TARGET_KB_NAME);
  const root = await adapter.listEntries(kb.id);
  const found = await adapter.findProduct(kb.id, productDirectoryName(request.productRequest), root);
  const primary = found.entries.filter(e => e.title === "产品事实.md");
  const candidates = primary.length ? primary : found.entries.filter(e => e.title === "article.md");
  if (candidates.length !== 1 || !candidates[0].parentFolderId) throw new ImaError("MODEL_AMBIGUOUS", true);
  const entry = candidates[0];
  const access = await adapter.getMediaAccess(entry.mediaId);
  const content = await services.fetchMedia(access, 2 * 1024 * 1024);
  const text = decodeText(content.bytes, content.contentType);
  const displayName = assertProductDocument(text, request.productRequest.trim());
  const at = new Date().toISOString();
  const product: ProductEvidence["product"] = { productKey: randomUUID(), displayName, variant: displayName.endsWith("（鸿蒙版）") ? { system: "HarmonyOS" } : {}, resolutionBasis: "指定 ima 库的精确型号目录与已读取产品原文一级标题。" };
  const documentSource = source(displayName, `${entry.title} / 一级标题与正文`, null, at);
  const documents: SourceDocument[] = [{ sourceId: documentSource.citationKey, title: displayName, locator: entry.title, text }];
  await services.persistPrivate("source.txt", text);
  await services.persistPrivate("source-private.json", JSON.stringify({ kb, entry, access, digest: hash(content.bytes), usedDirectoryFallback: found.usedDirectoryFallback }));
  const extracted = extractFacts(text, product.productKey, displayName, entry.title, at);
  const sources: SourceView[] = [documentSource, ...extracted.sources];
  const coverageGaps = [...extracted.coverageGaps];
  const images: ProductEvidence["images"] = [];
  const assets: CachedAsset[] = [];
  const modelEntries = await adapter.listEntries(kb.id, entry.parentFolderId!);
  const indices = modelEntries.filter(e => e.title === "图片索引.csv");
  const folders = modelEntries.filter(e => e.title === "images" && e.kind === "folder");
  if (indices.length !== 1 || folders.length !== 1) {
    coverageGaps.push("缺少唯一的同型号图片索引或 images 目录；本轮未取得可证图片。");
  } else {
    const indexAccess = await adapter.getMediaAccess(indices[0].mediaId);
    const csv = await services.fetchMedia(indexAccess, 2 * 1024 * 1024);
    const csvText = decodeText(csv.bytes, csv.contentType, true);
    await services.persistPrivate("image-index.csv", csv.bytes);
    const indexed = indexedImages(csvText, displayName);
    const entries = await adapter.listEntries(kb.id, folders[0].mediaId);
    const seen = new Set<string>();
    for (const image of indexed.slice(0, 6)) {
      const matches = entries.filter(e => e.title === image.fileName && e.kind !== "folder");
      if (matches.length !== 1) { coverageGaps.push(`图片索引第 ${image.row} 行对应的 ima 文件缺失或不唯一。`); continue; }
      try {
        const imageAccess = await adapter.getMediaAccess(matches[0].mediaId);
        if (imageAccess.mediaType !== 9) throw new ImaError("MEDIA_UNAVAILABLE");
        const content = await services.fetchMedia(imageAccess, 12 * 1024 * 1024);
        const meta = await services.decodeImage(content.bytes, content.contentType);
        if (meta.width !== image.width || meta.height !== image.height || meta.mimeType !== content.contentType) throw new ImaError("MEDIA_UNAVAILABLE");
        const contentDigest = hash(content.bytes);
        if (seen.has(contentDigest)) { coverageGaps.push(`图片索引第 ${image.row} 行与已获取图片重复，未计入配图。`); continue; }
        seen.add(contentDigest);
        const imageId = randomUUID();
        const imageSource = source(image.fileName, `P1 / ${displayName} / 图片索引.csv 第 ${image.row} 行`, `产品型号：${displayName}；图片说明：${image.description}`, at);
        sources.push(imageSource);
        images.push({ imageId, productKey: product.productKey, fileName: image.fileName, sourceView: imageSource, ...meta, availability: "verified", modelMatch: "confirmed", modelMatchSummary: `同型号目录图片索引精确标注 ${displayName}，文件、完整解码及实际尺寸与索引一致。`, previewAssetKey: imageId, contentDigest });
        assets.push({ imageId, bytes: content.bytes, mimeType: meta.mimeType });
        await services.persistPrivate(`image-${imageId}.bin`, content.bytes);
        await services.persistPrivate(`image-${imageId}-private.json`, JSON.stringify({ entry: matches[0], access: imageAccess, indexEntry: indices[0], row: image.row, contentDigest }));
      } catch (error) {
        // Service/configuration/protocol failures must retain their distinct codes.
        if (!(error instanceof ImaError) || !["MEDIA_UNAVAILABLE", "IMAGE_MODEL_UNCONFIRMED"].includes(error.code)) throw error;
        coverageGaps.push(`图片索引第 ${image.row} 行未通过实际获取、解码或尺寸核验。`);
      }
    }
    if (!images.length) coverageGaps.push("未取得型号可证且可解码的图片，禁止标为完整成稿。");
  }
  const draft = { evidenceSetId: randomUUID(), product, retrievedAt: at, provenanceMode: "live" as const, sources, facts: extracted.facts, images, conflicts: extracted.conflicts, coverageGaps };
  const evidence = ProductEvidence.parse({ ...draft, snapshotDigest: evidenceDigest(draft) });
  return { evidence, assets, documents };
}
