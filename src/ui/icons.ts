// Icon resolution. Any Home Assistant icon name (the full MDI set) resolves via
// mdiFull; CURATED is just a short quick-pick list shown in the picker.
import { mdiPath, helpCirclePath } from './mdiFull';

export const CURATED_ICONS: string[] = [
  'lightbulb',
  'lightbulb-outline',
  'lightbulb-group',
  'led-strip',
  'ceiling-light',
  'floor-lamp',
  'toggle-switch',
  'power-socket-eu',
  'window-shutter',
  'curtains',
  'blinds',
  'garage',
  'gauge',
  'flash',
  'lightning-bolt',
  'thermometer',
  'water-percent',
  'motion-sensor',
  'fan',
  'lock',
  'speaker',
  'television',
  'cctv',
  'printer-3d',
  'stove',
  'fridge',
  'shower',
  'sofa',
  'bed',
  'silverware-fork-knife',
  'door',
  'window-closed-variant',
  'weather-night',
  'power',
];

/** Resolve any icon name (full MDI) to SVG path data; falls back to help-circle. */
export const iconPath = (name?: string): string => mdiPath(name) || helpCirclePath;

// Kept for backward-compat with existing imports.
export const ICON_NAMES = CURATED_ICONS;
