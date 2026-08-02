import { nanoid } from 'nanoid';
import {
  Action,
  ActionSet,
  Background,
  Floor,
  LayerId,
  LayerState,
  Marker,
  Project,
  PROJECT_SCHEMA_VERSION,
  Room,
  Wall,
} from './schema';

export const DEFAULT_CANVAS = { width: 1361, height: 768 };

export const noAction = (): Action => ({ kind: 'none' });

export const defaultActions = (): ActionSet => ({
  tap: { kind: 'more-info' },
  hold: noAction(),
  double: noAction(),
});

const layer = (visible = true, locked = false): LayerState => ({ visible, locked });

export function defaultLayers(): Record<LayerId, LayerState> {
  return {
    background: layer(),
    walls: layer(),
    rooms: layer(),
    entities: layer(),
    labels: layer(),
  };
}

export function emptyBackground(): Background {
  return {
    dataUri: null,
    naturalW: DEFAULT_CANVAS.width,
    naturalH: DEFAULT_CANVAS.height,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    locked: false,
  };
}

export function createFloor(name = 'Ground floor'): Floor {
  return {
    id: nanoid(8),
    name,
    canvas: { ...DEFAULT_CANVAS },
    background: emptyBackground(),
    layers: defaultLayers(),
    walls: [],
    openings: [],
    rooms: [],
    markers: [],
  };
}

export function createMarker(x: number, y: number, entityId = ''): Marker {
  return {
    id: nanoid(8),
    x,
    y,
    entities: entityId ? [entityId] : [],
    style: {
      type: 'icon',
      icon: 'lightbulb',
      color: '#ffc107',
      size: 40,
      showState: false,
    },
    stateRules: [],
    actions: { tap: { kind: 'toggle' }, hold: noAction(), double: noAction() },
    visibility: null,
  };
}

export function createRoom(polygon: Room['polygon'], name = 'Room'): Room {
  return {
    id: nanoid(8),
    name,
    polygon,
    fill: '#3b82f6',
    opacity: 0.25,
    stateRules: [],
    // Rooms are decorative by default; a click action only makes sense once the
    // user maps an entity or picks navigate/call-service, so start with none.
    actions: { tap: noAction(), hold: noAction(), double: noAction() },
  };
}

export function createWall(points: Wall['points']): Wall {
  return { id: nanoid(8), points, thickness: 6, color: '#334155' };
}

export function createProject(name = 'Untitled floorplan'): Project {
  const floor = createFloor();
  const now = Date.now();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: nanoid(10),
    name,
    createdAt: now,
    updatedAt: now,
    activeFloorId: floor.id,
    floors: [floor],
    settings: { grid: 20, snapGrid: false, snapAngle: true },
  };
}
