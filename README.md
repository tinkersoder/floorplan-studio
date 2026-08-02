# Floorplan Studio for Home Assistant

A standalone, browser-based visual editor for designing interactive Home Assistant
floorplans and exporting them straight into a dashboard. **No backend, no install on
Home Assistant, works fully offline, no external CDNs, no telemetry.**

Drop in a photo or 3D render of your home, trace rooms and walls, place and configure
entity markers, preview them live against your HA, and export a dashboard-ready card —
either for the HACS **ha-floorplan** card or the native **Picture Elements** card.

![status](https://img.shields.io/badge/build-passing-brightgreen) <!-- local badge, not fetched -->

---

## Demo

![Floorplan Studio exported to a live Home Assistant dashboard](docs/demo.jpg)

*A floorplan designed in Floorplan Studio and exported as a `ha-floorplan` card — live
entity icons (lights, media, cameras, locks), on/off state colouring, and power / label
readouts overlaid on a 3D render of the home.*

---

## Features

- **Canvas** — upload / paste / drag-drop a background; adjust opacity, scale, position,
  rotation; set canvas size; zoom & pan; toggleable grid with snap; lock the background.
- **Markers** — add entities from the HA list (search + filter) or type an `entity_id`;
  multiple entities per marker; styles: MDI icon, dot, live state label, image, custom
  SVG; per-marker tap / hold / double-tap actions (toggle, more-info, call-service with a
  data editor, navigate, url); **state-based styling** (on/off, threshold, gradient
  heatmap, string match) with pulse/blink and conditional visibility; drag, multi-select,
  arrow-key nudge, duplicate.
- **Rooms** — draw polygons, name them, map to an HA area, fill colour + opacity,
  **state-based room colouring**, and click actions.
- **Walls / doors / windows** — polyline wall tracing with grid + 15° angle snapping;
  doors/windows that snap onto walls; thickness/colour styling.
- **Layers & floors** — show/hide/lock the background / walls / rooms / entities / labels
  layers; multiple floors with a switcher, each with its own background.
- **Live preview** — EDIT vs PREVIEW; preview uses real HA states when connected, or the
  built-in demo set otherwise.
- **Home Assistant connect (optional)** — URL + long-lived token over the WebSocket API;
  pulls the entity + area registries and subscribes to live states; "Test connection"
  button with clear CORS / mixed-content guidance. Token stays in your browser and is
  only ever sent to your own HA.
- **Persistence** — named projects in IndexedDB with autosave; JSON export/import for
  portable backups; undo/redo history.
- **Export** — ha-floorplan (SVG + `custom:floorplan-card` YAML + stylesheet), Picture
  Elements YAML, and Raw SVG / PNG. Background image can be **embedded** as a base64 data
  URI (self-contained, default) or **referenced** as `/local/floorplan/…` with copy
  instructions. One-click Copy / Download and an in-app help panel.

## Tech stack

React + TypeScript + Vite, a hand-rolled SVG editor (so the live document maps 1:1 to the
exported ha-floorplan SVG), Zustand + Immer for state and undo/redo, `idb` for IndexedDB,
`js-yaml` for export, `home-assistant-js-websocket` for the optional HA link, and bundled
`@mdi/js` icon path data. Everything is bundled — no runtime CDN requests.

## Run (development)

```bash
npm install
npm run dev
```

Open http://localhost:5178.

## Build (static site)

```bash
npm run build      # type-checks, then outputs a static bundle to dist/
npm run preview    # serve the built bundle locally
```

`dist/` is a fully static, path-relative site (`base: './'`). Host it anywhere:

- **Any static host / CDN** — Netlify, Vercel, GitHub Pages, Cloudflare Pages: point it at
  `dist/`.
- **A plain web server** — `npx serve dist` or copy `dist/` behind nginx/Caddy.
- **From Home Assistant itself** — copy `dist/` into `/config/www/floorplan-studio/` and
  open `http://<ha>:8123/local/floorplan-studio/index.html`. Serving it from the same
  origin as HA also sidesteps CORS entirely.

> Tip: use the **same scheme** (http/https) for the app and your HA instance, otherwise the
> browser blocks the connection as mixed content. See the in-app help / troubleshooting.

## Tests

```bash
npm test
```

Includes a golden-fixture test asserting the ha-floorplan SVG + card YAML match the
structure that drops straight into a dashboard.

## Project data

Projects live in your browser's IndexedDB and autosave as you work. Use **Projects → Export
current as JSON** for a portable backup, and **Import JSON…** to restore it elsewhere. The
JSON is the complete project (floors, background data URIs, markers, rooms, walls, rules).

## See also

- [`USER_GUIDE.md`](USER_GUIDE.md) — connecting HA, designing a floorplan, and adding the
  export to a dashboard (both ha-floorplan and picture-elements paths).
