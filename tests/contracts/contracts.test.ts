import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SourceView, ProbeReport, CONTRACT_VERSION, IMAGE_COUNTS } from "../../src/contracts";
import { localRequest } from "../../src/server/runs/local-access";
test("synthetic: safe source view rejects provider IDs, raw URLs, headers and full raw objects", () => {
  const source = { citationKey: randomUUID(), sourceTitle: "Synthetic title", locatorLabel: "section", supportingExcerpt: null, retrievedAt: new Date().toISOString(), reviewAccess: "unavailable" };
  assert.equal(SourceView.safeParse(source).success, true);
  for (const key of ["providerRefs", "url", "headers", "raw", "privateContentRef"]) assert.equal(SourceView.safeParse({ ...source, [key]: "synthetic-private" }).success, false);
});
test("synthetic: mode explicit, identity never invented, contract version enforced", () => {
  const report = { reportId: randomUUID(), contractVersion: CONTRACT_VERSION, mode: "synthetic", status: "BLOCKED", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), stages: [], skillVersion: null, accountIdentity: "not_verified", product: null, source: null, image: null };
  assert.equal(ProbeReport.safeParse(report).success, true);
  assert.equal(ProbeReport.safeParse({ ...report, mode: "demo" }).success, false);
  assert.equal(ProbeReport.safeParse({ ...report, accountIdentity: "verified" }).success, false);
  assert.equal(ProbeReport.safeParse({ ...report, status: "PASS" }).success, false);
});
test("synthetic: platform count rules kept distinct from one-image foundation gate", () => {
  assert.deepEqual(IMAGE_COUNTS, { wechat_article: { min: 2, max: 4 }, xiaohongshu: { min: 3, max: 6 }, wechat_moments: { min: 1, max: 3 } });
});
test("synthetic: probe mutation requires loopback host and exact same origin", () => {
  const req = (host: string, origin: string) => new Request("http://127.0.0.1:3210/api/connection", { headers: { host, origin } });
  assert.equal(localRequest(req("127.0.0.1:3210", "http://127.0.0.1:3210"), true), true);
  assert.equal(localRequest(req("127.0.0.1:3210", "https://outside.example"), true), false);
  assert.equal(localRequest(req("outside.example", "http://127.0.0.1:3210"), true), false);
  assert.equal(localRequest(new Request("http://127.0.0.1:3210", { headers: { host: "127.0.0.1:3210" } }), true), false);
  assert.equal(localRequest(new Request("http://0.0.0.0:3210", { headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210" } }), true), true);
});
