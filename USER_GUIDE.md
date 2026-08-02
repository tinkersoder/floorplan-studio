# Floorplan Studio — User Guide

This guide walks through the three things you'll actually do: **connect Home Assistant**
(optional), **design a floorplan**, and **add the export to a dashboard**.

---

## 1. Connect Home Assistant (optional)

The app is fully usable offline with a built-in demo entity set — you only connect to pull
your real entities and see live states.

1. Click the **HA** button in the top-right.
2. Enter your **Home Assistant URL** (e.g. `http://homeassistant.local:8123`) and a
   **long-lived access token** (HA → your profile → **Security** → *Long-lived access
   tokens* → *Create token*).
3. Click **Test connection & connect**. On success you'll see how many entities loaded and
   the entity list on the left switches from `demo` to `live`.

**If it fails:**

- **Mixed content** — a `http://` HA URL is blocked from a page served over `https://`.
  Serve this app over `http`, or put HA behind `https`. Easiest fix: host the app *inside*
  HA (`/config/www/floorplan-studio/`) so both share an origin.
- **CORS** — add this app's origin to HA's `configuration.yaml`, then restart HA:
  ```yaml
  http:
    cors_allowed_origins:
      - http://localhost:5178      # or wherever you serve the app
  ```
- **Auth failed** — regenerate the long-lived token and paste it again.

Your token is stored only in this browser (localStorage) and is only ever sent to your own
HA instance. Click **Disconnect** to wipe it and return to demo mode.

---

## 2. Design a floorplan

### Background
- In the right panel click **Upload image…**, or **paste** (Ctrl/Cmd+V) / **drag-drop** an
  image onto the canvas. A photo, 2D plan, or 3D render all work.
- Adjust **opacity**, **scale**, **X/Y position** and **rotation**. Set the **canvas size**
  if you want a specific aspect ratio. Tick **Lock background layer** when you're happy so
  you don't nudge it while editing.

### Markers (entities)
- Click any entity in the left list to drop a marker, or type an `entity_id` at the bottom
  and press **Add**. Search and filter by domain to find things fast.
- Select a marker to edit it on the right:
  - **Entities** — add more than one entity to a single marker; for ha-floorplan set a
    **Group element id** (e.g. `living_lights`) so several lights share one marker.
  - **Style** — MDI icon / dot / state label / image / custom SVG, plus colour and size.
    Tick *Show live state value + unit* to display a sensor's reading.
  - **State-based styling** — add rules to change colour/icon/animation by state
    (on/off, a numeric threshold, a gradient heatmap, or an exact string match).
  - **Conditional visibility** — show the marker only when an entity is on / equals a state.
  - **Actions** — tap / hold / double-tap → toggle, more-info, call-service (with a
    service + YAML data editor), navigate, or url.
- **Drag** to position, **marquee-select** or Shift-click for multi-select, **arrow keys**
  to nudge (Shift = ×10), **Ctrl/Cmd+D** to duplicate, **Del** to delete.

### Rooms
- Pick the **Room** tool (`R`), click to add polygon points, then **double-click** or press
  **Enter** to finish. Select the room to set its **name**, **HA area**, **fill + opacity**,
  **state-based colouring** (e.g. tint by a light, motion sensor, or temperature gradient),
  and a **click action**.

### Walls, doors, windows
- **Wall** tool (`W`) — click along the wall; angles snap to 15° (toggle in the background
  panel). Double-click / Enter to finish. Style thickness + colour when selected.
- **Door** / **Window** tools — click near a wall to snap an opening onto it.

### Layers & floors
- The **Layers** panel toggles visibility 👁 and lock 🔒 for background / walls / rooms /
  entities / labels.
- **Floors** — add floors with **＋**; each floor has its own background and content. Double
  click a floor tab to rename.

### Preview
- Toggle **Preview** in the top bar to see your rules driven by live states (or the demo
  set). Toggle back to **Edit** to keep working.

### Saving
- Everything **autosaves** to your browser. Use **Projects** to create/open/delete projects,
  **Export current as JSON** for a backup, or **Import JSON…** to restore one.

---

## 3. Add the export to a dashboard

Open **Export** (top-right). Choose a target, choose how the background image is handled,
then **Copy YAML** (or **Download files**).

**Background image mode (both targets):**
- **Embed** *(default)* — the image is inlined as a base64 data URI. The card is fully
  self-contained; nothing else to copy.
- **Reference** — the card points at `/local/floorplan/<name>.png`. Also download the
  files and drop the `.png` (and `.svg` for ha-floorplan) into your HA
  `/config/www/floorplan/` folder (served at `/local/floorplan/`).

### Path A — ha-floorplan (rooms + rich rules)

Best when you want filled polygon rooms and rich state colouring.

1. **Install the card**: HACS → *Frontend* → search **floorplan** → install → **restart HA**.
2. In Export, pick target **ha-floorplan**, leave **Embed** selected.
3. Click **Copy YAML**.
4. In your dashboard: **Edit dashboard → Add card → Manual**, paste, **Save**.
5. (If you chose **Reference** instead, also copy the downloaded `.png` + `.svg` into
   `/config/www/floorplan/`.)

The generated card is a `type: custom:floorplan-card` with an `<image>` background, one
`<g id="…">` group per marker, `floorplan.class_set` rules for on/off colouring,
`floorplan.style_set` for thresholds/gradients, and `floorplan.text_set` for sensor
values — the structure ha-floorplan expects, so it renders immediately.

### Path B — Picture Elements (native, no HACS)

Best when you don't want a custom card. Icons/labels are positioned by percentage.

1. In Export, pick target **Picture Elements**.
2. **Copy YAML** → dashboard **Add card → Manual** → paste → **Save**.
3. **Note:** Picture Elements can't render filled polygon rooms — those are skipped (the
   YAML header tells you how many). Use **ha-floorplan** if you need rooms.

### Raw SVG / PNG
- Target **Raw SVG** gives you just the floorplan SVG.
- **Download PNG** rasterises the current design (with the embedded background) to a PNG.

---

## Verify it renders live

After adding the card, toggle one of your lights from the map and confirm the marker
colour follows the entity state, and that any sensor markers show their live value. If a
marker sits slightly off, nudge it in the editor (arrow keys) and re-export — because the
export is embedded, that's just Copy YAML → replace the card contents.
