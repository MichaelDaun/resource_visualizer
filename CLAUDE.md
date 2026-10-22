# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

## What this is

"Stödkartan": a static web app (GitHub Pages) that visualises support for SMEs
(små och medelstora företag) – organisations, projects/services and the
relations between them – on a map of Kalmar län and as a network graph. The
owner works with SME support at Linnéuniversitetet (e.g. the DIKA project).
Priorities: clear relations, a stylish look, easy data editing for non-developers.

## Conventions

- Code, comments, commit messages and docs: **English**.
- Everything the user sees: **Swedish**, and only via `src/i18n/sv.ts` – never hard-code UI strings elsewhere.
- Data ids and YAML field names are English; display values (names, descriptions) Swedish.
- No UI framework: TypeScript + D3 modules + plain DOM. Keep dependencies few.
- Colours and line styles live in `src/theme.ts`.
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
- `src/state.ts`: tiny observable store (view, selected, hovered, filters) shared by all parts.
- `src/views/map-view.ts`: projection + zoomable basemap; nodes are placed in
  *screen space* each zoom, using a short force simulation so nodes at the same
  place spread out (initiatives orbit their lead actor). Label collisions are handled by
  `src/views/labels.ts`. Actors without coordinates go in the "Nationellt & EU" box.
- `src/views/network-view.ts`: d3-force graph.
- `src/router.ts`: URL hash `#/karta/<id>` / `#/natverk/<id>`.

## Environment notes

- Cloud sessions cannot reach map tile servers, which is one reason the basemap is self-hosted.
  raw.githubusercontent.com and the npm registry are reachable.
- Pushing to `main` deploys to Pages. Work on a feature branch and open a PR.
