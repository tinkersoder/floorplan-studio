import { beforeEach, describe, expect, it } from 'vitest';
import { emitAction } from './events';
import {
  getActions,
  getDeviceSources,
  getIconMap,
  getMarkerDefaults,
  getPlugins,
  getStateRulePresets,
  registerPlugin,
  unregisterPlugin,
} from './registry';
import { EVENT_ACTION } from './types';

// Tests run against a shared module registry — reset by unregistering.
function reset() {
  for (const p of getPlugins()) unregisterPlugin(p.id);
}

describe('plugin registry', () => {
  beforeEach(reset);

  it('registers and exposes capability slots', () => {
    registerPlugin({
      id: 'demo',
      apiVersion: 1,
      provides: {
        deviceSources: [{ id: 'demo', title: 'Demo source' }],
        actions: [{ id: 'demo.act', label: 'Do it', location: 'toolbar' }],
        iconMap: { FAN: 'fan' },
        markerDefaults: { size: 40 },
        stateRulePresets: [{ entityRole: 'battery', mode: 'stringMatch', match: 'on' }],
        // unknown future slots are simply ignored by the getters
        ...({ wallStyles: [] } as object),
      },
    });
    expect(getPlugins().map((p) => p.id)).toEqual(['demo']);
    expect(getDeviceSources()).toHaveLength(1);
    expect(getDeviceSources()[0].source.title).toBe('Demo source');
    expect(getActions('toolbar')).toHaveLength(1);
    expect(getIconMap()).toEqual({ FAN: 'fan' });
    expect(getMarkerDefaults()).toEqual({ size: 40 });
    expect(getStateRulePresets()).toHaveLength(1);
  });

  it('same-id re-registration replaces the earlier manifest', () => {
    registerPlugin({ id: 'ramses', provides: { actions: [{ id: 'a', label: 'A' }] } });
    registerPlugin({ id: 'ramses', provides: { actions: [{ id: 'b', label: 'B' }] } });
    expect(getPlugins()).toHaveLength(1);
    expect(getActions().map((x) => x.action.id)).toEqual(['b']);
  });

  it('duplicate source ids: last registered plugin wins', () => {
    registerPlugin({ id: 'p1', provides: { deviceSources: [{ id: 'src', title: 'first' }] } });
    registerPlugin({ id: 'p2', provides: { deviceSources: [{ id: 'src', title: 'second' }] } });
    expect(getDeviceSources().map((s) => s.source.title)).toEqual(['second']);
  });

  it('emits floorplan-studio:action with the documented payload', () => {
    // node env: stub the window bits emit() touches
    const listeners = new Map<string, ((e: Event) => void)[]>();
    const seen: CustomEvent[] = [];
    const w = {
      addEventListener: (t: string, cb: (e: Event) => void) => listeners.set(t, [...(listeners.get(t) ?? []), cb]),
      removeEventListener: (t: string, cb: (e: Event) => void) =>
        listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== cb)),
      dispatchEvent: (e: Event) => {
        for (const cb of listeners.get(e.type) ?? []) cb(e);
        return true;
      },
    };
    const prev = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = w;
    const listener = (e: Event) => seen.push(e as CustomEvent);
    try {
      window.addEventListener(EVENT_ACTION, listener);
      emitAction({ pluginId: 'ramses', actionId: 'ramses.seed', projectId: 'p', floorId: 'f', selection: ['m1'] });
      window.removeEventListener(EVENT_ACTION, listener);
      expect(seen).toHaveLength(1);
      expect(seen[0].detail).toMatchObject({ pluginId: 'ramses', actionId: 'ramses.seed', selection: ['m1'] });
    } finally {
      (globalThis as { window?: unknown }).window = prev;
    }
  });
});
