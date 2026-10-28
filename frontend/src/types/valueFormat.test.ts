import { describe, expect, it } from 'vitest';
import { DEFAULT_VALUE_FORMAT, constrainTyping, describeFormatLines, formatErrors, formatValue, isFormatConsistent, type ValueFormat } from './valueFormat';

const text = (patch: Partial<ValueFormat> = {}): ValueFormat => ({ ...DEFAULT_VALUE_FORMAT, ...patch });
const integer = (patch: Partial<ValueFormat> = {}): ValueFormat => ({ ...DEFAULT_VALUE_FORMAT, type: 'integer', ...patch });
const decimal = (patch: Partial<ValueFormat> = {}): ValueFormat => ({ ...DEFAULT_VALUE_FORMAT, type: 'decimal', ...patch });

describe('formatValue', () => {
  it('accepts a text within its lengths unchanged', () => {
    expect(formatValue(text({ minLength: 2, maxLength: 5 }), '  ab ')).toEqual({ ok: true, value: '  ab ' });
  });

  it('refuses a text too long or too short, saying how many it has', () => {
    expect(formatValue(text({ maxLength: 5 }), '123456')).toEqual({ ok: false, message: 'São permitidos no máximo 5 caracteres (tem 6).' });
    expect(formatValue(text({ minLength: 3 }), 'ab')).toEqual({ ok: false, message: 'São precisos pelo menos 3 caracteres (tem 2).' });
  });

  it('counts characters, not code units', () => {
    expect(formatValue(text({ maxLength: 1 }), '😀').ok).toBe(true);
    expect(formatValue(text({ maxLength: 3 }), 'ção').ok).toBe(true);
  });

  it('refuses an empty value only when required, and then skips the other rules', () => {
    expect(formatValue(text({ required: true }), '  ')).toEqual({ ok: false, message: 'É obrigatório indicar um valor.' });
    expect(formatValue(text({ minLength: 3 }), '')).toEqual({ ok: true, value: '' });
    expect(formatValue(integer({ min: 1 }), ' ')).toEqual({ ok: true, value: ' ' });
  });

  it('accepts a whole number within its range and writes it canonically', () => {
    expect(formatValue(integer({ min: 1, max: 10 }), ' 007 ')).toEqual({ ok: true, value: '7' });
    expect(formatValue(integer(), '+5')).toEqual({ ok: true, value: '5' });
    expect(formatValue(integer(), '-12')).toEqual({ ok: true, value: '-12' });
    expect(formatValue(integer(), '-0')).toEqual({ ok: true, value: '0' });
  });

  it('refuses what is not a whole number or is out of range', () => {
    expect(formatValue(integer(), '1.5')).toEqual({ ok: false, message: 'Não é um número inteiro.' });
    expect(formatValue(integer(), 'abc').ok).toBe(false);
    expect(formatValue(integer({ min: 1, max: 10 }), '0')).toEqual({ ok: false, message: 'Tem de ser pelo menos 1.' });
    expect(formatValue(integer({ min: 1, max: 10 }), '11')).toEqual({ ok: false, message: 'Tem de ser no máximo 10.' });
  });

  it('accepts a decimal with a comma and writes it canonically', () => {
    expect(formatValue(decimal(), '7,50')).toEqual({ ok: true, value: '7.5' });
    expect(formatValue(decimal(), '100')).toEqual({ ok: true, value: '100' });
    expect(formatValue(decimal(), '0.000')).toEqual({ ok: true, value: '0' });
    expect(formatValue(decimal(), '.5')).toEqual({ ok: true, value: '0.5' });
    expect(formatValue(decimal({ min: 0.5, max: 2.5 }), '1.25')).toEqual({ ok: true, value: '1.25' });
  });

  it('refuses what is not a number or is out of range', () => {
    expect(formatValue(decimal(), '1,2,3')).toEqual({ ok: false, message: 'Não é um número.' });
    expect(formatValue(decimal(), '.').ok).toBe(false);
    expect(formatValue(decimal({ min: 0.5 }), '0.4')).toEqual({ ok: false, message: 'Tem de ser pelo menos 0.5.' });
    expect(formatValue(decimal({ max: 2.5 }), '2.51')).toEqual({ ok: false, message: 'Tem de ser no máximo 2.5.' });
  });
});

