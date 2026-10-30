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
  ApiError,
} from "./types";
import {
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
  ApiErrorSchema,
} from "./types";
import { ArchillesApiError } from "./errors";

export class HttpArchillesApiClient implements ArchillesApiClient {
  readonly mode: ApiClientMode = "live";
  private _mode: ApiClientMode = "live";
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl?.replace(/\/+$/, "") ?? "";
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  setMode(mode: ApiClientMode): void {
    this._mode = mode;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    parser?: (val: unknown) => T,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await this.fetchFn(url, init);
    } catch (networkError) {
      throw new ArchillesApiError(503, {
        code: "NETWORK_ERROR",
        message: networkError instanceof Error ? networkError.message : "Network request failed",
        retryable: true,
      });
    }

    if (!response.ok) {
      let apiError: ApiError;
      try {
        const json = await response.json();
        const parsed = ApiErrorSchema.safeParse(json);
        if (parsed.success) {
          apiError = parsed.data;
        } else {
          apiError = {
            code: `HTTP_${response.status}`,
            message: response.statusText || "Request failed",
            retryable: response.status >= 500,
          };
        }
      } catch {
        apiError = {
          code: `HTTP_${response.status}`,
          message: response.statusText || "Request failed",
          retryable: response.status >= 500,
        };
      }

      throw new ArchillesApiError(response.status, apiError);
    }

