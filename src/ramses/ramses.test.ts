import { describe, it, expect } from 'vitest';
import { createFloor, createMarker, createProject, createRoom } from '../model/defaults';
import type { Project } from '../model/schema';
import {
  classFromId,
  extractDeviceIds,
  normaliseExtrasTopology,
  parseRamsesInput,
  topologyFromIds,
  topologyFromRegistries,
} from './topology';
import {
  applyMerge,
  applyPlan,
  defaultSelection,
  markerSpacing,
  planProjectMerge,
  planRamsesImport,
  pointInPolygon,
} from './plan';

// Shape of ramses_extras/floorplan_helper/get_topology (build_floorplan_model).
const extrasTopology = {
  devices: [
    {
      device_id: '01:145038',
      device_class: 'CTL',
      group: 'heat',
      parent: null,
      area_id: 'hallway',
      area_name: 'Hallway',
      display_name: 'Controller 01:145038',
      primary_entity: 'climate.01_145038',
      entities: [{ entity_id: 'climate.01_145038', domain: 'climate', role: 'other', area_id: 'hallway', name: '' }],
    },
    {
      device_id: '01:145038_02',
      device_class: 'unknown',
      group: 'orphan',
      area_id: 'living_room',
      display_name: 'Living room',
      primary_entity: 'climate.01_145038_02',
      entities: [
        { entity_id: 'climate.01_145038_02', domain: 'climate', role: 'other', area_id: 'living_room' },
        { entity_id: 'sensor.01_145038_02_heat_demand', domain: 'sensor', role: 'heat_demand', area_id: 'living_room' },
        { entity_id: 'binary_sensor.01_145038_02_window_open', domain: 'binary_sensor', role: 'window_open', area_id: 'living_room' },
      ],
    },
    {
      device_id: '04:056053',
      device_class: 'TRV',
      group: 'heat',
      parent: '01:145038_02',
      area_id: 'living_room',
      display_name: 'TRV living',
      primary_entity: 'sensor.04_056053_temperature',
      entities: [
        { entity_id: 'sensor.04_056053_temperature', domain: 'sensor', role: 'temperature', area_id: 'living_room' },
        { entity_id: 'binary_sensor.04_056053_battery_low', domain: 'binary_sensor', role: 'battery', area_id: 'living_room' },
      ],
    },
    {
      device_id: '32:153289',
      device_class: 'FAN',
      group: 'hvac',
      area_id: 'utility',
      display_name: 'Orcon FAN',
      primary_entity: 'fan.32_153289',
      entities: [{ entity_id: 'fan.32_153289', domain: 'fan', role: 'other', area_id: 'utility' }],
    },
    {
      device_id: '18:006402',
      device_class: 'HGI',
      group: 'hgi',
      area_id: null,
      display_name: 'HGI 18:006402',
      primary_entity: 'binary_sensor.18_006402_status',
      entities: [{ entity_id: 'binary_sensor.18_006402_status', domain: 'binary_sensor', role: 'status' }],
    },
    { device_id: '37:169161', device_class: 'REM', group: 'hvac', display_name: 'REM', primary_entity: null, entities: [] },
  ],
  areas: {
    hallway: { name: 'Hallway', floor_id: 'ground' },
    living_room: { name: 'Living room', floor_id: 'ground' },
    utility: { name: 'Utility', floor_id: 'attic' },
  },
  floors: { ground: { name: 'Ground floor', level: 0 }, attic: { name: 'Attic', level: 2 } },
};

function projectWithRooms(): Project {
  const p = createProject('Test');
  const f = p.floors[0];
  f.canvas = { width: 1000, height: 600 };
  const living = createRoom(
    [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
      { x: 400, y: 400 },
      { x: 100, y: 400 },
    ],
    'Living',
  );
  living.areaId = 'living_room';
  const hall = createRoom(
    [
      { x: 500, y: 100 },
      { x: 700, y: 100 },
      { x: 700, y: 300 },
      { x: 500, y: 300 },
    ],
    'Hallway', // no areaId — matched by name
  );
  f.rooms.push(living, hall);
  const attic = createFloor('Attic');
  attic.canvas = { width: 800, height: 400 };
  p.floors.push(attic);
  return p;
}

const opts = (selected: Set<string>) => ({
  selected,
  markerSize: 30,
  labels: true,
  extraEntities: true,
  stateRules: true,
  allFloors: true,
});

