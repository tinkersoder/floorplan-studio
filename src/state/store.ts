import { create } from 'zustand';
import { produce } from 'immer';
import { Floor, Project } from '../model/schema';
import { createProject } from '../model/defaults';
import { HaEntity, HaState } from '../model/entities';
import { demoEntities, demoStates } from '../model/demo';

export type ToolId =
  | 'select'
  | 'marker'
  | 'room'
  | 'wall'
  | 'door'
  | 'window';

export type Mode = 'edit' | 'preview';

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

const HISTORY_LIMIT = 100;

interface StoreState {
  project: Project;
  past: Project[];
  future: Project[];

  selection: string[];
  tool: ToolId;
  mode: Mode;
  viewport: Viewport;

  // Entity/state source (demo by default; replaced by live HA when connected)
  entities: HaEntity[];
  states: Record<string, HaState>;
  usingDemo: boolean;
  conn: { status: ConnStatus; url: string; error?: string };

  // --- mutations -----------------------------------------------------------
  /** Apply an immer recipe to the project. `history:false` for transient drags. */
  commit: (recipe: (p: Project) => void, opts?: { history?: boolean }) => void;
  /** Snapshot current project onto the undo stack (call at drag start). */
  beginHistory: () => void;
  undo: () => void;
  redo: () => void;

  loadProject: (p: Project) => void;
  newProject: (name?: string) => void;

  select: (ids: string[] | string | null, additive?: boolean) => void;
  setTool: (t: ToolId) => void;
  setMode: (m: Mode) => void;
  setViewport: (v: Partial<Viewport>) => void;

  // entity source
  setLiveSource: (
    entities: HaEntity[],
    states: Record<string, HaState>,
    url: string,
  ) => void;
  patchState: (s: HaState) => void;
  useDemoSource: () => void;
  setConn: (c: Partial<StoreState['conn']>) => void;
}

export const activeFloor = (p: Project): Floor =>
  p.floors.find((f) => f.id === p.activeFloorId) ?? p.floors[0];

function snapshot(p: Project): Project {
  // structuredClone keeps history entries independent of the live draft.
  return structuredClone(p);
}

export const useStore = create<StoreState>((set, get) => ({
  project: createProject(),
  past: [],
  future: [],

  selection: [],
  tool: 'select',
  mode: 'edit',
  viewport: { zoom: 1, panX: 0, panY: 0 },

  entities: demoEntities(),
  states: demoStates(),
  usingDemo: true,
  conn: { status: 'disconnected', url: '' },

  commit: (recipe, opts = {}) => {
    const { history = true } = opts;
    const prev = get().project;
    const next = produce(prev, (draft) => {
      recipe(draft);
      draft.updatedAt = Date.now();
    });
    if (next === prev) return;
    if (history) {
      const past = [...get().past, snapshot(prev)].slice(-HISTORY_LIMIT);
      set({ project: next, past, future: [] });
    } else {
      set({ project: next });
    }
  },

  beginHistory: () => {
    const past = [...get().past, snapshot(get().project)].slice(-HISTORY_LIMIT);
    set({ past, future: [] });
  },

  undo: () => {
    const { past, project, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      project: previous,
      past: past.slice(0, -1),
      future: [snapshot(project), ...future].slice(0, HISTORY_LIMIT),
    });
  },

  redo: () => {
    const { future, project, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      project: next,
      future: future.slice(1),
      past: [...past, snapshot(project)].slice(-HISTORY_LIMIT),
    });
  },

  loadProject: (p) =>
    set({ project: p, past: [], future: [], selection: [] }),

  newProject: (name) =>
    set({ project: createProject(name), past: [], future: [], selection: [] }),

  select: (ids, additive = false) => {
    if (ids === null) return set({ selection: [] });
    const arr = Array.isArray(ids) ? ids : [ids];
    if (additive) {
      const cur = new Set(get().selection);
      for (const id of arr) cur.has(id) ? cur.delete(id) : cur.add(id);
      set({ selection: [...cur] });
    } else {
      set({ selection: arr });
    }
  },

  setTool: (tool) => set({ tool }),
  setMode: (mode) => set({ mode }),
  setViewport: (v) => set({ viewport: { ...get().viewport, ...v } }),

  setLiveSource: (entities, states, url) =>
    set({
      entities,
      states,
      usingDemo: false,
      conn: { status: 'connected', url },
    }),

  patchState: (s) =>
    set((st) => ({ states: { ...st.states, [s.entity_id]: s } })),

  useDemoSource: () =>
    set({
      entities: demoEntities(),
      states: demoStates(),
      usingDemo: true,
      conn: { status: 'disconnected', url: '' },
    }),

  setConn: (c) => set((st) => ({ conn: { ...st.conn, ...c } })),
}));

// Convenience hook: the currently active floor.
export const useActiveFloor = () => useStore((s) => activeFloor(s.project));
