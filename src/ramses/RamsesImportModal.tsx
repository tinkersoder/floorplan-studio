import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Modal } from '../ui/Modal';
import { iconPath } from '../ui/icons';
import type { Project } from '../model/schema';
import { EXTRAS_TOPOLOGY_WS, fetchRamsesTopology, liveWsCaller } from './fetch';
import {
  CLASS_LABEL,
  GROUP_COLOR,
  iconForClass,
  parseRamsesInput,
  RamsesTopology,
  topologyFromIds,
} from './topology';
import {
  applyMerge,
  applyPlan,
  defaultSelection,
  planProjectMerge,
  planRamsesImport,
  RowStatus,
} from './plan';

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;

const STATUS_TEXT: Record<RowStatus, string> = {
  room: 'room',
  staging: 'staging row',
  exists: 'already on plan',
  'no-entities': 'no entities',
  off: 'skipped',
};

const SOURCE_TEXT: Record<RamsesTopology['source'], string> = {
  ramses_extras: 'Ramses Extras floorplan helper',
  ramses_cc: 'ramses_cc device registry',
  device_ids: 'device ids matched to HA entities',
};

export function RamsesImportModal({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const entities = useStore((s) => s.entities);
  const usingDemo = useStore((s) => s.usingDemo);
  useStore((s) => s.conn); // re-render when the HA link changes
  const call = liveWsCaller();

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [topo, setTopo] = useState<RamsesTopology | null>(null);
  const [incoming, setIncoming] = useState<Project | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markerSize, setMarkerSize] = useState(32);
  const [labels, setLabels] = useState(true);
  const [extraEntities, setExtraEntities] = useState(true);
  const [stateRules, setStateRules] = useState(true);
  const [allFloors, setAllFloors] = useState(true);
  const [includeRooms, setIncludeRooms] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadTopology(t: RamsesTopology, note?: string) {
    setTopo(t);
    setIncoming(null);
    setSelected(defaultSelection(useStore.getState().project, t));
    setMsg({
      kind: 'info',
      text: `${t.devices.length} RAMSES devices from the ${SOURCE_TEXT[t.source]}.${note ? ' ' + note : ''}`,
    });
  }

  async function fetchLive() {
    if (!call) return;
    setBusy(true);
    setMsg(null);
    try {
      const { topology, note } = await fetchRamsesTopology(call);
      loadTopology(topology, note);
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  function parse(src: string) {
    const r = parseRamsesInput(src);
    switch (r.kind) {
      case 'topology':
        return loadTopology(r.topology);
      case 'project':
        setTopo(null);
        setIncoming(r.project);
        return setMsg({
          kind: 'info',
          text: `Studio project "${r.project.name ?? 'seeded'}" with ${r.project.floors.length} floor(s) — its markers can be merged into this project.`,
        });
      case 'ids': {
        const t = topologyFromIds(r.ids, entities);
        const matched = t.devices.filter((d) => d.entities.length).length;
        return loadTopology(
          t,
          usingDemo
            ? 'Connect to Home Assistant first — device ids are matched against your real entity list.'
            : `${matched} matched to HA entities by id.`,
        );
      }
      default:
        setMsg({ kind: 'err', text: r.error });
    }
  }

  async function loadFile(file?: File | null) {
    if (!file) return;
    const t = await file.text();
    setText(t);
    parse(t);
  }

  const plan = useMemo(
    () =>
      topo
        ? planRamsesImport(project, topo, project.activeFloorId, {
            selected,
            markerSize,
            labels,
            extraEntities,
            stateRules,
            allFloors,
          })
        : null,
    [project, topo, selected, markerSize, labels, extraEntities, stateRules, allFloors],
  );

  const merge = useMemo(
    () => (incoming ? planProjectMerge(project, incoming, project.activeFloorId, { includeRooms }) : null),
    [project, incoming, includeRooms],
  );

  const counts = useMemo(() => {
    const c = { room: 0, staging: 0, exists: 0, unmatchedAreas: new Set<string>() };
    for (const r of plan?.rows ?? []) {
      if (r.status === 'room') c.room++;
      if (r.status === 'staging') {
        c.staging++;
        if (r.device.area_name || r.device.area_id) c.unmatchedAreas.add(r.device.area_name || r.device.area_id!);
      }
      if (r.status === 'exists') c.exists++;
    }
    return c;
  }, [plan]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selectWhere(pred: (group: string) => boolean) {
    if (!topo) return;
    setSelected(
      new Set(
        topo.devices.filter((d) => d.primary_entity && d.entities.length && pred(d.group)).map((d) => d.device_id),
      ),
    );
  }

  function finish(ids: string[], text: string) {
    const st = useStore.getState();
    st.select(ids);
    st.setTool('select');
    setMsg({ kind: 'ok', text });
  }

  function importDevices() {
    if (!plan || plan.adds.length === 0) return;
    let ids: string[] = [];
    useStore.getState().commit((p) => {
      ids = applyPlan(p, plan);
    });
    const parts = [`Added ${ids.length} marker${ids.length === 1 ? '' : 's'}`];
    if (counts.room) parts.push(`${counts.room} placed in matching rooms`);
    if (counts.staging) parts.push(`${counts.staging} parked along the bottom edge — drag them into place`);
    finish(ids, parts.join(' · ') + '. Ctrl+Z undoes the whole import.');
  }

  function importMerge() {
    if (!merge) return;
    let ids: string[] = [];
    useStore.getState().commit((p) => {
      ids = applyMerge(p, merge);
    });
    const rooms = merge.reduce((n, m) => n + m.rooms.length, 0);
    finish(ids, `Merged ${ids.length} markers${rooms ? ` and ${rooms} rooms` : ''}. Ctrl+Z undoes it.`);
  }

  const mergeMarkers = merge?.reduce((n, m) => n + m.markers.length, 0) ?? 0;
  const mergeRooms = merge?.reduce((n, m) => n + m.rooms.length, 0) ?? 0;

  return (
    <Modal title="Import from RAMSES RF / Ramses Extras" onClose={onClose} wide>
      <p className="fp-modal-intro">
        Drop your evohome / RAMSES-II devices onto the plan as markers — zones, radiator valves, thermostats,
        ventilation units, CO₂ sensors and remotes. Devices whose HA area matches a room (the room's{' '}
        <em>HA area</em> or its name) land inside that room; the rest wait in a staging row at the bottom of
        the floor.
      </p>

      <div className="fp-rx-sources">
        <div className="fp-rx-source">
          <div className="fp-subtitle">From Home Assistant</div>
          <button className="fp-primary" disabled={!call || busy} onClick={fetchLive}>
            {busy ? 'Reading devices…' : 'Read RAMSES devices'}
          </button>
          <div className="fp-hint">
            {call
              ? 'Uses Ramses Extras when installed, otherwise the ramses_cc integration directly.'
              : 'Connect to Home Assistant first (top-right HA button).'}
          </div>
        </div>
        <div className="fp-rx-source">
          <div className="fp-subtitle">Paste or load</div>
          <textarea
            className="fp-rx-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Ramses Extras ${EXTRAS_TOPOLOGY_WS} result,\nfloorplan_seed_studio response / studio project JSON,\nor ramses_cc known_list / schema (any text with ids like 04:123456)`}
            spellCheck={false}
          />
          <div className="fp-modal-actions fp-rx-row">
            <button disabled={!text.trim()} onClick={() => parse(text)}>Parse</button>
            <button onClick={() => fileRef.current?.click()}>Load file…</button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.yaml,.yml,.txt,.log,application/json,text/plain"
              hidden
              onChange={(e) => {
                void loadFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      {msg && <div className={`fp-note ${msg.kind === 'info' ? '' : msg.kind}`}>{msg.text}</div>}

      {topo && plan && (
        <>
          <div className="fp-rx-options">
            <label className="fp-check">
              <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
              Device names as labels
            </label>
            <label className="fp-check">
              <input type="checkbox" checked={extraEntities} onChange={(e) => setExtraEntities(e.target.checked)} />
              Attach temperature / demand / CO₂ entities
            </label>
            <label className="fp-check">
              <input type="checkbox" checked={stateRules} onChange={(e) => setStateRules(e.target.checked)} />
              State rules (offline, battery low, window open, heat demand)
            </label>
            <label className="fp-check">
              <input type="checkbox" checked={allFloors} onChange={(e) => setAllFloors(e.target.checked)} />
              Match rooms on all floors
            </label>
            <label className="fp-check">
              Marker size
              <input
                type="number"
                min={12}
                max={96}
                value={markerSize}
                onChange={(e) => setMarkerSize(Math.max(12, Math.min(96, parseInt(e.target.value) || 32)))}
                style={{ width: 64 }}
              />
            </label>
          </div>

          <div className="fp-rx-row fp-rx-select">
            <span>Select:</span>
            <button className="fp-mini" onClick={() => selectWhere(() => true)}>all</button>
            <button className="fp-mini" onClick={() => selectWhere((g) => g === 'heat')}>heating</button>
            <button className="fp-mini" onClick={() => selectWhere((g) => g === 'hvac')}>ventilation</button>
            <button className="fp-mini" onClick={() => setSelected(new Set())}>none</button>
            <span className="fp-rx-summary">
              {plan.adds.length} to add · {counts.room} in rooms · {counts.staging} staged · {counts.exists} already
              placed
            </span>
          </div>

          <div className="fp-rx-table-wrap">
            <table className="fp-rx-table">
              <thead>
                <tr>
                  <th />
                  <th>Device</th>
                  <th>Type</th>
                  <th>HA area</th>
                  <th>Placement</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => {
                  const d = r.device;
                  const selectable = !!d.primary_entity && d.entities.length > 0 && r.status !== 'exists';
                  return (
                    <tr key={d.device_id} className={r.marker ? '' : 'dim'}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={!selectable}
                          checked={selectable && selected.has(d.device_id)}
                          onChange={() => toggle(d.device_id)}
                        />
                      </td>
                      <td>
                        <div className="fp-rx-name">{d.display_name}</div>
                        <div className="fp-rx-sub">
                          {d.device_id}
                          {d.primary_entity ? ` · ${d.primary_entity}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="fp-rx-type">
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                            <path d={iconPath(iconForClass(d.device_class))} fill={GROUP_COLOR[d.group] ?? GROUP_COLOR.orphan} />
                          </svg>
                          {CLASS_LABEL[d.device_class] ?? d.device_class}
                        </span>
                      </td>
                      <td>{d.area_name || d.area_id || <span className="fp-rx-sub">—</span>}</td>
                      <td>
                        <span className={`fp-rx-status ${r.status}`}>{STATUS_TEXT[r.status]}</span>
                        {r.roomName && <div className="fp-rx-sub">{r.roomName}{project.floors.length > 1 ? ` · ${r.floorName}` : ''}</div>}
                        {r.status === 'staging' && project.floors.length > 1 && <div className="fp-rx-sub">{r.floorName}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {counts.unmatchedAreas.size > 0 && (
            <div className="fp-hint">
              No room on the plan for: {[...counts.unmatchedAreas].join(', ')}. Draw a room and set its{' '}
              <em>HA area</em> in the Inspector (or name it the same) to auto-place these next time.
            </div>
          )}

          <div className="fp-modal-actions fp-rx-footer">
            <button className="fp-primary" disabled={plan.adds.length === 0} onClick={importDevices}>
              Add {plan.adds.length} marker{plan.adds.length === 1 ? '' : 's'}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </>
      )}

      {incoming && merge && (
        <>
          <label className="fp-check">
            <input type="checkbox" checked={includeRooms} onChange={(e) => setIncludeRooms(e.target.checked)} />
            Also import rooms this project doesn't have yet
          </label>
          <ul className="fp-rx-merge">
            {merge.map((m) => (
              <li key={m.targetFloorId}>
                <strong>{m.sourceFloorName}</strong> → {m.targetFloorName}: {m.markers.length} markers
                {m.rooms.length ? `, ${m.rooms.length} rooms` : ''}
                {m.skipped ? ` (${m.skipped} already on plan)` : ''}
                {m.scaled ? ' · scaled to this canvas' : ''}
              </li>
            ))}
          </ul>
          <div className="fp-modal-actions fp-rx-footer">
            <button className="fp-primary" disabled={!mergeMarkers && !mergeRooms} onClick={importMerge}>
              Merge {mergeMarkers} markers{mergeRooms ? ` + ${mergeRooms} rooms` : ''}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
