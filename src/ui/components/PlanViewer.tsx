"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ArchitecturalElement, EvaluationStatus } from "../../domain";
import { useWorkspace } from "../state/workspace";
import { statusLabel } from "../format";
import { boundsOf, fitRect, panBy, pathOf, toSource, zoomAt, type Viewport } from "../viewer/transforms";
import { Button, Icon, statusTone } from "./common";

const severity: EvaluationStatus[] = ["FAIL", "NEEDS_REVIEW", "UNKNOWN", "PASS", "NOT_APPLICABLE"];
const CLICK_TOLERANCE_PX = 4;

interface PageImage {
  key: string;
  url: string;
  width: number;
  height: number;
}

export function PlanViewer() {
  const { client, drawing, page, snapshot, select, selectedElement, selectedFinding, evidence, loadEvidence } = useWorkspace();
  const frame = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<PageImage | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [view, setView] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const [layers, setLayers] = useState({ elements: true, labels: true, evidence: true });
  const drag = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);
  const pageKey = drawing ? `${drawing.id}:${page}` : null;
  const current = image && image.key === pageKey ? image : null;

  // Load the prepared page; its source size (not the raster size) is the overlay frame.
  useEffect(() => {
    if (!drawing || !pageKey) return;
    let cancelled = false;
    let url: string | undefined;
    client.getDrawingPageInfo(drawing.id, page).then((info) => {
      url = info.url;
      if (cancelled) return URL.revokeObjectURL(info.url);
      setPageError(null);
      setImage({ key: pageKey, url: info.url, width: info.widthPx, height: info.heightPx });
    }).catch(() => { if (!cancelled) setPageError("The drawing page is unavailable."); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, drawing, page, pageKey]);

  const fit = useCallback(() => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !current) return;
    setView(fitRect(box.width, box.height, { x: 0, y: 0, width: current.width, height: current.height }, 24));
  }, [current]);

  // Fit when a page appears and whenever the viewer is resized.
  useEffect(() => {
    const element = frame.current;
    if (!element || !current) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(element);
    return () => observer.disconnect();
  }, [current, fit]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const anchor = { x: event.clientX - box.left, y: event.clientY - box.top };
      setView((previous) => zoomAt(previous, anchor, event.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (selectedFinding) loadEvidence(selectedFinding.evidenceIds);
  }, [selectedFinding, loadEvidence]);

  const zoomCentre = (factor: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (box) setView((previous) => zoomAt(previous, { x: box.width / 2, y: box.height / 2 }, factor));
  };

  const focusSelected = () => {
    const box = frame.current?.getBoundingClientRect();
    if (box && selectedElement) setView(fitRect(box.width, box.height, boundsOf(selectedElement.geometry), 80, 3));
  };

  const worstStatus = useMemo(() => {
    const result = new Map<string, EvaluationStatus>();
    for (const finding of snapshot?.findings ?? []) {
      if (!finding.elementId) continue;
      const previous = result.get(finding.elementId);
      if (!previous || severity.indexOf(finding.status) < severity.indexOf(previous)) result.set(finding.elementId, finding.status);
    }
    return result;
  }, [snapshot]);

  const highlighted = selectedFinding
    ? selectedFinding.evidenceIds.flatMap((id) => {
      const record = evidence.get(id);
      return record?.geometry && record.drawingId === drawing?.id && record.page === page ? [record] : [];
    })
    : [];

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    state.moved += Math.abs(dx) + Math.abs(dy);
    if (state.moved > CLICK_TOLERANCE_PX && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (state.moved > CLICK_TOLERANCE_PX) setView((previous) => panBy(previous, dx, dy));
    state.x = event.clientX;
    state.y = event.clientY;
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.moved > CLICK_TOLERANCE_PX) return;
    // A click on empty plan clears the selection; element clicks stop propagation first.
    if (event.target === event.currentTarget || (event.target as Element).closest("[data-plan-background]")) select(null);
  };

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const trackCursor = (event: PointerEvent<HTMLDivElement>) => {
    if (!current) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point = toSource({ x: event.clientX - box.left, y: event.clientY - box.top }, view);
    setCursor(point.x >= 0 && point.y >= 0 && point.x <= current.width && point.y <= current.height ? point : null);
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-slate-950" aria-label="Plan viewer">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1.5">
        <Button variant="ghost" aria-label="Zoom in" onClick={() => zoomCentre(1.25)} disabled={!current}><Icon name="plus" /></Button>
        <Button variant="ghost" aria-label="Zoom out" onClick={() => zoomCentre(0.8)} disabled={!current}><Icon name="minus" /></Button>
        <Button variant="ghost" aria-label="Fit drawing to view" onClick={fit} disabled={!current}><Icon name="fit" /></Button>
        <Button variant="ghost" aria-label="Focus selected element" onClick={focusSelected} disabled={!current || !selectedElement}><Icon name="focus" /></Button>
        <span className="ml-1 w-12 font-mono text-[11px] text-slate-400" aria-live="polite">{Math.round(view.scale * 100)}%</span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-300">
          {(Object.keys(layers) as (keyof typeof layers)[]).map((layer) => (
            <label key={layer} className="flex items-center gap-1">
              <input type="checkbox" checked={layers[layer]} onChange={() => setLayers({ ...layers, [layer]: !layers[layer] })} />
              {{ elements: "Elements", labels: "Labels", evidence: "Evidence" }[layer]}
            </label>
          ))}
        </div>
      </div>

      <div ref={frame} onPointerDown={onPointerDown} onPointerMove={(event) => { onPointerMove(event); trackCursor(event); }}
        onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => setCursor(null)}
        className="relative flex-1 touch-none select-none overflow-hidden"
        style={{ backgroundImage: "radial-gradient(#1e293b 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
        {!drawing ? (
          <Placeholder text="Create a project and upload a drawing." />
        ) : !current ? (
          <Placeholder text={pageError ?? "Loading page..."} />
        ) : (
          <div className="absolute left-0 top-0 origin-top-left"
            style={{ width: current.width, height: current.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            {/* The raster may be smaller than the source frame; it is stretched to source size so overlays align. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={`Page ${page} of ${drawing.originalName}`} draggable={false}
              className="absolute left-0 top-0 bg-white" style={{ width: current.width, height: current.height }} />
            <svg className="absolute left-0 top-0 overflow-visible" width={current.width} height={current.height}
              viewBox={`0 0 ${current.width} ${current.height}`}>
              <rect data-plan-background width={current.width} height={current.height} fill="transparent" />
              {layers.evidence && highlighted.map((record) => (
                <path key={record.id} d={pathOf(record.geometry!)} fill="rgba(250, 204, 21, 0.12)" stroke="#facc15"
                  strokeDasharray="6 4" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              ))}
              {layers.elements && snapshot?.elements.map((element) => (
                <ElementShape key={element.id} element={element} status={worstStatus.get(element.id)}
                  selected={selectedElement?.id === element.id} showLabel={layers.labels} scale={view.scale}
                  onSelect={() => {
                    const finding = snapshot.findings.find((item) => item.elementId === element.id && item.status === worstStatus.get(element.id));
                    select(finding ? { kind: "finding", id: finding.id } : { kind: "element", id: element.id });
                  }} />
              ))}
            </svg>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/90 px-2 py-1 font-mono text-[11px] text-slate-300">
          {cursor ? `x ${Math.round(cursor.x)} · y ${Math.round(cursor.y)} px` : "Scroll to zoom · drag to pan"}
        </div>
      </div>
    </main>
  );
}

function ElementShape({ element, status, selected, showLabel, scale, onSelect }: {
  element: ArchitecturalElement;
  status?: EvaluationStatus;
  selected: boolean;
  showLabel: boolean;
  scale: number;
  onSelect(): void;
}) {
  const suggested = element.extraction === "AI_SUGGESTED";
  const colour = status ? statusTone[status].stroke : suggested ? "#22d3ee" : "#38bdf8";
  const bounds = boundsOf(element.geometry);
  const label = `${element.label ?? element.type}${status ? `: ${statusLabel[status]}` : ""}${suggested ? " (unconfirmed)" : ""}`;
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <g role="button" tabIndex={0} aria-label={label} aria-pressed={selected} className="cursor-pointer outline-none"
      onPointerUp={(event) => { event.stopPropagation(); onSelect(); }} onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}>
      <path d={pathOf(element.geometry)} fill={selected ? `${colour}33` : `${colour}14`} stroke={colour}
        strokeWidth={selected ? 3 : 1.5} strokeDasharray={suggested ? "5 3" : undefined} vectorEffect="non-scaling-stroke" />
      {showLabel && (
        <text x={bounds.x} y={bounds.y - 4 / scale} fill={colour} fontSize={11 / scale} fontFamily="ui-monospace, monospace"
          paintOrder="stroke" stroke="#020617" strokeWidth={3 / scale}>
          {label}
        </text>
      )}
    </g>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">{text}</div>;
}
