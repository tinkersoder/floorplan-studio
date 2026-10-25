// Placement planner for the RAMSES import.
//
// Given the current project and a normalised RamsesTopology, decide for each
// device whether it is already on the plan, lands inside a room (room.areaId /
// room name ↔ HA area), or is parked in a staging row along the bottom edge of
// a floor for the user to drag into place. The plan is computed without
// touching the store so the modal can preview it, then applied in one commit
// (= one undo step).
import { nanoid } from 'nanoid';
import { centroid } from '../canvas/geometry';
import type { Floor, Marker, Point, Project, Room, StateRule } from '../model/schema';
import { GROUP_COLOR, iconForClass, RamsesDevice, RamsesTopology } from './topology';

export interface ImportOptions {
  /** device ids the user ticked */
  selected: Set<string>;
  markerSize: number;
  /** put the device name under each marker */
  labels: boolean;
  /** add the device's measurement entities (temperature, demand…) to the marker */
  extraEntities: boolean;
  /** add ready-made state rules (unavailable, battery low, window open, heat demand) */
  stateRules: boolean;
  /** look for matching rooms on every floor, not only the active one */
  allFloors: boolean;
}

export type RowStatus = 'room' | 'staging' | 'exists' | 'no-entities' | 'off';

export interface PlanRow {
  device: RamsesDevice;
  status: RowStatus;
  floorId?: string;
  floorName?: string;
  roomName?: string;
  marker?: Marker;
}

export interface ImportPlan {
  rows: PlanRow[];
  /** rows that will add a marker */
  adds: PlanRow[];
}

export const slug = (s: string | null | undefined): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/** Does this room represent the device's HA area? (areaId first, then name slugs) */
export function roomMatchesDevice(room: Room, dev: RamsesDevice): boolean {
  if (!dev.area_id && !dev.area_name) return false;
  if (room.areaId && dev.area_id && room.areaId === dev.area_id) return true;
  const keys = new Set([slug(dev.area_id), slug(dev.area_name)].filter(Boolean));
  const roomKeys = [slug(room.areaId), slug(room.name)].filter(Boolean);
  return roomKeys.some((k) => keys.has(k));
}

/** Every entity id already used by a marker anywhere in the project. */
export function placedEntities(project: Project): Set<string> {
  const s = new Set<string>();
  for (const f of project.floors) for (const m of f.markers) for (const e of m.entities) s.add(e);
  return s;
}

const EXTRA_ROLES = ['temperature', 'setpoint', 'heat_demand', 'humidity', 'co2', 'fan_rate', 'window_open'];
const MAX_EXTRA = 4;

function ruleId() {
  return nanoid(6);
}

/** Sensible preview rules from the entities the device exposes. Order = priority. */
export function defaultRules(dev: RamsesDevice, primary: string, baseColor: string): StateRule[] {
  const rules: StateRule[] = [
    { id: ruleId(), entityId: primary, mode: 'stringMatch', match: 'unavailable', color: '#64748b' },
  ];
  const find = (role: string, domain: string) =>
    dev.entities.find((e) => e.role === role && e.domain === domain)?.entity_id;

  const battery = find('battery', 'binary_sensor');
  if (battery)
    rules.push({ id: ruleId(), entityId: battery, mode: 'stringMatch', match: 'on', color: '#ef4444', animation: 'blink' });

  const window = find('window_open', 'binary_sensor');
  if (window)
    rules.push({ id: ruleId(), entityId: window, mode: 'stringMatch', match: 'on', color: '#38bdf8', icon: 'window-open-variant' });

  const demandBin = find('heat_demand', 'binary_sensor');
  const demandPct = find('heat_demand', 'sensor');
  if (demandBin)
    rules.push({ id: ruleId(), entityId: demandBin, mode: 'stringMatch', match: 'on', color: '#ef4444', animation: 'pulse' });
  else if (demandPct)
    rules.push({ id: ruleId(), entityId: demandPct, mode: 'gradient', min: 0, max: 100, minColor: baseColor, maxColor: '#ef4444' });

  return rules;
}

