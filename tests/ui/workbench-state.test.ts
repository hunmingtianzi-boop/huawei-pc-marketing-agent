import test from "node:test";
import assert from "node:assert/strict";
import type { RunResult } from "../../src/contracts/business";
import { canRequestExport, editableDraft, mayAcceptSnapshot, moveSelectedImage } from "../../src/components/workbench-state";
const id1 = "00000000-0000-4000-8000-000000000001";
const id2 = "00000000-0000-4000-8000-000000000002";
const id3 = "00000000-0000-4000-8000-000000000003";
const draft = { title: "人工样例标题", lead: "", bodyBlocks: [{ blockKey: "main", text: "人工构造的文字", factIds: [id1] }], callToAction: "了解详情", tags: [], selectedImages: [{ imageId: id2, caption: "人工说明", purpose: "说明场景", placement: { blockKey: "main", position: "after" as const } }, { imageId: id3, caption: "另一个人工说明", purpose: "补充说明", placement: { blockKey: "main", position: "before" as const } }] };
const snapshot = (version: number, time = "2026-10-18T01:00:00Z") => ({ runId: id1, currentVersion: version, updatedAt: time, exportable: true, activeOperationId: null, draft: { ...draft, version, contentDigest: "synthetic-digest" } }) as unknown as RunResult;
test("synthetic: editor keeps fact IDs and image placement but excludes server version/digest", () => {
  const editable = editableDraft(snapshot(2));
  assert.deepEqual(editable, draft);
  assert.equal("version" in editable!, false);
  assert.equal("contentDigest" in editable!, false);
  const changed = { ...editable!, title: "修改标题" };
  assert.deepEqual(changed.bodyBlocks[0].factIds, [id1]);
});
test("synthetic: previous run response cannot overwrite selected run", () => {
  assert.equal(mayAcceptSnapshot(null, snapshot(1), id2), false);
});
test("synthetic: delayed old version cannot replace latest revision", () => {
  assert.equal(mayAcceptSnapshot(snapshot(2), snapshot(1, "2026-10-18T01:10:00Z"), id1), false);
  assert.equal(mayAcceptSnapshot(snapshot(1), snapshot(2), id1), true);
});
test("synthetic: delayed stage response in same revision cannot roll back newer progress", () => {
  assert.equal(mayAcceptSnapshot(snapshot(2, "2026-10-18T01:10:00Z"), snapshot(2), id1), false);
});
test("synthetic: local title/caption/platform edits immediately close frontend export", () => {
  assert.equal(canRequestExport(snapshot(1), false, false), true);
  assert.equal(canRequestExport(snapshot(1), true, false), false);
  assert.equal(canRequestExport(snapshot(1), false, true), false);
  assert.equal(canRequestExport({ ...snapshot(1), exportable: false }, false, false), false);
  assert.equal(canRequestExport({ ...snapshot(1), activeOperationId: id2 }, false, false), false);
  assert.equal(canRequestExport(null, false, false), false);
});
test("synthetic: reordering selected images preserves IDs, captions, purposes and placements", () => {
  const moved = moveSelectedImage(draft, 1, -1);
  assert.equal(moved.selectedImages[0].imageId, id3);
  assert.deepEqual(moved.selectedImages[0], draft.selectedImages[1]);
  assert.equal(draft.selectedImages[0].imageId, id2);
  assert.equal(moveSelectedImage(draft, 0, -1), draft);
});
