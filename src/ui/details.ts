import { otherEnd, type Graph, type GraphEdge, type GraphNode } from "../data/graph";
import type { Initiative, Status } from "../data/types";
import type { GeoIndex, Place } from "../geo";
import { t } from "../i18n/sv";
import { isNodeVisible, type Store } from "../state";
import { nodeColor } from "../theme";
import { esc, safeUrl } from "./dom";

/**
 * Side panel with details and clickable relations for the selected node, or
 * an overview of the selected place when no node is selected.
 */
export function mountDetails(panel: HTMLElement, graph: Graph, geo: GeoIndex, store: Store) {
  // Closing a node returns to the place it was opened from; closing a place clears it.
  const close = () =>
    store.state.selected ? store.update({ selected: null }) : store.update({ place: null });

  panel.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLElement>("[data-select], [data-close], [data-place]");
    if (!target) return;
    if (target.dataset.close !== undefined) close();
    else if (target.dataset.place !== undefined) store.update({ place: target.dataset.place, selected: null });
    else store.update({ selected: target.dataset.select! });
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  const render = () => {
    const node = store.state.selected ? graph.byId.get(store.state.selected) : undefined;
    const place = store.state.place ? geo.placeById.get(store.state.place) : undefined;
    const open = Boolean(node || place);
    panel.hidden = !open;
    document.body.classList.toggle("details-open", open);
    if (!open) {
      panel.replaceChildren();
      return;
    }
    const back = node && place ? backLink(place) : "";
    panel.innerHTML =
      back +
      (node
        ? node.kind === "actor"
          ? actorHtml(graph, node)
          : initiativeHtml(graph, node)
        : placeHtml(graph, geo, place!, store));
    panel.scrollTop = 0;
  };

  store.subscribe((state, prev) => {
    if (state.selected !== prev.selected || state.place !== prev.place || state.filters !== prev.filters) render();
  });
  render();
}

function backLink(place: Place): string {
  return `<button class="back-link" data-place="${esc(place.id)}">← ${esc(place.name)}</button>`;
}

function inPlace(node: GraphNode, place: Place): boolean {
  return node.municipalities.some((m) => place.municipalities.includes(m));
}

function placeHtml(graph: Graph, geo: GeoIndex, place: Place, store: Store): string {
  const here = graph.nodes.filter((n) => inPlace(n, place) && isNodeVisible(n, store.state.filters));
  const actors = here.filter((n) => n.kind === "actor");
  const initiatives = here.filter((n): n is Extract<GraphNode, { kind: "initiative" }> => n.kind === "initiative");
  const withStatus = (status: Status) =>
    initiatives.filter((n) => n.initiative.status === status).map((n) => nodeLink(graph, n.id));

  // Neighbouring places to jump to: the municipalities of a county or area, or the
  // county and areas a municipality belongs to.
  const related =
    place.kind === "municipality"
      ? geo.places.filter(
          (p) => p.id !== place.id && p.kind !== "municipality" && p.municipalities.includes(place.municipalities[0]),
        )
      : geo.places.filter((p) => p.kind === "municipality" && place.municipalities.includes(p.municipalities[0]));

  return `
    <div class="details-header">
      <div class="chips">${chip(t.places.kinds[place.kind])}</div>
      <button class="icon-btn" data-close aria-label="${esc(t.close)}" title="${esc(t.close)}">✕</button>
    </div>
    <h2>${esc(place.name)}</h2>
    <p class="place-summary">${esc(t.places.summary(actors.length, initiatives.length))}</p>
    ${related.length ? `<div class="place-chips">${related.map((p) => `<button class="place-chip" data-place="${esc(p.id)}">${esc(p.name)}</button>`).join("")}</div>` : ""}
    ${here.length === 0 ? `<p class="description"><em>${esc(t.places.nothingHere)}</em></p>` : ""}
    ${section(t.sections.offersNow, withStatus("ongoing"))}
    ${section(t.sections.planned, withStatus("planned"))}
    ${section(t.places.actorsHere, actors.map((n) => nodeLink(graph, n.id)))}
    ${section(t.sections.completed, withStatus("completed"))}`;
}

function header(node: GraphNode, chips: string[]): string {
  return `
    <div class="details-header">
      <div class="chips">${chips.join("")}</div>
      <button class="icon-btn" data-close aria-label="${esc(t.close)}" title="${esc(t.close)}">✕</button>
    </div>
    <h2>${esc(node.name)}</h2>`;
}

function chip(label: string, color?: string): string {
  const style = color ? ` style="--chip:${color}"` : "";
  return `<span class="chip${color ? " chip-colored" : ""}"${style}>${esc(label)}</span>`;
}

function exampleNotice(example: boolean | undefined): string {
  return example ? `<p class="notice">${esc(t.exampleNotice)}</p>` : "";
}

