import { describe, expect, it } from 'vitest';
import { resolveEntityIcon } from './haIcons';
import { HaState } from './entities';

const st = (state: string, attributes: Record<string, unknown> = {}): HaState => ({
  entity_id: 'x.y',
  state,
  attributes,
});

describe('resolveEntityIcon', () => {
  it('prefers a custom icon', () => {
    expect(resolveEntityIcon('light.x', st('on', { icon: 'mdi:led-strip' }))).toBe('led-strip');
  });

  it('maps sensor device_class', () => {
    expect(resolveEntityIcon('sensor.p', st('123', { device_class: 'power' }))).toBe('flash');
    expect(resolveEntityIcon('sensor.t', st('21', { device_class: 'temperature' }))).toBe('thermometer');
  });

  it('is state-aware for binary_sensor / cover / lock', () => {
    expect(resolveEntityIcon('binary_sensor.m', st('on', { device_class: 'motion' }))).toBe('motion-sensor');
    expect(resolveEntityIcon('binary_sensor.m', st('off', { device_class: 'motion' }))).toBe('motion-sensor-off');
    expect(resolveEntityIcon('cover.c', st('open', { device_class: 'window' }))).toBe('window-open');
    expect(resolveEntityIcon('cover.c', st('closed', { device_class: 'window' }))).toBe('window-closed');
    expect(resolveEntityIcon('lock.l', st('unlocked'))).toBe('lock-open');
  });

  it('gives battery sensors a level icon', () => {
    expect(resolveEntityIcon('sensor.b', st('55', { device_class: 'battery' }))).toBe('battery-60');
    expect(resolveEntityIcon('sensor.b', st('100', { device_class: 'battery' }))).toBe('battery');
  });

  it('falls back to a domain default', () => {
    expect(resolveEntityIcon('light.x', st('on'))).toBe('lightbulb');
    expect(resolveEntityIcon('automation.a', st('on'))).toBe('robot');
  });
});
