import type { z } from "zod";
import {
  AgentRunSchema,
  AnalysisSessionSchema,
  ArchitecturalElementSchema,
  ComplianceFindingSchema,
  DrawingSchema,
  EvidenceSchema,
  FloorSchema,
  MeasurementSchema,
  ReviewActionSchema,
  RuleEvaluationSchema,
  type AgentRun,
  type ParticipantSummary,
  type AnalysisSession,
  type ArchitecturalElement,
  type ComplianceFinding,
  type Drawing,
  type Evidence,
  type Floor,
  type Measurement,
  type ReviewAction,
  type RuleEvaluation,
} from "../../src/domain";
import type { PreparedPage } from "../../src/geometry";
import type { EngineResult } from "../../src/rules/engine";
import type { Db } from "./connection";

/** Typed persistence. Every row is validated on write and re-parsed with the domain schema on read. */
const parse = <S extends z.ZodType>(schema: S, row: unknown): z.output<S> => schema.parse(JSON.parse(row as string));
const json = (value: unknown) => JSON.stringify(value);

// Drawings and floors ------------------------------------------------------------------------

export function insertDrawing(db: Db, drawing: Drawing): void {
  const valid = DrawingSchema.parse(drawing);
  db.prepare("INSERT INTO drawings (id, project_id, revision, sha256, data) VALUES (?, ?, ?, ?, ?)")
    .run(valid.id, valid.projectId, valid.revision, valid.sha256, json(valid));
}

export function findDrawing(db: Db, drawingId: string): Drawing | undefined {
  const row = db.prepare("SELECT data FROM drawings WHERE id = ?").pluck().get(drawingId);
  return row === undefined ? undefined : parse(DrawingSchema, row);
}

export interface FloorRecord {
  floor: Floor;
  /** Runtime-private page preparation (raster key, transform); never sent to the browser. */
  render: PreparedPage;
}

export function insertFloor(db: Db, record: FloorRecord): void {
  const floor = FloorSchema.parse(record.floor);
  db.prepare("INSERT INTO floors (id, project_id, drawing_id, page, render, data) VALUES (?, ?, ?, ?, ?, ?)")
    .run(floor.id, floor.projectId, floor.drawingId, floor.page, json(record.render), json(floor));
}

function toFloorRecord(row: { data: string; render: string } | undefined): FloorRecord | undefined {
  return row && { floor: parse(FloorSchema, row.data), render: JSON.parse(row.render) as PreparedPage };
}

export function findFloor(db: Db, drawingId: string, page: number): FloorRecord | undefined {
  return toFloorRecord(db.prepare("SELECT data, render FROM floors WHERE drawing_id = ? AND page = ?")
    .get(drawingId, page) as { data: string; render: string } | undefined);
}

export function findFloorById(db: Db, floorId: string): FloorRecord | undefined {
  return toFloorRecord(db.prepare("SELECT data, render FROM floors WHERE id = ?")
    .get(floorId) as { data: string; render: string } | undefined);
}

// Observations -------------------------------------------------------------------------------

export interface Observations {
  elements: ArchitecturalElement[];
  measurements: Measurement[];
  evidence: Evidence[];
}

