import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ProbeReport } from "../src/contracts";

async function main() {
  const base = process.env.APP_TEST_URL ?? "http://127.0.0.1:3210";
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const checks: { name: string; status: "PASS" }[] = [];
  const check = (name: string) => checks.push({ name, status: "PASS" });
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200); assert.equal((await health.json()).status, "ok"); check("health GET");
  const html = await (await fetch(base)).text();
  assert.ok(html.includes("连接检查") && html.includes("PC 内容工作台")); check("server-rendered application");
  const config = await fetch(`${base}/api/connection`);
  assert.equal(config.status, 200); assert.equal(config.headers.get("cache-control"), "no-store");
  const state = await config.json();
  assert.deepEqual(Object.keys(state).sort(), ["contractVersion", "credentials", "modelConfigured", "report", "scope"]);
  assert.deepEqual(Object.keys(state.credentials).sort(), ["canonicalPresent", "configured", "conflict", "legacyPresent"]); check("safe connection DTO");
  const post = (body: string, origin?: string) => fetch(`${base}/api/connection`, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body });
  assert.equal((await post("{}", "https://outside.example")).status, 403); check("cross-origin mutation rejected");
  assert.equal((await post("{}")).status, 403); check("mutation missing Origin rejected");
  assert.equal((await post("not json", base)).status, 400); check("malformed input rejected");
  assert.equal((await post(JSON.stringify({ productName: "" }), base)).status, 400); check("missing model rejected");
  assert.equal((await fetch(`${base}/api/assets/${randomUUID()}`)).status, 404); check("unknown asset denied");
  // This check never invents provider credentials. It exercises the actual local preflight.
  const response = await post(JSON.stringify({ productName: "HUAWEI MateBook 14" }), base);
  assert.equal(response.status, 200);
  const report = ProbeReport.parse((await response.json()).report);
  assert.equal(report.mode, "live");
  if (!state.credentials.configured) {
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.stages.find(s => s.name === "credentials")?.executed, true);
    assert.equal(report.stages.find(s => s.name === "knowledge_base_access")?.executed, false);
    assert.equal(report.source, null); assert.equal(report.image, null);
    check("actual missing-credential preflight BLOCKED without downstream calls");
  } else check("actual configured preflight reported honestly");
  const result = { checkedAt: new Date().toISOString(), mode: "local-http", base, checks, reportId: report.reportId, liveGate: report.status };
  await mkdir(".local-evidence/foundation", { recursive: true });
  await writeFile(".local-evidence/foundation/http.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error("HTTP acceptance FAIL:", error instanceof Error ? error.message : "unknown assertion failure"); process.exitCode = 1; });
