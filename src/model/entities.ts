// Shared entity/state types used by BOTH the demo/mock set and the live HA
// connection, so the rest of the app never needs to know which source is active.

export interface HaEntity {
  entity_id: string;
  friendly_name: string;
  domain: string;
  /** mdi icon name without "mdi:" prefix, if known */
  icon?: string;
  area_id?: string;
}

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    unit_of_measurement?: string;
    icon?: string;
  };
}

export interface HaArea {
  area_id: string;
  name: string;
}

export const domainOf = (entityId: string): string =>
  entityId.includes('.') ? entityId.split('.')[0] : '';

const DEVICE_CLASS_ICONS: Record<string, string> = {
  power: 'flash',
  energy: 'lightning-bolt',
  temperature: 'thermometer',
  humidity: 'water-percent',
  pressure: 'gauge',
  battery: 'battery',
  illuminance: 'brightness-5',
  current: 'current-ac',
  voltage: 'sine-wave',
  frequency: 'sine-wave',
  motion: 'motion-sensor',
  door: 'door',
  window: 'window-closed-variant',
  occupancy: 'account',
  presence: 'account',
  moisture: 'water',
  smoke: 'smoke-detector',
  gas: 'gas-cylinder',
  co2: 'molecule-co2',
  opening: 'door',
};

/**
 * Best-guess icon for an entity: its custom HA icon if set, else a device_class
 * default, else a domain default. Mirrors how HA picks entity icons closely.
 */
export function iconForState(domain: string, deviceClass?: string, customIcon?: string): string {
  if (customIcon) return customIcon.replace(/^mdi:/, '');
  if (deviceClass && DEVICE_CLASS_ICONS[deviceClass]) return DEVICE_CLASS_ICONS[deviceClass];
  return iconForDomain(domain);
}

/** A default MDI icon per domain, used when HA gives us nothing. */
export function iconForDomain(domain: string): string {
  switch (domain) {
    case 'light':
      return 'lightbulb';
    case 'switch':
      return 'toggle-switch';
    case 'cover':
      return 'window-shutter';
    case 'sensor':
      return 'gauge';
    case 'binary_sensor':
      return 'motion-sensor';
    case 'climate':
      return 'thermostat';
    case 'fan':
      return 'fan';
    case 'lock':
      return 'lock';
    case 'media_player':
      return 'speaker';
    case 'camera':
      return 'cctv';
    default:
      return 'help-circle';
  }
}
