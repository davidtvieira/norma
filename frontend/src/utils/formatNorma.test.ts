import { describe, expect, it } from 'vitest';
import { formatSize, plural, truncate } from './formatNorma';

describe('formatNorma', () => {
  it('shows a size in KB below a megabyte (never 0) and in MB above', () => {
    expect(formatSize(100)).toBe('1 KB');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('pluralises', () => {
    expect(plural(1, 'operação', 'operações')).toBe('1 operação');
    expect(plural(0, 'input', 'inputs')).toBe('0 inputs');
  });

  it('caps a description, at a word when it can, and leaves a short one alone', () => {
    expect(truncate('Rastreio de sintomas', 40)).toBe('Rastreio de sintomas');
    expect(truncate('Rastreio de sintomas de ansiedade e depressão', 30)).toBe('Rastreio de sintomas de…');
    expect(truncate('x'.repeat(50), 20)).toBe(`${'x'.repeat(20)}…`);
    expect(truncate('uma\n\nlinha   com   espaços', 40)).toBe('uma linha com espaços');
  });
});
