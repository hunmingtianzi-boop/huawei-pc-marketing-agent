import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
// VM injects a synthetic SDK only. No actual provider call or credential is used.
async function worker(method: string, sdk: (apiPath: string, body: unknown, options: Record<string, unknown>) => Promise<string>) {
  let output = "";
  const syntheticProcess = { env: { APP_IMA_SCRIPT: "synthetic.cjs", APP_IMA_UPDATE_CACHE: "synthetic-cache", IMA_OPENAPI_CLIENTID: "synthetic-id", IMA_OPENAPI_APIKEY: "synthetic-key" }, stdout: { write: (s: string) => { output += s; return true; } }, stderr: { write: () => true }, exitCode: 0 };
  const context: Record<string, unknown> = {
    process: syntheticProcess, URL, AbortSignal, __filename: "synthetic-worker.cjs",
    fetch: async () => ({ ok: true }),
    require: (name: string) => name === "node:fs" ? { readFileSync: () => JSON.stringify({ method, params: {} }) } : { createRequire: () => () => ({ imaApi: sdk }) },
  };
  vm.runInNewContext(readFileSync("scripts/ima_worker.cjs", "utf8"), context);
  await new Promise<void>(resolve => setImmediate(resolve));
  return { result: JSON.parse(output), context, syntheticProcess };
}
test("synthetic: worker refuses mutation API before loading SDK", async () => {
  let called = false;
  const { result } = await worker("delete_media", async () => { called = true; return "{}"; });
  assert.equal(called, false); assert.equal(result.ok, false);
});
test("synthetic: worker pins auth destination, parses JSON and emits only structured wrapper", async () => {
  const { result, context } = await worker("search_knowledge_base", async (api, _body, options) => {
    assert.equal(api, "openapi/wiki/v1/search_knowledge_base");
    assert.equal(options.baseUrl, "https://ima.qq.com");
    return '{"code":0,"data":{"info_list":[],"is_end":true}}';
  });
  assert.equal(result.ok, true); assert.equal(result.response.code, 0);
  const guardedFetch = context.fetch as (url: string, options: unknown) => Promise<unknown>;
  await assert.rejects(guardedFetch("https://outside.example", {}));
});
test("synthetic: SDK update instruction never reaches parent output", async () => {
  const { result, syntheticProcess } = await worker("get_media_info", async () => { throw Object.assign(new Error("synthetic secret and instruction"), { code: -200 }); });
  assert.deepEqual(result, { ok: false, code: -200 });
  assert.equal(syntheticProcess.exitCode, 1);
});
