// Live RAMSES fetch over whichever Home Assistant link is active:
// the URL+token HaClient (standalone) or the `hass` object Lovelace injects
// (HACS card mode).
import { haClient } from '../ha/client';
import { getHass } from '../ha/hassBridge';
import { useStore } from '../state/store';
import {
  HaAreaEntry,
  HaDeviceRegistryEntry,
  HaEntityRegistryEntry,
  HaFloorEntry,
  normaliseExtrasTopology,
  RamsesTopology,
  topologyFromRegistries,
} from './topology';

export type WsCall = <T>(msg: Record<string, unknown>) => Promise<T>;

export const EXTRAS_TOPOLOGY_WS = 'ramses_extras/floorplan_helper/get_topology';

/** A WebSocket caller for the live HA link, or null when running on demo data. */
export function liveWsCaller(): WsCall | null {
  const { conn, usingDemo } = useStore.getState();
  if (usingDemo || conn.status !== 'connected') return null;
  if (conn.url === 'this dashboard') {
    const h = getHass();
    if (h?.callWS) return (msg) => h.callWS!(msg);
    if (h?.connection?.sendMessagePromise) return (msg) => h.connection!.sendMessagePromise(msg);
    return null;
  }
  return haClient.connected ? (msg) => haClient.sendWS(msg) : null;
}

export interface FetchResult {
  topology: RamsesTopology;
  note?: string;
}

/**
 * Prefer Ramses Extras' own floorplan model (it already resolves zones, parent
 * links, primary entities and display names). Without Extras, rebuild the same
 * shape from the HA device/entity/area/floor registries filtered to ramses_cc.
 */
export async function fetchRamsesTopology(call: WsCall): Promise<FetchResult> {
  let extrasError = '';
  try {
    const raw = await call<unknown>({ type: EXTRAS_TOPOLOGY_WS });
    const topology = normaliseExtrasTopology(raw);
    if (topology.devices.length) return { topology };
    extrasError = 'Ramses Extras returned no devices';
  } catch (e) {
    extrasError = errText(e);
  }

  const [devices, entities, areas, floors] = await Promise.all([
    call<HaDeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
    call<HaEntityRegistryEntry[]>({ type: 'config/entity_registry/list' }),
    call<HaAreaEntry[]>({ type: 'config/area_registry/list' }).catch(() => [] as HaAreaEntry[]),
    call<HaFloorEntry[]>({ type: 'config/floor_registry/list' }).catch(() => [] as HaFloorEntry[]),
  ]);
  const topology = topologyFromRegistries(devices, entities, areas, floors);
  if (!topology.devices.length)
    throw new Error('No RAMSES devices found on this Home Assistant — is the ramses_cc (Ramses RF) integration installed?');
  return {
    topology,
    note: /unknown.command|unknown_command|not found/i.test(extrasError)
      ? 'Ramses Extras floorplan helper not found — read devices straight from the ramses_cc registries.'
      : `Ramses Extras unavailable (${extrasError}) — read devices straight from the ramses_cc registries.`,
  };
}

function errText(e: unknown): string {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  const o = e as { code?: string; message?: string };
  return [o.code, o.message].filter(Boolean).join(': ') || String(e);
}
