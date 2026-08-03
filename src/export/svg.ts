import { Floor, Marker, Project } from '../model/schema';
import { centroid, polygonPath } from '../canvas/geometry';
import { iconPath } from '../ui/icons';

export interface ExportOptions {
  /** embed = base64 data URI (self-contained); reference = /local path */
  image: 'embed' | 'reference';
  imageBaseName: string; // e.g. "myfloor" -> myfloor.png + myfloor.svg
  localDir: string; // e.g. "floorplan" -> /local/floorplan/...
  /** cache-busting token appended to /local URLs (HA caches /local for 31 days) */
  cacheBust?: string;
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';

/** The svg group id ha-floorplan binds to for a marker. */
export function elementId(m: Marker): string {
  if (m.elementId) return m.elementId;
  if (m.entities.length === 1 && m.entities[0]) return m.entities[0];
  if (m.entities[0]) return m.entities[0];
  return `marker_${m.id}`;
}

export function roomElementId(name: string, id: string): string {
  return `room_${slug(name)}_${id}`;
}

const bust = (opts: ExportOptions) => (opts.cacheBust ? `?v=${opts.cacheBust}` : '');

export function imageHref(floor: Floor, opts: ExportOptions): string {
  if (opts.image === 'embed' && floor.background.dataUri) return floor.background.dataUri;
  return `/local/${opts.localDir}/${opts.imageBaseName}.png${bust(opts)}`;
}

/**
 * The path the ha-floorplan CARD points at via config.image — always the SVG
 * file (ha-floorplan loads it and binds rules to its element ids). Embed mode
 * only controls whether the background PNG is inlined *inside* that SVG or lives
 * beside it as a sidecar file; either way the SVG itself must be served by HA.
 */
export function cardSvgHref(opts: ExportOptions): string {
  return `/local/${opts.localDir}/${opts.imageBaseName}.svg${bust(opts)}`;
}

/**
 * Build the ha-floorplan SVG: background <image>, room <path>s, and one
 * <g id="element" class="zone[ sensor]"> per marker (circle + __label text),
 * matching the structure ha-floorplan expects.
 */
export function buildFloorplanSvg(_project: Project, floor: Floor, opts: ExportOptions): string {
  const W = floor.canvas.width;
  const H = floor.canvas.height;
  const href = imageHref(floor, opts);
  const R = 20;
  const FS = 15;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  );
  lines.push('  <style>');
  lines.push('    .zone { cursor: pointer; -webkit-tap-highlight-color: transparent; }');
  lines.push('    .zone .bg { fill: rgba(18,22,30,0.72); stroke: #fff; stroke-width: 2;');
  lines.push('                transition: fill .25s, stroke .25s; }');
  lines.push('    .zone .icon { fill: var(--mc, #cbd5e1); transition: fill .25s; pointer-events: none; }');
  lines.push(`    .zone text { font-family: sans-serif; font-weight: 600; font-size: ${FS}px;`);
  lines.push('                fill: #fff; text-anchor: middle; pointer-events: none;');
  lines.push('                paint-order: stroke; stroke: rgba(0,0,0,.6); stroke-width: 3px; }');
  lines.push('    /* on / off state (set at runtime by floorplan.class_set) */');
  lines.push('    .state-on  .icon { fill: #ffc107; }');
  lines.push('    .state-on  .bg   { stroke: #ffc107; }');
  lines.push('    .state-off .icon { fill: var(--mc, #64748b); }');
  lines.push('    /* dot markers colour the disc itself */');
  lines.push('    .dot .bg { fill: var(--mc, rgba(120,120,120,0.6)); }');
  lines.push('    .dot.state-on  .bg { fill: rgba(255,193,7,0.95); stroke: #fff; }');
  lines.push('    .dot.state-off .bg { fill: var(--mc, rgba(120,120,120,0.6)); }');
  lines.push('    .sensor .bg { fill: rgba(2,132,199,0.72); }');
  lines.push('    /* press feedback */');
  lines.push('    .zone:active { opacity: .6; }');
  lines.push('    .zone:active .bg { stroke-width: 3.5; }');
  lines.push('    /* pulse (per-marker opt-in, only while on) */');
  lines.push('    @keyframes fp-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }');
  lines.push('    .pulse .icon, .pulse.dot .bg { animation: fp-pulse 1.4s ease-in-out infinite; }');
  lines.push('    /* rooms */');
  lines.push('    .room { stroke: rgba(255,255,255,0.3); stroke-width: 1; transition: fill .3s; }');
  lines.push('    .room.clickable { cursor: pointer; }');
  lines.push('    .room-label { font-family: sans-serif; font-weight: 600; font-size: 16px; fill: #fff;');
  lines.push('                  text-anchor: middle; pointer-events: none;');
  lines.push('                  paint-order: stroke; stroke: rgba(0,0,0,.55); stroke-width: 3px; }');
  lines.push('  </style>');

