import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGeoIndex, slug, type SwedenTopology } from "../../src/geo";
import { countyName, municipalityName } from "../../src/i18n/sv";

const topo = JSON.parse(readFileSync("public/geo/sweden.topo.json", "utf8")) as SwedenTopology;
const geo = createGeoIndex(topo);

describe("geo index", () => {
  it("locates towns, including coastal ones", () => {
    expect(geo.locate(56.6634, 16.3567)).toEqual({ county: "08", municipality: "0880" }); // Kalmar
    expect(geo.locate(57.4554, 15.8336)).toEqual({ county: "08", municipality: "0860" }); // Hultsfred
    expect(geo.locate(56.8790, 14.8059)).toEqual({ county: "07", municipality: "0780" }); // Växjö
    expect(geo.locate(56.8907, 16.7364)).toEqual({ county: "08", municipality: "0885" }); // Borgholm
  });

  it("returns nothing far outside Sweden", () => {
    expect(geo.locate(52.52, 13.4)).toEqual({});
  });

  it("offers counties, Öland and the municipalities of both counties as places", () => {
    const ids = geo.places.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["kalmar-lan", "kronobergs-lan", "oland", "hultsfred", "vaxjo"]));
    expect(geo.places.filter((p) => p.kind === "municipality")).toHaveLength(20);
    expect(geo.placeById.get("oland")!.municipalities).toEqual(["0885", "0840"]);
  });
});

describe("Swedish place names", () => {
  it("uses the genitive", () => {
    expect(municipalityName("Hultsfred")).toBe("Hultsfreds kommun");
    expect(municipalityName("Växjö")).toBe("Växjö kommun");
    expect(municipalityName("Kalmar")).toBe("Kalmar kommun");
    expect(municipalityName("Torsås")).toBe("Torsås kommun");
    expect(countyName("Kronoberg")).toBe("Kronobergs län");
    expect(countyName("Kalmar")).toBe("Kalmar län");
  });

  it("slugs Swedish names", () => {
    expect(slug("Mörbylånga")).toBe("morbylanga");
    expect(slug("Kronobergs län")).toBe("kronobergs-lan");
  });
});

describe("data and geography together", () => {
  it("every `serves` entry names a known municipality", async () => {
    const { dataset } = await import("../../src/data/dataset");
    const unknown = dataset.initiatives.flatMap((i) => (i.serves ?? []).filter((name) => !geo.municipalityByName(name)));
    expect(unknown).toEqual([]);
  });

  it("every located actor lies in Sweden", async () => {
    const { dataset } = await import("../../src/data/dataset");
    const outside = dataset.actors.flatMap((a) =>
      (a.locations ?? []).filter((l) => !geo.locate(l.lat, l.lng).municipality).map((l) => `${a.id} @ ${l.place}`),
    );
    expect(outside).toEqual([]);
  });
});
