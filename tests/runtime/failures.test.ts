import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { AnalysisSnapshotSchema, ProjectSchema, StartAnalysisResponseSchema, UploadDrawingResponseSchema, parseAppEvent } from "../../src/domain";
import { GeometryError } from "../../src/geometry";
import { startRuntime, type RuntimeApp } from "../../runtime/app";
import { listSessionRuns } from "../../runtime/db/repo";
import { emitAppEvent } from "../../runtime/mozaik/app-events";
import { listSessionEvents } from "../../runtime/participants/observer";
import { rule } from "../engine/fixtures";
import { corridorPlan, fakeGeometry, fakeInference, fakeRegistry, fakeVision } from "./fakes";
import { call, removeDataDir, testConfig, waitFor } from "./helpers";

const config = testConfig();
let app: RuntimeApp;
let visionMode: "ok" | "down" = "ok";
const vision = fakeVision(() => (visionMode === "down" ? new GeometryError("VISION_UNAVAILABLE", true) : corridorPlan(1.05)));
// The provider fails inside the Mozaik loop: the runtime must survive and report it.
const inference = fakeInference({ fail: true });

before(async () => {
  app = await startRuntime({ config, registry: fakeRegistry([rule()]), geometry: fakeGeometry(vision), inferenceRunner: inference });
});

after(async () => {
  await app.close();
  removeDataDir(config);
});

async function startSession(plan = "office-a") {
  const project = ProjectSchema.parse((await call(app.url, "POST", "/api/projects", { name: "Failure path" })).body);
  const form = new FormData();
  form.append("file", new Blob([await readFile(`fixtures/plans/${plan}.png`)], { type: "image/png" }), `${plan}.png`);
  form.append("baseRevision", "1");
  const upload = await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: "POST", body: form });
  const { drawing } = UploadDrawingResponseSchema.parse(await upload.json());
  const started = await call(app.url, "POST", `/api/projects/${project.id}/analyses`, { projectRevision: 2, drawingId: drawing.id, page: 1 });
  return { projectId: project.id, sessionId: StartAnalysisResponseSchema.parse(started.body).sessionId };
}

const settled = (sessionId: string) => waitFor(async () => {
  const snapshot = AnalysisSnapshotSchema.parse((await call(app.url, "GET", `/api/analyses/${sessionId}`)).body);
  return snapshot.session.status === "RUNNING" ? undefined : snapshot;
});

test("a failed Review model call leaves template findings and a PARTIAL session, without crashing", async () => {
  const { sessionId } = await startSession();
  const snapshot = await settled(sessionId);
  assert.equal(snapshot.session.status, "PARTIAL");
  assert.equal(inference.roleCalls.REVIEW, 1);
  const review = listSessionRuns(app.ctx.db, sessionId).find((run) => run.role === "REVIEW")!;
  assert.equal(review.status, "FAILED");
  assert.equal(review.errorCode, "PROVIDER_UNAVAILABLE");
  assert.equal(snapshot.findings[0].status, "UNKNOWN");
  assert.match(snapshot.findings[0].explanation, /cannot be decided/);
  assert.ok(listSessionEvents(app.ctx.db, sessionId, 0).some((event) => event.type === "agent.run.failed"));

  // The Regulation question call failed too: the architect still gets the template question.
  const regulation = listSessionRuns(app.ctx.db, sessionId).find((run) => run.role === "REGULATION")!;
  assert.equal(regulation.errorCode, "PROVIDER_UNAVAILABLE");
  const question = listSessionEvents(app.ctx.db, sessionId, 0).find((event) => event.type === "regulation.input.required")!;
  assert.equal((question.payload as { reason: string }).reason, "Koliko korisnika ima objekat?");
});

test("Vision being unavailable ends in a visible PARTIAL session that claims no checks", async () => {
  visionMode = "down";
  const { sessionId } = await startSession("office-b");
  const snapshot = await settled(sessionId);
  visionMode = "ok";
  assert.equal(snapshot.session.status, "PARTIAL");
  const geometryRun = listSessionRuns(app.ctx.db, sessionId).find((run) => run.role === "GEOMETRY")!;
  const failed = listSessionEvents(app.ctx.db, sessionId, 0)
    .find((event) => event.type === "agent.run.failed" && (event.payload as { agentRunId: string }).agentRunId === geometryRun.id)!;
  assert.deepEqual((failed.payload as { errorCode: string; retryable: boolean }), {
    agentRunId: (failed.payload as { agentRunId: string }).agentRunId, errorCode: "VISION_UNAVAILABLE", retryable: true,
  });
  // No elements were found, so no element rule was selected and nothing is claimed as checked.
  assert.equal(snapshot.elements.length, 0);
  assert.equal(snapshot.evaluations.length, 0);
  assert.equal(snapshot.coverage.activeRules, 1);
  assert.equal(snapshot.coverage.executedChecks, 0);
});

test("duplicate event IDs are ignored and a newer revision supersedes a running session", async () => {
  const { projectId, sessionId } = await startSession();
  const started = listSessionEvents(app.ctx.db, sessionId, 0).find((event) => event.type === "analysis.started")!;
  emitAppEvent(app.ctx.api, parseAppEvent({
    eventId: started.id, type: started.type, projectId, projectRevision: started.projectRevision,
    correlationId: sessionId, sessionId, occurredAt: started.occurredAt, payload: started.payload,
  }));
  // Confirmed metadata change while Geometry is still working on revision 2.
  await call(app.url, "PATCH", `/api/projects/${projectId}`, { baseRevision: 2, patch: { occupantCount: 30 } });

  const snapshot = await settled(sessionId);
  assert.equal(listSessionRuns(app.ctx.db, sessionId).filter((run) => run.role === "GEOMETRY").length, 1);
  assert.equal(snapshot.session.status, "PARTIAL");
  assert.equal(snapshot.session.errorCode, "REVISION_SUPERSEDED");
  assert.equal(snapshot.evaluations.length, 0, "late work for revision 2 is not evaluated against revision 3");
  assert.equal(snapshot.elements.length, 0, "late geometry is discarded before persistence");
  const late = listSessionRuns(app.ctx.db, sessionId).find(run => run.role === "GEOMETRY")!;
  assert.ok((late.estimatedCostUsd ?? 0) > 0, "discarded results still account for actual model usage");
});

test("the budget cap blocks new AI calls before they are made", async () => {
  const before = vision.calls;
  const { sessionId: seed } = await startSession("office-b");
  await settled(seed);
  app.ctx.db.prepare("INSERT INTO agent_runs (id, session_id, role, status, estimated_cost_usd, data) VALUES (?, ?, 'GEOMETRY', 'COMPLETED', ?, '{}')")
    .run(randomUUID(), seed, config.aiBudgetUsd);
  const callsBefore = vision.calls;
  const inferenceBefore = inference.calls;

  const { sessionId } = await startSession();
  const snapshot = await settled(sessionId);
  assert.ok(vision.calls - before >= 1);
  assert.equal(vision.calls, callsBefore, "no Vision call once the budget is spent");
  assert.equal(inference.calls, inferenceBefore, "controller inference is also blocked before provider access");
  const geometry = listSessionRuns(app.ctx.db, sessionId).find((run) => run.role === "GEOMETRY")!;
  assert.equal(geometry.errorCode, "BUDGET_EXCEEDED");
  assert.equal(snapshot.session.status, "PARTIAL");
});
