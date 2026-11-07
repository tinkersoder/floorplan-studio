// A WebSocket caller bound to whichever Home Assistant link is active:
// the URL+token HaClient (standalone) or the `hass` object Lovelace injects
// (HACS card mode). Shared by the editor's own importers and exposed to
// plugins as `floorplanStudio.callWS`.
import { haClient } from './client';
import { getHass } from './hassBridge';
import { useStore } from '../state/store';
import type { WsCall } from '../plugins/types';

export type { WsCall };

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
