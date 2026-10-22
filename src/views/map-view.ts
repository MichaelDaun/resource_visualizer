import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { forceCollide, forceLink, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Graph, GraphEdge, GraphNode } from "../data/graph";
import type { Location } from "../data/types";
import { t } from "../i18n/sv";
import { isNodeVisible, type Store } from "../state";
import { edgeStyles, nodeRadius } from "../theme";
import { curvedPath, drawGlyphs, nodeAriaLabel, positionLabel, wrapLabel } from "./glyphs";
import { pickLabels, type LabelCandidate, type LabelSide } from "./labels";
import { applyHighlight, focusSet } from "./highlight";
import type { View } from "./view";

interface RegionProps {
  code: string;
  name: string;
}
interface MunicipalityProps extends RegionProps {
  county: string;
}
export type SwedenTopology = Topology<{
  regions: GeometryCollection<RegionProps>;
  municipalities: GeometryCollection<MunicipalityProps>;
}>;

/** County shown in focus when the map opens. */
const HOME_COUNTY = "08"; // Kalmar län

const SHELF = { width: 210, margin: 16, rowHeight: 50, header: 44 };
const NARROW = 720;

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

export function createMapView(container: HTMLElement, graph: Graph, store: Store, topo: SwedenTopology): View {
  const regions = feature(topo, topo.objects.regions) as FeatureCollection<Geometry, RegionProps>;
  const municipalities = feature(topo, topo.objects.municipalities) as FeatureCollection<Geometry, MunicipalityProps>;
  const home = regions.features.find((f) => f.properties.code === HOME_COUNTY)!;
  const homeMunicipalities = municipalities.features.filter((f) => f.properties.county === HOME_COUNTY);
  const municipalityBorders = mesh(topo, topo.objects.municipalities, (a, b) => a !== b);
  const regionBorders = mesh(topo, topo.objects.regions, (a, b) => a !== b);

  const svg = select(container)
    .append("svg")
    .attr("class", "map-svg")
    .attr("role", "img")
    .attr("aria-label", t.viewMap);

  const basemap = svg.append("g").attr("class", "basemap");
  const landLayer = basemap.append("g");
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

  const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 14])
    .on("zoom", (event) => {
      transform = event.transform;
      basemap.attr("transform", transform.toString());
      layout(14);
      draw();
    });
  svg.call(zoomBehavior).on("dblclick.zoom", null);
  svg.on("click", (event) => {
    if (event.target === svg.node() || (event.target as Element).closest(".basemap")) store.update({ selected: null });
  });

  const isNarrow = () => width < NARROW;

  function shelfRect() {
    if (isNarrow()) {
      const h = 100;
      return { x: SHELF.margin, y: height - h - SHELF.margin, w: width - SHELF.margin * 2, h };
    }
    const count = visible.filter((n) => !n.location).length;
    return {
      x: SHELF.margin,
      y: SHELF.margin,
      w: SHELF.width,
      h: SHELF.header + Math.max(1, count) * SHELF.rowHeight,
    };
  }

  function fitProjection() {
    const points = graph.nodes.flatMap((n) => (n.kind === "actor" ? (n.actor.locations ?? []) : []));
    const focus: Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "GeometryCollection",
        geometries: [home.geometry, { type: "MultiPoint", coordinates: points.map((p) => [p.lng, p.lat]) }],
      },
    };
    const pad = 40;
    const left = isNarrow() ? pad : SHELF.margin * 2 + SHELF.width + pad;
    const bottom = isNarrow() ? 100 + SHELF.margin * 2 + pad : pad;
    projection = geoMercator().fitExtent(
      [
        [left, pad],
        [Math.max(left + 50, width - pad - 120), Math.max(pad + 50, height - bottom)],
      ],
      focus,
    );
    const path = geoPath(projection);
    landLayer.selectAll("*").remove();
    landLayer
      .selectAll("path.region")
      .data(regions.features)
      .join("path")
      .attr("class", (d) => `region${d.properties.code === HOME_COUNTY ? " region-home" : ""}`)
      .attr("d", path);
    landLayer.append("path").attr("class", "municipality-border").attr("d", path(municipalityBorders));
    landLayer.append("path").attr("class", "region-border").attr("d", path(regionBorders));
    landLayer.append("path").attr("class", "home-outline").attr("d", path(home));
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
    const shelfNodes = visible.filter((n) => !n.location);
    const shelf = shelfPositions(shelfNodes);
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
      .force("collide", forceCollide<LayoutNode>((d) => nodeRadius(d.node) + (d.node.kind === "actor" ? 14 : 7)).iterations(3))
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

  function draw() {
    drawPlaceLabels();
    drawShelf();

    const visibleIds = new Set(visible.map((n) => n.id));
    const edges = graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    edgeLayer
      .selectAll<SVGPathElement, GraphEdge>("path")
      .data(edges, (e) => e.id)
      .join("path")
      .attr("class", (e) => `edge edge-${e.type}`)
      .attr("stroke", (e) => edgeStyles[e.type].color)
      .attr("stroke-width", (e) => edgeStyles[e.type].width)
      .attr("stroke-dasharray", (e) => edgeStyles[e.type].dash ?? null)
      .attr("d", (e) => {
        const a = positions.get(e.source)!;
        const b = positions.get(e.target)!;
        return curvedPath(a.x, a.y, b.x, b.y);
      });

    // Thin lines from displaced actors back to their true location, and from
    // actors to their secondary sites.
    const leaders: { id: string; owner: string; from: Point; to: Point; secondary: boolean }[] = [];
    for (const n of visible) {
      if (n.kind !== "actor" || !n.location) continue;
      const p = positions.get(n.id)!;
      const a = anchors.get(n.id)!;
      if (Math.hypot(p.x - a.x, p.y - a.y) > 6) leaders.push({ id: `${n.id}:anchor`, owner: n.id, from: a, to: p, secondary: false });
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

    const nodes = nodeLayer
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(visible, (n) => n.id)
      .join((enter) => {
        const g = enter
          .append("g")
          .attr("class", (n) => `node node-${n.kind}`)
          .attr("tabindex", 0)
          .attr("role", "button")
          .attr("aria-label", nodeAriaLabel)
          .attr("data-id", (n) => n.id);
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
          .on("mouseleave", () => store.update({ hovered: null }));
        return g;
      })
      .attr("transform", (n) => {
        const p = positions.get(n.id)!;
        return `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
      })
      .classed("on-shelf", (n) => !n.location);

    highlight(nodes);
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
      .attr("height", (r) => r.h)
      .attr("rx", 12);
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
    const labels = [
      ...homeMunicipalities.map((f) => ({ f, cls: "place-municipality", minK: 0.9 })),
      ...regions.features
        .filter((f) => f.properties.code !== HOME_COUNTY)
        .map((f) => ({ f, cls: "place-region", minK: 0 })),
    ].filter((d) => transform.k >= d.minK);
    placeLabels
      .selectAll<SVGTextElement, (typeof labels)[number]>("text")
      .data(labels, (d) => d.f.properties.code)
      .join("text")
      .attr("class", (d) => d.cls)
      .attr("transform", (d) => {
        const [x, y] = transform.apply(path.centroid(d.f));
        return `translate(${x.toFixed(1)},${y.toFixed(1)})`;
      })
      .text((d) => d.f.properties.name);
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
    const onMap = visible.filter((n) => n.location);
    const degree = (n: GraphNode) => graph.incident.get(n.id)?.length ?? 0;
    const rank = (n: GraphNode) =>
      (n.id === focusId ? 0 : focusNodes?.has(n.id) ? 1 : 2) * 10 + (n.kind === "actor" ? 0 : 1);
    const eligible = onMap.filter((n) =>
      focusNodes ? focusNodes.has(n.id) : n.kind === "actor" || transform.k >= 2.2,
    );
    eligible.sort((a, b) => rank(a) - rank(b) || degree(b) - degree(a));
    // While focusing, dimmed nodes may be covered by labels.
    const obstacles = focusNodes ? onMap.filter((n) => focusNodes.has(n.id)) : onMap;
    const shown = pickLabels(eligible.map(candidate), obstacles.map(candidate));
    for (const n of visible) if (!n.location) shown.set(n.id, "right");
    return shown;
  }

  function refreshVisible() {
    visible = graph.nodes.filter((n) => isNodeVisible(n, store.state.filters));
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
    draw();
  }

  store.subscribe((state, prev) => {
    if (state.filters !== prev.filters) refreshVisible();
    // While hidden the view has no size; resize() catches up when it is shown again.
    if (width === 0) return;
    if (state.filters !== prev.filters) {
      layout(120);
      draw();
    } else if (state.selected !== prev.selected || state.hovered !== prev.hovered) {
      highlight();
    }
  });

  refreshVisible();
  new ResizeObserver(() => resize()).observe(container);

  return {
    resize,
    focus(id: string) {
      const node = graph.byId.get(id);
      if (!node?.location || width === 0) return;
      const [x, y] = projection([node.location.lng, node.location.lat])!;
      const k = Math.max(transform.k, 2.5);
      // Keep the node clear of the details panel (right side, or bottom sheet on phones).
      const target = zoomIdentity
        .translate(isNarrow() ? width / 2 : width / 2 - 160, isNarrow() ? height * 0.22 : height / 2)
        .scale(k)
        .translate(-x, -y);
      svg.transition().duration(650).call(zoomBehavior.transform, target);
    },
    zoomBy(factor: number) {
      svg.transition().duration(250).call(zoomBehavior.scaleBy, factor);
    },
    reset() {
      svg.transition().duration(500).call(zoomBehavior.transform, zoomIdentity);
    },
  };
}
