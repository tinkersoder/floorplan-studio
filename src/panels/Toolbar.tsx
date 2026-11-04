import { useEffect, useState } from 'react';
import { activeFloor, ToolId, useStore } from '../state/store';
import { emitAction } from '../plugins/events';
import { getActions, subscribePlugins } from '../plugins/registry';
import { iconPath } from '../ui/icons';

const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'marker', label: 'Marker', key: 'M' },
  { id: 'room', label: 'Room', key: 'R' },
  { id: 'wall', label: 'Wall', key: 'W' },
  { id: 'door', label: 'Door', key: '' },
  { id: 'window', label: 'Window', key: '' },
];

export function Toolbar({ onOpenExport, onOpenProjects, onOpenConnect, onOpenImport, onOpenHaImport, onOpenHelp }: {
  onOpenExport: () => void;
  onOpenProjects: () => void;
  onOpenConnect: () => void;
  onOpenImport: () => void;
  onOpenHaImport: () => void;
  onOpenHelp: () => void;
}) {
  // re-render when a plugin registers/unregisters
  const [, bump] = useState(0);
  useEffect(() => subscribePlugins(() => bump((x) => x + 1)), []);
  const pluginActions = getActions('toolbar');
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const name = useStore((s) => s.project.name);
  const commit = useStore((s) => s.commit);
  const conn = useStore((s) => s.conn);
  const usingDemo = useStore((s) => s.usingDemo);

  return (
    <div className="fp-toolbar">
      <div className="fp-toolbar-group fp-brand">
        <span className="fp-logo">▦</span>
        <input
          className="fp-project-name"
          value={name}
          onChange={(e) => commit((p) => void (p.name = e.target.value))}
          spellCheck={false}
        />
      </div>

      <div className="fp-toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'fp-tool active' : 'fp-tool'}
            onClick={() => setTool(t.id)}
            disabled={mode === 'preview'}
            title={t.key ? `${t.label} (${t.key})` : t.label}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="fp-toolbar-group">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>

      <div className="fp-toolbar-group fp-mode">
        <button
          className={mode === 'edit' ? 'active' : ''}
          onClick={() => setMode('edit')}
        >
          Edit
        </button>
        <button
          className={mode === 'preview' ? 'active' : ''}
          onClick={() => setMode('preview')}
        >
          Preview
        </button>
      </div>

      <div className="fp-toolbar-group fp-spacer" />

      <div className="fp-toolbar-group">
        <button onClick={onOpenConnect} title="Connect to Home Assistant">
          {conn.status === 'connected' ? '🟢 HA' : usingDemo ? '◻ Demo' : '⚪ HA'}
        </button>
        <button onClick={onOpenHaImport} disabled={mode === 'preview'} title="Import an ha-floorplan / picture-elements card already in Home Assistant">
          Import card
        </button>
        <button onClick={onOpenImport} disabled={mode === 'preview'} title="Import devices from registered integrations">
          Devices
        </button>
        {pluginActions.map(({ pluginId, action }) => (
          <button
            key={`${pluginId}:${action.id}`}
            disabled={mode === 'preview'}
            title={action.title ?? action.label}
            onClick={() => {
              const st = useStore.getState();
              emitAction({
                pluginId,
                actionId: action.id,
                projectId: st.project.id,
                floorId: activeFloor(st.project).id,
                selection: [...st.selection],
              });
            }}
          >
            {action.icon && (
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }}>
                <path d={iconPath(action.icon)} fill="currentColor" />
              </svg>
            )}
            {action.label}
          </button>
        ))}
        <button onClick={onOpenProjects}>Projects</button>
        <button className="fp-primary" onClick={onOpenExport}>Export</button>
        <button onClick={onOpenHelp} title="Help">?</button>
      </div>
    </div>
  );
}
