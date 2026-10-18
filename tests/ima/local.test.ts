import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm, symlink, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { retrieveLocalEvidence, readLocalCatalog } from "../../src/server/ima/local";
import { ProductEvidence, type RetrievalServices } from "../../src/contracts/business";
import { evidenceDigest } from "../../src/contracts/digests";
import { decodeImage } from "../../src/server/assets/media";
import { ImaError } from "../../src/server/ima/errors";

// SYNTHETIC ONLY: each test creates/removes its own artificial tree below the
// allocated ignored artifact directory. No user KB or credentials are read.
const artifactRoot = path.join(process.cwd(), ".local-evidence", "delivery");
const name = "HUAWEI MateBook 14（鸿蒙版）";
const directory = "HUAWEI MateBook 14";
const doc = (model = name) => `# ${model} - 产品事实\n\n## 来源\nhttps://example.invalid/do-not-fetch\n\n## 屏幕\n人工测试屏幕为14英寸。\n\n## 电池\n人工测试使用8小时，限定亮度50%、本地编辑。\n\n## 注意事项\n人工测试参数，不代表真实产品。\n`;
const errorCode = (code: string) => (error: unknown) => error instanceof ImaError && error.code === code;
async function fixture(options: { imageDirectory?: string; duplicate?: boolean; badSize?: boolean; corrupt?: boolean; wrongModel?: boolean; imageCount?: number } = {}) {
  await mkdir(artifactRoot, { recursive: true });
  const tmp = await mkdtemp(path.join(artifactRoot, "local-test-"));
  const root = path.join(tmp, "kb");
  const product = path.join(root, "P1-产品参数库", "01-鸿蒙电脑", directory);
  const imageDirectory = options.imageDirectory ?? "图片";
  await mkdir(path.join(product, imageDirectory), { recursive: true });
  await mkdir(path.join(root, "P1-产品参数库", "02-MateBook-Windows"), { recursive: true });
  await writeFile(path.join(product, "产品事实.md"), doc());
  const imageCount = options.imageCount ?? 4;
  const pixels = await Promise.all(Array.from({ length: imageCount }, (_, i) => sharp({ create: { width: 20, height: 12, channels: 4, background: { r: 20 + i * 20, g: 80, b: 30, alpha: 1 } } }).png().toBuffer()));
  await writeFile(path.join(product, "图片索引.csv"), '\ufeff文件名,产品型号,官网图片说明,宽度,高度,原始图片URL\n' + pixels.map((_, i) => `synthetic-${i}.png,${options.wrongModel ? "HUAWEI MateBook 14 Pro" : name},人工图${i},${options.badSize ? 21 : 20},12,https://outside.invalid/no-network`).join('\n'));
  for (const [i, bytes] of pixels.entries()) await writeFile(path.join(product, imageDirectory, `synthetic-${i}.png`), options.corrupt && i === 0 ? "not-an-image" : options.duplicate ? pixels[0] : bytes);
  const files = new Map<string, string | Uint8Array>();
  const services: RetrievalServices = {
    callIma: async () => { throw new Error("local must never call ima"); },
    fetchMedia: async () => { throw new Error("local must never fetch URLs"); },
    decodeImage,
    persistPrivate: async (file, bytes) => { files.set(file, bytes); },
  };
  return { root, tmp, product, services, files, cleanup: () => rm(tmp, { recursive: true, force: true }) };
}
const request = (productRequest = name) => ({ runId: randomUUID(), productRequest, mode: "local" as const });
test("synthetic local: catalog and retrieval decode four exact-model files without network, safe relative evidence", async () => {
  const f = await fixture();
  try {
    const catalog = await readLocalCatalog({ rootDir: f.root });
    assert.deepEqual(catalog, { sourceMode: "local", available: true, products: [{ productRequest: name, displayName: name, imageCount: 4 }] });
    const result = await retrieveLocalEvidence(request(), f.services, { rootDir: f.root });
    assert.equal(result.evidence.provenanceMode, "local");
    assert.equal(result.evidence.images.length, 4);
    assert.equal(result.evidence.facts.length, 2);
    assert.equal(result.evidence.snapshotDigest, evidenceDigest(result.evidence));
    assert.ok(ProductEvidence.safeParse(result.evidence).success);
    assert.ok(result.evidence.sources.every(source => source.reviewAccess === "available"));
    assert.ok(result.evidence.images.every(image => image.modelMatch === "confirmed" && image.productKey === result.evidence.product.productKey));
    for (const forbidden of [f.root, "https://", "Authorization", "外链"]) assert.ok(!JSON.stringify(result.evidence).includes(forbidden));
    assert.ok(result.evidence.sources.every(source => !path.isAbsolute(source.locatorLabel)));
    assert.ok(f.files.has("local-source.txt"));
    assert.ok(f.files.has("local-image-index.csv"));
  } finally { await f.cleanup(); }
});
test("synthetic local: legacy images directory is supported without changing remote ima", async () => {
  const f = await fixture({ imageDirectory: "images" });
  try { assert.equal((await retrieveLocalEvidence(request(), f.services, { rootDir: f.root })).assets.length, 4); }
  finally { await f.cleanup(); }
});
test("synthetic local: duplicate, damaged and size-mismatched files never inflate valid image count", async () => {
  for (const [options, expected] of [[{ duplicate: true }, 1], [{ corrupt: true }, 3], [{ badSize: true }, 0]] as const) {
    const f = await fixture(options);
    try {
      assert.equal((await readLocalCatalog({ rootDir: f.root })).products[0].imageCount, expected);
      const result = await retrieveLocalEvidence(request(), f.services, { rootDir: f.root });
      assert.equal(result.assets.length, expected);
      assert.ok(result.evidence.coverageGaps.length > 0);
    } finally { await f.cleanup(); }
  }
});
test("synthetic local: Pro/year/full-name identity and CSV model mismatch cannot pass by filename", async () => {
  const f = await fixture();
  try {
    for (const model of ["HUAWEI MateBook 14 Pro", "HUAWEI MateBook 14 2025", "../HUAWEI MateBook 14"]) await assert.rejects(retrieveLocalEvidence(request(model), f.services, { rootDir: f.root }), errorCode("MODEL_AMBIGUOUS"));
    await writeFile(path.join(f.product, "产品事实.md"), doc("HUAWEI MateBook 14 Pro"));
    await assert.rejects(retrieveLocalEvidence(request(), f.services, { rootDir: f.root }), errorCode("MODEL_PARAMETER_MISMATCH"));
    assert.equal((await readLocalCatalog({ rootDir: f.root })).products.length, 0);
  } finally { await f.cleanup(); }
  const wrong = await fixture({ wrongModel: true });
  try { await assert.rejects(retrieveLocalEvidence(request(), wrong.services, { rootDir: wrong.root }), errorCode("IMAGE_MODEL_UNCONFIRMED")); }
  finally { await wrong.cleanup(); }
});
test("synthetic local: Windows category retains exact year identity and local fact conditions", async () => {
  const f = await fixture();
  try {
    const windowsName = "HUAWEI MateBook X Pro 2025";
    const windows = path.join(f.root, "P1-产品参数库", "02-MateBook-Windows", windowsName);
    await mkdir(path.join(windows, "图片"), { recursive: true });
    await writeFile(path.join(windows, "产品事实.md"), doc(windowsName));
    const csv = (await readFile(path.join(f.product, "图片索引.csv"), "utf8")).replaceAll(name, windowsName);
    await writeFile(path.join(windows, "图片索引.csv"), csv);
    for (let i = 0; i < 4; i++) await writeFile(path.join(windows, "图片", `synthetic-${i}.png`), await readFile(path.join(f.product, "图片", `synthetic-${i}.png`)));
    const result = await retrieveLocalEvidence(request(windowsName), f.services, { rootDir: f.root });
    assert.equal(result.evidence.product.variant.system, "Windows");
    assert.equal(result.evidence.conflicts.length, 0);
    assert.ok(result.evidence.facts.every(fact => fact.status === "supported"));
    assert.ok(result.evidence.facts.some(fact => fact.supportedStatement.includes("亮度50%")));
    assert.equal((await readLocalCatalog({ rootDir: f.root })).products.length, 2);
  } finally { await f.cleanup(); }
});
test("synthetic local: exact Windows H1 outranks a HarmonyOS directory alias without mixing systems", async () => {
  const f = await fixture();
  try {
    const windows = path.join(f.root, "P1-产品参数库", "02-MateBook-Windows", directory);
    await mkdir(path.join(windows, "图片"), { recursive: true });
    await writeFile(path.join(windows, "产品事实.md"), doc(directory));
    await writeFile(path.join(windows, "图片索引.csv"), (await readFile(path.join(f.product, "图片索引.csv"), "utf8")).replaceAll(name, directory));
    for (let i = 0; i < 4; i++) await writeFile(path.join(windows, "图片", `synthetic-${i}.png`), await readFile(path.join(f.product, "图片", `synthetic-${i}.png`)));
    const result = await retrieveLocalEvidence(request(directory), f.services, { rootDir: f.root });
    assert.equal(result.evidence.product.variant.system, "Windows");
    assert.ok(result.evidence.sources.every(source => source.locatorLabel.includes("02-MateBook-Windows")));
    const harmony = await retrieveLocalEvidence(request(), f.services, { rootDir: f.root });
    assert.equal(harmony.evidence.product.variant.system, "HarmonyOS");
  } finally { await f.cleanup(); }
});
test("synthetic local: final symlink and symlinked image directory never read outside root", async () => {
  const f = await fixture();
  try {
    const outside = path.join(f.tmp, "outside.png");
    await writeFile(outside, await readFile(path.join(f.product, "图片", "synthetic-0.png")));
    await rm(path.join(f.product, "图片", "synthetic-0.png"));
    await symlink(outside, path.join(f.product, "图片", "synthetic-0.png"));
    let decoded = 0;
    const original = f.services.decodeImage;
    f.services.decodeImage = async (...args) => { decoded++; return original(...args); };
    const result = await retrieveLocalEvidence(request(), f.services, { rootDir: f.root });
    assert.equal(result.assets.length, 3);
    assert.equal(decoded, 3);
    await rm(path.join(f.product, "图片"), { recursive: true });
    await symlink(f.tmp, path.join(f.product, "图片"));
    await assert.rejects(retrieveLocalEvidence(request(), f.services, { rootDir: f.root }), errorCode("MEDIA_UNAVAILABLE"));
  } finally { await f.cleanup(); }
});
test("synthetic local: symlinked source/root, traversal CSV, over-budget source and dual image directories rejected", async () => {
  const f = await fixture();
  try {
    const alias = path.join(f.tmp, "alias");
    await symlink(f.root, alias);
    assert.equal((await readLocalCatalog({ rootDir: alias })).available, false);
    await assert.rejects(retrieveLocalEvidence(request(), f.services, { rootDir: alias }), errorCode("MEDIA_UNAVAILABLE"));
    await mkdir(path.join(f.product, "images"));
    await assert.rejects(retrieveLocalEvidence(request(), f.services, { rootDir: f.root }), errorCode("IMAGE_MODEL_UNCONFIRMED"));
    await rm(path.join(f.product, "images"), { recursive: true });
    const csvPath = path.join(f.product, "图片索引.csv");
    const original = await readFile(csvPath, "utf8");
    await writeFile(csvPath, original.replace("synthetic-0.png", "../outside.png"));
    await assert.rejects(retrieveLocalEvidence(request(), f.services, { rootDir: f.root }), errorCode("MEDIA_UNAVAILABLE"));
    await writeFile(csvPath, original);
    await writeFile(path.join(f.product, "产品事实.md"), Buffer.alloc(2 * 1024 * 1024 + 1));
    await assert.rejects(retrieveLocalEvidence(request(), f.services, { rootDir: f.root }), errorCode("MEDIA_UNAVAILABLE"));
    await rm(path.join(f.product, "产品事实.md"));
    await writeFile(path.join(f.tmp, "outside.md"), doc());
    await symlink(path.join(f.tmp, "outside.md"), path.join(f.product, "产品事实.md"));
    await assert.rejects(retrieveLocalEvidence(request(), f.services, { rootDir: f.root }), errorCode("MEDIA_UNAVAILABLE"));
  } finally { await f.cleanup(); }
});
test("synthetic local: conflicts and missing files remain explicit; mode and collection bounds enforced", async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.product, "产品事实.md"), doc() + '\n## 电池\n人工测试使用9小时。');
    const result = await retrieveLocalEvidence(request(), f.services, { rootDir: f.root });
    assert.ok(result.evidence.conflicts.length > 0);
    await assert.rejects(retrieveLocalEvidence({ ...request(), mode: "live" }, f.services, { rootDir: f.root }), errorCode("REQUEST_REJECTED"));
    assert.deepEqual(await readLocalCatalog({ rootDir: path.join(f.tmp, "absent") }), { sourceMode: "local", available: false, products: [] });
    for (let index = 0; index < 101; index++) await mkdir(path.join(f.root, "P1-产品参数库", "02-MateBook-Windows", `Synthetic${index}`));
    await assert.rejects(readLocalCatalog({ rootDir: f.root }), errorCode("BUDGET_EXCEEDED"));
  } finally { await f.cleanup(); }
});
