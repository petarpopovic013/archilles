import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  AnalysisSnapshotSchema,
  ApiErrorSchema,
  CoverageSummarySchema,
  EvidenceSchema,
  MeasurementCorrectionResponseSchema,
  ProjectSchema,
  RecheckResponseSchema,
  StartAnalysisResponseSchema,
  UploadDrawingResponseSchema,
  type AgentEvent,
  type AnalysisSnapshot,
} from "../../src/domain";
import { startRuntime, type RuntimeApp } from "../../runtime/app";
import { latestSessionForProject, listSessionRuns } from "../../runtime/db/repo";
import { listSessionEvents } from "../../runtime/participants/observer";
import { rule } from "../engine/fixtures";
import { corridorPlan, fakeGeometry, fakeInference, fakeRegistry, fakeVision } from "./fakes";
import { call, removeDataDir, testConfig, waitFor } from "./helpers";

/** TEST-ONLY synthetic rule: corridor clear width at least 1.2 m. Not a legal requirement. */
const corridorRule = rule();
const config = testConfig();
let app: RuntimeApp;
let vision: ReturnType<typeof fakeVision>;
let inference: ReturnType<typeof fakeInference>;
const plans = new Map<string, number>();

before(async () => {
  for (const [name, width] of [["office-a", 1.05], ["office-b", 1.35]] as const) {
    const bytes = await readFile(`fixtures/plans/${name}.png`);
    plans.set(createHash("sha256").update(bytes).digest("hex"), width);
  }
  vision = fakeVision((sha) => corridorPlan(plans.get(sha) ?? 1));
  inference = fakeInference();
  app = await startRuntime({ config, registry: fakeRegistry([corridorRule]), geometry: fakeGeometry(vision), inferenceRunner: inference });
});

after(async () => {
  await app.close();
  removeDataDir(config);
});

async function createProjectWithPlan(name: string) {
  const project = ProjectSchema.parse((await call(app.url, "POST", "/api/projects", { name: `Synthetic ${name}` })).body);
  const form = new FormData();
  form.append("file", new Blob([await readFile(`fixtures/plans/${name}.png`)], { type: "image/png" }), `${name}.png`);
  form.append("baseRevision", "1");
  const response = await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: "POST", body: form });
  assert.equal(response.status, 201);
  const { drawing } = UploadDrawingResponseSchema.parse(await response.json());
  return { projectId: project.id, drawingId: drawing.id };
}

async function settled(sessionId: string): Promise<AnalysisSnapshot> {
  return waitFor(async () => {
    const snapshot = AnalysisSnapshotSchema.parse((await call(app.url, "GET", `/api/analyses/${sessionId}`)).body);
    return snapshot.session.status === "RUNNING" ? undefined : snapshot;
  });
}

const types = (events: AgentEvent[]) => events.map((event) => event.type);

let first: { projectId: string; drawingId: string; sessionId: string; corridorId: string };

