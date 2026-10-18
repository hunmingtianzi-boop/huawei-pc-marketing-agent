import { z } from "zod";
import { Platform, TaskBrief, ContentStrategy, ProductSelection, FactPoint, ImageView, SourceView, RunState } from "./index";

// Additive business boundary; foundation probe remains 1.0.0 unchanged.
export const BUSINESS_CONTRACT_VERSION = "2.1.0" as const;
export const BusinessMode = z.enum(["live", "synthetic", "local"]);
export type BusinessMode = z.infer<typeof BusinessMode>;
export const EvidenceMode = z.enum(["live", "synthetic", "replay", "local"]);
const id = z.uuid();
const text = z.string().min(1);
const iso = z.iso.datetime();
export const TaskInput = z.object({
  productRequest: z.string().max(180).nullable().default(null),
  targetAudience: z.string().max(200).nullable().default(null),
  useScenario: z.string().max(200).nullable().default(null),
  contentGoal: z.string().max(300).nullable().default(null),
  platform: Platform.nullable().default(null),
  purchaseStage: z.enum(["exploring", "comparing", "ready_to_visit", "unknown"]).default("unknown"),
  requestedClaims: z.array(z.string().max(300)).max(20).default([]),
  constraints: z.object({ tone: z.string().max(100).optional(), lengthPreference: z.string().max(100).optional(), avoid: z.array(z.string().max(150)).max(20).default([]) }).strict().default({ avoid: [] }),
}).strict();
export type TaskInput = z.infer<typeof TaskInput>;
export const ValidationIssue = z.object({
  issueId: id, code: text, severity: z.enum(["blocker", "error", "warning"]),
  category: z.enum(["input", "fact", "image", "platform", "compliance", "access", "version", "system"]),
  location: z.string(), message: text, evidenceKeys: z.array(id),
  resolution: z.enum(["clarify", "retrieve", "remove", "rewrite", "human_confirm", "retry"]), status: z.enum(["open", "resolved"]),
}).strict();
export type ValidationIssue = z.infer<typeof ValidationIssue>;
export const EvidenceConflict = z.object({ fieldKey: text, sourceIds: z.array(id).min(1), message: text }).strict();
// Safe evidence only. Complete documents/provider refs/bytes stay in RetrievalResult.
export const ProductEvidence = z.object({
  evidenceSetId: id, product: ProductSelection, retrievedAt: iso, provenanceMode: EvidenceMode,
  sources: z.array(SourceView), facts: z.array(FactPoint), images: z.array(ImageView),
  conflicts: z.array(EvidenceConflict), coverageGaps: z.array(text), snapshotDigest: text,
}).strict();
export type ProductEvidence = z.infer<typeof ProductEvidence>;
export const Placement = z.object({ blockKey: text, position: z.enum(["before", "after"]) }).strict();
export const DraftEditable = z.object({
  title: z.string().max(300), lead: z.string().max(3000),
  bodyBlocks: z.array(z.object({ blockKey: text, text: z.string().max(12000), factIds: z.array(id) }).strict()).max(30),
  callToAction: z.string().max(1500), tags: z.array(z.string().max(100)).max(20),
  selectedImages: z.array(z.object({ imageId: id, caption: z.string().max(600), purpose: z.string().max(400), placement: Placement }).strict()).max(6),
}).strict();
export type DraftEditable = z.infer<typeof DraftEditable>;
export const DraftContent = DraftEditable.extend({ version: z.number().int().positive(), contentDigest: text }).strict();
export type DraftContent = z.infer<typeof DraftContent>;
export const ValidationReport = z.object({
  checkedVersion: z.number().int().positive(), checkedContentDigest: text,
  checkedEvidenceSetId: id, checkedEvidenceDigest: text, checkedStrategyId: id, checkedStrategyDigest: text,
  checkedBriefVersion: z.number().int().positive(), status: z.enum(["passed", "failed", "stale"]),
  checks: z.array(z.object({ name: text, status: z.enum(["passed", "failed", "not_run"]), summary: text }).strict()),
  issues: z.array(ValidationIssue), checkedAt: iso, semanticMode: z.enum(["not_run", "synthetic", "live"]),
}).strict();
export type ValidationReport = z.infer<typeof ValidationReport>;
export const ExecutionEvidence = z.object({
  retrievalMode: EvidenceMode, generationMode: z.enum(["not_run", "synthetic", "live"]),
  modelInvoked: z.boolean(), model: z.string().nullable(), endpointOrigin: z.string().nullable(),
}).strict();
export const RunResult = z.object({
  contractVersion: z.enum(["2.0.0", BUSINESS_CONTRACT_VERSION]).transform(() => BUSINESS_CONTRACT_VERSION), runId: id, createdAt: iso, updatedAt: iso,
  mode: BusinessMode, input: TaskInput, brief: TaskBrief,
  state: RunState, currentVersion: z.number().int().positive(), activeOperationId: id.nullable(),
  strategy: ContentStrategy.nullable(), evidence: ProductEvidence.nullable(),
  draft: DraftContent.nullable(), validation: ValidationReport.nullable(), finalContent: DraftContent.nullable(),
  issues: z.array(ValidationIssue), exportable: z.boolean(),
  stageSummary: z.array(z.object({ stage: text, at: iso, status: z.enum(["running", "passed", "blocked", "failed"]), summary: text }).strict()),
  executionEvidence: ExecutionEvidence,
}).strict();
export type RunResult = z.infer<typeof RunResult>;
export const CreateRunRequest = z.object({ input: TaskInput, mode: BusinessMode.default("local") }).strict();
export type CreateRunRequest = z.infer<typeof CreateRunRequest>;
const expected = z.number().int().positive();
export const RunActionRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("execute"), expectedVersion: expected }).strict(),
  z.object({ action: z.literal("regenerate"), expectedVersion: expected }).strict(),
  z.object({ action: z.literal("revalidate"), expectedVersion: expected }).strict(),
  z.object({ action: z.literal("revise"), expectedVersion: expected, patch: z.object({ input: TaskInput.optional(), draft: DraftEditable.optional() }).strict().refine(x => !!x.input || !!x.draft, "Empty revision") }).strict(),
]);
export type RunActionRequest = z.infer<typeof RunActionRequest>;
export const RunResponse = z.object({ run: RunResult }).strict();
export const RunListResponse = z.object({ runs: z.array(RunResult) }).strict();
export const ExportRequest = z.object({ expectedVersion: expected, format: z.enum(["markdown", "text"]).default("markdown") }).strict();
export const ExportResponse = z.object({ runId: id, version: expected, fileName: text, mimeType: text, content: z.string(), provenanceMode: EvidenceMode }).strict();
export type ExportResponse = z.infer<typeof ExportResponse>;
export const SemanticVerdict = z.object({ supported: z.boolean(), issues: z.array(z.object({ location: z.string(), message: text }).strict()).max(50) }).strict();
export type SemanticVerdict = z.infer<typeof SemanticVerdict>;

