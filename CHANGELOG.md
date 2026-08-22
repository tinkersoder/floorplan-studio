# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Dashboard-card live mode**: when installed as a HACS card, Floorplan Studio
  now consumes the `hass` object Home Assistant injects into every Lovelace card.
  A "Use this dashboard's Home Assistant" button in Connect goes live off the
  current instance instantly — no URL and no long-lived token — and live states
  keep refreshing on every HA push. The URL + token path still works for the
  standalone build or for pointing at a different HA.

### Fixed

- Switching from demo to live states failed inside the HACS dashboard card
  because the only live path was a self-made WebSocket (URL + token). Card mode
  now uses HA's own connection.

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
