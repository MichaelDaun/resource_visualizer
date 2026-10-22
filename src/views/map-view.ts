import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { easeCubicInOut } from "d3-ease";
import { geoDistance, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { forceCollide, forceLink, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Feature, Geometry } from "geojson";
import type { Graph, GraphEdge, GraphNode } from "../data/graph";
import {
  DETAIL_BBOX,
  HOME_COUNTIES,
  isHomeCounty,
  lakesOutsideDetail,
  type DetailLayers,
  type GeoIndex,
  type Place,
} from "../geo";
import { t } from "../i18n/sv";
import { isNodeVisible, type Store } from "../state";
import { nodeRadius, theme } from "../theme";
import { curvedPath, drawGlyphs, nodeAriaLabel, positionLabel, wrapLabel } from "./glyphs";
import { labelBox, pickLabels, type Box, type LabelCandidate, type LabelSide } from "./labels";
import { applyHighlight, focusSet } from "./highlight";
import { reducedMotion, type View } from "./view";

const SHELF = { width: 212, margin: 16, rowHeight: 48, header: 40 };
const NARROW = 720;
/** Width of the details sheet on wide screens, kept clear when zooming to something. */
const SHEET = 400;
/** Height of the colophon strip along the bottom of the map. */
const COLOPHON = 30;

/** Sea and strait names, placed by hand. */
const SEA_LABELS = [
  { name: "Östersjön", lng: 17.05, lat: 56.32, size: 18, minK: 0, maxK: 4, angle: 0 },
  { name: "Kalmarsund", lng: 16.52, lat: 56.86, size: 13, minK: 1.8, maxK: 40, angle: -62 },
];

/** Lakes worth naming before zooming far in. */
const MAJOR_LAKES = new Set(["Vättern", "Bolmen", "Åsnen", "Helgasjön", "Möckeln", "Rottnen", "Femlingen", "Innaren"]);

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
  /** Anchor in screen coordinates: where the node "really" is. */
  ax: number;
  ay: number;
  onShelf: boolean;
}

interface Point {
  x: number;
  y: number;
}

type MunicipalityFeature = Feature<Geometry, { code: string; county: string; name: string }>;

export interface MapView extends View {
  /** Swaps in the detailed basemap once it has loaded. */
  setDetail(layers: DetailLayers): void;
}

