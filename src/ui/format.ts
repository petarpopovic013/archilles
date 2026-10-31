import type { AgentEvent, EvaluationStatus, MeasurementSource, Metric, RuleEvaluation, Verification } from "../domain";

/** Display text for engine outcomes. Colour is never the only signal; every status has a label. */
export const statusLabel: Record<EvaluationStatus, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  UNKNOWN: "Unknown",
  NOT_APPLICABLE: "Not applicable",
  NEEDS_REVIEW: "Needs review",
};

export const verificationLabel: Record<Verification, string> = {
  UNVERIFIED: "Unverified",
  USER_CONFIRMED: "User confirmed",
  SOURCE_VERIFIED: "Source verified",
};

export const sourceLabel: Record<MeasurementSource, string> = {
  DRAWING_LABEL: "drawing dimension (AI)",
  CONFIRMED_SCALE: "confirmed scale",
  AI_ESTIMATE: "AI estimate",
  USER_ENTERED: "user entered",
  USER_CORRECTED: "user corrected",
};

export const metricLabel: Record<Metric, string> = {
  CLEAR_WIDTH_M: "Clear width",
  HEIGHT_M: "Height",
  RISE_M: "Riser or threshold height",
  RUN_M: "Depth (tread, landing, vestibule)",
  ROUTE_LENGTH_M: "Route length",
  FLOOR_COUNT: "Floor count",
  OCCUPANT_COUNT: "Occupant count",
  COUNT: "Count",
  SLOPE_RATIO: "Slope",
};

export function formatValue(value: number | string | boolean | undefined, unit?: string): string {
  if (value === undefined) return "not established";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  if (unit === "ratio") return `${(value * 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })} %`;
  const number = value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
  return unit && unit !== "count" ? `${number} ${unit}` : number;
}

/** "at least" / "at most" from the engine's reason code; never inferred from the numbers. */
export function requirementPrefix(evaluation: Pick<RuleEvaluation, "reasonCode">): string {
  const code = evaluation.reasonCode;
  if (code.startsWith("MIN_") || code === "BELOW_MINIMUM" || code.startsWith("COUNT_MIN") || code === "BELOW_MINIMUM_COUNT") return "at least ";
  if (code.startsWith("MAX_") || code === "ABOVE_MAXIMUM" || code.startsWith("COUNT_MAX") || code === "ABOVE_MAXIMUM_COUNT") return "at most ";
  return "";
}

const eventLabels: Record<string, string> = {
  "project.created": "Project created",
  "drawing.uploaded": "Drawing uploaded",
  "analysis.started": "Analysis started",
  "geometry.extraction.started": "Drawing extraction started",
  "geometry.stage.completed": "Drawing reading stage",
  "geometry.extraction.completed": "Elements extracted",
  "geometry.measurement.missing": "Measurement confirmation required",
  "geometry.measurement.updated": "Measurement updated",
  "regulation.applicability.requested": "Rule selection requested",
  "regulation.rules.selected": "Rules selected",
  "regulation.input.required": "Project information required",
  "rule.evaluation.requested": "Evaluation started",
  "rule.evaluation.completed": "Evaluation completed",
  "review.finding.created": "Finding created",
  "review.finding.updated": "Explanation updated",
  "review.human_verification.required": "Professional review required",
  "project.revision.created": "New revision",
  "agent.run.failed": "Agent failed",
};

export const eventLabel = (event: Pick<AgentEvent, "type">) => eventLabels[event.type] ?? event.type;

/** A short, safe detail line for the activity feed, built only from known payload fields. */
export function eventDetail(event: AgentEvent): string | undefined {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "geometry.stage.completed":
      return `${String(payload.stage).toLowerCase().replaceAll("_", " ")} · ${payload.calls} Vision calls`;
    case "geometry.extraction.completed":
      return `${(payload.elementIds as unknown[]).length} elements, ${(payload.measurementIds as unknown[]).length} measurements`;
    case "regulation.rules.selected":
      return `${(payload.ruleIds as unknown[]).length} rules`;
    case "rule.evaluation.completed":
      return Object.entries(payload.statusCounts as Record<EvaluationStatus, number>)
        .map(([status, count]) => `${statusLabel[status as EvaluationStatus]}: ${count}`).join(", ") || "no checks";
    case "regulation.input.required":
      return String(payload.reason);
    case "geometry.measurement.missing":
      return metricLabel[payload.metric as Metric] ?? String(payload.metric);
    case "agent.run.failed":
      return String(payload.errorCode);
    default:
      return undefined;
  }
}
