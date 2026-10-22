import type { EdgeType, GraphNode } from "./data/graph";
import type { ActorType, InitiativeKind } from "./data/types";

export const actorColors: Record<ActorType, string> = {
  region: "#2563a8",
  municipality: "#4a9fd8",
  university: "#7b3fa0",
  "business-support": "#d9822b",
  "science-park": "#2a9d8f",
  "research-institute": "#3f7f5f",
  "public-agency": "#5c6b7a",
  "eu-fund": "#c49a12",
  network: "#b5476b",
  other: "#8a7b6b",
};

export const kindColors: Record<InitiativeKind, string> = {
  project: "#e0603a",
  service: "#2f9e6e",
};

export interface EdgeStyle {
  color: string;
  width: number;
  dash?: string;
}

export const edgeStyles: Record<EdgeType, EdgeStyle> = {
  lead: { color: "#3b4452", width: 1.8 },
  partner: { color: "#8b95a3", width: 1.3 },
  funds: { color: "#c49a12", width: 1.8, dash: "6 4" },
  related: { color: "#e0603a", width: 1.6, dash: "1.5 4" },
  owns: { color: "#2563a8", width: 1.6 },
  manages: { color: "#5c6b7a", width: 1.4, dash: "6 4" },
  collaborates: { color: "#8b95a3", width: 1.3, dash: "1.5 4" },
};

export function nodeColor(node: GraphNode): string {
  return node.kind === "actor" ? actorColors[node.actor.type] : kindColors[node.initiative.kind];
}

export function nodeRadius(node: GraphNode): number {
  return node.kind === "actor" ? 10 : 7;
}
