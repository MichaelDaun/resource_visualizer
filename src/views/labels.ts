export interface LabelCandidate {
  id: string;
  /** Node centre in screen pixels. */
  x: number;
  y: number;
  r: number;
  lines: string[];
  fontSize: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Rough text width; good enough to keep labels from colliding. */
const CHAR_WIDTH = 0.58;

export type LabelSide = "right" | "left";

export function labelBox(c: LabelCandidate, side: LabelSide = "right"): Box {
  const longest = Math.max(...c.lines.map((l) => l.length));
  const width = longest * c.fontSize * CHAR_WIDTH;
  const halfHeight = c.lines.length * c.fontSize * 0.6;
  const x0 = side === "right" ? c.x + c.r + 4 : c.x - c.r - 4 - width;
  return { x0, x1: x0 + width, y0: c.y - halfHeight, y1: c.y + halfHeight };
}

function overlaps(a: Box, b: Box, pad = 2): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

function hitsCircle(box: Box, x: number, y: number, r: number): boolean {
  const cx = Math.max(box.x0, Math.min(x, box.x1));
  const cy = Math.max(box.y0, Math.min(y, box.y1));
  return (cx - x) ** 2 + (cy - y) ** 2 < r * r;
}

const SIDES: LabelSide[] = ["right", "left"];

/**
 * Greedily places labels in priority order, to the right of the node or else
 * to the left, skipping any that would overlap a label already placed or
 * another node. Returns the side chosen for each label that fits.
 */
export function pickLabels(
  candidates: LabelCandidate[],
  obstacles: LabelCandidate[],
  bounds?: { width: number; height: number },
): Map<string, LabelSide> {
  const placed: Box[] = [];
  const shown = new Map<string, LabelSide>();
  const inside = (b: Box) => !bounds || (b.x0 >= 2 && b.y0 >= 2 && b.x1 <= bounds.width - 2 && b.y1 <= bounds.height - 2);
  for (const c of candidates) {
    for (const side of SIDES) {
      const box = labelBox(c, side);
      if (!inside(box)) continue;
      if (placed.some((p) => overlaps(p, box))) continue;
      if (obstacles.some((o) => o.id !== c.id && hitsCircle(box, o.x, o.y, o.r + 1))) continue;
      placed.push(box);
      shown.set(c.id, side);
      break;
    }
  }
  return shown;
}
