import { Floor } from '../model/schema';
import { useStore } from '../state/store';
import { pointAlongWall, polylinePath } from './geometry';

export function WallsLayer({ floor }: { floor: Floor }) {
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const select = useStore((s) => s.select);
  if (!floor.layers.walls.visible) return null;
  const locked = floor.layers.walls.locked;

  return (
    <g data-layer="walls" strokeLinecap="round" strokeLinejoin="round">
      {floor.walls.map((w) => (
        <path
          key={w.id}
          d={polylinePath(w.points)}
          fill="none"
          stroke={selection.includes(w.id) ? '#38bdf8' : w.color}
          strokeWidth={w.thickness}
          onPointerDown={(e) => {
            if (mode === 'preview' || tool !== 'select' || locked) return;
            e.stopPropagation();
            select(w.id, e.shiftKey);
          }}
          style={{ cursor: mode === 'edit' && !locked ? 'pointer' : 'default' }}
        />
      ))}
      {floor.openings.map((o) => {
        const wall = floor.walls.find((w) => w.id === o.wallId);
        if (!wall) return null;
        const p = pointAlongWall(wall, o.t);
        const isDoor = o.kind === 'door';
        return (
          <rect
            key={o.id}
            x={p.x - o.width / 2}
            y={p.y - (wall.thickness + 4) / 2}
            width={o.width}
            height={wall.thickness + 4}
            fill={isDoor ? '#fbbf24' : '#93c5fd'}
            stroke="#0f172a"
            strokeWidth={1}
            onPointerDown={(e) => {
              if (mode === 'preview' || tool !== 'select' || locked) return;
              e.stopPropagation();
              select(o.id, e.shiftKey);
            }}
          />
        );
      })}
    </g>
  );
}
