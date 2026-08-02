import { useRef } from 'react';
import { Floor, Marker } from '../model/schema';
import { useStore } from '../state/store';
import {
  markerColor,
  markerIcon,
  markerVisible,
  ruleAnimation,
  stateLabel,
} from '../state/resolve';
import { iconPath } from '../ui/icons';
import { snapPoint } from './geometry';

interface Props {
  floor: Floor;
  screenToDoc: (x: number, y: number) => { x: number; y: number };
}

export function MarkersLayer({ floor, screenToDoc }: Props) {
  if (!floor.layers.entities.visible) return null;
  return (
    <g data-layer="entities">
      {floor.markers.map((m) => (
        <MarkerNode key={m.id} marker={m} floor={floor} screenToDoc={screenToDoc} />
      ))}
    </g>
  );
}

function MarkerNode({
  marker: m,
  floor,
  screenToDoc,
}: {
  marker: Marker;
  floor: Floor;
  screenToDoc: Props['screenToDoc'];
}) {
  const selected = useStore((s) => s.selection.includes(m.id));
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const states = useStore((s) => s.states);
  const drag = useRef<{
    start: { x: number; y: number };
    origins: Map<string, { x: number; y: number }>;
    moved: boolean;
  } | null>(null);

  const preview = mode === 'preview';
  if (preview && !markerVisible(m, states)) return null;

  const locked = floor.layers.entities.locked;
  const color = preview ? markerColor(m, states) : m.style.color;
  const icon = preview ? markerIcon(m, states) : m.style.icon;
  const anim = preview ? ruleAnimation(m.stateRules, states, m.entities[0]) : null;
  const size = m.style.size;

  function onPointerDown(e: React.PointerEvent) {
    if (mode === 'preview' || tool !== 'select' || locked) return;
    e.stopPropagation();
    const { select, selection, beginHistory } = useStore.getState();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let sel = selection;
    if (!selection.includes(m.id)) {
      select(m.id, additive);
      sel = additive ? [...selection, m.id] : [m.id];
    }
    beginHistory();
    const project = useStore.getState().project;
    const fl = project.floors.find((f) => f.id === floor.id)!;
    const origins = new Map<string, { x: number; y: number }>();
    for (const mk of fl.markers)
      if (sel.includes(mk.id)) origins.set(mk.id, { x: mk.x, y: mk.y });
    drag.current = { start: screenToDoc(e.clientX, e.clientY), origins, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const cur = screenToDoc(e.clientX, e.clientY);
    const dx = cur.x - drag.current.start.x;
    const dy = cur.y - drag.current.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) drag.current.moved = true;
    const grid = useStore.getState().project.settings;
    const snap = grid.snapGrid ? grid.grid : 0;
    useStore.getState().commit(
      (p) => {
        const fl = p.floors.find((f) => f.id === floor.id)!;
        for (const mk of fl.markers) {
          const o = drag.current!.origins.get(mk.id);
          if (!o) continue;
          const np = snap ? snapPoint({ x: o.x + dx, y: o.y + dy }, snap) : { x: o.x + dx, y: o.y + dy };
          mk.x = np.x;
          mk.y = np.y;
        }
      },
      { history: false },
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag.current && !drag.current.moved) {
      // treat as a plain click (selection already handled on down)
    }
    drag.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const labelText =
    m.style.type === 'label' || m.style.showState
      ? m.style.showState && m.entities[0]
        ? stateLabel(m.entities[0], states)
        : m.style.label ?? m.entities[0] ?? ''
      : m.style.label ?? '';

  return (
    <g
      transform={`translate(${m.x} ${m.y})`}
      style={{ cursor: mode === 'edit' && !locked ? 'move' : 'pointer' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={anim ? `fp-anim-${anim}` : undefined}
    >
      {/* selection ring */}
      {selected && mode === 'edit' && (
        <circle r={size * 0.72} fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="4 3" />
      )}

      {m.style.type === 'dot' && <circle r={size * 0.4} fill={color} stroke="#fff" strokeWidth={2} />}

      {m.style.type === 'icon' && (
        <>
          <circle r={size * 0.5} fill="rgba(20,24,33,0.55)" />
          <path
            d={iconPath(icon)}
            fill={color}
            transform={`translate(${-size * 0.35} ${-size * 0.35}) scale(${(size * 0.7) / 24})`}
          />
        </>
      )}

      {m.style.type === 'image' && m.style.image && (
        <image
          href={m.style.image}
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid meet"
        />
      )}

      {m.style.type === 'svg' && m.style.svg && (
        <g
          transform={`scale(${size / 24})`}
          dangerouslySetInnerHTML={{ __html: m.style.svg }}
        />
      )}

      {labelText && (
        <text
          y={size * 0.5 + 14}
          textAnchor="middle"
          fontFamily={m.style.fontFamily || undefined}
          fontSize={m.style.fontSize ?? 13}
          fontWeight={m.style.fontWeight ?? 600}
          fill={m.style.fontColor || '#fff'}
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.6)', strokeWidth: 3 }}
        >
          {labelText}
        </text>
      )}
    </g>
  );
}
