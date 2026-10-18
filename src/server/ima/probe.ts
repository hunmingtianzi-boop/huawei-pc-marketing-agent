import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { CONTRACT_VERSION, ProbeReport, ProbeStageName, type ProbeReport as Report } from "../../contracts";
import { ImaAdapter, type Entry } from "./adapter";
import { credentials, TARGET_KB_NAME } from "./config";
import { ImaError, normalizeError } from "./errors";
import { officialTransport, inspectSkill } from "./transport";
import { assertProductDocument, relativeImageReference } from "./source";
import { indexedImage } from "./image-index";
import { fetchMedia, parseDocument, decodeImage } from "../assets/media";
import { dataRoot, privateWrite, saveReport } from "../runs/probe-store";

const names = ProbeStageName.options;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function runProbe(productName: string): Promise<Report> {
  const report: Report = {
    reportId: randomUUID(), contractVersion: CONTRACT_VERSION, mode: "live", status: "BLOCKED",
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), stages: [],
    skillVersion: null, accountIdentity: "not_verified", product: null, source: null, image: null,
  };
  const dir = path.join(dataRoot(), "probes", report.reportId);
  let credentialError: ImaError | null = null;
  try {
    try { credentials(process.env); report.stages.push({ name: "credentials", executed: true, status: "PASS", summary: "完整凭证对已配置且未发现别名冲突；尚未认证。" }); }
    catch (e) { credentialError = normalizeError(e); report.stages.push({ name: "credentials", executed: true, status: "BLOCKED", summary: credentialError.message, error: credentialError.safe() }); }
    const skill = await inspectSkill(process.env.IMA_SKILL_PATH || "vendor/ima-skill/ima_api.cjs");
    report.skillVersion = skill.version;
    report.stages.push({ name: "skill", executed: true, status: "PASS", summary: `已检查完整官方 Skill ${skill.version}；Node ${process.versions.node}。此步骤为本机检查。` });
    if (credentialError) throw credentialError;
    const transport = officialTransport(skill.script, dataRoot());
    let calls = 0;
    const adapter = new ImaAdapter(async (method, params) => {
      if (++calls > 40 || Date.now() - Date.parse(report.startedAt) > 120000) throw new ImaError("BUDGET_EXCEEDED", true);
      const raw = await transport(method, params);
      // Private raw records never enter the DTO, UI, or normal logs.
      await privateWrite(dir, `response-${calls}-${method}.json`, JSON.stringify(raw));
      await privateWrite(dir, `shape-${calls}.json`, JSON.stringify(shape(raw)));
      return raw;
    });
    const kb = await adapter.resolveKnowledgeBase(TARGET_KB_NAME);
    await privateWrite(dir, "kb-mapping.json", JSON.stringify(kb));
    report.stages.push({ name: "knowledge_base_access", executed: true, status: "PASS", summary: "已按指定名称唯一匹配知识库；未验证账号昵称。" });
    const root = await adapter.listEntries(kb.id);
    report.stages.push({ name: "directory", executed: true, status: "PASS", summary: "已读取根目录并完成分页；内部标识保留在本机。" });
    const found = await adapter.findProduct(kb.id, productName, root);
    report.stages.push({ name: "product_search", executed: true, status: "PASS", summary: found.usedDirectoryFallback ? "搜索为空或目录命中有歧义，已执行 P1 目录回退并定位候选资料。" : "已检索到候选资料，型号仍须原文确认。" });
    // Live target library now stores 产品事实.md in the confirmed P1 model folder.
    const factFiles = found.entries.filter(e => e.title === "产品事实.md");
    const candidates = factFiles.length ? factFiles : found.entries.filter(e => e.title === "article.md");
    if (candidates.length !== 1) throw new ImaError("MODEL_AMBIGUOUS", true);
    const entry = candidates[0];
    const access = await adapter.getMediaAccess(entry.mediaId);
    const content = await fetchMedia(access, 2 * 1024 * 1024);
    const document = parseDocument(content.bytes, content.contentType);
    const displayName = assertProductDocument(document, productName);
    report.product = { productKey: randomUUID(), displayName, variant: displayName.endsWith("（鸿蒙版）") ? { system: "HarmonyOS" } : {}, resolutionBasis: "指定库 P1 型号目录及产品原文一级标题；版本信息直接来自原文。" };
    await privateWrite(dir, "source.txt", document);
    await privateWrite(dir, "source-private.json", JSON.stringify({ entry, access, contentDigest: digest(content.bytes) }));
    const citationKey = randomUUID();
    report.source = { citationKey, sourceTitle: displayName, locatorLabel: `${entry.title} / 一级标题与正文`,
      supportingExcerpt: null, retrievedAt: new Date().toISOString(), reviewAccess: "ima_client_required" };
    report.stages.push({ name: "source_content", executed: true, status: "PASS", summary: "已获取 UTF-8 产品原文，并读取标题明确标示的具体型号与系统版本。" });
    const image = await modelImage(adapter, kb.id, entry, document, displayName, dir);
    const imageContent = await fetchMedia(image.access, 12 * 1024 * 1024);
    const meta = await decodeImage(imageContent.bytes, imageContent.contentType);
    if (image.expectedSize && (image.expectedSize.width !== meta.width || image.expectedSize.height !== meta.height)) throw new ImaError("MEDIA_UNAVAILABLE");
    const imageId = randomUUID();
    await privateWrite(dir, "image.bin", imageContent.bytes);
    await privateWrite(dir, "image-private.json", JSON.stringify({ entry: image.entry, access: image.access, locator: image.locator, parentCitationKey: citationKey }));
    report.image = { imageId, productKey: report.product.productKey, fileName: image.entry.title,
      sourceView: { ...report.source, citationKey: randomUUID(), sourceTitle: image.entry.title, locatorLabel: image.locator,
        supportingExcerpt: `产品型号：${displayName}；对应文件：${image.entry.title}`, retrievedAt: new Date().toISOString() },
      ...meta, availability: "verified", modelMatch: "confirmed", modelMatchSummary: image.basis,
      previewAssetKey: imageId, contentDigest: digest(imageContent.bytes) };
    report.stages.push({ name: "image_asset", executed: true, status: "PASS", summary: "已从 ima 获取并完整解码图片；型号依据与实际来源链已保存，未使用外部图片 URL。" });
    report.status = "PASS";
  } catch (error) {
    const e = normalizeError(error);
    report.status = e.blocked ? "BLOCKED" : "FAIL";
    const done = new Set(report.stages.map(s => s.name));
    const next = names.find(n => !done.has(n));
    if (next) report.stages.push({ name: next, executed: !credentialError, status: report.status, summary: e.message, error: e.safe() });
    for (const name of names) if (!report.stages.some(s => s.name === name)) report.stages.push({ name, executed: false, status: "BLOCKED", summary: "前置步骤未通过，未执行。" });
  }
  report.finishedAt = new Date().toISOString();
  const safe = ProbeReport.parse(report);
  await saveReport(safe);
  return safe;
}

