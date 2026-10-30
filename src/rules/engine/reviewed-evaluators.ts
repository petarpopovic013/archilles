import type { ArchitecturalElement, ComplianceRule } from "../../domain";
import type { EvaluationContext, Outcome } from "./evaluate";

export type ReviewedEvaluator = (input: {
  rule: ComplianceRule;
  element: ArchitecturalElement | undefined;
  ctx: EvaluationContext;
}) => Outcome;

/**
 * Checked-in, versioned pure evaluators referenced by `REVIEWED_EVALUATOR` rules
 * (`evaluatorId` -> `version` -> function). Each entry needs human review and tests before use;
 * an absent entry yields NEEDS_REVIEW. None are registered yet.
 */
export const reviewedEvaluators: Readonly<Record<string, Readonly<Record<string, ReviewedEvaluator>>>> = {};
