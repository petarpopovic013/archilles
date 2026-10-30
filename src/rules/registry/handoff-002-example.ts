import { contractFixture } from "../../domain";
import { evaluateRules } from "../engine";
import { complianceRules, getActiveRules, regulationProvisions } from ".";
import cases from "../../../fixtures/regulations/rule-cases-002.json";

const additionalRules = complianceRules.filter((rule) => rule.id.startsWith("00200000"));
const rejected = evaluateRules(additionalRules, {
  project: contractFixture.project, elements: [], measurements: [],
  asOf: "2026-10-30", now: "2026-10-30T17:00:00Z", newId: () => crypto.randomUUID(),
});
console.log(JSON.stringify({
  notice: "Review package only. No new human approvals, activations, actual plan findings or model calls.",
  registryRuleCount: complianceRules.length,
  provisionCount: regulationProvisions.length,
  caseCount: cases.bundles.reduce((count, bundle) => count + bundle.cases.length, 0),
  rules: additionalRules.map(({ id, title, lifecycle, evaluation, requiredInputs }) => ({ id, title, lifecycle, evaluation, requiredInputs })),
  activeRuleIds: getActiveRules("2026-10-30").map((rule) => rule.id),
  engineRejections: rejected.rejected,
}, null, 2));
