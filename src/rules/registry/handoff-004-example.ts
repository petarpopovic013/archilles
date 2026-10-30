import { getActiveFloorPlanRules, getFloorPlanCatalogue, getFloorPlanRules } from "./floor-plan";

const catalogue = getFloorPlanCatalogue();
const strict = getFloorPlanRules();
console.log(JSON.stringify({
  notice: "2D plan-input review view; no activation, actual drawing analysis or model call.",
  totalCatalogueRules: catalogue.length,
  strictPlanGeometryRules: strict.length,
  existingDimensionEvaluator: strict.filter((rule) => rule.evaluation.kind !== "REVIEWED_EVALUATOR").length,
  geometryEvaluatorRequired: strict.filter((rule) => rule.evaluation.kind === "REVIEWED_EVALUATOR").length,
  needsPlanAnnotations: catalogue.filter((entry) => entry.inputMode === "PLAN_ANNOTATIONS").length,
  needsValidatedGraph: catalogue.filter((entry) => entry.inputMode === "PLAN_GRAPH").length,
  excludedExtraDocumentation: catalogue.filter((entry) => entry.inputMode === "EXTRA_DOCUMENTATION").map(({ ruleId, why }) => ({ ruleId, why })),
  activePlanRules: getActiveFloorPlanRules("2026-10-30").length,
  approvals: strict.map(({ id, lifecycle, approvedBy, approvedAt }) => ({ id, lifecycle, approvedBy, approvedAt })),
}, null, 2));
