import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ArchitecturalElementSchema, ComplianceRuleSchema, MeasurementSchema, ProjectSchema,
  contractFixture, unitForMetric, type ComplianceRule,
} from "../../src/domain";
import { evaluateRules, reviewedEvaluators, type EvaluationContext } from "../../src/rules/engine";
import { checkRuleApplicability } from "../../src/rules/applicability";
import { complianceRules, getActiveRules, regulationProvisions } from "../../src/rules/registry";
import { createRegulatoryRegistry } from "../../src/rules/registry/runtime-adapter";
import ruleData from "../../fixtures/regulations/rules-003.json";
import caseData from "../../fixtures/regulations/rule-cases-003.json";
import catalogue from "../../fixtures/regulations/rule-catalogue-003.json";
import sourceCheck from "../../fixtures/regulations/003-source-check.json";

const rules = ruleData.map((rule) => ComplianceRuleSchema.parse(rule));
const now = "2026-10-30T18:00:00Z";
type Bundle = typeof caseData.bundles[number];

function probe(rule: ComplianceRule): ComplianceRule {
  return ComplianceRuleSchema.parse({
    ...structuredClone(rule), id: randomUUID(), title: `TEST ONLY: ${rule.title}`,
    lifecycle: "ACTIVE", approvedBy: "TEST_ONLY_NOT_HUMAN_APPROVAL", approvedAt: now,
  });
}

function context(rule: ComplianceRule, bundle: Bundle, item: Bundle["cases"][number]): EvaluationContext {
  const project = ProjectSchema.parse({
    ...contractFixture.project, phase: "DESIGN", classification: "ИП1", buildingHeightM: 8,
    characteristics: { isNewBuild: true },
  });
  const element = ArchitecturalElementSchema.parse({
    ...contractFixture.element, type: bundle.elementType, subtype: bundle.subtype,
  });
  const ctx: EvaluationContext = { project, elements: [element], measurements: [], asOf: "2026-10-30", now, newId: randomUUID };
  switch (item.name) {
    case "pass": case "fail": case "boundary": case "missing-measurement": case "unverified-measurement": case "missing-evaluator": break;
    case "missing-subtype": delete element.subtype; break;
    case "wrong-subtype": element.subtype = "OTHER"; break;
    case "missing-new-build": project.characteristics = {}; break;
    case "reconstruction": project.phase = "RECONSTRUCTION"; break;
    case "before-effective-date": ctx.asOf = "1900-01-01"; break;
    case "missing-fire-classification": delete project.classification; break;
    default: throw new Error(`UNHANDLED_EXPANDED_RULE_CASE: ${item.name}`);
  }
  const metric = rule.evaluation.kind === "MIN" || rule.evaluation.kind === "MAX" ? rule.evaluation.metric : undefined;
  if (metric && item.value !== null) {
    ctx.measurements = [MeasurementSchema.parse({
      ...contractFixture.measurement, metric, value: item.value, unit: unitForMetric(metric),
      source: item.name === "unverified-measurement" ? "AI_ESTIMATE" : "USER_ENTERED",
      verification: item.name === "unverified-measurement" ? "UNVERIFIED" : "USER_CONFIRMED",
    })];
  } else if (item.name === "missing-evaluator") {
    // Even with all named metrics present, unsupported computation cannot invent a result.
    ctx.measurements = rule.requiredInputs.map((metric) => MeasurementSchema.parse({
      ...contractFixture.measurement, id: randomUUID(), metric,
      value: unitForMetric(metric) === "count" ? 1 : 0.1, unit: unitForMetric(metric),
    }));
  }
  return ctx;
}

test("003 adds twenty distinct rules: fifteen bounded checks and five explicitly blocked evaluators", () => {
  assert.equal(rules.length, 20);
  assert.equal(complianceRules.length, 25);
  assert.equal(rules.filter((r) => r.lifecycle === "AI_REVIEWED").length, 15);
  assert.equal(rules.filter((r) => r.lifecycle === "CANDIDATE").length, 5);
  assert.deepEqual(getActiveRules("2026-10-30"), []);
  const signatures = rules.map((r) => JSON.stringify([r.sourceId, r.provisionIds, r.applicability, r.evaluation]));
  assert.equal(new Set(signatures).size, 20);
  for (const rule of rules) {
    assert.equal(rule.approvedBy, undefined);
    assert.equal(rule.approvedAt, undefined);
    assert.equal(rule.exceptionConditions.length, 0);
    for (const id of rule.provisionIds) {
      const provision = regulationProvisions.find((p) => p.id === id)!;
      assert.ok(provision);
      assert.equal(provision.sourceId, rule.sourceId);
      assert.equal(provision.sourceVersion, rule.sourceVersion);
    }
    const entry = catalogue.entries.find((entry) => entry.ruleId === rule.id)!;
    assert.ok(entry);
    assert.equal(entry.readiness === "EVALUATOR_REQUIRED", rule.evaluation.kind === "REVIEWED_EVALUATOR");
    if (rule.evaluation.kind === "REVIEWED_EVALUATOR") {
      assert.equal(reviewedEvaluators[rule.evaluation.evaluatorId]?.[rule.evaluation.version], undefined);
      assert.ok(entry.missingCapabilities.length >= 3);
    }
  }
});

