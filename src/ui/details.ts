import { otherEnd, type Graph, type GraphEdge, type GraphNode } from "../data/graph";
import type { Initiative, Status } from "../data/types";
import type { GeoIndex, Place } from "../geo";
import { t } from "../i18n/sv";
import { isNodeVisible, type Store } from "../state";
import { nodeColor, theme } from "../theme";
import { esc, safeUrl } from "./dom";

type ActorNode = Extract<GraphNode, { kind: "actor" }>;
type InitiativeNode = Extract<GraphNode, { kind: "initiative" }>;

/**
 * The side sheet: details and clickable relations for the selected node, or
 * an overview of the selected place when no node is selected.
 */
export function mountDetails(panel: HTMLElement, graph: Graph, geo: GeoIndex, store: Store) {
  // Closing a node returns to the place it was opened from; closing a place clears it.
  const close = () => (store.state.selected ? store.update({ selected: null }) : store.update({ place: null }));

  panel.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLElement>("[data-select], [data-close], [data-place]");
    if (!target) return;
    if (target.dataset.close !== undefined) close();
    else if (target.dataset.place !== undefined) store.update({ place: target.dataset.place, selected: null });
    else store.update({ selected: target.dataset.select! });
  });
  // Hovering a relation narrows the lines drawn on the map to that one.
  panel.addEventListener("pointerover", (event) => {
    const row = (event.target as Element).closest<HTMLElement>(".node-link[data-select]");
    const id = row?.dataset.select ?? null;
    if (id !== store.state.hovered) store.update({ hovered: id });
  });
  panel.addEventListener("pointerleave", () => {
    if (store.state.hovered) store.update({ hovered: null });
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  const render = () => {
    const node = store.state.selected ? graph.byId.get(store.state.selected) : undefined;
    const place = store.state.place ? geo.placeById.get(store.state.place) : undefined;
    const open = Boolean(node || place) && store.state.view !== "finder";
    panel.hidden = !open;
    document.body.classList.toggle("details-open", open);
    if (!open) {
      panel.replaceChildren();
      return;
    }
    const top = `
      <div class="sheet-top">
        ${node && place ? `<button class="text-btn" data-place="${esc(place.id)}">← ${esc(place.name)}</button>` : "<span></span>"}
        <button class="icon-btn close" data-close aria-label="${esc(t.close)}" title="${esc(t.close)}">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.6"/></svg>
        </button>
      </div>`;
    const body = node
      ? node.kind === "actor"
        ? actorHtml(graph, node)
        : initiativeHtml(graph, node)
      : placeHtml(graph, geo, place!, store);
    panel.innerHTML = top + `<div class="sheet-body">${body}</div>`;
    panel.scrollTop = 0;
    requestAnimationFrame(() => panel.querySelectorAll<HTMLElement>(".flow").forEach(drawFlow));
  };

  store.subscribe((state, prev) => {
    if (
      state.selected !== prev.selected ||
      state.place !== prev.place ||
      state.filters !== prev.filters ||
      state.view !== prev.view
    ) {
      render();
    }
  });
  render();
  new ResizeObserver(() => panel.querySelectorAll<HTMLElement>(".flow").forEach(drawFlow)).observe(panel);
}

function overline(text: string, color?: string, shape: "dot" | "diamond" = "dot"): string {
  const glyph = color ? `<span class="sym ${shape}" style="--c:${color}" aria-hidden="true"></span>` : "";
  return `<p class="overline">${glyph}${esc(text)}</p>`;
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
  return `<p class="website"><a class="external" href="${esc(href)}" target="_blank" rel="noopener">${esc(host)}<span aria-hidden="true"> ↗</span></a></p>`;
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
        <span class="sym ${shape}" style="--c:${nodeColor(node)}" aria-hidden="true"></span>
        <span class="node-link-text"><span>${esc(node.name)}</span><small>${esc(note ?? meta)}</small></span>
        <span class="chevron" aria-hidden="true">→</span>
      </button>
    </li>`;
}

/** A compact relation button for the flow diagram. */
function flowLink(graph: Graph, id: string, type: GraphEdge["type"], note?: string): string {
  const node = graph.byId.get(id);
  if (!node) return "";
  return `
    <button class="node-link flow-link" data-select="${esc(id)}" data-edge="${type}">
      <span class="sym dot" style="--c:${nodeColor(node)}" aria-hidden="true"></span>
      <span class="node-link-text"><span>${esc(node.name)}</span>${note ? `<small>${esc(note)}</small>` : ""}</span>
    </button>`;
}

/**
 * Funders on the left, the initiative in the middle and the organisations
 * running it on the right. Lines are drawn by drawFlow() once laid out.
 */
function flowHtml(graph: Graph, node: InitiativeNode): string {
  const i = node.initiative;
  const funders = (i.funders ?? []).map((id) => flowLink(graph, id, "funds"));
  const runners = [flowLink(graph, i.lead, "lead", t.flow.lead), ...(i.partners ?? []).map((id) => flowLink(graph, id, "partner", t.flow.partner))];
  if (funders.length === 0 && runners.length < 2) return "";
  return `
    <section class="sheet-section">
      <h3>${esc(t.flow.title)}</h3>
      <figure class="flow${funders.length ? "" : " no-funders"}">
        <svg class="flow-lines" aria-hidden="true"></svg>
        ${funders.length ? `<p class="flow-head flow-in">${esc(t.flow.funds)}</p><div class="flow-col flow-in">${funders.join("")}</div>` : ""}
        <div class="flow-mid"><span class="sym diamond" style="--c:${nodeColor(node)}" aria-hidden="true"></span></div>
        <p class="flow-head flow-out">${esc(t.flow.runs)}</p>
        <div class="flow-col flow-out">${runners.join("")}</div>
      </figure>
    </section>`;
}

/** Draws the lines in a flow diagram from each relation to the initiative in the middle. */
function drawFlow(figure: HTMLElement) {
  const svg = figure.querySelector<SVGSVGElement>(".flow-lines");
  const mid = figure.querySelector<HTMLElement>(".flow-mid .sym");
  if (!svg || !mid) return;
  const box = figure.getBoundingClientRect();
  const m = mid.getBoundingClientRect();
  const mx = m.left + m.width / 2 - box.left;
  const my = m.top + m.height / 2 - box.top;
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  const paths = [...figure.querySelectorAll<HTMLElement>(".flow-link")].map((link) => {
    const r = link.querySelector(".sym")!.getBoundingClientRect();
    const incoming = link.closest(".flow-col.flow-in") !== null;
    const style = theme.edges[link.dataset.edge as GraphEdge["type"]];
    // From each funder's symbol to the diamond, and from the diamond to the symbol of each runner.
    const x = incoming ? r.right - box.left + 4 : r.left - box.left - 4;
    const y = r.top + r.height / 2 - box.top;
    const [x1, y1, x2, y2] = incoming ? [x, y, mx - 9, my] : [mx + 9, my, x, y];
    const c = (x2 - x1) / 2;
    return `<path class="edge edge-${link.dataset.edge} hl" d="M${x1},${y1}C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}" stroke="${style.color}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ""}/>`;
  });
  svg.innerHTML = paths.join("");
}

