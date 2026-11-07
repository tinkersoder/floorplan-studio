// Plugin registry — the in-editor side of `floorplanStudio.registerPlugin`.
//
// Stores normalised manifests and exposes per-slot getters the UI consumes.
// Everything is namespaced by plugin id; registering the same id again
// replaces it (that's how an external provider supersedes a built-in one).

import type { MarkerStyle } from '../model/schema';
import { emitPluginsChanged } from './events';
import {
  PLUGIN_API_VERSION,
  PluginAction,
  PluginManifest,
  PluginProvides,
  StateRulePreset,
  DeviceSourceProvider,
  RoomSourceProvider,
} from './types';

interface RegisteredPlugin {
  manifest: PluginManifest;
  provides: PluginProvides;
}

const plugins = new Map<string, RegisteredPlugin>();
const listeners = new Set<() => void>();

// ---------------------------------------------------------------------------
// Stylesheet injection
// ---------------------------------------------------------------------------

// In HACS card mode the app lives in a shadow root — document.head styles
// never reach it. The entry point calls this with the mount node; standalone
// builds leave it unset and we inject into document.head. Existing links are
// re-attached when the root changes (providers register before the card mounts).
let styleRoot: HTMLElement | Document | null = null;
const cssLinks = new Map<string, HTMLLinkElement>();
export function setPluginStyleRoot(el: HTMLElement | Document | null): void {
  styleRoot = el;
  const root = getStyleRoot();
  for (const link of cssLinks.values()) root.appendChild(link);
}
function getStyleRoot(): HTMLElement | Document {
  return styleRoot ?? document;
}

function injectCss(url: string): void {
  if (!url || cssLinks.has(url)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.setAttribute('data-fp-plugin-css', '');
  cssLinks.set(url, link);
  getStyleRoot().appendChild(link);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerPlugin(manifest: PluginManifest): void {
  if (!manifest || typeof manifest.id !== 'string' || !manifest.id) {
    console.warn('[floorplan-studio] registerPlugin: manifest.id required', manifest);
    return;
  }
  const apiVersion = manifest.apiVersion ?? PLUGIN_API_VERSION;
  if (apiVersion > PLUGIN_API_VERSION) {
    console.warn(
      `[floorplan-studio] plugin "${manifest.id}" targets apiVersion ${apiVersion}` +
        ` > supported ${PLUGIN_API_VERSION} — unknown provides keys are ignored`,
    );
  }
  plugins.set(manifest.id, { manifest, provides: manifest.provides ?? {} });
  for (const css of manifest.provides?.css ? [manifest.provides.css] : []) injectCss(css);
  notify();
}

export function unregisterPlugin(id: string): void {
  if (plugins.delete(id)) notify();
}

export function getPlugins(): PluginManifest[] {
  return [...plugins.values()].map((p) => p.manifest);
}

function notify(): void {
  emitPluginsChanged({ plugins: [...plugins.keys()] });
  for (const l of listeners) l();
}

/** UI subscription: re-render when the plugin set changes. */
export function subscribePlugins(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Capability getters (flattened across plugins)
// ---------------------------------------------------------------------------

/** All device sources; duplicate source ids: last registered plugin wins. */
export function getDeviceSources(): { pluginId: string; source: DeviceSourceProvider }[] {
  const byId = new Map<string, { pluginId: string; source: DeviceSourceProvider }>();
  for (const [pluginId, p] of plugins)
    for (const s of p.provides.deviceSources ?? []) byId.set(s.id, { pluginId, source: s });
  return [...byId.values()];
}

/**
 * Map of HA integration domain -> registered DeviceSourceProvider that covers it
 * (from `coversIntegrations`, falling back to matching `pluginId` or `source.id`).
 */
export function getCoveredIntegrations(): Map<string, { pluginId: string; source: DeviceSourceProvider }> {
  const out = new Map<string, { pluginId: string; source: DeviceSourceProvider }>();
  for (const entry of getDeviceSources()) {
    if (entry.pluginId === 'ha-devices') continue;
    const domains = entry.source.coversIntegrations?.length
      ? entry.source.coversIntegrations
      : [entry.pluginId, entry.source.id];
    for (const d of domains) if (d) out.set(d.toLowerCase(), entry);
  }
  return out;
}

/** All room-geometry sources; duplicate source ids: last registered plugin wins. */
export function getRoomSources(): { pluginId: string; source: RoomSourceProvider }[] {
  const byId = new Map<string, { pluginId: string; source: RoomSourceProvider }>();
  for (const [pluginId, p] of plugins)
    for (const s of p.provides.roomSources ?? []) byId.set(s.id, { pluginId, source: s });
  return [...byId.values()];
}

export function getActions(location?: PluginAction['location']): { pluginId: string; action: PluginAction }[] {
  const out: { pluginId: string; action: PluginAction }[] = [];
  for (const [pluginId, p] of plugins)
    for (const a of p.provides.actions ?? [])
      if (location === undefined || (a.location ?? 'toolbar') === location) out.push({ pluginId, action: a });
  return out;
}

/** class token → mdi icon, merged across plugins (last registered wins). */
export function getIconMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of plugins.values()) Object.assign(out, p.provides.iconMap);
  return out;
}

/** marker style defaults, merged across plugins (last registered wins). */
export function getMarkerDefaults(): Partial<MarkerStyle> {
  const out: Partial<MarkerStyle> = {};
  for (const p of plugins.values()) Object.assign(out, p.provides.markerDefaults);
  return out;
}

export function getStateRulePresets(): { pluginId: string; preset: StateRulePreset }[] {
  const out: { pluginId: string; preset: StateRulePreset }[] = [];
  for (const [pluginId, p] of plugins)
    for (const preset of p.provides.stateRulePresets ?? []) out.push({ pluginId, preset });
  return out;
}