    const json = await response.json();
    return parser ? parser(json) : (json as T);
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    const validated = CreateProjectRequestSchema.parse(request);
    return this.request(
      "/api/projects",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
      (data) => ProjectSchema.parse(data),
    );
  }

  async getProject(projectId: string): Promise<Project> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}`,
      { method: "GET" },
      (data) => ProjectSchema.parse(data),
    );
  }

  async updateProject(
    projectId: string,
    request: UpdateProjectRequest,
  ): Promise<UpdateProjectResponse> {
    const validated = UpdateProjectRequestSchema.parse(request);
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
      (data) => UpdateProjectResponseSchema.parse(data),
    );
  }

  async uploadDrawing(
    projectId: string,
    file: File | Blob,
    metadata: UploadDrawingMetadata,
  ): Promise<UploadDrawingResponse> {
    const meta = UploadDrawingMetadataSchema.parse(metadata);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("baseRevision", String(meta.baseRevision));
    formData.append("selectedPage", String(meta.selectedPage ?? 1));

    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/drawings`,
      {
        method: "POST",
        body: formData,
      },
      (data) => UploadDrawingResponseSchema.parse(data),
    );
  }

  getDrawingPageUrl(drawingId: string, page: number): string {
    return `${this.baseUrl}/api/drawings/${encodeURIComponent(drawingId)}/pages/${encodeURIComponent(page)}`;
  }

  async getDrawingPageBlob(drawingId: string, page: number): Promise<Blob> {
    const url = this.getDrawingPageUrl(drawingId, page);
    let response: Response;

    try {
      response = await this.fetchFn(url, { method: "GET" });
    } catch (networkError) {
      throw new ArchillesApiError(503, {
        code: "NETWORK_ERROR",
        message: networkError instanceof Error ? networkError.message : "Failed to load drawing page",
        retryable: true,
      });
    }

    if (!response.ok) {
      throw new ArchillesApiError(response.status, {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Drawing page not found",
        retryable: response.status >= 500,
      });
    }

    return response.blob();
  }

  async getDrawingPageInfo(drawingId: string, page: number): Promise<DrawingPageInfo> {
    const blob = await this.getDrawingPageBlob(drawingId, page);
    const url =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(blob)
        : this.getDrawingPageUrl(drawingId, page);

    // In browser context, can load dimensions from natural image size
    return new Promise<DrawingPageInfo>((resolve) => {
      if (typeof Image !== "undefined" && blob.type.startsWith("image/")) {
        const img = new Image();
        img.onload = () => {
          resolve({
            blob,
            url,
            widthPx: img.naturalWidth || 1000,
            heightPx: img.naturalHeight || 800,
          });
        };
        img.onerror = () => {
          resolve({
            blob,
            url,
            widthPx: 1000,
            heightPx: 800,
          });
        };
        img.src = url;
      } else {
        resolve({
          blob,
          url,
          widthPx: 1000,
          heightPx: 800,
        });
      }
    });
  }

  async startAnalysis(
    projectId: string,
    request: StartAnalysisRequest,
  ): Promise<StartAnalysisResponse> {
    const validated = StartAnalysisRequestSchema.parse(request);
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/analyses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
      (data) => StartAnalysisResponseSchema.parse(data),
    );
  }

  async getAnalysis(sessionId: string): Promise<AnalysisSnapshot> {
    return this.request(
      `/api/analyses/${encodeURIComponent(sessionId)}`,
      { method: "GET" },
      (data) => AnalysisSnapshotSchema.parse(data),
    );
  }

  async getEvidence(evidenceId: string): Promise<Evidence | undefined> {
    try {
      return await this.request(
        `/api/evidence/${encodeURIComponent(evidenceId)}`,
        { method: "GET" },
      );
    } catch {
      return undefined;
    }
  }

  async correctMeasurement(
    elementId: string,
    request: MeasurementCorrectionRequest,
  ): Promise<MeasurementCorrectionResponse> {
    const validated = MeasurementCorrectionRequestSchema.parse(request);
    return this.request(
      `/api/elements/${encodeURIComponent(elementId)}/measurements`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
      (data) => MeasurementCorrectionResponseSchema.parse(data),
    );
  }

  async recheck(projectId: string, request: RecheckRequest): Promise<RecheckResponse> {
    const validated = RecheckRequestSchema.parse(request);
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/rechecks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      },
      (data) => RecheckResponseSchema.parse(data),
    );
  }

  async getCoverage(projectId: string): Promise<CoverageSummary> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/coverage`,
      { method: "GET" },
      (data) => CoverageSummarySchema.parse(data),
    );
  }

  subscribeToEvents(sessionId: string, options: EventStreamOptions): () => void {
    let lastSequence = options.after ?? 0;
    let isClosed = false;

    // Use native EventSource when running in the browser
    if (typeof EventSource !== "undefined") {
      const url = `${this.baseUrl}/api/analyses/${encodeURIComponent(sessionId)}/events?after=${encodeURIComponent(lastSequence)}`;
      const eventSource = new EventSource(url);

      eventSource.onmessage = (msgEvent) => {
        if (isClosed) return;
        try {
          const raw = JSON.parse(msgEvent.data);
          const event = AgentEventSchema.parse(raw);
          if (event.sequence <= lastSequence) {
            return; // Ignore duplicate sequences
          }
          lastSequence = event.sequence;
          options.onEvent(event);
        } catch (err) {
          options.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      };

      eventSource.onerror = () => {
        if (isClosed) return;
        options.onError?.(new Error("SSE EventSource connection error"));
      };

      return () => {
        isClosed = true;
        eventSource.close();
      };
    }

    // Fallback: fetch with streaming body (Node/SSR/Environments without native EventSource)
    const abortController = new AbortController();
    const url = `${this.baseUrl}/api/analyses/${encodeURIComponent(sessionId)}/events?after=${encodeURIComponent(lastSequence)}`;

    (async () => {
      try {
        const response = await this.fetchFn(url, {
          signal: abortController.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!response.ok || !response.body) {
          options.onError?.(new Error(`Failed to stream events: HTTP ${response.status}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isClosed) {
          const { done, value } = await reader.read();
          if (done) {
            options.onComplete?.();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith("data:")) {
              const dataStr = line.slice(5).trim();
              if (dataStr) {
                const raw = JSON.parse(dataStr);
                const event = AgentEventSchema.parse(raw);
                if (event.sequence > lastSequence) {
                  lastSequence = event.sequence;
                  options.onEvent(event);
                }
              }
            }
          }
        }
      } catch (err: unknown) {
        if (!isClosed && (err as { name?: string })?.name !== "AbortError") {
          options.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      isClosed = true;
      abortController.abort();
    };
  }
}
