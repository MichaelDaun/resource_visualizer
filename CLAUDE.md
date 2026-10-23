# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

## What this is

"Stödkartan": a static web app (GitHub Pages) that visualises support for SMEs
(små och medelstora företag) – organisations, projects/services and the
relations between them – on a map of Kalmar län and as a network graph. The
owner works with SME support at Linnéuniversitetet (e.g. the DIKA project).
Priorities: clear relations, a stylish look, easy data editing for non-developers.

## Design language

The owner explicitly does not want the generic "AI-built app" look. Keep to a
cartographic, editorial style:

- No pill-shaped chips, floating badges, soft rounded cards or toast-like
  hints. Use legend rows, text tabs, hairline rules and plain typography.
- Small radii (2–3px), 1px hairlines (`--line`), 1.5–2px rules (`--rule`) under
  section headings. Avoid drop shadows except where needed for separation.
- Hierarchy through type: Bricolage Grotesque (display), Atkinson Hyperlegible
  Next (text), Instrument Serif italic only for water names on the map. Avoid
  tiny tracked uppercase labels in the UI (fine for municipality names on the map).
- Two modes of one design: Midsommar (light) and Natt (dark). Every colour comes
  from the theme's custom properties.
- Animations are short and purposeful (entrance, selection pulse, funding flow,
  eased zoom) and respect `prefers-reduced-motion`.

## Conventions

- Code, comments, commit messages and docs: **English**.
- Everything the user sees: **Swedish**, and only via `src/i18n/sv.ts` – never hard-code UI strings elsewhere.
- Data ids and YAML field names are English; display values (names, descriptions) Swedish.
- No UI framework: TypeScript + D3 modules + plain DOM. Keep dependencies few.
- Colours, fonts and line styles live in the themes in `src/theme.ts`; CSS uses only the
  theme's custom properties (`var(--ink)` etc.), never hard-coded colours.
- New enum values (actor types, support types…) need entries in `src/data/types.ts`,
  `src/i18n/sv.ts`, `src/theme.ts` (if coloured) and `docs/DATA.md`.

## Commands

```sh
npm run dev         # dev server
npm run check       # typecheck + validate data + unit tests – run before every commit
npm run test:e2e    # Playwright (builds and serves on :4173)
npm run build
npm run geo -- <dir> # rebuild public/geo/sweden.topo.json from local GeoJSON
```

## Verifying UI changes

Always look at the result, not just the tests: run `npx vite preview --port 4173`
and take screenshots with Playwright (Chromium is preinstalled in cloud sessions;
`@playwright/test` is pinned to 1.56.1 to match it). Check desktop (1440×900) and
phone (412×860) widths, and the map view and the network view.

## Architecture

- `data/*.yaml` → imported via a small YAML plugin in `vite.config.ts` →
  validated by `src/data/validate.ts` → `buildGraph()` in `src/data/graph.ts`.
- `src/geo.ts`: loads the basemap, finds county/municipality for coordinates (with snapping,
  since borders are simplified) and defines navigable places (counties, municipalities, Öland).
  `buildGraph(data, geo.locate)` stores counties/municipalities on every node.
- `src/state.ts`: tiny observable store (view, selected, hovered, place, filters) shared by all parts.
- `src/views/map-view.ts`: MapLibre GL map on OpenFreeMap vector tiles, styled from the theme by
  `src/views/map-style.ts` (colours in `theme.map`). Nodes and relations are an SVG overlay inside
  the canvas container, placed in *screen space* on every map move with a short force simulation
  so actors at the same place spread out. Only actors are on the map; initiatives appear around
  their lead only while the selection involves them, and lines are drawn only for the selection
  (hovering a node or a sheet row narrows them). Label collisions: `src/views/labels.ts`. Actors
  without coordinates go in the "Nationellt & EU" box. A location's optional `building`
  (OSM way) is highlighted from `public/geo/buildings.json`.
- `src/views/network-view.ts`: d3-force graph.
- `src/views/finder-view.ts` + `src/finder.ts`: "Hitta stöd" – ranks ongoing/planned initiatives by
  matched needs and reach (in the municipality → in the county → national).
- Geo files: `public/geo/sweden.topo.json` (coarse borders for lookups and the inset),
  `public/geo/detail.topo.json` (Nominatim municipality/county shapes for the home counties, loaded
  in the background and passed to `mapView.setDetail()`) and `public/geo/buildings.json`. Rebuild
  with `npm run geo`, `npm run geo:detail -- <cache-dir>` and `npm run buildings`.
- WebGL in headless Chromium needs `--use-angle=swiftshader --enable-unsafe-swiftshader`
  (set in `playwright.config.ts`; pass them too when taking screenshots).
- When a place is selected, the map draws only nodes in that place (plus national ones and the
  selection's neighbours) so clusters from nearby towns don't spill over.
- `src/router.ts`: URL hash `#/karta/<id>`, `#/natverk/<id>`, `#/karta/plats/<place-id>`, `#/hitta`.
- Themes: `?tema=midsommar|natt` (default follows the system); switching reloads the page so
  every drawn element picks up the new colours.
- Home counties: Kalmar (08) and Kronoberg (07), see `HOME_COUNTIES` in `src/geo.ts`.

## Environment notes

- The environment's network is open: OpenFreeMap, Nominatim, SCB and regional sites are
  reachable. lnu.se answers 403 to scripts; use WebSearch for it. Node's `fetch` does not use
  the proxy, so build scripts download with `curl`. Respect Nominatim's one-request-per-second rule.
- Deploying to Pages is manual (workflow_dispatch on `main`, or repo variable `DEPLOY_ON_PUSH=true`).
  Work on a feature branch and open a PR into `main`.
