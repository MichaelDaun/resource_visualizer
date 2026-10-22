import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { drag } from "d3-drag";
import "d3-transition";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { Graph, GraphEdge, GraphNode } from "../data/graph";
import { t } from "../i18n/sv";
import { isNodeVisible, type Store } from "../state";
import { nodeRadius, theme } from "../theme";
import { curvedPath, drawGlyphs, nodeAriaLabel, wrapLabel } from "./glyphs";
import { applyHighlight, focusSet } from "./highlight";
import type { View } from "./view";

interface SimNode extends SimulationNodeDatum {
  id: string;
  node: GraphNode;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  edge: GraphEdge;
}

/** Link lengths per relation type: tight around the lead, looser for funding. */
const LINK_DISTANCE: Record<GraphEdge["type"], number> = {
  lead: 70,
  partner: 120,
  funds: 150,
  owns: 130,
  manages: 130,
  collaborates: 160,
};

export function createNetworkView(container: HTMLElement, graph: Graph, store: Store): View {
  const svg = select(container)
    .append("svg")
    .attr("class", "network-svg")
    .attr("role", "img")
    .attr("aria-label", t.viewNetwork);
  const root = svg.append("g");
  const edgeLayer = root.append("g").attr("class", "edges");
  const nodeLayer = root.append("g").attr("class", "nodes");

  let width = 0;
  let height = 0;
  const simNodes = new Map<string, SimNode>();
  let simulation: Simulation<SimNode, SimLink> | null = null;
  let fitted = false;

  /** Zooms so that all visible nodes, with labels, fit the view. */
  function fit(duration = 600) {
    const nodes = [...simNodes.values()].filter((d) => isNodeVisible(d.node, store.state.filters));
    if (nodes.length === 0 || width === 0) return;
    const xs = nodes.map((d) => d.x!);
    const ys = nodes.map((d) => d.y!);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 90, Math.max(...xs) + 90, Math.min(...ys) - 50, Math.max(...ys) + 60];
    const k = Math.min(1.2, 0.92 * Math.min(width / (x1 - x0), height / (y1 - y0)));
    const transform = zoomIdentity.scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    if (duration === 0) svg.call(zoomBehavior.transform, transform);
    else svg.transition().duration(duration).call(zoomBehavior.transform, transform);
  }

  const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 4])
    .on("zoom", (event) => root.attr("transform", event.transform.toString()));
  svg.call(zoomBehavior).on("dblclick.zoom", null);
  svg.on("click", (event) => {
    if (event.target === svg.node()) store.update({ selected: null });
  });

  function rebuild() {
    const visible = graph.nodes.filter((n) => isNodeVisible(n, store.state.filters));
    const ids = new Set(visible.map((n) => n.id));
    const nodes = visible.map((node, i) => {
      let d = simNodes.get(node.id);
      if (!d) {
        const angle = i * 2.4;
        d = { id: node.id, node, x: Math.cos(angle) * 150, y: Math.sin(angle) * 150 };
        simNodes.set(node.id, d);
      }
      return d;
    });
    const links: SimLink[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((edge) => ({ source: edge.source, target: edge.target, edge }));

    simulation?.stop();
    simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => LINK_DISTANCE[l.edge.type])
          .strength(0.6),
      )
      .force("charge", forceManyBody<SimNode>().strength(-700))
      // Labels sit below nodes, so give each node room for roughly half its label width.
      .force(
        "collide",
        forceCollide<SimNode>((d) => {
          const longest = Math.max(...wrapLabel(d.node.name).map((l) => l.length));
          return Math.max(nodeRadius(d.node) + 30, Math.min(78, longest * 3.6 + 8));
        }).iterations(2),
      )
      .force("x", forceX(0).strength(0.05))
      .force("y", forceY(0).strength(0.07))
      .on("tick", tick);
    if (!fitted) {
      // Settle the first layout off-screen so the graph doesn't open in a tangle.
      simulation.stop();
      for (let i = 0; i < 300; i++) simulation.tick();
      simulation.alpha(0.05).restart();
    }

    edgeLayer
      .selectAll<SVGPathElement, SimLink>("path")
      .data(links, (l) => l.edge.id)
      .join("path")
      .attr("class", (l) => `edge edge-${l.edge.type}`)
      .attr("stroke", (l) => theme.edges[l.edge.type].color)
      .attr("stroke-width", (l) => theme.edges[l.edge.type].width)
      .attr("stroke-dasharray", (l) => theme.edges[l.edge.type].dash ?? null);

    const dragBehavior = drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation?.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation?.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeLayer
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(nodes, (d) => d.id)
      .join((enter) => {
        const g = enter
          .append("g")
          .attr("class", (d) => `node node-${d.node.kind}`)
          .attr("tabindex", 0)
          .attr("role", "button")
          .attr("aria-label", (d) => nodeAriaLabel(d.node))
          .attr("data-id", (d) => d.id);
        drawGlyphs(g, "below", (d) => d.node);
        g.on("click", (event, d) => {
          event.stopPropagation();
          store.update({ selected: store.state.selected === d.id ? null : d.id });
        })
          .on("keydown", (event: KeyboardEvent, d) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              store.update({ selected: d.id });
            }
          })
          .on("mouseenter", (_, d) => store.update({ hovered: d.id }))
          .on("mouseleave", () => store.update({ hovered: null }));
        return g;
      })
      .call(dragBehavior);

    highlight();
    tick();
    if (!fitted) {
      fit(0);
      fitted = true;
    }
  }

  function tick() {
    edgeLayer.selectAll<SVGPathElement, SimLink>("path").attr("d", (l) => {
      const a = l.source as SimNode;
      const b = l.target as SimNode;
      return curvedPath(a.x!, a.y!, b.x!, b.y!, 0.12);
    });
    nodeLayer
      .selectAll<SVGGElement, SimNode>("g.node")
      .attr("transform", (d) => `translate(${d.x!.toFixed(1)},${d.y!.toFixed(1)})`);
  }

  function highlight() {
    applyHighlight(
      nodeLayer.selectAll<SVGGElement, SimNode>("g.node"),
      edgeLayer.selectAll<SVGPathElement, SimLink>("path"),
      focusSet(graph, store.state),
      (d) => d.id,
      (l) => l.edge,
    );
  }

  function resize() {
    const box = container.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const first = simulation === null;
    width = box.width;
    height = box.height;
    svg.attr("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`);
    if (first) rebuild();
  }

  store.subscribe((state, prev) => {
    if (state.filters !== prev.filters) {
      if (simulation) rebuild();
    } else if (state.selected !== prev.selected || state.hovered !== prev.hovered) {
      highlight();
    }
  });
  new ResizeObserver(() => resize()).observe(container);

  return {
    resize,
    focus(id: string) {
      const d = simNodes.get(id);
      if (!d || width === 0) return;
      // Leave room for the details panel on wide screens.
      const shift = width > 720 ? -190 : 0;
      const transform = zoomIdentity.translate(shift, 0).scale(1.4).translate(-d.x!, -d.y!);
      svg.transition().duration(600).call(zoomBehavior.transform, transform);
    },
    zoomBy(factor: number) {
      svg.transition().duration(250).call(zoomBehavior.scaleBy, factor);
    },
    reset() {
      fit(500);
    },
  };
}
