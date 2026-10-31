import { toScreen, type Rect, type Viewport } from "./transforms";

export interface PlanLabelInput {
  id: string;
  bounds: Rect;
  text: string;
  priority: number;
  selected: boolean;
}

export interface PlanLabel extends Rect {
  id: string;
  text: string;
  anchor: { x: number; y: number };
}

const HEIGHT = 30;
const GAP = 6;
const MARGIN = 8;

/** Presentation only: place readable screen-space labels without changing source geometry. */
export function layoutPlanLabels(inputs: readonly PlanLabelInput[], view: Viewport, viewport: { width: number; height: number }) {
  const labels: PlanLabel[] = [];
  let hiddenCount = 0;
  // Leave space for the viewer's interaction hint at the bottom.
  const bottom = viewport.height - 40;
  if (viewport.width < 80 || bottom < HEIGHT + MARGIN * 2) return { labels, hiddenCount: inputs.length };
  const ordered = [...inputs].sort((a, b) => Number(b.selected) - Number(a.selected) || a.priority - b.priority);
  for (const input of ordered) {
    const topLeft = toScreen(input.bounds, view);
    const right = topLeft.x + input.bounds.width * view.scale;
    const lower = topLeft.y + input.bounds.height * view.scale;
    if (right < 0 || lower < 0 || topLeft.x > viewport.width || topLeft.y > bottom) continue;
    const anchor = {
      x: (Math.max(0, topLeft.x) + Math.min(viewport.width, right)) / 2,
      y: Math.max(MARGIN, topLeft.y),
    };
    const width = Math.min(280, viewport.width - MARGIN * 2, Math.max(88, Array.from(input.text).length * 7.3 + 24));
    let placed = false;
    // Nearby rows and columns keep leaders short; selected and urgent labels get first choice.
    for (let row = 0; row < 4 && !placed; row++) {
      for (const y of [anchor.y - HEIGHT - 10 - row * (HEIGHT + GAP), anchor.y + 12 + row * (HEIGHT + GAP)]) {
        if (y < MARGIN || y + HEIGHT > bottom) continue;
        for (const rawX of [anchor.x - width / 2, anchor.x + 14, anchor.x - width - 14]) {
          const x = Math.max(MARGIN, Math.min(viewport.width - MARGIN - width, rawX));
          const candidate = { x, y, width, height: HEIGHT };
          if (labels.some((label) => x < label.x + label.width + GAP && x + width + GAP > label.x && y < label.y + label.height + GAP && y + HEIGHT + GAP > label.y)) continue;
          labels.push({ ...candidate, id: input.id, text: input.text, anchor });
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
    if (!placed) hiddenCount++;
  }
  return { labels, hiddenCount };
}
