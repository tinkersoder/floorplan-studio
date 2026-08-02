import yaml from 'js-yaml';
import { Action, Floor, Marker, Project, Room, StateRule } from '../model/schema';
import {
  buildFloorplanSvg,
  cardSvgHref,
  elementId,
  ExportOptions,
  markerBaseClass,
  roomElementId,
} from './svg';

// ha-floorplan evaluates ${...} template interpolation inside service_data
// strings (NOT `return` statements). This expression is true for "on-like"
// states across light/switch/cover/lock/etc.
const ON_TEST =
  '["on","open","home","playing","unlocked","active","heat","cool"].indexOf(entity.state) > -1';

export interface HaFloorplanResult {
  svg: string;
  yaml: string;
}

/** Convert our Action to a ha-floorplan action object/string. */
function toHaAction(a: Action | undefined): unknown {
  if (!a || a.kind === 'none') return undefined;
  switch (a.kind) {
    case 'toggle':
      return 'toggle';
    case 'more-info':
      return 'more-info';
    case 'call-service': {
      let data: unknown = undefined;
      if (a.serviceData) {
        try {
          data = yaml.load(a.serviceData);
        } catch {
          data = a.serviceData;
        }
      }
      return { action: 'call-service', service: a.service, service_data: data };
    }
    case 'navigate':
      return { action: 'navigate', navigation_path: a.navPath };
    case 'url':
      return { action: 'url', url_path: a.url };
  }
}

const call = (service: string, service_data: unknown) => ({
  action: 'call-service',
  service,
  service_data,
});

/** class_set template that keeps the marker's base classes and adds on/off. */
function classSetData(m: Marker, onExpr: string): string {
  const base = markerBaseClass(m);
  const onClass = m.style.pulse ? 'state-on pulse' : 'state-on';
  return `${base} \${(${onExpr}) ? "${onClass}" : "state-off"}`;
}

/** state_action entries for a marker (class_set / style_set / text_set). */
function markerStateActions(m: Marker): unknown[] {
  const actions: unknown[] = [];
  const boolRule = m.stateRules.find((r) => r.mode === 'boolean');
  const numRule = m.stateRules.find((r) => r.mode === 'threshold' || r.mode === 'gradient');
  const strRule = m.stateRules.find((r) => r.mode === 'stringMatch');
  const dom = (m.entities[0] ?? '').split('.')[0];

  if (boolRule) {
    actions.push(call('floorplan.class_set', classSetData(m, ON_TEST)));
  } else if (strRule) {
    actions.push(call('floorplan.class_set', classSetData(m, `entity.state === "${strRule.match}"`)));
  } else if (numRule) {
    actions.push(call('floorplan.style_set', numStyleTemplate(numRule)));
  } else if (['light', 'switch', 'fan', 'cover', 'lock', 'input_boolean'].includes(dom)) {
    // sensible default: colour by on/off
    actions.push(call('floorplan.class_set', classSetData(m, ON_TEST)));
  }

  // Sensor value text (into the __label element)
  const isSensor = (m.entities[0] ?? '').startsWith('sensor.');
  if (m.style.showState || isSensor) {
    actions.push(
      call('floorplan.text_set', {
        element: `${elementId(m)}__label`,
        text:
          '${entity.state}${entity.attributes.unit_of_measurement ? " " + entity.attributes.unit_of_measurement : ""}',
      }),
    );
  }
  return actions;
}

/** ${...} template returning a `fill: ...` style string for numeric rules. */
function numStyleTemplate(r: StateRule): string {
  if (r.mode === 'gradient') {
    const min = r.min ?? 0;
    const max = r.max ?? 100;
    const den = max - min || 1;
    return (
      '${(function(){' +
      `var v=parseFloat(entity.state);` +
      `var t=Math.max(0,Math.min(1,(v-${min})/${den}));` +
      `var a=[${hexRgb(r.minColor ?? '#2563eb')}],b=[${hexRgb(r.maxColor ?? '#dc2626')}];` +
      `return "fill: rgb("+a.map(function(x,i){return Math.round(x+(b[i]-x)*t);}).join(",")+")";` +
      '})()}'
    );
  }
  const cmp = r.compare === '==' ? '===' : r.compare ?? '>=';
  const val = r.value ?? r.threshold ?? 0;
  return `\${(parseFloat(entity.state) ${cmp} ${val}) ? "fill: ${r.color ?? '#ef4444'}" : ""}`;
}

