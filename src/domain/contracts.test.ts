import assert from "node:assert/strict";
import test from "node:test";
import {
  ArchitecturalElementSchema,
  ComplianceRuleSchema,
  CreateProjectRequestSchema,
  DrawingSchema,
  EvidenceSchema,
  FloorSchema,
  MeasurementSchema,
  ProjectSchema,
  RecheckRequestSchema,
  RuleEvaluationSchema,
  UpdateProjectRequestSchema,
  geometryFitsFloor,
  parseAppEvent,
} from "./index";
import { contractFixture } from "./fixtures";

test("shared contract fixture validates across project, geometry, and evaluation boundaries", () => {
  assert.equal(ProjectSchema.parse(contractFixture.project).revision, 1);
  assert.equal(DrawingSchema.parse(contractFixture.drawing).selectedPage, 1);
  const floor = FloorSchema.parse(contractFixture.floor);
  const element = ArchitecturalElementSchema.parse(contractFixture.element);
  assert.ok(geometryFitsFloor(element.geometry, floor));
  EvidenceSchema.parse(contractFixture.evidence);
  MeasurementSchema.parse(contractFixture.measurement);
  assert.equal(RuleEvaluationSchema.parse(contractFixture.evaluation).status, "UNKNOWN");
});

test("project creation supports progressive metadata without inventing classification", () => {
  const project = CreateProjectRequestSchema.parse({ name: "Office" });
  assert.equal(project.jurisdiction, "RS");
  assert.equal(project.purpose, "OFFICE");
  assert.equal(project.classification, undefined);
  assert.deepEqual(UpdateProjectRequestSchema.parse({ baseRevision: 1, patch: { floorCount: 2 } }).patch, { floorCount: 2 });
  assert.deepEqual(UpdateProjectRequestSchema.parse({ baseRevision: 1, patch: { classification: null } }).patch, { classification: null });
  assert.equal(UpdateProjectRequestSchema.safeParse({ baseRevision: 1, patch: {} }).success, false);
});

test("AI estimates and wrong units cannot become verified measurements", () => {
  assert.equal(MeasurementSchema.safeParse({
    ...contractFixture.measurement, source: "AI_ESTIMATE", verification: "USER_CONFIRMED",
  }).success, false);
  assert.equal(MeasurementSchema.safeParse({
    ...contractFixture.measurement, unit: "count",
  }).success, false);
});

test("unreviewed rules cannot be marked active", () => {
  const rule = {
    id: "00000000-0000-4000-8000-000000000008",
    version: 1,
    sourceId: "00000000-0000-4000-8000-000000000009",
    sourceVersion: "unverified-example",
    provisionIds: ["00000000-0000-4000-8000-00000000000a"],
    title: "Contract-only rule",
    lifecycle: "ACTIVE",
    elementType: "CORRIDOR",
    applicability: { op: "EQ", field: "purpose", value: "OFFICE" },
    exceptionConditions: [],
    requiredInputs: ["CLEAR_WIDTH_M"],
    evaluation: { kind: "MIN", metric: "CLEAR_WIDTH_M", threshold: 1, unit: "m" },
    testFixtureIds: [],
    interpretationNotes: [],
  };
  assert.equal(ComplianceRuleSchema.safeParse(rule).success, false);
});

test("events reject unknown types and unvalidated payloads", () => {
  const envelope = {
    eventId: "00000000-0000-4000-8000-00000000000b",
    type: "geometry.measurement.missing",
    projectId: contractFixture.project.id,
    projectRevision: 1,
    correlationId: "00000000-0000-4000-8000-00000000000c",
    sessionId: "00000000-0000-4000-8000-00000000000d",
    occurredAt: "2026-10-30T12:00:00.000Z",
    payload: { elementId: contractFixture.element.id, metric: "CLEAR_WIDTH_M", reason: "Label unreadable" },
  };
  assert.equal(parseAppEvent(envelope).type, "geometry.measurement.missing");
  assert.throws(() => parseAppEvent({ ...envelope, type: "fake.progress" }));
  assert.throws(() => parseAppEvent({ ...envelope, payload: { ...envelope.payload, metric: "SPEED" } }));
});

test("hypothetical recheck requires a valid dimension and base revision", () => {
  const input = { baseRevision: 1, elementId: contractFixture.element.id, metric: "CLEAR_WIDTH_M", proposedValue: 1.3, unit: "m" };
  assert.equal(RecheckRequestSchema.parse(input).baseRevision, 1);
  assert.equal(RecheckRequestSchema.safeParse({ ...input, proposedValue: -1 }).success, false);
});
