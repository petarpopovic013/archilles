import React from "react";
import type { Evidence } from "../../api";
import { getGeometryBounds } from "./viewerTransforms";

export interface EvidenceOverlayProps {
  evidence: Evidence;
  onClick?: () => void;
}

export function EvidenceOverlay({ evidence, onClick }: EvidenceOverlayProps) {
  if (!evidence.geometry) return null;

  const bounds = getGeometryBounds(evidence.geometry);

  return (
    <g
      className="cursor-pointer select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {evidence.geometry.kind === "BBOX" && (
        <rect
          x={evidence.geometry.x}
          y={evidence.geometry.y}
          width={evidence.geometry.width}
          height={evidence.geometry.height}
          fill="rgba(168, 85, 247, 0.08)"
          stroke="#a855f7"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          rx={2}
        />
      )}

      {evidence.geometry.kind === "POLYGON" && (
        <polygon
          points={evidence.geometry.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(168, 85, 247, 0.08)"
          stroke="#a855f7"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      {/* Mini Evidence Badge */}
      <g
        transform={`translate(${bounds.x}, ${Math.max(12, bounds.y - 4)})`}
        className="pointer-events-none"
      >
        <rect
          x={0}
          y={-10}
          width={58}
          height={14}
          fill="#3b0764"
          stroke="#a855f7"
          strokeWidth={0.75}
          rx={3}
          opacity={0.9}
        />
        <text
          x={29}
          y={0}
          fill="#e9d5ff"
          fontSize="8"
          fontFamily="monospace"
          fontWeight="bold"
          textAnchor="middle"
        >
          [DOKAZ]
        </text>
      </g>
    </g>
  );
}
