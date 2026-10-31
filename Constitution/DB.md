# Archilles data constitution

Version: 1.1, 30 October 2026. This document owns the canonical domain contract. `PrD.md` owns product behavior, `Tech.MD` owns implementation and transport, and `Agents.MD` owns runtime behavior. The C0 types and Zod validators now exist in `src/domain/`; the database tables and product features remain future work.

## 1. Invariants and persistence

- Separate legal source text, candidate interpretations, approved executable rules, project observations, evaluations, and temporary agent coordination. A model output never directly becomes a compliance finding.
- Use opaque stable IDs (UUIDs) and ISO 8601 UTC timestamps. Persist the active rule **version**, source **version**, project **revision**, drawing **page**, and evidence IDs with every evaluation. An old finding remains auditable but is marked stale when its dependency changes.
- Store all physical lengths in metres as finite decimal numbers; preserve the supplied unit and raw label alongside the normalized value. Percent slope is a ratio (`rise/run`) in evaluation, not a degree value. Never derive metres from pixels without a confirmed scale.
- The MVP uses a local SQLite file in a persistent single Node process and private files under `data/`, both excluded from Git. Store uploads by generated ID, never by user filename. Use transactions for revision plus evidence plus finding writes; use SQLite foreign keys and WAL. The browser and Next.js never open the database directly. Backup or copy the database only while using SQLite's backup mechanism or after shutdown.
- Private normalized rasters use the source frame defined by Tech ADR-08: oriented native image pixels or a cropped, rotated 144-DPI PDF render. Persist transforms and private storage references separately from canonical geometry; raster DPI is not scale calibration.
- Runtime auxiliary tables `agent_loop_events` and `regulation_selection_cache` retain allowlisted loop IDs/state names linked to AgentRun, and validated rule-selection proposals linked to project/fingerprint. They store no raw model contexts, image bytes, tool arguments, or answers. Historical observations retain their revision; late model answers cannot revive stale findings.
- Mozaik `RuntimeState` holds only live session coordination: active runs, awaited inputs, deduplication keys, and current revision pointers. SQLite is the system of record. A runtime restart reconstructs sessions from persisted state and marks interrupted runs as failed; it does not replay AI calls automatically.
- The MVP is a single-user local demonstration. No account or tenant isolation is claimed. A production deployment must add authentication, project ACLs, encryption at rest, retention policy, and audit access controls before accepting confidential client plans.

## 2. Canonical TypeScript contract

The shared package exports these discriminants unchanged to UI, API, rule engine, and runtime. `Id` and UTC timestamps are validated at input boundaries rather than nominal runtime types. All optional fields represent genuinely unknown information; `null` is used only where a known empty value is meaningful.

