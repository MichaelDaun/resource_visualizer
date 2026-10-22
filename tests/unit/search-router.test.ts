import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataset } from "../../src/data/dataset";
import { buildGraph } from "../../src/data/graph";
import { createGeoIndex, type SwedenTopology } from "../../src/geo";
import { hashFor, readHash } from "../../src/router";
import { search, searchNodes } from "../../src/ui/search";

const geo = createGeoIndex(JSON.parse(readFileSync("public/geo/sweden.topo.json", "utf8")) as SwedenTopology);
const graph = buildGraph(dataset, geo.locate);

describe("search", () => {
  it("ranks name prefix matches first", () => {
    expect(searchNodes(graph, "dika")[0].id).toBe("dika");
  });

  it("matches places and Swedish labels case-insensitively", () => {
    const ids = searchNodes(graph, "VÄXJÖ").map((n) => n.id);
    expect(ids).toContain("linnaeus-university");
    expect(searchNodes(graph, "hållbarhet").length).toBeGreaterThan(0);
  });

  it("finds places such as Öland and municipalities", () => {
    const first = search(graph, geo, "öland")[0];
    expect(first.type === "place" && first.place.id).toBe("oland");
    const hultsfred = search(graph, geo, "hultsfred")[0];
    expect(hultsfred.type === "place" && hultsfred.place.name).toBe("Hultsfreds kommun");
  });

  it("returns nothing for an empty query", () => {
    expect(search(graph, geo, "  ")).toEqual([]);
  });
});

describe("router", () => {
  it("round-trips view and selection", () => {
    const hash = hashFor({ view: "network", selected: "dika", place: null });
    expect(hash).toBe("#/natverk/dika");
    expect(readHash(graph, geo, hash)).toEqual({ view: "network", selected: "dika", place: null });
  });

  it("round-trips places", () => {
    const hash = hashFor({ view: "map", selected: null, place: "oland" });
    expect(hash).toBe("#/karta/plats/oland");
    expect(readHash(graph, geo, hash)).toEqual({ view: "map", selected: null, place: "oland" });
  });

  it("falls back to the map and ignores unknown ids", () => {
    expect(readHash(graph, geo, "#/okand/finns-inte")).toEqual({ view: "map", selected: null, place: null });
    expect(readHash(graph, geo, "#/karta/plats/atlantis")).toEqual({ view: "map", selected: null, place: null });
    expect(readHash(graph, geo, "")).toEqual({ view: "map", selected: null, place: null });
  });
});
