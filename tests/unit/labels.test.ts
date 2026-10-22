import { describe, expect, it } from "vitest";
import { pickLabels, type LabelCandidate } from "../../src/views/labels";
import { wrapLabel } from "../../src/views/glyphs";

const at = (id: string, x: number, y: number, name = "Label"): LabelCandidate => ({
  id,
  x,
  y,
  r: 8,
  lines: [name],
  fontSize: 12,
});

describe("pickLabels", () => {
  it("shows labels that do not collide", () => {
    const c = [at("a", 0, 0), at("b", 0, 100)];
    expect([...pickLabels(c, c).keys()]).toEqual(["a", "b"]);
  });

  it("moves a label to the left when the right side is taken", () => {
    const c = [at("a", 0, 0), at("b", 40, 0)];
    const shown = pickLabels(c, []);
    expect(shown.get("a")).toBe("right");
    expect(shown.get("b")).toBe("right");
    const crowded = [at("a", 0, 0), at("b", -2, 4)];
    expect(pickLabels(crowded, []).get("b")).toBe("left");
  });

  it("drops a label with no free side, keeping the higher-priority one", () => {
    const c = [at("a", 0, 0), at("b", 0, 2), at("c", 0, 4)];
    const shown = pickLabels(c, []);
    expect(shown.has("a")).toBe(true);
    expect(shown.size).toBe(2);
  });
});

describe("wrapLabel", () => {
  it("keeps short labels on one line", () => {
    expect(wrapLabel("Almi Kalmar län")).toEqual(["Almi Kalmar län"]);
  });

  it("wraps long labels onto two lines", () => {
    expect(wrapLabel("Europeiska regionala utvecklingsfonden")).toEqual(["Europeiska regionala", "utvecklingsfonden"]);
  });
});
