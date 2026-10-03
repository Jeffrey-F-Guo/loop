import { describe, expect, it } from 'vitest';
import { initialRectOf } from './initialRect';

const rect = { top: 500, left: 10, width: 100, height: 96 };

describe('initialRectOf', () => {
  it("uses dnd-kit's measured initial rect when it exists", () => {
    const clientRect = { ...rect, right: 110, bottom: 596 }; // dnd-kit's ClientRect shape
    expect(initialRectOf({ rect: { current: { initial: clientRect } }, data: { current: {} } })).toEqual(rect);
  });

  it('falls back to measuring the draggable node when dnd-kit has not measured it yet (onDragStart)', () => {
    const active = { rect: { current: { initial: null } }, data: { current: { getRect: () => rect } } };
    expect(initialRectOf(active)).toEqual(rect);
  });

  it('is null when neither is available', () => {
    expect(initialRectOf({ rect: { current: { initial: null } }, data: { current: undefined } })).toBeNull();
  });
});
