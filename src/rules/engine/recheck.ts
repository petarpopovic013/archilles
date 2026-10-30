import {
  MeasurementSchema,
  type ComplianceRule,
  type MeasurementUnit,
  type Metric,
} from "../../domain";
import { currentMeasurement, evaluateTarget, type EngineResult, type EvaluationContext } from "./evaluate";

export interface HypotheticalChange {
  elementId: string;
  metric: Metric;
  value: number;
  unit: MeasurementUnit;
}

/** Active rules for this element type whose outcome can depend on the changed metric. */
export function dependentRules(rules: readonly ComplianceRule[], elementType: string, metric: Metric): ComplianceRule[] {
  return rules.filter((rule) =>
    rule.lifecycle === "ACTIVE" &&
    rule.elementType === elementType &&
    ((rule.evaluation.kind === "MIN" || rule.evaluation.kind === "MAX") && rule.evaluation.metric === metric ||
      rule.requiredInputs.includes(metric)));
}

/**
 * Fix & Recheck: overlays a proposed, human-entered value in memory and re-evaluates only the
 * dependent rules for that element. Nothing is persisted here and no model is involved.
 */
export function recheck(rules: readonly ComplianceRule[], ctx: EvaluationContext, change: HypotheticalChange): {
  before: EngineResult[];
  after: EngineResult[];
  previousMeasurementId?: string;
} {
  const element = ctx.elements.find((candidate) => candidate.id === change.elementId);
  if (!element) throw new Error("ELEMENT_NOT_FOUND");
  const affected = dependentRules(rules, element.type, change.metric);
  const previous = currentMeasurement(ctx.measurements, element.id, change.metric);
  const hypothetical = MeasurementSchema.parse({
    id: ctx.newId(),
    projectId: ctx.project.id,
    elementId: element.id,
    revision: ctx.project.revision,
    metric: change.metric,
    value: change.value,
    unit: change.unit,
    source: "USER_ENTERED",
    verification: "USER_CONFIRMED",
    evidenceIds: previous?.evidenceIds ?? [],
    supersedesId: previous?.id,
    recordedBy: "hypothetical-recheck",
    recordedAt: ctx.now,
  });
  const overlay: EvaluationContext = { ...ctx, measurements: [...ctx.measurements, hypothetical] };
  return {
    before: affected.map((rule) => evaluateTarget(rule, element, ctx)),
    after: affected.map((rule) => evaluateTarget(rule, element, overlay)),
    previousMeasurementId: previous?.id,
  };
}