describe('topology normalisation', () => {
  it('classifies ids, including zones and DHW', () => {
    expect(classFromId('04:123456')).toBe('TRV');
    expect(classFromId('01:123456_0A')).toBe('ZON');
    expect(classFromId('01:123456_HW')).toBe('DHW');
    expect(classFromId('32:123456')).toBe('');
  });

  it('reads a Ramses Extras get_topology result (also when wrapped in a WS result)', () => {
    const parsed = parseRamsesInput(JSON.stringify({ id: 5, type: 'result', success: true, result: extrasTopology }));
    expect(parsed.kind).toBe('topology');
    if (parsed.kind !== 'topology') return;
    const zone = parsed.topology.devices.find((d) => d.device_id === '01:145038_02')!;
    expect(zone.device_class).toBe('ZON');
    expect(zone.group).toBe('heat');
    expect(zone.area_name).toBe('Living room');
    expect(parsed.topology.source).toBe('ramses_extras');
  });

  it('rebuilds devices from ramses_cc registries without Ramses Extras', () => {
    const topo = topologyFromRegistries(
      [
        { id: 'ha1', identifiers: [['ramses_cc', '01:145038']], name: 'Controller 01:145038', model: 'Controller', area_id: 'hallway' },
        { id: 'ha2', identifiers: [['ramses_cc', '01:145038_02']], name: 'Living', model: 'RAD', via_device_id: 'ha1', area_id: 'living_room' },
        { id: 'ha3', identifiers: [['ramses_cc', '29:091138']], name: null, model: 'FAN' },
        { id: 'ha4', identifiers: [['hue', 'abc']], name: 'Lamp' },
      ],
      [
        { entity_id: 'climate.01_145038', device_id: 'ha1', platform: 'ramses_cc' },
        { entity_id: 'climate.living', device_id: 'ha2', platform: 'ramses_cc' },
        { entity_id: 'sensor.living_temperature', device_id: 'ha2', platform: 'ramses_cc', disabled_by: 'user' },
        { entity_id: 'fan.29_091138', device_id: 'ha3', platform: 'ramses_cc' },
        { entity_id: 'light.lamp', device_id: 'ha4', platform: 'hue' },
      ],
      [{ area_id: 'living_room', name: 'Living room', floor_id: 'ground' }],
      [{ floor_id: 'ground', name: 'Ground floor' }],
    );
    expect(topo.devices.map((d) => d.device_id)).toEqual(['01:145038', '01:145038_02', '29:091138']);
    const zone = topo.devices[1];
    expect(zone.device_class).toBe('ZON');
    expect(zone.parent).toBe('01:145038');
    expect(zone.entities.map((e) => e.entity_id)).toEqual(['climate.living']);
    expect(zone.area_name).toBe('Living room');
    expect(topo.devices[0].device_class).toBe('CTL');
    expect(topo.devices[2].device_class).toBe('FAN');
    expect(topo.devices[2].display_name).toBe('FAN 29:091138');
  });

  it('pulls device ids out of a ramses_cc known_list and skips the null address', () => {
    const yamlText = `known_list:\n  01:145038: {class: CTL}\n  04:056053: {class: TRV}\n  32:153289: {class: FAN}\n  63:262142: {}\n  "18:006402": {class: HGI}\n`;
    const parsed = parseRamsesInput(yamlText);
    expect(parsed.kind).toBe('ids');
    if (parsed.kind === 'ids') expect(parsed.ids).toEqual(['01:145038', '04:056053', '32:153289', '18:006402']);
    expect(extractDeviceIds('zone 01:145038_02 and dhw 01:145038_HW')).toEqual(['01:145038_02', '01:145038_HW']);
  });

  it('matches id lists to HA entities, longest id first', () => {
    const topo = topologyFromIds(
      ['01:145038', '01:145038_02', '32:153289'],
      [
        { entity_id: 'climate.01_145038', friendly_name: 'CTL', domain: 'climate' },
        { entity_id: 'climate.01_145038_02', friendly_name: 'Living', domain: 'climate', area_id: 'living_room' },
        { entity_id: 'sensor.32_153289_co2_level', friendly_name: 'CO2', domain: 'sensor' },
        { entity_id: 'sensor.32_153289_fan_rate', friendly_name: 'Fan rate', domain: 'sensor' },
        { entity_id: 'sensor.132_153289x', friendly_name: 'noise', domain: 'sensor' },
      ],
    );
    expect(topo.devices[0].entities.map((e) => e.entity_id)).toEqual(['climate.01_145038']);
    expect(topo.devices[1].entities.map((e) => e.entity_id)).toEqual(['climate.01_145038_02']);
    expect(topo.devices[1].area_id).toBe('living_room');
    expect(topo.devices[2].device_class).toBe('FAN');
    expect(topo.devices[2].entities).toHaveLength(2);
  });

  it('recognises a floorplan_seed_studio response pasted from Developer Tools (YAML)', () => {
    const project = createProject('Seeded');
    const yamlText = `project_json: '${JSON.stringify(project)}'\nbackup_path: /config/x.json\n`;
    const parsed = parseRamsesInput(yamlText);
    expect(parsed.kind).toBe('project');
  });

  it('reports garbage clearly', () => {
    expect(parseRamsesInput('hello world').kind).toBe('error');
    expect(parseRamsesInput('   ').kind).toBe('error');
  });
});

