import type { Selection } from "d3-selection";
import { neighbours, type Graph, type GraphEdge } from "../data/graph";
import type { AppState } from "../state";

export interface FocusSet {
  id: string;
  nodes: Set<string>;
}

/** The node in focus (selected, else hovered) and its direct neighbours. */
export function focusSet(graph: Graph, state: AppState): FocusSet | null {
  const id = state.selected ?? state.hovered;
  if (!id || !graph.byId.has(id)) return null;
  return { id, nodes: neighbours(graph, id) };
}

/** Dims everything outside the focus set and emphasises edges touching the focused node. */
export function applyHighlight<N, E>(
  nodes: Selection<SVGGElement, N, SVGGElement, unknown>,
  edges: Selection<SVGPathElement, E, SVGGElement, unknown>,
  focus: FocusSet | null,
  nodeId: (d: N) => string,
  edgeOf: (d: E) => GraphEdge,
) {
  nodes
    .classed("dim", (d) => focus !== null && !focus.nodes.has(nodeId(d)))
    .classed("in-focus", (d) => focus !== null && focus.nodes.has(nodeId(d)))
    .classed("selected", (d) => focus?.id === nodeId(d));
  edges
    .classed("dim", (d) => focus !== null && edgeOf(d).source !== focus.id && edgeOf(d).target !== focus.id)
    .classed("hl", (d) => focus !== null && (edgeOf(d).source === focus.id || edgeOf(d).target === focus.id));
  // Keep the focused node on top of its neighbours.
  nodes.filter((d) => focus?.id === nodeId(d)).raise();
}
