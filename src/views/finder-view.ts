import type { Graph } from "../data/graph";
import { SUPPORT_TYPES, type SupportType } from "../data/types";
import { findOffers, type Offer } from "../finder";
import type { GeoIndex, Place } from "../geo";
import { t } from "../i18n/sv";
import type { Store } from "../state";
import { nodeColor } from "../theme";
import { esc, safeUrl } from "../ui/dom";
import type { View } from "./view";

/**
 * "Hitta stöd": a plain page for companies. They say where they are and what
 * they need, and get a ranked list of offers with links onwards.
 */
export function createFinderView(container: HTMLElement, graph: Graph, geo: GeoIndex, store: Store): View {
  const used = new Set(graph.nodes.flatMap((n) => (n.kind === "initiative" ? n.initiative.supportTypes : [])));
  const needs = new Set<SupportType>();
  let place: Place | null = null;

  const counties = geo.places.filter((p) => p.kind === "county");
  const options = counties
    .map(
      (c) => `
      <optgroup label="${esc(c.name)}">
        <option value="${esc(c.id)}">${esc(t.places.wholeCounty(c.name))}</option>
        ${geo.places
          .filter((p) => p.kind === "municipality" && p.county === c.county)
          .sort((a, b) => a.name.localeCompare(b.name, "sv"))
          .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
          .join("")}
      </optgroup>`,
    )
    .join("");

  container.innerHTML = `
    <div class="finder">
      <header class="finder-head">
        <h2>${esc(t.finder.title)}</h2>
        <p>${esc(t.finder.intro)}</p>
      </header>
      <form class="finder-form" onsubmit="return false">
        <div class="finder-question">
          <label for="finder-where" class="question"><span class="step">1</span>${esc(t.finder.whereLabel)}</label>
          <div class="select">
            <select id="finder-where">
              <option value="">${esc(t.finder.whereAny)}</option>
              ${options}
            </select>
          </div>
        </div>
        <fieldset class="finder-question">
          <legend class="question"><span class="step">2</span>${esc(t.finder.needLabel)}</legend>
          <p class="hint-text">${esc(t.finder.needHint)}</p>
          <ul class="needs">
            ${SUPPORT_TYPES.filter((s) => used.has(s))
              .map(
                (s) => `
              <li>
                <label class="need">
                  <input type="checkbox" value="${s}" />
                  <span class="check" aria-hidden="true"></span>
                  <span><strong>${esc(t.supportTypeLabels[s])}</strong><small>${esc(t.supportTypeHelp[s])}</small></span>
                </label>
              </li>`,
              )
              .join("")}
          </ul>
        </fieldset>
      </form>
      <section class="finder-results" aria-live="polite"></section>
      <p class="finder-disclaimer">${esc(t.finder.disclaimer)}</p>
    </div>`;

  const select = container.querySelector<HTMLSelectElement>("#finder-where")!;
  const results = container.querySelector<HTMLElement>(".finder-results")!;

  select.addEventListener("change", () => {
    place = select.value ? (geo.placeById.get(select.value) ?? null) : null;
    render();
  });
  container.querySelector(".needs")!.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.checked) needs.add(input.value as SupportType);
    else needs.delete(input.value as SupportType);
    render();
  });
  results.addEventListener("click", (event) => {
    const btn = (event.target as Element).closest<HTMLElement>("[data-show]");
    if (btn) store.update({ view: "map", selected: btn.dataset.show!, place: null });
  });

  function offerHtml(o: Offer): string {
    const i = o.node.initiative;
    const lead = graph.byId.get(i.lead);
    const href = safeUrl(i.website ?? (lead?.kind === "actor" ? lead.actor.website : undefined));
    const covered = i.supportTypes
      .map((s) => (o.matches.includes(s) ? `<strong>${esc(t.supportTypeLabels[s])}</strong>` : esc(t.supportTypeLabels[s])))
      .join(", ");
    return `
      <li class="offer">
        <p class="overline">
          <span class="sym diamond" style="--c:${nodeColor(o.node)}" aria-hidden="true"></span>
          ${esc(t.kinds[i.kind])}${lead ? ` · ${esc(lead.name)}` : ""}
          ${i.status === "planned" ? `<span class="soon">${esc(t.finder.planned)}</span>` : ""}
        </p>
        <h3>${esc(i.name)}</h3>
        ${i.description ? `<p class="offer-text">${esc(i.description)}</p>` : ""}
        <p class="offer-meta"><span>${covered}</span><span>${esc(t.finder.reach[o.reach])}${i.area ? ` · ${esc(i.area)}` : ""}</span></p>
        <p class="offer-actions">
          <button class="text-btn" data-show="${esc(o.node.id)}">${esc(t.showOnMap)} →</button>
          ${href ? `<a class="external" href="${esc(href)}" target="_blank" rel="noopener">${esc(t.finder.contact)} ↗</a>` : ""}
        </p>
      </li>`;
  }

  function render() {
    if (needs.size === 0) {
      results.innerHTML = `<p class="finder-empty">${esc(t.finder.noNeeds)}</p>`;
      return;
    }
    const offers = findOffers(graph, { place, needs });
    results.innerHTML = offers.length
      ? `<header class="results-head"><h3>${esc(t.finder.results(offers.length))}</h3><p>${esc(t.finder.resultsHint)}</p></header>
         <ol class="offers">${offers.map(offerHtml).join("")}</ol>`
      : `<p class="finder-empty">${esc(t.finder.noResults)}</p>`;
  }

  // Start from the place the visitor was looking at on the map, if any.
  store.subscribe((state, prev) => {
    if (state.view === "finder" && prev.view !== "finder" && prev.place) {
      const p = geo.placeById.get(prev.place);
      if (p && (p.kind === "municipality" || p.kind === "county")) {
        place = p;
        select.value = p.id;
        render();
      }
    }
  });
  render();

  return {
    resize() {},
    focus() {},
    zoomBy() {},
    reset() {},
  };
}