describe('placement plan', () => {
  const topo = normaliseExtrasTopology(extrasTopology);

  it('places devices in rooms by areaId or room name, stages the rest on the right floor', () => {
    const p = projectWithRooms();
    const sel = defaultSelection(p, topo);
    expect(sel.has('18:006402')).toBe(false); // gateway off by default
    expect(sel.has('37:169161')).toBe(false); // no entities
    const plan = planRamsesImport(p, topo, p.activeFloorId, opts(sel));
    const by = Object.fromEntries(plan.rows.map((r) => [r.device.device_id, r]));

    expect(by['01:145038'].status).toBe('room');
    expect(by['01:145038'].roomName).toBe('Hallway');
    expect(by['01:145038_02'].status).toBe('room');
    expect(by['04:056053'].status).toBe('room');
    const living = p.floors[0].rooms[0].polygon;
    expect(pointInPolygon(by['01:145038_02'].marker!, living)).toBe(true);
    expect(pointInPolygon(by['04:056053'].marker!, living)).toBe(true);
    expect(by['01:145038_02'].marker!.x).not.toBe(by['04:056053'].marker!.x);

    // Utility is on the HA "Attic" floor with no room → staged on the Attic floor.
    expect(by['32:153289'].status).toBe('staging');
    expect(by['32:153289'].floorName).toBe('Attic');
    expect(by['32:153289'].marker!.y).toBeGreaterThan(300);

    expect(by['18:006402'].status).toBe('off');
    expect(by['37:169161'].status).toBe('no-entities');
    expect(plan.adds).toHaveLength(4);
  });

  it('builds markers with class icon, extra entities and state rules', () => {
    const p = projectWithRooms();
    const plan = planRamsesImport(p, topo, p.activeFloorId, opts(new Set(['01:145038_02', '04:056053'])));
    const zone = plan.adds.find((r) => r.device.device_id === '01:145038_02')!.marker!;
    expect(zone.style.icon).toBe('home-thermometer');
    expect(zone.style.label).toBe('Living room');
    expect(zone.entities).toEqual([
      'climate.01_145038_02',
      'sensor.01_145038_02_heat_demand',
      'binary_sensor.01_145038_02_window_open',
    ]);
    expect(zone.stateRules.map((r) => r.mode)).toEqual(['stringMatch', 'stringMatch', 'gradient']);
    const trv = plan.adds.find((r) => r.device.device_id === '04:056053')!.marker!;
    expect(trv.style.showState).toBe(true);
    expect(trv.stateRules.some((r) => r.entityId === 'binary_sensor.04_056053_battery_low' && r.animation === 'blink')).toBe(true);
  });

  it('is idempotent: a second import skips devices already on the plan', () => {
    const p = projectWithRooms();
    const plan = planRamsesImport(p, topo, p.activeFloorId, opts(defaultSelection(p, topo)));
    const ids = applyPlan(p, plan);
    expect(ids).toHaveLength(4);
    const again = planRamsesImport(p, topo, p.activeFloorId, opts(defaultSelection(p, topo)));
    expect(again.adds).toHaveLength(0);
    expect(again.rows.filter((r) => r.status === 'exists')).toHaveLength(4);
  });

  it('only searches the active floor when allFloors is off', () => {
    const p = projectWithRooms();
    p.activeFloorId = p.floors[1].id; // Attic has no rooms
    const plan = planRamsesImport(p, topo, p.activeFloorId, { ...opts(new Set(['04:056053'])), allFloors: false });
    expect(plan.adds[0].status).toBe('staging');
  });

  it('offsets new markers past ones already inside the room', () => {
    const p = projectWithRooms();
    const c = { x: 250, y: 250 };
    p.floors[0].markers.push(createMarker(c.x - 45, c.y, 'light.x'), createMarker(c.x, c.y, 'light.y'));
    const plan = planRamsesImport(p, topo, p.activeFloorId, opts(new Set(['04:056053'])));
    expect(plan.adds[0].marker!.x).toBe(c.x + markerSpacing(opts(new Set())));
  });
});

describe('seeded project merge', () => {
  it('pairs floors, scales coordinates, skips duplicates and adds missing rooms', () => {
    const target = projectWithRooms();
    target.floors[0].markers.push(createMarker(10, 10, 'climate.01_145038'));
    const seeded = createProject('Seed');
    const sf = seeded.floors[0];
    sf.canvas = { width: 500, height: 300 }; // half size
    sf.markers.push(createMarker(100, 100, 'climate.01_145038'), createMarker(200, 150, 'fan.32_153289'));
    sf.rooms.push(createRoom([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 'Living'));
    sf.rooms.push(createRoom([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 'Utility'));
    const merge = planProjectMerge(target, seeded, target.activeFloorId, { includeRooms: true });
    expect(merge).toHaveLength(1);
    expect(merge[0].skipped).toBe(1);
    expect(merge[0].scaled).toBe(true);
    expect(merge[0].markers[0]).toMatchObject({ x: 400, y: 300, entities: ['fan.32_153289'] });
    expect(merge[0].rooms.map((r) => r.name)).toEqual(['Utility']);
    const ids = applyMerge(target, merge);
    expect(ids).toHaveLength(1);
    expect(target.floors[0].rooms).toHaveLength(3);
  });
});
