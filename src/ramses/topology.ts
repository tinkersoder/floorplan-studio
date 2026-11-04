// RAMSES RF / Ramses Extras → Floorplan Studio: device model + parsers.
//
// Everything here is pure (no store, no network) so it can be unit-tested and
// reused by both import paths:
//
//   * live  — `ramses_extras/floorplan_helper/get_topology` over the HA
//             WebSocket (Ramses Extras installed), or the HA device/entity
//             registries filtered to the ramses_cc integration (no Extras);
//   * paste — a saved get_topology result, a `floorplan_seed_studio` service
//             response / studio project JSON, or any text containing RAMSES
//             device ids (ramses_cc known_list YAML, a ramses_rf schema dump…).
//
// All three normalise into one `RamsesTopology` that the planner places onto
// the floorplan.
import yaml from 'js-yaml';
import type { HaEntity } from '../model/entities';
import type { Project } from '../model/schema';

export interface RamsesEntity {
  entity_id: string;
  domain: string;
  /** semantic role (temperature, heat_demand, battery…) or "other" */
  role: string;
  area_id?: string | null;
  name?: string;
}

export interface RamsesDevice {
  /** RAMSES id, e.g. "04:123456", or a zone/DHW id like "01:123456_02" */
  device_id: string;
  /** ramses_rf slug (CTL, TRV, FAN, REM, CO2…) or ZON for heating zones */
  device_class: string;
  /** heat | hvac | hgi | orphan */
  group: string;
  parent?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  display_name: string;
  primary_entity?: string | null;
  entities: RamsesEntity[];
  /** presentation hints filled at normalise time (ImportDevice contract) */
  icon?: string;
  color?: string;
  kind?: string;
  /** default-ticked in the import list — HGIs/gateways opt out */
  suggested?: boolean;
}

export interface RamsesTopology {
  source: 'ramses_extras' | 'ramses_cc' | 'device_ids';
  devices: RamsesDevice[];
  areas: Record<string, { name: string; floor_id?: string | null }>;
  floors: Record<string, { name: string; level?: number | null }>;
}

// ---------------------------------------------------------------------------
// Device classes, icons, groups
// ---------------------------------------------------------------------------

/** RAMSES device id, optionally with a zone index ("_02") or DHW ("_HW") suffix. */
const DEVICE_ID_FULL = /^(\d{2}):(\d{6})(?:_([0-9A-Fa-f]{2}|HW))?$/;
// Not glued to other word chars or id fragments; a trailing ":" (YAML key) is fine.
const DEVICE_ID_IN_TEXT = /(?<!\w|\d:)(\d{2}:\d{6})(?:_([0-9A-Fa-f]{2}|HW))?(?!\w|:\d)/g;

/** Fixed-meaning id prefixes (ramses_rf DEVICE_ID_REGEX). HVAC prefixes are ambiguous. */
const PREFIX_CLASS: Record<string, string> = {
  '01': 'CTL',
  '02': 'UFC',
  '03': 'THM',
  '04': 'TRV',
  '07': 'DHW',
  '10': 'OTB',
  '12': 'THM',
  '13': 'BDR',
  '18': 'HGI',
  '22': 'THM',
  '23': 'CTL',
  '34': 'THM',
};

const KNOWN_CLASSES = new Set([
  'CTL', 'UFC', 'THM', 'TRV', 'DHW', 'OTB', 'BDR', 'HGI', 'ZON', 'SEN', 'PRG', 'RFG',
  'FAN', 'HVAC', 'REM', 'RND', 'DIS', 'CO2', 'HUM', 'SWI',
]);

const HEAT_CLASSES = new Set(['CTL', 'UFC', 'THM', 'TRV', 'DHW', 'OTB', 'BDR', 'ZON', 'SEN', 'PRG']);
const HVAC_CLASSES = new Set(['FAN', 'HVAC', 'REM', 'RND', 'DIS', 'CO2', 'HUM', 'SWI', 'RFG']);

