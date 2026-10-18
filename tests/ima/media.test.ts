import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { decodeImage, parseDocument, publicAddress, fetchMedia } from "../../src/server/assets/media";
test("synthetic: image must fully decode and match MIME; HTML and truncated image rejected", async () => {
  const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: "white" } }).png().toBuffer();
  assert.deepEqual(await decodeImage(png, "image/png"), { width: 2, height: 3, mimeType: "image/png" });
  await assert.rejects(decodeImage(Buffer.from("<html>login</html>"), "image/png"));
  await assert.rejects(decodeImage(png, "image/jpeg"));
  await assert.rejects(decodeImage(png.subarray(0, 40), "image/png"));
});
test("synthetic: source content rejects HTML login, binary, invalid UTF-8 and unsupported PDF", () => {
  assert.throws(() => parseDocument(Buffer.from("<html>" + "login".repeat(15)), "text/plain"));
  assert.throws(() => parseDocument(Buffer.from([0xff, 0xfe]), "text/plain"));
  assert.throws(() => parseDocument(Buffer.alloc(50), "application/pdf"));
  assert.ok(parseDocument(Buffer.from("# Synthetic Model\n" + "synthetic product text ".repeat(5)), "text/markdown").startsWith("# Synthetic"));
});
test("synthetic: local/private address ranges and mapped IPv6 rejected", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1"]) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("synthetic: non-HTTPS, embedded credentials, arbitrary domains never fetched", async () => {
  for (const url of ["http://example.qq.com/a", "https://user:pass@example.qq.com/a", "https://localhost/a", "https://outside.example/a", "https://example.qq.com:8000/a"]) await assert.rejects(fetchMedia({ url, headers: {} }, 50));
});