test("Geometry and Regulation overlap, refine selection, and Review consumes the persisted evaluation", async () => {
  const { projectId, drawingId } = await createProjectWithPlan("office-a");
  const started = await call(app.url, "POST", `/api/projects/${projectId}/analyses`, { projectRevision: 2, drawingId, page: 1 });
  assert.equal(started.status, 202);
  const { sessionId } = StartAnalysisResponseSchema.parse(started.body);
  const snapshot = await settled(sessionId);

  assert.equal(snapshot.session.status, "COMPLETE");
  assert.equal(vision.calls, 1);
  assert.equal(inference.roleCalls.REVIEW, 1, "one Review explanation batch");

  // Real overlap: Regulation's first run started and finished while Geometry was extracting.
  const runs = listSessionRuns(app.ctx.db, sessionId);
  const geometry = runs.find((run) => run.role === "GEOMETRY")!;
  const regulation = runs.filter((run) => run.role === "REGULATION");
  assert.equal(regulation.length, 2, "initial selection plus one refinement for the new element types");
  assert.ok(regulation[0].startedAt < geometry.finishedAt! && geometry.startedAt < regulation[0].finishedAt!);
  assert.ok(runs.every((run) => run.status === "COMPLETED"));

  const events = listSessionEvents(app.ctx.db, sessionId, 0);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
  const selections = events.filter((event) => event.type === "regulation.rules.selected")
    .map((event) => (event.payload as { ruleIds: string[] }).ruleIds);
  assert.deepEqual(selections, [[], [corridorRule.id]], "a geometry result changed the selected rules");
  const order = types(events);
  assert.ok(order.indexOf("geometry.extraction.completed") < order.indexOf("rule.evaluation.completed"));
  assert.ok(order.indexOf("rule.evaluation.completed") < order.indexOf("review.finding.created"));
  assert.ok(order.includes("geometry.measurement.missing"));
  assert.ok(order.includes("regulation.input.required"));
  assert.equal(order.filter((type) => type === "rule.evaluation.completed").length, 1);
  assert.ok(events.every((event) => event.producerId !== app.participants.api || event.type === "analysis.started"));

  // An AI-read label stays unverified, so the engine cannot decide PASS/FAIL yet.
  const corridor = snapshot.elements.find((element) => element.type === "CORRIDOR")!;
  assert.equal(corridor.extraction, "AI_SUGGESTED");
  assert.equal(snapshot.evaluations.length, 1);
  assert.equal(snapshot.evaluations[0].status, "UNKNOWN");
  assert.equal(snapshot.evaluations[0].reasonCode, "INPUT_UNVERIFIED");
  assert.equal(snapshot.findings[0].status, "UNKNOWN");
  assert.equal(snapshot.findings[0].explanation, "Reviewed explanation for a UNKNOWN outcome.");
  assert.equal(snapshot.coverage.activeRules, 1);
  assert.equal(snapshot.coverage.blockedUnknown, 1);

  // Same revision/drawing/rule set: the existing session is returned and no AI work repeats.
  const again = await call(app.url, "POST", `/api/projects/${projectId}/analyses`, { projectRevision: 2, drawingId, page: 1 });
  assert.equal(StartAnalysisResponseSchema.parse(again.body).sessionId, sessionId);
  assert.equal(vision.calls, 1);

  first = { projectId, drawingId, sessionId, corridorId: corridor.id };
});

test("every activity event names its source agent, and cited evidence is retrievable", async () => {
  const snapshot = AnalysisSnapshotSchema.parse((await call(app.url, "GET", `/api/analyses/${first.sessionId}`)).body);
  const names = new Map(snapshot.participants!.map((participant) => [participant.id, participant]));
  for (const event of listSessionEvents(app.ctx.db, first.sessionId, 0)) assert.ok(names.has(event.producerId), event.type);
  assert.deepEqual(names.get(app.participants.geometry), { id: app.participants.geometry, name: "Geometry Agent", kind: "AGENT" });
  assert.equal(names.get(app.participants.bridge)?.kind, "HUMAN", "the engine bridge is deterministic, not an AI agent");

  const corridor = snapshot.elements.find((element) => element.id === first.corridorId)!;
  const found = await call(app.url, "GET", `/api/evidence/${corridor.evidenceIds[0]}`);
  assert.equal(found.status, 200);
  const evidence = EvidenceSchema.parse(found.body);
  assert.equal(evidence.source, "DRAWING");
  assert.equal(evidence.page, 1);
  const missing = await call(app.url, "GET", `/api/evidence/${first.corridorId}`);
  assert.equal(missing.status, 404);
  assert.equal(ApiErrorSchema.parse(missing.body).code, "NOT_FOUND");
});

