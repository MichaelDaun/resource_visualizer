import type { Graph, GraphNode } from "./data/graph";
import type { SupportType } from "./data/types";
import type { Place } from "./geo";

export type Reach = "local" | "county" | "national";

export interface FinderQuery {
  /** Where the company is; null means anywhere in the home counties. */
  place: Place | null;
  needs: Set<SupportType>;
}

export interface Offer {
  node: Extract<GraphNode, { kind: "initiative" }>;
  /** The needs this offer covers, in the order the company would read them. */
  matches: SupportType[];
  reach: Reach;
  score: number;
}

const REACH_SCORE: Record<Reach, number> = { local: 3, county: 2, national: 1 };

/**
 * Initiatives that a company in `place` could use for its `needs`: ongoing or
 * planned, available where the company is, ranked by how many needs they meet
 * and how close they are.
 */
export function findOffers(graph: Graph, query: FinderQuery): Offer[] {
  if (query.needs.size === 0) return [];
  const offers: Offer[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== "initiative" || node.initiative.status === "completed") continue;
    const matches = node.initiative.supportTypes.filter((s) => query.needs.has(s));
    if (matches.length === 0) continue;
    const reach = reachFor(node, query.place);
    if (!reach) continue;
    const score = matches.length * 10 + REACH_SCORE[reach] + (node.initiative.status === "ongoing" ? 1 : 0);
    offers.push({ node, matches, reach, score });
  }
  return offers.sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name, "sv"));
}

/** How an initiative reaches a place, or null if it does not serve it. */
export function reachFor(node: GraphNode, place: Place | null): Reach | null {
  if (node.counties.length === 0) return "national";
  if (!place) return "county";
  if (node.municipalities.some((m) => place.municipalities.includes(m))) return "local";
  if (node.counties.includes(place.county)) return "county";
  return null;
}