function shape(raw: unknown): unknown {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return { type: "array", sampleShape: raw.length ? shape(raw[0]) : null };
  if (typeof raw === "object") return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, shape(v)]));
  return typeof raw;
}

async function documentImage(adapter: ImaAdapter, kb: string, article: Entry, document: string, productName: string) {
  if (!article.parentFolderId) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
  const { parts, position } = relativeImageReference(document, productName);
  let folder = article.parentFolderId;
  let selected: Entry | null = null;
  for (let index = 0; index < parts.length; index++) {
    const children = await adapter.listEntries(kb, folder);
    const matches = children.filter(e => e.title === parts[index]);
    if (matches.length !== 1) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
    selected = matches[0];
    if (index < parts.length - 1) folder = selected.mediaId;
  }
  if (!selected) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
  const access = await adapter.getMediaAccess(selected.mediaId);
  if (access.mediaType !== 9) throw new ImaError("MEDIA_UNAVAILABLE");
  return { entry: selected, access, position };
}

async function modelImage(adapter: ImaAdapter, kb: string, article: Entry, document: string, displayName: string, dir: string) {
  try {
    const linked = await documentImage(adapter, kb, article, document, displayName);
    return { ...linked, locator: `产品原文内嵌图第 ${linked.position} 行`, basis: "已核对具体型号的产品原文直接引用该图片。", expectedSize: null };
  } catch (error) {
    if (!(error instanceof ImaError) || error.code !== "IMAGE_MODEL_UNCONFIRMED") throw error;
  }
  if (!article.parentFolderId) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
  const modelEntries = await adapter.listEntries(kb, article.parentFolderId);
  const indices = modelEntries.filter(e => e.title === "图片索引.csv");
  const folders = modelEntries.filter(e => e.title === "images" && e.kind === "folder");
  if (indices.length !== 1 || folders.length !== 1) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
  const indexAccess = await adapter.getMediaAccess(indices[0].mediaId);
  const csv = await fetchMedia(indexAccess, 2 * 1024 * 1024);
  if (!["text/csv", "text/plain", "application/csv", "application/octet-stream"].includes(csv.contentType)) throw new ImaError("MEDIA_UNAVAILABLE");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(csv.bytes); } catch { throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED"); }
  const indexed = indexedImage(text, displayName);
  await privateWrite(dir, "image-index.csv", csv.bytes);
  await privateWrite(dir, "image-index-private.json", JSON.stringify({ entry: indices[0], access: indexAccess, row: indexed.row }));
  const images = await adapter.listEntries(kb, folders[0].mediaId);
  const matches = images.filter(e => e.title === indexed.fileName);
  if (matches.length !== 1) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
  const access = await adapter.getMediaAccess(matches[0].mediaId);
  if (access.mediaType !== 9) throw new ImaError("MEDIA_UNAVAILABLE");
  return { entry: matches[0], access, locator: `P1 / 产品目录 / 图片索引.csv 第 ${indexed.row} 行：产品型号与文件名`,
    basis: `库内图片索引明确标注型号为 ${displayName}，对应 ima 图片文件与实际尺寸一致。`, expectedSize: indexed };
}
