import { describe, expect, it } from 'vitest';
import { describeRange, parseBound, rangeProblems } from './translatorRanges';

const rule = (min: string, max: string) => ({ from: '', to: 'x', min, max });

describe('parseBound', () => {
  it('reads numbers, accepts a decimal comma, and treats empty as no limit', () => {
    expect(parseBound('8')).toBe(8);
    expect(parseBound(' 13,5 ')).toBe(13.5);
    expect(parseBound('')).toBeNull();
    expect(parseBound(undefined)).toBeNull();
    expect(parseBound('abc')).toBeNaN();
  });
});

describe('rangeProblems', () => {
  it('accepts consecutive and open-ended intervals', () => {
    expect(rangeProblems([rule('', '8'), rule('9', '13'), rule('14', '')])).toEqual([]);
  });

  it('flags a rule with no bounds, a non-numeric bound and an inverted interval', () => {
    expect(rangeProblems([rule('', '')])).toEqual(['Cada intervalo precisa de pelo menos um limite.']);
    expect(rangeProblems([rule('a', '3')])).toEqual(['Os limites têm de ser números.']);
    expect(rangeProblems([rule('9', '1')])).toEqual(['O limite inferior não pode ser maior que o superior.']);
  });

  it('flags intervals that share a value, bounds included', () => {
    expect(rangeProblems([rule('1', '5'), rule('5', '9')])).toHaveLength(1);
    expect(rangeProblems([rule('', '5'), rule('3', '')])).toHaveLength(1);
    expect(rangeProblems([rule('1', '5'), rule('5.1', '9')])).toEqual([]);
  });
});

describe('describeRange', () => {
  it('says each interval in a few characters', () => {
    expect(describeRange(rule('', '8'))).toBe('≤ 8');
    expect(describeRange(rule('9', '13'))).toBe('9 – 13');
    expect(describeRange(rule('14', ''))).toBe('≥ 14');
  });
});
