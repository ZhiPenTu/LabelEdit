import type { Rect } from './types';

export interface Point { x: number; y: number }
export type TransformType = 'move' | 'nw' | 'ne' | 'sw' | 'se';
export const rectangle = (start: Point, end: Point): Rect => ({
  x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
  width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y),
});

export function overlaps(first: Rect, second: Rect): boolean {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height > Math.min(first.width * first.height, second.width * second.height) * 0.65;
}

export function computeTransformedRect(type: TransformType, rect: Rect, dx: number, dy: number, canvasWidth: number, canvasHeight: number): Rect {
  if (type === 'move') return {
    ...rect, x: Math.max(0, Math.min(1 - rect.width, rect.x + dx)),
    y: Math.max(0, Math.min(1 - rect.height, rect.y + dy)),
  };
  const minWidth = Math.min(rect.width, Math.max(0.005, 8 / canvasWidth));
  const minHeight = Math.min(rect.height, Math.max(0.005, 8 / canvasHeight));
  let left = rect.x, top = rect.y, right = left + rect.width, bottom = top + rect.height;
  if (type.includes('w')) left = Math.max(0, Math.min(right - minWidth, left + dx));
  if (type.includes('e')) right = Math.min(1, Math.max(left + minWidth, right + dx));
  if (type.includes('n')) top = Math.max(0, Math.min(bottom - minHeight, top + dy));
  if (type.includes('s')) bottom = Math.min(1, Math.max(top + minHeight, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
