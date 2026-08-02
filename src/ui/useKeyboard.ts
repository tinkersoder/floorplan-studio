import { useEffect } from 'react';
import { nanoid } from 'nanoid';
import { activeFloor, useStore } from '../state/store';

/** Global keyboard shortcuts. Ignored while typing in an input/textarea. */
export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing =
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable ||
          el.tagName === 'SELECT');
      const st = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      if (typing) return;

      // duplicate
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      // delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      // tool hotkeys
      const tools: Record<string, any> = {
        v: 'select',
        m: 'marker',
        r: 'room',
        w: 'wall',
      };
      if (tools[e.key.toLowerCase()] && !mod) {
        st.setTool(tools[e.key.toLowerCase()]);
        return;
      }
      // arrow-key nudge
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (nudge[e.key] && st.selection.length) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        const step = e.shiftKey ? 10 : 1;
        nudgeSelection(dx * step, dy * step);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

function deleteSelection() {
  const { selection, commit, select } = useStore.getState();
  if (!selection.length) return;
  const sel = new Set(selection);
  commit((p) => {
    const fl = activeFloor(p);
    fl.markers = fl.markers.filter((m) => !sel.has(m.id));
    fl.rooms = fl.rooms.filter((r) => !sel.has(r.id));
    fl.walls = fl.walls.filter((w) => !sel.has(w.id));
    fl.openings = fl.openings.filter((o) => !sel.has(o.id));
  });
  select(null);
}

function nudgeSelection(dx: number, dy: number) {
  const { selection, commit } = useStore.getState();
  const sel = new Set(selection);
  commit((p) => {
    const fl = activeFloor(p);
    for (const m of fl.markers) if (sel.has(m.id)) {
      m.x += dx;
      m.y += dy;
    }
    for (const r of fl.rooms) if (sel.has(r.id)) r.polygon.forEach((pt) => {
      pt.x += dx;
      pt.y += dy;
    });
    for (const w of fl.walls) if (sel.has(w.id)) w.points.forEach((pt) => {
      pt.x += dx;
      pt.y += dy;
    });
  });
}

function duplicateSelection() {
  const { selection, commit, select } = useStore.getState();
  const sel = new Set(selection);
  const newIds: string[] = [];
  commit((p) => {
    const fl = activeFloor(p);
    for (const m of [...fl.markers]) {
      if (!sel.has(m.id)) continue;
      const id = nanoid(8);
      newIds.push(id);
      fl.markers.push({ ...structuredClone(m), id, x: m.x + 20, y: m.y + 20 });
    }
    for (const r of [...fl.rooms]) {
      if (!sel.has(r.id)) continue;
      const id = nanoid(8);
      newIds.push(id);
      fl.rooms.push({
        ...structuredClone(r),
        id,
        polygon: r.polygon.map((pt) => ({ x: pt.x + 20, y: pt.y + 20 })),
      });
    }
  });
  if (newIds.length) select(newIds);
}
