"use client";

import React, { useEffect, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { apiClient } from "../../api";
import { SvgArrow } from "../common/SvgArrow";

export function CenterPanel() {
  const {
    drawing,
    selectedPage,
    selectedElement,
    selectedFinding,
    activePlanId,
  } = useWorkspace();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 1000,
    height: 800,
  });

  useEffect(() => {
    let isMounted = true;
    if (drawing) {
      apiClient.getDrawingPageInfo(drawing.id, selectedPage).then((info) => {
        if (!isMounted) return;
        setImageUrl(info.url);
        setDimensions({ width: info.widthPx, height: info.heightPx });
      });
    }
    return () => {
      isMounted = false;
    };
  }, [drawing, selectedPage, activePlanId]);

  return (
    <main className="flex-1 flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden relative">
      {/* 1. Top Viewport Toolbar */}
      <div className="h-11 px-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between select-none z-10">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-slate-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            2D Pregledač Plana
          </span>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-slate-400">
            {dimensions.width} × {dimensions.height} px
          </span>
          {drawing && (
            <span className="font-mono text-[11px] text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
              Str. {selectedPage} ({drawing.mimeType.split("/")[1]?.toUpperCase()})
            </span>
          )}
        </div>

        {/* View Controls & Zoom Placeholders (Task 3 groundwork) */}
        <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-xs">
          <button
            type="button"
            className="px-2 py-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
            title="Uvećaj prikaz"
          >
            +
          </button>
          <span className="font-mono text-[11px] px-1 text-slate-300">100%</span>
          <button
            type="button"
            className="px-2 py-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
            title="Umanji prikaz"
          >
            -
          </button>
          <span className="text-slate-700 mx-1">|</span>
          <button
            type="button"
            className="text-[11px] px-1.5 py-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
            title="Resetuj poziciju"
          >
            Fit
          </button>
        </div>
      </div>

      {/* 2. Main Viewport Container */}
      <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] relative">
        {imageUrl ? (
          <div className="relative shadow-2xl rounded border border-slate-800 bg-slate-900 transition-all">
            {/* Drawing Preview Render */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Plan"
              width={dimensions.width}
              height={dimensions.height}
              className="max-h-[70vh] w-auto object-contain select-none pointer-events-none rounded"
            />

            {/* Selected Element Focus Box Overlay */}
            {selectedElement && selectedElement.geometry.kind === "BBOX" && (
              <div
                className="absolute border-2 border-cyan-400 bg-cyan-400/15 pointer-events-none transition-all rounded shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                style={{
                  left: `${(selectedElement.geometry.x / dimensions.width) * 100}%`,
                  top: `${(selectedElement.geometry.y / dimensions.height) * 100}%`,
                  width: `${(selectedElement.geometry.width / dimensions.width) * 100}%`,
                  height: `${(selectedElement.geometry.height / dimensions.height) * 100}%`,
                }}
              >
                <div className="absolute -top-6 left-0 bg-cyan-600 text-white text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                  {selectedElement.label ?? selectedElement.type}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic">Učitavanje crteža...</div>
        )}

        {/* 3. Task 3 Groundwork Floating Status Bar */}
        <div className="absolute bottom-4 left-6 right-6 bg-slate-900/90 backdrop-blur border border-slate-800 px-4 py-2.5 rounded-lg shadow-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-semibold">Aktivna Selekcija:</span>
            {selectedElement ? (
              <span className="font-mono text-slate-200">
                {selectedElement.label ?? selectedElement.type} (ID: {selectedElement.id.slice(0, 8)}...)
              </span>
            ) : (
              <span className="text-slate-500 italic">Nijedan element nije odabran (kliknite u levom panelu)</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {selectedFinding && (
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                Povezan nalaz: {selectedFinding.title.slice(0, 35)}...
              </span>
            )}
            <span className="text-slate-600">|</span>
            <span className="text-slate-500 flex items-center gap-1">
              <span>Task 3: Full Canvas Viewer</span>
              <SvgArrow direction="right" size={12} className="text-slate-500" />
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
