import { Point, Wall } from '../model/schema';

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Snap a value to the nearest grid multiple. */
export const snapToGrid = (v: number, grid: number) =>
  grid > 0 ? Math.round(v / grid) * grid : v;

export const snapPoint = (p: Point, grid: number): Point => ({
  x: snapToGrid(p.x, grid),
  y: snapToGrid(p.y, grid),
});

/**
 * Constrain a segment end so the angle from `from` snaps to 15° increments.
 * Used by the wall tool when angle-snap is on.
 */
export function snapAngle(from: Point, to: Point, stepDeg = 15): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  const step = (stepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
}

/** Centroid of a polygon (for label placement). */
export function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export const polygonPath = (points: Point[]): string =>
  points.length === 0
    ? ''
    : 'M ' + points.map((p) => `${p.x},${p.y}`).join(' L ') + ' Z';

export const polylinePath = (points: Point[]): string =>
  points.length === 0 ? '' : 'M ' + points.map((p) => `${p.x},${p.y}`).join(' L ');

/** Point at parameter t (0..1) along a multi-segment wall. */
export function pointAlongWall(wall: Wall, t: number): Point {
  const pts = wall.points;
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  const segLens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    segLens.push(l);
    total += l;
  }
  let target = t * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const f = segLens[i] === 0 ? 0 : target / segLens[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
      };
    }
    target -= segLens[i];
  }
  return pts[pts.length - 1];
}

/** Project a document point onto the nearest wall, returning wall id + t. */
export function nearestWallT(
  point: Point,
  walls: Wall[],
): { wallId: string; t: number; d: number } | null {
  let best: { wallId: string; t: number; d: number } | null = null;
  for (const w of walls) {
    const pts = w.points;
    let total = 0;
    const segs: { a: Point; b: Point; start: number; len: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const len = dist(pts[i - 1], pts[i]);
      segs.push({ a: pts[i - 1], b: pts[i], start: total, len });
      total += len;
    }
    if (total === 0) continue;
    for (const s of segs) {
      const vx = s.b.x - s.a.x;
      const vy = s.b.y - s.a.y;
      const l2 = vx * vx + vy * vy || 1;
      let u = ((point.x - s.a.x) * vx + (point.y - s.a.y) * vy) / l2;
      u = Math.max(0, Math.min(1, u));
      const px = s.a.x + u * vx;
      const py = s.a.y + u * vy;
      const d = Math.hypot(point.x - px, point.y - py);
      const t = (s.start + u * s.len) / total;
      if (!best || d < best.d) best = { wallId: w.id, t, d };
    }
  }
  return best;
}
