import { useMemo, useState } from 'react';
import { activeFloor, useStore } from '../state/store';
import { createMarker } from '../model/defaults';
import { resolveEntityIcon } from '../model/haIcons';

export function EntityBrowser() {
  const entities = useStore((s) => s.entities);
  const states = useStore((s) => s.states);
  const usingDemo = useStore((s) => s.usingDemo);
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('all');
  const [manual, setManual] = useState('');

  const domains = useMemo(
    () => ['all', ...Array.from(new Set(entities.map((e) => e.domain))).sort()],
    [entities],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entities.filter((e) => {
      if (domain !== 'all' && e.domain !== domain) return false;
      if (!needle) return true;
      return (
        e.entity_id.toLowerCase().includes(needle) ||
        e.friendly_name.toLowerCase().includes(needle)
      );
    });
  }, [entities, q, domain]);

  function addMarkerFor(entityId: string, icon?: string) {
    const { project, commit, select } = useStore.getState();
    const fl = activeFloor(project);
    // Drop a new marker, offset slightly from any existing one at center so
    // multiple quick adds don't stack exactly. (Use the inspector's
    // "+ Add entity" to put several entities on one marker.)
    const n = fl.markers.length;
    const m = createMarker(
      fl.canvas.width / 2 + (n % 6) * 26,
      fl.canvas.height / 2 + Math.floor(n / 6) * 26,
      entityId,
    );
    if (icon) m.style.icon = icon;
    // Sensible default tap action per domain: read-only domains open more-info,
    // controllable ones toggle. Sensors also show their live value as a label.
    const dom = entityId.split('.')[0];
    if (dom === 'sensor' || dom === 'binary_sensor') {
      m.actions.tap = { kind: 'more-info' };
      m.style.showState = true;
    }
    commit((p) => {
      activeFloor(p).markers.push(m);
    });
    select(m.id);
  }

  function syncAllIcons() {
    const { commit } = useStore.getState();
    const st = useStore.getState().states;
    const ents = useStore.getState().entities;
    const regIcon = (id: string) => ents.find((e) => e.entity_id === id)?.icon;
    let n = 0;
    commit((p) => {
      const fl = activeFloor(p);
      for (const m of fl.markers) {
        if (m.style.type !== 'icon' || !m.entities[0]) continue;
        const id = m.entities[0];
        m.style.icon = resolveEntityIcon(id, st[id], regIcon(id));
        n++;
      }
    });
    return n;
  }

  return (
    <div className="fp-panel fp-entities">
      <div className="fp-panel-title fp-title-row">
        <span>
          Entities <span className="fp-badge">{usingDemo ? 'demo' : 'live'}</span>
        </span>
        <button className="fp-mini" title="Set every icon-marker's icon to the one Home Assistant uses" onClick={syncAllIcons}>
          ↺ Sync icons
        </button>
      </div>
      <div className="fp-entity-controls">
        <input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="fp-entity-list">
        {filtered.map((e) => {
          const st = states[e.entity_id];
          return (
            <button
              key={e.entity_id}
              className="fp-entity-row"
              title={`Add marker for ${e.entity_id}`}
              onClick={() => addMarkerFor(e.entity_id, resolveEntityIcon(e.entity_id, st, e.icon))}
            >
              <span className="fp-entity-dot" data-on={st?.state === 'on' ? 'y' : 'n'} />
              <span className="fp-entity-text">
                <span className="fp-entity-name">{e.friendly_name}</span>
                <span className="fp-entity-id">{e.entity_id}</span>
              </span>
              <span className="fp-entity-state">{st ? st.state : ''}</span>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="fp-empty">No matches</div>}
      </div>

      <div className="fp-manual">
        <input
          placeholder="type entity_id…"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && manual.includes('.')) {
              addMarkerFor(manual.trim());
              setManual('');
            }
          }}
        />
        <button
          disabled={!manual.includes('.')}
          onClick={() => {
            addMarkerFor(manual.trim());
            setManual('');
          }}
        >
          Add
        </button>
      </div>
      <div className="fp-hint">
        Click an entity to drop a marker (or add it to the selected marker).
      </div>
    </div>
  );
}
