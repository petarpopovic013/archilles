import React from "react";
import type { EvaluationStatus } from "../../api";

export interface StatusBadgeProps {
  status: EvaluationStatus;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Renders status badge strictly according to canonical EvaluationStatus:
 * PASS, FAIL, UNKNOWN, NEEDS_REVIEW, NOT_APPLICABLE.
 *
 * Strict Rule: UI never computes status locally; it only renders what engine/API provides.
 */
export function StatusBadge({ status, size = "md", className = "" }: StatusBadgeProps) {
  const configMap: Record<
    EvaluationStatus,
    { label: string; bg: string; text: string; border: string; dot: string }
  > = {
    PASS: {
      label: "ZADOVOLJAVA",
      bg: "bg-emerald-950/70",
      text: "text-emerald-400",
      border: "border-emerald-700/60",
      dot: "bg-emerald-400",
    },
    FAIL: {
      label: "NE ZADOVOLJAVA",
      bg: "bg-rose-950/70",
      text: "text-rose-400",
      border: "border-rose-700/60",
      dot: "bg-rose-400",
    },
    UNKNOWN: {
      label: "NEPOZNATO",
      bg: "bg-amber-950/70",
      text: "text-amber-400",
      border: "border-amber-700/60",
      dot: "bg-amber-400",
    },
    NEEDS_REVIEW: {
      label: "POTREBNA PROVERA",
      bg: "bg-orange-950/70",
      text: "text-orange-400",
      border: "border-orange-700/60",
      dot: "bg-orange-400",
    },
    NOT_APPLICABLE: {
      label: "NIJE PRIMENJIVO",
      bg: "bg-slate-900/80",
      text: "text-slate-400",
      border: "border-slate-700/60",
      dot: "bg-slate-500",
    },
  };

  const current = configMap[status] ?? {
    label: status,
    bg: "bg-slate-900",
    text: "text-slate-400",
    border: "border-slate-700",
    dot: "bg-slate-400",
  };

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px] tracking-wide"
      : "px-2.5 py-1 text-xs font-semibold tracking-wider";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-mono uppercase ${current.bg} ${current.text} ${current.border} ${sizeClasses} ${className}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  );
}
