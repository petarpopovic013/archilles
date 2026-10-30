import {
  RuleEvaluationSchema,
  isVerifiedMeasurement,
  type ArchitecturalElement,
  type ComplianceRule,
  type EvaluationStatus,
  type Measurement,
  type Metric,
  type Project,
  type RuleEvaluation,
} from "../../domain";
import { evaluateCondition, type ConditionResult } from "./conditions";
import { fingerprint } from "./fingerprint";
import { reviewedEvaluators } from "./reviewed-evaluators";

/** Absolute tolerance for boundary comparisons; a value at the threshold satisfies MIN and MAX. */
export const BOUNDARY_EPSILON = 1e-9;

export interface EvaluationContext {
  project: Project;
  /** The project view at `project.revision` (latest non-superseded records). */
  elements: ArchitecturalElement[];
  measurements: Measurement[];
  /** Calendar date (YYYY-MM-DD) used for rule effective dates. */
  asOf: string;
  now: string;
  newId(): string;
}

export interface EngineResult {
  evaluation: RuleEvaluation;
  /** Hash of every input that determined this outcome; equal fingerprints give equal outcomes. */
  fingerprint: string;
  measurementIds: string[];
}

export interface RejectedRule {
  ruleId: string;
  ruleVersion: number;
  reasonCode: "RULE_NOT_ACTIVE";
}

/** What an evaluator decides; the engine adds identity, timestamps, and validation. */
export interface Outcome {
  status: EvaluationStatus;
  reasonCode: string;
  required?: number | string | boolean;
  observed?: number | string | boolean;
  unit?: string;
  evidenceIds: string[];
  missingInputs: Metric[];
  measurementIds: string[];
  /** Additional inputs for the fingerprint (counted elements, characteristics). */
  facts?: unknown;
}

/** Evaluates ACTIVE rules only; anything else is rejected before a RuleEvaluation exists. */
export function evaluateRules(rules: readonly ComplianceRule[], ctx: EvaluationContext): {
  results: EngineResult[];
  rejected: RejectedRule[];
} {
  const results: EngineResult[] = [];
  const rejected: RejectedRule[] = [];
  for (const rule of rules) {
    if (rule.lifecycle !== "ACTIVE") {
      rejected.push({ ruleId: rule.id, ruleVersion: rule.version, reasonCode: "RULE_NOT_ACTIVE" });
      continue;
    }
    results.push(...evaluateRule(rule, ctx));
  }
  return { results, rejected };
}

/** One result per matching element, or one project-level result for BOOL/COUNT rules. */
export function evaluateRule(rule: ComplianceRule, ctx: EvaluationContext): EngineResult[] {
  if (rule.lifecycle !== "ACTIVE") throw new Error("RULE_NOT_ACTIVE");
  const kind = rule.evaluation.kind;
  if (kind === "BOOL" || kind === "COUNT_MIN" || kind === "COUNT_MAX") {
    return [evaluateTarget(rule, undefined, ctx)];
  }
  const targets = ctx.elements.filter((element) => element.type === rule.elementType);
  if (targets.length > 0) return targets.map((element) => evaluateTarget(rule, element, ctx));

  // No element of this type: the rule may still be decidably not applicable to the project.
  return [finish(rule, undefined, ctx, gate(rule, undefined, ctx) ?? {
    status: "UNKNOWN",
    reasonCode: "NO_MATCHING_ELEMENTS",
    evidenceIds: [],
    missingInputs: [],
    measurementIds: [],
  })];
}

export function evaluateTarget(
  rule: ComplianceRule,
  element: ArchitecturalElement | undefined,
  ctx: EvaluationContext,
): EngineResult {
  const gated = gate(rule, element, ctx);
  if (gated) return finish(rule, element, ctx, gated);

  const exceptions = rule.exceptionConditions.map((condition) => evaluateCondition(condition, { project: ctx.project, element }));
  if (exceptions.some((result) => result.truth === "TRUE")) {
    return finish(rule, element, ctx, notApplicable("EXCEPTION_APPLIES", element));
  }

  const outcome = runEvaluator(rule, element, ctx);
  const unresolved = exceptions.filter((result) => result.truth === "UNKNOWN");
  if (outcome.status === "FAIL" && unresolved.length > 0) {
    // An exception that might apply is unproven: the failure cannot be asserted.
    return finish(rule, element, ctx, {
      ...outcome,
      status: "UNKNOWN",
      reasonCode: "EXCEPTION_UNRESOLVED",
      missingInputs: metricsFor(unresolved),
    });
  }
  return finish(rule, element, ctx, outcome);
}

