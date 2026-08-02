import { nanoid } from 'nanoid';
import { activeFloor, useStore } from '../state/store';
import { LAYER_LABELS, LAYER_ORDER, LayerId } from '../model/schema';
import { createFloor } from '../model/defaults';

export function LayerPanel() {
  const project = useStore((s) => s.project);
  const floor = activeFloor(project);
  const commit = useStore((s) => s.commit);

  function toggle(id: LayerId, key: 'visible' | 'locked') {
    commit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)!;
      f.layers[id][key] = !f.layers[id][key];
    });
  }

  function addFloor() {
    const nf = createFloor(`Floor ${project.floors.length + 1}`);
    nf.id = nanoid(8);
    commit((p) => {
      p.floors.push(nf);
      p.activeFloorId = nf.id;
    });
  }

  return (
    <div className="fp-panel fp-layers">
      <div className="fp-panel-title">Floors</div>
      <div className="fp-floor-switch">
        {project.floors.map((f) => (
          <button
            key={f.id}
            className={f.id === project.activeFloorId ? 'active' : ''}
            onClick={() => commit((p) => void (p.activeFloorId = f.id))}
            onDoubleClick={() => {
              const name = prompt('Floor name', f.name);
              if (name) commit((p) => void (p.floors.find((x) => x.id === f.id)!.name = name));
            }}
          >
            {f.name}
          </button>
        ))}
        <button onClick={addFloor} title="Add floor">＋</button>
      </div>

      <div className="fp-panel-title">Layers</div>
      {LAYER_ORDER.slice().reverse().map((id) => (
        <div key={id} className="fp-layer-row">
          <span>{LAYER_LABELS[id]}</span>
          <div className="fp-layer-actions">
            <button className={floor.layers[id].visible ? '' : 'off'} title="Show/hide" onClick={() => toggle(id, 'visible')}>
              {floor.layers[id].visible ? '👁' : '—'}
            </button>
            <button className={floor.layers[id].locked ? 'on' : ''} title="Lock/unlock" onClick={() => toggle(id, 'locked')}>
              {floor.layers[id].locked ? '🔒' : '🔓'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
