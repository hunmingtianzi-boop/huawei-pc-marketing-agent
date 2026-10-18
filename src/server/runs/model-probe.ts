import { readModelSettings } from "./model-config";
export async function probeRuntimeModel() {
  const settings=readModelSettings();const at=new Date().toISOString();
  if(!settings)return {at,mode:"live",status:"BLOCKED",executed:false,code:"MODEL_NOT_CONFIGURED"};
  try {
    const endpoint=settings.baseUrl.endsWith("/chat/completions")?settings.baseUrl:`${settings.baseUrl}/chat/completions`;
    const response=await fetch(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(45000),headers:{"Content-Type":"application/json",Authorization:`Bearer ${settings.apiKey}`},body:JSON.stringify({model:settings.model,messages:[{role:"user",content:"Reply only with OK."}]})});
    if(!response.ok)return {at,mode:"live",status:"BLOCKED",executed:true,code:response.status===429?"MODEL_RATE_LIMITED":"MODEL_HTTP_ERROR",httpStatus:response.status};
    const data=await response.json();const content=data?.choices?.[0]?.message?.content;
    if(typeof content!=="string"||!content.trim())return {at,mode:"live",status:"FAIL",executed:true,code:"MODEL_SCHEMA_INVALID"};
    return {at,mode:"live",status:"PASS",executed:true,model:settings.model,endpointOrigin:new URL(settings.baseUrl).origin,responsePresent:true};
  }catch{return {at,mode:"live",status:"BLOCKED",executed:true,code:"MODEL_NETWORK_ERROR"};}
}
