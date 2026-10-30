import type {
  ArchillesApiClient,
  ApiClientConfig,
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
} from "./types";
import { MockArchillesApiClient } from "./mockClient";
import { HttpArchillesApiClient } from "./httpClient";

/**
 * Switchable API client that allows seamless toggling between
 * contract-based mock data (`contractFixture`) and live backend API/SSE.
 */
export class SwitchableArchillesApiClient implements ArchillesApiClient {
  private _mode: ApiClientMode;
  readonly mockClient: MockArchillesApiClient;
  readonly httpClient: HttpArchillesApiClient;

  constructor(config: ApiClientConfig = {}) {
    const envMode =
      typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_MODE === "live"
        ? "live"
        : "mock";

    this._mode = config.mode ?? envMode;
    this.mockClient = new MockArchillesApiClient();
    this.httpClient = new HttpArchillesApiClient(config);
  }

  get mode(): ApiClientMode {
    return this._mode;
  }

  setMode(mode: ApiClientMode): void {
    this._mode = mode;
    this.mockClient.setMode(mode);
    this.httpClient.setMode(mode);
  }

  get active(): ArchillesApiClient {
    return this._mode === "live" ? this.httpClient : this.mockClient;
  }

  /** Load a mock plan fixture ("plan-1" or "plan-2") */
  loadPlanFixture(planId: "plan-1" | "plan-2") {
    return this.mockClient.loadPlanFixture(planId);
  }

  get activePlanId(): "plan-1" | "plan-2" {
    return this.mockClient.activePlanId;
  }

  createProject(request: CreateProjectRequest): Promise<Project> {
    return this.active.createProject(request);
  }

  getProject(projectId: string): Promise<Project> {
    return this.active.getProject(projectId);
  }

  updateProject(projectId: string, request: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    return this.active.updateProject(projectId, request);
  }

  uploadDrawing(
    projectId: string,
    file: File | Blob,
    metadata: UploadDrawingMetadata,
  ): Promise<UploadDrawingResponse> {
    return this.active.uploadDrawing(projectId, file, metadata);
  }

  getDrawingPageUrl(drawingId: string, page: number): string {
    return this.active.getDrawingPageUrl(drawingId, page);
  }

  getDrawingPageBlob(drawingId: string, page: number): Promise<Blob> {
    return this.active.getDrawingPageBlob(drawingId, page);
  }

  getDrawingPageInfo(drawingId: string, page: number): Promise<DrawingPageInfo> {
    return this.active.getDrawingPageInfo(drawingId, page);
  }

  startAnalysis(projectId: string, request: StartAnalysisRequest): Promise<StartAnalysisResponse> {
    return this.active.startAnalysis(projectId, request);
  }

  getAnalysis(sessionId: string): Promise<AnalysisSnapshot> {
    return this.active.getAnalysis(sessionId);
  }

  getEvidence(evidenceId: string): Promise<Evidence | undefined> {
    return this.active.getEvidence(evidenceId);
  }

  correctMeasurement(
    elementId: string,
    request: MeasurementCorrectionRequest,
  ): Promise<MeasurementCorrectionResponse> {
    return this.active.correctMeasurement(elementId, request);
  }

  recheck(projectId: string, request: RecheckRequest): Promise<RecheckResponse> {
    return this.active.recheck(projectId, request);
  }

  getCoverage(projectId: string): Promise<CoverageSummary> {
    return this.active.getCoverage(projectId);
  }

  subscribeToEvents(sessionId: string, options: EventStreamOptions): () => void {
    return this.active.subscribeToEvents(sessionId, options);
  }
}

/** Factory function to create an API client */
export function createApiClient(config?: ApiClientConfig): SwitchableArchillesApiClient {
  return new SwitchableArchillesApiClient(config);
}

/** Default singleton instance used across the UI workspace */
export const apiClient: SwitchableArchillesApiClient = createApiClient();

/** Helper to switch global client mode at runtime */
export function setApiClientMode(mode: ApiClientMode): void {
  apiClient.setMode(mode);
}
