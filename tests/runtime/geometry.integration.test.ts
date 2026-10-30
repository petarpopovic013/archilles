import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import sharp from 'sharp';
import { AnalysisSnapshotSchema, MeasurementCorrectionResponseSchema, ProjectSchema, RecheckResponseSchema, StartAnalysisResponseSchema, UploadDrawingResponseSchema } from '../../src/domain';
import { createNodePageRenderer } from '../../src/geometry/node-renderer';
import { startRuntime, type RuntimeApp } from '../../runtime/app';
import { latestSessionForProject, listSessionRuns } from '../../runtime/db/repo';
import { listSessionEvents } from '../../runtime/participants/observer';
import { rule } from '../engine/fixtures';
import { corridorPlan, fakeInference, fakeRegistry, fakeVision } from './fakes';
import { call, removeDataDir, testConfig, waitFor } from './helpers';

const config = testConfig();
// TEST-ONLY invented threshold; never supplied to production or represented as Serbian law.
const syntheticRule = rule();
const vision = fakeVision(() => corridorPlan(1.05), 30);
const inference = fakeInference();
let app: RuntimeApp;
before(async () => { app = await startRuntime({ config, registry: fakeRegistry([syntheticRule]), geometry: { renderer: createNodePageRenderer(), vision }, inferenceRunner: inference }); });
after(async () => { await app.close(); removeDataDir(config); });

async function settled(sessionId: string) {
  return waitFor(async () => {
    const snapshot = AnalysisSnapshotSchema.parse((await call(app.url, 'GET', `/api/analyses/${sessionId}`)).body);
    return snapshot.session.status === 'RUNNING' ? undefined : snapshot;
  });
}

test('real uploads normalize PNG/JPG/PDF before Mozaik extraction, confirmation and deterministic recheck', async () => {
  for (const [filename, mime, page, confirmed, expected] of [
    ['office-a.png', 'image/png', 1, 1.05, 'FAIL'],
    ['office-b.jpg', 'image/jpeg', 1, 1.55, 'PASS'],
    ['offices.pdf', 'application/pdf', 2, 1.05, 'FAIL'],
  ] as const) {
    const project = ProjectSchema.parse((await call(app.url, 'POST', '/api/projects', { name: `Synthetic integration ${filename}` })).body);
    const form = new FormData();
    form.append('file', new Blob([await readFile(`fixtures/plans/${filename}`)], { type: mime }), filename);
    form.append('baseRevision', '1'); form.append('selectedPage', String(page));
    const upload = await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: 'POST', body: form });
    assert.equal(upload.status, 201);
    const { drawing } = UploadDrawingResponseSchema.parse(await upload.json());
    const image = await fetch(`${app.url}/api/drawings/${drawing.id}/pages/${page}`);
    assert.equal(image.headers.get('cache-control'), 'private, no-store');
    assert.equal(image.headers.get('content-type'), 'image/png');
    const raster = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(raster.width, mime === 'application/pdf' ? 1600 : 800);
    assert.equal(image.headers.get('x-source-width'), String(raster.width));

    const started = StartAnalysisResponseSchema.parse((await call(app.url, 'POST', `/api/projects/${project.id}/analyses`, { projectRevision: 2, drawingId: drawing.id, page })).body);
    const snapshot = await settled(started.sessionId);
    assert.equal(snapshot.session.status, 'COMPLETE'); assert.equal(snapshot.evaluations[0].status, 'UNKNOWN');
    const corridor = snapshot.elements.find(element => element.type === 'CORRIDOR')!;
    const events = listSessionEvents(app.ctx.db, started.sessionId, 0);
    assert.ok(events.some(event => event.type === 'geometry.extraction.completed'));
    assert.ok(events.some(event => event.type === 'rule.evaluation.completed'));
    assert.ok(events.some(event => event.type === 'review.finding.created'));
    assert.deepEqual(events.map(event => event.sequence), events.map((_, index) => index + 1));
    assert.ok(listSessionRuns(app.ctx.db, started.sessionId).every(run => run.status === 'COMPLETED'));
    const calls = vision.calls;
    const corrected = await call(app.url, 'PATCH', `/api/elements/${corridor.id}/measurements`, { baseRevision: 2, metric: 'CLEAR_WIDTH_M', value: confirmed, unit: 'm', evidenceIds: [] });
    assert.equal(MeasurementCorrectionResponseSchema.parse(corrected.body).revision.revision, 3);
    const confirmedSnapshot = await settled(latestSessionForProject(app.ctx.db, project.id)!.id);
    assert.equal(confirmedSnapshot.evaluations[0].status, expected);
    assert.equal(vision.calls, calls, 'confirmation reuses stored extraction');
    const beforeRecheck = { vision: vision.calls, review: inference.calls };
    const recheck = RecheckResponseSchema.parse((await call(app.url, 'POST', `/api/projects/${project.id}/rechecks`, { baseRevision: 3, elementId: corridor.id, metric: 'CLEAR_WIDTH_M', proposedValue: expected === 'FAIL' ? 1.55 : 1.05, unit: 'm' })).body);
    assert.equal(recheck.before[0].status, expected);
    assert.equal(recheck.after[0].status, expected === 'FAIL' ? 'PASS' : 'FAIL');
    assert.deepEqual({ vision: vision.calls, review: inference.calls }, beforeRecheck);
  }
});

