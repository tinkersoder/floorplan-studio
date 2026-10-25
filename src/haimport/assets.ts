// Fetching what a dashboard card references: the SVG / background image /
// stylesheet / split-out ha-floorplan config. Order of preference:
//   1. a file the user loaded by hand with the same basename (always wins),
//   2. inline data: URIs straight from the YAML,
//   3. HTTP from Home Assistant (`/local/...` is public; `/api/...` gets the token).
import { readCredentials } from '../ha/client';
import { getHass } from '../ha/hassBridge';
import { useStore } from '../state/store';

export interface AssetContext {
  /** HA base URL, e.g. http://homeassistant.local:8123 (null → can't fetch) */
  base: string | null;
  token: string | null;
  /** files the user picked, keyed by lower-case basename */
  files: Map<string, File>;
}

export function liveAssetContext(files: Map<string, File>): AssetContext {
  const { conn, usingDemo } = useStore.getState();
  if (usingDemo || conn.status !== 'connected') return { base: null, token: null, files };
  if (conn.url === 'this dashboard') {
    const a = getHass()?.auth?.data;
    return { base: (a?.hassUrl || location.origin).replace(/\/+$/, ''), token: a?.access_token ?? null, files };
  }
  return { base: conn.url.replace(/\/+$/, ''), token: readCredentials()?.token ?? null, files };
}

export const basename = (ref: string) => decodeURIComponent(ref.split(/[?#]/)[0].split('/').pop() ?? '').toLowerCase();

export function resolveUrl(ref: string, ctx: AssetContext): string | null {
  if (/^(https?:|data:|blob:)/i.test(ref)) return ref;
  if (!ctx.base) return null;
  return ref.startsWith('/') ? ctx.base + ref : `${ctx.base}/${ref}`;
}

function decodeDataUri(uri: string): { mime: string; text: () => string } {
  const comma = uri.indexOf(',');
  const meta = uri.slice(5, comma);
  const body = uri.slice(comma + 1);
  const b64 = /;base64/i.test(meta);
  return {
    mime: meta.split(';')[0] || 'text/plain',
    text: () => {
      if (!b64) return decodeURIComponent(body);
      const bin = atob(body);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    },
  };
}

async function fetchBlob(ref: string, ctx: AssetContext): Promise<Blob> {
  const own = ctx.files.get(basename(ref));
  if (own) return own;
  if (ref.startsWith('data:')) return await (await fetch(ref)).blob();
  const url = resolveUrl(ref, ctx);
  if (!url)
    throw new Error(`Can't download ${ref} without a Home Assistant link — load the file with "Add files…" instead.`);
  const headers: Record<string, string> = {};
  // Only /api needs auth; adding the header to /local would force a CORS preflight.
  if (ctx.token && /\/api\//.test(url)) headers.Authorization = `Bearer ${ctx.token}`;
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch {
    throw new Error(`Couldn't download ${url} (network/CORS). Load the file with "Add files…" instead.`);
  }
  if (!res.ok) throw new Error(`Couldn't download ${url} (HTTP ${res.status}). Load the file with "Add files…" instead.`);
  return await res.blob();
}

export async function loadText(ref: string, ctx: AssetContext): Promise<string> {
  if (ref.startsWith('data:') && !ctx.files.has(basename(ref))) return decodeDataUri(ref).text();
  return await (await fetchBlob(ref, ctx)).text();
}

export async function loadDataUri(ref: string, ctx: AssetContext): Promise<string> {
  if (ref.startsWith('data:') && !ctx.files.has(basename(ref))) return ref;
  const blob = await fetchBlob(ref, ctx);
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Does the ref look like an SVG (ha-floorplan's own test is `includes('.svg')`)? */
export const isSvgRef = (ref: string) => /\.svg|image\/svg\+xml/i.test(ref);

export function svgToDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

export function imageSize(dataUri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1000, h: img.naturalHeight || 750 });
    img.onerror = () => reject(new Error('Background image could not be decoded'));
    img.src = dataUri;
  });
}
