import { useEffect, useState } from 'react';
import { activeFloor, useStore } from './state/store';
import { loadImageFile } from './ui/imageLoad';
import { useKeyboard } from './ui/useKeyboard';
import { Toolbar } from './panels/Toolbar';
import { EntityBrowser } from './panels/EntityBrowser';
import { Inspector } from './panels/Inspector';
import { LayerPanel } from './panels/LayerPanel';
import { CanvasSvg } from './canvas/CanvasSvg';
import { HelpModal } from './ui/HelpModal';
import { ConnectModal } from './ha/ConnectModal';
import { ProjectsModal } from './persist/ProjectsModal';
import { ExportModal } from './export/ExportModal';
import { useAutosave } from './persist/useAutosave';
import { subscribeHass, hassToSource } from './ha/hassBridge';

type ModalId = null | 'help' | 'connect' | 'projects' | 'export';

export default function App() {
  const [modal, setModal] = useState<ModalId>(null);
  const mode = useStore((s) => s.mode);
  useKeyboard();
  useAutosave();

  // In HACS card mode HA pushes a fresh `hass` object on every state change.
  // Once the user has chosen this dashboard as the live source (usingDemo:false,
  // no WebSocket client), keep the store's states in sync with each push.
  useEffect(() => {
    return subscribeHass((h) => {
      const st = useStore.getState();
      if (st.usingDemo || st.conn.url !== 'this dashboard') return;
      const { entities, states } = hassToSource(h);
      st.useHassSource(entities, states);
    });
  }, []);

  // Paste-from-clipboard and drag-drop background image onto the app.
  useEffect(() => {
    async function setBackground(file: Blob) {
      const img = await loadImageFile(file);
      const { commit, project } = useStore.getState();
      const floor = activeFloor(project);
      commit((p) => {
        const f = p.floors.find((x) => x.id === floor.id)!;
        f.background = {
          ...f.background,
          dataUri: img.dataUri,
          naturalW: img.naturalW,
          naturalH: img.naturalH,
          scale: 1,
          x: 0,
          y: 0,
          rotation: 0,
        };
        f.canvas = { width: img.naturalW, height: img.naturalH };
      });
    }
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) setBackground(file);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (file) setBackground(file);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('paste', onPaste);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, []);

  return (
    <div className="fp-app">
      <Toolbar
        onOpenExport={() => setModal('export')}
        onOpenProjects={() => setModal('projects')}
        onOpenConnect={() => setModal('connect')}
        onOpenHelp={() => setModal('help')}
      />
      <div className="fp-body">
        {mode === 'edit' && (
          <aside className="fp-left">
            <EntityBrowser />
            <LayerPanel />
          </aside>
        )}
        <main className="fp-center">
          <CanvasSvg />
          {mode === 'preview' && <div className="fp-preview-badge">PREVIEW — live states</div>}
        </main>
        {mode === 'edit' && (
          <aside className="fp-right">
            <Inspector />
          </aside>
        )}
      </div>

      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'connect' && <ConnectModal onClose={() => setModal(null)} />}
      {modal === 'projects' && <ProjectsModal onClose={() => setModal(null)} />}
      {modal === 'export' && <ExportModal onClose={() => setModal(null)} />}
    </div>
  );
}