```ts
type Id = string;
type ISODateTime = string;
type Jurisdiction = "RS";
type ProjectPhase = "CONCEPT" | "DESIGN" | "RECONSTRUCTION";
type AnalysisStatus = "DRAFT" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED";
type EvaluationStatus = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE" | "NEEDS_REVIEW";
type RuleLifecycle = "CANDIDATE" | "AI_REVIEWED" | "HUMAN_VERIFIED" | "ACTIVE" | "REJECTED" | "SUPERSEDED";
type Verification = "UNVERIFIED" | "USER_CONFIRMED" | "SOURCE_VERIFIED";
type ElementType = "ROOM" | "CORRIDOR" | "DOOR" | "WALL" | "ENTRANCE" |
  "EXIT" | "STAIR" | "RAMP" | "OPENING" | "UNKNOWN";
type MeasurementSource = "DRAWING_LABEL" | "CONFIRMED_SCALE" | "AI_ESTIMATE" |
  "USER_ENTERED" | "USER_CORRECTED";
type CharacteristicKey = "hasPublicAccess" | "isNewBuild" |
  "hasAccessibleRoute" | "hasRamp" | "hasExternalStair";
type Metric = "CLEAR_WIDTH_M" | "HEIGHT_M" | "RISE_M" | "RUN_M" |
  "ROUTE_LENGTH_M" | "FLOOR_COUNT" | "OCCUPANT_COUNT" | "COUNT" | "SLOPE_RATIO";

interface Project {
  id: Id; name: string; jurisdiction: Jurisdiction; municipality?: string;
  purpose: "OFFICE" | "OTHER"; classification?: string;
  phase: ProjectPhase; buildingHeightM?: number; floorCount?: number;
  occupantCount?: number; characteristics: Partial<Record<CharacteristicKey, boolean>>;
  revision: number; analysisStatus: AnalysisStatus;
  createdAt: ISODateTime; updatedAt: ISODateTime;
}
interface Drawing {
  id: Id; projectId: Id; revision: number; originalName: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  sha256: string; storageKey: string; byteSize: number; pageCount: number;
  selectedPage: number; uploadedAt: ISODateTime;
}
interface Floor {
  id: Id; projectId: Id; drawingId: Id; page: number;
  levelLabel: string; imageWidthPx: number; imageHeightPx: number;
  calibration?: { metresPerPixel: number; method: "USER_TWO_POINT" | "VERIFIED_LABEL";
    evidenceId: Id; confirmedBy: string; confirmedAt: ISODateTime };
}
type Point = { x: number; y: number }; // source-page pixels, origin top-left
type Geometry = { kind: "BBOX"; x: number; y: number; width: number; height: number } |
  { kind: "POLYGON" | "POLYLINE"; points: Point[] };
interface ArchitecturalElement {
  id: Id; projectId: Id; floorId: Id; revision: number; type: ElementType;
  subtype?: string; label?: string; geometry: Geometry;
  relationIds: Id[]; extraction: "AI_SUGGESTED" | "USER_CONFIRMED" | "USER_CREATED";
  evidenceIds: Id[];
}
interface Evidence {
  id: Id; projectId: Id; revision: number; drawingId?: Id; page?: number;
  geometry?: Geometry; text?: string; source: "DRAWING" | "USER" | "REGULATION";
  capturedAt: ISODateTime;
}
interface Measurement {
  id: Id; projectId: Id; elementId: Id; revision: number; metric: Metric;
  value: number; unit: "m" | "count" | "ratio";
  originalValue?: number; originalUnit?: string; source: MeasurementSource;
  verification: Verification; confidence?: number; evidenceIds: Id[];
  supersedesId?: Id; recordedBy?: string; recordedAt: ISODateTime;
}
```

`confidence` is a model-quality hint in `[0,1]`, never a substitute for `verification`. An AI estimate remains `UNVERIFIED` regardless of confidence. A drawing label may become `SOURCE_VERIFIED` only after a user checks that the label refers to the selected element and the unit is unambiguous. User corrections create a new measurement rather than mutating the prior value.

