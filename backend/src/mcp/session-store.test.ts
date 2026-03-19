import { describe, it, expect } from 'vitest';
import { deepMerge } from './session-store.js';

describe('deepMerge', () => {
  it('merges flat objects', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('overwrites primitive values', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it('deep merges nested objects', () => {
    const target = { header: { name: 'John', title: 'Dev' } };
    const source = { header: { name: 'Jane' } };
    expect(deepMerge(target, source)).toEqual({ header: { name: 'Jane', title: 'Dev' } });
  });

  it('replaces arrays instead of merging', () => {
    const target = { skills: ['js', 'ts'] };
    const source = { skills: ['python'] };
    expect(deepMerge(target, source)).toEqual({ skills: ['python'] });
  });

  it('handles empty source', () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it('handles empty target', () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
  });

  it('does not mutate target', () => {
    const target = { a: 1 };
    deepMerge(target, { b: 2 });
    expect(target).toEqual({ a: 1 });
  });

  it('handles deeply nested objects', () => {
    const target = { a: { b: { c: 1, d: 2 } } };
    const source = { a: { b: { c: 3 } } };
    expect(deepMerge(target, source)).toEqual({ a: { b: { c: 3, d: 2 } } });
  });
});
