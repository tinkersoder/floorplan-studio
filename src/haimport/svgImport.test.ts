import { describe, it, expect } from 'vitest';
import { straightPath } from './svgImport';

describe('straightPath', () => {
  it('reads absolute/relative M L H V Z vertices exactly', () => {
    expect(straightPath('M140 350 H860 V510 H140 Z')).toEqual([
      { x: 140, y: 350 },
      { x: 860, y: 350 },
      { x: 860, y: 510 },
      { x: 140, y: 510 },
    ]);
    expect(straightPath('M 420,40 L 760,40 L 760,300 L 420,300 Z')).toHaveLength(4);
    expect(straightPath('m10 10 l20 0 0 20 h-20z')).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ]);
  });
  it('gives up on curves so the caller samples the outline instead', () => {
    expect(straightPath('M0 0 C 10 10 20 20 30 0 Z')).toEqual([]);
  });
});
