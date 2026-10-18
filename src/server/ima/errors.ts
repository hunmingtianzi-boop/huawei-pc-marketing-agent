import type { ErrorCode, SafeError } from "../../contracts";

const messages: Record<ErrorCode, string> = {
  CREDENTIALS_MISSING: "本机尚未配置一组完整的 ima 凭证。",
  CREDENTIALS_CONFLICT: "ima 凭证组冲突或配置不完整，请在本机统一配置。",
  SKILL_NOT_FOUND: "未设置有效的官方 IMA_SKILL_PATH。",
  SKILL_INVALID: "官方 Skill 目录、元数据或脚本结构未通过检查。",
  SKILL_UPDATE_REQUIRED: "官方脚本要求检查更新；本次业务请求未执行。",
  PERMISSION_DENIED: "实际服务拒绝访问，请核对同账号与共享库权限。",
  RATE_LIMITED: "实际服务限流，请稍后重试。",
  NETWORK_ERROR: "外部连接失败或超时。",
  PROVIDER_ERROR: "实际服务返回业务错误，未视为无资料。",
  PROVIDER_SCHEMA_UNRECOGNIZED: "服务响应结构无法确认，请查看本机诊断并修正适配。",
  PAGINATION_INVALID: "服务分页缺失或重复游标，已停止遍历。",
  BUDGET_EXCEEDED: "已达到本次只读探测预算，遍历尚未完成。",
  KNOWLEDGE_BASE_NOT_FOUND: "已查询并列举可见库，但未找到指定名称。",
  KNOWLEDGE_BASE_AMBIGUOUS: "指定库名对应多个结果，不能盲选。",
  MODEL_AMBIGUOUS: "缺少能唯一确认产品型号的库内依据。",
  SOURCE_UNAVAILABLE: "尚未取得可解析的实际原文。",
  MEDIA_UNAVAILABLE: "原件访问方式不可用，或内容不符合要求。",
  IMAGE_MODEL_UNCONFIRMED: "尚未取得型号可证且可解码的 ima 图片。",
  MODEL_PARAMETER_MISMATCH: "资料与指定型号不一致。",
  SOURCE_CONFLICT: "资料存在冲突，需要确认后再继续。",
  MISSING_INPUT: "请提供一个明确的产品型号。",
  REQUEST_REJECTED: "仅接受本机同源的连接检查。",
  INTERNAL_ERROR: "本机执行发生错误，请检查配置与私有诊断。",
};
export class ImaError extends Error {
  constructor(public code: ErrorCode, public blocked = false, safeMessage?: string) { super(safeMessage ?? messages[code]); }
  safe(): SafeError { return { code: this.code, message: this.message, retryable: ["NETWORK_ERROR", "RATE_LIMITED"].includes(this.code) }; }
}
export function normalizeError(error: unknown): ImaError {
  return error instanceof ImaError ? error : new ImaError("INTERNAL_ERROR");
}
