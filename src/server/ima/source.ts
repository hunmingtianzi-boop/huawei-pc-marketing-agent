import { ImaError } from "./errors";

export function assertProductDocument(document: string, productName: string) {
  const header = document.split(/\r?\n/).find(line => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim();
  if (header !== productName) throw new ImaError("MODEL_PARAMETER_MISMATCH");
}
export function relativeImageReference(document: string, productName: string) {
  // Explicit model-named alt text in an already matched product document is
  // required; a similar file name or generic logo alone cannot confirm a model.
  const links = [...document.matchAll(/!\[([^\]]*)\]\(([^\s)]+)\)/g)];
  const selected = links.find(link => link[1].trim() === productName);
  const link = selected?.[2];
  if (!link || link.startsWith("/") || link.includes(":") || link.includes("\\") || link.includes("?") || link.includes("#")) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
  const parts = link.replace(/^\.\//, "").split("/");
  if (parts.some(p => !p || p === ".." || p === ".") || parts.length > 3) throw new ImaError("IMAGE_MODEL_UNCONFIRMED", true);
  return { parts, position: document.slice(0, selected!.index).split("\n").length };
}
