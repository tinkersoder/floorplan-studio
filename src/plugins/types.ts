// Floorplan Studio plugin API — public contract for third-party integrations.
//
// An integration (HACS card module, Lovelace resource, …) registers a plain
// manifest via `window.floorplanStudio.registerPlugin(...)`. The manifest is
// data plus functions the editor calls at defined points — the editor keeps
// lifecycle control and never hands DOM refs or component internals to a
// plugin. Unknown `provides` keys are ignored, so plugins and the editor can
// version independently (see PLUGIN_API_VERSION).
//
// The current surface is intentionally small. It covers what an import-style
// integration needs today and leaves room for decoration/interaction slots
// later — unknown keys in `provides` are the versioning mechanism.

import type { ActionSet, Marker, MarkerStyle, Point, Project, StateRule } from '../model/schema';
import type { HaEntity } from '../model/entities';

export const PLUGIN_API_VERSION = 1;

// ---------------------------------------------------------------------------
// Generic device topology — the neutral model every device source returns.
// Integrations translate their domain model into this; the editor never sees
// ramses classes, zwave node types, etc. (they ride along as free-form
// `device_class`/`group` tokens used only for display, colours and select-all
// grouping).
// ---------------------------------------------------------------------------

export interface ImportEntity {
  entity_id: string;
  domain: string;
  /** semantic role (temperature, heat_demand, battery…) or "other" */
  role: string;
  area_id?: string | null;
  name?: string;
}

export interface ImportDevice {
  /** integration-local device id, e.g. "04:123456" or a zwave node id */
  device_id: string;
  /** free-form class token (TRV, light, …) — display + iconMap lookup only */
  device_class: string;
  /** free-form group token (heat, hvac, lighting…) — select-buttons + colour */
  group: string;
  /** optional parent id for integrations that model topology */
  parent?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  display_name: string;
  primary_entity?: string | null;
  entities: ImportEntity[];
  /** presentation hints the planner honours; editor defaults apply when absent */
  icon?: string;
  color?: string;
  /** human label for the Type column (falls back to device_class) */
  kind?: string;
  /** default-ticked in the import list (default true; e.g. gateways set false) */
  suggested?: boolean;
  /** gesture overrides, merged over the built-in
   *  `{tap: more-info, hold/double: none}` — e.g. a FAN's double-tap
   *  opening a custom popup card. Users can still edit per-marker
   *  afterwards; re-import never rewrites a placed marker. */
  actions?: Partial<ActionSet>;
  /** passthrough for fields providers may set that have no generic hint */
  style?: Partial<MarkerStyle>;
  visibility?: Marker['visibility'];
}

export interface DeviceTopology {
  /** source token for logging/display ("ramses_extras", "zwave_js"…) */
  source: string;
  /** human label shown in the modal ("Ramses Extras floorplan helper") */
  sourceLabel?: string;
  devices: ImportDevice[];
  areas: Record<string, { name: string; floor_id?: string | null }>;
  floors: Record<string, { name: string; level?: number | null }>;
}

/** A WebSocket caller bound to whichever HA link is active (URL+token or card). */
export type WsCall = <T>(msg: Record<string, unknown>) => Promise<T>;

/** Context handed to a source's fetch/parse (the live entity list, when live). */
export interface SourceContext {
  entities: HaEntity[];
  usingDemo: boolean;
}

export interface FetchResult {
  topology: DeviceTopology;
  /** extra context line shown next to the device count (fallback notes…) */
  note?: string;
}

export type ParsedSourceInput =
  | { kind: 'topology'; topology: DeviceTopology; note?: string }
  | { kind: 'project'; project: Project }
  | { kind: 'error'; error: string }
  /** not recognised — the modal tries the next registered source */
  | { kind: 'nomatch' };

