import { randomUUID } from "node:crypto";
import { ProductEvidence, TaskInput, type GenerationContext } from "../../src/contracts/business";
import type { Platform } from "../../src/contracts";
import type { z } from "zod";
import { evidenceDigest } from "../../src/contracts/digests";
import { clarifyTask, planContent } from "../../src/server/workflow";
export function fixture(platform: z.infer<typeof Platform> = "wechat_moments", scenario = "新生开学"): GenerationContext {
  const input = TaskInput.parse({ productRequest: "HUAWEI MateBook 14（鸿蒙版）", targetAudience: "新生", useScenario: scenario, contentGoal: "咨询适用性", platform });
  const brief = clarifyTask(input, { taskId: randomUUID(), briefVersion: 1 });
  const productKey = randomUUID(); const at = new Date().toISOString();
  const source = { citationKey: randomUUID(), sourceTitle: "synthetic 人工产品事实", locatorLabel: "人工构造段落", supportingExcerpt: "仅作逻辑测试，非真实产品资料", retrievedAt: at, reviewAccess: "available" as const };
  const evidence = ProductEvidence.parse({ evidenceSetId: randomUUID(), product: { productKey, displayName: "HUAWEI MateBook 14（鸿蒙版）", variant: { system: "鸿蒙" }, resolutionBasis: "synthetic 测试样例" }, retrievedAt: at, provenanceMode: "synthetic", sources: [source], facts: [
    { fieldKey: "system", supportedStatement: "产品使用鸿蒙系统。", value: "鸿蒙", unit: null, qualifiers: [] },
    { fieldKey: "display", supportedStatement: "屏幕资料标注显示尺寸为14英寸。", value: 14, unit: "英寸", qualifiers: [] },
    { fieldKey: "portable", supportedStatement: "测试配置重量为1.5kg。", value: 1.5, unit: "kg", qualifiers: ["仅限测试配置"] },
    { fieldKey: "interface", supportedStatement: "测试配置有2个接口。", value: 2, unit: "个接口", qualifiers: [] },
  ].map(f => ({ ...f, factId: randomUUID(), productKey, sourceIds: [source.citationKey], status: "supported" })), images: Array.from({ length: 4 }, (_, i) => { const imageId = randomUUID(); return { imageId, productKey, fileName: `synthetic-${i}.png`, sourceView: { ...source, citationKey: randomUUID(), sourceTitle: "synthetic 人工图片", supportingExcerpt: "产品外观测试图" }, availability: "verified", modelMatch: "confirmed", modelMatchSummary: "synthetic 显式型号索引", width: 10, height: 10, mimeType: "image/png", previewAssetKey: imageId, contentDigest: `synthetic-hash-${i}` }; }), conflicts: [], coverageGaps: [], snapshotDigest: "pending" });
  evidence.snapshotDigest = evidenceDigest(evidence);
  brief.productSelection = evidence.product;
  return { brief, strategy: planContent(brief), evidence, version: 1 };
}
