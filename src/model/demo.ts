import { HaArea, HaEntity, HaState } from './entities';

// Demo / mock entity set, seeded with the user's real "Herbwood" entities so the
// app is immediately useful offline (and the exported card drops straight into
// their dashboard). These are also used as a fallback state source in PREVIEW
// mode when no live HA connection is active.

export const DEMO_AREAS: HaArea[] = [
  { area_id: 'bedroom', name: 'Bedroom' },
  { area_id: 'office', name: 'Office' },
  { area_id: 'toilet', name: 'Toilet' },
  { area_id: 'kitchen', name: 'Kitchen' },
  { area_id: 'living', name: 'Living room' },
  { area_id: 'dining', name: 'Dining' },
  { area_id: 'hall', name: 'Hall' },
];

interface Seed {
  entity_id: string;
  name: string;
  area?: string;
  icon?: string;
  state: string;
  attrs?: Record<string, unknown>;
}

const SEEDS: Seed[] = [
  { entity_id: 'light.kutuvalo', name: 'Bedroom light', area: 'bedroom', state: 'on' },
  { entity_id: 'light.geeklight', name: 'Office light', area: 'office', state: 'off' },
  { entity_id: 'light.toilet_wled', name: 'Toilet WLED', area: 'toilet', state: 'off' },
  { entity_id: 'light.kitchen', name: 'Kitchen light', area: 'kitchen', state: 'on' },
  { entity_id: 'light.table_lights', name: 'Dining table lights', area: 'dining', state: 'off' },
  { entity_id: 'light.eteinen_wled', name: 'Hall WLED', area: 'hall', state: 'on' },
  { entity_id: 'light.matrix', name: 'Living matrix', area: 'living', state: 'on' },
  { entity_id: 'light.hypeled', name: 'Living hype LED', area: 'living', state: 'off' },
  {
    entity_id: 'cover.livingroom_blinds_curtain',
    name: 'Living room blinds',
    area: 'living',
    state: 'open',
    attrs: { current_position: 100 },
  },
  {
    entity_id: 'sensor.humidity_and_temp_sensor_temperature',
    name: 'Indoor temperature',
    area: 'hall',
    icon: 'thermometer',
    state: '21.4',
    attrs: { unit_of_measurement: '°C', device_class: 'temperature' },
  },
  {
    entity_id: 'sensor.humidity_and_temp_sensor_humidity',
    name: 'Indoor humidity',
    area: 'hall',
    icon: 'water-percent',
    state: '46',
    attrs: { unit_of_measurement: '%', device_class: 'humidity' },
  },
  {
    entity_id: 'binary_sensor.living_motion',
    name: 'Living motion',
    area: 'living',
    state: 'off',
    attrs: { device_class: 'motion' },
  },
];

export function demoEntities(): HaEntity[] {
  return SEEDS.map((s) => ({
    entity_id: s.entity_id,
    friendly_name: s.name,
    domain: s.entity_id.split('.')[0],
    icon: s.icon,
    area_id: s.area,
  }));
}

export function demoStates(): Record<string, HaState> {
  const out: Record<string, HaState> = {};
  for (const s of SEEDS) {
    out[s.entity_id] = {
      entity_id: s.entity_id,
      state: s.state,
      attributes: { friendly_name: s.name, icon: s.icon, ...(s.attrs ?? {}) },
    };
  }
  return out;
}
