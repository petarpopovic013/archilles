import type { ComplianceRule, Condition, ElementType, Metric, RuleRequirements } from "../../src/domain";
import type { VisionCategory } from "../../src/vision/claude";
import { RuleRequirementsSchema } from "../../src/domain";
import type { RuntimeContext } from "../context";

const LISTED = new Set(["CANDIDATE", "AI_REVIEWED", "HUMAN_VERIFIED", "ACTIVE"]);

function collect(condition: Condition, field: "element.subtype" | "classification", into: Set<string>): void {
  if ("children" in condition) {
    for (const child of condition.children) collect(child, field, into);
    return;
  }
  if (condition.field !== field) return;
  for (const value of Array.isArray(condition.value) ? condition.value : [condition.value]) into.add(String(value));
}

function metricsOf(rule: ComplianceRule): Metric[] {
  const metrics = new Set<Metric>(rule.requiredInputs);
  if (rule.evaluation.kind === "MIN" || rule.evaluation.kind === "MAX") metrics.add(rule.evaluation.metric);
  return [...metrics];
}

/**
 * Subtypes, measurements, and classifications that registry rules reference, derived from the
 * rules' own conditions. Rejected and superseded versions are left out.
 */
export async function ruleRequirements(ctx: RuntimeContext): Promise<RuleRequirements> {
  const { rules } = await ctx.registry.snapshot();
  const bySubtype = new Map<string, RuleRequirements["subtypes"][number]>();
  const classifications = new Set<string>();

  for (const rule of rules) {
    if (!LISTED.has(rule.lifecycle)) continue;
    const conditions = [rule.applicability, ...rule.exceptionConditions];
    conditions.forEach((condition) => collect(condition, "classification", classifications));
    const subtypes = new Set<string>();
    collect(rule.applicability, "element.subtype", subtypes);
    for (const subtype of subtypes) {
      const key = `${rule.elementType}:${subtype}`;
      const entry = bySubtype.get(key) ?? { elementType: rule.elementType as ElementType, subtype, rules: [] };
      entry.rules.push({
        ruleId: rule.id,
        ruleVersion: rule.version,
        title: rule.title,
        lifecycle: rule.lifecycle as RuleRequirements["subtypes"][number]["rules"][number]["lifecycle"],
        metrics: metricsOf(rule),
      });
      bySubtype.set(key, entry);
    }
  }

  return RuleRequirementsSchema.parse({
    subtypes: [...bySubtype.values()].sort((a, b) => a.elementType.localeCompare(b.elementType) || a.subtype.localeCompare(b.subtype)),
    classifications: [...classifications].sort(),
  });
}

/** Review categories of active rules, offered to Vision as suggestions a person must confirm. */
export function reviewCategories(rules: readonly ComplianceRule[]): VisionCategory[] {
  const byKey = new Map<string, VisionCategory>();
  for (const rule of rules) {
    if (rule.lifecycle !== "ACTIVE") continue;
    const subtypes = new Set<string>();
    collect(rule.applicability, "element.subtype", subtypes);
    for (const subtype of subtypes) {
      const key = `${rule.elementType}:${subtype}`;
      const entry = byKey.get(key) ?? { elementType: rule.elementType as ElementType, subtype, description: "" };
      entry.description = entry.description ? `${entry.description}; ${rule.title}` : rule.title;
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => a.elementType.localeCompare(b.elementType) || a.subtype.localeCompare(b.subtype));
}
