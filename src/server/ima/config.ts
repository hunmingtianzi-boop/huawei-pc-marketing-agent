import { ImaError } from "./errors";

type Env = Record<string, string | undefined>;
export function credentialState(env: Env) {
  const a = [env.IMA_OPENAPI_CLIENTID, env.IMA_OPENAPI_APIKEY];
  const b = [env.IMA_CLIENT_ID, env.IMA_API_KEY];
  const complete = (pair: (string | undefined)[]) => pair.every(v => !!v?.trim());
  const any = (pair: (string | undefined)[]) => pair.some(v => !!v?.trim());
  const conflict = (any(a) && !complete(a)) || (any(b) && !complete(b)) ||
    (complete(a) && complete(b) && (a[0] !== b[0] || a[1] !== b[1]));
  return { canonicalPresent: complete(a), legacyPresent: complete(b), conflict,
    configured: !conflict && (complete(a) || complete(b)) };
}
export function credentials(env: Env) {
  const state = credentialState(env);
  if (state.conflict) throw new ImaError("CREDENTIALS_CONFLICT", true);
  if (!state.configured) throw new ImaError("CREDENTIALS_MISSING", true);
  const canonical = state.canonicalPresent;
  return { clientId: env[canonical ? "IMA_OPENAPI_CLIENTID" : "IMA_CLIENT_ID"]!,
    apiKey: env[canonical ? "IMA_OPENAPI_APIKEY" : "IMA_API_KEY"]! };
}
export function childEnvironment(env: Env): NodeJS.ProcessEnv {
  const c = credentials(env);
  const child: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "development" };
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "SYSTEMROOT", "NODE_EXTRA_CA_CERTS", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]) {
    if (env[key]) child[key] = env[key];
  }
  return { ...child, IMA_OPENAPI_CLIENTID: c.clientId, IMA_OPENAPI_APIKEY: c.apiKey, IMA_BASE_URL: "https://ima.qq.com" };
}
export const TARGET_KB_NAME = "任德耀新建华为PC知识库";
