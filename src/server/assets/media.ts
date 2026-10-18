import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import { ImaError } from "../ima/errors";

export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return ![0, 10, 127].includes(a) && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127) && a < 224;
  }
  if (isIP(ip) === 6) return /^2[0-9a-f]{3}:/i.test(ip); // Global unicast only, excludes mapped/private IPv4.
  return false;
}
export async function fetchMedia(access: { url: string; headers: Record<string, string> }, maxBytes: number) {
  try {
    const url = new URL(access.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new ImaError("MEDIA_UNAVAILABLE", true);
    // An initial public-host allowlist also prevents DNS rebinding into arbitrary hosts.
    if (!["qq.com", "qpic.cn", "myqcloud.com"].some(d => url.hostname === d || url.hostname.endsWith(`.${d}`))) throw new ImaError("MEDIA_UNAVAILABLE", true);
    const ips = await lookup(url.hostname, { all: true });
    if (!ips.length || ips.some(i => !publicAddress(i.address))) throw new ImaError("MEDIA_UNAVAILABLE", true);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(access.headers)) {
      if (/^(host|connection|proxy-|ima-openapi-|transfer-encoding|content-length)/i.test(k)) throw new ImaError("MEDIA_UNAVAILABLE", true);
      headers[k] = v;
    }
    const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (res.status !== 200 || !res.body) throw new ImaError("MEDIA_UNAVAILABLE", true);
    const size = Number(res.headers.get("content-length"));
    if (size > maxBytes) throw new ImaError("MEDIA_UNAVAILABLE");
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) throw new ImaError("MEDIA_UNAVAILABLE");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return { bytes: Buffer.concat(chunks), contentType: res.headers.get("content-type")?.split(";")[0] ?? "" };
  } catch (e) {
    if (e instanceof ImaError) throw e;
    throw new ImaError("NETWORK_ERROR", true);
  }
}
export async function decodeImage(bytes: Buffer, contentType: string) {
  const known = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!known.includes(contentType)) throw new ImaError("MEDIA_UNAVAILABLE");
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await image.metadata();
    const mimeType = `image/${meta.format}`;
    if (!meta.width || !meta.height || mimeType !== contentType) throw new Error();
    await image.raw().toBuffer(); // metadata alone is not successful decoding.
    return { width: meta.width, height: meta.height, mimeType };
  } catch { throw new ImaError("MEDIA_UNAVAILABLE"); }
}
export function parseDocument(bytes: Buffer, contentType: string) {
  if (!/^(text\/(plain|markdown)|application\/octet-stream)$/.test(contentType)) throw new ImaError("SOURCE_UNAVAILABLE", true);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new ImaError("SOURCE_UNAVAILABLE"); }
  if (text.length < 40 || /<(!doctype|html|form)[\s>]/i.test(text) || text.includes("\u0000")) throw new ImaError("SOURCE_UNAVAILABLE");
  return text;
}
