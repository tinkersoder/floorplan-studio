import { Floor, Room } from '../model/schema';
import { useStore } from '../state/store';
import { roomFill } from '../state/resolve';
import { centroid, polygonPath } from './geometry';

interface Props {
  floor: Floor;
}

export function RoomsLayer({ floor }: Props) {
  if (!floor.layers.rooms.visible) return null;
  return (
    <g data-layer="rooms">
      {floor.rooms.map((r) => (
        <RoomNode key={r.id} room={r} floor={floor} />
      ))}
    </g>
  );
}

function RoomNode({ room, floor }: { room: Room; floor: Floor }) {
  const selected = useStore((s) => s.selection.includes(room.id));
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const states = useStore((s) => s.states);
  const select = useStore((s) => s.select);

  const fill = mode === 'preview' ? roomFill(room, states) : room.fill;
  const c = centroid(room.polygon);
  const locked = floor.layers.rooms.locked;

  return (
    <g
      data-room={room.id}
      onPointerDown={(e) => {
        if (mode === 'preview' || tool !== 'select' || locked) return;
        e.stopPropagation();
        select(room.id, e.shiftKey);
      }}
      style={{ cursor: mode === 'edit' && !locked ? 'pointer' : 'default' }}
    >
      <path
        d={polygonPath(room.polygon)}
        fill={fill}
        fillOpacity={room.opacity}
        stroke={selected ? '#38bdf8' : fill}
        strokeWidth={selected ? 2.5 : 1}
        strokeDasharray={selected ? '5 3' : undefined}
      />
      {room.name && (
        <text
          x={c.x}
          y={c.y}
          textAnchor="middle"
          fontSize={16}
          fontWeight={600}
          fill="#fff"
          pointerEvents="none"
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.55)', strokeWidth: 3 }}
        >
          {room.name}
        </text>
      )}
    </g>
  );
}
