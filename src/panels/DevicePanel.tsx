// Devices palette section — the daily path of the deviceSources
// capability: pick an integration's source, fetch live, tick devices,
// place in one undo step. Placement previews (room match / staging row)
// show as inline badges instead of the old modal table.
//
// Paste / file / project-merge import stays in the DeviceImportModal —
// the "More…" button opens it as the offline/advanced path.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { iconPath } from '../ui/icons';
import { liveWsCaller } from '../ha/wsCaller';
import {
  getDeviceSources,
  getIconMap,
  getMarkerDefaults,
  getRoomSources,
  getStateRulePresets,
  subscribePlugins,
} from '../plugins/registry';
import type { DeviceSourceProvider, DeviceTopology, ImportedFloorRooms } from '../plugins/types';
import {
  applyPlan,
  applyRoomSourceMerge,
  defaultSelection,
  planDeviceImport,
  planRoomSourceMerge,
  RowStatus,
} from '../import/plan';

const FALLBACK_COLOR = '#ffc107';

const STATUS_TEXT: Record<RowStatus, string> = {
  room: 'room',
  staging: 'staged',
  exists: 'on plan',
  'no-entities': 'no entities',
  off: 'skipped',
};

export function DevicePanel({ onOpenImport }: { onOpenImport: () => void }) {
  const project = useStore((s) => s.project);
  const entities = useStore((s) => s.entities);
  const usingDemo = useStore((s) => s.usingDemo);
  useStore((s) => s.conn); // re-render when the HA link changes
  const call = liveWsCaller();

  const [, bump] = useState(0);
  useEffect(() => subscribePlugins(() => bump((x) => x + 1)), []);
  const sources = getDeviceSources().filter((s) => s.source.fetch);

  const [sourceKey, setSourceKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [topo, setTopo] = useState<DeviceTopology | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markerSize, setMarkerSize] = useState(32);
  const [labels, setLabels] = useState(true);
  const [extraEntities, setExtraEntities] = useState(true);
  const [stateRules, setStateRules] = useState(true);
  const [allFloors, setAllFloors] = useState(true);
  const [importRooms, setImportRooms] = useState(false);
  const [roomFloors, setRoomFloors] = useState<ImportedFloorRooms[] | null>(null);

  const ctx = useMemo(() => ({ entities, usingDemo }), [entities, usingDemo]);
  const active: { pluginId: string; source: DeviceSourceProvider } | undefined =
    sources.find((s) => `${s.pluginId}:${s.source.id}` === sourceKey) ?? sources[0];
  const roomSource = useMemo(() => {
    if (!active) return undefined;
    const all = getRoomSources();
    return (
      all.find((r) => r.pluginId === active.pluginId && r.source.deviceSourceId === active.source.id) ??
      all.find((r) => r.pluginId === active.pluginId)
    );
  }, [active]);

  async function fetchSource(src?: DeviceSourceProvider) {
    const s = src ?? active?.source;
    if (!s?.fetch || !call) return;
    setBusy(true);
    setMsg(null);
    try {
      const [{ topology, note }, roomsRes] = await Promise.all([
        s.fetch(call, ctx),
        roomSource?.source.fetch ? roomSource.source.fetch(call, ctx).catch(() => null) : Promise.resolve(null),
      ]);
      setTopo(topology);
      setRoomFloors(roomsRes?.floors ?? null);
      setSelected(defaultSelection(useStore.getState().project, topology));
      setMsg({
        kind: 'info',
        text: `${topology.devices.length} devices from ${topology.sourceLabel ?? topology.source}.${note ? ' ' + note : ''}`,
      });
    } catch (e) {
      setTopo(null);
      setRoomFloors(null);
      setMsg({ kind: 'err', text: (e as Error).message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  // Auto-update: fetch on first mount / source switch (not per render).
  useEffect(() => {
    if (!topo && call && active?.source.fetch && !busy) void fetchSource(active.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, call]);

  const roomMerge = useMemo(
    () =>
      importRooms && roomFloors
        ? planRoomSourceMerge(project, roomFloors, project.activeFloorId)
        : null,
    [project, importRooms, roomFloors],
  );
  const newRoomCount = useMemo(
    () => (roomMerge ? roomMerge.reduce((n, m) => n + m.rooms.length, 0) : 0),
    [roomMerge],
  );

  // When `importRooms` is ticked, plan device placement against a virtual
  // project that already contains the incoming rooms so room-match badges
  // and centroid positions reflect the merged geometry immediately.
  const effectiveProject = useMemo(() => {
    if (!roomMerge || newRoomCount === 0) return project;
    const clone = structuredClone(project);
    applyRoomSourceMerge(clone, roomMerge);
    return clone;
  }, [project, roomMerge, newRoomCount]);

  const plan = useMemo(
    () =>
      topo
        ? planDeviceImport(effectiveProject, topo, effectiveProject.activeFloorId, {
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
    [effectiveProject, topo, selected, markerSize, labels, extraEntities, stateRules, allFloors],
  );

  const counts = useMemo(() => {
    const c = { room: 0, staging: 0, exists: 0 };
    for (const r of plan?.rows ?? []) {
      if (r.status === 'room') c.room++;
      if (r.status === 'staging') c.staging++;
      if (r.status === 'exists') c.exists++;
    }
    return c;
  }, [plan]);

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
        topo.devices
          .filter((d) => d.primary_entity && d.entities.length && pred(d.group))
          .map((d) => d.device_id),
      ),
    );
  }

  function place() {
    if (!plan || (plan.adds.length === 0 && newRoomCount === 0)) return;
    let ids: string[] = [];
    let roomIds: string[] = [];
    useStore.getState().commit((p) => {
      if (roomMerge && newRoomCount > 0) roomIds = applyRoomSourceMerge(p, roomMerge);
      ids = applyPlan(p, plan);
    });
    const st = useStore.getState();
    st.select(ids.length ? ids : roomIds);
    st.setTool('select');
    const parts: string[] = [];
    if (roomIds.length) parts.push(`Imported ${roomIds.length} room${roomIds.length === 1 ? '' : 's'}`);
    if (ids.length) parts.push(`Added ${ids.length} marker${ids.length === 1 ? '' : 's'}`);
    if (counts.room) parts.push(`${counts.room} in matching rooms`);
    if (counts.staging) parts.push(`${counts.staging} staged at the bottom edge`);
    setMsg({ kind: 'ok', text: parts.join(' · ') + '. Ctrl+Z undoes it.' });
  }

  const iconMap = getIconMap();
  const addCount = plan?.adds.length ?? 0;
  const canPlace = addCount > 0 || newRoomCount > 0;

  return (
    <div className="fp-panel fp-devices">
      <div className="fp-panel-title">
        Devices
        <button className="fp-mini" style={{ marginLeft: 'auto' }} onClick={onOpenImport} title="Paste / file / project-merge import">
          More…
        </button>
      </div>

      <div className="fp-dev-source-row">
        <select
          value={active ? `${active.pluginId}:${active.source.id}` : ''}
          onChange={(e) => {
            setSourceKey(e.target.value);
            setTopo(null);
            setMsg(null);
          }}
          disabled={!sources.length}
        >
          {sources.map(({ pluginId, source }) => (
            <option key={`${pluginId}:${source.id}`} value={`${pluginId}:${source.id}`}>
              {source.title}
            </option>
          ))}
          {!sources.length && <option value="">no device sources</option>}
        </select>
        <button
          className="fp-mini"
          disabled={!call || !active?.source.fetch || busy}
          onClick={() => fetchSource()}
          title="Re-read devices from this source"
        >
          {busy ? '…' : '↻'}
        </button>
      </div>
      {!call && <div className="fp-hint">Connect to Home Assistant to fetch devices.</div>}
      {active?.source.description && <div className="fp-hint">{active.source.description}</div>}

      {msg && <div className={`fp-note ${msg.kind === 'info' ? '' : msg.kind}`}>{msg.text}</div>}

      {topo && plan && (
        <>
          <div className="fp-rx-row fp-rx-select">
            <button className="fp-mini" onClick={() => selectWhere(() => true)}>all</button>
            {groups.map((g) => (
              <button key={g} className="fp-mini" onClick={() => selectWhere((x) => x === g)}>
                {g}
              </button>
            ))}
            <button className="fp-mini" onClick={() => setSelected(new Set())}>none</button>
          </div>

          <div className="fp-dev-list">
            {plan.rows.map((r) => {
              const d = r.device;
              const selectable = !!d.primary_entity && d.entities.length > 0 && r.status !== 'exists';
              return (
                <label key={d.device_id} className={`fp-dev-row ${selectable ? '' : 'dim'}`}>
                  <input
                    type="checkbox"
                    disabled={!selectable}
                    checked={selectable && selected.has(d.device_id)}
                    onChange={() => toggle(d.device_id)}
                  />
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
                    <path d={iconPath(d.icon ?? iconMap[d.device_class] ?? 'help-circle')} fill={d.color ?? FALLBACK_COLOR} />
                  </svg>
                  <span className="fp-dev-name">
                    {d.display_name}
                    <span className="fp-dev-sub">
                      {d.kind ?? d.device_class}
                      {d.area_name ? ` · ${d.area_name}` : ''}
                    </span>
                  </span>
                  <span className={`fp-rx-status ${r.status}`} title={r.roomName ?? undefined}>
                    {r.status === 'room' ? r.roomName ?? STATUS_TEXT[r.status] : STATUS_TEXT[r.status]}
                  </span>
                </label>
              );
            })}
          </div>

          {roomSource && (
            <label className="fp-check" title={roomSource.source.description ?? roomSource.source.title}>
              <input
                type="checkbox"
                checked={importRooms}
                onChange={(e) => setImportRooms(e.target.checked)}
              />
              Also import rooms from source{roomFloors ? ` (${newRoomCount} new)` : ''}
            </label>
          )}

          <details className="fp-dev-opts">
            <summary>Options</summary>
            <label className="fp-check">
              <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
              Device names as labels
            </label>
            <label className="fp-check">
              <input type="checkbox" checked={extraEntities} onChange={(e) => setExtraEntities(e.target.checked)} />
              Attach measurement entities
            </label>
            <label className="fp-check">
              <input type="checkbox" checked={stateRules} onChange={(e) => setStateRules(e.target.checked)} />
              State rules (offline, battery, heat demand)
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
                style={{ width: 56 }}
              />
            </label>
          </details>

          <div className="fp-rx-row fp-dev-footer">
            <button className="fp-primary" disabled={!canPlace} onClick={place}>
              {newRoomCount > 0 && addCount > 0
                ? `Import ${newRoomCount} room${newRoomCount === 1 ? '' : 's'} & place ${addCount}`
                : newRoomCount > 0
                  ? `Import ${newRoomCount} room${newRoomCount === 1 ? '' : 's'}`
                  : `Place ${addCount} marker${addCount === 1 ? '' : 's'}`}
            </button>
            <span className="fp-rx-summary">
              {counts.room} in rooms · {counts.staging} staged · {counts.exists} placed
            </span>
          </div>
        </>
      )}
    </div>
  );
}
