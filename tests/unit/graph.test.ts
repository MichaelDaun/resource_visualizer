import { describe, expect, it } from "vitest";
import { buildGraph, neighbours } from "../../src/data/graph";
import type { Dataset } from "../../src/data/types";

const data: Dataset = {
  actors: [
    { id: "uni", name: "Uni", type: "university", locations: [{ place: "Kalmar", lat: 56.66, lng: 16.36 }] },
    { id: "region", name: "Region", type: "region", locations: [{ place: "Kalmar", lat: 56.66, lng: 16.36 }] },
    { id: "eu", name: "EU", type: "eu-fund" },
  ],
  initiatives: [
    { id: "a", name: "A", kind: "project", status: "ongoing", supportTypes: ["skills"], lead: "uni", funders: ["region", "eu"], related: ["b"] },
    { id: "b", name: "B", kind: "project", status: "planned", supportTypes: ["skills"], lead: "uni", related: ["a"] },
    { id: "c", name: "C", kind: "service", status: "ongoing", supportTypes: ["advisory"], lead: "eu" },
  ],
  relations: [{ from: "region", to: "uni", type: "collaborates" }],
};

describe("buildGraph", () => {
  const graph = buildGraph(data);

  it("creates a node per actor and initiative", () => {
    expect(graph.nodes.map((n) => n.id)).toEqual(["uni", "region", "eu", "a", "b", "c"]);
  });

  it("places initiatives at their lead's primary location", () => {
    expect(graph.byId.get("a")!.location?.place).toBe("Kalmar");
    expect(graph.byId.get("c")!.location).toBeUndefined();
  });

  it("creates lead, funding and actor relation edges", () => {
    const types = graph.edges.map((e) => `${e.type}:${e.source}>${e.target}`);
    expect(types).toContain("lead:uni>a");
    expect(types).toContain("funds:region>a");
    expect(types).toContain("funds:eu>a");
    expect(types).toContain("collaborates:region>uni");
  });

  it("keeps a single edge for sister initiatives listed on both sides", () => {
    expect(graph.edges.filter((e) => e.type === "related")).toHaveLength(1);
  });

  it("finds direct neighbours", () => {
    expect([...neighbours(graph, "a")].sort()).toEqual(["a", "b", "eu", "region", "uni"]);
  });
});