export interface DeviceSourceProvider {
  id: string;
  /** menu label, e.g. "RAMSES RF / Ramses Extras" */
  title: string;
  /** one-line hint shown under its button */
  description?: string;
  /** live fetch over the active HA WebSocket. Throw with a readable message. */
  fetch?: (ws: WsCall, ctx: SourceContext) => Promise<FetchResult>;
  /** offline paste/file sniffing; return nomatch when the text isn't yours */
  parse?: (text: string, ctx: SourceContext) => ParsedSourceInput;
}

// ---------------------------------------------------------------------------
// Room-geometry sources — integrations return floor/room polygons only;
// the editor merges those rooms into the project and runs its single
// client-side placement planner (`planDeviceImport`) over them.
// ---------------------------------------------------------------------------

export interface ImportedRoom {
  name: string;
  /** optional HA area id mapping used by roomMatchesDevice */
  areaId?: string | null;
  polygon: Point[];
  fill?: string;
  opacity?: number;
}

export interface ImportedFloorRooms {
  name: string;
  canvas?: { width: number; height: number };
  rooms: ImportedRoom[];
}

export interface RoomSourceResult {
  floors: ImportedFloorRooms[];
  note?: string;
}

export interface RoomSourceProvider {
  id: string;
  title: string;
  description?: string;
  /** optional deviceSource id this room source accompanies in the Devices panel */
  deviceSourceId?: string;
  fetch: (ws: WsCall, ctx: SourceContext) => Promise<RoomSourceResult>;
}

// ---------------------------------------------------------------------------
// Other capability slots
// ---------------------------------------------------------------------------

export interface PluginAction {
  id: string;
  label: string;
  /** MDI icon name (no "mdi:" prefix) or a supported icon key */
  icon?: string;
  /** where the action is rendered; 'toolbar' shows in the grouped
   *  "Integrations ▾" overflow menu (one menu, actions grouped by
   *  plugin — never one button per action). 'marker-menu'/'room-menu'
   *  are stored for forward-compat and ignored today */
  location?: 'toolbar' | 'marker-menu' | 'room-menu';
  /** tooltip */
  title?: string;
}

/**
 * A StateRule template resolved per device at marker-build time:
 * `entityRole` binds the first entity carrying that role (the generic
 * role vocabulary), `entityId` binds a literal entity. The `id` is
 * assigned by the editor.
 */
export type StateRulePreset = Omit<StateRule, 'id' | 'entityId'> & {
  entityId?: string;
  entityRole?: string;
};

export interface PluginProvides {
  deviceSources?: DeviceSourceProvider[];
  roomSources?: RoomSourceProvider[];
  actions?: PluginAction[];
  /** free-form class token → MDI icon, for sources that don't set icon */
  iconMap?: Record<string, string>;
  /** merged under the marker style: plugin defaults < user choices < device */
  markerDefaults?: Partial<MarkerStyle>;
  /** extra state rules appended to imported markers (role-resolved) */
  stateRulePresets?: StateRulePreset[];
  /** stylesheet URL injected once (card mode: into the card's shadow root) */
  css?: string;
}

export interface PluginManifest {
  /** unique plugin id ("ramses", "zwave_js"…) — later registrations with the
   *  same id replace the earlier one, so an external provider can supersede
   *  a built-in one */
  id: string;
  /** highest PLUGIN_API_VERSION the plugin was written for */
  apiVersion?: number;
  provides?: PluginProvides;
}

// ---------------------------------------------------------------------------
// Event contract (documented — listeners addEventListener, no registry needed)
// ---------------------------------------------------------------------------

export const EVENT_ACTION = 'floorplan-studio:action';
export const EVENT_PROJECT_IMPORTED = 'floorplan-studio:project-imported';
export const EVENT_PLUGINS_CHANGED = 'floorplan-studio:plugins-changed';

export interface ActionEventDetail {
  pluginId: string;
  actionId: string;
  projectId: string;
  floorId: string;
  /** marker/room ids selected when the action fired */
  selection: string[];
}

export interface ProjectImportedDetail {
  pluginId?: string;
  mode: 'merge' | 'replace';
  markers: number;
  rooms: number;
}

export interface PluginsChangedDetail {
  plugins: string[];
}
