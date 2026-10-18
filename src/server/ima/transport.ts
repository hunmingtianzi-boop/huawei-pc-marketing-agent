import { spawn } from "node:child_process";
import { readFile, stat, realpath } from "node:fs/promises";
import path from "node:path";
import { childEnvironment } from "./config";
import { ImaError } from "./errors";
import { record, READ_ONLY_METHODS, type Transport } from "./adapter";

export async function inspectSkill(scriptPath: string | undefined) {
  if (!scriptPath) throw new ImaError("SKILL_NOT_FOUND", true);
  try {
    const script = await realpath(/*turbopackIgnore: true*/ path.resolve(/*turbopackIgnore: true*/ scriptPath));
    if (path.basename(script) !== "ima_api.cjs" || !(await stat(script)).isFile()) throw new Error();
    const dir = path.dirname(script);
    const metadata = record(JSON.parse(await readFile(/*turbopackIgnore: true*/ path.join(dir, "meta.json"), "utf8")));
    for (const rel of ["SKILL.md", "knowledge-base/SKILL.md", "knowledge-base/references/api.md"]) await stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, rel));
    const source = await readFile(/*turbopackIgnore: true*/ script, "utf8");
    if (typeof metadata.version !== "string" || !/^\d+\.\d+\.\d+$/.test(metadata.version) || !source.includes("module.exports") || !source.includes("imaApi")) throw new Error();
    return { script, version: metadata.version };
  } catch { throw new ImaError("SKILL_INVALID", true); }
}

export function officialTransport(script: string, dataDir: string, env = process.env): Transport {
  const childEnv = childEnvironment(env); // Fails before official script can read its hidden legacy config.
  return async (method, params) => {
    if (!READ_ONLY_METHODS.includes(method)) throw new ImaError("REQUEST_REJECTED");
    return new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, [path.resolve("scripts/ima_worker.cjs")], {
        env: { ...childEnv, APP_IMA_SCRIPT: script, APP_IMA_UPDATE_CACHE: path.join(dataDir, "last_update_check") },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stopped = false;
      const stop = (error: ImaError) => { if (!stopped) { stopped = true; proc.kill("SIGKILL"); reject(error); } };
      const timer = setTimeout(() => stop(new ImaError("NETWORK_ERROR", true)), 35000);
      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (Buffer.byteLength(stdout) > 2 * 1024 * 1024) stop(new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED"));
      });
      proc.stderr.resume(); // Never forward arbitrary SDK stderr.
      proc.stdin.on("error", () => {});
      proc.on("error", () => { clearTimeout(timer); stop(new ImaError("INTERNAL_ERROR")); });
      proc.on("close", () => {
        clearTimeout(timer);
        if (stopped) return;
        try {
          const result = record(JSON.parse(stdout));
          if (result.ok !== true) throw new ImaError(result.code === -200 ? "SKILL_UPDATE_REQUIRED" : result.code === 110030 ? "PERMISSION_DENIED" : result.code === 429 ? "RATE_LIMITED" : "NETWORK_ERROR", true);
          stopped = true; resolve(result.response);
        } catch (e) { stop(e instanceof ImaError ? e : new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED")); }
      });
      proc.stdin.end(JSON.stringify({ method, params }));
    });
  };
}
