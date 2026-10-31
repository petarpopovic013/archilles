import type { AgentEvent, EvaluationStatus, MeasurementSource, Metric, RuleEvaluation, Verification } from "../domain";

/** Display text for engine outcomes. Colour is never the only signal; every status has a label. */
export const statusLabel: Record<EvaluationStatus, string> = {
  PASS: "Ispunjeno",
  FAIL: "Nije ispunjeno",
  UNKNOWN: "Nepoznato",
  NOT_APPLICABLE: "Ne primenjuje se",
  NEEDS_REVIEW: "Stručna provera",
};

export const verificationLabel: Record<Verification, string> = {
  UNVERIFIED: "Nepotvrđeno",
  USER_CONFIRMED: "Potvrdio korisnik",
  SOURCE_VERIFIED: "Provereno u izvoru",
};

export const sourceLabel: Record<MeasurementSource, string> = {
  DRAWING_LABEL: "kota sa crteža (AI)",
  CONFIRMED_SCALE: "potvrđena razmera",
  AI_ESTIMATE: "AI procena",
  USER_ENTERED: "uneo korisnik",
  USER_CORRECTED: "ispravio korisnik",
};

export const metricLabel: Record<Metric, string> = {
  CLEAR_WIDTH_M: "Svetla širina",
  HEIGHT_M: "Visina",
  RISE_M: "Visina stepenika ili praga",
  RUN_M: "Dubina (gazište, plato, vetrobran)",
  ROUTE_LENGTH_M: "Dužina puta",
  FLOOR_COUNT: "Broj spratova",
  OCCUPANT_COUNT: "Broj korisnika",
  COUNT: "Broj",
  SLOPE_RATIO: "Nagib",
};

export function formatValue(value: number | string | boolean | undefined, unit?: string): string {
  if (value === undefined) return "nije utvrđeno";
  if (typeof value === "boolean") return value ? "da" : "ne";
  if (typeof value === "string") return value;
  if (unit === "ratio") return `${(value * 100).toLocaleString("sr-Latn", { maximumFractionDigits: 2 })} %`;
  const number = value.toLocaleString("sr-Latn", { maximumFractionDigits: 3 });
  return unit && unit !== "count" ? `${number} ${unit}` : number;
}

/** "najmanje" / "najviše" from the engine's reason code; never inferred from the numbers. */
export function requirementPrefix(evaluation: Pick<RuleEvaluation, "reasonCode">): string {
  const code = evaluation.reasonCode;
  if (code.startsWith("MIN_") || code === "BELOW_MINIMUM" || code.startsWith("COUNT_MIN") || code === "BELOW_MINIMUM_COUNT") return "najmanje ";
  if (code.startsWith("MAX_") || code === "ABOVE_MAXIMUM" || code.startsWith("COUNT_MAX") || code === "ABOVE_MAXIMUM_COUNT") return "najviše ";
  return "";
}

const eventLabels: Record<string, string> = {
  "project.created": "Projekat kreiran",
  "drawing.uploaded": "Crtež otpremljen",
  "analysis.started": "Analiza pokrenuta",
  "geometry.extraction.started": "Čitanje crteža započeto",
  "geometry.extraction.completed": "Elementi pronađeni",
  "geometry.measurement.missing": "Potrebna potvrda mere",
  "geometry.measurement.updated": "Mera ažurirana",
  "regulation.applicability.requested": "Zatražen izbor pravila",
  "regulation.rules.selected": "Pravila izabrana",
  "regulation.input.required": "Potreban podatak o projektu",
  "rule.evaluation.requested": "Provera pokrenuta",
  "rule.evaluation.completed": "Provera završena",
  "review.finding.created": "Nalaz kreiran",
  "review.finding.updated": "Obrazloženje dopunjeno",
  "review.human_verification.required": "Potrebna stručna provera",
  "project.revision.created": "Nova revizija",
  "agent.run.failed": "Greška agenta",
};

export const eventLabel = (event: Pick<AgentEvent, "type">) => eventLabels[event.type] ?? event.type;

/** A short, safe detail line for the activity feed, built only from known payload fields. */
export function eventDetail(event: AgentEvent): string | undefined {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "geometry.extraction.completed":
      return `${(payload.elementIds as unknown[]).length} elemenata, ${(payload.measurementIds as unknown[]).length} mera`;
    case "regulation.rules.selected":
      return `${(payload.ruleIds as unknown[]).length} pravila`;
    case "rule.evaluation.completed":
      return Object.entries(payload.statusCounts as Record<EvaluationStatus, number>)
        .map(([status, count]) => `${statusLabel[status as EvaluationStatus]}: ${count}`).join(", ") || "bez provera";
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
