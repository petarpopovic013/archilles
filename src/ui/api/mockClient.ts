import type {
  ArchillesApiClient,
  ApiClientMode,
  CreateProjectRequest,
  Project,
  UpdateProjectRequest,
  UpdateProjectResponse,
  UploadDrawingMetadata,
  UploadDrawingResponse,
  DrawingPageInfo,
  StartAnalysisRequest,
  StartAnalysisResponse,
  AnalysisSnapshot,
  Evidence,
  MeasurementCorrectionRequest,
  MeasurementCorrectionResponse,
  RecheckRequest,
  RecheckResponse,
  CoverageSummary,
  EventStreamOptions,
  Drawing,
  Floor,
  ArchitecturalElement,
  Measurement,
  RuleEvaluation,
  ComplianceFinding,
  AnalysisSession,
  AgentEvent,
  ProjectRevision,
  ReviewAction,
} from "./types";
import {
  IdSchema,
  CreateProjectRequestSchema,
  ProjectSchema,
  UpdateProjectRequestSchema,
  UpdateProjectResponseSchema,
  UploadDrawingMetadataSchema,
  UploadDrawingResponseSchema,
  StartAnalysisRequestSchema,
  StartAnalysisResponseSchema,
  AnalysisSnapshotSchema,
  MeasurementCorrectionRequestSchema,
  MeasurementCorrectionResponseSchema,
  RecheckRequestSchema,
  RecheckResponseSchema,
  CoverageSummarySchema,
  AgentEventSchema,
  contractFixture,
} from "./types";
import { ArchillesApiError } from "./errors";
import { plan1Fixture, plan2Fixture, type PlanFixtureData } from "./mockData";

/** Helper to generate compliant UTC timestamps */
function nowUtc(): string {
  return new Date().toISOString();
}

