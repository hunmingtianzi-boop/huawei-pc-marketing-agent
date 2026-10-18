import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarketingWorkbench from "../../src/components/marketing-workbench";
test("SSR initial workspace labels three platforms and defaults to live without a fabricated draft", () => {
  const markup = renderToStaticMarkup(createElement(MarketingWorkbench));
  for (const label of ["完整产品型号", "目标人群", "使用场景", "发布平台", "内容目标", "朋友圈", "公众号", "小红书", "开始执行"]) assert.ok(markup.includes(label), label);
  assert.ok(markup.includes('value="live" selected=""'));
  assert.ok(markup.includes("synthetic · 人工样例，仅验证逻辑"));
  assert.equal(markup.includes("复制核验成稿"), false);
  assert.equal(markup.includes("当前版本核验通过"), false);
  assert.equal(markup.includes("apiKey"), false);
});

test("synthetic preview places images around the designated text and keeps source labels", async () => {
  const { default: DraftPreview } = await import("../../src/components/draft-preview");
  const draft = { title: "人工标题", lead: "人工导语", bodyBlocks: [{ blockKey: "main", text: "人工正文", factIds: [] }], callToAction: "人工行动", tags: ["人工标签"], selectedImages: [{ imageId: "test-image", caption: "人工图注", purpose: "测试插入位置", placement: { blockKey: "main", position: "before" as const } }] };
  const markup = renderToStaticMarkup(createElement(DraftPreview, { runId: "test-run", draft, images: [{ imageId: "test-image", productKey: "synthetic-product", fileName: "synthetic.png", sourceView: { citationKey: "synthetic-source", sourceTitle: "人工来源标题", locatorLabel: "人工目录第 1 行", supportingExcerpt: null, retrievedAt: "2026-10-18T01:00:00Z", reviewAccess: "available" }, availability: "verified", modelMatch: "confirmed", modelMatchSummary: "人工型号依据", width: 100, height: 100, mimeType: "image/png", previewAssetKey: "test-image", contentDigest: "synthetic" }] }));
  assert.ok(markup.includes("人工来源标题"));
  assert.ok(markup.includes("人工目录第 1 行"));
  assert.ok(markup.includes("/api/runs/test-run/assets/test-image"));
  assert.ok(markup.indexOf("人工图注") < markup.indexOf("人工正文"));
  assert.ok(markup.includes("#人工标签"));
  assert.ok(markup.includes("人工行动"));
});
