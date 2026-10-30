import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  AnalysisSnapshotSchema,
  ApiErrorSchema,
  ElementUpdateResponseSchema,
  EvidenceSchema,
  ProjectSchema,
  StartAnalysisResponseSchema,
  UploadDrawingResponseSchema,
  type AnalysisSnapshot,
} from "../../src/domain";
import { startRuntime, type RuntimeApp } from "../../runtime/app";
import { latestSessionForProject } from "../../runtime/db/repo";
import { rule } from "../engine/fixtures";
import { corridorPlan, fakeGeometry, fakeInference, fakeRegistry, fakeVision } from "./fakes";
import { call, removeDataDir, testConfig, waitFor } from "./helpers";

/**
 * TEST-ONLY synthetic rule shaped like a subtype-scoped check: it applies only to corridors a
 * person has classified with the synthetic subtype. It asserts no legal requirement.
 */
const SUBTYPE = "TEST_ONLY_PASSAGE";
const subtypeRule = rule({
  applicability: { op: "ALL", children: [
    { op: "EQ", field: "purpose", value: "OFFICE" },
    { op: "EQ", field: "element.subtype", value: SUBTYPE },
  ] },
});
const config = testConfig();
const vision = fakeVision(() => corridorPlan(1.05));
let app: RuntimeApp;

before(async () => {
  app = await startRuntime({ config, registry: fakeRegistry([subtypeRule]), geometry: fakeGeometry(vision), inferenceRunner: fakeInference() });
});

after(async () => {
  await app.close();
  removeDataDir(config);
});

const settled = (sessionId: string) => waitFor(async () => {
  const snapshot = AnalysisSnapshotSchema.parse((await call(app.url, "GET", `/api/analyses/${sessionId}`)).body);
  return snapshot.session.status === "RUNNING" ? undefined : snapshot;
});

const latest = (projectId: string) => settled(latestSessionForProject(app.ctx.db, projectId)!.id);
const corridorOf = (snapshot: AnalysisSnapshot) => snapshot.elements.find((element) => element.type === "CORRIDOR")!;

test("a person-confirmed subtype makes a subtype-scoped rule applicable; history is preserved", async () => {
  const project = ProjectSchema.parse((await call(app.url, "POST", "/api/projects", { name: "Subtype" })).body);
  const form = new FormData();
  form.append("file", new Blob([await readFile("fixtures/plans/office-a.png")], { type: "image/png" }), "office-a.png");
  form.append("baseRevision", "1");
  const { drawing } = UploadDrawingResponseSchema.parse(await (await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: "POST", body: form })).json());
  const { sessionId } = StartAnalysisResponseSchema.parse(
    (await call(app.url, "POST", `/api/projects/${project.id}/analyses`, { projectRevision: 2, drawingId: drawing.id, page: 1 })).body);

  // Revision 2: Vision cannot know the subtype, so applicability is unknown, not false.
  const initial = await settled(sessionId);
  const corridor = corridorOf(initial);
  assert.equal(corridor.subtype, undefined);
  assert.deepEqual(initial.evaluations.map((e) => [e.status, e.reasonCode]), [["UNKNOWN", "APPLICABILITY_UNKNOWN"]]);

  // Revision 3: a person classifies the corridor.
  const confirmed = await call(app.url, "PATCH", `/api/elements/${corridor.id}`, { baseRevision: 2, subtype: SUBTYPE });
  assert.equal(confirmed.status, 200);
  const { revision, element } = ElementUpdateResponseSchema.parse(confirmed.body);
  assert.equal(revision.revision, 3);
  assert.equal(revision.kind, "GEOMETRY_CORRECTION");
  assert.equal(element.id, corridor.id, "measurements and findings keep pointing at the same element");
  assert.equal(element.subtype, SUBTYPE);
  assert.equal(element.extraction, "USER_CONFIRMED");
  const evidence = EvidenceSchema.parse((await call(app.url, "GET", `/api/evidence/${element.evidenceIds.at(-1)}`)).body);
  assert.equal(evidence.source, "USER");

  // The rule now applies, but the AI-read width is still unverified.
  const afterSubtype = await latest(project.id);
  assert.equal(afterSubtype.session.projectRevision, 3);
  assert.deepEqual(afterSubtype.evaluations.map((e) => [e.status, e.reasonCode]), [["UNKNOWN", "INPUT_UNVERIFIED"]]);

  // Revision 4: the width is confirmed, so the engine can decide.
  await call(app.url, "PATCH", `/api/elements/${corridor.id}/measurements`, {
    baseRevision: 3, metric: "CLEAR_WIDTH_M", value: 1.05, unit: "m", evidenceIds: [],
  });
  const decided = await latest(project.id);
  assert.equal(decided.evaluations[0].status, "FAIL");
  assert.equal(corridorOf(decided).subtype, SUBTYPE, "the confirmed subtype carries into later revisions");

  // Revision 5: another subtype makes the rule decidably not applicable; clearing it is unknown again.
  await call(app.url, "PATCH", `/api/elements/${corridor.id}`, { baseRevision: 4, subtype: "OTHER" });
  assert.equal((await latest(project.id)).evaluations[0].status, "NOT_APPLICABLE");
  await call(app.url, "PATCH", `/api/elements/${corridor.id}`, { baseRevision: 5, subtype: null });
  const cleared = await latest(project.id);
  assert.equal(corridorOf(cleared).subtype, undefined);
  assert.equal(cleared.evaluations[0].reasonCode, "APPLICABILITY_UNKNOWN");

  // History: the revision-2 analysis still shows the element exactly as Vision suggested it.
  const history = corridorOf(AnalysisSnapshotSchema.parse((await call(app.url, "GET", `/api/analyses/${sessionId}`)).body));
  assert.equal(history.subtype, undefined);
  assert.equal(history.extraction, "AI_SUGGESTED");
  assert.equal(history.revision, 2);
  assert.equal(vision.calls, 1, "corrections never trigger another Vision call");
});

test("element confirmation rejects stale revisions and invalid types", async () => {
  const projectId = app.ctx.db.prepare("SELECT id FROM projects LIMIT 1").pluck().get() as string;
  const { revision: current } = ProjectSchema.parse((await call(app.url, "GET", `/api/projects/${projectId}`)).body);
  const elementId = app.ctx.db.prepare("SELECT id FROM elements LIMIT 1").pluck().get() as string;

  const stale = await call(app.url, "PATCH", `/api/elements/${elementId}`, { baseRevision: current - 1, subtype: SUBTYPE });
  assert.equal(stale.status, 409);
  assert.equal(ApiErrorSchema.parse(stale.body).code, "REVISION_CONFLICT");

  const invalid = await call(app.url, "PATCH", `/api/elements/${elementId}`, { baseRevision: current, type: "SPACESHIP" });
  assert.equal(invalid.status, 422);
});
