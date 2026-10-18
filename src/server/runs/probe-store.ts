import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProbeReport, type ProbeReport as Report } from "../../contracts";

export function dataRoot() { return path.resolve(/*turbopackIgnore: true*/ process.env.APP_DATA_DIR || ".local-data"); }
export async function privateWrite(dir: string, file: string, data: string | Buffer) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir, file), data, { mode: 0o600 });
}
export async function saveReport(report: Report) {
  const safe = ProbeReport.parse(report);
  const root = dataRoot();
  await privateWrite(path.join(root, "probes", safe.reportId), "report.json", JSON.stringify(safe, null, 2));
  const tmp = `latest-${randomUUID()}.tmp`;
  await privateWrite(root, tmp, JSON.stringify(safe));
  await rename(path.join(root, tmp), path.join(root, "latest-probe.json"));
}
export async function latestReport(): Promise<Report | null> {
  try { return ProbeReport.parse(JSON.parse(await readFile(path.join(dataRoot(), "latest-probe.json"), "utf8"))); }
  catch { return null; }
}
