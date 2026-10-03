import { describe, expect, it } from 'vitest';
import { assignLanes } from './lanes';

describe('assignLanes', () => {
  it('gives non-overlapping blocks the full width', () => {
    const m = assignLanes([{ id: 'a', start: 60, end: 120 }, { id: 'b', start: 120, end: 180 }]);
    expect(m.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(m.get('b')).toEqual({ lane: 0, lanes: 1 });
  });
  it('puts overlapping blocks side by side', () => {
    const m = assignLanes([{ id: 'a', start: 60, end: 180 }, { id: 'b', start: 90, end: 120 }, { id: 'c', start: 130, end: 200 }]);
    expect(m.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(m.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(m.get('c')).toEqual({ lane: 1, lanes: 2 });
  });
});
