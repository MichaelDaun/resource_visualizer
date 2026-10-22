import "./styles.css";
import { dataset } from "./data/dataset";
import { buildGraph } from "./data/graph";
import { t } from "./i18n/sv";
import { readHash, writeHash } from "./router";
import { defaultFilters, Store, visibleNodeIds, type View as ViewName } from "./state";
import { mountDetails } from "./ui/details";
import { $, esc } from "./ui/dom";
import { mountSearch } from "./ui/search";
import { mountSidebar } from "./ui/sidebar";
import { createMapView, type SwedenTopology } from "./views/map-view";
import { createNetworkView } from "./views/network-view";
import type { View } from "./views/view";

async function main() {
  const app = $("#app");
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn sidebar-toggle" aria-label="${esc(t.toggleFilters)}" aria-expanded="false" aria-controls="sidebar">☰</button>
      <div class="brand">
        <h1>${esc(t.appTitle)}</h1>
        <span class="subtitle">${esc(t.appSubtitle)}</span>
      </div>
      <span class="demo-badge" title="${esc(t.demoBadgeTitle)}">${esc(t.demoBadge)}</span>
      <div class="search"></div>
      <div class="view-toggle" role="group">
        <button data-view="map">${esc(t.viewMap)}</button>
        <button data-view="network">${esc(t.viewNetwork)}</button>
      </div>
    </header>
    <main class="layout">
      <aside class="sidebar" id="sidebar"></aside>
      <section class="stage">
        <div class="view" data-view="map"></div>
        <div class="view" data-view="network" hidden></div>
        <div class="zoom-controls">
          <button class="icon-btn" data-zoom="in" aria-label="${esc(t.zoomIn)}" title="${esc(t.zoomIn)}">+</button>
          <button class="icon-btn" data-zoom="out" aria-label="${esc(t.zoomOut)}" title="${esc(t.zoomOut)}">−</button>
          <button class="icon-btn" data-zoom="reset" aria-label="${esc(t.zoomReset)}" title="${esc(t.zoomReset)}">⟲</button>
        </div>
        <p class="status-line" aria-live="polite"></p>
        <p class="hint">${esc(t.emptyHint)}</p>
      </section>
      <aside class="details" id="details" hidden tabindex="-1"></aside>
    </main>`;

  const graph = buildGraph(dataset);
  const initial = readHash(graph);
  const store = new Store({ view: initial.view, selected: initial.selected, hovered: null, filters: defaultFilters() });

  const topo = (await fetch(`${import.meta.env.BASE_URL}geo/sweden.topo.json`).then((r) => r.json())) as SwedenTopology;
  const views: Record<ViewName, View> = {
    map: createMapView($('.view[data-view="map"]'), graph, store, topo),
    network: createNetworkView($('.view[data-view="network"]'), graph, store),
  };
  const current = () => views[store.state.view];

  mountSidebar($("#sidebar"), graph, store);
  mountDetails($("#details"), graph, store);
  mountSearch($(".search"), graph, store, (id) => current().focus(id));

  const toggle = $(".sidebar-toggle");
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("sidebar-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  app.querySelectorAll<HTMLButtonElement>(".view-toggle button").forEach((btn) =>
    btn.addEventListener("click", () => store.update({ view: btn.dataset.view as ViewName })),
  );
  app.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const action = btn.dataset.zoom;
      if (action === "reset") current().reset();
      else current().zoomBy(action === "in" ? 1.5 : 1 / 1.5);
    }),
  );

  const syncView = () => {
    const view = store.state.view;
    app.querySelectorAll<HTMLElement>(".view").forEach((el) => (el.hidden = el.dataset.view !== view));
    app.querySelectorAll<HTMLButtonElement>(".view-toggle button").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.view === view)),
    );
    document.body.dataset.view = view;
  };
  const syncStatus = () => {
    const shown = visibleNodeIds(graph, store.state.filters).size;
    $(".status-line").textContent = t.countVisible(shown, graph.nodes.length);
  };

  store.subscribe((state, prev) => {
    if (state.view !== prev.view) {
      syncView();
      if (state.selected) requestAnimationFrame(() => current().focus(state.selected!));
    }
    if (state.filters !== prev.filters) syncStatus();
    if (state.view !== prev.view || state.selected !== prev.selected) writeHash(state);
    document.body.classList.toggle("has-selection", state.selected !== null);
  });

  window.addEventListener("hashchange", () => {
    const next = readHash(graph);
    if (next.view !== store.state.view || next.selected !== store.state.selected) store.update(next);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && store.state.selected) store.update({ selected: null });
  });

  syncView();
  syncStatus();
  document.body.classList.toggle("has-selection", store.state.selected !== null);
  if (initial.selected) setTimeout(() => current().focus(initial.selected!), 50);
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre class="fatal">${esc(String(err?.message ?? err))}</pre>`;
});
