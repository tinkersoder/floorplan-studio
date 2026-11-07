// Generic "Import devices" modal — the editor side of the deviceSources
// capability. Registered providers (src/plugins/types.ts) supply fetch/parse;
// this modal only knows the neutral DeviceTopology contract: tick devices,
// preview placement (room match / staging row), apply in one undo step.
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Modal } from '../ui/Modal';
import { iconPath } from '../ui/icons';
import type { Project } from '../model/schema';
import { liveWsCaller } from '../ha/wsCaller';
import {
  getDeviceSources,
  getIconMap,
  getMarkerDefaults,
  getStateRulePresets,
} from '../plugins/registry';
import type { DeviceTopology, ParsedSourceInput } from '../plugins/types';
import {
  applyMerge,
  applyPlan,
  defaultSelection,
  planProjectMerge,
  planDeviceImport,
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

const FALLBACK_COLOR = '#ffc107';

function isProject(v: unknown): v is Project {
  return !!v && typeof v === 'object' && Array.isArray((v as { floors?: unknown }).floors);
}

export function DeviceImportModal({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const entities = useStore((s) => s.entities);
  const usingDemo = useStore((s) => s.usingDemo);
  useStore((s) => s.conn); // re-render when the HA link changes
  const call = liveWsCaller();

  const sources = getDeviceSources();
  const ctx = useMemo(() => ({ entities, usingDemo }), [entities, usingDemo]);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [topo, setTopo] = useState<DeviceTopology | null>(null);
  const [incoming, setIncoming] = useState<Project | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markerSize, setMarkerSize] = useState(32);
  const [labels, setLabels] = useState(true);
  const [extraEntities, setExtraEntities] = useState(true);
  const [stateRules, setStateRules] = useState(true);
  const [allFloors, setAllFloors] = useState(true);
  const [includeRooms, setIncludeRooms] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadTopology(t: DeviceTopology, note?: string) {
    setTopo(t);
    setIncoming(null);
    setSelected(defaultSelection(useStore.getState().project, t));
    setMsg({
      kind: 'info',
      text: `${t.devices.length} devices from ${t.sourceLabel ?? t.source}.${note ? ' ' + note : ''}`,
    });
  }

  async function fetchSource(id: string) {
    const src = sources.find((s) => s.source.id === id)?.source;
    if (!src?.fetch || !call) return;
    setBusy(true);
    setMsg(null);
    try {
      const { topology, note } = await src.fetch(call, ctx);
      loadTopology(topology, note);
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  function parse(src: string) {
    // A raw studio project merges without needing a provider's parser.
    try {
      const data = JSON.parse(src);
      const unwrapped = (data as { project_json?: unknown })?.project_json ?? data;
      if (typeof unwrapped === 'string') {
        const inner = JSON.parse(unwrapped);
        if (isProject(inner)) return loadProject(inner);
      }
      if (isProject(unwrapped)) return loadProject(unwrapped);
    } catch {
      /* not JSON — fall through to provider parsers */
    }
    for (const { source } of sources) {
      if (!source.parse) continue;
      let r: ParsedSourceInput;
      try {
        r = source.parse(src, ctx);
      } catch (e) {
        setMsg({ kind: 'err', text: `${source.title}: ${(e as Error).message || e}` });
        return;
      }
      switch (r.kind) {
        case 'topology':
          return loadTopology(r.topology, r.note);
        case 'project':
          return loadProject(r.project);
        case 'error':
          return setMsg({ kind: 'err', text: r.error });
        default:
          continue; // nomatch — try the next source
      }
    }
    setMsg({
      kind: 'err',
      text: sources.some((s) => s.source.parse)
        ? 'No registered source recognised this input.'
        : 'No source can parse pasted input — connect to Home Assistant and fetch devices instead.',
    });
  }

  function loadProject(p: Project) {
    setTopo(null);
    setIncoming(p);
    setMsg({
      kind: 'info',
      text: `Studio project "${p.name ?? 'seeded'}" with ${p.floors.length} floor(s) — its markers can be merged into this project.`,
    });
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
        ? planDeviceImport(project, topo, project.activeFloorId, {
            selected,
            markerSize,
            labels,
            extraEntities,
            stateRules,
            allFloors,
            iconMap: getIconMap(),
            markerDefaults: getMarkerDefaults(),
            presets: getStateRulePresets().map((p) => p.preset),
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

  /** distinct group tokens present in the topology → one select-button each */
  const groups = useMemo(
    () => (topo ? [...new Set(topo.devices.map((d) => d.group).filter(Boolean))] : []),
    [topo],
  );

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
  const iconMap = getIconMap();

  return (
    <Modal title="Import devices" onClose={onClose} wide>
      <p className="fp-modal-intro">
        Drop devices onto the plan as markers. Devices whose HA area matches a room (the room's{' '}
        <em>HA area</em> or its name) land inside that room; the rest wait in a staging row at the bottom of
        the floor. Sources below are contributed by registered integrations.
      </p>

      <div className="fp-rx-sources">
        <div className="fp-rx-source">
          <div className="fp-subtitle">From Home Assistant</div>
          {sources.filter((s) => s.source.fetch).length === 0 && (
            <div className="fp-hint">No live device sources registered.</div>
          )}
          {sources
            .filter((s) => s.source.fetch)
            .map(({ pluginId, source }) => (
              <div key={`${pluginId}:${source.id}`} style={{ marginBottom: 8 }}>
                <button className="fp-primary" disabled={!call || busy} onClick={() => fetchSource(source.id)}>
                  {busy ? 'Reading devices…' : source.title}
                </button>
                {source.description && <div className="fp-hint">{source.description}</div>}
              </div>
            ))}
          <div className="fp-hint">
            {call ? '' : 'Connect to Home Assistant first (top-right HA button).'}
          </div>
        </div>
        <div className="fp-rx-source">
          <div className="fp-subtitle">Paste or load</div>
          <textarea
            className="fp-rx-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              'A studio project JSON, an integration topology response,\nor any text a registered source recognises'
            }
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
              Attach measurement entities (temperature, demand…)
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
            {groups.map((g) => (
              <button key={g} className="fp-mini" onClick={() => selectWhere((x) => x === g)}>
                {g}
              </button>
            ))}
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
                            <path
                              d={iconPath(d.icon ?? iconMap[d.device_class] ?? 'help-circle')}
                              fill={d.color ?? FALLBACK_COLOR}
                            />
                          </svg>
                          {d.kind ?? d.device_class}
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
