import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ArchitecturalElementSchema, ComplianceRuleSchema, MeasurementSchema, ProjectSchema,
  contractFixture, type ComplianceRule,
} from "../../src/domain";
import { evaluateRules, type EvaluationContext } from "../../src/rules/engine";
import { checkRuleApplicability } from "../../src/rules/applicability";
import { complianceRules, getActiveRules, regulationProvisions } from "../../src/rules/registry";
import fixtureData from "../../fixtures/regulations/rule-cases-002.json";
import review from "../../fixtures/regulations/002-ai-review.json";
import sourceCheck from "../../fixtures/regulations/002-source-check.json";
import additionalData from "../../fixtures/regulations/rules-002.json";
import { assertProvisionApproval, assertRuleApproval } from "./approval-fixtures";

const originals = additionalData.map((rule) => ComplianceRuleSchema.parse(rule));
const now = "2026-10-30T17:00:00Z";

/** Test-only, unrelated ID: never activates or modifies a registry entry. */
function evaluatorProbe(rule: ComplianceRule): ComplianceRule {
  return ComplianceRuleSchema.parse({
    ...structuredClone(rule), id: randomUUID(), title: `TEST ONLY evaluator probe: ${rule.title}`,
    lifecycle: "ACTIVE", approvedBy: "TEST_ONLY_NOT_HUMAN_APPROVAL", approvedAt: now,
  });
}

function contextFor(bundle: typeof fixtureData.bundles[number], item: typeof bundle.cases[number]): EvaluationContext {
  const project = ProjectSchema.parse({ ...contractFixture.project, ...bundle.project });
  const element = ArchitecturalElementSchema.parse({
    ...contractFixture.element, type: bundle.elementType, subtype: bundle.subtype,
    extraction: "USER_CONFIRMED",
    ...(bundle.subtype === "ABOVE_GROUND_STAIR_STEP" ? { relationIds: [randomUUID()] } : {}),
  });
  switch (item.name) {
    case "pass": case "fail": case "boundary": case "missing-measurement": case "unverified-measurement": break;
    case "wrong-subtype": element.subtype = "OTHER"; break;
    case "missing-subtype": delete element.subtype; break;
    case "reconstruction-outside-bounded-subset": project.phase = "RECONSTRUCTION"; break;
    case "missing-new-build-context": project.characteristics = {}; break;
    case "missing-fire-classification": delete project.classification; break;
    case "missing-building-height": delete project.buildingHeightM; break;
    case "excluded-classification": project.classification = "ИЈ1"; break;
    case "above-bounded-height": project.buildingHeightM = 11; break;
    default: throw new Error(`UNHANDLED_REGULATORY_FIXTURE: ${item.name}`);
  }
  const measurements = item.valueM === null ? [] : [MeasurementSchema.parse({
    ...contractFixture.measurement, metric: bundle.metric, value: item.valueM, unit: "m",
    source: item.name === "unverified-measurement" ? "AI_ESTIMATE" : "USER_ENTERED",
    verification: item.name === "unverified-measurement" ? "UNVERIFIED" : "USER_CONFIRMED",
  })];
  return { project, elements: [element], measurements, asOf: "2026-10-30", now, newId: randomUUID };
}

test("002 respects the newer explicitly scoped human approval across both sources", () => {
  assert.equal(originals.length, 4);
  assert.equal(complianceRules.filter((rule) => rule.id.startsWith("00100000") || rule.id.startsWith("00200000")).length, 5);
  assert.equal(new Set(originals.map((rule) => rule.sourceId)).size, 2);
  assert.equal(review.humanApproved, false);
  assert.deepEqual(review.ruleIds, originals.map((rule) => rule.id));
  assert.deepEqual(getActiveRules("2026-10-30"), []);
  for (const rule of originals) {
    assertRuleApproval(rule, "AI_REVIEWED");
    for (const id of rule.provisionIds) {
      const provision = regulationProvisions.find((p) => p.id === id)!;
      assert.ok(provision);
      assert.equal(provision.sourceId, rule.sourceId);
      assert.equal(provision.sourceVersion, rule.sourceVersion);
    }
    const ctx = contextFor(fixtureData.bundles.find((b) => b.ruleId === rule.id)!, fixtureData.bundles[0].cases[0]);
    const result = evaluateRules([rule], ctx);
    assert.deepEqual(result.results, []);
    assert.deepEqual(result.rejected.map((rejection) => rejection.reasonCode), ["RULE_NOT_ACTIVE"]);
  }
});