export function buildMarker(dev: RamsesDevice, x: number, y: number, opts: ImportOptions): Marker {
  const primary = dev.primary_entity!;
  const color = GROUP_COLOR[dev.group] ?? GROUP_COLOR.orphan;
  const extras = opts.extraEntities
    ? dev.entities
        .filter((e) => e.entity_id !== primary && EXTRA_ROLES.includes(e.role) && e.domain !== 'number')
        .slice(0, MAX_EXTRA)
        .map((e) => e.entity_id)
    : [];
  const primaryDomain = primary.split('.')[0];
  return {
    id: nanoid(8),
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    entities: [primary, ...extras],
    style: {
      type: 'icon',
      icon: iconForClass(dev.device_class),
      color,
      size: opts.markerSize,
      showState: primaryDomain === 'sensor',
      ...(opts.labels ? { label: dev.display_name } : {}),
    },
    stateRules: opts.stateRules ? defaultRules(dev, primary, color) : [],
    actions: { tap: { kind: 'more-info' }, hold: { kind: 'none' }, double: { kind: 'none' } },
    visibility: null,
  };
}

/** Floor whose name matches the HA floor of the device's area (for staging). */
function floorForArea(project: Project, topo: RamsesTopology, dev: RamsesDevice): Floor | undefined {
  const floorId = dev.area_id ? topo.areas[dev.area_id]?.floor_id : null;
  const haFloor = floorId ? topo.floors[floorId]?.name ?? floorId : null;
  if (!haFloor) return undefined;
  return project.floors.find((f) => slug(f.name) === slug(haFloor));
}

/** Grid pitch: wide enough that device-name labels don't run into each other. */
export const markerSpacing = (opts: Pick<ImportOptions, 'markerSize' | 'labels'>): number =>
  opts.labels ? Math.max(opts.markerSize * 2.5, 72) : Math.max(opts.markerSize * 1.5, 24);

export function planRamsesImport(
  project: Project,
  topo: RamsesTopology,
  activeFloorId: string,
  opts: ImportOptions,
): ImportPlan {
  const placed = placedEntities(project);
  const active = project.floors.find((f) => f.id === activeFloorId) ?? project.floors[0];
  const searchFloors = opts.allFloors ? [active, ...project.floors.filter((f) => f !== active)] : [active];

  const spacing = markerSpacing(opts);
  const roomCount = new Map<string, number>();
  const stageCount = new Map<string, number>();

  const rows: PlanRow[] = topo.devices.map((device): PlanRow => {
    if (!device.primary_entity || device.entities.length === 0) return { device, status: 'no-entities' };
    if (device.entities.some((e) => placed.has(e.entity_id))) return { device, status: 'exists' };
    if (!opts.selected.has(device.device_id)) return { device, status: 'off' };

    for (const floor of searchFloors) {
      const room = floor.rooms.find((r) => r.polygon.length >= 3 && roomMatchesDevice(r, device));
      if (!room) continue;
      // Continue after markers already sitting in the room so re-imports don't stack.
      const key = room.id;
      if (!roomCount.has(key)) roomCount.set(key, floor.markers.filter((m) => pointInPolygon(m, room.polygon)).length);
      const n = roomCount.get(key)!;
      roomCount.set(key, n + 1);
      const c = centroid(room.polygon);
      const x = c.x + ((n % 3) - 1) * spacing;
      // Grid starts below the centroid, where the room's own name label sits.
      const y = c.y + spacing * 0.6 + Math.floor(n / 3) * spacing;
      return {
        device,
        status: 'room',
        floorId: floor.id,
        floorName: floor.name,
        roomName: room.name,
        marker: buildMarker(device, x, y, opts),
      };
    }

    // No room: park along the bottom edge of the matching (or active) floor.
    const floor = floorForArea(project, topo, device) ?? active;
    const k = stageCount.get(floor.id) ?? 0;
    stageCount.set(floor.id, k + 1);
    const margin = Math.max(opts.markerSize, spacing / 2, 20);
    const cols = Math.max(1, Math.floor((floor.canvas.width - 2 * margin) / spacing) + 1);
    const x = margin + (k % cols) * spacing;
    const y = floor.canvas.height - margin - Math.floor(k / cols) * spacing;
    return {
      device,
      status: 'staging',
      floorId: floor.id,
      floorName: floor.name,
      marker: buildMarker(device, x, y, opts),
    };
  });

  return { rows, adds: rows.filter((r) => r.marker) };
}