/** Helper to generate valid mock UUIDs */
function mockUuid(suffix: number): string {
  const hex = suffix.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

export class MockArchillesApiClient implements ArchillesApiClient {
  readonly mode: ApiClientMode = "mock";
  private _mode: ApiClientMode = "mock";

  // In-memory mock state initialized from canonical contractFixture
  private currentPlanId: "plan-1" | "plan-2" = "plan-1";
  private project!: Project;
  private drawing!: Drawing;
  private floor!: Floor;
  private elements!: ArchitecturalElement[];
  private evidence!: Evidence[];
  private measurements!: Measurement[];
  private evaluations!: RuleEvaluation[];
  private findings!: ComplianceFinding[];
  private coverage!: CoverageSummary;
  private session!: AnalysisSession;
  private nextEventSequence = 1;

  constructor() {
    this.reset();
  }

  setMode(mode: ApiClientMode): void {
    this._mode = mode;
  }

  /** Load a specific test plan fixture ("plan-1" or "plan-2") */
  loadPlanFixture(planId: "plan-1" | "plan-2"): PlanFixtureData {
    this.currentPlanId = planId;
    const fixture = planId === "plan-2" ? plan2Fixture : plan1Fixture;
    this.project = { ...fixture.project };
    this.drawing = { ...fixture.drawing };
    this.floor = { ...fixture.floor };
    this.elements = fixture.elements.map((e) => ({ ...e }));
    this.evidence = fixture.evidence.map((ev) => ({ ...ev }));
    this.measurements = fixture.measurements.map((m) => ({ ...m }));
    this.evaluations = fixture.evaluations.map((ev) => ({ ...ev }));
    this.findings = fixture.findings.map((f) => ({ ...f }));
    this.coverage = { ...fixture.coverage };
    this.session = { ...fixture.session };
    this.nextEventSequence = 1;
    return fixture;
  }

  /** Get active mock plan ID */
  get activePlanId(): "plan-1" | "plan-2" {
    return this.currentPlanId;
  }

  /** Reset mock state to clean contractFixture baseline (Plan 1) */
  reset(): void {
    this.loadPlanFixture("plan-1");
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    const validated = CreateProjectRequestSchema.parse(request);
    const now = nowUtc();
    const newProject: Project = {
      id: mockUuid(10 + Math.floor(Math.random() * 1000)),
      name: validated.name,
      jurisdiction: validated.jurisdiction ?? "RS",
      municipality: validated.municipality,
      purpose: validated.purpose ?? "OFFICE",
      classification: validated.classification,
      phase: validated.phase ?? "CONCEPT",
      buildingHeightM: validated.buildingHeightM,
      floorCount: validated.floorCount,
      occupantCount: validated.occupantCount,
      characteristics: validated.characteristics ?? {},
      revision: 1,
      analysisStatus: "DRAFT",
      createdAt: now,
      updatedAt: now,
    };

    this.project = ProjectSchema.parse(newProject);
    return this.project;
  }

  async getProject(projectId: string): Promise<Project> {
    if (projectId === plan2Fixture.project.id && this.currentPlanId !== "plan-2") {
      this.loadPlanFixture("plan-2");
    } else if (projectId === plan1Fixture.project.id && this.currentPlanId !== "plan-1") {
      this.loadPlanFixture("plan-1");
    } else if (this.project.id !== projectId && projectId !== contractFixture.project.id) {
      this.project = { ...this.project, id: projectId };
    }
    return ProjectSchema.parse(this.project);
  }

  async updateProject(
    projectId: string,
    request: UpdateProjectRequest,
  ): Promise<UpdateProjectResponse> {
    const validated = UpdateProjectRequestSchema.parse(request);
    if (validated.baseRevision !== this.project.revision) {
      throw new ArchillesApiError(409, {
        code: "REVISION_CONFLICT",
        message: `Base revision ${validated.baseRevision} is stale. Current revision is ${this.project.revision}.`,
        retryable: false,
      });
    }

    const now = nowUtc();
    const nextRevision = this.project.revision + 1;
    const patch = validated.patch;

    const updatedProject: Project = {
      ...this.project,
      revision: nextRevision,
      name: patch.name ?? this.project.name,
      municipality: patch.municipality === null ? undefined : (patch.municipality ?? this.project.municipality),
      purpose: patch.purpose ?? this.project.purpose,
      classification: patch.classification === null ? undefined : (patch.classification ?? this.project.classification),
      phase: patch.phase ?? this.project.phase,
      buildingHeightM: patch.buildingHeightM === null ? undefined : (patch.buildingHeightM ?? this.project.buildingHeightM),
      floorCount: patch.floorCount === null ? undefined : (patch.floorCount ?? this.project.floorCount),
      occupantCount: patch.occupantCount === null ? undefined : (patch.occupantCount ?? this.project.occupantCount),
      characteristics: {
        ...this.project.characteristics,
        ...(patch.characteristics as Record<string, boolean | undefined>),
      },
      updatedAt: now,
    };

    const revision: ProjectRevision = {
      projectId: this.project.id,
      revision: nextRevision,
      parentRevision: this.project.revision,
      kind: "METADATA",
      changedEntityIds: [this.project.id],
      createdBy: "mock-user",
      createdAt: now,
    };

    this.project = ProjectSchema.parse(updatedProject);
    const response: UpdateProjectResponse = {
      project: this.project,
      revision,
    };
    return UpdateProjectResponseSchema.parse(response);
  }

  async uploadDrawing(
    projectId: string,
    file: File | Blob,
    metadata: UploadDrawingMetadata,
  ): Promise<UploadDrawingResponse> {
    const meta = UploadDrawingMetadataSchema.parse(metadata);
    const now = nowUtc();
    const originalName =
      typeof File !== "undefined" && file instanceof File ? file.name : "uploaded-drawing.png";

    const mimeType =
      file.type === "application/pdf"
        ? "application/pdf"
        : file.type === "image/jpeg"
        ? "image/jpeg"
        : "image/png";

    const drawing: Drawing = {
      id: mockUuid(50),
      projectId,
      revision: meta.baseRevision,
      originalName,
      mimeType,
      sha256: "b".repeat(64),
      storageKey: `uploads/${projectId}/${originalName}`,
      byteSize: file.size || 2048,
      pageCount: 1,
      selectedPage: meta.selectedPage ?? 1,
      uploadedAt: now,
    };

    this.drawing = drawing;
    const response: UploadDrawingResponse = {
      drawing,
      pageCount: 1,
    };
    return UploadDrawingResponseSchema.parse(response);
  }

  getDrawingPageUrl(drawingId: string, page: number): string {
    return `/api/drawings/${encodeURIComponent(drawingId)}/pages/${encodeURIComponent(page)}`;
  }

  async getDrawingPageBlob(drawingId: string, page: number): Promise<Blob> {
    void drawingId;
    void page;
    const svg =
      this.currentPlanId === "plan-2"
        ? `
      <svg xmlns="http://www.w3.org/2000/svg" width="${this.floor.imageWidthPx}" height="${this.floor.imageHeightPx}" viewBox="0 0 ${this.floor.imageWidthPx} ${this.floor.imageHeightPx}">
        <rect width="100%" height="100%" fill="#0f172a" />
        <defs>
          <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid2)" />
        <!-- R1: Pristupna rampa (FAIL) -->
        <rect x="120" y="350" width="380" height="110" fill="#ef444425" stroke="#ef4444" stroke-width="2" rx="4" />
        <text x="140" y="415" font-family="sans-serif" font-size="14" font-weight="bold" fill="#f87171">R1: Pristupna rampa (nagib 9.0% - FAIL)</text>
        <!-- V-01: Ulazna vrata (NEEDS_REVIEW) -->
        <rect x="550" y="350" width="100" height="50" fill="#f59e0b25" stroke="#f59e0b" stroke-width="2" rx="4" />
        <text x="555" y="380" font-family="sans-serif" font-size="11" font-weight="bold" fill="#fbbf24">V-01 (0.85m)</text>
        <!-- K-01: Glavni koridor (PASS) -->
        <rect x="680" y="200" width="400" height="180" fill="#10b98125" stroke="#10b981" stroke-width="2" rx="4" />
        <text x="700" y="295" font-family="sans-serif" font-size="14" font-weight="bold" fill="#34d399">K-01: Evakuacioni koridor (1.40m - PASS)</text>
      </svg>
    `.trim()
        : `
      <svg xmlns="http://www.w3.org/2000/svg" width="${this.floor.imageWidthPx}" height="${this.floor.imageHeightPx}" viewBox="0 0 ${this.floor.imageWidthPx} ${this.floor.imageHeightPx}">
        <rect width="100%" height="100%" fill="#0f172a" />
        <defs>
          <pattern id="grid1" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid1)" />
        <rect x="100" y="120" width="300" height="80" fill="#eab30825" stroke="#eab308" stroke-width="2" rx="4" />
        <text x="120" y="165" font-family="sans-serif" font-size="14" font-weight="bold" fill="#facc15">Evakuacioni koridor (1.05m - UNKNOWN)</text>
      </svg>
    `.trim();

    return new Blob([svg], { type: "image/svg+xml" });
  }

  async getDrawingPageInfo(drawingId: string, page: number): Promise<DrawingPageInfo> {
    const blob = await this.getDrawingPageBlob(drawingId, page);
    const url =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(blob)
        : this.getDrawingPageUrl(drawingId, page);

    return {
      blob,
      url,
      widthPx: this.floor.imageWidthPx,
      heightPx: this.floor.imageHeightPx,
      levelLabel: this.floor.levelLabel,
    };
  }

  async startAnalysis(
    projectId: string,
    request: StartAnalysisRequest,
  ): Promise<StartAnalysisResponse> {
    const validated = StartAnalysisRequestSchema.parse(request);
    const newSessionId = mockUuid(100 + Math.floor(Math.random() * 500));
    const now = nowUtc();

    this.session = {
      id: newSessionId,
      projectId,
      projectRevision: validated.projectRevision,
      status: "RUNNING",
      selectedRuleIds: [contractFixture.evaluation.ruleId],
      agentRunIds: [mockUuid(200)],
      startedAt: now,
    };

    const response: StartAnalysisResponse = {
      sessionId: newSessionId,
      status: "RUNNING",
    };
    return StartAnalysisResponseSchema.parse(response);
  }

  async getAnalysis(sessionId: string): Promise<AnalysisSnapshot> {
    const snapshot: AnalysisSnapshot = {
      session: {
        ...this.session,
        id: sessionId,
      },
      elements: this.elements,
      measurements: this.measurements,
      evaluations: this.evaluations,
      findings: this.findings,
      coverage: this.coverage,
    };

    return AnalysisSnapshotSchema.parse(snapshot);
  }

  async getEvidence(evidenceId: string): Promise<Evidence | undefined> {
    return this.evidence.find((item) => item.id === evidenceId);
  }

  async correctMeasurement(
    elementId: string,
    request: MeasurementCorrectionRequest,
  ): Promise<MeasurementCorrectionResponse> {
    const validated = MeasurementCorrectionRequestSchema.parse(request);

    if (validated.baseRevision !== this.project.revision) {
      throw new ArchillesApiError(409, {
        code: "REVISION_CONFLICT",
        message: `Base revision ${validated.baseRevision} is stale. Current revision is ${this.project.revision}.`,
        retryable: false,
      });
    }

    const now = nowUtc();
    const nextRevision = this.project.revision + 1;
    const newMeasurementId = mockUuid(60 + nextRevision);
    const existingMeasurement = this.measurements.find((m) => m.elementId === elementId);

    const newMeasurement: Measurement = {
      id: newMeasurementId,
      projectId: this.project.id,
      elementId,
      revision: nextRevision,
      metric: validated.metric,
      value: validated.value,
      unit: validated.unit,
      originalValue: validated.value,
      originalUnit: validated.unit,
      source: "USER_CORRECTED",
      verification: "USER_CONFIRMED",
      evidenceIds: validated.evidenceIds,
      supersedesId: existingMeasurement?.id,
      recordedBy: "architect-ui",
      recordedAt: now,
    };

    const revision: ProjectRevision = {
      projectId: this.project.id,
      revision: nextRevision,
      parentRevision: this.project.revision,
      kind: "MEASUREMENT_CORRECTION",
      changedEntityIds: [newMeasurementId],
      createdBy: "architect-ui",
      createdAt: now,
    };

    // Update mock state
    this.project = {
      ...this.project,
      revision: nextRevision,
      updatedAt: now,
    };
    this.measurements = [
      ...this.measurements.filter((m) => m.id !== existingMeasurement?.id),
      newMeasurement,
    ];

    const response: MeasurementCorrectionResponse = {
      revision,
      measurement: newMeasurement,
    };
    return MeasurementCorrectionResponseSchema.parse(response);
  }

  async recheck(projectId: string, request: RecheckRequest): Promise<RecheckResponse> {
    const validated = RecheckRequestSchema.parse(request);
    const now = nowUtc();

    const beforeEvaluation = this.evaluations.find((e) => e.elementId === validated.elementId) ??
      this.evaluations[0];

    // Deterministic hypothetical evaluation logic for demo
    const threshold = 1.2;
    const isPass = validated.proposedValue >= threshold;
    const afterEvaluation: RuleEvaluation = {
      id: mockUuid(70 + Math.floor(Math.random() * 500)),
      projectId,
      projectRevision: validated.baseRevision,
      ruleId: beforeEvaluation.ruleId,
      ruleVersion: beforeEvaluation.ruleVersion,
      elementId: validated.elementId,
      status: isPass ? "PASS" : "FAIL",
      required: threshold,
      observed: validated.proposedValue,
      unit: validated.unit,
      evidenceIds: beforeEvaluation.evidenceIds,
      missingInputs: [],
      reasonCode: isPass ? "HYPOTHETICAL_WIDTH_PASS" : "HYPOTHETICAL_WIDTH_FAIL",
      evaluatedAt: now,
    };

    const action: ReviewAction = {
      id: mockUuid(80 + Math.floor(Math.random() * 500)),
      projectId,
      baseRevision: validated.baseRevision,
      elementId: validated.elementId,
      metric: validated.metric,
      previousMeasurementId: this.measurements.find((m) => m.elementId === validated.elementId)?.id,
      proposedValue: validated.proposedValue,
      unit: validated.unit,
      outcome: [afterEvaluation],
      hypothetical: true,
      createdAt: now,
    };

    const response: RecheckResponse = {
      action,
      before: [beforeEvaluation],
      after: [afterEvaluation],
    };

    return RecheckResponseSchema.parse(response);
  }

  async getCoverage(projectId: string): Promise<CoverageSummary> {
    const summary: CoverageSummary = {
      ...this.coverage,
      projectId,
      projectRevision: this.project.revision,
    };
    return CoverageSummarySchema.parse(summary);
  }

  subscribeToEvents(sessionId: string, options: EventStreamOptions): () => void {
    let isCancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const validSessionId = IdSchema.safeParse(sessionId).success ? sessionId : this.session.id;

    // Realistic sequence of agent events
    const mockEvents: AgentEvent[] = [
      {
        id: mockUuid(101),
        sessionId: validSessionId,
        projectRevision: this.project.revision,
        sequence: 1,
        type: "analysis.started",
        producerId: mockUuid(201),
        payload: {
          drawingId: this.drawing.id,
          page: 1,
          ruleSetVersion: "2026.10",
        },
        occurredAt: nowUtc(),
      },
      {
        id: mockUuid(102),
        sessionId: validSessionId,
        projectRevision: this.project.revision,
        sequence: 2,
        type: "geometry.extraction.started",
        producerId: mockUuid(202),
        payload: {
          agentRunId: mockUuid(202),
          cacheKey: `cache-${this.drawing.sha256}-page1`,
        },
        occurredAt: nowUtc(),
      },
      {
        id: mockUuid(103),
        sessionId: validSessionId,
        projectRevision: this.project.revision,
        sequence: 3,
        type: "geometry.extraction.completed",
        producerId: mockUuid(202),
        payload: {
          elementIds: this.elements.map((e) => e.id),
          measurementIds: this.measurements.map((m) => m.id),
          evidenceIds: this.evidence.map((e) => e.id),
        },
        occurredAt: nowUtc(),
      },
      {
        id: mockUuid(104),
        sessionId: validSessionId,
        projectRevision: this.project.revision,
        sequence: 4,
        type: "regulation.rules.selected",
        producerId: mockUuid(203),
        payload: {
          ruleIds: [contractFixture.evaluation.ruleId],
          explanations: {
            [contractFixture.evaluation.ruleId]:
              "Pravilnik 22/2019-3, član 31: evakuacioni koridor",
          },
          missingContext: ["OCCUPANT_COUNT"],
        },
        occurredAt: nowUtc(),
      },
      {
        id: mockUuid(105),
        sessionId: validSessionId,
        projectRevision: this.project.revision,
        sequence: 5,
        type: "rule.evaluation.completed",
        producerId: mockUuid(204),
        payload: {
          evaluationIds: this.evaluations.map((e) => e.id),
          statusCounts: { UNKNOWN: 1 },
        },
        occurredAt: nowUtc(),
      },
      {
        id: mockUuid(106),
        sessionId: validSessionId,
        projectRevision: this.project.revision,
        sequence: 6,
        type: "review.finding.created",
        producerId: mockUuid(205),
        payload: {
          findingId: this.findings[0]?.id ?? mockUuid(30),
          evaluationId: contractFixture.evaluation.id,
        },
        occurredAt: nowUtc(),
      },
    ];

    const after = options.after ?? 0;
    const filteredEvents = mockEvents.filter((event) => event.sequence > after);

    filteredEvents.forEach((event, index) => {
      const timer = setTimeout(() => {
        if (isCancelled) return;
        try {
          const validated = AgentEventSchema.parse(event);
          options.onEvent(validated);

          if (index === filteredEvents.length - 1) {
            options.onComplete?.();
          }
        } catch (err) {
          options.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }, (index + 1) * 60);

      timers.push(timer);
    });

    return () => {
      isCancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }
}
