import { describe, expect, it } from "vitest";
import { dataset } from "../../src/data/dataset";
import { buildGraph } from "../../src/data/graph";
import { hashFor, readHash } from "../../src/router";
import { searchNodes } from "../../src/ui/search";

const graph = buildGraph(dataset);

describe("searchNodes", () => {
  it("ranks name prefix matches first", () => {
    expect(searchNodes(graph, "dika")[0].id).toBe("dika");
  });

  it("matches places and Swedish labels case-insensitively", () => {
    const ids = searchNodes(graph, "VÄXJÖ").map((n) => n.id);
    expect(ids).toContain("linnaeus-university");
    expect(searchNodes(graph, "hållbarhet").length).toBeGreaterThan(0);
  });

  it("returns nothing for an empty query", () => {
    expect(searchNodes(graph, "  ")).toEqual([]);
  });
});

describe("router", () => {
  it("round-trips view and selection", () => {
    const hash = hashFor({ view: "network", selected: "dika" });
    expect(hash).toBe("#/natverk/dika");
    expect(readHash(graph, hash)).toEqual({ view: "network", selected: "dika" });
  });

  it("falls back to the map and ignores unknown ids", () => {
    expect(readHash(graph, "#/okand/finns-inte")).toEqual({ view: "map", selected: null });
    expect(readHash(graph, "")).toEqual({ view: "map", selected: null });
  });
});
