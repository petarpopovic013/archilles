"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type {
  Project,
  Drawing,
  ArchitecturalElement,
  Measurement,
  Evidence,
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
  evidence: Evidence[];
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
  const [mode, setModeState] = useState<ApiClientMode>(() => apiClient.mode);
  const [activePlanId, setActivePlanId] = useState<"plan-1" | "plan-2">("plan-1");

  // Initialized synchronously from contract baseline (no cascading renders)
  const [project, setProject] = useState<Project | null>(() => plan1Fixture.project);
  const [drawing, setDrawing] = useState<Drawing | null>(() => plan1Fixture.drawing);
  const [selectedPage, setSelectedPage] = useState<number>(() => plan1Fixture.drawing.selectedPage);
  const [pageCount, setPageCount] = useState<number>(() => plan1Fixture.drawing.pageCount);

  const [elements, setElements] = useState<ArchitecturalElement[]>(() => plan1Fixture.elements);
  const [measurements, setMeasurements] = useState<Measurement[]>(() => plan1Fixture.measurements);
  const [evidence, setEvidence] = useState<Evidence[]>(() => plan1Fixture.evidence);
  const [evaluations, setEvaluations] = useState<RuleEvaluation[]>(() => plan1Fixture.evaluations);
  const [findings, setFindings] = useState<ComplianceFinding[]>(() => plan1Fixture.findings);
  const [coverage, setCoverage] = useState<CoverageSummary | null>(() => plan1Fixture.coverage);
  const [session, setSession] = useState<AnalysisSession | null>(() => plan1Fixture.session);

  const [selectedElementId, setSelectedElementIdState] = useState<string | null>(
    () => plan1Fixture.elements[0]?.id ?? null,
  );
  const [selectedFindingId, setSelectedFindingIdState] = useState<string | null>(
    () => plan1Fixture.findings[0]?.id ?? null,
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const setMode = useCallback(
    (newMode: ApiClientMode) => {
      apiClient.setMode(newMode);
      setModeState(newMode);

      if (newMode === "live") {
        setIsLoading(true);
        setError(null);

        apiClient
          .getProject("00000000-0000-4000-8000-000000000001")
          .then(async (p) => {
            setProject(p);
            const snapshot = await apiClient.getAnalysis("00000000-0000-4000-8000-000000000100");
            setSession(snapshot.session);
            setElements(snapshot.elements);
            setMeasurements(snapshot.measurements);
            setEvaluations(snapshot.evaluations);
            setFindings(snapshot.findings);
            setCoverage(snapshot.coverage);
            setSelectedElementIdState(snapshot.elements[0]?.id ?? null);
            setSelectedFindingIdState(snapshot.findings[0]?.id ?? null);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Neuspešno učitavanje sa live API-ja");
          })
          .finally(() => {
            setIsLoading(false);
          });
      } else {
        const fixture = activePlanId === "plan-2" ? plan2Fixture : plan1Fixture;
        setProject(fixture.project);
        setDrawing(fixture.drawing);
        setSelectedPage(fixture.drawing.selectedPage);
        setPageCount(fixture.drawing.pageCount);
        setElements(fixture.elements);
        setMeasurements(fixture.measurements);
        setEvidence(fixture.evidence);
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
      setEvidence(fixture.evidence);
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
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await apiClient.startAnalysis(project.id, {
        projectRevision: project.revision,
        drawingId: drawing.id,
        page: selectedPage,
      });

      apiClient.subscribeToEvents(response.sessionId, {
        onEvent: () => {
          // Live agent event streaming
        },
        onComplete: async () => {
          const snapshot = await apiClient.getAnalysis(response.sessionId);
          setElements(snapshot.elements);
          setMeasurements(snapshot.measurements);
          setEvaluations(snapshot.evaluations);
          setFindings(snapshot.findings);
          setCoverage(snapshot.coverage);
          setSession(snapshot.session);
          setIsAnalyzing(false);
        },
        onError: (err) => {
          setError(`Greška tokom analize: ${err.message}`);
          setIsAnalyzing(false);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri pokretanju analize");
      setIsAnalyzing(false);
    }
  }, [project, drawing, selectedPage]);

  const uploadDrawing = useCallback(
    async (file: File) => {
      if (!project) return;
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiClient.uploadDrawing(project.id, file, {
          baseRevision: project.revision,
          selectedPage: 1,
        });
        setDrawing(res.drawing);
        setPageCount(res.pageCount);
        setSelectedPage(1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Greška pri upload-u crteža");
      } finally {
        setIsLoading(false);
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
      setEvidence(fixture.evidence);
      setEvaluations(fixture.evaluations);
      setFindings(fixture.findings);
      setCoverage(fixture.coverage);
      setSession(fixture.session);
    } else {
      const snapshot = await apiClient.getAnalysis("00000000-0000-4000-8000-000000000100");
      setSession(snapshot.session);
      setElements(snapshot.elements);
      setMeasurements(snapshot.measurements);
      setEvaluations(snapshot.evaluations);
      setFindings(snapshot.findings);
      setCoverage(snapshot.coverage);
    }
  }, [mode, activePlanId]);

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
      evidence,
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
      evidence,
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
