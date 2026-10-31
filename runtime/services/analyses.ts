import {assessFindings} from "../../src/review/assessment";
import { reviewQuestions } from "./questions";
import { geometryReport } from "./geometry";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  AnalysisSnapshotSchema,
  type AnalysisSession,
  type AnalysisSnapshot,
  type AppEvent,
  type CoverageSummary,
  type EvaluationStatus,
  type StartAnalysisRequestSchema,
} from "../../src/domain";
import { PREPROCESSING_VERSION } from "../../src/geometry";
import { fingerprint } from "../../src/rules/engine";
import { PROMPT_VERSION } from "../../src/vision/claude";
import { asOfDate, type RuntimeContext } from "../context";
import {
  findDrawing,
  findSession,
  findSessionByRunKey,
  findSessionLocation,
  findFloor,
  floorView,
  insertSession,
  latestSessionForPage,
  latestSessionForProject,
  listSessionEvaluations,
  listSessionFindings,
  listSessionParticipants,
} from "../db/repo";
import { notFound, revisionConflict } from "../http/errors";
import { createAppEvent, emitAppEvent, type EventScope } from "../mozaik/app-events";
import { resolveRuntime } from "../mozaik/runtime";
import { TOOL_LOOP_VERSION } from "../mozaik/tool-loop";
import { ensureFloor } from "./drawings";
import { getProject, saveProject } from "./projects";

const starting=new WeakMap<RuntimeContext,Map<string,Promise<{sessionId:string;status:"RUNNING"}>>>();
export function startAnalysis(ctx:RuntimeContext,projectId:string,request:StartAnalysisInput,options:StartOptions={}) {
  let pending=starting.get(ctx);if(!pending){pending=new Map();starting.set(ctx,pending);}
  const key=JSON.stringify([projectId,request.drawingId,request.page,request.projectRevision]);
  const existing=pending.get(key);if(existing)return existing;
  const work=startAnalysisOnce(ctx,projectId,request,options).finally(()=>pending!.delete(key));pending.set(key,work);return work;
}

type StartAnalysisInput = z.output<typeof StartAnalysisRequestSchema>;

export interface StartOptions {
  reuseOnly?: boolean;
  /** Events published (with the new session ID) before `analysis.started`, e.g. a correction. */
  precedingEvents?(sessionId: string): AppEvent[];
}

/**
 * Starts one analysis session for a revision/drawing page/rule set/extraction version.
 * Repeating the same request returns the existing session instead of new AI work.
 */
async function startAnalysisOnce(
  ctx: RuntimeContext,
  projectId: string,
  request: StartAnalysisInput,
  options: StartOptions = {},
): Promise<{ sessionId: string; status: "RUNNING" }> {
  const project = getProject(ctx.db, projectId);
  if (project.revision !== request.projectRevision) throw revisionConflict(project.revision, request.projectRevision);
  const drawing = findDrawing(ctx.db, request.drawingId);
  if (!drawing || drawing.projectId !== projectId) throw notFound("Drawing");
  const { floor } = await ensureFloor(ctx, drawing, request.page);

  const asOf = asOfDate(ctx);
  const rules = await ctx.registry.getActiveRules(asOf);
  const ruleSetVersion = fingerprint(rules.map((rule) => [rule.id, rule.version]).sort()).slice(0, 16);
  const runKey = fingerprint({
    projectId,
    projectRevision: project.revision,
    sha256: drawing.sha256,
    page: request.page,
    ruleSetVersion,
    controllers: [TOOL_LOOP_VERSION, ctx.config.visionModel, ctx.config.reviewModel],
    extraction: [PREPROCESSING_VERSION, PROMPT_VERSION, ctx.geometry.vision?.model ?? "none", ctx.geometry.vision?.version ?? "legacy"],
  });

  const existing = findSessionByRunKey(ctx.db, runKey);
  // The start contract only carries RUNNING; clients read the real status from the snapshot.
  if (existing) return { sessionId: existing.id, status: "RUNNING" };

  const current = getProject(ctx.db, projectId);
  if (current.revision !== project.revision) throw revisionConflict(current.revision, project.revision);
  const session: AnalysisSession = {
    id: randomUUID(),
    projectId,
    projectRevision: project.revision,
    status: "RUNNING",
    selectedRuleIds: [],
    agentRunIds: [],
    startedAt: ctx.now(),
  };
  ctx.db.transaction(() => {
    insertSession(ctx.db, session, runKey, { drawingId: drawing.id, page: request.page });
    saveProject(ctx.db, { ...current, analysisStatus: "RUNNING" });
  })();

  resolveRuntime().state.sessions.set(session.id, {
    projectId,
    projectRevision: project.revision,
    drawingId: drawing.id,
    floorId: floor.id,
    page: request.page,
    ruleSetVersion,
    asOf,
    geometry: "PENDING",
    rules: "PENDING",
    selectedRuleIds: [],
    fingerprints: new Set(),
    failed: false,
    reuseOnly: options.reuseOnly ?? !!(ctx.db.prepare("SELECT 1 FROM geometry_extractions WHERE floor_id=? LIMIT 1").get(floor.id) || geometryReport(ctx.db,floor.id,project.revision) || floorView(ctx.db,floor.id,project.revision).elements.length),
  });

  for (const event of options.precedingEvents?.(session.id) ?? []) emitAppEvent(ctx.api, event);
  emitAppEvent(ctx.api, createAppEvent("analysis.started", {
    projectId, projectRevision: project.revision, correlationId: session.id, sessionId: session.id,
  }, { drawingId: drawing.id, page: request.page, ruleSetVersion }));
  return { sessionId: session.id, status: "RUNNING" };
}

