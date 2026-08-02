import { useRef } from 'react';
import { activeFloor, useStore } from '../state/store';
import { Floor, Marker, MarkerStyleType, Room, Wall } from '../model/schema';
import { defaultActions } from '../model/defaults';
import { ColorInput, Field, NumberInput, Select, Slider, TextInput } from '../ui/inputs';
import { IconPicker } from '../ui/IconPicker';
import { resolveEntityIcon } from '../model/haIcons';
import { loadImageFile } from '../ui/imageLoad';
import { StateRuleEditor } from './StateRuleEditor';
import { ActionEditor } from './ActionEditor';

export function Inspector() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const floor = activeFloor(project);

  const marker = floor.markers.find((m) => selection.includes(m.id));
  const room = floor.rooms.find((r) => selection.includes(r.id));
  const wall = floor.walls.find((w) => selection.includes(w.id));

  return (
    <div className="fp-panel fp-inspector">
      {selection.length > 1 ? (
        <MultiInfo count={selection.length} />
      ) : marker ? (
        <MarkerEditor marker={marker} floor={floor} />
      ) : room ? (
        <RoomEditor room={room} floor={floor} />
      ) : wall ? (
        <WallEditor wall={wall} floor={floor} />
      ) : (
        <BackgroundEditor floor={floor} />
      )}
    </div>
  );
}

function MultiInfo({ count }: { count: number }) {
  return (
    <>
      <div className="fp-panel-title">{count} items selected</div>
      <div className="fp-hint">Drag to move together, arrow keys to nudge, Ctrl+D to duplicate, Del to delete.</div>
    </>
  );
}

// ---------------------------------------------------------------------------
function BackgroundEditor({ floor }: { floor: Floor }) {
  const commit = useStore((s) => s.commit);
  const fileRef = useRef<HTMLInputElement>(null);
  const b = floor.background;

  async function onFile(file?: File | null) {
    if (!file) return;
    const img = await loadImageFile(file);
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

  function setBg(patch: Partial<Floor['background']>) {
    commit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)!;
      f.background = { ...f.background, ...patch };
    });
  }

  return (
    <>
      <div className="fp-panel-title">Background & canvas</div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button className="fp-add" onClick={() => fileRef.current?.click()}>
        {b.dataUri ? 'Replace image…' : 'Upload image…'}
      </button>
      <div className="fp-hint">…or paste (Ctrl+V) / drag-drop an image onto the canvas.</div>

      {b.dataUri && (
        <>
          <Field label="Opacity">
            <Slider value={b.opacity} onChange={(v) => setBg({ opacity: v })} />
          </Field>
          <Field label="Scale">
            <Slider value={b.scale} min={0.1} max={4} step={0.05} onChange={(v) => setBg({ scale: v })} />
          </Field>
          <div className="fp-row2">
            <Field label="X"><NumberInput value={b.x} onChange={(v) => setBg({ x: v })} /></Field>
            <Field label="Y"><NumberInput value={b.y} onChange={(v) => setBg({ y: v })} /></Field>
          </div>
          <Field label="Rotation°">
            <NumberInput value={b.rotation} onChange={(v) => setBg({ rotation: v })} />
          </Field>
          <label className="fp-check">
            <input type="checkbox" checked={b.locked} onChange={(e) => setBg({ locked: e.target.checked })} />
            Lock background layer
          </label>
        </>
      )}

      <div className="fp-divider" />
      <div className="fp-row2">
        <Field label="Canvas W">
          <NumberInput value={floor.canvas.width} onChange={(v) => commit((p) => void (p.floors.find((f) => f.id === floor.id)!.canvas.width = v))} />
        </Field>
        <Field label="Canvas H">
          <NumberInput value={floor.canvas.height} onChange={(v) => commit((p) => void (p.floors.find((f) => f.id === floor.id)!.canvas.height = v))} />
        </Field>
      </div>
      <GridControls />
    </>
  );
}

function GridControls() {
  const settings = useStore((s) => s.project.settings);
  const commit = useStore((s) => s.commit);
  return (
    <>
      <div className="fp-divider" />
      <Field label="Grid size (px)">
        <NumberInput value={settings.grid} onChange={(v) => commit((p) => void (p.settings.grid = v))} />
      </Field>
      <label className="fp-check">
        <input type="checkbox" checked={settings.snapGrid} onChange={(e) => commit((p) => void (p.settings.snapGrid = e.target.checked))} />
        Snap to grid
      </label>
      <label className="fp-check">
        <input type="checkbox" checked={settings.snapAngle} onChange={(e) => commit((p) => void (p.settings.snapAngle = e.target.checked))} />
        Snap wall angles (15°)
      </label>
    </>
  );
}

