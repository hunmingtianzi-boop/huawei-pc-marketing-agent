import { test } from "node:test";
import assert from "node:assert/strict";
import { assertProductDocument, relativeImageReference } from "../../src/server/ima/source";
test("synthetic: confusing nearby models cannot pass the original-document gate", () => {
  assert.doesNotThrow(() => assertProductDocument("# Synthetic Model 14\nbody", "Synthetic Model 14"));
  for (const doc of ["# Synthetic Model 14 Pro\nbody", "# Synthetic Model 14 2025\nbody", "Synthetic Model 14 appears without source title"]) assert.throws(() => assertProductDocument(doc, "Synthetic Model 14"));
});
test("synthetic: a filename, generic logo, wrong model alt or external picture cannot prove model", () => {
  for (const link of ["![logo](images/Synthetic-Model-14.png)", "![Synthetic Model 14 Pro](images/14.png)", "![Synthetic Model 14](https://outside.example/14.png)", "![Synthetic Model 14](../images/14.png)"]) assert.throws(() => relativeImageReference(link, "Synthetic Model 14"));
  assert.deepEqual(relativeImageReference("# Synthetic Model 14\n![Synthetic Model 14](images/a.png)", "Synthetic Model 14"), { parts: ["images", "a.png"], position: 2 });
});
