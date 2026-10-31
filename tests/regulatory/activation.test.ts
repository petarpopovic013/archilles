import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ArchitecturalElementSchema, MeasurementSchema, ProjectSchema, contractFixture } from "../../src/domain";
import { evaluateRules, reviewedEvaluators } from "../../src/rules/engine";
import { complianceRules, getActiveRules } from "../../src/rules/registry";
import activation from "../../fixtures/regulations/005-activation.json";
import review from "../../fixtures/regulations/004-human-review.json";
import firstCases from "../../fixtures/regulations/rule-cases.json";
import additionalCases from "../../fixtures/regulations/rule-cases-002.json";
import expandedCases from "../../fixtures/regulations/rule-cases-003.json";
import floorPlanCases from "../../fixtures/regulations/rule-cases-004.json";
import { assertActiveRegistry, assertRuleApproval } from "./approval-fixtures";
import { loadConfirmedFixture } from "../../src/geometry/fixtures";
import officeA from "../../fixtures/plans/office-a.json";
import officeB from "../../fixtures/plans/office-b.json";

test("activation is separately authorized and partitions the exact human-reviewed scope", () => {
  assert.equal(activation.authorizationStatement, "copy all human rules to active");
  assert.ok(Number.isFinite(Date.parse(activation.authorizedAt)));
  assert.equal(activation.humanReviewRecord, "004-human-review.json");
  assert.equal(review.activationApproved, false); // Preserve the historical approval's limited scope.
  assert.equal(activation.activatedRules.length, 20);
  assert.equal(activation.blockedRules.length, 6);
  const scoped = [...activation.activatedRules, ...activation.blockedRules];
  assert.equal(new Set(scoped.map((record) => record.ruleId)).size, 26);
  assert.deepEqual(
    scoped.map((record) => [record.ruleId, record.ruleVersion]).sort(),
    review.ruleApprovals.map((record) => [record.ruleId, record.ruleVersion]).sort(),
  );
  assertActiveRegistry(getActiveRules(activation.authorizedAt.slice(0, 10)));
  for (const record of scoped) {
    const rule = complianceRules.find((rule) => rule.id === record.ruleId)!;
    assertRuleApproval(rule, "CANDIDATE");
  }
  assert.equal(complianceRules.filter((rule) => rule.lifecycle === "AI_REVIEWED").length, 4);
  assert.equal(complianceRules.filter((rule) => rule.lifecycle === "CANDIDATE").length, 5);
});

test("every activated rule has supported arithmetic and its exact numerical/applicability fixture coverage", () => {
  const bundles = [
    { ruleId: firstCases.ruleId, cases: firstCases.cases },
    ...additionalCases.bundles, ...expandedCases.bundles, ...floorPlanCases.bundles,
  ];
  for (const rule of getActiveRules("2026-10-31")) {
    assert.ok(rule.evaluation.kind === "MIN" || rule.evaluation.kind === "MAX");
    const bundle = bundles.find((bundle) => bundle.ruleId === rule.id)!;
    assert.ok(bundle, rule.id);
    assert.deepEqual(rule.testFixtureIds, bundle.cases.map((item) => item.id));
    const names = new Set(bundle.cases.map((item) => item.name));
    for (const required of ["pass", "fail", "boundary", "missing-subtype"]) assert.ok(names.has(required), `${rule.id}: ${required}`);
    assert.ok(names.has("missing") || names.has("missing-measurement"), rule.id);
    assert.ok(names.has("unverified") || names.has("unverified-measurement"), rule.id);
    assert.ok(names.has("not-applicable") || names.has("wrong-subtype"), rule.id);
  }
});

test("six unimplemented geometric evaluators remain human-verified and outside the active registry", () => {
  for (const record of activation.blockedRules) {
    const rule = complianceRules.find((rule) => rule.id === record.ruleId)!;
    assert.equal(rule.lifecycle, "HUMAN_VERIFIED");
    assert.equal(record.reasonCode, "EVALUATOR_UNAVAILABLE");
    assert.equal(rule.evaluation.kind, "REVIEWED_EVALUATOR");
    if (rule.evaluation.kind !== "REVIEWED_EVALUATOR") throw new Error("EXPECTED_REVIEWED_EVALUATOR");
    assert.equal(rule.evaluation.evaluatorId, record.evaluatorId);
    assert.equal(rule.evaluation.version, record.evaluatorVersion);
    assert.equal(reviewedEvaluators[record.evaluatorId]?.[record.evaluatorVersion], undefined);
  }
});

test("two disclosed fixture plans produce different outcomes through the actual active rule", () => {
  const bundle = additionalCases.bundles.find((bundle) => bundle.ruleId.endsWith("000000000011"))!;
  const rule = getActiveRules("2026-10-31").find((rule) => rule.id === bundle.ruleId)!;
  const project = ProjectSchema.parse({ ...contractFixture.project, ...bundle.project });
  const outcomes = [officeA, officeB].map((fixture) => {
    const geometry = loadConfirmedFixture(fixture, {
      projectId: project.id, drawingId: contractFixture.drawing.id, floorId: contractFixture.floor.id,
      revision: project.revision, at: activation.authorizedAt,
    });
    const corridor = geometry.elements.find((element) => element.type === "CORRIDOR")!;
    // Explicit synthetic test scope; the loader never infers regulatory subtypes from a plan.
    const element = ArchitecturalElementSchema.parse({ ...corridor, subtype: bundle.subtype, extraction: "USER_CONFIRMED" });
    const result = evaluateRules([rule], {
      project, elements: [element], measurements: geometry.measurements, asOf: "2026-10-31",
      now: activation.authorizedAt, newId: randomUUID,
    });
    assert.deepEqual(result.rejected, []);
    assert.ok(geometry.warnings.some((warning) => warning.startsWith("DISCLOSED SYNTHETIC FIXTURE:")));
    return result.results[0];
  });
  assert.deepEqual(outcomes.map((result) => result.evaluation.status), ["FAIL", "PASS"]);
  assert.notEqual(outcomes[0].fingerprint, outcomes[1].fingerprint);
});

for (const item of firstCases.cases) {
  test(`activated 001 rule: ${item.name} -> ${item.expectedAfterReviewedActivation}`, () => {
    const rule = getActiveRules("2026-10-31").find((rule) => rule.id === firstCases.ruleId)!;
    assert.ok(rule);
    const project = ProjectSchema.parse({ ...contractFixture.project, characteristics: { isNewBuild: true } });
    const element = ArchitecturalElementSchema.parse({ ...contractFixture.element, subtype: item.subtype ?? undefined });
    const measurements = item.widthM === null ? [] : [MeasurementSchema.parse({
      ...contractFixture.measurement, value: item.widthM, verification: item.verification,
      source: item.verification === "UNVERIFIED" ? "AI_ESTIMATE" : "USER_ENTERED",
    })];
    const result = evaluateRules([rule], { project, elements: [element], measurements, asOf: "2026-10-31", now: activation.authorizedAt, newId: randomUUID });
    assert.deepEqual(result.rejected, []);
    assert.equal(result.results[0].evaluation.ruleId, rule.id);
    assert.equal(result.results[0].evaluation.ruleVersion, rule.version);
    assert.equal(result.results[0].evaluation.status, item.expectedAfterReviewedActivation);
  });
}
