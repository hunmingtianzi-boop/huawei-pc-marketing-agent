import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BusinessError } from "../runs/business-error";
export async function runtimePrompt(name: "generate" | "verify") {
  try { return await readFile(join(process.cwd(), "prompts", "runtime", `${name}.md`), "utf8"); }
  catch { throw new BusinessError("RUNTIME_PROMPT_UNAVAILABLE", "运行提示词不可读取，请检查本机安装。", 500); }
}