```ts
interface RegulationSource {
  id: Id; title: string; jurisdiction: Jurisdiction; category: string;
  publicationReference: string; officialUrl: string; retrievedAt: ISODateTime;
  originalPublishedAt?: string; effectiveFrom?: string; effectiveTo?: string;
  amendmentReferences: string[]; sourceVersion: string; sha256?: string;
  status: "CURRENT_CONFIRMED" | "HISTORICAL" | "CURRENT_UNCONFIRMED";
  verifiedBy?: string; verifiedAt?: ISODateTime;
}
interface RegulationProvision {
  id: Id; sourceId: Id; sourceVersion: string; article: string;
  paragraph?: string; item?: string; text: string; location?: string;
  crossReferenceIds: Id[]; externalStandardRefs: string[];
  verification: Verification;
}
type Condition =
  | { op: "EQ" | "IN"; field: "jurisdiction" | "purpose" | "phase" |
      "classification" | "element.type" | "element.subtype"; value: string | string[] }
  | { op: "EQ"; field: "characteristic"; key: CharacteristicKey; value: boolean }
  | { op: "GTE" | "LTE"; field: "buildingHeightM" | "floorCount" |
      "occupantCount"; value: number }
  | { op: "ALL" | "ANY"; children: Condition[] };
type EvaluationDefinition =
  | { kind: "MIN" | "MAX"; metric: Metric; threshold: number; unit: "m" | "count" | "ratio" }
  | { kind: "BOOL"; field: string; expected: boolean }
  | { kind: "COUNT_MIN" | "COUNT_MAX"; elementType: ElementType; threshold: number }
  | { kind: "REVIEWED_EVALUATOR"; evaluatorId: string; version: string };
interface ComplianceRule {
  id: Id; version: number; sourceId: Id; sourceVersion: string;
  provisionIds: Id[]; title: string; lifecycle: RuleLifecycle;
  elementType: ElementType; applicability: Condition;
  exceptionConditions: Condition[]; requiredInputs: Metric[];
  evaluation: EvaluationDefinition; effectiveFrom?: string; effectiveTo?: string;
  approvedBy?: string; approvedAt?: ISODateTime; testFixtureIds: Id[];
  interpretationNotes: string[];
}
interface RuleExtraction {
  id: Id; sourceId: Id; sourceVersion: string; provisionIds: Id[];
  candidateRuleId: Id; extractingAgentRunId: Id; validatingAgentRunId?: Id;
  validation: "PENDING" | "SUPPORTED" | "CHALLENGED";
  issues: string[]; createdAt: ISODateTime;
}
```

Conditions are a bounded DSL. Unknown fields yield `UNKNOWN` applicability, not false. Characteristic keys are an explicit allowlist; add one through a reviewed schema change when a verified rule needs it. `exceptionConditions` take precedence only when proved. `REVIEWED_EVALUATOR` names a versioned, checked-in pure function; it is never generated JavaScript. A rule can be `ACTIVE` only after the current source version and provision are human verified, evaluator availability is confirmed, and applicability, pass, fail, missing-input, and boundary fixtures pass. `AI_REVIEWED` is distinct from human approval.

```ts
interface RuleEvaluation {
  id: Id; projectId: Id; projectRevision: number; ruleId: Id; ruleVersion: number;
  elementId?: Id; status: EvaluationStatus; required?: number | string | boolean;
  observed?: number | string | boolean; unit?: string; evidenceIds: Id[];
  missingInputs: Metric[]; unknownFacts?: string[]; reasonCode: string; evaluatedAt: ISODateTime;
}
interface ComplianceFinding {
  id: Id; evaluationId: Id; projectId: Id; projectRevision: number;
  ruleId: Id; ruleVersion: number; sourceId: Id; sourceVersion: string;
  provisionIds: Id[]; elementId?: Id; status: EvaluationStatus;
  priority?: "LOW" | "MEDIUM" | "HIGH"; title: string; explanation: string;
  suggestedAction?: string; evidenceIds: Id[]; requiresHumanReview: boolean;
  stale: boolean; createdAt: ISODateTime;
}
interface ProjectRevision {
  projectId: Id; revision: number; parentRevision?: number;
  kind: "UPLOAD" | "METADATA" | "GEOMETRY_CORRECTION" | "MEASUREMENT_CORRECTION";
  changedEntityIds: Id[]; createdBy: string; createdAt: ISODateTime;
}
interface ReviewAction {
  id: Id; projectId: Id; baseRevision: number; elementId: Id; metric: Metric;
  previousMeasurementId?: Id; proposedValue: number; unit: string;
  outcome: RuleEvaluation[]; hypothetical: true; createdAt: ISODateTime;
}
interface AnalysisSession {
  id: Id; projectId: Id; projectRevision: number; status: AnalysisStatus;
  selectedRuleIds: Id[]; agentRunIds: Id[]; startedAt: ISODateTime;
  finishedAt?: ISODateTime; errorCode?: string;
}
interface AgentRun {
  id: Id; sessionId: Id; participantId: Id; role: "GEOMETRY" | "REGULATION" |
    "REVIEW" | "RULE_EXTRACTION" | "RULE_VALIDATION";
  status: "STARTED" | "COMPLETED" | "FAILED" | "CANCELLED";
  model?: string; inputTokens?: number; outputTokens?: number;
  estimatedCostUsd?: number; errorCode?: string;
  startedAt: ISODateTime; finishedAt?: ISODateTime;
}
interface AgentEvent {
  id: Id; sessionId: Id; projectRevision: number; sequence: number;
  type: string; producerId: Id; payload: unknown; occurredAt: ISODateTime;
}
```

