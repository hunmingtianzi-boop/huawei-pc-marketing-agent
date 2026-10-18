import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { LocalCatalog, ProductEvidence, type LocalSourceOptions, type RetrievalRequest, type RetrievalResult, type RetrievalServices } from "../../contracts/business";
import type { SourceView } from "../../contracts";
import { evidenceDigest } from "../../contracts/digests";
import { decodeImage } from "../assets/media";
import { ImaError } from "./errors";
import { extractFacts } from "./facts";
import { indexedImages } from "./image-index";

const P1 = "P1-产品参数库";
const CATEGORIES = ["01-鸿蒙电脑", "02-MateBook-Windows"] as const;
const MAX_PRODUCTS = 100;
const DOC_LIMIT = 2 * 1024 * 1024;
const IMAGE_LIMIT = 12 * 1024 * 1024;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const unavailable = () => new ImaError("SOURCE_UNAVAILABLE", true, "授权本地知识库资料不可读取，请核对本机目录和文件。");
const rejected = () => new ImaError("MEDIA_UNAVAILABLE", true, "本地素材路径或文件未通过安全检查。");
const isMissing = (e: unknown) => e instanceof Error && "code" in e && ["ENOENT", "ENOTDIR"].includes(String(e.code));

/** Only a server-owned root is accepted; no request field is used as a path. */
async function sourceRoot(options: LocalSourceOptions) {
  const configured = path.resolve(options.rootDir ?? process.env.LOCAL_KB_ROOT ?? path.join(process.cwd(), "华为PC全板块深度知识库_v7"));
  const info = await lstat(configured);
  if (info.isSymbolicLink() || !info.isDirectory()) throw rejected();
  return realpath(configured);
}
function contained(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw rejected();
}
function safePart(part: string) {
  if (!part || part === "." || part === ".." || /[/\\\u0000]/.test(part)) throw rejected();
}
async function safePath(root: string, parts: string[], directory: boolean) {
  let target = root;
  for (let index = 0; index < parts.length; index++) {
    safePart(parts[index]);
    target = path.join(target, parts[index]);
    const info = await lstat(target);
    if (info.isSymbolicLink() || (index < parts.length - 1 || directory) && !info.isDirectory()) throw rejected();
    contained(root, await realpath(target));
  }
  return target;
}
async function readBounded(root: string, parts: string[], maxBytes: number) {
  const target = await safePath(root, parts, false);
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw rejected();
    // Recheck the opened inode and canonical path before reading, so swapped
    // final links or directory components do not redirect reads outside root.
    contained(root, await realpath(target));
    const current = await lstat(target);
    if (current.isSymbolicLink() || current.ino !== stat.ino || current.dev !== stat.dev) throw rejected();
    const buffer = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count < buffer.length) {
      const read = await handle.read(buffer, count, buffer.length - count, null);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    if (count > maxBytes) throw rejected();
    return buffer.subarray(0, count);
  } finally { await handle.close(); }
}
function text(bytes: Buffer) {
  let value: string;
  try { value = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw unavailable(); }
  if (!value.trim() || value.includes("\u0000") || /<(!doctype|html|form)[\s>]/i.test(value)) throw unavailable();
  return value;
}
type Product = { parts: string[]; imageDirectory: string | null; displayName: string; document: string; documentBytes: Buffer; index: ReturnType<typeof indexedImages>; indexBytes: Buffer };
function heading(document: string) {
  return document.split(/\r?\n/).find(line => /^#\s+/.test(line))?.replace(/^#\s+/, "").replace(/ - 产品事实$/, "").trim();
}
async function loadProduct(root: string, category: string, folder: string): Promise<Product> {
  const parts = [P1, category, folder];
  const documentBytes = await readBounded(root, [...parts, "产品事实.md"], DOC_LIMIT);
  const document = text(documentBytes);
  const displayName = heading(document);
  const qualified = category === CATEGORIES[0] ? `${folder}（鸿蒙版）` : `${folder}（Windows版）`;
  if (!displayName || displayName !== folder && displayName !== qualified) throw new ImaError("MODEL_PARAMETER_MISMATCH", false, "本地产品原文标题与所在精确型号目录不一致。");
  // System qualifiers must agree with the explicit system category.
  if (category === CATEGORIES[1] && /鸿蒙版/.test(displayName) || category === CATEGORIES[0] && /Windows版/i.test(displayName)) throw new ImaError("MODEL_PARAMETER_MISMATCH");
  const indexBytes = await readBounded(root, [...parts, "图片索引.csv"], DOC_LIMIT);
  const imageDirectories: string[] = [];
  for (const name of ["图片", "images"]) {
    try { await safePath(root, [...parts, name], true); imageDirectories.push(name); }
    catch (error) { if (!isMissing(error)) throw error; }
  }
  if (imageDirectories.length > 1) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true, "同型号存在多个本地图片目录，需确认唯一素材位置。");
  return { parts, imageDirectory: imageDirectories[0] ?? null, displayName, document, documentBytes, index: indexedImages(text(indexBytes), displayName), indexBytes };
}
async function productDirectories(root: string) {
  const result: { category: string; folder: string }[] = [];
  for (const category of CATEGORIES) {
    let target: string;
    try { target = await safePath(root, [P1, category], true); } catch (error) { if (isMissing(error)) continue; throw error; }
    const entries = await readdir(target, { withFileTypes: true });
    if (entries.length > MAX_PRODUCTS) throw new ImaError("BUDGET_EXCEEDED", true);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (!entry.isDirectory()) continue;
      safePart(entry.name);
      result.push({ category, folder: entry.name });
      if (result.length > MAX_PRODUCTS) throw new ImaError("BUDGET_EXCEEDED", true);
    }
  }
  return result.sort((a, b) => a.category.localeCompare(b.category) || a.folder.localeCompare(b.folder));
}
function imageType(fileName: string) {
  const type = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" } as Record<string, string>)[path.extname(fileName).toLowerCase()];
  if (!type) throw rejected();
  return type;
}
function imageFailure(error: unknown) {
  return isMissing(error) || error instanceof ImaError && ["MEDIA_UNAVAILABLE", "IMAGE_MODEL_UNCONFIRMED"].includes(error.code);
}

