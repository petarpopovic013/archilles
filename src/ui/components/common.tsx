import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { EvaluationStatus, MeasurementSource, Verification } from "../../domain";
import { sourceLabel, statusLabel, verificationLabel } from "../format";

export const statusTone: Record<EvaluationStatus, { text: string; border: string; fill: string; stroke: string }> = {
  PASS: { text: "text-emerald-300", border: "border-emerald-700/70", fill: "bg-emerald-950/60", stroke: "#34d399" },
  FAIL: { text: "text-rose-300", border: "border-rose-700/70", fill: "bg-rose-950/60", stroke: "#fb7185" },
  UNKNOWN: { text: "text-amber-300", border: "border-amber-700/70", fill: "bg-amber-950/50", stroke: "#fbbf24" },
  NOT_APPLICABLE: { text: "text-slate-300", border: "border-slate-600", fill: "bg-slate-800/60", stroke: "#94a3b8" },
  NEEDS_REVIEW: { text: "text-violet-300", border: "border-violet-700/70", fill: "bg-violet-950/60", stroke: "#a78bfa" },
};

/** Status is always shown as text; colour only reinforces it. */
export function StatusBadge({ status }: { status: EvaluationStatus }) {
  const tone = statusTone[status];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${tone.text} ${tone.border} ${tone.fill}`}>
      {statusLabel[status]}
    </span>
  );
}

export function VerificationBadge({ verification, source }: { verification: Verification; source?: MeasurementSource }) {
  const confirmed = verification !== "UNVERIFIED";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
      confirmed ? "border-emerald-800 text-emerald-300" : "border-amber-800 text-amber-300"}`}>
      {verificationLabel[verification]}
      {source && <span className="text-slate-400">· {sourceLabel[source]}</span>}
    </span>
  );
}

const iconPaths = {
  plus: "M8 3v10M3 8h10",
  minus: "M3 8h10",
  fit: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  focus: "M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14M8 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4",
  upload: "M8 10.5V2.5M5 5.5l3-3 3 3M3 10v3h10v-3",
  close: "M4 4l8 8M12 4l-8 8",
  alert: "M8 2.5l6 11H2zM8 6.5v3M8 11.5v.01",
} as const;

export type IconName = keyof typeof iconPaths;

/** Decorative inline SVG; pair it with text or an aria-label on the control. */
export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={iconPaths[name]} />
    </svg>
  );
}

/** The one reusable arrow (repository rule: no Unicode/entity/CSS arrows). */
export function SvgArrow({ direction = "right", className = "h-3.5 w-3.5" }: { direction?: "up" | "down" | "left" | "right"; className?: string }) {
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" };

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonProps) {
  const look = {
    primary: "bg-cyan-600 text-white hover:bg-cyan-500 border-cyan-500",
    secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border-slate-600",
    ghost: "bg-transparent text-slate-300 hover:bg-slate-800 border-transparent",
  }[variant];
  return (
    <button type={type} {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`} />
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-slate-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const inputClass =
  "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400";
