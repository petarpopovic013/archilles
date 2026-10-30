import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { ApiErrorSchema, ProjectSchema, UpdateProjectResponseSchema } from "../../src/domain";
import { startRuntime, type RuntimeApp } from "../../runtime/app";
import { openDatabase, recoverInterruptedWork } from "../../runtime/db/connection";
import { fakeGeometry, fakeInference, fakeRegistry, fakeVision } from "./fakes";
import { call, removeDataDir, testConfig } from "./helpers";

const config = testConfig();
let app: RuntimeApp;

before(async () => {
  app = await startRuntime({
    config,
    registry: fakeRegistry([]),
    geometry: fakeGeometry(fakeVision(() => ({ elements: [], warnings: [] }))),
    inferenceRunner: fakeInference(),
  });
});

after(async () => {
  await app.close();
  removeDataDir(config);
});

test("creates a project with progressive metadata at revision 1", async () => {
  const created = await call(app.url, "POST", "/api/projects", { name: "Office A" });
  assert.equal(created.status, 201);
  const project = ProjectSchema.parse(created.body);
  assert.equal(project.revision, 1);
  assert.equal(project.classification, undefined);

  const fetched = await call(app.url, "GET", `/api/projects/${project.id}`);
  assert.deepEqual(ProjectSchema.parse(fetched.body), project);
});

test("a confirmed metadata patch creates a revision; null clears; a stale base is a 409", async () => {
  const { body } = await call(app.url, "POST", "/api/projects", {
    name: "Office B", floorCount: 3, characteristics: { hasRamp: true },
  });
  const project = ProjectSchema.parse(body);

  const patched = await call(app.url, "PATCH", `/api/projects/${project.id}`, {
    baseRevision: 1, patch: { floorCount: null, occupantCount: 40, characteristics: { hasRamp: null, isNewBuild: true } },
  });
  assert.equal(patched.status, 200);
  const result = UpdateProjectResponseSchema.parse(patched.body);
  assert.equal(result.project.revision, 2);
  assert.equal(result.project.floorCount, undefined);
  assert.equal(result.project.occupantCount, 40);
  assert.deepEqual(result.project.characteristics, { isNewBuild: true });
  assert.equal(result.revision.parentRevision, 1);

  const stale = await call(app.url, "PATCH", `/api/projects/${project.id}`, { baseRevision: 1, patch: { occupantCount: 10 } });
  assert.equal(stale.status, 409);
  assert.equal(ApiErrorSchema.parse(stale.body).code, "REVISION_CONFLICT");
});

test("invalid input and unknown IDs use the standard error body", async () => {
  const invalid = await call(app.url, "POST", "/api/projects", { name: "" });
  assert.equal(invalid.status, 422);
  assert.equal(ApiErrorSchema.parse(invalid.body).code, "INVALID_INPUT");

  const missing = await call(app.url, "GET", `/api/projects/${randomUUID()}`);
  assert.equal(missing.status, 404);
  const malformed = await call(app.url, "GET", "/api/projects/not-a-uuid");
  assert.equal(malformed.status, 404);
});

test("restart recovery marks running sessions and started runs as failed", () => {
  const db = openDatabase(":memory:");
  const projectId = randomUUID();
  const sessionId = randomUUID();
  db.prepare("INSERT INTO projects (id, revision, data) VALUES (?, 1, '{}')").run(projectId);
  db.prepare("INSERT INTO sessions (id, project_id, project_revision, run_key, status, data) VALUES (?, ?, 1, 'k', 'RUNNING', ?)")
    .run(sessionId, projectId, JSON.stringify({ id: sessionId, status: "RUNNING" }));
  db.prepare("INSERT INTO agent_runs (id, session_id, role, status, data) VALUES (?, ?, 'GEOMETRY', 'STARTED', ?)")
    .run(randomUUID(), sessionId, JSON.stringify({ status: "STARTED" }));

  assert.deepEqual(recoverInterruptedWork(db, "2026-10-30T12:00:00.000Z"), { sessions: 1, runs: 1 });
  const session = JSON.parse(db.prepare("SELECT data FROM sessions").pluck().get() as string);
  assert.equal(session.status, "FAILED");
  assert.equal(session.errorCode, "RUNTIME_RESTARTED");
  db.close();
});
