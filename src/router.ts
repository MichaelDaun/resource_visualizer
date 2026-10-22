import type { Graph } from "./data/graph";
import type { GeoIndex } from "./geo";
import type { AppState, View } from "./state";

/**
 * The URL hash keeps the current view, selection and place, so a link like
 * `#/karta/dika` opens the map with DIKA selected and `#/karta/plats/oland`
 * opens it zoomed in on Öland.
 */
const VIEW_SLUGS: Record<View, string> = { map: "karta", network: "natverk" };
const PLACE_SEGMENT = "plats";

type Route = Pick<AppState, "view" | "selected" | "place">;

export function readHash(graph: Graph, geo: GeoIndex, hash = window.location.hash): Route {
  const [, viewSlug, a, b] = decodeURIComponent(hash.replace(/^#/, "")).split("/");
  const view = (Object.keys(VIEW_SLUGS) as View[]).find((v) => VIEW_SLUGS[v] === viewSlug) ?? "map";
  if (a === PLACE_SEGMENT) return { view, selected: null, place: b && geo.placeById.has(b) ? b : null };
  return { view, selected: a && graph.byId.has(a) ? a : null, place: null };
}

export function hashFor(state: Route): string {
  const base = `#/${VIEW_SLUGS[state.view]}`;
  if (state.selected) return `${base}/${encodeURIComponent(state.selected)}`;
  if (state.place) return `${base}/${PLACE_SEGMENT}/${encodeURIComponent(state.place)}`;
  return base;
}

export function writeHash(state: Route) {
  const hash = hashFor(state);
  if (window.location.hash !== hash) history.replaceState(null, "", `${window.location.search}${hash}`);
}
