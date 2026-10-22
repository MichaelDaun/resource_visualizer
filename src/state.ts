import type { Graph, GraphNode } from "./data/graph";
import {
  ACTOR_TYPES,
  INITIATIVE_KINDS,
  STATUSES,
  SUPPORT_TYPES,
  type ActorType,
  type InitiativeKind,
  type Status,
  type SupportType,
} from "./data/types";

export type View = "map" | "network";

export interface Filters {
  supportTypes: Set<SupportType>;
  statuses: Set<Status>;
  kinds: Set<InitiativeKind>;
  actorTypes: Set<ActorType>;
}

export interface AppState {
  view: View;
  selected: string | null;
  hovered: string | null;
  filters: Filters;
}

export function defaultFilters(): Filters {
  return {
    supportTypes: new Set(SUPPORT_TYPES),
    statuses: new Set(STATUSES),
    kinds: new Set(INITIATIVE_KINDS),
    actorTypes: new Set(ACTOR_TYPES),
  };
}

type Listener = (state: AppState, previous: AppState) => void;

/** Minimal observable store shared by all views. */
export class Store {
  private listeners = new Set<Listener>();
  constructor(private current: AppState) {}

  get state(): AppState {
    return this.current;
  }

  update(patch: Partial<AppState>) {
    const previous = this.current;
    this.current = { ...previous, ...patch };
    for (const l of this.listeners) l(this.current, previous);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function isNodeVisible(node: GraphNode, filters: Filters): boolean {
  if (node.kind === "actor") return filters.actorTypes.has(node.actor.type);
  const i = node.initiative;
  return (
    filters.kinds.has(i.kind) && filters.statuses.has(i.status) && i.supportTypes.some((s) => filters.supportTypes.has(s))
  );
}

export function visibleNodeIds(graph: Graph, filters: Filters): Set<string> {
  return new Set(graph.nodes.filter((n) => isNodeVisible(n, filters)).map((n) => n.id));
}

export function filtersAreDefault(filters: Filters): boolean {
  const d = defaultFilters();
  return (Object.keys(d) as (keyof Filters)[]).every((k) => d[k].size === filters[k].size);
}
