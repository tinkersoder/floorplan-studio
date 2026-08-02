import { useEffect, useRef, useState } from 'react';
import { Project } from '../model/schema';
import { useStore } from '../state/store';
import { Modal } from '../ui/Modal';
import { deleteProject, listProjects, saveProject } from './db';

export function ProjectsModal({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const current = useStore((s) => s.project);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setProjects(await listProjects());
  }
  useEffect(() => {
    saveProject(current).then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(p: Project) {
    useStore.getState().loadProject(structuredClone(p));
    onClose();
  }

  async function remove(id: string) {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    await deleteProject(id);
    refresh();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${slug(current.name)}.floorplan.json`);
  }

  async function importJson(file?: File | null) {
    if (!file) return;
    const text = await file.text();
    try {
      const p = JSON.parse(text) as Project;
      if (!p.floors || !p.id) throw new Error('Not a floorplan project file');
      await saveProject(p);
      useStore.getState().loadProject(p);
      onClose();
    } catch (e) {
      alert('Import failed: ' + (e as Error).message);
    }
  }

  return (
    <Modal title="Projects" onClose={onClose}>
      <div className="fp-modal-actions">
        <button className="fp-primary" onClick={() => { useStore.getState().newProject(); onClose(); }}>
          + New project
        </button>
        <button onClick={exportJson}>Export current as JSON</button>
        <button onClick={() => fileRef.current?.click()}>Import JSON…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
      </div>

      <div className="fp-project-list">
        {projects.map((p) => (
          <div key={p.id} className={p.id === current.id ? 'fp-project-row current' : 'fp-project-row'}>
            <div className="fp-project-meta">
              <strong>{p.name}</strong>
              <span>
                {p.floors.length} floor{p.floors.length > 1 ? 's' : ''} · {countMarkers(p)} markers ·{' '}
                {new Date(p.updatedAt).toLocaleString()}
              </span>
            </div>
            <div className="fp-project-buttons">
              <button onClick={() => open(p)}>Open</button>
              <button className="fp-danger" onClick={() => remove(p.id)}>Delete</button>
            </div>
          </div>
        ))}
        {projects.length === 0 && <div className="fp-empty">No saved projects yet.</div>}
      </div>
    </Modal>
  );
}

function countMarkers(p: Project) {
  return p.floors.reduce((n, f) => n + f.markers.length, 0);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'floorplan';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
