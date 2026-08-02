import {
  Auth,
  Connection,
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  HassEntities,
} from 'home-assistant-js-websocket';
import { HaArea, HaEntity, HaState } from '../model/entities';

export interface HaRegistryEntry {
  entity_id: string;
  name?: string;
  original_name?: string;
  area_id?: string;
  device_id?: string;
  /** user-set icon override */
  icon?: string;
  /** integration-provided default icon (e.g. WLED -> led-strip) */
  original_icon?: string;
}

export class HaClient {
  private conn?: Connection;
  private unsub?: () => void;

  async connect(url: string, token: string): Promise<void> {
    const hassUrl = url.replace(/\/+$/, '');
    const auth: Auth = createLongLivedTokenAuth(hassUrl, token);
    this.conn = await createConnection({ auth });
  }

  async fetchEntities(): Promise<{ entities: HaEntity[]; areas: HaArea[] }> {
    if (!this.conn) throw new Error('Not connected');
    const [registry, areas, states] = await Promise.all([
      this.conn.sendMessagePromise<HaRegistryEntry[]>({ type: 'config/entity_registry/list' }),
      this.conn
        .sendMessagePromise<HaArea[]>({ type: 'config/area_registry/list' })
        .catch(() => [] as HaArea[]),
      // get_states carries the icon HA actually displays (integration/original
      // icon merged in) — the entity_registry list and the subscribe_entities
      // stream both omit it, so this is the only reliable source.
      this.conn
        .sendMessagePromise<Array<{ entity_id: string; attributes?: { icon?: string } }>>({
          type: 'get_states',
        })
        .catch(() => [] as Array<{ entity_id: string; attributes?: { icon?: string } }>),
    ]);
    const stateIcon = new Map<string, string>();
    for (const s of states) {
      const ic = s.attributes?.icon;
      if (typeof ic === 'string' && ic) stateIcon.set(s.entity_id, ic);
    }
    const entities: HaEntity[] = registry
      .filter((e) => e.entity_id)
      .map((e) => ({
        entity_id: e.entity_id,
        friendly_name: e.name || e.original_name || e.entity_id,
        domain: e.entity_id.split('.')[0],
        // Icon precedence mirrors HA: user override > integration default
        // (original_icon) > the icon in the live state (get_states). Domain /
        // device_class default is resolved later at marker-creation time.
        icon:
          (e.icon || e.original_icon || stateIcon.get(e.entity_id))?.replace(/^mdi:/, '') ||
          undefined,
        area_id: e.area_id ?? undefined,
      }));
    return { entities, areas };
  }

  /** Subscribe to live states; onState is called with a full map on every change. */
  subscribe(onStates: (states: Record<string, HaState>) => void): void {
    if (!this.conn) throw new Error('Not connected');
    this.unsub = subscribeEntities(this.conn, (hass: HassEntities) => {
      const out: Record<string, HaState> = {};
      for (const id of Object.keys(hass)) {
        const s = hass[id];
        out[id] = {
          entity_id: id,
          state: s.state,
          attributes: s.attributes as HaState['attributes'],
        };
      }
      onStates(out);
    });
  }

  /** Call a service on the connected instance (used by preview tap actions). */
  async callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    if (!this.conn) throw new Error('Not connected');
    await this.conn.sendMessagePromise({
      type: 'call_service',
      domain,
      service,
      service_data: data,
    });
  }

  disconnect(): void {
    this.unsub?.();
    this.conn?.close();
    this.conn = undefined;
  }

  get connected() {
    return !!this.conn;
  }
}

export const haClient = new HaClient();

/** Persist/read the token locally (browser only; only ever sent to the user's HA). */
const TOKEN_KEY = 'fp-ha-credentials';
export function saveCredentials(url: string, token: string) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ url, token }));
}
export function readCredentials(): { url: string; token: string } | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  } catch {
    return null;
  }
}
export function clearCredentials() {
  localStorage.removeItem(TOKEN_KEY);
}