/** Effective dates and applicability, evaluated before any threshold. */
function gate(rule: ComplianceRule, element: ArchitecturalElement | undefined, ctx: EvaluationContext): Outcome | undefined {
  if ((rule.effectiveFrom && ctx.asOf < rule.effectiveFrom) || (rule.effectiveTo && ctx.asOf > rule.effectiveTo)) {
    return notApplicable("RULE_NOT_IN_EFFECT", element);
  }
  const applicability = evaluateCondition(rule.applicability, { project: ctx.project, element });
  if (applicability.truth === "FALSE") return notApplicable("APPLICABILITY_NOT_MET", element);
  if (applicability.truth === "UNKNOWN") {
    const unconfirmed = element?.extraction === "AI_SUGGESTED" && element.subtype !== undefined &&
      applicability.unknownFacts.includes("element.subtype");
    return {
      status: "UNKNOWN",
      reasonCode: unconfirmed ? "SUBTYPE_UNCONFIRMED" : "APPLICABILITY_UNKNOWN",
      evidenceIds: element?.evidenceIds ?? [],
      missingInputs: metricsFor([applicability]),
      measurementIds: [],
      facts: { unknownFacts: applicability.unknownFacts },
    };
  }
  return undefined;
}

function runEvaluator(rule: ComplianceRule, element: ArchitecturalElement | undefined, ctx: EvaluationContext): Outcome {
  const definition = rule.evaluation;
  switch (definition.kind) {
    case "MIN":
    case "MAX": {
      if (!element) return needsReview("ELEMENT_REQUIRED");
      const metrics = [...new Set<Metric>([definition.metric, ...rule.requiredInputs])];
      const inputs = metrics.map((metric) => ({ metric, measurement: currentMeasurement(ctx.measurements, element.id, metric) }));
      const present = inputs.flatMap(({ measurement }) => (measurement ? [measurement] : []));
      const missing = inputs.filter(({ measurement }) => !measurement).map(({ metric }) => metric);
      const unverified = present.filter((measurement) => !isVerifiedMeasurement(measurement.verification)).map(({ metric }) => metric);
      const evidenceIds = unique([...element.evidenceIds, ...present.flatMap((measurement) => measurement.evidenceIds)]);
      const measurementIds = present.map((measurement) => measurement.id);
      const facts = present.map(({ id, metric, value, unit, verification }) => ({ id, metric, value, unit, verification }));
      if (missing.length > 0 || unverified.length > 0) {
        return {
          status: "UNKNOWN",
          reasonCode: missing.length > 0 ? "MISSING_INPUT" : "INPUT_UNVERIFIED",
          evidenceIds,
          missingInputs: [...missing, ...unverified],
          measurementIds,
          facts,
        };
      }
      const measurement = present.find(({ metric }) => metric === definition.metric)!;
      if (measurement.unit !== definition.unit) {
        return { ...needsReview("UNIT_MISMATCH"), evidenceIds, measurementIds, facts };
      }
      const satisfied = definition.kind === "MIN"
        ? measurement.value >= definition.threshold - BOUNDARY_EPSILON
        : measurement.value <= definition.threshold + BOUNDARY_EPSILON;
      return {
        status: satisfied ? "PASS" : "FAIL",
        reasonCode: definition.kind === "MIN"
          ? satisfied ? "MIN_SATISFIED" : "BELOW_MINIMUM"
          : satisfied ? "MAX_SATISFIED" : "ABOVE_MAXIMUM",
        required: definition.threshold,
        observed: measurement.value,
        unit: definition.unit,
        evidenceIds,
        missingInputs: [],
        measurementIds,
        facts,
      };
    }
    case "BOOL": {
      const observed = ctx.project.characteristics[definition.field];
      if (observed === undefined) {
        return { status: "UNKNOWN", reasonCode: "MISSING_CHARACTERISTIC", evidenceIds: [], missingInputs: [], measurementIds: [] };
      }
      const satisfied = observed === definition.expected;
      return {
        status: satisfied ? "PASS" : "FAIL",
        reasonCode: satisfied ? "BOOL_MATCH" : "BOOL_MISMATCH",
        required: definition.expected,
        observed,
        evidenceIds: [],
        missingInputs: [],
        measurementIds: [],
      };
    }
    case "COUNT_MIN":
    case "COUNT_MAX": {
      // Counts rely on human-confirmed geometry; unconfirmed suggestions can only make a result unknown.
      const ofType = ctx.elements.filter((element) => element.type === definition.elementType);
      const confirmed = ofType.filter((element) => element.extraction !== "AI_SUGGESTED");
      const unconfirmed = ofType.length - confirmed.length;
      const base = {
        required: definition.threshold,
        observed: confirmed.length,
        unit: "count",
        evidenceIds: unique(confirmed.flatMap((element) => element.evidenceIds)),
        missingInputs: [] as Metric[],
        measurementIds: [],
        facts: ofType.map(({ id, extraction }) => ({ id, extraction })),
      };
      if (definition.kind === "COUNT_MIN") {
        if (confirmed.length >= definition.threshold) return { ...base, status: "PASS", reasonCode: "COUNT_MIN_SATISFIED" };
        return unconfirmed > 0
          ? { ...base, status: "UNKNOWN", reasonCode: "COUNT_UNCONFIRMED_ELEMENTS" }
          : { ...base, status: "FAIL", reasonCode: "BELOW_MINIMUM_COUNT" };
      }
      if (confirmed.length > definition.threshold) return { ...base, status: "FAIL", reasonCode: "ABOVE_MAXIMUM_COUNT" };
      return confirmed.length + unconfirmed > definition.threshold
        ? { ...base, status: "UNKNOWN", reasonCode: "COUNT_UNCONFIRMED_ELEMENTS" }
        : { ...base, status: "PASS", reasonCode: "COUNT_MAX_SATISFIED" };
    }
    case "REVIEWED_EVALUATOR": {
      const evaluator = reviewedEvaluators[definition.evaluatorId]?.[definition.version];
      if (!evaluator) return needsReview("EVALUATOR_UNAVAILABLE");
      return evaluator({ rule, element, ctx });
    }
  }
}

