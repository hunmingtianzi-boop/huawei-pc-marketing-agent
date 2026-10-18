import type { ProductEvidence } from "../../contracts/business";

// Match explicit product families before shorter prefixes (Pro S before Pro).
// Optional omitted qualifiers are permitted, but an explicit qualifier must
// agree with the selected product. Never use substring identity (Pro vs Pro S).
const mentions = /(?:HUAWEI\s*)?MateBook\s*(?:X\s*Pro|Pro\s*S|Pro|Fold(?:\s*(?:非凡大师|企业版))?|GT\s*\d+|D\s*\d+(?:\s*SE\s*版)?|\d+(?:\s*Pro)?)(?:\s*酷睿\s*Ultra)?(?:\s*微绒典藏版)?(?:\s+20\d{2})?(?:\s*[（(](?:鸿蒙|Windows)版[）)])?/gi;
const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
function identity(name: string) {
 const canonical = normalize(name.replace(/\s20\d{2}(?=\D|$)/g, "")).replace(/^huawei/, "").replace(/^matebook/, "");
 return { canonical, family: canonical.match(/^(?:xpro|pros|pro|fold|gt\d+|d\d+(?:se版)?|\d+(?:pro)?)/)?.[0], year: name.match(/\s(20\d{2})(?:\D|$)/)?.[1] };
}
export function mismatchedProductMentions(value: string, product: ProductEvidence["product"]): string[] {
 const target = identity(product.displayName);
 return (value.match(mentions) ?? []).filter(mention => {
  const found = identity(mention);
  if (found.family !== target.family || found.year && found.year !== target.year) return true;
  for (const qualifier of ["酷睿ultra", "微绒典藏版", "非凡大师", "企业版", "鸿蒙版", "windows版"]) {
   if (found.canonical.includes(qualifier) && !target.canonical.includes(qualifier)) return true;
  }
  return false;
 });
}
