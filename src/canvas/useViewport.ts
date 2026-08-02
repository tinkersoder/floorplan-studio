import { RefObject, useCallback } from 'react';
import { Point } from '../model/schema';
import { useStore } from '../state/store';

/**
 * Viewport transform helpers. The SVG uses an inner <g transform="translate(pan)
 * scale(zoom)"> so document coords render directly; these convert pointer events
 * (client px) into document coords and implement zoom-to-cursor.
 */
export function useViewport(svgRef: RefObject<SVGSVGElement>) {
  const viewport = useStore((s) => s.viewport);
  const setViewport = useStore((s) => s.setViewport);

  const screenToDoc = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      return {
        x: (sx - viewport.panX) / viewport.zoom,
        y: (sy - viewport.panY) / viewport.zoom,
      };
    },
    [svgRef, viewport],
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      const nextZoom = Math.max(0.1, Math.min(8, viewport.zoom * factor));
      // Keep the doc point under the cursor fixed on screen.
      const docX = (sx - viewport.panX) / viewport.zoom;
      const docY = (sy - viewport.panY) / viewport.zoom;
      setViewport({
        zoom: nextZoom,
        panX: sx - docX * nextZoom,
        panY: sy - docY * nextZoom,
      });
    },
    [svgRef, viewport, setViewport],
  );

  const panBy = useCallback(
    (dx: number, dy: number) =>
      setViewport({ panX: viewport.panX + dx, panY: viewport.panY + dy }),
    [viewport, setViewport],
  );

  /** Fit the given canvas size into the container with padding. */
  const fitTo = useCallback(
    (w: number, h: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pad = 40;
      const zoom = Math.min(
        (rect.width - pad * 2) / w,
        (rect.height - pad * 2) / h,
      );
      const z = Math.max(0.1, Math.min(4, zoom));
      setViewport({
        zoom: z,
        panX: (rect.width - w * z) / 2,
        panY: (rect.height - h * z) / 2,
      });
    },
    [svgRef, setViewport],
  );

  return { viewport, screenToDoc, zoomAt, panBy, fitTo };
}
