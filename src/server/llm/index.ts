import { BusinessError } from "../runs/business-error";
import type { ModelClient, ModelSettings } from "../../contracts/business";

/** No provider credentials or raw upstream failures escape this boundary. */
export function createLiveModelClient(settings: ModelSettings | null): ModelClient {
  return async request => {
    if (!settings?.baseUrl || !settings.apiKey || !settings.model) throw new BusinessError("MODEL_NOT_CONFIGURED", "服务端模型尚未配置。", 503, true);
    let base: URL;
    try { base = new URL(settings.baseUrl.endsWith("/") ? settings.baseUrl : `${settings.baseUrl}/`); }
    catch { throw new BusinessError("MODEL_CONFIG_INVALID", "模型服务地址配置无效。", 503, true); }
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new BusinessError("MODEL_CONFIG_INVALID", "模型服务地址配置无效。", 503, true);
    let response: Response;
    try {
      response = await fetch(new URL("chat/completions", base), {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }], response_format: { type: "json_object" } }),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      throw new BusinessError(name === "TimeoutError" || name === "AbortError" ? "MODEL_TIMEOUT" : "MODEL_NETWORK_ERROR", name === "TimeoutError" || name === "AbortError" ? "模型请求超时，请重试。" : "模型服务连接失败，请检查本机服务。", 503, true);
    }
    if (!response.ok) {
      void response.body?.cancel();
      const code = response.status === 429 ? "MODEL_RATE_LIMITED" : response.status === 401 || response.status === 403 ? "MODEL_PERMISSION_DENIED" : "MODEL_PROVIDER_ERROR";
      throw new BusinessError(code, code === "MODEL_RATE_LIMITED" ? "模型服务限流，请稍后重试。" : code === "MODEL_PERMISSION_DENIED" ? "模型服务拒绝访问，请检查服务端配置。" : "模型服务返回错误，请稍后重试。", 503, true);
    }
    try {
      // Enforce an output budget while reading, including a streamed/chunked response.
      const reader = response.body?.getReader(); if (!reader) throw new Error("empty");
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1000000) { await reader.cancel(); throw new Error("budget"); } chunks.push(value); }
      const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const value = raw?.choices?.[0]?.message?.content;
      if (typeof value !== "string" || !value.trim() || raw?.choices?.[0]?.finish_reason === "length") throw new Error("schema");
      return { text: value, mode: "live", model: settings.model, endpointOrigin: base.origin };
    } catch { throw new BusinessError("MODEL_RESPONSE_INVALID", "模型响应格式不完整或不符合约定，请重试。", 502); }
  };
}

/** Explicit artificial test mode. Never called as a live fallback. */
export function createSyntheticModelClient(): ModelClient {
  return async request => {
    const meta = { mode: "synthetic" as const, model: "synthetic-rule-fixture", endpointOrigin: null };
    if (request.purpose === "probe") return { ...meta, text: JSON.stringify({ ok: true }) };
    if (request.purpose === "verify") return { ...meta, text: JSON.stringify({ supported: true, issues: [] }) };
    const input = JSON.parse(request.user);
    const { brief, strategy, product, facts, images } = input;
    const usable = brief.platform === "wechat_moments" ? facts.slice(0, 1) : facts.slice(0, 4);
    const topic = /出差|差旅|商务|移动办公|职场/.test(brief.useScenario) ? "出差办公" : /新生|开学|校园|学生/.test(brief.useScenario) ? "开学选电脑" : "场景选购";
    const factText = (fact: { supportedStatement: string; qualifiers: string[] }) => `${fact.supportedStatement}${fact.qualifiers.length ? `（${fact.qualifiers.join("；")}）` : ""}`;
    const blocks = usable.slice(0, 3).map((fact: { factId: string; supportedStatement: string; qualifiers: string[] }, i: number) => ({
      blockKey: strategy.outline[Math.min(i, strategy.outline.length - 1)].blockKey,
      text: brief.platform === "wechat_moments" ? `${product.displayName}，${topic}时可以先核对自己的使用需求。${factText(fact)}请先整理具体任务，再核对这些条件是否符合需求。`
        : brief.platform === "xiaohongshu" ? `□ ${["先列任务", "再核对资料", "别漏使用条件"][i]}\n${i === 0 ? `${product.displayName}。` : ""}${factText(fact)}请结合自己的${topic}清单逐项核对。`
        : `【${["从任务开始核对", "把资料与需求逐项对应", "把条件带入下一步咨询"][i]}】\n${i === 0 ? `${product.displayName}。` : ""}${factText(fact)}选购前请先列出${topic}的具体任务，再按原资料核对相应条件。请区分已经查到的事实和仍需咨询的问题，不把一个参数当成全部需求的答案。`,
      factIds: [fact.factId],
    }));
    const title = brief.platform === "wechat_article" ? `${topic}：从任务清单读懂选购资料` : brief.platform === "xiaohongshu" ? `${topic}，这份核对清单先收好` : `${topic}，先聊聊你的需求`;
    const lead = brief.platform === "wechat_moments" ? "" : brief.platform === "xiaohongshu" ? "先列需求，再看资料。这份人工构造的 synthetic 清单仅用于流程测试。" : "选购时，请先把日常任务、配置条件与待咨询问题分别列清，再逐项对照资料。以下为人工构造的 synthetic 测试文章，不是真实产品结论。";
    return { ...meta, text: JSON.stringify({ title, lead, bodyBlocks: blocks, callToAction: strategy.callToActionGoal, tags: brief.platform === "xiaohongshu" ? [topic, "选购清单", "需求核对"] : [], selectedImages: images.slice(0, strategy.imageCountRange.min).map((image: { imageId: string; description: string }, i: number) => ({ imageId: image.imageId, caption: image.description, purpose: strategy.imagePlan[i].purpose, placement: { blockKey: blocks[Math.min(i, blocks.length - 1)].blockKey, position: "after" } })) }) };
  };
}
