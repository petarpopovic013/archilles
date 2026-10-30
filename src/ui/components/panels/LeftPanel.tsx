"use client";

import React, { useState, useRef } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { StatusBadge } from "../common/StatusBadge";
import { VerificationBadge } from "../common/VerificationBadge";
import { SvgArrow } from "../common/SvgArrow";
import type { ElementType } from "../../api";

export function LeftPanel() {
  const {
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
    findings,
    coverage,
    selectedElementId,
    setSelectedElementId,
    selectedFindingId,
    setSelectedFindingId,
    runAnalysis,
    uploadDrawing,
    isAnalyzing,
    isLoading,
    error,
    clearError,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<"findings" | "elements" | "coverage">("findings");
  const [elementFilter, setElementFilter] = useState<string>("ALL");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group measurements by elementId for fast lookup
  const measurementsByElement = React.useMemo(() => {
    const map = new Map<string, typeof measurements>();
    for (const m of measurements) {
      const list = map.get(m.elementId) || [];
      list.push(m);
      map.set(m.elementId, list);
    }
    return map;
  }, [measurements]);

  // Filter elements
  const filteredElements = React.useMemo(() => {
    if (elementFilter === "ALL") return elements;
    return elements.filter((el) => el.type === elementFilter);
  }, [elements, elementFilter]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadDrawing(file);
    }
  };

  const getElementIcon = (type: ElementType) => {
    switch (type) {
      case "RAMP":
        return "📐";
      case "DOOR":
      case "ENTRANCE":
      case "EXIT":
        return "🚪";
      case "CORRIDOR":
        return "🚶";
      case "STAIR":
        return "🪜";
      case "ROOM":
        return "🏢";
      default:
        return "📍";
    }
  };

  return (
    <aside className="w-96 flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-200 select-none">
      {/* 1. Header: Project Context, Plan Switcher & Mode Switcher */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
            <h1 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              Archilles Workspace
            </h1>
          </div>

          {/* Mode Switcher (Mock / Live) */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setMode("mock")}
              className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                mode === "mock"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Mock
            </button>
            <button
              type="button"
              onClick={() => setMode("live")}
              className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                mode === "live"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Live API
            </button>
          </div>
        </div>

        {/* Plan / Project Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            <span>Test Planovi (Fixtures):</span>
            <span className="text-cyan-400 font-mono">Rev: r{project?.revision ?? 1}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => selectPlan("plan-1")}
              className={`px-2.5 py-1.5 text-xs font-medium text-left rounded-md border transition-all ${
                activePlanId === "plan-1"
                  ? "bg-slate-800 border-cyan-500/80 text-cyan-300 shadow-sm"
                  : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
              }`}
            >
              <div className="font-semibold truncate">Plan 1: Koridor</div>
              <div className="text-[10px] opacity-75 truncate">Požar (UNKNOWN)</div>
            </button>

            <button
              type="button"
              onClick={() => selectPlan("plan-2")}
              className={`px-2.5 py-1.5 text-xs font-medium text-left rounded-md border transition-all ${
                activePlanId === "plan-2"
                  ? "bg-slate-800 border-cyan-500/80 text-cyan-300 shadow-sm"
                  : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
              }`}
            >
              <div className="font-semibold truncate">Plan 2: Rampa & Vrata</div>
              <div className="text-[10px] opacity-75 truncate">Pristupačnost (3 provere)</div>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Drawing Page & Analysis Controls */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/40 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="truncate max-w-[200px]" title={drawing?.originalName}>
            <span className="text-slate-400 text-[11px]">Crtež: </span>
            <span className="font-mono text-slate-200">{drawing?.originalName ?? "plan.png"}</span>
          </div>

          {/* Page Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 text-[11px]">Str:</span>
            <div className="flex items-center bg-slate-950 rounded border border-slate-800 px-1 py-0.5">
              <button
                type="button"
                disabled={selectedPage <= 1}
                onClick={() => setSelectedPage(Math.max(1, selectedPage - 1))}
                className="text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 p-0.5"
                title="Prethodna stranica"
              >
                <SvgArrow direction="left" size={12} />
              </button>
              <span className="font-mono text-xs px-1 text-slate-200">
                {selectedPage}/{pageCount}
              </span>
              <button
                type="button"
                disabled={selectedPage >= pageCount}
                onClick={() => setSelectedPage(Math.min(pageCount, selectedPage + 1))}
                className="text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 p-0.5"
                title="Sledeća stranica"
              >
                <SvgArrow direction="right" size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons: Upload & Start Analysis */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isAnalyzing}
            className="flex-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700/80 rounded text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors disabled:opacity-50"
          >
            Upload crteža
          </button>

          <button
            type="button"
            onClick={runAnalysis}
            disabled={isAnalyzing || isLoading || !project || !drawing}
            className={`flex-1 px-2.5 py-1.5 rounded text-xs font-semibold tracking-wide transition-all border ${
              isAnalyzing
                ? "bg-cyan-900/60 text-cyan-300 border-cyan-700 animate-pulse cursor-wait"
                : "bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-500 shadow-sm"
            }`}
          >
            {isAnalyzing ? "Analiza u toku..." : "Pokreni analizu"}
          </button>
        </div>

        {error && (
          <div className="p-2 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <span className="truncate">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-rose-400 hover:text-rose-200 ml-2 font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 3. Panel Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/30">
        <button
          type="button"
          onClick={() => setActiveTab("findings")}
          className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition-all ${
            activeTab === "findings"
              ? "border-cyan-500 text-cyan-400 bg-slate-800/40"
              : "border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/20"
          }`}
        >
          Nalazi ({findings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("elements")}
          className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition-all ${
            activeTab === "elements"
              ? "border-cyan-500 text-cyan-400 bg-slate-800/40"
              : "border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/20"
          }`}
        >
          Elementi ({elements.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("coverage")}
          className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition-all ${
            activeTab === "coverage"
              ? "border-cyan-500 text-cyan-400 bg-slate-800/40"
              : "border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/20"
          }`}
        >
          Pokrivenost
        </button>
      </div>

      {/* 4. Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {/* TAB A: FINDINGS LIST */}
        {activeTab === "findings" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
              <span>Rezultati automatske provere propisa:</span>
              <span>{findings.length} nalaz(a)</span>
            </div>

            {findings.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs italic">
                Nema registrovanih nalaza za ovaj plan.
              </div>
            ) : (
              findings.map((finding) => {
                const isSelected = selectedFindingId === finding.id;
                return (
                  <div
                    key={finding.id}
                    onClick={() => setSelectedFindingId(finding.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-800/90 border-cyan-500 shadow-md ring-1 ring-cyan-500/30"
                        : "bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      {/* Status badge rendered strictly from API status */}
                      <StatusBadge status={finding.status} size="sm" />

                      {finding.priority && (
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          Prioritet: {finding.priority}
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-semibold text-slate-100 line-clamp-2 mb-1">
                      {finding.title}
                    </h4>

                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {finding.explanation}
                    </p>

                    {finding.suggestedAction && (
                      <div className="mt-2 pt-2 border-t border-slate-800/70 text-[11px] text-cyan-400/90 font-medium flex items-start gap-1">
                        <span className="text-cyan-500">➜</span>
                        <span className="line-clamp-1">{finding.suggestedAction}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB B: ARCHITECTURAL ELEMENTS & MEASUREMENTS */}
        {activeTab === "elements" && (
          <div className="space-y-2.5">
            {/* Element Type Filter */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
              {["ALL", "RAMP", "DOOR", "CORRIDOR"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setElementFilter(type)}
                  className={`px-2 py-0.5 rounded font-mono transition-colors ${
                    elementFilter === type
                      ? "bg-slate-750 text-cyan-400 border border-cyan-500/50"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {filteredElements.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs italic">
                Nema elemenata za izabrani filter.
              </div>
            ) : (
              filteredElements.map((el) => {
                const isSelected = selectedElementId === el.id;
                const elMeasurements = measurementsByElement.get(el.id) || [];

                return (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-800/90 border-cyan-500 shadow-md ring-1 ring-cyan-500/30"
                        : "bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{getElementIcon(el.type)}</span>
                        <span className="text-xs font-semibold text-slate-100">
                          {el.label ?? `${el.type} (${el.id.slice(0, 8)})`}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        {el.type}
                      </span>
                    </div>

                    {/* Coordinates / Bounding Box info */}
                    {el.geometry.kind === "BBOX" && (
                      <div className="text-[10px] font-mono text-slate-500 mb-2">
                        x: {el.geometry.x}, y: {el.geometry.y} • {el.geometry.width}×
                        {el.geometry.height}px
                      </div>
                    )}

                    {/* Measurements List for this Element */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                      {elMeasurements.length === 0 ? (
                        <div className="text-[11px] text-slate-500 italic">
                          Nema pridruženih mera
                        </div>
                      ) : (
                        elMeasurements.map((m) => {
                          const displayValue =
                            m.unit === "ratio"
                              ? `${(m.value * 100).toFixed(1)}% (${m.value})`
                              : `${m.value.toFixed(2)}${m.unit}`;

                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between bg-slate-950/60 px-2 py-1 rounded border border-slate-900 text-xs"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-mono text-slate-400 text-[11px]">
                                  {m.metric}:
                                </span>
                                <span className="font-semibold text-slate-200">
                                  {displayValue}
                                </span>
                              </div>

                              {/* Strict Verification Badge & Uncertainty Indicator */}
                              <VerificationBadge
                                verification={m.verification}
                                source={m.source}
                                confidence={m.confidence}
                              />
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB C: REGULATION COVERAGE SUMMARY */}
        {activeTab === "coverage" && (
          <div className="space-y-3">
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200 border-b border-slate-800 pb-1.5">
                <span>Pokrivenost Propisa (Coverage)</span>
                <span className="text-[10px] font-mono text-cyan-400">RS Normativi</span>
              </div>

              {/* Coverage Counters */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Aktivna pravila</div>
                  <div className="text-base font-bold font-mono text-slate-100">
                    {coverage?.activeRules ?? 0}
                  </div>
                </div>

                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Izvršene provere</div>
                  <div className="text-base font-bold font-mono text-emerald-400">
                    {coverage?.executedChecks ?? 0}
                  </div>
                </div>

                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Blokirano (Unknown)</div>
                  <div className="text-base font-bold font-mono text-amber-400">
                    {coverage?.blockedUnknown ?? 0}
                  </div>
                </div>

                <div className="p-2 rounded bg-slate-900 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Potrebna provera</div>
                  <div className="text-base font-bold font-mono text-orange-400">
                    {coverage?.needsReview ?? 0}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Izvan opsega automatizacije:</span>
                <span className="font-mono text-slate-300">{coverage?.outsideAutomatedCoverage ?? 0}</span>
              </div>
            </div>

            {/* Regulation Sources Considered */}
            <div className="space-y-1.5">
              <h5 className="text-[11px] font-medium text-slate-400 uppercase tracking-wider px-1">
                Verifikovani Pravni Izvori:
              </h5>
              {coverage?.sources.map((src) => (
                <div
                  key={src.sourceId}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 line-clamp-1">{src.title}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Verzija: {src.sourceVersion}</span>
                    <span className="text-teal-400">✓ {src.verificationStatus}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 italic">{src.reason}</div>
                </div>
              ))}
            </div>

            {/* Constitution Disclaimer Note */}
            <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800/60 text-[10px] text-slate-400 leading-relaxed">
              ⚠️ <strong>Poštovanje PRD pravila:</strong> Sistem ne prikazuje fiktivan zbirni
              procenat usklađenosti objekta (npr. &quot;85% compliant&quot;). Svako pravilo i svaka
              dimenzija se verifikuju isključivo pojedinačno uz tačan pravni izvor.
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