/** A bounded catalog reports only decoded, exact-model, distinct local files. */
export async function readLocalCatalog(options: LocalSourceOptions = {}): Promise<LocalCatalog> {
  let root: string;
  try { root = await sourceRoot(options); } catch { return { sourceMode: "local", available: false, products: [] }; }
  const products: LocalCatalog["products"] = [];
  const directories = await productDirectories(root);
  for (const directory of directories) {
    try {
      const product = await loadProduct(root, directory.category, directory.folder);
      const digests = new Set<string>();
      for (const candidate of product.imageDirectory ? product.index.slice(0, 6) : []) {
        try {
          const bytes = await readBounded(root, [...product.parts, product.imageDirectory!, candidate.fileName], IMAGE_LIMIT);
          const meta = await decodeImage(bytes, imageType(candidate.fileName));
          if (meta.width === candidate.width && meta.height === candidate.height) digests.add(hash(bytes));
        } catch (error) { if (!imageFailure(error)) throw error; }
      }
      products.push({ productRequest: product.displayName, displayName: product.displayName, imageCount: digests.size });
    } catch (error) {
      // Invalid individual product folders are not offered as selectable models.
      if (!(error instanceof ImaError) && !isMissing(error)) throw unavailable();
      if (error instanceof ImaError && error.code === "BUDGET_EXCEEDED") throw error;
    }
  }
  return LocalCatalog.parse({ sourceMode: "local", available: true, products });
}

