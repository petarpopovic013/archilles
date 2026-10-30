import React from "react";
import type {
  ArchitecturalElement,
  ComplianceFinding,
  Measurement,
  EvaluationStatus,
} from "../../api";
import { getGeometryBounds } from "./viewerTransforms";

export interface ElementOverlayProps {
  element: ArchitecturalElement;
  finding?: ComplianceFinding | null;
  measurements: Measurement[];
  isSelected: boolean;
  isHovered: boolean;
  showLabels: boolean;
  showFindings: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}

export function ElementOverlay({
  element,
  finding,
  measurements,
  isSelected,
  isHovered,
  showLabels,
  showFindings,
  onSelect,
  onHoverChange,
}: ElementOverlayProps) {
  // Check if any measurement is unverified (uncertainty indicator)
  const hasUnverifiedMeasurement = measurements.some(
    (m) => m.verification === "UNVERIFIED" || m.source === "AI_ESTIMATE",
  );

  // Derive visual color strictly from API finding status
  const status: EvaluationStatus | "NEUTRAL" = finding?.status ?? "NEUTRAL";

  const colorScheme = React.useMemo(() => {
    switch (status) {
      case "FAIL":
        return {
          stroke: "#f43f5e", // Rose 500
          fill: isSelected ? "rgba(244, 63, 94, 0.28)" : "rgba(244, 63, 94, 0.14)",
          glow: "rgba(244, 63, 94, 0.8)",
          badgeBg: "#881337",
          badgeText: "#fecdd3",
          statusText: "FAIL",
        };
      case "NEEDS_REVIEW":
        return {
          stroke: "#f97316", // Orange 500
          fill: isSelected ? "rgba(249, 115, 22, 0.28)" : "rgba(249, 115, 22, 0.14)",
          glow: "rgba(249, 115, 22, 0.8)",
          badgeBg: "#7c2d12",
          badgeText: "#ffedd5",
          statusText: "REVIEW",
        };
      case "UNKNOWN":
        return {
          stroke: "#eab308", // Yellow 500
          fill: isSelected ? "rgba(234, 179, 8, 0.28)" : "rgba(234, 179, 8, 0.14)",
          glow: "rgba(234, 179, 8, 0.8)",
          badgeBg: "#713f12",
          badgeText: "#fef08a",
          statusText: "UNKNOWN",
        };
      case "PASS":
        return {
          stroke: "#10b981", // Emerald 500
          fill: isSelected ? "rgba(16, 185, 129, 0.28)" : "rgba(16, 185, 129, 0.14)",
          glow: "rgba(16, 185, 129, 0.8)",
          badgeBg: "#064e3b",
          badgeText: "#a7f3d0",
          statusText: "PASS",
        };
      default:
        return {
          stroke: isSelected ? "#38bdf8" : "#94a3b8",
          fill: isSelected ? "rgba(56, 189, 248, 0.2)" : "rgba(148, 163, 184, 0.08)",
          glow: "rgba(56, 189, 248, 0.8)",
          badgeBg: "#1e293b",
          badgeText: "#e2e8f0",
          statusText: "",
        };
    }
  }, [status, isSelected]);

  const bounds = getGeometryBounds(element.geometry);

  // Stroke styling: thicker on selection; dashed if unverified
  const strokeWidth = isSelected ? 3.5 : isHovered ? 2.5 : 1.75;
  const strokeDasharray = hasUnverifiedMeasurement ? "6 4" : undefined;

  // Format primary measurement value
  const primaryMeasurement = measurements[0];
  const measurementLabel = primaryMeasurement
    ? primaryMeasurement.unit === "ratio"
      ? `${(primaryMeasurement.value * 100).toFixed(1)}%`
      : `${primaryMeasurement.value}${primaryMeasurement.unit}`
    : null;

  return (
    <g
      className="cursor-pointer transition-all"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      style={{
        filter: isSelected
          ? `drop-shadow(0 0 6px ${colorScheme.glow})`
          : isHovered
          ? "drop-shadow(0 0 3px rgba(255,255,255,0.4))"
          : undefined,
      }}
    >
      {/* 1. Element Geometry Shape */}
      {element.geometry.kind === "BBOX" && (
        <rect
          x={element.geometry.x}
          y={element.geometry.y}
          width={element.geometry.width}
          height={element.geometry.height}
          fill={colorScheme.fill}
          stroke={colorScheme.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          rx={3}
        />
      )}

      {element.geometry.kind === "POLYGON" && (
        <polygon
          points={element.geometry.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={colorScheme.fill}
          stroke={colorScheme.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
        />
      )}

      {element.geometry.kind === "POLYLINE" && (
        <polyline
          points={element.geometry.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={colorScheme.stroke}
          strokeWidth={strokeWidth + 1}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* 2. Interactive Selection Indicator Accent Corner */}
      {isSelected && (
        <circle
          cx={bounds.x}
          cy={bounds.y}
          r={5}
          fill="#38bdf8"
          stroke="#0f172a"
          strokeWidth={1.5}
        />
      )}

      {/* 3. Labels and Value Tags (when showLabels is true) */}
      {showLabels && (
        <g
          transform={`translate(${bounds.x + 4}, ${Math.max(16, bounds.y - 8)})`}
          className="select-none pointer-events-none"
        >
          {/* Label Backdrop */}
          <rect
            x={0}
            y={-14}
            width={Math.max(80, (element.label?.length ?? 8) * 7.5 + 45)}
            height={20}
            fill="#090d16"
            stroke={colorScheme.stroke}
            strokeWidth={1}
            rx={4}
            opacity={0.94}
          />

          {/* Label Text */}
          <text
            x={6}
            y={0}
            fill="#f1f5f9"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {element.label ?? element.type}
            {measurementLabel ? ` (${measurementLabel})` : ""}
          </text>

          {/* Uncertainty Warning Dot/Icon */}
          {hasUnverifiedMeasurement && (
            <g transform="translate(62, -11)">
              <circle cx={4} cy={4} r={4} fill="#eab308" />
              <text x={2.5} y={6.5} fontSize="7" fill="#000" fontWeight="bold">
                !
              </text>
            </g>
          )}

          {/* Status Badge Pill on drawing if enabled */}
          {showFindings && colorScheme.statusText && (
            <g transform={`translate(${Math.max(85, (element.label?.length ?? 8) * 7.5 + 50)}, -14)`}>
              <rect
                x={0}
                y={0}
                width={48}
                height={20}
                fill={colorScheme.badgeBg}
                stroke={colorScheme.stroke}
                strokeWidth={1}
                rx={4}
              />
              <text
                x={24}
                y={13}
                fill={colorScheme.badgeText}
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                {colorScheme.statusText}
              </text>
            </g>
          )}
        </g>
      )}
    </g>
  );
}
