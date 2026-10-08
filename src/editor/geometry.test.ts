import { describe, expect, it } from 'vitest';
import { computeTransformedRect, rectangle } from './geometry';
const rect = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };
describe('normalized page geometry', () => {
  it('keeps moves inside the page without changing size', () => {
    expect(computeTransformedRect('move', rect, 2, -2, 600, 400)).toEqual({ ...rect, x: 0.6, y: 0 });
  });
  it('keeps resize handles on the page and prevents inverted boxes', () => {
    const next = computeTransformedRect('nw', rect, 2, 2, 600, 400);
    expect(next.width).toBeCloseTo(8 / 600);
    expect(next.height).toBeCloseTo(8 / 400);
    expect(next.x + next.width).toBeCloseTo(0.6);
    expect(computeTransformedRect('se', rect, 2, 2, 600, 400)).toEqual({ x: 0.2, y: 0.3, width: 0.8, height: 0.7 });
  });
  it('does not enlarge very small existing boxes when a resize starts', () => {
    const tiny = { x: 0.1, y: 0.2, width: 0.001, height: 0.002 };
    expect(computeTransformedRect('nw', tiny, 0, 0, 600, 400).width).toBeCloseTo(tiny.width);
    expect(rectangle({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, width: expect.closeTo(0.6), height: expect.closeTo(0.6) });
  });
});
