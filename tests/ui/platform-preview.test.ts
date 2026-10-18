import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DraftPreview, { nextPreviewImage } from "../../src/components/draft-preview";
import type { DraftEditable } from "../../src/contracts/business";
import type { z } from "zod";
import type { ImageView } from "../../src/contracts";
const draft: DraftEditable = { title: "人工构造标题", lead: "人工导语", bodyBlocks: [{ blockKey: "opening", text: "人工第一段正文", factIds: ["synthetic-fact"] }, { blockKey: "closing", text: "人工第二段正文", factIds: [] }], callToAction: "人工行动引导", tags: ["人工标签"], selectedImages: [0, 1, 2].map(index => ({ imageId: `synthetic-image-${index}`, caption: `人工图片说明${index}`, purpose: "人工用途", placement: { blockKey: index < 2 ? "opening" : "closing", position: "before" } })) };
const images: z.infer<typeof ImageView>[] = draft.selectedImages.map((selected, index) => ({ imageId: selected.imageId, productKey: "synthetic-product", fileName: `synthetic-${index}.png`, sourceView: { citationKey: `synthetic-source-${index}`, sourceTitle: "人工来源标题", locatorLabel: `人工索引第${index + 1}行`, supportingExcerpt: null, retrievedAt: "2026-10-18T01:00:00Z", reviewAccess: "available" }, availability: "verified", modelMatch: "confirmed", modelMatchSummary: "人工型号匹配说明", width: 700 + index * 100, height: 900, mimeType: "image/png", previewAssetKey: selected.imageId, contentDigest: "synthetic" }));
function markup(platform: "wechat_article" | "xiaohongshu" | "wechat_moments", override = draft) { return renderToStaticMarkup(createElement(DraftPreview, { runId: "synthetic-run", draft: override, images, platform })); }
test("synthetic: three platform layouts have different reading structures, explicit unpublished status and no fabricated engagement", () => {
  const article = markup("wechat_article"), note = markup("xiaohongshu"), moments = markup("wechat_moments");
  assert.ok(article.includes('class="wechat-article-copy"'));
  assert.ok(article.includes("内容工作台"));
  assert.ok(note.includes('class="note-carousel"'));
  assert.ok(note.includes("小红书笔记 · 模拟预览"));
  assert.ok(moments.includes('class="moments-post"'));
  assert.ok(moments.includes('class="moments-images grid"'));
  for (const html of [article, note, moments]) {
    assert.ok(html.includes("未发布"));
    assert.ok(html.includes("#fact-synthetic-fact"));
    assert.ok(html.includes("人工来源标题"));
    assert.equal(/点赞数|阅读量|[0-9]+人点赞|[0-9]+分钟前/.test(html), false);
  }
});
test("synthetic: note renders current cover, count and working-control targets rather than all inline article images", () => {
  const note = markup("xiaohongshu");
  assert.equal((note.match(/<img /g) ?? []).length, 1);
  assert.ok(note.includes("1 / 3"));
  for (const label of ["上一张图片", "下一张图片", "查看第 2 张图片", "查看第 3 张图片"]) assert.ok(note.includes(label));
  assert.ok(note.includes('tabindex="0"'));
  assert.ok(note.includes('aria-pressed="true"'));
  assert.ok(note.indexOf("人工图片说明0") < note.indexOf("人工第一段正文"));
});
test("synthetic: article preserves inline placement and original image dimensions", () => {
  const article = markup("wechat_article");
  assert.equal((article.match(/<img /g) ?? []).length, 3);
  assert.ok(article.indexOf("人工图片说明1") < article.indexOf("人工第一段正文"));
  assert.ok(article.indexOf("人工第一段正文") < article.indexOf("人工图片说明2"));
  assert.ok(article.indexOf("人工图片说明2") < article.indexOf("人工第二段正文"));
  assert.ok(article.includes('width="700" height="900"'));
});
test("synthetic: moments uses single-image presentation for one photo and retains all sources in a multi-photo grid", () => {
  const single = markup("wechat_moments", { ...draft, selectedImages: draft.selectedImages.slice(0, 1) });
  assert.ok(single.includes('class="moments-images single"'));
  const grid = markup("wechat_moments");
  assert.equal((grid.match(/<img /g) ?? []).length, 3);
  assert.ok(grid.includes("人工索引第3行"));
});
test("synthetic: carousel navigation wraps and handles empty or single image collections", () => {
  assert.equal(nextPreviewImage(0, 3, -1), 2);
  assert.equal(nextPreviewImage(2, 3, 1), 0);
  assert.equal(nextPreviewImage(0, 1, 1), 0);
  assert.equal(nextPreviewImage(0, 0, -1), 0);
});
test("synthetic: empty note image collection remains an explicit incomplete preview", () => {
  const note = markup("xiaohongshu", { ...draft, selectedImages: [] });
  assert.ok(note.includes("尚未选择图片"));
  assert.equal(note.includes("下一张图片"), false);
  assert.equal((note.match(/<img /g) ?? []).length, 0);
});
