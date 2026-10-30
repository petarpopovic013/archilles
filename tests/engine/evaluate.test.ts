import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRule, evaluateRules, fingerprint, canonicalJson } from "../../src/rules/engine";
import { context, element, measurement, project, rule } from "./fixtures";

function single(...args: Parameters<typeof evaluateRule>) {
  const results = evaluateRule(...args);
  assert.equal(results.length, 1);
  return results[0];
}

test("MIN passes, fails, and treats the exact boundary as satisfied", () => {
  const corridor = element("CORRIDOR");
  const check = (value: number) =>
    single(rule(), context({ elements: [corridor], measurements: [measurement(corridor, "CLEAR_WIDTH_M", value)] })).evaluation;

  assert.equal(check(1.35).status, "PASS");
  const fail = check(1.05);
  assert.equal(fail.status, "FAIL");
  assert.equal(fail.reasonCode, "BELOW_MINIMUM");
  assert.equal(fail.observed, 1.05);
  assert.equal(fail.required, 1.2);
  assert.equal(fail.unit, "m");
  assert.equal(check(1.2).status, "PASS");
  assert.equal(check(0.1 + 0.2 + 0.9).status, "PASS", "floating-point noise at the boundary");
  assert.equal(check(1.199999).status, "FAIL");
});

test("MAX uses an inclusive upper bound", () => {
  const ramp = element("RAMP");
  const maxRule = rule({ elementType: "RAMP", requiredInputs: [], evaluation: { kind: "MAX", metric: "SLOPE_RATIO", threshold: 0.05, unit: "ratio" } });
  const check = (value: number) =>
    single(maxRule, context({ elements: [ramp], measurements: [measurement(ramp, "SLOPE_RATIO", value)] })).evaluation.status;
  assert.equal(check(0.05), "PASS");
  assert.equal(check(0.0501), "FAIL");
});

test("missing or unverified inputs give UNKNOWN without a numeric verdict", () => {
  const corridor = element("CORRIDOR");
  const missing = single(rule(), context({ elements: [corridor] })).evaluation;
  assert.equal(missing.status, "UNKNOWN");
  assert.equal(missing.reasonCode, "MISSING_INPUT");
  assert.deepEqual(missing.missingInputs, ["CLEAR_WIDTH_M"]);

  const estimate = measurement(corridor, "CLEAR_WIDTH_M", 0.8, { source: "AI_ESTIMATE", verification: "UNVERIFIED", confidence: 0.99 });
  const unverified = single(rule(), context({ elements: [corridor], measurements: [estimate] })).evaluation;
  assert.equal(unverified.status, "UNKNOWN");
  assert.equal(unverified.reasonCode, "INPUT_UNVERIFIED");
  assert.equal(unverified.observed, undefined);
});

test("a user correction supersedes the earlier measurement", () => {
  const corridor = element("CORRIDOR");
  const original = measurement(corridor, "CLEAR_WIDTH_M", 1.05);
  const corrected = measurement(corridor, "CLEAR_WIDTH_M", 1.3, {
    source: "USER_CORRECTED", supersedesId: original.id, recordedAt: "2026-10-30T13:00:00.000Z",
  });
  const result = single(rule(), context({ elements: [corridor], measurements: [corrected, original] }));
  assert.equal(result.evaluation.status, "PASS");
  assert.deepEqual(result.measurementIds, [corrected.id]);
});

test("applicability is evaluated before thresholds", () => {
  const corridor = element("CORRIDOR");
  const failingWidth = [measurement(corridor, "CLEAR_WIDTH_M", 0.5)];

  const other = single(rule(), context({ project: project({ purpose: "OTHER" }), elements: [corridor], measurements: failingWidth })).evaluation;
  assert.equal(other.status, "NOT_APPLICABLE");
  assert.equal(other.reasonCode, "APPLICABILITY_NOT_MET");

  const byOccupancy = rule({ applicability: { op: "GTE", field: "occupantCount", value: 50 } });
  const unknown = single(byOccupancy, context({ elements: [corridor], measurements: failingWidth })).evaluation;
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.reasonCode, "APPLICABILITY_UNKNOWN");
  assert.deepEqual(unknown.missingInputs, ["OCCUPANT_COUNT"]);
});

test("a proven exception is NOT_APPLICABLE; an unresolved one blocks only a failure", () => {
  const corridor = element("CORRIDOR");
  const withException = rule({ exceptionConditions: [{ op: "EQ", field: "characteristic", key: "isNewBuild", value: false }] });
  const narrow = [measurement(corridor, "CLEAR_WIDTH_M", 1.0)];
  const wide = [measurement(corridor, "CLEAR_WIDTH_M", 1.5)];

  const proven = single(withException, context({ project: project({ characteristics: { isNewBuild: false } }), elements: [corridor], measurements: narrow })).evaluation;
  assert.equal(proven.status, "NOT_APPLICABLE");
  assert.equal(proven.reasonCode, "EXCEPTION_APPLIES");

  const unresolved = single(withException, context({ elements: [corridor], measurements: narrow })).evaluation;
  assert.equal(unresolved.status, "UNKNOWN");
  assert.equal(unresolved.reasonCode, "EXCEPTION_UNRESOLVED");

  assert.equal(single(withException, context({ elements: [corridor], measurements: wide })).evaluation.status, "PASS");
});