  if (floor.background.dataUri || opts.image === 'reference') {
    lines.push(
      `  <image href="${href}" xlink:href="${href}" x="0" y="0" width="${W}" height="${H}" />`,
    );
  }

  lines.push('  <g id="overlay">');

  // Rooms first (below markers)
  for (const r of floor.rooms) {
    const id = roomElementId(r.name, r.id);
    const rgba = hexA(r.fill, r.opacity);
    const cls = roomInteractive(r) ? 'room clickable' : 'room';
    lines.push(
      `    <path id="${esc(id)}" class="${cls}" d="${polygonPath(r.polygon)}" style="fill:${rgba}" />`,
    );
    if (r.name) {
      const c = centroid(r.polygon);
      lines.push(
        `    <text id="${esc(id)}__label" class="room-label" x="${round(c.x)}" y="${round(c.y)}">${esc(r.name)}</text>`,
      );
    }
  }

  // Markers
  for (const m of floor.markers) {
    const id = elementId(m);
    lines.push(`    <g id="${esc(id)}" class="${markerBaseClass(m)}" style="--mc:${esc(m.style.color)}">`);
    for (const inner of markerInner(m, R)) lines.push('      ' + inner);
    // Match the studio canvas exactly (WYSIWYG): showState fills at runtime via
    // text_set; a "label" marker derives the entity name when unset; icon/dot/
    // image/svg markers show only an explicit static label (empty otherwise).
    const label = m.style.showState
      ? ''
      : m.style.type === 'label'
        ? m.style.label || shortLabel(m)
        : m.style.label ?? '';
    const st = labelStyle(m);
    lines.push(
      `      <text id="${esc(id)}__label" x="${round(m.x)}" y="${round(m.y + R + FS)}"${st}>${esc(label)}</text>`,
    );
    lines.push('    </g>');
  }

  lines.push('  </g>');
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}

/** Static class list authored on a marker group (class_set reproduces this + state). */
export function markerBaseClass(m: Marker): string {
  const parts = ['zone'];
  if ((m.entities[0] ?? '').startsWith('sensor.')) parts.push('sensor');
  if (m.style.type === 'dot') parts.push('dot');
  return parts.join(' ');
}

/** A room is interactive if it colours by state or has a real click action. */
export function roomInteractive(r: { stateRules: { entityId?: string }[]; actions?: { tap?: { kind: string } } }): boolean {
  if (r.stateRules.some((x) => x.entityId)) return true;
  const k = r.actions?.tap?.kind;
  return k === 'navigate' || k === 'url' || k === 'call-service';
}

/** Inner SVG for a marker's disc + icon/image per style. */
function markerInner(m: Marker, R: number): string[] {
  const cx = round(m.x);
  const cy = round(m.y);
  const out = [`<circle class="bg" cx="${cx}" cy="${cy}" r="${R}" />`];
  if (m.style.type === 'image' && m.style.image) {
    const s = R * 1.6;
    out.push(`<image href="${m.style.image}" x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" />`);
  } else if (m.style.type === 'svg' && m.style.svg) {
    out.push(`<g transform="translate(${cx - R} ${cy - R}) scale(${(R * 2) / 24})">${m.style.svg}</g>`);
  } else if (m.style.type !== 'dot') {
    const path = iconPath(m.style.icon);
    const S = R * 1.3;
    const scale = S / 24;
    out.push(
      `<path class="icon" d="${path}" transform="translate(${round(cx - S / 2)} ${round(cy - S / 2)}) scale(${scale.toFixed(3)})" />`,
    );
  }
  return out;
}

/** Per-marker inline style overriding the shared `.zone text` CSS defaults. */
function labelStyle(m: Marker): string {
  const s = m.style;
  const parts: string[] = [];
  if (s.fontFamily) parts.push(`font-family:${s.fontFamily}`);
  if (s.fontSize != null) parts.push(`font-size:${s.fontSize}px`);
  if (s.fontWeight != null) parts.push(`font-weight:${s.fontWeight}`);
  if (s.fontColor) parts.push(`fill:${s.fontColor}`);
  return parts.length ? ` style="${esc(parts.join(';'))}"` : '';
}

function shortLabel(m: Marker): string {
  if (m.style.label) return m.style.label;
  const e = m.entities[0] ?? '';
  return e.split('.')[1]?.replace(/_/g, ' ') ?? '';
}

const round = (n: number) => Math.round(n);

function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