function description(text: string | undefined): string {
  return `<p class="description">${text ? esc(text) : `<em>${esc(t.noDescription)}</em>`}</p>`;
}

function websiteLink(url: string | undefined): string {
  const href = safeUrl(url);
  if (!href) return "";
  const host = new URL(href).host.replace(/^www\./, "");
  return `<p><a class="external" href="${esc(href)}" target="_blank" rel="noopener">${esc(t.website)}: ${esc(host)} ↗</a></p>`;
}

function nodeLink(graph: Graph, id: string, note?: string): string {
  const node = graph.byId.get(id);
  if (!node) return "";
  const shape = node.kind === "actor" ? "dot" : "diamond";
  const meta =
    node.kind === "initiative"
      ? `${t.kinds[node.initiative.kind]} · ${t.statuses[node.initiative.status].toLowerCase()}`
      : t.actorTypes[node.actor.type];
  return `
    <li>
      <button class="node-link" data-select="${esc(id)}">
        <span class="swatch ${shape}" style="--swatch:${nodeColor(node)}"></span>
        <span class="node-link-text"><span>${esc(node.name)}</span><small>${esc(note ?? meta)}</small></span>
      </button>
    </li>`;
}

function section(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `<section><h3>${esc(title)}</h3><ul class="node-list">${items.join("")}</ul></section>`;
}

function facts(rows: [string, string | undefined][]): string {
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return "";
  return `<dl class="facts">${filled.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

function edgesOf(graph: Graph, id: string, predicate: (e: GraphEdge) => boolean): GraphEdge[] {
  return (graph.incident.get(id) ?? []).filter(predicate);
}

function actorHtml(graph: Graph, node: Extract<GraphNode, { kind: "actor" }>): string {
  const a = node.actor;
  const outgoing = (type: GraphEdge["type"]) =>
    edgesOf(graph, a.id, (e) => e.type === type && e.source === a.id).map((e) => nodeLink(graph, e.target));
  const ledWithStatus = (status: Status) =>
    edgesOf(graph, a.id, (e) => e.type === "lead" && e.source === a.id)
      .filter((e) => {
        const n = graph.byId.get(e.target);
        return n?.kind === "initiative" && n.initiative.status === status;
      })
      .map((e) => nodeLink(graph, e.target));

  const relationItems = edgesOf(graph, a.id, (e) => e.type === "owns" || e.type === "manages" || e.type === "collaborates").map(
    (e) => {
      const phrases = t.relationPhrases[e.type as keyof typeof t.relationPhrases];
      const phrase = e.source === a.id ? phrases.out : phrases.in;
      return nodeLink(graph, otherEnd(e, a.id), e.note ? `${phrase} – ${e.note}` : phrase);
    },
  );

  return `
    ${header(node, [chip(t.actorTypes[a.type], nodeColor(node))])}
    ${exampleNotice(a.example)}
    ${description(a.description)}
    ${facts([[t.locations, a.locations?.map((l) => l.place).join(", ") ?? t.offMapColumn]])}
    ${websiteLink(a.website)}
    ${section(t.sections.offersNow, ledWithStatus("ongoing"))}
    ${section(t.sections.planned, ledWithStatus("planned"))}
    ${section(t.sections.funds, outgoing("funds"))}
    ${section(t.sections.partnerIn, outgoing("partner"))}
    ${section(t.sections.relations, relationItems)}
    ${section(t.sections.completed, ledWithStatus("completed"))}`;
}

function period(i: Initiative): string | undefined {
  if (!i.start && !i.end) return undefined;
  return `${i.start ?? "?"} – ${i.end ?? ""}`.trim();
}

function initiativeHtml(graph: Graph, node: Extract<GraphNode, { kind: "initiative" }>): string {
  const i = node.initiative;
  const sameLead = edgesOf(graph, i.lead, (e) => e.type === "lead" && e.source === i.lead && e.target !== i.id).map(
    (e) => nodeLink(graph, e.target),
  );
  return `
    ${header(node, [chip(t.kinds[i.kind], nodeColor(node)), chip(t.statuses[i.status])])}
    ${exampleNotice(i.example)}
    ${description(i.description)}
    ${facts([
      [t.period, period(i)],
      [t.area, i.area],
      [t.supportTypes, i.supportTypes.map((s) => t.supportTypeLabels[s]).join(", ")],
    ])}
    ${websiteLink(i.website)}
    ${section(t.sections.ledBy, [nodeLink(graph, i.lead)])}
    ${section(t.sections.funders, (i.funders ?? []).map((id) => nodeLink(graph, id)))}
    ${section(t.sections.partners, (i.partners ?? []).map((id) => nodeLink(graph, id)))}
    ${section(t.sections.sameLead, sameLead)}`;
}
