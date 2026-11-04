// Turn a live ha-floorplan SVG + its rules into a Studio floor.
//
// The SVG is mounted off-screen so the browser does the geometry (getBBox +
// screen CTMs handle every transform, <use>, nested <svg>…). Each element a
// rule binds becomes a marker at its visual centre — or a room when it is a
// sizeable closed shape; `area.<slug>` (Ramses Extras / ha-floorplan
// convention) and `room_*` (Floorplan Studio export) ids become rooms even when
// unbound. What's left of the drawing becomes the floor background, with
// converted elements stripped so nothing is drawn twice.
import { nanoid } from 'nanoid';
import { createFloor, createMarker, createRoom } from '../model/defaults';
import type { HaEntity, HaState } from '../model/entities';
import type { Floor, Marker, Point, Room } from '../model/schema';
import { resolveEntityIcon } from '../model/haIcons';
import { mdiNameForPath } from '../ui/mdiFull';
import type { Binding, FloorplanSpec, PictureSpec } from './cards';
import { AssetContext, imageSize, loadDataUri, loadText, svgToDataUri } from './assets';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

/** Ramses Extras' shipped icon keys → mdi names (its FLOORPLAN_ICON_MDI). */
const EXTRAS_ICON_MDI: Record<string, string> = {
  fan: 'fan',
  radiator: 'radiator',
  valve: 'valve',
  'water-boiler': 'water-boiler',
  thermostat: 'thermostat',
  thermometer: 'thermometer',
  remote: 'remote',
  gateway: 'router-wireless',
  fire: 'fire',
  'window-open': 'window-open-variant',
  battery: 'battery',
  co2: 'molecule-co2',
  gauge: 'gauge',
  'pipe-valve': 'pipe-valve',
  tablet: 'tablet',
  help: 'help-circle',
};

const SHAPES = new Set(['rect', 'polygon', 'polyline', 'path', 'ellipse', 'circle']);
const ROOM_ID = /^(area\.|room_)/;

export interface ImportContext {
  floorName: string;
  /** remove converted elements from the background drawing */
  stripBound: boolean;
  /** park bindings whose element isn't in the SVG in a row along the bottom */
  stageUnresolved: boolean;
  entities: HaEntity[];
  states: Record<string, HaState>;
  assets: AssetContext;
}

export interface ImportResult {
  floor: Floor;
  markers: number;
  rooms: number;
  staged: string[];
  unresolved: string[];
  warnings: string[];
  background: 'image' | 'svg' | 'none';
}

// ---------------------------------------------------------------------------

function parseSvg(text: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('The floorplan image is not valid SVG: ' + (err.textContent ?? '').split('\n')[0]);
  const root = doc.documentElement;
  if (root.localName !== 'svg') throw new Error('The floorplan image is not an SVG document');
  return root as unknown as SVGSVGElement;
}

const num = (v: string | null) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : null;
};

function viewBoxOf(root: SVGSVGElement): { x: number; y: number; w: number; h: number } | null {
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const w = num(root.getAttribute('width'));
  const h = num(root.getAttribute('height'));
  return w && h ? { x: 0, y: 0, w, h } : null;
}

const byId = (root: Element, id: string) => root.querySelector(`[id="${CSS.escape(id)}"]`);

/** Mount off-screen, sized so 1 viewport px == 1 viewBox unit. */
function mount(text: string) {
  const parsed = parseSvg(text);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-200000px;top:0;visibility:hidden;pointer-events:none;';
  const svg = document.importNode(parsed, true) as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  let vb = viewBoxOf(svg);
  if (!vb) {
    const b = svg.getBBox();
    vb = { x: b.x, y: b.y, w: Math.max(1, b.width + b.x), h: Math.max(1, b.height + b.y) };
    svg.setAttribute('viewBox', `0 0 ${vb.w} ${vb.h}`);
    vb = { x: 0, y: 0, w: vb.w, h: vb.h };
  }
  svg.setAttribute('width', String(vb.w));
  svg.setAttribute('height', String(vb.h));
  svg.setAttribute('preserveAspectRatio', 'none');
  const rootInv = svg.getScreenCTM()?.inverse();
  // element user space → canvas (viewBox-relative) coordinates
  const toCanvas = (el: SVGGraphicsElement) => {
    const m = el.getScreenCTM();
    const full = rootInv && m ? rootInv.multiply(m) : null;
    return (x: number, y: number): Point => {
      // full maps into the root's user space (viewBox units) — shift to canvas origin.
      if (!full) return { x: x - vb!.x, y: y - vb!.y };
      return { x: full.a * x + full.c * y + full.e - vb!.x, y: full.b * x + full.d * y + full.f - vb!.y };
    };
  };
  return { svg, vb, toCanvas, unmount: () => host.remove() };
}

