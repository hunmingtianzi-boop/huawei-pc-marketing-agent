import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { ProductEvidence, type RetrievalRequest, type RetrievalResult, type RetrievalServices } from "../../contracts/business";
import { evidenceDigest } from "../../contracts/digests";
import { extractFacts } from "./facts";

/** Artificial fixtures only; never invoked as a fallback for failed live I/O. */
export async function syntheticEvidence(request: RetrievalRequest, services: RetrievalServices): Promise<RetrievalResult> {
  const displayName = request.productRequest.trim() || "人工样例电脑";
  const at = new Date().toISOString();
  const product = { productKey: randomUUID(), displayName, variant: { provenance: "人工构造样例，不代表真实产品参数" }, resolutionBasis: "synthetic 模式的人工测试型号；未连接 ima。" };
  const text = `# ${displayName}\n\n## 说明\n以下参数完全由开发者构造，仅用于验证工作流，不可作为真实产品事实。\n\n## 屏幕\n人工样例屏幕采用 14 英寸显示区域。\n\n## 重量\n人工样例机身重量约 1.5 kg。实际配置以人工测试样本为限。\n\n## 电池\n人工样例在指定测试条件下可使用约 8 小时；测试条件为本地文档编辑、亮度 50%。\n\n## 连接\n人工样例支持连接外接显示器，用于验证学习与办公场景编排。\n`;
  const extracted = extractFacts(text, product.productKey, displayName, "人工构造样例.md", at);
  const images: ProductEvidence["images"] = [];
  const assets: RetrievalResult["assets"] = [];
  for (let index = 0; index < 4; index++) {
    const bytes = await sharp({ create: { width: 48 + index, height: 32 + index, channels: 4, background: { r: 30 + index * 45, g: 80 + index * 25, b: 140 - index * 20, alpha: 1 } } }).png().toBuffer();
    const meta = await services.decodeImage(bytes, "image/png");
    const imageId = randomUUID();
    const fileName = `synthetic-${index + 1}.png`;
    const sourceView = { citationKey: randomUUID(), sourceTitle: "人工构造测试图（非 ima 产品图片）", locatorLabel: `synthetic fixture / 第 ${index + 1} 张`, supportingExcerpt: "仅用于隔离验证图片编排，不代表产品外观或真实来源。", retrievedAt: at, reviewAccess: "unavailable" as const };
    extracted.sources.push(sourceView);
    images.push({ imageId, productKey: product.productKey, fileName, sourceView, ...meta, availability: "verified", modelMatch: "confirmed", modelMatchSummary: "仅在 synthetic 人工样例内绑定；未证明真实产品型号。", previewAssetKey: imageId, contentDigest: createHash("sha256").update(bytes).digest("hex") });
    assets.push({ imageId, bytes, mimeType: meta.mimeType });
    await services.persistPrivate(`synthetic-${imageId}.png`, bytes);
  }
  const draft = { evidenceSetId: randomUUID(), product, retrievedAt: at, provenanceMode: "synthetic" as const, sources: extracted.sources, facts: extracted.facts, images, conflicts: extracted.conflicts, coverageGaps: extracted.coverageGaps };
  return { evidence: ProductEvidence.parse({ ...draft, snapshotDigest: evidenceDigest(draft) }), assets, documents: [{ sourceId: extracted.sources[0].citationKey, title: "人工构造样例（非真实产品事实）", locator: "synthetic fixture", text }] };
}
