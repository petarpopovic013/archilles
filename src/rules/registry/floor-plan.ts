import { z } from "zod";
import { IdSchema, type ComplianceRule } from "../../domain";
import { complianceRules, getActiveRules } from ".";
import data from "../../../fixtures/regulations/floor-plan-catalogue.json";

const EntrySchema = z.strictObject({
  ruleId: IdSchema,
  inputMode: z.enum(["PLAN_GEOMETRY", "PLAN_GRAPH", "PLAN_ANNOTATIONS", "EXTRA_DOCUMENTATION"]),
  engineSupported: z.boolean(), why: z.string().min(1), missingCapabilities: z.array(z.string()),
});
const entries = z.strictObject({ scope: z.string(), entries: z.array(EntrySchema) }).parse(data).entries;

/** Availability of drawing inputs, not proof of applicability, measurement or legal approval. */
export function getFloorPlanCatalogue() {
  return entries.map((entry) => {
    const rule = complianceRules.find((rule) => rule.id === entry.ruleId);
    if (!rule) throw new Error("PLAN_CATALOGUE_RULE_MISSING");
    return structuredClone({ ...entry, rule });
  });
}

/** Strict review view: direct horizontal plan geometry only; includes inactive review candidates. */
export function getFloorPlanRules(): ComplianceRule[] {
  return getFloorPlanCatalogue().filter((entry) => entry.inputMode === "PLAN_GEOMETRY").map((entry) => entry.rule);
}

/** Opt-in Runtime seam. Never bypasses the existing lifecycle, provenance and date gates. */
export function getActiveFloorPlanRules(asOf: string): ComplianceRule[] {
  const eligible = new Set(getFloorPlanRules().map((rule) => rule.id));
  return getActiveRules(asOf).filter((rule) => eligible.has(rule.id));
}
