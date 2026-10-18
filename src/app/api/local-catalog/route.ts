import { LocalCatalog } from "@/contracts/business";
import { readLocalCatalog } from "@/server/ima/local";
import { api, noStore } from "@/server/runs/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 return api(request,false,async()=>Response.json(LocalCatalog.parse(await readLocalCatalog()),{headers:noStore}));
}