/** Class → MDI icon. Mirrors Ramses Extras' floorplan_helper icon map. */
export const CLASS_ICON: Record<string, string> = {
  FAN: 'fan',
  HVAC: 'fan',
  TRV: 'radiator',
  CTL: 'thermostat',
  ZON: 'home-thermometer',
  OTB: 'water-boiler',
  DHW: 'water-boiler',
  REM: 'remote',
  RND: 'remote',
  SWI: 'remote',
  DIS: 'tablet',
  HGI: 'router-wireless',
  RFG: 'router-wireless',
  BDR: 'pipe-valve',
  UFC: 'pipe-valve',
  CO2: 'molecule-co2',
  HUM: 'water-percent',
  THM: 'thermometer',
  SEN: 'thermometer',
  PRG: 'thermostat',
};

export const CLASS_LABEL: Record<string, string> = {
  CTL: 'Controller',
  ZON: 'Heating zone',
  TRV: 'Radiator valve',
  THM: 'Thermostat / sensor',
  SEN: 'Sensor',
  UFC: 'UFH controller',
  DHW: 'Hot water',
  OTB: 'OpenTherm bridge',
  BDR: 'Relay',
  HGI: 'Gateway',
  RFG: 'Gateway',
  FAN: 'Ventilation unit',
  HVAC: 'HVAC device',
  REM: 'Remote',
  RND: 'Remote',
  SWI: 'Switch',
  DIS: 'Display',
  CO2: 'CO₂ sensor',
  HUM: 'Humidity sensor',
  PRG: 'Programmer',
};

export const GROUP_COLOR: Record<string, string> = {
  heat: '#f97316',
  hvac: '#38bdf8',
  hgi: '#a78bfa',
  orphan: '#ffc107',
};

export const iconForClass = (cls: string): string => CLASS_ICON[cls] ?? 'help-circle';

/** Fill the neutral presentation fields the editor consumes (ImportDevice). */
function present<T extends RamsesDevice>(d: T): T {
  d.icon = iconForClass(d.device_class);
  d.color = GROUP_COLOR[d.group] ?? GROUP_COLOR.orphan;
  d.kind = CLASS_LABEL[d.device_class] ?? d.device_class;
  d.suggested = d.group !== 'hgi';
  return d;
}

export function groupForClass(cls: string): string {
  if (cls === 'HGI') return 'hgi';
  if (HEAT_CLASSES.has(cls)) return 'heat';
  if (HVAC_CLASSES.has(cls)) return 'hvac';
  return 'orphan';
}

/** Best class from the id alone ("" when the prefix is ambiguous). */
export function classFromId(deviceId: string): string {
  const m = DEVICE_ID_FULL.exec(deviceId);
  if (!m) return '';
  if (m[3]) return m[3].toUpperCase() === 'HW' ? 'DHW' : 'ZON';
  return PREFIX_CLASS[m[1]] ?? '';
}

/** Ambiguous HVAC prefixes (29/30/32/37…): guess from what entities the device exposes. */
function classFromEntities(entities: RamsesEntity[]): string {
  const domains = new Set(entities.map((e) => e.domain));
  const roles = new Set(entities.map((e) => e.role));
  if (domains.has('fan') || domains.has('climate') || roles.has('fan_rate')) return 'FAN';
  if (domains.has('remote')) return 'REM';
  if (roles.has('co2')) return 'CO2';
  if (roles.has('humidity')) return 'HUM';
  if (roles.has('temperature')) return 'THM';
  return '';
}

/**
 * Normalise whatever class hint we got (ramses_rf `_SLUG`, ramses_cc device
 * `model`, "unknown") into one of KNOWN_CLASSES. Zone/DHW id suffixes win,
 * because zones are not ramses_rf devices and arrive as "unknown".
 */