function bboxOnCanvas(el: SVGGraphicsElement, tf: (x: number, y: number) => Point) {
  let b: DOMRect;
  try {
    b = el.getBBox();
  } catch {
    return null;
  }
  const pts = [tf(b.x, b.y), tf(b.x + b.width, b.y), tf(b.x + b.width, b.y + b.height), tf(b.x, b.y + b.height)];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The visual "pin" of a marker group, ignoring captions: Studio's disc
 * (circle.bg), Ramses Extras' icon <use>, else the union of non-text shapes.
 */
function markerAnchor(el: SVGGraphicsElement, toCanvas: (e: SVGGraphicsElement) => (x: number, y: number) => Point) {
  const pin = (el.querySelector('circle.bg') ?? el.querySelector('use')) as SVGGraphicsElement | null;
  if (pin) return bboxOnCanvas(pin, toCanvas(pin));
  if (el.localName !== 'g' && el.localName !== 'a') return null;
  const parts = [...el.querySelectorAll(VISIBLE)].filter((e) => e.localName !== 'text' && !e.closest('text,defs,symbol'));
  const boxes = parts
    .map((p) => bboxOnCanvas(p as SVGGraphicsElement, toCanvas(p as SVGGraphicsElement)))
    .filter((b): b is NonNullable<typeof b> => !!b && (b.w > 0 || b.h > 0));
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

/** Outline of a shape as canvas points (rects/polygons exact, curves sampled). */
function outline(el: Element, tf: (x: number, y: number) => Point, box: { x: number; y: number; w: number; h: number }): Point[] {
  const tag = el.localName;
  let pts: Point[] = [];
  if (tag === 'rect') {
    const x = num(el.getAttribute('x')) ?? 0;
    const y = num(el.getAttribute('y')) ?? 0;
    const w = num(el.getAttribute('width')) ?? 0;
    const h = num(el.getAttribute('height')) ?? 0;
    pts = [tf(x, y), tf(x + w, y), tf(x + w, y + h), tf(x, y + h)];
  } else if (tag === 'polygon' || tag === 'polyline') {
    const n = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    for (let i = 0; i + 1 < n.length; i += 2) pts.push(tf(n[i], n[i + 1]));
  } else if (tag === 'path' && (pts = straightPath(el.getAttribute('d') ?? '').map((p) => tf(p.x, p.y))).length >= 3) {
    // straight-edged path: exact vertices
  } else if (SHAPES.has(tag)) {
    pts = [];
    const g = el as SVGGeometryElement;
    const len = g.getTotalLength?.() ?? 0;
    const steps = Math.min(160, Math.max(24, Math.round(len / 8)));
    for (let i = 0; i < steps; i++) {
      const p = g.getPointAtLength((len * i) / steps);
      pts.push(tf(p.x, p.y));
    }
  }
  if (pts.length < 3) {
    pts = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ];
  }
  return simplify(pts);
}

/** Vertices of a path made only of M/L/H/V/Z (first subpath); [] if it has curves. */
export function straightPath(d: string): Point[] {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  if (toks.some((t) => /[a-zA-Z]/.test(t) && !/[MmLlHhVvZz]/.test(t))) return [];
  const pts: Point[] = [];
  let cmd = '';
  let x = 0;
  let y = 0;
  let i = 0;
  const next = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) {
      cmd = toks[i++];
      if (cmd === 'Z' || cmd === 'z') break;
      if ((cmd === 'M' || cmd === 'm') && pts.length) break; // first subpath only
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L': {
        const nx = next();
        const ny = next();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        if (cmd === 'M') cmd = 'L';
        if (cmd === 'm') cmd = 'l';
        break;
      }
      case 'H':
        x = rel ? x + next() : next();
        break;
      case 'V':
        y = rel ? y + next() : next();
        break;
      default:
        return [];
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    pts.push({ x, y });
  }
  return pts;
}

