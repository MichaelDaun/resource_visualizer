import { Map as MapLibreMap, type MapGeoJSONFeature, type PaddingOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { select } from "d3-selection";
import "d3-transition";
import { easeCubicInOut } from "d3-ease";
import { geoBounds, geoCentroid, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { forceCollide, forceLink, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Feature, FeatureCollection, Geometry, Polygon, Position } from "geojson";
import type { Graph, GraphEdge, GraphNode } from "../data/graph";
import type { Location } from "../data/types";
import { HOME_COUNTIES, isHomeCounty, type DetailLayers, type GeoIndex, type Place } from "../geo";
import { t } from "../i18n/sv";
import { defaultFilters, isNodeVisible, type Filters, type Store } from "../state";
import { nodeColor, nodeRadius, theme } from "../theme";
import { curvedPath, drawGlyphs, nodeAriaLabel, positionLabel, wrapLabel } from "./glyphs";
import { pickLabels, type LabelCandidate } from "./labels";
import { focusSet, type FocusSet } from "./highlight";
import { LAYERS, mapStyle, SOURCES } from "./map-style";
import { reducedMotion, type View } from "./view";

const SHELF = { width: 212, margin: 16, row: 32, header: 40 };
const NARROW = 720;
/** Height of the national box when it runs along the bottom on phones. */
const NARROW_SHELF = 62;
/** Width of the details sheet on wide screens, kept clear when zooming to something. */
const SHEET = 400;
/** Height of the colophon strip along the bottom of the map. */
const COLOPHON = 30;
/** Zoom for showing an actor's building. */
const BUILDING_ZOOM = 16.2;

type ActorNode = Extract<GraphNode, { kind: "actor" }>;
type InitiativeNode = Extract<GraphNode, { kind: "initiative" }>;

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
  /** Anchor in screen coordinates: where the node "really" is (for initiatives: their lead). */
  ax: number;
  ay: number;
  /** Collision radius, when it differs from the node's own. */
  r?: number;
}

interface Point {
  x: number;
  y: number;
}

export interface MapView extends View {
  /** Swaps in the accurate municipality and county shapes once they have loaded. */
  setDetail(layers: DetailLayers): void;
}

function collection(features: Feature[]): Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "GeometryCollection", geometries: features.map((f) => f.geometry) },
  };
}

/** Twice the signed area of a ring; positive when counter-clockwise. */
function ringArea(ring: Position[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return -s;
}

function outerRings(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((p) => p[0]);
  return [];
}

/** The whole world with the home counties cut out, for washing out everything else. */
function outsideMask(counties: Feature[]): Feature<Polygon> {
  const world: Position[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  // MapLibre tells holes from outer rings by winding: holes must turn the other way.
  const holes = counties
    .flatMap((f) => outerRings(f.geometry))
    .map((ring) => (ringArea(ring) > 0 ? [...ring].reverse() : ring));
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...holes] } };
}

/**
 * Whether the initiative filters (kind, status, support type) are untouched.
 * When they are narrowed, only actors taking part in a matching initiative are shown.
 */
function initiativeFiltersAreDefault(filters: Filters): boolean {
  const d = defaultFilters();
  return (["supportTypes", "statuses", "kinds"] as const).every((k) => filters[k].size === d[k].size);
}

