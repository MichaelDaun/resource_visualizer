import type { Graph, GraphNode } from "../data/graph";
import type { GeoIndex, Place } from "../geo";
import { t } from "../i18n/sv";
import type { Store } from "../state";
import { nodeColor } from "../theme";
import { esc } from "./dom";

const MAX_RESULTS = 8;

function normalise(text: string): string {
  return text.toLocaleLowerCase("sv-SE").trim();
}

function searchText(node: GraphNode): string {
  if (node.kind === "actor") {
    const a = node.actor;
    return normalise([a.name, a.description, t.actorTypes[a.type], ...(a.locations ?? []).map((l) => l.place)].join(" "));
  }
  const i = node.initiative;
  return normalise(
    [i.name, i.description, i.area, t.kinds[i.kind], ...i.supportTypes.map((s) => t.supportTypeLabels[s])].join(" "),
  );
}

export type SearchResult = { type: "node"; node: GraphNode } | { type: "place"; place: Place };

const resultName = (r: SearchResult) => (r.type === "node" ? r.node.name : r.place.name);
const resultKey = (r: SearchResult) => (r.type === "node" ? `n:${r.node.id}` : `p:${r.place.id}`);

/** Ranks name matches above matches in other fields; places come first on equal rank. */
export function search(graph: Graph, geo: GeoIndex | null, query: string): SearchResult[] {
  const q = normalise(query);
  if (!q) return [];
  const score = (name: string, text: string) => {
    const n = normalise(name);
    return n.startsWith(q) ? 0 : n.includes(q) ? 1 : text.includes(q) ? 2 : -1;
  };
  const results: { result: SearchResult; score: number; order: number }[] = [
    ...(geo?.places ?? []).map((place) => ({
      result: { type: "place" as const, place },
      score: score(place.name, normalise(place.name)),
      order: 0,
    })),
    ...graph.nodes.map((node) => ({
      result: { type: "node" as const, node },
      score: score(node.name, searchText(node)),
      order: 1,
    })),
  ];
  return results
    .filter((r) => r.score >= 0)
    .sort(
      (a, b) =>
        a.score - b.score || a.order - b.order || resultName(a.result).localeCompare(resultName(b.result), "sv"),
    )
    .slice(0, MAX_RESULTS)
    .map((r) => r.result);
}

/** Node-only search, used by tests and anything without places. */
export function searchNodes(graph: Graph, query: string): GraphNode[] {
  return search(graph, null, query).flatMap((r) => (r.type === "node" ? [r.node] : []));
}

export function mountSearch(
  root: HTMLElement,
  graph: Graph,
  geo: GeoIndex,
  store: Store,
  onPick: (result: SearchResult) => void,
) {
  root.innerHTML = `
    <input type="search" class="search-input" placeholder="${esc(t.searchPlaceholder)}" aria-label="${esc(t.searchPlaceholder)}"
      role="combobox" aria-expanded="false" aria-controls="search-results" autocomplete="off" />
    <ul class="search-results" id="search-results" role="listbox" hidden></ul>`;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const list = root.querySelector<HTMLUListElement>("ul")!;
  let results: SearchResult[] = [];
  let active = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const render = () => {
    results = search(graph, geo, input.value);
    active = Math.min(active, Math.max(0, results.length - 1));
    if (!input.value.trim()) return close();
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.innerHTML =
      results.length === 0
        ? `<li class="search-empty">${esc(t.searchNoResults)}</li>`
        : results
            .map((r, i) => {
              const swatch =
                r.type === "place"
                  ? `<span class="sym pin"></span>`
                  : `<span class="sym ${r.node.kind === "actor" ? "dot" : "diamond"}" style="--c:${nodeColor(r.node)}"></span>`;
              const meta =
                r.type === "place"
                  ? t.places.kinds[r.place.kind]
                  : r.node.kind === "actor"
                    ? t.actorTypes[r.node.actor.type]
                    : t.kinds[r.node.initiative.kind];
              return `<li role="option" data-key="${esc(resultKey(r))}" aria-selected="${i === active}">
                ${swatch}<span>${esc(resultName(r))}</span><small>${esc(meta)}</small></li>`;
            })
            .join("");
  };

  const pick = (result: SearchResult) => {
    input.value = "";
    close();
    input.blur();
    if (result.type === "node") store.update({ selected: result.node.id });
    else store.update({ place: result.place.id, selected: null });
    onPick(result);
  };

  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      active = (active + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
      render();
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      pick(results[active]);
    } else if (event.key === "Escape") {
      input.value = "";
      close();
    }
  });
  list.addEventListener("mousedown", (event) => {
    const li = (event.target as Element).closest<HTMLElement>("li[data-key]");
    const result = li && results.find((r) => resultKey(r) === li.dataset.key);
    if (!result) return;
    event.preventDefault();
    pick(result);
  });
  input.addEventListener("blur", close);
}