describe('isFormatConsistent', () => {
  it('rejects a minimum above its maximum', () => {
    expect(isFormatConsistent(text({ minLength: 5, maxLength: 3 }))).toBe(false);
    expect(isFormatConsistent(integer({ min: 9, max: 1 }))).toBe(false);
    expect(isFormatConsistent(text({ minLength: 3, maxLength: 3 }))).toBe(true);
    expect(isFormatConsistent(DEFAULT_VALUE_FORMAT)).toBe(true);
  });
});

describe('describeFormatLines', () => {
  it('lists the type, the limits that are set and whether a value is required', () => {
    expect(describeFormatLines(DEFAULT_VALUE_FORMAT)).toEqual(['Tipo: Texto']);
    expect(describeFormatLines(text({ minLength: 2, maxLength: 10, required: true }))).toEqual([
      'Tipo: Texto',
      'Mínimo: 2 caracteres',
      'Máximo: 10 caracteres',
      'Obrigatório (não pode ficar vazio)',
    ]);
    expect(describeFormatLines(integer({ min: 1 }))).toEqual(['Tipo: Número inteiro', 'Valor mínimo: 1']);
  });
});

describe('constrainTyping', () => {
  it('cuts a text at its maximum length, counting characters', () => {
    expect(constrainTyping(text({ maxLength: 5 }), 'abcde', 'abcdef')).toBe('abcde');
    expect(constrainTyping(text({ maxLength: 5 }), '', 'abcdefghij')).toBe('abcde');
    expect(constrainTyping(text({ maxLength: 2 }), '', '😀😀😀')).toBe('😀😀');
    expect(constrainTyping(text(), 'abc', 'abcd')).toBe('abcd');
  });

  it('lets only digits (and a leading sign) into an integer', () => {
    expect(constrainTyping(integer(), '12', '12a')).toBe('12');
    expect(constrainTyping(integer(), '', '-')).toBe('-');
    expect(constrainTyping(integer(), '-1', '-1-')).toBe('-1');
    expect(constrainTyping(integer(), '', '1,5')).toBe('15');
    expect(constrainTyping(integer(), '', '+7x')).toBe('+7');
  });

  it('lets digits and one decimal separator into a decimal', () => {
    expect(constrainTyping(decimal(), '1', '1,')).toBe('1,');
    expect(constrainTyping(decimal(), '1.5', '1.5.')).toBe('1.5');
    expect(constrainTyping(decimal(), '1,5', '1,5,2')).toBe('1,52');
    expect(constrainTyping(decimal(), '', 'a1.5b')).toBe('1.5');
  });

  it('refuses a number that would go past its maximum', () => {
    expect(constrainTyping(integer({ max: 10 }), '1', '15')).toBe('1');
    expect(constrainTyping(integer({ max: 10 }), '1', '10')).toBe('10');
    expect(constrainTyping(decimal({ max: 2.5 }), '2.5', '2.55')).toBe('2.5');
  });

  it('refuses a negative number that would go below its minimum, but not one still short of a positive minimum', () => {
    expect(constrainTyping(integer({ min: -10 }), '-1', '-15')).toBe('-1');
    expect(constrainTyping(integer({ min: 5 }), '', '1')).toBe('1'); // on its way to 15
  });
});

describe('formatErrors', () => {
  it('lets an empty value pass while the field is still being typed in', () => {
    expect(formatErrors(text({ minLength: 3 }), '')).toEqual([]);
    expect(formatErrors(text({ required: true }), '')).toEqual([]);
    expect(formatErrors(text({ maxLength: 3 }), 'abcd')).toEqual(['São permitidos no máximo 3 caracteres (tem 4).']);
  });

  it('holds an empty value to the minimums once the field has been left, but a missing required value is not a card error', () => {
    expect(formatErrors(text({ required: true }), ' ', true)).toEqual([]);
    expect(formatErrors(text({ required: true, minLength: 3 }), '', true)).toEqual([]);
    expect(formatErrors(text({ minLength: 3 }), '', true)).toEqual(['São precisos pelo menos 3 caracteres (tem 0).']);
    expect(formatErrors(integer({ min: 1 }), '', true)).toEqual(['Tem de ser pelo menos 1.']);
    expect(formatErrors(decimal({ max: 5 }), '', true)).toEqual([]);
    expect(formatErrors(text({ maxLength: 3 }), '', true)).toEqual([]);
  });

  it('checks a typed value the same either way', () => {
    expect(formatErrors(integer({ min: 1 }), '0', true)).toEqual(['Tem de ser pelo menos 1.']);
    expect(formatErrors(integer({ min: 1 }), '5', true)).toEqual([]);
  });
});
