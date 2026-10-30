"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import type {
  ArchitecturalElement,
  ComplianceFinding,
  Measurement,
  Evidence,
  Point,
} from "../../api";
import {
  type ViewportTransform,
  screenToSource,
  zoomAtScreenPoint,
  calculateFitToBounds,
  MIN_SCALE,
  MAX_SCALE,
} from "./viewerTransforms";
import { ElementOverlay } from "./ElementOverlay";
import { EvidenceOverlay } from "./EvidenceOverlay";
import type { LayerVisibility } from "./PlanToolbar";

export interface PlanCanvasProps {
  imageUrl: string | null;
  drawingWidth: number;
  drawingHeight: number;
  elements: ArchitecturalElement[];
  findings: ComplianceFinding[];
  measurements: Measurement[];
  evidence: Evidence[];
  selectedElementId: string | null;
  layers: LayerVisibility;
  transform: ViewportTransform;
  onTransformChange: (t: ViewportTransform) => void;
  onSelectElement: (id: string | null) => void;
}

export function PlanCanvas({
  imageUrl,
  drawingWidth,
  drawingHeight,
  elements,
  findings,
  measurements,
  evidence,
  selectedElementId,
  layers,
  transform,
  onTransformChange,
  onSelectElement,
}: PlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);

  // Group measurements by elementId for fast lookup
  const measurementsByElement = React.useMemo(() => {
    const map = new Map<string, Measurement[]>();
    for (const m of measurements) {
      const list = map.get(m.elementId) || [];
      list.push(m);
      map.set(m.elementId, list);
    }
    return map;
  }, [measurements]);

  // Group findings by elementId for fast lookup
  const findingByElement = React.useMemo(() => {
    const map = new Map<string, ComplianceFinding>();
    for (const f of findings) {
      if (f.elementId) {
        map.set(f.elementId, f);
      }
    }
    return map;
  }, [findings]);

  // Initial fit to bounds when image loads or dimensions change
  useEffect(() => {
    if (containerRef.current && drawingWidth > 0 && drawingHeight > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const initial = calculateFitToBounds(
        rect.width,
        rect.height,
        drawingWidth,
        drawingHeight,
      );
      onTransformChange(initial);
    }
  }, [drawingWidth, drawingHeight, onTransformChange]);

  // Mouse wheel zoom centered on cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const screenFocalPoint: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      // Zoom factor: smooth incremental zoom
      const scaleMultiplier = e.deltaY < 0 ? 1.15 : 0.87;
      const updated = zoomAtScreenPoint(
        transform,
        screenFocalPoint,
        scaleMultiplier,
        MIN_SCALE,
        MAX_SCALE,
      );
      onTransformChange(updated);
    },
    [transform, onTransformChange],
  );

  // Mouse down: begin pan drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag on left mouse button
    if (e.button !== 0) return;
    setIsPanning(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, []);

  // Mouse move: pan or update cursor coordinate readouts
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const screenPt: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const sourcePt = screenToSource(screenPt, transform);
      if (
        sourcePt.x >= 0 &&
        sourcePt.x <= drawingWidth &&
        sourcePt.y >= 0 &&
        sourcePt.y <= drawingHeight
      ) {
        setCursorPos(sourcePt);
      } else {
        setCursorPos(null);
      }

      if (isPanning) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        onTransformChange({
          ...transform,
          translateX: transform.translateX + dx,
          translateY: transform.translateY + dy,
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    [isPanning, dragStart, transform, onTransformChange, drawingWidth, drawingHeight],
  );

  // Mouse up: end pan drag
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Background click to clear selection
  const handleBackgroundClick = useCallback(() => {
    onSelectElement(null);
  }, [onSelectElement]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsPanning(false);
        setCursorPos(null);
      }}
      onClick={handleBackgroundClick}
      className={`flex-1 relative overflow-hidden bg-slate-950 select-none ${
        isPanning ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        backgroundImage: "radial-gradient(#1e293b 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      {/* 1. Main Transformed Viewport Layer */}
      <div
        className="absolute top-0 left-0 origin-top-left pointer-events-auto"
        style={{
          transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
          width: drawingWidth,
          height: drawingHeight,
        }}
      >
        {/* Drawing Image Layer */}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Drawing Plan Raster"
            width={drawingWidth}
            height={drawingHeight}
            className="absolute top-0 left-0 select-none pointer-events-none rounded shadow-2xl"
            style={{ width: drawingWidth, height: drawingHeight }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-500 text-xs italic"
            style={{ width: drawingWidth, height: drawingHeight }}
          >
            Učitavanje crteža...
          </div>
        )}

        {/* 2. Interactive SVG Overlays Layer (Strict 1:1 Page Pixel Coordinates) */}
        <svg
          width={drawingWidth}
          height={drawingHeight}
          viewBox={`0 0 ${drawingWidth} ${drawingHeight}`}
          className="absolute top-0 left-0 w-full h-full pointer-events-auto overflow-visible"
        >
          {/* Layer: Evidence Overlays */}
          {layers.evidence &&
            evidence.map((ev) => (
              <EvidenceOverlay key={ev.id} evidence={ev} />
            ))}

          {/* Layer: Architectural Elements Overlays */}
          {layers.elements &&
            elements.map((el) => {
              const elMeasurements = measurementsByElement.get(el.id) || [];
              const elFinding = findingByElement.get(el.id) || null;
              const isSelected = selectedElementId === el.id;
              const isHovered = hoveredElementId === el.id;

              return (
                <ElementOverlay
                  key={el.id}
                  element={el}
                  finding={elFinding}
                  measurements={elMeasurements}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  showLabels={layers.labels}
                  showFindings={layers.findings}
                  onSelect={() => onSelectElement(el.id)}
                  onHoverChange={(hovered) =>
                    setHoveredElementId(hovered ? el.id : null)
                  }
                />
              );
            })}
        </svg>
      </div>

      {/* 3. Bottom Float Bar: Coordinates, Scale, and Selection Status */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-md shadow-lg text-xs font-mono text-slate-300 flex items-center gap-3">
          <span className="text-slate-500">KURSOR:</span>
          {cursorPos ? (
            <span className="text-slate-200">
              X: {Math.round(cursorPos.x)}px, Y: {Math.round(cursorPos.y)}px
            </span>
          ) : (
            <span className="text-slate-500 italic">Izvan crteža</span>
          )}
        </div>

        <div className="bg-slate-900/90 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-md shadow-lg text-xs font-mono text-slate-300 flex items-center gap-2">
          <span className="text-slate-500">ZUM:</span>
          <span className="text-cyan-400 font-bold">{Math.round(transform.scale * 100)}%</span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-400 text-[11px]">
            Točkić miša = Zoom • Prevlačenje = Pan
          </span>
        </div>
      </div>
    </div>
  );
}
