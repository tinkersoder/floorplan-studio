import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { createMarker, createProject, createRoom } from '../model/defaults';
import { buildHaFloorplan } from '../export/haFloorplan';
import { buildPictureElements } from '../export/pictureElements';
import {
  cardsFromText,
  findCards,
  fromHaAction,
  imageRef,
  parseFloorplanCard,
  parsePictureElements,
  pictureImageRef,
  replaceCardAtIndex,
} from './cards';

const dashboard = {
  title: 'Home',
  views: [
    {
      title: 'Overview',
      sections: [
        {
          type: 'grid',
          cards: [
            { type: 'tile', entity: 'light.x' },
            {
              type: 'vertical-stack',
              cards: [
                {
                  type: 'custom:floorplan-card',
                  config: {
                    image: '/local/ramses_extras/floorplan/generated/ramses-elements.svg',
                    stylesheet: '/local/ramses_extras/features/floorplan_helper/ramses-floorplan.css',
                    defaults: { tap_action: 'more-info' },
                    rules: [
                      { entity: 'climate.01_145038_02', element: 'zone_living', tap_action: false },
                      { entities: ['fan.32_153289', { entity: 'sensor.32_153289_co2_level', element: 'co2_badge' }] },
                      { entities: ['sensor.32_153289_fan_rate'], element: 'fan.32_153289', state_action: { service: 'floorplan.text_set', service_data: '${entity.state}' } },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'Garden',
      path: 'garden',
      cards: [{ type: 'conditional', conditions: [], card: { type: 'picture-elements', image: '/local/garden.png', elements: [] } }],
    },
  ],
};

describe('card discovery', () => {
  it('finds floorplan + picture-elements cards in sections, stacks and conditional cards', () => {
    const found = findCards(dashboard, 'Home');
    expect(found.map((f) => [f.kind, f.where])).toEqual([
      ['floorplan', 'Home › Overview'],
      ['picture-elements', 'Home › Garden'],
    ]);
  });

  it('replaces a discovered card in-place by its discovery index', () => {
    const clone = structuredClone(dashboard);
    const ok0 = replaceCardAtIndex(clone, 0, { type: 'custom:floorplan-card', config: { image: '/local/new.svg', rules: [] } });
    expect(ok0).toBe(true);
    expect(findCards(clone, 'Home')[0].card).toEqual({
      type: 'custom:floorplan-card',
      config: { image: '/local/new.svg', rules: [] },
    });

    const ok1 = replaceCardAtIndex(clone, 1, { type: 'picture-elements', image: '/local/new.png', elements: [] });
    expect(ok1).toBe(true);
    expect(findCards(clone, 'Home')[1].card).toEqual({
      type: 'picture-elements',
      image: '/local/new.png',
      elements: [],
    });
  });

  it('accepts pasted single cards, lists and bare ha-floorplan config bodies', () => {
    expect(cardsFromText('type: picture-elements\nimage: /local/a.png\nelements: []')).toHaveLength(1);
    expect(cardsFromText(yaml.dump([{ type: 'picture-elements', image: 'x' }, { type: 'custom:floorplan-card', config: {} }]))).toHaveLength(2);
    const bare = cardsFromText('image: /local/floor.svg\nrules:\n  - entity: light.a\n');
    expect(bare[0].kind).toBe('floorplan');
    expect(parseFloorplanCard(bare[0].card).bindings[0].elementId).toBe('light.a');
    expect(() => cardsFromText('a: [b')).toThrow(/YAML/);
  });
});

describe('ha-floorplan rules', () => {
  it('maps entities to elements (explicit element, per-entity element, default id) and merges duplicates', () => {
    const spec = parseFloorplanCard(findCards(dashboard, 'Home')[0].card);
    expect(spec.image).toContain('ramses-elements.svg');
    expect(spec.stylesheet).toContain('ramses-floorplan.css');
    const by = Object.fromEntries(spec.bindings.map((b) => [b.elementId, b]));
    expect(by.zone_living.entities).toEqual(['climate.01_145038_02']);
    expect(by.zone_living.actions.tap.kind).toBe('more-info'); // false → default
    expect(by.co2_badge.entities).toEqual(['sensor.32_153289_co2_level']);
    expect(by['fan.32_153289'].entities).toEqual(['fan.32_153289', 'sensor.32_153289_fan_rate']);
    expect(by['fan.32_153289'].showState).toBe(true);
  });

  it('round-trips a Floorplan Studio export (ids, actions, state rules)', () => {
    const p = createProject('RT');
    const f = p.floors[0];
    const lamp = createMarker(100, 120, 'light.kitchen');
    lamp.stateRules = [{ id: 'r', mode: 'boolean', onColor: '#ffc107' }];
    const temp = createMarker(300, 200, 'sensor.temp');
    temp.actions.tap = { kind: 'more-info' };
    temp.stateRules = [{ id: 'g', mode: 'gradient', min: 15, max: 30, minColor: '#2563eb', maxColor: '#dc2626' }];
    const nav = createMarker(50, 50, 'switch.a');
    nav.actions.tap = { kind: 'navigate', navPath: '/lovelace/x' };
    nav.actions.hold = { kind: 'call-service', service: 'light.turn_on', serviceData: 'brightness: 10' };
    f.markers.push(lamp, temp, nav);
    const room = createRoom([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], 'Kitchen');
    room.stateRules = [{ id: 'x', entityId: 'light.kitchen', mode: 'boolean', onColor: '#ff0000', offColor: '#000000' }];
    f.rooms.push(room);

    const { yaml: out } = buildHaFloorplan(p, f, { image: 'embed', imageBaseName: 'rt', localDir: 'floorplan', svgDelivery: 'inline' });
    const [found] = cardsFromText(out);
    const spec = parseFloorplanCard(found.card);
    expect(spec.image?.startsWith('data:image/svg+xml')).toBe(true);
    const by = Object.fromEntries(spec.bindings.map((b) => [b.elementId, b]));
    expect(by['light.kitchen'].actions.tap.kind).toBe('toggle');
    expect(by['light.kitchen'].rules[0].mode).toBe('boolean');
    expect(by['sensor.temp'].rules[0]).toMatchObject({ mode: 'gradient', min: 15, max: 30, minColor: '#2563eb', maxColor: '#dc2626' });
    expect(by['sensor.temp'].showState).toBe(true);
    expect(by['switch.a'].actions.tap).toEqual({ kind: 'navigate', navPath: '/lovelace/x' });
    expect(by['switch.a'].actions.hold).toMatchObject({ kind: 'call-service', service: 'light.turn_on', serviceData: 'brightness: 10' });
    const roomBinding = spec.bindings.find((b) => b.elementId.startsWith('room_kitchen_'))!;
    expect(roomBinding.rules[0]).toMatchObject({ mode: 'boolean', onColor: '#ff0000', offColor: '#000000' });
  });

  it('understands action variants', () => {
    expect(fromHaAction({ action: 'perform-action', perform_action: 'fan.turn_on', data: { percentage: 50 } })).toMatchObject({
      kind: 'call-service',
      service: 'fan.turn_on',
      serviceData: 'percentage: 50',
    });
    expect(fromHaAction({ service: 'floorplan.class_toggle' })).toBeNull();
    expect(fromHaAction([{ action: 'url', url_path: 'https://x' }])).toEqual({ kind: 'url', url: 'https://x' });
    expect(imageRef({ sizes: [{ min_width: 0, location: '/local/m.svg' }] })).toBe('/local/m.svg');
  });

  it('flags a split-out config file', () => {
    expect(parseFloorplanCard({ type: 'custom:floorplan-card', config: '/local/floorplan/config.yaml' }).configRef).toBe(
      '/local/floorplan/config.yaml',
    );
  });
});

describe('picture-elements', () => {
  it('reads positioned entity elements, conditional visibility and uploaded images', () => {
    const spec = parsePictureElements({
      type: 'picture-elements',
      image: '/local/plan.png',
      elements: [
        { type: 'state-icon', entity: 'light.a', icon: 'mdi:lamp', style: { left: '25%', top: '50%' }, tap_action: { action: 'toggle' } },
        { type: 'state-label', entity: 'sensor.t', style: { left: '120px', top: '40px' } },
        { type: 'conditional', conditions: [{ entity: 'alarm.x', state: 'armed' }], elements: [{ type: 'state-badge', entity: 'binary_sensor.door', style: { left: '10%', top: '10%' } }] },
        { type: 'icon', icon: 'mdi:home', style: { left: '1%', top: '1%' } },
      ],
    });
    expect(spec.items).toHaveLength(3);
    expect(spec.items[0]).toMatchObject({ entity: 'light.a', left: 0.25, top: 0.5, unit: '%', icon: 'lamp', type: 'icon' });
    expect(spec.items[0].actions.tap.kind).toBe('toggle');
    expect(spec.items[1]).toMatchObject({ unit: 'px', left: 120, type: 'label' });
    expect(spec.items[2].visibility).toEqual({ entityId: 'alarm.x', state: 'armed' });
    expect(spec.skipped).toBe(1);
    expect(pictureImageRef({ image: { media_content_id: 'media-source://image_upload/abc123/original' } })).toBe('/api/image/serve/abc123/original');
  });

  it('round-trips a Floorplan Studio picture-elements export', () => {
    const p = createProject('PE');
    const f = p.floors[0];
    f.markers.push(createMarker(f.canvas.width / 2, f.canvas.height / 4, 'light.z'));
    const { yaml: out } = buildPictureElements(p, f, { image: 'reference', imageBaseName: 'pe', localDir: 'floorplan' });
    const spec = parsePictureElements(cardsFromText(out)[0].card);
    expect(spec.image).toBe('/local/floorplan/pe.png');
    expect(spec.items[0]).toMatchObject({ entity: 'light.z', left: 0.5, top: 0.25, unit: '%' });
  });
});
