import { Floor } from '../model/schema';

export function BackgroundLayer({ floor }: { floor: Floor }) {
  const b = floor.background;
  if (!b.dataUri || !floor.layers.background.visible) return null;
  const w = b.naturalW * b.scale;
  const h = b.naturalH * b.scale;
  // rotate around the image center
  const cx = b.x + w / 2;
  const cy = b.y + h / 2;
  return (
    <g data-layer="background" opacity={b.opacity} transform={`rotate(${b.rotation} ${cx} ${cy})`}>
      <image href={b.dataUri} x={b.x} y={b.y} width={w} height={h} preserveAspectRatio="none" />
    </g>
  );
}