// ---------------------------------------------------------------------------
function MarkerEditor({ marker, floor }: { marker: Marker; floor: Floor }) {
  const commit = useStore((s) => s.commit);
  const states = useStore((s) => s.states);
  const entities = useStore((s) => s.entities);
  function set(patch: (m: Marker) => void) {
    commit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)!;
      const m = f.markers.find((mm) => mm.id === marker.id)!;
      patch(m);
    });
  }

  return (
    <>
      <div className="fp-panel-title">Marker</div>

      <div className="fp-subtitle">Entities</div>
      {marker.entities.map((e, i) => (
        <div key={i} className="fp-entity-chip">
          <input
            value={e}
            onChange={(ev) => set((m) => void (m.entities[i] = ev.target.value))}
          />
          <button className="fp-icon-btn" onClick={() => set((m) => m.entities.splice(i, 1))}>✕</button>
        </div>
      ))}
      <button className="fp-add" onClick={() => set((m) => m.entities.push(''))}>+ Add entity</button>
      {marker.entities.length > 1 && (
        <Field label="Group element id (for ha-floorplan)">
          <TextInput
            value={marker.elementId ?? ''}
            placeholder="e.g. living_lights"
            onChange={(v) => set((m) => void (m.elementId = v || undefined))}
          />
        </Field>
      )}

      <div className="fp-divider" />
      <div className="fp-subtitle">Style</div>
      <Field label="Type">
        <Select<MarkerStyleType>
          value={marker.style.type}
          onChange={(v) => set((m) => void (m.style.type = v))}
          options={[
            { value: 'icon', label: 'MDI icon' },
            { value: 'dot', label: 'Dot / badge' },
            { value: 'label', label: 'State label' },
            { value: 'image', label: 'Image' },
            { value: 'svg', label: 'Custom SVG' },
          ]}
        />
      </Field>
      {marker.style.type === 'icon' && (
        <Field label="Icon (any Home Assistant / MDI name)">
          <IconPicker value={marker.style.icon} onChange={(v) => set((m) => void (m.style.icon = v))} />
          {marker.entities[0] && (
            <button
              className="fp-mini"
              style={{ marginTop: 4 }}
              onClick={() =>
                set(
                  (m) =>
                    void (m.style.icon = resolveEntityIcon(
                      m.entities[0],
                      states[m.entities[0]],
                      entities.find((e) => e.entity_id === m.entities[0])?.icon,
                    )),
                )
              }
            >
              ↺ Use Home Assistant's icon
            </button>
          )}
        </Field>
      )}
      <div className="fp-row2">
        <Field label="Color"><ColorInput value={marker.style.color} onChange={(v) => set((m) => void (m.style.color = v))} /></Field>
        <Field label="Size"><NumberInput value={marker.style.size} min={8} onChange={(v) => set((m) => void (m.style.size = v))} /></Field>
      </div>
      <Field label="Static label">
        <TextInput value={marker.style.label ?? ''} onChange={(v) => set((m) => void (m.style.label = v))} />
      </Field>
      <div className="fp-row2">
        <Field label="Font size (px)">
          <NumberInput
            value={marker.style.fontSize ?? 13}
            min={6}
            onChange={(v) => set((m) => void (m.style.fontSize = v))}
          />
        </Field>
        <Field label="Text color">
          <ColorInput
            value={marker.style.fontColor ?? '#ffffff'}
            onChange={(v) => set((m) => void (m.style.fontColor = v))}
          />
        </Field>
      </div>
      <div className="fp-row2">
        <Field label="Font family">
          <TextInput
            value={marker.style.fontFamily ?? ''}
            placeholder="sans-serif"
            onChange={(v) => set((m) => void (m.style.fontFamily = v || undefined))}
          />
        </Field>
        <Field label="Weight (100–900)">
          <NumberInput
            value={marker.style.fontWeight ?? 600}
            min={100}
            max={900}
            step={100}
            onChange={(v) => set((m) => void (m.style.fontWeight = v))}
          />
        </Field>
      </div>
      <label className="fp-check">
        <input type="checkbox" checked={!!marker.style.showState} onChange={(e) => set((m) => void (m.style.showState = e.target.checked))} />
        Show live state value + unit
      </label>
      <label className="fp-check">
        <input type="checkbox" checked={!!marker.style.pulse} onChange={(e) => set((m) => void (m.style.pulse = e.target.checked))} />
        Pulse while on (animation)
      </label>
      {marker.style.type === 'svg' && (
        <Field label="Inner SVG markup">
          <textarea rows={3} value={marker.style.svg ?? ''} onChange={(e) => set((m) => void (m.style.svg = e.target.value))} />
        </Field>
      )}

      <div className="fp-divider" />
      <div className="fp-subtitle">Position</div>
      <div className="fp-row2">
        <Field label="X"><NumberInput value={marker.x} onChange={(v) => set((m) => void (m.x = v))} /></Field>
        <Field label="Y"><NumberInput value={marker.y} onChange={(v) => set((m) => void (m.y = v))} /></Field>
      </div>

      <div className="fp-divider" />
      <div className="fp-subtitle">State-based styling</div>
      <StateRuleEditor
        rules={marker.stateRules}
        fallbackEntity={marker.entities[0]}
        showAnimation
        showIcon
        onChange={(next) => set((m) => void (m.stateRules = next))}
      />

      <div className="fp-divider" />
      <div className="fp-subtitle">Conditional visibility</div>
      <Field label="Show only when entity…">
        <TextInput
          value={marker.visibility?.entityId ?? ''}
          placeholder="entity_id (blank = always)"
          onChange={(v) => set((m) => void (m.visibility = v ? { entityId: v, state: m.visibility?.state } : null))}
        />
      </Field>
      {marker.visibility?.entityId && (
        <Field label="…equals state (blank = is on)">
          <TextInput value={marker.visibility.state ?? ''} onChange={(v) => set((m) => void (m.visibility = { entityId: marker.visibility!.entityId, state: v }))} />
        </Field>
      )}

      <div className="fp-divider" />
      <div className="fp-subtitle">Actions</div>
      <ActionEditor label="Tap" action={marker.actions.tap} onChange={(a) => set((m) => void (m.actions.tap = a))} />
      <ActionEditor label="Hold" action={marker.actions.hold} onChange={(a) => set((m) => void (m.actions.hold = a))} />
      <ActionEditor label="Double tap" action={marker.actions.double} onChange={(a) => set((m) => void (m.actions.double = a))} />
    </>
  );
}