export function createMapView(container: HTMLElement, graph: Graph, store: Store, geo: GeoIndex): MapView {
  const placeByMunicipality = new Map(
    geo.places.filter((p) => p.kind === "municipality").map((p) => [p.municipalities[0], p]),
  );
  let detail: DetailLayers | null = null;

  const svg = select(container)
    .append("svg")
    .attr("class", "map-svg")
    .attr("role", "img")
    .attr("aria-label", t.viewMap);

  const defs = svg.append("defs");
  const landClip = defs.append("clipPath").attr("id", "land-clip").append("path");
  // Everything except the detailed area: coarse borders are only drawn out here.
  const outsideClip = defs.append("clipPath").attr("id", "outside-detail").append("path").attr("clip-rule", "evenodd");

  const basemap = svg.append("g").attr("class", "basemap");
  const landLayer = basemap.append("path").attr("class", "land");
  const homeLayer = basemap.append("g").attr("class", "home").attr("clip-path", "url(#land-clip)");
  const townLayer = basemap.append("g").attr("class", "towns").attr("clip-path", "url(#land-clip)");
  const municipalityLayer = basemap.append("g").attr("class", "municipalities").attr("clip-path", "url(#land-clip)");
  // The selected place is filled as one group so overlapping shapes don't double up.
  const placeFill = basemap.append("g").attr("class", "place-fill").attr("clip-path", "url(#land-clip)");
  const lakeLayer = basemap.append("g").attr("class", "lakes");
  const borderLayer = basemap.append("g").attr("class", "borders").attr("clip-path", "url(#land-clip)");
  const roadLayer = basemap.append("g").attr("class", "roads");
  const coastLayer = basemap.append("path").attr("class", "coast");
  const placeOutline = basemap.append("g").attr("class", "place-outline").attr("clip-path", "url(#land-clip)");

  const placeLabels = svg.append("g").attr("class", "place-labels");
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
  let projection: GeoProjection = geoMercator();
  let transform: ZoomTransform = zoomIdentity;
  let positions = new Map<string, Point>();
  let anchors = new Map<string, Point>();
  /** Offsets from each node's anchor, kept between layouts so nodes don't jump around while zooming. */
  const offsets = new Map<string, Point>();
  let visible: GraphNode[] = [];
  let firstDraw = true;

  const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 40])
    .on("zoom", (event) => {
      transform = event.transform;
      basemap.attr("transform", transform.toString());
      setZoomClasses();
      layout(14);
      draw(false);
      drawFurniture();
    });
  svg.call(zoomBehavior).on("dblclick.zoom", null);
  svg.on("click", (event) => {
    const target = event.target as Element;
    if (target === svg.node() || target.classList.contains("land") || target.closest(".lakes")) {
      store.update({ selected: null, place: null });
    }
  });

  const isNarrow = () => width < NARROW;
  const duration = (ms: number) => (reducedMotion() ? 0 : ms);

  /** Zoom-dependent classes let CSS fade map layers in and out. */
  function setZoomClasses() {
    const k = transform.k;
    svg
      .classed("z-roads", k >= 1.3)
      .classed("z-minor-roads", k >= 2.6)
      .classed("z-towns", k >= 1.6)
      .classed("z-detail", k >= 2.2);
  }

  function shelfRect() {
    if (isNarrow()) {
      const h = 96;
      return { x: 0, y: height - h - COLOPHON, w: width, h };
    }
    const count = visible.filter((n) => !n.location).length;
    return { x: SHELF.margin, y: SHELF.margin, w: SHELF.width, h: SHELF.header + Math.max(1, count) * SHELF.rowHeight };
  }

  /** The screen area not covered by the shelf, inset and colophon (and the details sheet, if open). */
  function freeArea(panelOpen: boolean): [[number, number], [number, number]] {
    const pad = 36;
    if (isNarrow()) {
      const bottom = panelOpen ? height * 0.42 : height - (96 + COLOPHON);
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

  function homeFeatures(): Feature[] {
    return detail ? detail.counties.features : geo.regions.features.filter((f) => isHomeCounty(f.properties.code));
  }

  function collection(features: Feature[]): Feature {
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "GeometryCollection", geometries: features.map((f) => f.geometry) },
    };
  }

  function fitProjection() {
    projection = geoMercator().fitExtent(freeArea(false), collection(homeFeatures()));
    drawBasemap();
  }

  function drawBasemap() {
    const path = geoPath(projection);
    const land = detail ? detail.land : geo.land;
    const landPath = path(land as never);
    landClip.attr("d", landPath);
    landLayer.attr("d", landPath);
    coastLayer.attr("d", landPath);

    const [bx0, by0] = projection([DETAIL_BBOX.west, DETAIL_BBOX.north])!;
    const [bx1, by1] = projection([DETAIL_BBOX.east, DETAIL_BBOX.south])!;
    const big = 1e6;
    const world = `M${-big},${-big}H${big}V${big}H${-big}Z`;
    outsideClip.attr("d", detail ? `${world} M${bx0},${by0}H${bx1}V${by1}H${bx0}Z` : world);

    // Without the detailed coastline the simplified county shapes fall short of
    // the coast; a stroke in the fill colour covers the gap until detail loads.
    homeLayer.selectAll("*").remove();
    homeLayer
      .selectAll("path.home-county")
      .data(homeFeatures())
      .join("path")
      .attr("class", "home-county")
      .attr("d", path)
      .attr("stroke-width", detail ? 0 : projectedKm(3));

    const municipalities = (detail ? detail.municipalities.features : geo.municipalities.features).filter((f) =>
      isHomeCounty(f.properties.county),
    ) as MunicipalityFeature[];
    municipalityLayer
      .selectAll<SVGPathElement, MunicipalityFeature>("path")
      .data(municipalities, (d) => d.properties.code)
      .join("path")
      .attr("class", "municipality")
      .attr("data-code", (d) => d.properties.code)
      .attr("d", path)
      .on("click", (event, d) => {
        event.stopPropagation();
        const place = placeByMunicipality.get(d.properties.code);
        if (place) store.update({ place: place.id, selected: null });
      });

    townLayer
      .selectAll("path")
      .data(detail ? detail.towns.features : [])
      .join("path")
      .attr("d", path);

    const lakes = detail ? [detail.lakes, ...lakesOutsideDetail(geo)] : geo.lakes.features;
    lakeLayer.selectAll("path").data(lakes).join("path").attr("d", path);

    borderLayer.selectAll("*").remove();
    const outside = borderLayer.append("g").attr("clip-path", "url(#outside-detail)");
    outside.append("path").attr("class", "border-region").attr("d", path(geo.regionBorders));
    if (detail) {
      borderLayer.append("path").attr("class", "border-municipality").attr("d", path(detail.borders.municipality));
      borderLayer.append("path").attr("class", "border-region").attr("d", path(detail.borders.county));
      borderLayer.append("path").attr("class", "border-national").attr("d", path(detail.borders.national));
      borderLayer
        .append("path")
        .attr("class", "border-home")
        .attr("d", path({ type: "FeatureCollection", features: detail.counties.features } as never));
    } else {
      borderLayer.append("path").attr("class", "border-municipality").attr("d", path(geo.municipalityBorders));
      borderLayer.append("path").attr("class", "border-home").attr("d", path(geo.homeBorders));
    }

    roadLayer
      .selectAll("path")
      .data(detail ? detail.roads.features : [])
      .join("path")
      .attr("class", (d) => `road road-${d.properties.cls}`)
      .attr("d", path);

    drawInset();
    drawPlaceOutline();
  }

  /** Converts kilometres to projected map units at the home counties' latitude. */
  function projectedKm(km: number): number {
    const a = projection([15.5, 57])!;
    const b = projection([15.5, 57 + km / 111])!;
    return Math.abs(a[1] - b[1]);
  }

  function project(loc: { lng: number; lat: number }): Point {
    const [x, y] = projection([loc.lng, loc.lat])!;
    const [sx, sy] = transform.apply([x, y]);
    return { x: sx, y: sy };
  }

  function shelfPositions(nodes: GraphNode[]): Map<string, Point> {
    const rect = shelfRect();
    const result = new Map<string, Point>();
    nodes.forEach((n, i) => {
      if (isNarrow()) {
        const step = rect.w / nodes.length;
        result.set(n.id, { x: rect.x + step * (i + 0.5), y: rect.y + 36 });
      } else {
        result.set(n.id, { x: rect.x + 22, y: rect.y + SHELF.header + SHELF.rowHeight * (i + 0.5) - 4 });
      }
    });
    return result;
  }

  /**
   * Places located nodes near their anchor and pushes overlapping ones apart.
   * Initiatives orbit the actor that leads them.
   */
  function layout(ticks: number) {
    const shelf = shelfPositions(visible.filter((n) => !n.location));
    const items: LayoutNode[] = visible.map((node, i) => {
      if (!node.location) {
        const p = shelf.get(node.id)!;
        return { id: node.id, node, ax: p.x, ay: p.y, x: p.x, y: p.y, fx: p.x, fy: p.y, onShelf: true };
      }
      const a = project(node.location);
      const angle = i * 2.4;
      const off = offsets.get(node.id) ?? { x: Math.cos(angle) * 20, y: Math.sin(angle) * 20 };
      return { id: node.id, node, ax: a.x, ay: a.y, x: a.x + off.x, y: a.y + off.y, onShelf: false };
    });
    const ids = new Set(items.map((d) => d.id));
    const links = visible
      .filter((n) => n.kind === "initiative" && n.location && ids.has(n.initiative.lead))
      .map((n) => ({ source: (n as Extract<GraphNode, { kind: "initiative" }>).initiative.lead, target: n.id }));

    const sim = forceSimulation(items)
      .stop()
      .force("x", forceX<LayoutNode>((d) => d.ax).strength((d) => (d.node.kind === "actor" ? 0.2 : 0.03)))
      .force("y", forceY<LayoutNode>((d) => d.ay).strength((d) => (d.node.kind === "actor" ? 0.2 : 0.03)))
      .force(
        "collide",
        forceCollide<LayoutNode>((d) => nodeRadius(d.node) + (d.node.kind === "actor" ? 14 : 7)).iterations(3),
      )
      .force(
        "link",
        forceLink<LayoutNode, { source: string; target: string }>(links)
          .id((d) => d.id)
          .distance(34)
          .strength(0.5),
      );
    sim.alpha(0.6);
    for (let i = 0; i < ticks; i++) sim.tick();

    positions = new Map();
    for (const d of items) {
      positions.set(d.id, { x: d.x!, y: d.y! });
      if (!d.onShelf) offsets.set(d.id, { x: d.x! - d.ax, y: d.y! - d.ay });
    }
    anchors = new Map(items.filter((d) => !d.onShelf).map((d) => [d.id, { x: d.ax, y: d.ay }]));
  }

  /** Redraws nodes and edges; `animate` eases them to their new places (used after filtering). */
  function draw(animate: boolean) {
    drawShelf();
    const ms = animate ? duration(450) : 0;

    const visibleIds = new Set(visible.map((n) => n.id));
    const edges = graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
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
            .attr("d", edgePath)
            .style("opacity", 0)
            .call((s) => s.transition().duration(duration(500)).style("opacity", null)),
        (update) => update,
        (exit) => exit.transition().duration(duration(250)).style("opacity", 0).remove(),
      );
    if (ms > 0) edgeSel.transition().duration(ms).ease(easeCubicInOut).attr("d", edgePath);
    else edgeSel.interrupt().attr("d", edgePath);

    drawLeaders();

    const nodeTransform = (n: GraphNode) => {
      const p = positions.get(n.id)!;
      return `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
    };
    let entered = 0;
    const nodes = nodeLayer
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(visible, (n) => n.id)
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
            .style("--delay", () => `${firstDraw ? entered++ * 30 : 0}ms`);
          drawGlyphs(g, "right", (n) => n);
          g.on("click", (event, n) => {
            event.stopPropagation();
            store.update({ selected: store.state.selected === n.id ? null : n.id });
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
        (exit) => exit.classed("leaving", true).transition().duration(duration(250)).style("opacity", 0).remove(),
      )
      .classed("on-shelf", (n) => !n.location);
    if (ms > 0) nodes.transition().duration(ms).ease(easeCubicInOut).attr("transform", nodeTransform);
    else nodes.interrupt().attr("transform", nodeTransform);
    firstDraw = false;

    highlight(nodes);
  }

  /** Thin lines from displaced actors back to their true location, and to their other sites. */
  function drawLeaders() {
    const leaders: { id: string; owner: string; from: Point; to: Point; secondary: boolean }[] = [];
    for (const n of visible) {
      if (n.kind !== "actor" || !n.location) continue;
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
    const hasShelf = visible.some((n) => !n.location);
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
      .attr("y", (r) => r.y + 25)
      .text(t.offMapColumn);
  }

  /**
   * Place names: municipalities in the overview, then towns by size as you zoom
   * in, plus lakes and seas. Towns are kept clear of node labels.
   */
  function drawPlaceLabels(occupied: Box[]) {
    const path = geoPath(projection);
    const k = transform.k;
    type Label = { key: string; cls: string; text: string; x: number; y: number; angle?: number; size?: number };
    const labels: Label[] = [];
    const at = (f: Feature) => transform.apply(path.centroid(f));

    if (k < 2.2) {
      for (const f of geo.municipalities.features) {
        if (!isHomeCounty(f.properties.county)) continue;
        const [x, y] = at(f as Feature);
        labels.push({ key: `m${f.properties.code}`, cls: "place-municipality", text: f.properties.name, x, y });
      }
    }
    for (const f of geo.regions.features) {
      if (isHomeCounty(f.properties.code)) continue;
      const [x, y] = at(f as Feature);
      labels.push({ key: `r${f.properties.code}`, cls: "place-region", text: f.properties.name, x, y });
    }
    for (const s of SEA_LABELS) {
      if (k < s.minK || k > s.maxK) continue;
      const p = project(s);
      labels.push({ key: `s${s.name}`, cls: "place-sea", text: s.name, x: p.x, y: p.y, angle: s.angle, size: s.size });
    }
    if (detail) {
      for (const l of detail.lakeLabels.features) {
        if (!(MAJOR_LAKES.has(l.properties.name) ? k >= 1.2 : k >= 4)) continue;
        const [lng, lat] = l.geometry.coordinates;
        const p = project({ lng, lat });
        labels.push({ key: `l${l.properties.name}`, cls: "place-lake", text: l.properties.name, x: p.x, y: p.y });
      }
      // Bigger towns first; each must fit without overlapping what is already placed.
      const minPopulation = k >= 8 ? 200 : k >= 4.5 ? 800 : k >= 2.6 ? 2500 : k >= 1.6 ? 8000 : Infinity;
      const towns = detail.townLabels.features
        .filter((f) => f.properties.population >= minPopulation)
        .sort((a, b) => b.properties.population - a.properties.population);
      const placed = [...occupied];
      for (const f of towns) {
        const [lng, lat] = f.geometry.coordinates;
        const p = project({ lng, lat });
        if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
        const size = f.properties.population >= 20000 ? 13.5 : f.properties.population >= 5000 ? 12.5 : 11.5;
        const w = f.properties.name.length * size * 0.56;
        const box = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - size * 0.7, y1: p.y + size * 0.5 };
        if (placed.some((b) => box.x0 < b.x1 && b.x0 < box.x1 && box.y0 < b.y1 && b.y0 < box.y1)) continue;
        placed.push(box);
        labels.push({ key: `t${f.properties.name}`, cls: "place-town", text: f.properties.name, x: p.x, y: p.y, size });
      }
    }

    placeLabels
      .selectAll<SVGTextElement, Label>("text")
      .data(labels, (d) => d.key)
      .join("text")
      .attr("class", (d) => d.cls)
      .attr("transform", (d) => `translate(${d.x.toFixed(1)},${d.y.toFixed(1)})${d.angle ? ` rotate(${d.angle})` : ""}`)
      .style("font-size", (d) => (d.size ? `${d.size}px` : null))
      .text((d) => d.text);
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
      ].map(([x, y]) => insetProjection!(projection.invert!(transform.invert([x, y]))!)!);
      insetView.attr("d", `M${corners.map((c) => c.map((v) => v.toFixed(1)).join(",")).join("L")}Z`);
    }
    // Scale bar: the longest round distance that fits in about 120 pixels.
    const cy = height / 2;
    const a = projection.invert!(transform.invert([width / 2 - 50, cy]))!;
    const b = projection.invert!(transform.invert([width / 2 + 50, cy]))!;
    const kmPer100px = geoDistance(a, b) * 6371;
    const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
    const km = steps.filter((s) => (s / kmPer100px) * 100 <= 120).pop() ?? steps[0];
    const px = (km / kmPer100px) * 100;
    scaleSvg
      .attr("width", px + 2)
      .selectAll("path")
      .data([px])
      .join("path")
      .attr("d", (d) => `M1,1V8H${(d + 1).toFixed(1)}V1 M${(d / 2 + 1).toFixed(1)},4.5V8`);
    scaleText.text(km < 1 ? `${km * 1000} m` : `${km} km`);
  }

  function currentPlace(): Place | undefined {
    return store.state.place ? geo.placeById.get(store.state.place) : undefined;
  }

  function drawPlaceOutline() {
    const place = currentPlace();
    const path = geoPath(projection);
    placeFill.selectAll("path").data(place ? [place.feature] : []).join("path").attr("d", path);
    placeOutline.selectAll("path").data(place ? [place.feature] : []).join("path").attr("d", path);
    svg.classed("has-place", Boolean(place));
  }

  function highlight(nodes = nodeLayer.selectAll<SVGGElement, GraphNode>("g.node")) {
    const focus = focusSet(graph, store.state);
    applyHighlight(
      nodes,
      edgeLayer.selectAll<SVGPathElement, GraphEdge>("path"),
      focus,
      (n) => n.id,
      (e) => e,
    );
    leaderLayer
      .selectAll<SVGGElement, { owner: string }>("g")
      .classed("dim", (d) => focus !== null && !focus.nodes.has(d.owner));

    const { shown, boxes } = chooseLabels(focus?.id ?? null, focus?.nodes ?? null);
    nodes.classed("show-label", (n) => shown.has(n.id));
    nodes.each(function (n) {
      const side = !n.location && isNarrow() ? "below" : (shown.get(n.id) ?? "right");
      positionLabel(this.querySelector<SVGTextElement>("text.label")!, nodeRadius(n), side);
    });
    drawPlaceLabels(boxes);
  }

  /**
   * Shows as many labels as fit without overlapping. The focused node and its
   * neighbours win; otherwise actors go first, and initiatives only when zoomed in.
   */
  function chooseLabels(focusId: string | null, focusNodes: Set<string> | null) {
    const candidate = (n: GraphNode): LabelCandidate => {
      const p = positions.get(n.id)!;
      return { id: n.id, x: p.x, y: p.y, r: nodeRadius(n), lines: wrapLabel(n.name), fontSize: n.kind === "actor" ? 12.5 : 11.5 };
    };
    const onMap = visible.filter((n) => n.location && positions.has(n.id));
    const degree = (n: GraphNode) => graph.incident.get(n.id)?.length ?? 0;
    const rank = (n: GraphNode) => (n.id === focusId ? 0 : focusNodes?.has(n.id) ? 1 : 2) * 10 + (n.kind === "actor" ? 0 : 1);
    const eligible = onMap.filter((n) => (focusNodes ? focusNodes.has(n.id) : n.kind === "actor" || transform.k >= 2.2));
    eligible.sort((a, b) => rank(a) - rank(b) || degree(b) - degree(a));
    // While focusing, dimmed nodes may be covered by labels.
    const obstacles = focusNodes ? onMap.filter((n) => focusNodes.has(n.id)) : onMap;
    const candidates = eligible.map(candidate);
    // Labels must stay clear of the details sheet when it is open.
    const sheetOpen = !isNarrow() && (store.state.selected !== null || store.state.place !== null);
    const shown = pickLabels(candidates, obstacles.map(candidate), { width: sheetOpen ? width - SHEET : width, height });
    for (const n of visible) if (!n.location) shown.set(n.id, "right");
    // Space taken by node labels and symbols, so town names can be placed around them.
    const boxes: Box[] = candidates.filter((c) => shown.has(c.id)).map((c) => labelBox(c, shown.get(c.id) as LabelSide));
    for (const n of onMap) {
      const p = positions.get(n.id)!;
      const r = nodeRadius(n) + 2;
      boxes.push({ x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r });
    }
    return { shown, boxes };
  }

  /**
   * Nodes to draw: those passing the filters and, when a place is selected,
   * only those in it (plus national ones), so neighbouring clusters don't
   * spill into the view. The selected node and its neighbours always stay.
   */
  function refreshVisible() {
    const place = currentPlace();
    const focus = focusSet(graph, store.state);
    visible = graph.nodes.filter(
      (n) =>
        isNodeVisible(n, store.state.filters) &&
        (!place || !n.location || n.municipalities.some((m) => place.municipalities.includes(m)) || focus?.nodes.has(n.id)),
    );
  }

  /** Smoothly zooms so that a feature fills the free part of the screen. */
  function zoomToFeature(f: Feature, maxScale = 24, panelOpen = true) {
    if (width === 0) return;
    const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(f);
    const [[ax, ay], [bx, by]] = freeArea(panelOpen);
    const k = Math.min(maxScale, 0.9 * Math.min((bx - ax) / (x1 - x0), (by - ay) / (y1 - y0)));
    const target = zoomIdentity
      .translate((ax + bx) / 2, (ay + by) / 2)
      .scale(k)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.transition().duration(duration(900)).ease(easeCubicInOut).call(zoomBehavior.transform, target);
  }

  function zoomHome() {
    store.update({ place: null });
    svg.transition().duration(duration(800)).ease(easeCubicInOut).call(zoomBehavior.transform, zoomIdentity);
  }

  /** Zooms to the counties currently selected in the filter. */
  function zoomToCounties() {
    const codes: string[] = [...store.state.filters.counties];
    if (codes.length === 0 || codes.length === HOME_COUNTIES.length) {
      svg.transition().duration(duration(800)).ease(easeCubicInOut).call(zoomBehavior.transform, zoomIdentity);
      return;
    }
    const features = geo.places.filter((p) => p.kind === "county" && codes.includes(p.county)).map((p) => p.feature);
    zoomToFeature(collection(features), 24, false);
  }

  function resize() {
    const box = container.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      width = height = 0;
      return;
    }
    width = box.width;
    height = box.height;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    fitProjection();
    basemap.attr("transform", transform.toString());
    setZoomClasses();
    layout(220);
    draw(false);
    drawFurniture();
  }

  store.subscribe((state, prev) => {
    const membershipChanged =
      state.filters !== prev.filters || state.place !== prev.place || (state.place !== null && state.selected !== prev.selected);
    if (membershipChanged) refreshVisible();
    // While hidden the view has no size; resize() catches up when it is shown again.
    if (width === 0) return;
    if (membershipChanged) {
      layout(120);
      draw(true);
      if (state.filters.counties !== prev.filters.counties) zoomToCounties();
    }
    if (state.place !== prev.place) {
      drawPlaceOutline();
      const place = currentPlace();
      if (place) zoomToFeature(place.feature);
    }
    if (state.selected !== prev.selected || state.hovered !== prev.hovered || state.place !== prev.place) highlight();
  });

  refreshVisible();
  new ResizeObserver(() => resize()).observe(container);
  inset.on("click", zoomHome);

  return {
    resize,
    setDetail(layers: DetailLayers) {
      detail = layers;
      svg.classed("has-detail", true);
      if (width > 0) {
        drawBasemap();
        highlight();
      }
    },
    focus(id: string) {
      const node = graph.byId.get(id);
      if (!node?.location || width === 0) return;
      const [x, y] = projection([node.location.lng, node.location.lat])!;
      const k = Math.max(transform.k, 3);
      const [[ax, ay], [bx, by]] = freeArea(true);
      const target = zoomIdentity
        .translate((ax + bx) / 2, (ay + by) / 2)
        .scale(k)
        .translate(-x, -y);
      svg.transition().duration(duration(800)).ease(easeCubicInOut).call(zoomBehavior.transform, target);
    },
    focusPlace(id: string) {
      const place = geo.placeById.get(id);
      if (place) zoomToFeature(place.feature);
    },
    zoomBy(factor: number) {
      svg.transition().duration(duration(300)).call(zoomBehavior.scaleBy, factor);
    },
    reset: zoomHome,
  };
}
