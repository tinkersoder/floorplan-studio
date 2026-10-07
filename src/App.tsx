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
import { subscribeHass, hassToSource, getHass, HassLike } from './ha/hassBridge';

type ModalId = null | 'help' | 'connect' | 'projects' | 'export';

export default function App() {
  const [modal, setModal] = useState<ModalId>(null);
  const mode = useStore((s) => s.mode);
  useKeyboard();
  useAutosave();

  // In HACS card mode HA pushes a fresh `hass` object on every state change.
  // The card should come up connected to this dashboard's HA by default
  // (not demo mode), so the first `hass` we see — whether it arrived before
  // this effect subscribed or arrives as a later push — is auto-adopted as
  // the live source. After that one-time adoption, keep states in sync with
  // every push while the user stays on "this dashboard" as their source;
  // if they explicitly disconnect back to demo or connect elsewhere, we
  // don't override that choice again. Standalone (non-card) builds never
  // get a `hass` object, so this is a no-op there and demo mode stands.
  useEffect(() => {
    let autoAdopted = false;
    function adopt(h: HassLike) {
      const st = useStore.getState();
      const { entities, states } = hassToSource(h);
      if (!autoAdopted && st.usingDemo && st.conn.status === 'disconnected') {
        autoAdopted = true;
        st.useHassSource(entities, states);
        return;
      }
      if (st.usingDemo || st.conn.url !== 'this dashboard') return;
      st.useHassSource(entities, states);
    }
    const existing = getHass();
    if (existing) adopt(existing);
    return subscribeHass(adopt);
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
