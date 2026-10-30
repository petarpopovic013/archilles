import assert from "node:assert/strict";
import test from "node:test";
import { contractFixture, type ComplianceRule, type Project } from "../../src/domain";
import { checkRuleApplicability, selectApplicableRules } from "../../src/rules/applicability";
import { complianceRules } from "../../src/rules/registry";
import { eventPayloadSchemas } from "../../src/domain";

const project: Project = { ...contractFixture.project, purpose: "OFFICE", phase: "DESIGN", characteristics: { isNewBuild: true } };
const element = { ...contractFixture.element, projectId: project.id, revision: project.revision, type: "CORRIDOR" as const, subtype: "FIXED_FURNITURE_PASSAGE" };
// Synthetic ACTIVE copy is only for selector tests. It is never exported or numerically evaluated.
const rule: ComplianceRule = { ...complianceRules[0], lifecycle: "ACTIVE", approvedBy: "TEST ONLY", approvedAt: "2026-01-01T00:00:00Z" };

test("selector returns wire-compatible IDs and explanations, never evaluations", () => {
  const selected = selectApplicableRules(project, [element], [rule, rule]);
  assert.deepEqual(selected.ruleIds, [rule.id]);
  assert.deepEqual(selected.missingContext, []);
  assert.deepEqual(Object.keys(selected).sort(), ["explanations", "missingContext", "ruleIds"]);
  eventPayloadSchemas["regulation.rules.selected"].parse(selected);
  assert.deepEqual(selectApplicableRules(project, [element], complianceRules).ruleIds, []);
});

test("known false conditions exclude, unknown metadata and absent elements stay possible", () => {
  assert.deepEqual(selectApplicableRules({ ...project, purpose: "OTHER" }, [element], [rule]).ruleIds, []);
  const selection = selectApplicableRules({ ...project, characteristics: {} }, [{ ...element, subtype: undefined }], [rule]);
  assert.deepEqual(selection.ruleIds, [rule.id]);
  assert.deepEqual(selection.missingContext, ["characteristic.isNewBuild", "element.subtype"]);
  assert.ok(selectApplicableRules(project, [], [rule]).missingContext.includes("element.type"));
  assert.equal(checkRuleApplicability(project, { ...element, subtype: "OTHER" }, rule).truth, "FALSE");
});

test("proven and unknown exceptions retain three-valued semantics", () => {
  const except: ComplianceRule = { ...rule, exceptionConditions: [{ op: "EQ", field: "characteristic", key: "hasExternalStair", value: true }] };
  assert.equal(checkRuleApplicability(project, element, except).truth, "UNKNOWN");
  assert.deepEqual(checkRuleApplicability({ ...project, characteristics: { isNewBuild: true, hasExternalStair: true } }, element, except), { truth: "FALSE", unknownFacts: [] });
  assert.equal(checkRuleApplicability({ ...project, characteristics: { isNewBuild: true, hasExternalStair: false } }, element, except).truth, "TRUE");
});

test("ALL/ANY use shared engine logic and definite facts dominate unrelated missing facts", () => {
  const any: ComplianceRule = { ...rule, applicability: { op: "ANY", children: [{ op: "EQ", field: "purpose", value: "OFFICE" }, { op: "GTE", field: "buildingHeightM", value: 10 }] } };
  assert.equal(checkRuleApplicability({ ...project, buildingHeightM: undefined }, element, any).truth, "TRUE");
  assert.equal(checkRuleApplicability({ ...project, purpose: "OTHER", buildingHeightM: undefined }, element, any).truth, "UNKNOWN");
  assert.equal(checkRuleApplicability({ ...project, purpose: "OTHER", characteristics: {} }, element, rule).truth, "FALSE");
});

test("one unknown target is retained alongside an applicable target and stale/cross-project geometry is rejected", () => {
  assert.deepEqual(selectApplicableRules(project, [element, { ...element, id: crypto.randomUUID(), subtype: undefined }], [rule]).missingContext, ["element.subtype"]);
  assert.throws(() => selectApplicableRules(project, [{ ...element, revision: project.revision + 1 }], [rule]), /REGULATORY_ELEMENT_REVISION_MISMATCH/);
  assert.throws(() => selectApplicableRules(project, [{ ...element, projectId: crypto.randomUUID() }], [rule]), /REGULATORY_ELEMENT_REVISION_MISMATCH/);
});
