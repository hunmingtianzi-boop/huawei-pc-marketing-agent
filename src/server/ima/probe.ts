import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { CONTRACT_VERSION, ProbeReport, ProbeStageName, type ProbeReport as Report } from "../../contracts";
import { ImaAdapter, type Entry } from "./adapter";
import { credentials, TARGET_KB_NAME } from "./config";
import { ImaError, normalizeError } from "./errors";
import { officialTransport, inspectSkill } from "./transport";
import { assertProductDocument, relativeImageReference } from "./source";
import { fetchMedia, parseDocument, decodeImage } from "../assets/media";
import { dataRoot, privateWrite, saveReport } from "../runs/probe-store";

const names = ProbeStageName.options;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function runProbe(productName: string): Promise<Report> {
  const report: Report = {
    reportId: randomUUID(), contractVersion: CONTRACT_VERSION, mode: "live", status: "BLOCKED",
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), stages: [],
    skillVersion: null, accountIdentity: "not_verified", source: null, image: null,
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
    report.stages.push({ name: "product_search", executed: true, status: "PASS", summary: found.usedDirectoryFallback ? "搜索为空，已执行 P1 目录回退并定位候选资料。" : "已检索到候选资料，型号仍须原文确认。" });
    const candidates = found.entries.filter(e => e.title === "article.md" || e.title === productName);
    if (candidates.length !== 1) throw new ImaError("MODEL_AMBIGUOUS", true);
    const entry = candidates[0];
    // Search results with media_id/title do not prove whether a hit is a folder.
    // A full-name hit cannot be treated as a document without live mapping.
    if (entry.title !== "article.md") throw new ImaError("MODEL_AMBIGUOUS", true);
    const access = await adapter.getMediaAccess(entry.mediaId);
    const content = await fetchMedia(access, 2 * 1024 * 1024);
    const document = parseDocument(content.bytes, content.contentType);
    assertProductDocument(document, productName);
    await privateWrite(dir, "source.txt", document);
    await privateWrite(dir, "source-private.json", JSON.stringify({ entry, access, contentDigest: digest(content.bytes) }));
    const citationKey = randomUUID();
    report.source = { citationKey, sourceTitle: productName, locatorLabel: "产品资料 / 一级标题与正文",
      supportingExcerpt: null, retrievedAt: new Date().toISOString(), reviewAccess: "ima_client_required" };
    report.stages.push({ name: "source_content", executed: true, status: "PASS", summary: "已获取 UTF-8 文本，原文一级标题与指定型号完全一致。" });
    const image = await documentImage(adapter, kb.id, entry, document, productName);
    const imageContent = await fetchMedia(image.access, 12 * 1024 * 1024);
    const meta = await decodeImage(imageContent.bytes, imageContent.contentType);
    const imageId = randomUUID();
    await privateWrite(dir, "image.bin", imageContent.bytes);
    await privateWrite(dir, "image-private.json", JSON.stringify({ entry: image.entry, access: image.access, documentImagePosition: image.position, parentCitationKey: citationKey }));
    report.image = { imageId, productKey: randomUUID(), sourceView: { ...report.source, citationKey: randomUUID(), locatorLabel: `产品原文内嵌图第 ${image.position} 处` },
      ...meta, availability: "verified", modelMatch: "confirmed", modelMatchSummary: "已核对型号的产品原文直接引用该图片，保留原文嵌入位置与目录链。",
      previewAssetKey: imageId, contentDigest: digest(imageContent.bytes) };
    report.stages.push({ name: "image_asset", executed: true, status: "PASS", summary: "已获取并完整解码原文关联图片；型号依据为已核对产品原文中的直接引用。" });
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