test("non-active rules are rejected before any evaluation exists", () => {
  const corridor = element("CORRIDOR");
  const ctx = context({ elements: [corridor], measurements: [measurement(corridor, "CLEAR_WIDTH_M", 1.05)] });
  for (const lifecycle of ["CANDIDATE", "AI_REVIEWED", "HUMAN_VERIFIED", "REJECTED", "SUPERSEDED"] as const) {
    const { results, rejected } = evaluateRules([rule({ lifecycle })], ctx);
    assert.equal(results.length, 0);
    assert.equal(rejected[0].reasonCode, "RULE_NOT_ACTIVE");
  }
  assert.throws(() => evaluateRule(rule({ lifecycle: "CANDIDATE" }), ctx), /RULE_NOT_ACTIVE/);
});

test("rules outside their effective dates are not applicable", () => {
  const corridor = element("CORRIDOR");
  const ctx = context({ elements: [corridor], measurements: [measurement(corridor, "CLEAR_WIDTH_M", 1.05)] });
  assert.equal(single(rule({ effectiveFrom: "2027-01-01" }), ctx).evaluation.reasonCode, "RULE_NOT_IN_EFFECT");
  assert.equal(single(rule({ effectiveTo: "2026-01-01" }), ctx).evaluation.status, "NOT_APPLICABLE");
});

test("an unregistered reviewed evaluator needs review", () => {
  const corridor = element("CORRIDOR");
  const reviewed = rule({ evaluation: { kind: "REVIEWED_EVALUATOR", evaluatorId: "not-registered", version: "1" } });
  const result = single(reviewed, context({ elements: [corridor] })).evaluation;
  assert.equal(result.status, "NEEDS_REVIEW");
  assert.equal(result.reasonCode, "EVALUATOR_UNAVAILABLE");
});

test("element rules without matching elements stay UNKNOWN unless clearly not applicable", () => {
  assert.equal(single(rule(), context()).evaluation.reasonCode, "NO_MATCHING_ELEMENTS");
  assert.equal(single(rule(), context({ project: project({ purpose: "OTHER" }) })).evaluation.status, "NOT_APPLICABLE");
});

test("BOOL and COUNT rules evaluate at project level from confirmed facts only", () => {
  const boolRule = rule({ elementType: "UNKNOWN", requiredInputs: [], evaluation: { kind: "BOOL", field: "hasAccessibleRoute", expected: true } });
  assert.equal(single(boolRule, context()).evaluation.reasonCode, "MISSING_CHARACTERISTIC");
  assert.equal(single(boolRule, context({ project: project({ characteristics: { hasAccessibleRoute: false } }) })).evaluation.status, "FAIL");

  const countRule = rule({ elementType: "EXIT", requiredInputs: [], evaluation: { kind: "COUNT_MIN", elementType: "EXIT", threshold: 2 } });
  const confirmed = element("EXIT");
  const suggested = element("EXIT", { extraction: "AI_SUGGESTED" });
  assert.equal(single(countRule, context({ elements: [confirmed, suggested] })).evaluation.reasonCode, "COUNT_UNCONFIRMED_ELEMENTS");
  assert.equal(single(countRule, context({ elements: [confirmed] })).evaluation.status, "FAIL");
  assert.equal(single(countRule, context({ elements: [confirmed, element("EXIT")] })).evaluation.status, "PASS");

  const maxRule = rule({ elementType: "STAIR", requiredInputs: [], evaluation: { kind: "COUNT_MAX", elementType: "STAIR", threshold: 1 } });
  assert.equal(single(maxRule, context({ elements: [element("STAIR"), element("STAIR", { extraction: "AI_SUGGESTED" })] })).evaluation.status, "UNKNOWN");
  assert.equal(single(maxRule, context({ elements: [element("STAIR"), element("STAIR")] })).evaluation.status, "FAIL");
});

test("two data-distinct plans produce different outcomes for the same rule", () => {
  const evaluate = (width: number) => {
    const corridor = element("CORRIDOR");
    return evaluateRules([rule()], context({ elements: [corridor], measurements: [measurement(corridor, "CLEAR_WIDTH_M", width)] }))
      .results.map((result) => result.evaluation.status);
  };
  assert.deepEqual(evaluate(1.05), ["FAIL"]);
  assert.deepEqual(evaluate(1.35), ["PASS"]);
});

test("fingerprints ignore generated IDs and timestamps but track inputs", () => {
  const corridor = element("CORRIDOR");
  const shared = rule();
  const width = measurement(corridor, "CLEAR_WIDTH_M", 1.1);
  const first = single(shared, context({ elements: [corridor], measurements: [width] }));
  const second = single(shared, context({ elements: [corridor], measurements: [width], now: "2026-10-31T09:00:00.000Z" }));
  assert.notEqual(first.evaluation.id, second.evaluation.id);
  assert.equal(first.fingerprint, second.fingerprint);

  const changed = single(shared, context({ elements: [corridor], measurements: [{ ...width, value: 1.3 }] }));
  assert.notEqual(first.fingerprint, changed.fingerprint);

  assert.equal(canonicalJson({ b: 1, a: [2, { d: undefined, c: 3 }] }), '{"a":[2,{"c":3}],"b":1}');
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});
