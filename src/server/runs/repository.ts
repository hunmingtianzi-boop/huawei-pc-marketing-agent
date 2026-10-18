import { mkdir,readFile,writeFile,rename,readdir } from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {RunResult,type RunResult as Run} from "../../contracts/business";
import {BusinessError} from "./business-error";
export class RunRepository {
  private locks=new Map<string,Promise<void>>();
  constructor(readonly root:string){}
  directory(id:string){return path.join(this.root,"runs",z.uuid().parse(id));}
  async get(id:string):Promise<Run>{try{return RunResult.parse(JSON.parse(await readFile(path.join(this.directory(id),"run.json"),"utf8")));}catch{throw new BusinessError("RUN_NOT_FOUND","未找到本机任务。",404);}}
  async save(run:Run){const safe=RunResult.parse(run);const dir=this.directory(run.runId);await mkdir(dir,{recursive:true,mode:0o700});const temp=path.join(dir,`run-${randomUUID()}.tmp`);await writeFile(temp,JSON.stringify(safe),{mode:0o600});await rename(temp,path.join(dir,"run.json"));return safe;}
  async update(id:string,change:(run:Run)=>Run|null):Promise<Run|null>{
    const prior=this.locks.get(id)??Promise.resolve();let release!:()=>void;const next=new Promise<void>(r=>{release=r});this.locks.set(id,next);await prior;
    try{const run=await this.get(id);const updated=change(run);return updated?await this.save(updated):null;}finally{release();if(this.locks.get(id)===next)this.locks.delete(id);}
  }
  async list(){let dirs:string[]=[];try{dirs=await readdir(path.join(this.root,"runs"));}catch{return [];}
    const rows=await Promise.all(dirs.filter(x=>z.uuid().safeParse(x).success).map(x=>this.get(x).catch(()=>null)));return rows.filter((x):x is Run=>!!x).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50);
  }
}
