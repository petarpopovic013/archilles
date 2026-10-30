"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import type {
  Project,
  Drawing,
  ArchitecturalElement,
  Measurement,
  RuleEvaluation,
  ComplianceFinding,
  CoverageSummary,
  AnalysisSession,
  ApiClientMode,
} from "../api";
import { apiClient, plan1Fixture, plan2Fixture } from "../api";

export interface WorkspaceContextValue {
  mode: ApiClientMode;
  setMode: (mode: ApiClientMode) => void;
  activePlanId: "plan-1" | "plan-2";
  selectPlan: (planId: "plan-1" | "plan-2") => Promise<void>;

  project: Project | null;
  drawing: Drawing | null;
  selectedPage: number;
  setSelectedPage: (page: number) => void;
  pageCount: number;

  elements: ArchitecturalElement[];
  measurements: Measurement[];
  evaluations: RuleEvaluation[];
  findings: ComplianceFinding[];
  coverage: CoverageSummary | null;
  session: AnalysisSession | null;

  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
  selectedFindingId: string | null;
  setSelectedFindingId: (id: string | null) => void;

  selectedElement: ArchitecturalElement | null;
  selectedFinding: ComplianceFinding | null;
  selectedMeasurements: Measurement[];

  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  clearError: () => void;

  runAnalysis: () => Promise<void>;
  uploadDrawing: (file: File) => Promise<void>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const initial = apiClient.mode === "mock" ? plan1Fixture : null;
  const [mode, setModeState] = useState<ApiClientMode>(() => apiClient.mode);
  const [activePlanId, setActivePlanId] = useState<"plan-1" | "plan-2">("plan-1");

  // Mock mode starts from fixtures; live mode starts with an empty workspace.
  const [project, setProject] = useState<Project | null>(() => initial?.project ?? null);
  const [drawing, setDrawing] = useState<Drawing | null>(() => initial?.drawing ?? null);
  const [selectedPage, setSelectedPage] = useState<number>(() => initial?.drawing.selectedPage ?? 1);
  const [pageCount, setPageCount] = useState<number>(() => initial?.drawing.pageCount ?? 0);

  const [elements, setElements] = useState<ArchitecturalElement[]>(() => initial?.elements ?? []);
  const [measurements, setMeasurements] = useState<Measurement[]>(() => initial?.measurements ?? []);
  const [evaluations, setEvaluations] = useState<RuleEvaluation[]>(() => initial?.evaluations ?? []);
  const [findings, setFindings] = useState<ComplianceFinding[]>(() => initial?.findings ?? []);
  const [coverage, setCoverage] = useState<CoverageSummary | null>(() => initial?.coverage ?? null);
  const [session, setSession] = useState<AnalysisSession | null>(() => initial?.session ?? null);