test("002 exact clauses occur in captured official text and source bytes were rechecked", () => {
  for (const check of sourceCheck.checks) {
    const name = check.contentUrl.includes("428109") ? "fire" : "accessibility";
    const raw = readFileSync(`fixtures/regulations/originals/${name}-current.html`);
    assert.equal(createHash("sha256").update(raw).digest("hex"), check.sha256);
    assert.equal(check.freshContentMatchesCapturedBytes, true);
    assert.equal(check.metadataVersionMatches, true);
  }
  for (const provision of regulationProvisions.filter((p) => p.id.startsWith("00200000"))) {
    const name = provision.article === "29" ? "fire" : "accessibility";
    assert.ok(readFileSync(`fixtures/regulations/${name}-current.txt`, "utf8").includes(provision.text));
    assertProvisionApproval(provision);
  }
});

for (const bundle of fixtureData.bundles) {
  const rule = originals.find((candidate) => candidate.id === bundle.ruleId)!;
  assert.ok(rule);
  assert.deepEqual(rule.testFixtureIds, bundle.cases.map((item) => item.id));
  const probe = evaluatorProbe(rule);
  for (const item of bundle.cases) {
    test(`002 evaluator probe ${bundle.ruleId.slice(-2)}: ${item.name} -> ${item.expected}`, () => {
      const ctx = contextFor(bundle, item);
      const result = evaluateRules([probe], ctx);
      assert.deepEqual(result.rejected, []);
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].evaluation.status, item.expected);
      assertRuleApproval(rule, "AI_REVIEWED");
    });
  }
  test(`002 applicability ${bundle.ruleId.slice(-2)}: missing source scope stays unknown`, () => {
    const ctx = contextFor(bundle, bundle.cases.find((item) => item.name === "missing-subtype")!);
    assert.equal(checkRuleApplicability(ctx.project, ctx.elements[0], rule).truth, "UNKNOWN");
  });
}

test("002 two data-distinct confirmed inputs give different dimension-only outcomes", () => {
  for (const bundle of fixtureData.bundles) {
    const probe = evaluatorProbe(originals.find((rule) => rule.id === bundle.ruleId)!);
    const passing = evaluateRules([probe], contextFor(bundle, bundle.cases.find((item) => item.name === "pass")!));
    const failing = evaluateRules([probe], contextFor(bundle, bundle.cases.find((item) => item.name === "fail")!));
    assert.equal(passing.results[0].evaluation.status, "PASS");
    assert.equal(failing.results[0].evaluation.status, "FAIL");
    assert.notEqual(passing.results[0].fingerprint, failing.results[0].fingerprint);
  }
});

test("002 one staircase flight supports fire and accessibility width checks without conflicting subtypes", () => {
  const fire = fixtureData.bundles.find((b) => b.ruleId.endsWith("000000000012"))!;
  const access = fixtureData.bundles.find((b) => b.ruleId.endsWith("000000000013"))!;
  assert.equal(fire.subtype, access.subtype);
  const ctx = contextFor(fire, { ...fire.cases[0], valueM: 1.1 });
  const probes = [fire, access].map((b) => evaluatorProbe(originals.find((r) => r.id === b.ruleId)!));
  assert.deepEqual(evaluateRules(probes, ctx).results.map((r) => r.evaluation.status), ["PASS", "FAIL"]);
});
