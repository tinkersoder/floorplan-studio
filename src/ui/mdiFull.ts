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