/** The latest measurement for an element/metric that no other measurement supersedes. */
export function currentMeasurement(measurements: readonly Measurement[], elementId: string, metric: Metric): Measurement | undefined {
  const superseded = new Set(measurements.flatMap((measurement) => (measurement.supersedesId ? [measurement.supersedesId] : [])));
  return measurements
    .filter((measurement) => measurement.elementId === elementId && measurement.metric === metric && !superseded.has(measurement.id))
    .reduce<Measurement | undefined>((latest, measurement) =>
      !latest || measurement.recordedAt >= latest.recordedAt ? measurement : latest, undefined);
}

function finish(
  rule: ComplianceRule,
  element: ArchitecturalElement | undefined,
  ctx: EvaluationContext,
  outcome: Outcome,
): EngineResult {
  const evaluation = RuleEvaluationSchema.parse({
    id: ctx.newId(),
    projectId: ctx.project.id,
    projectRevision: ctx.project.revision,
    ruleId: rule.id,
    ruleVersion: rule.version,
    elementId: element?.id,
    status: outcome.status,
    required: outcome.required,
    observed: outcome.observed,
    unit: outcome.unit,
    evidenceIds: outcome.evidenceIds,
    missingInputs: outcome.missingInputs,
    reasonCode: outcome.reasonCode,
    evaluatedAt: ctx.now,
  });
  return {
    evaluation,
    measurementIds: outcome.measurementIds,
    fingerprint: fingerprint({
      rule: { id: rule.id, version: rule.version },
      element: element && { id: element.id, type: element.type, subtype: element.subtype, extraction: element.extraction },
      projectFacts: projectFacts(ctx.project),
      asOf: ctx.asOf,
      inputs: outcome.facts,
    }),
  };
}

/** The project metadata a rule can depend on (identity and timestamps excluded). */
export function projectFacts(project: Project) {
  const { jurisdiction, municipality, purpose, classification, phase, buildingHeightM, floorCount, occupantCount, characteristics } = project;
  return { jurisdiction, municipality, purpose, classification, phase, buildingHeightM, floorCount, occupantCount, characteristics };
}

function notApplicable(reasonCode: string, element: ArchitecturalElement | undefined): Outcome {
  return { status: "NOT_APPLICABLE", reasonCode, evidenceIds: element?.evidenceIds ?? [], missingInputs: [], measurementIds: [] };
}

function needsReview(reasonCode: string): Outcome {
  return { status: "NEEDS_REVIEW", reasonCode, evidenceIds: [], missingInputs: [], measurementIds: [] };
}

/** Project facts that correspond to a canonical Metric; other unknown facts appear in the reason. */
const factMetrics: Partial<Record<string, Metric>> = {
  occupantCount: "OCCUPANT_COUNT",
  floorCount: "FLOOR_COUNT",
};

function metricsFor(results: readonly ConditionResult[]): Metric[] {
  return unique(results.flatMap((result) => result.unknownFacts.flatMap((fact) => factMetrics[fact] ?? [])));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
