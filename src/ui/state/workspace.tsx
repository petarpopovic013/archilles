"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AgentEvent,
  AnalysisSnapshot,
  ArchitecturalElement,
  ComplianceFinding,
  CoverageSummary,
  CreateProjectRequest,
  Drawing,
  ElementType,
  Evidence,
  Metric,
  Project,
  RuleEvaluation,
  UpdateProjectRequest,
} from "../../domain";
import { unitForMetric } from "../../domain";
import { ArchillesApiError, HttpArchillesApiClient } from "../api";

export type Selection = { kind: "finding"; id: string } | { kind: "element"; id: string };
export type Busy = "project" | "upload" | "analysis" | "save" | "recheck";

export interface RecheckResult {
  elementId: string;
  metric: Metric;
  proposedValue: number;
  before: RuleEvaluation[];
  after: RuleEvaluation[];
}

export interface WorkspaceValue {
  client: HttpArchillesApiClient;
  project: Project | null;
  drawing: Drawing | null;
  pageCount: number;
  page: number;
  snapshot: AnalysisSnapshot | null;
  coverage: CoverageSummary | null;
  activity: AgentEvent[];
  selection: Selection | null;
  selectedFinding: ComplianceFinding | null;
  selectedElement: ArchitecturalElement | null;
  evidence: ReadonlyMap<string, Evidence>;
  recheckResult: RecheckResult | null;
  busy: Busy | null;
  error: string | null;
  /** The analysis on screen was made for an older project revision. */
  analysisOutdated: boolean;

  select(selection: Selection | null): void;
  dismissError(): void;
  createProject(request: CreateProjectRequest): Promise<void>;
  updateProject(patch: UpdateProjectRequest["patch"]): Promise<void>;
  uploadDrawing(file: File): Promise<void>;
  setPage(page: number): void;
  runAnalysis(): Promise<void>;
  confirmMeasurement(elementId: string, metric: Metric, value: number): Promise<void>;
  confirmElement(elementId: string, change: { type?: ElementType; subtype?: string | null }): Promise<void>;
  recheck(elementId: string, metric: Metric, proposedValue: number): Promise<void>;
  loadEvidence(ids: readonly string[]): void;
  resetWorkspace(): void;
}

const STORAGE_KEY = "archilles.workspace.v1";
const RUNNING_POLL_MS = 1_500;

const errorMessages: Record<string, string> = {
  REVISION_CONFLICT: "Projekat je u međuvremenu izmenjen. Podaci su osveženi; pokušajte ponovo.",
  RUNTIME_UNAVAILABLE: "Servis za analizu nije pokrenut ili nije dostupan.",
  NETWORK_ERROR: "Server nije dostupan.",
  FILE_TOO_LARGE: "Crtež je veći od 20 MiB.",
  UNSUPPORTED_FILE_TYPE: "Podržani su samo PDF, PNG i JPEG crteži.",
  FILE_TYPE_MISMATCH: "Ekstenzija fajla ne odgovara njegovom sadržaju.",
  RENDERER_UNSUPPORTED_FORMAT: "Ovaj format crteža server još ne može da obradi.",
  UNRENDERABLE_PAGE: "Stranica crteža ne može da se pripremi (oštećen ili zaštićen fajl).",
  PAGE_LIMIT: "Crtež ima više od 20 stranica.",
  INVALID_INPUT: "Uneti podaci nisu ispravni.",
};

function describe(error: unknown): string {
  if (error instanceof ArchillesApiError) return errorMessages[error.code] ?? `${error.message} (${error.code})`;
  return error instanceof Error ? error.message : "Nepoznata greška.";
}

interface Stored {
  projectId: string;
  drawing?: Drawing;
  pageCount?: number;
  page?: number;
  sessionId?: string;
}

function readStored(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null): void {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Persistence is a convenience; the workspace works without it.
  }
}

