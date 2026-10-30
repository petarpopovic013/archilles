import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  EvidenceSchema,
  MeasurementSchema,
  ReviewActionSchema,
  type MeasurementCorrectionRequestSchema,
  type Measurement,
  type ProjectRevision,
  type RecheckRequestSchema,
  type ReviewAction,
  type RuleEvaluation,
} from "../../src/domain";
import { correctMeasurement, GeometryError } from "../../src/geometry";
import { currentMeasurement, recheck } from "../../src/rules/engine";
import { asOfDate, type RuntimeContext } from "../context";
import {
  findElement,
  findEvidence,
  findFloorById,
  floorView,
  insertObservations,
  insertReviewAction,
} from "../db/repo";
import { ApiFailure, notFound, revisionConflict } from "../http/errors";
import { createAppEvent } from "../mozaik/app-events";
import { reanalyseAfterRevision } from "./analyses";
import { advanceRevision, getProject } from "./projects";

type CorrectionInput = z.output<typeof MeasurementCorrectionRequestSchema>;
type RecheckInput = z.output<typeof RecheckRequestSchema>;

export function loadElement(ctx: RuntimeContext, elementId: string, projectId?: string) {
  const element = findElement(ctx.db, elementId);
  if (!element || (projectId && element.projectId !== projectId)) throw notFound("Element");
  const floor = findFloorById(ctx.db, element.floorId);
  if (!floor) throw notFound("Element");
  return { element, floor };
}

/**
 * A confirmed correction: new USER evidence and a superseding measurement in a new revision.
 * History is never rewritten. If the page was analysed before, a follow-up session re-evaluates
 * from stored geometry (no Vision call) and reuses explanations for unchanged outcomes.
 */
export async function correctElementMeasurement(
  ctx: RuntimeContext,
  elementId: string,
  request: CorrectionInput,
): Promise<{ revision: ProjectRevision; measurement: Measurement }> {
  const { element, floor } = loadElement(ctx, elementId);
  const project = getProject(ctx.db, element.projectId);
  if (project.revision !== request.baseRevision) throw revisionConflict(project.revision, request.baseRevision);
  const cited = findEvidence(ctx.db, request.evidenceIds);
  if (cited.length !== new Set(request.evidenceIds).size || cited.some((evidence) => evidence.projectId !== project.id)) {
    throw new ApiFailure(422, "INVALID_EVIDENCE", "Evidence must exist and belong to this project");
  }

  const view = floorView(ctx.db, floor.floor.id, project.revision);
  const previous = currentMeasurement(view.measurements, element.id, request.metric);
  const at = ctx.now();
  const evidenceText = "User-confirmed measurement entered in the review workspace.";
  let replacement: { measurement: Measurement; evidence: z.output<typeof EvidenceSchema> };
  try {
    replacement = previous
      ? correctMeasurement({ previous, baseRevision: request.baseRevision, value: request.value, unit: request.unit, actor: "user", at, evidenceText })
      : newMeasurement(element.projectId, element.id, request, at, evidenceText);
  } catch (error) {
    if (error instanceof GeometryError) throw new ApiFailure(422, error.code, "The measurement could not be recorded");
    throw error;
  }
  const measurement = MeasurementSchema.parse({
    ...replacement.measurement,
    evidenceIds: [...new Set([...replacement.measurement.evidenceIds, ...request.evidenceIds])],
  });

  const revision = ctx.db.transaction(() => {
    const result = advanceRevision(ctx, getProject(ctx.db, project.id), request.baseRevision, "MEASUREMENT_CORRECTION",
      [measurement.id, element.id], [element.id]);
    insertObservations(ctx.db, { elements: [], evidence: [replacement.evidence], measurements: [measurement] });
    return result.revision;
  })();

  const scope = { projectId: project.id, projectRevision: revision.revision, correlationId: measurement.id };
  await reanalyseAfterRevision(ctx, scope, floor.floor, (sessionId) => [
    createAppEvent("project.revision.created", { ...scope, sessionId }, { newRevision: revision.revision, changedEntityIds: revision.changedEntityIds }),
    createAppEvent("geometry.measurement.updated", { ...scope, sessionId }, { measurementId: measurement.id, elementId: element.id, metric: measurement.metric }),
  ]);
  return { revision, measurement };
}

function newMeasurement(projectId: string, elementId: string, request: CorrectionInput, at: string, text: string) {
  const evidence = EvidenceSchema.parse({
    id: randomUUID(), projectId, revision: request.baseRevision + 1, source: "USER", text, capturedAt: at,
  });
  const measurement = MeasurementSchema.parse({
    id: randomUUID(), projectId, elementId, revision: request.baseRevision + 1, metric: request.metric,
    value: request.value, unit: request.unit, source: "USER_ENTERED", verification: "USER_CONFIRMED",
    evidenceIds: [evidence.id], recordedBy: "user", recordedAt: at,
  });
  return { measurement, evidence };
}

/**
 * Hypothetical Fix & Recheck: overlays the proposed value in memory and re-evaluates only the
 * dependent active rules. No measurement is created, the drawing is untouched, and no model runs.
 */
export async function recheckProposal(
  ctx: RuntimeContext,
  projectId: string,
  request: RecheckInput,
): Promise<{ action: ReviewAction; before: RuleEvaluation[]; after: RuleEvaluation[] }> {
  const project = getProject(ctx.db, projectId);
  if (project.revision !== request.baseRevision) throw revisionConflict(project.revision, request.baseRevision);
  const { element, floor } = loadElement(ctx, request.elementId, projectId);
  const view = floorView(ctx.db, floor.floor.id, project.revision);
  const rules = await ctx.registry.getActiveRules(asOfDate(ctx));
  const result = recheck(rules, {
    project,
    elements: view.elements,
    measurements: view.measurements,
    asOf: asOfDate(ctx),
    now: ctx.now(),
    newId: randomUUID,
  }, { elementId: element.id, metric: request.metric, value: request.proposedValue, unit: request.unit });

  const action = ReviewActionSchema.parse({
    id: randomUUID(),
    projectId,
    baseRevision: request.baseRevision,
    elementId: element.id,
    metric: request.metric,
    previousMeasurementId: result.previousMeasurementId,
    proposedValue: request.proposedValue,
    unit: request.unit,
    outcome: result.after.map(({ evaluation }) => evaluation),
    hypothetical: true,
    createdAt: ctx.now(),
  });
  insertReviewAction(ctx.db, action);
  return {
    action,
    before: result.before.map(({ evaluation }) => evaluation),
    after: action.outcome,
  };
}
