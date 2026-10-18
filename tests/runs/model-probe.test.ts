import test from 'node:test';
import assert from 'node:assert/strict';
import {probeRuntimeModel} from '../../src/server/runs/model-probe';
import {readModelSettings} from '../../src/server/runs/model-config';
test('runtime smoke uses same bounded JSON client and normalized endpoint as generation',async t=>{
 const previous={...process.env};const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;for(const k of ['LLM_BASE_URL','LLM_API_KEY','LLM_MODEL']){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});
 Object.assign(process.env,{LLM_BASE_URL:'https://synthetic.example/v1/chat/completions',LLM_API_KEY:'artificial-secret',LLM_MODEL:'artificial-model'});
 assert.equal(readModelSettings()!.baseUrl,'https://synthetic.example/v1');
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://synthetic.example/v1/chat/completions');assert.equal(JSON.parse(options!.body as string).response_format.type,'json_object');return new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'},finish_reason:'stop'}]}),{status:200});};
 const result=await probeRuntimeModel();assert.equal(result.status,'PASS');assert.equal(result.executed,true);assert.ok(!JSON.stringify(result).includes('artificial-secret'));
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'artificial-secret'}),{status:401});const denied=await probeRuntimeModel();assert.equal(denied.status,'BLOCKED');assert.equal(denied.code,'MODEL_PERMISSION_DENIED');assert.ok(!JSON.stringify(denied).includes('artificial-secret'));
});
