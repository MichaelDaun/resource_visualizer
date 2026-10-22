import { describe, expect, it } from "vitest";
import { buildGraph } from "../../src/data/graph";
import type { Dataset } from "../../src/data/types";
import { findOffers } from "../../src/finder";
import type { Place } from "../../src/geo";

const kalmar = { lat: 56.66, lng: 16.36, place: "Kalmar" };
const vaxjo = { lat: 56.88, lng: 14.81, place: "Växjö" };
const locate = (lat: number) => (lat > 56.8 ? { county: "07", municipality: "0780" } : { county: "08", municipality: "0880" });

const data: Dataset = {
  actors: [
    { id: "k", name: "Kalmar actor", type: "business-support", locations: [kalmar] },
    { id: "v", name: "Växjö actor", type: "business-support", locations: [vaxjo] },
    { id: "nat", name: "National", type: "public-agency" },
  ],
  initiatives: [
    { id: "k-loans", name: "Kalmar loans", kind: "service", status: "ongoing", supportTypes: ["financing"], lead: "k" },
    { id: "k-both", name: "Kalmar both", kind: "project", status: "ongoing", supportTypes: ["financing", "advisory"], lead: "k" },
    { id: "v-loans", name: "Växjö loans", kind: "service", status: "ongoing", supportTypes: ["financing"], lead: "v" },
    { id: "nat-grant", name: "National grant", kind: "funding", status: "ongoing", supportTypes: ["financing"], lead: "nat" },
    { id: "old", name: "Old", kind: "project", status: "completed", supportTypes: ["financing"], lead: "k" },
  ],
  relations: [],
};
const graph = buildGraph(data, locate);
const kalmarPlace: Place = {
  id: "kalmar",
  kind: "municipality",
  name: "Kalmar kommun",
  municipalities: ["0880"],
  county: "08",
  feature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
};

describe("findOffers", () => {
  it("returns nothing until a need is chosen", () => {
    expect(findOffers(graph, { place: null, needs: new Set() })).toEqual([]);
  });

  it("ranks by matched needs, then closeness, and skips completed and other counties", () => {
    const offers = findOffers(graph, { place: kalmarPlace, needs: new Set(["financing", "advisory"]) });
    expect(offers.map((o) => [o.node.id, o.reach])).toEqual([
      ["k-both", "local"],
      ["k-loans", "local"],
      ["nat-grant", "national"],
    ]);
    expect(offers[0].matches).toEqual(["financing", "advisory"]);
  });

  it("includes both counties when no place is chosen", () => {
    const ids = findOffers(graph, { place: null, needs: new Set(["financing"]) }).map((o) => o.node.id);
    expect(ids).toContain("v-loans");
    expect(ids).toContain("k-loans");
    expect(ids).not.toContain("old");
  });
});
