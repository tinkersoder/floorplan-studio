// Example plugin #1 — "Home Assistant devices".
//
// Universal reference implementation: every HA instance has a device
// registry, so this source always has something to show — unlike an
// integration-specific example (mqtt, zwave_js) that's empty where the
// integration isn't used. It reads the device + entity registries and
// emits one ImportDevice per HA device, grouped by the integration
// (entity platform) that owns it.
//
// This doubles as the seed for the "coverage map" idea: a generic
// browser of every integration's devices, with registered deviceSources
// marking which integrations have a rich provider.
import { registerPlugin } from '../plugins/registry';
import type { FetchResult, ImportDevice, ImportEntity } from '../plugins/types';
import type { WsCall } from '../ha/wsCaller';

interface HaDevice {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  area_id?: string | null;
  config_entries?: string[];
}
interface HaEntityReg {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  platform?: string;
  original_name?: string;
  disabled_by?: string | null;
}

const PRIMARY_DOMAIN_ORDER = [
  'climate', 'fan', 'vacuum', 'switch', 'light', 'cover', 'media_player',
  'humidifier', 'water_heater', 'sensor', 'binary_sensor', 'number',
];

async function fetchHaDevices(call: WsCall): Promise<FetchResult> {
  const [devices, entities] = await Promise.all([
    call<HaDevice[]>({ type: 'config/device_registry/list' }),
    call<HaEntityReg[]>({ type: 'config/entity_registry/list' }),
  ]);

  const byDevice = new Map<string, HaEntityReg[]>();
  for (const e of entities) {
    if (e.device_id && !e.disabled_by) {
      const list = byDevice.get(e.device_id) ?? [];
      list.push(e);
      byDevice.set(e.device_id, list);
    }
  }

  const out: ImportDevice[] = [];
  for (const dev of devices) {
    const ents = byDevice.get(dev.id);
    if (!ents?.length) continue; // no placeable entity → nothing to mark
    const primary =
      PRIMARY_DOMAIN_ORDER.map((d) => ents.find((e) => e.entity_id.startsWith(d + '.'))).find(Boolean) ??
      ents[0];
    out.push({
      device_id: `ha_${dev.id}`,
      device_class: primary.entity_id.split('.')[0],
      group: primary.platform ?? 'unknown',
      area_id: dev.area_id ?? undefined,
      display_name: dev.name_by_user || dev.name || primary.entity_id,
      primary_entity: primary.entity_id,
      entities: ents.map(
        (e): ImportEntity => ({
          entity_id: e.entity_id,
          domain: e.entity_id.split('.')[0],
          role: 'other',
          name: e.original_name,
        }),
      ),
    });
  }
  out.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.display_name.localeCompare(b.display_name));

  const groups = new Set(out.map((d) => d.group));
  return {
    topology: {
      source: 'ha_registry',
      sourceLabel: 'Home Assistant registry',
      devices: out,
      areas: {},
      floors: {},
    },
    note: `${groups.size} integration${groups.size === 1 ? '' : 's'} — no domain knowledge, plain registry view.`,
  };
}

registerPlugin({
  id: 'ha-devices',
  apiVersion: 1,
  provides: {
    deviceSources: [
      {
        id: 'devices',
        title: 'Home Assistant devices',
        description: 'Every device in the HA registry, grouped by integration.',
        fetch: fetchHaDevices,
      },
    ],
  },
});
