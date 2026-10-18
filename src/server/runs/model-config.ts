import type { ModelSettings } from "../../contracts/business";
export function readModelSettings(env = process.env): ModelSettings | null {
  if (!(env.LLM_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL)) return null;
  let url: URL;
  try { url = new URL(env.LLM_BASE_URL); } catch { return null; }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) return null;
  return { baseUrl: url.href.replace(/\/$/, ""), apiKey: env.LLM_API_KEY, model: env.LLM_MODEL };
}
export function modelConfigurationState() {
  const configured = !!readModelSettings();
  return { configured, endpointPresent: !!process.env.LLM_BASE_URL, keyPresent: !!process.env.LLM_API_KEY, modelPresent: !!process.env.LLM_MODEL };
}
