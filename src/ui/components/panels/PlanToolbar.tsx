import React from "react";
import {
  ZoomInIcon,
  ZoomOutIcon,
  FitScreenIcon,
  FocusIcon,
  LayersIcon,
} from "../common/ViewerIcons";

export interface LayerVisibility {
  elements: boolean;
  labels: boolean;
  findings: boolean;
  evidence: boolean;
}

export interface PlanToolbarProps {
  scale: number;
  drawingWidth: number;
  drawingHeight: number;
  selectedPage: number;
  hasSelectedElement: boolean;
  layers: LayerVisibility;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitScreen: () => void;
  onFocusSelected: () => void;
  onToggleLayer: (layer: keyof LayerVisibility) => void;
}

export function PlanToolbar({
  scale,
  drawingWidth,
  drawingHeight,
  selectedPage,
  hasSelectedElement,
  layers,
  onZoomIn,
  onZoomOut,
  onFitScreen,
  onFocusSelected,
  onToggleLayer,
}: PlanToolbarProps) {
  const zoomPercentage = Math.round(scale * 100);

  return (
    <div className="h-12 px-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between select-none z-20 shrink-0">
      {/* 1. Left: Metadata & Page */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          <span className="font-semibold text-slate-100 font-mono tracking-wide">
            2D PLAN VIEWER
          </span>
        </div>

        <span className="text-slate-700 hidden sm:inline">|</span>

        <span className="font-mono text-slate-400 text-[11px] hidden md:inline">
          {drawingWidth} × {drawingHeight} px
        </span>

        <span className="font-mono text-[11px] text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
          Stranica {selectedPage}
        </span>
      </div>

      {/* 2. Center: Layer Visibility Toggles */}
      <div className="hidden lg:flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
        <span className="px-1.5 text-slate-500 font-mono flex items-center gap-1">
          <LayersIcon size={13} className="text-slate-400" />
          <span className="hidden xl:inline">Slojevi:</span>
        </span>

        <button
          type="button"
          onClick={() => onToggleLayer("elements")}
          className={`px-2 py-0.5 rounded font-mono transition-colors ${
            layers.elements
              ? "bg-cyan-950 text-cyan-300 border border-cyan-800/80"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
          title="Uključi/isključi prikaz elemenata"
        >
          Elementi
        </button>

        <button
          type="button"
          onClick={() => onToggleLayer("labels")}
          className={`px-2 py-0.5 rounded font-mono transition-colors ${
            layers.labels
              ? "bg-cyan-950 text-cyan-300 border border-cyan-800/80"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
          title="Uključi/isključi oznake i mere"
        >
          Mere/Oznake
        </button>

        <button
          type="button"
          onClick={() => onToggleLayer("findings")}
          className={`px-2 py-0.5 rounded font-mono transition-colors ${
            layers.findings
              ? "bg-cyan-950 text-cyan-300 border border-cyan-800/80"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
          title="Uključi/isključi status nalaza"
        >
          Nalazi
        </button>

        <button
          type="button"
          onClick={() => onToggleLayer("evidence")}
          className={`px-2 py-0.5 rounded font-mono transition-colors ${
            layers.evidence
              ? "bg-purple-950 text-purple-300 border border-purple-800/80"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
          title="Uključi/isključi vizuelne dokaze"
        >
          Dokazi
        </button>
      </div>

      {/* 3. Right: Zoom & Navigation Controls */}
      <div className="flex items-center gap-1.5">
        {/* Focus Selected Element Button */}
        <button
          type="button"
          disabled={!hasSelectedElement}
          onClick={onFocusSelected}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors shadow-sm"
          title="Centriraj i uvećaj trenutno selektovani element"
        >
          <FocusIcon size={14} className="text-cyan-400" />
          <span className="hidden sm:inline">Fokus</span>
        </button>

        {/* Fit to Screen Button */}
        <button
          type="button"
          onClick={onFitScreen}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
          title="Prilagodi veličinu crteža ekranu"
        >
          <FitScreenIcon size={14} className="text-slate-300" />
          <span className="hidden sm:inline">Fit</span>
        </button>

        {/* Zoom In / Out Cluster */}
        <div className="flex items-center bg-slate-950 rounded-md border border-slate-800 p-0.5">
          <button
            type="button"
            onClick={onZoomOut}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-colors"
            title="Umanji (Zoom Out)"
          >
            <ZoomOutIcon size={14} />
          </button>

          <span className="font-mono text-xs px-2 text-slate-200 min-w-[50px] text-center">
            {zoomPercentage}%
          </span>

          <button
            type="button"
            onClick={onZoomIn}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-colors"
            title="Uvećaj (Zoom In)"
          >
            <ZoomInIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
