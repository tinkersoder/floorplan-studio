// Import side of the Home Assistant round trip: find floorplan-ish cards in
// Lovelace configs and turn their YAML into a neutral description that the SVG
// analyser / picture-elements importer can place on a Studio floor.
//
// Pure (no DOM, no network) so it is unit-tested; geometry lives in svgImport.ts.
import yaml from 'js-yaml';
import type { Action, ActionSet, StateRule } from '../model/schema';

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export type CardKind = 'floorplan' | 'picture-elements';

export interface FoundCard {
  key: string;
  kind: CardKind;
  /** "Dashboard › View" breadcrumb, or "Pasted YAML" */
  where: string;
  /** the card object itself (type + config / image + elements) */
  card: Loose;
  /** dashboard url_path (null = default Overview dashboard) when scanned live */
  urlPath?: string | null;
  /** 0-based index among floorplan/picture-elements cards in that dashboard */
  cardIndex?: number;
  /** dashboard mode ('storage' is writable via lovelace/config/save; 'yaml' is read-only) */
  dashboardMode?: string;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export function cardKind(card: unknown): CardKind | null {
  if (!isObj(card)) return null;
  const t = String(card.type ?? '');
  if (t === 'custom:floorplan-card' || t === 'custom:ha-floorplan' || t === 'custom:floorplan') return 'floorplan';
  if (t === 'picture-elements') return 'picture-elements';
  // A bare ha-floorplan `config:` body (image + rules) pasted without the wrapper.
  if (!t && (card.rules || card.image) && (Array.isArray(card.rules) || isObj(card.image) || typeof card.image === 'string') && !card.elements)
    return 'floorplan';
  return null;
}

/**
 * Walk any Lovelace structure (dashboard → views → sections/cards, stacks,
 * conditional `card:`, grids…) and collect floorplan / picture-elements cards.
 */
export function findCards(root: unknown, dashboardTitle: string): FoundCard[] {
  const out: FoundCard[] = [];
  const seen = new Set<unknown>();
  function walk(node: unknown, crumbs: string[]) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, crumbs));
      return;
    }
    const o = node as Loose;
    const kind = cardKind(o);
    if (kind) {
      out.push({
        key: `${dashboardTitle}#${out.length}`,
        kind,
        where: crumbs.filter(Boolean).join(' › ') || dashboardTitle,
        card: o.type ? o : { type: 'custom:floorplan-card', config: o },
      });
      return; // don't descend into a found card
    }
    const isView = Array.isArray(o.cards) || Array.isArray(o.sections) || Array.isArray(o.badges);
    const label = isView ? str(o.title) ?? str(o.path) ?? '' : '';
    for (const k of ['views', 'sections', 'cards', 'card', 'elements']) if (k in o) walk(o[k], label ? [...crumbs, label] : crumbs);
  }
  walk(root, [dashboardTitle]);
  return out;
}

/**
 * Replace the `targetIndex`-th floorplan / picture-elements card inside a cloned
 * Lovelace dashboard config (walking in the exact same order as `findCards`).
 * Returns true if the card was found and replaced.
 */
export function replaceCardAtIndex(root: unknown, targetIndex: number, replacement: Loose): boolean {
  let seenCount = 0;
  const visited = new Set<unknown>();

  function walk(node: unknown): boolean {
    if (!node || typeof node !== 'object' || visited.has(node)) return false;
    visited.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        if (isObj(item) && cardKind(item)) {
          if (seenCount === targetIndex) {
            node[i] = replacement;
            return true;
          }
          seenCount++;
          continue;
        }
        if (walk(item)) return true;
      }
      return false;
    }
    const o = node as Loose;
    for (const k of ['views', 'sections', 'cards', 'card', 'elements']) {
      if (!(k in o)) continue;
      const child = o[k];
      if (!Array.isArray(child) && isObj(child) && cardKind(child)) {
        if (seenCount === targetIndex) {
          o[k] = replacement;
          return true;
        }
        seenCount++;
        continue;
      }
      if (walk(child)) return true;
    }
    return false;
  }

  return walk(root);
}

