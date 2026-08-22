// Bridge to the Home Assistant `hass` object that Lovelace injects into every
// dashboard card. When Floorplan Studio runs as a HACS card, HA sets `.hass` on
// the card element on every state change — that object already carries the full
// entity registry and live states of the very dashboard the user is looking at,
// so we can go "live" with zero URL/token entry.
//
// Standalone (non-card) builds never call setHass, so hassAvailable() stays
// false and the app falls back to the URL+token HaClient path.
import { HaEntity, HaState, domainOf } from '../model/entities';

// Minimal shape of the bits of `hass` we read. HA's real object has far more.
export interface HassLike {
  states: Record<
    string,
    {
      entity_id: string;
      state: string;
      attributes: Record<string, unknown> & {
        friendly_name?: string;
        icon?: string;
        unit_of_measurement?: string;
      };
    }
  >;
  // Entity/area registries (present in modern HA frontends). Optional: we
  // degrade gracefully to state attributes when they're missing.
  entities?: Record<string, { area_id?: string; name?: string; icon?: string }>;
  areas?: Record<string, { area_id: string; name: string }>;
  callService?: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ) => Promise<unknown>;
}

let current: HassLike | null = null;
const subs = new Set<(h: HassLike) => void>();

export function setHass(h: HassLike | null): void {
  current = h;
  if (h) for (const cb of subs) cb(h);
}
export function getHass(): HassLike | null {
  return current;
}
export function hassAvailable(): boolean {
  return !!(current && current.states);
}
/** Subscribe to every `hass` push HA makes into the card. Returns unsubscribe. */
export function subscribeHass(cb: (h: HassLike) => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

/** Map HA's `hass` object into the app's entity + state source. */
export function hassToSource(h: HassLike): {
  entities: HaEntity[];
  states: Record<string, HaState>;
} {
  const states: Record<string, HaState> = {};
  const entities: HaEntity[] = [];
  const reg = h.entities || {};
  for (const id of Object.keys(h.states)) {
    const s = h.states[id];
    states[id] = {
      entity_id: id,
      state: s.state,
      attributes: s.attributes as HaState['attributes'],
    };
    const r = reg[id];
    // Icon precedence mirrors HA: registry override > the icon in the live
    // state (which already has the integration/original icon merged in).
    const icon =
      (r?.icon || (s.attributes.icon as string | undefined))?.replace(/^mdi:/, '') || undefined;
    entities.push({
      entity_id: id,
      friendly_name: (s.attributes.friendly_name as string) || r?.name || id,
      domain: domainOf(id),
      icon,
      area_id: r?.area_id,
    });
  }
  entities.sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));
  return { entities, states };
}
