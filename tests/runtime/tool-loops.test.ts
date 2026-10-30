import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { FunctionCallItem, ModelMessageItem, UserMessageItem, type InferenceInput } from '@mozaik-ai/core';
import { AnalysisSnapshotSchema, ProjectSchema, StartAnalysisResponseSchema, UploadDrawingResponseSchema } from '../../src/domain';
import { startRuntime, type RuntimeApp } from '../../runtime/app';
import { listSessionRuns } from '../../runtime/db/repo';
import { rule } from '../engine/fixtures';
import { corridorPlan, fakeGeometry, fakeInference, fakeRegistry, fakeVision } from './fakes';
import { call, removeDataDir, testConfig, waitFor } from './helpers';

const config = testConfig({ aiBudgetUsd: 20 });
const base = fakeInference();
const vision = fakeVision(() => corridorPlan(1.05), 40);
let mode: 'normal' | 'omit' | 'repeat' | 'cross' | 'unknown' | 'controller-fail' | 'forged-rules' | 'regulation-fail' | 'multiple' | 'malformed' | 'late-review' = 'normal';
let app: RuntimeApp;
let reviewSeen = false;
let reviewGate: Promise<void> = Promise.resolve();
const tokenUsage = undefined;
const runner = {
  async run(input: InferenceInput) {
    const user = input.context.getItems().filter((item): item is UserMessageItem => item instanceof UserMessageItem).at(-1)!;
    const data = JSON.parse(user.content.text) as { task?: string; batchId: string };
    if (data.task === 'GEOMETRY') {
      if (mode === 'controller-fail') throw new Error('PROVIDER_UNAVAILABLE');
      if (mode === 'omit') return { items: [ModelMessageItem.rehydrate({ text: '{"completed":true}' })], tokenUsage, rowResponse: {} };
      const tool = input.tools![0];
      if (['repeat', 'cross', 'unknown', 'multiple', 'malformed'].includes(mode)) {
        const item = FunctionCallItem.rehydrate({ callId: randomUUID(), name: mode === 'unknown' ? 'write_geometry_without_review' : tool.name, args: mode === 'malformed' ? '{' : JSON.stringify({ batchId: mode === 'cross' ? randomUUID() : data.batchId }) });
        return { items: mode === 'multiple' ? [item, item] : [item], tokenUsage, rowResponse: {} };
      }
    }
    if (data.task === 'REGULATION' && mode === 'regulation-fail') throw new Error('PROVIDER_UNAVAILABLE');
    if (!data.task && mode === "late-review") { reviewSeen = true; await reviewGate; }
    const output = await base.run(input);
    if (data.task === 'REGULATION' && mode === 'forged-rules' && output.items.some(item => item.type === 'message')) {
      return { ...output, items: [ModelMessageItem.rehydrate({ text: JSON.stringify({ ruleIds: [randomUUID()], explanations: [] }) })] };
    }
    return output;
  },
  stream: base.stream,
};

before(async () => { app = await startRuntime({ config, registry: fakeRegistry([rule()]), geometry: fakeGeometry(vision), inferenceRunner: runner }); });
after(async () => { await app.close(); removeDataDir(config); });

async function start() {
  const project = ProjectSchema.parse((await call(app.url, 'POST', '/api/projects', { name: 'Synthetic loop guard test' })).body);
  const form = new FormData(); form.append('file', new Blob([await readFile('fixtures/plans/office-a.png')], { type: 'image/png' }), 'office-a.png'); form.append('baseRevision', '1');
  const { drawing } = UploadDrawingResponseSchema.parse(await (await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: 'POST', body: form })).json());
  const { sessionId } = StartAnalysisResponseSchema.parse((await call(app.url, 'POST', `/api/projects/${project.id}/analyses`, { projectRevision: 2, drawingId: drawing.id, page: 1 })).body);
  return { sessionId, projectId: project.id };
}

async function run() {
  const { sessionId } = await start();
  const snapshot = await waitFor(async () => {
    const data = AnalysisSnapshotSchema.parse((await call(app.url, 'GET', `/api/analyses/${sessionId}`)).body);
    return data.session.status === 'RUNNING' ? undefined : data;
  });
  return { snapshot, runs: listSessionRuns(app.ctx.db, sessionId), sessionId };
}

