import { z } from "zod";

// Provisional until a live document AND model-proven image confirm provider mapping.
export const CONTRACT_VERSION = "0.1.0-provisional" as const;
export const Mode = z.enum(["synthetic", "replay", "live"]);
export const Status = z.enum(["PASS", "BLOCKED", "FAIL"]);
export const Platform = z.enum(["wechat_article", "xiaohongshu", "wechat_moments"]);
export const IMAGE_COUNTS = {
  wechat_article: { min: 2, max: 4 },
  xiaohongshu: { min: 3, max: 6 },
  wechat_moments: { min: 1, max: 3 },
} as const;
const text = z.string().min(1);
const id = z.uuid();
const iso = z.iso.datetime();
export const ErrorCode = z.enum([
  "CREDENTIALS_MISSING", "CREDENTIALS_CONFLICT", "SKILL_NOT_FOUND", "SKILL_INVALID",
  "SKILL_UPDATE_REQUIRED", "PERMISSION_DENIED", "RATE_LIMITED", "NETWORK_ERROR",
  "PROVIDER_ERROR", "PROVIDER_SCHEMA_UNRECOGNIZED", "PAGINATION_INVALID", "BUDGET_EXCEEDED",
  "KNOWLEDGE_BASE_NOT_FOUND", "KNOWLEDGE_BASE_AMBIGUOUS", "MODEL_AMBIGUOUS",
  "SOURCE_UNAVAILABLE", "MEDIA_UNAVAILABLE", "IMAGE_MODEL_UNCONFIRMED", "MODEL_PARAMETER_MISMATCH",
  "SOURCE_CONFLICT", "MISSING_INPUT", "REQUEST_REJECTED", "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
export const SafeError = z.object({ code: ErrorCode, message: text, retryable: z.boolean() }).strict();
export type SafeError = z.infer<typeof SafeError>;

export const ProductSelection = z.object({
  productKey: id, displayName: text, variant: z.record(text, text), resolutionBasis: text,
}).strict();
export const SourceView = z.object({
  citationKey: id, sourceTitle: text, locatorLabel: text,
  supportingExcerpt: z.string().max(600).nullable(), retrievedAt: iso,
  reviewAccess: z.enum(["available", "ima_client_required", "unavailable"]),
}).strict();
export type SourceView = z.infer<typeof SourceView>;
export const FactPoint = z.object({
  factId: id, productKey: id, fieldKey: text, value: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().nullable(), qualifiers: z.array(text), supportedStatement: text,
  sourceIds: z.array(id).min(1), status: z.enum(["supported", "unconfirmed", "conflicted"]),
}).strict();
export const ImageView = z.object({
  imageId: id, productKey: id, sourceView: SourceView,
  availability: z.enum(["verified", "unavailable", "expired", "unchecked"]),
  modelMatch: z.enum(["confirmed", "mismatch", "uncertain"]), modelMatchSummary: text,
  width: z.number().int().positive(), height: z.number().int().positive(), mimeType: text,
  previewAssetKey: id.nullable(), contentDigest: text,
}).strict();
export const TaskBrief = z.object({
  taskId: id, briefVersion: z.number().int().positive(), productRequest: text,
  productSelection: ProductSelection.nullable(), targetAudience: text.nullable(), useScenario: text.nullable(),
  purchaseStage: z.enum(["exploring", "comparing", "ready_to_visit", "unknown"]), contentGoal: text.nullable(),
  platform: Platform.nullable(), requestedClaims: z.array(text),
  constraints: z.object({ tone: z.string().optional(), lengthPreference: z.string().optional(), avoid: z.array(text) }).strict(),
  missingFields: z.array(text), clarifyingQuestions: z.array(text), assumptions: z.array(text),
}).strict();
export const ContentStrategy = z.object({
  strategyId: id, briefVersion: z.number().int().positive(), audienceProblem: text, contentAngle: text,
  priorityTopics: z.array(z.object({ topic: text, rank: z.number().int().positive(), reason: text }).strict()),
  retrievalQuestions: z.array(text), outline: z.array(z.object({ blockKey: text, purpose: text }).strict()),
  tone: text, imagePlan: z.array(z.object({ purpose: text, suggestedBlockKey: text }).strict()),
  imageCountRange: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).strict(),
  callToActionGoal: text, reasoningSummary: text,
}).strict();
export const RunState = z.enum(["draft", "needs_input", "planning", "retrieving", "evidence_ready", "generating", "validating", "needs_revision", "blocked", "failed", "ready"]);
export const ProbeStageName = z.enum(["credentials", "skill", "knowledge_base_access", "directory", "product_search", "source_content", "image_asset"]);
export type ProbeStageName = z.infer<typeof ProbeStageName>;
export const ProbeStage = z.object({
  name: ProbeStageName, executed: z.boolean(), status: Status, summary: text, error: SafeError.optional(),
}).strict();
export const ProbeReport = z.object({
  reportId: id, contractVersion: z.literal(CONTRACT_VERSION), mode: Mode, status: Status,
  startedAt: iso, finishedAt: iso, stages: z.array(ProbeStage),
  skillVersion: z.string().nullable(), accountIdentity: z.literal("not_verified"),
  source: SourceView.nullable(), image: ImageView.nullable(),
}).strict().superRefine((report, ctx) => {
  if (report.status !== "PASS") return;
  const complete = ProbeStageName.options.every(name => report.stages.filter(s => s.name === name && s.executed && s.status === "PASS").length === 1);
  if (!complete || !report.source || report.image?.availability !== "verified" || report.image?.modelMatch !== "confirmed" || !report.image.previewAssetKey) {
    ctx.addIssue({ code: "custom", message: "PASS requires every executed step, parsed source and model-proven decoded image" });
  }
});
export type ProbeReport = z.infer<typeof ProbeReport>;
export const ProbeInput = z.object({ productName: text.max(140) }).strict();

// Source/private access objects intentionally have no browser DTO schema here.
// Run persistence, DraftContent and ValidationReport are phase-two implementations.
