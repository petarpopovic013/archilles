import { createRegulatoryRegistry } from "./runtime-adapter";
import catalogue from "../../../fixtures/regulations/rule-catalogue-003.json";
import fixtures from "../../../fixtures/regulations/rule-cases-003.json";

async function main() {
  const registry = createRegulatoryRegistry();
  const snapshot = await registry.snapshot();
  console.log(JSON.stringify({
    notice: "Review catalogue, not active coverage or actual plan findings. No model calls.",
    totalRules: snapshot.rules.length,
    provisionCount: snapshot.provisionCount,
    activeRuleCount: (await registry.getActiveRules("2026-10-30")).length,
    newEngineSupported: catalogue.entries.filter((entry) => entry.readiness === "ENGINE_SUPPORTED").length,
    newEvaluatorRequired: catalogue.entries.filter((entry) => entry.readiness === "EVALUATOR_REQUIRED").length,
    fixtureCount: fixtures.bundles.reduce((count, bundle) => count + bundle.cases.length, 0),
    rules: snapshot.rules.map(({ id, title, lifecycle, evaluation }) => ({ id, title, lifecycle, evaluation })),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
