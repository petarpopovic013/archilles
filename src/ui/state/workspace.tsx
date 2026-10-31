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
  DrawingSettings, Geometry, Point,
  ElementType,
  Evidence,
  Metric,
  Project,
  RuleEvaluation,
  RuleRequirements,
  ReviewAnswer,
  UpdateProjectRequest,
} from "../../domain";
import { unitForMetric } from "../../domain";
import { ArchillesApiError, HttpArchillesApiClient } from "../api";

export type Selection = { kind: "finding"; id: string } | { kind: "element"; id: string };
export type PlanAction = { kind: "question"; id: string } | { kind: "element"; id: string } | { kind: "settings" } | {kind:"recheck";id:string} | {kind:"calibration"};
export type Busy = "project" | "upload" | "analysis" | "save" | "recheck";

export interface RecheckResult {
  elementId: string;
  metric: Metric;
  proposedValue: number;
  before: RuleEvaluation[];
  after: RuleEvaluation[];
}

export interface WorkspaceValue {
  planAction: PlanAction | null;
  setPlanAction(action: PlanAction | null): void;
  answerQuestion(id: string, answer: Omit<ReviewAnswer, "baseRevision">): Promise<boolean>;
  client: HttpArchillesApiClient;
  project: Project | null;
  drawing: Drawing | null;
  pageCount: number;
  page: number;
  snapshot: AnalysisSnapshot | null;
  coverage: CoverageSummary | null;
  /** Subtypes, measurements, and classifications the rule registry uses; null until loaded. */
  requirements: RuleRequirements | null;
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
  /** The project details form is open, e.g. from the "What's needed" checklist. */
  projectEditorOpen: boolean;

  select(selection: Selection | null): void;
  dismissError(): void;
  createProject(request: CreateProjectRequest): Promise<void>;
  createProjectWithDrawing(request: CreateProjectRequest, file: File): Promise<boolean>;
  updateProject(patch: UpdateProjectRequest["patch"]): Promise<void>;
  uploadDrawing(file: File): Promise<void>;
  setPage(page: number): void;
  runAnalysis(): Promise<void>;
  confirmMeasurement(elementId: string, metric: Metric, value: number): Promise<boolean>;
  confirmElement(elementId: string, change: { type?: ElementType; subtype?: string | null; geometry?: Geometry }): Promise<boolean>;
  /** One revision for several elements, e.g. the same category for every door. */
  confirmElements(updates: Array<{ elementId: string; type?: ElementType; subtype?: string | null }>): Promise<void>;
  retireElement(elementId:string):Promise<boolean>;
  createElement(type: ElementType, geometry: Geometry): Promise<boolean>;
  saveDrawingSetup(settings: DrawingSettings): Promise<boolean>;
  readGeometryAgain(): Promise<void>;
  calibrationPicking: boolean;
  calibrationPoints: Point[];
  startCalibration(): void;
  cancelCalibration(): void;
  pickCalibrationPoint(point: Point): void;
  setProjectEditorOpen(open: boolean): void;
  recheck(elementId: string, metric: Metric, proposedValue: number): Promise<void>;
  loadEvidence(ids: readonly string[]): void;
  resetWorkspace(): void;
}

const STORAGE_KEY = "archilles.workspace.v1";
const RUNNING_POLL_MS = 1_500;

const errorMessages: Record<string, string> = {
  REVISION_CONFLICT: "The project has changed. Data has been refreshed; please try again.",
  RUNTIME_UNAVAILABLE: "The analysis service is not running or is unavailable.",
  NETWORK_ERROR: "The server is unavailable.",
  FILE_TOO_LARGE: "The drawing exceeds the 20 MiB limit.",
  UNSUPPORTED_FILE_TYPE: "Only PDF, PNG and JPEG drawings are supported.",
  FILE_TYPE_MISMATCH: "The file extension does not match its contents.",
  RENDERER_UNSUPPORTED_FORMAT: "The server cannot process this drawing format yet.",
  UNRENDERABLE_PAGE: "The drawing page cannot be prepared (corrupt or protected file).",
  PAGE_LIMIT: "The drawing contains more than 20 pages.",
  INVALID_INPUT: "The supplied information is invalid.",
};

