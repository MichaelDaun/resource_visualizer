import type { Graph, GraphNode } from "../data/graph";
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

/** Ranks name matches above matches in other fields. */
export function searchNodes(graph: Graph, query: string): GraphNode[] {
  const q = normalise(query);
  if (!q) return [];
  return graph.nodes
    .map((node) => {
      const name = normalise(node.name);
      const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : searchText(node).includes(q) ? 2 : -1;
      return { node, score };
    })
    .filter((r) => r.score >= 0)
    .sort((a, b) => a.score - b.score || a.node.name.localeCompare(b.node.name, "sv"))
    .slice(0, MAX_RESULTS)
    .map((r) => r.node);
}

export function mountSearch(root: HTMLElement, graph: Graph, store: Store, onPick: (id: string) => void) {
  root.innerHTML = `
    <input type="search" class="search-input" placeholder="${esc(t.searchPlaceholder)}" aria-label="${esc(t.searchPlaceholder)}"
      role="combobox" aria-expanded="false" aria-controls="search-results" autocomplete="off" />
    <ul class="search-results" id="search-results" role="listbox" hidden></ul>`;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const list = root.querySelector<HTMLUListElement>("ul")!;
  let results: GraphNode[] = [];
  let active = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const render = () => {
    results = searchNodes(graph, input.value);
    active = Math.min(active, Math.max(0, results.length - 1));
    if (!input.value.trim()) return close();
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.innerHTML =
      results.length === 0
        ? `<li class="search-empty">${esc(t.searchNoResults)}</li>`
        : results
            .map((n, i) => {
              const meta = n.kind === "actor" ? t.actorTypes[n.actor.type] : t.kinds[n.initiative.kind];
              return `<li role="option" data-id="${esc(n.id)}" aria-selected="${i === active}">
                <span class="swatch ${n.kind === "actor" ? "dot" : "diamond"}" style="--swatch:${nodeColor(n)}"></span>
                <span>${esc(n.name)}</span><small>${esc(meta)}</small></li>`;
            })
            .join("");
  };

  const pick = (id: string) => {
    input.value = "";
    close();
    input.blur();
    store.update({ selected: id });
    onPick(id);
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
      pick(results[active].id);
    } else if (event.key === "Escape") {
      input.value = "";
      close();
    }
  });
  list.addEventListener("mousedown", (event) => {
    const li = (event.target as Element).closest<HTMLElement>("li[data-id]");
    if (!li) return;
    event.preventDefault();
    pick(li.dataset.id!);
  });
  input.addEventListener("blur", close);
}