// ---------------------------------------------------------------------------
function RoomEditor({ room, floor }: { room: Room; floor: Floor }) {
  const commit = useStore((s) => s.commit);
  const areas = useStore((s) => s.entities);
  const areaIds = Array.from(new Set(areas.map((e) => e.area_id).filter(Boolean))) as string[];
  function set(patch: (r: Room) => void) {
    commit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)!;
      patch(f.rooms.find((rr) => rr.id === room.id)!);
    });
  }
  return (
    <>
      <div className="fp-panel-title">Room</div>
      <Field label="Name"><TextInput value={room.name} onChange={(v) => set((r) => void (r.name = v))} /></Field>
      <Field label="HA area (optional)">
        <Select
          value={room.areaId ?? ''}
          onChange={(v) => set((r) => void (r.areaId = v || undefined))}
          options={[{ value: '', label: '— none —' }, ...areaIds.map((a) => ({ value: a, label: a }))]}
        />
      </Field>
      <div className="fp-row2">
        <Field label="Fill"><ColorInput value={room.fill} onChange={(v) => set((r) => void (r.fill = v))} /></Field>
        <Field label="Opacity"><Slider value={room.opacity} onChange={(v) => set((r) => void (r.opacity = v))} /></Field>
      </div>
      <div className="fp-divider" />
      <div className="fp-subtitle">State-based coloring</div>
      <StateRuleEditor rules={room.stateRules} onChange={(next) => set((r) => void (r.stateRules = next))} />
      <div className="fp-divider" />
      <div className="fp-subtitle">Click action</div>
      <ActionEditor label="Tap" action={room.actions?.tap ?? defaultActions().tap} onChange={(a) => set((r) => void (r.actions = { ...(r.actions ?? defaultActions()), tap: a }))} />
    </>
  );
}

// ---------------------------------------------------------------------------
function WallEditor({ wall, floor }: { wall: Wall; floor: Floor }) {
  const commit = useStore((s) => s.commit);
  function set(patch: (w: Wall) => void) {
    commit((p) => {
      const f = p.floors.find((x) => x.id === floor.id)!;
      patch(f.walls.find((ww) => ww.id === wall.id)!);
    });
  }
  return (
    <>
      <div className="fp-panel-title">Wall</div>
      <div className="fp-row2">
        <Field label="Thickness"><NumberInput value={wall.thickness} min={1} onChange={(v) => set((w) => void (w.thickness = v))} /></Field>
        <Field label="Color"><ColorInput value={wall.color} onChange={(v) => set((w) => void (w.color = v))} /></Field>
      </div>
      <div className="fp-hint">{wall.points.length} points. Doors/windows can snap onto this wall.</div>
    </>
  );
}
