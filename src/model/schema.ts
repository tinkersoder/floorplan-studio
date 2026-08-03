// Floorplan Studio data model.
//
// Coordinate model (the linchpin): every geometry value below is stored in
// DOCUMENT coordinates = the floor's canvas pixel space (default 1361x768 to
// match a typical base render). Zoom/pan is a pure viewport transform and
// never mutates these numbers, so what you design maps 1:1 to the SVG export.

export type Point = { x: number; y: number };

export const PROJECT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Actions (shared by markers and rooms)
// ---------------------------------------------------------------------------
export type ActionKind =
  | 'none'
  | 'toggle'
  | 'more-info'
  | 'call-service'
  | 'navigate'
  | 'url';

export interface Action {
  kind: ActionKind;
  /** call-service: "domain.service" e.g. "light.turn_on" */
  service?: string;
  /** call-service: free-form service data (parsed as YAML on export) */
  serviceData?: string;
  /** navigate: dashboard path e.g. "/lovelace/kitchen" */
  navPath?: string;
  /** url: external url */
  url?: string;
  /** call-service / more-info: entity to target (defaults to marker's first) */
  target?: string;
}

export interface ActionSet {
  tap: Action;
  hold: Action;
  double: Action;
}

// ---------------------------------------------------------------------------
// State-driven styling / coloring
// ---------------------------------------------------------------------------
export type StateMode = 'boolean' | 'threshold' | 'gradient' | 'stringMatch';

/** A single rule that maps an entity's state to a visual result. */
export interface StateRule {
  id: string;
  /** entity whose state drives this rule; falls back to the owner's entity */
  entityId?: string;
  mode: StateMode;

  // boolean: on/off style
  onColor?: string;
  offColor?: string;

  // threshold: value >= threshold -> color
  threshold?: number;
  compare?: '>' | '>=' | '<' | '<=' | '==';
  value?: number;
  color?: string;

  // gradient (numeric heatmap): min..max -> minColor..maxColor
  min?: number;
  max?: number;
  minColor?: string;
  maxColor?: string;

  // stringMatch: state === match -> color
  match?: string;

  // optional visual extras applied by markers
  icon?: string;
  animation?: 'none' | 'pulse' | 'blink';
}

// ---------------------------------------------------------------------------
// Markers (entities)
// ---------------------------------------------------------------------------
export type MarkerStyleType = 'icon' | 'dot' | 'label' | 'image' | 'svg';

export interface MarkerStyle {
  type: MarkerStyleType;
  /** MDI icon name e.g. "lightbulb" (no "mdi:" prefix) */
  icon?: string;
  color: string;
  size: number;
  /** label: also show the live state value + unit */
  showState?: boolean;
  /** static text label under the marker */
  label?: string;
  /** label text font family (falls back to sans-serif when unset) */
  fontFamily?: string;
  /** label text size in px (falls back to the built-in default when unset) */
  fontSize?: number;
  /** label text weight 100..900 (falls back to 600 when unset) */
  fontWeight?: number;
  /** label text color (falls back to #fff when unset) */
  fontColor?: string;
  /** image: data URI */
  image?: string;
  /** svg: raw inner SVG markup */
  svg?: string;
  /** pulse the marker while its entity is on (exported as a CSS animation) */
  pulse?: boolean;
}

export interface Marker {
  id: string;
  x: number;
  y: number;
  /** one or more HA entity ids; first is the "primary" */
  entities: string[];
  /** synthetic svg group id override (e.g. "living_lights" for grouped lights) */
  elementId?: string;
  style: MarkerStyle;
  stateRules: StateRule[];
  actions: ActionSet;
  /** conditional visibility: show only when this entity matches */
  visibility?: { entityId: string; state?: string } | null;
}

// ---------------------------------------------------------------------------
// Rooms / zones
// ---------------------------------------------------------------------------
export interface Room {
  id: string;
  name: string;
  polygon: Point[];
  /** optional HA area id mapping */
  areaId?: string;
  fill: string;
  opacity: number;
  stateRules: StateRule[];
  actions: ActionSet;
}

// ---------------------------------------------------------------------------
// Walls / doors / windows
// ---------------------------------------------------------------------------
export interface Wall {
  id: string;
  points: Point[];
  thickness: number;
  color: string;
}

export interface Opening {
  id: string;
  wallId: string;
  /** 0..1 position along the wall's total length */
  t: number;
  width: number;
  kind: 'door' | 'window';
  color: string;
}

// ---------------------------------------------------------------------------
// Layers, floors, project
// ---------------------------------------------------------------------------
export type LayerId = 'background' | 'walls' | 'rooms' | 'entities' | 'labels';

export interface LayerState {
  visible: boolean;
  locked: boolean;
}

export interface Background {
  dataUri: string | null;
  naturalW: number;
  naturalH: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  locked: boolean;
}

export interface Floor {
  id: string;
  name: string;
  canvas: { width: number; height: number };
  background: Background;
  layers: Record<LayerId, LayerState>;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  markers: Marker[];
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeFloorId: string;
  floors: Floor[];
  settings: {
    grid: number;
    snapGrid: boolean;
    snapAngle: boolean;
  };
}

export const LAYER_ORDER: LayerId[] = [
  'background',
  'walls',
  'rooms',
  'entities',
  'labels',
];

export const LAYER_LABELS: Record<LayerId, string> = {
  background: 'Background',
  walls: 'Walls',
  rooms: 'Rooms',
  entities: 'Entities',
  labels: 'Labels',
};