/**
 * After a confirmed correction: announce the new revision and, if this page was analysed before,
 * start a follow-up session for it. Stored geometry is reused (no Vision call) and unchanged
 * outcomes reuse earlier explanations. `events` receive the follow-up session ID, if any.
 */
export async function reanalyseAfterRevision(
  ctx: RuntimeContext,
  scope: EventScope,
  location: { drawingId: string; page: number },
  events: (sessionId?: string) => AppEvent[],
): Promise<void> {
  const prior = latestSessionForPage(ctx.db, scope.projectId, location.drawingId, location.page);
  if (!prior) {
    for (const event of events()) emitAppEvent(ctx.api, event);
    return;
  }
  await startAnalysis(ctx, scope.projectId, {
    projectRevision: scope.projectRevision, drawingId: location.drawingId, page: location.page,
  }, { precedingEvents: events, reuseOnly: true });
}

export async function getAnalysisSnapshot(ctx: RuntimeContext, sessionId: string): Promise<AnalysisSnapshot> {
  const session = findSession(ctx.db, sessionId);
  const location = findSessionLocation(ctx.db, sessionId);
  if (!session || !location) throw notFound("Analysis");
  const floor = findFloor(ctx.db, location.drawingId, location.page);
  const view = floor ? floorView(ctx.db, floor.floor.id, session.projectRevision) : { elements: [], measurements: [] };
  const report = floor ? geometryReport(ctx.db, floor.floor.id, session.projectRevision) : undefined;
  const evaluations=listSessionEvaluations(ctx.db,sessionId).map(({evaluation})=>evaluation);
  const questions=reviewQuestions(ctx,session,evaluations,view.elements,await ctx.registry.getActiveRules(asOfDate(ctx)),report,view.measurements);
  const findings=listSessionFindings(ctx.db,sessionId);
  const assessment=assessFindings({status:session.status,findings,evaluations,elements:view.elements,questions});
  return AnalysisSnapshotSchema.parse({
    session,
    elements: view.elements,
    measurements: view.measurements,
    geometry: report,
    questions,
    assessment,
    evaluations: listSessionEvaluations(ctx.db, sessionId).map(({ evaluation }) => evaluation),
    findings,
    coverage: await computeCoverage(ctx, session.projectId, session),
    participants: listSessionParticipants(ctx.db, sessionId, ctx.liveParticipantIds),
  });
}

/**
 * Coverage with named denominators and no global score (PrD PR-12/PR-15). Rule and source counts
 * come from the registry; check counts from the given session, or the project's latest one.
 */
export async function computeCoverage(ctx: RuntimeContext, projectId: string, session?: AnalysisSession): Promise<CoverageSummary> {
  const project = getProject(ctx.db, projectId);
  const snapshot = await ctx.registry.snapshot();
  const evaluated = session ?? latestSessionForProject(ctx.db, projectId);
  const evaluations = evaluated ? listSessionEvaluations(ctx.db, evaluated.id).map(({ evaluation }) => evaluation) : [];

  const count = (lifecycle: string) => snapshot.rules.filter((rule) => rule.lifecycle === lifecycle).length;
  const statusCounts: Partial<Record<EvaluationStatus, number>> = {};
  for (const evaluation of evaluations) statusCounts[evaluation.status] = (statusCounts[evaluation.status] ?? 0) + 1;
  const active = snapshot.rules.filter((rule) => rule.lifecycle === "ACTIVE");
  const automatedProvisions = new Set(active.flatMap((rule) => rule.provisionIds));
  const activeSources = new Set(active.map((rule) => rule.sourceId));

  return {
    projectId,
    projectRevision: project.revision,
    indexedProvisions: snapshot.provisionCount,
    candidateRules: count("CANDIDATE") + count("AI_REVIEWED"),
    humanVerifiedRules: count("HUMAN_VERIFIED"),
    activeRules: active.length,
    applicableRules: new Set(evaluations.filter((e) => e.status !== "NOT_APPLICABLE").map((e) => e.ruleId)).size,
    executedChecks: evaluations.filter((e) => e.status === "PASS" || e.status === "FAIL").length,
    blockedUnknown: statusCounts.UNKNOWN ?? 0,
    needsReview: statusCounts.NEEDS_REVIEW ?? 0,
    outsideAutomatedCoverage: Math.max(0, snapshot.provisionCount - automatedProvisions.size),
    evaluationStatusCounts: statusCounts,
    sources: snapshot.sources.map((source) => ({
      sourceId: source.id,
      title: source.title,
      sourceVersion: source.sourceVersion,
      verificationStatus: source.status,
      considered: activeSources.has(source.id),
      reason: activeSources.has(source.id)
        ? "Has active, human-verified rules"
        : "No active rule from this source yet",
    })),
  };
}
