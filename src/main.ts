import "./styles.css";
import { dataset } from "./data/dataset";
import { buildGraph } from "./data/graph";
import { applyDetail, createGeoIndex, type DetailTopology, type SwedenTopology } from "./geo";
import { t } from "./i18n/sv";
import { readHash, writeHash } from "./router";
import { defaultFilters, Store, visibleNodeIds, type View as ViewName } from "./state";
import { applyTheme, otherTheme, switchTheme, theme } from "./theme";
import { mountDetails } from "./ui/details";
import { $, esc } from "./ui/dom";
import { mountSearch } from "./ui/search";
import { mountSidebar } from "./ui/sidebar";
import { createFinderView } from "./views/finder-view";
import { createMapView } from "./views/map-view";
import { createNetworkView } from "./views/network-view";
import type { View } from "./views/view";

const SUN = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M4.2 15.8l1.7-1.7M14.1 5.9l1.7-1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const MOON = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const MENU = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.6"/></svg>`;

const VIEWS: { id: ViewName; label: string }[] = [
  { id: "map", label: t.viewMap },
  { id: "network", label: t.viewNetwork },
  { id: "finder", label: t.viewFinder },
];

async function main() {
  applyTheme();
  const app = $("#app");
  app.innerHTML = `
    <header class="masthead">
      <button class="icon-btn sidebar-toggle" aria-label="${esc(t.toggleFilters)}" aria-expanded="false" aria-controls="sidebar">${MENU}</button>
      <div class="wordmark">
        <h1>${esc(t.appTitle)}<sup title="${esc(t.demoTitle)}">${esc(t.demoMark)}</sup></h1>
        <span class="tagline">${esc(t.appTagline)}</span>
      </div>
      <nav class="tabs" aria-label="Vyer">
        ${VIEWS.map((v) => `<button data-view="${v.id}">${esc(v.label)}</button>`).join("")}
      </nav>
      <div class="search"></div>
      <button class="icon-btn theme-toggle" title="${esc(t.themeToggle[theme.id])}" aria-label="${esc(t.themeToggle[theme.id])}">
        ${theme.dark ? SUN : MOON}
      </button>
    </header>
    <main class="layout">
      <aside class="sidebar" id="sidebar"></aside>
      <section class="stage">
        <div class="view" data-view="map"></div>
        <div class="view" data-view="network" hidden></div>
        <div class="view view-page" data-view="finder" hidden></div>
        <div class="zoom-controls" role="group">
          <button data-zoom="in" aria-label="${esc(t.zoomIn)}" title="${esc(t.zoomIn)}">+</button>
          <button data-zoom="out" aria-label="${esc(t.zoomOut)}" title="${esc(t.zoomOut)}">−</button>
          <button data-zoom="reset" aria-label="${esc(t.zoomReset)}" title="${esc(t.zoomReset)}">
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2.5 6V2.5H6M13.5 10v3.5H10M10 2.5h3.5V6M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          </button>
        </div>
        <p class="attribution-mobile">${esc(t.attributionShort)}</p>
        <footer class="colophon">
          <span class="status-line" aria-live="polite"></span>
          <span class="hint">${esc(t.emptyHint)}</span>
          <span class="attribution">${esc(t.attribution)}</span>
        </footer>
      </section>
      <aside class="details" id="details" hidden tabindex="-1"></aside>
    </main>`;

  const base = import.meta.env.BASE_URL;
  const topo = (await fetch(`${base}geo/sweden.topo.json`).then((r) => r.json())) as SwedenTopology;
  const geo = createGeoIndex(topo);
  const graph = buildGraph(dataset, geo.locate, geo.municipalityByName);
  const initial = readHash(graph, geo);
  const store = new Store({ ...initial, hovered: null, filters: defaultFilters() });

  const mapView = createMapView($('.view[data-view="map"]'), graph, store, geo);
  const views: Record<ViewName, View> = {
    map: mapView,
    network: createNetworkView($('.view[data-view="network"]'), graph, store),
    finder: createFinderView($('.view[data-view="finder"]'), graph, geo, store),
  };
  const current = () => views[store.state.view];

  // The detailed basemap is large; draw the overview first and swap it in when it arrives.
  fetch(`${base}geo/detail.topo.json`)
    .then((r) => r.json())
    .then((detailTopo: DetailTopology) => mapView.setDetail(applyDetail(geo, detailTopo)))
    .catch((err) => console.warn("Detailed basemap unavailable", err));

  mountSidebar($("#sidebar"), graph, store, geo);
  mountDetails($("#details"), graph, geo, store);
  mountSearch($(".search"), graph, geo, store, (result) => {
    if (store.state.view === "finder") store.update({ view: "map" });
    if (result.type === "node") requestAnimationFrame(() => current().focus(result.node.id));
  });

  const toggle = $(".sidebar-toggle");
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("sidebar-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $(".theme-toggle").addEventListener("click", () => switchTheme(otherTheme().id));

  app.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((btn) =>
    btn.addEventListener("click", () => store.update({ view: btn.dataset.view as ViewName })),
  );
  app.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const action = btn.dataset.zoom;
      if (action === "reset") current().reset();
      else current().zoomBy(action === "in" ? 1.6 : 1 / 1.6);
    }),
  );

  const syncView = () => {
    const view = store.state.view;
    app.querySelectorAll<HTMLElement>(".view").forEach((el) => (el.hidden = el.dataset.view !== view));
    app.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((btn) => {
      if (btn.dataset.view === view) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    document.body.dataset.view = view;
  };
  const syncStatus = () => {
    const shown = visibleNodeIds(graph, store.state.filters).size;
    $(".status-line").textContent = t.countVisible(shown, graph.nodes.length);
  };
  const syncSelection = () =>
    document.body.classList.toggle("has-selection", store.state.selected !== null || store.state.place !== null);

  store.subscribe((state, prev) => {
    if (state.view !== prev.view) {
      syncView();
      if (state.selected) requestAnimationFrame(() => current().focus(state.selected!));
    }
    if (state.filters !== prev.filters) syncStatus();
    if (state.view !== prev.view || state.selected !== prev.selected || state.place !== prev.place) writeHash(state);
    syncSelection();
  });

  window.addEventListener("hashchange", () => {
    const next = readHash(graph, geo);
    if (next.view !== store.state.view || next.selected !== store.state.selected || next.place !== store.state.place) {
      store.update(next);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (store.state.selected) store.update({ selected: null });
    else if (store.state.place) store.update({ place: null });
  });

  syncView();
  syncStatus();
  syncSelection();
  setTimeout(() => {
    if (initial.selected) current().focus(initial.selected);
    else if (initial.place) current().focusPlace?.(initial.place);
  }, 50);
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre class="fatal">${esc(String(err?.message ?? err))}</pre>`;
});