export function normaliseClass(hint: string | null | undefined, deviceId: string, entities: RamsesEntity[]): string {
  const fromId = classFromId(deviceId);
  if (fromId === 'ZON' || fromId === 'DHW' || fromId === 'HGI') return fromId;
  const token = String(hint ?? '').trim().split(/[\s(]/)[0].toUpperCase();
  if (KNOWN_CLASSES.has(token)) return token;
  if (/^controller/i.test(String(hint ?? ''))) return 'CTL';
  if (/^ufh/i.test(String(hint ?? ''))) return 'UFC';
  return fromId || classFromEntities(entities) || 'HVAC';
}

// ---------------------------------------------------------------------------
// Entities: roles + primary selection
// ---------------------------------------------------------------------------

/** Ordered like Ramses Extras' ENTITY_ROLE_PATTERNS (first match wins). */
const ROLE_PATTERNS: [string, string[]][] = [
  ['status', ['_status']],
  ['heat_demand', ['heat_demand']],
  ['window_open', ['window_open']],
  ['battery', ['battery']],
  ['fan_rate', ['fan_rate', 'fan_speed', 'fan_mode']],
  ['co2', ['co2_level', 'co2_control', 'co2']],
  ['temperature', ['temperature', 'indoor_temp', 'outdoor_temp', '_temp']],
  ['humidity', ['humidity']],
  ['setpoint', ['setpoint']],
];

export function classifyEntity(entityId: string): string {
  const name = (entityId.split('.')[1] ?? entityId).toLowerCase();
  for (const [role, patterns] of ROLE_PATTERNS) if (patterns.some((p) => name.includes(p))) return role;
  return 'other';
}

const PRIMARY_DOMAIN_ORDER = ['climate', 'water_heater', 'remote', 'fan', 'switch'];
const PRIMARY_ROLE_ORDER = ['temperature', 'co2', 'humidity', 'heat_demand', 'fan_rate'];

/** Same preference as Ramses Extras, plus a measurement fallback instead of *_battery_low. */
export function selectPrimaryEntity(entities: RamsesEntity[]): string | null {
  for (const d of PRIMARY_DOMAIN_ORDER) {
    const hit = entities.find((e) => e.domain === d);
    if (hit) return hit.entity_id;
  }
  for (const r of PRIMARY_ROLE_ORDER) {
    const hit = entities.find((e) => e.role === r && e.domain === 'sensor');
    if (hit) return hit.entity_id;
  }
  const nonBattery = entities.find((e) => e.role !== 'battery');
  return (nonBattery ?? entities[0])?.entity_id ?? null;
}

const toEntity = (entity_id: string, extra: Partial<RamsesEntity> = {}): RamsesEntity => ({
  entity_id,
  domain: entity_id.split('.')[0],
  role: classifyEntity(entity_id),
  ...extra,
});

// ---------------------------------------------------------------------------
// Source 1: Ramses Extras get_topology result
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function isExtrasTopology(v: unknown): v is { devices: unknown[] } {
  return !!v && typeof v === 'object' && Array.isArray((v as Loose).devices);
}

/** Normalise `ramses_extras/floorplan_helper/get_topology` output. */
export function normaliseExtrasTopology(raw: unknown): RamsesTopology {
  if (!isExtrasTopology(raw)) throw new Error('Not a Ramses Extras topology (no "devices" list)');
  const r = raw as Loose;
  const areas = (r.areas && typeof r.areas === 'object' ? r.areas : {}) as RamsesTopology['areas'];
  const floors = (r.floors && typeof r.floors === 'object' ? r.floors : {}) as RamsesTopology['floors'];
  const devices: RamsesDevice[] = [];
  for (const d of raw.devices as Loose[]) {
    const device_id = str(d?.device_id);
    if (!device_id) continue;
    const entities = (Array.isArray(d.entities) ? (d.entities as Loose[]) : [])
      .map((e) => (typeof e === 'string' ? { entity_id: e } : e))
      .filter((e) => str(e.entity_id))
      .map((e) =>
        toEntity(e.entity_id as string, {
          role: str(e.role) ?? classifyEntity(e.entity_id as string),
          area_id: str(e.area_id),
          name: str(e.name) ?? undefined,
        }),
      );
    const device_class = normaliseClass(str(d.device_class), device_id, entities);
    const area_id = str(d.area_id) ?? entities.find((e) => e.area_id)?.area_id ?? null;
    const primary = str(d.primary_entity);
    devices.push(
      present({
        device_id,
        device_class,
        // Extras' group is authoritative for heat/hvac/hgi, but it reports zones
        // and other non-rf children as "orphan" — derive those from the class.
        group: str(d.group) && d.group !== 'orphan' ? (d.group as string) : groupForClass(device_class),
        parent: str(d.parent),
        area_id,
        area_name: str(d.area_name) ?? (area_id ? areas[area_id]?.name ?? null : null),
        display_name: str(d.display_name) ?? `${device_class} ${device_id}`,
        primary_entity:
          primary && entities.some((e) => e.entity_id === primary) ? primary : selectPrimaryEntity(entities),
        entities,
      }),
    );
  }
  return { source: 'ramses_extras', devices, areas, floors };
}

// ---------------------------------------------------------------------------
// Source 2: plain ramses_cc via the HA registries (no Ramses Extras)
// ---------------------------------------------------------------------------

export interface HaDeviceRegistryEntry {
  id: string;
  identifiers: [string, string][];
  name?: string | null;
  name_by_user?: string | null;
  model?: string | null;
  area_id?: string | null;
  via_device_id?: string | null;
  /** HA ≥2026.9 child devices carry parent_device_id instead of via_device */
  parent_device_id?: string | null;
  disabled_by?: string | null;
}

export interface HaEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  platform?: string;
  name?: string | null;
  original_name?: string | null;
  disabled_by?: string | null;
}

