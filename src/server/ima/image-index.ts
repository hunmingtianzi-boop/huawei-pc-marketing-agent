import { parse } from "csv-parse/sync";
import { z } from "zod";
import { ImaError } from "./errors";

const rowSchema = z.object({
  "文件名": z.string().min(1), "产品型号": z.string().min(1), "官网图片说明": z.string(),
  "宽度": z.coerce.number().int().positive(), "高度": z.coerce.number().int().positive(),
});
export function indexedImage(csv: string, displayName: string) {
  try {
    const rows: unknown[] = parse(csv, { bom: true, columns: true, skip_empty_lines: true, trim: true, max_record_size: 16384 });
    if (rows.length > 1000) throw new ImaError("BUDGET_EXCEEDED", true);
    const parsed = rows.map(row => rowSchema.parse(row));
    const matching = parsed.filter(row => row["产品型号"] === displayName);
    if (!matching.length) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
    const first = matching[0];
    const fileName = first["文件名"];
    if (/[/\\:%?#]/.test(fileName) || fileName === "." || fileName === "..") throw new ImaError("MEDIA_UNAVAILABLE");
    if (parsed.filter(row => row["文件名"] === fileName).length !== 1) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
    return { fileName, description: first["官网图片说明"], width: first["宽度"], height: first["高度"], row: parsed.indexOf(first) + 2 };
  } catch (error) {
    if (error instanceof ImaError) throw error;
    throw new ImaError("PROVIDER_SCHEMA_UNRECOGNIZED");
  }
}
