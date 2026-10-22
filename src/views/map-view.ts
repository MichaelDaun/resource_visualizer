import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { easeCubicInOut } from "d3-ease";
import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { forceCollide, forceLink, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Feature, Geometry } from "geojson";
import type { Graph, GraphEdge, GraphNode } from "../data/graph";
import type { Location } from "../data/types";
import { HOME_COUNTIES, isHomeCounty, type GeoIndex, type Place } from "../geo";
import { t } from "../i18n/sv";
import { isNodeVisible, type Store } from "../state";
import { nodeRadius, theme } from "../theme";
import { curvedPath, drawGlyphs, nodeAriaLabel, positionLabel, wrapLabel } from "./glyphs";
import { pickLabels, type LabelCandidate, type LabelSide } from "./labels";
import { applyHighlight, focusSet } from "./highlight";
import { reducedMotion, type View } from "./view";

const SHELF = { width: 210, margin: 16, rowHeight: 50, header: 44 };
const NARROW = 720;
/** Width of the details panel on wide screens, kept clear when zooming to something. */
const PANEL = 400;

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

interface MunicipalityFeature extends Feature<Geometry, { code: string; county: string; name: string }> {}

export function createMapView(container: HTMLElement, graph: Graph, store: Store, geo: GeoIndex): View {
  const homeMunicipalities = geo.municipalities.features.filter((f) => isHomeCounty(f.properties.county));
  const homeRegions = geo.regions.features.filter((f) => isHomeCounty(f.properties.code));
  const placeByMunicipality = new Map(
    geo.places.filter((p) => p.kind === "municipality").map((p) => [p.municipalities[0], p]),
  );

  const svg = select(container)
    .append("svg")
    .attr("class", "map-svg")
    .attr("role", "img")
    .attr("aria-label", t.viewMap);

  const defs = svg.append("defs");
  const landClip = defs.append("clipPath").attr("id", "land-clip").append("path");

  const basemap = svg.append("g").attr("class", "basemap");
  const landLayer = basemap.append("path").attr("class", "land");
  const homeLayer = basemap.append("g").attr("class", "home").attr("clip-path", "url(#land-clip)");
  const municipalityLayer = basemap.append("g").attr("class", "municipalities").attr("clip-path", "url(#land-clip)");
  // The selected place is filled as one merged shape so overlapping simplified borders don't double up.
  const placeFill = basemap.append("path").attr("class", "place-fill").attr("clip-path", "url(#land-clip)");
  const lakeLayer = basemap.append("g").attr("class", "lakes");
  const borderLayer = basemap.append("g").attr("class", "borders").attr("clip-path", "url(#land-clip)");
  const coastLayer = basemap.append("path").attr("class", "coast");
  const placeOutline = basemap.append("path").attr("class", "place-outline");

  const placeLabels = svg.append("g").attr("class", "place-labels");
  const shelfLayer = svg.append("g").attr("class", "shelf");
  const edgeLayer = svg.append("g").attr("class", "edges");
  const leaderLayer = svg.append("g").attr("class", "leaders");
  const nodeLayer = svg.append("g").attr("class", "nodes");

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
    .scaleExtent([0.25, 24])
    .on("zoom", (event) => {
      transform = event.transform;
      basemap.attr("transform", transform.toString());
      svg.classed("zoomed", transform.k >= 2.2);
      layout(14);
      draw(false);
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

  function shelfRect() {
    if (isNarrow()) {
      const h = 100;
      return { x: SHELF.margin, y: height - h - SHELF.margin, w: width - SHELF.margin * 2, h };
    }
    const count = visible.filter((n) => !n.location).length;
    return { x: SHELF.margin, y: SHELF.margin, w: SHELF.width, h: SHELF.header + Math.max(1, count) * SHELF.rowHeight };
  }

  /** The screen area not covered by the shelf (and the details panel, if open). */
  function freeArea(panelOpen: boolean): [[number, number], [number, number]] {
    const pad = 36;
    if (isNarrow()) {
      const bottom = panelOpen ? height * 0.45 : height - (100 + SHELF.margin * 2);
      return [
        [pad, pad],
        [width - pad, Math.max(pad + 40, bottom - pad)],
      ];
    }
    const left = SHELF.margin * 2 + SHELF.width + pad;
    const right = width - pad - (panelOpen ? PANEL : 40);
    return [
      [left, pad],
      [Math.max(left + 60, right), height - pad],
    ];
  }

  function fitProjection() {
    const focus: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "GeometryCollection", geometries: homeRegions.map((f) => f.geometry) },
    };
    projection = geoMercator().fitExtent(freeArea(false), focus);
    const path = geoPath(projection);

    landClip.attr("d", path(geo.land as never));
    landLayer.attr("d", path(geo.land as never));
    coastLayer.attr("d", path(geo.land as never));

    // The county shapes are simplified; a stroke in the fill colour covers the
    // gap to the more detailed coastline, and the land clip trims the overflow.
    homeLayer
      .selectAll("path")
      .data(homeRegions)
      .join("path")
      .attr("class", "home-county")
      .attr("d", path)
      .attr("stroke-width", projectedKm(3));

    municipalityLayer
      .selectAll<SVGPathElement, MunicipalityFeature>("path")
      .data(homeMunicipalities as MunicipalityFeature[], (d) => d.properties.code)
      .join("path")
      .attr("class", "municipality")
      .attr("data-code", (d) => d.properties.code)
      .attr("d", path)
      .on("click", (event, d) => {
        event.stopPropagation();
        const place = placeByMunicipality.get(d.properties.code);
        if (place) store.update({ place: place.id, selected: null });
      });

    lakeLayer
      .selectAll("path")
      .data(geo.lakes.features)
      .join("path")
      .attr("d", path);

    borderLayer.selectAll("*").remove();
    borderLayer.append("path").attr("class", "border-municipality").attr("d", path(geo.municipalityBorders));
    borderLayer.append("path").attr("class", "border-region").attr("d", path(geo.regionBorders));
    borderLayer.append("path").attr("class", "border-home").attr("d", path(geo.homeBorders));

    drawPlaceOutline();
  }

  /** Converts kilometres to projected map units at the home counties' latitude. */
  function projectedKm(km: number): number {
    const a = projection([15.5, 57])!;
    const b = projection([15.5, 57 + km / 111])!;
    return Math.abs(a[1] - b[1]);
  }

  function project(loc: Location): Point {
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
        result.set(n.id, { x: rect.x + step * (i + 0.5), y: rect.y + 42 });
      } else {
        result.set(n.id, { x: rect.x + 22, y: rect.y + SHELF.header + SHELF.rowHeight * (i + 0.5) - 6 });
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
    drawPlaceLabels();
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
            .style("--delay", () => `${firstDraw ? entered++ * 35 : 0}ms`);
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
      .attr("r", (d) => (d.secondary ? 5 : 2.5))
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
      .attr("y", (r) => r.y + 24)
      .text(t.offMapColumn);
  }

  function drawPlaceLabels() {
    const path = geoPath(projection);
    const k = transform.k;
    const labels = [
      ...homeMunicipalities.map((f) => ({ key: f.properties.code, f, cls: "place-municipality", text: f.properties.name, minK: 0.9 })),
      ...geo.regions.features
        .filter((f) => !isHomeCounty(f.properties.code))
        .map((f) => ({ key: `r${f.properties.code}`, f, cls: "place-region", text: f.properties.name, minK: 0 })),
      ...geo.lakes.features
        .filter((f) => !f.properties.name.startsWith("lake-"))
        .map((f) => ({ key: `l${f.properties.name}`, f, cls: "place-lake", text: f.properties.name, minK: 1.6 })),
    ].filter((d) => k >= d.minK);
    placeLabels
      .selectAll<SVGTextElement, (typeof labels)[number]>("text")
      .data(labels, (d) => d.key)
      .join("text")
      .attr("class", (d) => d.cls)
      .attr("transform", (d) => {
        const [x, y] = transform.apply(path.centroid(d.f as Feature));
        return `translate(${x.toFixed(1)},${y.toFixed(1)})`;
      })
      .text((d) => d.text);
  }

  function currentPlace(): Place | undefined {
    return store.state.place ? geo.placeById.get(store.state.place) : undefined;
  }

  function drawPlaceOutline() {
    const place = currentPlace();
    const codes = new Set(place?.municipalities ?? []);
    municipalityLayer.selectAll<SVGPathElement, MunicipalityFeature>("path").classed("active", (d) => codes.has(d.properties.code));
    const d = place ? geoPath(projection)(place.feature) : null;
    placeOutline.attr("d", d);
    placeFill.attr("d", d);
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

    // Inside a selected place, nodes elsewhere step back.
    const place = currentPlace();
    const inPlace = (n: GraphNode) => !place || (n.municipality !== undefined && place.municipalities.includes(n.municipality));
    nodes.classed("outside-place", (n) => !focus && n.location !== undefined && !inPlace(n));

    const shown = chooseLabels(focus?.id ?? null, focus?.nodes ?? null);
    nodes.classed("show-label", (n) => shown.has(n.id));
    nodes.each(function (n) {
      const side = !n.location && isNarrow() ? "below" : (shown.get(n.id) ?? "right");
      positionLabel(this.querySelector<SVGTextElement>("text.label")!, nodeRadius(n), side);
    });
  }

  /**
   * Shows as many labels as fit without overlapping. The focused node and its
   * neighbours win; otherwise actors go first, and initiatives only when zoomed in.
   */
  function chooseLabels(focusId: string | null, focusNodes: Set<string> | null): Map<string, LabelSide> {
    const candidate = (n: GraphNode): LabelCandidate => {
      const p = positions.get(n.id)!;
      return { id: n.id, x: p.x, y: p.y, r: nodeRadius(n), lines: wrapLabel(n.name), fontSize: n.kind === "actor" ? 12 : 11 };
    };
    const onMap = visible.filter((n) => n.location && positions.has(n.id));
    const degree = (n: GraphNode) => graph.incident.get(n.id)?.length ?? 0;
    const rank = (n: GraphNode) => (n.id === focusId ? 0 : focusNodes?.has(n.id) ? 1 : 2) * 10 + (n.kind === "actor" ? 0 : 1);
    const eligible = onMap.filter((n) => (focusNodes ? focusNodes.has(n.id) : n.kind === "actor" || transform.k >= 2.2));
    eligible.sort((a, b) => rank(a) - rank(b) || degree(b) - degree(a));
    // While focusing, dimmed nodes may be covered by labels.
    const obstacles = focusNodes ? onMap.filter((n) => focusNodes.has(n.id)) : onMap;
    const shown = pickLabels(eligible.map(candidate), obstacles.map(candidate), { width, height });
    for (const n of visible) if (!n.location) shown.set(n.id, "right");
    return shown;
  }

  function refreshVisible() {
    visible = graph.nodes.filter((n) => isNodeVisible(n, store.state.filters));
  }

  /** Smoothly zooms so that a feature fills the free part of the screen. */
  function zoomToFeature(f: Feature, maxScale = 16, panelOpen = true) {
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

  /** Zooms to the counties currently selected in the filter. */
  function zoomToCounties() {
    const codes: string[] = [...store.state.filters.counties];
    if (codes.length === 0 || codes.length === HOME_COUNTIES.length) {
      svg.transition().duration(duration(800)).ease(easeCubicInOut).call(zoomBehavior.transform, zoomIdentity);
      return;
    }
    const features = geo.regions.features.filter((f) => codes.includes(f.properties.code));
    zoomToFeature(
      { type: "Feature", properties: {}, geometry: { type: "GeometryCollection", geometries: features.map((f) => f.geometry) } },
      16,
      false,
    );
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
    layout(220);
    draw(false);
  }

  store.subscribe((state, prev) => {
    if (state.filters !== prev.filters) refreshVisible();
    // While hidden the view has no size; resize() catches up when it is shown again.
    if (width === 0) return;
    if (state.filters !== prev.filters) {
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

  return {
    resize,
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
    reset() {
      store.update({ place: null });
      svg.transition().duration(duration(800)).ease(easeCubicInOut).call(zoomBehavior.transform, zoomIdentity);
    },
  };
}
