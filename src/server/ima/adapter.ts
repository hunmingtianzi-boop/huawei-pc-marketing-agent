import { z } from "zod";
import { ImaError } from "./errors";

export const READ_ONLY_METHODS = ["search_knowledge_base", "get_knowledge_list", "search_knowledge", "get_media_info"] as const;
export type Method = typeof READ_ONLY_METHODS[number];
export type Transport = (method: Method, params: Record<string, unknown>) => Promise<unknown>;
const obj = z.record(z.string(), z.unknown());
const nonempty = z.string().min(1);
export function record(value: unknown): Record<string, unknown> {
  const parsed = obj.safeParse(value);
  if (!parsed.success) throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
  return parsed.data;
}
function requiredString(v: unknown): string {
  const p = nonempty.safeParse(v);
  if (!p.success) throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
  return p.data;
}
export function envelope(raw: unknown) {
  const r = record(raw);
  if (r.code === -200) throw new ImaError("SKILL_UPDATE_REQUIRED", true);
  if (r.code === 110030) throw new ImaError("PERMISSION_DENIED", true);
  if (r.code === 220021) throw new ImaError("RATE_LIMITED", true, "ima 资料获取次数已达当日上限，请明天再尝试。");
  if (r.code === 429 || r.code === 110021) throw new ImaError("RATE_LIMITED", true);
  if (r.code === -100 || r.code === 110010) throw new ImaError("NETWORK_ERROR", true);
  if (typeof r.code !== "number") throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
  if (r.code !== 0) throw new ImaError("PROVIDER_ERROR", true);
  return record(r.data);
}
export function normalizeKnowledgeBase(raw: unknown) {
  const r = record(raw);
  const modern = r.id !== undefined || r.name !== undefined;
  const handbook = r.kb_id !== undefined || r.kb_name !== undefined;
  if (!modern && !handbook) throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
  if (modern && handbook && (r.id !== r.kb_id || r.name !== r.kb_name)) throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
  return { id: requiredString(modern ? r.id : r.kb_id), name: requiredString(modern ? r.name : r.kb_name), mapping: modern ? "id/name" : "kb_id/kb_name" };
}
export type Entry = { mediaId: string; title: string; kind: "folder" | "unknown"; parentFolderId: string | null };
export function normalizeEntry(raw: unknown): Entry {
  const r = record(raw);
  // Explicit FolderInfo vs KnowledgeInfo; never infer a folder from file media_type.
  const folder = r.folder_id !== undefined || r.name !== undefined;
  if (folder && r.media_id !== undefined && r.folder_id !== r.media_id) throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
  return { mediaId: requiredString(folder ? r.folder_id : r.media_id), title: requiredString(folder ? r.name : r.title),
    // Live 2026-10-18: media_type=99 entries were opened successfully; their
    // media_id matched returned FolderInfo.folder_id breadcrumbs.
    kind: folder || r.media_type === 99 ? "folder" : "unknown",
    parentFolderId: typeof r.parent_folder_id === "string" ? r.parent_folder_id : null };
}
export class ImaAdapter {
  constructor(private call: Transport, private maxPages = 8) {}
  async pages(method: Method, params: Record<string, unknown>, listKey: "info_list" | "knowledge_list") {
    const items: unknown[] = [];
    const cursors = new Set<string>();
    let cursor = "";
    for (let page = 0; page < this.maxPages; page++) {
      const d = envelope(await this.call(method, { ...params, cursor }));
      if (!Array.isArray(d[listKey])) throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
      items.push(...d[listKey]);
      // Live search_knowledge sample contains only info_list, with neither
      // pagination field. Treat as one bounded search response, not a full crawl.
      if (method === "search_knowledge" && d.is_end === undefined && d.next_cursor === undefined) return items;
      if (typeof d.is_end !== "boolean") throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
      if (d.is_end) return items;
      const next = requiredString(d.next_cursor);
      if (next === cursor || cursors.has(next)) throw new ImaError("PAGINATION_INVALID");
      cursors.add(next); cursor = next;
    }
    throw new ImaError("BUDGET_EXCEEDED", true);
  }
  async resolveKnowledgeBase(name: string) {
    const lookup = async (query: string) => (await this.pages("search_knowledge_base", { query, limit: 20 }, "info_list")).map(normalizeKnowledgeBase);
    let bases = await lookup(name);
    if (!bases.some(b => b.name === name)) bases = await lookup("");
    const matches = new Map(bases.filter(b => b.name === name).map(b => [b.id, b]));
    if (matches.size === 0) throw new ImaError("KNOWLEDGE_BASE_NOT_FOUND", true);
    if (matches.size > 1) throw new ImaError("KNOWLEDGE_BASE_AMBIGUOUS", true);
    return [...matches.values()][0];
  }
  async listEntries(kb: string, folder?: string) {
    const params = { knowledge_base_id: kb, limit: 50, ...(folder ? { folder_id: folder } : {}) };
    const items = (await this.pages("get_knowledge_list", params, "knowledge_list")).map(normalizeEntry);
    return [...new Map(items.map(i => [i.mediaId, i])).values()];
  }
  async searchEntries(kb: string, query: string) {
    return (await this.pages("search_knowledge", { knowledge_base_id: kb, query }, "info_list")).map(normalizeEntry);
  }
  async findProduct(kb: string, name: string, rootEntries: Entry[]) {
    const hits = await this.searchEntries(kb, name);
    if (hits.length) {
      const folders = hits.filter(e => e.kind === "folder" && e.title === name);
      if (folders.length === 1) return { entries: await this.listEntries(kb, folders[0].mediaId), usedDirectoryFallback: false };
      if (!folders.length && hits.some(e => e.title === "article.md")) return { entries: hits.filter(e => e.kind !== "folder"), usedDirectoryFallback: false };
    }
    // Scope traversal to P1 only; no unrelated library content is read.
    let p1 = rootEntries.filter(e => e.title === "P1-产品参数库");
    if (!p1.length && rootEntries.length === 1 && rootEntries[0].kind === "folder") {
      p1 = (await this.listEntries(kb, rootEntries[0].mediaId)).filter(e => e.title === "P1-产品参数库");
    }
    if (p1.length !== 1) throw new ImaError("MODEL_AMBIGUOUS", true);
    const queue = [{ entry: p1[0], depth: 0 }];
    const visited = new Set<string>();
    let directories = 0;
    while (queue.length) {
      const node = queue.shift()!;
      if (visited.has(node.entry.mediaId)) continue;
      visited.add(node.entry.mediaId);
      if (++directories > 12) throw new ImaError("BUDGET_EXCEEDED", true);
      const children = await this.listEntries(kb, node.entry.mediaId);
      const exact = children.filter(e => e.title === name);
      if (exact.length > 1) throw new ImaError("MODEL_AMBIGUOUS", true);
      if (exact.length === 1) return { entries: await this.listEntries(kb, exact[0].mediaId), usedDirectoryFallback: true };
      // Unknown media_id/title folders need live mapping before traversal is safe.
      for (const entry of children) if (entry.kind === "folder" && node.depth < 2) queue.push({ entry, depth: node.depth + 1 });
    }
    throw new ImaError("MODEL_AMBIGUOUS", true);
  }
  async getMediaAccess(mediaId: string) {
    const d = envelope(await this.call("get_media_info", { media_id: mediaId }));
    if (d.media_type === 11) throw new ImaError("SOURCE_UNAVAILABLE", true); // Explicitly unsupported notebook branch.
    if (!d.url_info) throw new ImaError("MEDIA_UNAVAILABLE", true);
    const info = record(d.url_info);
    const url = requiredString(info.url);
    const headers = z.record(z.string(), z.string()).safeParse(info.headers ?? {});
    if (!headers.success) throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
    return { url, headers: headers.data, mediaType: d.media_type };
  }
}
