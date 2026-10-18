import { randomUUID } from "node:crypto";
import { IMAGE_COUNTS } from "../../contracts";
import { DraftContent, SemanticVerdict, ValidationReport, type ValidationContext, type ModelClient, type ValidationIssue } from "../../contracts/business";
import { contentDigest, evidenceDigest, strategyDigest } from "../../contracts/digests";
import { BusinessError } from "../runs/business-error";
import { modelPayload } from "../workflow";
import { runtimePrompt } from "../workflow/prompts";

const normalized = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const withoutReferences = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");
const digits = (s: string) => [...withoutReferences(s).normalize("NFKC").replace(/(?:^|\n)\s*\d+[.、)]/g, "").matchAll(/\d+(?:\.\d+)?/g)].map(x => x[0]);
const numberClaims = (s: string) => [...withoutReferences(s).normalize("NFKC").matchAll(/\d+(?:\.\d+)?\s*(?:GHz|MHz|TB|GB|MB|kg|g|mm|cm|mAh|Wh|W|Hz|nits|nit|h|K|英寸|寸|小时|分钟|千克|克|毫米|厘米|元|%|倍|万|亿|个接口|核)/gi)].map(x => normalized(x[0]));

export async function validateDraft(context: ValidationContext, model: ModelClient): Promise<ValidationReport> {
  const { draft, evidence, brief, strategy } = context;
  DraftContent.parse(draft);
  const issues: ValidationIssue[] = [];
  const add = (code: string, category: ValidationIssue["category"], location: string, message: string, evidenceKeys: string[] = [], resolution: ValidationIssue["resolution"] = "rewrite") => issues.push({ issueId: randomUUID(), code, category, location, message, evidenceKeys, resolution, severity: "blocker", status: "open" });
  const checks: ValidationReport["checks"] = [];
  const checkpoint = (name: string, start: number, summary: string) => checks.push({ name, status: issues.length === start ? "passed" : "failed", summary });
  let start = issues.length;
  if (draft.version !== context.version || draft.contentDigest !== contentDigest(draft) || strategy.briefVersion !== brief.briefVersion) add("STALE_VALIDATION", "version", "draft", "稿件版本、内容摘要或策略版本不匹配。", [], "retry");
  if (evidence.snapshotDigest !== evidenceDigest(evidence)) add("EVIDENCE_DIGEST_MISMATCH", "version", "evidence", "事实或图片快照已变化，需要重新取证。", [], "retrieve");
  if (brief.productSelection && brief.productSelection.productKey !== evidence.product.productKey) add("MODEL_PARAMETER_MISMATCH", "fact", "brief.productSelection", "任务选中型号与事实包不一致。", [], "retrieve");
  checkpoint("版本绑定", start, "绑定当前任务、稿件、证据和策略版本及摘要。");
  start = issues.length;
  if (brief.missingFields.length || !brief.platform) add("MISSING_INPUT", "input", "brief", "仍有必要条件待补充。", [], "clarify");
  for (const conflict of evidence.conflicts) add("SOURCE_CONFLICT", "fact", conflict.fieldKey, conflict.message, conflict.sourceIds, "human_confirm");
  const sources = new Map(evidence.sources.map(s => [s.citationKey, s]));
  const facts = new Map(evidence.facts.map(f => [f.factId, f]));
  for (const fact of evidence.facts) {
    if (fact.status === "conflicted") add("SOURCE_CONFLICT", "fact", fact.factId, "该事实存在冲突，不得任选一个版本。", fact.sourceIds, "human_confirm");
    if (fact.productKey !== evidence.product.productKey) add("MODEL_PARAMETER_MISMATCH", "fact", fact.factId, "事实属于其他型号或版本。", fact.sourceIds, "retrieve");
    if (fact.status === "supported" && fact.sourceIds.some(id => !sources.has(id) || sources.get(id)?.reviewAccess === "unavailable")) add("SOURCE_MISSING", "fact", fact.factId, "已支持事实缺少可核查的对应来源。", [], "retrieve");
  }
  if (!evidence.facts.some(f => f.status === "supported")) add("NO_SUPPORTED_FACTS", "fact", "evidence.facts", "没有可支持产品文案的事实。", [], "retrieve");
  for (const block of draft.bodyBlocks) {
    if (!strategy.outline.some(o => o.blockKey === block.blockKey)) add("UNKNOWN_BLOCK", "platform", block.blockKey, "正文段落没有对应当前策略结构。");
    for (const id of block.factIds) {
      const fact = facts.get(id);
      if (!fact || fact.status !== "supported" || fact.productKey !== evidence.product.productKey) { add("UNSUPPORTED_CLAIM", "fact", block.blockKey, "正文引用不存在、未确认或错配型号的事实。", [], "retrieve"); continue; }
      for (const qualifier of fact.qualifiers) if (!normalized(block.text).includes(normalized(qualifier))) add("FACT_QUALIFIER_MISSING", "fact", block.blockKey, `事实引用需要保留限制条件：${qualifier}`, fact.sourceIds);
    }
    if (!block.factIds.length && /^(?:支持|搭载|采用|配备|拥有|具备)|(?:该(?:机|电脑|产品)|本(?:机|电脑|产品)|这(?:款|台)|HUAWEI|MateBook).{0,30}(?:支持|搭载|采用|配备|拥有|具备)|(?:产品|屏幕|处理器|续航|重量|接口).{0,12}(?:为|是|使用|采用|支持|配备|约|：)/i.test(block.text)) add("SOURCE_MISSING", "fact", block.blockKey, "产品事实陈述需要绑定对应事实引用。", [], "retrieve");
    const blockBasis = block.factIds.map(id => facts.get(id)).filter(Boolean).map(f => `${f!.supportedStatement} ${f!.value} ${f!.unit || ""} ${f!.qualifiers.join(" ")}`).join(" ");
    const validNumbers = new Set(numberClaims(`${blockBasis} ${evidence.product.displayName}`));
    for (const numeric of numberClaims(block.text)) if (!validNumbers.has(numeric)) add("UNSUPPORTED_NUMBER_OR_UNIT", "fact", block.blockKey, "正文包含引用事实不支持的数值或单位。", block.factIds.flatMap(id => facts.get(id)?.sourceIds || []));
  }
  if (new Set(draft.bodyBlocks.map(b => b.blockKey)).size !== draft.bodyBlocks.length) add("DUPLICATE_BLOCK", "platform", "bodyBlocks", "正文段落标识必须唯一。");
  checkpoint("事实与来源", start, "检查型号、来源、引用、条件、数值与冲突；冲突阻断成稿。");
  start = issues.length;
  const visible: [string, string][] = [["title", draft.title], ["lead", draft.lead], ["callToAction", draft.callToAction], ...draft.tags.map((s, i): [string, string] => [`tags.${i}`, s]), ...draft.bodyBlocks.map((b): [string, string] => [b.blockKey, b.text]), ...draft.selectedImages.flatMap((i, n): [string, string][] => [[`selectedImages.${n}.caption`, i.caption], [`selectedImages.${n}.purpose`, i.purpose]])];
  const supportedFacts = evidence.facts.filter(f => f.status === "supported" && f.productKey === evidence.product.productKey);
  const basis = supportedFacts.map(f => `${f.supportedStatement} ${f.value} ${f.unit || ""} ${f.qualifiers.join(" ")}`).join(" ");
  const approvedNumbers = new Set(numberClaims(`${basis} ${evidence.product.displayName}`));
  const approvedDigits = new Set(digits(`${basis} ${evidence.product.displayName}`));
  for (const [location, value] of visible) {
    if (withoutReferences(value)!==value) add("REFERENCE_IN_VISIBLE_TEXT", "compliance", location, "事实标识仅应放在factIds，不得写入可见文案。", [], "remove");
    if (/(?:行业|全网|全球|世界|销量)?第[一1]|最强|最佳|顶级|遥遥领先|百分百|100%\s*(?:成功|满意|安全|无误|保证|不卡|流畅|适合|兼容)|保证(?:成功|结果|不卡|流畅)|绝不|永不|吊打|碾压|竞品垃圾/.test(value)) add("PROHIBITED_MARKETING_CLAIM", "compliance", location, "删除绝对化、虚假保证或无依据对比贬低表述。", [], "remove");
    if (/亲测|我(?:实测|用了|用过|体验)|使用一周|实测(?:跑分|续航|结果)|用户(?:一致|都说|评价)|好评率/.test(value)) add("FABRICATED_EXPERIENCE", "compliance", location, "不得编造亲测、软件实测或用户评价。", [], "remove");
    if (/价格|售价|到手价|仅售|只要\d|\d\s*元|补贴|优惠|立减|库存|现货|赠送|权益/.test(value) && !supportedFacts.some(f => /价格|售价|补贴|优惠|库存|赠送|权益/.test(`${f.fieldKey} ${f.supportedStatement}`) && normalized(value).includes(normalized(f.supportedStatement)))) add("UNSUPPORTED_PRICE_OR_BENEFIT", "compliance", location, "价格、补贴、库存或权益缺乏本次可引用依据，应删除或改为咨询适用性。", [], "remove");
    if (/销量|奖项|冠军|获奖/.test(value) && !supportedFacts.some(f => normalized(value).includes(normalized(f.supportedStatement)) && /销量|奖项|冠军|获奖/.test(f.supportedStatement))) add("UNSUPPORTED_SOCIAL_PROOF", "compliance", location, "销量或奖项缺少原文依据。", [], "remove");
    for (const numeric of digits(value)) if (!approvedDigits.has(numeric)) add("UNSUPPORTED_NUMBER_OR_UNIT", "fact", location, "可见文案包含事实包没有支持的数值。");
    for (const numeric of numberClaims(value)) if (!approvedNumbers.has(numeric)) add("UNSUPPORTED_NUMBER_OR_UNIT", "fact", location, "可见文案包含事实包没有支持的数值或单位。");
    const mentions = value.match(/(?:HUAWEI\s*)?MateBook\s*(?:X\s*)?(?:\d+(?:\s*Pro)?|X\s*Pro)(?:\s*\d{4})?/gi) || [];
    for (const mention of mentions) if (!normalized(evidence.product.displayName).includes(normalized(mention))) add("MODEL_PARAMETER_MISMATCH", "fact", location, "文案混入其他或相近产品型号。", [], "rewrite");
    if (/Windows|鸿蒙/.test(value) && /Windows|鸿蒙/.test(evidence.product.displayName)) {
      if (value.includes("Windows") && evidence.product.displayName.includes("鸿蒙") || value.includes("鸿蒙") && evidence.product.displayName.includes("Windows")) add("MODEL_VARIANT_MISMATCH", "fact", location, "文案混入其他系统版本的事实。");
    }
    if (/(?:忽略|覆盖).{0,8}(?:规则|指令)|system prompt|API.?KEY|https?:\/\//i.test(value)) add("UNSAFE_CONTENT", "compliance", location, "成稿包含不应展示的操作指令或外部访问地址。", [], "remove");
  }
  checkpoint("全部可见文案与宣传风险", start, "标题、导语、CTA、标签、正文、图注和图片用途全部接受检查。");
  start = issues.length;
  const range = brief.platform ? IMAGE_COUNTS[brief.platform] : strategy.imageCountRange;
  if (draft.selectedImages.length < range.min || draft.selectedImages.length > range.max) add("INSUFFICIENT_IMAGES", "image", "selectedImages", `当前选择${draft.selectedImages.length}张，平台要求${range.min}–${range.max}张。`, [], "retrieve");
  const seenIds = new Set<string>(); const seenDigests = new Set<string>();
  for (const selected of draft.selectedImages) {
    const image = evidence.images.find(i => i.imageId === selected.imageId);
    if (!image) { add("IMAGE_SOURCE_MISSING", "image", selected.imageId, "所选图片不在当前 ima 证据包。", [], "retrieve"); continue; }
    if (image.productKey !== evidence.product.productKey || image.modelMatch !== "confirmed" || !image.modelMatchSummary) add(image.modelMatch === "mismatch" ? "IMAGE_MODEL_MISMATCH" : "IMAGE_MODEL_UNCONFIRMED", "image", image.imageId, "图片型号不匹配或依据未确认。", [image.sourceView.citationKey], "retrieve");
    if (image.availability !== "verified" || image.previewAssetKey !== image.imageId || image.sourceView.reviewAccess === "unavailable" || !image.contentDigest) add("MEDIA_UNAVAILABLE", "image", image.imageId, "图片未验证可访问或缓存键无效。", [image.sourceView.citationKey], "retrieve");
    if (seenIds.has(image.imageId) || seenDigests.has(image.contentDigest)) add("DUPLICATE_IMAGE", "image", image.imageId, "重复图片不能用于满足平台配图数量。", [image.sourceView.citationKey], "remove");
    seenIds.add(image.imageId); seenDigests.add(image.contentDigest);
    if (!draft.bodyBlocks.some(b => b.blockKey === selected.placement.blockKey)) add("IMAGE_PLACEMENT_INVALID", "image", image.imageId, "图片位置没有对应当前正文段落。");
    if (!selected.caption.trim() || !selected.purpose.trim()) add("IMAGE_DESCRIPTION_MISSING", "image", image.imageId, "配图需要说明及用途。");
  }
  checkpoint("图片与编排", start, "检查平台图数、唯一摘要、型号依据、访问状态、图注及正文位置。");
  start = issues.length;
  if (!draft.title.trim() || !draft.bodyBlocks.length || !draft.callToAction.trim()) add("PLATFORM_ADAPTATION_INCOMPLETE", "platform", "draft", "需要完整标题、正文和行动引导。");
  if (brief.platform === "xiaohongshu" && (!draft.tags.length || draft.bodyBlocks.length < 2)) add("PLATFORM_ADAPTATION_INCOMPLETE", "platform", "draft", "小红书需要短段结构、标签及咨询引导。");
  if (brief.platform === "wechat_article" && (!draft.lead.trim() || draft.bodyBlocks.length < 2)) add("PLATFORM_ADAPTATION_INCOMPLETE", "platform", "draft", "公众号需要导语及分段解释。");
  if (brief.platform === "wechat_moments" && (draft.bodyBlocks.reduce((n, b) => n + b.text.length, 0) > 600 || new Set(draft.bodyBlocks.flatMap(b => b.factIds)).size > 1)) add("PLATFORM_ADAPTATION_INCOMPLETE", "platform", "bodyBlocks", "朋友圈应为短文并聚焦一个核心事实。");
  checkpoint("平台结构", start, "按平台校验结构、重点和基本长度。");
  let semanticMode: "not_run" | "synthetic" | "live" = "not_run";
  // Hard failure does not masquerade as a model verdict; avoid sending invalid/conflicted evidence.
  if (!issues.length) {
    const response = await model({ purpose: "verify", system: await runtimePrompt("verify"), user: JSON.stringify({ evidence: modelPayload(context), draft: { title: draft.title, lead: draft.lead, bodyBlocks: draft.bodyBlocks, callToAction: draft.callToAction, tags: draft.tags, selectedImages: draft.selectedImages } }) });
    if (evidence.provenanceMode === "live" && response.mode !== "live") throw new BusinessError("MODEL_MODE_MISMATCH", "真实任务不能使用 synthetic 语义核验。", 409, true);
    semanticMode = response.mode;
    let verdict;
    try { verdict = SemanticVerdict.parse(JSON.parse(response.text)); } catch { throw new BusinessError("MODEL_VERIFICATION_INVALID", "独立语义核验返回格式无效，请重试。", 502); }
    if (!verdict.supported || verdict.issues.length) {
      // Provider messages are never reflected. The safe location is bounded to our own fields.
      for (const item of verdict.issues.length ? verdict.issues : [{ location: "draft", message: "" }]) add("SEMANTIC_UNSUPPORTED", "fact", visible.some(([location]) => location === item.location) ? item.location : "draft", "独立语义核验发现表述超出资料支持范围，请逐项对照依据修改。");
    }
    checks.push({ name: "独立语义核验", status: verdict.supported && !verdict.issues.length ? "passed" : "failed", summary: `${response.mode} 模式的独立模型核验，与生成分开调用。` });
  } else checks.push({ name: "独立语义核验", status: "not_run", summary: "规则发现阻断项，先解决问题再执行独立语义核验。" });
  const riskyRequest = /价格|售价|补贴|库存|亲测|实测|销量|奖项|第一|保证|碾压|好评/;
  const omittedRequests = brief.requestedClaims.filter(claim => riskyRequest.test(claim) && !visible.some(([, text]) => normalized(text).includes(normalized(claim))));
  if (omittedRequests.length) {
    issues.push({ issueId: randomUUID(), code: "REQUESTED_CLAIM_OMITTED", severity: "warning", category: "compliance", location: "brief.requestedClaims", message: `任务中${omittedRequests.length}项风险宣传请求未写入当前稿，保留删除记录；仍需以实际成稿核验结论为准。`, evidenceKeys: [], resolution: "remove", status: "resolved" });
    checks.push({ name: "任务请求拦截记录", status: "passed", summary: "风险请求作为待核实要求处理，未把要求本身视为产品事实。" });
  }
  return ValidationReport.parse({ checkedVersion: context.version, checkedContentDigest: contentDigest(draft), checkedEvidenceSetId: evidence.evidenceSetId, checkedEvidenceDigest: evidenceDigest(evidence), checkedStrategyId: strategy.strategyId, checkedStrategyDigest: strategyDigest(strategy), checkedBriefVersion: brief.briefVersion, status: issues.some(i => i.status === "open" && i.severity !== "warning") ? "failed" : "passed", checks, issues, checkedAt: new Date().toISOString(), semanticMode });
}
