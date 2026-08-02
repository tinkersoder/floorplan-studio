import { useEffect, useRef, useState } from 'react';
import { Point } from '../model/schema';
import { useStore, activeFloor } from '../state/store';
import { createMarker, createRoom, createWall } from '../model/defaults';
import { nanoid } from 'nanoid';
import { useViewport } from './useViewport';
import { BackgroundLayer } from './BackgroundLayer';
import { RoomsLayer } from './RoomsLayer';
import { WallsLayer } from './WallsLayer';
import { MarkersLayer } from './MarkersLayer';
import { nearestWallT, polygonPath, polylinePath, snapAngle, snapPoint } from './geometry';

type Drawing =
  | { kind: 'room'; points: Point[] }
  | { kind: 'wall'; points: Point[] }
  | null;

export function CanvasSvg() {
  const svgRef = useRef<SVGSVGElement>(null);
  const project = useStore((s) => s.project);
  const floor = activeFloor(project);
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const settings = project.settings;
  const { viewport, screenToDoc, zoomAt, panBy, fitTo } = useViewport(svgRef);

  const [drawing, setDrawing] = useState<Drawing>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const marquee = useRef<{ start: Point } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<null | { a: Point; b: Point }>(null);
  const spaceDown = useRef(false);

  // Fit view on first mount / when canvas size changes.
  useEffect(() => {
    fitTo(floor.canvas.width, floor.canvas.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.canvas.width, floor.canvas.height]);

  // Reset in-progress drawing when leaving a draw tool.
  useEffect(() => {
    if (tool !== 'room' && tool !== 'wall') setDrawing(null);
  }, [tool]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = true;
      if (e.key === 'Enter') finishDrawing();
      if (e.key === 'Escape') {
        setDrawing(null);
        useStore.getState().select(null);
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  function snap(p: Point): Point {
    return settings.snapGrid ? snapPoint(p, settings.grid) : p;
  }

  function finishDrawing() {
    if (!drawing) return;
    const { commit, select } = useStore.getState();
    if (drawing.kind === 'room' && drawing.points.length >= 3) {
      const room = createRoom(drawing.points, `Room ${floor.rooms.length + 1}`);
      commit((p) => {
        p.floors.find((f) => f.id === floor.id)!.rooms.push(room);
      });
      select(room.id);
    } else if (drawing.kind === 'wall' && drawing.points.length >= 2) {
      const wall = createWall(drawing.points);
      commit((p) => {
        p.floors.find((f) => f.id === floor.id)!.walls.push(wall);
      });
      select(wall.id);
    }
    setDrawing(null);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Only fires when the background (not a marker/room) is hit, because those
    // stopPropagation. Middle button or space => pan.
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      pan.current = { x: e.clientX, y: e.clientY };
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (mode === 'preview') return;
    const doc = snap(screenToDoc(e.clientX, e.clientY));

    if (tool === 'marker') {
      const m = createMarker(doc.x, doc.y);
      useStore.getState().commit((p) => {
        p.floors.find((f) => f.id === floor.id)!.markers.push(m);
      });
      useStore.getState().select(m.id);
      return;
    }
    if (tool === 'room') {
      setDrawing((d) =>
        d && d.kind === 'room'
          ? { kind: 'room', points: [...d.points, doc] }
          : { kind: 'room', points: [doc] },
      );
      return;
    }
    if (tool === 'wall') {
      setDrawing((d) => {
        const prev = d && d.kind === 'wall' ? d.points : [];
        const last = prev[prev.length - 1];
        const pt = last && settings.snapAngle ? snapAngle(last, doc) : doc;
        return { kind: 'wall', points: [...prev, pt] };
      });
      return;
    }
    if (tool === 'door' || tool === 'window') {
      const hit = nearestWallT(doc, floor.walls);
      if (hit && hit.d < 30) {
        const opening = {
          id: nanoid(8),
          wallId: hit.wallId,
          t: hit.t,
          width: 28,
          kind: tool,
          color: tool === 'door' ? '#fbbf24' : '#93c5fd',
        } as const;
        useStore.getState().commit((p) => {
          p.floors.find((f) => f.id === floor.id)!.openings.push({ ...opening });
        });
      }
      return;
    }
    // select tool on empty space -> start marquee / clear selection
    if (tool === 'select') {
      if (!e.shiftKey) useStore.getState().select(null);
      marquee.current = { start: doc };
      setMarqueeRect({ a: doc, b: doc });
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pan.current) {
      panBy(e.clientX - pan.current.x, e.clientY - pan.current.y);
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const doc = screenToDoc(e.clientX, e.clientY);
    if (drawing) setCursor(snap(doc));
    if (marquee.current) setMarqueeRect({ a: marquee.current.start, b: doc });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (pan.current) {
      pan.current = null;
    }
    if (marquee.current) {
      const a = marquee.current.start;
      const b = screenToDoc(e.clientX, e.clientY);
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (Math.abs(a.x - b.x) > 3 || Math.abs(a.y - b.y) > 3) {
        const ids = floor.markers
          .filter((m) => m.x >= minX && m.x <= maxX && m.y >= minY && m.y <= maxY)
          .map((m) => m.id);
        useStore.getState().select(ids);
      }
      marquee.current = null;
      setMarqueeRect(null);
    }
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const gridId = `grid-${floor.id}`;
  const showGrid = settings.grid > 0;

  return (
    <svg
      ref={svgRef}
      className="fp-canvas"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={finishDrawing}
    >
      <defs>
        <pattern id={gridId} width={settings.grid} height={settings.grid} patternUnits="userSpaceOnUse">
          <path
            d={`M ${settings.grid} 0 L 0 0 0 ${settings.grid}`}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeWidth={1 / viewport.zoom}
          />
        </pattern>
      </defs>

      <g transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}>
        {/* canvas frame */}
        <rect
          x={0}
          y={0}
          width={floor.canvas.width}
          height={floor.canvas.height}
          fill="#0b0f17"
          stroke="rgba(148,163,184,0.4)"
          strokeWidth={1 / viewport.zoom}
        />
        {showGrid && (
          <rect
            x={0}
            y={0}
            width={floor.canvas.width}
            height={floor.canvas.height}
            fill={`url(#${gridId})`}
          />
        )}

        <BackgroundLayer floor={floor} />
        <RoomsLayer floor={floor} />
        <WallsLayer floor={floor} />
        <MarkersLayer floor={floor} screenToDoc={screenToDoc} />

        {/* in-progress drawing preview */}
        {drawing && drawing.kind === 'room' && (
          <path
            d={
              polygonPath(
                cursor ? [...drawing.points, cursor] : drawing.points,
              ) || ''
            }
            fill="rgba(56,189,248,0.15)"
            stroke="#38bdf8"
            strokeWidth={1.5 / viewport.zoom}
          />
        )}
        {drawing && drawing.kind === 'wall' && (
          <path
            d={polylinePath(cursor ? [...drawing.points, cursor] : drawing.points)}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={4 / viewport.zoom}
            strokeDasharray={`${6 / viewport.zoom} ${4 / viewport.zoom}`}
          />
        )}
        {drawing &&
          drawing.points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4 / viewport.zoom} fill="#38bdf8" />
          ))}

        {marqueeRect && (
          <rect
            x={Math.min(marqueeRect.a.x, marqueeRect.b.x)}
            y={Math.min(marqueeRect.a.y, marqueeRect.b.y)}
            width={Math.abs(marqueeRect.a.x - marqueeRect.b.x)}
            height={Math.abs(marqueeRect.a.y - marqueeRect.b.y)}
            fill="rgba(56,189,248,0.12)"
            stroke="#38bdf8"
            strokeWidth={1 / viewport.zoom}
          />
        )}
      </g>
    </svg>
  );
}
