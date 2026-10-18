import { test } from "node:test";
import assert from "node:assert/strict";
import { ImaAdapter, envelope, normalizeEntry, normalizeKnowledgeBase, READ_ONLY_METHODS } from "../../src/server/ima/adapter";
import { credentials, credentialState, childEnvironment } from "../../src/server/ima/config";
import { ImaError } from "../../src/server/ima/errors";
// All cases in this file are SYNTHETIC. IDs/credential strings are invented.
const ok = (data: unknown) => ({ code: 0, data });
const page = (items: unknown[], key = "info_list") => ok({ [key]: items, is_end: true });
const errorCode = (code: string) => (error: unknown) => error instanceof ImaError && error.code === code;
test("synthetic: missing credentials do not fall back to undocumented local config", () => {
  assert.equal(credentialState({}).configured, false);
  assert.throws(() => credentials({}), errorCode("CREDENTIALS_MISSING"));
});
test("synthetic: partial or different alias pairs are conflicts", () => {
  for (const env of [
    { IMA_OPENAPI_CLIENTID: "synthetic-a" },
    { IMA_OPENAPI_CLIENTID: "synthetic-a", IMA_API_KEY: "synthetic-b" },
    { IMA_OPENAPI_CLIENTID: "synthetic-a", IMA_OPENAPI_APIKEY: "synthetic-b", IMA_CLIENT_ID: "synthetic-c", IMA_API_KEY: "synthetic-d" },
  ]) assert.throws(() => credentials(env), errorCode("CREDENTIALS_CONFLICT"));
});
test("synthetic: matching complete aliases accepted; child strips endpoint and version overrides", () => {
  const env = { IMA_OPENAPI_CLIENTID: "synthetic-a", IMA_OPENAPI_APIKEY: "synthetic-b", IMA_CLIENT_ID: "synthetic-a", IMA_API_KEY: "synthetic-b", IMA_BASE_URL: "https://invalid.example", IMA_SKILL_VERSION: "fake" };
  assert.equal(credentialState(env).configured, true);
  const child = childEnvironment(env);
  assert.equal(child.IMA_CLIENT_ID, undefined);
  assert.equal(child.IMA_SKILL_VERSION, undefined);
  assert.equal(child.IMA_BASE_URL, "https://ima.qq.com");
  assert.deepEqual(Object.keys(credentialState(env)).sort(), ["canonicalPresent", "configured", "conflict", "legacyPresent"]);
});
test("synthetic: two known knowledge-base field groups normalize and conflicting aliases fail", () => {
  assert.equal(normalizeKnowledgeBase({ id: "k", name: "n" }).mapping, "id/name");
  assert.equal(normalizeKnowledgeBase({ kb_id: "k", kb_name: "n" }).mapping, "kb_id/kb_name");
  assert.throws(() => normalizeKnowledgeBase({ id: "k", name: "n", kb_id: "other", kb_name: "n" }), errorCode("PROVIDER_SCHEMA_UNRECOGNIZED"));
  assert.throws(() => normalizeKnowledgeBase({ nested: { id: "k", name: "n" } }), errorCode("PROVIDER_SCHEMA_UNRECOGNIZED"));
});
test("synthetic: folder and media structures stay distinct, breadcrumb alias conflict rejected", () => {
  assert.equal(normalizeEntry({ folder_id: "f", name: "folder" }).kind, "folder");
  assert.equal(normalizeEntry({ media_id: "m", title: "document" }).kind, "unknown");
  assert.equal(normalizeEntry({ media_id: "f", title: "folder", media_type: 99 }).kind, "folder");
  assert.throws(() => normalizeEntry({ folder_id: "f", name: "folder", media_id: "other" }), errorCode("PROVIDER_SCHEMA_UNRECOGNIZED"));
});
test("synthetic regression from live shape: search without pagination is one bounded response", async () => {
  const adapter = new ImaAdapter(async () => ok({ info_list: [{ media_id: "m", title: "article.md", media_type: 7 }] }));
  assert.equal((await adapter.searchEntries("kb", "Synthetic Model")).length, 1);
  await assert.rejects(new ImaAdapter(async () => ok({ info_list: [], next_cursor: "unexpected" })).searchEntries("kb", "Synthetic"), errorCode("PROVIDER_SCHEMA_UNRECOGNIZED"));
});
test("synthetic regression from live shape: ambiguous search uses wrapper/P1 path, not arbitrary first match", async () => {
  const calls: string[] = [];
  const adapter = new ImaAdapter(async (method, args) => {
    if (method === "search_knowledge") return ok({ info_list: [{ media_id: "other1", title: "Model", media_type: 99 }, { media_id: "other2", title: "Model", media_type: 99 }] });
    calls.push(String(args.folder_id));
    const entries: Record<string, unknown[]> = {
      wrapper: [{ media_id: "p1", title: "P1-产品参数库", media_type: 99 }],
      p1: [{ media_id: "category", title: "01-鸿蒙电脑", media_type: 99 }],
      category: [{ media_id: "model", title: "Model", media_type: 99 }],
      model: [{ media_id: "facts", title: "产品事实.md", media_type: 7, parent_folder_id: "model" }],
    };
    return page(entries[String(args.folder_id)], "knowledge_list");
  });
  const result = await adapter.findProduct("kb", "Model", [{ mediaId: "wrapper", title: "target", kind: "folder", parentFolderId: null }]);
  assert.equal(result.entries[0].title, "产品事实.md");
  assert.deepEqual(calls, ["wrapper", "p1", "category", "model"]);
});
test("synthetic: permission, update, network and malformed schema differ from empty result", () => {
  for (const [code, expected] of [[110030, "PERMISSION_DENIED"], [-200, "SKILL_UPDATE_REQUIRED"], [-100, "NETWORK_ERROR"], [110010, "NETWORK_ERROR"], [429, "RATE_LIMITED"], [110021, "RATE_LIMITED"], [2, "PROVIDER_ERROR"]] as const) assert.throws(() => envelope({ code }), errorCode(expected));
  assert.throws(() => envelope({ code: "0", data: {} }), errorCode("PROVIDER_SCHEMA_UNRECOGNIZED"));
});
test("synthetic: exact library name, visible-library fallback and duplicate-name rejection", async () => {
  const queries: unknown[] = [];
  const adapter = new ImaAdapter(async (_method, args) => {
    queries.push(args.query);
    return page(args.query === "" ? [{ kb_id: "right", kb_name: "target" }] : [{ id: "wrong", name: "similar" }]);
  });
  assert.equal((await adapter.resolveKnowledgeBase("target")).id, "right");
  assert.deepEqual(queries, ["target", ""]);
  await assert.rejects(new ImaAdapter(async () => page([{ id: "a", name: "same" }, { id: "b", name: "same" }])).resolveKnowledgeBase("same"), errorCode("KNOWLEDGE_BASE_AMBIGUOUS"));
});
test("synthetic I-04: empty product search actually enters P1 and model directory", async () => {
  const seen: string[] = [];
  const adapter = new ImaAdapter(async (method, args) => {
    seen.push(`${method}:${args.folder_id ?? ""}`);
    if (method === "search_knowledge") { assert.equal(args.limit, undefined); return page([]); }
    if (args.folder_id === "p1") return page([{ folder_id: "model", name: "Exact Model" }], "knowledge_list");
    return page([{ media_id: "article", title: "article.md", parent_folder_id: "model" }], "knowledge_list");
  });
  const result = await adapter.findProduct("kb", "Exact Model", [{ mediaId: "p1", title: "P1-产品参数库", kind: "folder", parentFolderId: null }]);
  assert.equal(result.usedDirectoryFallback, true);
  assert.equal(result.entries[0].title, "article.md");
  assert.deepEqual(seen, ["search_knowledge:", "get_knowledge_list:p1", "get_knowledge_list:model"]);
});
test("synthetic I-08: multipage directories deduplicate entries and preserve cursor", async () => {
  const adapter = new ImaAdapter(async (_m, args) => ok({ knowledge_list: [{ media_id: "m", title: "doc" }], is_end: args.cursor === "next", next_cursor: "next" }));
  assert.equal((await adapter.listEntries("kb")).length, 1);
});
test("synthetic: a confirmed product folder search hit is opened before article selection", async () => {
  const calls: string[] = [];
  const adapter = new ImaAdapter(async (method, args) => {
    calls.push(method);
    if (method === "search_knowledge") return page([{ folder_id: "f", name: "Exact Model" }]);
    assert.equal(args.folder_id, "f");
    return page([{ media_id: "a", title: "article.md", parent_folder_id: "f" }], "knowledge_list");
  });
  const result = await adapter.findProduct("kb", "Exact Model", []);
  assert.equal(result.entries[0].title, "article.md");
  assert.deepEqual(calls, ["search_knowledge", "get_knowledge_list"]);
});
test("synthetic I-08: repeated/missing cursor and traversal budget fail explicitly", async () => {
  await assert.rejects(new ImaAdapter(async () => ok({ info_list: [], is_end: false, next_cursor: "loop" })).pages("search_knowledge", {}, "info_list"), errorCode("PAGINATION_INVALID"));
  await assert.rejects(new ImaAdapter(async () => ok({ info_list: [], is_end: false })).pages("search_knowledge", {}, "info_list"), errorCode("PROVIDER_SCHEMA_UNRECOGNIZED"));
  await assert.rejects(new ImaAdapter(async () => ok({ info_list: [], is_end: false, next_cursor: "next" }), 1).pages("search_knowledge", {}, "info_list"), errorCode("BUDGET_EXCEEDED"));
});
test("synthetic I-06/I-07: code=0 without link or notebook never means original content read", async () => {
  await assert.rejects(new ImaAdapter(async () => ok({ media_type: 1 })).getMediaAccess("m"), errorCode("MEDIA_UNAVAILABLE"));
  await assert.rejects(new ImaAdapter(async () => ok({ media_type: 11, notebook_ext_info: { notebook_id: "n" } })).getMediaAccess("m"), errorCode("SOURCE_UNAVAILABLE"));
  const access = await new ImaAdapter(async () => ok({ media_type: 9, url_info: { url: "https://example.qq.com/image", headers: { "x-synthetic-token": "test" } } })).getMediaAccess("m");
  assert.equal(access.headers["x-synthetic-token"], "test");
});
test("synthetic: source reads use an explicit four-method allowlist", () => {
  assert.deepEqual(READ_ONLY_METHODS, ["search_knowledge_base", "get_knowledge_list", "search_knowledge", "get_media_info"]);
});
