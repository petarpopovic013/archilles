import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ComplianceRuleSchema, RegulationProvisionSchema, RegulationSourceSchema, contractFixture } from "../../src/domain";
import { complianceRules, filterActiveRules, getActiveRules, regulationProvisions, regulationSources } from "../../src/rules/registry";
import { evaluateRules } from "../../src/rules/engine";
import manifest from "../../fixtures/regulations/manifest.json";
import cases from "../../fixtures/regulations/rule-cases.json";
import aiReview from "../../fixtures/regulations/ai-review.json";
import humanReview from "../../fixtures/regulations/human-review.json";
import { assertActiveRegistry } from "./approval-fixtures";

const DATE = "2026-10-30";

function syntheticRegistry() {
  // TEST ONLY: fictional approval/date metadata exercises the admission gate, not a legal approval.
  const source = RegulationSourceSchema.parse({ ...regulationSources.find((s) => s.id === complianceRules[0].sourceId), status: "CURRENT_CONFIRMED", verifiedBy: "TEST ONLY", verifiedAt: "2026-01-01T00:00:00Z", effectiveFrom: "2026-01-01" });
  const provisions = regulationProvisions.map((p) => RegulationProvisionSchema.parse({ ...p, verification: "SOURCE_VERIFIED" }));
  const rule = ComplianceRuleSchema.parse({ ...complianceRules[0], lifecycle: "ACTIVE", approvedBy: "TEST ONLY", approvedAt: "2026-01-01T00:00:00Z", effectiveFrom: "2026-01-01", effectiveTo: DATE });
  return { source, provisions, rule };
}

test("captures match manifest and PDF identity; no shell is represented as a legal text", () => {
  for (const artifact of manifest.artifacts) {
    const bytes = readFileSync(artifact.path);
    assert.equal(bytes.length, artifact.byteSize);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
    if (artifact.kind === "APPLICATION_SHELL_NOT_LEGAL_TEXT") assert.match(bytes.toString(), /id=app/);
    if (artifact.kind === "OFFICIAL_BASE_TEXT") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  }
});

test("domain records validate with 20 activated and six evaluator-blocked human-verified rules", () => {
  regulationSources.forEach((s) => RegulationSourceSchema.parse(s));
  regulationProvisions.forEach((p) => {
    RegulationProvisionSchema.parse(p);
    assert.ok(regulationSources.some((s) => s.id === p.sourceId && s.sourceVersion === p.sourceVersion));
    for (const id of p.crossReferenceIds) assert.ok(regulationProvisions.some((other) => other.id === id));
  });
  assert.equal(complianceRules.filter((rule) => rule.lifecycle === "HUMAN_VERIFIED").length, 6);
  const rule = ComplianceRuleSchema.parse(complianceRules[0]);
  assert.equal(rule.lifecycle, "ACTIVE");
  assert.equal(rule.approvedBy, humanReview.reviewer);
  assert.equal(rule.approvedAt, humanReview.reviewedAt);
  assert.deepEqual(humanReview.testFixtureIds, rule.testFixtureIds);
  assert.equal(humanReview.ruleVersion, rule.version);
  assert.equal(humanReview.activationApproved, false);
  for (const id of rule.provisionIds) assert.ok(regulationProvisions.some((p) => p.id === id));
  assert.deepEqual(rule.testFixtureIds, cases.cases.map((c) => c.id));
  assert.match(regulationProvisions.find((p) => p.article === "18")!.text, /најмање 90 цм/);
  assertActiveRegistry(getActiveRules(DATE));
});

