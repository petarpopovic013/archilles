import React from "react";

export interface SvgArrowProps {
  direction?: "up" | "down" | "left" | "right";
  className?: string;
  size?: number;
}

/**
 * Reusable SVG Arrow component conforming to Tech.MD ADR requirement:
 * "Never render UI arrows as Unicode, HTML entities, icon fonts, or CSS content."
 */
export function SvgArrow({
  direction = "right",
  className = "w-4 h-4",
  size = 16,
}: SvgArrowProps) {
  const rotationMap: Record<string, string> = {
    right: "rotate(0deg)",
    down: "rotate(90deg)",
    left: "rotate(180deg)",
    up: "rotate(270deg)",
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ transform: rotationMap[direction] }}
      aria-hidden="true"
    >
      <path
        d="M6 3.5L10.5 8L6 12.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
