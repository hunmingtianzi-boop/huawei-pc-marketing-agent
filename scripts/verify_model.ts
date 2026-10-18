import { config } from "dotenv";config({path:".env.local",quiet:true});config({path:".env",quiet:true});
import {mkdir,writeFile} from "node:fs/promises";
import {probeRuntimeModel} from "../src/server/runs/model-probe";
async function main(){const result=await probeRuntimeModel();await mkdir(".local-evidence/stage2",{recursive:true});await writeFile(".local-evidence/stage2/model-probe.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=result.status==="PASS"?0:result.status==="BLOCKED"?2:1;}main().catch(()=>{console.error("Model preflight failed; no secrets emitted.");process.exitCode=1;});
