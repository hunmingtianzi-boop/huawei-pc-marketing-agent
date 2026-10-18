import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { ProbeInput } from "../src/contracts";
import { runProbe } from "../src/server/ima/probe";
import { normalizeError } from "../src/server/ima/errors";

async function main() {
  const input = ProbeInput.safeParse({ productName: process.argv[2] });
  if (!input.success) { process.stdout.write(JSON.stringify({ status: "FAIL", code: "MISSING_INPUT", usage: "npm run verify:ima -- '完整型号名'" }) + "\n"); process.exitCode = 1; return; }
  const report = await runProbe(input.data.productName);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : report.status === "BLOCKED" ? 2 : 1;
}
main().catch(e => { process.stdout.write(JSON.stringify({ mode: "live", status: "FAIL", error: normalizeError(e).safe() }) + "\n"); process.exitCode = 1; });
