import { DraftEditable, type RunResult, type TaskInput } from "../contracts/business";

export const DEFAULT_INPUT: TaskInput = {
  productRequest: "HUAWEI MateBook 14（鸿蒙版）", targetAudience: "新生",
  useScenario: "开学", contentGoal: "了解适合开学学习的电脑，咨询选购建议",
  platform: "wechat_moments", purchaseStage: "exploring", requestedClaims: [], constraints: { avoid: [] },
};
export function editableDraft(run: RunResult): DraftEditable | null {
  if (!run.draft) return null;
  const { version: _version, contentDigest: _digest, ...editable } = run.draft;
  return DraftEditable.parse(editable);
}
export function mayAcceptSnapshot(current: RunResult | null, incoming: RunResult, selectedRunId: string): boolean {
  if (incoming.runId !== selectedRunId) return false;
  if (!current || current.runId !== incoming.runId) return true;
  if (incoming.currentVersion !== current.currentVersion) return incoming.currentVersion > current.currentVersion;
  return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt);
}
export function canRequestExport(run: RunResult | null, dirty: boolean, busy: boolean): boolean {
  return !!run && run.exportable && !run.activeOperationId && !dirty && !busy;
}
export function moveSelectedImage(draft: DraftEditable, index: number, direction: -1 | 1): DraftEditable {
  const next = index + direction;
  if (next < 0 || next >= draft.selectedImages.length) return draft;
  const images = [...draft.selectedImages];
  [images[index], images[next]] = [images[next], images[index]];
  return { ...draft, selectedImages: images };
}