function roomRule(r: Room): unknown | null {
  const el = roomElementId(r.name, r.id);
  const rule = r.stateRules.find((x) => x.entityId);
  if (!rule) {
    // No state colouring on this room. Only emit a rule if the click action can
    // work WITHOUT a bound entity (navigate/url/call-service). A bare
    // more-info/toggle needs an entity, so skip it — the room still renders as a
    // coloured polygon in the SVG, just non-interactive.
    const tapKind = r.actions?.tap?.kind;
    if (tapKind === 'navigate' || tapKind === 'url' || tapKind === 'call-service') {
      const tap = toHaAction(r.actions!.tap);
      if (tap) return { element: el, tap_action: tap };
    }
    return null;
  }
  let styleTpl: string;
  if (rule.mode === 'boolean') {
    styleTpl = `fill: \${(${ON_TEST}) ? "${withA(rule.onColor ?? '#ffc107', 0.5)}" : "${withA(rule.offColor ?? '#6b7280', 0.25)}"}`;
  } else if (rule.mode === 'stringMatch') {
    styleTpl = `\${entity.state === "${rule.match}" ? "fill: ${withA(rule.color ?? '#22c55e', 0.5)}" : ""}`;
  } else {
    styleTpl = numStyleTemplate(rule);
  }
  const out: Record<string, unknown> = {
    entities: [rule.entityId],
    element: el,
    state_action: call('floorplan.style_set', styleTpl),
  };
  const tap = toHaAction(r.actions?.tap);
  if (tap) out.tap_action = tap;
  return out;
}

export function buildHaFloorplan(project: Project, floor: Floor, opts: ExportOptions): HaFloorplanResult {
  const svg = buildFloorplanSvg(project, floor, opts);
  const rules: unknown[] = [];

  for (const m of floor.markers) {
    const entities = m.entities.filter(Boolean);
    if (entities.length === 0) continue;
    const rule: Record<string, unknown> = { entities };
    const id = elementId(m);
    if (id !== entities[0]) rule.element = id;
    const tap = toHaAction(m.actions.tap);
    if (tap) rule.tap_action = tap;
    const hold = toHaAction(m.actions.hold);
    if (hold) rule.hold_action = hold;
    const dbl = toHaAction(m.actions.double);
    if (dbl) rule.double_tap_action = dbl;
    const sa = markerStateActions(m);
    // ha-floorplan accepts a single action object or an array; emit the tidiest.
    if (sa.length === 1) rule.state_action = sa[0];
    else if (sa.length > 1) rule.state_action = sa;
    rules.push(rule);
  }

  for (const r of floor.rooms) {
    const rr = roomRule(r);
    if (rr) rules.push(rr);
  }

  const card = {
    type: 'custom:floorplan-card',
    config: {
      // ha-floorplan loads THIS svg and binds rules to its element ids.
      image: cardSvgHref(opts),
      defaults: { hover_action: 'hover-info', tap_action: 'more-info' },
      rules,
    },
  };

  // lineWidth: -1 keeps ${...} template strings on one line (single-quoted)
  // instead of folded block scalars, so nothing can fold across an expression.
  const body = yaml.dump(card, { lineWidth: -1, noRefs: true });
  const svgFile = `${opts.imageBaseName}.svg`;
  const pngFile = `${opts.imageBaseName}.png`;
  const header =
    `# ha-floorplan card generated by Floorplan Studio\n` +
    `# 1) Download files and copy ${svgFile}${opts.image === 'reference' ? ` and ${pngFile}` : ''} into\n` +
    `#    your HA /config/www/${opts.localDir}/  (served at /local/${opts.localDir}/).\n` +
    (opts.image === 'embed'
      ? `#    (Embed mode: the background PNG is inlined inside the SVG, so it's the only file.)\n`
      : `#    (Reference mode: the SVG points at ${pngFile} beside it.)\n`) +
    `# 2) Add via a dashboard -> Edit -> Add Card -> Manual, then paste this.\n` +
    `# Requires the ha-floorplan card (HACS -> Frontend -> "floorplan").\n`;

  return { svg, yaml: header + body };
}

function hexRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '136,136,136';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
function withA(hex: string, a: number): string {
  return `rgba(${hexRgb(hex)},${a})`;
}
