import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ArchitecturalElementSchema, ComplianceRuleSchema, MeasurementSchema, ProjectSchema, contractFixture, unitForMetric } from "../../src/domain";
import { complianceRules, regulationProvisions } from "../../src/rules/registry";
import { getActiveFloorPlanRules, getFloorPlanCatalogue, getFloorPlanRules } from "../../src/rules/registry/floor-plan";
import { evaluateRules } from "../../src/rules/engine";
import cases from "../../fixtures/regulations/rule-cases-004.json";
import review from "../../fixtures/regulations/004-human-review.json";
import { assertRuleApproval } from "./approval-fixtures";

test("floor-plan view audits all 35 rules and excludes vertical/building-only input requirements", () => {
  const catalogue = getFloorPlanCatalogue();
  assert.equal(catalogue.length, 35);
  assert.equal(new Set(catalogue.map((e) => e.ruleId)).size, complianceRules.length);
  assert.equal(catalogue.filter((e) => e.inputMode === "PLAN_GEOMETRY").length, 26);
  assert.equal(catalogue.filter((e) => e.inputMode === "PLAN_GRAPH").length, 1);
  assert.equal(catalogue.filter((e) => e.inputMode === "PLAN_ANNOTATIONS").length, 2);
  assert.equal(catalogue.filter((e) => e.inputMode === "EXTRA_DOCUMENTATION").length, 6);
  const strict = getFloorPlanRules();
  assert.equal(strict.length, 26);
  assert.equal(strict.filter((r) => r.evaluation.kind !== "REVIEWED_EVALUATOR").length, 20);
  assert.ok(strict.every((r) => r.requiredInputs.every((m) => !["HEIGHT_M", "RISE_M", "SLOPE_RATIO", "FLOOR_COUNT"].includes(m))));
  assert.deepEqual(getActiveFloorPlanRules("2026-10-30"), []);
  assert.throws(() => getActiveFloorPlanRules("not-a-date"));
  strict[0].title = "caller mutation";
  assert.notEqual(getFloorPlanRules()[0].title, "caller mutation");
});

test("004 records exact source clauses and the explicit approval of floor-plan rules", () => {
  const added = complianceRules.filter((r) => r.id.startsWith("00400000"));
  assert.equal(added.length, 10);
  assert.equal(added.filter((r) => r.lifecycle === "HUMAN_VERIFIED").length, 10);
  assert.equal(added.filter((r) => r.evaluation.kind === "REVIEWED_EVALUATOR").length, 6);
  assert.equal(complianceRules.filter((r) => r.lifecycle === "HUMAN_VERIFIED").length, 26);
  const keys = regulationProvisions.map((p) => JSON.stringify([p.sourceId, p.sourceVersion, p.article, p.paragraph, p.item]));
  assert.equal(new Set(keys).size, keys.length);
  const text = readFileSync("fixtures/regulations/accessibility-current.txt", "utf8");
  for (const rule of added) {
    assertRuleApproval(rule, "CANDIDATE");
    const p = regulationProvisions.find((p) => p.id === rule.provisionIds[0])!;
    assert.ok(p);
    assert.ok(text.includes(p.text));
    assert.equal(p.verification, "SOURCE_VERIFIED");
  }
});

test("Petar approval covers exactly the 26 strict floor-plan rules, never the other nine or activation", () => {
  const expectedIds = getFloorPlanRules().map((r) => r.id).sort();
  assert.equal(review.reviewer, "Petar Popovic");
  assert.equal(review.activationApproved, false);
  assert.deepEqual(review.ruleApprovals.map((r) => r.ruleId).sort(), expectedIds);
  for (const rule of complianceRules) {
    if (expectedIds.includes(rule.id)) assertRuleApproval(rule, "CANDIDATE");
    else {
      assert.equal(rule.approvedBy, undefined);
      assert.equal(rule.approvedAt, undefined);
      assert.notEqual(rule.lifecycle, "HUMAN_VERIFIED");
    }
    assert.notEqual(rule.lifecycle, "ACTIVE");
  }
});

for (const bundle of cases.bundles) {
  const original = complianceRules.find((r) => r.id === bundle.ruleId)!;
  assert.ok(original);
  assert.deepEqual(original.testFixtureIds, bundle.cases.map((item) => item.id));
  const probe = ComplianceRuleSchema.parse({ ...structuredClone(original), id: randomUUID(), lifecycle: "ACTIVE", approvedBy: "TEST_ONLY_NOT_HUMAN_APPROVAL", approvedAt: "2026-10-30T18:00:00Z" });
  for (const item of bundle.cases) {
    test(`004 floor-plan ${bundle.ruleId.slice(-2)} ${item.name} -> ${item.expected}`, () => {
      const project = ProjectSchema.parse({ ...contractFixture.project, phase: "DESIGN", characteristics: { isNewBuild: true, hasPublicAccess: true } });
      const element = ArchitecturalElementSchema.parse({ ...contractFixture.element, type: bundle.elementType, subtype: bundle.subtype });
      switch (item.name) {
        case "pass": case "fail": case "boundary": case "missing-measurement": case "unverified-measurement": case "missing-evaluator": break;
        case "missing-subtype": delete element.subtype; break;
        case "wrong-subtype": element.subtype = "OTHER"; break;
        case "missing-new-build": delete project.characteristics.isNewBuild; break;
        case "missing-public-context": delete project.characteristics.hasPublicAccess; break;
        case "reconstruction": project.phase = "RECONSTRUCTION"; break;
        default: throw new Error(`UNHANDLED_PLAN_CASE: ${item.name}`);
      }
      const definition = original.evaluation;
      const measurements = item.value !== null && (definition.kind === "MIN" || definition.kind === "MAX") ? [MeasurementSchema.parse({ ...contractFixture.measurement, metric: definition.metric, value: item.value, unit: unitForMetric(definition.metric), source: item.name === "unverified-measurement" ? "AI_ESTIMATE" : "USER_ENTERED", verification: item.name === "unverified-measurement" ? "UNVERIFIED" : "USER_CONFIRMED" })] : [];
      const ctx = { project, elements: [element], measurements, asOf: "2026-10-30", now: "2026-10-30T18:00:00Z", newId: randomUUID };
      const outcome = evaluateRules([probe], ctx).results[0].evaluation;
      assert.equal(outcome.status, item.expected);
      if (item.name === "missing-evaluator") assert.equal(outcome.reasonCode, "EVALUATOR_UNAVAILABLE");
      assert.deepEqual(evaluateRules([original], ctx).results, []);
    });
  }
}
