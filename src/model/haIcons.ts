import { HaState } from './entities';
import { isOn } from '../state/resolve';

// A faithful-enough port of Home Assistant's frontend icon resolution: custom
// icon > device_class (+ state) > domain default. Returns an mdi name WITHOUT
// the "mdi:" prefix. Unknown names degrade to help-circle via iconPath().

const DOMAIN_ICONS: Record<string, string> = {
  air_quality: 'air-filter',
  alert: 'alert',
  automation: 'robot',
  calendar: 'calendar',
  camera: 'video',
  climate: 'thermostat',
  configurator: 'cog',
  conversation: 'microphone-message',
  counter: 'counter',
  date: 'calendar',
  datetime: 'calendar-clock',
  fan: 'fan',
  group: 'google-circles-communities',
  humidifier: 'air-humidifier',
  image_processing: 'image-filter-frames',
  input_button: 'gesture-tap-button',
  input_datetime: 'calendar-clock',
  input_number: 'ray-vertex',
  input_select: 'format-list-bulleted',
  input_text: 'form-textbox',
  light: 'lightbulb',
  mailbox: 'mailbox',
  notify: 'comment-alert',
  number: 'ray-vertex',
  persistent_notification: 'bell',
  plant: 'flower',
  proximity: 'apple-safari',
  remote: 'remote',
  scene: 'palette',
  script: 'script-text',
  select: 'format-list-bulleted',
  siren: 'bullhorn',
  text: 'form-textbox',
  time: 'clock',
  timer: 'timer',
  tts: 'speaker-message',
  update: 'package-up',
  vacuum: 'robot-vacuum',
  weather: 'weather-partly-cloudy',
  zone: 'map-marker-radius',
};

const SENSOR_DC: Record<string, string> = {
  apparent_power: 'flash',
  aqi: 'air-filter',
  battery: 'battery',
  carbon_dioxide: 'molecule-co2',
  carbon_monoxide: 'molecule-co',
  current: 'current-ac',
  data_rate: 'transmission-tower',
  data_size: 'database',
  distance: 'arrow-left-right',
  duration: 'progress-clock',
  energy: 'lightning-bolt',
  frequency: 'sine-wave',
  gas: 'meter-gas',
  humidity: 'water-percent',
  illuminance: 'brightness-5',
  moisture: 'water-percent',
  monetary: 'cash',
  power: 'flash',
  power_factor: 'angle-acute',
  precipitation: 'weather-rainy',
  pressure: 'gauge',
  reactive_power: 'flash',
  signal_strength: 'wifi',
  sound_pressure: 'ear-hearing',
  speed: 'speedometer',
  temperature: 'thermometer',
  timestamp: 'clock',
  voltage: 'sine-wave',
  volume: 'gauge',
  water: 'water',
  weight: 'weight',
  wind_speed: 'weather-windy',
};

// [on, off]
const BINARY_DC: Record<string, [string, string]> = {
  battery: ['battery-outline', 'battery'],
  battery_charging: ['battery-charging', 'battery'],
  carbon_monoxide: ['smoke-detector-alert', 'smoke-detector'],
  cold: ['snowflake', 'thermometer'],
  connectivity: ['check-network-outline', 'close-network-outline'],
  door: ['door-open', 'door'],
  garage_door: ['garage-open', 'garage'],
  gas: ['alert-circle', 'check-circle'],
  heat: ['fire', 'thermometer'],
  light: ['brightness-7', 'brightness-5'],
  lock: ['lock-open', 'lock'],
  moisture: ['water', 'water-off'],
  motion: ['motion-sensor', 'motion-sensor-off'],
  moving: ['octagon', 'octagon-outline'],
  occupancy: ['home', 'home-outline'],
  opening: ['square-outline', 'square'],
  plug: ['power-plug', 'power-plug-off'],
  power: ['power-plug', 'power-plug-off'],
  presence: ['home', 'home-outline'],
  problem: ['alert-circle', 'check-circle'],
  running: ['play', 'stop'],
  safety: ['alert-circle', 'check-circle'],
  smoke: ['smoke-detector-alert', 'smoke-detector'],
  sound: ['music-note', 'music-note-off'],
  tamper: ['alert-circle', 'check-circle'],
  update: ['package-up', 'package'],
  vibration: ['vibrate', 'crop-portrait'],
  window: ['window-open', 'window-closed'],
};

