// MQTT device source — the bundled reference implementation for the plugin
// API (`window.floorplanStudio.registerPlugin`). It uses only the public
// manifest surface plus WebSocket registry reads — no editor internals —
// so the same code works unchanged as an external Lovelace resource.
//
// It also shows the minimum a generic integration needs: list its HA
// devices via the entity registry (platform filter), group entities per
// device, and translate to the neutral ImportDevice shape. Nothing here is
// MQTT-specific beyond the platform filter and the icon map — copy this
// file, change PLATFORM, and you have a zwave/zigbee/ble source.
//
// Imported for side effects by both entry points (main.tsx, hacs-card.tsx).
import type { FetchResult, ImportDevice, PluginManifest, WsCall } from '../plugins/types';

const PLUGIN_ID = 'mqtt';
const PLATFORM = 'mqtt';

/** Entity domain → MDI icon for devices without a better hint. */
const DOMAIN_ICON: Record<string, string> = {
  sensor: 'thermometer',
  binary_sensor: 'toggle-switch',
  switch: 'toggle-switch-variant',
  light: 'lightbulb',
  climate: 'thermostat',
  fan: 'fan',
  cover: 'window-shutter',
  lock: 'lock',
  camera: 'cctv',
  number: 'ray-vertex',
  select: 'form-dropdown',
  button: 'gesture-tap-button',
};

const DOMAIN_ORDER = ['climate', 'fan', 'light', 'cover', 'lock', 'camera', 'switch'];

interface RegistryEntity {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
  area_id?: string | null;
  disabled_by?: string | null;
  name?: string | null;
  original_name?: string | null;
}

interface RegistryDevice {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  area_id?: string | null;
  disabled_by?: string | null;
}

interface RegistryArea {
  area_id: string;
  name: string;
  floor_id?: string | null;
}

interface RegistryFloor {
  floor_id: string;
  name: string;
  level?: number | null;
}

/** Pick a display entity: interactive domains first, then anything. */
function primaryOf(entities: { entity_id: string }[]): string | null {
  for (const dom of DOMAIN_ORDER) {
    const hit = entities.find((e) => e.entity_id.startsWith(`${dom}.`));
    if (hit) return hit.entity_id;
  }
  return entities[0]?.entity_id ?? null;
}

async function fetchMqtt(ws: WsCall): Promise<FetchResult> {
  const [entities, devices, areas, floors] = await Promise.all([
    ws<RegistryEntity[]>({ type: 'config/entity_registry/list' }),
    ws<RegistryDevice[]>({ type: 'config/device_registry/list' }),
    ws<RegistryArea[]>({ type: 'config/area_registry/list' }).catch(() => [] as RegistryArea[]),
    ws<RegistryFloor[]>({ type: 'config/floor_registry/list' }).catch(() => [] as RegistryFloor[]),
  ]);

  const byDevice = new Map<string, RegistryEntity[]>();
  for (const e of entities) {
    if (e.platform !== PLATFORM || e.disabled_by || !e.device_id) continue;
    const list = byDevice.get(e.device_id) ?? [];
    list.push(e);
    byDevice.set(e.device_id, list);
  }

  const importDevices: ImportDevice[] = [];
  for (const d of devices) {
    const ents = byDevice.get(d.id);
    if (!ents?.length || d.disabled_by) continue;
    const primary = primaryOf(ents);
    const domain = primary?.split('.')[0] ?? 'sensor';
    const area_id = ents.find((e) => e.area_id)?.area_id ?? d.area_id ?? null;
    importDevices.push({
      device_id: d.id, // integration-local id — a HA device id here
      device_class: domain, // free-form token: icon map + Type column
      group: PLATFORM, // select-all grouping + colour
      area_id,
      area_name: area_id ? (areas.find((a) => a.area_id === area_id)?.name ?? null) : null,
      display_name: d.name_by_user || d.name || `MQTT ${d.id.slice(0, 8)}`,
      primary_entity: primary,
      entities: ents.map((e) => ({
        entity_id: e.entity_id,
        domain: e.entity_id.split('.')[0],
        role: 'other',
        area_id: e.area_id ?? null,
        name: e.name ?? e.original_name ?? undefined,
      })),
      icon: DOMAIN_ICON[domain] ?? 'access-point-network',
      color: '#10b981',
      kind: `MQTT ${domain}`,
    });
  }
  if (!importDevices.length)
    throw new Error('No MQTT devices found — is the MQTT integration set up on this Home Assistant?');

  return {
    topology: {
      source: PLATFORM,
      sourceLabel: 'MQTT devices',
      devices: importDevices,
      areas: Object.fromEntries(areas.map((a) => [a.area_id, { name: a.name, floor_id: a.floor_id ?? null }])),
      floors: Object.fromEntries(floors.map((f) => [f.floor_id, { name: f.name, level: f.level ?? null }])),
    },
  };
}

const manifest: PluginManifest = {
  id: PLUGIN_ID,
  apiVersion: 1,
  provides: {
    deviceSources: [
      {
        id: PLATFORM,
        title: 'MQTT devices',
        description: 'devices on the MQTT integration, via the HA entity registry',
        fetch: (ws) => fetchMqtt(ws),
      },
    ],
  },
};

// Register immediately when the API exists; this file is imported after
// ./plugins/install, so window.floorplanStudio is always present.
window.floorplanStudio?.registerPlugin(manifest);