export async function retrieveLocalEvidence(request: RetrievalRequest, services: RetrievalServices, options: LocalSourceOptions = {}): Promise<RetrievalResult> {
  if (request.mode !== "local") throw new ImaError("REQUEST_REJECTED", false, "本地资料入口仅接受 local 模式。");
  const requested = request.productRequest.trim();
  if (!requested || /[/\\\u0000]/.test(requested)) throw new ImaError("MODEL_AMBIGUOUS", true);
  try {
    const root = await sourceRoot(options);
    const directories = await productDirectories(root);
    const exactMatches: Product[] = [];
    const directoryAliases: Product[] = [];
    for (const directory of directories) {
      // Exact directory identities only; display suffixes may be explicit
      // HarmonyOS/Windows qualifiers, never Pro/year substring matching.
      if (![directory.folder, `${directory.folder}（鸿蒙版）`, `${directory.folder}（Windows版）`].includes(requested)) continue;
      const product = await loadProduct(root, directory.category, directory.folder);
      if (requested === product.displayName) exactMatches.push(product);
      else if (requested === directory.folder) directoryAliases.push(product);
    }
    const matches = exactMatches.length ? exactMatches : directoryAliases;
    if (matches.length !== 1) throw new ImaError("MODEL_AMBIGUOUS", true, "本地资料中未找到唯一精确型号，请从本地产品列表选择完整型号。");
    const selected = matches[0];
    const at = new Date().toISOString();
    const product: ProductEvidence["product"] = { productKey: randomUUID(), displayName: selected.displayName, variant: selected.parts[1] === CATEGORIES[0] ? { system: "HarmonyOS" } : { system: "Windows" }, resolutionBasis: "已授权本地知识库 P1 系统分类、精确型号目录与产品事实原文一级标题一致；未调用 ima。" };
    const locator = selected.parts.join("/");
    const extracted = extractFacts(selected.document, product.productKey, product.displayName, `${locator}/产品事实.md`, at);
    for (const source of extracted.sources) source.reviewAccess = "available";
    const documentSource: SourceView = { citationKey: randomUUID(), sourceTitle: `${product.displayName} / 本地产品事实`, locatorLabel: `${locator}/产品事实.md`, supportingExcerpt: null, retrievedAt: at, reviewAccess: "available" };
    const sources: SourceView[] = [documentSource, ...extracted.sources];
    const images: ProductEvidence["images"] = [];
    const assets: RetrievalResult["assets"] = [];
    const coverageGaps = [...extracted.coverageGaps];
    const seen = new Set<string>();
    await services.persistPrivate("local-source.txt", selected.document);
    await services.persistPrivate("local-image-index.csv", selected.indexBytes);
    await services.persistPrivate("local-source-private.json", JSON.stringify({ sourceMode: "local", relativeDocument: `${locator}/产品事实.md`, contentDigest: hash(selected.documentBytes) }));
    for (const candidate of selected.imageDirectory ? selected.index.slice(0, 6) : []) {
      try {
        const bytes = await readBounded(root, [...selected.parts, selected.imageDirectory!, candidate.fileName], IMAGE_LIMIT);
        const mimeType = imageType(candidate.fileName);
        const meta = await services.decodeImage(bytes, mimeType);
        if (meta.width !== candidate.width || meta.height !== candidate.height || meta.mimeType !== mimeType) throw rejected();
        const contentDigest = hash(bytes);
        if (seen.has(contentDigest)) { coverageGaps.push(`本地图片索引第 ${candidate.row} 行与已取得图片重复，未计入数量。`); continue; }
        seen.add(contentDigest);
        const imageId = randomUUID();
        const imageSource: SourceView = { citationKey: randomUUID(), sourceTitle: candidate.fileName, locatorLabel: `${locator}/图片索引.csv 第 ${candidate.row} 行；${selected.imageDirectory}/${candidate.fileName}`, supportingExcerpt: `产品型号：${product.displayName}；图片说明：${candidate.description}`.slice(0, 600), retrievedAt: at, reviewAccess: "available" };
        sources.push(imageSource);
        images.push({ imageId, productKey: product.productKey, fileName: candidate.fileName, sourceView: imageSource, ...meta, availability: "verified", modelMatch: "confirmed", modelMatchSummary: "授权本地知识库索引精确标注型号；本地原件实际解码、尺寸匹配且内容摘要不同。", previewAssetKey: imageId, contentDigest });
        assets.push({ imageId, bytes, mimeType });
        await services.persistPrivate(`local-image-${imageId}.bin`, bytes);
        await services.persistPrivate(`local-image-${imageId}-private.json`, JSON.stringify({ relativeFile: `${locator}/${selected.imageDirectory}/${candidate.fileName}`, indexRow: candidate.row, contentDigest }));
      } catch (error) {
        if (!imageFailure(error)) throw error;
        coverageGaps.push(`本地图片索引第 ${candidate.row} 行未通过原件、安全路径、完整解码或尺寸检查。`);
      }
    }
    if (!images.length) coverageGaps.push("尚无型号可证且可解码的授权本地图片，不能标为完整成稿。");
    const draft = { evidenceSetId: randomUUID(), product, retrievedAt: at, provenanceMode: "local" as const, sources, facts: extracted.facts, images, conflicts: extracted.conflicts, coverageGaps };
    return { evidence: ProductEvidence.parse({ ...draft, snapshotDigest: evidenceDigest(draft) }), assets, documents: [{ sourceId: documentSource.citationKey, title: product.displayName, locator: `${locator}/产品事实.md`, text: selected.document }] };
  } catch (error) { if (error instanceof ImaError) throw error; throw unavailable(); }
}
