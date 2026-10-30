import React from "react";
import type { Verification, MeasurementSource } from "../../api";

export interface VerificationBadgeProps {
  verification: Verification;
  source?: MeasurementSource;
  confidence?: number;
  className?: string;
}

/**
 * Renders measurement verification status with a strict uncertainty indicator:
 * Uncertain pixels or AI suggestions NEVER masquerade as verified metres.
 */
export function VerificationBadge({
  verification,
  source,
  confidence,
  className = "",
}: VerificationBadgeProps) {
  if (verification === "USER_CONFIRMED") {
    return (
      <span
        title="Dimenziju je direktno potvrdio ili korigovao projektant"
        className={`inline-flex items-center gap-1 rounded bg-teal-950/80 px-2 py-0.5 text-[11px] font-medium text-teal-300 border border-teal-700/50 ${className}`}
      >
        <span className="text-[10px]">✓</span> Potvrđeno
      </span>
    );
  }

  if (verification === "SOURCE_VERIFIED") {
    return (
      <span
        title="Kota je prepoznata sa originalnog crteža sa jasnom jedinicom"
        className={`inline-flex items-center gap-1 rounded bg-sky-950/80 px-2 py-0.5 text-[11px] font-medium text-sky-300 border border-sky-700/50 ${className}`}
      >
        <span className="text-[10px]">🔍</span> Sa crteža
      </span>
    );
  }

  // UNVERIFIED (Uncertainty indicator)
  const confidenceText = confidence !== undefined ? ` (${Math.round(confidence * 100)}%)` : "";
  const isAi = source === "AI_ESTIMATE";

  return (
    <span
      title="Neizvesnost: AI procena ili pikseli bez potvrđene razmere ne mogu dati konačan PASS"
      className={`inline-flex items-center gap-1 rounded bg-amber-950/90 px-2 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-600/70 animate-pulse-slow ${className}`}
    >
      <span className="text-amber-400 font-bold">⚠️</span>
      <span>{isAi ? `Neovereno (AI procena${confidenceText})` : "Neovereno"}</span>
    </span>
  );
}
