import { describe, expect, it } from 'vitest';
import { INPUTS_MISMATCH_MESSAGE, NOT_A_TEST_MESSAGE, checkTestCaseMatches, parseTestCaseText } from './testCaseSerialization';

const test = (inputs: { name: string; value: string }[]) => ({ modelName: 'M', inputs });

describe('parseTestCaseText', () => {
  it('reads a test file, taking a numeric value as its text', () => {
    const parsed = parseTestCaseText(JSON.stringify({ modelName: 'M', inputs: [{ name: 'a', value: '1' }, { name: 'b', value: 2 }] }));
    expect(parsed).toEqual({ modelName: 'M', inputs: [{ name: 'a', value: '1' }, { name: 'b', value: '2' }] });
  });

  it('says the same short thing for anything that is not a test', () => {
    const notTests = [
      'not json',
      '[1,2]',
      '{"modelName":"M"}',
      '{"inputs":[]}',
      JSON.stringify({ modelName: 'M', operations: [] }),
      JSON.stringify({ inputs: [{ name: 'a', value: '1' }, { name: 'b' }] }),
      JSON.stringify({ inputs: [{ name: '  ', value: '1' }] }),
      JSON.stringify({ inputs: ['x'] }),
      JSON.stringify({ modelName: 3, inputs: [{ name: 'a', value: '1' }] }),
    ];
    for (const text of notTests) {
      expect(() => parseTestCaseText(text)).toThrow(NOT_A_TEST_MESSAGE);
    }
  });
});

describe('checkTestCaseMatches', () => {
  const file = test([{ name: 'a', value: '1' }, { name: 'b', value: '2' }]);

  it('accepts a test whose inputs are exactly the model\'s, in any order', () => {
    expect(checkTestCaseMatches(file, ['a', 'b'])).toBeNull();
    expect(checkTestCaseMatches(file, ['b', 'a'])).toBeNull();
  });

  it('refuses a test with an input the model lacks, or lacking one the model has', () => {
    expect(checkTestCaseMatches(file, ['a'])).toBe(INPUTS_MISMATCH_MESSAGE);
    expect(checkTestCaseMatches(file, ['a', 'b', 'c'])).toBe(INPUTS_MISMATCH_MESSAGE);
    expect(checkTestCaseMatches(test([{ name: 'x', value: '1' }]), ['a'])).toBe(INPUTS_MISMATCH_MESSAGE);
  });

  it('counts a name used twice as twice', () => {
    const twice = test([{ name: 'a', value: '1' }, { name: 'a', value: '2' }]);
    expect(checkTestCaseMatches(twice, ['a', 'a'])).toBeNull();
    expect(checkTestCaseMatches(twice, ['a'])).toBe(INPUTS_MISMATCH_MESSAGE);
  });
});