function section(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `<section class="sheet-section"><h3>${esc(title)} <span class="n">${items.length}</span></h3><ul class="node-list">${items.join("")}</ul></section>`;
}

function facts(rows: [string, string | undefined][]): string {
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return "";
  return `<dl class="facts">${filled.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
}

function edgesOf(graph: Graph, id: string, predicate: (e: GraphEdge) => boolean): GraphEdge[] {
  return (graph.incident.get(id) ?? []).filter(predicate);
}

function actorHtml(graph: Graph, node: ActorNode): string {
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
      return nodeLink(graph, otherEnd(e, a.id), e.note ? `${phrase} · ${e.note}` : phrase);
    },
  );

  return `
    ${overline(t.actorTypes[a.type], nodeColor(node))}
    <h2>${esc(a.name)}</h2>
    ${exampleNotice(a.example)}
    ${description(a.description)}
    ${facts([[t.locations, a.locations?.map((l) => l.place).join(", ") ?? t.offMapColumn]])}
    ${websiteLink(a.website)}
    ${section(t.sections.offersNow, ledWithStatus("ongoing"))}
    ${section(t.sections.planned, ledWithStatus("planned"))}
    ${section(t.sections.funds, outgoing("funds"))}
    ${section(t.sections.partnerIn, outgoing("partner"))}
    ${section(t.sections.relations, relationItems)}`;
}

function period(i: Initiative): string | undefined {
  if (!i.start && !i.end) return undefined;
  return `${i.start ?? "?"} – ${i.end ?? ""}`.trim();
}

function initiativeHtml(graph: Graph, node: InitiativeNode): string {
  const i = node.initiative;
  const sameLead = edgesOf(graph, i.lead, (e) => e.type === "lead" && e.source === i.lead && e.target !== i.id).map(
    (e) => nodeLink(graph, e.target),
  );
  const lead = graph.byId.get(i.lead);
  return `
    ${overline(`${t.kinds[i.kind]} · ${t.statuses[i.status].toLowerCase()}`, nodeColor(node), "diamond")}
    <h2>${esc(i.name)}</h2>
    ${lead ? `<p class="byline">${esc(t.ledBy)} <button class="inline-link" data-select="${esc(lead.id)}">${esc(lead.name)}</button></p>` : ""}
    ${exampleNotice(i.example)}
    ${description(i.description)}
    ${facts([
      [t.supportTypes, i.supportTypes.map((s) => t.supportTypeLabels[s]).join(", ")],
      [t.area, i.area],
      [t.period, period(i)],
      [t.contact, i.contact],
    ])}
    ${websiteLink(i.website)}
    ${flowHtml(graph, node)}
    ${section(t.sections.sameLead, sameLead)}`;
}

function inPlace(node: GraphNode, place: Place): boolean {
  return node.municipalities.some((m) => place.municipalities.includes(m));
}

function placeHtml(graph: Graph, geo: GeoIndex, place: Place, store: Store): string {
  const here = graph.nodes.filter((n) => inPlace(n, place) && isNodeVisible(n, store.state.filters));
  const actors = here.filter((n) => n.kind === "actor");
  const initiatives = here.filter((n): n is InitiativeNode => n.kind === "initiative");
  const withStatus = (status: Status) =>
    initiatives.filter((n) => n.initiative.status === status).map((n) => nodeLink(graph, n.id));

  // Places to jump to: the municipalities of a county or area, or the county
  // and areas a municipality belongs to.
  const parents = geo.places.filter(
    (p) => p.id !== place.id && p.kind !== "municipality" && p.municipalities.includes(place.municipalities[0]),
  );
  const children = geo.places.filter(
    (p) => p.kind === "municipality" && place.kind !== "municipality" && place.municipalities.includes(p.municipalities[0]),
  );
  const placeLinks = (title: string, places: Place[]) =>
    places.length
      ? `<p class="place-links"><span>${esc(title)}</span> ${places
          .map((p) => `<button class="inline-link" data-place="${esc(p.id)}">${esc(p.name.replace(/ kommun$/, ""))}</button>`)
          .join(", ")}</p>`
      : "";

  return `
    ${overline(t.places.kinds[place.kind])}
    <h2>${esc(place.name)}</h2>
    <p class="byline">${esc(t.places.summary(actors.length, initiatives.length))}</p>
    ${placeLinks(t.places.alsoIn, parents)}
    ${placeLinks(t.places.municipalities, children)}
    ${here.length === 0 ? `<p class="description"><em>${esc(t.places.nothingHere)}</em></p>` : ""}
    ${section(t.sections.offersNow, withStatus("ongoing"))}
    ${section(t.sections.planned, withStatus("planned"))}
    ${section(t.places.actorsHere, actors.map((n) => nodeLink(graph, n.id)))}`;
}
