import type { Selection } from "d3-selection";
import type { GraphNode } from "../data/graph";
import { t } from "../i18n/sv";
import { nodeColor, nodeRadius, theme } from "../theme";

export type LabelSide = "right" | "left" | "below";

/** Splits a label into at most two lines of roughly `max` characters. */
export function wrapLabel(text: string, max = 22): string[] {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  let first = "";
  while (words.length > 0 && (first + " " + words[0]).trim().length <= max) first = (first + " " + words.shift()).trim();
  if (!first) first = words.shift() ?? "";
  const rest = words.join(" ");
  return rest ? [first, rest.length > max + 4 ? rest.slice(0, max + 2) + "…" : rest] : [first];
}

export function nodeAriaLabel(node: GraphNode): string {
  const type =
    node.kind === "actor"
      ? t.actorTypes[node.actor.type]
      : `${t.kinds[node.initiative.kind]}, ${t.statuses[node.initiative.status].toLowerCase()}`;
  return `${node.name} (${type})`;
}

/**
 * Renders the shape and label for each node into its <g>. Actors are circles,
 * initiatives rounded squares; an initiative's fill shows its status.
 */
export function drawGlyphs<T>(
  groups: Selection<SVGGElement, T, SVGGElement, unknown>,
  labelSide: LabelSide,
  nodeOf: (d: T) => GraphNode,
) {
  groups.each(function (d) {
    const node = nodeOf(d);
    const g = this as SVGGElement;
    g.replaceChildren();
    const ns = "http://www.w3.org/2000/svg";
    const color = nodeColor(node);
    const r = nodeRadius(node);

    // Pulsing ring behind the selected node (animated in CSS).
    const halo = document.createElementNS(ns, "circle");
    halo.setAttribute("class", "halo");
    halo.setAttribute("r", String(r + 4));
    halo.style.stroke = color;
    g.append(halo);

    let shape: SVGElement;
    if (node.kind === "actor") {
      shape = document.createElementNS(ns, "circle");
      shape.setAttribute("r", String(r));
    } else {
      shape = document.createElementNS(ns, "rect");
      const s = r * 1.8;
      shape.setAttribute("x", String(-s / 2));
      shape.setAttribute("y", String(-s / 2));
      shape.setAttribute("width", String(s));
      shape.setAttribute("height", String(s));
      shape.setAttribute("rx", "3");
      shape.setAttribute("transform", "rotate(45)");
    }
    shape.setAttribute("class", "glyph");
    const status = node.kind === "initiative" ? node.initiative.status : "ongoing";
    shape.style.fill = status === "planned" ? "var(--panel)" : status === "completed" ? theme.completed : color;
    shape.style.stroke = status === "ongoing" ? "var(--panel)" : color;
    // Lets theme filters such as glows pick up the node's own colour.
    shape.style.color = color;
    if (status === "planned") shape.setAttribute("stroke-dasharray", "3 2");
    g.append(shape);

    if (node.kind === "actor" && node.actor.type === "eu-fund") {
      const star = document.createElementNS(ns, "text");
      star.setAttribute("class", "glyph-mark");
      star.setAttribute("dy", "0.35em");
      star.textContent = "★";
      g.append(star);
    }

    const label = document.createElementNS(ns, "text");
    label.setAttribute("class", `label label-${node.kind}`);
    for (const line of wrapLabel(node.name)) {
      const tspan = document.createElementNS(ns, "tspan");
      tspan.textContent = line;
      label.append(tspan);
    }
    positionLabel(label, r, labelSide);
    g.append(label);
  });
}

/** Places a node's label (one <tspan> per line) beside or below a node of radius r. */
export function positionLabel(label: SVGTextElement, r: number, side: LabelSide) {
  const lines = [...label.querySelectorAll("tspan")];
  label.setAttribute("text-anchor", side === "right" ? "start" : side === "left" ? "end" : "middle");
  lines.forEach((tspan, i) => {
    if (side === "below") {
      tspan.setAttribute("x", "0");
      tspan.setAttribute("dy", i === 0 ? `${r + 12}px` : "1.1em");
    } else {
      tspan.setAttribute("x", String((side === "left" ? -1 : 1) * (r + 5)));
      tspan.setAttribute("dy", i === 0 ? `${0.35 - (lines.length - 1) * 0.55}em` : "1.1em");
    }
  });
}

/** Quadratic curve between two points, bending to the left of the direction of travel. */
export function curvedPath(x1: number, y1: number, x2: number, y2: number, bend = 0.18): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy) || 1;
  const offset = Math.min(70, d * bend);
  const mx = (x1 + x2) / 2 - (dy / d) * offset;
  const my = (y1 + y2) / 2 + (dx / d) * offset;
  return `M${x1.toFixed(1)},${y1.toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}