  const [selectedElementId, setSelectedElementIdState] = useState<string | null>(
    () => initial?.elements[0]?.id ?? null,
  );
  const [selectedFindingId, setSelectedFindingIdState] = useState<string | null>(
    () => initial?.findings[0]?.id ?? null,
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const operation = useRef(0);
  useEffect(() => () => { operation.current++; }, []);

  const clearError = useCallback(() => setError(null), []);

  const setMode = useCallback(
    (newMode: ApiClientMode) => {
      if (newMode === apiClient.mode) return;
      apiClient.setMode(newMode);
      setModeState(newMode);

      operation.current++;
      setIsLoading(false);
      setIsAnalyzing(false);
      setError(null);
      if (newMode === "live") {
        setProject(null); setDrawing(null); setSelectedPage(1); setPageCount(0);
        setSession(null); setElements([]); setMeasurements([]); setEvaluations([]);
        setFindings([]); setCoverage(null); setSelectedElementIdState(null); setSelectedFindingIdState(null);
      } else {
        const fixture = activePlanId === "plan-2" ? plan2Fixture : plan1Fixture;
        setProject(fixture.project);
        setDrawing(fixture.drawing);
        setSelectedPage(fixture.drawing.selectedPage);
        setPageCount(fixture.drawing.pageCount);
        setElements(fixture.elements);
        setMeasurements(fixture.measurements);
        setEvaluations(fixture.evaluations);
        setFindings(fixture.findings);
        setCoverage(fixture.coverage);
        setSession(fixture.session);
        setSelectedElementIdState(fixture.elements[0]?.id ?? null);
        setSelectedFindingIdState(fixture.findings[0]?.id ?? null);
      }
    },
    [activePlanId],
  );

  // Switch between mock plan fixtures synchronously and reliably
  const selectPlan = useCallback(async (planId: "plan-1" | "plan-2") => {
    setError(null);
    if (apiClient.mode === "mock") {
      const fixture = apiClient.loadPlanFixture(planId);
      setActivePlanId(planId);
      setProject(fixture.project);
      setDrawing(fixture.drawing);
      setSelectedPage(fixture.drawing.selectedPage);
      setPageCount(fixture.drawing.pageCount);
      setElements(fixture.elements);
      setMeasurements(fixture.measurements);
      setEvaluations(fixture.evaluations);
      setFindings(fixture.findings);
      setCoverage(fixture.coverage);
      setSession(fixture.session);
      setSelectedElementIdState(fixture.elements[0]?.id ?? null);
      setSelectedFindingIdState(fixture.findings[0]?.id ?? null);
    }
  }, []);

  const setSelectedElementId = useCallback(
    (id: string | null) => {
      setSelectedElementIdState(id);
      if (id) {
        // Automatically link to finding if element has one
        const matchingFinding = findings.find((f) => f.elementId === id);
        if (matchingFinding) {
          setSelectedFindingIdState(matchingFinding.id);
        }
      }
    },
    [findings],
  );

  const setSelectedFindingId = useCallback(
    (id: string | null) => {
      setSelectedFindingIdState(id);
      if (id) {
        const finding = findings.find((f) => f.id === id);
        if (finding?.elementId) {
          setSelectedElementIdState(finding.elementId);
        }
      }
    },
    [findings],
  );

  const runAnalysis = useCallback(async () => {
    if (!project || !drawing) return;
    const epoch = operation.current;
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await apiClient.startAnalysis(project.id, {
        projectRevision: project.revision,
        drawingId: drawing.id,
        page: selectedPage,
      });

      if (operation.current !== epoch) return;
      const unsubscribe = apiClient.subscribeToEvents(response.sessionId, {
        onEvent: event => {
          if (operation.current !== epoch || event.type !== "agent.run.failed") return;
          const payload = event.payload as { errorCode?: unknown };
          if (typeof payload.errorCode === "string") setError(`Analiza: ${payload.errorCode}`);
        },
      });
      try {
        while (operation.current === epoch) {
          const snapshot = await apiClient.getAnalysis(response.sessionId);
          if (operation.current !== epoch) return;
          setElements(snapshot.elements); setMeasurements(snapshot.measurements);
          setEvaluations(snapshot.evaluations); setFindings(snapshot.findings);
          setCoverage(snapshot.coverage); setSession(snapshot.session);
          if (snapshot.session.status !== "RUNNING") {
            if (snapshot.session.status === "PARTIAL" || snapshot.session.status === "FAILED") {
              setError(previous => previous ?? snapshot.session.errorCode ?? "Analiza nije završena u celosti.");
            }
            setIsAnalyzing(false); break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } finally { unsubscribe(); }

    } catch (err) {
      if (operation.current !== epoch) return;
      setError(err instanceof Error ? err.message : "Greška pri pokretanju analize");
      setIsAnalyzing(false);
    }
  }, [project, drawing, selectedPage]);

  const uploadDrawing = useCallback(
    async (file: File) => {
      const epoch = operation.current;
      const client = apiClient.active;
      setIsLoading(true);
      setError(null);
      try {
        const target = project ?? await client.createProject({ name: file.name, jurisdiction: "RS", purpose: "OFFICE", phase: "CONCEPT" });
        if (operation.current !== epoch) return;
        setProject(target);
        const res = await client.uploadDrawing(target.id, file, {
          baseRevision: target.revision,
          selectedPage: 1,
        });
        const updated = await client.getProject(target.id);
        const currentCoverage = await client.getCoverage(target.id);
        if (operation.current !== epoch) return;
        setProject(updated);
        setSession(null); setElements([]); setMeasurements([]); setEvaluations([]); setFindings([]);
        setSelectedElementIdState(null); setSelectedFindingIdState(null); setCoverage(currentCoverage);
        setDrawing(res.drawing);
        setPageCount(res.pageCount);
        setSelectedPage(1);
      } catch (err) {
        if (operation.current === epoch) setError(err instanceof Error ? err.message : "Greška pri upload-u crteža");
      } finally {
        if (operation.current === epoch) setIsLoading(false);
      }
    },
    [project],
  );

  const refresh = useCallback(async () => {
    if (mode === "mock") {
      const fixture = activePlanId === "plan-2" ? plan2Fixture : plan1Fixture;
      setProject(fixture.project);
      setDrawing(fixture.drawing);
      setElements(fixture.elements);
      setMeasurements(fixture.measurements);
      setEvaluations(fixture.evaluations);
      setFindings(fixture.findings);
      setCoverage(fixture.coverage);
      setSession(fixture.session);
    } else {
      if (project) setProject(await apiClient.getProject(project.id));
      if (!session) { if (project) setCoverage(await apiClient.getCoverage(project.id)); return; }
      const snapshot = await apiClient.getAnalysis(session.id);
      setSession(snapshot.session);
      setElements(snapshot.elements);
      setMeasurements(snapshot.measurements);
      setEvaluations(snapshot.evaluations);
      setFindings(snapshot.findings);
      setCoverage(snapshot.coverage);
    }
  }, [mode, activePlanId, project, session]);

  const selectedElement = useMemo(
    () => elements.find((e) => e.id === selectedElementId) ?? null,
    [elements, selectedElementId],
  );

  const selectedFinding = useMemo(
    () => findings.find((f) => f.id === selectedFindingId) ?? null,
    [findings, selectedFindingId],
  );

  const selectedMeasurements = useMemo(() => {
    if (!selectedElementId) return [];
    return measurements.filter((m) => m.elementId === selectedElementId);
  }, [measurements, selectedElementId]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      mode,
      setMode,
      activePlanId,
      selectPlan,
      project,
      drawing,
      selectedPage,
      setSelectedPage,
      pageCount,
      elements,
      measurements,
      evaluations,
      findings,
      coverage,
      session,
      selectedElementId,
      setSelectedElementId,
      selectedFindingId,
      setSelectedFindingId,
      selectedElement,
      selectedFinding,
      selectedMeasurements,
      isLoading,
      isAnalyzing,
      error,
      clearError,
      runAnalysis,
      uploadDrawing,
      refresh,
    }),
    [
      mode,
      setMode,
      activePlanId,
      selectPlan,
      project,
      drawing,
      selectedPage,
      pageCount,
      elements,
      measurements,
      evaluations,
      findings,
      coverage,
      session,
      selectedElementId,
      setSelectedElementId,
      selectedFindingId,
      setSelectedFindingId,
      selectedElement,
      selectedFinding,
      selectedMeasurements,
      isLoading,
      isAnalyzing,
      error,
      clearError,
      runAnalysis,
      uploadDrawing,
      refresh,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
