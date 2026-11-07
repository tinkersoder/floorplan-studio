// Preview-mode marker gestures: fire a marker's tap/hold/double action the
// way an exported card would. `callService` resolves to whichever HA link is
// active (card `hass` object or the standalone HaClient); more-info/navigate
// use the standard HA frontend events so they work inside a dashboard and
// degrade harmlessly standalone.
import yaml from 'js-yaml';
import { haClient } from '../ha/client';
import { getHass } from '../ha/hassBridge';
import type { Action, Marker } from '../model/schema';

function callService(domain: string, service: string, data: Record<string, unknown>): void {
  const h = getHass();
  if (h?.callService) {
    void h.callService(domain, service, data);
    return;
  }
  if (haClient.connected) {
    void haClient.callService(domain, service, data);
    return;
  }
  console.info(`[floorplan-studio] call-service ${domain}.${service} (no HA link)`, data);
}

/** Fire an action exactly once. `gesture` is only for logging. */
export function runMarkerAction(action: Action | undefined, marker: Marker, gesture: string): void {
  if (!action || action.kind === 'none') return;
  const target = action.target ?? marker.entities[0];

  switch (action.kind) {
    case 'more-info': {
      if (!target) return;
      window.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: target } }));
      return;
    }
    case 'toggle': {
      if (!target) return;
      callService('homeassistant', 'toggle', { entity_id: target });
      return;
    }
    case 'call-service': {
      const svc = action.service ?? '';
      const dot = svc.indexOf('.');
      if (dot < 1) {
        console.warn(`[floorplan-studio] ${gesture}: bad service "${svc}" (want domain.service)`);
        return;
      }
      let data: Record<string, unknown> = {};
      const raw = action.serviceData?.trim();
      if (raw) {
        try {
          const parsed = yaml.load(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            data = parsed as Record<string, unknown>;
          else console.warn(`[floorplan-studio] ${gesture}: serviceData is not a mapping`, parsed);
        } catch (e) {
          console.warn(`[floorplan-studio] ${gesture}: serviceData YAML failed to parse`, e);
          return;
        }
      }
      callService(svc.slice(0, dot), svc.slice(dot + 1), data);
      return;
    }
    case 'navigate': {
      const path = action.navPath;
      if (!path) return;
      history.pushState(null, '', path);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return;
    }
    case 'url': {
      if (action.url) window.open(action.url, '_blank', 'noopener,noreferrer');
      return;
    }
  }
}

const TAP_DELAY_MS = 260;
const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 8;

export interface GestureTimers {
  tap?: ReturnType<typeof setTimeout>;
  hold?: ReturnType<typeof setTimeout>;
  down?: { x: number; y: number };
}

/**
 * Preview gestures for a marker: tap (after a delay so double-tap can cancel
 * it), double, and hold. `timers` must be a stable per-marker object (a ref)
 * — a re-render between tap and double-tap must not leak a pending tap.
 */
export function markerGestureHandlers(marker: Marker, timers: GestureTimers) {
  const clear = (t: 'tap' | 'hold') => {
    if (timers[t]) clearTimeout(timers[t]);
    timers[t] = undefined;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      timers.down = { x: e.clientX, y: e.clientY };
      clear('hold');
      timers.hold = setTimeout(() => {
        timers.hold = undefined;
        clear('tap');
        runMarkerAction(marker.actions.hold, marker, 'hold');
      }, HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = timers.down;
      if (!d) return;
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > MOVE_TOLERANCE_PX) {
        timers.down = undefined;
        clear('hold');
      }
    },
    onPointerUp: () => {
      timers.down = undefined;
      clear('hold');
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      clear('tap');
      timers.tap = setTimeout(() => {
        timers.tap = undefined;
        runMarkerAction(marker.actions.tap, marker, 'tap');
      }, TAP_DELAY_MS);
    },
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      clear('tap');
      runMarkerAction(marker.actions.double, marker, 'double');
    },
  };
}
