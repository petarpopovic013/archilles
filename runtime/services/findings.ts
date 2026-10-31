import { randomUUID } from "node:crypto";
import {
  ComplianceFindingSchema,
  type ArchitecturalElement,
  type ComplianceFinding,
  type ComplianceRule,
  type RuleEvaluation,
} from "../../src/domain";

const format = (value: number | string | boolean | undefined, unit?: string) =>
  value === undefined ? "not established" : `${value}${unit && unit !== "count" ? ` ${unit}` : ""}`;

/**
 * Structured, deterministic explanation of an engine outcome. The status is copied from the
 * evaluation and never changed; wording only restates values the engine produced.
 */
export function templateFinding(
  evaluation: RuleEvaluation,
  rule: ComplianceRule,
  element: ArchitecturalElement | undefined,
  createdAt: string,
): ComplianceFinding {
  const subject = element ? `${element.label ?? element.type.toLowerCase()}` : "the project";
  const observed = format(evaluation.observed, evaluation.unit);
  const required = format(evaluation.required, evaluation.unit);
  let explanation: string;
  let suggestedAction: string | undefined;
  switch (evaluation.status) {
    case "PASS":
      explanation = `For ${subject}, the observed value ${observed} satisfies the required ${required}.`;
      break;
    case "FAIL":
      explanation = `For ${subject}, the observed value ${observed} does not satisfy the required ${required}.`;
      suggestedAction = "Check the design against the cited provision; use Fix & Recheck to test a revised dimension.";
      break;
    case "UNKNOWN":
      if (evaluation.reasonCode === "SUBTYPE_UNCONFIRMED") {
        explanation = `Whether this check applies to ${subject} depends on its suggested classification, which a person has not confirmed yet.`;
        suggestedAction = "Confirm or correct the element's classification on the drawing.";
        break;
      }
      explanation = evaluation.missingInputs.length > 0
        ? `For ${subject}, this check cannot be decided until ${evaluation.missingInputs.join(", ")} is confirmed.`
        : `For ${subject}, this check cannot be decided from the available information (${evaluation.reasonCode}).`;
      suggestedAction = "Confirm the missing or unverified information on the drawing or project details.";
      break;
    case "NOT_APPLICABLE":
      explanation = `This check does not apply to ${subject} (${evaluation.reasonCode}).`;
      break;
    case "NEEDS_REVIEW":
      explanation = `This check for ${subject} needs professional review (${evaluation.reasonCode}).`;
      suggestedAction = "Have a qualified reviewer check the cited provision and its interpretation.";
      break;
  }
  if(evaluation.preliminary) {
    const p=evaluation.preliminary;
    explanation=`Preliminary ${p.status.toLowerCase().replaceAll('_',' ')} for ${subject}: ${format(p.observed,p.unit)} against ${format(p.required,p.unit)}. This scenario uses AI assumptions; the confirmed outcome remains ${evaluation.status.toLowerCase()}.`;
    suggestedAction="You can inspect or correct the AI assumptions directly on the plan.";
  }
  return ComplianceFindingSchema.parse({
    id: randomUUID(),
    evaluationId: evaluation.id,
    projectId: evaluation.projectId,
    projectRevision: evaluation.projectRevision,
    ruleId: rule.id,
    ruleVersion: rule.version,
    sourceId: rule.sourceId,
    sourceVersion: rule.sourceVersion,
    provisionIds: rule.provisionIds,
    elementId: evaluation.elementId,
    status: evaluation.status,
    preliminary: evaluation.preliminary,
    title: rule.title,
    explanation,
    suggestedAction,
    evidenceIds: [...new Set([...evaluation.evidenceIds,...(evaluation.preliminary?.evidenceIds??[])])],
    // A preliminary failure and an unresolved interpretation both need a professional's eye.
    requiresHumanReview: !!evaluation.preliminary || evaluation.status === "FAIL" || evaluation.status === "NEEDS_REVIEW",
    stale: false,
    createdAt,
  });
}
