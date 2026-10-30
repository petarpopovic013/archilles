"use client";

import React from "react";
import { useWorkspace } from "../../context/WorkspaceContext";

export function WorkspaceHeader() {
  const { project, drawing, mode, activePlanId, selectedPage, pageCount } = useWorkspace();

  return (
    <header className="h-13 bg-slate-950 border-b border-slate-800 px-5 flex items-center justify-between select-none shrink-0 z-20">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-cyan-900/30 font-mono">
            A
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wider text-slate-100 font-mono">
                ARCHILLES
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-cyan-400 border border-slate-800">
                v1.0 MVP
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              Find the weakness before it becomes a risk
            </div>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />

        {/* Project Context */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="text-slate-400">Projekat:</span>
          <span className="font-semibold text-slate-200">
            {project?.name ?? "Učitavanje projekta..."}
          </span>
          {project && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
              {project.phase} • {project.jurisdiction}
            </span>
          )}
        </div>
      </div>

      {/* Meta Pills & Indicators */}
      <div className="flex items-center gap-3 text-xs">
        {drawing && (
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800 font-mono text-[11px] text-slate-300">
            <span className="text-slate-500">Plan:</span>
            <span className="text-slate-200 truncate max-w-[150px]">{drawing.originalName}</span>
            <span className="text-slate-600">|</span>
            <span className="text-cyan-400">
              Str. {selectedPage}/{pageCount}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Active Fixture Indicator */}
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
            {activePlanId === "plan-1" ? "Plan 1 (Koridor)" : "Plan 2 (Rampa & Vrata)"}
          </span>

          {/* Mode Pill */}
          <span
            className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold border ${
              mode === "mock"
                ? "bg-cyan-950/80 text-cyan-400 border-cyan-700/60"
                : "bg-emerald-950/80 text-emerald-400 border-emerald-700/60"
            }`}
          >
            {mode === "mock" ? "MOCK FIXTURE" : "LIVE BACKEND"}
          </span>
        </div>
      </div>
    </header>
  );
}
