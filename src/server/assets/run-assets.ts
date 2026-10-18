import {readFile,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {CachedAsset,ProductEvidence,RunResult} from "../../contracts/business";
import {decodeImage} from "./media";
import {BusinessError} from "../runs/business-error";
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
export async function cacheRunAssets(dir:string,evidence:ProductEvidence,assets:CachedAsset[]){
  const duplicates=new Set<string>();
  for(const image of evidence.images){
    const matching=assets.filter(a=>a.imageId===image.imageId);if(matching.length!==1)throw new BusinessError("MEDIA_UNAVAILABLE","图片原件与依据不对应。",409,true);
    const asset=matching[0];z.uuid().parse(asset.imageId);
    if(image.productKey!==evidence.product.productKey||image.availability!=="verified"||image.modelMatch!=="confirmed"||image.previewAssetKey!==image.imageId)throw new BusinessError("IMAGE_MODEL_UNCONFIRMED","图片型号或访问状态未经确认。",409,true);
    const bytes=Buffer.from(asset.bytes);if(bytes.length>12*1024*1024)throw new BusinessError("MEDIA_UNAVAILABLE","图片超过本机处理预算。",409,true);
    const meta=await decodeImage(bytes,asset.mimeType);if(meta.width!==image.width||meta.height!==image.height||meta.mimeType!==image.mimeType||sha(bytes)!==image.contentDigest)throw new BusinessError("MEDIA_UNAVAILABLE","图片原件与已核对的尺寸/摘要不一致。",409,true);
    if(duplicates.has(image.contentDigest))throw new BusinessError("DUPLICATE_IMAGES","重复图片不能用于凑数。",409,true);duplicates.add(image.contentDigest);
    const folder=path.join(dir,"assets");await mkdir(folder,{recursive:true,mode:0o700});const file=path.join(folder,`${asset.imageId}.bin`);
    try{await writeFile(file,bytes,{mode:0o600,flag:"wx"});}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST"||sha(await readFile(file))!==image.contentDigest)throw new BusinessError("MEDIA_UNAVAILABLE","图片缓存不一致。",409,true);}
  }
}
export async function readRunAsset(dir:string,run:RunResult,imageId:string){
  z.uuid().parse(imageId);const image=run.evidence?.images.find(i=>i.imageId===imageId);
  if(!image||image.availability!=="verified"||image.modelMatch!=="confirmed")throw new BusinessError("ASSET_NOT_FOUND","该图片不属于当前任务。",404);
  try{const bytes=await readFile(path.join(dir,"assets",`${imageId}.bin`));if(sha(bytes)!==image.contentDigest)throw new Error();return {bytes,mimeType:image.mimeType};}catch{throw new BusinessError("MEDIA_UNAVAILABLE","当前图片缓存不可用。",410,true);}
}
