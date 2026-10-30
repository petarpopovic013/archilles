"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { apiClient } from "../../api";
import {
  type ViewportTransform,
  calculateFitToBounds,
  calculateFocusOnRect,
  getGeometryBounds,
  zoomAtScreenPoint,
  MIN_SCALE,
  MAX_SCALE,
} from "./viewerTransforms";
import { PlanToolbar, type LayerVisibility } from "./PlanToolbar";
import { PlanCanvas } from "./PlanCanvas";

export function CenterPanel() {
  const {
    drawing,
    selectedPage,
    elements,
    findings,
    measurements,
    evidence,
    selectedElementId,
    setSelectedElementId,
    selectedElement,
    activePlanId,
  } = useWorkspace();

  const containerRef = useRef<HTMLDivElement>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 1000,
    height: 800,
  });

  const [transform, setTransform] = useState<ViewportTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const [layers, setLayers] = useState<LayerVisibility>({
    elements: true,
    labels: true,
    findings: true,
    evidence: true,
  });

  // Fetch plan raster / SVG when drawing or active plan changes
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

  // Zoom In centered on viewport
  const handleZoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerPoint = { x: rect.width / 2, y: rect.height / 2 };
    setTransform((prev) =>
      zoomAtScreenPoint(prev, centerPoint, 1.25, MIN_SCALE, MAX_SCALE),
    );
  }, []);

  // Zoom Out centered on viewport
  const handleZoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerPoint = { x: rect.width / 2, y: rect.height / 2 };
    setTransform((prev) =>
      zoomAtScreenPoint(prev, centerPoint, 0.8, MIN_SCALE, MAX_SCALE),
    );
  }, []);

  // Fit to screen bounds
  const handleFitScreen = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fit = calculateFitToBounds(
      rect.width,
      rect.height,
      dimensions.width,
      dimensions.height,
    );
    setTransform(fit);
  }, [dimensions.width, dimensions.height]);

  // Focus and center on selected element
  const handleFocusSelected = useCallback(() => {
    if (!containerRef.current || !selectedElement) return;
    const rect = containerRef.current.getBoundingClientRect();
    const bounds = getGeometryBounds(selectedElement.geometry);
    const focused = calculateFocusOnRect(rect.width, rect.height, bounds);
    setTransform(focused);
  }, [selectedElement]);

  const handleToggleLayer = useCallback((layer: keyof LayerVisibility) => {
    setLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  }, []);

  return (
    <main
      ref={containerRef}
      className="flex-1 flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden relative select-none"
    >
      {/* 1. Viewport Toolbar */}
      <PlanToolbar
        scale={transform.scale}
        drawingWidth={dimensions.width}
        drawingHeight={dimensions.height}
        selectedPage={selectedPage}
        hasSelectedElement={Boolean(selectedElement)}
        layers={layers}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitScreen={handleFitScreen}
        onFocusSelected={handleFocusSelected}
        onToggleLayer={handleToggleLayer}
      />

      {/* 2. Interactive 2D Plan Canvas */}
      <PlanCanvas
        imageUrl={imageUrl}
        drawingWidth={dimensions.width}
        drawingHeight={dimensions.height}
        elements={elements}
        findings={findings}
        measurements={measurements}
        evidence={evidence}
        selectedElementId={selectedElementId}
        layers={layers}
        transform={transform}
        onTransformChange={setTransform}
        onSelectElement={setSelectedElementId}
      />
    </main>
  );
}
