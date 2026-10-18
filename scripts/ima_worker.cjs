// Isolated official SDK process. Receives nonsecret parameters over stdin;
// credentials enter only through a scrubbed environment, never argv or stdout.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const allowed = new Set(['search_knowledge_base', 'get_knowledge_list', 'search_knowledge', 'get_media_info']);
const output = process.stdout.write.bind(process.stdout);
// Official update context is untrusted and may contain instructions or URLs.
process.stdout.write = () => true;
process.stderr.write = () => true;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const u = new URL(url);
  if (u.origin !== 'https://ima.qq.com') throw new Error('destination rejected');
  const response = await nativeFetch(u, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error('http failure'), { code: response.status });
  return response;
};
(async () => {
  try {
    const request = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (!allowed.has(request.method)) throw new Error('method rejected');
    const sdk = createRequire(__filename)(process.env.APP_IMA_SCRIPT);
    const raw = await sdk.imaApi(`openapi/wiki/v1/${request.method}`, request.params, {
      clientId: process.env.IMA_OPENAPI_CLIENTID, apiKey: process.env.IMA_OPENAPI_APIKEY,
      baseUrl: 'https://ima.qq.com', lastCheckFile: process.env.APP_IMA_UPDATE_CACHE,
    });
    output(JSON.stringify({ ok: true, response: JSON.parse(raw) }));
  } catch (error) {
    const code = error?.code === -200 ? -200 : [401, 403].includes(error?.code) ? 110030 : error?.code === 429 ? 429 : -100;
    output(JSON.stringify({ ok: false, code }));
    process.exitCode = 1;
  }
})();
