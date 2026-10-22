/**
 * Visual themes. Each theme sets CSS custom properties for the page and the
 * colours used when drawing nodes and edges. The active theme is chosen with
 * ?tema=<id> in the URL or the theme menu, and remembered per browser.
 */
import "@fontsource-variable/manrope";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/sora";
import type { EdgeType, GraphNode } from "./data/graph";
import type { ActorType, InitiativeKind } from "./data/types";

export interface EdgeStyle {
  color: string;
  width: number;
  dash?: string;
}

export interface Theme {
  id: string;
  dark: boolean;
  actors: Record<ActorType, string>;
  kinds: Record<InitiativeKind, string>;
  edges: Record<EdgeType, EdgeStyle>;
  /** Fill for completed initiatives. */
  completed: string;
  /** CSS custom properties, without the leading "--". */
  css: Record<string, string>;
}

const DASHED = "6 4";
const DOTTED = "1.5 4";

/** Crisp and cool: white land, clear blue sea, saturated accents. */
const fjord: Theme = {
  id: "fjord",
  dark: false,
  actors: {
    region: "#1565ff",
    municipality: "#2bb3f0",
    university: "#8b3dff",
    "business-support": "#ff7a00",
    "science-park": "#12b76a",
    "research-institute": "#0d9488",
    "public-agency": "#5b6b80",
    "eu-fund": "#003399",
    network: "#f0386b",
    other: "#a3825a",
  },
  kinds: { project: "#ff2d55", service: "#00b89c", funding: "#ffb000", programme: "#c03cf0" },
  edges: {
    lead: { color: "#0c1d2e", width: 1.8 },
    partner: { color: "#7d8ea3", width: 1.3 },
    funds: { color: "#f2a100", width: 1.9, dash: DASHED },
    owns: { color: "#1565ff", width: 1.6 },
    manages: { color: "#5b6b80", width: 1.4, dash: DASHED },
    collaborates: { color: "#7d8ea3", width: 1.3, dash: DOTTED },
  },
  completed: "#b9c3cf",
  css: {
    font: "'Manrope Variable', system-ui, sans-serif",
    ink: "#0c1d2e",
    "ink-soft": "#44566b",
    "ink-faint": "#8394a8",
    line: "#dde5ee",
    paper: "#f4f7fa",
    panel: "#ffffff",
    "panel-hover": "#f0f5fb",
    "chip-bg": "#ffffff",
    "chip-on": "#e4eeff",
    "chip-on-border": "#a9c5ff",
    sea: "#d4e7f6",
    lake: "#cce2f4",
    land: "#e9eef3",
    "land-home": "#ffffff",
    "land-hover": "#eaf3ff",
    "border-municipality": "#d3dce6",
    "border-region": "#aebccc",
    "border-home": "#7f95ad",
    coast: "#9dbbd6",
    "label-place": "#7f91a6",
    "label-region": "#9aaabd",
    "label-lake": "#6f9cc4",
    halo: "rgba(255,255,255,0.92)",
    accent: "#1565ff",
    "accent-soft": "rgba(21,101,255,0.14)",
    badge: "#0c1d2e",
    "badge-ink": "#ffffff",
    radius: "8px",
    "radius-small": "6px",
    shadow: "0 10px 30px rgba(12,29,46,0.12), 0 1px 3px rgba(12,29,46,0.08)",
    "home-shadow": "drop-shadow(0 6px 14px rgba(40,90,150,0.18))",
    "node-shadow": "drop-shadow(0 1px 2px rgba(12,29,46,0.35))",
  },
};

/** Warm and playful: meadow land, bright sea, bold primaries. */
const midsommar: Theme = {
  id: "midsommar",
  dark: false,
  actors: {
    region: "#1e3cff",
    municipality: "#00a6fb",
    university: "#ff3b1f",
    "business-support": "#ffaa00",
    "science-park": "#13a35b",
    "research-institute": "#00897b",
    "public-agency": "#3d405b",
    "eu-fund": "#003399",
    network: "#ff4fa0",
    other: "#a0522d",
  },
  kinds: { project: "#ff3b1f", service: "#13a35b", funding: "#ffaa00", programme: "#7b2ff7" },
  edges: {
    lead: { color: "#141414", width: 2 },
    partner: { color: "#6f7a68", width: 1.4 },
    funds: { color: "#e89a00", width: 2, dash: DASHED },
    owns: { color: "#1e3cff", width: 1.7 },
    manages: { color: "#3d405b", width: 1.5, dash: DASHED },
    collaborates: { color: "#6f7a68", width: 1.4, dash: DOTTED },
  },
  completed: "#c2c8bb",
  css: {
    font: "'Bricolage Grotesque Variable', system-ui, sans-serif",
    ink: "#141414",
    "ink-soft": "#474b43",
    "ink-faint": "#878c80",
    line: "#e3e8dc",
    paper: "#fbfcf8",
    panel: "#ffffff",
    "panel-hover": "#f3f7ec",
    "chip-bg": "#ffffff",
    "chip-on": "#fff1c2",
    "chip-on-border": "#ffcf4d",
    sea: "#9fd3f7",
    lake: "#93ccf4",
    land: "#e3eed8",
    "land-home": "#f8fcf1",
    "land-hover": "#fff6d4",
    "border-municipality": "#cbdcb9",
    "border-region": "#98b67c",
    "border-home": "#5f8a3f",
    coast: "#6fb0dc",
    "label-place": "#6f8a58",
    "label-region": "#8da878",
    "label-lake": "#3f8cc4",
    halo: "rgba(255,255,255,0.94)",
    accent: "#ff3b1f",
    "accent-soft": "rgba(255,59,31,0.14)",
    badge: "#ffcf1f",
    "badge-ink": "#141414",
    radius: "16px",
    "radius-small": "999px",
    shadow: "0 12px 32px rgba(40,60,20,0.14), 0 2px 4px rgba(40,60,20,0.08)",
    "home-shadow": "drop-shadow(0 6px 12px rgba(60,100,30,0.2))",
    "node-shadow": "drop-shadow(0 2px 0 rgba(20,20,20,0.25))",
  },
};

