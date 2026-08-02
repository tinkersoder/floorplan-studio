import { describe, expect, it } from 'vitest';
import { createMarker, createProject } from '../model/defaults';
import { buildHaFloorplan } from './haFloorplan';
import { activeFloor } from '../state/store';
import { ExportOptions } from './svg';

// Golden test: a project modelled on the user's real Herbwood layout must
// produce ha-floorplan SVG + YAML matching the structure that drops straight
// into a dashboard (see herbwood_floorplan.svg / herbwood_floorplan_card.yaml).

const opts: ExportOptions = { image: 'reference', imageBaseName: 'herbwood', localDir: 'floorplan' };

function herbwoodProject() {
  const p = createProject('Herbwood');
  const floor = activeFloor(p);
  floor.canvas = { width: 1361, height: 768 };

  const bedroom = createMarker(240, 175, 'light.kutuvalo');
  bedroom.style.label = 'Bedroom';
  bedroom.stateRules = [{ id: 'r1', mode: 'boolean', onColor: '#ffc107', offColor: '#6b7280' }];

  const living = createMarker(760, 425, 'light.matrix');
  living.entities = ['light.matrix', 'light.hypeled'];
  living.elementId = 'living_lights';
  living.style.label = 'Living';
  living.stateRules = [{ id: 'r2', mode: 'boolean', onColor: '#ffc107', offColor: '#6b7280' }];

  const temp = createMarker(620, 320, 'sensor.humidity_and_temp_sensor_temperature');
  temp.style.label = 'temp';
  temp.style.showState = true;
  temp.actions.tap = { kind: 'more-info' };

  floor.markers = [bedroom, living, temp];
  return { p, floor };
}

describe('buildHaFloorplan', () => {
  const { p, floor } = herbwoodProject();
  const { svg, yaml } = buildHaFloorplan(p, floor, opts);

  it('emits an SVG with correct viewBox and referenced image', () => {
    expect(svg).toContain('viewBox="0 0 1361 768"');
    expect(svg).toContain('/local/floorplan/herbwood.png');
    expect(svg).toContain('<g id="overlay">');
  });

  it('emits one named group per marker with a __label text node', () => {
    // group carries a per-marker --mc colour var after the class attribute
    expect(svg).toContain('<g id="light.kutuvalo" class="zone" style="--mc:');
    expect(svg).toContain('id="light.kutuvalo__label"');
    // grouped lights use the synthetic element id
    expect(svg).toContain('<g id="living_lights" class="zone" style="--mc:');
    // sensor gets the sensor class
    expect(svg).toContain('<g id="sensor.humidity_and_temp_sensor_temperature" class="zone sensor" style="--mc:');
  });

  it('emits the ha-floorplan card with class_set + text_set rules', () => {
    expect(yaml).toContain('type: custom:floorplan-card');
    // the CARD image points at the SVG (ha-floorplan loads & binds to it)…
    expect(yaml).toContain('image: /local/floorplan/herbwood.svg');
    // …while the SVG itself references the background PNG internally
    expect(svg).toContain('/local/floorplan/herbwood.png');
    expect(yaml).toContain('service: floorplan.class_set');
    expect(yaml).toContain('service: floorplan.text_set');
    // grouped-light rule binds two entities to the living_lights element
    expect(yaml).toContain('element: living_lights');
    expect(yaml).toMatch(/light\.matrix[\s\S]*light\.hypeled/);
  });

  it('uses ${...} interpolation, not return statements (ha-floorplan syntax)', () => {
    expect(yaml).toContain('${');
    expect(yaml).toContain('action: call-service');
    expect(yaml).not.toContain("return 'state-on'");
    expect(yaml).not.toMatch(/text:\s*\|/); // no literal JS block scalars
  });

  it('renders the marker icon path into the SVG', () => {
    expect(svg).toContain('class="icon"');
    expect(svg).toContain('class="bg"');
  });

  it('gives the sensor a more-info tap action and a value label', () => {
    expect(yaml).toContain('sensor.humidity_and_temp_sensor_temperature__label');
    expect(yaml).toContain('unit_of_measurement');
  });
});
