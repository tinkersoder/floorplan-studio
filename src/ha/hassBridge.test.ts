import { describe, it, expect, beforeEach } from 'vitest';
import {
  setHass,
  getHass,
  hassAvailable,
  subscribeHass,
  hassToSource,
  HassLike,
} from './hassBridge';

const sampleHass = (): HassLike => ({
  states: {
    'light.living_room': {
      entity_id: 'light.living_room',
      state: 'on',
      attributes: { friendly_name: 'Living Room', icon: 'mdi:ceiling-light' },
    },
    'sensor.indoor_temperature': {
      entity_id: 'sensor.indoor_temperature',
      state: '21.4',
      attributes: { friendly_name: 'Indoor Temp', unit_of_measurement: '°C' },
    },
  },
  entities: {
    'light.living_room': { area_id: 'living', name: 'Living Room', icon: 'mdi:led-strip-variant' },
  },
});

describe('hassBridge', () => {
  beforeEach(() => setHass(null));

  it('is unavailable until HA injects hass', () => {
    expect(hassAvailable()).toBe(false);
    expect(getHass()).toBeNull();
    setHass(sampleHass());
    expect(hassAvailable()).toBe(true);
  });

  it('notifies subscribers on every hass push', () => {
    const seen: number[] = [];
    const unsub = subscribeHass((h) => seen.push(Object.keys(h.states).length));
    setHass(sampleHass());
    setHass(sampleHass());
    unsub();
    setHass(sampleHass());
    expect(seen).toEqual([2, 2]); // 3rd push after unsub is ignored
  });

  it('maps hass states into live entities + states', () => {
    const { entities, states } = hassToSource(sampleHass());
    expect(Object.keys(states)).toHaveLength(2);
    expect(states['light.living_room'].state).toBe('on');
    // registry icon wins over the state attribute icon, mdi: prefix stripped
    const light = entities.find((e) => e.entity_id === 'light.living_room')!;
    expect(light.icon).toBe('led-strip-variant');
    expect(light.friendly_name).toBe('Living Room');
    expect(light.area_id).toBe('living');
    expect(light.domain).toBe('light');
  });

  it('falls back to state-attribute icon when registry lacks the entity', () => {
    const { entities } = hassToSource(sampleHass());
    const light = entities.find((e) => e.entity_id === 'light.living_room')!;
    // has registry entry -> registry icon
    expect(light.icon).toBe('led-strip-variant');
    // sensor has no registry entry and no attr icon -> undefined (domain default resolved later)
    const temp = entities.find((e) => e.entity_id === 'sensor.indoor_temperature')!;
    expect(temp.icon).toBeUndefined();
    expect(temp.friendly_name).toBe('Indoor Temp');
  });
});