/** Apply a plan inside a store commit (immer draft). Returns the new marker ids. */
export function applyPlan(draft: Project, plan: ImportPlan): string[] {
  const ids: string[] = [];
  for (const row of plan.adds) {
    const floor = draft.floors.find((f) => f.id === row.floorId);
    if (!floor || !row.marker) continue;
    floor.markers.push(row.marker);
    ids.push(row.marker.id);
  }
  return ids;
}

/** Devices ticked by default: has entities, not on the plan yet, not the gateway. */
export function defaultSelection(project: Project, topo: RamsesTopology): Set<string> {
  const placed = placedEntities(project);
  return new Set(
    topo.devices
      .filter(
        (d) =>
          d.primary_entity &&
          d.entities.length > 0 &&
          d.group !== 'hgi' &&
          !d.entities.some((e) => placed.has(e.entity_id)),
      )
      .map((d) => d.device_id),
  );
}

// ---------------------------------------------------------------------------
// Merging a seeded studio project (Ramses Extras floorplan_seed_studio)
// ---------------------------------------------------------------------------

export interface MergeFloor {
  targetFloorId: string;
  targetFloorName: string;
  sourceFloorName: string;
  markers: Marker[];
  rooms: Room[];
  skipped: number;
  scaled: boolean;
}

/**
 * Merge markers (and rooms the target floor doesn't have yet) from a project
 * produced elsewhere — typically Ramses Extras' floorplan_seed_studio — into
 * the current project. Floors pair by name; a single-floor source always
 * lands on the active floor. Coordinates are scaled when canvas sizes differ.
 */
export function planProjectMerge(
  target: Project,
  incoming: Project,
  activeFloorId: string,
  opts: { includeRooms: boolean },
): MergeFloor[] {
  const placed = placedEntities(target);
  const active = target.floors.find((f) => f.id === activeFloorId) ?? target.floors[0];
  const out: MergeFloor[] = [];
  for (const src of incoming.floors ?? []) {
    const dst =
      (incoming.floors.length === 1 ? active : target.floors.find((f) => slug(f.name) === slug(src.name))) ?? active;
    const sw = src.canvas?.width || dst.canvas.width;
    const sh = src.canvas?.height || dst.canvas.height;
    const kx = dst.canvas.width / sw;
    const ky = dst.canvas.height / sh;
    const scaled = Math.abs(kx - 1) > 0.001 || Math.abs(ky - 1) > 0.001;
    const tp = (p: Point): Point => ({ x: Math.round(p.x * kx * 10) / 10, y: Math.round(p.y * ky * 10) / 10 });

    let skipped = 0;
    const markers: Marker[] = [];
    for (const m of src.markers ?? []) {
      if (!m.entities?.length || m.entities.some((e) => placed.has(e))) {
        skipped++;
        continue;
      }
      markers.push({ ...structuredClone(m), id: nanoid(8), ...tp(m) });
    }
    const have = new Set(dst.rooms.map((r) => slug(r.name)));
    const rooms: Room[] = opts.includeRooms
      ? (src.rooms ?? [])
          .filter((r) => r.polygon?.length >= 3 && !have.has(slug(r.name)))
          .map((r) => ({ ...structuredClone(r), id: nanoid(8), polygon: r.polygon.map(tp) }))
      : [];
    const existing = out.find((o) => o.targetFloorId === dst.id);
    if (existing) {
      existing.markers.push(...markers);
      existing.rooms.push(...rooms);
      existing.skipped += skipped;
    } else {
      out.push({
        targetFloorId: dst.id,
        targetFloorName: dst.name,
        sourceFloorName: src.name,
        markers,
        rooms,
        skipped,
        scaled,
      });
    }
  }
  return out;
}

export function applyMerge(draft: Project, merge: MergeFloor[]): string[] {
  const ids: string[] = [];
  for (const m of merge) {
    const floor = draft.floors.find((f) => f.id === m.targetFloorId);
    if (!floor) continue;
    floor.rooms.push(...m.rooms);
    floor.markers.push(...m.markers);
    ids.push(...m.markers.map((x) => x.id));
  }
  return ids;
}
