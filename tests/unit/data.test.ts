import { describe, expect, it } from "vitest";
import { rawData } from "../../src/data/raw";
import { validateDataset } from "../../src/data/validate";

describe("data files", () => {
  it("are valid", () => {
    expect(validateDataset(rawData)).toEqual([]);
  });
});

describe("validateDataset", () => {
  const actor = { id: "a", name: "A", type: "region", locations: [{ place: "Kalmar", lat: 56.66, lng: 16.36 }] };
  const initiative = { id: "p", name: "P", kind: "project", status: "ongoing", supportTypes: ["advisory"], lead: "a" };

  it("accepts a minimal dataset", () => {
    expect(validateDataset({ actors: [actor], initiatives: [initiative], relations: [] })).toEqual([]);
  });

  it("accepts empty files", () => {
    expect(validateDataset({ actors: null, initiatives: null, relations: null })).toEqual([]);
  });

  it("reports unknown references", () => {
    const errors = validateDataset({
      actors: [actor],
      initiatives: [{ ...initiative, lead: "missing", funders: ["nope"] }],
      relations: [{ from: "a", to: "zzz", type: "owns" }],
    });
    expect(errors.join("\n")).toMatch(/lead.*missing/);
    expect(errors.join("\n")).toMatch(/funders.*nope/);
    expect(errors.join("\n")).toMatch(/to.*zzz/);
  });

  it("reports duplicate ids across files", () => {
    const errors = validateDataset({ actors: [actor], initiatives: [{ ...initiative, id: "a" }], relations: [] });
    expect(errors.join("\n")).toMatch(/duplicate id "a"/);
  });

  it("reports bad enums, dates and coordinates", () => {
    const errors = validateDataset({
      actors: [{ ...actor, type: "bank", locations: [{ place: "Oslo", lat: 59.9, lng: 5 }] }],
      initiatives: [{ ...initiative, status: "paused", supportTypes: ["magic"], start: 2024, end: "2023-13" }],
      relations: [],
    });
    const text = errors.join("\n");
    expect(text).toMatch(/"type" must be one of/);
    expect(text).toMatch(/"lng" must be a longitude/);
    expect(text).toMatch(/"status" must be one of/);
    expect(text).toMatch(/unknown support type "magic"/);
    expect(text).toMatch(/"start" must be written/);
    expect(text).toMatch(/"end" must be written/);
  });
});