test("a confirmed correction creates a revision and re-evaluates from stored geometry", async () => {
  const selectionCalls = inference.roleCalls.REGULATION;
  const controllerCalls = inference.roleCalls.GEOMETRY;
  const corrected = await call(app.url, "PATCH", `/api/elements/${first.corridorId}/measurements`, {
    baseRevision: 2, metric: "CLEAR_WIDTH_M", value: 1.05, unit: "m", evidenceIds: [],
  });
  assert.equal(corrected.status, 200);
  const { revision, measurement } = MeasurementCorrectionResponseSchema.parse(corrected.body);
  assert.equal(revision.revision, 3);
  assert.equal(measurement.source, "USER_CORRECTED");
  assert.equal(measurement.verification, "USER_CONFIRMED");
  assert.ok(measurement.supersedesId);

  const followUp = latestSessionForProject(app.ctx.db, first.projectId)!;
  assert.equal(followUp.projectRevision, 3);
  const snapshot = await settled(followUp.id);
  assert.equal(snapshot.evaluations[0].status, "FAIL");
  assert.equal(snapshot.evaluations[0].observed, 1.05);
  assert.equal(vision.calls, 1, "no new Vision call after a correction");
  assert.equal(inference.roleCalls.REGULATION, selectionCalls, "dimension-only correction reuses the registry proposal");
  assert.equal(inference.roleCalls.GEOMETRY, controllerCalls, "stored geometry requires no controller call");

  const oldFindings = AnalysisSnapshotSchema.parse((await call(app.url, "GET", `/api/analyses/${first.sessionId}`)).body).findings;
  assert.ok(oldFindings.every((finding) => finding.stale));
  assert.ok(types(listSessionEvents(app.ctx.db, followUp.id, 0)).slice(0, 3)
    .every((type) => ["project.revision.created", "geometry.measurement.updated", "analysis.started"].includes(type)));

  const stale = await call(app.url, "PATCH", `/api/elements/${first.corridorId}/measurements`, {
    baseRevision: 2, metric: "CLEAR_WIDTH_M", value: 1.1, unit: "m", evidenceIds: [],
  });
  assert.equal(stale.status, 409);
});

test("Fix & Recheck is hypothetical, selective, and makes no model call", async () => {
  const calls = { vision: vision.calls, inference: inference.calls };
  const response = await call(app.url, "POST", `/api/projects/${first.projectId}/rechecks`, {
    baseRevision: 3, elementId: first.corridorId, metric: "CLEAR_WIDTH_M", proposedValue: 1.3, unit: "m",
  });
  assert.equal(response.status, 200);
  const { action, before, after } = RecheckResponseSchema.parse(response.body);
  assert.deepEqual(before.map((evaluation) => evaluation.status), ["FAIL"]);
  assert.deepEqual(after.map((evaluation) => evaluation.status), ["PASS"]);
  assert.equal(action.hypothetical, true);
  assert.deepEqual({ vision: vision.calls, inference: inference.calls }, calls);
  const project = ProjectSchema.parse((await call(app.url, "GET", `/api/projects/${first.projectId}`)).body);
  assert.equal(project.revision, 3, "a recheck never creates a revision");
});

test("two data-distinct plans produce different engine outcomes", async () => {
  const { projectId, drawingId } = await createProjectWithPlan("office-b");
  const { sessionId } = StartAnalysisResponseSchema.parse(
    (await call(app.url, "POST", `/api/projects/${projectId}/analyses`, { projectRevision: 2, drawingId, page: 1 })).body);
  const corridor = (await settled(sessionId)).elements.find((element) => element.type === "CORRIDOR")!;
  await call(app.url, "PATCH", `/api/elements/${corridor.id}/measurements`, {
    baseRevision: 2, metric: "CLEAR_WIDTH_M", value: 1.35, unit: "m", evidenceIds: [],
  });
  const snapshot = await settled(latestSessionForProject(app.ctx.db, projectId)!.id);
  assert.equal(snapshot.evaluations[0].status, "PASS");
  assert.equal(snapshot.evaluations[0].observed, 1.35);

  const coverage = CoverageSummarySchema.parse((await call(app.url, "GET", `/api/projects/${projectId}/coverage`)).body);
  assert.equal(coverage.executedChecks, 1);
  assert.deepEqual(coverage.evaluationStatusCounts, { PASS: 1 });
});

test("SSE replays stored events in order and resumes after a sequence", async () => {
  const controller = new AbortController();
  const response = await fetch(`${app.url}/api/analyses/${first.sessionId}/events?after=3`, { signal: controller.signal });
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const reader = response.body!.getReader();
  let text = "";
  const total = listSessionEvents(app.ctx.db, first.sessionId, 3).length;
  while ((text.match(/^id: /gm) ?? []).length < total) {
    const { value } = await reader.read();
    text += new TextDecoder().decode(value);
  }
  controller.abort();
  const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
  assert.deepEqual(ids, Array.from({ length: total }, (_, index) => index + 4));
});
