// `window.floorplanStudio` — the public API surface integrations call.
//
// Installed once by installPluginApi() (idempotent; called from both the
// standalone and the HACS card entry points). Everything a plugin needs is
// here: register a manifest, call the active HA WebSocket, read/write the
// project store, and merge an incoming project — the last replaces the
// direct IndexedDB pokes integrations had to do before this API existed.

import { liveWsCaller } from '../ha/wsCaller';
import { deleteProject, listProjects, loadProject, saveProject } from '../persist/db';
import { useStore } from '../state/store';
import type { Project } from '../model/schema';
import { applyMerge, planProjectMerge } from '../import/plan';
import { emitProjectImported } from './events';
import {
  getActions,
  getDeviceSources,
  getIconMap,
  getMarkerDefaults,
  getPlugins,
  getStateRulePresets,
  registerPlugin,
  subscribePlugins,
  unregisterPlugin,
} from './registry';
import {
  EVENT_ACTION,
  EVENT_PLUGINS_CHANGED,
  EVENT_PROJECT_IMPORTED,
  PLUGIN_API_VERSION,
  PluginManifest,
  WsCall,
} from './types';

export interface ImportResult {
  mode: 'merge' | 'replace';
  /** new marker ids (merge mode) or total markers (replace mode) */
  markers: number;
  rooms: number;
  markerIds: string[];
}

function isProject(v: unknown): v is Project {
  return !!v && typeof v === 'object' && Array.isArray((v as { floors?: unknown }).floors);
}

/**
 * Merge a studio project (or project fragment: `{floors:[…]}`) into the open
 * project in one undo step, or replace the open project entirely.
 * Accepts a Project object or a JSON string.
 */
function importProject(
  incoming: Project | string,
  opts: { mode?: 'merge' | 'replace'; includeRooms?: boolean; floorId?: string } = {},
): ImportResult {
  const project: unknown = typeof incoming === 'string' ? JSON.parse(incoming) : incoming;
  if (!isProject(project)) throw new Error('importProject: not a studio project (no "floors" list)');

  const st = useStore.getState();
  const mode = opts.mode ?? 'merge';

  if (mode === 'replace') {
    st.loadProject(project);
    const rooms = project.floors.reduce((n, f) => n + f.rooms.length, 0);
    const markers = project.floors.reduce((n, f) => n + f.markers.length, 0);
    emitProjectImported({ mode, markers, rooms });
    return { mode, markers, rooms, markerIds: [] };
  }

  const floorId = opts.floorId ?? st.project.activeFloorId;
  const merge = planProjectMerge(st.project, project, floorId, { includeRooms: opts.includeRooms ?? true });
  let markerIds: string[] = [];
  st.commit((p) => {
    markerIds = applyMerge(p, merge);
  });
  const rooms = merge.reduce((n, m) => n + m.rooms.length, 0);
  emitProjectImported({ mode, markers: markerIds.length, rooms });
  return { mode, markers: markerIds.length, rooms, markerIds };
}

function callWS<T>(msg: Record<string, unknown>): Promise<T> {
  const call = liveWsCaller();
  if (!call) throw new Error('floorplanStudio.callWS: not connected to Home Assistant');
  return call<T>(msg);
}

export interface FloorplanStudioApi {
  apiVersion: number;
  registerPlugin: (m: PluginManifest) => void;
  unregisterPlugin: (id: string) => void;
  /** merge an incoming project/fragment in one undo step, or replace the open project */
  importProject: typeof importProject;
  /** call the active HA WebSocket (throws when not connected) */
  callWS: WsCall;
  /** documented event names — listeners addEventListener on window */
  events: { ACTION: string; PROJECT_IMPORTED: string; PLUGINS_CHANGED: string };
  /** replace the direct IndexedDB pokes integrations used to need */
  projects: {
    /** the currently open project (live store reference — do not mutate) */
    active: () => Project;
    list: () => Promise<Project[]>;
    get: (id: string) => Promise<Project | undefined>;
    save: (p: Project) => Promise<void>;
    remove: (id: string) => Promise<void>;
    /** load a stored project into the editor */
    open: (id: string) => Promise<boolean>;
  };
  /** read-side introspection for advanced plugins */
  registry: {
    plugins: () => PluginManifest[];
    deviceSources: typeof getDeviceSources;
    actions: typeof getActions;
    iconMap: typeof getIconMap;
    markerDefaults: typeof getMarkerDefaults;
    stateRulePresets: typeof getStateRulePresets;
    subscribe: typeof subscribePlugins;
  };
}

declare global {
  interface Window {
    floorplanStudio?: FloorplanStudioApi;
  }
}

/** Attach `window.floorplanStudio`. Safe to call from every entry point. */
export function installPluginApi(): FloorplanStudioApi {
  if (window.floorplanStudio) return window.floorplanStudio;

  const api: FloorplanStudioApi = {
    apiVersion: PLUGIN_API_VERSION,
    registerPlugin,
    unregisterPlugin,
    importProject,
    callWS,
    events: {
      ACTION: EVENT_ACTION,
      PROJECT_IMPORTED: EVENT_PROJECT_IMPORTED,
      PLUGINS_CHANGED: EVENT_PLUGINS_CHANGED,
    },
    projects: {
      active: () => useStore.getState().project,
      list: () => listProjects(),
      get: (id) => loadProject(id),
      save: (p) => saveProject(p),
      remove: (id) => deleteProject(id),
      open: async (id) => {
        const p = await loadProject(id);
        if (!p) return false;
        useStore.getState().loadProject(p);
        return true;
      },
    },
    registry: {
      plugins: getPlugins,
      deviceSources: getDeviceSources,
      actions: getActions,
      iconMap: getIconMap,
      markerDefaults: getMarkerDefaults,
      stateRulePresets: getStateRulePresets,
      subscribe: subscribePlugins,
    },
  };
  window.floorplanStudio = api;
  return api;
}
