import type { Actor, ActorRelationType, Dataset, Initiative, Location } from "./types";

export type EdgeType = "lead" | "partner" | "funds" | ActorRelationType;

interface NodeBase {
  id: string;
  name: string;
  location?: Location;
  /** Counties the node belongs to: where an actor has sites, or where an initiative's lead and partners are. */
  counties: string[];
  /** Municipality code of the primary location. */
  municipality?: string;
  /** All municipalities the node is present in: an actor's sites, or an initiative's lead and partners. */
  municipalities: string[];
}

export type GraphNode =
  | (NodeBase & { kind: "actor"; actor: Actor })
  | (NodeBase & { kind: "initiative"; initiative: Initiative });

export type Locate = (lat: number, lng: number) => { county?: string; municipality?: string };

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
export function buildGraph(data: Dataset, locate: Locate = () => ({})): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const actorsById = new Map(data.actors.map((a) => [a.id, a]));

  const actorCounties = new Map<string, string[]>();
  const actorMunicipalities = new Map<string, string[]>();
  for (const actor of data.actors) {
    const places = (actor.locations ?? []).map((l) => locate(l.lat, l.lng));
    const counties = [...new Set(places.flatMap((p) => (p.county ? [p.county] : [])))];
    const municipalities = [...new Set(places.flatMap((p) => (p.municipality ? [p.municipality] : [])))];
    actorCounties.set(actor.id, counties);
    actorMunicipalities.set(actor.id, municipalities);
    nodes.push({
      id: actor.id,
      kind: "actor",
      name: actor.name,
      actor,
      location: actor.locations?.[0],
      counties,
      municipality: places[0]?.municipality,
      municipalities,
    });
  }

  const add = (source: string, target: string, type: EdgeType, note?: string) =>
    edges.push({ id: `${type}:${source}:${target}`, source, target, type, note });

  for (const initiative of data.initiatives) {
    const lead = actorsById.get(initiative.lead);
    const involved = [initiative.lead, ...(initiative.partners ?? [])];
    const location = lead?.locations?.[0];
    nodes.push({
      id: initiative.id,
      kind: "initiative",
      name: initiative.name,
      initiative,
      location,
      counties: [...new Set(involved.flatMap((id) => actorCounties.get(id) ?? []))],
      municipality: location ? locate(location.lat, location.lng).municipality : undefined,
      municipalities: [...new Set(involved.flatMap((id) => actorMunicipalities.get(id) ?? []))],
    });
    add(initiative.lead, initiative.id, "lead");
    for (const id of initiative.partners ?? []) add(id, initiative.id, "partner");
    for (const id of initiative.funders ?? []) add(id, initiative.id, "funds");
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