// [open, closed]
const COVER_DC: Record<string, [string, string]> = {
  awning: ['awning-outline', 'awning-outline'],
  blind: ['blinds-open', 'blinds'],
  curtain: ['curtains', 'curtains-closed'],
  damper: ['circle', 'circle-slice-8'],
  door: ['door-open', 'door-closed'],
  garage: ['garage-open', 'garage'],
  gate: ['gate-open', 'gate'],
  shade: ['blinds-open', 'blinds'],
  shutter: ['window-shutter-open', 'window-shutter'],
  window: ['window-open', 'window-closed'],
};

function batteryIcon(s?: string): string {
  const v = parseFloat(s ?? '');
  if (Number.isNaN(v)) return 'battery-unknown';
  const r = Math.round(v / 10) * 10;
  if (r >= 100) return 'battery';
  if (r <= 0) return 'battery-alert';
  return `battery-${r}`;
}

/**
 * The icon Home Assistant would show for this entity, as an mdi name.
 * Precedence mirrors HA: entity-registry override (user-set in the UI) >
 * live `attributes.icon` (set by the integration, e.g. WLED) > device_class /
 * domain default.
 */
export function resolveEntityIcon(entityId: string, state?: HaState, registryIcon?: string): string {
  if (typeof registryIcon === 'string' && registryIcon) return registryIcon.replace(/^mdi:/, '');
  const custom = state?.attributes?.icon;
  if (typeof custom === 'string' && custom) return custom.replace(/^mdi:/, '');

  const domain = entityId.split('.')[0];
  const s = state?.state;
  const dc = state?.attributes?.device_class as string | undefined;
  const on = isOn(s);

  switch (domain) {
    case 'binary_sensor':
      if (dc && BINARY_DC[dc]) return BINARY_DC[dc][on ? 0 : 1];
      return on ? 'checkbox-marked-circle' : 'radiobox-blank';
    case 'sensor':
      if (dc === 'battery') return batteryIcon(s);
      if (dc && SENSOR_DC[dc]) return SENSOR_DC[dc];
      return Number.isNaN(parseFloat(s ?? '')) ? 'eye' : 'gauge';
    case 'cover': {
      const closed = s === 'closed';
      if (dc && COVER_DC[dc]) return COVER_DC[dc][closed ? 1 : 0];
      return closed ? 'window-closed' : 'window-open';
    }
    case 'lock':
      return s === 'unlocked' ? 'lock-open' : s === 'jammed' ? 'lock-alert' : 'lock';
    case 'switch':
      if (dc === 'outlet') return on ? 'power-plug' : 'power-plug-off';
      return on ? 'toggle-switch-variant' : 'toggle-switch-variant-off';
    case 'person':
    case 'device_tracker':
      return s === 'home' ? 'home' : 'account-arrow-right';
    case 'sun':
      return s === 'above_horizon' ? 'white-balance-sunny' : 'weather-night';
    case 'media_player':
      return s === 'playing' ? 'play' : s === 'paused' ? 'pause' : s === 'off' ? 'speaker-off' : 'speaker';
    case 'alarm_control_panel':
      return s === 'disarmed'
        ? 'shield-off'
        : s === 'triggered'
          ? 'bell-ring'
          : s?.startsWith('armed')
            ? 'shield-home'
            : 'shield';
    case 'input_boolean':
      return on ? 'check-circle-outline' : 'close-circle-outline';
    default:
      return DOMAIN_ICONS[domain] ?? 'help-circle';
  }
}