`RuleEvaluation` is the engine output. `ComplianceFinding` is its display explanation and must preserve the engine status; a review agent cannot change it. `ReviewAction` records a simulation only. Committing a real corrected measurement creates a `ProjectRevision`, supersedes the measurement, and triggers selective reevaluation.

## 3. Relationships, constraints, and validation

`Project 1:N Drawing/Floor/ProjectRevision/AnalysisSession`; `Floor 1:N ArchitecturalElement`; `ArchitecturalElement 1:N Measurement`; `RegulationSource 1:N RegulationProvision/ComplianceRule`; `ComplianceRule N:M RegulationProvision`; `AnalysisSession 1:N AgentRun/AgentEvent/RuleEvaluation`; `RuleEvaluation 1:0..1 ComplianceFinding`. Evidence is referenced by ID and never copied into finding prose as the sole record.

Require: unique `(projectId, revision)`; unique `(ruleId, version)`; unique `(sourceId, sourceVersion, article, paragraph, item)` where present; unique `(sessionId, sequence)` and event ID; foreign keys for every referenced persisted ID. IDs referenced by a project must belong to that project and revision. Coordinates must be finite and lie within the source page after normalization; bounding boxes have positive size and polygons at least three distinct points. Uploaded page numbers are one-based. A floor's page must belong to its drawing. Accepted MIME type must match file signature, not extension.

For a finding, store the exact source and rule versions evaluated, the measurement IDs used, and a reason code. Rechecking the same `(projectRevision, ruleVersion, elementId, input evidence IDs)` is idempotent. If project metadata, geometry, measurement, or active rule version changes, mark dependent findings stale; do not silently rewrite historical results. A rule version is immutable once `ACTIVE`; changes create a new version and supersede the prior one.

### Example: candidate, evaluation, and hypothetical recheck

This example is **illustrative data**, not an approved Serbian requirement or a claim about a real drawing.

```json
{
  "rule": { "id": "demo-rule", "version": 1, "lifecycle": "CANDIDATE",
    "sourceId": "source-to-verify", "provisionIds": ["provision-to-verify"],
    "evaluation": { "kind": "MIN", "metric": "CLEAR_WIDTH_M", "threshold": 1.2, "unit": "m" } },
  "measurement": { "id": "m1", "elementId": "corridor-1", "value": 1.05,
    "unit": "m", "source": "USER_ENTERED", "verification": "USER_CONFIRMED" },
  "coverage": { "candidateRuleCount": 1, "executableCheckCount": 0 },
  "proposedChange": { "baseRevision": 2, "elementId": "corridor-1",
    "proposedValue": 1.3, "unit": "m", "hypothetical": true }
}
```

The engine must reject `CANDIDATE` before producing a `RuleEvaluation`; the numeric values here must never be placed in the approved registry by copying this example.

## 4. Regulatory source versioning and audit

