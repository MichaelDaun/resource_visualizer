/**
 * Visual themes: Midsommar (light) and Natt (dark), two modes of one design.
 * Each sets CSS custom properties for the page and the colours used when
 * drawing nodes and edges. The mode follows the system setting unless the
 * viewer picks one (remembered per browser, or ?tema=<id> in the URL).
 */
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource/instrument-serif/400-italic.css";
import type { EdgeType, GraphNode } from "./data/graph";
import type { ActorType, InitiativeKind } from "./data/types";

export interface EdgeStyle {
  color: string;
  width: number;
  dash?: string;
}

export interface Theme {
  id: "midsommar" | "natt";
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

const FONTS = {
  "font-display": "'Bricolage Grotesque Variable', 'Atkinson Hyperlegible Next Variable', sans-serif",
  "font-text": "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif",
  "font-water": "'Instrument Serif', Georgia, serif",
};

/** Light: meadow land, bright sea, bold primaries. */
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
    ...FONTS,
    ink: "#141414",
    "ink-soft": "#474b43",
    "ink-faint": "#7d8476",
    rule: "#141414",
    line: "#dfe5d6",
    paper: "#fbfcf7",
    panel: "#ffffff",
    "panel-hover": "#f2f6ea",
    selection: "#fff1b8",
    sea: "#9fd3f7",
    lake: "#93ccf4",
    land: "#e3eed8",
    "land-home": "#f8fcf1",
    "land-hover": "#fff6d4",
    town: "#eadfc4",
    road: "#d8c49b",
    "road-major": "#e2a23c",
    "border-municipality": "#c9d9b6",
    "border-region": "#98b67c",
    "border-home": "#4f7a32",
    coast: "#5ba6d8",
    "label-place": "#2f3d26",
    "label-town": "#3a4a30",
    "label-region": "#86a070",
    "label-water": "#1f6fae",
    halo: "rgba(255,255,255,0.92)",
    accent: "#ff3b1f",
    "accent-ink": "#ffffff",
    focus: "#1e3cff",
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
    ...FONTS,
    ink: "#e8eefc",
    "ink-soft": "#a9b6d0",
    "ink-faint": "#7381a0",
    rule: "#e8eefc",
    line: "#222d45",
    paper: "#0a1020",
    panel: "#0d1527",
    "panel-hover": "#152039",
    selection: "#1d2d52",
    sea: "#060b17",
    lake: "#0a1326",
    land: "#111a2c",
    "land-home": "#17223a",
    "land-hover": "#22325a",
    town: "#223052",
    road: "#2d3b5c",
    "road-major": "#5b6f9e",
    "border-municipality": "#26334f",
    "border-region": "#33476d",
    "border-home": "#5a7fc0",
    coast: "#2b4a75",
    "label-place": "#c2cde6",
    "label-town": "#aebbd8",
    "label-region": "#4f6082",
    "label-water": "#4f7cc0",
    halo: "rgba(10,16,32,0.88)",
    accent: "#ffc93c",
    "accent-ink": "#0a1020",
    focus: "#4d8dff",
  },
};

export const THEMES: Theme[] = [midsommar, natt];
const STORAGE_KEY = "stodkartan-tema";

function chooseTheme(): Theme {
  const fromUrl = new URLSearchParams(window.location.search).get("tema");
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); fall back to the system setting.
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return (
    THEMES.find((th) => th.id === fromUrl) ??
    THEMES.find((th) => th.id === stored) ??
    (prefersDark ? natt : midsommar)
  );
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

export function otherTheme(): Theme {
  return theme.id === "natt" ? midsommar : natt;
}

export function nodeColor(node: GraphNode): string {
  return node.kind === "actor" ? theme.actors[node.actor.type] : theme.kinds[node.initiative.kind];
}

export function nodeRadius(node: GraphNode): number {
  return node.kind === "actor" ? 10 : 7;
}
