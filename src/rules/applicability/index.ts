import {
  ArchitecturalElementSchema, ComplianceRuleSchema, ProjectSchema,
  type ArchitecturalElement, type ComplianceRule, type Project,
} from "../../domain";
import { evaluateCondition, type ConditionResult } from "../engine/conditions";

export interface RuleSelection {
  ruleIds: string[];
  explanations: Record<string, string>;
  missingContext: string[];
}

/** Applicability only; numerical evaluation and source/lifecycle admission belong to the engine/registry. */
export function checkRuleApplicability(
  project: Project, element: ArchitecturalElement | undefined, rule: ComplianceRule,
): ConditionResult {
  const facts = { project, element };
  const base = evaluateCondition(rule.applicability, facts);
  if (base.truth === "FALSE") return base;
  const exceptions = rule.exceptionConditions.map((condition) => evaluateCondition(condition, facts));
  if (exceptions.some((result) => result.truth === "TRUE")) return { truth: "FALSE", unknownFacts: [] };
  const missing = [...new Set([...(base.truth === "UNKNOWN" ? base.unknownFacts : []), ...exceptions.flatMap((result) => result.unknownFacts)])].sort();
  return { truth: base.truth === "UNKNOWN" || exceptions.some((result) => result.truth === "UNKNOWN") ? "UNKNOWN" : "TRUE", unknownFacts: missing };
}

export function selectApplicableRules(
  project: Project, elements: ArchitecturalElement[], rules: ComplianceRule[],
): RuleSelection {
  ProjectSchema.parse(project);
  for (const element of elements) {
    ArchitecturalElementSchema.parse(element);
    if (element.projectId !== project.id || element.revision !== project.revision) throw new Error("REGULATORY_ELEMENT_REVISION_MISMATCH");
  }
  const selection: RuleSelection = { ruleIds: [], explanations: {}, missingContext: [] };
  const missing = new Set<string>();
  for (const input of rules) {
    const rule = ComplianceRuleSchema.parse(input);
    if (rule.lifecycle !== "ACTIVE" || selection.ruleIds.includes(rule.id)) continue;
    const targets = elements.filter((element) => element.type === rule.elementType);
    const results = (targets.length ? targets : [undefined]).map((element) => checkRuleApplicability(project, element, rule));
    const possible = results.filter((result) => result.truth !== "FALSE");
    if (!possible.length) continue;
    selection.ruleIds.push(rule.id);
    const unknown = [...new Set(possible.flatMap((result) => result.unknownFacts))].sort();
    unknown.forEach((field) => missing.add(field));
    selection.explanations[rule.id] = unknown.length
      ? `Moguća primena; potreban kontekst: ${unknown.join(", ")}. Engine proverava svaki element.`
      : "Uslovi primene su ispunjeni za najmanje jedan cilj; engine nezavisno proverava ulaze i svaki element.";
  }
  selection.missingContext = [...missing].sort();
  return selection;
}
