import assert from "node:assert/strict";
import test from "node:test";
import { dependentRules, recheck } from "../../src/rules/engine";
import { context, element, measurement, rule } from "./fixtures";

test("Fix & Recheck re-evaluates only dependent rules on an in-memory overlay", () => {
  const corridor = element("CORRIDOR");
  const original = measurement(corridor, "CLEAR_WIDTH_M", 1.05);
  const widthRule = rule();
  const heightRule = rule({ requiredInputs: [], evaluation: { kind: "MIN", metric: "HEIGHT_M", threshold: 2.2, unit: "m" } });
  const doorRule = rule({ elementType: "DOOR" });
  const draft = rule({ lifecycle: "CANDIDATE" });
  const ctx = context({ elements: [corridor], measurements: [original] });

  assert.deepEqual(dependentRules([widthRule, heightRule, doorRule, draft], "CORRIDOR", "CLEAR_WIDTH_M"), [widthRule]);

  const result = recheck([widthRule, heightRule, doorRule, draft], ctx, {
    elementId: corridor.id, metric: "CLEAR_WIDTH_M", value: 1.3, unit: "m",
  });
  assert.deepEqual(result.before.map((r) => r.evaluation.status), ["FAIL"]);
  assert.deepEqual(result.after.map((r) => r.evaluation.status), ["PASS"]);
  assert.equal(result.after[0].evaluation.observed, 1.3);
  assert.equal(result.previousMeasurementId, original.id);
  assert.notEqual(result.before[0].fingerprint, result.after[0].fingerprint);

  // The base project data is untouched.
  assert.deepEqual(ctx.measurements, [original]);
});

test("recheck on an unknown element is rejected", () => {
  assert.throws(() => recheck([rule()], context(), {
    elementId: "00000000-0000-4000-8000-0000000000ff", metric: "CLEAR_WIDTH_M", value: 1, unit: "m",
  }), /ELEMENT_NOT_FOUND/);
});
