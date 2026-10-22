import type { Graph } from "../data/graph";
import { ACTOR_TYPES, INITIATIVE_KINDS, STATUSES, SUPPORT_TYPES } from "../data/types";
import { t } from "../i18n/sv";
import { defaultFilters, filtersAreDefault, type Filters, type Store } from "../state";
import { theme } from "../theme";
import type { EdgeType } from "../data/graph";
import type { GeoIndex } from "../geo";
import { esc } from "./dom";

type FilterKey = keyof Filters;

interface Group {
  key: FilterKey;
  title: string;
  options: { value: string; label: string; count: number; color?: string; shape?: "dot" | "diamond" }[];
}

/** Filter chips and the legend. */
export function mountSidebar(panel: HTMLElement, graph: Graph, store: Store, geo: GeoIndex) {
  const actors = graph.nodes.flatMap((n) => (n.kind === "actor" ? [n.actor] : []));
  const initiatives = graph.nodes.flatMap((n) => (n.kind === "initiative" ? [n.initiative] : []));

  // Only offer values that occur in the data, so the panel stays short.
  const groups: Group[] = [
    {
      key: "counties",
      title: t.filterCounties,
      options: geo.places
        .filter((p) => p.kind === "county")
        .map((p) => ({
          value: p.county,
          label: p.name,
          count: graph.nodes.filter((n) => n.counties.includes(p.county)).length,
        })),
    },
    {
      key: "kinds",
      title: t.filterKinds,
      options: INITIATIVE_KINDS.map((v) => ({
        value: v,
        label: t.kinds[v],
        count: initiatives.filter((i) => i.kind === v).length,
        color: theme.kinds[v],
        shape: "diamond" as const,
      })),
    },
    {
      key: "supportTypes",
      title: t.filterSupportTypes,
      options: SUPPORT_TYPES.map((v) => ({
        value: v,
        label: t.supportTypeLabels[v],
        count: initiatives.filter((i) => i.supportTypes.includes(v)).length,
      })),
    },
    {
      key: "statuses",
      title: t.filterStatus,
      options: STATUSES.map((v) => ({
        value: v,
        label: t.statuses[v],
        count: initiatives.filter((i) => i.status === v).length,
      })),
    },
    {
      key: "actorTypes",
      title: t.filterActorTypes,
      options: ACTOR_TYPES.map((v) => ({
        value: v,
        label: t.actorTypes[v],
        count: actors.filter((a) => a.type === v).length,
        color: theme.actors[v],
        shape: "dot" as const,
      })),
    },
  ].map((g) => ({ ...g, key: g.key as FilterKey, options: g.options.filter((o) => o.count > 0) }));

  const usedEdgeTypes = new Set(graph.edges.map((e) => e.type));

  panel.innerHTML = `
    <div class="sidebar-section">
      <div class="sidebar-heading">
        <h2>${esc(t.filters)}</h2>
        <button class="text-btn" data-reset>${esc(t.clearFilters)}</button>
      </div>
      ${groups
        .map(
          (g) => `
        <fieldset class="filter-group">
          <legend>${esc(g.title)}</legend>
          <div class="chip-row">
            ${g.options
              .map(
                (o) => `
              <button class="filter-chip" data-key="${g.key}" data-value="${esc(o.value)}" aria-pressed="true"
                ${o.color ? `style="--chip:${o.color}"` : ""}>
                ${o.color ? `<span class="chip-dot ${o.shape ?? "dot"}"></span>` : ""}${esc(o.label)}<span class="count">${o.count}</span>
              </button>`,
              )
              .join("")}
          </div>
        </fieldset>`,
        )
        .join("")}
    </div>
    <div class="sidebar-section legend">
      <h2>${esc(t.legend)}</h2>
      <h3>${esc(t.legendNodes)}</h3>
      <ul class="legend-list">
        <li><svg viewBox="-10 -10 20 20"><circle r="7" style="fill:var(--ink-faint);stroke:var(--panel)" stroke-width="1.5"/></svg>${esc(t.legendActor)}</li>
        ${legendDiamond("ongoing")}${esc(t.legendInitiative)}</li>
        ${legendDiamond("planned")}${esc(t.statuses.planned)}</li>
        ${legendDiamond("completed")}${esc(t.statuses.completed)}</li>
      </ul>
      <h3>${esc(t.legendRelations)}</h3>
      <ul class="legend-list">
        ${(Object.keys(theme.edges) as EdgeType[])
          .filter((type) => usedEdgeTypes.has(type))
          .map((type) => {
            const s = theme.edges[type];
            return `<li><svg viewBox="0 0 28 10"><line x1="1" y1="5" x2="27" y2="5" stroke="${s.color}" stroke-width="${s.width + 0.4}"
              ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} stroke-linecap="round"/></svg>${esc(t.edgeTypes[type])}</li>`;
          })
          .join("")}
      </ul>
    </div>`;

  panel.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target.closest("[data-reset]")) {
      store.update({ filters: defaultFilters() });
      return;
    }
    const chipEl = target.closest<HTMLElement>(".filter-chip");
    if (!chipEl) return;
    const key = chipEl.dataset.key as FilterKey;
    const value = chipEl.dataset.value!;
    const current = store.state.filters;
    const next = new Set<string>(current[key] as Set<string>);
    // Alt/meta-click shows only this value, which is quicker than unticking the rest.
    if ((event as MouseEvent).altKey || (event as MouseEvent).metaKey) {
      next.clear();
      next.add(value);
    } else if (next.has(value)) next.delete(value);
    else next.add(value);
    store.update({ filters: { ...current, [key]: next } });
  });

  const sync = () => {
    const filters = store.state.filters;
    panel.querySelectorAll<HTMLElement>(".filter-chip").forEach((el) => {
      const set = filters[el.dataset.key as FilterKey] as Set<string>;
      el.setAttribute("aria-pressed", String(set.has(el.dataset.value!)));
    });
    panel.querySelector<HTMLButtonElement>("[data-reset]")!.disabled = filtersAreDefault(filters);
  };
  store.subscribe((state, prev) => {
    if (state.filters !== prev.filters) sync();
  });
  sync();
}

function legendDiamond(status: "ongoing" | "planned" | "completed"): string {
  const color = theme.kinds.project;
  const fill = status === "planned" ? "var(--panel)" : status === "completed" ? theme.completed : color;
  const stroke = status === "ongoing" ? "var(--panel)" : color;
  const dash = status === "planned" ? ` stroke-dasharray="3 2"` : "";
  return `<li><svg viewBox="-10 -10 20 20"><rect x="-6" y="-6" width="12" height="12" rx="2.5" transform="rotate(45)"
    style="fill:${fill};stroke:${stroke}" stroke-width="1.5"${dash}/></svg>`;
}