export interface HaAreaEntry {
  area_id: string;
  name: string;
  floor_id?: string | null;
}

export interface HaFloorEntry {
  floor_id: string;
  name: string;
  level?: number | null;
}

const RAMSES_PLATFORMS = new Set(['ramses_cc', 'ramses_extras']);

export function ramsesIdOf(dev: HaDeviceRegistryEntry): string | null {
  for (const [platform, ident] of dev.identifiers ?? []) {
    if (RAMSES_PLATFORMS.has(platform) && DEVICE_ID_FULL.test(String(ident))) return String(ident);
  }
  return null;
}

export function topologyFromRegistries(
  devices: HaDeviceRegistryEntry[],
  entities: HaEntityRegistryEntry[],
  areaList: HaAreaEntry[] = [],
  floorList: HaFloorEntry[] = [],
): RamsesTopology {
  const areas: RamsesTopology['areas'] = {};
  for (const a of areaList) areas[a.area_id] = { name: a.name, floor_id: a.floor_id ?? null };
  const floors: RamsesTopology['floors'] = {};
  for (const f of floorList) floors[f.floor_id] = { name: f.name, level: f.level ?? null };

  const haToRamses = new Map<string, string>();
  for (const d of devices) {
    const rid = ramsesIdOf(d);
    if (rid && !d.disabled_by) haToRamses.set(d.id, rid);
  }

  const byDevice = new Map<string, RamsesEntity[]>();
  for (const e of entities) {
    if (e.disabled_by || !e.device_id || !haToRamses.has(e.device_id)) continue;
    const list = byDevice.get(e.device_id) ?? [];
    list.push(toEntity(e.entity_id, { area_id: e.area_id ?? null, name: e.name ?? e.original_name ?? undefined }));
    byDevice.set(e.device_id, list);
  }

  const out: RamsesDevice[] = [];
  for (const d of devices) {
    const device_id = haToRamses.get(d.id);
    if (!device_id) continue;
    const ents = byDevice.get(d.id) ?? [];
    const device_class = normaliseClass(d.model, device_id, ents);
    const area_id = ents.find((e) => e.area_id)?.area_id ?? d.area_id ?? null;
    out.push(
      present({
        device_id,
        device_class,
        group: groupForClass(device_class),
        parent: d.via_device_id ?? d.parent_device_id
          ? (haToRamses.get((d.via_device_id ?? d.parent_device_id) as string) ?? null)
          : null,
        area_id,
        area_name: area_id ? areas[area_id]?.name ?? null : null,
        display_name: d.name_by_user || d.name || `${device_class} ${device_id}`,
        primary_entity: selectPrimaryEntity(ents),
        entities: ents,
      }),
    );
  }
  out.sort((a, b) => a.device_id.localeCompare(b.device_id));
  return { source: 'ramses_cc', devices: out, areas, floors };
}

// ---------------------------------------------------------------------------
// Source 3: bare device ids (known_list, schema…) matched to HA entities
// ---------------------------------------------------------------------------

/** Every distinct RAMSES device id in a blob of text (null address 63:* skipped). */
export function extractDeviceIds(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(DEVICE_ID_IN_TEXT)) {
    if (m[1].startsWith('63:')) continue;
    seen.add(m[2] ? `${m[1]}_${m[2].toUpperCase() === 'HW' ? 'HW' : m[2]}` : m[1]);
  }
  return [...seen];
}

/** "01:123456_02" → "01_123456_02" (how ramses_cc ids appear inside entity ids). */
const idSlug = (id: string) => id.replace(':', '_').toLowerCase();

/**
 * Attach HA entities to ids by the id slug inside the entity_id
 * (`climate.01_123456_02`, `sensor.04_123456_temperature`…). An entity goes
 * to the longest matching id, so zone entities don't also land on the CTL.
 */