/** Evidence first so later rows can reference it. Call inside a transaction. */
export function insertObservations(db: Db, observations: Observations): void {
  const evidence = db.prepare("INSERT INTO evidence (id, project_id, revision, data) VALUES (?, ?, ?, ?)");
  const element = db.prepare("INSERT INTO elements (id, project_id, floor_id, revision, data) VALUES (?, ?, ?, ?, ?)");
  const measurement = db.prepare(`
    INSERT INTO measurements (id, project_id, element_id, revision, metric, supersedes_id, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of observations.evidence.map((value) => EvidenceSchema.parse(value))) {
    evidence.run(item.id, item.projectId, item.revision, json(item));
  }
  for (const item of observations.elements.map((value) => ArchitecturalElementSchema.parse(value))) {
    element.run(item.id, item.projectId, item.floorId, item.revision, json(item));
  }
  for (const item of observations.measurements.map((value) => MeasurementSchema.parse(value))) {
    measurement.run(item.id, item.projectId, item.elementId, item.revision, item.metric, item.supersedesId ?? null, json(item));
  }
}

export function hasObservations(db: Db, floorId: string): boolean {
  return db.prepare("SELECT 1 FROM elements WHERE floor_id = ? LIMIT 1").pluck().get(floorId) !== undefined;
}

/**
 * The project view of one floor at revision R: records created at or before R. Superseded
 * measurements stay in the view; the engine resolves `supersedesId` chains to the current value.
 */
export function floorView(db: Db, floorId: string, revision: number): Observations {
  const elements = db.prepare(`
    SELECT COALESCE((
      SELECT v.data FROM element_versions v WHERE v.element_id = e.id AND v.revision <= ?
      ORDER BY v.revision DESC LIMIT 1
    ), e.data) FROM elements e WHERE e.floor_id = ? AND e.revision <= ? ORDER BY e.rowid
  `).pluck().all(revision, floorId, revision).map((row) => parse(ArchitecturalElementSchema, row));
  const ids = elements.map((element) => element.id);
  const measurements = ids.length === 0 ? [] : db.prepare(`
    SELECT m.data FROM measurements m JOIN elements e ON e.id = m.element_id
    WHERE e.floor_id = ? AND m.revision <= ? ORDER BY m.rowid
  `).pluck().all(floorId, revision).map((row) => parse(MeasurementSchema, row));
  const evidenceIds = new Set([
    ...elements.flatMap((element) => element.evidenceIds),
    ...measurements.flatMap((measurement) => measurement.evidenceIds),
  ]);
  const evidence = findEvidence(db, [...evidenceIds]);
  return { elements, measurements, evidence };
}

export function findEvidence(db: Db, ids: readonly string[]): Evidence[] {
  const statement = db.prepare("SELECT data FROM evidence WHERE id = ?").pluck();
  return ids.flatMap((id) => {
    const row = statement.get(id);
    return row === undefined ? [] : [parse(EvidenceSchema, row)];
  });
}

/** The element's latest version (its current state at the newest revision). */
export function findElement(db: Db, elementId: string): ArchitecturalElement | undefined {
  const row = db.prepare(`
    SELECT COALESCE((
      SELECT v.data FROM element_versions v WHERE v.element_id = e.id ORDER BY v.revision DESC LIMIT 1
    ), e.data) FROM elements e WHERE e.id = ?
  `).pluck().get(elementId);
  return row === undefined ? undefined : parse(ArchitecturalElementSchema, row);
}

export function insertElementVersion(db: Db, element: ArchitecturalElement): void {
  const valid = ArchitecturalElementSchema.parse(element);
  db.prepare("INSERT INTO element_versions (element_id, revision, data) VALUES (?, ?, ?)")
    .run(valid.id, valid.revision, json(valid));
}

// Sessions and agent runs --------------------------------------------------------------------

export interface SessionLocation {
  drawingId: string;
  page: number;
}

export function insertSession(db: Db, session: AnalysisSession, runKey: string, location: SessionLocation): void {
  const valid = AnalysisSessionSchema.parse(session);
  db.prepare(`
    INSERT INTO sessions (id, project_id, project_revision, run_key, status, data, drawing_id, page)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(valid.id, valid.projectId, valid.projectRevision, runKey, valid.status, json(valid), location.drawingId, location.page);
}

export function saveSession(db: Db, session: AnalysisSession): void {
  const valid = AnalysisSessionSchema.parse(session);
  db.prepare("UPDATE sessions SET status = ?, data = ? WHERE id = ?").run(valid.status, json(valid), valid.id);
}

export function findSession(db: Db, sessionId: string): AnalysisSession | undefined {
  const row = db.prepare("SELECT data FROM sessions WHERE id = ?").pluck().get(sessionId);
  return row === undefined ? undefined : parse(AnalysisSessionSchema, row);
}

export function findSessionLocation(db: Db, sessionId: string): SessionLocation | undefined {
  const row = db.prepare("SELECT drawing_id, page FROM sessions WHERE id = ?")
    .get(sessionId) as { drawing_id: string; page: number } | undefined;
  return row && { drawingId: row.drawing_id, page: row.page };
}

export function findSessionByRunKey(db: Db, runKey: string): AnalysisSession | undefined {
  const row = db.prepare("SELECT data FROM sessions WHERE run_key = ?").pluck().get(runKey);
  return row === undefined ? undefined : parse(AnalysisSessionSchema, row);
}

/** Frees the run key of a failed session so an explicit rerun can start a new one. */
export function retireRunKey(db: Db, sessionId: string): void {
  db.prepare("UPDATE sessions SET run_key = run_key || ':retired:' || id WHERE id = ?").run(sessionId);
}

export function latestSessionForPage(db: Db, projectId: string, drawingId: string, page: number): AnalysisSession | undefined {
  const row = db.prepare(`
    SELECT data FROM sessions WHERE project_id = ? AND drawing_id = ? AND page = ?
    ORDER BY project_revision DESC, rowid DESC LIMIT 1
  `).pluck().get(projectId, drawingId, page);
  return row === undefined ? undefined : parse(AnalysisSessionSchema, row);
}

export function latestSessionForProject(db: Db, projectId: string): AnalysisSession | undefined {
  const row = db.prepare("SELECT data FROM sessions WHERE project_id = ? ORDER BY project_revision DESC, rowid DESC LIMIT 1")
    .pluck().get(projectId);
  return row === undefined ? undefined : parse(AnalysisSessionSchema, row);
}

export function saveRun(db: Db, run: AgentRun): void {
  const valid = AgentRunSchema.parse(run);
  db.prepare(`
    INSERT INTO agent_runs (id, session_id, role, status, estimated_cost_usd, data) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET status = excluded.status, estimated_cost_usd = excluded.estimated_cost_usd, data = excluded.data
  `).run(valid.id, valid.sessionId, valid.role, valid.status, valid.estimatedCostUsd ?? 0, json(valid));
}

export function findRun(db: Db, runId: string): AgentRun | undefined {
  const row = db.prepare("SELECT data FROM agent_runs WHERE id = ?").pluck().get(runId);
  return row === undefined ? undefined : parse(AgentRunSchema, row);
}

export function listSessionRuns(db: Db, sessionId: string): AgentRun[] {
  return db.prepare("SELECT data FROM agent_runs WHERE session_id = ? ORDER BY rowid").pluck().all(sessionId)
    .map((row) => parse(AgentRunSchema, row));
}

// Evaluations, findings, actions -------------------------------------------------------------

export function insertEvaluation(db: Db, sessionId: string, result: EngineResult): void {
  const valid = RuleEvaluationSchema.parse(result.evaluation);
  db.prepare(`
    INSERT INTO evaluations (id, session_id, project_id, project_revision, fingerprint, measurement_ids, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(valid.id, sessionId, valid.projectId, valid.projectRevision, result.fingerprint, json(result.measurementIds), json(valid));
}

export interface StoredEvaluation {
  evaluation: RuleEvaluation;
  fingerprint: string;
}

export function listSessionEvaluations(db: Db, sessionId: string): StoredEvaluation[] {
  return (db.prepare("SELECT data, fingerprint FROM evaluations WHERE session_id = ? ORDER BY rowid")
    .all(sessionId) as { data: string; fingerprint: string }[])
    .map((row) => ({ evaluation: parse(RuleEvaluationSchema, row.data), fingerprint: row.fingerprint }));
}

export function saveFinding(db: Db, finding: ComplianceFinding): void {
  const valid = ComplianceFindingSchema.parse(finding);
  db.prepare(`
    INSERT INTO findings (id, evaluation_id, project_id, project_revision, element_id, stale, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET stale = excluded.stale, data = excluded.data
  `).run(valid.id, valid.evaluationId, valid.projectId, valid.projectRevision, valid.elementId ?? null, valid.stale ? 1 : 0, json(valid));
}

export function listSessionFindings(db: Db, sessionId: string): ComplianceFinding[] {
  return db.prepare(`
    SELECT f.data FROM findings f JOIN evaluations e ON e.id = f.evaluation_id
    WHERE e.session_id = ? ORDER BY f.rowid
  `).pluck().all(sessionId).map((row) => parse(ComplianceFindingSchema, row));
}

/** The most recent finding explained for identical engine inputs, so its text can be reused. */
export function findingForFingerprint(db: Db, projectId: string, fingerprint: string, excludeSessionId: string): ComplianceFinding | undefined {
  const row = db.prepare(`
    SELECT f.data FROM findings f JOIN evaluations e ON e.id = f.evaluation_id
    WHERE e.project_id = ? AND e.fingerprint = ? AND e.session_id <> ?
    ORDER BY f.rowid DESC LIMIT 1
  `).pluck().get(projectId, fingerprint, excludeSessionId);
  return row === undefined ? undefined : parse(ComplianceFindingSchema, row);
}

export function insertReviewAction(db: Db, action: ReviewAction): void {
  const valid = ReviewActionSchema.parse(action);
  db.prepare("INSERT INTO review_actions (id, project_id, base_revision, data) VALUES (?, ?, ?, ?)")
    .run(valid.id, valid.projectId, valid.baseRevision, json(valid));
}

/** Claims a clarification key once per revision; returns false when it was already requested. */
export function claimPendingInput(db: Db, key: string, sessionId: string, revision: number, data: unknown): boolean {
  return db.prepare("INSERT OR IGNORE INTO pending_inputs (input_key, session_id, project_revision, data) VALUES (?, ?, ?, ?)")
    .run(key, sessionId, revision, json(data)).changes === 1;
}

// Participants ------------------------------------------------------------------------------

export function insertParticipant(db: Db, participant: ParticipantSummary, joinedAt: string): void {
  db.prepare("INSERT OR IGNORE INTO participants (id, name, kind, joined_at) VALUES (?, ?, ?, ?)")
    .run(participant.id, participant.name, participant.kind, joinedAt);
}

/** Producers of a session's stored events plus the live participants that may still produce some. */
export function listSessionParticipants(db: Db, sessionId: string, liveIds: readonly string[]): ParticipantSummary[] {
  return db.prepare(`
    SELECT id, name, kind FROM participants
    WHERE id IN (SELECT DISTINCT json_extract(data, '$.producerId') FROM agent_events WHERE session_id = ?)
       OR id IN (SELECT value FROM json_each(?))
    ORDER BY joined_at, name
  `).all(sessionId, JSON.stringify(liveIds)) as ParticipantSummary[];
}