test("003 clauses are exact source text and persistence keys are unique across all packages", () => {
  const keys = regulationProvisions.map((p) => JSON.stringify([p.sourceId, p.sourceVersion, p.article, p.paragraph, p.item]));
  assert.equal(new Set(keys).size, keys.length);
  const ids = regulationProvisions.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of regulationProvisions.filter((p) => p.id.startsWith("00300000"))) {
    const name = p.sourceId.endsWith("000000000001") ? "fire" : "accessibility";
    assert.ok(readFileSync(`fixtures/regulations/${name}-current.txt`, "utf8").includes(p.text));
    assert.equal(p.verification, "UNVERIFIED");
  }
  for (const check of sourceCheck.sources) {
    const name = check.sourceId.endsWith("000000000001") ? "fire" : "accessibility";
    assert.equal(createHash("sha256").update(readFileSync(`fixtures/regulations/originals/${name}-current.html`)).digest("hex"), check.sha256);
    assert.equal(check.matchesCapturedOfficialBytes, true);
  }
});

for (const bundle of caseData.bundles) {
  const rule = rules.find((r) => r.id === bundle.ruleId)!;
  assert.ok(rule);
  assert.deepEqual(rule.testFixtureIds, bundle.cases.map((item) => item.id));
  const copy = probe(rule);
  for (const item of bundle.cases) {
    test(`003 ${bundle.ruleId.slice(-2)} ${item.name}: ${item.expected}`, () => {
      const ctx = context(rule, bundle, item);
      const result = evaluateRules([copy], ctx);
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].evaluation.status, item.expected);
      if (item.name === "missing-evaluator") assert.equal(result.results[0].evaluation.reasonCode, "EVALUATOR_UNAVAILABLE");
      assert.notEqual(rule.lifecycle, "ACTIVE");
    });
  }
  test(`003 ${bundle.ruleId.slice(-2)} shipped original is rejected and missing subtype remains unknown`, () => {
    const ctx = context(rule, bundle, bundle.cases[0]);
    assert.deepEqual(evaluateRules([rule], ctx).rejected.map((r) => r.reasonCode), ["RULE_NOT_ACTIVE"]);
    assert.equal(checkRuleApplicability(ctx.project, { ...ctx.elements[0], subtype: undefined }, rule).truth, "UNKNOWN");
  });
}

test("003 slope uses ratios: 0.05 is five percent; a value of 5 cannot accidentally pass", () => {
  const rule = rules.find((r) => r.id.endsWith("000000000043"))!;
  const bundle = caseData.bundles.find((b) => b.ruleId === rule.id)!;
  const ctx = context(rule, bundle, { ...bundle.cases[0], value: 5 });
  assert.equal(evaluateRules([probe(rule)], ctx).results[0].evaluation.status, "FAIL");
});

test("003 one door supports width and threshold checks independently", () => {
  const width = rules.find((r) => r.id.endsWith("000000000034"))!;
  const threshold = rules.find((r) => r.id.endsWith("000000000042"))!;
  const bundle = caseData.bundles.find((b) => b.ruleId === width.id)!;
  const ctx = context(width, bundle, { ...bundle.cases[0], value: 0.85 });
  ctx.measurements.push(MeasurementSchema.parse({ ...contractFixture.measurement, id: randomUUID(), metric: "RISE_M", value: 0.03 }));
  assert.deepEqual(evaluateRules([probe(width), probe(threshold)], ctx).results.map((r) => r.evaluation.status), ["PASS", "FAIL"]);
});

test("003 Runtime RegistryPort adapter returns isolated snapshots and preserves lifecycle gates", async () => {
  const registry = createRegulatoryRegistry();
  const first = await registry.snapshot();
  assert.equal(first.rules.length, 25);
  assert.equal(first.provisionCount, regulationProvisions.length);
  first.rules[0].title = "caller mutation";
  first.sources[0].title = "caller mutation";
  const next = await registry.snapshot();
  assert.notEqual(next.rules[0].title, "caller mutation");
  assert.notEqual(next.sources[0].title, "caller mutation");
  assert.deepEqual(await registry.getActiveRules("2026-10-30"), []);
  assert.deepEqual((await registry.selectApplicableRules(contractFixture.project, [], next.rules)).ruleIds, []);
  await assert.rejects(registry.getActiveRules("2026-02-30"));
});