/** Cards from pasted YAML/JSON: a single card, a list, a view or a full dashboard. */
export function cardsFromText(text: string): FoundCard[] {
  let data: unknown;
  try {
    data = yaml.load(text);
  } catch (e) {
    throw new Error(`Not valid YAML: ${(e as Error).message.split('\n')[0]}`);
  }
  return findCards(data, 'Pasted YAML');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const none = (): Action => ({ kind: 'none' });

/** ha-floorplan / Lovelace action (string, object or list) → Studio Action. */
export function fromHaAction(v: unknown): Action | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? fromHaAction(v[0]) : null;
  if (typeof v === 'string') {
    if (v === 'toggle') return { kind: 'toggle' };
    if (v === 'more-info') return { kind: 'more-info' };
    if (v === 'none') return none();
    return null;
  }
  if (!isObj(v)) return null;
  const action = str(v.action) ?? (v.service || v.perform_action ? 'call-service' : null);
  switch (action) {
    case 'toggle':
      return { kind: 'toggle' };
    case 'more-info':
      return { kind: 'more-info' };
    case 'none':
      return none();
    case 'navigate':
      return { kind: 'navigate', navPath: str(v.navigation_path) ?? '' };
    case 'url':
      return { kind: 'url', url: str(v.url_path) ?? '' };
    case 'call-service':
    case 'perform-action': {
      const service = str(v.perform_action) ?? str(v.service) ?? '';
      // floorplan.* services only make sense inside ha-floorplan itself.
      if (!service || service.startsWith('floorplan.')) return null;
      const data = v.service_data ?? v.data;
      return {
        kind: 'call-service',
        service,
        serviceData: data == null ? undefined : yaml.dump(data, { lineWidth: -1 }).trim(),
      };
    }
    default:
      return null;
  }
}

export function actionSet(tap: unknown, hold: unknown, dbl: unknown, fallbackTap: Action | null): ActionSet {
  return {
    tap: fromHaAction(tap) ?? fallbackTap ?? { kind: 'more-info' },
    hold: fromHaAction(hold) ?? none(),
    double: fromHaAction(dbl) ?? none(),
  };
}

// ---------------------------------------------------------------------------
// ha-floorplan rules → element bindings
// ---------------------------------------------------------------------------

export interface Binding {
  /** SVG element id the rule targets */
  elementId: string;
  entities: string[];
  actions: ActionSet;
  rules: StateRule[];
  showState: boolean;
}

export interface FloorplanSpec {
  image: string | null;
  stylesheet: string | null;
  bindings: Binding[];
  /** ha-floorplan `config:` given as a path to a separate YAML file */
  configRef: string | null;
}

/** ha-floorplan image: string | {location, sizes:[{location}]} → first usable location. */
export function imageRef(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (!isObj(v)) return null;
  if (str(v.location)) return v.location as string;
  if (Array.isArray(v.sizes)) for (const s of v.sizes) if (isObj(s) && str(s.location)) return s.location as string;
  return null;
}

const entityOf = (e: unknown): { entity: string; element?: string } | null => {
  if (typeof e === 'string') return e.includes('.') ? { entity: e } : null;
  if (isObj(e) && str(e.entity)) return { entity: e.entity as string, element: str(e.element) ?? undefined };
  return null;
};

let ruleSeq = 0;
const rid = () => `imp${(++ruleSeq).toString(36)}`;

/**
 * Reverse Floorplan Studio's own state_action templates back into StateRules,
 * so a Studio export → HA → Studio round trip keeps its colouring. Anything
 * else (hand-written or Ramses Extras' rx-* class rules) is left to the user.
 */
