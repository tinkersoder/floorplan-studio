// Full Material Design Icons set — the same icon library Home Assistant uses,
// so any HA entity icon (mdi:xxx) resolves here. Bundled locally (no CDN).
// This deliberately pulls the whole @mdi/js package so every icon name works.
import * as mdi from '@mdi/js';

const ALL = mdi as unknown as Record<string, string>;

/** "mdi:led-strip" | "led-strip" -> the export const key "mdiLedStrip". */
function keyFor(name: string): string {
  const clean = name.replace(/^mdi:/, '').trim();
  return (
    'mdi' +
    clean
      .split('-')
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')
  );
}

/** Resolve an mdi icon name to its SVG path data, or null if unknown. */
export function mdiPath(name?: string): string | null {
  if (!name) return null;
  const v = ALL[keyFor(name)];
  return typeof v === 'string' && v.startsWith('M') ? v : null;
}

export const helpCirclePath = ALL['mdiHelpCircle'];

/** Does this mdi name exist? (for the icon picker's live validation) */
export const mdiExists = (name: string): boolean => mdiPath(name) !== null;

let byPath: Map<string, string> | null = null;
/** Reverse lookup: SVG path data → mdi icon name (used when importing exported SVGs). */
export function mdiNameForPath(d?: string | null): string | null {
  if (!d) return null;
  if (!byPath) {
    byPath = new Map();
    for (const [k, v] of Object.entries(ALL)) {
      if (!k.startsWith('mdi') || typeof v !== 'string' || byPath.has(v)) continue;
      byPath.set(v, k.slice(3).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
    }
  }
  return byPath.get(d.trim()) ?? null;
}