const Context = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children, client: injected }: { children: ReactNode; client?: HttpArchillesApiClient }) {
  const client = useMemo(() => injected ?? new HttpArchillesApiClient(), [injected]);
  const [project, setProject] = useState<Project | null>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPageState] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null);
  const [activity, setActivity] = useState<AgentEvent[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [evidence, setEvidence] = useState<ReadonlyMap<string, Evidence>>(new Map());
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  // Restore the last project after a reload; the server remains the source of truth.
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    let cancelled = false;
    client.getProject(stored.projectId).then((restored) => {
      if (cancelled) return;
      setProject(restored);
      if (stored.drawing?.projectId === restored.id) {
        setDrawing(stored.drawing);
        setPageCount(stored.pageCount ?? stored.drawing.pageCount);
        setPageState(stored.page ?? stored.drawing.selectedPage);
      }
      if (stored.sessionId) setSessionId(stored.sessionId);
      return client.getCoverage(restored.id).then((value) => { if (!cancelled) setCoverage(value); });
    }).catch(() => writeStored(null));
    return () => { cancelled = true; };
  }, [client]);

  useEffect(() => {
    if (project) writeStored({ projectId: project.id, drawing: drawing ?? undefined, pageCount, page, sessionId: sessionId ?? undefined });
  }, [project, drawing, pageCount, page, sessionId]);

  const refreshSnapshot = useCallback(async (id: string) => {
    const next = await client.getAnalysis(id);
    setSnapshot((current) => (current && current.session.id !== id ? current : next));
    setCoverage(next.coverage);
    return next;
  }, [client]);

  // Follow the active session: stored events (with replay) drive refreshes; a slow poll only
  // catches the final status, which is not itself an event.
  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const next = await refreshSnapshot(sessionId);
        if (!stopped && next.session.status === "RUNNING") timer = setTimeout(poll, RUNNING_POLL_MS);
      } catch (cause) {
        if (!stopped) setError(describe(cause));
      }
    };
    const unsubscribe = client.subscribeToEvents(sessionId, {
      onEvent(event) {
        if (stopped) return;
        setActivity((events) => [...events, event]);
        clearTimeout(pending);
        pending = setTimeout(() => { void refreshSnapshot(sessionId).catch(() => undefined); }, 150);
      },
    });
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(pending);
      unsubscribe();
    };
  }, [client, sessionId, refreshSnapshot]);

  const run = useCallback(async (kind: Busy, task: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(describe(cause));
      if (cause instanceof ArchillesApiError && cause.code === "REVISION_CONFLICT" && project) {
        setProject(await client.getProject(project.id).catch(() => project));
      }
    } finally {
      setBusy(null);
    }
  }, [client, project]);

  const clearAnalysis = useCallback(() => {
    setSessionId(null);
    setSnapshot(null);
    setActivity([]);
    setSelection(null);
    setRecheckResult(null);
  }, []);

  const followSession = useCallback((next: string) => {
    setActivity([]);
    setSessionId(next);
  }, []);

  /** After a confirmed correction the runtime starts a follow-up session; attach to it. */
  const followRevision = useCallback(async (projectId: string) => {
    const latest = await client.getProject(projectId);
    setProject(latest);
    setRecheckResult(null);
    if (!drawing) return;
    const { sessionId: next } = await client.startAnalysis(projectId, { projectRevision: latest.revision, drawingId: drawing.id, page });
    followSession(next);
  }, [client, drawing, page, followSession]);

  const loadEvidence = useCallback((ids: readonly string[]) => {
    for (const evidenceId of ids) {
      if (requested.current.has(evidenceId)) continue;
      requested.current.add(evidenceId);
      client.getEvidence(evidenceId)
        .then((record) => setEvidence((current) => new Map(current).set(record.id, record)))
        .catch(() => requested.current.delete(evidenceId));
    }
  }, [client]);

  const value: WorkspaceValue = {
    client,
    project,
    drawing,
    pageCount,
    page,
    snapshot,
    coverage,
    activity,
    selection,
    selectedFinding: selection?.kind === "finding" ? snapshot?.findings.find((finding) => finding.id === selection.id) ?? null : null,
    selectedElement: (() => {
      const elementId = selection?.kind === "element"
        ? selection.id
        : snapshot?.findings.find((finding) => selection?.kind === "finding" && finding.id === selection.id)?.elementId;
      return snapshot?.elements.find((element) => element.id === elementId) ?? null;
    })(),
    evidence,
    recheckResult,
    busy,
    error,
    analysisOutdated: Boolean(snapshot && project && snapshot.session.projectRevision < project.revision),

    select: setSelection,
    dismissError: () => setError(null),

    createProject: (request) => run("project", async () => {
      const created = await client.createProject(request);
      setProject(created);
      setDrawing(null);
      setPageCount(0);
      setPageState(1);
      clearAnalysis();
      setCoverage(await client.getCoverage(created.id));
    }),

    updateProject: (patch) => run("save", async () => {
      if (!project) return;
      const { project: updated } = await client.updateProject(project.id, { baseRevision: project.revision, patch });
      setProject(updated);
    }),

    uploadDrawing: (file) => run("upload", async () => {
      if (!project) return;
      const { drawing: uploaded, pageCount: pages } = await client.uploadDrawing(project.id, file, { baseRevision: project.revision, selectedPage: 1 });
      setProject(await client.getProject(project.id));
      setDrawing(uploaded);
      setPageCount(pages);
      setPageState(uploaded.selectedPage);
      clearAnalysis();
    }),

    setPage: (next) => {
      setPageState(next);
      clearAnalysis();
    },

    runAnalysis: () => run("analysis", async () => {
      if (!project || !drawing) return;
      const { sessionId: next } = await client.startAnalysis(project.id, { projectRevision: project.revision, drawingId: drawing.id, page });
      setSelection(null);
      followSession(next);
    }),

    confirmMeasurement: (elementId, metric, measured) => run("save", async () => {
      if (!project) return;
      await client.correctMeasurement(elementId, {
        baseRevision: project.revision, metric, value: measured, unit: unitForMetric(metric), evidenceIds: [],
      });
      await followRevision(project.id);
    }),

    confirmElement: (elementId, change) => run("save", async () => {
      if (!project) return;
      await client.updateElement(elementId, { baseRevision: project.revision, ...change });
      await followRevision(project.id);
    }),

    recheck: (elementId, metric, proposedValue) => run("recheck", async () => {
      if (!project) return;
      const result = await client.recheck(project.id, {
        baseRevision: project.revision, elementId, metric, proposedValue, unit: unitForMetric(metric),
      });
      setRecheckResult({ elementId, metric, proposedValue, before: result.before, after: result.after });
    }),

    loadEvidence,

    resetWorkspace: () => {
      writeStored(null);
      setProject(null);
      setDrawing(null);
      setPageCount(0);
      setPageState(1);
      setCoverage(null);
      clearAnalysis();
    },
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(Context);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
