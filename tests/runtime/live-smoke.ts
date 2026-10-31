/** Explicit live integration command; excluded from the normal *.test.ts suite. Synthetic data only. */
import Anthropic from '@anthropic-ai/sdk';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AnalysisSnapshotSchema, ProjectSchema, StartAnalysisResponseSchema, UploadDrawingResponseSchema } from '../../src/domain';
import { createNodePageRenderer } from '../../src/geometry/node-renderer';
import { createClaudeVisionRunner } from '../../src/vision/claude';
import { createPendingRegistry } from '../../runtime/adapters/pending-registry';
import { ClaudeInferenceRunner } from '../../runtime/ai/inference';
import { startRuntime, type RuntimeApp } from '../../runtime/app';
import { loadConfig } from '../../runtime/config';
import { listSessionRuns } from '../../runtime/db/repo';
import { rule } from '../engine/fixtures';
import { fakeRegistry } from './fakes';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_KEY_REQUIRED');
  const dataDir = await mkdtemp(path.join(tmpdir(), 'archilles-live-smoke-'));
  let app: RuntimeApp | undefined;
  try {
    const base = loadConfig();
    const config = { ...base, port: 0, dataDir, databasePath: path.join(dataDir, 'smoke.sqlite'), aiBudgetUsd: Math.min(base.aiBudgetUsd, 1) };
    const client = new Anthropic({ maxRetries: 0 });
    const syntheticRule = process.argv.includes("--synthetic-rule");
    app = await startRuntime({ config, registry: syntheticRule ? fakeRegistry([rule()]) : createPendingRegistry(), geometry: { renderer: createNodePageRenderer(), vision: createClaudeVisionRunner(client, config.visionModel) }, inferenceRunner: new ClaudeInferenceRunner(client) });
    const created = await fetch(`${app.url}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Disclosed synthetic live smoke' }) });
    const project = ProjectSchema.parse(await created.json());
    const form = new FormData();
    form.append('file', new Blob([await readFile('fixtures/plans/office-a.png')], { type: 'image/png' }), 'office-a.png'); form.append('baseRevision', '1');
    const upload = await fetch(`${app.url}/api/projects/${project.id}/drawings`, { method: 'POST', body: form });
    if (upload.status !== 201) throw new Error('UPLOAD_SMOKE_FAILED');
    const { drawing } = UploadDrawingResponseSchema.parse(await upload.json());
    const started = await fetch(`${app.url}/api/projects/${project.id}/analyses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectRevision: 2, drawingId: drawing.id, page: 1 }) });
    const { sessionId } = StartAnalysisResponseSchema.parse(await started.json());
    const deadline = Date.now() + 900_000;
    for (;;) {
      const snapshot = AnalysisSnapshotSchema.parse(await (await fetch(`${app.url}/api/analyses/${sessionId}`)).json());
      if (snapshot.session.status !== 'RUNNING') {
        const runs = listSessionRuns(app.ctx.db, sessionId);
        const geometry = runs.find(run => run.role === 'GEOMETRY');
        console.log(JSON.stringify({ syntheticRule, notice: syntheticRule ? 'TEST-ONLY threshold, no legal meaning or production activation' : undefined, loops: app.ctx.db.prepare('SELECT r.role, COUNT(DISTINCT e.loop_id) AS loops FROM agent_loop_events e JOIN agent_runs r ON r.id = e.run_id WHERE r.session_id = ? GROUP BY r.role').all(sessionId), status: snapshot.session.status, model: config.visionModel, elements: snapshot.elements.length, measurements: snapshot.measurements.length, unverified: snapshot.measurements.filter(m => m.verification === 'UNVERIFIED').length, activeRules: snapshot.coverage.activeRules, runs: runs.map(({ role, status, inputTokens, outputTokens, estimatedCostUsd, errorCode }) => ({ role, status, inputTokens, outputTokens, estimatedCostUsd, errorCode })) }));
        if (geometry?.status !== 'COMPLETED' || snapshot.session.status !== 'COMPLETE') process.exitCode = 1;
        break;
      }
      if (Date.now() > deadline) throw new Error('LIVE_SMOKE_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } finally {
    await app?.close(); await rm(dataDir, { recursive: true, force: true });
  }
}
main().catch(() => { console.error('LIVE_SMOKE_FAILED: see sanitized run summary when available'); process.exitCode = 1; });
