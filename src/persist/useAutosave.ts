import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { getLastProjectId, loadProject, saveProject } from './db';

/**
 * Loads the last-open project on mount and debounces autosave to IndexedDB on
 * every project change. Keeps everything local — nothing leaves the browser.
 */
export function useAutosave() {
  const loaded = useRef(false);

  // Restore last session once.
  useEffect(() => {
    (async () => {
      const id = await getLastProjectId();
      if (id) {
        const p = await loadProject(id);
        if (p) useStore.getState().loadProject(p);
      }
      loaded.current = true;
    })();
  }, []);

  // Debounced autosave.
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useStore.subscribe((state, prev) => {
      if (!loaded.current) return;
      if (state.project === prev.project) return;
      window.clearTimeout(timer);
      const project = state.project;
      timer = window.setTimeout(() => saveProject(project).catch(() => {}), 600);
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, []);
}
