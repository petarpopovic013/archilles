import assert from "node:assert/strict";
import test from "node:test";
import { RuleRequirementsSchema } from "../../src/domain";
import { complianceRules } from "../../src/rules/registry";
import { createRegulatoryRegistry } from "../../runtime/adapters/registry";
import type { RuntimeContext } from "../../runtime/context";
import { ruleRequirements } from "../../runtime/services/requirements";

const ctx = { registry: createRegulatoryRegistry() } as RuntimeContext;

test("requirements list every subtype the registry's rules use, with their metrics", async () => {
  const requirements = RuleRequirementsSchema.parse(await ruleRequirements(ctx));
  const listed = new Set(requirements.subtypes.map((entry) => `${entry.elementType}:${entry.subtype}`));
  for (const rule of complianceRules) {
    const json = JSON.stringify(rule.applicability);
    for (const [, subtype] of json.matchAll(/"field":"element\.subtype","value":"([^"]+)"/g)) {
      assert.ok(listed.has(`${rule.elementType}:${subtype}`), `${rule.title} -> ${subtype}`);
    }
  }
  const door = requirements.subtypes.find((entry) => entry.subtype === "ACCESSIBLE_INTERNAL_DOOR_ART22")!;
  assert.equal(door.elementType, "DOOR");
  assert.deepEqual(new Set(door.rules.flatMap((rule) => rule.metrics)), new Set(["CLEAR_WIDTH_M", "RISE_M"]), "width and threshold share a subtype");
  const ramp = requirements.subtypes.find((entry) => entry.subtype === "CONFIRMED_STANDARD_FIVE_PERCENT_RAMP")!;
  assert.deepEqual(ramp.rules.flatMap((rule) => rule.metrics), ["SLOPE_RATIO"]);
});

test("classifications are the exact values rules compare against, Cyrillic included", async () => {
  const { classifications } = await ruleRequirements(ctx);
  assert.ok(classifications.includes("ИП1"));
  assert.ok(classifications.includes("НП1"));
  assert.ok(!classifications.includes("IP1"), "no transliterated values that would never match");
});
