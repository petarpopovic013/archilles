"use client";

import React from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { StatusBadge } from "../common/StatusBadge";
import { VerificationBadge } from "../common/VerificationBadge";

export function RightPanel() {
  const {
    selectedFinding,
    selectedElement,
    selectedMeasurements,
    evaluations,
    project,
  } = useWorkspace();

  const matchingEvaluation = React.useMemo(() => {
    if (!selectedFinding) return null;
    return evaluations.find((ev) => ev.id === selectedFinding.evaluationId) ?? null;
  }, [selectedFinding, evaluations]);

  return (
    <aside className="w-96 flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-200 select-none overflow-y-auto">
      {/* 1. Panel Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400" />
          <h2 className="text-xs font-bold tracking-wider text-slate-100 uppercase">
            Kontekst i Revizija Nalaza
          </h2>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
          Rev: r{project?.revision ?? 1}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {selectedFinding ? (
          /* A. Active Finding Details */
          <div className="space-y-4">
            {/* Title & Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedFinding.status} size="md" />
                {selectedFinding.priority && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                    Prioritet: {selectedFinding.priority}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-100 leading-snug">
                {selectedFinding.title}
              </h3>
            </div>

            {/* Observed vs Required Condition Card */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                Uočeno vs Zahtevano Stanje
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-medium">Uočeno (Observed)</div>
                  <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                    {matchingEvaluation?.observed !== undefined
                      ? typeof matchingEvaluation.observed === "number" && matchingEvaluation.unit === "ratio"
                        ? `${(matchingEvaluation.observed * 100).toFixed(1)}%`
                        : `${matchingEvaluation.observed}${matchingEvaluation.unit ?? ""}`
                      : "Nepoznato"}
                  </div>
                </div>

                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-medium">Zahtevano (Norma)</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                    {matchingEvaluation?.required !== undefined
                      ? typeof matchingEvaluation.required === "number" && matchingEvaluation.unit === "ratio"
                        ? `≤ ${(matchingEvaluation.required * 100).toFixed(1)}%`
                        : `≥ ${matchingEvaluation.required}${matchingEvaluation.unit ?? ""}`
                      : "Po proračunu"}
                  </div>
                </div>
              </div>

              {matchingEvaluation?.reasonCode && (
                <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between pt-1">
                  <span>Kod evaluacije:</span>
                  <span className="text-slate-400">{matchingEvaluation.reasonCode}</span>
                </div>
              )}
            </div>

            {/* Explanation & Pravno Obrazloženje */}
            <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800 space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Obrazloženje i Pravni Izvor
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedFinding.explanation}
              </p>

              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Izvor ID:</span>
                <span className="text-cyan-400 truncate max-w-[180px]">
                  {selectedFinding.sourceVersion} ({selectedFinding.sourceId.slice(0, 8)}...)
                </span>
              </div>
            </div>

            {/* Action Advice */}
            {selectedFinding.suggestedAction && (
              <div className="p-3 bg-cyan-950/30 rounded-lg border border-cyan-800/60 space-y-1 text-xs">
                <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <span>Predloženi Korak Revizije:</span>
                </div>
                <p className="text-cyan-200/90 leading-relaxed text-[11px]">
                  {selectedFinding.suggestedAction}
                </p>
              </div>
            )}

            {/* Human Review Needed Notice */}
            {selectedFinding.requiresHumanReview && (
              <div className="p-2.5 rounded bg-orange-950/40 border border-orange-700/60 text-orange-300 text-xs flex items-start gap-2">
                <span className="text-orange-400 text-sm font-bold">⚠️</span>
                <span className="text-[11px] leading-relaxed">
                  Zahteva obaveznu stručnu verifikaciju od strane licenciranog inženjera / odgovornog projektanta.
                </span>
              </div>
            )}

            {/* Placeholder Groundwork for Task 4: Fix & Recheck */}
            <div className="p-3 bg-slate-950/40 rounded-lg border border-dashed border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Hipotetički Fix & Recheck</span>
                <span className="text-[10px] text-cyan-400 font-mono">Task 4</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                U Tasku 4 ovde omogućavamo testiranje korektivne dimenzije (npr. unos nove širine) sa trenutnim proračunom ishoda bez menjanja crteža.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  disabled
                  placeholder="Predložena mera (m)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-500 cursor-not-allowed"
                />
                <button
                  type="button"
                  disabled
                  className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-500 font-medium whitespace-nowrap cursor-not-allowed"
                >
                  Recheck
                </button>
              </div>
            </div>
          </div>
        ) : selectedElement ? (
          /* B. Element Details (if element selected but no finding focused) */
          <div className="space-y-4">
            <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-100">
                  {selectedElement.label ?? selectedElement.type}
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                  {selectedElement.type}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                ID: {selectedElement.id}
              </div>
              <div className="text-[11px] text-slate-400">
                Način detekcije: <strong className="text-slate-200">{selectedElement.extraction}</strong>
              </div>
            </div>

            {/* Element's Measurements */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Pripadajuće Mere Elemenata:
              </div>

              {selectedMeasurements.length === 0 ? (
                <div className="p-4 bg-slate-950/40 rounded border border-slate-800 text-center text-xs text-slate-500 italic">
                  Nema evidentiranih mera za ovaj element.
                </div>
              ) : (
                selectedMeasurements.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-400 font-medium">{m.metric}:</span>
                      <span className="font-bold text-slate-100 font-mono text-sm">
                        {m.unit === "ratio" ? `${(m.value * 100).toFixed(1)}%` : `${m.value}${m.unit}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-500">Status verifikacije:</span>
                      <VerificationBadge
                        verification={m.verification}
                        source={m.source}
                        confidence={m.confidence}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* C. Empty State */
          <div className="p-8 text-center space-y-3 bg-slate-950/30 rounded-lg border border-slate-800/60 mt-12">
            <div className="text-3xl opacity-50">📋</div>
            <h4 className="text-xs font-semibold text-slate-300">Nijedna stavka nije selektovana</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Kliknite na nalaz ili arhitektonski element u levom panelu kako biste videli uočene mere, pravne normative i opcije za Fix & Recheck.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
