import type { Actor, ActorRelationType, Dataset, Initiative, Location } from "./types";

export type EdgeType = "lead" | "partner" | "funds" | "related" | ActorRelationType;

export type GraphNode =
  | { id: string; kind: "actor"; name: string; actor: Actor; location?: Location }
  | { id: string; kind: "initiative"; name: string; initiative: Initiative; location?: Location };

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  note?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byId: Map<string, GraphNode>;
  /** Edges touching each node id. */
  incident: Map<string, GraphEdge[]>;
}

/**
 * Turns the dataset into a graph. Initiatives have no coordinates of their
 * own; they are placed at the primary location of the actor that leads them.
 */
export function buildGraph(data: Dataset): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const actorsById = new Map(data.actors.map((a) => [a.id, a]));

  for (const actor of data.actors) {
    nodes.push({ id: actor.id, kind: "actor", name: actor.name, actor, location: actor.locations?.[0] });
  }

  const add = (source: string, target: string, type: EdgeType, note?: string) =>
    edges.push({ id: `${type}:${source}:${target}`, source, target, type, note });

  for (const initiative of data.initiatives) {
    const lead = actorsById.get(initiative.lead);
    nodes.push({
      id: initiative.id,
      kind: "initiative",
      name: initiative.name,
      initiative,
      location: lead?.locations?.[0],
    });
    add(initiative.lead, initiative.id, "lead");
    for (const id of initiative.partners ?? []) add(id, initiative.id, "partner");
    for (const id of initiative.funders ?? []) add(id, initiative.id, "funds");
  }

  // Sister relations are symmetric; keep one edge per pair however it was listed.
  const seenPairs = new Set<string>();
  for (const initiative of data.initiatives) {
    for (const other of initiative.related ?? []) {
      const pair = [initiative.id, other].sort().join("|");
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      add(initiative.id, other, "related");
    }
  }

  for (const r of data.relations) add(r.from, r.to, r.type, r.note);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incident = new Map<string, GraphEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    incident.get(e.source)!.push(e);
    incident.get(e.target)!.push(e);
  }
  return { nodes, edges, byId, incident };
}

export function neighbours(graph: Graph, id: string): Set<string> {
  const result = new Set<string>([id]);
  for (const e of graph.incident.get(id) ?? []) {
    result.add(e.source);
    result.add(e.target);
  }
  return result;
}

export function otherEnd(edge: GraphEdge, id: string): string {
  return edge.source === id ? edge.target : edge.source;
}