export function rulesFromStateAction(sa: unknown): { rules: StateRule[]; showState: boolean } {
  const list = Array.isArray(sa) ? sa : sa ? [sa] : [];
  const rules: StateRule[] = [];
  let showState = false;
  for (const a of list) {
    if (!isObj(a)) continue;
    const service = str(a.service) ?? str(a.perform_action) ?? str(a.action) ?? '';
    const data = a.service_data ?? a.data;
    const text = typeof data === 'string' ? data : isObj(data) ? String(data.class ?? data.style ?? data.text ?? '') : '';
    if (service === 'floorplan.text_set') {
      showState = true;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = text.match(/fill: \$\{\(\["on".*?\.indexOf\(entity\.state\) > -1\) \? "(rgba?\([^"]+\)|#[0-9a-f]{6})" : "(rgba?\([^"]+\)|#[0-9a-f]{6})"\}/i)))
      rules.push({ id: rid(), mode: 'boolean', onColor: toHex(m[1]), offColor: toHex(m[2]) });
    else if (/\["on","open".*indexOf\(entity\.state\)/.test(text)) rules.push({ id: rid(), mode: 'boolean', onColor: '#ffc107' });
    else if ((m = text.match(/entity\.state === "([^"]*)" \? "fill: (rgba?\([^"]+\)|#[0-9a-f]{6})"/i)))
      rules.push({ id: rid(), mode: 'stringMatch', match: m[1], color: toHex(m[2]) });
    else if ((m = text.match(/entity\.state === "([^"]*)"\)/))) rules.push({ id: rid(), mode: 'stringMatch', match: m[1], color: '#ffc107' });
    else if ((m = text.match(/\(v-(-?[\d.]+)\)\/(-?[\d.]+)\)\).*a=\[(\d+),(\d+),(\d+)\],b=\[(\d+),(\d+),(\d+)\]/))) {
      const min = parseFloat(m[1]);
      rules.push({
        id: rid(),
        mode: 'gradient',
        min,
        max: min + parseFloat(m[2]),
        minColor: rgbHex(+m[3], +m[4], +m[5]),
        maxColor: rgbHex(+m[6], +m[7], +m[8]),
      });
    } else if ((m = text.match(/parseFloat\(entity\.state\) (>=|<=|===|>|<) (-?[\d.]+)\) \? "fill: (#[0-9a-f]{6})"/i)))
      rules.push({ id: rid(), mode: 'threshold', compare: (m[1] === '===' ? '==' : m[1]) as StateRule['compare'], value: parseFloat(m[2]), color: m[3] });
  }
  return { rules, showState };
}

/** Parse an ha-floorplan card (or its bare config) into image + bindings. */
export function parseFloorplanCard(card: Loose): FloorplanSpec {
  const cfgRaw = card.config ?? card;
  if (typeof cfgRaw === 'string') return { image: null, stylesheet: null, bindings: [], configRef: cfgRaw };
  const cfg = isObj(cfgRaw) ? cfgRaw : {};
  const defaults = isObj(cfg.defaults) ? cfg.defaults : {};
  const defTap = fromHaAction(defaults.tap_action);
  const byElement = new Map<string, Binding>();

  for (const rule of Array.isArray(cfg.rules) ? cfg.rules : []) {
    if (!isObj(rule)) continue;
    const ents = [
      ...(rule.entity ? [rule.entity] : []),
      ...(Array.isArray(rule.entities) ? rule.entities : []),
    ]
      .map(entityOf)
      .filter((x): x is { entity: string; element?: string } => !!x);
    const elements = [
      ...(str(rule.element) ? [rule.element as string] : []),
      ...(Array.isArray(rule.elements) ? (rule.elements as unknown[]).filter((x): x is string => typeof x === 'string') : []),
    ];
    const { rules, showState } = rulesFromStateAction(rule.state_action);
    const acts = actionSet(rule.tap_action, rule.hold_action, rule.double_tap_action, defTap);

    // Which element(s) this rule binds: explicit element(s) for all entities,
    // else each entity binds the element with its own id (ha-floorplan default).
    const targets: { el: string; entities: string[] }[] = [];
    if (elements.length) for (const el of elements) targets.push({ el, entities: ents.map((e) => e.entity) });
    else for (const e of ents) targets.push({ el: e.element ?? e.entity, entities: [e.entity] });

    for (const t of targets) {
      const b = byElement.get(t.el);
      if (b) {
        for (const e of t.entities) if (!b.entities.includes(e)) b.entities.push(e);
        b.rules.push(...rules.map((r) => ({ ...r, id: rid() })));
        b.showState ||= showState;
        if (b.actions.tap.kind === 'more-info' && acts.tap.kind !== 'more-info') b.actions = acts;
      } else {
        byElement.set(t.el, { elementId: t.el, entities: [...t.entities], actions: acts, rules: [...rules], showState });
      }
    }
  }

  return {
    image: imageRef(cfg.image) ?? imageRef(cfg.image_mobile),
    stylesheet: typeof cfg.stylesheet === 'string' ? cfg.stylesheet : Array.isArray(cfg.stylesheets) ? str(cfg.stylesheets[0]) : null,
    bindings: [...byElement.values()],
    configRef: null,
  };
}

// ---------------------------------------------------------------------------
// picture-elements
// ---------------------------------------------------------------------------

export interface PictureItem {
  entity: string;
  /** 0..1 of image width/height when given in %, else px */
  left: number;
  top: number;
  unit: '%' | 'px';
  type: 'icon' | 'label';
  icon?: string;
  actions: ActionSet;
  visibility?: { entityId: string; state?: string } | null;
}

export interface PictureSpec {
  image: string | null;
  items: PictureItem[];
  skipped: number;
}

function parsePos(v: unknown): { n: number; unit: '%' | 'px' } | null {
  if (typeof v === 'number') return { n: v, unit: 'px' };
  const m = /^\s*(-?[\d.]+)\s*(%|px)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  return m[2] === '%' ? { n: parseFloat(m[1]) / 100, unit: '%' } : { n: parseFloat(m[1]), unit: 'px' };
}

export function pictureImageRef(card: Loose): string | null {
  const img = card.image ?? card.dark_mode_image;
  if (typeof img === 'string') return img || null;
  if (isObj(img)) {
    // Uploaded images: media-source://image_upload/<id>  →  /api/image/serve/<id>/original
    const id = str(img.media_content_id);
    const up = id && /^media-source:\/\/image_upload\/([^/]+)/.exec(id);
    if (up) return `/api/image/serve/${up[1]}/original`;
    return str(img.location) ?? str(img.url) ?? id;
  }
  return str(card.camera_image) ? null : null;
}

export function parsePictureElements(card: Loose): PictureSpec {
  const items: PictureItem[] = [];
  let skipped = 0;
  function walk(elements: unknown, visibility: PictureItem['visibility']) {
    for (const el of Array.isArray(elements) ? elements : []) {
      if (!isObj(el)) continue;
      if (el.type === 'conditional') {
        const c = Array.isArray(el.conditions) ? el.conditions.find((x) => isObj(x) && str((x as Loose).entity)) : null;
        const vis = isObj(c) ? { entityId: c.entity as string, state: str(c.state) ?? undefined } : visibility;
        walk(el.elements, vis);
        continue;
      }
      const entity = str(el.entity);
      const style = isObj(el.style) ? el.style : {};
      const left = parsePos(style.left);
      const top = parsePos(style.top);
      if (!entity || !left || !top) {
        skipped++;
        continue;
      }
      items.push({
        entity,
        left: left.n,
        top: top.n,
        unit: left.unit === '%' && top.unit === '%' ? '%' : 'px',
        type: el.type === 'state-label' ? 'label' : 'icon',
        icon: str(el.icon)?.replace(/^mdi:/, ''),
        actions: actionSet(el.tap_action, el.hold_action, el.double_tap_action, { kind: 'more-info' }),
        visibility: visibility ?? null,
      });
    }
  }
  walk(card.elements, null);
  return { image: pictureImageRef(card), items, skipped };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const rgbHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');

/** "rgba(1,2,3,0.5)" | "rgb(1,2,3)" | "#aabbcc" → "#aabbcc" */
export function toHex(c: string): string {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  return m ? rgbHex(+m[1], +m[2], +m[3]) : c;
}

export function cardSummary(c: FoundCard): string {
  if (c.kind === 'floorplan') {
    const spec = parseFloorplanCard(c.card);
    if (spec.configRef) return `ha-floorplan · config ${spec.configRef}`;
    return `ha-floorplan · ${spec.bindings.length} bound elements · ${shortRef(spec.image)}`;
  }
  const spec = parsePictureElements(c.card);
  return `picture-elements · ${spec.items.length} entities · ${shortRef(spec.image)}`;
}

export function shortRef(ref: string | null): string {
  if (!ref) return 'no image';
  if (ref.startsWith('data:')) return `inline ${ref.slice(5, ref.indexOf(';'))}`;
  return ref.length > 60 ? '…' + ref.slice(-58) : ref;
}