test('all participants produce real loop events and use isolated task contexts', async () => {
  mode = 'normal';
  const { snapshot, sessionId } = await run();
  assert.equal(snapshot.session.status, 'COMPLETE');
  const events = app.ctx.db.prepare('SELECT r.role, e.loop_id, e.type FROM agent_loop_events e JOIN agent_runs r ON r.id = e.run_id WHERE r.session_id = ?').all(sessionId) as { role: string; loop_id: string; type: string }[];
  for (const role of ['GEOMETRY', 'REGULATION', 'REVIEW']) {
    assert.ok(events.some(event => event.role === role && event.type === 'inference.completed'));
    assert.ok(events.some(event => event.role === role && event.type === 'model.answer'));
  }
  for (const id of new Set(events.filter(event => event.role !== 'REVIEW').map(event => event.loop_id))) {
    assert.equal(events.filter(event => event.loop_id === id && event.type === 'inference.completed').length, 2);
    assert.equal(events.filter(event => event.loop_id === id && event.type === 'function_call.completed').length, 1);
  }
  for (const role of ['GEOMETRY', 'REGULATION']) assert.ok(events.some(event => event.role === role && event.type === 'function_call.completed'));
  const contexts = new Map<string, string>();
  for (const task of base.contexts) {
    if (contexts.has(task.batchId!)) assert.equal(contexts.get(task.batchId!), task.contextId);
    else contexts.set(task.batchId!, task.contextId);
  }
  assert.equal(new Set(contexts.values()).size, contexts.size, 'no two batches share context');
  const fields = app.ctx.db.prepare('PRAGMA table_info(agent_loop_events)').all() as { name: string }[];
  assert.deepEqual(fields.map(field => field.name), ['sequence', 'run_id', 'loop_id', 'type', 'occurred_at']);
});

for (const [scenario, expected, expectedVision] of [
  ['omit', 'AGENT_TOOL_REQUIRED', 0], ['repeat', 'AGENT_TOOL_LIMIT', 1],
  ['cross', 'AGENT_TOOL_SCOPE', 0], ['unknown', 'AGENT_TOOL_SCOPE', 0],
  ['controller-fail', 'PROVIDER_UNAVAILABLE', 0], ['multiple', 'UNEXPECTED_TOOL_CALL', 0],
  ['malformed', 'INVALID_TOOL_ARGUMENTS', 0],
] as const) {
  test(`Geometry ${scenario} ends visibly without unbounded tool execution`, async () => {
    mode = scenario; const before = vision.calls;
    const { snapshot, runs } = await run();
    assert.equal(snapshot.session.status, 'PARTIAL');
    assert.equal(runs.find(run => run.role === 'GEOMETRY')!.errorCode, expected);
    assert.equal(vision.calls - before, expectedVision);
    assert.equal(snapshot.elements.length, 0, 'invalid controller result cannot persist observations');
  });
}

test('Regulation cannot inject unregistered rule IDs or claim evaluated outcomes', async () => {
  mode = 'forged-rules'; const { snapshot, runs } = await run();
  assert.equal(snapshot.session.status, 'PARTIAL');
  assert.ok(runs.some(run => run.role === 'REGULATION' && run.errorCode === 'REGULATION_OUTPUT_INVALID'));
  assert.equal(snapshot.evaluations.length, 0);
  assert.equal(snapshot.coverage.executedChecks, 0);
});

test('Regulation inference failures preserve extracted geometry and terminate the session', async () => {
  mode = 'regulation-fail'; const { snapshot, runs } = await run();
  assert.equal(snapshot.session.status, 'PARTIAL'); assert.ok(snapshot.elements.length > 0);
  assert.ok(runs.some(run => run.role === 'REGULATION' && run.errorCode === 'PROVIDER_UNAVAILABLE'));
  assert.equal(snapshot.evaluations.length, 0);
});


test('a late Review answer cannot revive stale findings or overwrite the next revision', async () => {
  mode = 'late-review'; reviewSeen = false;
  let release!: () => void;
  reviewGate = new Promise(resolve => { release = resolve; });
  try {
    const { sessionId, projectId } = await start();
    await waitFor(() => reviewSeen ? true : undefined);
    const updated = await call(app.url, 'PATCH', `/api/projects/${projectId}`, { baseRevision: 2, patch: { occupantCount: 25 } });
    assert.equal(updated.status, 200);
    release();
    const snapshot = await waitFor(async () => {
      const result = AnalysisSnapshotSchema.parse((await call(app.url, 'GET', `/api/analyses/${sessionId}`)).body);
      return result.session.status === 'RUNNING' ? undefined : result;
    });
    assert.equal(snapshot.session.status, 'PARTIAL');
    assert.equal(snapshot.session.errorCode, 'REVISION_SUPERSEDED');
    assert.ok(snapshot.findings.length > 0 && snapshot.findings.every(finding => finding.stale));
    assert.equal(listSessionRuns(app.ctx.db, sessionId).find(run => run.role === 'REVIEW')!.status, 'CANCELLED');
  } finally { release(); }
});
