export function localRequest(request: Request, mutation = false) {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    if (!host || !["http:", "https:"].includes(url.protocol)) return false;
    // Next may reconstruct Request.url using an internal bind hostname.
    // Validate the actual HTTP authority and exact Origin, not that internal hostname.
    const authority = new URL(`${url.protocol}//${host}`);
    if (authority.host !== host || !["127.0.0.1", "localhost", "[::1]"].includes(authority.hostname)) return false;
    if (request.headers.get("sec-fetch-site") === "cross-site") return false;
    if (mutation && request.headers.get("origin") !== authority.origin) return false;
    return true;
  } catch { return false; }
}
