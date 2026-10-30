import { z } from "zod";
import {
  ComplianceRuleSchema,
  type ComplianceRule,
  type RegulationProvision,
  type RegulationSource,
} from "../../domain";
import ruleData from "../../../fixtures/regulations/rules.json";
import { regulationProvisions, regulationSources } from "../sources";

export { regulationProvisions, regulationSources } from "../sources";
export const complianceRules = ruleData.map((rule) => ComplianceRuleSchema.parse(rule));

/** Testable registry gate; never promotes a lifecycle or supplies a missing effective date. */
export function filterActiveRules(
  sourceVersionDate: string,
  rules: readonly ComplianceRule[],
  sources: readonly RegulationSource[],
  provisions: readonly RegulationProvision[],
): ComplianceRule[] {
  const date = z.iso.date().parse(sourceVersionDate);
  const selected: ComplianceRule[] = [];
  const ids = new Set<string>();
  for (const input of rules) {
    const rule = ComplianceRuleSchema.parse(input);
    if (rule.lifecycle !== "ACTIVE") continue;
    const source = sources.find((item) => item.id === rule.sourceId && item.sourceVersion === rule.sourceVersion);
    if (!source || source.status !== "CURRENT_CONFIRMED" || !source.verifiedBy || !source.verifiedAt) continue;
    if (!rule.effectiveFrom || rule.effectiveFrom > date || (rule.effectiveTo && date > rule.effectiveTo)) continue;
    if (!source.effectiveFrom || source.effectiveFrom > date || (source.effectiveTo && date > source.effectiveTo)) continue;
    if (!rule.provisionIds.every((id) => provisions.some((item) =>
      item.id === id && item.sourceId === source.id && item.sourceVersion === source.sourceVersion && item.verification === "SOURCE_VERIFIED",
    ))) continue;
    if (ids.has(rule.id)) throw new Error("REGISTRY_OVERLAPPING_ACTIVE_VERSIONS");
    ids.add(rule.id);
    selected.push(rule);
  }
  return structuredClone(selected);
}

export function getActiveRules(sourceVersionDate: string): ComplianceRule[] {
  return filterActiveRules(sourceVersionDate, complianceRules, regulationSources, regulationProvisions);
}
