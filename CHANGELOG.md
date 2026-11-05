# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Plugin API** (`window.floorplanStudio`): third-party integrations can register their own
  device sources, toolbar actions and style defaults via `registerPlugin({id, apiVersion, provides})`.
  The manifest is data plus functions the editor calls — no DOM refs are handed out, unknown
  `provides` keys are ignored so plugins and the editor version independently. Capability slots:
  `deviceSources` (shown in the **Devices** modal: `fetch(ws)` for live import, `parse(text)` for
  offline input), `actions` (toolbar items that emit a documented `floorplan-studio:action`
  CustomEvent with `{pluginId, actionId, projectId, floorId, selection}`), `iconMap`,
  `markerDefaults`, `stateRulePresets` (role-bound rules appended to imported markers) and `css`
  (injected once, into the card's shadow root in HACS mode). Also new: `importProject()` merging a
  project fragment in one undo step, `projects.*` (list/get/save/remove/open) replacing direct
  IndexedDB access, `callWS()` for the active HA link, and documented events
  (`floorplan-studio:action`, `floorplan-studio:project-imported`,
  `floorplan-studio:plugins-changed`). See USER_GUIDE → *Plugin API for integrations*; the bundled
  RAMSES source registers through the same public API as the reference implementation.
- **Import a floorplan card already in Home Assistant** (toolbar → **Import card**): scans every
  Lovelace dashboard over the WebSocket (or takes pasted card / view / dashboard YAML) for
  `custom:floorplan-card` and `picture-elements` cards and imports one as a new project or a new
  floor. The SVG / image / stylesheet / split-out config is fetched from `/local` or
  `/api/image/serve` (or decoded from inline data URIs, or taken from files the user adds). The
  browser measures each rule-bound element: markers land at their rendered centre with entities and
  actions; `area.<id>` (Ramses Extras convention) and `room_*` shapes become rooms with their HA
  area / name; the remaining drawing becomes the background with converted elements stripped.
  Studio's own exports round-trip icons, colours, labels and state rules.
- Room inspector keeps an imported HA area visible even when it isn't in the entity list.
- **RAMSES RF / Ramses Extras import** (toolbar → **Devices** → *RAMSES RF / Ramses Extras*): adds evohome / RAMSES-II
  devices as markers. Reads live from Ramses Extras'
  `ramses_extras/floorplan_helper/get_topology` WebSocket command, falling back to the HA
  device/entity registries filtered to `ramses_cc` when Extras isn't installed. Offline it accepts a
  pasted/loaded topology, a `floorplan_seed_studio` response or studio project (merged into the
  current project, rooms included, scaled to the canvas), or any text with device ids
  (`known_list`, schema, packet log). Devices land in the room mapped to their HA area (room
  `areaId` or name), otherwise in a staging row on the floor matching the area's HA floor; class
  icons, group colours, optional extra entities and state rules (offline, battery low, window
  open, heat demand). Idempotent and one undo step. Works in both token and dashboard-card mode.
- **Inline SVG delivery for ha-floorplan (no file copy)**: the export can now
  embed the whole floorplan SVG straight into the card as a `data:` URI
  (`config.image: { location: data:image/svg+xml…, cache: true }`), so there are
  **no files to copy into `/config/www`** — paste the card YAML and it works.
  A `;filename=…svg` marker keeps ha-floorplan injecting it inline (element
  bindings intact) and `cache: true` stops its cache-buster from corrupting the
  URI. Default for ha-floorplan; the separate-`.svg`-file mode is still available.
- **Dashboard-card live mode**: when installed as a HACS card, Floorplan Studio
  now consumes the `hass` object Home Assistant injects into every Lovelace card.
  A "Use this dashboard's Home Assistant" button in Connect goes live off the
  current instance instantly — no URL and no long-lived token — and live states
  keep refreshing on every HA push. The URL + token path still works for the
  standalone build or for pointing at a different HA.

### Changed

- Dropped the generic `light.bedroom` entry from the built-in demo entity set.

### Fixed

- Switching from demo to live states failed inside the HACS dashboard card
  because the only live path was a self-made WebSocket (URL + token). Card mode
  now uses HA's own connection.
- **Dashboard card started in demo mode by default.** The HACS card now
  auto-adopts the dashboard's own `hass` object the first time it's available,
  so it comes up connected to your live Home Assistant instead of requiring a
  manual "Use this dashboard's Home Assistant" click. Disconnecting back to
  demo (or connecting to a different HA) afterwards is unaffected — the
  auto-adopt only ever fires once, on first load.

### Changed

- Genericized the built-in demo entity set (generic ids like `light.bedroom`,
  `light.living_room`, `sensor.indoor_temperature`) so no real installation's
  entity naming ships with the app.

## [0.1.0] - 2026-08-02

Initial public release.

### Added

- Standalone, browser-based floorplan editor for Home Assistant — no backend, no
  install on HA, fully offline, no external CDNs, no telemetry.
- **Canvas**: upload / paste / drag-drop a background image with opacity, scale,
  position, rotation; canvas sizing; zoom & pan; snap grid; lockable background.
- **Markers**: entities from the HA list or by `entity_id`; multiple entities per
  marker; icon / dot / state-label / image / custom-SVG styles; per-marker
  tap / hold / double-tap actions; state-based styling (boolean, threshold,
  gradient, string match) with pulse/blink and conditional visibility.
- **Label typography**: per-marker font family, size, weight, and colour, applied
  both on the canvas and in every export.
- **Rooms**: polygon zones with names, HA-area mapping, fill/opacity, state-based
  colouring, and click actions.
- **Walls / doors / windows** with grid + 15° angle snapping.
- **Layers & floors**: per-layer show/hide/lock; multiple floors.
- **Live preview** against real HA states (or a built-in demo set).
- **Home Assistant connect** over the WebSocket API (URL + long-lived token);
  entity/area registries, live states, and HA-accurate icon resolution
  (registry override → integration icon → live state → domain default).
- **Persistence**: named IndexedDB projects with autosave, JSON export/import,
  undo/redo.
- **Export**: `ha-floorplan` (SVG + `custom:floorplan-card` YAML), Picture
  Elements YAML, and raw SVG/PNG; embed or reference background images.
- **Cache-busting**: `/local` URLs carry a content-version query so redeployed
  cards refresh without clearing HA's 31-day asset cache.
- **HACS packaging**: installable as a Lovelace plugin
  (`type: custom:floorplan-studio-card`) via a single bundled JS.

[Unreleased]: https://github.com/tinkersoder/floorplan-studio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tinkersoder/floorplan-studio/releases/tag/v0.1.0
