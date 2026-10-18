import { readModelSettings } from './model-config';
import { createLiveModelClient } from '../llm';
import { BusinessError } from './business-error';
export async function probeRuntimeModel() {
 const settings=readModelSettings();const at=new Date().toISOString();
 if(!settings)return {at,mode:'live',status:'BLOCKED',executed:false,code:'MODEL_NOT_CONFIGURED'};
 try {
  const response=await createLiveModelClient(settings)({purpose:'probe',system:'Return a JSON object only.',user:'Reply with the JSON object {"ok":true}.'});
  let valid=false;try {valid=JSON.parse(response.text)?.ok===true;}catch{}
  if(!valid)return {at,mode:'live',status:'FAIL',executed:true,code:'MODEL_SCHEMA_INVALID'};
  return {at,mode:'live',status:'PASS',executed:true,model:response.model,endpointOrigin:response.endpointOrigin,responsePresent:true};
 }catch(error){return {at,mode:'live',status:'BLOCKED',executed:true,code:error instanceof BusinessError?error.code:'MODEL_NETWORK_ERROR'};}
}
