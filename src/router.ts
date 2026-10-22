import type { Graph } from "./data/graph";
import type { AppState, View } from "./state";

/**
 * The URL hash keeps the current view and selection, so a link like
 * `#/karta/dika` opens the map with DIKA selected.
 */
const VIEW_SLUGS: Record<View, string> = { map: "karta", network: "natverk" };

export function readHash(graph: Graph, hash = window.location.hash): { view: View; selected: string | null } {
  const [, viewSlug, id] = decodeURIComponent(hash.replace(/^#/, "")).split("/");
  const view = (Object.keys(VIEW_SLUGS) as View[]).find((v) => VIEW_SLUGS[v] === viewSlug) ?? "map";
  return { view, selected: id && graph.byId.has(id) ? id : null };
}

export function hashFor(state: Pick<AppState, "view" | "selected">): string {
  return `#/${VIEW_SLUGS[state.view]}${state.selected ? `/${encodeURIComponent(state.selected)}` : ""}`;
}

export function writeHash(state: Pick<AppState, "view" | "selected">) {
  const hash = hashFor(state);
  if (window.location.hash !== hash) history.replaceState(null, "", hash);
}