/** Dark: deep navy, luminous nodes and glowing relations. */
const natt: Theme = {
  id: "natt",
  dark: true,
  actors: {
    region: "#4d8dff",
    municipality: "#22d3ee",
    university: "#b18cff",
    "business-support": "#ff9a3c",
    "science-park": "#4ade80",
    "research-institute": "#2dd4bf",
    "public-agency": "#94a3b8",
    "eu-fund": "#3b6cff",
    network: "#ff6fb5",
    other: "#d6b98c",
  },
  kinds: { project: "#ff5c7a", service: "#34e0a1", funding: "#ffc93c", programme: "#d38cff" },
  edges: {
    lead: { color: "#e6edff", width: 1.6 },
    partner: { color: "#7383a6", width: 1.2 },
    funds: { color: "#ffc93c", width: 1.7, dash: DASHED },
    owns: { color: "#4d8dff", width: 1.5 },
    manages: { color: "#94a3b8", width: 1.3, dash: DASHED },
    collaborates: { color: "#7383a6", width: 1.2, dash: DOTTED },
  },
  completed: "#4b5872",
  css: {
    font: "'Sora Variable', system-ui, sans-serif",
    ink: "#e8eefc",
    "ink-soft": "#a9b6d0",
    "ink-faint": "#6d7b98",
    line: "#222d45",
    paper: "#0a1020",
    panel: "#111a2e",
    "panel-hover": "#18233c",
    "chip-bg": "#111a2e",
    "chip-on": "#1b2d55",
    "chip-on-border": "#3d5fa8",
    sea: "#060b17",
    lake: "#08101f",
    land: "#111a2c",
    "land-home": "#18233b",
    "land-hover": "#22325a",
    "border-municipality": "#24314d",
    "border-region": "#33476d",
    "border-home": "#4d6ea8",
    coast: "#29436b",
    "label-place": "#61749a",
    "label-region": "#4f6082",
    "label-lake": "#3f5f8f",
    halo: "rgba(10,16,32,0.88)",
    accent: "#4d8dff",
    "accent-soft": "rgba(77,141,255,0.2)",
    badge: "#ffc93c",
    "badge-ink": "#0a1020",
    radius: "10px",
    "radius-small": "8px",
    shadow: "0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(120,150,220,0.08)",
    "home-shadow": "drop-shadow(0 0 18px rgba(77,141,255,0.18))",
    "node-shadow": "drop-shadow(0 0 4px rgba(140,180,255,0.55))",
  },
};

export const THEMES: Theme[] = [fjord, midsommar, natt];
const STORAGE_KEY = "stodkartan-tema";

function chooseTheme(): Theme {
  const fromUrl = new URLSearchParams(window.location.search).get("tema");
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return THEMES.find((th) => th.id === fromUrl) ?? THEMES.find((th) => th.id === stored) ?? THEMES[0];
}

export const theme: Theme = typeof window === "undefined" ? THEMES[0] : chooseTheme();

/** Applies the active theme's CSS variables to the page. */
export function applyTheme(root: HTMLElement = document.documentElement) {
  for (const [key, value] of Object.entries(theme.css)) root.style.setProperty(`--${key}`, value);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.dark ? "dark" : "light";
}

/** Remembers the choice and reloads, so every drawn element picks up the new colours. */
export function switchTheme(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Without storage the URL parameter still carries the choice.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("tema", id);
  window.location.href = url.toString();
}

export function nodeColor(node: GraphNode): string {
  return node.kind === "actor" ? theme.actors[node.actor.type] : theme.kinds[node.initiative.kind];
}

export function nodeRadius(node: GraphNode): number {
  return node.kind === "actor" ? 10 : 7;
}