export function topologyFromIds(ids: string[], haEntities: HaEntity[], areaNames: Record<string, string> = {}): RamsesTopology {
  const slugs = ids.map((id) => ({ id, slug: idSlug(id) })).sort((a, b) => b.slug.length - a.slug.length);
  const byId = new Map<string, RamsesEntity[]>(ids.map((id) => [id, []]));
  for (const e of haEntities) {
    const obj = (e.entity_id.split('.')[1] ?? '').toLowerCase();
    const hit = slugs.find(({ slug }) => {
      const i = obj.indexOf(slug);
      if (i < 0) return false;
      const before = i === 0 || obj[i - 1] === '_';
      const after = obj.length === i + slug.length || obj[i + slug.length] === '_';
      return before && after;
    });
    if (hit) byId.get(hit.id)!.push(toEntity(e.entity_id, { area_id: e.area_id ?? null, name: e.friendly_name }));
  }
  const areas: RamsesTopology['areas'] = {};
  for (const [k, v] of Object.entries(areaNames)) areas[k] = { name: v };
  const devices = ids.map((device_id): RamsesDevice => {
    const ents = byId.get(device_id) ?? [];
    const device_class = normaliseClass(null, device_id, ents);
    const area_id = ents.find((e) => e.area_id)?.area_id ?? null;
    return present({
      device_id,
      device_class,
      group: groupForClass(device_class),
      area_id,
      area_name: area_id ? areaNames[area_id] ?? null : null,
      display_name: `${device_class} ${device_id}`,
      primary_entity: selectPrimaryEntity(ents),
      entities: ents,
    });
  });
  return { source: 'device_ids', devices, areas, floors: {} };
}

// ---------------------------------------------------------------------------
// Paste / file input sniffing
// ---------------------------------------------------------------------------

export type ParsedInput =
  | { kind: 'topology'; topology: RamsesTopology }
  | { kind: 'project'; project: Project }
  | { kind: 'ids'; ids: string[] }
  | { kind: 'error'; error: string };

function isProject(v: unknown): v is Project {
  return !!v && typeof v === 'object' && Array.isArray((v as Loose).floors);
}

/** Peel the wrappers HA puts around results (WS `result`, service `response`). */
function unwrap(v: unknown): unknown {
  let cur = v;
  for (let i = 0; i < 4 && cur && typeof cur === 'object' && !Array.isArray(cur); i++) {
    const o = cur as Loose;
    if (o.result && typeof o.result === 'object') cur = o.result;
    else if (o.response && typeof o.response === 'object') cur = o.response;
    else if (o.service_response && typeof o.service_response === 'object') cur = o.service_response;
    else break;
  }
  return cur;
}

/**
 * Sniff pasted/loaded text. Accepts JSON or YAML:
 *  - a get_topology result → topology
 *  - a floorplan_seed_studio response (`project_json`) or a studio project → project
 *  - anything else containing RAMSES ids (known_list, schema, packet log) → ids
 */
export function parseRamsesInput(text: string): ParsedInput {
  const src = text.trim();
  if (!src) return { kind: 'error', error: 'Nothing to import — paste or load something first.' };

  let data: unknown;
  try {
    data = JSON.parse(src);
  } catch {
    try {
      data = yaml.load(src);
    } catch {
      data = undefined;
    }
  }
  data = unwrap(data);

  if (data && typeof data === 'object') {
    const o = data as Loose;
    if (typeof o.project_json === 'string') {
      try {
        const p = JSON.parse(o.project_json);
        if (isProject(p)) return { kind: 'project', project: p };
      } catch {
        return { kind: 'error', error: 'project_json is not valid JSON.' };
      }
    }
    if (isProject(o.project_json)) return { kind: 'project', project: o.project_json };
    if (isProject(data)) return { kind: 'project', project: data };
    if (isExtrasTopology(data)) {
      try {
        return { kind: 'topology', topology: normaliseExtrasTopology(data) };
      } catch (e) {
        return { kind: 'error', error: (e as Error).message };
      }
    }
  }

  const ids = extractDeviceIds(src);
  if (ids.length) return { kind: 'ids', ids };
  return {
    kind: 'error',
    error:
      'No RAMSES data recognised. Expected a Ramses Extras topology, a floorplan_seed_studio result, a studio project, or text with device ids like 04:123456.',
  };
}
