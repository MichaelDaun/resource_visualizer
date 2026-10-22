import "./styles.css";
import { dataset } from "./data/dataset";
import { buildGraph } from "./data/graph";
import { createGeoIndex, type SwedenTopology } from "./geo";
import { t } from "./i18n/sv";
import { readHash, writeHash } from "./router";
import { defaultFilters, Store, visibleNodeIds, type View as ViewName } from "./state";
import { applyTheme, switchTheme, theme, THEMES } from "./theme";
import { mountDetails } from "./ui/details";
import { $, esc } from "./ui/dom";
import { mountSearch } from "./ui/search";
import { mountSidebar } from "./ui/sidebar";
import { createMapView } from "./views/map-view";
import { createNetworkView } from "./views/network-view";
import type { View } from "./views/view";

function themeMenu(): string {
  return `
    <div class="theme-menu">
      <button class="icon-btn theme-toggle" aria-haspopup="true" aria-expanded="false"
        aria-label="${esc(t.themeMenu)}" title="${esc(t.themeMenu)}">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M10 2.5a7.5 7.5 0 1 0 0 15c1.1 0 1.6-.8 1.3-1.7-.4-1.1.3-2.1 1.5-2.1h1.6a3.1 3.1 0 0 0 3.1-3.1C17.5 5.8 14.1 2.5 10 2.5Z"
            fill="none" stroke="currentColor" stroke-width="1.6"/>
          <circle cx="6.4" cy="9" r="1.3" fill="#ff2d55"/><circle cx="9" cy="5.9" r="1.3" fill="#ffb000"/>
          <circle cx="12.6" cy="6.6" r="1.3" fill="#1565ff"/>
        </svg>
      </button>
      <ul class="theme-list" role="menu" hidden>
        ${THEMES.map(
          (th) => `
          <li role="none">
            <button role="menuitemradio" aria-checked="${th.id === theme.id}" data-theme="${th.id}">
              <span class="theme-swatches">${[th.actors.region, th.actors.university, th.kinds.project, th.kinds.service, th.actors["business-support"]]
                .map((c) => `<i style="background:${c}"></i>`)
                .join("")}</span>
              <span class="theme-name">${esc(t.themes[th.id])}<small>${esc(t.themeDescriptions[th.id])}</small></span>
            </button>
          </li>`,
        ).join("")}
      </ul>
    </div>`;
}

async function main() {
  applyTheme();
  const app = $("#app");
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn sidebar-toggle" aria-label="${esc(t.toggleFilters)}" aria-expanded="false" aria-controls="sidebar">☰</button>
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <h1>${esc(t.appTitle)}</h1>
        <span class="subtitle">${esc(t.appSubtitle)}</span>
      </div>
      <span class="demo-badge" title="${esc(t.demoBadgeTitle)}">${esc(t.demoBadge)}</span>
      <div class="search"></div>
      <div class="view-toggle" role="group">
        <button data-view="map">${esc(t.viewMap)}</button>
        <button data-view="network">${esc(t.viewNetwork)}</button>
      </div>
      ${themeMenu()}
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

  const topo = (await fetch(`${import.meta.env.BASE_URL}geo/sweden.topo.json`).then((r) => r.json())) as SwedenTopology;
  const geo = createGeoIndex(topo);
  const graph = buildGraph(dataset, geo.locate);
  const initial = readHash(graph, geo);
  const store = new Store({ ...initial, hovered: null, filters: defaultFilters() });

  const views: Record<ViewName, View> = {
    map: createMapView($('.view[data-view="map"]'), graph, store, geo),
    network: createNetworkView($('.view[data-view="network"]'), graph, store),
  };
  const current = () => views[store.state.view];

  mountSidebar($("#sidebar"), graph, store, geo);
  mountDetails($("#details"), graph, geo, store);
  mountSearch($(".search"), graph, geo, store, (result) => {
    if (result.type === "node") current().focus(result.node.id);
  });

  const toggle = $(".sidebar-toggle");
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("sidebar-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  const themeToggle = $(".theme-toggle");
  const themeList = $(".theme-list");
  const setThemeMenu = (open: boolean) => {
    themeList.hidden = !open;
    themeToggle.setAttribute("aria-expanded", String(open));
  };
  themeToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setThemeMenu(Boolean(themeList.hidden));
  });
  themeList.addEventListener("click", (event) => {
    const btn = (event.target as Element).closest<HTMLElement>("[data-theme]");
    if (btn && btn.dataset.theme !== theme.id) switchTheme(btn.dataset.theme!);
    else setThemeMenu(false);
  });
  document.addEventListener("click", () => setThemeMenu(false));

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