test('bad real uploads return explicit errors without advancing the project revision', async () => {
  const project = ProjectSchema.parse((await call(app.url, 'POST', '/api/projects', { name: 'Invalid uploads' })).body);
  for (const [filename, mime, bytes] of [
    ['broken.jpg', 'image/jpeg', Uint8Array.from([255, 216, 255, 0])],
    ['broken.pdf', 'application/pdf', new TextEncoder().encode('%PDF-1.4\ninvalid')],
  ] as const) {
    const form = new FormData(); form.append('file', new Blob([bytes], { type: mime }), filename); form.append('baseRevision', '1');
    const response = await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: 'POST', body: form });
    assert.equal(response.status, 422);
  }
  assert.equal(ProjectSchema.parse((await call(app.url, 'GET', `/api/projects/${project.id}`)).body).revision, 1);
});

test('HTTP viewer client retains source coordinates for a resized analysis raster', async () => {
  const { HttpArchillesApiClient } = await import('../../src/ui/api/httpClient');
  const client = new HttpArchillesApiClient({ baseUrl: app.url });
  const project = await client.createProject({ name: 'Large source frame' });
  const bytes = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#ffffff' } }).png().toBuffer();
  // Blob (rather than File) tests the client supplying an appropriate upload extension.
  const { drawing } = await client.uploadDrawing(project.id, new Blob([bytes], { type: 'image/png' }), { baseRevision: 1 });
  const info = await client.getDrawingPageInfo(drawing.id, 1);
  try {
    assert.equal(info.widthPx, 4000); assert.equal(info.heightPx, 3000);
    const raster = await sharp(Buffer.from(await info.blob.arrayBuffer())).metadata();
    assert.equal(raster.width, 2048); assert.equal(raster.height, 1536);
  } finally { URL.revokeObjectURL(info.url); }
});

test('two pages in one project cannot make overlapping Vision calls', async () => {
  const project = ProjectSchema.parse((await call(app.url, 'POST', '/api/projects', { name: 'Concurrent pages' })).body);
  const form = new FormData(); form.append('file', new Blob([await readFile('fixtures/plans/offices.pdf')], { type: 'application/pdf' }), 'offices.pdf'); form.append('baseRevision', '1');
  const { drawing } = UploadDrawingResponseSchema.parse(await (await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: 'POST', body: form })).json());
  const original = vision.run;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let active = 0, peak = 0, calls = 0;
  vision.run = async (...args) => {
    active++; calls++; peak = Math.max(peak, active);
    try { await gate; return await original(...args); } finally { active--; }
  };
  try {
    const first = StartAnalysisResponseSchema.parse((await call(app.url, 'POST', `/api/projects/${project.id}/analyses`, { projectRevision: 2, drawingId: drawing.id, page: 1 })).body);
    await waitFor(() => calls === 1 ? true : undefined);
    const second = StartAnalysisResponseSchema.parse((await call(app.url, 'POST', `/api/projects/${project.id}/analyses`, { projectRevision: 2, drawingId: drawing.id, page: 2 })).body);
    assert.equal(calls, 1, 'second page waits for the first extraction');
    release();
    await Promise.all([settled(first.sessionId), settled(second.sessionId)]);
    assert.equal(calls, 2); assert.equal(peak, 1);
  } finally { release(); vision.run = original; }
});
