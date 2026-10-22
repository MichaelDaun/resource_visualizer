import type { EdgeType, Graph } from "../data/graph";
import { ACTOR_TYPES, INITIATIVE_KINDS, STATUSES, SUPPORT_TYPES } from "../data/types";
import type { GeoIndex } from "../geo";
import { t } from "../i18n/sv";
import { defaultFilters, filtersAreDefault, type Filters, type Store } from "../state";
import { theme } from "../theme";
import { esc } from "./dom";

type FilterKey = keyof Filters;

interface Option {
  value: string;
  label: string;
  count: number;
  color?: string;
  shape?: "dot" | "diamond";
}

interface Group {
  key: FilterKey;
  title: string;
  options: Option[];
}

/**
 * The filter panel doubles as the map legend: each row shows the symbol used
 * on the map, a checkbox and how many entries it covers.
 */
export function mountSidebar(panel: HTMLElement, graph: Graph, store: Store, geo: GeoIndex) {
  const actors = graph.nodes.flatMap((n) => (n.kind === "actor" ? [n.actor] : []));
  const initiatives = graph.nodes.flatMap((n) => (n.kind === "initiative" ? [n.initiative] : []));

  // Only offer values that occur in the data, so the panel stays short.
  const groups: Group[] = (
    [
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
    ] as Group[]
  ).map((g) => ({ ...g, options: g.options.filter((o) => o.count > 0) }));

  const usedEdgeTypes = new Set(graph.edges.map((e) => e.type));

  const row = (g: Group, o: Option) => `
    <li class="filter-row">
      <label>
        <input type="checkbox" data-key="${g.key}" data-value="${esc(o.value)}" checked />
        <span class="check" aria-hidden="true"></span>
        ${o.color ? `<span class="sym ${o.shape}" style="--c:${o.color}" aria-hidden="true"></span>` : ""}
        <span class="filter-name">${esc(o.label)}</span>
      </label>
      <button class="only" data-only data-key="${g.key}" data-value="${esc(o.value)}" title="${esc(t.onlyThisTitle(o.label))}">${esc(t.onlyThis)}</button>
      <span class="filter-count">${o.count}</span>
    </li>`;

  panel.innerHTML = `
    <div class="sidebar-head">
      <h2>${esc(t.filters)}</h2>
      <button class="text-btn" data-reset>${esc(t.clearFilters)}</button>
    </div>
    ${groups
      .map(
        (g) => `
      <fieldset class="filter-group">
        <legend>${esc(g.title)}</legend>
        <ul>${g.options.map((o) => row(g, o)).join("")}</ul>
      </fieldset>`,
      )
      .join("")}
    <section class="legend">
      <h2>${esc(t.legend)}</h2>
      <ul class="legend-list">
        <li><svg viewBox="-10 -10 20 20"><circle r="6.5" style="fill:var(--ink-soft);stroke:var(--panel)" stroke-width="1.5"/></svg>${esc(t.legendActor)}</li>
        <li>${diamond("ongoing")}${esc(t.legendInitiative)}, ${esc(t.statuses.ongoing.toLowerCase())}</li>
        <li>${diamond("planned")}${esc(t.statuses.planned)}</li>
        <li>${diamond("completed")}${esc(t.statuses.completed)}</li>
        ${(Object.keys(theme.edges) as EdgeType[])
          .filter((type) => usedEdgeTypes.has(type))
          .map((type) => {
            const s = theme.edges[type];
            return `<li><svg viewBox="0 0 28 10"><line x1="1" y1="5" x2="27" y2="5" stroke="${s.color}" stroke-width="${s.width + 0.4}"
              ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} stroke-linecap="round"/></svg>${esc(t.edgeTypes[type])}</li>`;
          })
          .join("")}
      </ul>
      <p class="legend-note">${esc(t.legendShelf)}</p>
    </section>`;

  const setValues = (key: FilterKey, values: Set<string>) =>
    store.update({ filters: { ...store.state.filters, [key]: values } });

  panel.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.type !== "checkbox") return;
    const key = input.dataset.key as FilterKey;
    const next = new Set<string>(store.state.filters[key] as Set<string>);
    if (input.checked) next.add(input.dataset.value!);
    else next.delete(input.dataset.value!);
    setValues(key, next);
  });

  panel.addEventListener("click", (event) => {
    const target = event.target as Element;
    if (target.closest("[data-reset]")) {
      store.update({ filters: defaultFilters() });
      return;
    }
    const only = target.closest<HTMLElement>("[data-only]");
    if (only) setValues(only.dataset.key as FilterKey, new Set([only.dataset.value!]));
  });

  const sync = () => {
    const filters = store.state.filters;
    panel.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((el) => {
      el.checked = (filters[el.dataset.key as FilterKey] as Set<string>).has(el.dataset.value!);
    });
    panel.querySelector<HTMLButtonElement>("[data-reset]")!.hidden = filtersAreDefault(filters);
  };
  store.subscribe((state, prev) => {
    if (state.filters !== prev.filters) sync();
  });
  sync();
}

function diamond(status: "ongoing" | "planned" | "completed"): string {
  const color = theme.kinds.project;
  const fill = status === "planned" ? "var(--panel)" : status === "completed" ? theme.completed : color;
  const stroke = status === "ongoing" ? "var(--panel)" : color;
  const dash = status === "planned" ? ` stroke-dasharray="3 2"` : "";
  return `<svg viewBox="-10 -10 20 20"><rect x="-5.5" y="-5.5" width="11" height="11" rx="2" transform="rotate(45)"
    style="fill:${fill};stroke:${stroke}" stroke-width="1.5"${dash}/></svg>`;
}
