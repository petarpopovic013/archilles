import { contractFixture } from "../../domain";
import { evaluateRules } from "../engine";
import { selectApplicableRules } from "../applicability";
import { complianceRules, getActiveRules, regulationProvisions, regulationSources } from ".";

/** Run: node --import tsx src/rules/registry/handoff-example.ts */
const rules = getActiveRules("2026-10-30");
const result = evaluateRules(complianceRules, {
  project: contractFixture.project,
  elements: [],
  measurements: [],
  asOf: "2026-10-30",
  now: "2026-10-30T00:00:00Z",
  newId: () => crypto.randomUUID(),
});
console.log(JSON.stringify({
  notice: "Contract-only project. Human approval is recorded in human-review.json; rule activation and numerical legal evaluation are not performed.",
  sourceCount: regulationSources.length,
  provisionCount: regulationProvisions.length,
  reviewPackage: complianceRules.map(({ id, version, title, lifecycle }) => ({ id, version, title, lifecycle })),
  activeRuleIds: rules.map((rule) => rule.id),
  selection: selectApplicableRules(contractFixture.project, [], rules),
  candidateEngineResult: result,
}, null, 2));
