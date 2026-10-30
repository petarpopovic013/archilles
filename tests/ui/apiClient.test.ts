import assert from "node:assert/strict";
import test from "node:test";
import {
  apiClient,
  createApiClient,
  ArchillesApiError,
  ProjectSchema,
  AnalysisSnapshotSchema,
  CoverageSummarySchema,
  contractFixture,
} from "../../src/ui/api";

test("SwitchableArchillesApiClient can switch between mock and live modes", () => {
  const client = createApiClient({ mode: "mock" });
  assert.equal(client.mode, "mock");

  client.setMode("live");
  assert.equal(client.mode, "live");

  client.setMode("mock");
  assert.equal(client.mode, "mock");
});

test("Mock client creates project with progressive metadata and validates ProjectSchema", async () => {
  const client = createApiClient({ mode: "mock" });

  const project = await client.createProject({
    name: "Novi Sad Tech Park Office",
    purpose: "OFFICE",
    phase: "DESIGN",
    buildingHeightM: 12.5,
  });

  assert.equal(project.name, "Novi Sad Tech Park Office");
  assert.equal(project.jurisdiction, "RS");
  assert.equal(project.revision, 1);
  assert.equal(project.buildingHeightM, 12.5);
  assert.doesNotThrow(() => ProjectSchema.parse(project));
});

test("Mock client updates project metadata, increments revision, and guards against stale revisions", async () => {
  const client = createApiClient({ mode: "mock" });
  const project = await client.createProject({ name: "Base Project" });

  // Valid update
  const updated = await client.updateProject(project.id, {
    baseRevision: 1,
    patch: { floorCount: 3 },
  });

  assert.equal(updated.project.revision, 2);
  assert.equal(updated.project.floorCount, 3);
  assert.equal(updated.revision.revision, 2);
  assert.equal(updated.revision.kind, "METADATA");

  // Conflict on stale revision
  await assert.rejects(
    () =>
      client.updateProject(project.id, {
        baseRevision: 1, // Stale! Current is 2
        patch: { floorCount: 4 },
      }),
    (err: unknown) => {
      assert.ok(err instanceof ArchillesApiError);
      assert.equal(err.status, 409);
      assert.equal(err.code, "REVISION_CONFLICT");
      return true;
    },
  );
});

test("Mock client uploadDrawing preserves selectedPage and drawing metadata", async () => {
  const client = createApiClient({ mode: "mock" });
  const project = await client.createProject({ name: "Upload Demo" });

  const mockBlob = new Blob(["dummy content"], { type: "image/png" });
  const result = await client.uploadDrawing(project.id, mockBlob, {
    baseRevision: 1,
    selectedPage: 1,
  });

  assert.equal(result.drawing.projectId, project.id);
  assert.equal(result.drawing.selectedPage, 1);
  assert.equal(result.drawing.mimeType, "image/png");
});

test("Mock client getDrawingPageInfo returns raster/svg blob with dimensions", async () => {
  const client = createApiClient({ mode: "mock" });
  const pageInfo = await client.getDrawingPageInfo(contractFixture.drawing.id, 1);

  assert.ok(pageInfo.blob);
  assert.equal(pageInfo.widthPx, 1000);
  assert.equal(pageInfo.heightPx, 800);
  assert.ok(pageInfo.url);
});

test("Mock client getAnalysis returns full AnalysisSnapshot matching canonical schema", async () => {
  const client = createApiClient({ mode: "mock" });
  const snapshot = await client.getAnalysis("00000000-0000-4000-8000-000000000100");

  assert.doesNotThrow(() => AnalysisSnapshotSchema.parse(snapshot));
  assert.ok(snapshot.elements.length > 0);
  assert.ok(snapshot.measurements.length > 0);
  assert.ok(snapshot.evaluations.length > 0);
  assert.ok(snapshot.findings.length > 0);
  assert.equal(snapshot.findings[0].elementId, contractFixture.element.id);
});