function describe(error: unknown): string {
  if (error instanceof ArchillesApiError) return errorMessages[error.code] ?? `${error.message} (${error.code})`;
  return error instanceof Error ? error.message : "An unknown error occurred.";
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
  const [requirements, setRequirements] = useState<RuleRequirements | null>(null);
  const [activity, setActivity] = useState<AgentEvent[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [evidence, setEvidence] = useState<ReadonlyMap<string, Evidence>>(new Map());
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planAction,setPlanAction]=useState<PlanAction|null>(null);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const requested = useRef(new Set<string>());
  const activeSessionId = useRef<string|null>(null);
  const [calibrationPicking, setCalibrationPicking] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);

  useEffect(() => {
    let cancelled = false;
    client.getRuleRequirements().then((value) => { if (!cancelled) setRequirements(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [client]);

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
      if (stored.sessionId) { activeSessionId.current=stored.sessionId; setSessionId(stored.sessionId); }
      return client.getCoverage(restored.id).then((value) => { if (!cancelled) setCoverage(value); });
    }).catch(() => writeStored(null));
    return () => { cancelled = true; };
  }, [client]);

  useEffect(() => {
    if (project) writeStored({ projectId: project.id, drawing: drawing ?? undefined, pageCount, page, sessionId: sessionId ?? undefined });
  }, [project, drawing, pageCount, page, sessionId]);

  const refreshSnapshot = useCallback(async (id: string) => {
    const next = await client.getAnalysis(id);
    if(activeSessionId.current !== id) return next;
    if(next.geometry?.stage==='AWAITING_CONFIRMATION' && project && drawing && next.session.status!=='RUNNING') {
      const resumed=await client.startAnalysis(project.id,{projectRevision:next.session.projectRevision,drawingId:drawing.id,page});
      if(activeSessionId.current===id){activeSessionId.current=resumed.sessionId;setActivity([]);setSessionId(resumed.sessionId);}
      return next;
    }
    setSnapshot(next);
    setCoverage(next.coverage);
    return next;
  }, [client,project,drawing,page]);

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
    setPlanAction(null); activeSessionId.current=null; setCalibrationPicking(false); setCalibrationPoints([]);
    setSessionId(null);
    setSnapshot(null);
    setActivity([]);
    setSelection(null);
    setRecheckResult(null);
  }, []);

  const followSession = useCallback((next: string) => {
    activeSessionId.current=next; setSnapshot(null);
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
    planAction, setPlanAction,
    answerQuestion: async (id, answer) => {
      let saved=false;
      await run("save",async()=>{
        if(!project||!sessionId)return;
        const result=await client.answerQuestion(sessionId,id,{baseRevision:project.revision,...answer});
        if(result.projectRevision!==project.revision)await followRevision(project.id);
        else await refreshSnapshot(sessionId);
        saved=true;setPlanAction(null);setCalibrationPicking(false);setCalibrationPoints([]);
      });
      return saved;
    },
    client,
    project,
    drawing,
    pageCount,
    page,
    snapshot,
    coverage,
    requirements,
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
    projectEditorOpen,
    setProjectEditorOpen,
    calibrationPicking, calibrationPoints,
    cancelCalibration:()=>{setCalibrationPicking(false);setCalibrationPoints([]);},
    startCalibration: () => { setCalibrationPoints([]); setCalibrationPicking(!calibrationPicking); },
    pickCalibrationPoint: (point) => { setCalibrationPoints([...calibrationPoints, point].slice(0,2)); if(calibrationPoints.length) setCalibrationPicking(false); },
    retireElement: async elementId => {let saved=false;await run("save",async()=>{
      if(!project)return;await client.retireElement(elementId,project.revision);setSelection(null);await followRevision(project.id);saved=true;
    });return saved;},
    createElement: async (type, geometry) => {
      let saved=false;await run("save",async()=>{
        if(!project || !drawing)return;
        await client.createElement(project.id,{baseRevision:project.revision,drawingId:drawing.id,page,type,geometry});saved=true;
        await followRevision(project.id);
      });return saved;
    },
    saveDrawingSetup: async (settings) => { let saved=false; await run("save", async () => {
      if(!project || !drawing) return;
      const result=await client.saveDrawingSetup(drawing.id,page,project.revision,settings);
      setProject(await client.getProject(project.id)); setSnapshot(null); setSelection(null); setRecheckResult(null);
      if(result.sessionId) followSession(result.sessionId); setCalibrationPicking(false);setCalibrationPoints([]);saved=true;
    }); return saved; },
    readGeometryAgain: () => run("analysis", async () => {
      if(!project || !drawing) return;
      const result=await client.readGeometryAgain(drawing.id,page,project.revision);
      setProject(await client.getProject(project.id)); setSnapshot(null); setSelection(null); setRecheckResult(null);
      if(result.sessionId) followSession(result.sessionId);
    }),

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

    createProjectWithDrawing: async (request, file) => {
      setBusy("upload");
      setError(null);
      try {
        const created = await client.createProject(request);
        // Keep the created project available if uploading fails, so it can be retried.
        setProject(created);
        setDrawing(null);
        setPageCount(0);
        setPageState(1);
        setCoverage(null);
        clearAnalysis();
        const { drawing: uploaded, pageCount: pages } = await client.uploadDrawing(created.id, file, {
          baseRevision: created.revision,
          selectedPage: 1,
        });
        setDrawing(uploaded);
        setPageCount(pages);
        setPageState(uploaded.selectedPage);
        const current = await client.getProject(created.id);
        setProject(current);
        setCoverage(await client.getCoverage(created.id));
        // A single page needs no choice, so the review starts right away; PDFs wait for a page.
        if (pages === 1) {
          const { sessionId: next } = await client.startAnalysis(created.id, { projectRevision: current.revision, drawingId: uploaded.id, page: uploaded.selectedPage });
          followSession(next);
        }
        return true;
      } catch (cause) {
        setError(describe(cause));
        return false;
      } finally {
        setBusy(null);
      }
    },

    updateProject: (patch) => run("save", async () => {
      if (!project) return;
      const { project: updated } = await client.updateProject(project.id, { baseRevision: project.revision, patch });
      setProject(updated);
      setProjectEditorOpen(false);
      // Answers change which rules apply; re-run from stored geometry so results follow at once.
      if (drawing && snapshot) await followRevision(updated.id);
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

    confirmMeasurement: async (elementId, metric, measured) => { let saved=false; await run("save", async () => {
      if (!project) return;
      await client.correctMeasurement(elementId, {
        baseRevision: project.revision, metric, value: measured, unit: unitForMetric(metric), evidenceIds: [],
      });
      await followRevision(project.id);saved=true;
    }); return saved; },

    confirmElement: async (elementId, change) => {
      let saved=false;await run("save",async()=>{
        if(!project)return;
        await client.updateElement(elementId,{baseRevision:project.revision,...change});saved=true;
        await followRevision(project.id);
      });return saved;
    },

    confirmElements: (updates) => run("save", async () => {
      if (!project || updates.length === 0) return;
      await client.updateElements(project.id, { baseRevision: project.revision, updates });
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