Seed the registry with metadata from the official Serbian [fire protection regulation, 22/2019-3](https://pravno-informacioni-sistem.rs/SlGlasnikPortal/reg/viewAct/ec3c54bc-de4a-433f-afa8-d9eb44b7dab1) and [accessibility regulation, 22/2015-95 and 10/2026-89](https://pravno-informacioni-sistem.rs/SlGlasnikPortal/reg/viewAct/512f4f2c-4bc4-4c31-a335-409673b7fac5). Record retrieval date, amendment relationship, and original-language provision locations. The official register identifies those publications; this document does **not** certify that a particular provision is currently applicable to every office project. Exact article text, effective dates, dependencies, and any later changes must be checked before activation. Store a source hash when a lawful copy is retained; do not infer a hash from a URL.

Lifecycle transitions: `CANDIDATE -> AI_REVIEWED -> HUMAN_VERIFIED -> ACTIVE`; `CANDIDATE` or `AI_REVIEWED -> REJECTED`; `HUMAN_VERIFIED` or `ACTIVE -> SUPERSEDED` when replaced. Rejection and supersession require a reason and actor. Human verification records the reviewer, timestamp, source version, article, exceptions, and test fixtures. AI review can recommend but cannot set `HUMAN_VERIFIED` or `ACTIVE`.

## 5. Files, retention, and future migration

MVP private storage: `data/archilles.sqlite` and `data/uploads/<generated-id>`; exclude `data/` and `.env*` from Git. Default retention is until the user deletes the local project; project deletion removes database rows and associated files. The UI must disclose this local retention behavior. Avoid embedding full drawings in agent events, logs, or JSON responses. Logs contain IDs, timing, error codes, and token use, not confidential plan pixels or secret keys.

Future hosted storage maps the same entities to relational tables (`projects`, `project_revisions`, `drawings`, `floors`, `elements`, `measurements`, `evidence`, `regulation_sources`, `provisions`, `rules`, `rule_extractions`, `sessions`, `agent_runs`, `agent_events`, `evaluations`, `findings`, `review_actions`) and moves upload bytes to private object storage. Suggested indexes: `(project_id, revision)` for all project evidence and findings; `(source_id, source_version, article)` for provisions; `(lifecycle, jurisdiction, element_type)` for rule selection; `(session_id, sequence)` for event replay; `(project_id, stale, status)` for review panels. Add tenant IDs and row-level authorization in the production migration, not as a cosmetic MVP field. Migration scripts must preserve IDs, rule/source versions, revisions, and historical evaluation traces; verify row counts and sampled finding provenance before switching storage.


### Geometry recognition records (ADR-13)
`src/domain/geometry.ts` defines the canonical schemas for `DrawingSettings`, `GeometryReport`, legend samples, annotations and geometry issues. Reports/settings are immutable per floor/project revision; stage cache is scoped to the private floor, source/model/prompt identity and confirmed settings. `geometry_reports`, `drawing_settings`, `geometry_stage_cache`, `geometry_requests` are runtime tables. `elements.retired_revision` excludes replaced AI suggestions from newer snapshots while keeping historical sessions intact. Human-confirmed element versions are preserved. Coordinates of legend, annotations, issues, calibration and regions use the same canonical source frame as elements. Report stage is operational, not a regulatory evaluation status. Unit confirmation never upgrades a measurement verification; nominal opening annotations stay separate from clear-width evidence.

`ArchitecturalElement.geometryVerification?` tracks boundary approval independently from classification/extraction. A boundary-only edit cannot approve an AI subtype. Polygon/polyline input is limited to 400 vertices by application refinements. `DrawingAnnotation` retains optional two-point span evidence, kind, direction and association. Opening report kind may be WINDOW, DOOR or UNKNOWN; OPENING alone does not imply WINDOW. Manual creation/removal use new revisions and USER evidence; retirement applies only from that revision and retired IDs cannot be edited.

Geometry issue codes include `SYMBOL_AMBIGUOUS`, `ROOM_UNLABELLED`, `INTERIOR_ENCLOSURE` and `ROOM_MASK_VARIANT` in addition to unsupported gaps/overlaps/partial reads. These codes express evidence uncertainty and never change a rule evaluation status. Reports recompute current room overlaps and opening adjacency after human revisions; historical snapshots use their own revision.