/** Drop near-duplicate and collinear points; round to 0.1. */
function simplify(pts: Point[]): Point[] {
  const r = pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  const out: Point[] = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1.5) out.push(p);
  }
  if (out.length > 3 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1.5) out.pop();
  const keep: Point[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length];
    const b = out[i];
    const c = out[(i + 1) % out.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 0.5 * Math.hypot(c.x - a.x, c.y - a.y) || out.length <= 4) keep.push(b);
  }
  return keep.length >= 3 ? keep : out;
}

/** The geometry element that represents a room (itself, or a group's single/largest shape). */
function roomShape(el: Element): Element | null {
  if (SHAPES.has(el.localName)) return el;
  if (el.localName === 'g' || el.localName === 'a') {
    const shapes = [...el.querySelectorAll('rect,polygon,path,ellipse')].filter((s) => !s.closest('text,defs,symbol'));
    if (shapes.length === 1) return shapes[0];
  }
  return null;
}

const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

function friendly(entityId: string, ctx: ImportContext) {
  return ctx.entities.find((e) => e.entity_id === entityId)?.friendly_name ?? entityId.split('.')[1]?.replace(/_/g, ' ') ?? entityId;
}

function iconFor(el: Element, entity: string, ctx: ImportContext): string {
  const studio = mdiNameForPath(el.querySelector('path.icon')?.getAttribute('d'));
  if (studio) return studio;
  const use = el.querySelector('use');
  const href = use?.getAttribute('href') ?? use?.getAttributeNS(XLINK, 'href') ?? '';
  const m = /#icon\.([\w-]+)/.exec(href);
  if (m && EXTRAS_ICON_MDI[m[1]]) return EXTRAS_ICON_MDI[m[1]];
  const reg = ctx.entities.find((e) => e.entity_id === entity)?.icon;
  return resolveEntityIcon(entity, ctx.states[entity], reg);
}