test("current rule is tied to captured official text and explicit human approval", () => {
  const rule = complianceRules[0];
  const source = regulationSources.find((s) => s.id === rule.sourceId)!;
  assert.equal(rule.version, 2);
  assert.equal(source.sourceVersion, rule.sourceVersion);
  assert.equal(source.status, "CURRENT_CONFIRMED");
  assert.equal(source.verifiedBy, humanReview.reviewer);
  assert.equal(source.verifiedAt, humanReview.reviewedAt);
  assert.equal(source.effectiveFrom, "2026-02-07");
  assert.equal(rule.effectiveFrom, source.effectiveFrom);
  const artifact = manifest.artifacts.find((a) => a.path.endsWith("/accessibility-current.html"))!;
  assert.equal(source.sha256, artifact.sha256);
  const operative = regulationProvisions.find((p) => p.sourceId === source.id && p.article === "18" && p.paragraph === "1")!;
  assert.ok(rule.provisionIds.includes(operative.id));
  assert.equal(operative.verification, "SOURCE_VERIFIED");
  assert.ok(humanReview.provisionIds.includes(operative.id));
  assert.equal(operative.text, "Приликом уграђивања фиксних елемената намештаја обезбеђују се коридори за кретање ширине најмање 90 cm.");
  assert.ok(readFileSync("fixtures/regulations/accessibility-current.txt", "utf8").includes(operative.text));
  assert.equal(aiReview.independentHumanReview, false);
  assert.equal(aiReview.ruleVersion, rule.version);
  assert.equal(aiReview.sourceVersion, source.sourceVersion);
  assert.equal(cases.ruleVersion, rule.version);
  const amendment = readFileSync("fixtures/regulations/accessibility-amendment-10-2026.txt", "utf8");
  assert.match(amendment, /У члану 35/);
  assert.match(amendment, /Члан 39\. мења се/);
  assert.doesNotMatch(amendment, /(?:У члану|Члан) 18\./);
});

test("registry validates dates, excludes non-active lifecycles and returns independent data", () => {
  const { source, provisions, rule } = syntheticRegistry();
  assert.throws(() => getActiveRules("2026-02-30"));
  assert.throws(() => getActiveRules("2026-10-30T00:00:00Z"));
  for (const lifecycle of ["CANDIDATE", "AI_REVIEWED", "HUMAN_VERIFIED", "REJECTED", "SUPERSEDED"] as const) {
    assert.deepEqual(filterActiveRules(DATE, [{ ...rule, lifecycle }], [source], provisions), []);
  }
  const selected = filterActiveRules(DATE, [rule], [source], provisions);
  assert.equal(selected.length, 1);
  selected[0].title = "mutated";
  assert.notEqual(rule.title, "mutated");
});

test("registry requires exact human-verified provenance and known effective windows", () => {
  const { source, provisions, rule } = syntheticRegistry();
  assert.deepEqual(filterActiveRules("2025-12-31", [rule], [source], provisions), []);
  assert.deepEqual(filterActiveRules("2026-10-31", [rule], [source], provisions), []);
  assert.deepEqual(filterActiveRules(DATE, [{ ...rule, effectiveFrom: undefined }], [source], provisions), []);
  assert.deepEqual(filterActiveRules(DATE, [rule], [{ ...source, effectiveFrom: undefined }], provisions), []);
  assert.deepEqual(filterActiveRules(DATE, [rule], [{ ...source, status: "CURRENT_UNCONFIRMED" }], provisions), []);
  assert.deepEqual(filterActiveRules(DATE, [rule], [{ ...source, sourceVersion: "other" }], provisions), []);
  assert.deepEqual(filterActiveRules(DATE, [rule], [source], provisions.map((p) => ({ ...p, verification: "UNVERIFIED" }))), []);
  assert.deepEqual(filterActiveRules(DATE, [rule], [source], provisions.filter((p) => !rule.provisionIds.includes(p.id))), []);
  assert.throws(() => filterActiveRules(DATE, [rule, { ...rule, version: rule.version + 1 }], [source], provisions), /REGISTRY_OVERLAPPING_ACTIVE_VERSIONS/);
});

test("all remaining inactive rules are rejected before numerical evaluation", () => {
  const inactive = complianceRules.filter((rule) => rule.lifecycle !== "ACTIVE");
  const result = evaluateRules(inactive, { project: contractFixture.project, elements: [], measurements: [], asOf: DATE, now: "2026-10-30T00:00:00Z", newId: () => crypto.randomUUID() });
  assert.deepEqual(result.results, []);
  assert.equal(result.rejected.length, 15);
  assert.ok(result.rejected.every((rejection) => rejection.reasonCode === "RULE_NOT_ACTIVE"));
});