export function createMapView(container: HTMLElement, graph: Graph, store: Store, geo: GeoIndex): MapView {
  const placeByMunicipality = new Map(
    geo.places.filter((p) => p.kind === "municipality").map((p) => [p.municipalities[0], p]),
  );
  let detail: DetailLayers | null = null;

  const canvasHost = document.createElement("div");
  canvasHost.className = "map-canvas";
  container.append(canvasHost);

  const map = new MapLibreMap({
    container: canvasHost,
    style: mapStyle(theme.map),
    center: [15.6, 57.0],
    zoom: 6.5,
    minZoom: 4.5,
    maxZoom: 18.5,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    fadeDuration: 150,
  });
  // A tile that fails to load (a network hiccup) is not an error in the app; MapLibre retries.
  map.on("error", (event) => console.warn("Map:", event.error?.message ?? event));
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  let styleReady = false;
  const pending: (() => void)[] = [];
  const whenReady = (fn: () => void) => (styleReady ? fn() : pending.push(fn));
  map.once("style.load", () => {
    styleReady = true;
    for (const fn of pending.splice(0)) fn();
  });

  // Nodes, relations and the national box are drawn in an SVG over the map.
  // It lives inside the canvas container, so dragging and scrolling over it still move the map.
  const svg = select(map.getCanvasContainer())
    .append("svg")
    .attr("class", "map-svg")
    .attr("role", "group")
    .attr("aria-label", t.viewMap);
  const shelfLayer = svg.append("g").attr("class", "shelf");
  const edgeLayer = svg.append("g").attr("class", "edges");
  const leaderLayer = svg.append("g").attr("class", "leaders");
  const nodeLayer = svg.append("g").attr("class", "nodes");

  // Cartographic furniture: an inset showing where the view is, and a scale bar.
  const inset = select(container).append("svg").attr("class", "inset").attr("role", "button");
  inset.append("title").text(t.insetTitle);
  const insetLand = inset.append("path").attr("class", "inset-land");
  const insetHome = inset.append("path").attr("class", "inset-home");
  const insetView = inset.append("path").attr("class", "inset-view");
  let insetProjection: GeoProjection | null = null;
  const scale = select(container).append("div").attr("class", "scale-bar").attr("aria-hidden", "true");
  const scaleSvg = scale.append("svg").attr("height", 9);
  const scaleText = scale.append("span");

  let width = 0;
  let height = 0;
  let fitted = false;
  let positions = new Map<string, Point>();
  let anchors = new Map<string, Point>();
  /** Offsets from each node's anchor, kept between layouts so nodes don't jump around while zooming. */
  const offsets = new Map<string, Point>();
  /** Actors on the map, and the initiatives shown around them while something is selected. */
  let visible: GraphNode[] = [];
  let firstDraw = true;

  const isNarrow = () => width < NARROW;
  const duration = (ms: number) => (reducedMotion() ? 0 : ms);
  const currentPlace = (): Place | undefined => (store.state.place ? geo.placeById.get(store.state.place) : undefined);
  /** Relations are shown for the selected node only; hovering never draws lines on the map. */
  const currentFocus = (): FocusSet | null =>
    store.state.selected ? focusSet(graph, { ...store.state, hovered: null }) : null;
  /** A node hovered while something is selected (on the map or in the sheet) narrows the lines to its own. */
  const emphasis = (focus: FocusSet | null): string | null => {
    const h = store.state.hovered;
    return focus && h && h !== focus.id && graph.byId.has(h) ? h : null;
  };

  // ---------- Layout ----------

  function shelfActors(): GraphNode[] {
    return visible.filter((n) => n.kind === "actor" && !n.location);
  }

  function shelfRect() {
    if (isNarrow()) return { x: 0, y: height - NARROW_SHELF, w: width, h: NARROW_SHELF };
    const rows = shelfActors().length;
    return { x: SHELF.margin, y: SHELF.margin, w: SHELF.width, h: SHELF.header + Math.max(1, rows) * SHELF.row + 4 };
  }

  /** The screen area not covered by the shelf, inset and colophon (and the details sheet, if open). */
  function freeArea(panelOpen: boolean): [[number, number], [number, number]] {
    const pad = 36;
    if (isNarrow()) {
      const bottom = panelOpen ? height * 0.42 : height - NARROW_SHELF;
      return [
        [pad, pad],
        [width - pad, Math.max(pad + 40, bottom - pad)],
      ];
    }
    const left = SHELF.margin * 2 + SHELF.width + pad;
    const right = width - pad - (panelOpen ? SHEET : 110);
    return [
      [left, pad],
      [Math.max(left + 60, right), height - COLOPHON - pad],
    ];
  }

  function padding(panelOpen: boolean): PaddingOptions {
    const [[x0, y0], [x1, y1]] = freeArea(panelOpen);
    return { left: x0, top: y0, right: Math.max(0, width - x1), bottom: Math.max(0, height - y1) };
  }

  function project(loc: { lng: number; lat: number }): Point {
    const p = map.project([loc.lng, loc.lat]);
    return { x: p.x, y: p.y };
  }

  function shelfPositions(): Map<string, Point> {
    const rect = shelfRect();
    const result = new Map<string, Point>();
    const actors = shelfActors();
    if (isNarrow()) {
      const step = rect.w / Math.max(1, actors.length);
      actors.forEach((a, i) => result.set(a.id, { x: rect.x + step * (i + 0.5), y: rect.y + 42 }));
    } else {
      actors.forEach((a, i) => result.set(a.id, { x: rect.x + 22, y: rect.y + SHELF.header + i * SHELF.row + 12 }));
    }
    return result;
  }

  /**
   * Places actors near their address and pushes overlapping ones apart. The
   * initiatives in focus are then hung around the actor that leads them,
   * with the actors held still so they don't jump when something is selected.
   */
  function layout(ticks: number) {
    const shelf = shelfPositions();
    const actors: LayoutNode[] = [];
    const fixed: LayoutNode[] = [];
    visible.forEach((node, i) => {
      if (node.kind !== "actor") return;
      const s = shelf.get(node.id);
      if (s) {
        fixed.push({ id: node.id, node, ax: s.x, ay: s.y, x: s.x, y: s.y, fx: s.x, fy: s.y });
        return;
      }
      const a = project(node.location!);
      const angle = i * 2.4;
      const off = offsets.get(node.id) ?? { x: Math.cos(angle) * 16, y: Math.sin(angle) * 16 };
      actors.push({ id: node.id, node, ax: a.x, ay: a.y, x: a.x + off.x, y: a.y + off.y });
    });

    const sim = forceSimulation(actors)
      .stop()
      .force("x", forceX<LayoutNode>((d) => d.ax).strength(0.2))
      .force("y", forceY<LayoutNode>((d) => d.ay).strength(0.2))
      .force("collide", forceCollide<LayoutNode>((d) => nodeRadius(d.node) + 13).iterations(3));
    sim.alpha(0.6);
    for (let i = 0; i < ticks; i++) sim.tick();

    positions = new Map();
    for (const d of [...actors, ...fixed]) positions.set(d.id, { x: d.x!, y: d.y! });
    for (const d of actors) offsets.set(d.id, { x: d.x! - d.ax, y: d.y! - d.ay });
    anchors = new Map(actors.map((d) => [d.id, { x: d.ax, y: d.ay }]));

    layoutSatellites(ticks, shelf);
  }

  function layoutSatellites(ticks: number, shelf: Map<string, Point>) {
    const satellites = visible.filter((n): n is InitiativeNode => n.kind === "initiative");
    if (satellites.length === 0) return;
    const free: LayoutNode[] = [];
    const counts = new Map<string, number>();
    for (const n of satellites) {
      const lead = positions.get(n.initiative.lead);
      if (!lead) continue;
      const k = counts.get(n.initiative.lead) ?? 0;
      counts.set(n.initiative.lead, k + 1);
      if (shelf.has(n.initiative.lead)) {
        // Beside the national box (above it on phones), in a row.
        const p = isNarrow() ? { x: lead.x + (k - 1) * 18, y: lead.y - 40 } : { x: lead.x + SHELF.width + 6 + k * 20, y: lead.y };
        positions.set(n.id, p);
        continue;
      }
      const off = offsets.get(n.id) ?? { x: Math.cos(k * 1.1 - 1.2) * 38, y: Math.sin(k * 1.1 - 1.2) * 38 };
      free.push({ id: n.id, node: n, ax: lead.x, ay: lead.y, x: lead.x + off.x, y: lead.y + off.y });
    }
    const still: LayoutNode[] = [...positions.entries()]
      .filter(([id]) => !free.some((f) => f.id === id))
      .map(([id, p]) => ({ id, node: graph.byId.get(id)!, ax: p.x, ay: p.y, x: p.x, y: p.y, fx: p.x, fy: p.y }));
    // Keep the selected actor's name clear: fixed placeholders along where its label goes.
    const focus = currentFocus();
    const anchor = focus && graph.byId.get(focus.id)?.kind === "actor" ? positions.get(focus.id) : undefined;
    if (anchor && !shelf.has(focus!.id)) {
      const node = graph.byId.get(focus!.id)!;
      const lines = wrapLabel(node.name);
      const length = Math.max(...lines.map((l) => l.length)) * 12.5 * 0.58;
      for (let x = 22; x < length + 22; x += 12) {
        for (const dy of lines.length > 1 ? [-7, 7] : [0]) {
          const p = { x: anchor.x + x, y: anchor.y + dy };
          still.push({ id: `label:${x}:${dy}`, node, ax: p.x, ay: p.y, x: p.x, y: p.y, fx: p.x, fy: p.y, r: 7 });
        }
      }
    }
    const links = free.map((f) => ({ source: (f.node as InitiativeNode).initiative.lead, target: f.id }));
    const sim = forceSimulation([...still, ...free])
      .stop()
      .force("x", forceX<LayoutNode>((d) => d.ax).strength(0.04))
      .force("y", forceY<LayoutNode>((d) => d.ay).strength(0.04))
      .force(
        "collide",
        forceCollide<LayoutNode>((d) => d.r ?? nodeRadius(d.node) + (d.node.kind === "actor" ? 9 : 6)).iterations(3),
      )
      .force(
        "link",
        forceLink<LayoutNode, { source: string; target: string }>(links)
          .id((d) => d.id)
          .distance(34)
          .strength(0.6),
      );
    sim.alpha(0.6);
    for (let i = 0; i < Math.max(ticks, 30); i++) sim.tick();
    for (const d of free) {
      positions.set(d.id, { x: d.x!, y: d.y! });
      offsets.set(d.id, { x: d.x! - d.ax, y: d.y! - d.ay });
    }
  }

  // ---------- Drawing ----------

  /** Redraws nodes and relations; `animate` eases them to their new places (used after filtering). */
  function draw(animate: boolean) {
    drawShelf();
    const ms = animate ? duration(450) : 0;

    const focus = currentFocus();
    const emph = emphasis(focus);
    const touches = (e: GraphEdge, id: string | null) => id !== null && (e.source === id || e.target === id);
    const edges = graph.edges.filter(
      (e) => positions.has(e.source) && positions.has(e.target) && (touches(e, focus?.id ?? null) || touches(e, emph)),
    );
    const edgePath = (e: GraphEdge) => {
      const a = positions.get(e.source)!;
      const b = positions.get(e.target)!;
      return curvedPath(a.x, a.y, b.x, b.y);
    };
    const edgeSel = edgeLayer
      .selectAll<SVGPathElement, GraphEdge>("path")
      .data(edges, (e) => e.id)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("class", (e) => `edge edge-${e.type}`)
            .attr("stroke", (e) => theme.edges[e.type].color)
            .attr("stroke-width", (e) => theme.edges[e.type].width)
            .attr("stroke-dasharray", (e) => theme.edges[e.type].dash ?? null)
            .attr("d", edgePath),
        (update) => update,
        (exit) => exit.transition().duration(duration(200)).style("opacity", 0).remove(),
      )
      .classed("hl", (e) => (emph ? touches(e, emph) : true))
      .classed("dim", (e) => emph !== null && !touches(e, emph));
    if (ms > 0) edgeSel.transition().duration(ms).ease(easeCubicInOut).attr("d", edgePath);
    else edgeSel.interrupt().attr("d", edgePath);

    drawLeaders();

    const nodeTransform = (n: GraphNode) => {
      const p = positions.get(n.id)!;
      return `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
    };
    let entered = 0;
    const drawn = visible.filter((n) => positions.has(n.id));
    const nodes = nodeLayer
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(drawn, (n) => n.id)
      .join(
        (enter) => {
          const g = enter
            .append("g")
            .attr("class", (n) => `node node-${n.kind} entering`)
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-label", nodeAriaLabel)
            .attr("data-id", (n) => n.id)
            .attr("transform", nodeTransform)
            // Stagger the first appearance so the map "fills in" instead of popping.
            .style("--delay", () => `${firstDraw ? entered++ * 30 : entered++ * 25}ms`);
          drawGlyphs(g, "right", (n) => n);
          g.on("click", (event, n) => {
            event.stopPropagation();
            store.update({ selected: store.state.selected === n.id ? null : n.id, hovered: null });
          })
            .on("keydown", (event: KeyboardEvent, n) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                store.update({ selected: n.id });
              }
            })
            .on("mouseenter", (_, n) => store.update({ hovered: n.id }))
            .on("mouseleave", () => store.update({ hovered: null }))
            .on("animationend", function () {
              this.classList.remove("entering");
            });
          return g;
        },
        (update) => update,
        (exit) => exit.classed("leaving", true).transition().duration(duration(200)).style("opacity", 0).remove(),
      )
      .classed("on-shelf", (n) => !n.location || (n.kind === "initiative" && !graph.byId.get(n.initiative.lead)?.location));
    if (ms > 0) nodes.transition().duration(ms).ease(easeCubicInOut).attr("transform", nodeTransform);
    else nodes.interrupt().attr("transform", nodeTransform);
    firstDraw = false;

    highlight(nodes);
  }

  /** Thin lines from displaced actors back to their true location, and to their other sites. */
  function drawLeaders() {
    const leaders: { id: string; owner: string; from: Point; to: Point; secondary: boolean }[] = [];
    for (const n of visible) {
      if (n.kind !== "actor" || !n.location || !positions.has(n.id)) continue;
      const p = positions.get(n.id)!;
      const a = anchors.get(n.id)!;
      if (Math.hypot(p.x - a.x, p.y - a.y) > 6) {
        leaders.push({ id: `${n.id}:anchor`, owner: n.id, from: a, to: p, secondary: false });
      }
      for (const loc of n.actor.locations!.slice(1)) {
        leaders.push({ id: `${n.id}:${loc.place}`, owner: n.id, from: project(loc), to: p, secondary: true });
      }
    }
    const leader = leaderLayer
      .selectAll<SVGGElement, (typeof leaders)[number]>("g")
      .data(leaders, (d) => d.id)
      .join((enter) => {
        const g = enter.append("g");
        g.append("line");
        g.append("circle");
        return g;
      })
      .attr("class", (d) => `leader${d.secondary ? " leader-secondary" : ""}`);
    leader
      .select("line")
      .attr("x1", (d) => d.from.x)
      .attr("y1", (d) => d.from.y)
      .attr("x2", (d) => d.to.x)
      .attr("y2", (d) => d.to.y);
    leader
      .select("circle")
      .attr("cx", (d) => d.from.x)
      .attr("cy", (d) => d.from.y)
      .attr("r", (d) => (d.secondary ? 4.5 : 2.5))
      .on("click", (event, d) => {
        event.stopPropagation();
        store.update({ selected: d.owner });
      });
  }

  function drawShelf() {
    const hasShelf = shelfActors().length > 0;
    const rect = shelfRect();
    shelfLayer
      .selectAll("rect")
      .data(hasShelf ? [rect] : [])
      .join("rect")
      .attr("x", (r) => r.x)
      .attr("y", (r) => r.y)
      .attr("width", (r) => r.w)
      .attr("height", (r) => r.h);
    shelfLayer
      .selectAll("text")
      .data(hasShelf ? [rect] : [])
      .join("text")
      .attr("x", (r) => r.x + 14)
      .attr("y", (r) => r.y + (isNarrow() ? 20 : 25))
      .text(t.offMapColumn);
  }

  function highlight(nodes = nodeLayer.selectAll<SVGGElement, GraphNode>("g.node")) {
    const focus = currentFocus();
    const emph = emphasis(focus);
    const near = emph ? new Set([emph, ...(graph.incident.get(emph) ?? []).flatMap((e) => [e.source, e.target])]) : null;
    nodes
      .classed("dim", (n) => focus !== null && !focus.nodes.has(n.id) && !near?.has(n.id))
      .classed("in-focus", (n) => focus !== null && focus.nodes.has(n.id))
      .classed("selected", (n) => focus?.id === n.id)
      .classed("emphasised", (n) => n.id === emph);
    nodes.filter((n) => focus?.id === n.id || n.id === emph).raise();
    leaderLayer
      .selectAll<SVGGElement, { owner: string }>("g")
      .classed("dim", (d) => focus !== null && !focus.nodes.has(d.owner));

    const shown = chooseLabels(focus, emph);
    nodes.classed("show-label", (n) => shown.has(n.id));
    nodes.each(function (n) {
      const side = !n.location && isNarrow() ? "below" : (shown.get(n.id) ?? "right");
      positionLabel(this.querySelector<SVGTextElement>("text.label")!, nodeRadius(n), side);
    });
  }

  /**
   * Shows as many labels as fit without overlapping. The selected node and its
   * neighbours win; otherwise actors with the most relations go first.
   */
  function chooseLabels(focus: FocusSet | null, emph: string | null) {
    const candidate = (n: GraphNode): LabelCandidate => {
      const p = positions.get(n.id)!;
      return { id: n.id, x: p.x, y: p.y, r: nodeRadius(n), lines: wrapLabel(n.name), fontSize: n.kind === "actor" ? 12.5 : 11.5 };
    };
    const onMap = visible.filter((n) => positions.has(n.id) && !isOnShelf(n));
    const degree = (n: GraphNode) => graph.incident.get(n.id)?.length ?? 0;
    const rank = (n: GraphNode) =>
      (n.id === emph ? 0 : n.id === focus?.id ? 1 : focus?.nodes.has(n.id) ? 2 : 3) * 10 + (n.kind === "actor" ? 0 : 1);
    const eligible = [...onMap].sort((a, b) => rank(a) - rank(b) || degree(b) - degree(a));
    const obstacles = focus ? onMap.filter((n) => focus.nodes.has(n.id)) : onMap;
    // Labels must stay clear of the details sheet when it is open.
    const sheetOpen = !isNarrow() && (store.state.selected !== null || store.state.place !== null);
    const shown = pickLabels(eligible.map(candidate), obstacles.map(candidate), {
      width: sheetOpen ? width - SHEET : width,
      height,
    });
    // In the national box actors are always named; initiatives beside it when in focus.
    for (const n of visible) {
      if (isOnShelf(n) && (n.kind === "actor" || focus?.nodes.has(n.id))) shown.set(n.id, "right");
    }
    return shown;
  }

  function isOnShelf(n: GraphNode): boolean {
    if (n.kind === "actor") return !n.location;
    return !graph.byId.get(n.initiative.lead)?.location;
  }

  /** Inset map of Sweden; the current view is drawn on it in drawFurniture(). */
  function drawInset() {
    const sweden = geo.land.features.find((f) => f.properties.name === "Sweden");
    if (!sweden) return;
    const w = 84;
    const h = 150;
    inset.attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h);
    insetProjection = geoMercator().fitExtent(
      [
        [5, 5],
        [w - 5, h - 5],
      ],
      sweden,
    );
    const insetPath = geoPath(insetProjection);
    insetLand.attr("d", insetPath(sweden));
    insetHome.attr("d", insetPath(collection(geo.regions.features.filter((f) => isHomeCounty(f.properties.code)))));
  }

  function drawFurniture() {
    if (width === 0) return;
    if (insetProjection) {
      const corners = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].map(([x, y]) => {
        const ll = map.unproject([x, y]);
        return insetProjection!([ll.lng, ll.lat])!;
      });
      insetView.attr("d", `M${corners.map((c) => c.map((v) => v.toFixed(1)).join(",")).join("L")}Z`);
    }
    // Scale bar: the longest round distance that fits in about 120 pixels.
    const lat = map.getCenter().lat;
    const metresPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
    const kmPer100px = (metresPerPixel * 100) / 1000;
    const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
    const km = steps.filter((s) => (s / kmPer100px) * 100 <= 120).pop() ?? steps[0];
    const px = (km / kmPer100px) * 100;
    scaleSvg
      .attr("width", px + 2)
      .selectAll("path")
      .data([px])
      .join("path")
      .attr("d", (d) => `M1,1V8H${(d + 1).toFixed(1)}V1 M${(d / 2 + 1).toFixed(1)},4.5V8`);
    scaleText.text(km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);
  }

  // ---------- Basemap sources ----------

  type Collection = FeatureCollection;
  const setData = (source: string, data: Collection | Feature) =>
    whenReady(() => (map.getSource(source) as unknown as { setData(d: unknown): void } | undefined)?.setData(data));

  function homeCounties(): Feature[] {
    return detail ? detail.counties.features : geo.regions.features.filter((f) => isHomeCounty(f.properties.code));
  }

  function updateShapes() {
    const municipalities = (detail ? detail.municipalities.features : geo.municipalities.features).filter((f) =>
      isHomeCounty(f.properties.county),
    );
    setData(SOURCES.municipalities, { type: "FeatureCollection", features: municipalities });
    setData(SOURCES.counties, { type: "FeatureCollection", features: homeCounties() });
    setData(SOURCES.mask, outsideMask(homeCounties()));
    setData(SOURCES.municipalityLabels, {
      type: "FeatureCollection",
      features: municipalities.map((f) => ({
        type: "Feature",
        properties: { name: f.properties.name },
        geometry: { type: "Point", coordinates: geoCentroid(f) },
      })),
    });
    updatePlace();
  }

  function updatePlace() {
    const place = currentPlace();
    setData(SOURCES.place, { type: "FeatureCollection", features: place ? [place.feature] : [] });
  }

  /** Buildings that actors are in, from public/geo/buildings.json (see scripts/build-buildings.ts). */
  function loadBuildings() {
    fetch(`${import.meta.env.BASE_URL}geo/buildings.json`)
      .then((r) => r.json())
      .then((buildings: FeatureCollection<Geometry, { building: string }>) => {
        const features = graph.nodes.flatMap((n) =>
          n.kind !== "actor"
            ? []
            : (n.actor.locations ?? []).flatMap((loc: Location) =>
                buildings.features
                  .filter((b) => b.properties.building === loc.building)
                  .map((b) => ({ ...b, properties: { actor: n.id, color: nodeColor(n) } })),
              ),
        );
        setData(SOURCES.buildings, { type: "FeatureCollection", features });
      })
      .catch((err) => console.warn("Actor buildings unavailable", err));
  }

  function updateBuildingFocus() {
    const id = store.state.selected ?? "";
    whenReady(() => {
      for (const layer of [LAYERS.buildingFocus, LAYERS.buildingFocusLine]) map.setFilter(layer, ["==", ["get", "actor"], id]);
    });
  }

  // ---------- Camera ----------

  const homeBounds = (): [[number, number], [number, number]] => geoBounds(collection(homeCounties()) as never);

  function fitFeature(f: Feature, panelOpen: boolean, maxZoom = 13) {
    if (width === 0) return;
    const [[w, s], [e, n]] = geoBounds(f as never);
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: padding(panelOpen), maxZoom, duration: duration(900), essential: true },
    );
  }

  function fitHome(animate: boolean) {
    if (width === 0) return;
    const [[w, s], [e, n]] = homeBounds();
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: padding(false), duration: animate ? duration(800) : 0 },
    );
  }

  function zoomHome() {
    store.update({ place: null });
    fitHome(true);
  }

  /** Zooms to the counties currently selected in the filter. */
  function zoomToCounties() {
    const codes: string[] = [...store.state.filters.counties];
    if (codes.length === 0 || codes.length === HOME_COUNTIES.length) {
      fitHome(true);
      return;
    }
    const features = geo.places.filter((p) => p.kind === "county" && codes.includes(p.county)).map((p) => p.feature);
    fitFeature(collection(features), false);
  }

  /** Pans just enough to bring the selected node out from under the details sheet. */
  function keepInView(id: string) {
    const p = positions.get(id);
    if (!p || width === 0) return;
    const [[x0, y0], [x1, y1]] = freeArea(true);
    const dx = p.x < x0 ? p.x - x0 : p.x > x1 ? p.x - x1 : 0;
    const dy = p.y < y0 ? p.y - y0 : p.y > y1 ? p.y - y1 : 0;
    if (dx || dy) map.panBy([dx, dy], { duration: duration(600) });
  }

  // ---------- Membership ----------

  /**
   * Nodes to draw. Actors that pass the filters (and, when initiative filters
   * are narrowed, take part in a matching initiative); when a place is
   * selected, only those in it plus national ones, so neighbouring clusters
   * don't spill into the view. Initiatives have no place of their own, so they
   * only appear around their lead while the selection involves them.
   */
  function refreshVisible() {
    const { filters } = store.state;
    const place = currentPlace();
    const focus = currentFocus();
    const matching = graph.nodes.filter((n): n is InitiativeNode => n.kind === "initiative" && isNodeVisible(n, filters));
    const narrowed = !initiativeFiltersAreDefault(filters);
    const involved = new Set(matching.flatMap((n) => [n.initiative.lead, ...(n.initiative.partners ?? []), ...(n.initiative.funders ?? [])]));
    const satellites = focus ? matching.filter((n) => focus.nodes.has(n.id) || n.id === focus.id) : [];
    // The selected initiative is shown even if the filters would hide it.
    const selected = focus ? graph.byId.get(focus.id) : undefined;
    if (selected?.kind === "initiative" && !satellites.includes(selected)) satellites.push(selected);
    const leads = new Set(satellites.map((n) => n.initiative.lead));
    const actors = graph.nodes.filter(
      (n): n is ActorNode =>
        n.kind === "actor" &&
        (leads.has(n.id) ||
          focus?.nodes.has(n.id) ||
          (isNodeVisible(n, filters) &&
            (!narrowed || involved.has(n.id)) &&
            (!place || !n.location || n.municipalities.some((m) => place.municipalities.includes(m))))),
    );
    visible = [...actors, ...satellites];
  }

  // ---------- Events ----------

  let hovered: string | number | undefined;
  const setHover = (id: string | number | undefined) => {
    if (hovered !== undefined) map.setFeatureState({ source: SOURCES.municipalities, id: hovered }, { hover: false });
    hovered = id;
    if (id !== undefined) map.setFeatureState({ source: SOURCES.municipalities, id }, { hover: true });
    map.getCanvas().style.cursor = id !== undefined ? "pointer" : "";
  };
  map.on("mousemove", LAYERS.municipalityHit, (e) => setHover((e.features?.[0] as MapGeoJSONFeature | undefined)?.id));
  map.on("mouseleave", LAYERS.municipalityHit, () => setHover(undefined));
  map.on("click", (e) => {
    if (e.originalEvent.target !== map.getCanvas()) return;
    const hit = map.queryRenderedFeatures(e.point, { layers: [LAYERS.municipalityHit] })[0];
    const place = hit ? placeByMunicipality.get(String(hit.properties.code)) : undefined;
    if (place && place.id !== store.state.place) store.update({ place: place.id, selected: null });
    else store.update({ selected: null, place: place ? place.id : null });
  });

  let moveFrame = 0;
  map.on("move", () => {
    if (width === 0 || moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      layout(10);
      draw(false);
      drawFurniture();
    });
  });

  function resize() {
    const box = container.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      width = height = 0;
      return;
    }
    width = box.width;
    height = box.height;
    svg.attr("viewBox", `0 0 ${width} ${height}`).classed("narrow", isNarrow());
    map.resize();
    if (!fitted) {
      fitted = true;
      fitHome(false);
    }
    layout(220);
    draw(false);
    drawFurniture();
  }

  store.subscribe((state, prev) => {
    const membershipChanged = state.filters !== prev.filters || state.place !== prev.place || state.selected !== prev.selected;
    if (membershipChanged) refreshVisible();
    if (state.place !== prev.place) updatePlace();
    if (state.selected !== prev.selected) updateBuildingFocus();
    // While hidden the view has no size; resize() catches up when it is shown again.
    if (width === 0) return;
    if (membershipChanged) {
      layout(120);
      draw(true);
      if (state.filters.counties !== prev.filters.counties) zoomToCounties();
    } else if (state.hovered !== prev.hovered && state.selected) {
      draw(false);
    } else if (state.hovered !== prev.hovered) {
      highlight();
    }
    if (state.place !== prev.place) {
      const place = currentPlace();
      if (place) fitFeature(place.feature, true);
    }
    if (state.selected && state.selected !== prev.selected) keepInView(state.selected);
  });

  refreshVisible();
  updateShapes();
  loadBuildings();
  drawInset();
  new ResizeObserver(() => resize()).observe(container);
  inset.on("click", zoomHome);

  return {
    resize,
    setDetail(layers: DetailLayers) {
      detail = layers;
      svg.classed("has-detail", true);
      updateShapes();
    },
    focus(id: string) {
      const node = graph.byId.get(id);
      if (width === 0 || !node) return;
      if (node.kind === "initiative") {
        // Frame everyone taking part, so the relations are in view.
        const i = node.initiative;
        const points = [i.lead, ...(i.partners ?? []), ...(i.funders ?? [])].flatMap((a) => {
          const loc = graph.byId.get(a)?.location;
          return loc ? [[loc.lng, loc.lat] as [number, number]] : [];
        });
        if (points.length > 1) {
          fitFeature({ type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: points } }, true, 11);
          return;
        }
      }
      const actor = node.kind === "actor" ? node : graph.byId.get(node.initiative.lead);
      const loc = actor?.location;
      if (!loc) return;
      const zoom = Math.max(map.getZoom(), loc.building && node.kind === "actor" ? BUILDING_ZOOM : 10);
      map.flyTo({ center: [loc.lng, loc.lat], zoom, padding: padding(true), duration: duration(1200), essential: true });
    },
    focusPlace(id: string) {
      const place = geo.placeById.get(id);
      if (place) fitFeature(place.feature, true);
    },
    zoomBy(factor: number) {
      map.easeTo({ zoom: map.getZoom() + Math.log2(factor), duration: duration(300) });
    },
    reset: zoomHome,
  };
}