// Frozen module entry signatures. Implementation belongs to the named workers.
export type ModelRequest = { purpose: "generate" | "verify" | "probe"; system: string; user: string };
export type ModelResponse = { text: string; mode: "live" | "synthetic"; model: string; endpointOrigin: string | null };
export type ModelClient = (request: ModelRequest) => Promise<ModelResponse>;
export type GenerationContext = { brief: z.infer<typeof TaskBrief>; strategy: z.infer<typeof ContentStrategy>; evidence: ProductEvidence; version: number };
export type GenerationOutcome = { draft: DraftContent; generationMode: "live" | "synthetic"; modelInvoked: boolean; model: string; endpointOrigin: string | null };
export type ValidationContext = GenerationContext & { draft: DraftContent };
export type SourceDocument = { sourceId: string; title: string; locator: string; text: string };
export type CachedAsset = { imageId: string; bytes: Uint8Array; mimeType: string };
export type RetrievalRequest = { runId: string; productRequest: string; mode: BusinessMode };
export type RetrievalResult = { evidence: ProductEvidence; assets: CachedAsset[]; documents: SourceDocument[] };
export type MediaAccess = { url: string; headers: Record<string, string> };
export type RetrievalServices = {
  callIma: (method: "search_knowledge_base" | "get_knowledge_list" | "search_knowledge" | "get_media_info", params: Record<string, unknown>) => Promise<unknown>;
  fetchMedia: (access: MediaAccess, maxBytes: number) => Promise<{ bytes: Buffer; contentType: string }>;
  decodeImage: (bytes: Buffer, contentType: string) => Promise<{ width: number; height: number; mimeType: string }>;
  persistPrivate: (fileName: string, data: string | Uint8Array) => Promise<void>;
};
export type RuntimeModules = {
  clarifyTask: (input: TaskInput, meta: { taskId: string; briefVersion: number }) => z.infer<typeof TaskBrief>;
  planContent: (brief: z.infer<typeof TaskBrief>) => z.infer<typeof ContentStrategy>;
  retrieveEvidence: (request: RetrievalRequest, services: RetrievalServices) => Promise<RetrievalResult>;
  generateDraft: (context: GenerationContext, model: ModelClient) => Promise<GenerationOutcome>;
  validateDraft: (context: ValidationContext, model: ModelClient) => Promise<ValidationReport>;
  createLiveModelClient: (settings: ModelSettings | null) => ModelClient;
  createSyntheticModelClient: () => ModelClient;
};
export type ModelSettings = { baseUrl: string; apiKey: string; model: string };

// Local source uses a server-owned root; no client paths or URLs are accepted.
export type LocalSourceOptions = { rootDir?: string };
export const LocalCatalog = z.object({ sourceMode: z.literal("local"), available: z.boolean(), products: z.array(z.object({ productRequest: text, displayName: text, imageCount: z.number().int().nonnegative() }).strict()) }).strict();
export type LocalCatalog = z.infer<typeof LocalCatalog>;
// src/server/ima/local.ts exports retrieveLocalEvidence(request, services, options?)
// and readLocalCatalog(options?): Promise<LocalCatalog>. Retrieval result preserves
// original-source titles, relative locators, content hashes and local provenance.