function colorFor(el: Element): string {
  const mc = (el as SVGElement).style?.getPropertyValue('--mc')?.trim();
  if (mc && /^#[0-9a-f]{6}$/i.test(mc)) return mc;
  const fill = el.getAttribute('fill');
  if (fill && /^#[0-9a-f]{6}$/i.test(fill)) return fill;
  return '#ffc107';
}

function labelFor(svg: Element, el: Element): string | undefined {
  const studio = byId(svg, `${el.id}__label`)?.textContent?.trim();
  if (studio) return studio;
  const extras = el.querySelector('.rx-name')?.textContent?.trim();
  return extras || undefined;
}

// ---------------------------------------------------------------------------

export async function importFloorplanSvg(svgText: string, spec: FloorplanSpec, ctx: ImportContext): Promise<ImportResult> {
  const warnings: string[] = [];
  const unresolved: string[] = [];
  const staged: string[] = [];
  const { svg, vb, toCanvas, unmount } = mount(svgText);
  const floor = createFloor(ctx.floorName);
  floor.canvas = { width: Math.round(vb.w), height: Math.round(vb.h) };
  const area = vb.w * vb.h;
  const converted = new Set<string>();
  const roomIds = new Set<string>();

  try {
    const addRoom = (el: Element, binding: Binding | null) => {
      const shape = roomShape(el) ?? el;
      const box = bboxOnCanvas(shape as SVGGraphicsElement, toCanvas(shape as SVGGraphicsElement));
      if (!box) return false;
      const id = el.id;
      const areaSlug = id.startsWith('area.') ? id.slice(5) : undefined;
      const studioName = id.startsWith('room_') ? byId(svg, `${id}__label`)?.textContent?.trim() : undefined;
      const name = studioName || (areaSlug ? titleCase(areaSlug) : binding ? friendly(binding.entities[0], ctx) : titleCase(id));
      const room: Room = createRoom(outline(shape, toCanvas(shape as SVGGraphicsElement), box), name);
      if (areaSlug) room.areaId = areaSlug;
      const fill = (shape as SVGElement).style?.fill || shape.getAttribute('fill') || '';
      const rgba = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(fill);
      if (rgba) {
        room.fill = '#' + [rgba[1], rgba[2], rgba[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('');
        if (rgba[4]) room.opacity = Math.max(0.05, Math.min(1, +rgba[4]));
      } else if (/^#[0-9a-f]{6}$/i.test(fill)) room.fill = fill;
      if (binding) {
        room.stateRules = binding.rules.length
          ? binding.rules.map((r) => ({ ...r, id: nanoid(6), entityId: r.entityId ?? binding.entities[0] }))
          : [{ id: nanoid(6), entityId: binding.entities[0], mode: 'boolean', onColor: '#ffc107', offColor: room.fill }];
        room.actions = binding.actions;
      }
      floor.rooms.push(room);
      converted.add(id);
      roomIds.add(id);
      return true;
    };

    // 1) Rule-bound elements → markers / rooms
    for (const b of spec.bindings) {
      // Action-only elements (Ramses Extras toolbar, buttons) have no entity to show.
      if (!b.entities.length) continue;
      const el = byId(svg, b.elementId) as SVGGraphicsElement | null;
      if (!el || el === (svg as Element)) {
        unresolved.push(b.elementId);
        continue;
      }
      const tf = toCanvas(el);
      const box = bboxOnCanvas(el, tf);
      if (!box || (box.w === 0 && box.h === 0)) {
        unresolved.push(b.elementId);
        continue;
      }
      const frac = (box.w * box.h) / area;
      if (frac > 0.6) {
        warnings.push(`${b.elementId} covers most of the drawing — left in the background, not imported.`);
        continue;
      }
      const shape = roomShape(el);
      if (ROOM_ID.test(b.elementId) || (shape && shape.localName !== 'circle' && frac >= 0.015)) {
        if (addRoom(el, b)) continue;
      }
      const studioDot = el.classList.contains('dot');
      const anchor = markerAnchor(el, toCanvas) ?? box;
      const m: Marker = createMarker(anchor.x + anchor.w / 2, anchor.y + anchor.h / 2, b.entities[0]);
      m.entities = [...b.entities];
      if (b.elementId !== b.entities[0]) m.elementId = b.elementId;
      m.x = Math.round(m.x * 10) / 10;
      m.y = Math.round(m.y * 10) / 10;
      m.style = {
        type: studioDot ? 'dot' : 'icon',
        icon: iconFor(el, b.entities[0], ctx),
        color: colorFor(el),
        size: Math.round(Math.max(16, Math.min(64, Math.min(anchor.w, anchor.h) || 32))),
        showState: b.showState || b.entities[0].startsWith('sensor.'),
      };
      const label = labelFor(svg, el);
      if (label && !m.style.showState) m.style.label = label;
      m.stateRules = b.rules.map((r) => ({ ...r, id: nanoid(6) }));
      m.actions = b.actions;
      floor.markers.push(m);
      converted.add(b.elementId);
    }

    // 2) Unbound area.* / room_* shapes → rooms (Ramses Extras uses area.<ha_area_id>)
    for (const el of svg.querySelectorAll('[id^="area."], [id^="room_"]')) {
      if (converted.has(el.id) || el.id.endsWith('__label') || el.closest('defs,symbol')) continue;
      if (!roomShape(el)) continue;
      addRoom(el, null);
    }

    // 3) Bindings with no element: optional staging row
    if (ctx.stageUnresolved && unresolved.length) {
      const pitch = 72;
      const cols = Math.max(1, Math.floor((floor.canvas.width - 72) / pitch) + 1);
      unresolved.forEach((elId, k) => {
        const b = spec.bindings.find((x) => x.elementId === elId)!;
        if (!b.entities[0]) return;
        const m = createMarker(36 + (k % cols) * pitch, floor.canvas.height - 36 - Math.floor(k / cols) * pitch, b.entities[0]);
        m.entities = [...b.entities];
        m.style.icon = resolveEntityIcon(b.entities[0], ctx.states[b.entities[0]], ctx.entities.find((e) => e.entity_id === b.entities[0])?.icon);
        m.style.size = 32;
        m.style.showState = b.showState || b.entities[0].startsWith('sensor.');
        m.stateRules = b.rules.map((r) => ({ ...r, id: nanoid(6) }));
        m.actions = b.actions;
        floor.markers.push(m);
        staged.push(elId);
      });
    }
  } finally {
    unmount();
  }

  // 4) Background = the drawing minus what we converted.
  const bg = parseSvg(svgText);
  if (ctx.stripBound) {
    for (const id of converted) {
      byId(bg, id)?.remove();
      byId(bg, `${id}__label`)?.remove();
    }
    byId(bg, 'floorplan.toolbar')?.remove();
  }
  if (spec.stylesheet) {
    try {
      const css = await loadText(spec.stylesheet, ctx.assets);
      const style = bg.ownerDocument.createElementNS(SVG_NS, 'style');
      style.textContent = css;
      bg.insertBefore(style, bg.firstChild);
    } catch (e) {
      warnings.push(`Stylesheet not loaded (${(e as Error).message}) — background may look plainer than on the dashboard.`);
    }
  }
  // An SVG drawn as a background <image> can't load anything external: inline it.
  for (const img of [...bg.querySelectorAll('image')]) {
    const href = img.getAttribute('href') ?? img.getAttributeNS(XLINK, 'href') ?? '';
    if (!href || href.startsWith('data:')) continue;
    try {
      const data = await loadDataUri(href, ctx.assets);
      img.setAttribute('href', data);
      img.removeAttributeNS(XLINK, 'href');
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }

  floor.background = { ...floor.background, naturalW: floor.canvas.width, naturalH: floor.canvas.height };
  let background: ImportResult['background'] = 'none';
  const single = soleFullImage(bg, vb);
  if (single) {
    floor.background.dataUri = single;
    background = 'image';
  } else if (hasVisibleContent(bg)) {
    // Normalise the viewBox origin so the background lines up with canvas (0,0).
    bg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    bg.setAttribute('width', String(vb.w));
    bg.setAttribute('height', String(vb.h));
    floor.background.dataUri = svgToDataUri(new XMLSerializer().serializeToString(bg));
    background = 'svg';
  }

  return {
    floor,
    markers: floor.markers.length,
    rooms: floor.rooms.length,
    staged,
    unresolved: unresolved.filter((u) => !staged.includes(u)),
    warnings,
    background,
  };
}

const VISIBLE = 'image,path,rect,circle,ellipse,line,polyline,polygon,use,text,foreignObject';

function visibleLeaves(root: Element): Element[] {
  return [...root.querySelectorAll(VISIBLE)].filter(
    (e) => !e.closest('defs,symbol,clipPath,mask,pattern,marker,style,title') && (e.localName !== 'text' || e.textContent?.trim()),
  );
}
const hasVisibleContent = (root: Element) => visibleLeaves(root).length > 0;

/** If all that's left is one <image> filling the viewBox, return its data URI. */
function soleFullImage(root: Element, vb: { x: number; y: number; w: number; h: number }): string | null {
  const leaves = visibleLeaves(root);
  if (leaves.length !== 1 || leaves[0].localName !== 'image') return null;
  const img = leaves[0];
  if (img.closest('[transform]')) return null;
  const x = num(img.getAttribute('x')) ?? 0;
  const y = num(img.getAttribute('y')) ?? 0;
  const w = num(img.getAttribute('width'));
  const h = num(img.getAttribute('height'));
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  const href = img.getAttribute('href') ?? img.getAttributeNS(XLINK, 'href') ?? '';
  if (!href.startsWith('data:') || !near(x, vb.x) || !near(y, vb.y) || !w || !h || !near(w, vb.w) || !near(h, vb.h)) return null;
  return href;
}

// ---------------------------------------------------------------------------
// picture-elements
// ---------------------------------------------------------------------------

export async function importPictureElements(spec: PictureSpec, ctx: ImportContext): Promise<ImportResult> {
  if (!spec.image) throw new Error('This picture-elements card has no image to use as background.');
  const dataUri = await loadDataUri(spec.image, ctx.assets);
  const { w, h } = await imageSize(dataUri);
  const floor = createFloor(ctx.floorName);
  floor.canvas = { width: w, height: h };
  floor.background = { ...floor.background, dataUri, naturalW: w, naturalH: h };
  for (const it of spec.items) {
    const x = it.unit === '%' ? it.left * w : it.left;
    const y = it.unit === '%' ? it.top * h : it.top;
    const m = createMarker(Math.round(x * 10) / 10, Math.round(y * 10) / 10, it.entity);
    const reg = ctx.entities.find((e) => e.entity_id === it.entity)?.icon;
    m.style = {
      type: it.type === 'label' ? 'label' : 'icon',
      icon: it.icon || resolveEntityIcon(it.entity, ctx.states[it.entity], reg),
      color: '#ffc107',
      size: 36,
      showState: it.type === 'label',
    };
    m.actions = it.actions;
    m.visibility = it.visibility ?? null;
    floor.markers.push(m);
  }
  return {
    floor,
    markers: floor.markers.length,
    rooms: 0,
    staged: [],
    unresolved: [],
    warnings: spec.skipped ? [`${spec.skipped} element(s) without an entity or position were skipped.`] : [],
    background: 'image',
  };
}
