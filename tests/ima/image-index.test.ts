import { test } from "node:test";
import assert from "node:assert/strict";
import { indexedImage } from "../../src/server/ima/image-index";
// Synthetic rows reproduce only observed field names. No real source/material is copied.
const header = '\ufeff文件名,产品型号,来源页面,原始图片URL,官网图片说明,宽度,高度,建议用途\n';
test("synthetic: BOM CSV selects exact model and ignores external image URL", () => {
  const image = indexedImage(header + 'a.png,Synthetic Model,https://example.invalid,https://example.invalid/image,"front, green",10,20,test', "Synthetic Model");
  assert.deepEqual(image, { fileName: "a.png", description: "front, green", width: 10, height: 20, row: 2 });
  assert.equal("url" in image, false);
});
test("synthetic: nearby model, malformed dimensions, path traversal and duplicate rows rejected", () => {
  const valid = 'a.png,Synthetic Model,,,front,10,20,test';
  assert.throws(() => indexedImage(header + valid, "Synthetic Model Pro"));
  assert.throws(() => indexedImage(header + valid.replace(',10,20,', ',invalid,20,'), "Synthetic Model"));
  assert.throws(() => indexedImage(header + valid.replace('a.png', '../a.png'), "Synthetic Model"));
  assert.throws(() => indexedImage(header + valid + '\n' + valid, "Synthetic Model"));
});