test("Mock client correctMeasurement creates a new revision and supersedes old measurement", async () => {
  const client = createApiClient({ mode: "mock" });

  const result = await client.correctMeasurement(contractFixture.element.id, {
    baseRevision: 1,
    metric: "CLEAR_WIDTH_M",
    value: 1.25,
    unit: "m",
    evidenceIds: [contractFixture.evidence.id],
  });

  assert.equal(result.revision.revision, 2);
  assert.equal(result.revision.kind, "MEASUREMENT_CORRECTION");
  assert.equal(result.measurement.value, 1.25);
  assert.equal(result.measurement.verification, "USER_CONFIRMED");
  assert.equal(result.measurement.source, "USER_CORRECTED");
  assert.equal(result.measurement.supersedesId, contractFixture.measurement.id);

  // Stale revision check
  await assert.rejects(
    () =>
      client.correctMeasurement(contractFixture.element.id, {
        baseRevision: 1, // Stale!
        metric: "CLEAR_WIDTH_M",
        value: 1.3,
        unit: "m",
        evidenceIds: [contractFixture.evidence.id],
      }),
    (err: unknown) => {
      assert.ok(err instanceof ArchillesApiError);
      assert.equal(err.status, 409);
      return true;
    },
  );
});

test("Mock client hypothetical recheck returns before/after without mutating drawing or revision", async () => {
  const client = createApiClient({ mode: "mock" });
  const initialProject = await client.getProject(contractFixture.project.id);
  const initialRevision = initialProject.revision;

  const recheckResult = await client.recheck(contractFixture.project.id, {
    baseRevision: initialRevision,
    elementId: contractFixture.element.id,
    metric: "CLEAR_WIDTH_M",
    proposedValue: 1.35,
    unit: "m",
  });

  assert.equal(recheckResult.action.hypothetical, true);
  assert.equal(recheckResult.action.proposedValue, 1.35);
  assert.equal(recheckResult.before[0].status, "UNKNOWN");
  assert.equal(recheckResult.after[0].status, "PASS");
  assert.equal(recheckResult.after[0].observed, 1.35);

  // Check project revision was NOT mutated
  const currentProject = await client.getProject(contractFixture.project.id);
  assert.equal(currentProject.revision, initialRevision);
});

test("Mock client getCoverage returns valid CoverageSummary without global compliance score", async () => {
  const client = createApiClient({ mode: "mock" });
  const coverage = await client.getCoverage(contractFixture.project.id);

  assert.doesNotThrow(() => CoverageSummarySchema.parse(coverage));
  assert.equal(coverage.activeRules, 3);
  assert.equal(coverage.executedChecks, 1);
  assert.ok(coverage.sources.length > 0);
});

test("Mock client subscribeToEvents emits ordered AgentEvent stream with cancellation", async () => {
  const client = createApiClient({ mode: "mock" });
  const received: number[] = [];

  await new Promise<void>((resolve, reject) => {
    const unsubscribe = client.subscribeToEvents("00000000-0000-4000-8000-000000000100", {
      after: 1, // Skip sequence 1
      onEvent: (event) => {
        received.push(event.sequence);
        if (event.sequence === 3) {
          // Cancel early
          unsubscribe();
          setTimeout(() => {
            // Confirm sequence 4, 5, 6 were NOT emitted after unsubscribe
            assert.deepEqual(received, [2, 3]);
            resolve();
          }, 150);
        }
      },
      onError: reject,
    });
  });
});

test("HttpClient handles network failure with ArchillesApiError(503)", async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error("Failed to connect to 127.0.0.1:4000");
  };

  const client = createApiClient({
    mode: "live",
    baseUrl: "http://127.0.0.1:4000",
    fetchFn: mockFetch,
  });

  await assert.rejects(
    () => client.getProject("test-id"),
    (err: unknown) => {
      assert.ok(err instanceof ArchillesApiError);
      assert.equal(err.status, 503);
      assert.equal(err.code, "NETWORK_ERROR");
      assert.equal(err.retryable, true);
      return true;
    },
  );
});

test("Global singleton apiClient works out of the box", async () => {
  assert.ok(apiClient);
  const project = await apiClient.getProject(contractFixture.project.id);
  assert.equal(project.id, contractFixture.project.id);
});
