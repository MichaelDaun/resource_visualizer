/**
 * MapLibre style for the basemap, built from the active theme's map colours.
 * Tiles come from OpenFreeMap (OpenMapTiles schema); the home counties,
 * municipalities, the selected place and actor buildings are GeoJSON sources
 * filled in by views/map-view.ts.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { MapColors } from "../theme";

export const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];
const ITALIC = ["Noto Sans Italic"];

/** GeoJSON sources the map view updates at runtime. */
export const SOURCES = {
  mask: "outside-home",
  counties: "home-counties",
  municipalities: "home-municipalities",
  municipalityLabels: "municipality-labels",
  place: "selected-place",
  buildings: "actor-buildings",
} as const;

/** Layers the map view listens to or filters. */
export const LAYERS = {
  municipalityHit: "municipality-hit",
  buildingFocus: "actor-building-focus",
  buildingFocusLine: "actor-building-focus-line",
} as const;

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const NAME: ExpressionSpecification = ["coalesce", ["get", "name:sv"], ["get", "name"]];

/** Interpolates line widths exponentially with zoom. */
function width(...stops: number[]): ExpressionSpecification {
  return ["interpolate", ["exponential", 1.5], ["zoom"], ...stops] as ExpressionSpecification;
}

function roads(c: MapColors): LayerSpecification[] {
  const classes = (...names: string[]): ExpressionSpecification => ["match", ["get", "class"], names, true, false];
  const notTunnel: ExpressionSpecification = ["!=", ["get", "brunnel"], "tunnel"];
  const road = (
    id: string,
    filter: ExpressionSpecification,
    minzoom: number,
    color: string,
    casing: string,
    w: number[],
  ): LayerSpecification[] => [
    {
      id: `${id}-casing`,
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: Math.max(minzoom, 11),
      filter: ["all", filter, notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": casing, "line-width": width(...w.map((v, i) => (i % 2 ? v + 1.6 : v))) },
    },
    {
      id,
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom,
      filter: ["all", filter, notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": width(...w) },
    },
  ];
  return [
    ...road("road-minor", classes("minor", "service"), 13, c.road, c.roadCasing, [13, 0.6, 16, 5, 19, 16]),
    ...road("road-secondary", classes("secondary", "tertiary"), 9, c.road, c.roadCasing, [9, 0.5, 13, 2, 16, 7, 19, 20]),
    ...road("road-primary", classes("primary"), 8, c.road, c.roadCasing, [8, 0.6, 13, 2.6, 16, 9, 19, 24]),
    ...road("road-major", classes("motorway", "trunk"), 6, c.major, c.majorCasing, [6, 0.7, 10, 1.6, 13, 3.2, 16, 10, 19, 28]),
    {
      id: "rail",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 9,
      filter: ["all", ["==", ["get", "class"], "rail"], notTunnel],
      paint: { "line-color": c.rail, "line-width": width(9, 0.6, 16, 2), "line-dasharray": [3, 2] },
    },
  ];
}

export function mapStyle(c: MapColors): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      openmaptiles: { type: "vector", url: TILES },
      [SOURCES.mask]: { type: "geojson", data: EMPTY },
      [SOURCES.counties]: { type: "geojson", data: EMPTY },
      [SOURCES.municipalities]: { type: "geojson", data: EMPTY, promoteId: "code" },
      [SOURCES.municipalityLabels]: { type: "geojson", data: EMPTY },
      [SOURCES.place]: { type: "geojson", data: EMPTY },
      [SOURCES.buildings]: { type: "geojson", data: EMPTY },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": c.land } },
      {
        id: "landuse-residential",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        minzoom: 9,
        filter: ["match", ["get", "class"], ["residential", "suburb", "neighbourhood"], true, false],
        paint: { "fill-color": c.residential, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 12, 1] },
      },
      {
        id: "landuse-industrial",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        minzoom: 11,
        filter: ["match", ["get", "class"], ["industrial", "commercial", "retail"], true, false],
        paint: { "fill-color": c.industrial },
      },
      {
        id: "landcover-farmland",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "farmland"],
        paint: { "fill-color": c.farmland },
      },
      {
        id: "landcover-grass",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["match", ["get", "class"], ["grass", "wetland"], true, false],
        paint: { "fill-color": c.grass },
      },
      {
        id: "landcover-wood",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "wood"],
        paint: { "fill-color": c.wood },
      },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": c.water },
      },
      {
        id: "water-line",
        type: "line",
        source: "openmaptiles",
        "source-layer": "water",
        minzoom: 7,
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "line-color": c.waterLine, "line-width": 0.6 },
      },
      {
        id: "waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        minzoom: 9,
        filter: ["match", ["get", "class"], ["river", "canal"], true, false],
        paint: { "line-color": c.water, "line-width": width(9, 0.8, 16, 5) },
      },
      // Land outside the home counties is washed out, so the counties stand out.
      { id: "outside-home", type: "fill", source: SOURCES.mask, paint: { "fill-color": c.outside, "fill-opacity": 0.62 } },
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": c.building,
          "fill-outline-color": c.buildingLine,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, 1],
        },
      },
      ...roads(c),
      {
        id: "selected-place-fill",
        type: "fill",
        source: SOURCES.place,
        paint: { "fill-color": c.countyBorder, "fill-opacity": 0.08 },
      },
      {
        id: LAYERS.municipalityHit,
        type: "fill",
        source: SOURCES.municipalities,
        paint: {
          "fill-color": c.municipalityBorder,
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.18, 0],
        },
      },
      {
        id: "boundary-national",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["all", ["<=", ["get", "admin_level"], 4], ["==", ["get", "maritime"], 0]],
        paint: { "line-color": c.municipalityBorder, "line-width": width(5, 0.6, 12, 1.4) },
      },
      {
        id: "municipality-border",
        type: "line",
        source: SOURCES.municipalities,
        layout: { "line-join": "round" },
        paint: { "line-color": c.municipalityBorder, "line-width": width(6, 0.6, 12, 1.6) },
      },
      {
        id: "county-border",
        type: "line",
        source: SOURCES.counties,
        layout: { "line-join": "round" },
        paint: { "line-color": c.countyBorder, "line-width": width(6, 1.4, 12, 2.6) },
      },
      {
        id: "selected-place-line",
        type: "line",
        source: SOURCES.place,
        layout: { "line-join": "round" },
        paint: { "line-color": c.countyBorder, "line-width": width(6, 2, 12, 3.4), "line-dasharray": [3, 2] },
      },
      // Buildings that actors are in, tinted in the actor's colour; the selected one is outlined.
      {
        id: "actor-building",
        type: "fill",
        source: SOURCES.buildings,
        minzoom: 13,
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.32 },
      },
      {
        id: LAYERS.buildingFocus,
        type: "fill",
        source: SOURCES.buildings,
        minzoom: 12,
        filter: ["==", ["get", "actor"], ""],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 },
      },
      {
        id: LAYERS.buildingFocusLine,
        type: "line",
        source: SOURCES.buildings,
        minzoom: 12,
        filter: ["==", ["get", "actor"], ""],
        paint: { "line-color": c.labelCity, "line-width": 1.6 },
      },
      {
        id: "road-name",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": NAME,
          "text-font": REGULAR,
          "text-size": 11,
        },
        paint: { "text-color": c.labelMinor, "text-halo-color": c.halo, "text-halo-width": 1.4 },
      },
      ...(["point", "line"] as const).map(
        (placement): LayerSpecification => ({
          id: `water-name-${placement}`,
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "water_name",
          filter: [
            "all",
            ["match", ["get", "class"], ["lake", "bay", "strait", "sea"], true, false],
            ["==", ["geometry-type"], placement === "line" ? "LineString" : "Point"],
          ],
          layout: {
            "text-field": NAME,
            "text-font": ITALIC,
            "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 13, 14],
            "symbol-placement": placement,
            "text-max-width": 7,
          },
          paint: { "text-color": c.labelWater, "text-halo-color": c.halo, "text-halo-width": 1.2 },
        }),
      ),
      // Municipality names in the overview; towns take over when zooming in.
      {
        id: "municipality-name",
        type: "symbol",
        source: SOURCES.municipalityLabels,
        maxzoom: 9,
        layout: {
          "text-field": ["get", "name"],
          "text-font": BOLD,
          "text-size": 10,
          "text-transform": "uppercase",
          "text-letter-spacing": 0.14,
          "text-padding": 4,
        },
        paint: {
          "text-color": c.labelMinor,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 8.2, 0.8, 9, 0],
          "text-halo-color": c.halo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "place-minor",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 11,
        filter: ["match", ["get", "class"], ["village", "suburb", "hamlet", "neighbourhood", "quarter"], true, false],
        layout: { "text-field": NAME, "text-font": REGULAR, "text-size": 11.5, "text-max-width": 8 },
        paint: { "text-color": c.labelMinor, "text-halo-color": c.halo, "text-halo-width": 1.4 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 8.6,
        filter: ["==", ["get", "class"], "town"],
        layout: { "text-field": NAME, "text-font": BOLD, "text-size": 12.5, "text-max-width": 8 },
        paint: { "text-color": c.labelTown, "text-halo-color": c.halo, "text-halo-width": 1.6 },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 6,
        filter: ["==", ["get", "class"], "city"],
        layout: {
          "text-field": NAME,
          "text-font": BOLD,
          "text-size": ["interpolate", ["linear"], ["zoom"], 6, 12, 12, 17],
        },
        paint: { "text-color": c.labelCity, "text-halo-color": c.halo, "text-halo-width": 1.8 },
      },
    ],
  };
}
